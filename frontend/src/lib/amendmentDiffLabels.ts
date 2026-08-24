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

import type { AppConfig, InspectionProfile } from '../context/ConfigContext';
import { resolveProductMatrix } from '../context/ConfigContext';
import { FIXED_DIMENSION_LABELS } from './fixedDimensions';

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

// ── Defect label resolution (profile-scoped) ──────────────────────────────

export interface DefectLabelContext {
  /** `defectId -> display name` map, empty when `unavailable` is true. */
  labels: Record<string, string>;
  /**
   * True only when `profileId` was set but does not match any profile in
   * `config.inspectionProfiles` (deleted/renamed profile) — a genuinely
   * unresolvable reference. A null/absent `profileId` is NOT this case: it
   * mirrors the backend's own documented fallback to the GLOBAL STANDARD
   * (isDefault) profile for legacy/profile-less submissions
   * (DATA_SCHEMAS_AND_TYPES.md §1, `Submission.profileId`), so it resolves
   * quietly against the default profile instead.
   */
  unavailable: boolean;
  /** The resolved profile, or null when `unavailable`. */
  profile: InspectionProfile | null;
}

/**
 * Resolves the defect-label map for one submission's `profileId`, using a
 * STRICT exact-id match against `config.inspectionProfiles` — deliberately
 * NOT `useConfig().getResolvedProfile()`, which silently falls back to a
 * DIFFERENT profile (isDefault, then first-in-list) on a no-match. That
 * fallback is correct for the live wizard (always resolve to *something*),
 * but wrong here: silently borrowing another profile's defect names would
 * mislabel a deleted/renamed profile's defects as if they belonged to the
 * wrong taxonomy. An unresolvable profileId is reported via `unavailable`
 * instead, so the caller can fall back to raw defect keys with a visible
 * indicator rather than a wrong label.
 */
export function resolveDefectLabelContext(
  config: AppConfig | null,
  profileId: string | null | undefined,
): DefectLabelContext {
  const profiles = config?.inspectionProfiles ?? [];

  if (!profileId) {
    const fallback = profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
    return { labels: buildDefectLabelMap(fallback), unavailable: false, profile: fallback };
  }

  const profile = profiles.find((p) => p.id === profileId) ?? null;
  if (profile) return { labels: buildDefectLabelMap(profile), unavailable: false, profile };
  return { labels: {}, unavailable: true, profile: null };
}

function buildDefectLabelMap(profile: InspectionProfile | null): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of profile?.defectDefinitions ?? []) map[d.id] = d.name;
  return map;
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
