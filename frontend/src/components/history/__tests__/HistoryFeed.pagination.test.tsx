/**
 * @file HistoryFeed.pagination.test.tsx
 * @description Guards AUDIT_REPORT.md #20's sibling finding on Inspection
 * Records: the "Load More" control must actually appear AND fetch+append
 * further pages, not just render. The regression this locks in: PAGE_SIZE
 * was 50, above the realistic record count, so the first fetch returned
 * everything, `hasMore` came back false, and the control never rendered.
 * PAGE_SIZE is now 10 (EXPORT_PAGE_SIZE stays 200 — CSV export pulls bulk).
 *
 * Runs in a REAL browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts), matching this project's existing HistoryFeed test
 * convention (history.widthRegression.test.tsx).
 *
 * `useConfig` is mocked to a minimal config — the list/pagination path never
 * touches it (only the filter panel and the expand-row detail do, neither of
 * which this test opens). `fetch` is stubbed with a paginating fake of
 * GET /api/submissions that mirrors the real backend's skip/take + `hasMore`.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../ui/ToastProvider';
import { HistoryFeed } from '../HistoryFeed';

vi.mock('../../../context/ConfigContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/ConfigContext')>();
  return {
    ...actual,
    useConfig: () => ({
      config: { lines: [], sides: [], products: {}, productMatrixConfig: {}, dimensions: [] },
      getResolvedProfile: () => null,
    }),
  };
});

const TOTAL = 25;

/** LOT-001 … LOT-025, each with a distinct descending productionDate so the
 *  component's presentation sort keeps LOT-001 first. */
function allSubmissions() {
  return Array.from({ length: TOTAL }, (_, i) => {
    const n = String(i + 1).padStart(3, '0');
    const day = String(TOTAL - i).padStart(2, '0'); // LOT-001 -> Jan 25, LOT-025 -> Jan 01
    return {
      id: `sub_${n}`,
      createdAt: new Date(Date.UTC(2026, 0, TOTAL - i)).toISOString(),
      productCode: 'N035SKB-OC-24FT',
      productionDate: `2026-01-${day}T08:00:00.000Z`,
      samplingTime: '08:00',
      machineId: 'A001',
      shift: 'Shift 1 (Morning)',
      batchNumber: `LOT-${n}`,
      size: 'M',
      sampleSize: 125,
      defects: {},
      dimensions: {},
      verdict: 'PASSED',
      inspectorName: `Operator ${n}`,
      amendmentStatus: 'UNMODIFIED',
      amendmentLogs: [],
    };
  });
}

interface FetchCall {
  page: number;
  limit: number;
}

function stubSubmissionsFetch(calls: FetchCall[]) {
  const data = allSubmissions();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (url.includes('/api/submissions/new-indicator')) {
        // Far-future threshold => no "NEW" row badges, so each lot cell's text
        // is exactly the batch number.
        return new Response(JSON.stringify({ effectiveLastViewedAt: '2099-01-01T00:00:00.000Z' }), { status: 200 });
      }
      if (url.includes('/api/submissions/mark-history-viewed')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes('/api/submissions')) {
        const q = new URL(url, 'https://x').searchParams;
        const page = Number(q.get('page')) || 1;
        const limit = Number(q.get('limit')) || 50;
        calls.push({ page, limit });

        const skip = (page - 1) * limit;
        const rows = data.slice(skip, skip + limit);
        const hasMore = skip + rows.length < data.length;
        return new Response(
          JSON.stringify({ submissions: rows, count: rows.length, page, limit, totalCount: data.length, hasMore }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

/** Batch-number text of every rendered data row (2nd cell = LOT NUMBER). */
function renderedLots(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('tbody tr'))
    .map((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim() ?? '')
    .filter(Boolean);
}

function renderFeed() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <HistoryFeed />
      </MemoryRouter>
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HistoryFeed — Load More pagination (AUDIT_REPORT.md #20)', () => {
  test('first page shows exactly 10 rows and a LOAD MORE control', async () => {
    const calls: FetchCall[] = [];
    stubSubmissionsFetch(calls);

    const { container, findByText } = renderFeed();
    await findByText('LOT-001');

    expect(calls.find((c) => c.page === 1)).toEqual({ page: 1, limit: 10 });
    expect(renderedLots(container)).toHaveLength(10);
    await findByText('LOAD MORE');
  });

  test('LOAD MORE fetches the next page and APPENDS it — no duplicate or skipped rows across pages', async () => {
    const calls: FetchCall[] = [];
    stubSubmissionsFetch(calls);

    const { container, findByText, queryByText } = renderFeed();
    await findByText('LOT-001');

    // Page 2
    fireEvent.click(await findByText('LOAD MORE'));
    await findByText('LOT-011');

    let lots = renderedLots(container);
    const expected20 = Array.from({ length: 20 }, (_, i) => `LOT-${String(i + 1).padStart(3, '0')}`);
    expect(lots).toHaveLength(20);
    expect(new Set(lots).size).toBe(20); // no duplicates
    expect(new Set(lots)).toEqual(new Set(expected20)); // no skips
    expect(calls).toContainEqual({ page: 2, limit: 10 });
    await findByText('LOAD MORE'); // 20 < 25, still more

    // Page 3 (final)
    fireEvent.click(await findByText('LOAD MORE'));
    await findByText('LOT-021');

    lots = renderedLots(container);
    const expected25 = Array.from({ length: 25 }, (_, i) => `LOT-${String(i + 1).padStart(3, '0')}`);
    expect(lots).toHaveLength(25);
    expect(new Set(lots).size).toBe(25);
    expect(new Set(lots)).toEqual(new Set(expected25));
    expect(calls).toContainEqual({ page: 3, limit: 10 });

    await waitFor(() => expect(queryByText('LOAD MORE')).toBeNull()); // exhausted
  });
});
