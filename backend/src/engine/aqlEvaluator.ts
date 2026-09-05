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
  ACHIEVABLE_AQL_LEVELS,
  AQLThreshold,
  AchievableAQLLevel,
  INDETERMINATE_THRESHOLD,
  ISO_2859_MATRIX,
  SAMPLE_SIZE_BRACKETS,
  SampleSizeBracket,
  SupportedAQLLevel,
  ZERO_TOLERANCE_THRESHOLD,
  isZeroToleranceAQL,
} from './iso2859-matrix';

/**
 * AQLCategory / DefectDefinition — the engine's own input shape.
 *
 * These are populated from the global Category Inventory and Master Defect
 * List (Category / Defect / ProfileCategory / ProfileCategoryDefect) by
 * engine/profileRules.ts's loadProfileRulesMap(), which resolves a profile's
 * category selection, per-profile AQL levels, and defect membership. Before
 * Stage 2 they were normalized out of the AppConfig.inspectionProfiles JSON
 * blob instead (via a since-removed resolveVerdict.ts helper); that column is
 * no longer read by anything as of Stage A. See DATA_SCHEMAS_AND_TYPES.md §2.2.
 *
 * `evaluationMode` here is always the ENGINE dialect ('CUMULATIVE' |
 * 'GRANULAR' | 'N/A' | ''), never the Category table's clean enum. The
 * translation happens once, in profileRules.ts, via
 * lib/categoryEvaluationMode.ts — never re-derive it.
 */
export interface AQLCategory {
  id: string;
  name: string;
  aqlLevel: string;
  evaluationMode: string;
}

export interface DefectDefinition {
  id: string;
  name: string;
  /**
   * The id of the AQLCategory this defect is graded under — a strict id link.
   *
   * Stage 2 note: this replaced a `currentClass` field that was matched against
   * `category.name || category.id`, a name-OR-id join inherited from the era
   * when the admin UI used category NAMES as the linking key. That fallback was
   * dead in practice (every stored defect linked by id, and the zero-state seed's
   * category ids are identical to their names, so both arms agreed) but it was
   * a live hazard: the engine would happily grade a defect linked by name while
   * both the wizard and the admin UI — which have always matched on id only —
   * rendered the category empty. Now that categories have real global ids, the
   * link is unambiguous and the two arms cannot disagree.
   */
  categoryId: string;
}

export type { AQLThreshold, SampleSizeBracket, SupportedAQLLevel, AchievableAQLLevel };

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

  // Exact matrix key first, then the padded form. Order matters: '10' IS a real
  // matrix key, but normaliseAQLKey() pads any all-digit string to '10.0', which is
  // NOT — so a normalise-first lookup silently missed the whole AQL 10 column and
  // fell through to INDETERMINATE ({ac:0}), i.e. graded AQL 10 as zero tolerance.
  // Unreachable via the admin UI (QualityRules.tsx's ISO_WHITELIST stops at '6.5'),
  // so no stored submission is affected, but it was reachable by direct API call and
  // is now reachable internally by findActualAqlAchieved()'s ladder scan.
  // See AUDIT_REPORT.md.
  const normalisedAQL = normaliseAQLKey(aqlLevel);
  const threshold = sizeRow[aqlLevel.trim()] ?? sizeRow[normalisedAQL];

  if (!threshold) {
    console.warn(
      `[getAQLThresholds] No threshold for bracket=${bracket}, aql="${normalisedAQL}". Fallback to INDETERMINATE.`
    );
    return INDETERMINATE_THRESHOLD;
  }

  return threshold;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTUAL AQL ACHIEVED
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which of the three possible outcomes a category's Actual AQL computation landed on.
 *
 *   ACHIEVED    — the observed count still satisfies at least one standard AQL level.
 *   EXCEEDS_ALL — the observed count busts even the loosest achievable level
 *                 ('6.5' — see ACHIEVABLE_AQL_LEVELS). An explicit hard-fail
 *                 state, deliberately NOT null/blank, so a catastrophic
 *                 category is visibly distinct from "not computed".
 *   QUALITATIVE — an N/A-mode (PASS/FAIL) category. Its `defectCounts` values are
 *                 state codes (0=unrecorded, 1=pass, 2=fail), not defect counts
 *                 (ISO2859_MATH_ENGINE.md §2), so there is no count to run the
 *                 ladder against. Recorded as an explicit state rather than a
 *                 fabricated AQL level derived from a state code.
 */
export type ActualAqlStatus = 'ACHIEVED' | 'EXCEEDS_ALL' | 'QUALITATIVE';

