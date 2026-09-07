/**
 * @file EnvironmentInfoPanel.redirectUri.test.tsx
 * @description Regression guard for the hardcoded-redirect-URI bug: the panel
 * used to render a hand-maintained `EXPECTED_REDIRECT_URIS` array literal
 * containing this laptop's dev addresses (`https://localhost:4001` and the
 * static LAN IP `https://10.10.110.31:4001`). On any other host that list is
 * simply wrong, so the panel confidently displayed URIs that Entra would
 * reject — an operator diagnosing a redirect-URI-mismatch error was being shown
 * a false answer by the very panel meant to help.
 *
 * The panel now renders the live value from `msalConfig`, which is what MSAL
 * actually hands to Entra. The real `msalConfig` module is deliberately NOT
 * mocked here — the whole point is to prove the end-to-end derivation from
 * `window.location.origin`, so mocking it would make this test structurally
 * incapable of catching a regression back to a literal.
 *
 * Runs in a REAL browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts) per this project's convention; `window.location.origin` has
 * to be a genuine browser origin for the assertion to mean anything.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { EnvironmentInfoPanel } from '../EnvironmentInfoPanel';
// The REAL compiled Tailwind CSS, matching AccessLogPanel.test.tsx — so the
// panel renders as it actually ships rather than as unstyled markup.
import '../../../index.css';

// The panel calls GET /api/health on mount. Stub it so the test exercises the
// redirect-URI rendering without depending on a running backend (an unstubbed
// fetch would reject and only add console noise — the assertions below don't
// touch the health card either way).
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  cleanup();
});

function stubHealth() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    json: async () => ({ port: 4009, protocol: 'https' }),
  }) as unknown as typeof fetch;
}

/**
 * The origin string also appears in the "Runtime Addresses > Frontend" field,
 * which composes it from the same window.location parts — so a bare
 * getByText(origin) matches twice. Scope to the "Active" field of the Redirect
 * URI card via its own label, which is what this test is actually about.
 */
function activeRedirectUriText(): string {
  return screen.getByText('Active').parentElement?.textContent ?? '';
}

describe('EnvironmentInfoPanel — redirect URI', () => {
  test('renders the live page origin, not a hardcoded address', async () => {
    stubHealth();
    render(<EnvironmentInfoPanel />);

    // The exact string Entra must allowlist, derived at runtime.
    await waitFor(() => {
      expect(activeRedirectUriText()).toContain(window.location.origin);
    });
  });

  test("reports the origin as the source when no build-time override is set", async () => {
    stubHealth();
    render(<EnvironmentInfoPanel />);

    await waitFor(() => {
      expect(screen.getByText("this page's origin (window.location.origin)")).toBeTruthy();
    });
  });

  test('no longer renders the retired hardcoded dev addresses', async () => {
    stubHealth();
    const { container } = render(<EnvironmentInfoPanel />);

    await waitFor(() => {
      expect(activeRedirectUriText()).toContain(window.location.origin);
    });

    // The specific literals that made this panel lie on any other machine.
    expect(container.textContent).not.toContain('10.10.110.31');
    expect(container.textContent).not.toContain(':4001');
  });
});
