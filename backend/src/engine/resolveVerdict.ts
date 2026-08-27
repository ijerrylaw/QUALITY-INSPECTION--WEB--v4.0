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
import type { ActualAqlAchieved, CategoryResult } from './aqlEvaluator';
import { evaluateDimensions, evaluateWeight, hasUsableProductMatrix } from './dimensionEvaluator';
import type { DimensionResult, ProductConfig, ProductDimensionDef } from './dimensionEvaluator';
import { resolveProductRegistry } from '../lib/productEntry';
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
    { id: 'PACKAGING', name: 'PACKAGING', aqlLevel: 'PASS/FAIL',     evaluationMode: ''           },
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

/** A single defect recorded within a frozen category — see FrozenCategoryAnalysis. */
export interface FrozenDefectItem {
  id: string;
  name: string;
  count: number;
  failing: boolean;
}

/**
 * Self-contained, per-category grading snapshot — everything HistoryFeed.tsx's
 * DefectBreakdownPanel needs to render without any live profile lookup or
 * /api/verdict/preview call. Frozen onto Submission.gradingSnapshot at submit
 * time (or refrozen at amendment-approval time) — see AUDIT_REPORT.md #18.
 *
 * Distinct from aqlEvaluator.ts's CategoryResult (the engine's own audit-trail
 * type, kept unchanged): CategoryResult omits `aqlLevel` (only carries the
 * resolved numeric threshold) and its `failingDefects` lists only FAILING
 * defects. FrozenCategoryAnalysis instead lists every recorded defect per
 * category (failing or not) with its display name, and includes the aqlLevel
 * text — matching exactly what buildCategoryAnalysis() in HistoryFeed.tsx
 * renders today, just computed once, server-side, at freeze time.
 */
export interface FrozenCategoryAnalysis {
  id: string;
  name: string;
  aqlLevel: string;
  evaluationMode: string;
  threshold: { ac: number; re: number } | null;
  totalCount: number;
  /** true=PASS, false=FAIL, null=informational/not evaluated (empty evaluationMode) */
  passed: boolean | null;
  /**
   * The tightest standard AQL level this category's observed count still satisfied —
   * see ActualAqlAchieved in aqlEvaluator.ts. Frozen here alongside the assigned-AQL
   * verdict data above, and subject to the same rule: computed once at submit (or
   * amendment-approval) time and never recomputed live, so it cannot drift if the
   * profile's AQL levels change later.
   *
   * Null ONLY for categories that were never graded at all — the empty-evaluationMode
   * (RECORD ONLY / OFF) skip path, where `passed` and `threshold` are already null too.
   * A graded category always carries a real state, including the explicit EXCEEDS_ALL
   * hard fail; it is never null-because-unknown.
   *
   * Absent entirely on snapshots frozen before this field existed — deliberately NOT
   * backfilled, same rule as gradingSnapshot itself (AUDIT_REPORT.md #18).
   */
  actualAqlAchieved: ActualAqlAchieved | null;
  defectItems: FrozenDefectItem[];
}

/**
 * Builds the frozen, self-contained category analysis from the same
 * `categories`/`defectDefinitions`/`defectCounts` already resolved for
 * evaluateAQLVerdict() — mirrors HistoryFeed.tsx's buildCategoryAnalysis()
 * client-side join, but computed once here instead of duplicated per-render
 * on every row expansion.
 */
