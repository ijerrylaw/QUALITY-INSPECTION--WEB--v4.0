/**
 * @file aqlCategoryAnalysisPanel.test.tsx
 * @description Real-browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts) coverage for AqlCategoryAnalysisPanel.tsx's CategoryRow,
 * the "Defects" table section of HistoryFeed.tsx's "INSPECTION RESULTS"
 * panel. No dedicated test file existed for this component before the
 * layout & content revision (2026-08-27) — only
 * inspectionResultsColumnAlignment.test.tsx touched it, and only for column
 * widths, never content placement.
 *
 * Covers this pass's two structural changes directly:
 *   1. Actual AQL Achieved relocated from RESULT into ACTUAL, beside the
 *      defect count — RESULT now holds the Verdict badge only.
 *   2. TARGET was widened (170px → 220px) specifically so its worst-case
 *      content (AQL level chip + eval mode word + Ac/Re chip) fits on one
 *      line — verified here via real layout measurement, not assumed.
 * Click-to-expand for the per-defect-type pill breakdown is asserted
 * unchanged.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { AqlCategoryAnalysisPanel } from '../AqlCategoryAnalysisPanel';
import type { CategoryAnalysis } from '../AqlCategoryAnalysisPanel';
import '../../../index.css';

afterEach(() => {
  cleanup();
});

function baseCategory(overrides: Partial<CategoryAnalysis>): CategoryAnalysis {
  return {
    id: 'cat_1',
    name: 'BARRIER',
    aqlLevel: '1.5',
    evaluationMode: 'CUMULATIVE',
    threshold: { ac: 3, re: 4 },
    totalCount: 2,
    passed: true,
    defectItems: [{ id: 'def_hole', name: 'Hole', count: 2, failing: false }],
    ...overrides,
  };
}

describe('AqlCategoryAnalysisPanel: Actual AQL relocation', () => {
  test('ACHIEVED badge renders inside ACTUAL, beside the defect count', () => {
    const cat = baseCategory({
      actualAqlAchieved: { status: 'ACHIEVED', aqlLevel: '1.0', threshold: { ac: 3, re: 4 }, evaluatedCount: 2 },
    });
    const { getByText, container } = render(
      <AqlCategoryAnalysisPanel categoryAnalysis={[cat]} unclassified={[]} anyFail={false} noProfileLinked={false} previewStatus="snapshot" />,
    );
    const badge = getByText('ACTUAL 1.0');
    const actualButton = container.querySelector('button[title="Expand defect breakdown"]') as HTMLElement;
    expect(actualButton.contains(badge)).toBe(true);
  });

  test('EXCEEDS_ALL badge (hard fail) also renders inside ACTUAL', () => {
    const cat = baseCategory({
      passed: false,
      actualAqlAchieved: { status: 'EXCEEDS_ALL', aqlLevel: null, threshold: { ac: 21, re: 22 }, evaluatedCount: 30 },
    });
    const { getByText, container } = render(
      <AqlCategoryAnalysisPanel categoryAnalysis={[cat]} unclassified={[]} anyFail noProfileLinked={false} previewStatus="snapshot" />,
    );
    const badge = getByText('ACTUAL > 10');
    const actualButton = container.querySelector('button[title="Expand defect breakdown"]') as HTMLElement;
    expect(actualButton.contains(badge)).toBe(true);
  });

  test('QUALITATIVE and missing actualAqlAchieved render no Actual AQL badge at all', () => {
    const qualitative = baseCategory({
      id: 'cat_q',
      actualAqlAchieved: { status: 'QUALITATIVE', aqlLevel: null, threshold: null, evaluatedCount: null },
    });
    const missing = baseCategory({ id: 'cat_m', actualAqlAchieved: undefined });
    const { queryByText } = render(
      <AqlCategoryAnalysisPanel categoryAnalysis={[qualitative, missing]} unclassified={[]} anyFail={false} noProfileLinked={false} previewStatus="snapshot" />,
    );
    expect(queryByText(/^ACTUAL/)).toBeNull();
  });

  test('RESULT holds the Verdict badge only — never an "ACTUAL" pill', () => {
    const cat = baseCategory({
      actualAqlAchieved: { status: 'ACHIEVED', aqlLevel: '1.0', threshold: { ac: 3, re: 4 }, evaluatedCount: 2 },
    });
    const { container } = render(
      <AqlCategoryAnalysisPanel categoryAnalysis={[cat]} unclassified={[]} anyFail={false} noProfileLinked={false} previewStatus="snapshot" />,
    );
    // RESULT is the row's last flex child (ml-auto, right-pinned).
    // `.gap-y-1\.5` distinguishes CategoryRow's own inner flex container from
    // the "Defects" sub-header, which also happens to match `.flex.items-center.flex-wrap`.
    const row = container.querySelector('.flex.items-center.flex-wrap.gap-y-1\\.5') as HTMLElement;
    const resultCell = row.children[row.children.length - 1] as HTMLElement;
    expect(resultCell.textContent).toBe('PASS');
    expect(resultCell.textContent).not.toContain('ACTUAL');
  });

  test('click-to-expand still reveals the per-defect-type pill breakdown, unchanged', async () => {
    const cat = baseCategory({});
    const { container, getByText } = render(
      <AqlCategoryAnalysisPanel categoryAnalysis={[cat]} unclassified={[]} anyFail={false} noProfileLinked={false} previewStatus="snapshot" />,
    );
    const toggle = container.querySelector('button[title="Expand defect breakdown"]') as HTMLButtonElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => expect(getByText('Hole')).toBeTruthy());
  });
});

describe('AqlCategoryAnalysisPanel: header/breakdown revision (2026-09-01)', () => {
  const renderPanel = (cat: CategoryAnalysis) =>
    render(
      <AqlCategoryAnalysisPanel
        categoryAnalysis={[cat]}
        unclassified={[]}
        anyFail={cat.passed === false}
        noProfileLinked={false}
        previewStatus="snapshot"
      />,
    );

  test('CUMULATIVE: collapsed label unchanged ("{n} found"), expanded adds the instances caption', async () => {
    const cat = baseCategory({
      name: 'BARRIER',
      evaluationMode: 'CUMULATIVE',
      threshold: { ac: 3, re: 4 },
      totalCount: 2,
      totalDefectTypes: 3,
      passed: true,
      defectItems: [
        { id: 'b1', name: 'Hole', count: 1, failing: false },
        { id: 'b2', name: 'Tear', count: 1, failing: false },
      ],
    });
    const { container, getByText } = renderPanel(cat);
    expect(getByText('2 found')).toBeTruthy();
    (container.querySelector('button[title="Expand defect breakdown"]') as HTMLButtonElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => expect(getByText('Hole')).toBeTruthy());
    expect(getByText('2 instances total across 3 defect types')).toBeTruthy();
  });

  test('GRANULAR: every defect type over Ac counts toward "N of M failed" — not a max-only 1', () => {
    // Spec scenario: three VISUALS defect types recorded at 8 / 9 / 10 against
    // Ac 7. The engine (aqlEvaluator.ts GRANULAR branch) marks each independently
    // failing because each count > 7; the frontend has no access to that engine
    // (backend-only, no backend test harness), so the `failing` flags are set
    // here exactly as it would set them. A fourth, in-spec type is dropped by the
    // zero-count filter before freeze, so `totalDefectTypes` (4) is the honest
    // denominator while `defectItems` holds only the 3 non-zero types.
    const cat = baseCategory({
      name: 'VISUALS',
      evaluationMode: 'GRANULAR',
      aqlLevel: '4.0',
      threshold: { ac: 7, re: 8 },
      totalCount: 27, // 8 + 9 + 10
      totalDefectTypes: 4,
      passed: false,
      defectItems: [
        { id: 'v1', name: 'Scratch', count: 8, failing: true },
        { id: 'v2', name: 'Smear', count: 9, failing: true },
        { id: 'v3', name: 'Bubble', count: 10, failing: true },
      ],
    });
    const { getByText, queryByText } = renderPanel(cat);
    expect(getByText('3 of 4 failed')).toBeTruthy();
    expect(queryByText('1 of 4 failed')).toBeNull(); // not max-only
    expect(queryByText(/found$/)).toBeNull();        // not the CUMULATIVE label
  });

  test('GRANULAR: expanded breakdown keeps name+count chips and adds the instances caption', async () => {
    const cat = baseCategory({
      name: 'VISUALS',
      evaluationMode: 'GRANULAR',
      threshold: { ac: 7, re: 8 },
      totalCount: 27,
      totalDefectTypes: 4,
      passed: false,
      defectItems: [
        { id: 'v1', name: 'Scratch', count: 8, failing: true },
        { id: 'v2', name: 'Smear', count: 9, failing: true },
        { id: 'v3', name: 'Bubble', count: 10, failing: true },
      ],
    });
    const { container, getByText } = renderPanel(cat);
    (container.querySelector('button[title="Expand defect breakdown"]') as HTMLButtonElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => expect(getByText('Scratch')).toBeTruthy());
    expect(getByText('8')).toBeTruthy();
    expect(getByText('27 instances total across 4 defect types')).toBeTruthy();
  });

  test('N/A qualitative: 1 PASS + 1 FAIL renders "1 of N failed" and exactly one FAIL chip', async () => {
    const cat = baseCategory({
      name: 'OTHERS',
      aqlLevel: 'PASS/FAIL',
      evaluationMode: 'N/A',
      threshold: null,
      totalCount: 1, // engine FAIL-item count, NOT the old 1+2=3 state-code sum
      totalDefectTypes: 2,
      passed: false,
      defectItems: [
        { id: 'd_don', name: 'Donning', count: 2, failing: true, qualitativeState: 'FAIL' },
        { id: 'd_dof', name: 'Doffing', count: 1, failing: false, qualitativeState: 'PASS' },
      ],
    });
    const { container, getByText, queryByText } = renderPanel(cat);

    expect(getByText('1 of 2 failed')).toBeTruthy();
    // The old bug rendered the raw FAIL state code "2" beside the name.
    expect(queryByText('Donning 2')).toBeNull();

    (container.querySelector('button[title="Expand defect breakdown"]') as HTMLButtonElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => expect(getByText('Donning')).toBeTruthy());

    // Exactly one chip, and it is the FAIL one — PASS entries are not rendered at all.
    expect(queryByText('Doffing')).toBeNull();
    const chip = getByText('Donning').closest('div') as HTMLElement;
    const chipRow = chip.parentElement as HTMLElement;
    expect(chipRow.children).toHaveLength(1);
    // The chip carries a "FAIL" text tag, not a number. (A second "FAIL" — the
    // RESULT verdict badge — also exists on the row, hence the scoped check.)
    expect(chip.textContent).toContain('Donning');
    expect(chip.textContent).toContain('FAIL');
    expect(chip.textContent).not.toMatch(/\d/); // no numeric count tag
    // No instances caption for N/A mode.
    expect(queryByText(/instances total/)).toBeNull();
  });

  test('N/A qualitative: a category with only PASS entries is not expandable', () => {
    const cat = baseCategory({
      name: 'OTHERS',
      aqlLevel: 'PASS/FAIL',
      evaluationMode: 'N/A',
      threshold: null,
      totalCount: 0,
      totalDefectTypes: 2,
      passed: true,
      defectItems: [
        { id: 'd_don', name: 'Donning', count: 1, failing: false, qualitativeState: 'PASS' },
        { id: 'd_dof', name: 'Doffing', count: 1, failing: false, qualitativeState: 'PASS' },
      ],
    });
    const { getByText, container } = renderPanel(cat);
    expect(getByText('0 of 2 failed')).toBeTruthy();
    expect(container.querySelector('button[title="Expand defect breakdown"]')).toBeNull();
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });

  test('legacy snapshot without totalDefectTypes falls back to defectItems.length, no crash', () => {
    const cat = baseCategory({
      name: 'VISUALS',
      evaluationMode: 'GRANULAR',
      threshold: { ac: 7, re: 8 },
      totalCount: 17,
      totalDefectTypes: undefined, // pre-fix frozen row
      passed: false,
      defectItems: [
        { id: 'v1', name: 'Scratch', count: 8, failing: true },
        { id: 'v2', name: 'Smear', count: 9, failing: true },
      ],
    });
    const { getByText } = renderPanel(cat);
    expect(getByText('2 of 2 failed')).toBeTruthy();
  });
});

describe('AqlCategoryAnalysisPanel: TARGET column fits its worst-case content on one line', () => {
  test('AQL level chip + eval mode word + Ac/Re chip do not wrap inside the 220px TARGET column', () => {
    // Deliberately the widest realistic shape: CUMULATIVE is the longer of
    // the two eval-mode words, and a real Ac/Re chip is present alongside
    // the AQL level chip — this is exactly the content that used to wrap at
    // the previous 170px width.
    const cat = baseCategory({ evaluationMode: 'CUMULATIVE', aqlLevel: '1.5', threshold: { ac: 3, re: 4 } });
    const { container } = render(
      <AqlCategoryAnalysisPanel categoryAnalysis={[cat]} unclassified={[]} anyFail={false} noProfileLinked={false} previewStatus="snapshot" />,
    );
    // `.gap-y-1\.5` distinguishes CategoryRow's own inner flex container from
    // the "Defects" sub-header, which also happens to match `.flex.items-center.flex-wrap`.
    const row = container.querySelector('.flex.items-center.flex-wrap.gap-y-1\\.5') as HTMLElement;
    const targetCell = row.children[1] as HTMLElement; // 0=NAME, 1=TARGET
    // "One line" is proven by LEFT edges strictly increasing left-to-right
    // (sequential horizontal placement) AND the last chip's right edge
    // landing inside the column's own box. A `top`-equality check was tried
    // first and rejected — it produces a false positive for "wrapped" on
    // differently-sized inline siblings (a plain text span vs. a padded,
    // bordered chip) that are genuinely on one line but vertically centered
    // by sub-pixel amounts different from each other via `items-center`.
    const chips = Array.from(targetCell.children) as HTMLElement[];
    const lefts = chips.map((c) => c.getBoundingClientRect().left);
    for (let i = 1; i < lefts.length; i++) {
      expect(lefts[i]).toBeGreaterThan(lefts[i - 1]!);
    }
    const lastChip = chips[chips.length - 1]!;
    const containerRight = targetCell.getBoundingClientRect().right;
    expect(lastChip.getBoundingClientRect().right).toBeLessThanOrEqual(containerRight + 0.5);
  });
});
