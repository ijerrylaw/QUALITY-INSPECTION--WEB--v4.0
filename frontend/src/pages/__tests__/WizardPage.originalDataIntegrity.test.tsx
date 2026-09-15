/**
 * @file WizardPage.originalDataIntegrity.test.tsx
 * @description Regression guard for the `originalData`/`inspectionData`
 * shared-reference footgun identified during investigation: on amendment
 * load, WizardPage.tsx used to set both state variables to the literal same
 * object (including nested dimensions/defects/qualitative). Every current
 * edit path happens to copy-before-mutating, so this was never a live bug,
 * but nothing enforced it — a plausible future refactor (e.g. a dimension
 * slot update that indexes into the array directly instead of copying it
 * first) could silently corrupt `originalData` with no test to catch it.
 *
 * The fix clones `inspectionData` off the loaded record and freezes
 * `originalData`, so the two are independent objects by construction. This
 * test proves that: it loads an amendment record into WizardPage state,
 * simulates edits to a dimension slot and a defect count, and asserts
 * `originalData`'s nested maps stay byte-identical to the pre-edit snapshot
 * while `inspectionData` diverges from it by reference.
 *
 * StepMetadata/StepDimensions/StepDefects are replaced with minimal stand-ins
 * that capture the exact `inspectionData`/`originalData` props WizardPage
 * passes down and expose a button that calls `onUpdate` the same way the
 * real steps do — this is the minimum scaffolding needed to reach into
 * WizardPage's state without re-implementing the real steps' UI.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../components/ui/ToastProvider';

// Declared via vi.hoisted (not a plain top-level const) because vi.mock
// factories are hoisted above all imports/consts in this project's Vitest
// browser-mode setup — referencing an ordinary top-level variable inside a
// factory throws "make sure there are no top level variables inside".
const { PROFILE_ID, captured } = vi.hoisted(() => ({
  PROFILE_ID: 'prof_test_originaldata',
  // Captures every prop set WizardPage passes to each mocked step, so the
  // test can reach into `inspectionData`/`originalData` without them being
  // exposed through the DOM.
  captured: {
    meta: null as null | { inspectionData: any; originalData: any },
    dims: null as null | { inspectionData: any; originalData: any; onUpdate: (p: any) => void },
    defects: null as null | { inspectionData: any; originalData: any; onUpdate: (p: any) => void },
  },
}));

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

vi.mock('../../context/ConfigContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/ConfigContext')>();

  // Declared ONCE at module-init (not inside `useConfig`) so `config` is a
  // stable reference across re-renders — WizardPage.tsx's amendment-load
  // effect depends on `[amendId, config]`, so a fresh object on every call
  // would re-fire the fetch (and the "Loaded record..." toast) every render,
  // an infinite loop that has nothing to do with the fix under test here.
  const mockProfile = {
    id: PROFILE_ID,
    name: 'TEST PROFILE',
    isDefault: true,
    aqlCategories: [
      { id: 'QUANT_CAT', name: 'QUANTITATIVE', aql: '1.5', aqlLevel: '1.5', evalMode: 'CUMULATIVE', evaluationMode: 'CUMULATIVE' },
      { id: 'QUAL_CAT', name: 'QUALITATIVE', aql: 'PASS/FAIL', aqlLevel: 'PASS/FAIL', evalMode: '', evaluationMode: '' },
    ],
    defectDefinitions: [
      { id: 'def_quant', name: 'Quant Defect', categoryId: 'QUANT_CAT' },
      { id: 'def_qual', name: 'Qual Defect', categoryId: 'QUAL_CAT' },
    ],
  };
  const mockConfig = {
    productMatrixConfig: {},
    dimensions: [],
    inspectionProfiles: [mockProfile],
  };
  const mockGetResolvedProfile = (profileId?: string) => (profileId === PROFILE_ID ? mockProfile : null);

  return {
    ...actual,
    API_BASE_URL: '',
    useConfig: () => ({ config: mockConfig, getResolvedProfile: mockGetResolvedProfile }),
  };
});

vi.mock('../wizard/StepMetadata', () => ({
  StepMetadata: (props: any) => {
    captured.meta = { inspectionData: props.initialData, originalData: props.originalData };
    return <div data-testid="step-metadata-stub">STEP1</div>;
  },
}));

vi.mock('../wizard/StepDimensions', () => ({
  StepDimensions: (props: any) => {
    captured.dims = { inspectionData: props.initialData, originalData: props.originalData, onUpdate: props.onUpdate };
    return (
      <div data-testid="step-dimensions-stub">
        STEP2
        <button
          type="button"
          onClick={() =>
            props.onUpdate({
              dimensions: { ...props.initialData.dimensions, __fixed_length__: ['99.9', '', '', '', ''] },
            })
          }
        >
          EDIT_DIM_SLOT
        </button>
      </div>
    );
  },
}));

vi.mock('../wizard/StepDefects', () => ({
  StepDefects: (props: any) => {
    captured.defects = { inspectionData: props.inspectionData, originalData: props.originalData, onUpdate: props.onUpdate };
    return (
      <div data-testid="step-defects-stub">
        STEP3
        <button
          type="button"
          onClick={() =>
            props.onUpdate({
              defects: { ...props.inspectionData.defects, def_quant: 5 },
              qualitative: { ...props.inspectionData.qualitative, def_qual: 'FAIL' },
            })
          }
        >
          EDIT_DEFECT_COUNT
        </button>
      </div>
    );
  },
}));

// Import WizardPage AFTER the vi.mock calls above so it picks up the mocked
// step components (vi.mock is hoisted, but the import must still come after
// in source order per Vitest's module-mocking convention).
import { WizardPage } from '../WizardPage';

const SUBMISSION_ID = 'sub_amend_1';

function stubAmendmentFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes(`/api/submissions/${SUBMISSION_ID}`)) {
        return new Response(
          JSON.stringify({
            submission: {
              id: SUBMISSION_ID,
              profileId: PROFILE_ID,
              productCode: 'N025SKB-OC-24FT',
              machineId: 'A001',
              shift: 'Shift A (08:00 - 19:59)',
              size: 'M',
              sampleSize: 125,
              totalCarton: 18,
              gloveWeight: 2.9,
              defects: JSON.stringify({ def_quant: 1, def_qual: 1 }),
              dimensions: JSON.stringify({ __fixed_length__: ['10.0', '10.1', '10.0', '10.2', '10.1'] }),
              dimensionMins: JSON.stringify({}),
              productionDate: '2026-09-01T00:00:00.000Z',
              samplingTime: '2026-09-01T08:00:00.000Z',
              batchNumber: 'A001Z6225001',
              verdict: 'PASSED',
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={[`/?amend=${SUBMISSION_ID}`]}>
      <ToastProvider>
        <WizardPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  captured.meta = null;
  captured.dims = null;
  captured.defects = null;
});

describe('WizardPage: originalData/inspectionData reference independence on amendment load', () => {
  test('inspectionData is a deep clone, not the same object as originalData, immediately after load', async () => {
    stubAmendmentFetch();
    renderWizard();

    await waitFor(() => expect(captured.meta?.originalData).toBeTruthy());

    const { inspectionData, originalData } = captured.meta!;
    expect(inspectionData).not.toBe(originalData);
    expect(inspectionData.dimensions).not.toBe(originalData.dimensions);
    expect(inspectionData.defects).not.toBe(originalData.defects);
    // But the actual values still match — this is a clone, not a divergent read.
    expect(inspectionData).toEqual(originalData);
  });

  test('originalData is frozen — a stray top-level mutation attempt is a silent no-op, not data corruption', async () => {
    stubAmendmentFetch();
    renderWizard();

    await waitFor(() => expect(captured.meta?.originalData).toBeTruthy());
    const { originalData } = captured.meta!;
    expect(Object.isFrozen(originalData)).toBe(true);
  });

  test('editing a dimension slot leaves originalData.dimensions untouched', async () => {
    stubAmendmentFetch();
    renderWizard();

    await waitFor(() => expect(captured.meta?.originalData).toBeTruthy());

    fireEvent.click(screen.getByText('DIMENSIONS'));
    await waitFor(() => expect(captured.dims?.originalData).toBeTruthy());

    const originalDataRef = captured.dims!.originalData;
    const preEditOriginalDimensions = JSON.parse(JSON.stringify(originalDataRef.dimensions));

    fireEvent.click(screen.getByText('EDIT_DIM_SLOT'));

    await waitFor(() => expect(captured.dims!.inspectionData.dimensions.__fixed_length__[0]).toBe('99.9'));

    // Same originalData object throughout (freeze doesn't get replaced) —
    // and its nested `dimensions` map is byte-identical to the pre-edit snapshot.
    expect(captured.dims!.originalData).toBe(originalDataRef);
    expect(captured.dims!.originalData.dimensions).toEqual(preEditOriginalDimensions);
    expect(captured.dims!.originalData.dimensions.__fixed_length__[0]).toBe('10.0');

    // inspectionData has visibly diverged from originalData by reference.
    expect(captured.dims!.inspectionData).not.toBe(captured.dims!.originalData);
    expect(captured.dims!.inspectionData.dimensions).not.toBe(captured.dims!.originalData.dimensions);
  });

  test('editing a defect count leaves originalData.defects/qualitative untouched', async () => {
    stubAmendmentFetch();
    renderWizard();

    await waitFor(() => expect(captured.meta?.originalData).toBeTruthy());

    fireEvent.click(screen.getByText('DEFECTS'));
    await waitFor(() => expect(captured.defects?.originalData).toBeTruthy());

    const originalDataRef = captured.defects!.originalData;
    const preEditOriginalDefects = JSON.parse(JSON.stringify(originalDataRef.defects));
    const preEditOriginalQualitative = JSON.parse(JSON.stringify(originalDataRef.qualitative));

    fireEvent.click(screen.getByText('EDIT_DEFECT_COUNT'));

    await waitFor(() => expect(captured.defects!.inspectionData.defects.def_quant).toBe(5));

    expect(captured.defects!.originalData).toBe(originalDataRef);
    expect(captured.defects!.originalData.defects).toEqual(preEditOriginalDefects);
    expect(captured.defects!.originalData.qualitative).toEqual(preEditOriginalQualitative);
    // The original record's defect count (1) is untouched by the edited copy (5).
    expect(captured.defects!.originalData.defects.def_quant).toBe(1);

    expect(captured.defects!.inspectionData).not.toBe(captured.defects!.originalData);
    expect(captured.defects!.inspectionData.defects).not.toBe(captured.defects!.originalData.defects);
  });
});
