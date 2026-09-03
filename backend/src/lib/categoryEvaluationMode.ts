/**
 * @file categoryEvaluationMode.ts
 * @description The ONE canonical translation between the Category Inventory's
 * clean evaluation-mode enum and the wire format the AQL engine actually reads.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * Two dialects describe the same four grading behaviours:
 *
 *   Category.evaluationMode      AppConfig JSON / aqlEvaluator.ts
 *   (schema.prisma, this file)   (`evaluationMode` / `evalMode`)
 *   ──────────────────────────   ────────────────────────────────
 *   'CUMULATIVE'            <->  'CUMULATIVE'
 *   'GRANULAR'              <->  'GRANULAR'
 *   'QUALITATIVE'           <->  'N/A'
 *   'RECORD_ONLY'           <->  ''        ← empty string
 *
 * Two of those four rows are NOT identity mappings, so anywhere the two
 * representations meet, a translation must happen deliberately. Hand-rolling
 * it at each call site is exactly how the #10 drift happened before (three
 * copies of the profile seed disagreeing on whether BARRIER was CUMULATIVE or
 * 'N/A', so the wizard displayed one mode while the server graded another).
 * Import from here instead of restating the mapping.
 *
 * ── The dangerous row ───────────────────────────────────────────────────────
 * `RECORD_ONLY <-> ''` is the one that breaks grading if fumbled. The empty
 * string is a REAL, DELIBERATE value, not a missing one:
 *
 *   - It is the ONLY thing that triggers aqlEvaluator.ts's true-exclusion
 *     path, `if (!category.evaluationMode) continue;`.
 *   - defaultProfileSeed.ts pins this down as EMPTY_EVAL_MODE_IS_RECORD_ONLY,
 *     and its isEvalModeUnset() uses `??` rather than `||` precisely so `''`
 *     survives as a value instead of being coerced to "unset".
 *   - validateInspectionProfiles() (config.routes.ts) rejects a save whose
 *     category has a genuinely unset mode, so mapping RECORD_ONLY to
 *     null/undefined turns into a hard 400 on the next config write.
 *   - Mapping it to 'CUMULATIVE' instead would be worse than an error: a
 *     record-only category would start counting toward the lot verdict.
 *     FACTORY STANDARD's RECORD ONLY category already holds def_sagging in a
 *     real, frozen submission.
 *
 * So: never write `mode || 'CUMULATIVE'`, never `mode?.trim() || undefined`,
 * and never filter a category list on mode truthiness. Use these functions.
 *
 * ── Status ──────────────────────────────────────────────────────────────────
 * Introduced in Stage 1 (schema + backfill) alongside the Category model. The
 * engine does NOT import this yet — it still reads AppConfig JSON directly and
 * is untouched by Stage 1. Stage 2, which rewires resolveVerdict.ts onto the
 * new tables, is the intended consumer.
 */

/** The Category Inventory's clean enum — the values stored in Category.evaluationMode. */
export const CATEGORY_EVALUATION_MODES = [
  'CUMULATIVE',
  'GRANULAR',
  'QUALITATIVE',
  'RECORD_ONLY',
] as const;

export type CategoryEvaluationMode = (typeof CATEGORY_EVALUATION_MODES)[number];

/**
 * The engine/AppConfig-JSON spelling of each mode. `''` is a real member of
 * this union, not a placeholder for "absent" — see the file header.
 */
export type EngineEvaluationMode = 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';

/** Category enum -> engine wire value. */
const TO_ENGINE: Record<CategoryEvaluationMode, EngineEvaluationMode> = {
  CUMULATIVE: 'CUMULATIVE',
  GRANULAR: 'GRANULAR',
  QUALITATIVE: 'N/A',
  RECORD_ONLY: '',
};

/** Engine wire value -> Category enum. Exact inverse of TO_ENGINE. */
const FROM_ENGINE: Record<EngineEvaluationMode, CategoryEvaluationMode> = {
  CUMULATIVE: 'CUMULATIVE',
  GRANULAR: 'GRANULAR',
  'N/A': 'QUALITATIVE',
  '': 'RECORD_ONLY',
};

/** True if `value` is one of the four Category Inventory enum values. */
export function isCategoryEvaluationMode(value: unknown): value is CategoryEvaluationMode {
  return typeof value === 'string'
    && (CATEGORY_EVALUATION_MODES as readonly string[]).includes(value);
}

/**
 * Translates a stored Category.evaluationMode into the value aqlEvaluator.ts
 * expects on AQLCategory.evaluationMode.
 *
 * @throws if `mode` is not one of the four enum values. Deliberately strict:
 *   a silent fallback here is precisely how a RECORD_ONLY category would start
 *   being graded, so an unrecognised mode must fail loudly rather than guess.
 */
export function toEngineEvaluationMode(mode: string): EngineEvaluationMode {
  if (!isCategoryEvaluationMode(mode)) {
    throw new Error(
      `[categoryEvaluationMode] Unknown Category.evaluationMode '${mode}'. ` +
      `Expected one of: ${CATEGORY_EVALUATION_MODES.join(', ')}.`,
    );
  }
  return TO_ENGINE[mode];
}

/**
 * Translates an AppConfig-JSON / engine evaluation mode into the Category
 * Inventory enum.
 *
 * Accepts BOTH field spellings' values, but not "absent": `null`/`undefined`
 * mean a genuinely unset mode (isEvalModeUnset() in defaultProfileSeed.ts),
 * which is a distinct state from RECORD_ONLY and must not be silently
 * promoted into it.
 *
 * @throws if `mode` is null, undefined, or an unrecognised string.
 */
export function fromEngineEvaluationMode(mode: string | null | undefined): CategoryEvaluationMode {
  if (mode === null || mode === undefined) {
    throw new Error(
      '[categoryEvaluationMode] Evaluation mode is unset (null/undefined). ' +
      "This is NOT the same as RECORD_ONLY (which is the empty string ''), " +
      'and must not be mapped to it — see isEvalModeUnset() in defaultProfileSeed.ts.',
    );
  }
  if (!(mode in FROM_ENGINE)) {
    throw new Error(
      `[categoryEvaluationMode] Unknown engine evaluation mode '${mode}'. ` +
      "Expected one of: 'CUMULATIVE', 'GRANULAR', 'N/A', '' (empty string = RECORD ONLY).",
    );
  }
  return FROM_ENGINE[mode as EngineEvaluationMode];
}