/**
 * "Actual AQL Achieved" — the TIGHTEST (lowest) standard ISO 2859-1 AQL level whose
 * Ac/Re threshold the observed defect count still satisfies, at the SAME sample size
 * already applied to that category's assigned-AQL verdict.
 *
 * Independent of the assigned AQL: a category assigned 'AND' (zero tolerance) that
 * recorded 1 defect FAILS its own verdict, yet may still report a tight Actual AQL —
 * that is the point of the metric. It answers "what quality level did this lot
 * actually demonstrate", not "did it pass".
 *
 * Computed once at submission time and frozen into Submission.gradingSnapshot. Never
 * recomputed live, and never changes if Product Engine or Inspection Profile config
 * changes later — same rule as all other frozen grading snapshot data.
 */
export interface ActualAqlAchieved {
  status: ActualAqlStatus;
  /**
   * The achieved level ('0.65'…'6.5' — see ACHIEVABLE_AQL_LEVELS). Null for
   * EXCEEDS_ALL and QUALITATIVE.
   *
   * '0.65' is the tightest level the table carries, so it reads as "0.65 or better" —
   * the metric cannot resolve finer than the matrix's own leftmost column. '6.5'
   * is the loosest level the ladder will report; a count that only fits under the
   * matrix's '10' column is EXCEEDS_ALL, since '10' is not an assignable level
   * (AUDIT_REPORT.md #29).
   */
  aqlLevel: AchievableAQLLevel | null;
  /**
   * Ac/Re of the achieved level. For EXCEEDS_ALL this carries the LOOSEST level's
   * Ac/Re — i.e. the bar that was still missed — so the hard-fail state stays
   * self-explanatory in a frozen record. Null for QUALITATIVE.
   */
  threshold: AQLThreshold | null;
  /**
   * The count the ladder was actually run against. Mode-dependent, and deliberately
   * frozen alongside CategoryResult.totalCount because for GRANULAR the two differ:
   *   CUMULATIVE — the category sum (the same value its assigned verdict compares)
   *   GRANULAR   — the MAX single defect count, mirroring GRANULAR's own pass rule
   *                (`count > ac` per defect ⇒ the category satisfies a level iff its
   *                largest single count does)
   * Null for QUALITATIVE.
   */
  evaluatedCount: number | null;
}

/**
 * The frozen value recorded for N/A-mode categories. Shared constant rather than an
 * inline literal so every site that means "qualitative, no ladder" is provably the
 * same shape.
 */
export const QUALITATIVE_ACTUAL_AQL: Readonly<ActualAqlAchieved> = {
  status: 'QUALITATIVE',
  aqlLevel: null,
  threshold: null,
  evaluatedCount: null,
} as const;

/**
 * Generalizes the single-cell getAQLThresholds() lookup across the whole standard AQL
 * level set: instead of resolving Ac/Re for ONE assigned level, it walks every level
 * and reports the tightest one the observed count still fits under.
 *
 * ACHIEVABLE_AQL_LEVELS is ordered tightest → loosest ('0.65' … '6.5'), and Ac is
 * monotonically non-decreasing along it for any fixed bracket (verified across all 13
 * rows of ISO_2859_MATRIX). So the FIRST level that accommodates the count is by
 * construction the tightest — a forward scan, no sorting or comparison needed.
 *
 * The scan stops at '6.5' on purpose — it mirrors QualityRules.tsx's assignable
 * ISO_WHITELIST, so the ladder can never report a level a category could not have
 * been assigned. A count that would only have fit under the matrix's '10' column
 * resolves to EXCEEDS_ALL instead. See AUDIT_REPORT.md #29.
 *
 * Reuses getAQLThresholds() rather than reading ISO_2859_MATRIX directly, so bracket
 * snapping and the matrix stay single-sourced. None of the 6 level strings trips that
 * function's zero-tolerance guard (/and/i, /zero.?tolerance/i, /^0$/), so every
 * iteration reaches a real matrix cell.
 *
 * @param sampleSize    - Operator-recorded sample size (bracket-snapped internally).
 * @param observedCount - Mode-appropriate count; see ActualAqlAchieved.evaluatedCount.
 */
