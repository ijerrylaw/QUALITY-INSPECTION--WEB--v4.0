/**
 * @file fixedDimensions.ts
 * @description Shared identity + display label for the two always-visible
 * fixed-row dimensions (Glove Length, Palm Width) — previously defined only
 * as local literals inside StepDimensions.tsx. Pulled out here so a second
 * consumer (ApprovalsQueue.tsx's amendment diff modal, which needs to label
 * `__fixed_length__`/`__fixed_palm__` keys without re-deriving a
 * `ProductDimensionDef`) can resolve the same names from one source instead
 * of duplicating the string literals.
 *
 * Per-product decimal precision (matrixEntry.lengthDecimals/palmWidthDecimals)
 * is NOT part of this — that's config-dependent and stays local to
 * StepDimensions.tsx, which is the only place it's needed.
 */

/** Sentinel ID for the always-visible fixed-row GLOVE LENGTH dimension. */
export const FIXED_DIM_LENGTH = '__fixed_length__';
/** Sentinel ID for the always-visible fixed-row PALM WIDTH dimension. */
export const FIXED_DIM_PALM = '__fixed_palm__';

/** Display name for each fixed-row dimension id, keyed by sentinel ID. */
export const FIXED_DIMENSION_LABELS: Record<string, string> = {
  [FIXED_DIM_LENGTH]: 'GLOVE LENGTH',
  [FIXED_DIM_PALM]: 'PALM WIDTH',
};
