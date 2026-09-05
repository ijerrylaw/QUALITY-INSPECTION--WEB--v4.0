/**
 * @file amendmentDiffLabels.ts
 * @description Human-readable label resolution for ApprovalsQueue.tsx's
 * amendment diff view — maps raw Submission field/dimension/defect keys to
 * display labels, and groups the diff tree's top-level Submission fields
 * into review sections (Batch Setup / Dimensions / Defects / Verdict).
 *
 * Static field/stat labels follow the `ROLE_LABELS` pattern in
 * PinAdminPanel.tsx (a plain `Record<string,string>`, single source of
 * truth). Dimension and defect labels are NOT static — they're
 * product/profile-scoped config data (`ConfigContext`), so they're resolved
 * per-amendment from the submission's own `productCode`/`profileId` rather
 * than hardcoded here.
 */

import type { AppConfig, InspectionProfile, EvaluationMode } from '../context/ConfigContext';
import { resolveProductMatrix } from '../context/ConfigContext';
import { FIXED_DIMENSION_LABELS, FIXED_DIM_LENGTH, FIXED_DIM_PALM } from './fixedDimensions';

// ── Section grouping ──────────────────────────────────────────────────────
// Every substantive (non-excluded, see diffTree.ts's NON_SUBSTANTIVE_DIFF_
// FIELDS) top-level Submission field, per DATA_SCHEMAS_AND_TYPES.md §1.
// Kept exhaustive deliberately: a Submission field that isn't in any list
// below falls through to `OTHER_SECTION_ID` rather than being silently
// dropped from the diff.

export type SectionId = 'batch' | 'dimensions' | 'defects' | 'verdict' | 'other';

export interface SectionDef {
  id: SectionId;
  title: string;
  fields: string[];
}

export const AMENDMENT_DIFF_SECTIONS: SectionDef[] = [
  {
    id: 'batch',
    title: 'Batch Setup',
    fields: [
      'productCode', 'profileId', 'productionDate', 'samplingTime',
      'machineId', 'shift', 'batchNumber', 'size', 'sampleSize',
      'totalCarton', 'gloveWeight',
    ],
  },
  {
    id: 'dimensions',
    title: 'Dimensions',
    fields: ['dimensions', 'dimensionMins'],
  },
  {
    id: 'defects',
    title: 'Defects',
    fields: ['defects'],
  },
  {
    id: 'verdict',
    title: 'Verdict',
    fields: ['verdict'],
  },
];

export const OTHER_SECTION_ID: SectionId = 'other';
export const OTHER_SECTION_TITLE = 'Other Fields';

// ── Raw vs. derived classification ────────────────────────────────────────
// Which top-level Submission fields hold operator-entered/selected data
// ("raw") vs. server/client-computed results ("derived"), for
// AmendmentDiffView.tsx's raw-first/calculated-below sub-grouping.
//
// `dimensionMins` — StepDimensions.tsx computes it client-side FROM
// `dimensions` at measurement time (min/max/avg/pass-fail per slot); nothing
// about it is operator-typed (DATA_SCHEMAS_AND_TYPES.md §1's field comment).
// `verdict` — always server-recomputed via resolveVerdict() on approval;
// handleAction()/the approve route never trusts a client-supplied verdict
// (submissions.routes.ts, confirmed in the original diff-modal discovery
// pass) — so it's derived regardless of which section it's grouped under.
//
// Every other substantive field (productCode, profileId, batchNumber, size,
// sampleSize, totalCarton, gloveWeight, `dimensions` itself, `defects`) is
// directly operator-entered/selected — `defects` in particular is inspector-
// COUNTED, not computed (Record<DefectDefinition.id, count>, DATA_SCHEMAS_
// AND_TYPES.md §1) — so none of those need a derived sub-group.
export const DERIVED_TOP_LEVEL_FIELDS = new Set<string>(['dimensionMins', 'verdict']);

export function isDerivedTopLevelField(field: string): boolean {
  return DERIVED_TOP_LEVEL_FIELDS.has(field);
}

// ── Static field labels (Batch Setup + Verdict) ───────────────────────────

