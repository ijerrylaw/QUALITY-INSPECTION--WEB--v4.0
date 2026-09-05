/**
 * @file amendmentDiff.test.ts
 * @description Coverage for the acknowledged-changes gate's comparator.
 *
 * Fixtures are the REAL cross-profile amendment that motivated this gate —
 * lot A001A6247003 (FACTORY STANDARD `prof_default` -> MEDLINE
 * `prof_1787197871523`), whose requester noted "wrong inpsection profile" while
 * the same payload also raised `def_thin_weak_spot` and `def_shining_oily_mark`
 * from 0 to 1. Values copied verbatim out of dev.db rather than invented, so the
 * serialization asymmetry the comparator has to survive is reproduced exactly:
 * `originalValues` is the raw Prisma row (defects/dimensions are JSON *strings*)
 * while `newValues` is the frontend payload (the same fields are *objects*).
 */

import { describe, it, expect } from 'vitest';
import {
  computeAmendmentChanges,
  findUnacknowledgedChanges,
  parseAcknowledgedChanges,
  AMENDMENT_GATE_EXCLUDED_FIELDS,
  type AmendmentChange,
} from '../amendmentDiff';

// ── Real fixtures (dev.db, AmendmentLog cmtms9pbq0007ukc4mhomizcn) ──────────

/** The 19 defect ids the inspector actually recorded on this lot. */
const ORIGINAL_DEFECTS: Record<string, number> = {
  def_cut: 1, def_mixed_type: 1, def_touching: 1, def_burst: 1,
  def_pinhole_at_finger: 1, def_pinhole_at_palm: 1, def_lump: 1,
  def_thin_layer: 1, def_dirt_stain: 1, def_wet_glove_1: 1,
  def_discoloration: 1, def_former_crack: 1, def_flocking: 1,
  def_porous: 1, def_flow_mark: 1, def_rough_surface: 1,
  def_sagging: 3, def_donning: 1, def_odour: 1,
};

/** Same 19, plus the two the amendment silently added at count 1. */
const PROPOSED_DEFECTS: Record<string, number> = {
  ...ORIGINAL_DEFECTS,
  def_thin_weak_spot: 1,
  def_shining_oily_mark: 1,
};

const DIMENSIONS: Record<string, string[]> = {
  __fixed_length__: ['240', '240', '241', '240', '240'],
  __fixed_palm__: ['95', '95', '95', '95', '95'],
  cuffThickness: ['0.040', '0.040', '0.040', '0.041', '0.040'],
  palmThickness: ['0.050', '0.050', '0.050', '0.050', '0.050'],
  fingerThickness: ['0.060', '0.060', '0.060', '0.061', '0.060'],
};

/** The stored Prisma row: JSON-encoded strings for the three blob columns. */
function originalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cmtms8d6t0006ukc48lqk0ozu',
    productCode: 'N030MNV-OC-24FT',
    productionDate: '2026-09-04T09:58:50.758Z',
    samplingTime: '2026-09-04T09:58:50.758Z',
    submissionTimestamp: '2026-09-04T09:59:00.000Z',
    machineId: 'A001',
    shift: 'Shift A (08:00 - 19:59)',
    batchNumber: 'A001A6247003',
    size: 'M',
    sampleSize: 125,
    dimensions: JSON.stringify(DIMENSIONS),
    dimensionMins: JSON.stringify({ cuffThickness: { min: 0.04, max: 0.041, avg: 0.0402 } }),
    defects: JSON.stringify(ORIGINAL_DEFECTS),
    verdict: 'FAILED',
    totalCarton: 18,
    gloveWeight: 2.94,
    profileId: 'prof_default',
    amendmentStatus: 'UNMODIFIED',
    gradingSnapshot: '[{"id":"AND"}]',
    gradingSnapshotProfileName: 'FACTORY STANDARD',
    gloveWeightSnapshot: '{"id":"__fixed_weight__","name":"GLOVE WEIGHT","min":2.94}',
    createdAt: '2026-09-04T09:59:00.000Z',
    updatedAt: '2026-09-04T09:59:00.000Z',
    ...overrides,
  };
}

