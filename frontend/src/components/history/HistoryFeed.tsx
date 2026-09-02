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

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, Download, ChevronDown, ChevronRight,
  Edit2, ShieldCheck, AlertTriangle, X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/ToastProvider';
import { API_BASE_URL, useConfig, resolveProductMatrix, mergeCanonicalDimensionDefs } from '../../context/ConfigContext';
import { useHistoryIndicator } from '../../context/HistoryIndicatorContext';
import { AqlCategoryAnalysisPanel, snapBracket } from './AqlCategoryAnalysisPanel';
import type { ActualAqlAchieved, CategoryAnalysis, DefectItem } from './AqlCategoryAnalysisPanel';
import { DimensionsPanel } from './DimensionsPanel';
import type { DimensionRow } from './DimensionsPanel';
import { FIXED_DIM_LENGTH, FIXED_DIM_PALM, FIXED_DIM_WEIGHT, FIXED_DIMENSION_LABELS } from '../../lib/fixedDimensions';

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
  /**
   * Optional so an older backend (or a test fixture predating the field) still
   * type-checks against this shape — a live server always sends it on a graded
   * category.
   */
  actualAqlAchieved?: ActualAqlAchieved | null;
}

type VerdictPreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; categoryResults: ServerCategoryResult[] };

// ── Category analysis builder ─────────────────────────────────────────────
// CategoryAnalysis/DefectItem now live in AqlCategoryAnalysisPanel.tsx (the
// component that actually renders them) — imported above.

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
    const isQualitative = evalMode === 'N/A';

    // Match defect definitions to this category by id or name
    const catDefs = defectDefs.filter(
      (d: any) => d.categoryId === cat.id || d.categoryId === cat.name,
    );

    // Denominator for the panel's "N of M failed" header — captured before the
    // zero-count filter below. Mirrors buildFrozenCategoryAnalysis() server-side.
    const totalDefectTypes = catDefs.length;

    const defectItems: Omit<DefectItem, 'failing'>[] = catDefs
      .map((def: any) => {
        const raw = cleanDefects[def.id] ?? 0;
        const item: Omit<DefectItem, 'failing'> = { id: String(def.id), name: String(def.name), count: raw };
        // Decode the N/A state code (1=PASS, 2=FAIL) — keep both, the panel
        // filters to FAIL-only at render. Mirrors the server freeze path.
        if (isQualitative) item.qualitativeState = raw === 2 ? 'FAIL' : 'PASS';
        return item;
      })
      .filter((d) => d.count > 0);

    const serverResult = resultsById.get(String(cat.id));

    // N/A `count` is a state code, not a quantity — don't sum it (the old bug:
    // 1×PASS + 1×FAIL surfaced as 3). Use the server's own FAIL-item count,
    // matching buildFrozenCategoryAnalysis().
    const totalCount = isQualitative
      ? (serverResult
          ? serverResult.failingDefects.length
          : defectItems.filter((d) => d.qualitativeState === 'FAIL').length)
      : defectItems.reduce((s, d) => s + d.count, 0);

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
      totalDefectTypes,
      passed,
      // Live re-grade path (legacy rows with no frozen snapshot) — carry the
      // server's computed value through so those rows show the chip too.
      actualAqlAchieved: serverResult?.actualAqlAchieved ?? null,
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
  createdAt: string;
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
  /** JSON — DimensionMeasurements = Record<string, string[]>, the raw operator-entered slot readings. Frozen at submit time, never recomputed — same historical-record guarantee as everything else here. */
  dimensions?: Record<string, string[]> | string;
  verdict: 'PASSED' | 'FAILED';
  inspectorName?: string;
  amendmentStatus: AmendmentStatus;
  totalCarton?: number;
  gloveWeight?: number;
  profileId?: string | null;
  /** JSON — CategoryAnalysis[], frozen at submit/amendment-approval time. Null on legacy rows (AUDIT_REPORT.md #18). */
  gradingSnapshot?: string | null;
  gradingSnapshotProfileName?: string | null;
  /** JSON — DimensionStats (client-computed per-dimension min/max/avg/threshold/fails/isGraded), frozen at submit time. Never includes Glove Weight. */
  dimensionMins?: string | null;
  /** JSON — a single DimensionResult for Glove Weight, frozen at submit/amendment-approval time. Null on rows predating this field. */
  gloveWeightSnapshot?: string | null;
  /** Full amendment history — GET /api/submissions already includes this relation. Only `status` is used here, to count lifetime APPROVED amendments against MAX_APPROVED_AMENDMENTS. */
  amendmentLogs?: { status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' }[];
}

/** Mirrors backend/src/routes/submissions.routes.ts's MAX_APPROVED_AMENDMENTS. */
const MAX_APPROVED_AMENDMENTS = 3;

/**
 * Column widths for the records table, as percentages of the table's own
 * width (they sum to 100). Used with `table-fixed`, which is the load-
 * bearing part: under fixed layout a cell's CONTENT can never influence its
 * column's width, so no row — however wide its content — can widen the
 * table beyond its container. That is precisely the failure this table
 * suffered for three fix attempts (see the MASTER-DETAIL note below).
 * Proportions are tuned to this app's real values: the widest realistic
 * cells are the STATUS badge ("AWAITING APPROVAL") and PRODUCT CODE
 * ("N025SKB-OC-24FT"), which get the most room.
 */
