/**
 * @file evaluateAQLVerdict.test.ts
 * @description Direct engine-level coverage for evaluateAQLVerdict()'s GRANULAR
 * per-defect grading — closes the second half of AUDIT_REPORT.md #33.
 *
 * Prior to this file `evaluateAQLVerdict()` was invoked by zero tests. The
 * GRANULAR rule (ISO2859_MATH_ENGINE.md §2) is: each defect TYPE in a category
 * is checked independently against the category's Ac; the category fails if ANY
 * single type's count exceeds Ac, and every failing type is reported. It is NOT
 * "grade the single worst type" — a documented past point of confusion. These
 * tests pin that behaviour to real ISO 2859-1 matrix values.
 *
 * Fixture: sampleSize 125 (this app's standard sample size, an exact bracket so
 * no snapping is involved) with AQL '2.5' → {ac: 7, re: 8} from the real matrix.
 * Because Re === Ac + 1 for every cell (single-sampling design), a count of 8
 * (exactly Re) is unambiguously a failure under `count > ac`.
 *
 * The engine is pure (no I/O, no Prisma), so this runs under the repo-root
 * vitest with no extra config — same as the sibling suites in this directory.
 */

import { describe, it, expect } from 'vitest';

import { evaluateAQLVerdict } from '../aqlEvaluator';
import type { AQLCategory, DefectDefinition } from '../aqlEvaluator';
import { ISO_2859_MATRIX } from '../iso2859-matrix';

const SAMPLE_SIZE = 125;
/** The real matrix cell every assertion below is pinned to: {ac: 7, re: 8}. */
const AC7 = ISO_2859_MATRIX['125']['2.5'];

/** One GRANULAR category "VISUAL" at AQL '2.5' (→ ac 7 / re 8 at n=125). */
const VISUAL: AQLCategory = {
  id: 'cat_visual',
  name: 'VISUAL',
  aqlLevel: '2.5',
  evaluationMode: 'GRANULAR',
};

/** Three defect types mapped to VISUAL via currentClass === category.name. */
const DEFS: DefectDefinition[] = [
  { id: 'def_a', name: 'Scratch', currentClass: 'VISUAL' },
  { id: 'def_b', name: 'Pinhole', currentClass: 'VISUAL' },
  { id: 'def_c', name: 'Discoloration', currentClass: 'VISUAL' },
];

function run(
  defectCounts: Record<string, number>,
  categories: AQLCategory[] = [VISUAL],
  defectDefinitions: DefectDefinition[] = DEFS,
) {
  return evaluateAQLVerdict({ sampleSize: SAMPLE_SIZE, categories, defectDefinitions, defectCounts });
}

