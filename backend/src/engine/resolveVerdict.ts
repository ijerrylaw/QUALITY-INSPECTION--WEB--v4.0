/**
 * @file resolveVerdict.ts
 * @description Single entry point for AQL profile resolution + verdict evaluation.
 *
 * Extracted from the profile-resolution chain that used to live inline in
 * POST /api/submissions so there is exactly one place this logic can run,
 * shared by every route that needs a verdict:
 *   - POST /api/submissions               (persist)
 *   - POST /api/verdict/preview            (no persistence — wizard/history preview)
 *   - POST /api/submissions/:id/amendments (draft — informational preview)
 *   - POST /api/amendments/:id/approve     (recompute before persisting)
 *
 * This module is a thin orchestration layer around the pure aqlEvaluator.ts
 * engine — it resolves which profile/categories/defect definitions to feed
 * the engine (the one part that legitimately depends on request context and
 * AppConfig), then delegates all pass/fail math to evaluateAQLVerdict().
 */

import { evaluateAQLVerdict } from './aqlEvaluator';
import type { CategoryResult } from './aqlEvaluator';
import prisma from '../lib/prismaClient';

// ─────────────────────────────────────────────────────────────────────────────
// HARDCODED GLOBAL STANDARD DEFAULT PROFILE
// Mirrors ConfigContext.tsx getResolvedProfile() fallback.
// Used when no profile is resolved from AppConfig or an explicit profileId.
//
// evaluationMode choices (per aqlEvaluator.ts):
//   CUMULATIVE — sum all defect counts ≤ Ac; correct for zero-tolerance too
//   GRANULAR   — each defect type individually ≤ Ac
//   N/A        — qualitative state encoding (0=unset, 1=pass, 2=fail)
//   ''         — informational-only row; engine skips it
// ─────────────────────────────────────────────────────────────────────────────

