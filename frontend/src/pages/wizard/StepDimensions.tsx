/**
 * @file StepDimensions.tsx
 * @description Step 2 of the Smart Quality Inspection Wizard — Physical Dimensions.
 *
 * CONFIG REMAPPING (Turn 3):
 * - Dimension definitions sourced from config.productMatrixConfig[productCode].dimensionDefs
 *   (set up in Configuration Control > Product Engine).
 * - Min specs and tolerances sourced from
 *   config.productMatrixConfig[productCode].sizes[size].dimensions[dimId]
 * - Slot count driven by configured dimensionDefs (not hardcoded to 5).
 * - Falls back gracefully to global dimension defs (config.dimensions) when no
 *   product-specific dynamic dimensionDefs are configured — but the two FIXED
 *   dimensions (GLOVE LENGTH, PALM WIDTH) have no such fallback: an unconfigured
 *   product/size blocks entry entirely instead (see AUDIT_REPORT.md finding #5;
 *   isMatrixUnusable below).
 *
 * FIXED-ROW DIMENSIONS (Glove Length & Palm Width):
 * - GLOVE LENGTH and PALM WIDTH are always shown as fixed leading cards.
 * - Their specs are read from sizeEntry.lengthTarget/lengthTolerance and
 *   sizeEntry.palmWidthTarget/palmWidthTolerance (set up in ProductConfigAccordion).
 * - GLOVE WEIGHT is excluded from Physical Dimensions (handled in BATCH SETUP step).
 *
 * FREE NAVIGATION REFACTOR:
 * - Added `onUpdate` prop: fires whenever measurements change, immediately pushing
 *   dimensions, stats, and dirtySlots up to WizardPage's `inspectionData`.
 * - Local state for measurements is preserved for fast typing performance.
 *
 * UI_DESIGN_SYSTEM.md compliance:
 * - 48px touch targets (h-12) for numerical inputs (§1.2, §3.4).
 * - JetBrains Mono (font-mono) for all measurement values and delta labels (§1.3).
 * - Slot-level delta badge: text-[9px] font-mono text-rose-400 (§5.2).
 * - Compliance tracker badge uses Dynamic Composite Badge pattern (§4.7).
 * - bg-canvas / bg-surface tier hierarchy (§1.2).
 */

import { useState, useMemo, useEffect } from 'react';
import { Ruler, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfig, hasUsableProductMatrix } from '../../context/ConfigContext';
import { OriginalValueNote, hasFieldChanged } from '../../utils/fieldDiff';
import type { ProductDimensionDef } from '../../context/ConfigContext';

export interface StepDimensionsProps {
  onNext: (data: any) => void;
  onBack: () => void;
  onUpdate?: (partial: Record<string, any>) => void; // Auto-save callback
  initialData?: Record<string, any>;
  originalData?: Record<string, any> | null;
}

/** 5 measurement slots per dimension */
const SLOTS_PER_DIM = 5;

/** Sentinel IDs for the two always-visible fixed-row dimensions */
const FIXED_DIM_LENGTH   = '__fixed_length__';
const FIXED_DIM_PALM     = '__fixed_palm__';

