/**
 * @file amendmentReason.sync.test.ts
 * @description Machine-enforced drift guard for the amendment reason vocabulary.
 *
 * The frontend cannot IMPORT from backend/ at build time (tsconfig.app.json is
 * `include: ["src"]`, no path aliases), so backend/src/lib/amendmentReason.ts has
 * a hand-kept mirror at frontend/src/lib/amendmentReason.ts. Vitest resolves
 * through Vite rather than tsconfig, so a TEST can reach across the boundary even
 * though application code cannot — the same technique defaultProfileSeed.sync.test.ts
 * already uses for the default-profile seed (AUDIT_REPORT.md #10).
 *
 * Drift here has a specific, user-visible failure mode: the backend rejects an
 * unrecognised `reasonCode` with a 400, so a code added to the dropdown alone
 * would render, be selectable, and then fail every submission that chose it.
 *
 * This import is deliberately test-only. Do NOT copy it into application code.
 */

import { describe, it, expect } from 'vitest';

import * as backend from '../../../../backend/src/lib/amendmentReason';
import * as frontend from '../amendmentReason';

describe('amendmentReason — backend canonical vs frontend mirror', () => {
  it('exposes the same codes, in the same order', () => {
    // Order matters: it is the dropdown's option order.
    expect([...frontend.AMENDMENT_REASON_CODES]).toEqual([...backend.AMENDMENT_REASON_CODES]);
  });

  it('exposes the same labels', () => {
    expect(frontend.AMENDMENT_REASON_LABELS).toEqual(backend.AMENDMENT_REASON_LABELS);
  });

  it('agrees on validity for every code and for the values that must be rejected', () => {
    const cases: unknown[] = [
      ...backend.AMENDMENT_REASON_CODES,
      'OTHER ',
      'other',
      'wrong inpsection profile',
      '',
      undefined,
      null,
      0,
      {},
    ];
    for (const value of cases) {
      expect(
        frontend.isAmendmentReasonCode(value),
        `disagreement on ${JSON.stringify(value)}`,
      ).toBe(backend.isAmendmentReasonCode(value));
    }
  });

  it('keeps the note-required rule scoped to OTHER only', () => {
    // Frontend-only helper (the backend has no equivalent — it accepts an empty
    // note for any code), so this asserts the rule itself rather than parity.
    expect(frontend.requiresSupervisorNote('OTHER')).toBe(true);
    for (const code of frontend.AMENDMENT_REASON_CODES.filter((c) => c !== 'OTHER')) {
      expect(frontend.requiresSupervisorNote(code)).toBe(false);
    }
    expect(frontend.requiresSupervisorNote('')).toBe(false);
  });
});
