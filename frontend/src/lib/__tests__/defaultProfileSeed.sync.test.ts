/**
 * @file defaultProfileSeed.sync.test.ts
 * @description Machine-enforced drift guard for the canonical default-profile
 * seed (AUDIT_REPORT.md #10 / #17).
 *
 * The frontend cannot IMPORT from backend/ at build time (tsconfig.app.json is
 * `include: ["src"]`, no path aliases), so backend/src/engine/defaultProfileSeed.ts
 * has a hand-kept mirror at frontend/src/lib/defaultProfileSeed.ts.
 *
 * Vitest resolves through Vite rather than tsconfig, so a TEST *can* reach across
 * the boundary even though application code cannot. That is exactly what this file
 * exploits: it imports BOTH halves and asserts they agree, so the drift that
 * produced #10 (BARRIER graded CUMULATIVE server-side while the UI displayed
 * 'N/A') fails CI instead of shipping silently.
 *
 * This import is deliberately test-only. Do NOT copy this pattern into
 * application code — it would not survive the production build.
 */

import { describe, it, expect } from 'vitest';

import * as backend from '../../../../backend/src/engine/defaultProfileSeed';
import * as frontend from '../defaultProfileSeed';

describe('defaultProfileSeed — backend canonical vs frontend mirror', () => {
  it('category seed is identical on both sides', () => {
    expect(frontend.DEFAULT_AQL_CATEGORY_SEED).toEqual(backend.DEFAULT_AQL_CATEGORY_SEED);
  });

  it('defect definition seed is identical on both sides', () => {
    expect(frontend.DEFAULT_DEFECT_DEFINITION_SEED).toEqual(backend.DEFAULT_DEFECT_DEFINITION_SEED);
  });

  it('scalar constants are identical on both sides', () => {
    expect(frontend.DEFAULT_EVAL_MODE).toBe(backend.DEFAULT_EVAL_MODE);
    expect(frontend.DEFAULT_PROFILE_ID).toBe(backend.DEFAULT_PROFILE_ID);
    expect(frontend.EMPTY_EVAL_MODE_IS_RECORD_ONLY).toBe(backend.EMPTY_EVAL_MODE_IS_RECORD_ONLY);
  });

  it('isEvalModeUnset() agrees on every case that matters', () => {
    const cases: unknown[] = [
      undefined,
      null,
      {},
      { evalMode: undefined },
      { evaluationMode: null },
      { evalMode: '' },
      { evaluationMode: '' },
      { evalMode: 'N/A' },
      { evaluationMode: 'CUMULATIVE' },
      { evalMode: 'GRANULAR' },
      { evaluationMode: undefined, evalMode: 'CUMULATIVE' },
      { evaluationMode: undefined, evalMode: '' },
    ];

    for (const c of cases) {
      expect(frontend.isEvalModeUnset(c as never)).toBe(backend.isEvalModeUnset(c as never));
    }
  });
});

describe('defaultProfileSeed — canonical values (AUDIT_REPORT.md #10)', () => {
  /** The three consumer files all derive from this, so asserting it here covers all three. */
  const byId = (id: string) => backend.DEFAULT_AQL_CATEGORY_SEED.find((c) => c.id === id);

  it('BARRIER resolves to CUMULATIVE, not N/A — the #10 disagreement', () => {
    expect(byId('BARRIER')?.evalMode).toBe('CUMULATIVE');
    expect(byId('BARRIER')?.evalMode).not.toBe('N/A');
    // ...and it is the canonical default for an unspecified mode.
    expect(backend.DEFAULT_EVAL_MODE).toBe('CUMULATIVE');
  });

  it("PACKAGING resolves to '' (true-exclusion skip), preserving the 2026-08-25 fix", () => {
    expect(byId('PACKAGING')?.evalMode).toBe('');
    // 'N/A' would be EVALUATED as qualitative rather than skipped — the old bug.
    expect(byId('PACKAGING')?.evalMode).not.toBe('N/A');
  });

  it('keeps the remaining per-category modes distinct (not one blanket default)', () => {
    expect(byId('CRITICAL')?.evalMode).toBe('CUMULATIVE');
    expect(byId('MAJOR')?.evalMode).toBe('CUMULATIVE');
    expect(byId('MINOR')?.evalMode).toBe('GRANULAR');
  });
});

describe("isEvalModeUnset() — '' is RECORD ONLY, never 'unset'", () => {
  it('treats a genuinely absent mode as unset', () => {
    expect(frontend.isEvalModeUnset({})).toBe(true);
    expect(frontend.isEvalModeUnset({ evalMode: undefined })).toBe(true);
    expect(frontend.isEvalModeUnset({ evaluationMode: null })).toBe(true);
    expect(frontend.isEvalModeUnset(null)).toBe(true);
  });

  it("does NOT treat '' as unset — that would break RECORD ONLY", () => {
    expect(frontend.isEvalModeUnset({ evalMode: '' })).toBe(false);
    expect(frontend.isEvalModeUnset({ evaluationMode: '' })).toBe(false);
  });

  it('does not treat any real mode as unset', () => {
    for (const mode of ['CUMULATIVE', 'GRANULAR', 'N/A']) {
      expect(frontend.isEvalModeUnset({ evalMode: mode })).toBe(false);
      expect(frontend.isEvalModeUnset({ evaluationMode: mode })).toBe(false);
    }
  });

  it('dual-reads both spellings (admin saves use evalMode, seeds use evaluationMode)', () => {
    expect(frontend.isEvalModeUnset({ evalMode: 'CUMULATIVE' })).toBe(false);
    expect(frontend.isEvalModeUnset({ evaluationMode: 'CUMULATIVE' })).toBe(false);
  });
});