export const SUBMISSION_FIELD_LABELS: Record<string, string> = {
  productCode: 'Product Code',
  profileId: 'Inspection Profile',
  productionDate: 'Production Date',
  samplingTime: 'Sampling Time',
  machineId: 'Machine ID',
  shift: 'Shift',
  batchNumber: 'Lot Number',
  size: 'Size',
  sampleSize: 'Sample Size',
  totalCarton: 'Total Carton',
  gloveWeight: 'Glove Weight',
  verdict: 'Verdict',
};

// ── Static stat labels (dimensionMins.<dimId>.<statKey>) ──────────────────

export const DIMENSION_STAT_LABELS: Record<string, string> = {
  min: 'Min',
  max: 'Max',
  avg: 'Average',
  fails: 'Fails',
  threshold: 'Threshold',
  maxThreshold: 'Max Threshold',
  isMin: 'Min-Only Spec',
  isGraded: 'Graded',
};

// ── Dimension label resolution (product-scoped) ───────────────────────────

/**
 * Builds a `dimId -> display name` map for one submission's product code,
 * mirroring StepDimensions.tsx's own fixed-then-dynamic resolution order
 * (matrixEntry.dimensionDefs, falling back to the global config.dimensions
 * list) so a dimension shows the same name here as it did in the wizard.
 * An id with no match in either source is left unmapped — the caller falls
 * back to the raw id.
 */
export function buildDimensionLabelMap(
  config: AppConfig | null,
  productCode: string | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = { ...FIXED_DIMENSION_LABELS };
  const matrixEntry = resolveProductMatrix(config, productCode);
  const defs = matrixEntry?.dimensionDefs && matrixEntry.dimensionDefs.length > 0
    ? matrixEntry.dimensionDefs
    : (config?.dimensions ?? []);
  for (const d of defs) map[d.id] = d.name;
  return map;
}

/**
 * Builds a `dimId -> decimal places` map for the same product code/source
 * order as `buildDimensionLabelMap`, so `dimensionMins` numeric stats
 * (min/max/avg/threshold/maxThreshold — computed via division/reduce in
 * StepDimensions.tsx and prone to floating-point artifacts, e.g.
 * `0.052000000000000005`) render at the same precision the wizard already
 * uses for that dimension's raw measurement inputs, instead of the raw
 * unrounded float. Unmapped/fixed-row ids default to 0 decimals — same
 * default as `ProductDimensionDef.decimals` and `matrixEntry.lengthDecimals`/
 * `palmWidthDecimals` (ConfigContext.tsx).
 */
export function buildDimensionDecimalsMap(
  config: AppConfig | null,
  productCode: string | null | undefined,
): Record<string, number> {
  const map: Record<string, number> = {};
  const matrixEntry = resolveProductMatrix(config, productCode);
  map[FIXED_DIM_LENGTH] = matrixEntry?.lengthDecimals ?? 0;
  map[FIXED_DIM_PALM] = matrixEntry?.palmWidthDecimals ?? 0;
  const defs = matrixEntry?.dimensionDefs && matrixEntry.dimensionDefs.length > 0
    ? matrixEntry.dimensionDefs
    : (config?.dimensions ?? []);
  for (const d of defs) map[d.id] = d.decimals ?? 0;
  return map;
}

// ── Defect label + category resolution (profile-scoped) ──────────────────
//
// An amendment's "before" and "after" sides can name DIFFERENT profiles
// (a profile-switch amendment) — so, unlike every other config-scoped
// lookup in this file, defect context must be resolved separately per side,
// not once for "the" profile. AUDIT_REPORT.md #42: a defect's raw recorded
// count can stay identical across an amendment while its CATEGORY
// membership or evaluationMode silently changes (moves to a different
// category, or drops out of every category the new profile defines) —
// invisible to a diff that only compares counts. `detectDefectCategoryChange`
// below is what makes that visible.

export interface DefectCategoryInfo {
  categoryId: string;
  categoryName: string;
  evaluationMode: EvaluationMode;
  /** Needed to format evaluationMode for display — see `formatEvalModeForDisplay`. */
  aqlLevel: string;
}

