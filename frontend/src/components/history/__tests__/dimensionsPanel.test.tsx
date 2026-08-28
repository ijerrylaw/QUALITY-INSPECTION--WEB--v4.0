/**
 * @file dimensionsPanel.test.tsx
 * @description Real-browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts) coverage for DimensionsPanel.tsx, the "Dimensions" table
 * section of HistoryFeed.tsx's "INSPECTION RESULTS" panel.
 *
 * DimensionsPanel is a pure presentational component (no fetch, no context)
 * fed already-resolved DimensionRow[] — so unlike
 * history.widthRegression.test.tsx's full HistoryFeed mount, this can test
 * the component directly with hand-built rows covering every state the
 * component itself branches on: COMPLIANT, OUT OF SPEC, RECORD ONLY, and the
 * legacy NOT FROZEN (pre-gloveWeightSnapshot) case.
 *
 * LAYOUT & CONTENT REVISION (2026-08-27): the click-to-expand interaction
 * from the immediately preceding session was REMOVED, not hidden — there is
 * no button, no chevron, no expand state anywhere in this table anymore.
 * ACTUAL always shows MIN/MAX/AVG directly; a failed graded row also shows a
 * second line listing the specific out-of-spec raw readings. Tests below
 * assert this content is visible with zero interaction, and that no
 * button/toggle element exists at all.
 *
 * HIERARCHY (2026-08-28, revised): on an out-of-spec row, MIN/MAX/AVG is the
 * PRIMARY line — first, larger (`text-sm`), white (`text-primary`) — and the
 * specific out-of-spec reading(s) sit on a SECONDARY line beneath it:
 * smaller (`text-xs`) but still red (`text-rose-400`). This reverses the
 * 2026-08-27 arrangement that led with the red values. A compliant row (no
 * out-of-spec line) still shows only its lone MIN/MAX/AVG line, and that
 * line stays de-emphasized (`text-xs text-muted`) — the promotion to
 * `text-sm text-primary` happens only when there's an out-of-spec line to
 * outrank.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DimensionsPanel } from '../DimensionsPanel';
import type { DimensionRow } from '../DimensionsPanel';
import { FIXED_DIM_WEIGHT } from '../../../lib/fixedDimensions';
import '../../../index.css';

afterEach(() => {
  cleanup();
});

// JSX interpolations (e.g. `≥{value}{unit}`) render as separate text nodes,
// so RTL's default getByText (single-node exact match) can't find them.
// A whole-container substring check sidesteps that without depending on how
// React happens to split the nodes.
function expectText(container: HTMLElement, text: string) {
  expect(container.textContent).toContain(text);
}

/** Finds the element whose own (aggregated, multi-node) textContent contains `text` — for cases expectText's boolean check isn't enough (position/class assertions need the actual element). */
function findByTextContent(container: HTMLElement, text: string): HTMLElement {
  const all = Array.from(container.querySelectorAll('span')) as HTMLElement[];
  const match = all.find((el) => el.textContent?.includes(text));
  if (!match) throw new Error(`No <span> found containing text: ${text}`);
  return match;
}

const ROWS: DimensionRow[] = [
  // Compliant graded 5-slot dimension. No slot fails at all.
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
  // Out-of-spec graded dimension — only slots 2 and 4 individually failed,
  // proving the out-of-spec list picks exactly those values, not all 5.
  {
    id: 'cuffThickness',
    name: 'CUFF THICKNESS',
    unit: 'mm',
    measured: { min: 0.18, max: 0.22, avg: 0.20 },
    failed: true,
    isGraded: true,
    threshold: 0.10,
    maxThreshold: 0.16,
    isMin: false,
    hasSnapshot: true,
    slots: ['0.18', '0.22', '0.19', '0.21', '0.20'],
    slotFails: [false, true, false, true, false],
  },
  // Record-only dimension — measured but never graded. No per-slot judgment
  // was ever attempted (mirrors dimensionEvaluator.ts's own "all-false, not
  // evaluated" convention).
  {
    id: 'beadingThickness',
    name: 'BEADING THICKNESS',
    unit: 'mm',
    measured: { min: 1.0, max: 1.2, avg: 1.1 },
    failed: false,
    isGraded: false,
    threshold: 0,
    maxThreshold: Infinity,
    isMin: false,
    hasSnapshot: true,
    slots: ['1.0', '1.1', '1.2', '1.1', '1.1'],
    slotFails: [false, false, false, false, false],
  },
  // isMin dimension (no upper cap) — compliant.
  {
    id: 'palmThickness',
    name: 'PALM THICKNESS',
    unit: 'mm',
    measured: { min: 0.12, max: 0.14, avg: 0.13 },
    failed: false,
    isGraded: true,
    threshold: 0.10,
    maxThreshold: Infinity,
    isMin: true,
    hasSnapshot: true,
    slots: ['0.12', '0.13', '0.14', '0.13', '0.13'],
    slotFails: [false, false, false, false, false],
  },
  // Legacy Glove Weight row — no frozen snapshot (predates gloveWeightSnapshot).
  {
    id: '__fixed_weight__',
    name: 'GLOVE WEIGHT',
    unit: 'g',
    measured: { min: 2.07, max: 2.07, avg: 2.07 },
    failed: false,
    isGraded: true,
    threshold: 0,
    maxThreshold: Infinity,
    isMin: false,
    hasSnapshot: false,
    slots: ['2.07'],
    slotFails: [],
  },
];

