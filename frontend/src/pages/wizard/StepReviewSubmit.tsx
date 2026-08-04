/**
 * @file StepReviewSubmit.tsx
 * @description Step 4 of the Smart Quality Inspection Wizard — Review & Submit.
 *
 * MATH ENGINE INTEGRATION (Turn 5):
 * Implements ISO 2859-1 verdict evaluation per ISO2859_MATH_ENGINE.md:
 * - Bracket Snapping: sample size → nearest ISO bracket (§1)
 * - AQL Lookup: ac/re thresholds per aqlLevel × sample size bracket (§1)
 * - Zero Tolerance: AND category locks to { ac: 0, re: 1 } (§1)
 * - CUMULATIVE Mode: sum all defects in category, compare to ac (§2)
 * - GRANULAR Mode: each defect checked independently, any > ac fails (§2)
 * - PASS/FAIL/NIL: any FAIL qualitative state fails the category (§2)
 *
 * UI_DESIGN_SYSTEM.md compliance:
 * - Hero Verdict Banner (§5.1): p-6 rounded-xl border with semantic bg/border.
 * - Summary Key-Value lists (§4.4): keys uppercase text-muted, values font-mono.
 * - KPI Display Blocks (§4.4): text-4xl font-mono font-bold.
 * - Critical Output (§4.6): bg-gray-900 border-brand-secondary/50 font-mono.
 * - All buttons: font-bold text-xs uppercase tracking-wider h-12.
 */

import { useState, useMemo } from 'react';
import {
  ClipboardCheck,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  BookmarkCheck,
  Box,
  Ruler,
  ShieldAlert,
  ArrowRight,
  Info,
} from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfig } from '../../context/ConfigContext';
import type { AQLCategory } from '../../context/ConfigContext';

