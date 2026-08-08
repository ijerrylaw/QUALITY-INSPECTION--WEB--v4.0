/**
 * @file HistoryFeed.tsx
 * @description Inspection Records data table with expandable AQL category analysis.
 *
 * UI_DESIGN_SYSTEM.md compliance:
 * - §1.3  Strict Font Protocol: font-mono for data, font-sans for descriptions.
 * - §4.8A Value Chips: indigo for AQL level, gray for Ac threshold values.
 * - §4.8B State Badges: emerald PASS / active eval modes, rose FAIL, gray N/A.
 * - §4.9  Amber for Action Required: no-profile banner, unclassified defects.
 * - §5.3  Inline Informational Alert: amber border-l-4 for no-profile warning.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, Download, ChevronDown, ChevronRight,
  Edit2, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { API_BASE_URL, useConfig } from '../../context/ConfigContext';

// ── Display-only helpers ──────────────────────────────────────────────────────
// isZeroTolerance/isPassFailNil/snapBracket are label/text helpers only — they
// pick which threshold text to render (e.g. "Ac: 0 · zero tolerance" vs
// "Ac ≤ X · Re ≥ Y") and the "n=X → ISO n=Y" display line. Pass/fail
// DETERMINATION and threshold VALUES come from POST /api/verdict/preview (the
// same resolveVerdict()/evaluateAQLVerdict() engine every persisting route
// uses — see StepReviewSubmit.tsx §5.6) via buildCategoryAnalysis() below, not
// from a local matrix. Mirrors backend/src/engine/iso2859-matrix.ts's bracket
// list and snapToBracket() algorithm for this display-only purpose.

const SAMPLE_SIZE_BRACKETS = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500] as const;

function isZeroTolerance(aqlLevel: string): boolean {
  return /and/i.test(aqlLevel) || /zero.?tolerance/i.test(aqlLevel) || /^0$/.test(aqlLevel.trim());
}

function isPassFailNil(aqlLevel: string): boolean {
  return /pass.?fail/i.test(aqlLevel) || /nil/i.test(aqlLevel);
}

function snapBracket(n: number): number {
  const clamped = Math.max(2, Math.round(n));
  return [...SAMPLE_SIZE_BRACKETS].reduce((best, candidate) => {
    const dC = Math.abs(candidate - clamped);
    const dB = Math.abs(best - clamped);
    return dC < dB || (dC === dB && candidate > best) ? candidate : best;
  }, SAMPLE_SIZE_BRACKETS[0] as number);
}

// ── POST /api/verdict/preview response shape ─────────────────────────────────
// Mirrors backend/src/engine/aqlEvaluator.ts's exported CategoryResult/
// FailingDefect — same type shape StepReviewSubmit.tsx (§5.6) already uses.

interface ServerFailingDefect {
  defectId: string;
  defectName: string;
  count: number;
  threshold: { ac: number; re: number };
}

interface ServerCategoryResult {
  categoryId: string;
  categoryName: string;
  evaluationMode: 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';
  threshold: { ac: number; re: number };
  totalCount: number;
  passed: boolean;
  failingDefects: ServerFailingDefect[];
}

type VerdictPreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; categoryResults: ServerCategoryResult[] };

// ── Category analysis types & builder ────────────────────────────────────────

interface DefectItem {
  id: string;
  name: string;
  count: number;
  failing: boolean;
}

interface CategoryAnalysis {
  id: string;
  name: string;
  aqlLevel: string;
  evaluationMode: string;
  threshold: { ac: number; re: number } | null;
  totalCount: number;
  /** true=PASS, false=FAIL, null=qualitative/informational/not-yet-available (no verdict shown) */
  passed: boolean | null;
  defectItems: DefectItem[];
}

/**
 * Pure join: local category/defect iteration (which categories exist, which
 * defects belong to each, their raw counts — sourced from the resolved
 * profile) combined with the server's pass/fail DETERMINATION, keyed by
 * categoryId. `serverResults` is null while the preview fetch is loading or
 * has errored — categories then render with passed=null (same visual
 * treatment as a genuinely informational category) until real data arrives.
 */
