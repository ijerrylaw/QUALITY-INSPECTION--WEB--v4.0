/**
 * @file AccessLogPanel.test.tsx
 * @description Regression guard for the bug this session fixed: the panel's
 * fetch call sent no `X-User-Role` header at all, so `GET /api/access-log`
 * (Group A only, `requireGroup('A')` — see `backend/src/routes/accessLog.routes.ts`)
 * 401'd for every real logged-in Group A user, not just unauthenticated
 * callers. Runs in a REAL browser (Vitest browser mode, Playwright/Chromium
 * — see vitest.config.ts), matching this project's existing convention
 * (history.widthRegression.test.tsx) for verifying real DOM/network behavior
 * rather than a jsdom approximation of it.
 *
 * `useAuth()` is mocked to a fixed ADMIN user — this app's real Group A
 * login is MSAL popup-based and cannot be driven in any sandboxed browser
 * (NAVIGATION_AND_RBAC.md §3.1) — but `authHeader()` itself is the REAL
 * implementation (only `useAuth` is overridden below), so what's actually
 * under test is "does AccessLogPanel pass its resolved user into
 * authHeader() and thread the result into fetch()", which is exactly where
 * the bug was.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { AccessLogPanel } from '../AccessLogPanel';
import type { User } from '../../../context/AuthContext';
// The REAL compiled Tailwind CSS — the fixed-height/sticky-header test below
// measures actual box heights and sticky positioning, which are inert
// without this (same reasoning as history.widthRegression.test.tsx).
import '../../../index.css';

const ADMIN_USER: User = {
  id: 'test-admin-id',
  name: 'Test Admin',
  title: 'IT Admin',
  role: 'ADMIN',
  tenantId: 'TENANT_ONEGLOVE_01',
  facilityId: 'GLOBAL',
  loginMethod: 'M365',
  status: 'active',
  mustChangePin: false,
};

vi.mock('../../../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/AuthContext')>();
  return {
    ...actual,
    useAuth: () => ({
      user: ADMIN_USER,
      isAuthenticated: true,
      loginWithM365: vi.fn(),
      loginWithPIN: vi.fn(),
      claimBootstrapAdmin: vi.fn(),
      completePinChange: vi.fn(),
      logout: vi.fn(),
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function accessLogRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'log_1',
    userId: 'test-aad-obj',
    role: 'ADMIN',
    userDisplayName: null,
    action: 'CONFIG_WRITE',
    detail: 'System Admin',
    ipAddress: '127.0.0.1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('AccessLogPanel: sends the X-User-Role header (the actual bug)', () => {
  test('the initial fetch carries X-User-Role: ADMIN, not an unauthenticated request', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ logs: [], count: 0, page: 1, limit: 50, totalCount: 0, hasMore: false }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { findByText } = render(<AccessLogPanel />);
    await findByText('No access log entries yet.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-User-Role']).toBe('ADMIN');
  });
});

describe('AccessLogPanel: USER / ROLE column ("Name · Role" format)', () => {
  test('renders "Name · Role" with userId still visible underneath', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({
          logs: [accessLogRow({ userDisplayName: 'Jerry Law', role: 'ADMIN', userId: 'aad-jerry-law' })],
          count: 1, page: 1, limit: 50, totalCount: 1, hasMore: false,
        }),
        { status: 200 },
      ),
    ));

    const { findByText } = render(<AccessLogPanel />);

    await findByText('Jerry Law · ADMIN');
    await findByText('aad-jerry-law');
  });

  test('a null userDisplayName (pre-migration row, or a login that never resolved) renders "—" gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({
          logs: [accessLogRow({ userDisplayName: null, role: 'ADMIN', userId: 'aad-legacy-row' })],
          count: 1, page: 1, limit: 50, totalCount: 1, hasMore: false,
        }),
        { status: 200 },
      ),
    ));

    const { findByText } = render(<AccessLogPanel />);

    // '—' with no name, but the role still shows and userId is still visible.
    await findByText('— · ADMIN');
    await findByText('aad-legacy-row');
  });

  test('a fully unresolved failed-login row (no name, no role, no userId) renders without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({
          logs: [accessLogRow({ userDisplayName: null, role: null, userId: null, action: 'PIN_LOGIN_FAILURE', detail: null })],
          count: 1, page: 1, limit: 50, totalCount: 1, hasMore: false,
        }),
        { status: 200 },
      ),
    ));

    const { findByText } = render(<AccessLogPanel />);

    await findByText('—', { selector: '.font-bold' });
  });
});

describe('AccessLogPanel: Retry control', () => {
  test('Retry re-fires the fetch and recovers from a failed load', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'Failed to retrieve access log' }), { status: 500 });
      }
      return new Response(
        JSON.stringify({ logs: [accessLogRow()], count: 1, page: 1, limit: 50, totalCount: 1, hasMore: false }),
        { status: 200 },
      );
    }));

    const { findByText, getByText } = render(<AccessLogPanel />);

    // Initial load fails — error banner with a Retry control is shown.
    await findByText(/server error: 500/i);
    const retryButton = getByText('RETRY');

    fireEvent.click(retryButton);

    // Second call succeeds — the row renders and the error banner clears.
    await findByText('System Admin');
    expect(() => getByText(/server error: 500/i)).toThrow();
    expect(callCount).toBe(2);
  });
});

describe('AccessLogPanel: refresh control', () => {
  test('the header refresh button re-pulls page 1 in place, with no full page reload', async () => {
    // Real Chromium (not jsdom) disallows redefining `window.location`
    // entirely — so it can't be spied on directly here. The proof of "no
    // full reload" this test relies on instead: the exact same rendered
    // `container`/React tree is still alive and responds to a second fetch
    // after the click. A real navigation would tear down this document
    // (and this test harness) rather than let the update happen in place.
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount += 1;
      const row = accessLogRow({ id: `log_${callCount}`, detail: callCount === 1 ? 'System Admin' : 'Product Engine' });
      return new Response(
        JSON.stringify({ logs: [row], count: 1, page: 1, limit: 50, totalCount: 1, hasMore: false }),
        { status: 200 },
      );
    }));

    const { findByText, container } = render(<AccessLogPanel />);
    await findByText('System Admin');

    const refreshButton = container.querySelector('button') as HTMLButtonElement;
    fireEvent.click(refreshButton);

    await findByText('Product Engine');
    expect(callCount).toBe(2);
  });
});

describe('AccessLogPanel: fixed-height scroll container with sticky header', () => {
  function manyRows(prefix: string, n: number) {
    return Array.from({ length: n }, (_, i) =>
      accessLogRow({ id: `${prefix}_${i}`, userId: `${prefix}_${i}`, timestamp: new Date(Date.now() - i * 1000).toISOString() }),
    );
  }

  test('the table scrolls internally (bounded box, not page growth), the header stays pinned while scrolled, and Load More appends without resetting scroll position', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount += 1;
      const rows = callCount === 1 ? manyRows('p1', 12) : manyRows('p2', 12);
      return new Response(
        JSON.stringify({ logs: rows, count: rows.length, page: callCount, limit: 50, totalCount: 24, hasMore: callCount === 1 }),
        { status: 200 },
      );
    }));

    const { container, findByText } = render(<AccessLogPanel />);
    await findByText('LOAD MORE');

    const table = container.querySelector('table')!;
    const scrollBox = table.parentElement as HTMLElement;

    // Internal scroll exists: 12 rows' worth of content is taller than the
    // box itself, proving the box didn't just grow to fit everything.
    expect(scrollBox.scrollHeight).toBeGreaterThan(scrollBox.clientHeight);
    // The box's own rendered height is bounded near the ~7-8-row sizing call
    // (max-h-[420px]), regardless of how many rows are loaded.
    expect(scrollBox.getBoundingClientRect().height).toBeLessThanOrEqual(421);

    // Scroll down inside the box.
    scrollBox.scrollTop = 150;
    scrollBox.dispatchEvent(new Event('scroll', { bubbles: true }));

    const headerCell = scrollBox.querySelector('th')!;
    // Sticky: the header cell's top edge stays at the scroll box's own top
    // edge even after scrolling — a non-sticky header would have moved up
    // out of view by ~150px instead.
    expect(Math.abs(headerCell.getBoundingClientRect().top - scrollBox.getBoundingClientRect().top)).toBeLessThan(2);

    const loadMoreButton = await findByText('LOAD MORE');
    fireEvent.click(loadMoreButton);

    await waitFor(() => expect(callCount).toBe(2));
    await findByText('p2_0'); // second page's rows landed (userId is rendered verbatim)

    // Appending the next page must not reset the scroll position.
    expect(scrollBox.scrollTop).toBe(150);
  });
});
