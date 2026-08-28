/**
 * @file inspectionResultsColumnAlignment.test.tsx
 * @description Real-browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts) regression guard for the Inspection Results panel's
 * column-alignment bug (post-review cleanup, 2026-08-27): DimensionsPanel.tsx
 * and AqlCategoryAnalysisPanel.tsx share a NAME/TARGET/ACTUAL/RESULT column
 * scheme, but `min-w-` is a floor, not a fixed width — content wider than a
 * breakpoint (AqlCategoryAnalysisPanel's TARGET cell, a variable 2–4-chip
 * cluster) grew the flex item past it, misaligning that column against
 * DimensionsPanel's identically-classed TARGET (whose content is always
 * short). Fixed by switching NAME/TARGET/ACTUAL to a genuine `w-`.
 *
 * This test proves the fix the same way history.widthRegression.test.tsx
 * proves the table-width fix: real layout measurement (`getBoundingClientRect()`)
 * in a real browser, not jsdom (which has no layout engine and would pass
 * unconditionally regardless of whether the bug were present).
 *
 * Uses a deliberately WIDE-content AQL category (a full chip cluster: level +
 * eval mode + Ac/Re) — the exact shape that previously overflowed its
 * `min-w-[170px]` TARGET cell — so this test would have failed against the
 * pre-fix markup.
 *
 * WIDE WRAPPER REQUIRED (2026-08-27, layout adjustment follow-up): each
 * `render()` is wrapped in a fixed `1400px`-wide `<div>`, matching
 * history.widthRegression.test.tsx's own established convention. Without
 * it, RTL's default unconstrained container left only ~382px of usable
 * width in this test's headless viewport — less than NAME+TARGET+RESULT's
 * combined fixed widths (430px) plus gaps, so `flex-wrap` was forced to
 * activate and distributed the leftover space to the ACTUAL spacer
 * differently between the header row and the data row (0px vs. 38px) even
 * within the SAME file — a test-environment artifact that would never occur
 * in the real app (an 1200px+ wide desktop table), not a real alignment
 * bug. Confirmed by adding the same wide wrapper `history.widthRegression.
 * test.tsx` already uses for exactly this class of problem.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DimensionsPanel } from '../DimensionsPanel';
import type { DimensionRow } from '../DimensionsPanel';
import { AqlCategoryAnalysisPanel } from '../AqlCategoryAnalysisPanel';
import type { CategoryAnalysis } from '../AqlCategoryAnalysisPanel';
import '../../../index.css';

afterEach(() => {
  cleanup();
});

const DIMENSION_ROWS: DimensionRow[] = [
  {
    id: '__fixed_length__',
    name: 'GLOVE LENGTH',
    unit: 'mm',
    measured: { min: 240, max: 244, avg: 242 },
    failed: false,
    isGraded: true,
    threshold: 235,
    maxThreshold: 245,
    isMin: false,
    hasSnapshot: true,
    slots: ['240', '241', '244', '242', '243'],
    slotFails: [false, false, false, false, false],
  },
];

// Deliberately the widest realistic shape: AQL level chip + eval mode text +
// Ac/Re chip, all inside the TARGET cell — this is exactly the content that
// used to grow past `min-w-[170px]`.
const CATEGORY_ANALYSIS: CategoryAnalysis[] = [
  {
    id: 'cat_barrier',
    name: 'BARRIER',
    aqlLevel: '1.5',
    evaluationMode: 'CUMULATIVE',
    threshold: { ac: 3, re: 4 },
    totalCount: 2,
    passed: true,
    defectItems: [{ id: 'def_hole', name: 'Hole', count: 2, failing: false }],
  },
];

/** Width of the nth column inside a flex row that is ALREADY the flex container itself (the header rows). */
function nthWidthOf(flexContainer: HTMLElement, nthChild: number): number {
  return (flexContainer.children[nthChild] as HTMLElement).getBoundingClientRect().width;
}

/** Same, but for a data row — the columns live inside an inner `.flex.items-center.flex-wrap` div, not as the row's own direct children (the row's other sibling is the expanded-detail block). */
function nthColumnWidthInRow(row: HTMLElement, nthChild: number): number {
  const flexRow = row.querySelector('.flex.items-center.flex-wrap') as HTMLElement;
  return nthWidthOf(flexRow, nthChild);
}

