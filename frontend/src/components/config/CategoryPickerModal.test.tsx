/**
 * @file CategoryPickerModal.test.tsx
 * @description Guards the Stage 4b category-adoption picker.
 *
 * Coverage mirrors DefectPickerModal.test.tsx plus the combined-flow bits:
 * an available row picks correctly WITH a chosen AQL level + evaluation mode,
 * the auto-lock rule holds (RECORD ONLY -> '' , PASS/FAIL -> 'N/A'), an
 * already-in-profile row is greyed and unpickable, a locked category is still
 * pickable, and REGISTER NEW routes out.
 *
 * Real browser (Vitest browser mode). useAuth mocked; fetch stubbed with a
 * fake GET /api/registry/categories.
 */

import type { ComponentProps } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import CategoryPickerModal from './CategoryPickerModal';

vi.mock('../../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/AuthContext')>();
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

// Names deliberately avoid clashing with ISO_WHITELIST option text ('AND', etc).
const REGISTRY = [
  { id: 'cat_surface', code: 'CAT-001', name: 'SURFACE', locked: false, submissionCount: 0, profileCount: 1 },
  { id: 'cat_barrier', code: 'CAT-002', name: 'BARRIER', locked: true, submissionCount: 4, profileCount: 2 },
  { id: 'cat_packaging', code: 'CAT-003', name: 'PACKAGING', locked: false, submissionCount: 0, profileCount: 0 },
];

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/registry/categories')) {
      return { ok: true, json: async () => REGISTRY } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderModal(overrides: Partial<ComponentProps<typeof CategoryPickerModal>> = {}) {
  const props = {
    profileName: 'MEDLINE',
    existingCategoryIds: [] as string[],
    onPick: vi.fn(),
    onClose: vi.fn(),
    onRegisterNew: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<CategoryPickerModal {...props} />) };
}

describe('CategoryPickerModal — adoption flow', () => {
  test('available row shows "+ ADD"; picking it reveals AQL + Eval Mode selectors', async () => {
    stubFetch();
    const { findByText, getByText } = renderModal();

    await findByText('SURFACE');
    const row = getByText('SURFACE').closest('tr')!;
    const addBtn = within(row).getByRole('button', { name: /add/i });
    expect(addBtn.textContent).toMatch(/ADD/);

    fireEvent.click(addBtn);

    await waitFor(() => {
      const picking = getByText('SURFACE').closest('tr')!;
      // Two selects appear: AQL + Eval Mode.
      expect(within(picking).getAllByRole('combobox')).toHaveLength(2);
    });
  });

  test('confirming an adoption calls onPick with the chosen AQL + evalMode, never onClose, and flips the row', async () => {
    stubFetch();
    const { props, findByText, getByText } = renderModal();

    await findByText('PACKAGING');
    fireEvent.click(within(getByText('PACKAGING').closest('tr')!).getByRole('button', { name: /add/i }));

    const picking = await waitFor(() => {
      const r = getByText('PACKAGING').closest('tr')!;
      expect(within(r).getAllByRole('combobox')).toHaveLength(2);
      return r;
    });
    const [aqlSel, evalSel] = within(picking).getAllByRole('combobox') as HTMLSelectElement[];
    await userEvent.selectOptions(aqlSel, '2.5');
    await userEvent.selectOptions(evalSel, 'GRANULAR');
    fireEvent.click(within(picking).getByRole('button', { name: /^add$/i }));

    expect(props.onPick).toHaveBeenCalledWith({
      id: 'cat_packaging', name: 'PACKAGING', aql: '2.5', evalMode: 'GRANULAR',
    });
    expect(props.onClose).not.toHaveBeenCalled();

    await waitFor(() => {
      const flipped = getByText('PACKAGING').closest('tr')!;
      expect(within(flipped).queryByRole('button', { name: /add/i })).toBeNull();
      expect(within(flipped).getByText(/already in this profile/i)).toBeTruthy();
    });
  });

  test('auto-lock: RECORD ONLY forces evalMode "" and disables the Eval Mode select', async () => {
    stubFetch();
    const { props, findByText, getByText } = renderModal();

    await findByText('SURFACE');
    fireEvent.click(within(getByText('SURFACE').closest('tr')!).getByRole('button', { name: /add/i }));
    const picking = await waitFor(() => {
      const r = getByText('SURFACE').closest('tr')!;
      expect(within(r).getAllByRole('combobox')).toHaveLength(2);
      return r;
    });
    await userEvent.selectOptions(within(picking).getAllByRole('combobox')[0] as HTMLSelectElement, 'RECORD ONLY');
    await waitFor(() =>
      expect((within(picking).getAllByRole('combobox')[1] as HTMLSelectElement).disabled).toBe(true),
    );
    fireEvent.click(within(picking).getByRole('button', { name: /^add$/i }));
    expect(props.onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'cat_surface', aql: 'RECORD ONLY', evalMode: '' }),
    );
  });

  test('auto-lock: PASS/FAIL forces evalMode "N/A"', async () => {
    stubFetch();
    const { props, findByText, getByText } = renderModal();

    await findByText('PACKAGING');
    fireEvent.click(within(getByText('PACKAGING').closest('tr')!).getByRole('button', { name: /add/i }));
    const picking = await waitFor(() => {
      const r = getByText('PACKAGING').closest('tr')!;
      expect(within(r).getAllByRole('combobox')).toHaveLength(2);
      return r;
    });
    await userEvent.selectOptions(within(picking).getAllByRole('combobox')[0] as HTMLSelectElement, 'PASS/FAIL');
    fireEvent.click(within(picking).getByRole('button', { name: /^add$/i }));
    expect(props.onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'cat_packaging', aql: 'PASS/FAIL', evalMode: 'N/A' }),
    );
  });

  test('already-in-profile row is greyed with a label and no ADD button', async () => {
    stubFetch();
    const { findByText, getByText } = renderModal({ existingCategoryIds: ['cat_surface'] });

    await findByText('SURFACE');
    const row = getByText('SURFACE').closest('tr')!;
    expect(within(row).getByText(/already in this profile/i)).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /add/i })).toBeNull();
  });

  test('a locked category not yet in the profile is still pickable', async () => {
    stubFetch();
    const { props, findByText, getByText } = renderModal();

    await findByText('BARRIER');
    const row = getByText('BARRIER').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /add/i }));

    const picking = await waitFor(() => {
      const r = getByText('BARRIER').closest('tr')!;
      expect(within(r).getAllByRole('combobox')).toHaveLength(2);
      return r;
    });
    fireEvent.click(within(picking).getByRole('button', { name: /^add$/i }));
    expect(props.onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cat_barrier', name: 'BARRIER' }),
    );
  });

  test('REGISTER NEW CATEGORY routes to onRegisterNew', async () => {
    stubFetch();
    const { props, findByRole } = renderModal();
    const btn = await findByRole('button', { name: /register new category/i });
    fireEvent.click(btn);
    expect(props.onRegisterNew).toHaveBeenCalledTimes(1);
  });
});