function buildFrozenCategoryAnalysis(
  categories: { id: string; name: string; aqlLevel: string; evaluationMode: string }[],
  defectDefinitions: { id: string; name: string; currentClass: string }[],
  defectCounts: Record<string, number>,
  categoryResults: CategoryResult[],
): FrozenCategoryAnalysis[] {
  const resultsById = new Map(categoryResults.map((r) => [r.categoryId, r]));

  return categories.map((cat): FrozenCategoryAnalysis => {
    const catDefs = defectDefinitions.filter(
      (d) => d.currentClass === cat.name || d.currentClass === cat.id,
    );

    const defectItemsRaw = catDefs
      .map((d) => ({ id: d.id, name: d.name, count: defectCounts[d.id] ?? 0 }))
      .filter((d) => d.count > 0);

    const totalCount = defectItemsRaw.reduce((sum, d) => sum + d.count, 0);

    const result = resultsById.get(cat.id);
    const passed: boolean | null = result ? result.passed : null;
    const threshold = result?.threshold ?? null;

    const failingIds = new Set<string>();
    if (result && !result.passed) {
      if (cat.evaluationMode === 'CUMULATIVE') {
        // Mirrors HistoryFeed.tsx's existing convention: CUMULATIVE's
        // failingDefects is one synthetic "category total" entry, not a
        // per-defect list — mark every recorded defect in a failing
        // CUMULATIVE category.
        defectItemsRaw.forEach((d) => failingIds.add(d.id));
      } else {
        result.failingDefects.forEach((fd) => failingIds.add(fd.defectId));
      }
    }

    return {
      id: cat.id,
      name: cat.name,
      aqlLevel: cat.aqlLevel,
      evaluationMode: cat.evaluationMode,
      threshold,
      totalCount,
      passed,
      // Null exactly where `passed`/`threshold` are null — an ungraded category has
      // no CategoryResult, so there is nothing to freeze.
      actualAqlAchieved: result?.actualAqlAchieved ?? null,
      defectItems: defectItemsRaw.map((d) => ({ ...d, failing: failingIds.has(d.id) })),
    };
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
   * The single recorded glove weight value (Submission.gloveWeight) —
   * evaluated via evaluateWeight() against the resolved product/size's
   * weightTarget/weightTolerance and folded into failedDimensions/
   * dimensionResults alongside the 5-slot dimensions. Independent of
   * dimensionMeasurements (Weight is never a 5-slot measurement) — only
   * requires `size` to resolve the per-size target. Always graded, no
   * record-only mode (see ProductConfig.lengthIsGraded/palmWidthIsGraded
   * docs for why Weight has no counterpart flag).
   */
  gloveWeight?: number;
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
  /** Self-contained per-category analysis for freezing onto Submission.gradingSnapshot — see FrozenCategoryAnalysis. */
  categoryAnalysis: FrozenCategoryAnalysis[];
  /** Display name of the profile actually used for evaluation — for gradingSnapshotProfileName. Null only if evaluationProfileId is also null. */
  evaluationProfileName: string | null;
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

  // ── B4 grading cutover ──────────────────────────────────────────────────
  // The product registry (per-code matrix + profile link) is now read from
  // AppConfig.products, through the SAME resolver the admin/config surface
  // uses (lib/productEntry.ts). Resolved once here and used for both reads
  // below, so a single request can never see one structure's view of a code
  // for its profile and another's for its dimensions.
  //
  // This is a DATA-SOURCE swap only — no grading logic, threshold, tolerance
  // or MIN-sentinel behavior is changed. `products` is kept byte-identical to
  // the legacy structures on every write by B2's write-hook, so the values
  // reaching the math are the same ones it received before.
  const registry = resolveProductRegistry(appConfig ?? {});

  let profileId = params.profileId || null;

  // Unchanged semantics: only consulted when no explicit profileId was
  // supplied. Previously guarded on the raw productProfileMap column being
  // truthy; an absent/empty registry now yields the same outcome (lookup
  // misses -> null -> the safety net below), so the net behavior is identical.
  if (!profileId && productCode) {
    profileId = registry.productProfileMap[productCode] ?? null;
  }

  // Captured before any safety-net substitution — see ResolveVerdictResult.requestedProfileId.
  const requestedProfileId = profileId;

  let categories: any[]        = [];
  let defectDefinitions: any[] = [];
  let evaluationProfileId: string | null = null;
  let evaluationProfileName: string | null = null;

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
      evaluationProfileName = String(profile.name ?? '');
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
      evaluationProfileName = String(usableAppConfigProfile.name ?? '');
    } else if (profilesList.length === 0) {
      // True first-run bootstrap: AppConfig has no profiles configured yet.
      // Legitimate, intentional fallback — see AUDIT_REPORT.md finding #13.
      const normalized  = normalizeForEngine(HARDCODED_DEFAULT_PROFILE);
      categories        = normalized.categories;
      defectDefinitions = normalized.defectDefinitions;
      evaluationProfileId = 'prof_default';
      evaluationProfileName = HARDCODED_DEFAULT_PROFILE.name;
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

  // B4: per-code dimension specs now come from `products` via the shared
  // registry resolver above, instead of the productMatrixConfig column.
  const productMatrixConfig = registry.productMatrixConfig as Record<string, ProductConfig>;

  if (params.size && params.dimensionMeasurements) {
    // globalDimensionDefs stays on AppConfig.dimensions — that is a global
    // fallback list, not per-product data, and was never part of the three
    // consolidated structures.
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

  // ── Glove Weight evaluation — independent of dimensionMeasurements
  //    (Weight is a scalar, never a 5-slot measurement). Always graded, no
  //    record-only mode — see evaluateWeight()'s own docs.
  if (params.size && params.gloveWeight != null) {
    const sizeEntry = productMatrixConfig[productCode ?? '']?.sizes?.[params.size];
    const weightResult = evaluateWeight({
      gloveWeight: params.gloveWeight,
      weightTarget: sizeEntry?.weightTarget,
      weightTolerance: sizeEntry?.weightTolerance,
    });
    dimensionResults.push(weightResult);
    if (weightResult.failed) failedDimensions++;
  }

  const verdict: 'PASSED' | 'FAILED' =
    aqlVerdict === 'FAILED' || failedDimensions > 0 ? 'FAILED' : 'PASSED';

  const categoryAnalysis = buildFrozenCategoryAnalysis(categories, defectDefinitions, defectCounts, categoryResults);

  return {
    verdict,
    categoryResults,
    categoryAnalysis,
    evaluationProfileName,
    failedDimensions,
    dimensionResults,
    evaluationProfileId,
    requestedProfileId,
  };
}