export function StepDimensions({
  onNext,
  onBack: _onBack,
  onUpdate,
  initialData = {},
  originalData,
}: StepDimensionsProps) {
  const { addToast } = useToast();
  const { config } = useConfig();

  const productCode: string = initialData?.productCode ?? '';
  const size: string = initialData?.size ?? '';

  // ── Per-size entry from Product Engine ────────────────────────────────────
  const sizeEntry = useMemo(() => {
    return config?.productMatrixConfig?.[productCode]?.sizes?.[size] ?? null;
  }, [config, productCode, size]);

  const matrixEntry = useMemo(() => {
    return config?.productMatrixConfig?.[productCode] ?? null;
  }, [config, productCode]);

  // ── Zero-usable-dimension entry gate (AUDIT_REPORT.md finding #5) ─────────
  const isMatrixUnusable = Boolean(productCode) && Boolean(size)
    && !hasUsableProductMatrix(matrixEntry, size);

  // ── Fixed-row virtual dimension defs (always prepended) ───────────────────
  // GLOVE WEIGHT is excluded — handled in BATCH SETUP.
  const fixedDimensions = useMemo((): ProductDimensionDef[] => {
    return [
      {
        id:       FIXED_DIM_LENGTH,
        name:     'GLOVE LENGTH',
        unit:     'mm',
        isMin:    false,
        decimals: matrixEntry?.lengthDecimals ?? 0,
      },
      {
        id:       FIXED_DIM_PALM,
        name:     'PALM WIDTH',
        unit:     'mm',
        isMin:    false,
        decimals: matrixEntry?.palmWidthDecimals ?? 0,
      },
    ];
  }, [matrixEntry]);

  // ── Dynamic dimension definitions from Product Engine ─────────────────────
  const dynamicDimensions = useMemo((): ProductDimensionDef[] => {
    if (matrixEntry?.dimensionDefs && matrixEntry.dimensionDefs.length > 0) {
      return matrixEntry.dimensionDefs;
    }
    if (config?.dimensions && config.dimensions.length > 0) {
      return config.dimensions;
    }
    return [];
  }, [config, matrixEntry]);

  // ── All dimensions: fixed first, then dynamic ─────────────────────────────
  const activeDimensions = useMemo(
    () => [...fixedDimensions, ...dynamicDimensions],
    [fixedDimensions, dynamicDimensions]
  );

  // ── Per-Size Spec Lookup ──────────────────────────────────────────────────
  const getDimSpec = (dimId: string): { minSpec: number; tolerance: number; isMin: boolean } => {
    // Fixed rows — read from flat SizeConfig fields
    if (dimId === FIXED_DIM_LENGTH) {
      const target = parseFloat(sizeEntry?.lengthTarget ?? '0') || 0;
      const tolRaw = sizeEntry?.lengthTolerance ?? '0';
      const isMin  = tolRaw.toUpperCase() === 'MIN';
      return { minSpec: target, tolerance: isMin ? 0 : (parseFloat(tolRaw) || 0), isMin };
    }
    if (dimId === FIXED_DIM_PALM) {
      const target = parseFloat(sizeEntry?.palmWidthTarget ?? '0') || 0;
      const tolRaw = sizeEntry?.palmWidthTolerance ?? '0';
      const isMin  = tolRaw.toUpperCase() === 'MIN';
      return { minSpec: target, tolerance: isMin ? 0 : (parseFloat(tolRaw) || 0), isMin };
    }

    // Dynamic rows — read from sizes[size].dimensions[dimId]
    const dimValue = sizeEntry?.dimensions?.[dimId];
    if (dimValue) {
      const tolRaw = dimValue.tolerance ?? '0';
      const isMin  = tolRaw.toUpperCase() === 'MIN';
      return {
        minSpec:   parseFloat(dimValue.minSpec) || 0,
        tolerance: isMin ? 0 : (parseFloat(tolRaw) || 0),
        isMin,
      };
    }

    // Fallback: read from the dimension def itself (legacy flat format)
    const dimDef = dynamicDimensions.find((d) => d.id === dimId) as any;
    return {
      minSpec:   parseFloat(dimDef?.minSpec ?? '0') || 0,
      tolerance: parseFloat(dimDef?.tolerance ?? '0') || 0,
      isMin:     false,
    };
  };

  // ── Decimal precision helper ───────────────────────────────────────────────
  const getDecimalPlaces = (dim: ProductDimensionDef): number => {
    // Fixed rows — use per-product config decimal settings
    if (dim.id === FIXED_DIM_LENGTH)  return matrixEntry?.lengthDecimals   ?? 0;
    if (dim.id === FIXED_DIM_PALM)    return matrixEntry?.palmWidthDecimals ?? 0;

    // Dynamic rows — prefer explicit decimals from format dropdown
    if (typeof dim.decimals === 'number') return dim.decimals;

    // Legacy fallback: infer from value strings in productMatrixConfig
    if (matrixEntry?.sizes) {
      let maxDec = 0;
      Object.values(matrixEntry.sizes).forEach((sc) => {
        const dimVal = sc.dimensions?.[dim.id];
        if (dimVal?.minSpec?.includes('.'))  maxDec = Math.max(maxDec, dimVal.minSpec.split('.')[1].length);
        if (dimVal?.tolerance?.includes('.')) maxDec = Math.max(maxDec, dimVal.tolerance.split('.')[1].length);
      });
      if (maxDec > 0) return maxDec;
    }
    return 0;
  };

  // ── Measurement State (dimId → string[SLOTS_PER_DIM]) ────────────────────
  const [measurements, setMeasurements] = useState<Record<string, string[]>>(() => {
    if (initialData?.dimensions && Object.keys(initialData.dimensions).length > 0) return initialData.dimensions;
    const init: Record<string, string[]> = {};
    activeDimensions.forEach((d) => {
      const { minSpec } = getDimSpec(d.id);
      const dec = getDecimalPlaces(d);
      init[d.id] = Array(SLOTS_PER_DIM).fill(minSpec > 0 ? minSpec.toFixed(dec) : '');
    });
    return init;
  });

  // Track which slots have been actively edited by the user
  const [dirtySlots, setDirtySlots] = useState<Record<string, boolean[]>>(() => {
    if (initialData?.dimensionDirtySlots && Object.keys(initialData.dimensionDirtySlots).length > 0) return initialData.dimensionDirtySlots;
    const init: Record<string, boolean[]> = {};
    const hasInitial = !!(initialData?.dimensions && Object.keys(initialData.dimensions).length > 0);
    activeDimensions.forEach((d) => {
      init[d.id] = Array(SLOTS_PER_DIM).fill(hasInitial);
    });
    return init;
  });

  const handleSlotChange = (dimId: string, index: number, value: string) => {
    setMeasurements((prev) => {
      const arr = [...(prev[dimId] ?? Array(SLOTS_PER_DIM).fill(''))];
      arr[index] = value;
      return { ...prev, [dimId]: arr };
    });
    setDirtySlots((prev) => {
      const arr = [...(prev[dimId] ?? Array(SLOTS_PER_DIM).fill(false))];
      arr[index] = true;
      return { ...prev, [dimId]: arr };
    });
  };

  // ── Real-Time Evaluation Engine ───────────────────────────────────────────
  const { totalSlots, filledSlots, passedSlots, failedSlots, stats } = useMemo(() => {
    let filled = 0;
    let passed = 0;
    let failed = 0;
    const calcStats: Record<string, { min: number; max: number; avg: number; fails: boolean[]; threshold: number; maxThreshold: number; isMin: boolean }> = {};

    activeDimensions.forEach((dim) => {
      const { minSpec, tolerance, isMin } = getDimSpec(dim.id);
      const threshold    = minSpec > 0 ? minSpec - tolerance : 0;
      const maxThreshold = minSpec > 0 && tolerance > 0 && !isMin ? minSpec + tolerance : Infinity;
      const vals = measurements[dim.id] ?? Array(SLOTS_PER_DIM).fill('');

      const fails = vals.map((v) => {
        const num = parseFloat(v);
        if (isNaN(num)) return false;
        return num < threshold || (!isMin && tolerance > 0 && num > maxThreshold);
      });

      vals.forEach((v, i) => {
        if (v !== '') {
          filled++;
          if (fails[i]) failed++;
          else passed++;
        }
      });

      const numVals = vals.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
      const min = numVals.length > 0 ? Math.min(...numVals) : 0;
      const max = numVals.length > 0 ? Math.max(...numVals) : 0;
      const avg = numVals.length > 0 ? numVals.reduce((a, b) => a + b, 0) / numVals.length : 0;

      calcStats[dim.id] = { min, max, avg, fails, threshold, maxThreshold, isMin };
    });

    const tSlots = activeDimensions.length * SLOTS_PER_DIM;
    return { totalSlots: tSlots, filledSlots: filled, passedSlots: passed, failedSlots: failed, stats: calcStats };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, activeDimensions, sizeEntry, matrixEntry]);

  // ── Auto-save: Push measurements to WizardPage ────────────────────────────
  useEffect(() => {
    onUpdate?.({
      dimensions: measurements,
      dimensionDirtySlots: dirtySlots,
      dimensionStats: stats,
      totalSlots,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, dirtySlots, stats, totalSlots]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMatrixUnusable) {
      addToast('error', 'Dimension spec not configured for this product/size — contact an admin before inspecting this lot.');
      return;
    }
    if (filledSlots < totalSlots) {
      addToast('error', `Please complete all ${totalSlots} measurement slots before proceeding.`);
      return;
    }
    onNext({ dimensions: measurements, dimensionStats: stats, totalSlots });
  };

  const getStep = (dim: ProductDimensionDef): string => {
    const dec = getDecimalPlaces(dim);
    if (dec === 0) return '1';
    return (1 / Math.pow(10, dec)).toFixed(dec);
  };

  return (
    <form id="wizard-step-form" onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Top Summary & Compliance Tracker ──────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-surface border border-gray-700/50 rounded-lg p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
            <Ruler className="w-6 h-6 text-brand-secondary" strokeWidth={2} />
            PHYSICAL DIMENSIONS
          </h2>
          <p className="text-xs font-normal text-muted mt-1">
            {productCode
              ? `Product: ${productCode} · Size: ${size || '—'} · ${activeDimensions.length} dimension(s) · ${SLOTS_PER_DIM} samples each`
              : 'Record physical measurement samples per dimension.'}
          </p>
        </div>

        {/* Compliance Tracker — Dynamic Composite Badge per UI_DESIGN_SYSTEM.md §4.8 */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-inner ${
          failedSlots > 0
            ? 'bg-rose-500/10 border-rose-500/30'
            : filledSlots === totalSlots && totalSlots > 0
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-canvas border-gray-800'
        }`}>
          {failedSlots > 0 ? (
            <AlertTriangle className="w-8 h-8 text-rose-400" strokeWidth={2} />
          ) : filledSlots === totalSlots && totalSlots > 0 ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400" strokeWidth={2} />
          ) : (
            <AlertCircle className="w-8 h-8 text-amber-400" strokeWidth={2} />
          )}
          <div className="flex flex-col">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              failedSlots > 0 ? 'text-rose-400' : filledSlots === totalSlots && totalSlots > 0 ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              COMPLIANCE TRACKER
            </span>
            <span className={`text-sm font-mono font-bold tracking-tight ${
              failedSlots > 0 ? 'text-rose-400' : filledSlots === totalSlots && totalSlots > 0 ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {passedSlots}/{totalSlots} SLOTS PASSED
            </span>
            <span className={`text-[10px] font-bold uppercase mt-0.5 tracking-wider ${
              failedSlots > 0
                ? 'text-rose-400'
                : filledSlots === totalSlots && totalSlots > 0
                  ? 'text-emerald-400/80'
                  : 'text-amber-400/80'
            }`}>
              {failedSlots > 0 ? `${failedSlots} OUT OF SPEC` : '0 OUT OF SPEC'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Zero-Usable-Dimension-Matrix Blocking Banner ────────────────────── */}
      {isMatrixUnusable && (
        <div className="p-3 rounded-lg border border-l-4 border-amber-500/20 border-l-amber-500 bg-amber-500/5 flex gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">PRODUCT DIMENSIONS NOT CONFIGURED</p>
            <p className="text-xs text-muted mt-1">
              Glove Length and Palm Width have no spec configured for <span className="font-mono">{productCode}</span> · <span className="font-mono">{size}</span> — measurements cannot be graded.
              Contact an admin to configure this product under <strong>Configuration Control → Product Engine</strong> before inspecting this lot.
            </p>
          </div>
        </div>
      )}

      {/* ── Dimension Cards Grid ───────────────────────────────────────────── */}
      {activeDimensions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeDimensions.map((dim) => {
            const dimStats = stats[dim.id] ?? { min: 0, max: 0, avg: 0, fails: [], threshold: 0, maxThreshold: Infinity, isMin: false };
            const { minSpec, tolerance, isMin: dimIsMin } = getDimSpec(dim.id);
            // Merge isMin from spec lookup (covers 'MIN' tolerance) and the def flag
            const effectiveIsMin = dimIsMin || !!dim.isMin;
            const threshold    = dimStats.threshold;
            const maxThreshold = dimStats.maxThreshold;
            const decPlaces    = getDecimalPlaces(dim);

            return (
              <div key={dim.id} className="bg-surface border border-gray-700/50 rounded-lg p-4 shadow-sm hover:border-gray-700 transition-colors">

                {/* Card Header */}
                <div className="flex items-center justify-between border-b border-gray-700/50 pb-3 mb-4">
                  {/* Title + inline spec */}
                  <span className={`text-sm font-bold uppercase tracking-wider flex items-baseline gap-2 ${
                    dim.id === FIXED_DIM_LENGTH || dim.id === FIXED_DIM_PALM ? 'text-brand-secondary' : 'text-primary'
                  }`}>
                    {dim.name}
                    {minSpec > 0 && (
                      <span className="text-xs font-mono font-normal normal-case text-muted">
                        TARGET: {effectiveIsMin
                          ? `\u2265${minSpec.toFixed(decPlaces)}${dim.unit}`
                          : `${minSpec.toFixed(decPlaces)}${tolerance > 0 ? '\u00b1' + tolerance.toFixed(decPlaces) : ''}${dim.unit}`
                        }
                      </span>
                    )}
                  </span>

                  {/* Top-Right Metrics Badges */}
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] uppercase px-2 py-1 rounded-md border ${
                      dimStats.min > 0 && dimStats.min < threshold
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold'
                        : 'bg-gray-800/50 border-gray-700/50 text-muted'
                    }`}>
                      MIN: {dimStats.min > 0 ? `${dimStats.min.toFixed(decPlaces)}${dim.unit}` : '\u2014'}
                    </span>
                    {!effectiveIsMin && (
                      <span className={`font-mono text-[10px] uppercase px-2 py-1 rounded-md border ${
                        tolerance > 0 && dimStats.max > 0 && dimStats.max > maxThreshold
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold'
                          : 'bg-gray-800/50 border-gray-700/50 text-muted'
                      }`}>
                        MAX: {dimStats.max > 0 ? `${dimStats.max.toFixed(decPlaces)}${dim.unit}` : '\u2014'}
                      </span>
                    )}
                  </div>
                </div>

                {/* 5-Slot Input Grid — Mass Data Entry per UI_DESIGN_SYSTEM.md §3.4 */}
                <div className="grid grid-cols-5 gap-1">
                  {(measurements[dim.id] ?? Array(SLOTS_PER_DIM).fill('')).map((val, idx) => {
                    const isFail  = dimStats.fails[idx] ?? false;
                    // Amendment-only "changed from original" highlight — reuses
                    // Cyan/Info (brand-secondary) per the 2026-08-14 planning
                    // decision (no dedicated token exists for this state; see
                    // AUDIT_REPORT.md).
                    const isChanged = Boolean(originalData) &&
                      hasFieldChanged(true, originalData?.dimensions?.[dim.id]?.[idx], val);
                    const numVal  = parseFloat(val);
                    let delta: string | null = null;
                    if (!isNaN(numVal) && isFail) {
                      if (numVal < threshold) {
                        delta = (numVal - threshold).toFixed(decPlaces);
                      } else if (!effectiveIsMin && tolerance > 0 && numVal > maxThreshold) {
                        delta = '+' + (numVal - maxThreshold).toFixed(decPlaces);
                      }
                    }

                    return (
                      <div key={idx} className="flex flex-col items-center">
                        <input
                          type="number"
                          step={getStep(dim)}
                          value={val}
                          onChange={(e) => handleSlotChange(dim.id, idx, e.target.value)}
                          onBlur={(e) => {
                            const raw = e.target.value;
                            const dec = getDecimalPlaces(dim);
                            const n = parseFloat(raw);
                            if (!isNaN(n)) {
                              const snapped = n.toFixed(dec);
                              if (snapped !== raw) handleSlotChange(dim.id, idx, snapped);
                            }
                          }}
                          placeholder={(idx + 1).toString()}
                          className={`w-full h-9 rounded-lg bg-canvas text-center font-mono text-lg shadow-inner transition-all outline-none border focus:ring-1
                            ${isFail
                              ? 'border-rose-500/50 text-rose-400 bg-rose-500/5 focus:ring-rose-500/30'
                              : isChanged
                                ? 'border-brand-secondary/50 bg-brand-secondary/5 text-primary focus:border-brand-secondary focus:ring-brand-secondary/30'
                                : dirtySlots[dim.id]?.[idx]
                                  ? 'border-gray-700 text-primary focus:border-brand-secondary focus:ring-brand-secondary/30'
                                  : 'border-gray-700 text-muted opacity-80 focus:opacity-100 focus:border-brand-secondary focus:ring-brand-secondary/30'
                            }`}
                        />
                        {/* Slot-level delta — UI_DESIGN_SYSTEM.md §5.2 */}
                        <div className={`mt-0.5 text-[9px] font-mono font-bold tracking-tighter text-rose-500 text-center leading-none ${isFail && delta !== null ? '' : 'invisible'}`}>
                          {isFail && delta !== null ? `${delta}${dim.unit}` : `0.0${dim.unit}`}
                        </div>
                        <OriginalValueNote
                          hasOriginal={originalData?.dimensions?.[dim.id]?.[idx] !== undefined}
                          originalValue={originalData?.dimensions?.[dim.id]?.[idx]}
                          currentValue={val}
                          label="Org"
                          className="mt-0.5 text-[9px] text-rose-400 font-mono text-center leading-none"
                        />
                      </div>
                    );
                  })}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* ── No Product/Size configured informational hint ─────────────────── */}
      {activeDimensions.length === 0 && (
        <div className="col-span-full py-16 flex flex-col items-center justify-center text-muted border-2 border-dashed border-gray-800/60 rounded-lg bg-surface/50">
          <Info className="w-10 h-10 mb-3 opacity-40 text-brand-secondary" />
          <span className="text-sm font-semibold uppercase tracking-widest text-muted">No Dimension Definitions Found</span>
          <p className="text-xs text-muted mt-2 text-center max-w-sm">
            Configure dimension definitions under <strong>Configuration Control → Product Engine</strong> for product <span className="font-mono">{productCode || 'this SKU'}</span>.
          </p>
        </div>
      )}

    </form>
  );
}

