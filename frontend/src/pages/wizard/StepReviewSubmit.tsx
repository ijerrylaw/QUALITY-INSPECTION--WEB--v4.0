/**
 * @file StepReviewSubmit.tsx
 * @description Step 4 of the Smart Quality Inspection Wizard — Review & Submit.
 *
 * SERVER-VERIFIED VERDICT (Step 9):
 * AQL verdict computation is delegated to POST /api/verdict/preview — the
 * same resolveVerdict()/evaluateAQLVerdict() single source of truth used by
 * every persisting route (backend/src/engine/resolveVerdict.ts,
 * backend/src/engine/aqlEvaluator.ts) — instead of a duplicate client-side
 * copy of the AQL matrix and evaluation logic. Dimension pass/fail has no
 * server-side equivalent anywhere in this codebase (ISO2859_MATH_ENGINE.md
 * documents AQL verdict logic and physical dimension evaluation as two
 * independent systems), so failedDimensions stays a local computation and
 * is OR'd with the server's AQL verdict for the final overallVerdict.
 *
 * UI_DESIGN_SYSTEM.md compliance:
 * - Hero Verdict Banner (§5.1): p-6 rounded-xl border with semantic bg/border.
 * - Summary Key-Value lists (§4.4): keys uppercase text-muted, values font-mono.
 * - KPI Display Blocks (§4.4): text-4xl font-mono font-bold.
 * - Critical Output (§4.6): bg-gray-900 border-brand-secondary/50 font-mono.
 * - All buttons: font-bold text-xs uppercase tracking-wider h-12.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  BookmarkCheck,
  Box,
  Ruler,
  ShieldAlert,
  Info,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfig, API_BASE_URL } from '../../context/ConfigContext';
import type { AQLCategory, DefectDefinition } from '../../context/ConfigContext';
import { SubmissionSummary } from './SubmissionSummary';

/**
 * Returns true when the category is RECORD ONLY — excluded from verdict
 * computation entirely via aqlEvaluator.ts's true-exclusion skip
 * (`evaluationMode === ''`), so it never gets a CategoryResult pushed and is
 * structurally absent from POST /api/verdict/preview's categoryResults
 * (AUDIT_REPORT.md #22). Mirrors StepDefects.tsx's isRecordOnlyAql /
 * AqlCategoryAnalysisPanel.tsx's isRecordOnly — same detection convention,
 * kept as its own inline copy per this file's existing "display-only inline
 * copy, kept in sync manually" pattern (see file header).
 */
const isRecordOnlyAql = (aql: string | undefined): boolean =>
  (aql ?? '').toUpperCase() === 'RECORD ONLY';

