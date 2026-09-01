/**
 * @file StepReviewSubmit.qualitative.test.tsx
 * @description Regression guard for the qualitative (N/A mode) display bug —
 * same root cause as the History panel's "Donning 2" fix (commit f66bb99),
 * caught in the pre-submit review screen afterwards.
 *
 * N/A categories encode PASS/FAIL as a state code (1 = pass, 2 = fail) in the
 * shared `defects` map (ISO2859_MATH_ENGINE.md §2). Step 4's ISO 2859-1
 * Category Breakdown used to render that through the same path as a real
 * quantity: the per-category line printed "Count: {n}" and, on failure, a
 * reason string of the form "{name}: {count} > ac({ac})" — i.e. "Donning: 2 >
 * ac(0)" for a failed qualitative check. This asserts the fixed behavior:
 * "{failed} of {types} failed" instead of "Count:", and a plain "{name}: FAIL"
 * reason with no numeric-inequality format.
 *
 * Runs in a REAL browser (Vitest browser mode) — same rationale as the
 * sibling StepReviewSubmit.recordOnly.test.tsx.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../../../components/ui/ToastProvider';
import { ConfigProvider } from '../../../context/ConfigContext';
import { StepReviewSubmit } from '../StepReviewSubmit';
import '../../../index.css';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PROFILE_ID = 'prof_test_qualitative';

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
        name: 'TEST PROFILE',
        isDefault: true,
        aqlCategories: [
          { id: 'PPE', name: 'PPE', aql: 'PASS/FAIL', aqlLevel: 'PASS/FAIL', evalMode: 'N/A', evaluationMode: 'N/A' },
        ],
        defectDefinitions: [
          { id: 'def_donning', name: 'Donning', categoryId: 'PPE' },
          { id: 'def_doffing', name: 'Doffing', categoryId: 'PPE' },
        ],
      },
    ],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

/**
 * @param passed  when false, PPE fails with Donning flagged (state code 2 in
 *                 the failingDefect, exactly as aqlEvaluator.ts's N/A branch
 *                 emits it); when true, no failingDefects and totalCount 0.
 */
function stubFetch(passed: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.includes('/api/config')) {
      return new Response(JSON.stringify(mockConfig()), { status: 200 });
    }
    if (url.includes('/api/verdict/preview')) {
      return new Response(JSON.stringify({
        verdict: passed ? 'PASSED' : 'FAILED',
        categoryResults: [
          {
            categoryId: 'PPE', categoryName: 'PPE', evaluationMode: 'N/A',
            threshold: { ac: 0, re: 1 },
            totalCount: passed ? 0 : 1, // engine's N/A totalCount = # of FAIL items
            passed,
            failingDefects: passed
              ? []
              : [{ defectId: 'def_donning', defectName: 'Donning', count: 2, threshold: { ac: 0, re: 1 } }],
          },
        ],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }));
}

function renderStep(qualDefects: Record<string, number>) {
  return render(
    <ToastProvider>
      <ConfigProvider>
        <StepReviewSubmit
          inspectionData={{
            profileId: PROFILE_ID,
            productCode: 'N025SKB-OC-24FT',
            size: 'M',
            sampleSize: 125,
            fullSystemLotNo: 'A001Z6225001',
            defects: qualDefects,
          }}
          onSubmit={() => {}}
          onBack={() => {}}
        />
      </ConfigProvider>
    </ToastProvider>,
  );
}

describe('StepReviewSubmit: qualitative (N/A) category display', () => {
  test('failed N/A row shows "{failed} of {types} failed", not a numeric Count or a "> ac()" reason', async () => {
    stubFetch(false);
    const { findByText } = renderStep({ def_donning: 2, def_doffing: 1 });

    await findByText('ISO 2859-1 CATEGORY BREAKDOWN');
    const row = (await findByText('PPE')).closest('.flex-wrap') as HTMLElement;
    expect(row).toBeTruthy();

    await waitFor(() => {
      expect(within(row).getByText('1 of 2 failed')).toBeTruthy();
    });

    // The state code (2) must never surface as a quantity.
    expect(row.textContent).not.toContain('Count:');
    expect(row.textContent).not.toContain('> ac(');
    expect(row.textContent).not.toContain(': 2');

    // Reason lists the failing check by name with a plain FAIL, no inequality.
    expect(within(row).getByText(/Donning: FAIL/)).toBeTruthy();

    // The row still carries its qualitative eval-mode chip and a FAIL verdict.
    expect(within(row).getByText('QUALITATIVE')).toBeTruthy();
    expect(within(row).getByText('FAIL')).toBeTruthy();
  });

  test('passed N/A row shows "0 of {types} failed" and no reason line', async () => {
    stubFetch(true);
    const { findByText } = renderStep({ def_donning: 1, def_doffing: 1 });

    await findByText('ISO 2859-1 CATEGORY BREAKDOWN');
    const row = (await findByText('PPE')).closest('.flex-wrap') as HTMLElement;

    await waitFor(() => {
      expect(within(row).getByText('0 of 2 failed')).toBeTruthy();
    });
    expect(row.textContent).not.toContain('Count:');
    expect(within(row).queryByText(/↳/)).toBeNull();
    expect(within(row).getByText('PASS')).toBeTruthy();
  });
});
