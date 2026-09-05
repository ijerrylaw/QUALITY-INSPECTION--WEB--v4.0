/**
 * @file evaluateAQLVerdict.orphanedDefect.test.ts
 * @description Coverage for the orphaned-defect warning added to
 * evaluateAQLVerdict() (AUDIT_REPORT.md #42, Part 2) — a recorded defect
 * count with no matching category anywhere in the active profile.
 *
 * Modeled directly on the real cross-profile amendment investigated for #42
 * (lot A001A6247003, FACTORY STANDARD -> MEDLINE): `def_donning`/`def_odour`
 * belong to FACTORY STANDARD's "OTHERS" category, which MEDLINE's category
 * list has no equivalent for at all — so under MEDLINE's rules those two
 * defect ids match no category and are silently excluded from grading.
 * This file pins two things:
 *
 *   1. The warning fires for a genuinely orphaned defect, naming the id and
 *      count.
 *   2. The warning does NOT fire for a defect whose category exists but is
 *      RECORD_ONLY (evaluationMode '') — that defect is INTENTIONALLY
 *      excluded from grading by its own category's design, which is a
 *      completely different case from "no category claims it at all" and
 *      must not be confused with it (a false positive here would fire on
 *      every single normal submission that uses a RECORD ONLY category).
 *
 * Grading behavior itself is asserted unchanged in both cases — this is a
 * visibility-only addition, per the audit item's explicit scope.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { evaluateAQLVerdict } from '../aqlEvaluator';
import type { AQLCategory, DefectDefinition } from '../aqlEvaluator';

const SAMPLE_SIZE = 125;

/** Mirrors MEDLINE's real BARRIER category (AQL 1.0, CUMULATIVE). */
const BARRIER: AQLCategory = {
  id: 'BARRIER',
  name: 'BARRIER',
  aqlLevel: '1.0',
  evaluationMode: 'CUMULATIVE',
};

/** Mirrors FACTORY STANDARD's real RECORD ONLY category — evaluationMode is
 * the empty string, the actual "skip this category" trigger (ISO2859_MATH_
 * ENGINE.md §2), not a missing/unset value. */
const RECORD_ONLY: AQLCategory = {
  id: 'cat_1787654050629',
  name: 'RECORD ONLY',
  aqlLevel: 'RECORD ONLY',
  evaluationMode: '',
};

const BARRIER_DEFECTS: DefectDefinition[] = [
  { id: 'def_burst', name: 'Burst', categoryId: 'BARRIER' },
];

const RECORD_ONLY_DEFECTS: DefectDefinition[] = [
  { id: 'def_sagging', name: 'Sagging', categoryId: 'cat_1787654050629' },
];

describe('evaluateAQLVerdict — orphaned-defect warning (AUDIT_REPORT.md #42)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when a recorded defect matches no category in the active profile (the real def_donning/def_odour case)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // MEDLINE's real category list has no equivalent for FACTORY's "OTHERS" —
    // def_donning/def_odour (recorded, count 1 each) match nothing here.
    const result = evaluateAQLVerdict({
      sampleSize: SAMPLE_SIZE,
      categories: [BARRIER],
      defectDefinitions: BARRIER_DEFECTS,
      defectCounts: { def_burst: 1, def_donning: 1, def_odour: 1 },
    });

    // Grading behavior is unaffected — the orphaned counts were already
    // silently excluded by construction before this change; the warning
    // only adds visibility.
    expect(result.verdict).toBe('PASSED');
    expect(result.categoryResults).toHaveLength(1);
    expect(result.categoryResults[0].totalCount).toBe(1); // def_burst only

    expect(warnSpy).toHaveBeenCalledTimes(2);
    const messages = warnSpy.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes("'def_donning'") && m.includes('count=1'))).toBe(true);
    expect(messages.some((m) => m.includes("'def_odour'") && m.includes('count=1'))).toBe(true);
  });

  it('does NOT warn for a defect whose category is RECORD_ONLY — intentionally excluded, not orphaned', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = evaluateAQLVerdict({
      sampleSize: SAMPLE_SIZE,
      categories: [BARRIER, RECORD_ONLY],
      defectDefinitions: [...BARRIER_DEFECTS, ...RECORD_ONLY_DEFECTS],
      defectCounts: { def_burst: 1, def_sagging: 3 },
    });

    // RECORD ONLY's defect is excluded from grading by design (empty
    // evaluationMode skips the category entirely) — same as before this change.
    expect(result.verdict).toBe('PASSED');
    expect(result.categoryResults).toHaveLength(1); // only BARRIER produced a CategoryResult
    expect(result.categoryResults[0].totalCount).toBe(1);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns for a genuinely orphaned defect even when every other defect is covered', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    evaluateAQLVerdict({
      sampleSize: SAMPLE_SIZE,
      categories: [BARRIER],
      defectDefinitions: BARRIER_DEFECTS,
      defectCounts: { def_burst: 1, def_unknown_typo: 1 },
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("'def_unknown_typo'");
  });

  it('does not warn when every recorded defect is covered by some category', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    evaluateAQLVerdict({
      sampleSize: SAMPLE_SIZE,
      categories: [BARRIER],
      defectDefinitions: BARRIER_DEFECTS,
      defectCounts: { def_burst: 1 },
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
