/**
 * @file WizardPage.tsx
 * @description Parent Container Shell for the Smart Quality Inspection Wizard v4.0.
 *
 * FREE NAVIGATION REFACTOR:
 * - Step tabs are now fully clickable for free navigation between steps.
 * - Step 1 (BATCH SETUP) is mandatory: attempting to jump to steps 2–4 before
 *   completing Step 1 mandatory fields is blocked with an error toast.
 * - All step components receive an `onUpdate` callback that merges partial data
 *   into `inspectionData` on every keystroke (auto-save, no data loss on jump).
 * - `handleNextStep` now only advances the step; data is already persisted live.
 * - Retain Context logic preserves Step 1 fields between lots when the user opts in.
 * - Dual-mode switcher (Single Entry / Batch Entry Grid) resets wizard without
 *   corrupting retained context.
 *
 * AMENDMENT MODE:
 * - Activated by the query param `?amend=[submissionId]` set by HistoryFeed.tsx.
 * - On mount, fetches the submission record via GET /api/submissions and pre-fills
 *   all wizard fields from the existing submission.
 * - On final submit, calls POST /api/submissions/:id/amendments instead of the
 *   standard POST /api/submissions, including a mandatory `reason` field.
 * - Amendment sets record status to PENDING_APPROVAL, auto-routed to /approvals
 *   (MANAGER, ADMIN per NAVIGATION_AND_RBAC.md §2).
 * - Submit button label and page header change to reflect amendment mode.
 * - Retain Context toggle is hidden in amendment mode (not applicable).
 *
 * Strict UI_DESIGN_SYSTEM.md compliance:
 * - Hero H1: text-3xl font-bold uppercase tracking-tight.
 * - §5.3 Inline Informational Alert: amber border-l-4 for amendment mode banner.
 * - Mode Switcher: bg-canvas p-1 rounded-lg border h-12. Active: bg-brand-primary.
 * - Step Tabs: §2.1 — Active: bg-brand-primary text-white, h-10 px-6 rounded-t-lg.
 * - Inactive tabs: bg-surface text-muted hover:text-primary hover:bg-surface-light.
 *
 * Level 1 Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 * API Contract: API_AND_INTEGRATION_SPEC.md §1 → POST /api/submissions
 *               API_AND_INTEGRATION_SPEC.md §1 → POST /api/submissions/:id/amendments
 * Data Shape: DATA_SCHEMAS_AND_TYPES.md → Submission interface
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wand2, Table, CheckCircle2, AlertCircle, ArrowLeft, ArrowRight, ClipboardCheck, FilePen, AlertTriangle } from 'lucide-react';
import { useConfig, API_BASE_URL } from '../context/ConfigContext';
import type { ProductDimensionDef } from '../context/ConfigContext';
import { useAuth, authHeader, authIdentity } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { useWizardGuard } from '../context/WizardGuardContext';
import { isWizardDirty } from '../utils/wizardDirty';

import { StepMetadata } from './wizard/StepMetadata';
import { StepDimensions } from './wizard/StepDimensions';
import { StepDefects } from './wizard/StepDefects';
import { StepReviewSubmit } from './wizard/StepReviewSubmit';
import { BatchEntry } from './wizard/BatchEntry';
import type { BatchEntryHandle } from './wizard/BatchEntry';

/** Mirrors StepDimensions.tsx's fixed-row sentinel IDs — see that file for the source of truth. */
const FIXED_DIM_LENGTH = '__fixed_length__';
const FIXED_DIM_PALM = '__fixed_palm__';

type EntryMode = 'GUIDED' | 'SPREADSHEET';

// ── Step tab definitions ───────────────────────────────────────────────────────
const WIZARD_STEPS = [
  { number: 1, label: 'BATCH SETUP' },
  { number: 2, label: 'DIMENSIONS' },
  { number: 3, label: 'DEFECTS' },
  { number: 4, label: 'REVIEW & SUBMIT' },
];

