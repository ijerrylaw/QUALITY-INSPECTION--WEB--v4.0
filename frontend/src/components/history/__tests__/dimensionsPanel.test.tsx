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
 * HIERARCHY SWAP (2026-08-27, follow-up): the out-of-spec list is now the
 * PRIMARY line (normal size, red) when present, with MIN/MAX/AVG demoted to
 * a smaller grey secondary line beneath it — the reverse of the original
 * ordering/weight. Format also changed from `MIN x / MAX y / AVG z` to
 * `MIN : x   MAX : y   AVG : z`. A compliant row (no out-of-spec line) shows
 * only the one secondary-styled MIN/MAX/AVG line.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DimensionsPanel } from '../DimensionsPanel';
import type { DimensionRow } from '../DimensionsPanel';
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

  test('COMPLIANT row shows only the secondary MIN/MAX/AVG line, no out-of-spec line', () => {
    const { getByText, container } = render(<DimensionsPanel rows={[ROWS[0]!]} />);
    expect(getByText('COMPLIANT')).toBeTruthy();
    expectText(container, 'MIN : 240mm');
    expectText(container, 'MAX : 244mm');
    expectText(container, 'AVG : 242mm');
    expect(container.textContent).not.toContain('OUT OF SPEC');
  });

  test('OUT OF SPEC row shows the out-of-spec list FIRST (primary line), listing exactly the failed slot values, with MIN/MAX/AVG demoted beneath it', () => {
    const { getByText, container } = render(<DimensionsPanel rows={[ROWS[1]!]} />);
    expect(getByText('OUT OF SPEC')).toBeTruthy();
    expectText(container, '0.16mm'); // spec range upper bound, TARGET column
    // Only slots 2 and 4 failed in this fixture (values 0.22 and 0.21) — the
    // other 3 passing values must NOT appear in the out-of-spec list, and no
    // "OUT OF SPEC:" label prefix (RESULT's own badge already says that).
    expectText(container, '0.22mm, 0.21mm');
    expect(container.textContent).not.toContain('0.18mm, ');
    // Secondary MIN/MAX/AVG line still present, demoted beneath it.
    expectText(container, 'MIN : 0.18mm');
    expectText(container, 'MAX : 0.22mm');
    expectText(container, 'AVG : 0.20mm');

    // Hierarchy: the out-of-spec span must render BEFORE the MIN/MAX/AVG
    // row in DOM order (primary line first, secondary line second).
    const outOfSpecSpan = findByTextContent(container, '0.22mm, 0.21mm');
    const minSpan = findByTextContent(container, 'MIN : 0.18mm');
    expect(outOfSpecSpan.compareDocumentPosition(minSpan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Primary line is normal size + red; secondary line is smaller + grey.
    expect(outOfSpecSpan.className).toContain('text-sm');
    expect(outOfSpecSpan.className).toContain('text-rose-400');
    expect(minSpan.className).toContain('text-xs');
    expect(minSpan.className).toContain('text-muted');
  });

  test('RECORD ONLY badge and a "—" spec range for a record-only dimension; MIN/MAX/AVG still shown, no out-of-spec line', () => {
    const { getByText, container } = render(<DimensionsPanel rows={[ROWS[2]!]} />);
    expect(getByText('RECORD ONLY')).toBeTruthy();
    expect(getByText('—')).toBeTruthy();
    expectText(container, 'MIN : 1mm');
    expectText(container, 'MAX : 1.20mm');
    expectText(container, 'AVG : 1.10mm');
    expect(container.textContent).not.toContain('OUT OF SPEC');
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
});
