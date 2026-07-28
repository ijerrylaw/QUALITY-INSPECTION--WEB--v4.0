/**
 * @file aqlEvaluator.ts
 * @description Native mathematical AQL engine for Quality Inspection v4.0.
 *
 * This module is the SOLE source of AQL evaluation logic for the v4.0 backend.
 * It is completely isolated from HTTP routes — no side effects, no I/O.
 *
 * Exports:
 *   - snapToBracket()        — ISO 2859-1 bracket smoothing
 *   - getAQLThresholds()     — O(1) Ac/Re lookup from ISO_2859_MATRIX
 *   - evaluateAQLVerdict()   — Master verdict engine consuming native Prisma types
 *
 * Level 1 System Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 * Level 2 Feature Spec: v4_optimized_blueprint.md & implementation_plan.md
 * Level 3 Global Context: V4_MASTER_BLUEPRINT.md § 5 (evaluation modes)
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

// Import native Prisma model types — these are the v4.0 source of truth
// per schema.prisma (AQLCategory.evaluationMode, DefectDefinition.currentClass)
import type { AQLCategory, DefectDefinition } from '../../generated/prisma/client';

export type { AQLThreshold, SampleSizeBracket };

// ─────────────────────────────────────────────────────────────────────────────
// BRACKET SMOOTHING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snaps any arbitrary operator sample size to the nearest valid ISO 2859-1 bracket:
 * [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500].
 *
 * On exact distance ties, chooses the larger bracket (conservative industry standard).
 *
 * @param n - Raw sample size recorded by operator.
 * @returns Nearest ISO 2859-1 SampleSizeBracket.
 */
export function snapToBracket(n: number): SampleSizeBracket {
  const rounded = Math.max(2, Math.round(n));
  return [...SAMPLE_SIZE_BRACKETS].reduce<SampleSizeBracket>((best, candidate) => {
    const distCandidate = Math.abs(candidate - rounded);
    const distBest = Math.abs(best - rounded);
    if (distCandidate < distBest || (distCandidate === distBest && candidate > best)) {
      return candidate;
    }
    return best;
  }, SAMPLE_SIZE_BRACKETS[0]);
}

/**
 * Normalises an AQL level string to match ISO_2859_MATRIX keys.
 * E.g., '1' -> '1.0', '4' -> '4.0', ' 2.5 ' -> '2.5'.
 */
