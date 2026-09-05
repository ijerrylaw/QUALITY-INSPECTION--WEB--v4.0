/**
 * @file diffTree.test.ts
 * @description Regression coverage for `NON_SUBSTANTIVE_DIFF_FIELDS`.
 *
 * Fixtures are the real cross-profile amendment on lot A001A6247003
 * (FACTORY STANDARD -> MEDLINE), copied out of dev.db, so the shape asymmetry
 * the exclusion list exists to absorb is reproduced exactly: `originalValues` is
 * the raw Prisma row (JSON-encoded strings, all 27 columns) while `newValues` is
 * the frontend payload (live objects, a 17-key subset).
 */

import { describe, it, expect } from 'vitest';
import { buildDiffTree, collectUnchanged, NON_SUBSTANTIVE_DIFF_FIELDS } from '../diffTree';

const DEFECTS: Record<string, number> = {
  def_cut: 1, def_mixed_type: 1, def_touching: 1, def_burst: 1,
  def_pinhole_at_finger: 1, def_pinhole_at_palm: 1, def_lump: 1,
  def_thin_layer: 1, def_dirt_stain: 1, def_wet_glove_1: 1,
  def_discoloration: 1, def_former_crack: 1, def_flocking: 1,
  def_porous: 1, def_flow_mark: 1, def_rough_surface: 1,
  def_sagging: 3, def_donning: 1, def_odour: 1,
};

const DIMENSIONS: Record<string, string[]> = {
  __fixed_length__: ['240', '240', '241', '240', '240'],
  __fixed_palm__: ['95', '95', '95', '95', '95'],
  cuffThickness: ['0.040', '0.040', '0.040', '0.041', '0.040'],
  palmThickness: ['0.050', '0.050', '0.050', '0.050', '0.050'],
  fingerThickness: ['0.060', '0.060', '0.060', '0.061', '0.060'],
};

/**
 * The real frozen weight result. Its nested shape is the point: before
 * `gloveWeightSnapshot` was excluded, `oneSidedNode()` recursed into this
 * container and emitted one "removed" leaf PER KEY, all of them labelled with
 * the same field name because `labelForRow` only reads `keyPath[0]`.
 */
const GLOVE_WEIGHT_SNAPSHOT = JSON.stringify({
  id: '__fixed_weight__',
  name: 'GLOVE WEIGHT',
  min: 2.94,
  max: 2.94,
  avg: 2.94,
  fails: [false],
  threshold: 2.8,
  maxThreshold: 3.2,
  isMin: false,
  isGraded: true,
  failed: false,
});

/** Raw Prisma row, as `AmendmentLog.originalValues` stores it. */
const ORIGINAL_VALUES: Record<string, unknown> = {
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
  defects: JSON.stringify(DEFECTS),
  verdict: 'FAILED',
  aadObjectId: '65a08637-f1c1-4082-9aa0-3b40cfa67e21',
  userPrincipalName: 'jerrylaw@oneglovegroup.com',
  displayName: 'Jerry Law',
  pinUserId: null,
  amendmentStatus: 'UNMODIFIED',
  totalCarton: 18,
  gloveWeight: 2.94,
  profileId: 'prof_default',
  gradingSnapshot: '[{"id":"AND","name":"AND"}]',
  gradingSnapshotProfileName: 'FACTORY STANDARD',
  gloveWeightSnapshot: GLOVE_WEIGHT_SNAPSHOT,
  createdAt: '2026-09-04T09:59:00.000Z',
  updatedAt: '2026-09-04T09:59:00.000Z',
};

/** Frontend payload, as `AmendmentLog.newValues` stores it. */
const NEW_VALUES: Record<string, unknown> = {
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
  defects: { ...DEFECTS, def_thin_weak_spot: 1, def_shining_oily_mark: 1 },
  verdict: 'FAILED',
  totalCarton: 18,
  gloveWeight: 2.94,
  profileId: 'prof_1787197871523',
  amendmentStatus: 'PENDING_APPROVAL',
};