function buildCategoryAnalysis(
  profile: any,
  cleanDefects: Record<string, number>,
  serverResults: ServerCategoryResult[] | null,
): CategoryAnalysis[] {
  const categories: any[] = profile?.aqlCategories ?? [];
  const defectDefs: any[] = profile?.defectDefinitions ?? [];
  const resultsById = new Map((serverResults ?? []).map((r) => [r.categoryId, r]));

  return categories.map((cat): CategoryAnalysis => {
    const aqlLevel = String(cat.aqlLevel ?? cat.aql ?? '');
    const evalMode = String(cat.evaluationMode ?? cat.evalMode ?? '');

    // Match defect definitions to this category by id or name
    const catDefs = defectDefs.filter(
      (d: any) => d.categoryId === cat.id || d.categoryId === cat.name,
    );

    const defectItems: Omit<DefectItem, 'failing'>[] = catDefs
      .map((def: any) => ({ id: String(def.id), name: String(def.name), count: cleanDefects[def.id] ?? 0 }))
      .filter((d) => d.count > 0);

    const totalCount = defectItems.reduce((s, d) => s + d.count, 0);

    const serverResult = resultsById.get(String(cat.id));
    const passed: boolean | null = serverResult ? serverResult.passed : null;
    const threshold = serverResult?.threshold ?? null;

    const failingIds = new Set<string>();
    if (serverResult && !serverResult.passed) {
      if (evalMode === 'CUMULATIVE') {
        // Server's CUMULATIVE failingDefects is one synthetic "category total"
        // entry, not a per-defect list — mark every recorded defect in a
        // failing CUMULATIVE category, matching the existing visual behavior.
        defectItems.forEach((d) => failingIds.add(d.id));
      } else {
        // GRANULAR / N/A — server's failingDefects is a real per-defect list.
        serverResult.failingDefects.forEach((fd) => failingIds.add(fd.defectId));
      }
    }

    return {
      id: String(cat.id),
      name: String(cat.name),
      aqlLevel,
      evaluationMode: evalMode,
      threshold,
      totalCount,
      passed,
      defectItems: defectItems.map((d) => ({ ...d, failing: failingIds.has(d.id) })),
    };
  });
}

// ── Submission type ───────────────────────────────────────────────────────────

type AmendmentStatus =
  | 'UNMODIFIED'
  | 'AMENDMENT_DRAFTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

interface Submission {
  id: string;
  productCode: string;
  productionDate: string;
  samplingTime: string;
  submissionTimestamp?: string;
  machineId?: string;
  shift?: string;
  batchNumber: string;
  size?: string;
  sampleSize: number;
  defects?: Record<string, number> | string;
  verdict: 'PASSED' | 'FAILED';
  userPrincipalName?: string;
  amendmentStatus: AmendmentStatus;
  totalCarton?: number;
  gloveWeight?: number;
  profileId?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDefects(raw: Record<string, number> | string | undefined): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, number>; } catch { return {}; }
  }
  return raw;
}

/**
 * Sum defect counts, excluding corrupt numeric keys that arise from
 * double-serialized JSON (e.g. "0":"{", "1":"\"" character-position artifacts).
 * Real defect IDs always contain non-digit characters (e.g. "def_hole").
 */
function sumDefects(raw: Record<string, number> | string | undefined): number {
  const obj = parseDefects(raw);
  return Object.entries(obj)
    .filter(([id]) => !/^\d+$/.test(id))
    .reduce((acc, [, n]) => acc + (Number(n) || 0), 0);
}

function getSortKey(sub: Submission): string {
  const date = (sub.productionDate || '').split('T')[0];
  const time = (sub.samplingTime || '').split('T')[1]?.substring(0, 5) ?? sub.samplingTime ?? '';
  return `${date}T${time}`;
}

