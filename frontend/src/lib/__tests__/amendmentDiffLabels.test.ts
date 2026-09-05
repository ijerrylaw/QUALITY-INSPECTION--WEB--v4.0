/**
 * @file amendmentDiffLabels.test.ts
 * @description Coverage for the category-aware cross-profile defect diffing
 * added for AUDIT_REPORT.md #42 — `detectDefectCategoryChange()` and
 * `resolveCrossProfileDefectContext()`.
 *
 * Fixtures are modeled directly on the real cross-profile amendment
 * investigated for #42 (lot A001A6247003, submission
 * `cmtms8d6t0006ukc48lqk0ozu`): FACTORY STANDARD's real BARRIER/RECORD ONLY/
 * OTHERS categories and MEDLINE's real BARRIER/VISUAL_* categories, with the
 * exact same category ids and the three defects that exposed the bug
 * (`def_sagging`, `def_donning`, `def_odour`). Deliberately uses `aql`/
 * `evalMode` (not `aqlLevel`/`evaluationMode`) for every category — that is
 * the field shape `GET /api/config` actually emits
 * (`config.routes.ts`'s `reconstructInspectionProfiles()`); `config.
 * inspectionProfiles` is that raw response, never passed through
 * `getResolvedProfile()`'s dual-field normalization. A fixture using the
 * canonical field names instead would pass even if the real dual-spelling
 * read broke — which it did, once, while writing this fix (see
 * `buildDefectCategoryMap`'s comment in `amendmentDiffLabels.ts`).
 */

import { describe, it, expect } from 'vitest';
import {
  detectDefectCategoryChange,
  resolveCrossProfileDefectContext,
} from '../amendmentDiffLabels';
import type { DefectCategoryInfo } from '../amendmentDiffLabels';
import type { AppConfig } from '../../context/ConfigContext';

// ── detectDefectCategoryChange — unit level ────────────────────────────────

const barrier: DefectCategoryInfo = {
  categoryId: 'BARRIER',
  categoryName: 'BARRIER',
  evaluationMode: 'CUMULATIVE',
  aqlLevel: '1.0',
};

const recordOnly: DefectCategoryInfo = {
  categoryId: 'cat_1787654050629',
  categoryName: 'RECORD ONLY',
  evaluationMode: '',
  aqlLevel: 'RECORD ONLY',
};

const barrierGranular: DefectCategoryInfo = {
  // Same category id as `barrier`, different evaluationMode — the
  // same-category-different-mode case DATA_SCHEMAS_AND_TYPES.md §2.2
  // documents as legal (no shipped profile pair actually does this for a
  // shared category, but the detector must not assume it can't happen).
  categoryId: 'BARRIER',
  categoryName: 'BARRIER',
  evaluationMode: 'GRANULAR',
  aqlLevel: '1.0',
};

describe('detectDefectCategoryChange', () => {
  it('returns null when category and evalMode are identical on both sides', () => {
    expect(detectDefectCategoryChange(barrier, { ...barrier })).toBeNull();
  });

  it("'orphaned' — covered before, not covered after (the real def_donning/def_odour case)", () => {
    const change = detectDefectCategoryChange(recordOnly, undefined);
    expect(change).toEqual({ kind: 'orphaned', before: recordOnly, after: null });
  });

  it("'moved' — different category id on each side (the real def_sagging case: RECORD ONLY -> BARRIER)", () => {
    const change = detectDefectCategoryChange(recordOnly, barrier);
    expect(change).toEqual({ kind: 'moved', before: recordOnly, after: barrier });
  });

  it("'evalModeChanged' — same category id, different evaluationMode", () => {
    const change = detectDefectCategoryChange(barrier, barrierGranular);
    expect(change).toEqual({ kind: 'evalModeChanged', before: barrier, after: barrierGranular });
  });

  it('returns null when the defect is uncovered on BOTH sides — nothing to report', () => {
    expect(detectDefectCategoryChange(undefined, undefined)).toBeNull();
  });

  it('returns null for "newly covered" (uncovered before, covered after) — not one of the three flagged cases', () => {
    expect(detectDefectCategoryChange(undefined, barrier)).toBeNull();
  });
});

// ── resolveCrossProfileDefectContext — real FACTORY STANDARD / MEDLINE shapes ──

const FACTORY_ID = 'prof_default';
const MEDLINE_ID = 'prof_1787197871523';

