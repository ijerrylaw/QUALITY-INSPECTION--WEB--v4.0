/**
 * @file iso2859-matrix.ts
 * @description Immutable lookup constants for the ISO 2859-1:2005 AQL Sampling System.
 *
 * SOURCE:  ISO 2859-1:2005, Table II-A — Normal Inspection, Single Sampling Plans.
 *
 * DERIVATION METHOD:
 *   For each (sampleSize, aqlLevel) cell, the Acceptance Number (Ac) is the
 *   *smallest* value from the standard ISO Ac sequence that satisfies:
 *
 *     P(X ≤ Ac | Poisson(λ = n × AQL/100)) ≥ 0.95
 *
 *   This upholds the ISO design goal of ≤ 5% producer's risk at the stated
 *   AQL quality level. The Rejection Number (Re) is always Ac + 1.
 *
 *   Standard Ac sequence: 0, 1, 2, 3, 5, 7, 10, 14, 21, 30, 44
 *   (Note: the sequence skips 4, 6, 8, 9, etc. — this is per ISO 2859-1 design.)
 *
 * SPECIAL OVERRIDES (do NOT look up these in the matrix):
 *   - AQL strings containing "AND", "Zero Tolerance", or "0" → { ac: 0, re: 1 }
 *
 * KEY NAMING CONVENTION:
 *   - Sample sizes are stored as string keys (e.g., '125') to avoid
 *     JavaScript integer coercion edge cases.
 *   - AQL levels are stored as string keys matching exactly what is stored in
 *     the InspectionProfile.aqlCategories[].aqlLevel field (e.g., '0.65', '2.5').
 *
 * DO NOT MODIFY this file without cross-referencing against the official ISO
 * 2859-1:2005 standard document. All changes must be reviewed and approved.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** A single AQL threshold entry: accept if defects ≤ ac, reject if defects ≥ re. */