const COLUMN_WIDTHS = ['4%', '13%', '14%', '10%', '11%', '14%', '10%', '6%', '8%', '10%'] as const;

/**
 * Floor for the table's width. Below this the columns would be too narrow
 * to read, so the wrapper scrolls horizontally instead. Deliberately a
 * FIXED value, never derived from content — a content-derived minimum
 * (e.g. `min-w-max`) is exactly what let the detail panel blow the table's
 * width out past the viewport.
 */
const TABLE_MIN_WIDTH_PX = 1100;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDefects(raw: Record<string, number> | string | undefined): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, number>; } catch { return {}; }
  }
  return raw;
}

/**
 * Parses Submission.gradingSnapshot — a frozen CategoryAnalysis[] (field
 * names line up 1:1 with the server's FrozenCategoryAnalysis, resolveVerdict.ts)
 * — into the same shape buildCategoryAnalysis() produces client-side, so both
 * paths funnel into one render tree. Returns null on missing/corrupt JSON so
 * the caller can fall back to the live re-grade path (legacy rows).
 */
function parseGradingSnapshot(raw: string | null | undefined): CategoryAnalysis[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as CategoryAnalysis[]; } catch { return null; }
}

/** Display-only mirror of backend/src/engine/dimensionEvaluator.ts's per-dimension DimensionStats entry. */
interface DimensionStatsEntry {
  min: number; max: number; avg: number; fails: boolean[]; threshold: number; maxThreshold: number; isMin: boolean; isGraded: boolean;
}
/** Display-only mirror of backend/src/engine/dimensionEvaluator.ts's DimensionResult (used here for Glove Weight only). */
interface FrozenDimensionResult {
  min: number; max: number; avg: number; fails: boolean[]; failed: boolean; threshold: number; maxThreshold: number; isMin: boolean; isGraded: boolean;
}

function parseDimensionMins(raw: string | null | undefined): Record<string, DimensionStatsEntry> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, DimensionStatsEntry>; } catch { return {}; }
}

function parseGloveWeightSnapshot(raw: string | null | undefined): FrozenDimensionResult | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as FrozenDimensionResult; } catch { return null; }
}

/**
 * Parses Submission.dimensions — the raw operator-entered slot value strings,
 * keyed by dimension id, frozen at submit time. Same safe-parse convention as
 * parseDefects() above (tolerant of both an already-parsed object, from a
 * fresh POST response, and a raw JSON string, from GET /api/submissions).
 */
function parseRawSlots(raw: Record<string, string[]> | string | undefined): Record<string, string[]> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, string[]>; } catch { return {}; }
  }
  return raw;
}

/**
 * Assembles DimensionsPanel's row list for one submission: joins the frozen
 * per-dimension compliance data (dimensionMins + gloveWeightSnapshot) against
 * the CURRENT product's dimension defs for name/unit resolution only — the
 * one part of this table that is NOT frozen (AUDIT_REPORT.md #31), same
 * class of drift risk gradingSnapshot eliminated for AQL, accepted here
 * since a renamed dimension def post-submission is rare.
 *
 * Data-driven, not a hardcoded field list: renders exactly whichever
 * dimension ids are present in `dimensionMins` (OFF-mode dims were already
 * filtered out before the wizard ever wrote it) plus a leading Glove Weight
 * row, matching the AQL section's own data-driven convention.
 */