/** The frontend payload: live objects, and a strict subset of the row's keys. */
function proposedPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    productCode: 'N030MNV-OC-24FT',
    productionDate: '2026-09-04T09:58:50.758Z',
    samplingTime: '2026-09-04T09:58:50.758Z',
    submissionTimestamp: '2026-09-04T10:00:35.698Z',
    machineId: 'A001',
    shift: 'Shift A (08:00 - 19:59)',
    batchNumber: 'A001A6247003',
    size: 'M',
    sampleSize: 125,
    dimensions: DIMENSIONS,
    dimensionMins: { cuffThickness: { min: 0.04, max: 0.041, avg: 0.0402 } },
    defects: PROPOSED_DEFECTS,
    verdict: 'FAILED',
    totalCarton: 18,
    gloveWeight: 2.94,
    profileId: 'prof_1787197871523',
    amendmentStatus: 'PENDING_APPROVAL',
    ...overrides,
  };
}

const paths = (changes: AmendmentChange[]): string[] => changes.map((c) => c.path);

// ── The real amendment ─────────────────────────────────────────────────────

describe('computeAmendmentChanges — real lot A001A6247003', () => {
  it('finds exactly the profile switch and the two silently-added defects', () => {
    const changes = computeAmendmentChanges(originalRow(), proposedPayload());

    expect(paths(changes)).toEqual([
      'defects.def_shining_oily_mark',
      'defects.def_thin_weak_spot',
      'profileId',
    ]);
  });

  it('reports an absent-vs-1 defect as 0 -> 1, not as an addition', () => {
    // `defects` is a sparse map: a missing id means "never recorded" (count 0),
    // not "no value to compare". Matching AmendmentDiffView.tsx's display rule
    // is the whole point — the gate must agree with what the reviewer is shown.
    const changes = computeAmendmentChanges(originalRow(), proposedPayload());
    const thinWeakSpot = changes.find((c) => c.path === 'defects.def_thin_weak_spot');

    expect(thinWeakSpot).toEqual({
      path: 'defects.def_thin_weak_spot',
      changeType: 'modified',
      from: 0,
      to: 1,
    });
  });

  it('does not report the 17 defects whose counts are unchanged', () => {
    const changes = computeAmendmentChanges(originalRow(), proposedPayload());
    expect(changes.filter((c) => c.path.startsWith('defects.'))).toHaveLength(2);
  });

  it('survives the JSON-string vs object asymmetry between the two sides', () => {
    // `dimensions` is byte-identical here — a string on the row, an object in the
    // payload. Without normalization every amendment would report it as changed.
    const changes = computeAmendmentChanges(originalRow(), proposedPayload());
    expect(paths(changes)).not.toContain('dimensions.cuffThickness');
  });
});

// ── Exclusions ─────────────────────────────────────────────────────────────