// ── Badge components ──────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: 'PASSED' | 'FAILED' }) {
  if (verdict === 'PASSED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
        PASS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30">
      FAIL
    </span>
  );
}

function AmendmentBadge({ status }: { status: AmendmentStatus }) {
  switch (status) {
    case 'UNMODIFIED':
      return <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Original</span>;
    case 'AMENDMENT_DRAFTED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-700/50 text-gray-400 border border-gray-600/50">
          DRAFTED
        </span>
      );
    case 'PENDING_APPROVAL':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
          AWAITING APPROVAL
        </span>
      );
    case 'APPROVED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          AMENDED
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30">
          REJECTED
        </span>
      );
    default:
      return <span className="text-[10px] text-muted">—</span>;
  }
}

// ── Table header ──────────────────────────────────────────────────────────────

function Th({ children, isSticky = false }: { children: React.ReactNode; isSticky?: boolean }) {
  if (isSticky) {
    return (
      <th className="sticky left-0 bg-surface z-10 text-xs font-semibold uppercase tracking-wider text-muted py-3 px-3 border-b border-r border-gray-700/50 text-left whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
        {children}
      </th>
    );
  }
  return (
    <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-3 border-b border-gray-800 text-left whitespace-nowrap">
      {children}
    </th>
  );
}

// ── Defect Breakdown Panel ────────────────────────────────────────────────────

