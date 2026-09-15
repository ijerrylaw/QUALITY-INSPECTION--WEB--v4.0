/**
 * @file batchSetupValidity.ts
 * @description Single source of truth for "is BATCH SETUP (wizard Step 1)
 * complete" — shared by WizardPage.tsx (tab-click gate + checkmark +
 * SUBMIT LOT gate) and StepMetadata.tsx (its own Next-button validation).
 *
 * Previously these two checked different field lists (WizardPage's 6 vs.
 * StepMetadata's own 9, which additionally required side/sequenceNo/
 * gloveWeight) — a real, already-shipped divergence: a user could tab-navigate
 * past Step 1 while StepMetadata's own Next button would have rejected the
 * exact same state. This list is the reconciled, authoritative one.
 *
 * `side` and `gloveWeight` are intentionally NOT required: side defaults to
 * a real value on mount, and gloveWeight's own consumer (StepReviewSubmit.tsx's
 * weight-grading check) already guards on `typeof gloveWeight === 'number'` —
 * neither is silently load-bearing on being non-blank by the time Step 1 is
 * left.
 *
 * `sequenceNo` IS required, unlike the other two — it corrected a real,
 * confirmed gap. Its auto-suggest (StepMetadata.tsx's `suggestedNextSeq`
 * effect) is async (network round-trip, gated on lineId/side/lot4Digit
 * resolving first), so there's a genuine window where the field reads as
 * empty and no other signal fills it. Live-verified: leaving it untouched
 * during that window let a user tab-navigate past Batch Setup with no
 * sequence number ever recorded. An unresolved suggestion correctly still
 * counts as "not filled" here — no special-casing needed, since this check
 * only ever reads whatever value is actually in `data.sequenceNo`.
 */

export interface RequiredFieldDef {
  key: string;
  label: string;
}

export const BATCH_SETUP_REQUIRED_FIELDS: RequiredFieldDef[] = [
  { key: 'profileId',   label: 'Inspection Profile' },
  { key: 'productCode', label: 'Product Code' },
  { key: 'lineId',      label: 'Line' },
  { key: 'size',        label: 'Size' },
  { key: 'sampleSize',  label: 'Sample Size' },
  { key: 'totalCarton', label: 'Total Carton' },
  { key: 'sequenceNo',  label: 'Sequence No.' },
];

/** Labels of every required field currently blank/missing in `data`. */
export function getMissingBatchSetupFields(data: Record<string, any>): string[] {
  return BATCH_SETUP_REQUIRED_FIELDS.filter(
    (f) => data[f.key] === undefined || data[f.key] === '' || data[f.key] === null,
  ).map((f) => f.label);
}

export function isBatchSetupValid(data: Record<string, any>): boolean {
  return getMissingBatchSetupFields(data).length === 0;
}