describe('Inspection Results: TARGET/ACTUAL column widths match between tables', () => {
  test('DimensionsPanel and AqlCategoryAnalysisPanel render identical NAME/TARGET/ACTUAL widths despite very different content', () => {
    const dims = render(<div style={{ width: '1400px' }}><DimensionsPanel rows={DIMENSION_ROWS} /></div>);
    const defects = render(<div style={{ width: '1400px' }}><AqlCategoryAnalysisPanel
      categoryAnalysis={CATEGORY_ANALYSIS}
      unclassified={[]}
      anyFail={false}
      noProfileLinked={false}
      previewStatus="snapshot"
    /></div>);

    const dimRow = dims.container.querySelector('.px-4.py-3') as HTMLElement;
    const defectRow = defects.container.querySelector('.px-4.py-3') as HTMLElement;

    // Column 0 = NAME, 1 = TARGET, 2 = ACTUAL (RESULT, column 3, is
    // deliberately excluded — it's right-pinned and variable-width by design).
    for (const i of [0, 1, 2]) {
      const dimWidth = nthColumnWidthInRow(dimRow, i);
      const defectWidth = nthColumnWidthInRow(defectRow, i);
      expect(dimWidth).toBeCloseTo(defectWidth, 0);
    }

    dims.unmount();
    defects.unmount();
  });

  test('ACTUAL sits directly after TARGET (one gap-x-3 apart), not drifted toward the row centre', () => {
    const dims = render(<div style={{ width: '1400px' }}><DimensionsPanel rows={DIMENSION_ROWS} /></div>);
    const defects = render(<div style={{ width: '1400px' }}><AqlCategoryAnalysisPanel
      categoryAnalysis={CATEGORY_ANALYSIS}
      unclassified={[]}
      anyFail={false}
      noProfileLinked={false}
      previewStatus="snapshot"
    /></div>);

    for (const { container } of [dims, defects]) {
      const flexRow = container.querySelector('.px-4.py-3 .flex.items-center.flex-wrap') as HTMLElement;
      const target = flexRow.children[1] as HTMLElement;
      const actual = flexRow.children[2] as HTMLElement;
      const gap = actual.getBoundingClientRect().left - target.getBoundingClientRect().right;
      // gap-x-3 === 0.75rem === 12px. The old `flex-1 justify-center` spacer
      // pushed this to ~260px+ in this 1400px-wide wrapper.
      expect(gap).toBeGreaterThan(8);
      expect(gap).toBeLessThan(20);
    }

    dims.unmount();
    defects.unmount();
  });

  test('the header rows of both tables also align with each other and with their own data rows', () => {
    const dims = render(<div style={{ width: '1400px' }}><DimensionsPanel rows={DIMENSION_ROWS} /></div>);
    const defects = render(<div style={{ width: '1400px' }}><AqlCategoryAnalysisPanel
      categoryAnalysis={CATEGORY_ANALYSIS}
      unclassified={[]}
      anyFail={false}
      noProfileLinked={false}
      previewStatus="snapshot"
    /></div>);

    // Header rows are themselves the flex container (no expanded-detail
    // sibling to drill past), unlike the data rows above.
    const dimHeaderRow = dims.container.querySelector('.border-b.border-gray-800\\/50') as HTMLElement;
    const defectHeaderRow = defects.container.querySelector('.border-b.border-gray-800\\/50') as HTMLElement;
    const dimDataRow = dims.container.querySelector('.px-4.py-3') as HTMLElement;
    const defectDataRow = defects.container.querySelector('.px-4.py-3') as HTMLElement;

    for (const i of [0, 1, 2]) {
      const dimHeaderWidth = nthWidthOf(dimHeaderRow, i);
      expect(dimHeaderWidth).toBeCloseTo(nthWidthOf(defectHeaderRow, i), 0);
      expect(dimHeaderWidth).toBeCloseTo(nthColumnWidthInRow(dimDataRow, i), 0);
      expect(dimHeaderWidth).toBeCloseTo(nthColumnWidthInRow(defectDataRow, i), 0);
    }

    dims.unmount();
    defects.unmount();
  });

  // NOTE: index.css pulls Inter from Google Fonts via `@import url(...)`,
  // which never resolves in this headless runner — so label widths here are
  // measured in a *fallback* face, ~1-2px narrower than real Inter. That is
  // exactly how the w-[160px] round passed this test yet still wrapped live.
  // The NAME column is now w-[200px] with a ~50px buffer over real Inter's
  // "BEADING THICKNESS" (149.6px, measured in a real Chromium with the font
  // loaded), so this test has margin to spare even accounting for the
  // fallback-font gap.
  test('every row label in both tables renders on a single line inside the NAME column — no wrap, no overflow', () => {
    const allDimNames = ['GLOVE WEIGHT', 'GLOVE LENGTH', 'PALM WIDTH', 'CUFF THICKNESS', 'PALM THICKNESS', 'FINGER THICKNESS', 'BEADING THICKNESS'];
    const dimRows: DimensionRow[] = allDimNames.map((name) => ({
      ...DIMENSION_ROWS[0]!, id: name, name,
    }));
    const catNames = ['AND', 'BARRIER', 'VISUALS'];
    const cats: CategoryAnalysis[] = catNames.map((name) => ({ ...CATEGORY_ANALYSIS[0]!, id: name, name }));

    const dims = render(<div style={{ width: '1400px' }}><DimensionsPanel rows={dimRows} /></div>);
    const defects = render(<div style={{ width: '1400px' }}><AqlCategoryAnalysisPanel
      categoryAnalysis={cats}
      unclassified={[]}
      anyFail={false}
      noProfileLinked={false}
      previewStatus="snapshot"
    /></div>);

    for (const { container } of [dims, defects]) {
      const labelSpans = Array.from(
        container.querySelectorAll('.px-4.py-3 .flex.items-center.flex-wrap > span.text-sm.font-semibold'),
      ) as HTMLElement[];
      expect(labelSpans.length).toBeGreaterThan(0);
      for (const span of labelSpans) {
        // Single line: rendered height is one line-height, not two.
        const lineHeight = parseFloat(getComputedStyle(span).lineHeight);
        expect(span.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight + 1);
        // No overflow: the text fits within the fixed 200px column box.
        expect(span.scrollWidth).toBeLessThanOrEqual(span.clientWidth + 1);
        // And the box really is the widened 200px (guards against a silent revert).
        expect(span.clientWidth).toBeGreaterThanOrEqual(199);
      }
    }

    dims.unmount();
    defects.unmount();
  });
});
