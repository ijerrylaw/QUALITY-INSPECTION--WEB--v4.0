/**
 * @file ConfigContext.evalModeUnset.test.tsx
 * @description Guards getResolvedProfile()'s handling of a category with NO
 * evaluation mode (AUDIT_REPORT.md #17).
 *
 * Before the fix, normalisation wrote `?? 'CUMULATIVE'` silently, so a
 * misconfigured category was indistinguishable from one deliberately set to
 * CUMULATIVE — it rendered and behaved as a real quantitative mode nobody had
 * chosen. The fix keeps a safe display value (throwing would take down the six
 * render-path callers that read this through useMemo) but tags the substitution
 * with `evalModeUnset: true` so it is explicit and catchable.
 *
 * Runs in a REAL browser (Vitest browser mode) — same setup as the sibling
 * wizard tests; ConfigProvider needs real effects and fetch.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { ConfigProvider, useConfig } from '../ConfigContext';
import type { AQLCategory } from '../ConfigContext';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PROFILE_ID = 'prof_evalmode_test';

/**
 * One category per case:
 *   cat_set    — a normal CUMULATIVE category (control)
 *   cat_unset  — NO evalMode/evaluationMode key at all
 *   cat_record — evalMode '' (RECORD ONLY): a REAL value, must NOT read as unset
 *   cat_na     — evalMode 'N/A' (qualitative): also a real value
 */
function mockConfig() {
  return {
    id: '1', companyName: '', portalTitle: '', logoImage: null, accentColor: 'cobalt',
    productCodes: [], lines: [], shifts: [], sides: [], sizes: [], sampleSizes: [125],
    productMatrixConfig: {}, products: {},
    skuMaterials: [], skuWeights: [], skuColors: [], skuTreatments: [], skuLengths: [], skuTextures: [],
    dimensions: [], targetWeight: { target: 0, tolerance: 0 },
    inspectionProfiles: [
      {
        id: PROFILE_ID,
        name: 'EVALMODE TEST',
        isDefault: true,
        aqlCategories: [
          { id: 'cat_set',    name: 'SET',        aql: '1.5',         evalMode: 'CUMULATIVE' },
          { id: 'cat_unset',  name: 'UNSET',      aql: '2.5' },
          { id: 'cat_record', name: 'RECORDONLY', aql: 'RECORD ONLY', evalMode: '' },
          { id: 'cat_na',     name: 'QUAL',       aql: 'PASS/FAIL',   evalMode: 'N/A' },
        ],
        defectDefinitions: [],
      },
    ],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.includes('/api/config')) {
      return new Response(JSON.stringify(mockConfig()), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }));
}

/** Renders the resolved categories as JSON so assertions read the real output. */
function Probe() {
  const { getResolvedProfile, isLoading } = useConfig();
  if (isLoading) return <div>loading</div>;
  const profile = getResolvedProfile(PROFILE_ID);
  return <div data-testid="out">{JSON.stringify(profile?.aqlCategories ?? [])}</div>;
}

async function resolveCategories(): Promise<AQLCategory[]> {
  stubFetch();
  const { getByTestId } = render(
    <ConfigProvider>
      <Probe />
    </ConfigProvider>,
  );
  let json = '';
  await waitFor(() => {
    json = getByTestId('out').textContent ?? '';
    expect(json).not.toBe('');
  });
  return JSON.parse(json) as AQLCategory[];
}

const byId = (cats: AQLCategory[], id: string) => cats.find((c) => c.id === id)!;

describe('getResolvedProfile() — unset evalMode is flagged, not silently normalised (#17)', () => {
  test('(c) a category with no evaluation mode is tagged evalModeUnset', async () => {
    const cats = await resolveCategories();
    const unset = byId(cats, 'cat_unset');

    // The whole point of the fix: the condition is now visible to callers.
    expect(unset.evalModeUnset).toBe(true);
  });

  test('the substituted value is still the canonical safe default (renders never crash)', async () => {
    const cats = await resolveCategories();
    const unset = byId(cats, 'cat_unset');

    // A safe display value is still produced — but it is explicitly labelled
    // above as substituted, rather than passing as a real admin choice.
    expect(unset.evalMode).toBe('CUMULATIVE');
    expect(unset.evaluationMode).toBe('CUMULATIVE');
  });

  test('a genuinely configured CUMULATIVE category is NOT flagged', async () => {
    const cats = await resolveCategories();
    const set = byId(cats, 'cat_set');

    // The distinction the old silent `?? 'CUMULATIVE'` destroyed: this category
    // and cat_unset used to be byte-identical after normalisation.
    expect(set.evalMode).toBe('CUMULATIVE');
    expect(set.evalModeUnset).toBe(false);
  });

  test("RECORD ONLY ('') is preserved and NOT flagged as unset", async () => {
    const cats = await resolveCategories();
    const record = byId(cats, 'cat_record');

    // Regression guard: coercing '' to the default would silently re-grade a
    // deliberately excluded category as CUMULATIVE.
    expect(record.evalMode).toBe('');
    expect(record.evaluationMode).toBe('');
    expect(record.evalModeUnset).toBe(false);
  });

  test("qualitative ('N/A') is preserved and NOT flagged as unset", async () => {
    const cats = await resolveCategories();
    const na = byId(cats, 'cat_na');

    expect(na.evalMode).toBe('N/A');
    expect(na.evalModeUnset).toBe(false);
  });
});
