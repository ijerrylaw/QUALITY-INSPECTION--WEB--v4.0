/**
 * @file SubmissionSummary.tsx
 * @description Pre-submit summary shown at the top of Step 4 (Review &
 * Submit) — lists every field across all three wizard pages (Batch Setup,
 * Dimensions, Defects). In amendment mode (`originalData` present), fields
 * that differ from the original record are highlighted with an old → new
 * readout; unchanged fields still appear, just unhighlighted. In new-entry
 * mode (`originalData` null/undefined) it's a plain listing — `hasFieldChanged`
 * always returns false when `hasOriginal` is false, so no extra branching
 * is needed here for that case.
 *
 * Reuses `hasFieldChanged` from `utils/fieldDiff.tsx` — the same comparator
 * behind the inline "Original: X" notes on each step — as the sole source of
 * truth for "did this change." Field *enumeration* (which dimensions/defects
 * exist for the active product/profile) is necessarily re-derived from
 * config here, the same way StepDimensions.tsx/StepDefects.tsx each derive
 * their own field list; only the comparison logic is shared, per design.
 */

import { useMemo } from 'react';
import { Box, Ruler, ShieldAlert, ArrowRight, ClipboardList } from 'lucide-react';
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

export function SubmissionSummary({ inspectionData, originalData }: SubmissionSummaryProps) {
  const { config, getResolvedProfile } = useConfig();
  const hasOriginal = originalData != null;

  const activeProfile = useMemo(
    () => getResolvedProfile(inspectionData?.profileId),
    [getResolvedProfile, inspectionData?.profileId],
  );

  // ── Page 1: Batch Setup ────────────────────────────────────────────────
  const batchSetupRows = useMemo(() => {
    const currentProfileName = activeProfile?.name ?? inspectionData?.profileId ?? '—';
    const originalProfileName =
      getResolvedProfile(originalData?.profileId)?.name ?? originalData?.profileId ?? '—';

    return [
      { label: 'PROFILE', original: originalProfileName, current: currentProfileName },
      { label: 'PRODUCT CODE', original: originalData?.productCode, current: inspectionData?.productCode },
      { label: 'GLOVE SIZE', original: originalData?.size, current: inspectionData?.size },
      { label: 'PRODUCTION LINE', original: originalData?.lineId, current: inspectionData?.lineId },
      { label: 'SIDE', original: originalData?.side, current: inspectionData?.side },
      { label: 'SEQUENCE NO', original: originalData?.sequenceNo, current: inspectionData?.sequenceNo },
      { label: 'SHIFT', original: originalData?.shift, current: inspectionData?.shift },
      { label: 'SAMPLE SIZE', original: originalData?.sampleSize, current: inspectionData?.sampleSize },
      { label: 'TOTAL CARTON', original: originalData?.totalCarton, current: inspectionData?.totalCarton },
      { label: 'GLOVE WEIGHT (g)', original: originalData?.gloveWeight, current: inspectionData?.gloveWeight },
      { label: 'DATE/TIME', original: originalData?.timestamp, current: inspectionData?.timestamp },
      { label: 'FULL SYSTEM LOT NO', original: originalData?.fullSystemLotNo, current: inspectionData?.fullSystemLotNo },
    ];
  }, [inspectionData, originalData, activeProfile, getResolvedProfile]);

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
          {batchSetupRows.map((row) => (
            <SummaryRow
              key={row.label}
              label={row.label}
              hasOriginal={hasOriginal}
              originalValue={row.original}
              currentValue={row.current}
            />
          ))}
        </div>
      </div>

      {/* Dimensions */}
      <div>
        <h4 className="text-xs font-bold uppercase text-muted tracking-widest mb-2 flex items-center gap-1.5">
          <Ruler className="w-3.5 h-3.5 text-brand-secondary" strokeWidth={2} />
          DIMENSIONS
        </h4>
        <div className="space-y-2">
          {activeDimensions.map((dim) => (
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
      </div>

      {/* Defects */}
      <div>
        <h4 className="text-xs font-bold uppercase text-muted tracking-widest mb-2 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-brand-secondary" strokeWidth={2} />
          DEFECTS
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5">
          {defectDefinitions.map((defect) => {
            const qualitative = isQualitativeCategory(defect.categoryId);
            if (qualitative) {
              return (
                <SummaryRow
                  key={defect.id}
                  label={defect.name}
                  hasOriginal={hasOriginal}
                  originalValue={QUALITATIVE_LABELS[originalQualitative[defect.id] ?? 'NIL'] ?? 'NIL'}
                  currentValue={QUALITATIVE_LABELS[currentQualitative[defect.id] ?? 'NIL'] ?? 'NIL'}
                />
              );
            }
            return (
              <SummaryRow
                key={defect.id}
                label={defect.name}
                hasOriginal={hasOriginal}
                originalValue={originalDefects[defect.id] ?? 0}
                currentValue={currentDefects[defect.id] ?? 0}
              />
            );
          })}
          {defectDefinitions.length === 0 && (
            <p className="text-xs text-muted italic">No defect definitions configured for this profile.</p>
          )}
        </div>
      </div>
    </div>
  );
}
