/**
 * @file FeatureRoute.test.tsx
 * @description Guards the route-level half of the Quality Analytics freeze
 * (lib/featureFlags.ts): when the flag is off, navigating straight to the
 * guarded path must redirect to the dashboard instead of rendering the page;
 * when on, the guard is a transparent pass-through.
 *
 * Real browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts), matching this project's testing convention.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FeatureRoute } from '../FeatureRoute';
import { QUALITY_ANALYTICS_ENABLED } from '../../../lib/featureFlags';

afterEach(cleanup);

function renderAt(path: string, enabled: boolean) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wizard" element={<div>DASHBOARD HOME</div>} />
        <Route
          path="/analytics"
          element={
            <FeatureRoute enabled={enabled}>
              <div>ANALYTICS PAGE CONTENT</div>
            </FeatureRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FeatureRoute', () => {
  test('flag OFF: a direct hit on the guarded path redirects to the dashboard', () => {
    const { getByText, queryByText } = renderAt('/analytics', false);
    expect(getByText('DASHBOARD HOME')).toBeTruthy();
    expect(queryByText('ANALYTICS PAGE CONTENT')).toBeNull();
  });

  test('flag ON: the guarded element renders unchanged', () => {
    const { getByText, queryByText } = renderAt('/analytics', true);
    expect(getByText('ANALYTICS PAGE CONTENT')).toBeTruthy();
    expect(queryByText('DASHBOARD HOME')).toBeNull();
  });

  test('a custom fallback is honoured', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/analytics']}>
        <Routes>
          <Route path="/somewhere-else" element={<div>CUSTOM FALLBACK</div>} />
          <Route
            path="/analytics"
            element={
              <FeatureRoute enabled={false} fallback="/somewhere-else">
                <div>ANALYTICS PAGE CONTENT</div>
              </FeatureRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(getByText('CUSTOM FALLBACK')).toBeTruthy();
  });

  test('the shipped Quality Analytics flag is frozen OFF', () => {
    // Trip-wire: this must stay false until the feature is deliberately
    // unfrozen for the next release. Flipping featureFlags.ts to true is the
    // whole unfreeze; this assertion then updates with it.
    expect(QUALITY_ANALYTICS_ENABLED).toBe(false);
  });
});
