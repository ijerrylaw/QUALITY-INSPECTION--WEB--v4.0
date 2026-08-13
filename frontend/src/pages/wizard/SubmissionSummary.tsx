/**
 * @file SubmissionSummary.tsx
 * @description Pre-submit summary shown at the top of Step 4 (Review &
 * Submit). Batch Setup only lists fields NOT already shown by the KPI cards
 * below it on the same screen (Profile, Side, Sequence No, Date/Time, Full
 * System Lot No) — product/line/shift/sample size/total carton/glove weight
 * were dropped here since Card 1 "Batch Metadata" already shows them; no
 * need for the same six fields twice on one screen. Dimensions/Defects
 * aren't duplicated anywhere else, so those stay as full per-slot/per-defect
 * listings.
 *
 * In amendment mode (`originalData` present), fields that differ from the
 * original record are highlighted with an old → new readout; fields that
 * are entirely unchanged are hidden by default (not just unhighlighted),
 * with a small "N unchanged, not shown ▸" control per section to expand and
 * double-check nothing else was accidentally touched — this is the
 * submitter's own pre-flight check, not an approver's audit (that's the
 * Approvals Queue's diff modal, a separate screen/audience), so hiding stays
 * reversible rather than permanent. In new-entry mode (`originalData`
 * null/undefined) nothing is filtered — `hasFieldChanged` always returns
 * false when `hasOriginal` is false, but filtering is explicitly gated on
 * `hasOriginal` rather than relying on that, since otherwise every row would
 * incorrectly count as "unchanged" and vanish.
 *
 * Reuses `hasFieldChanged` from `utils/fieldDiff.tsx` — the same comparator
 * behind the inline "Original: X" notes on each step — as the sole source of
 * truth for "did this change." Field *enumeration* (which dimensions/defects
 * exist for the active product/profile) is necessarily re-derived from
 * config here, the same way StepDimensions.tsx/StepDefects.tsx each derive
 * their own field list; only the comparison logic is shared, per design.
 */

import { useMemo, useState } from 'react';
import { Box, Ruler, ShieldAlert, ArrowRight, ClipboardList, ChevronRight, ChevronDown } from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';
import type { ProductDimensionDef } from '../../context/ConfigContext';
import { hasFieldChanged } from '../../utils/fieldDiff';

export interface SubmissionSummaryProps {
  inspectionData: Record<string, any>;
  originalData?: Record<string, any> | null;
}

/** Mirrors StepDimensions.tsx's fixed-row sentinel IDs — see that file for the source of truth. */
const FIXED_DIM_LENGTH = '__fixed_length__';
const FIXED_DIM_PALM = '__fixed_palm__';
const SLOTS_PER_DIM = 5;

const QUALITATIVE_LABELS: Record<string, string> = { NIL: 'NIL', PASS: 'PASS', FAIL: 'FAIL' };

