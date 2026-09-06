/**
 * @file AmendmentAcknowledgment.test.tsx
 * @description Behaviour of the per-change acknowledgment checklist.
 *
 * Runs in a REAL browser (Vitest browser mode, Playwright/Chromium — see
 * vitest.config.ts), matching this project's convention.
 *
 * `useAuth`/`useConfig` are mocked: Group A/B login is MSAL popup-based and
 * cannot be driven in a sandboxed browser (NAVIGATION_AND_RBAC.md §3.1). `fetch`
 * is stubbed with the real response shape of
 * POST /api/submissions/:id/amendment-preview, taken from a live call against
 * lot A001A6247003 — the amendment this whole gate exists for.
 *
 * The property under test is the gate's client half: `ready` must be false until
 * EVERY detected change is ticked, and must never be true while the diff is
 * loading or failed. The server re-checks all of this; the point here is that the
 * UI cannot present an enabled submit for an unacknowledged change.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { AmendmentAcknowledgment } from '../AmendmentAcknowledgment';

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
    API_BASE_URL: '',
    useConfig: () => ({
      config: {
        inspectionProfiles: [
          {
            id: 'prof_default',
            name: 'FACTORY STANDARD',
            isDefault: true,
            aqlCategories: [{ id: 'VISUALS', name: 'VISUALS', aql: '2.5', evalMode: 'GRANULAR' }],
            defectDefinitions: [
              { id: 'def_thin_weak_spot', name: 'Thin/Weak Spot', categoryId: 'VISUALS' },
              { id: 'def_shining_oily_mark', name: 'Shining / Oily Mark', categoryId: 'VISUALS' },
            ],
          },
          {
            id: 'prof_1787197871523',
            name: 'MEDLINE',
            aqlCategories: [{ id: 'VISUAL_MAJOR', name: 'VISUAL — MAJOR', aql: '2.5', evalMode: 'GRANULAR' }],
            defectDefinitions: [
              { id: 'def_thin_weak_spot', name: 'Thin/Weak Spot', categoryId: 'VISUAL_MAJOR' },
            ],
          },
        ],
      },
    }),
  };
});

/** The live response for lot A001A6247003's amendment. */
const REAL_CHANGES = [
  { path: 'defects.def_shining_oily_mark', changeType: 'modified', from: 0, to: 1 },
  { path: 'defects.def_thin_weak_spot', changeType: 'modified', from: 0, to: 1 },
  { path: 'profileId', changeType: 'modified', from: 'prof_default', to: 'prof_1787197871523' },
];

const NEW_VALUES = {
  productCode: 'N030MNV-OC-24FT',
  profileId: 'prof_1787197871523',
  submissionTimestamp: '2026-09-04T10:00:35.698Z',
  defects: { def_thin_weak_spot: 1, def_shining_oily_mark: 1 },
};

