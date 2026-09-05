/**
 * @file RecomputedVerdictSummary.tsx
 * @description Ground-truth "what this amendment would actually grade as if
 * approved" panel for ApprovalsQueue.tsx's diff modal.
 *
 * `AmendmentLog.recomputedVerdict`/`recomputedCategoryResults` are computed
 * server-side at DRAFT time (`POST /:id/amendments` calls `resolveVerdict()`
 * in preview mode, API_AND_INTEGRATION_SPEC.md) and overwritten authoritatively
 * at approval time — but until now, nothing in the frontend rendered them
 * (AUDIT_REPORT.md #42, found via the real cross-profile amendment on lot
 * A001A6247003: switching FACTORY STANDARD -> MEDLINE silently flipped its
 * BARRIER category from PASS to FAIL, with zero visibility anywhere in the
 * reviewer UI). This panel is the fix for that half of #42 — the AUTHORITATIVE
 * answer, independent of the category-aware diff rebuild in
 * AmendmentDiffView.tsx (which explains WHAT changed and WHY; this says WHAT
 * WOULD HAPPEN). Shown alongside the diff, not instead of it.
 *
 * `evaluationMode` here is always 'CUMULATIVE' | 'GRANULAR' | 'N/A' — never
 * '' (RECORD ONLY): aqlEvaluator.ts's `evaluateAQLVerdict()` skips
 * evaluationMode==='' categories before ever pushing a CategoryResult for
 * them (`if (!category.evaluationMode) continue;`), so a RECORD ONLY
 * category structurally cannot appear in this array — no aqlLevel-aware
 * RECORD ONLY label mapping is needed here (contrast
 * `formatEvalModeForDisplay` in amendmentDiffLabels.ts, which does need it).
 */

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface RecomputedCategoryResult {
  categoryId: string;
  categoryName: string;
  evaluationMode: string;
  threshold: { ac: number; re: number } | null;
  totalCount: number;
  passed: boolean;
}

export interface RecomputedVerdictLog {
  recomputedVerdict: 'PASSED' | 'FAILED' | null;
  recomputedCategoryResults: string | null;
  recomputedFailedDimensions: number | null;
}

function parseCategoryResults(raw: string | null): RecomputedCategoryResult[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecomputedCategoryResult[]) : [];
  } catch {
    return [];
  }
}

export function RecomputedVerdictSummary({ log }: { log: RecomputedVerdictLog }) {
  if (!log.recomputedVerdict) {
    return (
      <div className="p-3 rounded-lg border border-l-4 bg-amber-500/5 border-amber-500/30 border-l-amber-500 text-amber-400 flex gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
        <p className="text-xs text-amber-400/90">
          The server could not compute a recomputed-verdict preview for this amendment at draft time
          (its inspection profile or product configuration could not be resolved). The diff below is
          the only preview available — approval will attempt the recompute again and may still fail.
        </p>
      </div>
    );
  }

  const categoryResults = parseCategoryResults(log.recomputedCategoryResults);
  const passed = log.recomputedVerdict === 'PASSED';
  const failedDimensions = log.recomputedFailedDimensions ?? 0;

  return (
    <div className="p-4 border border-gray-700 bg-canvas/40 rounded-lg space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-xs font-bold text-brand-secondary uppercase tracking-widest">
          Recomputed Verdict — If Approved
        </h4>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
            passed
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {passed ? (
            <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
          ) : (
            <XCircle className="w-3 h-3" strokeWidth={2.5} />
          )}
          {log.recomputedVerdict}
        </span>
      </div>

      {categoryResults.length > 0 && (
        <div className="divide-y divide-gray-800/60 border border-gray-800 rounded-lg overflow-hidden">
          {categoryResults.map((cat) => (
            <div key={cat.categoryId} className="flex items-center justify-between py-2 px-3 text-xs gap-3">
              <span className="font-mono text-primary truncate">
                {cat.categoryName}
                <span className="ml-2 text-[10px] text-muted uppercase">{cat.evaluationMode}</span>
              </span>
              <span
                className={`font-mono font-semibold shrink-0 ${cat.passed ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                {cat.totalCount}
                {cat.threshold ? ` / ${cat.threshold.ac}` : ''} — {cat.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))}
        </div>
      )}

      {failedDimensions > 0 && (
        <p className="text-[10px] text-amber-400/90">
          {failedDimensions} physical dimension{failedDimensions === 1 ? '' : 's'} would also be out of spec.
        </p>
      )}
    </div>
  );
}
