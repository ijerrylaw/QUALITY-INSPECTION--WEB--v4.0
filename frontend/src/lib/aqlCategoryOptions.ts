/**
 * @file aqlCategoryOptions.ts
 * @description Shared AQL-level / evaluation-mode option lists and the
 * auto-lock rules that bind them — the pieces QualityRules.tsx's inline
 * category editor and CategoryPickerModal.tsx (Stage 4b adoption) both need,
 * so the picker reuses the exact same selectors rather than rebuilding them.
 *
 * Extracted verbatim from QualityRules.tsx; no behaviour change. The values
 * and the RECORD ONLY -> '' contract are documented in
 * DATA_SCHEMAS_AND_TYPES.md §2 and backend/src/lib/categoryEvaluationMode.ts.
 */

// ISO 2859-1 AQL whitelist — ISO2859_MATH_ENGINE.md §1
export const ISO_WHITELIST = ['AND', '0.65', '1.0', '1.5', '2.5', '4.0', '6.5', 'PASS/FAIL', 'RECORD ONLY'];

// Evaluation Modes — DATA_SCHEMAS_AND_TYPES.md §2
export const EVAL_MODES: string[] = ['CUMULATIVE', 'GRANULAR'];

/**
 * Eval Mode auto-lock label for AQL Levels that force a non-editable Eval
 * Mode — null means the category's Eval Mode is freely editable. Mirrors
 * the dimension-level Graded/Record-only icon convention (Ruler/Eye,
 * ProductConfigAccordion.tsx) in its wording, kept visually distinct from
 * genuine 'N/A (Auto-Locked)' so a RECORD ONLY category never reads as a
 * qualitative one at a glance.
 */
export function getAutoLockLabel(aql: string): string | null {
  if (aql === 'PASS/FAIL') return 'N/A (Auto-Locked)';
  if (aql === 'RECORD ONLY') return 'RECORD ONLY (Locked)';
  return null;
}

/**
 * The actual evaluationMode value auto-lock writes for a given AQL Level —
 * mirrors updateCategoryForm()'s write-side logic. RECORD ONLY writes ''
 * (empty string), NOT 'N/A' — aqlEvaluator.ts's true-exclusion skip path
 * (`if (!category.evaluationMode) continue;`) only triggers on '', so this
 * is what actually excludes the category from verdict computation.
 * PASS/FAIL still writes 'N/A', which is evaluated (qualitative pass/fail),
 * not skipped. Returns null when the AQL Level doesn't auto-lock.
 */
export function getAutoLockValue(aql: string): string | null {
  if (aql === 'PASS/FAIL') return 'N/A';
  if (aql === 'RECORD ONLY') return '';
  return null;
}