function stubPreview(changes: unknown[] = REAL_CHANGES) {
  // Declare the fetch args the component actually passes so `spy.mock.calls[N]`
  // is typed `[string, RequestInit]` rather than the empty tuple a zero-arg
  // implementation would produce.
  const spy = vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(JSON.stringify({ changes, detectedChangeCount: changes.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderChecklist(onChange = vi.fn()) {
  render(
    <AmendmentAcknowledgment
      submissionId="cmtms8d6t0006ukc48lqk0ozu"
      newValues={NEW_VALUES}
      beforeProfileId="prof_default"
      onChange={onChange}
    />,
  );
  return onChange;
}

const lastState = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AmendmentAcknowledgment', () => {
  test('renders one checkbox per server-detected change, none pre-ticked', async () => {
    stubPreview();
    const { container } = render(
      <AmendmentAcknowledgment
        submissionId="s1"
        newValues={NEW_VALUES}
        beforeProfileId="prof_default"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      const boxes = container.querySelectorAll('input[type="checkbox"]');
      expect(boxes).toHaveLength(REAL_CHANGES.length);
    });

    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    // A pre-ticked box would be a blanket confirmation wearing a checklist's clothes.
    expect([...boxes].every((b) => !b.checked)).toBe(true);
  });

  test('humanizes ids into the labels the approver also sees', async () => {
    stubPreview();
    const { container } = render(
      <AmendmentAcknowledgment
        submissionId="s1"
        newValues={NEW_VALUES}
        beforeProfileId="prof_default"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.textContent).toContain('Thin/Weak Spot'));
    // Profile ids resolve to display names on both sides of the arrow.
    expect(container.textContent).toContain('FACTORY STANDARD');
    expect(container.textContent).toContain('MEDLINE');
    // The raw wire path must not leak into the operator-facing label.
    expect(container.textContent).not.toContain('defects.def_thin_weak_spot');
  });

  test('reports ready ONLY once every change is ticked', async () => {
    stubPreview();
    const onChange = renderChecklist();
    const { container } = { container: document.body };

    await waitFor(() => expect(lastState(onChange)?.totalChanges).toBe(3));
    expect(lastState(onChange).ready).toBe(false);

    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');

    fireEvent.click(boxes[0]);
    await waitFor(() => expect(lastState(onChange).acknowledgedPaths).toHaveLength(1));
    expect(lastState(onChange).ready).toBe(false);

    fireEvent.click(boxes[1]);
    await waitFor(() => expect(lastState(onChange).acknowledgedPaths).toHaveLength(2));
    expect(lastState(onChange).ready).toBe(false);

    fireEvent.click(boxes[2]);
    await waitFor(() => expect(lastState(onChange).ready).toBe(true));
    expect([...lastState(onChange).acknowledgedPaths].sort()).toEqual(
      REAL_CHANGES.map((c) => c.path).sort(),
    );
  });

  test('un-ticking any single box revokes ready', async () => {
    stubPreview();
    const onChange = renderChecklist();

    await waitFor(() => expect(lastState(onChange)?.totalChanges).toBe(3));
    const boxes = document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    boxes.forEach((b) => fireEvent.click(b));
    await waitFor(() => expect(lastState(onChange).ready).toBe(true));

    fireEvent.click(boxes[1]);
    await waitFor(() => expect(lastState(onChange).ready).toBe(false));
    expect(lastState(onChange).acknowledgedPaths).toHaveLength(2);
  });

  test('emits the exact wire paths, not the display labels', async () => {
    // These strings round-trip to the server as `acknowledgedChanges`; a
    // humanized value here would fail the gate on every change.
    stubPreview();
    const onChange = renderChecklist();

    await waitFor(() => expect(lastState(onChange)?.totalChanges).toBe(3));
    document.body
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((b) => fireEvent.click(b));

    await waitFor(() => expect(lastState(onChange).ready).toBe(true));
    expect(lastState(onChange).acknowledgedPaths).toContain('defects.def_thin_weak_spot');
    expect(lastState(onChange).acknowledgedPaths).toContain('profileId');
  });

  test('never reports ready while the diff is still loading', async () => {
    // Fetch that never settles — the submit button must stay disabled.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const onChange = renderChecklist();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lastState(onChange).ready).toBe(false);
    expect(lastState(onChange).totalChanges).toBe(0);
  });

  test('never reports ready when the diff request fails', async () => {
    // The dangerous direction: a failed preview must not fall through to an
    // enabled submit, or an unacknowledged change reaches the server unseen.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 })),
    );
    const onChange = renderChecklist();

    await waitFor(() => expect(document.body.textContent).toContain('Could not detect changes'));
    expect(lastState(onChange).ready).toBe(false);
  });

  test('an amendment with no detected changes is ready with an empty set', async () => {
    stubPreview([]);
    const onChange = renderChecklist();

    await waitFor(() => expect(document.body.textContent).toContain('No field changes detected'));
    // Vacuously satisfied, and the server agrees: '[]' is a gate-aware client
    // reporting nothing to acknowledge, which is enforced, not skipped.
    await waitFor(() => expect(lastState(onChange).ready).toBe(true));
    expect(lastState(onChange).acknowledgedPaths).toEqual([]);
  });

  test('POSTs the payload to the preview endpoint with the role header', async () => {
    const spy = stubPreview();
    renderChecklist();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/submissions/cmtms8d6t0006ukc48lqk0ozu/amendment-preview');
    expect((init.headers as Record<string, string>)['X-User-Role']).toBe('ADMIN');
    expect(JSON.parse(init.body as string).newValues).toEqual(NEW_VALUES);
  });
});
