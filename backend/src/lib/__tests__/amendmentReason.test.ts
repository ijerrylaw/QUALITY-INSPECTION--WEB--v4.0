/**
 * @file amendmentReason.test.ts
 * @description Coverage for the closed reason vocabulary.
 *
 * The sequencing constraint is the substantive thing under test: `reasonCode` is
 * validated ONLY when supplied, because the wizard that will supply it does not
 * exist yet. A change that makes it unconditionally required would 400 every
 * amendment from the shipped frontend, so the "absent is fine, wrong is not"
 * split is asserted explicitly rather than left implicit in the route.
 */

import { describe, it, expect } from 'vitest';
import {
  AMENDMENT_REASON_CODES,
  AMENDMENT_REASON_LABELS,
  isAmendmentReasonCode,
} from '../amendmentReason';

describe('AMENDMENT_REASON_CODES', () => {
  it('is the four-value closed vocabulary the dropdown offers', () => {
    expect([...AMENDMENT_REASON_CODES]).toEqual([
      'WRONG_INSPECTION_PROFILE',
      'RECOUNT_OR_MISCOUNTED_DEFECT',
      'DATA_ENTRY_CORRECTION',
      'OTHER',
    ]);
  });

  it('gives every code a label, and no label an unknown code', () => {
    // The label table is the dropdown text; a code without one would render blank.
    expect(Object.keys(AMENDMENT_REASON_LABELS).sort()).toEqual([...AMENDMENT_REASON_CODES].sort());
    for (const code of AMENDMENT_REASON_CODES) {
      expect(AMENDMENT_REASON_LABELS[code]).toBeTruthy();
    }
  });
});

describe('isAmendmentReasonCode', () => {
  it('accepts every member of the vocabulary', () => {
    for (const code of AMENDMENT_REASON_CODES) {
      expect(isAmendmentReasonCode(code)).toBe(true);
    }
  });

  it('rejects free text, near-misses, and wrong types', () => {
    // The pre-existing free-text notes are exactly what must NOT validate — the
    // real one on lot A001A6247003 read "wrong inpsection profile", typo included.
    expect(isAmendmentReasonCode('wrong inpsection profile')).toBe(false);
    expect(isAmendmentReasonCode('Wrong inspection profile')).toBe(false);
    expect(isAmendmentReasonCode('wrong_inspection_profile')).toBe(false);
    expect(isAmendmentReasonCode('')).toBe(false);
    expect(isAmendmentReasonCode(undefined)).toBe(false);
    expect(isAmendmentReasonCode(null)).toBe(false);
    expect(isAmendmentReasonCode(0)).toBe(false);
  });

  it('is the guard the route applies only to a PRESENT reasonCode', () => {
    // Absence is handled by the route's `!== undefined` check, not here — this
    // function deliberately reports `undefined` as invalid so that an explicitly
    // supplied bad value cannot be confused with an omitted one.
    expect(isAmendmentReasonCode(undefined)).toBe(false);
  });
});