export interface StepReviewSubmitProps {
  inspectionData: Record<string, any>;
  onSubmit: (retainContext: boolean) => void;
  onBack: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// ISO 2859-1 MASTER AQL LOOKUP ENGINE  (ISO2859_MATH_ENGINE.md §1)
// ─────────────────────────────────────────────────────────────────────────────

/** Standard ISO 2859-1 sample size brackets */
const ISO_BRACKETS = [13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250];

/**
 * Bracket Snapping — snap arbitrary sample size to nearest standard ISO bracket.
 * ISO2859_MATH_ENGINE.md §1: "engine MUST snap to the nearest standard ISO bracket"
 */
function snapToIsoBracket(n: number): number {
  if (n <= 0) return ISO_BRACKETS[0];
  for (const bracket of ISO_BRACKETS) {
    if (n <= bracket) return bracket;
  }
  return ISO_BRACKETS[ISO_BRACKETS.length - 1];
}

/** AQL Threshold matrix: aqlLevel → bracket → { ac, re } */
const AQL_MATRIX: Record<string, Record<number, { ac: number; re: number }>> = {
  '0.65': {
    13: { ac: 0, re: 1 },
    20: { ac: 0, re: 1 },
    32: { ac: 0, re: 1 },
    50: { ac: 0, re: 1 },
    80: { ac: 1, re: 2 },
    125: { ac: 1, re: 2 },
    200: { ac: 2, re: 3 },
    315: { ac: 3, re: 4 },
    500: { ac: 5, re: 6 },
    800: { ac: 7, re: 8 },
    1250: { ac: 10, re: 11 },
  },
  '1.0': {
    13: { ac: 0, re: 1 },
    20: { ac: 0, re: 1 },
    32: { ac: 0, re: 1 },
    50: { ac: 1, re: 2 },
    80: { ac: 1, re: 2 },
    125: { ac: 2, re: 3 },
    200: { ac: 3, re: 4 },
    315: { ac: 5, re: 6 },
    500: { ac: 7, re: 8 },
    800: { ac: 10, re: 11 },
    1250: { ac: 14, re: 15 },
  },
  '1.5': {
    13: { ac: 0, re: 1 },
    20: { ac: 0, re: 1 },
    32: { ac: 1, re: 2 },
    50: { ac: 1, re: 2 },
    80: { ac: 2, re: 3 },
    125: { ac: 3, re: 4 },
    200: { ac: 5, re: 6 },
    315: { ac: 7, re: 8 },
    500: { ac: 10, re: 11 },
    800: { ac: 14, re: 15 },
    1250: { ac: 21, re: 22 },
  },
  '2.5': {
    13: { ac: 0, re: 1 },
    20: { ac: 1, re: 2 },
    32: { ac: 1, re: 2 },
    50: { ac: 2, re: 3 },
    80: { ac: 3, re: 4 },
    125: { ac: 5, re: 6 },
    200: { ac: 7, re: 8 },
    315: { ac: 10, re: 11 },
    500: { ac: 14, re: 15 },
    800: { ac: 21, re: 22 },
    1250: { ac: 21, re: 22 },
  },
  '4.0': {
    13: { ac: 1, re: 2 },
    20: { ac: 1, re: 2 },
    32: { ac: 2, re: 3 },
    50: { ac: 3, re: 4 },
    80: { ac: 5, re: 6 },
    125: { ac: 7, re: 8 },
    200: { ac: 10, re: 11 },
    315: { ac: 14, re: 15 },
    500: { ac: 21, re: 22 },
    800: { ac: 21, re: 22 },
    1250: { ac: 21, re: 22 },
  },
  '6.5': {
    13: { ac: 1, re: 2 },
    20: { ac: 2, re: 3 },
    32: { ac: 3, re: 4 },
    50: { ac: 5, re: 6 },
    80: { ac: 7, re: 8 },
    125: { ac: 10, re: 11 },
    200: { ac: 14, re: 15 },
    315: { ac: 21, re: 22 },
    500: { ac: 21, re: 22 },
    800: { ac: 21, re: 22 },
    1250: { ac: 21, re: 22 },
  },
};

interface AQLThresholds {
  ac: number;
  re: number;
  bracket: number;
}

/**
 * ISO2859_MATH_ENGINE.md §1 — getAQLThresholds
 * Returns acceptance (ac) and rejection (re) counts for a given AQL level and sample size.
 * AND locks to { ac: 0, re: 1 }. PASS/FAIL/NIL returns null (evaluated separately).
 */
function getAQLThresholds(sampleSize: number, aqlLevel: string): AQLThresholds | null {
  const aql = (aqlLevel ?? '').toUpperCase();
  if (aql === 'AND') return { ac: 0, re: 1, bracket: snapToIsoBracket(sampleSize) };
  if (aql === 'PASS/FAIL/NIL') return null;

  const bracket = snapToIsoBracket(sampleSize);
  const row = AQL_MATRIX[aqlLevel]?.[bracket];
  if (!row) return { ac: 0, re: 1, bracket };
  return { ...row, bracket };
}

/** Per-category verdict result */
interface CategoryVerdict {
  categoryName: string;
  aql: string;
  evalMode: string;
  defectCount: number;
  thresholds: AQLThresholds | null;
  result: 'PASS' | 'FAIL' | 'N/A';
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function StepReviewSubmit({ inspectionData, onSubmit, onBack }: StepReviewSubmitProps) {
  const { addToast } = useToast();
  const { getResolvedProfile } = useConfig();

  const [retainContext, setRetainContext] = useState<boolean>(true);

  // ── Resolve active InspectionProfile ─────────────────────────────────────
  const activeProfile = useMemo(
    () => getResolvedProfile(inspectionData?.profileId),
    [getResolvedProfile, inspectionData?.profileId]
  );

  const aqlCategories: AQLCategory[] = activeProfile?.aqlCategories ?? [];
  const defectDefinitions = activeProfile?.defectDefinitions ?? [];
  const sampleSize: number = inspectionData?.sampleSize ?? 125;

  // ── ISO 2859-1 Verdict Engine (ISO2859_MATH_ENGINE.md §2) ─────────────────
  const { overallVerdict, categoryVerdicts, totalDefects, failedDimensions } = useMemo(() => {
    const defectCounts: Record<string, number> = inspectionData?.defects ?? {};
    const qualStates: Record<string, string> = inspectionData?.qualitative ?? {};
    const dimStats: Record<string, any> = inspectionData?.dimensionStats ?? {};

    // 1. Dimension failures
    let failedDims = 0;
    Object.values(dimStats).forEach((dim: any) => {
      if (dim?.fails?.some((f: boolean) => f === true)) failedDims++;
    });

    // 2. Per-category AQL evaluation
    const catVerdicts: CategoryVerdict[] = aqlCategories.map((cat) => {
      const catAql = cat.aql ?? cat.aqlLevel ?? '';
      const evalMode = (cat.evalMode ?? cat.evaluationMode ?? 'CUMULATIVE') as string;
      const catDefects = defectDefinitions.filter((d: any) => d.categoryId === cat.id);

      // PASS/FAIL/NIL qualitative evaluation
      if (catAql.toUpperCase() === 'PASS/FAIL/NIL') {
        const failCount = catDefects.filter((d: any) => qualStates[d.id] === 'FAIL').length;
        return {
          categoryName: cat.name,
          aql: catAql,
          evalMode: 'QUALITATIVE',
          defectCount: failCount,
          thresholds: null,
          result: failCount > 0 ? 'FAIL' : 'PASS',
          reason: failCount > 0 ? `${failCount} FAIL state(s) recorded` : undefined,
        };
      }

      const thresholds = getAQLThresholds(sampleSize, catAql);
      if (!thresholds) {
        return {
          categoryName: cat.name, aql: catAql, evalMode, defectCount: 0,
          thresholds: null, result: 'N/A' as const,
        };
      }

      let defectCount = 0;
      let result: 'PASS' | 'FAIL' = 'PASS';
      let reason: string | undefined;

      if (evalMode.toUpperCase() === 'GRANULAR') {
        // GRANULAR: each individual defect type checked independently (§2)
        for (const d of catDefects) {
          const c = defectCounts[d.id] ?? 0;
          defectCount += c;
          if (c > thresholds.ac) {
            result = 'FAIL';
            reason = `${d.name}: ${c} > ac(${thresholds.ac})`;
            break;
          }
        }
      } else {
        // CUMULATIVE: sum all defects in category (§2)
        defectCount = catDefects.reduce((sum, d: any) => sum + (defectCounts[d.id] ?? 0), 0);
        if (defectCount >= thresholds.re) {
          result = 'FAIL';
          reason = `Sum ${defectCount} ≥ re(${thresholds.re})`;
        }
      }

      return {
        categoryName: cat.name,
        aql: catAql,
        evalMode: evalMode.toUpperCase() === 'CUMULATIVE' ? 'CUMULATIVE' : evalMode,
        defectCount,
        thresholds,
        result,
        reason,
      };
    });

    const totalDefs = catVerdicts.reduce((sum, cv) => sum + cv.defectCount, 0);
    const anyFail = catVerdicts.some((cv) => cv.result === 'FAIL') || failedDims > 0;
    const overall: 'PASS' | 'FAIL' = anyFail ? 'FAIL' : 'PASS';

    return {
      overallVerdict: overall,
      categoryVerdicts: catVerdicts,
      totalDefects: totalDefs,
      failedDimensions: failedDims,
    };
  }, [inspectionData, aqlCategories, defectDefinitions, sampleSize]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addToast('success', `Inspection ${inspectionData?.fullSystemLotNo ?? ''} submitted successfully.`);
    onSubmit(retainContext);
  };

  return (
    <form id="wizard-step-form" onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Hero Verdict Banner — UI_DESIGN_SYSTEM.md §5.1 ──────────────────── */}
      <div className={`p-6 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm ${
        overallVerdict === 'PASS'
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-rose-500/10 border-rose-500/30'
      }`}>
        <div className="flex items-center gap-4">
          {overallVerdict === 'PASS' ? (
            <CheckCircle2 className="w-10 h-10 text-emerald-400 shrink-0" strokeWidth={2} />
          ) : (
            <XCircle className="w-10 h-10 text-rose-400 shrink-0" strokeWidth={2} />
          )}
          <div>
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
                : `LOT REJECTED — ${failedDimensions > 0 ? `${failedDimensions} Dimension Issue(s)` : ''} ${totalDefects > 0 ? `${totalDefects} Defect(s) Found` : ''}`.trim()}
            </p>
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
              { label: 'SAMPLE SIZE', value: `${sampleSize} Pcs (ISO Bracket: ${snapToIsoBracket(sampleSize)})` },
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
            <div className={`text-4xl font-mono font-bold mb-2 ${totalDefects > 0 ? 'text-rose-400' : 'text-primary'}`}>
              {totalDefects}
            </div>
            <span className="text-[10px] uppercase text-muted font-bold tracking-widest text-center">
              Total Defects<br />Recorded
            </span>
            <div className="w-full mt-6 flex items-center justify-between bg-canvas rounded-lg border border-gray-800 p-3 shadow-inner">
              <span className="text-xs text-muted font-bold uppercase tracking-wider">Verdict Impact</span>
              <span className={`text-lg font-mono font-bold ${totalDefects > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {totalDefects > 0 ? 'FAIL' : 'PASS'}
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
                <span className={`ml-auto text-xs font-mono font-bold ${cv.result === 'PASS' ? 'text-emerald-400' : cv.result === 'FAIL' ? 'text-rose-400' : 'text-gray-500'}`}>
                  {cv.result}
                </span>
                {cv.reason && (
                  <span className="text-[10px] text-rose-400/70 font-mono w-full pl-5">↳ {cv.reason}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Retain Context Toggle ──────────────── */}
      <div className="flex justify-end pt-6 border-t border-gray-800">
        <label
          className="h-10 w-full md:w-auto px-4 rounded-lg bg-surface border border-gray-800 flex items-center justify-center gap-3 cursor-pointer select-none hover:bg-surface-light transition-all"
          title="When enabled, Line, Shift, and Product Code are preserved for the next batch."
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

