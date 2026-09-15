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
 * exact same state. The 6-field list here is the reconciled, authoritative
 * one. side/sequenceNo/gloveWeight are intentionally NOT required: side
 * defaults to a real value on mount, sequenceNo is auto-suggested, and
 * gloveWeight's own consumer (StepReviewSubmit.tsx's weight-grading check)
 * already guards on `typeof gloveWeight === 'number'` — none of the three
 * were silently load-bearing on being non-blank by the time Step 1 is left.
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