// ── Mandatory Step 1 fields that must be set before navigating forward ─────────
const STEP1_REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: 'profileId',   label: 'Inspection Profile' },
  { key: 'productCode', label: 'Product Code' },
  { key: 'lineId',      label: 'Line' },
  { key: 'size',        label: 'Size' },
  { key: 'sampleSize',  label: 'Sample Size' },
  { key: 'totalCarton', label: 'Total Carton' },
];

/**
 * GET /api/submissions returns defects/dimensions/dimensionMins as raw JSON
 * strings (as stored in SQLite), not parsed objects — StepDefects.tsx and
 * StepDimensions.tsx both expect already-parsed objects. Passes through
 * values that are already objects (e.g. re-entrant local state).
 */
function safeParseJSON<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Inverse of StepDefects.tsx's QUALITATIVE_ENCODING (0=NIL, 1=PASS, 2=FAIL). */
const QUALITATIVE_DECODING: Record<number, 'PASS' | 'FAIL' | 'NIL'> = { 0: 'NIL', 1: 'PASS', 2: 'FAIL' };

/**
 * The 7 fields RETAIN CONTEXT FOR NEXT BATCH carries forward (StepReviewSubmit.tsx),
 * mapped to their localStorage keys — single source of truth for BOTH the
 * same-session "next lot" path (setInspectionData below) and the across-
 * reload path (StepMetadata.tsx's init-state localStorage fallback reads).
 * Previously StepMetadata.tsx wrote 5 of these to localStorage unconditionally
 * on every keystroke, independent of this checkbox — consolidated here so the
 * checkbox is the one real switch for both paths, and so that the two full
 * field lists (7) don't drift out of sync with each other, only 5 of which
 * were ever localStorage-backed.
 */
const RETAINED_CONTEXT_FIELDS: Record<string, string> = {
  profileId:   'wizard_profileId',
  productCode: 'wizard_productCode',
  size:        'wizard_size',
  lineId:      'wizard_lineId',
  side:        'wizard_side',
  sampleSize:  'wizard_sampleSize',
  gloveWeight: 'wizard_gloveWeight',
};