describe('evaluateAQLVerdict — GRANULAR per-defect grading (#33)', () => {
  it('pins the fixture to the real matrix cell', () => {
    expect(AC7).toEqual({ ac: 7, re: 8 });
  });

  it('count 7 (exactly Ac) → that defect type PASSES', () => {
    const { verdict, categoryResults } = run({ def_a: 7 });

    expect(verdict).toBe('PASSED');
    expect(categoryResults).toHaveLength(1);
    expect(categoryResults[0].passed).toBe(true);
    expect(categoryResults[0].failingDefects).toEqual([]);
    expect(categoryResults[0].threshold).toEqual(AC7);
  });

  it('count 8 (== Re) → FAIL: Re is Ac+1, so there is no accept zone above Ac', () => {
    const { verdict, categoryResults } = run({ def_a: 8 });

    expect(verdict).toBe('FAILED');
    expect(categoryResults[0].passed).toBe(false);
    expect(categoryResults[0].failingDefects).toHaveLength(1);
    expect(categoryResults[0].failingDefects[0]).toMatchObject({
      defectId: 'def_a',
      defectName: 'Scratch',
      count: 8,
      threshold: AC7, // carries {ac:7, re:8} for the audit trail
    });
  });

  it('count 10 (clearly over Re) → FAIL for that type', () => {
    const { verdict, categoryResults } = run({ def_a: 10 });

    expect(verdict).toBe('FAILED');
    expect(categoryResults[0].failingDefects).toHaveLength(1);
    expect(categoryResults[0].failingDefects[0].count).toBe(10);
  });

  it('failure is scoped to the failing type only — passing siblings are NOT dragged in', () => {
    // def_a fails (10 > 7); def_b sits exactly on Ac (7, passes); def_c well under (3).
    const { verdict, categoryResults } = run({ def_a: 10, def_b: 7, def_c: 3 });

    expect(verdict).toBe('FAILED');
    expect(categoryResults[0].passed).toBe(false);

    const failingIds = categoryResults[0].failingDefects.map((d) => d.defectId);
    expect(failingIds).toEqual(['def_a']);
    expect(failingIds).not.toContain('def_b');
    expect(failingIds).not.toContain('def_c');

    // totalCount is still the category sum (10 + 7 + 3), independent of pass/fail.
    expect(categoryResults[0].totalCount).toBe(20);
  });

  it('every type is evaluated independently — multiple types can fail at once, not just the max', () => {
    // Both def_a (8) and def_b (9) exceed Ac 7; def_c (3) does not. The engine
    // must report BOTH failures, not collapse to the single worst count (9).
    const { verdict, categoryResults } = run({ def_a: 8, def_b: 9, def_c: 3 });

    expect(verdict).toBe('FAILED');

    const failing = categoryResults[0].failingDefects;
    expect(failing.map((d) => d.defectId).sort()).toEqual(['def_a', 'def_b']);
    expect(failing.find((d) => d.defectId === 'def_a')?.count).toBe(8);
    expect(failing.find((d) => d.defectId === 'def_b')?.count).toBe(9);
    expect(failing.map((d) => d.defectId)).not.toContain('def_c');
  });

  it('a clean category (all types ≤ Ac) PASSES with an empty failingDefects list', () => {
    const { verdict, categoryResults } = run({ def_a: 7, def_b: 0, def_c: 6 });

    expect(verdict).toBe('PASSED');
    expect(categoryResults[0].passed).toBe(true);
    expect(categoryResults[0].failingDefects).toEqual([]);
  });

  it('one failing GRANULAR category fails the whole lot even when another passes', () => {
    const FINISH: AQLCategory = {
      id: 'cat_finish',
      name: 'FINISH',
      aqlLevel: '2.5',
      evaluationMode: 'GRANULAR',
    };
    const defs: DefectDefinition[] = [
      ...DEFS,
      { id: 'def_f', name: 'Gloss defect', currentClass: 'FINISH' },
    ];

    const { verdict, categoryResults } = run(
      { def_a: 2, def_f: 9 }, // VISUAL clean, FINISH fails
      [VISUAL, FINISH],
      defs,
    );

    expect(verdict).toBe('FAILED');
    expect(categoryResults).toHaveLength(2);
    expect(categoryResults.find((c) => c.categoryName === 'VISUAL')?.passed).toBe(true);
    expect(categoryResults.find((c) => c.categoryName === 'FINISH')?.passed).toBe(false);
  });
});

describe('evaluateAQLVerdict — RECORD ONLY is skipped, never treated as GRANULAR', () => {
  it("a category with evaluationMode '' produces no result and cannot affect the verdict", () => {
    const AUDIT: AQLCategory = {
      id: 'cat_audit',
      name: 'AUDIT',
      aqlLevel: 'RECORD ONLY',
      evaluationMode: '', // RECORD ONLY / true-exclusion skip path
    };
    const defs: DefectDefinition[] = [
      ...DEFS,
      { id: 'def_audit', name: 'Cosmetic note', currentClass: 'AUDIT' },
    ];

    // def_audit = 50 would blow past any Ac if it were graded; VISUAL is clean.
    const { verdict, categoryResults } = run(
      { def_a: 1, def_audit: 50 },
      [VISUAL, AUDIT],
      defs,
    );

    expect(verdict).toBe('PASSED');
    // No CategoryResult is built for the '' category at all.
    expect(categoryResults.map((c) => c.categoryName)).toEqual(['VISUAL']);
    expect(categoryResults.some((c) => c.categoryName === 'AUDIT')).toBe(false);
  });
});
