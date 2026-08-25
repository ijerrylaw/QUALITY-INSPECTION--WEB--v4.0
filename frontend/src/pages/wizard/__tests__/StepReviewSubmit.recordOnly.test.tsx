/**
 * @file StepReviewSubmit.recordOnly.test.tsx
 * @description Regression guard for AUDIT_REPORT.md #22 — RECORD ONLY
 * categories used to be silently absent from Step 4's ISO 2859-1 Category
 * Breakdown, because that table's source array (categoryVerdicts) was built
 * purely from POST /api/verdict/preview's categoryResults, and a RECORD ONLY
 * category never gets a CategoryResult at all (aqlEvaluator.ts's
 * true-exclusion skip on evaluationMode === '' — see aqlEvaluator.ts:242).
 *
 * Runs in a REAL browser (Vitest browser mode — see the sibling
 * history.widthRegression.test.tsx for why jsdom can't be used for this kind
 * of check) so this actually exercises real rendering, not a jsdom stub.
 *
 * The mocked POST /api/verdict/preview response below deliberately omits the
 * RECORD ONLY (PACKAGING) category from categoryResults entirely — that
 * omission, not a `passed: null` entry, is the real shape the engine
 * produces, and is exactly the premise #22 was built on.
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

const PROFILE_ID = 'prof_test_recordonly';

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
          { id: 'CRITICAL', name: 'CRITICAL', aql: '1.5', aqlLevel: '1.5', evalMode: 'CUMULATIVE', evaluationMode: 'CUMULATIVE' },
          { id: 'PACKAGING', name: 'PACKAGING', aql: 'RECORD ONLY', aqlLevel: 'RECORD ONLY', evalMode: '', evaluationMode: '' },
        ],
        defectDefinitions: [
          { id: 'def_stain', name: 'Stain', categoryId: 'CRITICAL' },
          { id: 'def_box', name: 'Box Damage', categoryId: 'PACKAGING' },
        ],
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
    if (url.includes('/api/verdict/preview')) {
      // PACKAGING (RECORD ONLY) is structurally absent here — not present
      // with passed:null — reproducing aqlEvaluator.ts's real skip behavior.
      return new Response(JSON.stringify({
        verdict: 'PASSED',
        categoryResults: [
          {
            categoryId: 'CRITICAL', categoryName: 'CRITICAL', evaluationMode: 'CUMULATIVE',
            threshold: { ac: 3, re: 4 }, totalCount: 1, passed: true, failingDefects: [],
          },
        ],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }));
}

function renderStep() {
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
            defects: { def_stain: 1, def_box: 2 },
          }}
          onSubmit={() => {}}
          onBack={() => {}}
        />
      </ConfigProvider>
    </ToastProvider>,
  );
}

describe('StepReviewSubmit: RECORD ONLY category visibility (AUDIT_REPORT.md #22)', () => {
  test('RECORD ONLY category appears in the Category Breakdown with its quantity and the Eye badge, without a PASS/FAIL verdict', async () => {
    stubFetch();
    const { findByText } = renderStep();

    await findByText('ISO 2859-1 CATEGORY BREAKDOWN');

    // The graded category still renders normally, from the server response.
    await findByText('CRITICAL');

    // The RECORD ONLY category (PACKAGING) is now visible, with its
    // client-computed quantity (def_box: 2) and the Eye-badge label. Scoped
    // to PACKAGING's own row (not the whole page) — the page-level "Verdict
    // Impact" KPI card independently renders "FAIL" whenever any defect was
    // recorded at all, which is unrelated to this row and would make a
    // page-wide "no FAIL text anywhere" assertion fail for the wrong reason.
    const packagingLabel = await findByText('PACKAGING');
    const row = packagingLabel.closest('.flex-wrap') as HTMLElement;
    expect(row).toBeTruthy();

    await waitFor(() => {
      expect(within(row).getByText('Count: 2')).toBeTruthy();
    });
    expect(within(row).getByText('RECORD ONLY')).toBeTruthy();

    // ...and must NOT render a PASS/FAIL verdict badge within that row.
    expect(within(row).queryByText('PASS')).toBeNull();
    expect(within(row).queryByText('FAIL')).toBeNull();
  });

  test('Total Defects Recorded KPI stays server-verdict-derived — RECORD ONLY quantity is not folded in', async () => {
    stubFetch();
    const { findByText } = renderStep();
    await findByText('ISO 2859-1 CATEGORY BREAKDOWN');

    // Scoped to the DEFECT TABULATION card specifically — "1" alone is
    // ambiguous elsewhere on the page (e.g. SubmissionSummary's own fields).
    const defectCardHeading = await findByText('DEFECT TABULATION');
    const defectCard = defectCardHeading.closest('.bg-surface') as HTMLElement;
    expect(defectCard).toBeTruthy();

    // Server's categoryResults only ever summed CRITICAL's totalCount (1) —
    // PACKAGING's 2 RECORD ONLY defects must not double-count into this KPI
    // (which would read "3") now that they're visible in the table below it.
    await waitFor(() => {
      const kpiValue = defectCard.querySelector('.text-4xl')?.textContent;
      expect(kpiValue).toBe('1');
    });
  });
});
