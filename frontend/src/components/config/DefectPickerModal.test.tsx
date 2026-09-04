/**
 * @file DefectPickerModal.test.tsx
 * @description Guards the Stage 4a picker's ADD affordance.
 *
 * The regression this locks in: available rows once rendered a green checkmark
 * in the ADD column, visually identical to the greyed checkmark on an
 * already-in-profile row — it read as an already-confirmed selection rather
 * than a clickable action. Available rows must show an explicit "+ ADD"
 * control; picking one must call onPick (not onClose) and flip the row in
 * place so the modal stays open for multi-add.
 *
 * Real browser (Vitest browser mode) per this project's convention. useAuth is
 * mocked (Group A/B login is MSAL-popup based, undriveable in a sandbox) and
 * fetch is stubbed with a fake GET /api/registry/defects.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor, within } from '@testing-library/react';
import DefectPickerModal from './DefectPickerModal';

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

const REGISTRY = [
  { id: 'def_pin_hole', code: 'DEF-001', name: 'Pin Hole', locked: false, submissionCount: 0, profileCount: 1 },
  { id: 'def_odour', code: 'DEF-024', name: 'Odour', locked: true, submissionCount: 3, profileCount: 1 },
  { id: 'def_stain', code: 'DEF-040', name: 'Stain', locked: false, submissionCount: 0, profileCount: 0 },
];

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/registry/defects')) {
      return { ok: true, json: async () => REGISTRY } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DefectPickerModal — ADD affordance', () => {
  test('available row shows a "+ ADD" button, not a bare checkmark', async () => {
    stubFetch();
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { findByText, getByText } = render(
      <DefectPickerModal
        categoryName="VISUALS"
        existingDefectIds={[]}
        onPick={onPick}
        onClose={onClose}
        onRegisterNew={vi.fn()}
      />,
    );

    await findByText('Pin Hole');
    const row = getByText('Pin Hole').closest('tr')!;
    const addBtn = within(row).getByRole('button', { name: /add/i });
    expect(addBtn.textContent).toMatch(/ADD/);
  });

  test('clicking ADD calls onPick with {id,name}, never onClose, and flips the row in place', async () => {
    stubFetch();
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { findByText, getByText, queryByText } = render(
      <DefectPickerModal
        categoryName="VISUALS"
        existingDefectIds={[]}
        onPick={onPick}
        onClose={onClose}
        onRegisterNew={vi.fn()}
      />,
    );

    await findByText('Stain');
    const row = getByText('Stain').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /add/i }));

    expect(onPick).toHaveBeenCalledWith({ id: 'def_stain', name: 'Stain' });
    expect(onClose).not.toHaveBeenCalled();

    // Row flips: ADD control gone, "already in this profile" label present.
    await waitFor(() => {
      const flipped = getByText('Stain').closest('tr')!;
      expect(within(flipped).queryByRole('button', { name: /add/i })).toBeNull();
      expect(within(flipped).getByText(/already in this profile/i)).toBeTruthy();
    });
    expect(queryByText(/already in this profile/i)).toBeTruthy();
  });

  test('already-in-profile row (via prop) shows the greyed label and no ADD button', async () => {
    stubFetch();
    const { findByText, getByText } = render(
      <DefectPickerModal
        categoryName="VISUALS"
        existingDefectIds={['def_pin_hole']}
        onPick={vi.fn()}
        onClose={vi.fn()}
        onRegisterNew={vi.fn()}
      />,
    );

    await findByText('Pin Hole');
    const row = getByText('Pin Hole').closest('tr')!;
    expect(within(row).getByText(/already in this profile/i)).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /add/i })).toBeNull();
  });

  test('a locked but not-yet-in-profile defect is still addable', async () => {
    stubFetch();
    const onPick = vi.fn();
    const { findByText, getByText } = render(
      <DefectPickerModal
        categoryName="VISUALS"
        existingDefectIds={[]}
        onPick={onPick}
        onClose={vi.fn()}
        onRegisterNew={vi.fn()}
      />,
    );

    await findByText('Odour');
    const row = getByText('Odour').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /add/i }));
    expect(onPick).toHaveBeenCalledWith({ id: 'def_odour', name: 'Odour' });
  });
});
