/**
 * @file amendmentPayload.ts
 * @description Builds the `newValues` body an amendment draft submits.
 *
 * Extracted from WizardPage.tsx's handleSubmit so the acknowledgment checklist
 * and the actual submission are provably diffing the SAME object. The checklist
 * asks `POST /api/submissions/:id/amendment-preview` what a payload changes, and
 * the submit then sends that payload to `POST /api/submissions/:id/amendments`,
 * where the gate recomputes the same diff. If the two payloads could differ by
 * even one field, the gate could reject on a change that never got a checkbox —
 * an unrecoverable state for the operator, since every box would already be
 * ticked. One builder, called by both, removes that possibility.
 *
 * Maps the wizard's own field names onto Submission's (`effectiveDate` ->
 * `productionDate`, `timestamp` -> `samplingTime`, `lineId` -> `machineId`,
 * `fullSystemLotNo` -> `batchNumber`, `dimensionStats` -> `dimensionMins`).
 */

/** The wizard's accumulated draft state (WizardPage.tsx's `inspectionData`). */
export type WizardInspectionData = Record<string, any>;

export interface AmendmentNewValues {
  productCode: string;
  productionDate: string;
  samplingTime: string;
  submissionTimestamp: string;
  machineId: string;
  shift: string;
  batchNumber: string;
  size: string;
  sampleSize: number;
  dimensions: Record<string, string[]>;
  dimensionMins: Record<string, unknown>;
  defects: Record<string, number>;
  verdict: 'PASSED' | 'FAILED';
  totalCarton: unknown;
  gloveWeight: unknown;
  profileId: string;
  amendmentStatus: 'PENDING_APPROVAL';
}

/**
 * @param now Injectable timestamp. `submissionTimestamp` is regenerated per call
 *   and would otherwise make two builds of the same draft differ; it sits in the
 *   gate's exclusion set so it never reaches the diff, but pinning it keeps the
 *   function pure for tests and keeps "preview and submit send the same bytes"
 *   literally true rather than true-modulo-one-field.
 */
export function buildAmendmentNewValues(
  inspectionData: WizardInspectionData,
  now: string = new Date().toISOString(),
): AmendmentNewValues {
  return {
    productCode: inspectionData['productCode'] ?? '',
    productionDate: inspectionData['effectiveDate'] ?? now,
    samplingTime: inspectionData['timestamp'] ?? now,
    submissionTimestamp: now,
    machineId: inspectionData['lineId'] ?? '',
    shift: inspectionData['shift'] ?? '',
    batchNumber: inspectionData['fullSystemLotNo'] ?? '',
    size: inspectionData['size'] ?? '',
    sampleSize: inspectionData['sampleSize'] ?? 0,
    dimensions: inspectionData['dimensions'] ?? {},
    dimensionMins: inspectionData['dimensionStats'] ?? {},
    defects: inspectionData['defects'] ?? {},
    verdict: inspectionData['overallVerdict'] === 'PASS' ? 'PASSED' : 'FAILED',
    totalCarton: inspectionData['totalCarton'],
    gloveWeight: inspectionData['gloveWeight'],
    profileId: inspectionData['profileId'] ?? '',
    amendmentStatus: 'PENDING_APPROVAL',
  };
}