function normaliseAQLKey(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}.0`;
  }
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────────────────
// AQL THRESHOLD LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Native O(1) ISO 2859-1 threshold lookup function.
 *
 * Evaluation Sequence:
 *  1. Zero-tolerance check (strings containing "AND", "Zero Tolerance", or "0") -> { ac: 0, re: 1 }
 *  2. Bracket smoothing for arbitrary sample size n -> snapped bracket
 *  3. O(1) Matrix Cell lookup from ISO_2859_MATRIX[bracket][normalisedAQL]
 *  4. Fallback to INDETERMINATE_THRESHOLD ({ ac: 0, re: 1 }) if cell undefined
 *
 * @param sampleSize - Operator recorded sample size.
 * @param aqlLevel - Target AQL level string (e.g., '0.65', '1.5', '2.5', 'AND (Zero Tolerance)').
 * @returns AQLThreshold { ac: number, re: number }
 */
export function getAQLThresholds(sampleSize: number, aqlLevel: string): AQLThreshold {
  if (!aqlLevel || isZeroToleranceAQL(aqlLevel)) {
    return ZERO_TOLERANCE_THRESHOLD;
  }

  const bracket = snapToBracket(sampleSize);
  const sizeRow = ISO_2859_MATRIX[String(bracket)];

  if (!sizeRow) {
    console.warn(`[getAQLThresholds] No matrix row for bracket=${bracket}. Fallback to INDETERMINATE.`);
    return INDETERMINATE_THRESHOLD;
  }

  const normalisedAQL = normaliseAQLKey(aqlLevel);
  const threshold = sizeRow[normalisedAQL];

  if (!threshold) {
    console.warn(
      `[getAQLThresholds] No threshold for bracket=${bracket}, aql="${normalisedAQL}". Fallback to INDETERMINATE.`
    );
    return INDETERMINATE_THRESHOLD;
  }

  return threshold;
}

// ─────────────────────────────────────────────────────────────────────────────
// VERDICT ENGINE — OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** A single defect that caused its category to fail. */
export interface FailingDefect {
  defectId: string;
  defectName: string;
  /** Recorded count (or qualitative state code for N/A mode). */
  count: number;
  /** The Ac/Re threshold that was exceeded. */
  threshold: AQLThreshold;
}

/** The per-category evaluation result — forms the audit trail. */
export interface CategoryResult {
  categoryId: string;
  categoryName: string;
  evaluationMode: 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';
  /** ISO 2859-1 threshold resolved for this category. */
  threshold: AQLThreshold;
  /** Sum of all defect counts in this category (or count of fail-state items for N/A). */
  totalCount: number;
  passed: boolean;
  /** Non-empty only when passed === false. Lists what caused the failure. */
  failingDefects: FailingDefect[];
}

/**
 * The strictly typed return value of evaluateAQLVerdict.
 * A single failing category fails the whole lot (verdict = 'FAILED').
 */
export interface VerdictResult {
  verdict: 'PASSED' | 'FAILED';
  /** Full per-category breakdown for the audit trail and the amendment workflow. */
  categoryResults: CategoryResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// VERDICT ENGINE — INPUT PARAMS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input parameters for evaluateAQLVerdict.
 * Uses native Prisma model types directly from generated/prisma so the engine
 * stays in lock-step with schema.prisma without a hand-rolled DTO layer.
 */
export interface EvaluateAQLVerdictParams {
  /** Operator-recorded sample size. Will be bracket-snapped internally. */
  sampleSize: number;
  /**
   * All AQL categories from the active InspectionProfile.
   * Source: prisma.inspectionProfile.findUnique({ include: { aqlCategories: true } })
   */
  categories: AQLCategory[];
  /**
   * All defect definitions from the active InspectionProfile.
   * Source: prisma.inspectionProfile.findUnique({ include: { defectDefinitions: true } })
   */
  defectDefinitions: DefectDefinition[];
  /**
   * Defect counts keyed by DefectDefinition.id (matches Submission.defects JSON field).
   *   - CUMULATIVE / GRANULAR modes: value = raw count of that defect found
   *   - N/A mode: value encodes qualitative state: 0 = not recorded, 1 = pass, 2 = fail
   */
  defectCounts: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER VERDICT FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Native v4.0 AQL verdict engine.
 *
 * Iterates every AQLCategory in the active InspectionProfile, resolves its
 * ISO 2859-1 threshold via getAQLThresholds(), and applies the category's
 * evaluationMode logic. A single failing category fails the whole lot.
 *
 * Evaluation Modes (per V4_MASTER_BLUEPRINT.md § 5):
 *
 *   CUMULATIVE — Sum all defect counts in the category.
 *                FAIL if sum > Ac (threshold.ac).
 *
 *   GRANULAR   — Check each defect type independently.
 *                FAIL if any single defect count > Ac.
 *
 *   N/A        — Qualitative / pass-fail items (not counted defects).
 *                defectCount[id] encodes: 0=not recorded, 1=pass, 2=fail.
 *                FAIL if any defect has state === 2.
 *
 *   ''         — Skip this category entirely (informational-only rows).
 *
 * This function is PURE — no I/O, no side effects. Persistence is handled
 * exclusively by the route layer (submissions.routes.ts).
 *
 * @param params - {@link EvaluateAQLVerdictParams} with native Prisma types.
 * @returns {@link VerdictResult} — strictly typed verdict + per-category audit trail.
 */
export function evaluateAQLVerdict(params: EvaluateAQLVerdictParams): VerdictResult {
  const { sampleSize, categories, defectDefinitions, defectCounts } = params;

  const categoryResults: CategoryResult[] = [];
  let overallPassed = true;

  for (const category of categories) {
    // Skip informational-only rows (empty evaluationMode)
    if (!category.evaluationMode) continue;

    // ── Resolve which defect definitions belong to this category ─────────────
    // DefectDefinition.currentClass stores the category's name string (the admin
    // UI uses the name as the FK key for display clarity, per schema.prisma comments).
    // We also accept the category.id (UUID) as a fallback for future-proofing.
    const categoryDefects = defectDefinitions.filter(
      (d) => d.currentClass === category.name || d.currentClass === category.id
    );

    // ── Obtain ISO 2859-1 Ac/Re threshold ────────────────────────────────────
    const threshold = getAQLThresholds(sampleSize, category.aqlLevel);

    // ── N/A MODE: Qualitative pass-fail (state-encoded values) ───────────────
    if (category.evaluationMode === 'N/A') {
      const failingDefects: FailingDefect[] = categoryDefects
        .filter((def) => (defectCounts[def.id] ?? 0) === 2) // state 2 = explicit fail
        .map((def) => ({
          defectId: def.id,
          defectName: def.name,
          count: defectCounts[def.id] ?? 0,
          threshold,
        }));

      const passed = failingDefects.length === 0;
      if (!passed) overallPassed = false;

      categoryResults.push({
        categoryId: category.id,
        categoryName: category.name,
        evaluationMode: 'N/A',
        threshold,
        totalCount: failingDefects.length,
        passed,
        failingDefects,
      });

    // ── CUMULATIVE MODE: Sum all defects, compare total against Ac ───────────
    } else if (category.evaluationMode === 'CUMULATIVE') {
      const total = categoryDefects.reduce(
        (sum, def) => sum + (defectCounts[def.id] ?? 0),
        0
      );
      const passed = total <= threshold.ac;
      if (!passed) overallPassed = false;

      categoryResults.push({
        categoryId: category.id,
        categoryName: category.name,
        evaluationMode: 'CUMULATIVE',
        threshold,
        totalCount: total,
        passed,
        failingDefects: passed
          ? []
          : [
              {
                defectId: `${category.id}__cumulative`,
                defectName: `${category.name} — cumulative total`,
                count: total,
                threshold,
              },
            ],
      });

    // ── GRANULAR MODE: Each defect type checked independently against Ac ─────
    } else if (category.evaluationMode === 'GRANULAR') {
      const failingDefects: FailingDefect[] = [];
      let totalCount = 0;

      for (const def of categoryDefects) {
        const count = defectCounts[def.id] ?? 0;
        totalCount += count;
        if (count > threshold.ac) {
          failingDefects.push({
            defectId: def.id,
            defectName: def.name,
            count,
            threshold,
          });
        }
      }

      const passed = failingDefects.length === 0;
      if (!passed) overallPassed = false;

      categoryResults.push({
        categoryId: category.id,
        categoryName: category.name,
        evaluationMode: 'GRANULAR',
        threshold,
        totalCount,
        passed,
        failingDefects,
      });
    }
  }

  return {
    verdict: overallPassed ? 'PASSED' : 'FAILED',
    categoryResults,
  };
}