function DefectBreakdownPanel({
  sub,
  onAmend,
}: {
  sub: Submission;
  onAmend: (id: string) => void;
}) {
  const { getResolvedProfile } = useConfig();

  const parsedDefects = useMemo(() => parseDefects(sub.defects), [sub.defects]);

  // Exclude corrupt double-serialized entries (purely numeric keys are character-position artifacts)
  const cleanDefects = useMemo<Record<string, number>>(
    () => Object.fromEntries(Object.entries(parsedDefects).filter(([id]) => !/^\d+$/.test(id))),
    [parsedDefects],
  );

  const noProfileLinked = !sub.profileId;

  // Falls back to the default profile when profileId is null — used for reference analysis
  const profile = useMemo(
    () => getResolvedProfile(sub.profileId ?? undefined),
    [sub.profileId, getResolvedProfile],
  );

  // ── POST /api/verdict/preview — server-authoritative pass/fail determination ──
  // DefectBreakdownPanel only mounts when its row is expanded (see the
  // `if (!isExpanded) return [dataRow]` guard below), so this effect is lazy
  // by construction — it never fires for collapsed rows, no extra gating needed.
  const [previewState, setPreviewState] = useState<VerdictPreviewState>({ status: 'loading' });
  const defectsSignature = useMemo(() => JSON.stringify(cleanDefects), [cleanDefects]);

  useEffect(() => {
    let cancelled = false;
    setPreviewState({ status: 'loading' });

    fetch(`${API_BASE_URL}/api/verdict/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: sub.profileId ?? null,
        productCode: sub.productCode,
        sampleSize: sub.sampleSize,
        defects: cleanDefects,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          let errStr = res.statusText;
          try {
            const errJson = await res.json();
            errStr = errJson?.error ?? errStr;
          } catch (_) {}
          throw new Error(`Server responded ${res.status}: ${errStr}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setPreviewState({ status: 'success', categoryResults: data.categoryResults ?? [] });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[DefectBreakdownPanel] POST /api/verdict/preview failed:', msg);
        setPreviewState({ status: 'error', message: msg });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.profileId, sub.productCode, sub.sampleSize, defectsSignature]);

  const categoryAnalysis = useMemo(
    () => buildCategoryAnalysis(profile, cleanDefects, previewState.status === 'success' ? previewState.categoryResults : null),
    [profile, cleanDefects, previewState],
  );

  // Defects recorded in the submission but absent from the resolved profile
  const classifiedIds = useMemo(
    () => new Set((profile?.defectDefinitions ?? []).map((d: any) => String(d.id))),
    [profile],
  );

  const unclassified = useMemo(
    () => Object.entries(cleanDefects).filter(([id, count]) => count > 0 && !classifiedIds.has(id)),
    [cleanDefects, classifiedIds],
  );

  const totalClean = Object.values(cleanDefects).reduce((a, b) => a + b, 0);
  const snappedBracket = snapBracket(sub.sampleSize);
  const anyFail = categoryAnalysis.some((c) => c.passed === false);

  return (
    <td colSpan={10} className="p-0 border-b border-gray-700/50 bg-canvas shadow-inner">
      <div className="px-6 py-4 space-y-3">

        {/* ── §5.3 Amber alert — no profile linked ──────────────────────────── */}
        {noProfileLinked && (
          <div className="p-3 rounded-lg border border-amber-500/30 border-l-4 border-l-amber-500 bg-amber-500/5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                No Inspection Profile Linked at Submit Time
              </p>
              <p className="text-xs text-amber-400/70 mt-0.5 font-sans leading-relaxed">
                The AQL engine ran with no rules — verdict defaulted to <strong>PASS</strong> without evaluating any category.
                Analysis below uses the current default profile <strong>for reference only</strong>.
              </p>
            </div>
          </div>
        )}

        {/* ── AQL Category Analysis Panel ───────────────────────────────────── */}
        <div className="rounded-lg border border-gray-800 overflow-hidden bg-surface">

          {/* Panel header */}
          <div className="bg-gray-800/50 px-4 py-2 flex items-center justify-between border-b border-gray-800 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-muted" strokeWidth={2} />
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                AQL Category Analysis
              </span>
              {/* "WOULD FAIL" indicator when reference analysis reveals failures on unlinked submissions */}
              {anyFail && noProfileLinked && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  WOULD FAIL
                </span>
              )}
              {anyFail && !noProfileLinked && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  CATEGORY FAILED
                </span>
              )}
              {previewState.status === 'loading' && (
                <span className="text-[10px] text-muted font-mono animate-pulse">Loading AQL analysis…</span>
              )}
              {previewState.status === 'error' && (
                <span className="text-[10px] text-amber-400 font-mono">
                  AQL analysis unavailable ({previewState.message}) — showing raw defect counts only.
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* ISO bracket note */}
              <span className="text-[10px] font-mono text-muted">
                n={sub.sampleSize} → ISO n={snappedBracket}
              </span>
              {/* Clean total */}
              <span className="text-[10px] font-mono text-muted">
                {totalClean} defect{totalClean !== 1 ? 's' : ''} total
              </span>
              {/* Active profile name — §4.5 cyan for system identity */}
              {profile && (
                <span className="text-[10px] font-bold font-mono text-brand-secondary uppercase tracking-wider">
                  {profile.name}
                </span>
              )}
            </div>
          </div>

          {/* ── Per-category rows ────────────────────────────────────────────── */}
          <div className="divide-y divide-gray-800/50">
            {categoryAnalysis.map((cat) => {
              const isFail = cat.passed === false;
              const isNA   = cat.passed === null;
              const zeroTol = isZeroTolerance(cat.aqlLevel);
              const pfNil   = isPassFailNil(cat.aqlLevel);

              return (
                <div
                  key={cat.id}
                  className={`px-4 py-3 transition-colors ${isFail ? 'bg-rose-500/[0.04]' : ''}`}
                >
                  {/* Row: meta chips left · count + verdict right */}
                  <div className="flex items-center justify-between flex-wrap gap-y-1.5 gap-x-3">

                    {/* LEFT: category identity + AQL chips */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Category name */}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted w-[90px] shrink-0">
                        {cat.name}
                      </span>

                      {/* AQL Level — §4.8A indigo for system parameter */}
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                        {cat.aqlLevel || '—'}
                      </span>

                      {/* Evaluation mode — §4.8B emerald active, gray N/A */}
                      {cat.evaluationMode ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          cat.evaluationMode === 'CUMULATIVE' || cat.evaluationMode === 'GRANULAR'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-gray-500/10 border-gray-500/30 text-gray-400'
                        }`}>
                          {cat.evaluationMode}
                        </span>
                      ) : null}

                      {/* Acceptance threshold chip — §4.8A standard value chip */}
                      {zeroTol && (
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-gray-800/50 border border-gray-700/50 text-muted">
                          Ac: 0  ·  zero tolerance
                        </span>
                      )}
                      {!zeroTol && !pfNil && cat.evaluationMode && cat.evaluationMode !== '' && cat.threshold && (
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-gray-800/50 border border-gray-700/50 text-muted">
                          Ac ≤ {cat.threshold.ac}  ·  Re ≥ {cat.threshold.re}
                        </span>
                      )}
                      {pfNil && (
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-gray-800/50 border border-gray-700/50 text-muted">
                          qualitative
                        </span>
                      )}
                    </div>

                    {/* RIGHT: count + verdict */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Defect count */}
                      <span className={`text-[11px] font-mono font-bold ${
                        cat.totalCount === 0
                          ? 'text-muted'
                          : isFail
                            ? 'text-rose-400'
                            : 'text-primary'
                      }`}>
                        {cat.totalCount} found
                      </span>

                      {/* Category verdict badge — §4.8B */}
                      {!isNA && cat.evaluationMode && cat.evaluationMode !== '' && (
                        isFail ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400">
                            FAIL
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            PASS
                          </span>
                        )
                      )}
                      {(isNA || !cat.evaluationMode) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 border border-gray-500/30 text-gray-400">
                          N/A
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Defect pills — only shown for non-zero counts */}
                  {cat.defectItems.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2 pl-1">
                      {cat.defectItems.map((item) => (
                        <div
                          key={item.id}
                          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 border shadow-sm ${
                            item.failing
                              ? 'bg-rose-500/10 border-rose-500/30'
                              : 'bg-canvas border-gray-700/50'
                          }`}
                        >
                          <span className="font-mono text-[11px] text-primary">{item.name}</span>
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border min-w-[1.5rem] text-center ${
                            item.failing
                              ? 'text-rose-400 bg-rose-500/15 border-rose-500/30'
                              : 'text-muted bg-gray-800/50 border-gray-700/50'
                          }`}>
                            {item.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Zero-defect placeholder */}
                  {cat.defectItems.length === 0 && (
                    <div className="mt-1 pl-1">
                      <span className="text-[10px] font-mono text-muted/40">none recorded</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Unclassified defects — §4.9 amber ────────────────────────── */}
            {unclassified.length > 0 && (
              <div className="px-4 py-3 bg-amber-500/[0.04]">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      Unclassified
                    </span>
                    {/* §4.8B amber warning badge */}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      NOT IN PROFILE
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-amber-400/70">
                    {unclassified.reduce((a, [, c]) => a + c, 0)} found
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pl-1">
                  {unclassified.map(([id, count]) => (
                    <div
                      key={id}
                      className="inline-flex items-center gap-2 bg-canvas border border-amber-500/20 rounded-md px-3 py-1.5 shadow-sm"
                    >
                      <span className="font-mono text-[11px] text-amber-400/70">{id}</span>
                      <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 min-w-[1.5rem] text-center">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Empty state ───────────────────────────────────────────────── */}
            {totalClean === 0 && unclassified.length === 0 && (
              <div className="px-4 py-5 text-sm text-muted font-sans text-center">
                No defects recorded for this lot.
              </div>
            )}
          </div>
        </div>

        {/* ── Amendment actions ──────────────────────────────────────────────── */}
        {sub.amendmentStatus !== 'PENDING_APPROVAL' && sub.amendmentStatus !== 'APPROVED' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onAmend(sub.id)}
              className="h-9 px-4 rounded-lg bg-canvas border border-brand-primary/50 text-brand-secondary hover:bg-brand-primary/10 hover:border-brand-primary font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
            >
              <Edit2 className="w-3.5 h-3.5" strokeWidth={2} />
              AMEND RECORD
            </button>
          </div>
        )}
        {sub.amendmentStatus === 'PENDING_APPROVAL' && (
          <div className="flex justify-end">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70">
              Amendment submitted — awaiting approval in the Approvals Queue.
            </span>
          </div>
        )}
      </div>
    </td>
  );
}

// ── HistoryFeed ───────────────────────────────────────────────────────────────

export function HistoryFeed() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const fetchSubmissions = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/submissions`)
      .then((res) => res.json())
      .then((data) => {
        setSubmissions(data.submissions || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch history:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  useEffect(() => {
    window.addEventListener('focus', fetchSubmissions);
    return () => window.removeEventListener('focus', fetchSubmissions);
  }, [fetchSubmissions]);

  const filteredSubmissions = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return submissions
      .filter(
        (sub) =>
          (sub.batchNumber || '').toLowerCase().includes(query) ||
          (sub.productCode || '').toLowerCase().includes(query),
      )
      .sort((a, b) => getSortKey(b).localeCompare(getSortKey(a)));
  }, [submissions, searchTerm]);

  const handleRowClick = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const handleAmend = (id: string) => {
    navigate(`/wizard?amend=${id}`);
  };

  return (
    <div className="space-y-4">

      {/* ── §4.3 Data Table Toolbar ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search by Lot Number or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-10 pr-4 bg-canvas border border-gray-700 rounded-lg font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="secondary" className="px-4 flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4" strokeWidth={2} />
            FILTER
          </Button>
          <Button variant="secondary" className="px-4 flex items-center gap-2 w-full sm:w-auto">
            <Download className="w-4 h-4" strokeWidth={2} />
            EXPORT CSV
          </Button>
        </div>
      </div>

      {/* ── §4.2 High-Density Data Table ───────────────────────────────────── */}
      <div className="bg-surface border border-gray-800 rounded-lg overflow-x-auto shadow-sm scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        <table className="w-full text-left whitespace-nowrap">
          <thead>
            <tr>
              <th className="bg-canvas w-10 py-3 px-2 border-b border-gray-800" />
              <Th isSticky>
                <div>FULL SYSTEM</div>
                <div className="text-[10px] text-gray-500">LOT NUMBER</div>
              </Th>
              <Th>PRODUCT CODE</Th>
              <Th>
                <div>DATE</div>
                <div className="text-[10px] text-gray-500">TIME</div>
              </Th>
              <Th>VERDICT</Th>
              <Th>STATUS</Th>
              <Th>
                <div>PRODUCTION LINE</div>
                <div className="text-[10px] text-gray-500">SHIFT</div>
              </Th>
              <Th>
                <div>GLOVE SIZE</div>
                <div className="text-[10px] text-gray-500">SAMPLE SIZE</div>
              </Th>
              <Th>
                <div>TOTAL CARTON</div>
                <div className="text-[10px] text-gray-500">GLOVE WEIGHT (g)</div>
              </Th>
              <Th>INSPECTOR</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted font-mono animate-pulse uppercase tracking-wider text-sm">
                  Loading inspection records...
                </td>
              </tr>
            ) : filteredSubmissions.length > 0 ? (
              filteredSubmissions.flatMap((sub) => {
                const dateStr = (sub.productionDate || '').split('T')[0];
                const timeStr =
                  (sub.samplingTime || '').split('T')[1]?.substring(0, 5) ||
                  sub.samplingTime ||
                  '—';
                const totalDefects = sumDefects(sub.defects);
                const isExpanded = expandedRowId === sub.id;

                const dataRow = (
                  <tr
                    key={`${sub.id}-row`}
                    onClick={() => handleRowClick(sub.id)}
                    className={`hover:bg-white/5 transition-colors cursor-pointer group ${isExpanded ? 'bg-white/[0.03]' : ''}`}
                  >
                    {/* Expand chevron */}
                    <td className={`py-3 px-2 border-b border-gray-700/50 text-center transition-colors ${isExpanded ? 'bg-brand-primary/5' : ''}`}>
                      <span className="text-muted group-hover:text-primary transition-colors inline-flex items-center justify-center">
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4" strokeWidth={2} />
                          : <ChevronRight className="w-4 h-4" strokeWidth={2} />}
                      </span>
                    </td>

                    {/* 1. LOT NUMBER */}
                    <td className="sticky left-0 bg-surface z-10 py-3 px-3 border-b border-r border-gray-700/50 text-sm font-mono text-primary shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-gray-800 transition-colors">
                      {sub.batchNumber || '—'}
                    </td>

                    {/* 2. PRODUCT CODE */}
                    <td className="py-3 px-3 border-b border-gray-700/50 text-sm font-mono text-primary">
                      {sub.productCode || '—'}
                    </td>

                    {/* 3. DATE & TIME */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary">{dateStr || '—'}</div>
                      <div className="text-xs font-mono text-muted">{timeStr}</div>
                    </td>

                    {/* 4. VERDICT & DEFECT COUNT */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="flex flex-col gap-1.5 items-start">
                        <VerdictBadge verdict={sub.verdict} />
                        {totalDefects > 0 && (
                          <div
                            className="flex items-center gap-1 cursor-pointer select-none group/hint"
                            onClick={(e) => { e.stopPropagation(); handleRowClick(sub.id); }}
                            title="Click to view AQL category analysis"
                          >
                            <span className="text-[10px] font-mono text-rose-400/90 font-bold bg-rose-500/10 px-1.5 rounded border border-rose-500/20">
                              {totalDefects} defect{totalDefects !== 1 ? 's' : ''}
                            </span>
                            <span className="text-[9px] font-sans text-muted/50 group-hover/hint:text-primary/70 transition-colors">
                              {isExpanded ? '▲ hide' : '▼ detail'}
                            </span>
                          </div>
                        )}
                        {totalDefects === 0 && (
                          <span className="text-[10px] font-mono text-emerald-500/70">0 defects</span>
                        )}
                      </div>
                    </td>

                    {/* 5. STATUS */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <AmendmentBadge status={sub.amendmentStatus} />
                    </td>

                    {/* 6. PRODUCTION LINE & SHIFT */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary">{sub.machineId || '—'}</div>
                      <div className="text-xs font-mono text-muted">{sub.shift ? sub.shift.split(' (')[0] : '—'}</div>
                    </td>

                    {/* 7. GLOVE SIZE & SAMPLE SIZE */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary">{sub.size || '—'}</div>
                      <div className="text-xs font-mono text-muted">{sub.sampleSize ?? '—'}</div>
                    </td>

                    {/* 8. TOTAL CARTON & GLOVE WEIGHT */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary">{sub.totalCarton ?? '—'}</div>
                      <div className="text-xs font-mono text-muted">
                        {sub.gloveWeight != null ? `${sub.gloveWeight}g` : '—'}
                      </div>
                    </td>

                    {/* 9. INSPECTOR */}
                    <td className="py-3 px-3 border-b border-gray-700/50 text-sm text-muted max-w-[160px] truncate font-sans">
                      {sub.userPrincipalName || '—'}
                    </td>
                  </tr>
                );

                if (!isExpanded) return [dataRow];

                return [
                  dataRow,
                  <tr key={`${sub.id}-panel`} className="bg-canvas">
                    <DefectBreakdownPanel sub={sub} onAmend={handleAmend} />
                  </tr>,
                ];
              })
            ) : (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted text-sm font-sans">
                  {searchTerm
                    ? `No records found matching "${searchTerm}"`
                    : 'No inspection records found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