export function findActualAqlAchieved(
  sampleSize: number,
  observedCount: number,
): ActualAqlAchieved {
  for (const level of ACHIEVABLE_AQL_LEVELS) {
    const threshold = getAQLThresholds(sampleSize, level);
    if (observedCount <= threshold.ac) {
      return { status: 'ACHIEVED', aqlLevel: level, threshold, evaluatedCount: observedCount };
    }
  }

  // Busted even the loosest achievable level ('6.5') — explicit hard-fail state,
  // never null/blank. '10' is a matrix column but not an assignable level, so it
  // is deliberately not scanned here (AUDIT_REPORT.md #29).
  const loosest = ACHIEVABLE_AQL_LEVELS[ACHIEVABLE_AQL_LEVELS.length - 1];
  return {
    status: 'EXCEEDS_ALL',
    aqlLevel: null,
    threshold: getAQLThresholds(sampleSize, loosest),
    evaluatedCount: observedCount,
  };
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
  /**
   * The tightest standard AQL level this category's observed count still satisfies —
   * see {@link ActualAqlAchieved}. Independent of, and reported alongside, the
   * assigned-AQL pass/fail above.
   *
   * Always populated (never null) on a CategoryResult, because a CategoryResult only
   * exists for a graded category — the `''` RECORD ONLY / OFF skip path below
   * `continue`s before one is built.
   */
  actualAqlAchieved: ActualAqlAchieved;
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
 * Uses the local AQLCategory/DefectDefinition types above (the engine's own
 * input shape) so the engine stays in lock-step with
 * DATA_SCHEMAS_AND_TYPES.md §2.1 without a hand-rolled DTO layer.
 */
export interface EvaluateAQLVerdictParams {
  /** Operator-recorded sample size. Will be bracket-snapped internally. */
  sampleSize: number;
  /**
   * All AQL categories from the active profile.
   * Source: engine/profileRules.ts's loadProfileRulesMap(), reading the
   * Category / ProfileCategory registry tables (resolved in resolveVerdict.ts).
   */
  categories: AQLCategory[];
  /**
   * All defect definitions from the active profile.
   * Source: engine/profileRules.ts's loadProfileRulesMap(), reading the
   * Defect / ProfileCategoryDefect registry tables (resolved in resolveVerdict.ts).
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
 * Iterates every AQLCategory in the active profile, resolves its
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
 * @param params - {@link EvaluateAQLVerdictParams}.
 * @returns {@link VerdictResult} — strictly typed verdict + per-category audit trail.
 */
export function evaluateAQLVerdict(params: EvaluateAQLVerdictParams): VerdictResult {
  const { sampleSize, categories, defectDefinitions, defectCounts } = params;

  const categoryResults: CategoryResult[] = [];
  let overallPassed = true;

  // Defects covered by ANY category in this profile, regardless of that
  // category's evaluationMode — a RECORD_ONLY category (evalMode '') still
  // legitimately claims its defects on purpose (see the `continue` below);
  // "orphaned" below means no category claims this defect at all, not "the
  // category that claims it happens to skip grading". Built from the full
  // category list up front so the per-category loop's `continue` can't
  // affect what counts as covered (AUDIT_REPORT.md #42).
  const categoryIds = new Set(categories.map((c) => c.id));
  const coveredDefectIds = new Set(
    defectDefinitions.filter((d) => categoryIds.has(d.categoryId)).map((d) => d.id),
  );

  for (const category of categories) {
    // Skip informational-only rows (empty evaluationMode)
    if (!category.evaluationMode) continue;

    // ── Resolve which defect definitions belong to this category ─────────────
    // Strict id link — see DefectDefinition.categoryId for why the old
    // name-OR-id match was removed at Stage 2.
    const categoryDefects = defectDefinitions.filter((d) => d.categoryId === category.id);

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
        // N/A values are state codes, not defect counts — no ladder to run.
        actualAqlAchieved: QUALITATIVE_ACTUAL_AQL,
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
        // CUMULATIVE compares the summed total against Ac, so the ladder runs
        // against that same total.
        actualAqlAchieved: findActualAqlAchieved(sampleSize, total),
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
      // GRANULAR passes a level iff EVERY individual count is <= Ac, which is
      // equivalent to its largest single count being <= Ac. So the ladder runs
      // against the max, not the sum — see ActualAqlAchieved.evaluatedCount.
      let maxCount = 0;

      for (const def of categoryDefects) {
        const count = defectCounts[def.id] ?? 0;
        totalCount += count;
        if (count > maxCount) maxCount = count;
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
        actualAqlAchieved: findActualAqlAchieved(sampleSize, maxCount),
      });
    }
  }

  // Warn on any recorded defect count this profile's categories never
  // referenced — e.g. a cross-profile amendment whose target profile has no
  // category for a defect the original profile did (AUDIT_REPORT.md #42).
  // Grading behavior is unchanged: the count was already silently excluded
  // by construction (no category's filter above ever matched it) — this
  // only adds visibility, consistent with how an unresolved profileId
  // already logs (VerdictProfileNotFoundError's caller).
  for (const defectId of Object.keys(defectCounts)) {
    if (!coveredDefectIds.has(defectId)) {
      console.warn(
        `[evaluateAQLVerdict] Defect '${defectId}' (count=${defectCounts[defectId]}) has no matching ` +
        'category in the active profile — excluded from grading entirely, not just this category.',
      );
    }
  }

  return {
    verdict: overallPassed ? 'PASSED' : 'FAILED',
    categoryResults,
  };
}