export interface StepReviewSubmitProps {
  inspectionData: Record<string, any>;
  originalData?: Record<string, any> | null;
  onSubmit: (retainContext: boolean) => void;
  onBack: () => void;
  onUpdate?: (partial: Record<string, any>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Display-only mirror of backend/src/engine/iso2859-matrix.ts's
// SAMPLE_SIZE_BRACKETS and aqlEvaluator.ts's snapToBracket() (nearest
// bracket, tie → larger, per ISO2859_MATH_ENGINE.md §1). NOT used for
// verdict computation — that is server-authoritative via
// POST /api/verdict/preview. Used only for the "ISO Bracket: X" and
// per-category "n=X" display text, matching the same "display-only inline
// copy" pattern ISO2859_MATH_ENGINE.md §2 documents for HistoryFeed.tsx.
// ─────────────────────────────────────────────────────────────────────────────

const DISPLAY_ISO_BRACKETS = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500] as const;

function snapToDisplayBracket(n: number): number {
  const rounded = Math.max(2, Math.round(n));
  return DISPLAY_ISO_BRACKETS.reduce<number>((best, candidate) => {
    const distCandidate = Math.abs(candidate - rounded);
    const distBest = Math.abs(best - rounded);
    if (distCandidate < distBest || (distCandidate === distBest && candidate > best)) {
      return candidate;
    }
    return best;
  }, DISPLAY_ISO_BRACKETS[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verdict/preview response shape — mirrors
// backend/src/engine/aqlEvaluator.ts's exported CategoryResult/FailingDefect.
// ─────────────────────────────────────────────────────────────────────────────

interface VerdictFailingDefect {
  defectId: string;
  defectName: string;
  count: number;
  threshold: { ac: number; re: number };
}

interface VerdictCategoryResult {
  categoryId: string;
  categoryName: string;
  evaluationMode: 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';
  threshold: { ac: number; re: number };
  totalCount: number;
  passed: boolean;
  failingDefects: VerdictFailingDefect[];
}

type VerdictPreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; verdict: 'PASSED' | 'FAILED'; categoryResults: VerdictCategoryResult[] };

/**
 * Per-category display row, derived from VerdictCategoryResult + local
 * profile labels — OR, for RECORD ONLY categories (see isRecordOnlyAql
 * above), synthesized entirely client-side since no VerdictCategoryResult
 * exists for them at all.
 */
interface CategoryVerdictRow {
  categoryName: string;
  aql: string;
  evalMode: string;
  defectCount: number;
  thresholds: { ac: number; re: number; bracket: number } | null;
  result: 'PASS' | 'FAIL' | 'RECORD_ONLY';
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function StepReviewSubmit({ inspectionData, originalData, onSubmit, onUpdate }: StepReviewSubmitProps) {
  const { addToast } = useToast();
  const { getResolvedProfile } = useConfig();

  const [retainContext, setRetainContext] = useState<boolean>(true);
  const [previewState, setPreviewState] = useState<VerdictPreviewState>({ status: 'loading' });
  const [retryTick, setRetryTick] = useState(0);

  // ── Resolve active InspectionProfile (display labels only — verdict math is server-side) ──
  const activeProfile = useMemo(
    () => getResolvedProfile(inspectionData?.profileId),
    [getResolvedProfile, inspectionData?.profileId]
  );

  const aqlCategories: AQLCategory[] = activeProfile?.aqlCategories ?? [];
  const defectDefinitions: DefectDefinition[] = activeProfile?.defectDefinitions ?? [];
  const sampleSize: number = inspectionData?.sampleSize ?? 125;
  const defectsSignature = JSON.stringify(inspectionData?.defects ?? {});

  // ── POST /api/verdict/preview — server-authoritative AQL verdict ──────────
  useEffect(() => {
    let cancelled = false;
    setPreviewState({ status: 'loading' });

    fetch(`${API_BASE_URL}/api/verdict/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: inspectionData?.profileId ?? null,
        productCode: inspectionData?.productCode,
        sampleSize,
        defects: inspectionData?.defects ?? {},
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
        setPreviewState({ status: 'success', verdict: data.verdict, categoryResults: data.categoryResults ?? [] });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[StepReviewSubmit] POST /api/verdict/preview failed:', msg);
        setPreviewState({ status: 'error', message: msg });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionData?.profileId, inspectionData?.productCode, sampleSize, defectsSignature, retryTick]);

  // ── Physical dimension failures — no server equivalent, stays local ───────
  const failedDimensions = useMemo(() => {
    const dimStats: Record<string, any> = inspectionData?.dimensionStats ?? {};
    let failed = 0;
    Object.values(dimStats).forEach((dim: any) => {
      // Record-only dimensions are measured but never graded. StepDimensions
      // already emits an all-false `fails` for them, so this guard is belt-
      // and-braces — stated explicitly rather than relied on implicitly,
      // because this is the site that turns a dimension failure into a FAIL
      // verdict and the rule should be visible where the consequence is.
      // Absent (pre-flag stats) reads as graded, matching isDimensionGraded().
      if (dim?.isGraded === false) return;
      if (dim?.fails?.some((f: boolean) => f === true)) failed++;
    });
    return failed;
  }, [inspectionData?.dimensionStats]);

  // ── Derive render-facing verdict values from server state + dimensions ────
  const overallVerdict: 'PASS' | 'FAIL' | null =
    previewState.status !== 'success'
      ? null
      : previewState.verdict === 'FAILED' || failedDimensions > 0
        ? 'FAIL'
        : 'PASS';

  // Sync the computed verdict up to WizardPage so amendment payloads
  // reflect the latest server-verified value, not a stale prefill (§5.7).
  // Guarded on non-null so the transient loading/error state never
  // overwrites a previously-known good value in shared state.
  useEffect(() => {
    if (overallVerdict) onUpdate?.({ overallVerdict });
  }, [overallVerdict, onUpdate]);

  const totalDefects: number | null =
    previewState.status === 'success'
      ? previewState.categoryResults.reduce((sum, cr) => sum + cr.totalCount, 0)
      : null;

  // Iterates the LOCAL profile's category order (not previewState.categoryResults'
  // order) so a RECORD ONLY category — which never gets a VerdictCategoryResult
  // at all, per aqlEvaluator.ts's true-exclusion skip — can be interleaved into
  // its correct relative position instead of only ever appending after every
  // graded category. Graded categories keep the exact same server-sourced
  // fields as before; only their position in the array is now driven by the
  // local profile instead of the server response's array order (the two have
  // always matched in practice, since the server iterates the same profile).
  const categoryVerdicts: CategoryVerdictRow[] =
    previewState.status === 'success'
      ? aqlCategories.reduce<CategoryVerdictRow[]>((rows, localCat) => {
          const cr = previewState.categoryResults.find((r) => r.categoryId === localCat.id);
          if (cr) {
            rows.push({
              categoryName: cr.categoryName,
              aql: localCat.aql ?? localCat.aqlLevel ?? '—',
              evalMode: cr.evaluationMode === 'N/A' ? 'QUALITATIVE' : cr.evaluationMode,
              defectCount: cr.totalCount,
              thresholds: { ac: cr.threshold.ac, re: cr.threshold.re, bracket: snapToDisplayBracket(sampleSize) },
              result: cr.passed ? 'PASS' : 'FAIL',
              reason: cr.passed
                ? undefined
                : cr.failingDefects.map((fd) => `${fd.defectName}: ${fd.count} > ac(${fd.threshold.ac})`).join('; '),
            });
            return rows;
          }

          // No VerdictCategoryResult for this category — either it's RECORD
          // ONLY (expected, display it as a plain quantity) or genuinely
          // unconfigured (no aqlLevel/evaluationMode set at all — skip it
          // silently, same as before this fix).
          const aqlText = localCat.aql ?? localCat.aqlLevel ?? '—';
          if (isRecordOnlyAql(aqlText)) {
            const defectCount = defectDefinitions
              .filter((d) => d.categoryId === localCat.id)
              .reduce((sum, d) => sum + (inspectionData?.defects?.[d.id] ?? 0), 0);
            rows.push({
              categoryName: localCat.name,
              aql: aqlText,
              // "NOT GRADED" rather than repeating "RECORD ONLY" a third time
              // in this row — the AQL chip already reads "AQL RECORD ONLY"
              // and the right-hand Eye badge already says "RECORD ONLY".
              evalMode: 'NOT GRADED',
              defectCount,
              thresholds: null,
              result: 'RECORD_ONLY',
            });
          }
          return rows;
        }, [])
      : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (previewState.status !== 'success') {
      addToast(
        'error',
        previewState.status === 'error'
          ? 'Cannot submit — verdict computation failed. Please retry.'
          : 'Please wait for verdict computation to finish before submitting.'
      );
      return;
    }
    onSubmit(retainContext);
  };

  return (
    <form id="wizard-step-form" onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Hero Verdict Banner — UI_DESIGN_SYSTEM.md §5.1 — leads the page, the single most decision-relevant fact here ── */}
      <div className={`p-6 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm ${
        previewState.status === 'loading'
          ? 'bg-surface border-gray-700/50'
          : previewState.status === 'error'
            ? 'bg-amber-500/5 border-amber-500/30'
            : overallVerdict === 'PASS'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-rose-500/10 border-rose-500/30'
      }`}>
        <div className="flex items-center gap-4">
          {previewState.status === 'loading' ? (
            <Loader2 className="w-10 h-10 text-muted shrink-0 animate-spin" strokeWidth={2} />
          ) : previewState.status === 'error' ? (
            <AlertTriangle className="w-10 h-10 text-amber-400 shrink-0" strokeWidth={2} />
          ) : overallVerdict === 'PASS' ? (
            <CheckCircle2 className="w-10 h-10 text-emerald-400 shrink-0" strokeWidth={2} />
          ) : (
            <XCircle className="w-10 h-10 text-rose-400 shrink-0" strokeWidth={2} />
          )}
          <div>
            {previewState.status === 'loading' ? (
              <h2 className="text-2xl font-bold uppercase tracking-wide text-muted animate-pulse">
                COMPUTING ISO 2859-1 VERDICT…
              </h2>
            ) : previewState.status === 'error' ? (
              <>
                <h2 className="text-2xl font-bold uppercase tracking-wide text-amber-400">
                  VERDICT UNAVAILABLE
                </h2>
                <p className="text-xs font-bold uppercase tracking-wider mt-1 text-amber-500/70">
                  {previewState.message}
                </p>
                <button
                  type="button"
                  onClick={() => setRetryTick((t) => t + 1)}
                  className="mt-3 h-8 px-4 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
                >
                  <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                  RETRY
                </button>
              </>
            ) : (
              <>
                <h2 className={`text-2xl font-bold uppercase tracking-wide ${
                  overallVerdict === 'PASS' ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  ISO 2859-1 VERDICT: {overallVerdict}
                </h2>
                <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${
                  overallVerdict === 'PASS' ? 'text-emerald-500/70' : 'text-rose-500/70'
                }`}>
                  {overallVerdict === 'PASS'
                    ? 'LOT MEETS ACCEPTABLE QUALITY LIMITS'
                    : `LOT REJECTED — ${failedDimensions > 0 ? `${failedDimensions} Dimension Issue(s)` : ''} ${(totalDefects ?? 0) > 0 ? `${totalDefects} Defect(s) Found` : ''}`.trim()}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Final System Lot — Critical Output per UI_DESIGN_SYSTEM.md §4.7 & §5.1 */}
        <div className="bg-canvas border border-brand-secondary/50 rounded-lg px-6 py-3 shadow-inner text-center">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">FINAL SYSTEM LOT</span>
          <span className="text-xl font-mono font-bold text-white tracking-widest">
            {inspectionData?.fullSystemLotNo ?? 'UNKNOWN'}
          </span>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Card 1: Batch Metadata */}
        <div className="bg-surface border border-gray-700/50 rounded-lg p-4 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold uppercase text-primary border-b border-gray-700/50 pb-3 mb-4 flex items-center gap-2">
            <Box className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            BATCH METADATA
          </h3>
          <div className="space-y-3 flex-1">
            {[
              { label: 'PRODUCT', value: `${inspectionData?.productCode ?? '—'} (${inspectionData?.size ?? '—'})` },
              { label: 'LINE', value: inspectionData?.lineId ?? '—' },
              { label: 'SHIFT', value: inspectionData?.shift ?? '—' },
              { label: 'SAMPLE SIZE', value: `${sampleSize} Pcs (ISO Bracket: ${snapToDisplayBracket(sampleSize)})` },
              { label: 'TOTAL CARTON', value: inspectionData?.totalCarton ?? '—' },
              { label: 'GLOVE WEIGHT', value: inspectionData?.gloveWeight ? `${inspectionData.gloveWeight}g` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center border-b border-gray-800/50 pb-2 last:border-0 last:pb-0">
                <span className="text-[10px] font-bold uppercase text-muted tracking-wider">{label}</span>
                <span className="text-sm font-mono text-primary font-bold">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Physical Dimensions */}
        <div className="bg-surface border border-gray-700/50 rounded-lg p-4 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold uppercase text-primary border-b border-gray-700/50 pb-3 mb-4 flex items-center gap-2">
            <Ruler className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            PHYSICAL DIMENSIONS
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            {/* KPI Block — UI_DESIGN_SYSTEM.md §4.4 */}
            <div className={`text-4xl font-mono font-bold mb-2 ${failedDimensions > 0 ? 'text-rose-400' : 'text-primary'}`}>
              {inspectionData?.totalSlots ?? 0}
            </div>
            <span className="text-[10px] uppercase text-muted font-bold tracking-widest text-center">
              Total Slots<br />Measured
            </span>
            <div className="w-full mt-6 flex items-center justify-between bg-canvas rounded-lg border border-gray-800 p-3 shadow-inner">
              <span className="text-xs text-muted font-bold uppercase tracking-wider">Out-of-Spec Dimensions</span>
              <span className={`text-lg font-mono font-bold ${failedDimensions > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {failedDimensions}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Defect Tabulation KPI */}
        <div className="bg-surface border border-gray-700/50 rounded-lg p-4 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold uppercase text-primary border-b border-gray-700/50 pb-3 mb-4 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            DEFECT TABULATION
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            <div className={`text-4xl font-mono font-bold mb-2 ${
              totalDefects === null ? 'text-muted' : totalDefects > 0 ? 'text-rose-400' : 'text-primary'
            }`}>
              {totalDefects === null ? '—' : totalDefects}
            </div>
            <span className="text-[10px] uppercase text-muted font-bold tracking-widest text-center">
              Total Defects<br />Recorded
            </span>
            <div className="w-full mt-6 flex items-center justify-between bg-canvas rounded-lg border border-gray-800 p-3 shadow-inner">
              <span className="text-xs text-muted font-bold uppercase tracking-wider">Verdict Impact</span>
              <span className={`text-lg font-mono font-bold ${
                totalDefects === null ? 'text-muted' : totalDefects > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}>
                {totalDefects === null ? 'PENDING' : totalDefects > 0 ? 'FAIL' : 'PASS'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Per-Category ISO 2859-1 Breakdown ────────────────────────────── */}
      {categoryVerdicts.length > 0 && (
        <div className="bg-surface border border-gray-700/50 rounded-lg p-4 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold uppercase text-primary border-b border-gray-700/50 pb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            ISO 2859-1 CATEGORY BREAKDOWN
          </h3>
          <div className="space-y-2">
            {categoryVerdicts.map((cv, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 py-3 border-b border-gray-800/50 last:border-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cv.result === 'PASS' ? 'bg-emerald-400' : cv.result === 'FAIL' ? 'bg-rose-400' : 'bg-gray-600'}`} />
                <span className="text-xs font-bold uppercase text-primary tracking-wider min-w-[90px]">{cv.categoryName}</span>
                <span className="text-[10px] font-mono text-muted bg-canvas border border-gray-800 px-2 py-0.5 rounded-md">AQL {cv.aql}</span>
                <span className="text-[10px] font-mono text-muted bg-canvas border border-gray-800 px-2 py-0.5 rounded-md">{cv.evalMode}</span>
                {cv.thresholds && (
                  <span className="text-[10px] font-mono text-muted bg-canvas border border-gray-800 px-2 py-0.5 rounded-md">
                    n={cv.thresholds.bracket} · ac={cv.thresholds.ac} · re={cv.thresholds.re}
                  </span>
                )}
                <span className="text-[10px] font-mono text-muted">Count: {cv.defectCount}</span>
                {cv.result === 'RECORD_ONLY' ? (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 border border-gray-500/30 text-gray-400 inline-flex items-center gap-1">
                    <Eye className="w-3 h-3" strokeWidth={2} />
                    RECORD ONLY
                  </span>
                ) : (
                  <span className={`ml-auto text-xs font-mono font-bold ${cv.result === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {cv.result}
                  </span>
                )}
                {cv.reason && (
                  <span className="text-[10px] text-rose-400/70 font-mono w-full pl-5">↳ {cv.reason}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pre-Submit Summary — audit trail of what was edited, sits below the verdict's supporting evidence ── */}
      <SubmissionSummary inspectionData={inspectionData} originalData={originalData} />

      {/* ── Submission Blocked Notice ────────────────────────────────────── */}
      {previewState.status !== 'success' && (
        <div className="p-3 rounded-lg border border-amber-500/30 border-l-4 border-l-amber-500 bg-amber-500/5 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" strokeWidth={2} />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
            {previewState.status === 'loading'
              ? 'Submission is blocked until the verdict finishes computing.'
              : 'Submission is blocked — verdict computation failed. Retry above before submitting.'}
          </span>
        </div>
      )}

      {/* ── Retain Context Toggle ──────────────── */}
      <div className="flex justify-end pt-6 border-t border-gray-800">
        <label
          className="h-10 w-full md:w-auto px-4 rounded-lg bg-surface border border-gray-800 flex items-center justify-center gap-3 cursor-pointer select-none hover:bg-surface-light transition-all"
          title="When enabled, Inspection Profile, Product Code, Size, Line, Side, Sample Size, and Glove Weight are preserved for the next batch. Shift is not retained — it's recalculated from the new entry's time."
        >
          <input
            type="checkbox"
            checked={retainContext}
            onChange={(e) => setRetainContext(e.target.checked)}
            className="w-4 h-4 rounded border-gray-700 bg-canvas text-brand-primary focus:ring-brand-secondary focus:ring-offset-canvas"
          />
          <div className="flex items-center gap-2">
            <BookmarkCheck className={`w-4 h-4 ${retainContext ? 'text-emerald-400' : 'text-muted'}`} strokeWidth={2} />
            <span className={`text-xs font-bold uppercase tracking-wider whitespace-nowrap ${retainContext ? 'text-primary' : 'text-muted'}`}>
              RETAIN CONTEXT FOR NEXT BATCH
            </span>
          </div>
        </label>
      </div>
    </form>
  );
}