export interface ProfileDefectContext {
  /** `defectId -> display name` map, empty when `unavailable` is true. */
  labels: Record<string, string>;
  /** `defectId -> category info` map, empty when `unavailable` is true. */
  categories: Record<string, DefectCategoryInfo>;
  /**
   * True only when this side's profileId was set but does not match any
   * profile in `config.inspectionProfiles` (deleted/renamed profile) — a
   * genuinely unresolvable reference. A null/absent profileId is NOT this
   * case: it mirrors the backend's own documented fallback to the GLOBAL
   * STANDARD (isDefault) profile for legacy/profile-less submissions
   * (DATA_SCHEMAS_AND_TYPES.md §1, `Submission.profileId`), so it resolves
   * quietly against the default profile instead.
   */
  unavailable: boolean;
  /** The resolved profile, or null when `unavailable`. */
  profile: InspectionProfile | null;
}

/**
 * Resolves one side's defect label + category map for a given `profileId`,
 * using a STRICT exact-id match against `config.inspectionProfiles` —
 * deliberately NOT `useConfig().getResolvedProfile()`, which silently falls
 * back to a DIFFERENT profile (isDefault, then first-in-list) on a no-match.
 * That fallback is correct for the live wizard (always resolve to
 * *something*), but wrong here: silently borrowing another profile's defect
 * names/categories would mislabel a deleted/renamed profile's defects as if
 * they belonged to the wrong taxonomy. An unresolvable profileId is reported
 * via `unavailable` instead, so the caller can fall back to raw defect keys
 * with a visible indicator rather than a wrong label.
 */
function resolveProfileDefectContext(
  config: AppConfig | null,
  profileId: string | null | undefined,
): ProfileDefectContext {
  const profiles = config?.inspectionProfiles ?? [];

  if (!profileId) {
    const fallback = profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
    return {
      labels: buildDefectLabelMap(fallback),
      categories: buildDefectCategoryMap(fallback),
      unavailable: false,
      profile: fallback,
    };
  }

  const profile = profiles.find((p) => p.id === profileId) ?? null;
  if (profile) {
    return {
      labels: buildDefectLabelMap(profile),
      categories: buildDefectCategoryMap(profile),
      unavailable: false,
      profile,
    };
  }
  return { labels: {}, categories: {}, unavailable: true, profile: null };
}

function buildDefectLabelMap(profile: InspectionProfile | null): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of profile?.defectDefinitions ?? []) map[d.id] = d.name;
  return map;
}

/** `defectId -> { categoryId, categoryName, evaluationMode, aqlLevel }` for one profile. */
function buildDefectCategoryMap(profile: InspectionProfile | null): Record<string, DefectCategoryInfo> {
  const map: Record<string, DefectCategoryInfo> = {};
  const categoriesById = new Map((profile?.aqlCategories ?? []).map((c) => [c.id, c]));
  for (const d of profile?.defectDefinitions ?? []) {
    const cat = categoriesById.get(d.categoryId);
    if (!cat) continue; // Same "no category claims this defect" case the engine warns on (AUDIT_REPORT.md #42).
    map[d.id] = {
      categoryId: cat.id,
      categoryName: cat.name,
      // Both field spellings must be checked — `evaluationMode`/`aqlLevel` are
      // the canonical names, but `GET /api/config` actually emits the legacy
      // `evalMode`/`aql` aliases (config.routes.ts's reconstructInspectionProfiles()),
      // and `config.inspectionProfiles` here is that raw response, NOT the
      // `getResolvedProfile()`-normalized shape that populates both names.
      // `??` not `||`, so a deliberate '' (RECORD ONLY) survives.
      evaluationMode: (cat.evaluationMode ?? cat.evalMode ?? '') as EvaluationMode,
      aqlLevel: cat.aqlLevel ?? cat.aql ?? '',
    };
  }
  return map;
}

/**
 * Read-only Eval Mode display text — mirrors QualityRules.tsx's
 * `formatEvalMode()`: a saved RECORD ONLY category's evaluationMode is `''`,
 * which would otherwise render as a blank badge.
 */
export function formatEvalModeForDisplay(aqlLevel: string, evaluationMode: EvaluationMode | string): string {
  if (evaluationMode) return evaluationMode;
  if (aqlLevel === 'RECORD ONLY') return 'RECORD ONLY';
  return '—';
}