function buildDimensionRows(
  config: { products?: Record<string, any>; productMatrixConfig?: Record<string, any>; dimensions?: any[] } | null | undefined,
  sub: Submission,
): DimensionRow[] {
  const matrixEntry = resolveProductMatrix(config, sub.productCode);
  const dynamicDefs = mergeCanonicalDimensionDefs(
    matrixEntry?.dimensionDefs && matrixEntry.dimensionDefs.length > 0
      ? matrixEntry.dimensionDefs
      : config?.dimensions ?? [],
  );

  const nameFor = (id: string): { name: string; unit: string } => {
    if (id === FIXED_DIM_LENGTH) return { name: FIXED_DIMENSION_LABELS[FIXED_DIM_LENGTH], unit: 'mm' };
    if (id === FIXED_DIM_PALM) return { name: FIXED_DIMENSION_LABELS[FIXED_DIM_PALM], unit: 'mm' };
    const def = dynamicDefs.find((d: any) => d.id === id);
    return { name: def?.name ?? id, unit: def?.unit ?? 'mm' };
  };

  const rows: DimensionRow[] = [];
  const rawSlots = parseRawSlots(sub.dimensions);

  // Glove Weight leads the table (Type 1), matching the field's own
  // conceptual precedence over the 5-slot Type 2 dimensions that follow. It
  // is a 1-slot case, not a special-cased scalar — DimensionsPanel treats
  // every row's `slots`/`slotFails` uniformly regardless of length.
  const weightResult = parseGloveWeightSnapshot(sub.gloveWeightSnapshot);
  if (weightResult) {
    rows.push({
      id: FIXED_DIM_WEIGHT,
      name: FIXED_DIMENSION_LABELS[FIXED_DIM_WEIGHT],
      unit: 'g',
      measured: { min: weightResult.min, max: weightResult.max, avg: weightResult.avg },
      failed: weightResult.failed,
      isGraded: weightResult.isGraded,
      threshold: weightResult.threshold,
      maxThreshold: weightResult.maxThreshold,
      isMin: weightResult.isMin,
      hasSnapshot: true,
      // Weight's single raw reading — sub.gloveWeight itself, not a slots
      // array (Weight was never part of the 5-slot `dimensions` map).
      slots: [String(sub.gloveWeight ?? '')],
      slotFails: weightResult.fails ?? [false],
    });
  } else if (sub.gloveWeight != null) {
    // Legacy row predating gloveWeightSnapshot — show the recorded value with
    // no compliance judgment, never a false COMPLIANT. No fails data exists
    // for this case, so expand stays disabled (empty slotFails signals that).
    rows.push({
      id: FIXED_DIM_WEIGHT,
      name: FIXED_DIMENSION_LABELS[FIXED_DIM_WEIGHT],
      unit: 'g',
      measured: { min: sub.gloveWeight, max: sub.gloveWeight, avg: sub.gloveWeight },
      failed: false,
      isGraded: true,
      threshold: 0,
      maxThreshold: Infinity,
      isMin: false,
      hasSnapshot: false,
      slots: [String(sub.gloveWeight)],
      slotFails: [],
    });
  }

  const dimensionMins = parseDimensionMins(sub.dimensionMins);
  for (const [id, stats] of Object.entries(dimensionMins)) {
    const { name, unit } = nameFor(id);
    rows.push({
      id,
      name,
      unit,
      measured: { min: stats.min, max: stats.max, avg: stats.avg },
      failed: stats.fails?.some((f) => f === true) ?? false,
      isGraded: stats.isGraded ?? true,
      threshold: stats.threshold,
      maxThreshold: stats.maxThreshold,
      isMin: stats.isMin,
      hasSnapshot: true,
      // Raw operator-entered readings, frozen alongside the aggregate stats
      // — sourced from a SEPARATE Submission field (`dimensions`), keyed by
      // the same dimension id, so the two are joined here by id.
      slots: rawSlots[id] ?? [],
      slotFails: stats.fails ?? [],
    });
  }

  return rows;
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

/**
 * Side isn't a stored column — only embedded inside `batchNumber`
 * ([Line][Side][YJJJ][Sequence], ISO2859_MATH_ENGINE.md §4). Mirrors the
 * same derivation `WizardPage.tsx`'s amendment-reopen logic and the backend's
 * `GET /api/submissions` side filter both already use: `machineId` is a real
 * column holding the exact Line prefix, so Side is the single character
 * right after it.
 */
function deriveSide(sub: Submission): string {
  const linePrefix = sub.machineId ?? '';
  return (sub.batchNumber ?? '').slice(linePrefix.length, linePrefix.length + 1);
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
// Plain <th>. The table markup was never the actual problem (see the
// "MASTER-DETAIL" note above the main render below) — the expanded detail
// panel living *inside* it was. `truncate` keeps a long header label from
// widening anything now that column widths are fixed percentages.

function Th({ children, isDivider = false }: { children: React.ReactNode; isDivider?: boolean }) {
  return (
    <th
      className={`bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-3 border-b border-gray-800 text-left truncate ${
        isDivider ? 'border-r border-r-gray-700/50' : ''
      }`}
    >
      {children}
    </th>
  );
}

// ── Defect Breakdown Panel ────────────────────────────────────────────────────
// A plain `<td colSpan={COLUMN_WIDTHS.length}>` inside the table again —
// back to the original inline-under-the-clicked-row placement, deliberately.
//
// History: this WAS a <td colSpan> originally, and its own max-content
// width (every AQL chip/badge laid out on one unwrapped line) fed the
// table's width calculation under the default auto-layout algorithm,
// dragging the whole table wider than the viewport — the original bug.
// Round 2 fixed the width leak by moving this panel below the whole row
// list (out of the table) AND independently switching the table itself to
// `table-fixed` with explicit percentage COLUMN_WIDTHS (see the note above
// the table's render) — under fixed layout, cell CONTENT cannot influence
// column width AT ALL, full stop, regardless of where that content lives.
// Round 3 pinned the panel to the viewport bottom instead, to fix a
// separate usability complaint (too far from the clicked row on a long
// list) — but that in turn wasn't a pleasant experience either.
//
// So: back inline, but table-fixed — established as the width-safety net in
// round 2 and never removed since — is what makes that safe THIS time,
// where it wasn't safe the first time (that was default auto-layout). The
// content-independent-width guarantee this relies on is part of the CSS
// spec for table-layout:fixed (CSS2.1 §17.5.2.1), not a heuristic — see
// history.widthRegression.test.tsx for the automated guard, which measures
// this directly in a real browser and also proves it against a
// deliberately-reverted (auto-layout) control case.

function DefectBreakdownPanel({
  sub,
  onAmend,
}: {
  sub: Submission;
  onAmend: (id: string) => void;
}) {
  const { getResolvedProfile, config } = useConfig();

  // Dimensions section data — see buildDimensionRows()'s own docs for the
  // frozen-vs-live provenance split (dimensionMins/gloveWeightSnapshot are
  // frozen; name/unit resolution is live against current product config).
  const dimensionRows = useMemo(() => buildDimensionRows(config, sub), [config, sub]);

  const approvedAmendmentCount = useMemo(
    () => (sub.amendmentLogs ?? []).filter((log) => log.status === 'APPROVED').length,
    [sub.amendmentLogs],
  );

  const parsedDefects = useMemo(() => parseDefects(sub.defects), [sub.defects]);

  // Exclude corrupt double-serialized entries (purely numeric keys are character-position artifacts)
  const cleanDefects = useMemo<Record<string, number>>(
    () => Object.fromEntries(Object.entries(parsedDefects).filter(([id]) => !/^\d+$/.test(id))),
    [parsedDefects],
  );

  const noProfileLinked = !sub.profileId;

  // AUDIT_REPORT.md #18 — a submission with a frozen gradingSnapshot renders
  // that snapshot only: no live profile lookup, no /api/verdict/preview call.
  // Legacy rows (predating this field) fall back to the original live
  // re-grade behavior below, with an explicit banner explaining the drift risk.
  const hasSnapshot = !!sub.gradingSnapshot;

  // Falls back to the default profile when profileId is null — used for reference analysis.
  // Only actually consumed by the legacy (no-snapshot) render path below, but
  // called unconditionally since hooks can't be called conditionally.
  const profile = useMemo(
    () => getResolvedProfile(sub.profileId ?? undefined),
    [sub.profileId, getResolvedProfile],
  );

  // ── POST /api/verdict/preview — server-authoritative pass/fail determination ──
  // DefectBreakdownPanel only mounts when its row is expanded (see the
  // `if (!isExpanded) return [dataRow]` guard below), so this effect is lazy
  // by construction — it never fires for collapsed rows, no extra gating needed.
  // Skipped entirely for snapshotted rows (hasSnapshot) — the frozen data
  // already has everything this fetch would otherwise re-derive live.
  const [previewState, setPreviewState] = useState<VerdictPreviewState>({ status: 'loading' });
  const defectsSignature = useMemo(() => JSON.stringify(cleanDefects), [cleanDefects]);

  useEffect(() => {
    if (hasSnapshot) return;
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
  }, [hasSnapshot, sub.profileId, sub.productCode, sub.sampleSize, defectsSignature]);

  // Snapshotted rows render the frozen data directly (parsed once, no join
  // needed — field names already match CategoryAnalysis 1:1, see
  // parseGradingSnapshot()). Legacy rows keep the original live client join.
  const snapshotAnalysis = useMemo(() => parseGradingSnapshot(sub.gradingSnapshot), [sub.gradingSnapshot]);
  const liveAnalysis = useMemo(
    () => buildCategoryAnalysis(profile, cleanDefects, previewState.status === 'success' ? previewState.categoryResults : null),
    [profile, cleanDefects, previewState],
  );
  const categoryAnalysis = hasSnapshot ? (snapshotAnalysis ?? []) : liveAnalysis;
  const displayProfileName = hasSnapshot ? sub.gradingSnapshotProfileName : profile?.name;

  // Defects recorded in the submission but not attributed to any category —
  // snapshotted rows diff against the frozen category breakdown itself (no
  // live profile lookup needed); legacy rows diff against the resolved profile.
  const classifiedIds = useMemo(() => {
    if (hasSnapshot) {
      return new Set(categoryAnalysis.flatMap((cat) => cat.defectItems.map((d) => d.id)));
    }
    return new Set((profile?.defectDefinitions ?? []).map((d: any) => String(d.id)));
  }, [hasSnapshot, categoryAnalysis, profile]);

  const unclassified = useMemo(
    () => Object.entries(cleanDefects).filter(([id, count]) => count > 0 && !classifiedIds.has(id)),
    [cleanDefects, classifiedIds],
  );

  const anyFail = categoryAnalysis.some((c) => c.passed === false);
  const previewStatus = hasSnapshot ? 'snapshot' : previewState.status;
  const previewErrorMessage = previewState.status === 'error' ? previewState.message : undefined;

  return (
    <td colSpan={COLUMN_WIDTHS.length} className="p-0 border-b border-gray-700/50 bg-canvas shadow-inner">
      {/* WIDTH comes entirely from the table's own table-fixed + COLUMN_WIDTHS
          (this <td>'s colSpan spans them, it doesn't negotiate its own
          width), so no amount of content here can widen the table — see the
          note above DefectBreakdownPanel and the automated regression test
          (history.widthRegression.test.tsx) that checks this directly. */}
      <div className="px-3 py-4 space-y-3">

        {/* ── §5.3 Info/Cyan alert — legacy row, no frozen snapshot ──────────── */}
        {/* AUDIT_REPORT.md #18: predates gradingSnapshot, deliberately not
            backfilled — analysis below is a LIVE re-grade against current
            config, not a reproduction of what was true at submit time.
            Independent of the no-profile-linked condition below — both can
            render at once. Info/Cyan (not Amber) per §4.9: this is a
            data-provenance notice, not an action-required warning. */}
        {!hasSnapshot && (
          <div className="p-3 rounded-lg border border-brand-secondary/20 border-l-4 border-l-brand-secondary bg-brand-secondary/5 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-brand-secondary shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary">
                Live Re-Grade — Not the Original Result
              </p>
              <p className="text-xs text-brand-secondary/70 mt-0.5 font-sans leading-relaxed">
                This submission predates result snapshots. The analysis below is computed against{' '}
                <strong>current</strong> AQL rules and defect definitions, not what was evaluated at submit
                time — it may disagree with the stored verdict above if rules have changed since.
              </p>
            </div>
          </div>
        )}

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

        {/* ── Inspection Results panel — Dimensions + AQL Categories ──────────
            One shared bordered container/header (renamed from the old
            "AQL Category Analysis" title, which now only labels its own
            sub-section below), same rounding convention the AQL section used
            to own alone: whichever sub-section ends up last gets its own
            bottom corners rounded via the arbitrary :last-child selector, so
            no overflow-hidden is needed regardless of which sections render
            (a legacy row with zero dimension data renders AQL Categories
            alone; every other row renders both). */}
        <div className="rounded-lg border border-gray-800 bg-surface whitespace-normal">
          <div className="rounded-t-lg bg-gray-800/50 px-4 py-2 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={2} />
              {/* font-semibold, not font-bold — §1.3's Table Header token, matching
                  the "Dimensions"/"Defects" sub-headers directly beneath it
                  (visual consistency rework, 2026-08-27). This is now the ONLY
                  ShieldCheck icon in the whole panel — removed from both
                  sub-headers (post-review cleanup, 2026-08-27) so the panel
                  reads as one header with two children, not three independent
                  headers. */}
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Inspection Results
              </span>
            </div>
            {/* Sample-size/ISO-bracket/profile subtitle — moved here from
                AqlCategoryAnalysisPanel.tsx's own sub-header (post-review
                cleanup, 2026-08-27): it's context for the whole submission,
                dimensions included, not defects-specific. The "N defects
                total" segment that used to sit alongside it was dropped
                entirely — redundant now that every category row shows its
                own count. */}
            <p className="text-[10px] font-mono text-muted mt-1 pl-[22px]">
              n={sub.sampleSize} → ISO n={snapBracket(sub.sampleSize)}
              {displayProfileName && <> · {displayProfileName}</>}
            </p>
          </div>
          <div className="divide-y divide-gray-800/50 [&>*:last-child]:rounded-b-lg">
            <DimensionsPanel rows={dimensionRows} />
            <AqlCategoryAnalysisPanel
              categoryAnalysis={categoryAnalysis}
              unclassified={unclassified}
              anyFail={anyFail}
              noProfileLinked={noProfileLinked}
              previewStatus={previewStatus}
              previewErrorMessage={previewErrorMessage}
            />
          </div>
        </div>

        {/* ── Amendment actions ──────────────────────────────────────────────── */}
        {/* Note: `amendmentStatus === 'APPROVED'` no longer blocks this block —
            that used to hide AMEND RECORD permanently after the FIRST approval
            ever (a latent side effect, not an intentional "max 1" rule). Now
            the lifetime cap is governed solely by approvedAmendmentCount below,
            so a submission can be re-amended after an approval, up to the cap. */}
        {sub.amendmentStatus !== 'PENDING_APPROVAL' && (
          approvedAmendmentCount >= MAX_APPROVED_AMENDMENTS ? (
            <div className="flex justify-end">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70">
                Maximum amendments reached ({approvedAmendmentCount}/{MAX_APPROVED_AMENDMENTS})
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end items-center gap-3">
              {approvedAmendmentCount > 0 && (
                <span className="text-[10px] font-mono text-muted">
                  {approvedAmendmentCount} of {MAX_APPROVED_AMENDMENTS} amendments used
                </span>
              )}
              <button
                type="button"
                onClick={() => onAmend(sub.id)}
                className="h-9 px-4 rounded-lg bg-canvas border border-brand-primary/50 text-brand-secondary hover:bg-brand-primary/10 hover:border-brand-primary font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0"
              >
                <Edit2 className="w-3.5 h-3.5" strokeWidth={2} />
                AMEND RECORD
              </button>
            </div>
          )
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

// ── Filters ─────────────────────────────────────────────────────────────────

interface FilterState {
  dateFrom: string;
  dateTo: string;
  verdict: '' | 'PASSED' | 'FAILED';
  amendmentStatus: '' | AmendmentStatus;
  lineId: string;
  side: string;
  inspector: string;
}

const EMPTY_FILTERS: FilterState = {
  dateFrom: '', dateTo: '', verdict: '', amendmentStatus: '', lineId: '', side: '', inspector: '',
};

function countActiveFilters(filters: FilterState): number {
  return Object.values(filters).filter(Boolean).length;
}

/** Escapes a value for CSV — wraps in quotes (doubling any internal quotes)
 *  whenever it contains a comma, quote, or newline. */
function csvEscape(value: string | number | undefined | null): string {
  const str = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const CSV_HEADERS = [
  'Lot Number', 'Product Code', 'Production Date', 'Time', 'Line', 'Side', 'Shift', 'Size',
  'Sample Size', 'Total Carton', 'Glove Weight (g)', 'Verdict', 'Status',
  'Defect Count', 'Inspector',
];

function submissionToCsvRow(sub: Submission): string {
  const dateStr = (sub.productionDate || '').split('T')[0];
  const timeStr = (sub.samplingTime || '').split('T')[1]?.substring(0, 5) || '';
  return [
    sub.batchNumber, sub.productCode, dateStr, timeStr, sub.machineId ?? '', deriveSide(sub), sub.shift ?? '', sub.size ?? '',
    sub.sampleSize, sub.totalCarton ?? '', sub.gloveWeight ?? '', sub.verdict, sub.amendmentStatus,
    sumDefects(sub.defects), sub.inspectorName ?? '',
  ].map(csvEscape).join(',');
}

// ── HistoryFeed ───────────────────────────────────────────────────────────────

// 10, not the backend's own default (50) — a deliberately small page so
// "Load More" actually surfaces at realistic record volumes (AUDIT_REPORT.md
// #20's sibling finding: a page size above the typical row count hid the
// control entirely). EXPORT_PAGE_SIZE stays large — CSV export must pull in
// bulk, not in 10s.
const PAGE_SIZE = 10;
const EXPORT_PAGE_SIZE = 200;
const SEARCH_DEBOUNCE_MS = 300;

export function HistoryFeed() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { config } = useConfig();
  const { markHistoryViewed } = useHistoryIndicator();
  // Threshold captured BEFORE marking viewed (below), so rows created since
  // the LAST view still show a "NEW" badge for this viewing — marking viewed
  // clears the sidebar dot, not the badges already rendered this visit.
  const [newSubmissionThreshold, setNewSubmissionThreshold] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [draftFilters, setDraftFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Debounce the search box so it doesn't fire a fetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Close the filter panel on an outside click.
  useEffect(() => {
    if (!isFilterPanelOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setIsFilterPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterPanelOpen]);

  // Builds the query string shared by the live table fetch AND CSV export —
  // search/filters are server-side (not limited to whatever's currently
  // loaded in memory), so both stay in sync with exactly one source of truth.
  const buildQueryParams = useCallback((pageNum: number, limit: number) => {
    const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) });
    if (debouncedSearchTerm) params.set('search', debouncedSearchTerm);
    if (appliedFilters.dateFrom) params.set('dateFrom', appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set('dateTo', appliedFilters.dateTo);
    if (appliedFilters.verdict) params.set('verdict', appliedFilters.verdict);
    if (appliedFilters.amendmentStatus) params.set('amendmentStatus', appliedFilters.amendmentStatus);
    if (appliedFilters.lineId) params.set('lineId', appliedFilters.lineId);
    if (appliedFilters.side) params.set('side', appliedFilters.side);
    if (appliedFilters.inspector) params.set('inspector', appliedFilters.inspector);
    return params;
  }, [debouncedSearchTerm, appliedFilters]);

  // Fetches one page (`replace: false`, appended + de-duped by id — used by
  // "Load More") or re-fetches the full depth already loaded and replaces
  // the array outright (`replace: true` — used on mount, window focus, and
  // whenever search/filters change, so tabbing back in doesn't silently
  // truncate a deeply-paged view back down to PAGE_SIZE rows).
  const loadPage = useCallback((pageNum: number, options: { replace: boolean }) => {
    const limit = options.replace ? pageNum * PAGE_SIZE : PAGE_SIZE;
    const fetchPage = options.replace ? 1 : pageNum;
    if (options.replace) setLoading(true); else setLoadingMore(true);

    const params = buildQueryParams(fetchPage, limit);
    fetch(`${API_BASE_URL}/api/submissions?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const incoming: Submission[] = data.submissions || [];
        if (options.replace) {
          setSubmissions(incoming);
        } else {
          setSubmissions((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            return [...prev, ...incoming.filter((s) => !existingIds.has(s.id))];
          });
        }
        setPage(pageNum);
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => {
        console.error('Failed to fetch history:', err);
      })
      .finally(() => {
        if (options.replace) setLoading(false); else setLoadingMore(false);
      });
  }, [buildQueryParams]);

  // Refetches from page 1 on mount AND whenever search/filters change —
  // `loadPage`'s identity changes whenever `buildQueryParams` does, which
  // this effect depends on, so no separate effect is needed for that case.
  useEffect(() => { loadPage(1, { replace: true }); }, [loadPage]);

  useEffect(() => {
    const handleFocus = () => loadPage(page, { replace: true });
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadPage, page]);

  // Once per mount: capture the current "new since" threshold for row
  // badges, THEN mark History as viewed (clears the sidebar dot for
  // everyone on their next check). Fetched directly rather than through
  // HistoryIndicatorContext so this ordering can't race Sidebar's own
  // independent route-change refresh.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/submissions/new-indicator`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { effectiveLastViewedAt: string } | null) => {
        if (!cancelled && data) setNewSubmissionThreshold(data.effectiveLastViewedAt);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) markHistoryViewed();
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadMore = () => loadPage(page + 1, { replace: false });

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
    setIsFilterPanelOpen(false);
  };

  const handleClearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setIsFilterPanelOpen(false);
  };

  const activeFilterCount = countActiveFilters(appliedFilters);

  // Server already returns filtered rows — this is just a presentation sort.
  const sortedSubmissions = useMemo(
    () => [...submissions].sort((a, b) => getSortKey(b).localeCompare(getSortKey(a))),
    [submissions],
  );

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const rows: Submission[] = [];
      let currentPage = 1;
      // Loop the same filtered endpoint until exhausted — every matching
      // row is exported, not just whatever's currently loaded on screen.
      while (true) {
        const params = buildQueryParams(currentPage, EXPORT_PAGE_SIZE);
        const res = await fetch(`${API_BASE_URL}/api/submissions?${params.toString()}`);
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const data = await res.json();
        rows.push(...((data.submissions as Submission[]) || []));
        if (!data.hasMore) break;
        currentPage += 1;
      }

      const csv = [CSV_HEADERS.map(csvEscape).join(','), ...rows.map(submissionToCsvRow)].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inspection-records-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast('success', `Exported ${rows.length} record${rows.length !== 1 ? 's' : ''} to CSV.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast('error', `Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

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
          <div className="relative" ref={filterPanelRef}>
            <Button
              variant="secondary"
              className="px-4 flex items-center gap-2 w-full sm:w-auto"
              onClick={() => { setDraftFilters(appliedFilters); setIsFilterPanelOpen((o) => !o); }}
            >
              <Filter className="w-4 h-4" strokeWidth={2} />
              FILTER
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-primary text-white text-[10px] font-bold leading-none">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {isFilterPanelOpen && (
              <div className="absolute right-0 sm:right-0 left-0 sm:left-auto mt-2 w-full sm:w-80 bg-surface border border-gray-700 rounded-lg shadow-lg z-20 p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Date From</label>
                    <input
                      type="date"
                      value={draftFilters.dateFrom}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                      className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded-lg text-sm text-primary font-mono outline-none focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary [color-scheme:dark]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Date To</label>
                    <input
                      type="date"
                      value={draftFilters.dateTo}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, dateTo: e.target.value }))}
                      className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded-lg text-sm text-primary font-mono outline-none focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary [color-scheme:dark]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Verdict</label>
                  <select
                    value={draftFilters.verdict}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, verdict: e.target.value as FilterState['verdict'] }))}
                    className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded-lg text-sm text-primary font-mono outline-none focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary cursor-pointer"
                  >
                    <option value="">All</option>
                    <option value="PASSED">PASS</option>
                    <option value="FAILED">FAIL</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Status</label>
                  <select
                    value={draftFilters.amendmentStatus}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, amendmentStatus: e.target.value as FilterState['amendmentStatus'] }))}
                    className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded-lg text-sm text-primary font-mono outline-none focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary cursor-pointer"
                  >
                    <option value="">All</option>
                    <option value="UNMODIFIED">Original</option>
                    <option value="AMENDMENT_DRAFTED">Drafted</option>
                    <option value="PENDING_APPROVAL">Awaiting Approval</option>
                    <option value="APPROVED">Amended</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Line</label>
                    <select
                      value={draftFilters.lineId}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, lineId: e.target.value }))}
                      className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded-lg text-sm text-primary font-mono outline-none focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary cursor-pointer"
                    >
                      <option value="">All</option>
                      {(config?.lines ?? []).map((line) => (
                        <option key={line.id} value={line.id}>{line.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Side</label>
                    <select
                      value={draftFilters.side}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, side: e.target.value }))}
                      className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded-lg text-sm text-primary font-mono outline-none focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary cursor-pointer"
                    >
                      <option value="">All</option>
                      {(config?.sides ?? []).map((side) => (
                        <option key={side.id} value={side.id}>{side.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Inspector</label>
                  <input
                    type="text"
                    value={draftFilters.inspector}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, inspector: e.target.value }))}
                    placeholder="Name..."
                    className="w-full h-9 px-3 bg-canvas border border-gray-700 rounded-lg text-sm text-primary font-mono outline-none focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-800">
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs font-semibold uppercase tracking-wider text-muted hover:text-primary transition-colors flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2} />
                    Clear Filters
                  </button>
                  <Button variant="primary" className="h-9 px-4 text-xs" onClick={handleApplyFilters}>
                    APPLY
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button
            variant="secondary"
            className="px-4 flex items-center gap-2 w-full sm:w-auto"
            onClick={handleExportCsv}
            disabled={isExporting}
          >
            <Download className="w-4 h-4" strokeWidth={2} />
            {isExporting ? 'EXPORTING…' : 'EXPORT CSV'}
          </Button>
        </div>
      </div>

      {/* ── §4.2 High-Density Data Table ─────────────────────────────────────
          INLINE DETAIL, back to the original interaction model: clicking a
          row's chevron expands its detail directly beneath it (a <tr> with
          a <td colSpan={COLUMN_WIDTHS.length}>), pushing subsequent rows
          down. This went through three rounds to get back to:
            1. ORIGINAL BUG: this table used default (auto) table-layout.
               A colSpan cell's max-content width — every AQL chip/badge on
               one unwrapped line — fed the table's own width calculation,
               dragging the whole table wider than the viewport. Reproduced
               on a 1920x1080 screen and not 3840x2400 with the identical
               record, because at 3840 the container was simply wide enough
               to fit the blown-out width — nothing was ever being clipped.
            2. FIX: switched to `table-fixed` with explicit percentage
               COLUMN_WIDTHS (below). Under fixed layout, cell CONTENT
               cannot influence column width AT ALL — not a heuristic, part
               of the CSS2.1 §17.5.2.1 spec for table-layout:fixed. Also
               moved the detail panel out of the table (belt-and-braces,
               two independent guards) to fix the bug immediately, since
               verifying table-fixed alone was sufficient took another
               round.
            3. UX: "out of the table" meant below the WHOLE row list, too
               far from the clicked row on a long table (round 2 relocated
               it below; round 3 tried pinning it to the viewport bottom
               instead) — neither was a pleasant experience. Restored here
               to inline, relying on table-fixed (established since step 2,
               never removed) as the sole width guard this time — which is
               what makes inline safe now when it wasn't step 1, where
               table-layout was still auto.
          Guarded going forward by history.widthRegression.test.tsx, which
          renders this real component with worst-case data (25 defects, 6
          categories) in an actual browser (Vitest browser mode / Playwright
          — jsdom has no layout engine, so a jsdom test could not have
          caught this class of bug at all) and asserts the table's rendered
          width is unchanged whether the detail row is open or closed — and
          proves that assertion is meaningful by first showing it correctly
          FAILS against a deliberately-reverted (auto-layout) control case. */}
      <div className="bg-surface border border-gray-800 rounded-lg overflow-x-auto shadow-sm scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        <table className="w-full table-fixed text-left" style={{ minWidth: `${TABLE_MIN_WIDTH_PX}px` }}>
          <colgroup>
            {COLUMN_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="bg-canvas py-3 px-2 border-b border-gray-800" />
              <Th isDivider>
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
                <td colSpan={COLUMN_WIDTHS.length} className="py-8 text-center text-muted font-mono animate-pulse uppercase tracking-wider text-sm">
                  Loading inspection records...
                </td>
              </tr>
            ) : sortedSubmissions.length > 0 ? (
              sortedSubmissions.flatMap((sub) => {
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
                    className={`hover:bg-white/5 transition-colors cursor-pointer group ${isExpanded ? 'bg-brand-primary/[0.07]' : ''}`}
                  >
                    {/* Expand chevron */}
                    <td className="py-3 px-2 border-b border-gray-700/50 text-center">
                      <span className="text-muted group-hover:text-primary transition-colors inline-flex items-center justify-center">
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4" strokeWidth={2} />
                          : <ChevronRight className="w-4 h-4" strokeWidth={2} />}
                      </span>
                    </td>

                    {/* 1. LOT NUMBER */}
                    <td className="py-3 px-3 border-b border-r border-gray-700/50 text-sm font-mono text-primary">
                      <div className="truncate">{sub.batchNumber || '—'}</div>
                      {newSubmissionThreshold && new Date(sub.createdAt) > new Date(newSubmissionThreshold) && (
                        <div className="mt-1">
                          <span className="inline-flex px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] bg-brand-secondary/10 border border-brand-secondary/30 text-brand-secondary">
                            NEW
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 2. PRODUCT CODE */}
                    <td className="py-3 px-3 border-b border-gray-700/50 text-sm font-mono text-primary">
                      <div className="truncate">{sub.productCode || '—'}</div>
                    </td>

                    {/* 3. DATE & TIME */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary truncate">{dateStr || '—'}</div>
                      <div className="text-xs font-mono text-muted truncate">{timeStr}</div>
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
                      <div className="text-sm font-mono text-primary truncate">{sub.machineId || '—'}</div>
                      <div className="text-xs font-mono text-muted truncate">{sub.shift ? sub.shift.split(' (')[0] : '—'}</div>
                    </td>

                    {/* 7. GLOVE SIZE & SAMPLE SIZE */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary truncate">{sub.size || '—'}</div>
                      <div className="text-xs font-mono text-muted truncate">{sub.sampleSize ?? '—'}</div>
                    </td>

                    {/* 8. TOTAL CARTON & GLOVE WEIGHT */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary truncate">{sub.totalCarton ?? '—'}</div>
                      <div className="text-xs font-mono text-muted truncate">
                        {sub.gloveWeight != null ? `${sub.gloveWeight}g` : '—'}
                      </div>
                    </td>

                    {/* 9. INSPECTOR */}
                    <td className="py-3 px-3 border-b border-gray-700/50 text-sm text-muted font-sans">
                      <div className="truncate">{sub.inspectorName || '—'}</div>
                    </td>
                  </tr>
                );

                if (!isExpanded) return [dataRow];

                return [
                  dataRow,
                  <tr key={`${sub.id}-panel`}>
                    <DefectBreakdownPanel sub={sub} onAmend={handleAmend} />
                  </tr>,
                ];
              })
            ) : (
              <tr>
                <td colSpan={COLUMN_WIDTHS.length} className="py-8 text-center text-muted text-sm font-sans">
                  {searchTerm || activeFilterCount > 0
                    ? 'No records match your search/filters.'
                    : 'No inspection records found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore} className="px-8">
            {loadingMore ? 'LOADING…' : 'LOAD MORE'}
          </Button>
        </div>
      )}

    </div>
  );
}