function buildConfig(): AppConfig {
  return {
    id: '1', companyName: '', portalTitle: '', logoImage: null, accentColor: 'cobalt',
    productCodes: [], lines: [], shifts: [], sides: [], sizes: [], sampleSizes: [125],
    productMatrixConfig: {}, products: {},
    skuMaterials: [], skuWeights: [], skuColors: [], skuTreatments: [], skuLengths: [], skuTextures: [],
    dimensions: [], targetWeight: { target: 0, tolerance: 0 },
    inspectionProfiles: [
      {
        id: FACTORY_ID,
        name: 'FACTORY STANDARD',
        isDefault: true,
        aqlCategories: [
          { id: 'BARRIER', name: 'BARRIER', aql: '1.0', evalMode: 'CUMULATIVE' },
          { id: 'cat_1787210905657', name: 'OTHERS', aql: 'PASS/FAIL', evalMode: 'N/A' },
          { id: 'cat_1787654050629', name: 'RECORD ONLY', aql: 'RECORD ONLY', evalMode: '' },
        ],
        defectDefinitions: [
          { id: 'def_burst', name: 'Burst', categoryId: 'BARRIER' },
          { id: 'def_donning', name: 'Donning', categoryId: 'cat_1787210905657' },
          { id: 'def_odour', name: 'Odour', categoryId: 'cat_1787210905657' },
          { id: 'def_sagging', name: 'Sagging', categoryId: 'cat_1787654050629' },
        ],
      },
      {
        id: MEDLINE_ID,
        name: 'MEDLINE',
        isDefault: false,
        aqlCategories: [
          // Same canonical id + evalMode as FACTORY's BARRIER — def_burst is
          // unaffected by the profile switch.
          { id: 'BARRIER', name: 'BARRIER', aql: '1.0', evalMode: 'CUMULATIVE' },
          // No OTHERS-equivalent category at all — the real reason
          // def_donning/def_odour become orphaned.
        ],
        defectDefinitions: [
          { id: 'def_burst', name: 'Burst', categoryId: 'BARRIER' },
          // def_sagging moves here under MEDLINE — was RECORD ONLY (excluded)
          // under FACTORY.
          { id: 'def_sagging', name: 'Sagging', categoryId: 'BARRIER' },
        ],
      },
    ],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as AppConfig;
}

describe('resolveCrossProfileDefectContext — real FACTORY STANDARD -> MEDLINE shapes', () => {
  const config = buildConfig();
  const ctx = resolveCrossProfileDefectContext(config, FACTORY_ID, MEDLINE_ID);

  it('resolves both sides without marking either unavailable', () => {
    expect(ctx.before.unavailable).toBe(false);
    expect(ctx.after.unavailable).toBe(false);
    expect(ctx.unavailable).toBe(false);
  });

  it('def_sagging: detected as moved (RECORD ONLY -> BARRIER), not merely unchanged', () => {
    const change = detectDefectCategoryChange(
      ctx.before.categories['def_sagging'],
      ctx.after.categories['def_sagging'],
    );
    expect(change?.kind).toBe('moved');
    expect(change?.before?.categoryName).toBe('RECORD ONLY');
    expect(change?.before?.evaluationMode).toBe('');
    expect(change?.after?.categoryName).toBe('BARRIER');
    expect(change?.after?.evaluationMode).toBe('CUMULATIVE');
  });

  it('def_donning / def_odour: detected as orphaned — no category under MEDLINE', () => {
    expect(ctx.after.categories['def_donning']).toBeUndefined();
    expect(ctx.after.categories['def_odour']).toBeUndefined();

    const donning = detectDefectCategoryChange(ctx.before.categories['def_donning'], ctx.after.categories['def_donning']);
    const odour = detectDefectCategoryChange(ctx.before.categories['def_odour'], ctx.after.categories['def_odour']);
    expect(donning?.kind).toBe('orphaned');
    expect(odour?.kind).toBe('orphaned');
  });

  it('def_burst: unaffected by the profile switch (same category, same evalMode)', () => {
    const change = detectDefectCategoryChange(
      ctx.before.categories['def_burst'],
      ctx.after.categories['def_burst'],
    );
    expect(change).toBeNull();
  });

  it('merged labels fall back to the before-profile name for an orphaned defect — never a raw id when a real name is available', () => {
    // The exact bug found in #42: resolving labels from only the proposed
    // profile rendered def_donning/def_odour as raw ids because MEDLINE's
    // defectDefinitions doesn't list them at all.
    expect(ctx.labels['def_donning']).toBe('Donning');
    expect(ctx.labels['def_odour']).toBe('Odour');
  });

  it('reads aql/evalMode (the real API field names), not aqlLevel/evaluationMode', () => {
    // Regression guard for the exact bug this fix introduced and then caught:
    // if buildDefectCategoryMap only read the canonical field names, every
    // category's evaluationMode/aqlLevel would silently resolve to ''.
    expect(ctx.before.categories['def_sagging'].evaluationMode).toBe('');
    expect(ctx.before.categories['def_sagging'].aqlLevel).toBe('RECORD ONLY');
    expect(ctx.after.categories['def_sagging'].evaluationMode).toBe('CUMULATIVE');
  });
});

describe('resolveCrossProfileDefectContext — same-profile amendment (the common case)', () => {
  it('produces no category changes when before and after profileId are identical', () => {
    const config = buildConfig();
    const ctx = resolveCrossProfileDefectContext(config, FACTORY_ID, FACTORY_ID);

    for (const defectId of Object.keys(ctx.before.categories)) {
      const change = detectDefectCategoryChange(ctx.before.categories[defectId], ctx.after.categories[defectId]);
      expect(change).toBeNull();
    }
  });
});

describe('resolveCrossProfileDefectContext — unresolvable proposed profile', () => {
  it('marks `unavailable` true and returns empty after-side maps', () => {
    const config = buildConfig();
    const ctx = resolveCrossProfileDefectContext(config, FACTORY_ID, 'prof_deleted');

    expect(ctx.unavailable).toBe(true);
    expect(ctx.after.categories).toEqual({});
    expect(ctx.after.labels).toEqual({});
    // Before-side stays resolvable — labels still fall back to it.
    expect(ctx.labels['def_burst']).toBe('Burst');
  });
});