describe('NON_SUBSTANTIVE_DIFF_FIELDS — gloveWeightSnapshot', () => {
  it('excludes gloveWeightSnapshot from the tree entirely', () => {
    const tree = buildDiffTree(ORIGINAL_VALUES, NEW_VALUES);
    expect(Object.keys(tree.children ?? {})).not.toContain('gloveWeightSnapshot');
  });

  it('no longer emits a one-sided "removed" subtree for the frozen weight result', () => {
    // The visible bug: one row per nested key of the DimensionResult, every one
    // of them labelled GLOVEWEIGHTSNAPSHOT because labelForRow reads keyPath[0].
    const tree = buildDiffTree(ORIGINAL_VALUES, NEW_VALUES);
    const removed = Object.entries(tree.children ?? {}).filter(([, n]) => n.status === 'removed');
    expect(removed).toEqual([]);
  });

  it('leaves no field for the "Other Fields" catch-all section to render', () => {
    // AmendmentDiffView derives that section from whatever top-level keys aren't
    // claimed by Batch Setup / Dimensions / Defects / Verdict. gloveWeightSnapshot
    // was the only occupant, so excluding it empties the section rather than
    // merely tidying it.
    const SECTION_FIELDS = new Set([
      'productCode', 'profileId', 'productionDate', 'samplingTime', 'machineId',
      'shift', 'batchNumber', 'size', 'sampleSize', 'totalCarton', 'gloveWeight',
      'dimensions', 'dimensionMins', 'defects', 'verdict',
    ]);
    const tree = buildDiffTree(ORIGINAL_VALUES, NEW_VALUES);
    const otherFields = Object.keys(tree.children ?? {}).filter((k) => !SECTION_FIELDS.has(k));
    expect(otherFields).toEqual([]);
  });

  it('does not count it toward the "N unchanged fields not shown" summary either', () => {
    const tree = buildDiffTree(ORIGINAL_VALUES, NEW_VALUES);
    expect(collectUnchanged(tree).map((e) => e.path)).not.toContain('gloveWeightSnapshot');
  });

  it('reproduces the bug when the field is removed from the exclusion set', () => {
    // Non-vacuity guard: buildDiffTree takes excludeKeys, so the pre-fix
    // behaviour is reproducible exactly. If this ever stops failing-shaped, the
    // assertions above have stopped testing anything.
    const preFix = new Set(NON_SUBSTANTIVE_DIFF_FIELDS);
    preFix.delete('gloveWeightSnapshot');

    const tree = buildDiffTree(ORIGINAL_VALUES, NEW_VALUES, preFix);
    const node = tree.children?.['gloveWeightSnapshot'];

    expect(node?.status).toBe('removed');
    // One "removed" leaf per key of the frozen DimensionResult — the repeated
    // GLOVEWEIGHTSNAPSHOT rows seen live on this lot.
    expect(Object.keys(node?.children ?? {})).toHaveLength(11);
  });

  it('sits alongside the other server-frozen grading fields it belongs with', () => {
    for (const frozen of ['gradingSnapshot', 'gradingSnapshotProfileName', 'gloveWeightSnapshot']) {
      expect(NON_SUBSTANTIVE_DIFF_FIELDS.has(frozen)).toBe(true);
    }
  });

  it('still reports the real changes — profileId and the two added defects', () => {
    // Guard against over-exclusion: the fix must not swallow anything genuine.
    const tree = buildDiffTree(ORIGINAL_VALUES, NEW_VALUES);
    const changed = Object.entries(tree.children ?? {})
      .filter(([, n]) => n.status !== 'unchanged')
      .map(([k]) => k)
      .sort();

    expect(changed).toEqual(['defects', 'profileId', 'submissionTimestamp'].filter(
      (k) => !NON_SUBSTANTIVE_DIFF_FIELDS.has(k),
    ));
    expect(changed).toEqual(['defects', 'profileId']);

    const defects = tree.children?.['defects']?.children ?? {};
    expect(defects['def_thin_weak_spot']?.status).toBe('added');
    expect(defects['def_shining_oily_mark']?.status).toBe('added');
  });
});