function formatDisplay(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

/** One label/value row — highlighted with old → new when changed, plain otherwise. */
function SummaryRow({
  label,
  hasOriginal,
  originalValue,
  currentValue,
}: {
  label: string;
  hasOriginal: boolean;
  originalValue: unknown;
  currentValue: unknown;
}) {
  const changed = hasFieldChanged(hasOriginal, originalValue, currentValue);
  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border ${
        changed ? 'bg-amber-500/5 border-amber-500/30' : 'border-transparent'
      }`}
    >
      <span className="text-[10px] font-bold uppercase text-muted tracking-wider">{label}</span>
      {changed ? (
        <span className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-muted line-through decoration-muted/50">{formatDisplay(originalValue)}</span>
          <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" strokeWidth={2} />
          <span className="text-amber-400 font-bold">{formatDisplay(currentValue)}</span>
        </span>
      ) : (
        <span className="text-xs font-mono text-primary">{formatDisplay(currentValue)}</span>
      )}
    </div>
  );
}

/** One dimension slot cell — compact, since there are up to 40 of these. */
function DimensionSlotCell({
  hasOriginal,
  originalValue,
  currentValue,
}: {
  hasOriginal: boolean;
  originalValue: unknown;
  currentValue: unknown;
}) {
  const changed = hasFieldChanged(hasOriginal, originalValue, currentValue);
  return (
    <div
      className={`flex flex-col items-center justify-center w-12 h-11 rounded-md border shrink-0 ${
        changed ? 'bg-amber-500/10 border-amber-500/40' : 'bg-canvas border-gray-800'
      }`}
    >
      <span className={`text-xs font-mono font-bold ${changed ? 'text-amber-400' : 'text-primary'}`}>
        {formatDisplay(currentValue)}
      </span>
      {changed && (
        <span className="text-[8px] font-mono text-muted line-through leading-none mt-0.5">
          {formatDisplay(originalValue)}
        </span>
      )}
    </div>
  );
}

/** Per-section "N unchanged, not shown ▸" expand control — same visual convention as ApprovalsQueue.tsx's diff modal. Renders nothing when count is 0. */
function UnchangedToggle({ count, expanded, onToggle }: { count: number; expanded: boolean; onToggle: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-3 py-1.5 mt-1 text-[10px] font-bold text-muted uppercase tracking-wider hover:bg-white/5 rounded-md transition-colors outline-none"
    >
      {expanded ? (
        <ChevronDown className="w-3 h-3" strokeWidth={2.5} />
      ) : (
        <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
      )}
      {count} unchanged {count === 1 ? 'field' : 'fields'} not shown
    </button>
  );
}

export function SubmissionSummary({ inspectionData, originalData }: SubmissionSummaryProps) {
  const { config, getResolvedProfile } = useConfig();
  const hasOriginal = originalData != null;

  const [showUnchangedBatch, setShowUnchangedBatch] = useState(false);
  const [showUnchangedDimensions, setShowUnchangedDimensions] = useState(false);
  const [showUnchangedDefects, setShowUnchangedDefects] = useState(false);

  const activeProfile = useMemo(
    () => getResolvedProfile(inspectionData?.profileId),
    [getResolvedProfile, inspectionData?.profileId],
  );

  // ── Page 1: Batch Setup — only fields not already shown by the KPI cards ──
  const batchSetupRows = useMemo(() => {
    const currentProfileName = activeProfile?.name ?? inspectionData?.profileId ?? '—';
    const originalProfileName =
      getResolvedProfile(originalData?.profileId)?.name ?? originalData?.profileId ?? '—';

    return [
      { label: 'PROFILE', original: originalProfileName, current: currentProfileName },
      { label: 'SIDE', original: originalData?.side, current: inspectionData?.side },
      { label: 'SEQUENCE NO', original: originalData?.sequenceNo, current: inspectionData?.sequenceNo },
      { label: 'DATE/TIME', original: originalData?.timestamp, current: inspectionData?.timestamp },
      { label: 'FULL SYSTEM LOT NO', original: originalData?.fullSystemLotNo, current: inspectionData?.fullSystemLotNo },
    ];
  }, [inspectionData, originalData, activeProfile, getResolvedProfile]);

  const batchChangedRows = batchSetupRows.filter((row) => hasFieldChanged(hasOriginal, row.original, row.current));
  const batchHiddenCount = hasOriginal ? batchSetupRows.length - batchChangedRows.length : 0;
  const batchRowsToRender = hasOriginal && !showUnchangedBatch ? batchChangedRows : batchSetupRows;

  // ── Page 2: Dimensions ─────────────────────────────────────────────────
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

  const currentDimensions: Record<string, string[]> = inspectionData?.dimensions ?? {};
  const originalDimensions: Record<string, string[]> = originalData?.dimensions ?? {};

  // A dimension row is "changed" if any of its slots differ — hidden only when EVERY
  // slot is unchanged, since the 5 slots are one physical measurement set, not
  // independently meaningful to scatter-hide.
  const dimensionRowChanged = (dimId: string) =>
    Array.from({ length: SLOTS_PER_DIM }).some((_, idx) =>
      hasFieldChanged(hasOriginal, originalDimensions[dimId]?.[idx], currentDimensions[dimId]?.[idx]),
    );
  const changedDimensions = activeDimensions.filter((dim) => dimensionRowChanged(dim.id));
  const dimensionsHiddenCount = hasOriginal ? activeDimensions.length - changedDimensions.length : 0;
  const dimensionsToRender = hasOriginal && !showUnchangedDimensions ? changedDimensions : activeDimensions;

  // ── Page 3: Defects ────────────────────────────────────────────────────
  const aqlCategories = activeProfile?.aqlCategories ?? [];
  const defectDefinitions = activeProfile?.defectDefinitions ?? [];
  const isQualitativeCategory = (categoryId: string) =>
    (aqlCategories.find((c) => c.id === categoryId)?.aql ??
      aqlCategories.find((c) => c.id === categoryId)?.aqlLevel ??
      '').toUpperCase() === 'PASS/FAIL/NIL';

  const currentDefects: Record<string, number> = inspectionData?.defects ?? {};
  const currentQualitative: Record<string, string> = inspectionData?.qualitative ?? {};
  const originalDefects: Record<string, number> = originalData?.defects ?? {};
  const originalQualitative: Record<string, string> = originalData?.qualitative ?? {};

  const defectRows = defectDefinitions.map((defect) => {
    const qualitative = isQualitativeCategory(defect.categoryId);
    return qualitative
      ? {
          key: defect.id,
          label: defect.name,
          original: QUALITATIVE_LABELS[originalQualitative[defect.id] ?? 'NIL'] ?? 'NIL',
          current: QUALITATIVE_LABELS[currentQualitative[defect.id] ?? 'NIL'] ?? 'NIL',
        }
      : {
          key: defect.id,
          label: defect.name,
          original: originalDefects[defect.id] ?? 0,
          current: currentDefects[defect.id] ?? 0,
        };
  });
  const defectChangedRows = defectRows.filter((row) => hasFieldChanged(hasOriginal, row.original, row.current));
  const defectsHiddenCount = hasOriginal ? defectRows.length - defectChangedRows.length : 0;
  const defectRowsToRender = hasOriginal && !showUnchangedDefects ? defectChangedRows : defectRows;

  return (
    <div className="bg-surface border border-gray-700/50 rounded-lg p-4 shadow-sm space-y-6">
      <h3 className="text-lg font-semibold uppercase text-primary border-b border-gray-700/50 pb-3 flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
        PRE-SUBMIT SUMMARY
        {hasOriginal && (
          <span className="ml-auto text-[10px] font-mono font-normal normal-case text-amber-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            highlighted fields differ from the original record
          </span>
        )}
      </h3>

      {/* Batch Setup */}
      <div>
        <h4 className="text-xs font-bold uppercase text-muted tracking-widest mb-2 flex items-center gap-1.5">
          <Box className="w-3.5 h-3.5 text-brand-secondary" strokeWidth={2} />
          BATCH SETUP
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5">
          {batchRowsToRender.map((row) => (
            <SummaryRow
              key={row.label}
              label={row.label}
              hasOriginal={hasOriginal}
              originalValue={row.original}
              currentValue={row.current}
            />
          ))}
        </div>
        <UnchangedToggle
          count={batchHiddenCount}
          expanded={showUnchangedBatch}
          onToggle={() => setShowUnchangedBatch((v) => !v)}
        />
      </div>

      {/* Dimensions */}
      <div>
        <h4 className="text-xs font-bold uppercase text-muted tracking-widest mb-2 flex items-center gap-1.5">
          <Ruler className="w-3.5 h-3.5 text-brand-secondary" strokeWidth={2} />
          DIMENSIONS
        </h4>
        <div className="space-y-2">
          {dimensionsToRender.map((dim) => (
            <div key={dim.id} className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-bold uppercase text-muted tracking-wider w-32 shrink-0">
                {dim.name}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {Array.from({ length: SLOTS_PER_DIM }).map((_, idx) => (
                  <DimensionSlotCell
                    key={idx}
                    hasOriginal={hasOriginal}
                    originalValue={originalDimensions[dim.id]?.[idx]}
                    currentValue={currentDimensions[dim.id]?.[idx]}
                  />
                ))}
              </div>
            </div>
          ))}
          {activeDimensions.length === 0 && (
            <p className="text-xs text-muted italic">No dimension definitions configured for this product.</p>
          )}
        </div>
        <UnchangedToggle
          count={dimensionsHiddenCount}
          expanded={showUnchangedDimensions}
          onToggle={() => setShowUnchangedDimensions((v) => !v)}
        />
      </div>

      {/* Defects */}
      <div>
        <h4 className="text-xs font-bold uppercase text-muted tracking-widest mb-2 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-brand-secondary" strokeWidth={2} />
          DEFECTS
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5">
          {defectRowsToRender.map((row) => (
            <SummaryRow
              key={row.key}
              label={row.label}
              hasOriginal={hasOriginal}
              originalValue={row.original}
              currentValue={row.current}
            />
          ))}
          {defectDefinitions.length === 0 && (
            <p className="text-xs text-muted italic">No defect definitions configured for this profile.</p>
          )}
        </div>
        <UnchangedToggle
          count={defectsHiddenCount}
          expanded={showUnchangedDefects}
          onToggle={() => setShowUnchangedDefects((v) => !v)}
        />
      </div>
    </div>
  );
}
