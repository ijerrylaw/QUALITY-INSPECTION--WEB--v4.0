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
import { evaluateDimensions, hasUsableProductMatrix } from './dimensionEvaluator';
import type { DimensionResult, ProductConfig, ProductDimensionDef } from './dimensionEvaluator';
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
 *
 * Categories saved via the real admin UI (QualityRules.tsx) use `aql` /
 * `evalMode` field names, not `aqlLevel` / `evaluationMode` — mirrors the
 * dual-read ConfigContext.tsx already does client-side for display (see §5.3).
 */
function normalizeForEngine(profile: {
  aqlCategories?: any[];
  defectDefinitions?: any[];
}): { categories: any[]; defectDefinitions: any[] } {
  const categories = (profile.aqlCategories ?? []).map((c: any) => ({
    id:             String(c.id             ?? ''),
    name:           String(c.name           ?? ''),
    aqlLevel:       String(c.aqlLevel       ?? c.aql     ?? ''),
    evaluationMode: String(c.evaluationMode ?? c.evalMode ?? ''),
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
 * has both aqlLevel and evaluationMode configured (checking both the
 * `aqlLevel`/`evaluationMode` and `aql`/`evalMode` field-name variants —
 * same dual-read as normalizeForEngine(), see §5.3).
 */
function hasUsableRules(profile: any): boolean {
  return (profile?.aqlCategories ?? []).some((c: any) => {
    const aqlLevel       = c.aqlLevel       ?? c.aql;
    const evaluationMode = c.evaluationMode ?? c.evalMode;
    return aqlLevel && String(aqlLevel).trim() !== ''
        && evaluationMode && String(evaluationMode).trim() !== '';
  });
}

/** Thrown when an explicit profileId doesn't resolve to any known profile. */
export class VerdictProfileNotFoundError extends Error {
  constructor(public readonly profileId: string) {
    super(`InspectionProfile '${profileId}' not found.`);
    this.name = 'VerdictProfileNotFoundError';
  }
}

/**
 * Thrown when AppConfig has real, admin-authored profiles but none of them
 * has usable AQL rules — distinct from the true first-run bootstrap case
 * (AppConfig.inspectionProfiles completely empty), which still silently
 * falls back to HARDCODED_DEFAULT_PROFILE below. See AUDIT_REPORT.md
 * finding #10 — this should be unreachable in normal operation once the
 * wizard blocks entry against an unusable profile (frontend StepMetadata.tsx
 * / BatchEntry.tsx), but must fail loudly, not silently, if it is ever hit.
 */
export class VerdictNoUsableProfileError extends Error {
  constructor() {
    super('No AppConfig profile has usable AQL rules configured.');
    this.name = 'VerdictNoUsableProfileError';
  }
}

/**
 * Thrown when dimension evaluation was requested (size + measurements
 * supplied) but productMatrixConfig has no usable per-size spec for the
 * two fixed dimensions (GLOVE LENGTH, PALM WIDTH) — see AUDIT_REPORT.md
 * finding #5. Should be unreachable in normal operation once the wizard
 * blocks entry (StepDimensions.tsx / BatchEntry.tsx), but must fail
 * loudly, not silently grade with threshold=0/maxThreshold=Infinity, if
 * ever hit anyway.
 */
export class VerdictNoUsableDimensionConfigError extends Error {
  constructor(public readonly productCode: string, public readonly size: string) {
    super(`No usable dimension spec for product '${productCode}' size '${size}'.`);
    this.name = 'VerdictNoUsableDimensionConfigError';
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
   * Glove size ('XS' | 'S' | 'M' | 'L' | 'XL') and raw physical dimension
   * measurements (dimId -> slot value strings), used to resolve per-product
   * spec config (AppConfig.productMatrixConfig[productCode].sizes[size]) and
   * evaluate dimension pass/fail via dimensionEvaluator.ts (§5.9 fix).
   *
   * Both are optional and must be supplied together — omitting either skips
   * dimension evaluation entirely and falls back to today's AQL-only verdict,
   * so callers that don't have this data (or don't want it folded in) are
   * unaffected.
   */
  size?: string;
  dimensionMeasurements?: Record<string, string[]>;
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
  /**
   * `(AQL verdict === 'FAILED') OR (failedDimensions > 0)` — same combination
   * rule StepReviewSubmit.tsx already applies client-side (§5.9 fix), now
   * also applied here so persisted verdicts can't silently drop a
   * dimension-only failure the way the AQL-only recompute used to.
   */
  verdict: 'PASSED' | 'FAILED';
  categoryResults: CategoryResult[];
  /** Count of dimensions with >=1 out-of-spec slot. 0 when size/dimensionMeasurements weren't supplied. */
  failedDimensions: number;
  /** Per-dimension audit breakdown backing failedDimensions. Empty when size/dimensionMeasurements weren't supplied. */
  dimensionResults: DimensionResult[];
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

    // Sentinel for the UI-configured global standard default — only for the
    // true first-run bootstrap case (AppConfig has zero profiles at all).
    // If profilesList is non-empty but 'prof_default' specifically isn't in
    // it, fall through to the standard not-found handling below instead of
    // silently grading against the hardcoded profile.
    if (!profile && profileId === 'prof_default' && profilesList.length === 0) {
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
    } else if (profilesList.length === 0) {
      // True first-run bootstrap: AppConfig has no profiles configured yet.
      // Legitimate, intentional fallback — see AUDIT_REPORT.md finding #13.
      const normalized  = normalizeForEngine(HARDCODED_DEFAULT_PROFILE);
      categories        = normalized.categories;
      defectDefinitions = normalized.defectDefinitions;
      evaluationProfileId = 'prof_default';
    } else {
      // AppConfig has real, admin-authored profiles, but none of them is
      // usable. Not the bootstrap case — fail loudly instead of silently
      // grading against the hardcoded profile. See AUDIT_REPORT.md finding #10.
      console.error(
        '[resolveVerdict] No usable profile found — AppConfig has ' +
        `${profilesList.length} profile(s) configured but none has usable AQL rules.`,
      );
      throw new VerdictNoUsableProfileError();
    }
  }

  const { verdict: aqlVerdict, categoryResults } = evaluateAQLVerdict({
    sampleSize,
    categories,
    defectDefinitions,
    defectCounts,
  });

  // ── Dimension evaluation (§5.9 fix) — only when the caller supplied both
  //    size and raw measurements; otherwise stays AQL-only (unchanged behavior).
  let failedDimensions = 0;
  let dimensionResults: DimensionResult[] = [];

  if (params.size && params.dimensionMeasurements) {
    const productMatrixConfig = safeParseJSON<Record<string, ProductConfig>>(
      appConfig?.productMatrixConfig, {},
    );
    const globalDimensionDefs = safeParseJSON<ProductDimensionDef[]>(appConfig?.dimensions, []);

    if (!hasUsableProductMatrix(productMatrixConfig[productCode ?? ''], params.size)) {
      console.error(
        `[resolveVerdict] No usable dimension spec for product '${productCode}' size '${params.size}'.`,
      );
      throw new VerdictNoUsableDimensionConfigError(productCode ?? '', params.size);
    }

    const dimResult = evaluateDimensions({
      productMatrixConfig,
      globalDimensionDefs,
      productCode: productCode ?? '',
      size: params.size,
      measurements: params.dimensionMeasurements,
    });
    failedDimensions = dimResult.failedDimensions;
    dimensionResults = dimResult.dimensionResults;
  }

  const verdict: 'PASSED' | 'FAILED' =
    aqlVerdict === 'FAILED' || failedDimensions > 0 ? 'FAILED' : 'PASSED';

  return { verdict, categoryResults, failedDimensions, dimensionResults, evaluationProfileId, requestedProfileId };
}
