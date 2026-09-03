/**
 * @file profileRules.ts
 * @description Loads a profile's grading rules (categories + defect membership)
 * from the global Master Defect List / Category Inventory tables, in the exact
 * shape evaluateAQLVerdict() consumes.
 *
 * ── What changed at Stage 2 ─────────────────────────────────────────────────
 * This module replaces resolveVerdict.ts's old normalizeForEngine(), which read
 * categories and defects out of the AppConfig.inspectionProfiles JSON blob and
 * reconciled two field-naming dialects on the way through. Grading rules now
 * come from ProfileCategory / ProfileCategoryDefect / Category / Defect.
 *
 * ── What did NOT change ─────────────────────────────────────────────────────
 * Profile IDENTITY still lives in AppConfig.inspectionProfiles JSON — there is
 * no Profile table (see schema.prisma's note on ProfileCategory.profileId). So
 * resolveVerdict() still asks the JSON "does this profile exist, and what is it
 * called", and asks THIS module "what are its rules". The split matters: a
 * profile can exist in the JSON while having no rows here, and that case must
 * behave exactly like the old "profile with empty aqlCategories" — it falls
 * through to the safety net rather than grading against nothing.
 *
 * ── Ordering is load-bearing ────────────────────────────────────────────────
 * The frozen gradingSnapshot is an ARRAY, and HistoryFeed renders it in order,
 * so category order and per-category defect order are part of the output, not
 * incidental. Both are reproduced from the sortOrder columns the Stage 1
 * backfill captured off the original JSON array indices:
 *
 *   categories        ordered by ProfileCategory.sortOrder
 *   defectDefinitions flattened as (category sortOrder, defect sortOrder)
 *
 * That flattening is what makes the within-category order come out right:
 * buildFrozenCategoryAnalysis() and evaluateAQLVerdict() both select a
 * category's members by filtering the flat list, so a member's position within
 * its own category is exactly its position in that filtered subset.
 */

import prisma from '../lib/prismaClient';
import { toEngineEvaluationMode } from '../lib/categoryEvaluationMode';
import type { AQLCategory, DefectDefinition } from './aqlEvaluator';

/** One profile's complete grading rules, already in the engine's own shape. */
export interface EngineProfileRules {
  categories: AQLCategory[];
  defectDefinitions: DefectDefinition[];
}

/**
 * True if these rules can actually grade something — at least one category with
 * both an AQL level and an evaluation mode.
 *
 * Semantics deliberately preserved from the old JSON-based hasUsableRules():
 * a RECORD_ONLY category maps to the empty-string engine mode, which is falsy
 * here, so a profile consisting only of record-only categories counts as
 * UNUSABLE — exactly as it did before Stage 2. That is correct: such a profile
 * grades nothing at all, so falling through to the safety net is right.
 */
export function hasUsableRules(rules: EngineProfileRules | undefined | null): boolean {
  if (!rules) return false;
  return rules.categories.some(
    (c) => c.aqlLevel && String(c.aqlLevel).trim() !== '' && c.evaluationMode && String(c.evaluationMode).trim() !== '',
  );
}

/**
 * Loads grading rules for EVERY profile that has any, keyed by profileId.
 *
 * Returns a map rather than taking a single profileId because resolveVerdict()
 * needs two things from it in one pass: the requested profile's rules, and —
 * when those are missing or unusable — a scan for the first profile in
 * AppConfig order that does have usable rules. Two queries total, so the scan
 * costs nothing extra and cannot become an N+1.
 *
 * @throws if a Category row carries an unrecognised evaluationMode. Deliberate:
 *   toEngineEvaluationMode() refuses to guess, because the failure mode of a
 *   silent default here is a RECORD_ONLY category quietly becoming graded.
 */
export async function loadProfileRulesMap(): Promise<Map<string, EngineProfileRules>> {
  const [profileCategories, profileDefects] = await Promise.all([
    prisma.profileCategory.findMany({
      include: { category: true },
      orderBy: [{ profileId: 'asc' }, { sortOrder: 'asc' }],
    }),
    prisma.profileCategoryDefect.findMany({
      include: { defect: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  // Bucket defects under their ProfileCategory. The query above is already
  // ordered by sortOrder, so appending preserves per-category order.
  const defectsByProfileCategory = new Map<string, { id: string; name: string }[]>();
  for (const pd of profileDefects) {
    let bucket = defectsByProfileCategory.get(pd.profileCategoryId);
    if (!bucket) {
      bucket = [];
      defectsByProfileCategory.set(pd.profileCategoryId, bucket);
    }
    bucket.push({ id: pd.defect.id, name: pd.defect.name });
  }

  const rulesByProfile = new Map<string, EngineProfileRules>();

  for (const pc of profileCategories) {
    let rules = rulesByProfile.get(pc.profileId);
    if (!rules) {
      rules = { categories: [], defectDefinitions: [] };
      rulesByProfile.set(pc.profileId, rules);
    }

    let evaluationMode: string;
    try {
      evaluationMode = toEngineEvaluationMode(pc.category.evaluationMode);
    } catch (err) {
      throw new Error(
        `[profileRules] Category '${pc.category.id}' (${pc.category.name}) used by profile ` +
        `'${pc.profileId}' has an unusable evaluationMode. ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    rules.categories.push({
      id: pc.category.id,
      name: pc.category.name,
      aqlLevel: pc.aqlLevel,
      evaluationMode,
    });

    // Flatten this category's defects immediately after the category itself, so
    // the flat array ends up in (category sortOrder, defect sortOrder) order.
    for (const d of defectsByProfileCategory.get(pc.id) ?? []) {
      rules.defectDefinitions.push({ id: d.id, name: d.name, categoryId: pc.category.id });
    }
  }

  return rulesByProfile;
}