export function WizardPage() {
  const { config, getResolvedProfile } = useConfig();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Amendment Mode ───────────────────────────────────────────────────────
  // Activated when navigating from HistoryFeed.tsx with ?amend=[submissionId]
  const amendId = searchParams.get('amend');
  const isAmendmentMode = Boolean(amendId);
  const [amendmentReason, setAmendmentReason] = useState('');
  // Guards the actual in-flight submit request — disables the Submit button
  // so a rapid double-click can't fire two POSTs (defense-in-depth; the
  // duplicate-toast bug this was checked against turned out to be two
  // redundant toast call sites, not a real double submission — see
  // StepReviewSubmit.tsx's now-removed premature toast).
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Lazy-init to true whenever an amendId is present on first render, so Step 1
  // never mounts (and auto-saves its freshly-generated defaults) before the
  // amendment fetch below has had a chance to even start — see §5.5.
  const [isLoadingAmendment, setIsLoadingAmendment] = useState(isAmendmentMode);

  // ── Mode State ───────────────────────────────────────────────────────────
  const [entryMode, setEntryMode] = useState<EntryMode>('GUIDED');
  const batchEntryRef = useRef<BatchEntryHandle>(null);

  // ── Guided Wizard State ──────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  const [inspectionData, setInspectionData] = useState<Record<string, any>>({});
  const [originalData, setOriginalData] = useState<Record<string, any> | null>(null);

  // ── Auto-save: partial merge into inspectionData on every change ──────────
  // All step components call this instead of waiting for the "Next" button.
  const handleUpdate = useCallback((partial: Record<string, any>) => {
    setInspectionData((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Sidebar navigation guard: share "is this entry dirty" with Sidebar.tsx ─
  // via WizardGuardContext, so it can warn before discarding on a nav click.
  // Field enumeration (which dimensions/defects exist for the active
  // product/profile) mirrors StepDimensions.tsx/SubmissionSummary.tsx's own
  // derivation from config — only the leaf comparison (hasFieldChanged) is
  // shared, per fieldDiff.tsx's existing convention.
  const activeProfile = useMemo(
    () => getResolvedProfile(inspectionData?.profileId),
    [getResolvedProfile, inspectionData?.profileId],
  );
  const matrixEntry = config?.productMatrixConfig?.[inspectionData?.productCode ?? ''] ?? null;
  const activeDimensions = useMemo((): ProductDimensionDef[] => {
    const fixed: ProductDimensionDef[] = [
      { id: FIXED_DIM_LENGTH, name: 'GLOVE LENGTH', unit: 'mm' },
      { id: FIXED_DIM_PALM, name: 'PALM WIDTH', unit: 'mm' },
    ];
    const dynamic =
      matrixEntry?.dimensionDefs && matrixEntry.dimensionDefs.length > 0
        ? matrixEntry.dimensionDefs
        : config?.dimensions ?? [];
    return [...fixed, ...dynamic];
  }, [matrixEntry, config?.dimensions]);

  const { setWizardDirty } = useWizardGuard();
  const dirty = useMemo(
    () =>
      entryMode === 'GUIDED'
        ? isWizardDirty({
            inspectionData,
            originalData,
            activeDimensions,
            defectDefinitions: activeProfile?.defectDefinitions ?? [],
            aqlCategories: activeProfile?.aqlCategories ?? [],
          })
        : false, // Batch Entry grid mode has its own state, not covered by this guard.
    [entryMode, inspectionData, originalData, activeDimensions, activeProfile],
  );
  useEffect(() => {
    setWizardDirty(dirty);
    return () => setWizardDirty(false);
  }, [dirty, setWizardDirty]);

  // ── Pre-fill wizard from an existing submission when in amendment mode ────
  // Fetches the single target record by ID directly — independent of however
  // many submissions exist or how old this one is — and maps the Submission
  // shape → wizard inspectionData shape.
  useEffect(() => {
    if (!amendId) return;
    // Wait for AppConfig — resolving which defect ids belong to N/A-mode
    // (qualitative) categories requires the profile's category list.
    if (!config) return;
    setIsLoadingAmendment(true);

    fetch(`${API_BASE_URL}/api/submissions/${amendId}`)
      .then(async (res) => {
        if (res.status === 404) {
          addToast('error', `Amendment target record "${amendId}" not found.`);
          return null;
        }
        if (!res.ok) {
          let errStr = res.statusText;
          try {
            const errJson = await res.json();
            errStr = errJson?.error ?? errStr;
          } catch (_) {}
          throw new Error(`Server responded ${res.status}: ${errStr}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const target = data.submission;

        const rawDefects     = safeParseJSON<Record<string, number>>(target.defects, {});
        const dimensions     = safeParseJSON<Record<string, any>>(target.dimensions, {});
        const dimensionMins  = safeParseJSON<Record<string, any>>(target.dimensionMins, {});

        // Decode N/A-mode qualitative states back from the persisted 0/1/2
        // encoding (inverse of StepDefects.tsx's QUALITATIVE_ENCODING) so
        // reopening an amendment restores the operator's original PASS/FAIL/
        // NIL toggle choices instead of defaulting every N/A-mode defect to NIL.
        const profile = getResolvedProfile(target.profileId);
        const qualitativeCategoryIds = new Set(
          (profile?.aqlCategories ?? [])
            .filter((cat) => (cat.aql ?? cat.aqlLevel ?? '').toUpperCase() === 'PASS/FAIL/NIL')
            .map((cat) => cat.id),
        );
        const qualitative: Record<string, 'PASS' | 'FAIL' | 'NIL'> = {};
        for (const def of profile?.defectDefinitions ?? []) {
          if (!qualitativeCategoryIds.has(def.categoryId)) continue;
          qualitative[def.id] = QUALITATIVE_DECODING[rawDefects[def.id] as number] ?? 'NIL';
        }

        // `side` and `sequenceNo` aren't persisted as their own columns — only
        // embedded inside the composed batchNumber ([Line]+[Side]+[YJJJ]+[Sequence]).
        // Since `machineId` (Line) is a real column, its length marks where the
        // fixed-width Side(1) + YJJJ(4) + Sequence(3) suffix begins, letting us
        // recover both without guessing.
        const linePrefix = target.machineId ?? '';
        const batchSuffix = (target.batchNumber ?? '').slice(linePrefix.length);
        const parsedSide = batchSuffix.length >= 8 ? batchSuffix.slice(0, 1) : '';
        const parsedSequenceNo = batchSuffix.length >= 8 ? batchSuffix.slice(-3) : '';

        // Map Submission fields → wizard inspectionData fields
        const mappedData = {
          profileId:        target.profileId        ?? '',
          productCode:      target.productCode      ?? '',
          lineId:           linePrefix,
          side:             parsedSide,
          sequenceNo:       parsedSequenceNo,
          shift:            target.shift            ?? '',
          size:             target.size             ?? '',
          sampleSize:       target.sampleSize       ?? 0,
          totalCarton:      target.totalCarton      ?? '',
          gloveWeight:      target.gloveWeight      ?? '',
          defects:          rawDefects,
          qualitative,
          dimensions,
          dimensionStats:   dimensionMins,
          effectiveDate:    target.productionDate   ?? '',
          timestamp:        target.samplingTime     ?? '',
          fullSystemLotNo:  target.batchNumber      ?? '',
          overallVerdict:   target.verdict === 'PASSED' ? 'PASS' : 'FAIL',
          // Amendment source ID preserved for submit routing
          _amendSourceId:   target.id,
        };
        setInspectionData(mappedData);
        setOriginalData(mappedData);

        addToast('success', `Loaded record ${target.batchNumber} — review and amend all fields.`);
      })
      .catch((err) => {
        console.error('[WizardPage] Failed to load amendment target:', err);
        addToast('error', 'Failed to load amendment record. Please try again.');
      })
      .finally(() => setIsLoadingAmendment(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amendId, config]);

  // ── Validate Step 1 before allowing forward navigation ────────────────────
  const isStep1Valid = useCallback((data: Record<string, any>): boolean => {
    return STEP1_REQUIRED_FIELDS.every(
      (f) => data[f.key] !== undefined && data[f.key] !== '' && data[f.key] !== null
    );
  }, []);

  // ── Tab Click Handler — free navigation with Step 1 guard ─────────────────
  const handleTabClick = useCallback(
    (stepNumber: number) => {
      if (stepNumber === 1) {
        setCurrentStep(1);
        return;
      }
      if (!isStep1Valid(inspectionData)) {
        const missing = STEP1_REQUIRED_FIELDS
          .filter((f) => !inspectionData[f.key] || inspectionData[f.key] === '')
          .map((f) => f.label)
          .join(', ');
        addToast('error', `Complete BATCH SETUP first. Missing: ${missing}.`);
        setCurrentStep(1);
        return;
      }
      setCurrentStep(stepNumber);
    },
    [inspectionData, isStep1Valid, addToast]
  );

  // ── Step Handlers ─────────────────────────────────────────────────────────
  // Data is already saved via onUpdate; these only handle step navigation.
  const handleNextStep = useCallback((data?: any) => {
    if (data) setInspectionData((prev) => ({ ...prev, ...data }));
    setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length));
  }, []);

  const handleBackStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }, []);

  /**
   * Called by StepReviewSubmit on form submit.
   *
   * STANDARD MODE: Dispatches full Submission payload to POST /api/submissions.
   * If retainContext is true, keeps Step 1 fields for the next lot.
   *
   * AMENDMENT MODE: Validates `amendmentReason`, then dispatches to
   * POST /api/submissions/:id/amendments per API_AND_INTEGRATION_SPEC.md §1.
   * Does NOT retain context — resets to clean state after submit.
   */
  const handleSubmit = useCallback(async (retainContext: boolean) => {
    if (isSubmitting) return; // guard against a rapid double-click firing two POSTs
    setIsSubmitting(true);
    try {
    // ── Amendment Mode path ─────────────────────────────────────────────────
    if (isAmendmentMode) {
      const sourceId = inspectionData._amendSourceId ?? amendId;
      if (!sourceId) {
        addToast('error', 'Amendment source ID is missing. Cannot submit.');
        return;
      }
      if (!amendmentReason.trim()) {
        addToast('error', 'Please enter a reason for the amendment before submitting.');
        return;
      }

      const amendmentPayload = {
        reason: amendmentReason.trim(),
        ...authIdentity(user),
        newValues: {
          productCode:         inspectionData.productCode        ?? '',
          productionDate:      inspectionData.effectiveDate      ?? new Date().toISOString(),
          samplingTime:        inspectionData.timestamp          ?? new Date().toISOString(),
          submissionTimestamp: new Date().toISOString(),
          machineId:           inspectionData.lineId             ?? '',
          shift:               inspectionData.shift              ?? '',
          batchNumber:         inspectionData.fullSystemLotNo    ?? '',
          size:                inspectionData.size               ?? '',
          sampleSize:          inspectionData.sampleSize         ?? 0,
          dimensions:          inspectionData.dimensions         ?? {},
          dimensionMins:       inspectionData.dimensionStats     ?? {},
          defects:             inspectionData.defects            ?? {},
          verdict:             (inspectionData.overallVerdict === 'PASS' ? 'PASSED' : 'FAILED') as 'PASSED' | 'FAILED',
          totalCarton:         inspectionData.totalCarton,
          gloveWeight:         inspectionData.gloveWeight,
          profileId:           inspectionData.profileId          ?? '',
          amendmentStatus:     'PENDING_APPROVAL' as const,
        },
      };

      try {
        const response = await fetch(`${API_BASE_URL}/api/submissions/${sourceId}/amendments`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader(user) },
          body:    JSON.stringify(amendmentPayload),
        });

        if (!response.ok) {
          let errStr = response.statusText;
          try {
            const errJson = await response.json();
            errStr = errJson?.error ?? JSON.stringify(errJson);
          } catch (_) {}
          throw new Error(errStr);
        }

        addToast('success', `Amendment for lot ${inspectionData.fullSystemLotNo ?? ''} submitted — AWAITING APPROVAL.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[WizardPage] POST /api/submissions/:id/amendments failed:', msg);
        addToast('error', `Amendment submission failed: ${msg}`);
        return; // Do not reset on failure
      }

      // Reset wizard fully after successful amendment (no retain context in amendment mode).
      // Also clears originalData (still held the OLD amended record — every
      // step component's OriginalValueNote diffs off it) and, critically,
      // the `?amend=` URL param itself: isAmendmentMode/amendId are derived
      // straight from the URL, so leaving it in place meant the wizard
      // silently stayed in amend mode — a subsequent genuine new entry would
      // fall through to `sourceId = inspectionData._amendSourceId ?? amendId`
      // and get POSTed as ANOTHER amendment against this stale record.
      setInspectionData({});
      setOriginalData(null);
      setAmendmentReason('');
      setCurrentStep(1);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('amend');
        return next;
      }, { replace: true });
      return;
    }

    // ── Standard Submission path ────────────────────────────────────────────
    const submission = {
      productCode:          inspectionData.productCode          ?? '',
      productionDate:       inspectionData.effectiveDate        ?? new Date().toISOString(),
      samplingTime:         inspectionData.timestamp            ?? new Date().toISOString(),
      submissionTimestamp:  new Date().toISOString(), // millisecond precision per ISO2859_MATH_ENGINE.md §3
      machineId:            inspectionData.lineId               ?? '',
      shift:                inspectionData.shift                ?? '',
      batchNumber:          inspectionData.fullSystemLotNo      ?? '',
      size:                 inspectionData.size                 ?? '',
      sampleSize:           inspectionData.sampleSize           ?? 0,
      dimensions:           inspectionData.dimensions           ?? {},
      dimensionMins:        inspectionData.dimensionStats       ?? {},
      defects:              inspectionData.defects              ?? {},
      verdict:              (inspectionData.overallVerdict ?? 'PASS') as 'PASSED' | 'FAILED',
      ...authIdentity(user),
      amendmentStatus:      'UNMODIFIED' as const,
      totalCarton:          inspectionData.totalCarton,
      gloveWeight:          inspectionData.gloveWeight,
      amendmentLogs:        [],
      profileId:            inspectionData.profileId            ?? '',
    };

    // POST /api/submissions per API_AND_INTEGRATION_SPEC.md §1
    try {
      const response = await fetch(`${API_BASE_URL}/api/submissions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body:    JSON.stringify(submission),
      });

      if (!response.ok) {
        let errStr = response.statusText;
        try {
          const errJson = await response.json();
          errStr = errJson?.error ?? JSON.stringify(errJson);
        } catch(e) {}
        throw new Error(errStr);
      }

      addToast('success', `Lot ${inspectionData.fullSystemLotNo ?? ''} submitted successfully.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[WizardPage] POST /api/submissions failed:', msg);
      // Show the actual error in the toast so we can see why it's failing
      addToast('error', `Submission failed: ${msg}`);
    }

    // Reset wizard, optionally retaining Step 1 context fields — mirrored
    // into localStorage under the same checkbox gate (RETAINED_CONTEXT_FIELDS)
    // so a reload lands on the same 7 fields as the same-session "next lot"
    // path, instead of the two diverging.
    if (retainContext) {
      const retained: Record<string, unknown> = {};
      for (const field of Object.keys(RETAINED_CONTEXT_FIELDS)) {
        retained[field] = inspectionData[field];
      }
      setInspectionData(retained);
      for (const [field, storageKey] of Object.entries(RETAINED_CONTEXT_FIELDS)) {
        const value = retained[field];
        if (value !== undefined && value !== null && value !== '') {
          localStorage.setItem(storageKey, String(value));
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } else {
      setInspectionData({});
      for (const storageKey of Object.values(RETAINED_CONTEXT_FIELDS)) {
        localStorage.removeItem(storageKey);
      }
    }
    setCurrentStep(1);
    } finally {
      setIsSubmitting(false);
    }
  }, [inspectionData, addToast, isAmendmentMode, amendId, amendmentReason, isSubmitting, setSearchParams, user]);

  // ── Derived tab state ─────────────────────────────────────────────────────
  const step1Done = isStep1Valid(inspectionData);

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-canvas text-primary">

      {/* ── Page Header & Mode Switcher ────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-gray-800/80 pb-6">
        <div>
          {isAmendmentMode ? (
            <>
              <h1 className="text-3xl font-bold uppercase tracking-tight text-primary flex items-center gap-3">
                <FilePen className="w-7 h-7 text-amber-400" strokeWidth={2} />
                AMENDMENT WIZARD
              </h1>
              <p className="text-xs font-normal text-muted mt-1">
                Amending record — all fields are editable. A reason is required before submitting.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">
                QUALITY ENTRY WIZARD
              </h1>
              <p className="text-xs font-normal text-muted mt-1">
                Record batch inspection data using single entry wizard or batch entry grid.
              </p>
            </>
          )}
        </div>

        {/* Dual-Mode Switcher — hidden in amendment mode (only guided mode applies) */}
        {!isAmendmentMode && (
          <div className="inline-flex bg-canvas p-1 rounded-lg border border-gray-800 h-12 items-center gap-1 shadow-inner">
            <button
              onClick={() => { setEntryMode('GUIDED'); setCurrentStep(1); }}
              className={
                entryMode === 'GUIDED'
                  ? 'bg-brand-primary text-white font-bold text-xs uppercase tracking-wider px-4 h-10 rounded-md shadow-md flex items-center gap-2'
                  : 'text-muted hover:text-primary font-bold text-xs uppercase tracking-wider px-4 h-10 rounded-md flex items-center gap-2 transition-colors cursor-pointer'
              }
            >
              <Wand2 className="w-4 h-4" strokeWidth={2} />
              SINGLE ENTRY
            </button>

            <button
              onClick={() => setEntryMode('SPREADSHEET')}
              className={
                entryMode === 'SPREADSHEET'
                  ? 'bg-brand-primary text-white font-bold text-xs uppercase tracking-wider px-4 h-10 rounded-md shadow-md flex items-center gap-2'
                  : 'text-muted hover:text-primary font-bold text-xs uppercase tracking-wider px-4 h-10 rounded-md flex items-center gap-2 transition-colors cursor-pointer'
              }
            >
              <Table className="w-4 h-4" strokeWidth={2} />
              BATCH ENTRY
            </button>
          </div>
        )}
      </div>

      {/* ── Amendment Mode Banner — UI_DESIGN_SYSTEM.md §5.3 (Amber) ──────── */}
      {isAmendmentMode && (
        <div className="p-4 rounded-lg border border-amber-500/30 border-l-4 border-l-amber-500 bg-amber-500/5 flex flex-col gap-4">
          {/* Loading state */}
          {isLoadingAmendment ? (
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" strokeWidth={2} />
              <span className="text-xs font-bold uppercase tracking-wider animate-pulse">
                Loading amendment record...
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
              <div className="flex-1 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Amendment Mode — Lot: {inspectionData.fullSystemLotNo || amendId}
                </p>
                <p className="text-xs text-amber-400/70 font-sans">
                  All fields have been pre-filled from the original record. Modify any field
                  and submit — the amendment will be routed to the Approvals Queue (Executive / Manager / Admin).
                </p>
                {/* Mandatory reason field */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                    Amendment Reason <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    value={amendmentReason}
                    onChange={(e) => setAmendmentReason(e.target.value)}
                    placeholder="Describe the reason for this amendment (e.g., data entry error on defect count)..."
                    rows={2}
                    className="w-full px-3 py-2 bg-canvas border border-amber-500/30 rounded-lg font-sans text-sm text-primary placeholder:text-muted focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors resize-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <div>
        {/* ── Top-Docked Command Header ───────────────────────────────────── */}
        <div className="flex flex-col md:flex-row items-center justify-between border-b border-gray-800 gap-4 md:gap-0 pb-2 md:pb-0">
          {/* Left: Step Tabs or Title */}
          <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide w-full md:w-auto">
            {entryMode === 'GUIDED' || isAmendmentMode ? (
              WIZARD_STEPS.map((step, idx) => {
                const isComplete = currentStep > step.number && step1Done;
                const isActive   = currentStep === step.number;
                // Steps 2–4 are locked if Step 1 is not yet valid
                const isLocked   = step.number > 1 && !step1Done;

                return (
                  <div key={step.number} className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTabClick(step.number)}
                      disabled={false}
                      title={isLocked ? 'Complete BATCH SETUP first' : step.label}
                      className={`
                        h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg
                        text-xs font-bold tracking-wider uppercase transition-all outline-none
                        ${isActive
                          ? 'bg-brand-primary text-white shadow-md'
                          : isComplete
                            ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300'
                            : isLocked
                              ? 'bg-surface text-gray-600 cursor-not-allowed'
                              : 'bg-surface text-muted hover:text-primary hover:bg-surface-light'
                        }
                      `}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
                      ) : isLocked ? (
                        <AlertCircle className="w-4 h-4" strokeWidth={2} />
                      ) : (
                        <span className={`
                          w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono border
                          ${isActive ? 'border-brand-secondary text-brand-secondary' : 'border-gray-700 text-muted'}
                        `}>
                          {step.number}
                        </span>
                      )}
                      <span className="whitespace-nowrap">{step.label}</span>
                    </button>

                    {/* Connector */}
                    {idx < WIZARD_STEPS.length - 1 && (
                      <div className="w-px h-5 bg-gray-800 shrink-0" />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg text-xs font-bold tracking-wider uppercase transition-all bg-brand-primary text-white shadow-md">
                <Table className="w-4 h-4" strokeWidth={2} />
                BATCH ENTRY GRID
              </div>
            )}
          </div>

          {/* Right: Command Header Action Buttons */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end shrink-0">
            {entryMode === 'GUIDED' || isAmendmentMode ? (
              <>
                {currentStep > 1 && (
                  <button
                    type="button"
                    onClick={handleBackStep}
                    className="h-10 px-4 rounded-lg bg-surface text-muted hover:text-primary border border-gray-700 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none"
                  >
                    <ArrowLeft className="w-4 h-4" strokeWidth={2} />
                    <span className="hidden sm:inline">BACK</span>
                  </button>
                )}

                {currentStep < 4 ? (
                  <button
                    type="submit"
                    form="wizard-step-form"
                    className="h-10 px-6 rounded-lg bg-brand-primary text-white font-bold text-xs tracking-wider uppercase shadow-md shadow-brand-primary/20 flex items-center justify-center gap-2 hover:brightness-110 transition-all outline-none"
                  >
                    <span>{currentStep === 1 ? (isAmendmentMode ? 'NEXT' : 'START INSPECTION') : 'NEXT'}</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={2} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    form="wizard-step-form"
                    disabled={isSubmitting || (isAmendmentMode && !amendmentReason.trim())}
                    className={`h-10 px-8 rounded-lg font-bold text-xs tracking-wider uppercase shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 transition-all outline-none disabled:opacity-40 disabled:cursor-not-allowed
                      ${isAmendmentMode
                        ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30 hover:border-amber-500'
                        : 'bg-accent-gradient text-white hover:brightness-110'
                      }`}
                  >
                    {isAmendmentMode ? (
                      <FilePen className="w-4 h-4" strokeWidth={2} />
                    ) : (
                      <ClipboardCheck className="w-4 h-4" strokeWidth={2} />
                    )}
                    <span>
                      {isSubmitting
                        ? 'SUBMITTING...'
                        : isAmendmentMode ? 'SUBMIT AMENDMENT' : 'SUBMIT LOT'}
                    </span>
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => batchEntryRef.current?.submitBatch()}
                className="h-10 px-8 rounded-lg bg-accent-gradient text-white font-bold text-xs tracking-wider uppercase shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 hover:brightness-110 transition-all outline-none"
              >
                <ClipboardCheck className="w-4 h-4" strokeWidth={2} />
                <span>SUBMIT BATCH</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Step Content Area ────────────────────────────────────────────── */}
        {(entryMode === 'GUIDED' || isAmendmentMode) ? (
          <div key={amendId ?? 'new'} className="pt-6">
            {currentStep === 1 && (
              isAmendmentMode && isLoadingAmendment ? (
                // Don't mount StepMetadata until the real record has loaded —
                // it auto-saves its local defaults on every mount, which would
                // otherwise clobber the correct prefill once it arrives (§5.5).
                <div className="bg-surface border border-gray-800 rounded-lg p-8 flex items-center justify-center h-64">
                  <span className="text-sm font-semibold uppercase tracking-wider text-muted font-mono animate-pulse">
                    LOADING AMENDMENT RECORD...
                  </span>
                </div>
              ) : (
                <StepMetadata
                  onNext={handleNextStep}
                  onUpdate={handleUpdate}
                  initialData={inspectionData}
                  originalData={originalData}
                />
              )
            )}
            {currentStep === 2 && (
              <StepDimensions
                onNext={handleNextStep}
                onBack={handleBackStep}
                onUpdate={handleUpdate}
                initialData={inspectionData}
                originalData={originalData}
              />
            )}
            {currentStep === 3 && (
              <StepDefects
                onNext={handleNextStep}
                onBack={handleBackStep}
                onUpdate={handleUpdate}
                inspectionData={inspectionData}
                originalData={originalData}
              />
            )}
            {currentStep === 4 && (
              <StepReviewSubmit
                onBack={handleBackStep}
                onUpdate={handleUpdate}
                inspectionData={inspectionData}
                originalData={originalData}
                onSubmit={handleSubmit}
              />
            )}
          </div>
        ) : (
          <div className="w-full">
            <BatchEntry ref={batchEntryRef} />
          </div>
        )}
      </div>
    </div>
  );
}
