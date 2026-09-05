/**
 * @file amendmentPayload.test.ts
 * @description Guards the one property the acknowledgment gate depends on:
 * the payload sent to the acknowledgment PREVIEW and the payload sent to the
 * SUBMIT must produce the same diff.
 *
 * If they can differ, the server's gate can reject on a change the checklist
 * never rendered a checkbox for. The operator would then be looking at a fully
 * ticked list, a disabled-then-enabled submit button, and a 400 with no
 * corresponding row — with no way forward. Hence: one builder, two calls, and
 * this test pinning that the only field allowed to differ is one the gate
 * excludes.
 */

import { describe, it, expect } from 'vitest';
import { buildAmendmentNewValues } from '../amendmentPayload';

/** Wizard state as the amend-mode prefill leaves it (WizardPage.tsx's mappedData). */
const WIZARD_STATE = {
  profileId: 'prof_1787197871523',
  productCode: 'N030MNV-OC-24FT',
  lineId: 'A001',
  side: 'A',
  sequenceNo: '003',
  shift: 'Shift A (08:00 - 19:59)',
  size: 'M',
  sampleSize: 125,
  totalCarton: 18,
  gloveWeight: 2.94,
  defects: { def_cut: 1, def_thin_weak_spot: 1 },
  qualitative: { def_donning: 'PASS' },
  dimensions: { cuffThickness: ['0.040', '0.040', '0.040', '0.041', '0.040'] },
  dimensionStats: { cuffThickness: { min: 0.04, max: 0.041, avg: 0.0402 } },
  effectiveDate: '2026-09-04T09:58:50.758Z',
  timestamp: '2026-09-04T09:58:50.758Z',
  fullSystemLotNo: 'A001A6247003',
  overallVerdict: 'FAIL',
  _amendSourceId: 'cmtms8d6t0006ukc48lqk0ozu',
};

/** Mirrors AMENDMENT_GATE_EXCLUDED_FIELDS — the fields the gate never diffs. */
const GATE_EXCLUDED = new Set([
  'id', 'createdAt', 'updatedAt', 'submissionTimestamp', 'amendmentStatus',
  'aadObjectId', 'userPrincipalName', 'displayName', 'pinUserId',
  'gradingSnapshot', 'gradingSnapshotProfileName', 'gloveWeightSnapshot',
  'dimensionMins',
]);

function gateRelevant(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !GATE_EXCLUDED.has(k)));
}

describe('buildAmendmentNewValues', () => {
  it('produces identical gate-relevant output across two separate calls', () => {
    // The real sequence: preview builds it at review time, submit rebuilds it on
    // click. Different timestamps, same diff input.
    const preview = buildAmendmentNewValues(WIZARD_STATE, '2026-09-04T10:00:00.000Z');
    const submit = buildAmendmentNewValues(WIZARD_STATE, '2026-09-04T10:05:00.000Z');

    expect(gateRelevant(submit)).toEqual(gateRelevant(preview));
  });

  it('confines the difference to submissionTimestamp, which the gate excludes', () => {
    const a = buildAmendmentNewValues(WIZARD_STATE, '2026-09-04T10:00:00.000Z');
    const b = buildAmendmentNewValues(WIZARD_STATE, '2026-09-04T10:05:00.000Z');

    const differing = Object.keys(a).filter(
      (k) => JSON.stringify((a as any)[k]) !== JSON.stringify((b as any)[k]),
    );
    expect(differing).toEqual(['submissionTimestamp']);
    expect(GATE_EXCLUDED.has('submissionTimestamp')).toBe(true);
  });

  it('maps the wizard field names onto the Submission field names', () => {
    const payload = buildAmendmentNewValues(WIZARD_STATE, '2026-09-04T10:00:00.000Z');

    expect(payload.productionDate).toBe(WIZARD_STATE.effectiveDate);
    expect(payload.samplingTime).toBe(WIZARD_STATE.timestamp);
    expect(payload.machineId).toBe(WIZARD_STATE.lineId);
    expect(payload.batchNumber).toBe(WIZARD_STATE.fullSystemLotNo);
    expect(payload.dimensionMins).toEqual(WIZARD_STATE.dimensionStats);
    expect(payload.defects).toEqual(WIZARD_STATE.defects);
  });

  it('translates the wizard PASS/FAIL verdict into the stored PASSED/FAILED', () => {
    // The gate treats `verdict` as acknowledgeable, so a wrong translation here
    // would surface as a phantom verdict change on every amendment.
    expect(buildAmendmentNewValues({ ...WIZARD_STATE, overallVerdict: 'PASS' }).verdict).toBe('PASSED');
    expect(buildAmendmentNewValues({ ...WIZARD_STATE, overallVerdict: 'FAIL' }).verdict).toBe('FAILED');
  });

  it('does not invent values for an empty draft beyond documented defaults', () => {
    const payload = buildAmendmentNewValues({}, '2026-09-04T10:00:00.000Z');
    expect(payload.productCode).toBe('');
    expect(payload.sampleSize).toBe(0);
    expect(payload.defects).toEqual({});
    expect(payload.dimensions).toEqual({});
    expect(payload.productionDate).toBe('2026-09-04T10:00:00.000Z');
  });
});
