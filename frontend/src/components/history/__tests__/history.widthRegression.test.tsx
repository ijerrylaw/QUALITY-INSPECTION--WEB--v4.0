/**
 * @file history.widthRegression.test.tsx
 * @description Permanent automated guard against the exact bug class that
 * cost three fix rounds on HistoryFeed.tsx's expanded detail row: a table
 * cell's own content width leaking into the table's overall width
 * calculation, dragging it wider than its container.
 *
 * Runs in a REAL browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts), not jsdom. This is load-bearing, not a preference:
 * jsdom has no layout engine at all, so every getBoundingClientRect() call
 * there returns an all-zero rect regardless of any CSS applied — a
 * jsdom-based version of this test would pass unconditionally, whether the
 * underlying bug was present or not, which is exactly the "test that would
 * pass regardless" this guard needs to not be.
 *
 * Three tests, in order of what they each prove:
 *
 *  1. CONTROL — auto-layout, deliberately reproduces the original bug in an
 *     isolated minimal table (not HistoryFeed). Proves the test METHOD
 *     (measure width before/after expanding a colSpan cell with worst-case
 *     content) can actually detect this failure mode when it's present —
 *     i.e. this whole approach isn't vacuous.
 *  2. CONTROL — same minimal table, `table-layout: fixed` + explicit
 *     colgroup. Proves the FIX mechanism itself (not HistoryFeed's
 *     surrounding complexity) neutralizes the bug, isolated from data
 *     fetching/routing/etc.
 *  3. THE ACTUAL GUARD — renders the real exported HistoryFeed component,
 *     with a worst-case submission (6 AQL categories, ~25 defects) mocked
 *     in via fetch, and expands its row. This is what protects the real
 *     codebase: if `table-fixed`/COLUMN_WIDTHS/the colgroup are ever
 *     removed or the detail panel's content is ever allowed to declare its
 *     own width again, this test fails.
 *
 * A FINDING FROM BUILDING THIS FILE, worth keeping: the first version of
 * this test used realistic-but-normal defect names (multi-word, spaces) as
 * the "worst case," and it PASSED even after deliberately reverting the
 * real fix (removing table-fixed/the colgroup from HistoryFeed.tsx) — a
 * false pass, exactly the "test that would pass regardless" this file
 * needs to not be. Reason: AqlCategoryAnalysisPanel's own flex-wrap
 * robustness (an earlier, separate fix round) already lets space-separated
 * content reflow instead of forcing table growth, auto-layout or not — so
 * that content shape doesn't exercise what table-fixed specifically
 * guards against. LONG_CHIP_LABEL below is instead a single, genuinely
 * unbreakable token (no spaces, ~400 chars) — flex-wrap cannot help a
 * value that has no break points at all, which is the one shape of
 * content only table-fixed's CONTENT-INDEPENDENT column sizing protects
 * against. Confirmed by actually reverting the fix and re-running this
 * suite: table width jumped from 1398px to 2539.75px, and "THE GUARD"
 * failed as expected, before restoring the real fix and confirming green
 * again — see the task history/PR description for that run's output.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../ui/ToastProvider';
import { ConfigProvider } from '../../../context/ConfigContext';
import { HistoryFeed } from '../HistoryFeed';
// The REAL compiled Tailwind CSS — without this, className="table-fixed"
// etc. are inert strings with zero actual CSS effect, and "THE GUARD" test
// below would risk passing for the wrong reason (e.g. the wrapper width
// just happening to already fit the content, auto-layout or not) rather
// than because table-fixed genuinely constrained the table. Confirmed this
// was a real gap during development of this file: the guard test initially
// passed even before this import was added, for exactly that wrong reason.
import '../../../index.css';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── Worst-case content ──────────────────────────────────────────────────
// Long enough, on one unwrapped line each, that if ANY mechanism let this
// content dictate the table's width, the table would visibly grow — this
// is deliberately not a token amount of text.

// Deliberately a SINGLE unbreakable token (no spaces) — a defect name with
// spaces wraps fine inside AqlCategoryAnalysisPanel's flex-wrap rows
// regardless of table-layout, which (confirmed while building this test:
// the first version of this file used a spaced label and passed even
// against a deliberately auto-layout'd table, a false pass) means it
// can't actually exercise what table-fixed specifically guards against.
// This can't wrap at all, by construction — the one shape of content
// flex-wrap alone cannot protect against, which is exactly the gap
// table-fixed's CONTENT-INDEPENDENT column sizing exists to close.
const LONG_CHIP_LABEL = 'X'.repeat(400); // Deliberately much wider (at ~7px/char mono) than any realistic container — see comment above.
const CATEGORY_NAMES = ['AND', 'BARRIER', 'VISUAL — CRITICAL', 'VISUAL — MAJOR', 'VISUAL — MINOR', 'PACKAGING'];
const DEFECTS_PER_CATEGORY = 4; // 6 * 4 = 24, matching the ~25-chip worst case cited in the task.

function worstCaseCellHtml(): string {
  const categories = CATEGORY_NAMES.map((name) => {
    const chips = Array.from({ length: DEFECTS_PER_CATEGORY }, (_, i) =>
      `<span style="white-space:nowrap;display:inline-block;padding:2px 8px;">${LONG_CHIP_LABEL} #${i + 1}</span>`,
    ).join('');
    return `<div style="white-space:nowrap;">${name}: ${chips}</div>`;
  }).join('');
  return `<div>${categories}<button style="white-space:nowrap;">AMEND RECORD — a fairly long confirmation label</button></div>`;
}

// ── Minimal isolated table helper (used by the two control tests only) ──

function buildMinimalTable(layout: 'auto' | 'fixed'): { container: HTMLElement; table: HTMLTableElement } {
  const container = document.createElement('div');
  container.style.width = '500px'; // Deliberately narrower than the worst-case content.
  container.style.overflowX = 'auto';
  document.body.appendChild(container);

  const table = document.createElement('table');
  table.style.width = '100%';
  if (layout === 'fixed') {
    table.style.tableLayout = 'fixed';
    const colgroup = document.createElement('colgroup');
    for (const width of ['10%', '45%', '45%']) {
      const col = document.createElement('col');
      col.style.width = width;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
  }

  table.innerHTML += `
    <tbody>
      <tr><td>A</td><td>B</td><td>C</td></tr>
    </tbody>
  `;
  container.appendChild(table);
  return { container, table };
}

function expandWithWorstCaseRow(table: HTMLTableElement) {
  const tbody = table.querySelector('tbody')!;
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 3;
  td.innerHTML = worstCaseCellHtml();
  tr.appendChild(td);
  tbody.appendChild(tr);
}

describe('table width vs. detail-row content (CSS mechanism, isolated)', () => {
  test('CONTROL: table-layout:auto DOES let colSpan content widen the table (proves the test method detects the real bug)', () => {
    const { table } = buildMinimalTable('auto');
    const widthBefore = table.getBoundingClientRect().width;

    expandWithWorstCaseRow(table);
    const widthAfter = table.getBoundingClientRect().width;

    // This is the ORIGINAL bug, reproduced on purpose: under auto-layout, a
    // wide colSpan cell's content pulls the whole table wider. If this
    // assertion ever stopped holding, it would mean this test environment
    // no longer reproduces real table auto-layout behavior, and the "real
    // guard" test below would no longer be trustworthy either.
    expect(widthAfter).toBeGreaterThan(widthBefore);
  });

  test('CONTROL: table-layout:fixed + colgroup does NOT let colSpan content widen the table', () => {
    const { table } = buildMinimalTable('fixed');
    const widthBefore = table.getBoundingClientRect().width;

    expandWithWorstCaseRow(table);
    const widthAfter = table.getBoundingClientRect().width;

    expect(widthAfter).toBe(widthBefore);
  });
});

describe('HistoryFeed: real component, real worst-case data', () => {
  const PROFILE_ID = 'prof_test';

  function buildDefectDefinitions() {
    return CATEGORY_NAMES.flatMap((cat) =>
      Array.from({ length: DEFECTS_PER_CATEGORY }, (_, i) => ({
        id: `def_${cat.replace(/[^a-z]+/gi, '_').toLowerCase()}_${i}`,
        name: `${LONG_CHIP_LABEL} #${i + 1}`,
        categoryId: cat,
      })),
    );
  }

  function buildGradingSnapshot() {
    const defs = buildDefectDefinitions();
    return CATEGORY_NAMES.map((name) => {
      const catDefs = defs.filter((d) => d.categoryId === name);
      const defectItems = catDefs.map((d) => ({ id: d.id, name: d.name, count: 1, failing: true }));
      return {
        id: name,
        name,
        aqlLevel: '1.0',
        evaluationMode: 'GRANULAR',
        threshold: { ac: 1, re: 2 },
        totalCount: defectItems.length,
        passed: false,
        defectItems,
      };
    });
  }

  const WORST_CASE_SUBMISSION = {
    id: 'sub_worst_case',
    createdAt: new Date().toISOString(),
    productCode: 'N025SKB-OC-24FT-LONGCODE',
    productionDate: '2026-08-24T11:32:00.000Z',
    samplingTime: '2026-08-24T11:32:00.000Z',
    machineId: 'A001',
    shift: 'Shift A (08:00 - 19:59)',
    batchNumber: 'A001Z6225001',
    size: 'XS',
    sampleSize: 125,
    defects: Object.fromEntries(buildDefectDefinitions().map((d) => [d.id, 1])),
    verdict: 'FAILED',
    inspectorName: 'Jerry Law',
    amendmentStatus: 'UNMODIFIED',
    totalCarton: 18,
    gloveWeight: 2.07,
    profileId: PROFILE_ID,
    gradingSnapshot: JSON.stringify(buildGradingSnapshot()),
    gradingSnapshotProfileName: 'GLOBAL STANDARD — WITH A DELIBERATELY LONG PROFILE NAME FOR THIS TEST',
    amendmentLogs: [],
  };

  function mockConfig() {
    return {
      id: '1', companyName: '', portalTitle: '', logoImage: null, accentColor: 'cobalt',
      productCodes: [], lines: [], shifts: [], sides: [], sizes: [], sampleSizes: [125],
      productMatrixConfig: {}, products: {},
      skuMaterials: [], skuWeights: [], skuColors: [], skuTreatments: [], skuLengths: [], skuTextures: [],
      dimensions: [], targetWeight: { target: 0, tolerance: 0 },
      inspectionProfiles: [
        { id: PROFILE_ID, name: 'GLOBAL STANDARD', isDefault: true, aqlCategories: [], defectDefinitions: buildDefectDefinitions() },
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
      if (url.includes('/api/submissions/new-indicator')) {
        return new Response(JSON.stringify({ effectiveLastViewedAt: new Date().toISOString() }), { status: 200 });
      }
      if (url.includes('/api/submissions')) {
        return new Response(JSON.stringify({ submissions: [WORST_CASE_SUBMISSION], hasMore: false }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));
  }

  function renderHistoryFeed() {
    return render(
      <ToastProvider>
        <ConfigProvider>
          <MemoryRouter>
            <div style={{ width: '1400px' }}>
              <HistoryFeed />
            </div>
          </MemoryRouter>
        </ConfigProvider>
      </ToastProvider>,
    );
  }

  test('THE GUARD: expanding the worst-case row does not change the table\'s rendered width', async () => {
    stubFetch();
    const { container, findByText } = renderHistoryFeed();

    await findByText('A001Z6225001');
    const table = container.querySelector('table')!;
    expect(table).toBeTruthy();

    const widthBeforeExpand = table.getBoundingClientRect().width;

    const row = table.querySelector('tbody tr')!;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Confirms the detail actually rendered (not a false-positive from a
    // click that did nothing) before measuring.
    await findByText('AQL Category Analysis');
    await waitFor(() => {
      const chips = container.querySelectorAll('td[colspan] .rounded-md.px-3.py-1\\.5.border.shadow-sm');
      expect(chips.length).toBeGreaterThanOrEqual(20); // ~25 worst-case chips actually present
    });

    const widthAfterExpand = table.getBoundingClientRect().width;

    // The core invariant: the detail row's content — however wide — must
    // not be able to change the table's own rendered width. This is the
    // exact assertion that would have caught the original bug and will
    // catch it again if table-fixed/COLUMN_WIDTHS/the colgroup are ever
    // removed or bypassed.
    expect(widthAfterExpand).toBe(widthBeforeExpand);

    // Second, independent check: the expanded <td colSpan> itself must not
    // be wider than the table it belongs to (it could in principle match
    // the table's own width while the table itself still grew, if the
    // outer wrapper were also unconstrained — this rules that out
    // specifically for the cell).
    const detailCell = container.querySelector('td[colspan]') as HTMLTableCellElement;
    expect(detailCell.getBoundingClientRect().width).toBeLessThanOrEqual(table.getBoundingClientRect().width + 0.5);
  });
});