describe('computeAmendmentChanges — gate exclusions', () => {
  it('ignores a field the payload simply omits (untouched, not removed)', () => {
    // An amendment is a Partial<Submission>; the approve route reads every field
    // as `newValues[k] ?? existing[k]`, so omission provably means "keep".
    const proposed = proposedPayload();
    delete proposed['totalCarton'];
    delete proposed['gloveWeight'];

    const changes = computeAmendmentChanges(originalRow(), proposed);
    expect(paths(changes)).not.toContain('totalCarton');
    expect(paths(changes)).not.toContain('gloveWeight');
  });

  it('never asks for acknowledgment of gradingSnapshot or gloveWeightSnapshot', () => {
    // Server-frozen grading data, written by resolveVerdict(), never by an
    // operator. gloveWeightSnapshot in particular is the field the FRONTEND's
    // own exclusion list is missing — this backend list must not copy that gap.
    const changes = computeAmendmentChanges(
      originalRow(),
      proposedPayload({ gradingSnapshot: '[]', gloveWeightSnapshot: null }),
    );
    expect(paths(changes)).not.toContain('gradingSnapshot');
    expect(paths(changes)).not.toContain('gloveWeightSnapshot');
  });

  it('excludes dimensionMins even when it genuinely differs', () => {
    // Derived client-side FROM `dimensions`; acknowledging it would restate the
    // same physical re-measurement up to ten times.
    const changes = computeAmendmentChanges(
      originalRow(),
      proposedPayload({ dimensionMins: { cuffThickness: { min: 0.9, max: 0.9, avg: 0.9 } } }),
    );
    expect(paths(changes)).not.toContain('dimensionMins');
    expect(AMENDMENT_GATE_EXCLUDED_FIELDS.has('dimensionMins')).toBe(true);
  });

  it('does NOT exclude verdict — a proposed verdict change must be acknowledged', () => {
    const changes = computeAmendmentChanges(originalRow(), proposedPayload({ verdict: 'PASSED' }));
    expect(changes).toContainEqual({
      path: 'verdict',
      changeType: 'modified',
      from: 'FAILED',
      to: 'PASSED',
    });
  });

  it('ignores serialization-shape noise (id, timestamps, identity)', () => {
    const changes = computeAmendmentChanges(
      originalRow(),
      proposedPayload({ id: 'different', createdAt: 'later', pinUserId: 'someone' }),
    );
    for (const noisy of ['id', 'createdAt', 'pinUserId', 'submissionTimestamp', 'amendmentStatus']) {
      expect(paths(changes)).not.toContain(noisy);
    }
  });
});

// ── Granularity and change types ───────────────────────────────────────────

describe('computeAmendmentChanges — granularity', () => {
  it('reports a re-measured dimension once, not once per slot', () => {
    const remeasured = { ...DIMENSIONS, cuffThickness: ['0.045', '0.045', '0.045', '0.046', '0.045'] };
    const changes = computeAmendmentChanges(originalRow(), proposedPayload({ dimensions: remeasured }));

    expect(paths(changes)).toContain('dimensions.cuffThickness');
    expect(changes.filter((c) => c.path.startsWith('dimensions.'))).toHaveLength(1);
    expect(paths(changes)).not.toContain('dimensions.cuffThickness.3');
  });

  it('flags a dimension appearing or disappearing as added/removed', () => {
    const withoutPalm = { ...DIMENSIONS };
    delete withoutPalm['palmThickness'];

    const removed = computeAmendmentChanges(originalRow(), proposedPayload({ dimensions: withoutPalm }));
    expect(removed.find((c) => c.path === 'dimensions.palmThickness')?.changeType).toBe('removed');

    const added = computeAmendmentChanges(
      originalRow({ dimensions: JSON.stringify(withoutPalm) }),
      proposedPayload(),
    );
    expect(added.find((c) => c.path === 'dimensions.palmThickness')?.changeType).toBe('added');
  });

  it('treats clearing an optional scalar as removed and setting one as added', () => {
    const cleared = computeAmendmentChanges(originalRow(), proposedPayload({ totalCarton: null }));
    expect(cleared.find((c) => c.path === 'totalCarton')?.changeType).toBe('removed');

    const set = computeAmendmentChanges(
      originalRow({ gloveWeight: null }),
      proposedPayload({ gloveWeight: 3.1 }),
    );
    expect(set.find((c) => c.path === 'gloveWeight')?.changeType).toBe('added');
  });

  it('reports nothing at all for an amendment that changes nothing', () => {
    const unchanged = computeAmendmentChanges(
      originalRow(),
      proposedPayload({ defects: ORIGINAL_DEFECTS, profileId: 'prof_default' }),
    );
    expect(unchanged).toEqual([]);
  });

  it('is order-stable and insensitive to object key order', () => {
    const reordered = Object.fromEntries(Object.entries(ORIGINAL_DEFECTS).reverse());
    const changes = computeAmendmentChanges(
      originalRow(),
      proposedPayload({ defects: reordered, profileId: 'prof_default' }),
    );
    expect(changes).toEqual([]);
  });
});

