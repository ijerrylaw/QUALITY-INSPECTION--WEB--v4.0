/**
 * @file getAQLThresholds.ts
 * @description Bracket-smoothing + ISO 2859-1 matrix lookup utility.
 *
 * This is the only entry point the verdict engine should use to obtain
 * Acceptance / Rejection thresholds. It handles all three cases:
 *   1. Zero-tolerance AQL strings → immediate {ac:0, re:1}
 *   2. Arbitrary sample sizes     → snapped to nearest ISO bracket
 *   3. Standard lookup            → ISO_2859_MATRIX[bracket][aqlLevel]
 */

import {
  AQLThreshold,
  INDETERMINATE_THRESHOLD,
  ISO_2859_MATRIX,
  SAMPLE_SIZE_BRACKETS,
  SampleSizeBracket,
  ZERO_TOLERANCE_THRESHOLD,
  isZeroToleranceAQL,
} from './iso2859-matrix';

export type { AQLThreshold };

// ─────────────────────────────────────────────────────────────────────────────
// BRACKET SMOOTHING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snaps any arbitrary sample size to the nearest value in the standard
 * ISO 2859-1 bracket list: [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500].
 *
 * Ties (equal distance to two brackets) are resolved by choosing the
 * larger bracket — a conservative, industry-standard choice.
 *
 * @example snapToBracket(100)  → 80  (|100-80|=20 vs |100-125|=25 → 80 wins)
 * @example snapToBracket(200)  → 200 (exact match)
 * @example snapToBracket(160)  → 125 (|160-125|=35 vs |160-200|=40 → 125 wins)
 */
export function snapToBracket(n: number): SampleSizeBracket {
  return [...SAMPLE_SIZE_BRACKETS].reduce<SampleSizeBracket>((best, candidate) => {
    const distCandidate = Math.abs(candidate - n);
    const distBest = Math.abs(best - n);
    // On exact tie, prefer the larger bracket (conservative)
    if (distCandidate < distBest || (distCandidate === distBest && candidate > best)) {
      return candidate;
    }
    return best;
  }, SAMPLE_SIZE_BRACKETS[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the ISO 2859-1 Acceptance (ac) and Rejection (re) numbers for a
 * given sample size and AQL level string.
 *
 * Lookup order:
 *   1. Zero-tolerance override (AQL strings like "AND", "Zero Tolerance", "0")
 *   2. Bracket smoothing (arbitrary n → nearest ISO bracket)
 *   3. Matrix cell lookup (ISO_2859_MATRIX[bracket][aqlLevel])
 *   4. INDETERMINATE_THRESHOLD as a safe fallback (treated as zero-tolerance
 *      by the evaluation engine — conservative behaviour)
 *
 * @param sampleSize - Raw sample size recorded by the operator.
 * @param aqlLevel   - AQL level string from InspectionProfile.aqlCategories[].aqlLevel
 *                     (e.g. '0.65', '2.5', 'AND (Zero Tolerance)').
 */
export function getAQLThresholds(sampleSize: number, aqlLevel: string): AQLThreshold {
  // ── Step 1: Zero-tolerance special override ───────────────────────────────
  if (isZeroToleranceAQL(aqlLevel.trim())) {
    return ZERO_TOLERANCE_THRESHOLD;
  }

  // ── Step 2: Bracket smoothing ─────────────────────────────────────────────
  const bracket = snapToBracket(Math.max(2, Math.round(sampleSize)));

  // ── Step 3: Matrix cell lookup ────────────────────────────────────────────
  const sizeRow = ISO_2859_MATRIX[String(bracket)];
  if (!sizeRow) {
    console.warn(`[getAQLThresholds] No matrix row for bracket=${bracket}. Returning INDETERMINATE.`);
    return INDETERMINATE_THRESHOLD;
  }

  // Normalise AQL string: strip surrounding whitespace, accept '1' as '1.0'
  const normalisedAQL = normaliseAQLKey(aqlLevel);
  const threshold = sizeRow[normalisedAQL];

  if (!threshold) {
    console.warn(
      `[getAQLThresholds] No threshold for bracket=${bracket}, aql="${normalisedAQL}". Returning INDETERMINATE.`
    );
    return INDETERMINATE_THRESHOLD;
  }

  return threshold;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalises an AQL level string so it matches the keys stored in
 * ISO_2859_MATRIX ('0.65', '1.0', '1.5', '2.5', '4.0', '6.5', '10').
 *
 * Handles edge cases such as:
 *   - '1'   → '1.0'
 *   - '4'   → '4.0'
 *   - ' 2.5 ' → '2.5'
 */
function normaliseAQLKey(raw: string): string {
  const trimmed = raw.trim();
  // If it parses as a plain integer with no decimal, append '.0'
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}.0`;
  }
  return trimmed;
}