export interface AQLThreshold {
  /** Acceptance Number — accept the lot if total applicable defects ≤ ac. */
  readonly ac: number;
  /** Rejection Number — reject the lot if total applicable defects ≥ re. Always ac + 1. */
  readonly re: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPECIAL OVERRIDES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zero-tolerance threshold.
 * Used for any AQL category whose aqlLevel contains "AND", "Zero Tolerance",
 * or is explicitly set to "0". A single defect of this type rejects the lot.
 */
export const ZERO_TOLERANCE_THRESHOLD: Readonly<AQLThreshold> = {
  ac: 0,
  re: 1,
} as const;

/**
 * Sentinel value returned when a valid threshold cannot be determined
 * (e.g., sample size too small for the given AQL at a 95% confidence level).
 * The evaluation engine must treat this as a hard reject if encountered.
 */
export const INDETERMINATE_THRESHOLD: Readonly<AQLThreshold> = {
  ac: 0,
  re: 1,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// STANDARD ISO BRACKETS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The standard ISO 2859-1 single-sampling bracket sizes (Normal Inspection,
 * Code Letters A–N for Inspection Level II).
 * "Bracket Smoothing" snaps any arbitrary operator input to the nearest value
 * in this array before performing the matrix lookup.
 */
export const SAMPLE_SIZE_BRACKETS = [
  2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500,
] as const;

export type SampleSizeBracket = (typeof SAMPLE_SIZE_BRACKETS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED AQL LEVEL STRINGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The AQL level strings that this matrix supports.
 * These match the `aqlLevel` values stored in InspectionProfile.aqlCategories[].
 *
 * AQL levels outside this set (e.g., '0.25', '15', '25') would require
 * extending the matrix below.
 */
export const SUPPORTED_AQL_LEVELS = [
  '0.65',
  '1.0',
  '1.5',
  '2.5',
  '4.0',
  '6.5',
  '10',
] as const;

export type SupportedAQLLevel = (typeof SUPPORTED_AQL_LEVELS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// ISO 2859-1 TABLE II-A — NORMAL INSPECTION, SINGLE SAMPLING
// ─────────────────────────────────────────────────────────────────────────────
//
// Layout:  ISO_2859_MATRIX[sampleSize][aqlLevel] → { ac, re }
//
// Computed λ = n × (AQL/100). Min Ac from {0,1,2,3,5,7,10,14,21,30,44}
// satisfying P(X ≤ Ac | Poisson(λ)) ≥ 0.95.
//
// Approximate Pa at AQL is shown in comments for audit purposes.
//
//  AQL:      0.65    1.0     1.5     2.5     4.0     6.5     10
// ──────────────────────────────────────────────────────────────
//  n=2   │  0/1    0/1    0/1    0/1    1/2    1/2    1/2
//  n=3   │  0/1    0/1    0/1    1/2    1/2    1/2    1/2
//  n=5   │  0/1    0/1    1/2    1/2    1/2    1/2    2/3
//  n=8   │  1/2    1/2    1/2    1/2    1/2    2/3    2/3
//  n=13  │  1/2    1/2    1/2    1/2    2/3    3/4    3/4
//  n=20  │  1/2    1/2    1/2    2/3    2/3    3/4    5/6
//  n=32  │  1/2    1/2    2/3    2/3    3/4    5/6    7/8
//  n=50  │  1/2    2/3    2/3    3/4    5/6    7/8   10/11
//  n=80  │  2/3    2/3    3/4    5/6    7/8   10/11  14/15
//  n=125 │  2/3    3/4    5/6    7/8   10/11  14/15  21/22
//  n=200 │  3/4    5/6    7/8   10/11  14/15  21/22  30/31
//  n=315 │  5/6    7/8   10/11  14/15  21/22  30/31  44/45
//  n=500 │  7/8   10/11  14/15  21/22  30/31  44/45   —
// ──────────────────────────────────────────────────────────────

export const ISO_2859_MATRIX: Readonly<
  Record<string, Readonly<Record<string, Readonly<AQLThreshold>>>>
> = {
  // ── n = 2 (Code Letter A) ────────────────────────────────────────────────
  '2': {
    // λ=0.013, Pa(Ac=0)=98.7%
    '0.65': { ac: 0, re: 1 },
    // λ=0.020, Pa(Ac=0)=98.0%
    '1.0':  { ac: 0, re: 1 },
    // λ=0.030, Pa(Ac=0)=97.0%
    '1.5':  { ac: 0, re: 1 },
    // λ=0.050, Pa(Ac=0)=95.1%
    '2.5':  { ac: 0, re: 1 },
    // λ=0.080, Pa(Ac=0)=92.3% → Ac=1, Pa=99.7%
    '4.0':  { ac: 1, re: 2 },
    // λ=0.130, Pa(Ac=0)=87.8% → Ac=1, Pa=99.2%
    '6.5':  { ac: 1, re: 2 },
    // λ=0.200, Pa(Ac=0)=81.9% → Ac=1, Pa=98.2%
    '10':   { ac: 1, re: 2 },
  },

  // ── n = 3 (Code Letter B) ────────────────────────────────────────────────
  '3': {
    // λ=0.020, Pa(Ac=0)=98.1%
    '0.65': { ac: 0, re: 1 },
    // λ=0.030, Pa(Ac=0)=97.0%
    '1.0':  { ac: 0, re: 1 },
    // λ=0.045, Pa(Ac=0)=95.6%
    '1.5':  { ac: 0, re: 1 },
    // λ=0.075, Pa(Ac=0)=92.8% → Ac=1, Pa=99.8%
    '2.5':  { ac: 1, re: 2 },
    // λ=0.120, Pa(Ac=0)=88.7% → Ac=1, Pa=99.4%
    '4.0':  { ac: 1, re: 2 },
    // λ=0.195, Pa(Ac=0)=82.3% → Ac=1, Pa=98.3%
    '6.5':  { ac: 1, re: 2 },
    // λ=0.300, Pa(Ac=0)=74.1% → Ac=1, Pa=96.3%
    '10':   { ac: 1, re: 2 },
  },

  // ── n = 5 (Code Letter C) ────────────────────────────────────────────────
  '5': {
    // λ=0.033, Pa(Ac=0)=96.8%
    '0.65': { ac: 0, re: 1 },
    // λ=0.050, Pa(Ac=0)=95.1%
    '1.0':  { ac: 0, re: 1 },
    // λ=0.075, Pa(Ac=0)=92.8% → Ac=1, Pa=99.7%
    '1.5':  { ac: 1, re: 2 },
    // λ=0.125, Pa(Ac=0)=88.2% → Ac=1, Pa=99.2%
    '2.5':  { ac: 1, re: 2 },
    // λ=0.200, Pa(Ac=0)=81.9% → Ac=1, Pa=98.2%
    '4.0':  { ac: 1, re: 2 },
    // λ=0.325, Pa(Ac=0)=72.2% → Ac=1, Pa=95.7%
    '6.5':  { ac: 1, re: 2 },
    // λ=0.500, Pa(Ac=1)=91.0% → Ac=2, Pa=98.6%
    '10':   { ac: 2, re: 3 },
  },

  // ── n = 8 (Code Letter D) ────────────────────────────────────────────────
  '8': {
    // λ=0.052, Pa(Ac=0)=94.9% → Ac=1 (just below threshold → use Ac=1), Pa=99.8%
    '0.65': { ac: 1, re: 2 },
    // λ=0.080, Pa(Ac=0)=92.3% → Ac=1, Pa=99.7%
    '1.0':  { ac: 1, re: 2 },
    // λ=0.120, Pa(Ac=0)=88.7% → Ac=1, Pa=99.4%
    '1.5':  { ac: 1, re: 2 },
    // λ=0.200, Pa(Ac=0)=81.9% → Ac=1, Pa=98.2%
    '2.5':  { ac: 1, re: 2 },
    // λ=0.320, Pa(Ac=0)=72.6% → Ac=1, Pa=95.9%
    '4.0':  { ac: 1, re: 2 },
    // λ=0.520, Pa(Ac=1)=90.4% → Ac=2, Pa=98.4%
    '6.5':  { ac: 2, re: 3 },
    // λ=0.800, Pa(Ac=1)=80.9% → Ac=2, Pa=95.3%
    '10':   { ac: 2, re: 3 },
  },

  // ── n = 13 (Code Letter E) ───────────────────────────────────────────────
  '13': {
    // λ=0.085, Pa(Ac=1)=99.7%
    '0.65': { ac: 1, re: 2 },
    // λ=0.130, Pa(Ac=1)=99.2%
    '1.0':  { ac: 1, re: 2 },
    // λ=0.195, Pa(Ac=1)=98.3%
    '1.5':  { ac: 1, re: 2 },
    // λ=0.325, Pa(Ac=1)=95.7%
    '2.5':  { ac: 1, re: 2 },
    // λ=0.520, Pa(Ac=1)=90.4% → Ac=2, Pa=98.4%
    '4.0':  { ac: 2, re: 3 },
    // λ=0.845, Pa(Ac=2)=94.6% → Ac=3, Pa=98.9%
    '6.5':  { ac: 3, re: 4 },
    // λ=1.300, Pa(Ac=3)=95.7%
    '10':   { ac: 3, re: 4 },
  },

  // ── n = 20 (Code Letter F) ───────────────────────────────────────────────
  '20': {
    // λ=0.130, Pa(Ac=1)=99.2%
    '0.65': { ac: 1, re: 2 },
    // λ=0.200, Pa(Ac=1)=98.2%
    '1.0':  { ac: 1, re: 2 },
    // λ=0.300, Pa(Ac=1)=96.3%
    '1.5':  { ac: 1, re: 2 },
    // λ=0.500, Pa(Ac=1)=91.0% → Ac=2, Pa=98.6%
    '2.5':  { ac: 2, re: 3 },
    // λ=0.800, Pa(Ac=2)=95.3%
    '4.0':  { ac: 2, re: 3 },
    // λ=1.300, Pa(Ac=3)=95.7%
    '6.5':  { ac: 3, re: 4 },
    // λ=2.000, Pa(Ac=3)=85.7% → Ac=5, Pa=98.3%
    '10':   { ac: 5, re: 6 },
  },

  // ── n = 32 (Code Letter G) ───────────────────────────────────────────────
  '32': {
    // λ=0.208, Pa(Ac=1)=98.1%
    '0.65': { ac: 1, re: 2 },
    // λ=0.320, Pa(Ac=1)=95.8%
    '1.0':  { ac: 1, re: 2 },
    // λ=0.480, Pa(Ac=1)=91.6% → Ac=2, Pa=98.7%
    '1.5':  { ac: 2, re: 3 },
    // λ=0.800, Pa(Ac=2)=95.3%
    '2.5':  { ac: 2, re: 3 },
    // λ=1.280, Pa(Ac=2)=86.2% → Ac=3, Pa=95.9%
    '4.0':  { ac: 3, re: 4 },
    // λ=2.080, Pa(Ac=3)=84.1% → Ac=5, Pa=97.8%
    '6.5':  { ac: 5, re: 6 },
    // λ=3.200, Pa(Ac=5)=89.5% → Ac=7, Pa=98.3%
    '10':   { ac: 7, re: 8 },
  },

  // ── n = 50 (Code Letter H) ───────────────────────────────────────────────
  '50': {
    // λ=0.325, Pa(Ac=1)=95.7%
    '0.65': { ac: 1, re: 2 },
    // λ=0.500, Pa(Ac=1)=91.0% → Ac=2, Pa=98.6%
    '1.0':  { ac: 2, re: 3 },
    // λ=0.750, Pa(Ac=2)=95.9%
    '1.5':  { ac: 2, re: 3 },
    // λ=1.250, Pa(Ac=2)=86.9% → Ac=3, Pa=96.2%
    '2.5':  { ac: 3, re: 4 },
    // λ=2.000, Pa(Ac=3)=85.7% → Ac=5, Pa=98.3%
    '4.0':  { ac: 5, re: 6 },
    // λ=3.250, Pa(Ac=5)=89.2% → Ac=7, Pa=98.5%
    '6.5':  { ac: 7, re: 8 },
    // λ=5.000, Pa(Ac=7)=86.7% → Ac=10, Pa=98.6%
    '10':   { ac: 10, re: 11 },
  },

  // ── n = 80 (Code Letter J) ───────────────────────────────────────────────
  '80': {
    // λ=0.520, Pa(Ac=1)=90.4% → Ac=2, Pa=98.4%
    '0.65': { ac: 2, re: 3 },
    // λ=0.800, Pa(Ac=2)=95.3%
    '1.0':  { ac: 2, re: 3 },
    // λ=1.200, Pa(Ac=2)=87.9% → Ac=3, Pa=96.6%
    '1.5':  { ac: 3, re: 4 },
    // λ=2.000, Pa(Ac=3)=85.7% → Ac=5, Pa=98.3%
    '2.5':  { ac: 5, re: 6 },
    // λ=3.200, Pa(Ac=5)=89.5% → Ac=7, Pa=98.3%
    '4.0':  { ac: 7, re: 8 },
    // λ=5.200, Pa(Ac=7)=82.7% → Ac=10, Pa=98.5%
    '6.5':  { ac: 10, re: 11 },
    // λ=8.000, Pa(Ac=10)=81.6% → Ac=14, Pa=98.3%
    '10':   { ac: 14, re: 15 },
  },

  // ── n = 125 (Code Letter K) ──────────────────────────────────────────────
  '125': {
    // λ=0.813, Pa(Ac=2)=95.2%
    '0.65': { ac: 2, re: 3 },
    // λ=1.250, Pa(Ac=3)=96.2%
    '1.0':  { ac: 3, re: 4 },
    // λ=1.875, Pa(Ac=3)=87.9% → Ac=5, Pa=98.8%
    '1.5':  { ac: 5, re: 6 },
    // λ=3.125, Pa(Ac=5)=90.4% → Ac=7, Pa=98.6%
    '2.5':  { ac: 7, re: 8 },
    // λ=5.000, Pa(Ac=7)=86.7% → Ac=10, Pa=98.6%
    '4.0':  { ac: 10, re: 11 },
    // λ=8.125, Pa(Ac=10)=81.5% → Ac=14, Pa=98.3%
    '6.5':  { ac: 14, re: 15 },
    // λ=12.500, Pa(Ac=14)=86.7% → Ac=21, Pa=99.2%
    '10':   { ac: 21, re: 22 },
  },

  // ── n = 200 (Code Letter L) ──────────────────────────────────────────────
  '200': {
    // λ=1.300, Pa(Ac=3)=95.7%
    '0.65': { ac: 3, re: 4 },
    // λ=2.000, Pa(Ac=3)=85.7% → Ac=5, Pa=98.3%
    '1.0':  { ac: 5, re: 6 },
    // λ=3.000, Pa(Ac=5)=91.6% → Ac=7, Pa=98.8%
    '1.5':  { ac: 7, re: 8 },
    // λ=5.000, Pa(Ac=7)=86.7% → Ac=10, Pa=98.6%
    '2.5':  { ac: 10, re: 11 },
    // λ=8.000, Pa(Ac=10)=81.6% → Ac=14, Pa=98.3%
    '4.0':  { ac: 14, re: 15 },
    // λ=13.000, Pa(Ac=14)=86.0% → Ac=21, Pa=98.7%
    '6.5':  { ac: 21, re: 22 },
    // λ=20.000, Pa(Ac=21)=59.0% → Ac=30, Pa=98.8%
    '10':   { ac: 30, re: 31 },
  },

  // ── n = 315 (Code Letter M) ──────────────────────────────────────────────
  '315': {
    // λ=2.048, Pa(Ac=3)=84.8% → Ac=5, Pa=98.1%
    '0.65': { ac: 5, re: 6 },
    // λ=3.150, Pa(Ac=5)=90.1% → Ac=7, Pa=98.6%
    '1.0':  { ac: 7, re: 8 },
    // λ=4.725, Pa(Ac=7)=89.2% → Ac=10, Pa=98.9%
    '1.5':  { ac: 10, re: 11 },
    // λ=7.875, Pa(Ac=10)=83.3% → Ac=14, Pa=98.2%
    '2.5':  { ac: 14, re: 15 },
    // λ=12.600, Pa(Ac=14)=85.5% → Ac=21, Pa=98.9%
    '4.0':  { ac: 21, re: 22 },
    // λ=20.475, Pa(Ac=21)=55.8% → Ac=30, Pa=98.8%
    '6.5':  { ac: 30, re: 31 },
    // λ=31.500, Pa(Ac=30)=43.7% → Ac=44, Pa=99.0%
    '10':   { ac: 44, re: 45 },
  },

  // ── n = 500 (Code Letter N) ──────────────────────────────────────────────
  '500': {
    // λ=3.250, Pa(Ac=5)=89.2% → Ac=7, Pa=98.5%
    '0.65': { ac: 7, re: 8 },
    // λ=5.000, Pa(Ac=7)=86.7% → Ac=10, Pa=98.6%
    '1.0':  { ac: 10, re: 11 },
    // λ=7.500, Pa(Ac=10)=86.2% → Ac=14, Pa=98.5%
    '1.5':  { ac: 14, re: 15 },
    // λ=12.500, Pa(Ac=14)=86.7% → Ac=21, Pa=99.2%
    '2.5':  { ac: 21, re: 22 },
    // λ=20.000, Pa(Ac=21)=59.0% → Ac=30, Pa=98.8%
    '4.0':  { ac: 30, re: 31 },
    // λ=32.500, Pa(Ac=30)=42.7% → Ac=44, Pa=99.0%
    '6.5':  { ac: 44, re: 45 },
    // λ=50.000 — exceeds practical single-sampling scope; use reduced inspection
    // or consult ISO 2859-3 for skip-lot plans.
    '10':   { ac: 44, re: 45 }, // Conservative carry-over of n=315 value
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// AQL LEVEL SPECIAL-CASE DETECTION UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AQL string patterns that trigger zero-tolerance override regardless of
 * sample size. These are checked by getAQLThresholds() before any matrix
 * lookup is performed.
 */
export const ZERO_TOLERANCE_AQL_PATTERNS: readonly RegExp[] = [
  /and/i,               // "AND (Zero Tolerance)"
  /zero.?tolerance/i,   // "Zero Tolerance"
  /^0$/,                // Literal "0"
] as const;

/**
 * Returns true if the given AQL level string should be treated as zero
 * tolerance (i.e., any single defect immediately rejects the lot).
 */
export function isZeroToleranceAQL(aqlLevel: string): boolean {
  return ZERO_TOLERANCE_AQL_PATTERNS.some((pattern) => pattern.test(aqlLevel));
}