// ── The gate itself ────────────────────────────────────────────────────────

describe('findUnacknowledgedChanges — the gate decision', () => {
  const detected = () => computeAmendmentChanges(originalRow(), proposedPayload());

  it('(a) passes when every detected change is acknowledged', () => {
    const acknowledged = [
      'profileId',
      'defects.def_thin_weak_spot',
      'defects.def_shining_oily_mark',
    ];
    expect(findUnacknowledgedChanges(detected(), acknowledged)).toEqual([]);
  });

  it('(b) rejects and names exactly the changes that were not acknowledged', () => {
    // The real-world failure: the requester acknowledges the profile switch they
    // meant to make, and nothing else.
    const unacknowledged = findUnacknowledgedChanges(detected(), ['profileId']);

    expect(paths(unacknowledged)).toEqual([
      'defects.def_shining_oily_mark',
      'defects.def_thin_weak_spot',
    ]);
    expect(unacknowledged).toContainEqual({
      path: 'defects.def_thin_weak_spot',
      changeType: 'modified',
      from: 0,
      to: 1,
    });
  });

  it('rejects everything when the acknowledgment set is empty', () => {
    expect(findUnacknowledgedChanges(detected(), [])).toHaveLength(3);
  });

  it('ignores acknowledgment keys the server did not produce', () => {
    // Over-acknowledging is harmless (a stale path from a field edited back to
    // its original value); failing it would be an error the operator can't fix.
    const acknowledged = [
      'profileId',
      'defects.def_thin_weak_spot',
      'defects.def_shining_oily_mark',
      'defects.def_never_touched',
      'someFieldThatDoesNotExist',
    ];
    expect(findUnacknowledgedChanges(detected(), acknowledged)).toEqual([]);
  });
});

// ── Grandfathering ─────────────────────────────────────────────────────────

describe('parseAcknowledgedChanges — absence signalling', () => {
  it('(c) returns null for an absent field, which the route now REJECTS', () => {
    // UPDATED AT THE REQUIRED-FLIP. This parser is unchanged — null still means
    // "the caller sent no field" — but what the route DOES with null inverted:
    // it used to mean "pre-gate client, skip enforcement", and now means
    // "400, acknowledgedChanges is required". The escape hatch existed only so
    // the backend could ship before the wizard that populates the field; the
    // wizard now always sends it, so absence identifies a caller going around
    // the checklist rather than an old client.
    //
    // Kept rather than deleted because null is still a real, distinct parse
    // result that the route has to branch on — see amendmentGateScope.test.ts,
    // which asserts that branch is now a rejection with no skip path left.
    expect(parseAcknowledgedChanges(undefined)).toBeNull();
  });

  it('distinguishes an absent field from an empty array', () => {
    // Still load-bearing after the flip, for a different reason: '[]' is a
    // gate-aware client reporting nothing to acknowledge (enforced normally,
    // and only passing if the server also finds no changes), while null is now
    // an outright rejection. Collapsing the two would either reject a valid
    // no-op amendment or reopen the bypass.
    expect(parseAcknowledgedChanges([])).toEqual([]);
    expect(parseAcknowledgedChanges([])).not.toBeNull();
  });

  it('throws for a present-but-malformed value instead of skipping the gate', () => {
    expect(() => parseAcknowledgedChanges('profileId')).toThrow(/array of change-path strings/);
    expect(() => parseAcknowledgedChanges(['profileId', 42])).toThrow(/array of change-path strings/);
    expect(() => parseAcknowledgedChanges({ profileId: true })).toThrow();
  });

  it('rejects an explicit JSON null rather than reading it as absence', () => {
    // JSON has no `undefined`, so a client that serializes the field as null is
    // sending a malformed value, not omitting it. Treating it as absence would
    // hand any client a one-character way to opt out of the gate.
    expect(() => parseAcknowledgedChanges(null)).toThrow(/array of change-path strings/);
  });
});
