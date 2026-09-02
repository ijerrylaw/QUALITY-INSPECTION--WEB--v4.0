/**
 * @file ApprovalsQueue.pagination.test.tsx
 * @description Guards AUDIT_REPORT.md #20: the Approvals Queue "Load More"
 * control must actually appear AND fetch+append further pages — not merely
 * render a button. The regression this locks in: PAGE_SIZE was 50, above the
 * realistic pending-queue row count, so `hasMore` came back false on the
 * first fetch and the control never rendered at all. PAGE_SIZE is now 10.
 *
 * Runs in a REAL browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts), matching this project's convention for verifying real
 * DOM/network behaviour rather than a jsdom approximation.
 *
 * `useAuth`/`useConfig` are mocked — Group A/B login here is MSAL popup-based
 * and cannot be driven in a sandboxed browser (NAVIGATION_AND_RBAC.md §3.1),
 * and neither context feeds the list/pagination path under test (they only
 * matter for the approve/reject headers and the diff modal). `fetch` is
 * stubbed with a paginating fake of GET /api/amendments/pending that mirrors
 * the real backend's skip/take + `hasMore` maths.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { ApprovalsQueue } from '../ApprovalsQueue';

vi.mock('../../../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/AuthContext')>();
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'admin-1', name: 'Test Admin', role: 'ADMIN', loginMethod: 'M365' },
      isAuthenticated: true,
      loginWithM365: vi.fn(),
      loginWithPIN: vi.fn(),
      claimBootstrapAdmin: vi.fn(),
      completePinChange: vi.fn(),
      logout: vi.fn(),
    }),
  };
});

vi.mock('../../../context/ConfigContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/ConfigContext')>();
  return {
    ...actual,
    useConfig: () => ({ config: { products: {}, productMatrixConfig: {} } }),
  };
});

const TOTAL = 25;

/** LOT-001 … LOT-025, newest-first (matches the backend's updatedAt-desc order). */
function allPending() {
  return Array.from({ length: TOTAL }, (_, i) => {
    const n = String(i + 1).padStart(3, '0');
    return {
      id: `sub_${n}`,
      batchNumber: `LOT-${n}`,
      productCode: 'N035SKB-OC-24FT',
      amendmentLogs: [
        {
          id: `log_${n}`,
          submissionId: `sub_${n}`,
          originalValues: '{}',
          newValues: '{}',
          requestedBy: 'operator@factory.com',
          requestedByName: `Operator ${n}`,
          requestedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
          supervisorNote: 'fix',
          status: 'PENDING_APPROVAL',
        },
      ],
    };
  });
}

interface FetchCall {
  page: number;
  limit: number;
}

function stubPendingFetch(calls: FetchCall[]) {
  const data = allPending();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (!url.includes('/api/amendments/pending')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      const q = new URL(url, 'https://x').searchParams;
      const page = Number(q.get('page')) || 1;
      const limit = Number(q.get('limit')) || 30;
      calls.push({ page, limit });

      const skip = (page - 1) * limit;
      const rows = data.slice(skip, skip + limit);
      const hasMore = skip + rows.length < data.length;
      return new Response(
        JSON.stringify({ amendments: rows, count: rows.length, page, limit, totalCount: data.length, hasMore }),
        { status: 200 },
      );
    }),
  );
}

/** Lot-number text of every rendered data row, in DOM order. */
function renderedLots(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('tbody tr')).map(
    (tr) => tr.querySelector('td')?.textContent?.trim() ?? '',
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ApprovalsQueue — Load More pagination (AUDIT_REPORT.md #20)', () => {
  test('first page shows exactly 10 rows and a LOAD MORE control', async () => {
    const calls: FetchCall[] = [];
    stubPendingFetch(calls);

    const { container, findByText } = render(<ApprovalsQueue />);
    await findByText('LOT-001');

    expect(calls[0]).toEqual({ page: 1, limit: 10 });
    expect(renderedLots(container)).toHaveLength(10);
    await findByText('LOAD MORE');
  });

  test('LOAD MORE fetches the next page and APPENDS it — no duplicate or skipped rows across pages', async () => {
    const calls: FetchCall[] = [];
    stubPendingFetch(calls);

    const { container, findByText, queryByText } = render(<ApprovalsQueue />);
    await findByText('LOT-001');

    // Page 2
    fireEvent.click(await findByText('LOAD MORE'));
    await findByText('LOT-011');

    let lots = renderedLots(container);
    expect(lots).toHaveLength(20);
    expect(new Set(lots).size).toBe(20); // no duplicates
    expect(lots).toEqual(Array.from({ length: 20 }, (_, i) => `LOT-${String(i + 1).padStart(3, '0')}`)); // no gaps
    expect(calls).toContainEqual({ page: 2, limit: 10 });
    await findByText('LOAD MORE'); // still more to load (20 < 25)

    // Page 3 (final)
    fireEvent.click(await findByText('LOAD MORE'));
    await findByText('LOT-021');

    lots = renderedLots(container);
    expect(lots).toHaveLength(25);
    expect(new Set(lots).size).toBe(25);
    expect(lots).toEqual(Array.from({ length: 25 }, (_, i) => `LOT-${String(i + 1).padStart(3, '0')}`));
    expect(calls).toContainEqual({ page: 3, limit: 10 });

    await waitFor(() => expect(queryByText('LOAD MORE')).toBeNull()); // exhausted — control gone
  });
});