const HARDCODED_DEFAULT_PROFILE = {
  id:   'prof_default',
  name: 'GLOBAL STANDARD (DEFAULT)',
  aqlCategories: [
    // AND = zero tolerance: CUMULATIVE mode with {ac:0,re:1} threshold
    { id: 'BARRIER',   name: 'BARRIER',   aqlLevel: 'AND',           evaluationMode: 'CUMULATIVE' },
    { id: 'CRITICAL',  name: 'CRITICAL',  aqlLevel: '1.5',           evaluationMode: 'CUMULATIVE' },
    { id: 'MAJOR',     name: 'MAJOR',     aqlLevel: '2.5',           evaluationMode: 'CUMULATIVE' },
    { id: 'MINOR',     name: 'MINOR',     aqlLevel: '4.0',           evaluationMode: 'GRANULAR'   },
    // PACKAGING is qualitative; '' causes engine to skip it (informational only)
    { id: 'PACKAGING', name: 'PACKAGING', aqlLevel: 'PASS/FAIL/NIL', evaluationMode: ''           },
  ],
  defectDefinitions: [
    // Engine matches defect defs to categories via currentClass === category.name || category.id
    { id: 'def_hole',     name: 'Hole',       currentClass: 'BARRIER',   defaultClass: 'BARRIER'   },
    { id: 'def_tear',     name: 'Tear',       currentClass: 'BARRIER',   defaultClass: 'BARRIER'   },
    { id: 'def_stain',    name: 'Stain',      currentClass: 'CRITICAL',  defaultClass: 'CRITICAL'  },
    { id: 'def_particle', name: 'Particle',   currentClass: 'CRITICAL',  defaultClass: 'CRITICAL'  },
    { id: 'def_dirt',     name: 'Dirt',       currentClass: 'MAJOR',     defaultClass: 'MAJOR'     },
    { id: 'def_flow',     name: 'Flow Mark',  currentClass: 'MINOR',     defaultClass: 'MINOR'     },
    { id: 'def_box',      name: 'Box Damage', currentClass: 'PACKAGING', defaultClass: 'PACKAGING' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Safely parses a JSON string; returns fallback on failure. */
function safeParseJSON<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * AppConfig-stored profiles use { categoryId } on defect definitions,
 * but the evaluateAQLVerdict engine expects { currentClass }.
 */
function normalizeForEngine(profile: {
  aqlCategories?: any[];
  defectDefinitions?: any[];
}): { categories: any[]; defectDefinitions: any[] } {
  const categories = (profile.aqlCategories ?? []).map((c: any) => ({
    id:             String(c.id             ?? ''),
    name:           String(c.name           ?? ''),
    aqlLevel:       String(c.aqlLevel       ?? ''),
    evaluationMode: String(c.evaluationMode ?? ''),
  }));

  const defectDefinitions = (profile.defectDefinitions ?? []).map((d: any) => ({
    id:           String(d.id   ?? ''),
    name:         String(d.name ?? ''),
    // Map either Prisma field or AppConfig JSON field to the engine's expected name
    currentClass: String(d.currentClass ?? d.categoryId ?? ''),
    defaultClass: String(d.defaultClass ?? d.categoryId ?? ''),
  }));

  return { categories, defectDefinitions };
}

/**
 * A profile is usable for AQL evaluation only if at least one category
 * has both aqlLevel and evaluationMode configured.
 */
function hasUsableRules(profile: any): boolean {
  return (profile?.aqlCategories ?? []).some(
    (c: any) => c.aqlLevel && String(c.aqlLevel).trim() !== ''
                && c.evaluationMode && String(c.evaluationMode).trim() !== '',
  );
}

/** Thrown when an explicit profileId doesn't resolve to any known profile. */
export class VerdictProfileNotFoundError extends Error {
  constructor(public readonly profileId: string) {
    super(`InspectionProfile '${profileId}' not found.`);
    this.name = 'VerdictProfileNotFoundError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVE + EVALUATE
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveVerdictParams {
  /** Explicit profile id, if the caller already knows it. */
  profileId?: string | null;
  /** Used for productProfileMap lookup when profileId is not supplied. */
  productCode?: string;
  sampleSize: number;
  defectCounts: Record<string, number>;
  /**
   * How to handle an explicit profileId that doesn't resolve to any known
   * profile:
   *   - 'throw' (default) — surface VerdictProfileNotFoundError to the
   *     caller. Correct for any path that persists data (submit, approve) —
   *     we must never silently grade against a guessed profile when the
   *     requested one can't be found.
   *   - 'fallback' — treat it the same as "no profileId supplied" and
   *     proceed through the normal safety net (first usable AppConfig
   *     profile, else hardcoded default). Correct for read-only preview
   *     paths, where a clearly-non-authoritative best-effort estimate is
   *     more useful than a hard error (e.g. Browse History on an old
   *     submission whose profile has since been deleted).
   */
  onUnresolvedProfile?: 'throw' | 'fallback';
}

export interface ResolveVerdictResult {
  verdict: 'PASSED' | 'FAILED';
  categoryResults: CategoryResult[];
  /** The profile id actually used for evaluation (post safety-net), or null if none resolved. */
  evaluationProfileId: string | null;
  /**
   * The profile id resolved from the explicit param or productProfileMap,
   * BEFORE any safety-net substitution — null if neither supplied one.
   * Distinct from evaluationProfileId because the safety net may grade
   * against a different (fallback) profile than the one actually requested.
   * Callers that need to know "was a real profile explicitly requested,
   * and which one" (e.g. an FK-validity check before persisting) should use
   * this instead of evaluationProfileId.
   */
  requestedProfileId: string | null;
}

/**
 * Resolution order (unchanged from the logic formerly inlined in
 * POST /api/submissions):
 *   a) Explicit profileId → find in AppConfig.inspectionProfiles → normalize
 *   b) Explicit profileId === 'prof_default' AND not found above → hardcoded default
 *   c) Unknown profileId (not in list and not 'prof_default') → throws VerdictProfileNotFoundError,
 *      unless onUnresolvedProfile === 'fallback', in which case it's treated as unset.
 *   d) No profileId at all → productProfileMap[productCode] lookup (if productCode supplied), then same chain
 *   e) Safety net: no categories resolved, or resolved profile has no usable rules
 *      → first AppConfig profile with usable rules, else hardcoded default
 *
 * @throws VerdictProfileNotFoundError if an explicit, unrecognized profileId is supplied
 *         and onUnresolvedProfile is 'throw' (the default).
 */
export async function resolveVerdict(params: ResolveVerdictParams): Promise<ResolveVerdictResult> {
  const { productCode, sampleSize, defectCounts } = params;
  const onUnresolvedProfile = params.onUnresolvedProfile ?? 'throw';

  const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' } });
  const profilesList: any[] = appConfig?.inspectionProfiles
    ? safeParseJSON<any[]>(appConfig.inspectionProfiles, [])
    : [];

  let profileId = params.profileId || null;

  if (!profileId && productCode && appConfig?.productProfileMap) {
    const profileMap = safeParseJSON<Record<string, string>>(appConfig.productProfileMap, {});
    profileId = profileMap[productCode] ?? null;
  }

  // Captured before any safety-net substitution — see ResolveVerdictResult.requestedProfileId.
  const requestedProfileId = profileId;

  let categories: any[]        = [];
  let defectDefinitions: any[] = [];
  let evaluationProfileId: string | null = null;

  if (profileId) {
    let profile = profilesList.find((p: any) => p.id === profileId);

    // Sentinel for the UI-configured global standard default
    if (!profile && profileId === 'prof_default') {
      profile = HARDCODED_DEFAULT_PROFILE;
    }

    if (!profile) {
      if (onUnresolvedProfile === 'fallback') {
        console.warn(
          `[resolveVerdict] profileId '${profileId}' not found — falling back to safety net (lenient mode).`,
        );
        // categories/defectDefinitions stay empty; the safety net below populates them.
      } else {
        throw new VerdictProfileNotFoundError(profileId);
      }
    } else {
      const normalized  = normalizeForEngine(profile);
      categories        = normalized.categories;
      defectDefinitions = normalized.defectDefinitions;
      evaluationProfileId = String(profile.id);
    }
  }

  // Safety net: no profileId was resolved, or the resolved profile has no usable rules.
  // Use the first AppConfig profile that has valid rules, or the hardcoded default.
  if (categories.length === 0 || !categories.some((c) => c.aqlLevel && c.evaluationMode)) {
    const usableAppConfigProfile = profilesList.find(hasUsableRules) ?? null;
    if (usableAppConfigProfile) {
      const normalized  = normalizeForEngine(usableAppConfigProfile);
      categories        = normalized.categories;
      defectDefinitions = normalized.defectDefinitions;
      evaluationProfileId = String(usableAppConfigProfile.id);
    } else {
      const normalized  = normalizeForEngine(HARDCODED_DEFAULT_PROFILE);
      categories        = normalized.categories;
      defectDefinitions = normalized.defectDefinitions;
      evaluationProfileId = 'prof_default';
    }
  }

  const { verdict, categoryResults } = evaluateAQLVerdict({
    sampleSize,
    categories,
    defectDefinitions,
    defectCounts,
  });

  return { verdict, categoryResults, evaluationProfileId, requestedProfileId };
}