export interface CrossProfileDefectContext {
  /** Defect label/category context resolved against the ORIGINAL (before-amendment) profile. */
  before: ProfileDefectContext;
  /** Defect label/category context resolved against the PROPOSED (after-amendment) profile. */
  after: ProfileDefectContext;
  /**
   * Merged `defectId -> display name` map for rendering: prefers `after`
   * (the forward-looking state, same priority `ApprovalsQueue.tsx` already
   * gives the proposed side elsewhere), falling back to `before` so a
   * defect the proposed profile doesn't cover — the exact "orphaned" case
   * this whole file exists to surface — still gets a real name instead of a
   * raw id merely because it's missing from ONE side's inventory.
   */
  labels: Record<string, string>;
  /** True when the AFTER profile itself is unresolvable — same semantics/row note the old single-profile context used. */
  unavailable: boolean;
}

/**
 * Resolves BOTH sides of an amendment's defect context at once — the
 * cross-profile replacement for the old single-profile
 * `resolveDefectLabelContext`. Needed because a profile-switch amendment's
 * "before" and "after" `profileId` can genuinely differ; resolving only one
 * side (as the old function did, always against the proposed profile) is
 * exactly the gap AUDIT_REPORT.md #42 found — it left every defect's
 * CATEGORY change invisible, and mislabeled any defect absent from the
 * proposed profile's inventory as a raw id.
 */
export function resolveCrossProfileDefectContext(
  config: AppConfig | null,
  beforeProfileId: string | null | undefined,
  afterProfileId: string | null | undefined,
): CrossProfileDefectContext {
  const before = resolveProfileDefectContext(config, beforeProfileId);
  const after = resolveProfileDefectContext(config, afterProfileId);
  return {
    before,
    after,
    labels: { ...before.labels, ...after.labels },
    unavailable: after.unavailable,
  };
}

export type DefectCategoryChangeKind = 'orphaned' | 'moved' | 'evalModeChanged';

export interface DefectCategoryChange {
  kind: DefectCategoryChangeKind;
  before: DefectCategoryInfo | null;
  after: DefectCategoryInfo | null;
}

/**
 * Detects a category-membership or evaluation-mode change for one defect
 * between the "before" and "after" profile's registry state — the only way
 * an amendment that never touches this defect's raw recorded count can
 * still change what happens to it at grading time (AUDIT_REPORT.md #42):
 *
 *   - `'orphaned'` — covered by a category under the before-profile, but no
 *     category under the after-profile claims it at all. It would silently
 *     stop being graded entirely if this amendment is approved (mirrors the
 *     engine's own new orphaned-defect warning, `aqlEvaluator.ts`).
 *   - `'moved'` — covered by a DIFFERENT category under each profile (by
 *     canonical category id, never by name).
 *   - `'evalModeChanged'` — same category id under both profiles, but that
 *     category's evaluationMode differs between the two profiles (legal per
 *     DATA_SCHEMAS_AND_TYPES.md §2.2 — the same category can be graded
 *     differently by different profiles — though no shipped profile pair
 *     does this today for a SHARED category).
 *
 * Returns null when neither applies — the defect's category context is
 * unaffected by the profile change, so only its count (if any) matters.
 * A defect uncovered on BOTH sides (never graded under either profile) also
 * returns null — there is no category context to report a change in.
 */
export function detectDefectCategoryChange(
  before: DefectCategoryInfo | undefined,
  after: DefectCategoryInfo | undefined,
): DefectCategoryChange | null {
  if (before && !after) return { kind: 'orphaned', before, after: null };
  if (before && after) {
    if (before.categoryId !== after.categoryId) return { kind: 'moved', before, after };
    if (before.evaluationMode !== after.evaluationMode) return { kind: 'evalModeChanged', before, after };
  }
  return null;
}

// ── Inspection profile display value (for the profileId Batch Setup row) ──

export interface ProfileDisplayValue {
  label: string;
  /** True when a non-empty profileId doesn't match any known profile. */
  unavailable: boolean;
}

/** Resolves a raw `profileId` value (as it appears on either diff side) to a display name, same strict-match rule as `resolveDefectLabelContext`. */
export function resolveProfileDisplayValue(
  config: AppConfig | null,
  profileId: unknown,
): ProfileDisplayValue {
  if (profileId === null || profileId === undefined || profileId === '') {
    return { label: '—', unavailable: false };
  }
  const id = String(profileId);
  const profile = (config?.inspectionProfiles ?? []).find((p) => p.id === id);
  if (profile) return { label: profile.name, unavailable: false };
  return { label: id, unavailable: true };
}
