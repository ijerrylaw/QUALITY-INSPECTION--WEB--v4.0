/**
 * @file findActualAqlAchieved.test.ts
 * @description Focused unit coverage for the Actual-AQL achievement ladder,
 * added with the AUDIT_REPORT.md #29 fix (narrow the ladder to stop at '6.5',
 * matching QualityRules.tsx's assignable ISO_WHITELIST).
 *
 * The engine is pure (no I/O, no Prisma), so this runs under the repo-root
 * vitest with no config or harness. It is intentionally small — a broader
 * backend engine harness remains AUDIT_REPORT.md #33.
 */

import { describe, it, expect } from 'vitest';

import { findActualAqlAchieved } from '../aqlEvaluator';
import { ACHIEVABLE_AQL_LEVELS, ISO_2859_MATRIX } from '../iso2859-matrix';

describe('findActualAqlAchieved — ladder is narrowed to assignable levels (#29)', () => {
  it('never scans or reports \'10\', even for a count that only the \'10\' matrix column would accept', () => {
    // n=125: '6.5' → Ac 14, '10' → Ac 21. A count of 20 fit under '10' before
    // the narrowing and reported ACHIEVED '10'; it must now be EXCEEDS_ALL.
    const result = findActualAqlAchieved(125, 20);

    expect(result.status).toBe('EXCEEDS_ALL');
    expect(result.aqlLevel).toBeNull();
    // Carries the loosest *achievable* level's Ac/Re — '6.5', not '10'.
    expect(result.threshold).toEqual(ISO_2859_MATRIX['125']['6.5']);
    expect(result.threshold).not.toEqual(ISO_2859_MATRIX['125']['10']);
    expect(result.evaluatedCount).toBe(20);
  });

  it('reports \'6.5\' as the loosest achievable ACHIEVED level', () => {
    // n=125, '6.5' → Ac 14: a count of exactly 14 still passes at 6.5.
    const result = findActualAqlAchieved(125, 14);

    expect(result.status).toBe('ACHIEVED');
    expect(result.aqlLevel).toBe('6.5');
    expect(result.threshold).toEqual(ISO_2859_MATRIX['125']['6.5']);
  });

  it('still resolves the tightest level for a clean lot', () => {
    const result = findActualAqlAchieved(125, 0);

    expect(result.status).toBe('ACHIEVED');
    expect(result.aqlLevel).toBe('0.65');
  });

  it('sweeps every bracket × count and never yields aqlLevel \'10\'', () => {
    const brackets = Object.keys(ISO_2859_MATRIX).map(Number);

    for (const n of brackets) {
      for (let count = 0; count <= 60; count++) {
        const { aqlLevel } = findActualAqlAchieved(n, count);
        expect(aqlLevel).not.toBe('10');
        if (aqlLevel !== null) {
          expect(ACHIEVABLE_AQL_LEVELS).toContain(aqlLevel);
        }
      }
    }
  });
});
