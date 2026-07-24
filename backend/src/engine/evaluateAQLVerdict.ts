/**
 * @file evaluateAQLVerdict.ts
 * @description Core AQL verdict engine — translates defect counts into a
 * PASSED / FAILED decision per ISO 2859-1 sampling rules.
 *
 * Three evaluation modes (from V4_MASTER_BLUEPRINT.md § 5):
 *
 *  CUMULATIVE — All defect counts within a category are summed.
 *               Lot FAILS if sum > Ac.
 *
 *  GRANULAR   — Each individual defect type is checked independently.
 *               Lot FAILS if any single defect type count > Ac.
 *
 *  N/A        — Qualitative / pass-fail items (not counted defects).
 *               Defect count values encode state:
 *                 0 = not recorded, 1 = pass, 2 = fail
 *               Lot FAILS if any defect has state === 2.
 *
 * This function is PURE — it has no side effects, performs no I/O, and
 * does not write to the database. Persistence is handled by the route layer.
 */

import { getAQLThresholds } from './getAQLThresholds';
import type { AQLThreshold } from './iso2859-matrix';

// ─────────────────────────────────────────────────────────────────────────────
// INPUT / OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors InspectionProfile.aqlCategories[] from the blueprint. */
export interface AQLCategoryInput {
  id: string;
  name: string;
  /** ISO AQL level string stored in DB, e.g. '0.65', '2.5', 'AND (Zero Tolerance)' */
  aqlLevel: string;
  /** How defects in this category are evaluated. Empty string = skip. */
  evaluationMode: 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';
}

/** Mirrors InspectionProfile.defectDefinitions[] from the blueprint. */
export interface DefectDefinitionInput {
  id: string;
  name: string;
  /**
   * Links this defect to its parent AQLCategory.
   * Must match either AQLCategory.id (UUID) or AQLCategory.name (label string).
   * The engine checks both to support either storage convention.
   */
  currentClass: string;
}

/** A single defect that caused a category to fail. */
export interface FailingDefect {
  defectId: string;
  defectName: string;
  /** The recorded count (or qualitative state) for this defect. */
  count: number;
  /** The threshold that was exceeded. */
  threshold: AQLThreshold;
}

/** The result for one AQL category after evaluation. */
export interface CategoryResult {
  categoryId: string;
  categoryName: string;
  evaluationMode: 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';
  /** The Ac/Re threshold looked up from ISO_2859_MATRIX. */
  threshold: AQLThreshold;
  /** Sum of all defect counts in this category (or count of fail-state items for N/A). */
  totalCount: number;
  passed: boolean;
  /** Non-empty only when passed === false. Lists what specifically caused the failure. */
  failingDefects: FailingDefect[];
}

/** The final output of evaluateAQLVerdict. */
export interface VerdictResult {
  verdict: 'PASSED' | 'FAILED';
  /** Per-category breakdown for audit trail and frontend display. */
  categoryResults: CategoryResult[];
}

/** Parameters accepted by evaluateAQLVerdict. */
export interface EvaluateAQLVerdictParams {
  /** The operator-recorded sample size (will be bracket-snapped internally). */
  sampleSize: number;
  /** All AQL categories from the active InspectionProfile. */
  categories: AQLCategoryInput[];
  /** All defect definitions from the active InspectionProfile. */
  defectDefinitions: DefectDefinitionInput[];
  /**
   * Defect counts keyed by DefectDefinition.id.
   * For N/A-mode categories, values encode state: 0=not recorded, 1=pass, 2=fail.
   */
  defectCounts: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EVALUATION FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates a PASS/FAIL verdict for a single AQL inspection session.
 *
 * The function iterates every AQLCategory in the active InspectionProfile,
 * looks up the appropriate threshold from ISO 2859-1, and applies the
 * category's evaluationMode logic. A single failing category fails the whole lot.
 *
 * @returns VerdictResult — verdict + per-category audit breakdown.
 */
export function evaluateAQLVerdict(params: EvaluateAQLVerdictParams): VerdictResult {
  const { sampleSize, categories, defectDefinitions, defectCounts } = params;

  const categoryResults: CategoryResult[] = [];
  let overallPassed = true;

  for (const category of categories) {
    // Skip categories with no evaluation mode (e.g. informational-only rows)
    if (!category.evaluationMode) continue;

    // ── Resolve which defect definitions belong to this category ─────────────
    // The currentClass field may store the category's id (UUID) or name string —
    // we accept both to remain flexible across config conventions.
    const categoryDefects = defectDefinitions.filter(
      (d) => d.currentClass === category.id || d.currentClass === category.name
    );

    // ── Obtain threshold from ISO 2859-1 ─────────────────────────────────────
    const threshold = getAQLThresholds(sampleSize, category.aqlLevel);

    // ── Apply evaluation logic ────────────────────────────────────────────────

    if (category.evaluationMode === 'N/A') {
      // Qualitative mode — check for any defect in "fail" state (value === 2)
      const failingDefects: FailingDefect[] = categoryDefects
        .filter((def) => (defectCounts[def.id] ?? 0) === 2)
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

    } else if (category.evaluationMode === 'CUMULATIVE') {
      // Sum all defect counts in this category, compare against Ac
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

    } else if (category.evaluationMode === 'GRANULAR') {
      // Each individual defect type is compared against Ac independently
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