describe('DimensionsPanel', () => {
  test('renders nothing when there are no rows', () => {
    const { container } = render(<DimensionsPanel rows={[]} />);
    expect(container.textContent).toBe('');
  });

  test('renders the section header, the TARGET/ACTUAL/RESULT column header, and one row per dimension', () => {
    const { getByText } = render(<DimensionsPanel rows={ROWS} />);
    expect(getByText('Dimensions')).toBeTruthy();
    expect(getByText('Target')).toBeTruthy();
    expect(getByText('Actual')).toBeTruthy();
    expect(getByText('Result')).toBeTruthy();
    for (const row of ROWS) {
      expect(getByText(row.name)).toBeTruthy();
    }
  });

  test('no interactive element exists anywhere in this table — the expand feature was removed, not hidden', () => {
    const { container } = render(<DimensionsPanel rows={ROWS} />);
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  test('COMPLIANT row shows only the de-emphasized MIN/MAX/AVG line (text-xs text-muted, unchanged), no out-of-spec line', () => {
    const { getByText, container } = render(<DimensionsPanel rows={[ROWS[0]!]} />);
    expect(getByText('COMPLIANT')).toBeTruthy();
    expectText(container, 'MIN : 240mm');
    expectText(container, 'MAX : 244mm');
    expectText(container, 'AVG : 242mm');
    expect(container.textContent).not.toContain('OUT OF SPEC');
    // Compliant rows are explicitly NOT affected by the hierarchy swap — the
    // lone MIN/MAX/AVG line stays small and grey.
    const minSpan = findByTextContent(container, 'MIN : 240mm');
    expect(minSpan.className).toContain('text-xs');
    expect(minSpan.className).toContain('text-muted');
    expect(minSpan.className).not.toContain('text-primary');
  });

  test('OUT OF SPEC row leads with MIN/MAX/AVG (primary: larger, white) and puts the failed readings on a secondary line (smaller, still red)', () => {
    const { getByText, container } = render(<DimensionsPanel rows={[ROWS[1]!]} />);
    expect(getByText('OUT OF SPEC')).toBeTruthy();
    expectText(container, '0.16mm'); // spec range upper bound, TARGET column
    // Only slots 2 and 4 failed in this fixture (values 0.22 and 0.21) — the
    // other 3 passing values must NOT appear in the out-of-spec list, and no
    // "OUT OF SPEC:" label prefix (RESULT's own badge already says that).
    expectText(container, '0.22mm, 0.21mm');
    expect(container.textContent).not.toContain('0.18mm, ');
    expectText(container, 'MIN : 0.18mm');
    expectText(container, 'MAX : 0.22mm');
    expectText(container, 'AVG : 0.20mm');

    const minSpan = findByTextContent(container, 'MIN : 0.18mm');
    const outOfSpecSpan = findByTextContent(container, '0.22mm, 0.21mm');

    // Hierarchy: MIN/MAX/AVG now renders BEFORE the out-of-spec line in DOM
    // order (primary line first, secondary line second).
    expect(minSpan.compareDocumentPosition(outOfSpecSpan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Primary line is larger + white; secondary line is smaller + still red.
    expect(minSpan.className).toContain('text-sm');
    expect(minSpan.className).toContain('text-primary');
    expect(minSpan.className).not.toContain('text-muted');
    expect(outOfSpecSpan.className).toContain('text-xs');
    expect(outOfSpecSpan.className).toContain('text-rose-400');
  });

  test('RECORD ONLY badge and a "—" spec range for a record-only dimension; MIN/MAX/AVG still shown, no out-of-spec line', () => {
    const { getByText, container } = render(<DimensionsPanel rows={[ROWS[2]!]} />);
    expect(getByText('RECORD ONLY')).toBeTruthy();
    expect(getByText('—')).toBeTruthy();
    // Precision follows the raw readings: this row's slots are 1-decimal
    // ('1.0', '1.1', '1.2') so MIN/MAX/AVG render at 1 decimal — not '1mm'
    // (integer-trimmed) or '1.20mm' (fixed 2dp), both of which the old
    // formatNum would have produced.
    expectText(container, 'MIN : 1.0mm');
    expectText(container, 'MAX : 1.2mm');
    expectText(container, 'AVG : 1.1mm');
    expect(container.textContent).not.toContain('OUT OF SPEC');
  });

  test('MIN/MAX/AVG precision matches the recorded readings — a 3-decimal dimension is never shown rounded to 2', () => {
    const fingerThickness: DimensionRow = {
      id: 'fingerThickness',
      name: 'FINGER THICKNESS',
      unit: 'mm',
      measured: { min: 0.049, max: 0.049, avg: 0.049 },
      failed: true,
      isGraded: true,
      threshold: 0.045,
      maxThreshold: 0.048,
      isMin: false,
      hasSnapshot: true,
      slots: ['0.049', '0.049', '0.049', '0.049', '0.049'],
      slotFails: [true, true, true, true, true],
    };
    const { container } = render(<div style={{ width: '1400px' }}><DimensionsPanel rows={[fingerThickness]} /></div>);
    // MIN/MAX/AVG at 3 decimals (would have been '0.05mm' under the old fixed
    // toFixed(2) rule).
    expectText(container, 'MIN : 0.049mm');
    expectText(container, 'MAX : 0.049mm');
    expectText(container, 'AVG : 0.049mm');
    expect(container.textContent).not.toContain('0.05mm');
    // Spec range also follows the 3-decimal precision.
    expectText(container, '0.045mm – 0.048mm');

    // Out-of-spec list: all 5 failing readings on ONE line, comma-separated,
    // no wrap — the ACTUAL box is a fixed width sized for exactly this.
    const listSpan = findByTextContent(container, '0.049mm, 0.049mm, 0.049mm, 0.049mm, 0.049mm');
    expect(listSpan.className).toContain('whitespace-nowrap');
    expect(listSpan.getBoundingClientRect().height).toBeLessThan(28); // single text line, not wrapped to two
    // ...and it actually FITS inside the fixed ACTUAL column (w-[400px]) —
    // not merely clipped/overflowing because of whitespace-nowrap.
    const actualCol = listSpan.closest('.w-\\[400px\\]') as HTMLElement;
    expect(actualCol).toBeTruthy();
    expect(listSpan.getBoundingClientRect().right).toBeLessThanOrEqual(
      actualCol.getBoundingClientRect().right + 0.5,
    );

    // MIN/MAX/AVG line is also single-line (nowrap).
    const minSpan = findByTextContent(container, 'MIN : 0.049mm');
    const mmaLine = minSpan.parentElement as HTMLElement;
    expect(mmaLine.className).toContain('whitespace-nowrap');
    expect(mmaLine.getBoundingClientRect().height).toBeLessThan(28);

    // Same hierarchy swap applies to the multi-value case: MIN/MAX/AVG first
    // (larger, white), the 5-value list second (smaller, still red).
    expect(minSpan.compareDocumentPosition(listSpan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(minSpan.className).toContain('text-sm');
    expect(minSpan.className).toContain('text-primary');
    expect(listSpan.className).toContain('text-xs');
    expect(listSpan.className).toContain('text-rose-400');
  });

  test('isMin dimension shows a "≥X" spec range with no upper cap', () => {
    const { getByText, container } = render(<DimensionsPanel rows={[ROWS[3]!]} />);
    expectText(container, '≥');
    expectText(container, 'AVG : 0.13mm');
    expect(getByText('COMPLIANT')).toBeTruthy();
  });

  test('NOT FROZEN badge for a legacy Glove Weight row with no snapshot, showing only its single value — no MIN/MAX/AVG triplet, no compliance claim', () => {
    const { getByText, queryByText, container } = render(<DimensionsPanel rows={[ROWS[4]!]} />);
    expect(getByText('NOT FROZEN')).toBeTruthy();
    expectText(container, '2.07g');
    expect(container.textContent).not.toContain('MIN');
    expect(container.textContent).not.toContain('AVG');
    expect(queryByText('COMPLIANT')).toBeNull();
    expect(queryByText('OUT OF SPEC')).toBeNull();
  });

  test('a FROZEN Glove Weight row (single recorded reading) shows only its value — no MIN/MAX/AVG', () => {
    const frozenWeight: DimensionRow = {
      id: FIXED_DIM_WEIGHT,
      name: 'GLOVE WEIGHT',
      unit: 'g',
      measured: { min: 2.22, max: 2.22, avg: 2.22 },
      failed: false,
      isGraded: true,
      threshold: 2.30,
      maxThreshold: 2.70,
      isMin: false,
      hasSnapshot: true,
      slots: ['2.22'],
      slotFails: [false],
    };
    const { getByText, container } = render(<DimensionsPanel rows={[frozenWeight]} />);
    expect(getByText('COMPLIANT')).toBeTruthy();
    expectText(container, '2.22g');
    expect(container.textContent).not.toContain('MIN');
    expect(container.textContent).not.toContain('MAX');
    expect(container.textContent).not.toContain('AVG');
  });

  test('a FROZEN out-of-spec Glove Weight row shows its single value in rose, still no MIN/MAX/AVG', () => {
    const failedWeight: DimensionRow = {
      id: FIXED_DIM_WEIGHT,
      name: 'GLOVE WEIGHT',
      unit: 'g',
      measured: { min: 2.22, max: 2.22, avg: 2.22 },
      failed: true,
      isGraded: true,
      threshold: 2.30,
      maxThreshold: 2.70,
      isMin: false,
      hasSnapshot: true,
      slots: ['2.22'],
      slotFails: [true],
    };
    const { getByText, container } = render(<DimensionsPanel rows={[failedWeight]} />);
    expect(getByText('OUT OF SPEC')).toBeTruthy();
    const valueSpan = findByTextContent(container, '2.22g');
    expect(valueSpan.className).toContain('text-rose-400');
    expect(container.textContent).not.toContain('MIN');
    expect(container.textContent).not.toContain('AVG');
  });

  // Regression: a prior fix keyed the collapse on `row.slots.length === 1`
  // only, and it did not fire live. Weight is now collapsed on its sentinel
  // id regardless of what shape `slots` arrives in — length 3 (duplicated),
  // length 0 (empty), whatever. These assert the id guard, not the length.
  test('Glove Weight collapses to a single value even when slots arrives length 3 (duplicated)', () => {
    const weird: DimensionRow = {
      id: FIXED_DIM_WEIGHT,
      name: 'GLOVE WEIGHT',
      unit: 'g',
      measured: { min: 2.22, max: 2.22, avg: 2.22 },
      failed: false,
      isGraded: true,
      threshold: 2.30,
      maxThreshold: 2.70,
      isMin: false,
      hasSnapshot: true,
      slots: ['2.22', '2.22', '2.22'],
      slotFails: [false, false, false],
    };
    const { container } = render(<DimensionsPanel rows={[weird]} />);
    expectText(container, '2.22g');
    expect(container.textContent).not.toContain('MIN');
    expect(container.textContent).not.toContain('MAX');
    expect(container.textContent).not.toContain('AVG');
  });

  test('Glove Weight collapses to a single value even when slots arrives empty', () => {
    const empty: DimensionRow = {
      id: FIXED_DIM_WEIGHT,
      name: 'GLOVE WEIGHT',
      unit: 'g',
      measured: { min: 2.22, max: 2.22, avg: 2.22 },
      failed: false,
      isGraded: true,
      threshold: 2.30,
      maxThreshold: 2.70,
      isMin: false,
      hasSnapshot: true,
      slots: [],
      slotFails: [],
    };
    const { container } = render(<DimensionsPanel rows={[empty]} />);
    expectText(container, '2.22g');
    expect(container.textContent).not.toContain('MIN');
    expect(container.textContent).not.toContain('AVG');
  });
});
