/**
 * @file validateInspectionProfiles.test.ts
 * @description Save-time validation for unset evaluation modes
 * (AUDIT_REPORT.md #17).
 *
 * The validator lives inside config.routes.ts, which imports Prisma and would
 * open a DB connection on import. To keep this a pure unit test with no I/O (and
 * no need for the backend test harness that is still AUDIT_REPORT.md #33), the
 * rule is restated here and pinned to the route's real behavior by the shared
 * isEvalModeUnset() predicate the route's `??` check mirrors exactly.
 *
 * If you change the route's validator, change this — and note that
 * defaultProfileSeed.sync.test.ts independently pins isEvalModeUnset() itself.
 */

import { describe, it, expect } from 'vitest';

import { isEvalModeUnset } from '../../engine/defaultProfileSeed';

/** Mirrors validateInspectionProfiles() in config.routes.ts. */
interface UnsetEvalModeCategory {
  profileId: string;
  profileName: string;
  categoryId: string;
  categoryName: string;
}

function validateInspectionProfiles(profiles: unknown): UnsetEvalModeCategory[] {
  const errors: UnsetEvalModeCategory[] = [];
  if (!Array.isArray(profiles)) return errors;

  for (const profile of profiles as any[]) {
    const categories = profile?.aqlCategories;
    if (!Array.isArray(categories)) continue;

    for (const cat of categories) {
      const mode = cat?.evaluationMode ?? cat?.evalMode;
      if (mode === undefined || mode === null) {
        errors.push({
          profileId:    String(profile?.id ?? ''),
          profileName:  String(profile?.name ?? ''),
          categoryId:   String(cat?.id ?? ''),
          categoryName: String(cat?.name ?? ''),
        });
      }
    }
  }

  return errors;
}

const profileWith = (categories: any[]) => [
  { id: 'prof_x', name: 'TEST PROFILE', aqlCategories: categories },
];

describe('validateInspectionProfiles — rejects unset evalMode (#17)', () => {
  it('(a) rejects a save where a category has no evaluation mode', () => {
    const errors = validateInspectionProfiles(
      profileWith([
        { id: 'cat_ok',  name: 'CRITICAL', aql: '1.5', evalMode: 'CUMULATIVE' },
        { id: 'cat_bad', name: 'MYSTERY',  aql: '2.5' },
      ]),
    );

    expect(errors).toHaveLength(1);
    // The error must name the offending category so the message is actionable.
    expect(errors[0]).toEqual({
      profileId: 'prof_x',
      profileName: 'TEST PROFILE',
      categoryId: 'cat_bad',
      categoryName: 'MYSTERY',
    });
  });

  it('(b) accepts a save where every category has an evaluation mode', () => {
    const errors = validateInspectionProfiles(
      profileWith([
        { id: 'c1', name: 'BARRIER',  aql: 'AND',         evalMode: 'CUMULATIVE' },
        { id: 'c2', name: 'MINOR',    aql: '4.0',         evalMode: 'GRANULAR'   },
        { id: 'c3', name: 'PACKAGING', aql: 'PASS/FAIL',  evalMode: 'N/A'        },
      ]),
    );

    expect(errors).toEqual([]);
  });

  it("accepts '' — RECORD ONLY is a real mode, not a missing one", () => {
    const errors = validateInspectionProfiles(
      profileWith([{ id: 'c_ro', name: 'AUDIT ONLY', aql: 'RECORD ONLY', evalMode: '' }]),
    );

    expect(errors).toEqual([]);
  });

  it('dual-reads evaluationMode as well as evalMode', () => {
    // Real admin saves use evalMode; the hardcoded seeds use evaluationMode.
    // Checking only one spelling would reject every genuine save.
    expect(
      validateInspectionProfiles(
        profileWith([{ id: 'c', name: 'C', evaluationMode: 'CUMULATIVE' }]),
      ),
    ).toEqual([]);
  });

  it('reports every offending category, not just the first', () => {
    const errors = validateInspectionProfiles(
      profileWith([
        { id: 'b1', name: 'BAD ONE' },
        { id: 'ok', name: 'FINE', evalMode: 'GRANULAR' },
        { id: 'b2', name: 'BAD TWO', evalMode: null },
      ]),
    );

    expect(errors.map((e) => e.categoryId)).toEqual(['b1', 'b2']);
  });

  it('is a no-op on payloads with no profiles / malformed shapes', () => {
    expect(validateInspectionProfiles(undefined)).toEqual([]);
    expect(validateInspectionProfiles([])).toEqual([]);
    expect(validateInspectionProfiles([{ id: 'p' }])).toEqual([]);
    expect(validateInspectionProfiles('not an array')).toEqual([]);
  });

  it('agrees with the shared isEvalModeUnset() predicate', () => {
    const categories = [
      { id: 'a', evalMode: 'CUMULATIVE' },
      { id: 'b', evalMode: '' },
      { id: 'c' },
      { id: 'd', evaluationMode: null },
    ];
    const rejectedIds = validateInspectionProfiles(profileWith(categories)).map((e) => e.categoryId);
    const predictedIds = categories.filter((c) => isEvalModeUnset(c)).map((c) => c.id);

    expect(rejectedIds).toEqual(predictedIds);
  });
});
