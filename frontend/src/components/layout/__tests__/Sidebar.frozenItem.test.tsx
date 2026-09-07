/**
 * @file Sidebar.frozenItem.test.tsx
 * @description Guards the nav half of the Quality Analytics freeze
 * (lib/featureFlags.ts): with the flag off, the "QUALITY ANALYTICS" menu item
 * must stay VISIBLE but be fully inert — no <a>/href, not focusable, carries a
 * "Coming soon" badge, and a click does not navigate. The other nav items are
 * untouched.
 *
 * Real browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts). The four context hooks Sidebar consumes are mocked to
 * fixed values (this app's Group A login is MSAL-popup based and can't be
 * driven in a sandboxed browser — NAVIGATION_AND_RBAC.md §3.1); the flag
 * itself is the REAL one, so this exercises the shipped frozen state.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { ToastProvider } from '../../ui/ToastProvider';
import '../../../index.css';

function LocationProbe() {
  return <div data-testid="pathname">{useLocation().pathname}</div>;
}

vi.mock('../../../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/AuthContext')>();
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'admin-1', name: 'Test Admin', title: 'IT Admin', role: 'ADMIN', loginMethod: 'M365' },
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
    useConfig: () => ({ config: { companyName: 'TEST CO', portalTitle: 'TEST PORTAL', logoImage: null } }),
  };
});

vi.mock('../../../context/WizardGuardContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/WizardGuardContext')>();
  return {
    ...actual,
    useWizardGuard: () => ({ isWizardDirty: false }),
  };
});

vi.mock('../../../context/HistoryIndicatorContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/HistoryIndicatorContext')>();
  return {
    ...actual,
    useHistoryIndicator: () => ({ hasNewSubmission: false }),
  };
});

afterEach(cleanup);

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/wizard']}>
      <ToastProvider>
        <LocationProbe />
        <Sidebar />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Sidebar — Quality Analytics frozen item', () => {
  test('the item stays visible but is not a link and not focusable', () => {
    const { getByText, getByTitle } = renderSidebar();

    const label = getByText('QUALITY ANALYTICS');
    expect(label).toBeTruthy();

    // A real nav item renders inside an <a href>; the frozen one must not.
    expect(label.closest('a')).toBeNull();

    const row = getByTitle(/coming soon/i);
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.getAttribute('tabindex')).toBe('-1');
    expect(row.tagName).toBe('DIV');
  });

  test('it carries a "Coming soon" badge', () => {
    const { getByTitle } = renderSidebar();
    const row = getByTitle(/coming soon/i);
    expect(within(row).getByText(/coming soon/i)).toBeTruthy();
  });

  test('clicking it does not navigate away from the dashboard', () => {
    const { getByTitle, getByTestId } = renderSidebar();
    expect(getByTestId('pathname').textContent).toBe('/wizard');
    fireEvent.click(getByTitle(/coming soon/i));
    expect(getByTestId('pathname').textContent).toBe('/wizard');
  });

  test('the other nav items are still real links', () => {
    const { getByText } = renderSidebar();
    expect(getByText('QUALITY ENTRY WIZARD').closest('a')).toBeTruthy();
    expect(getByText('APPROVALS QUEUE').closest('a')).toBeTruthy();
    expect(getByText('CONFIGURATION CONTROL').closest('a')).toBeTruthy();
  });
});
