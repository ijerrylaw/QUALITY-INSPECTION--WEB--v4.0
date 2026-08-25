/**
 * @file wizardDirty.ts
 * @description Single "does the in-progress wizard entry have unsaved work"
 * check, used by the sidebar navigation guard (Sidebar.tsx via
 * WizardGuardContext) to decide whether to warn before discarding.
 *
 * Reuses `hasFieldChanged` from `fieldDiff.tsx` — the same comparator behind
 * the inline "Original: X" notes (§5.14) and the pre-submit summary
 * (§5.15) — for every leaf comparison. No second comparison mechanism is
 * introduced here; this module only supplies the "which fields exist, and
 * what do we compare them against" enumeration, the same way
 * StepDimensions.tsx/StepDefects.tsx/SubmissionSummary.tsx each derive
 * their own field list from config.
 *
 * Two distinct notions of "dirty", both expressed through the same
 * `hasFieldChanged(hasOriginal, originalValue, currentValue)` call:
 *
 * - Amendment mode: `originalValue` is the real original submission's
 *   value; dirty means "differs from what was actually persisted."
 * - New-submission mode: there is no original submission, so
 *   `originalValue` is a synthetic empty/default baseline instead; dirty
 *   means "differs from the field's untouched starting state." Fields that
 *   can be legitimately pre-populated by "Retain Context" from a prior lot
 *   (productCode, size, lineId, side, sampleSize, profileId) are
 *   deliberately excluded from this check — a freshly-loaded wizard
 *   carrying retained context is not "dirty" on its own; nothing new has
 *   been entered yet. Dimension slots use the wizard's own
 *   `dimensionDirtySlots` touched-tracking rather than a value comparison,
 *   since slots are pre-filled with the spec target value by default, not
 *   left blank — a plain "differs from empty" check would misfire on
 *   every load.
 */

import { hasFieldChanged } from './fieldDiff';
import type { AQLCategory, DefectDefinition, ProductDimensionDef } from '../context/ConfigContext';

const SLOTS_PER_DIM = 5;

/** Fields compared directly against the original record in amendment mode. */
const AMEND_COMPARABLE_FIELDS = [
  'profileId',
  'productCode',
  'size',
  'lineId',
  'side',
  'sequenceNo',
  'shift',
  'sampleSize',
  'totalCarton',
  'gloveWeight',
  'timestamp',
] as const;

function isQualitativeCategory(categoryId: string, aqlCategories: AQLCategory[]): boolean {
  const cat = aqlCategories.find((c) => c.id === categoryId);
  return (cat?.aql ?? cat?.aqlLevel ?? '').toUpperCase() === 'PASS/FAIL';
}

export interface WizardDirtyInput {
  inspectionData: Record<string, any>;
  originalData?: Record<string, any> | null;
  activeDimensions: ProductDimensionDef[];
  defectDefinitions: DefectDefinition[];
  aqlCategories: AQLCategory[];
}

export function isWizardDirty({
  inspectionData,
  originalData,
  activeDimensions,
  defectDefinitions,
  aqlCategories,
}: WizardDirtyInput): boolean {
  const currentDimensions: Record<string, string[]> = inspectionData?.dimensions ?? {};
  const currentDefects: Record<string, number> = inspectionData?.defects ?? {};
  const currentQualitative: Record<string, string> = inspectionData?.qualitative ?? {};
  const qualitativeIds = new Set(
    defectDefinitions.filter((d) => isQualitativeCategory(d.categoryId, aqlCategories)).map((d) => d.id),
  );

  // ── Amendment mode: compare against the real original record ────────────
  if (originalData != null) {
    for (const key of AMEND_COMPARABLE_FIELDS) {
      if (hasFieldChanged(true, originalData[key], inspectionData?.[key])) return true;
    }

    const originalDimensions: Record<string, string[]> = originalData.dimensions ?? {};
    for (const dim of activeDimensions) {
      for (let i = 0; i < SLOTS_PER_DIM; i++) {
        if (hasFieldChanged(true, originalDimensions[dim.id]?.[i], currentDimensions[dim.id]?.[i])) return true;
      }
    }

    const originalDefects: Record<string, number> = originalData.defects ?? {};
    const originalQualitative: Record<string, string> = originalData.qualitative ?? {};
    for (const defect of defectDefinitions) {
      if (qualitativeIds.has(defect.id)) {
        if (hasFieldChanged(true, originalQualitative[defect.id] ?? '', currentQualitative[defect.id] ?? '')) {
          return true;
        }
      } else if (hasFieldChanged(true, originalDefects[defect.id] ?? 0, currentDefects[defect.id] ?? 0)) {
        return true;
      }
    }

    return false;
  }

  // ── New-submission mode: compare against untouched-state baselines ──────
  // sequenceNo now DOES have an auto-population path (StepMetadata.tsx's
  // sequence-hint prefill, added after this comment was first written) —
  // it fills the field with the suggested next number whenever prior
  // submissions exist for the Line/Side/Date group, with zero user
  // interaction. A plain "non-blank" check would therefore false-positive
  // on nearly every fresh wizard load in normal (non-first-lot-of-the-day)
  // usage. StepMetadata.tsx pushes up `sequenceTouched` precisely to
  // distinguish "the operator typed something" from "the hint auto-filled
  // it" — using that signal directly instead of diffing the value itself.
  // totalCarton and gloveWeight are deliberately NOT checked here even
  // though they start blank: StepMetadata.tsx auto-fills totalCarton to
  // '18' on first load (its own hydrate-defaults effect) and gloveWeight
  // from the product matrix's configured weightTarget whenever
  // productCode/size are set (also true on first load, e.g. via Retain
  // Context) — neither transition reflects the operator having entered
  // anything, so treating "non-blank" as "dirty" for either would false-
  // positive on a wizard nobody has touched yet.
  if (inspectionData?.sequenceTouched) return true;

  const dirtySlots: Record<string, boolean[]> = inspectionData?.dimensionDirtySlots ?? {};
  if (Object.values(dirtySlots).some((slots) => slots?.some(Boolean))) return true;

  const hasNonZeroQuantCount = Object.entries(currentDefects).some(
    ([id, count]) => !qualitativeIds.has(id) && typeof count === 'number' && count > 0,
  );
  if (hasNonZeroQuantCount) return true;

  // Untouched qualitative defects are absent from the map entirely (2-way
  // PASS/FAIL toggle — see StepDefects.tsx's QUALITATIVE_ENCODING), so any
  // entry at all means the operator made a choice.
  if (Object.keys(currentQualitative).length > 0) return true;

  return false;
}
