/**
 * @file fixedDimensions.ts
 * @description Shared identity + display label for the always-visible
 * fixed-row dimensions (Glove Length, Palm Width, Glove Weight) —
 * previously defined only as local literals inside StepDimensions.tsx.
 * Pulled out here so a second consumer (ApprovalsQueue.tsx's amendment diff
 * modal, which needs to label `__fixed_length__`/`__fixed_palm__` keys
 * without re-deriving a `ProductDimensionDef`) can resolve the same names
 * from one source instead of duplicating the string literals.
 *
 * Per-product decimal precision (matrixEntry.lengthDecimals/palmWidthDecimals)
 * is NOT part of this — that's config-dependent and stays local to
 * StepDimensions.tsx, which is the only place it's needed.
 */

/** Sentinel ID for the always-visible fixed-row GLOVE LENGTH dimension. */
export const FIXED_DIM_LENGTH = '__fixed_length__';
/** Sentinel ID for the always-visible fixed-row PALM WIDTH dimension. */
export const FIXED_DIM_PALM = '__fixed_palm__';
/**
 * Sentinel ID for the GLOVE WEIGHT scalar value (Submission.gloveWeight) —
 * not a 5-slot measurement like the other two, so it never appears in a
 * `dimensions`/`dimensionStats` map. Exists here only so ApprovalsQueue.tsx's
 * amendment diff modal and StepReviewSubmit.tsx's failure combination can
 * refer to it by the same identity.
 */
export const FIXED_DIM_WEIGHT = '__fixed_weight__';

/** Display name for each fixed-row dimension id, keyed by sentinel ID. */
export const FIXED_DIMENSION_LABELS: Record<string, string> = {
  [FIXED_DIM_LENGTH]: 'GLOVE LENGTH',
  [FIXED_DIM_PALM]: 'PALM WIDTH',
  [FIXED_DIM_WEIGHT]: 'GLOVE WEIGHT',
};

/**
 * Client-side mirror of backend/src/engine/dimensionEvaluator.ts's
 * evaluateWeight() pass/fail check — same threshold formula (incl. the
 * `'MIN'` tolerance sentinel), applied to the single scalar `gloveWeight`
 * value instead of a 5-slot measurement. Always graded — Glove Weight has
 * no record-only mode, so there is no isGraded parameter here to skip.
 * Returns `true` when the value is out of spec.
 */
export function evaluateGloveWeightClient(
  gloveWeight: number,
  weightTarget: string | undefined,
  weightTolerance: string | undefined,
): boolean {
  const target = parseFloat(weightTarget ?? '0') || 0;
  const tolRaw = weightTolerance ?? '0';
  const isMin = tolRaw.toUpperCase() === 'MIN';
  const tolerance = isMin ? 0 : (parseFloat(tolRaw) || 0);
  const threshold = target > 0 ? target - tolerance : 0;
  const maxThreshold = target > 0 && tolerance > 0 && !isMin ? target + tolerance : Infinity;
  return gloveWeight < threshold || (!isMin && tolerance > 0 && gloveWeight > maxThreshold);
}
