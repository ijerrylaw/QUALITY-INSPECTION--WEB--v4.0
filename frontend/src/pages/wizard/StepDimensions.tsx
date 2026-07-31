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
 * - Falls back gracefully when no product matrix is configured yet.
 *
 * UI_DESIGN_SYSTEM.md compliance:
 * - 48px touch targets (h-12) for numerical inputs (§1.2, §3.4).
 * - JetBrains Mono (font-mono) for all measurement values and delta labels (§1.3).
 * - Slot-level delta badge: text-[9px] font-mono text-rose-400 (§5.2).
 * - Compliance tracker badge uses Dynamic Composite Badge pattern (§4.7).
 * - bg-canvas / bg-surface tier hierarchy (§1.2).
 */

import { useState, useMemo } from 'react';
import { Ruler, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfig } from '../../context/ConfigContext';
import type { ProductDimensionDef } from '../../context/ConfigContext';

export interface StepDimensionsProps {
  onNext: (data: any) => void;
  onBack: () => void;
  initialData?: Record<string, any>;
}

/** 5 measurement slots per dimension */
const SLOTS_PER_DIM = 5;

export function StepDimensions({ onNext, onBack, initialData }: StepDimensionsProps) {
  const { addToast } = useToast();
  const { config } = useConfig();

  const productCode: string = initialData?.productCode ?? '';
  const size: string = initialData?.size ?? '';

  // ── Dimension Definitions from Product Engine config ─────────────────────
  // Primary source: productMatrixConfig[productCode].dimensionDefs
  // Fallback: legacy config.dimensions flat array
  // Last resort: hardcoded defaults (graceful degradation)
  const activeDimensions = useMemo((): ProductDimensionDef[] => {
    const matrixEntry = config?.productMatrixConfig?.[productCode];
    if (matrixEntry?.dimensionDefs && matrixEntry.dimensionDefs.length > 0) {
      return matrixEntry.dimensionDefs;
    }
    if (config?.dimensions && config.dimensions.length > 0) {
      return config.dimensions;
    }
    // Graceful fallback — shown with a setup warning
    return [];
  }, [config, productCode]);

  // ── Per-Size Spec Lookup from Product Engine ──────────────────────────────
  // config.productMatrixConfig[productCode].sizes[size].dimensions[dimId]
  // returns { minSpec: string, tolerance: string }
  const getDimSpec = (dimId: string): { minSpec: number; tolerance: number } => {
    const matrixEntry = config?.productMatrixConfig?.[productCode];
    const sizeEntry = matrixEntry?.sizes?.[size];
    const dimValue = sizeEntry?.dimensions?.[dimId];

    if (dimValue) {
      return {
        minSpec: parseFloat(dimValue.minSpec) || 0,
        tolerance: parseFloat(dimValue.tolerance) || 0,
      };
    }

    // Fallback: read from the dimension def itself (legacy flat format)
    const dimDef = activeDimensions.find((d) => d.id === dimId) as any;
    return {
      minSpec: parseFloat(dimDef?.minSpec ?? '0') || 0,
      tolerance: parseFloat(dimDef?.tolerance ?? '0') || 0,
    };
  };

  // ── Measurement State (dimId → string[SLOTS_PER_DIM]) ────────────────────
  const [measurements, setMeasurements] = useState<Record<string, string[]>>(() => {
    if (initialData?.dimensions) return initialData.dimensions;
    const init: Record<string, string[]> = {};
    activeDimensions.forEach((d) => {
      init[d.id] = Array(SLOTS_PER_DIM).fill('');
    });
    return init;
  });

  const handleSlotChange = (dimId: string, index: number, value: string) => {
    setMeasurements((prev) => {
      const arr = [...(prev[dimId] ?? Array(SLOTS_PER_DIM).fill(''))];
      arr[index] = value;
      return { ...prev, [dimId]: arr };
    });
  };

  // ── Real-Time Evaluation Engine ───────────────────────────────────────────
  const { totalSlots, filledSlots, passedSlots, failedSlots, stats } = useMemo(() => {
    let filled = 0;
    let passed = 0;
    let failed = 0;
    const calcStats: Record<string, { min: number; avg: number; fails: boolean[]; threshold: number }> = {};

    activeDimensions.forEach((dim) => {
      const { minSpec, tolerance } = getDimSpec(dim.id);
      const threshold = minSpec - tolerance;
      const vals = measurements[dim.id] ?? Array(SLOTS_PER_DIM).fill('');

      const fails = vals.map((v) => {
        const num = parseFloat(v);
        return !isNaN(num) && num < threshold;
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
      const avg = numVals.length > 0 ? numVals.reduce((a, b) => a + b, 0) / numVals.length : 0;

      calcStats[dim.id] = { min, avg, fails, threshold };
    });

    const tSlots = activeDimensions.length * SLOTS_PER_DIM;
    return { totalSlots: tSlots, filledSlots: filled, passedSlots: passed, failedSlots: failed, stats: calcStats };
  }, [measurements, activeDimensions, config, productCode, size]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeDimensions.length === 0) {
      // Allow proceeding with a warning if no dimensions are configured
      addToast('info', 'No dimensions configured — proceeding without dimension data.');
      onNext({ dimensions: {}, dimensionStats: {}, totalSlots: 0 });
      return;
    }
    if (filledSlots < totalSlots) {
      addToast('error', `Please complete all ${totalSlots} measurement slots before proceeding.`);
      return;
    }
    onNext({ dimensions: measurements, dimensionStats: stats, totalSlots });
  };

  // ── Decimal precision helper based on dimension type ─────────────────────
  const getDecimalPlaces = (dim: ProductDimensionDef) => {
    const id = dim.id.toLowerCase();
    if (id.includes('thick')) return 3;
    return 1;
  };

  const getStep = (dim: ProductDimensionDef) => {
    return getDecimalPlaces(dim) === 3 ? '0.001' : '1';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Top Summary & Compliance Tracker ──────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-surface border border-gray-800 rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-wide text-primary flex items-center gap-2">
            <Ruler className="w-6 h-6 text-brand-secondary" strokeWidth={2} />
            PHYSICAL DIMENSIONS
          </h2>
          <p className="text-xs font-normal text-muted mt-1">
            {productCode
              ? `Product: ${productCode} · Size: ${size || '—'} · ${activeDimensions.length} dimension(s) · ${SLOTS_PER_DIM} samples each`
              : 'Record physical measurement samples per dimension.'}
          </p>
        </div>

        {/* Compliance Tracker — Dynamic Composite Badge per UI_DESIGN_SYSTEM.md §4.7 */}
        <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border shadow-inner ${
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
            <span className="text-sm font-mono font-bold text-white tracking-tight">
              {passedSlots}/{totalSlots} SLOTS PASSED
            </span>
            {failedSlots > 0 && (
              <span className="text-[10px] font-bold uppercase text-rose-400 mt-0.5 tracking-wider">
                {failedSlots} OUT OF SPEC
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── No Dimensions Configured Warning ──────────────────────────────── */}
      {activeDimensions.length === 0 && (
        <div className="p-4 rounded-lg border border-l-4 border-amber-500/20 border-l-amber-500 bg-amber-500/5 flex gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">NO DIMENSIONS CONFIGURED</p>
            <p className="text-xs text-muted mt-1">
              No dimension definitions found for product <span className="font-mono text-primary">{productCode || '—'}</span>.
              Go to <strong>Configuration Control → Product Engine</strong> to add dimension definitions and size specifications.
            </p>
          </div>
        </div>
      )}

      {/* ── Dimension Cards Grid ───────────────────────────────────────────── */}
      {activeDimensions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeDimensions.map((dim) => {
            const dimStats = stats[dim.id] ?? { min: 0, avg: 0, fails: [], threshold: 0 };
            const { minSpec, tolerance } = getDimSpec(dim.id);
            const threshold = dimStats.threshold;
            const decPlaces = getDecimalPlaces(dim);

            return (
              <div key={dim.id} className="bg-surface border border-gray-800 rounded-xl p-5 shadow-sm hover:border-gray-700 transition-colors">

                {/* Card Header */}
                <div className="flex items-center justify-between border-b border-gray-800/80 pb-3 mb-4">
                  <span className="text-sm font-bold uppercase tracking-wider text-primary">
                    {dim.name}
                    <span className="text-muted text-xs normal-case ml-1 font-normal">({dim.unit})</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Min Spec badge */}
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-secondary bg-brand-primary/10 px-2 py-1 rounded-md border border-brand-secondary/30 font-mono">
                      MIN: {minSpec > 0 ? threshold.toFixed(decPlaces) : '—'}{dim.unit}
                    </span>
                  </div>
                </div>

                {/* Spec sub-line */}
                {minSpec > 0 && (
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-widest">SPEC</span>
                    <span className="text-[11px] font-mono text-muted">
                      Min: {minSpec.toFixed(decPlaces)}{dim.unit} &nbsp;±&nbsp; {tolerance.toFixed(decPlaces)}{dim.unit}
                    </span>
                  </div>
                )}

                {/* 5-Slot Input Grid — 48px touch targets per UI_DESIGN_SYSTEM.md §3.4 */}
                <div className="grid grid-cols-5 gap-2">
                  {(measurements[dim.id] ?? Array(SLOTS_PER_DIM).fill('')).map((val, idx) => {
                    const isFail = dimStats.fails[idx] ?? false;
                    const numVal = parseFloat(val);
                    const delta = (!isNaN(numVal) && isFail) ? (numVal - threshold).toFixed(decPlaces) : null;

                    return (
                      <div key={idx} className="flex flex-col items-center">
                        <input
                          type="number"
                          step={getStep(dim)}
                          value={val}
                          onChange={(e) => handleSlotChange(dim.id, idx, e.target.value)}
                          placeholder={(idx + 1).toString()}
                          className={`w-full h-12 rounded-lg bg-canvas text-center font-mono text-sm shadow-inner transition-all outline-none border focus:ring-1 
                            ${isFail
                              ? 'border-rose-500/50 text-rose-400 bg-rose-500/5 focus:ring-rose-500/30'
                              : 'border-gray-700 text-primary focus:border-brand-secondary focus:ring-brand-secondary/30'
                            }`}
                        />
                        {/* Slot-level delta — UI_DESIGN_SYSTEM.md §5.2 */}
                        {isFail && delta !== null && (
                          <div className="mt-0.5 text-[9px] font-mono font-bold tracking-tighter text-rose-500 text-center leading-none">
                            {delta}{dim.unit}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Auto-Calculated Stats — UI_DESIGN_SYSTEM.md §4.5 */}
                <div className="mt-4 flex items-center gap-6 pt-3 border-t border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">MINIMUM</span>
                    <span className={`text-sm font-mono ${dimStats.min > 0 && dimStats.min < threshold ? 'text-rose-400' : 'text-primary'}`}>
                      {dimStats.min > 0 ? dimStats.min.toFixed(decPlaces) : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">AVERAGE</span>
                    <span className="text-sm font-mono text-primary">
                      {dimStats.avg > 0 ? dimStats.avg.toFixed(decPlaces) : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">THRESHOLD</span>
                    <span className="text-sm font-mono text-brand-secondary">
                      {threshold > 0 ? threshold.toFixed(decPlaces) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── No Product/Size configured informational hint ─────────────────── */}
      {activeDimensions.length === 0 && (
        <div className="col-span-full py-16 flex flex-col items-center justify-center text-muted border-2 border-dashed border-gray-800/60 rounded-xl bg-surface/50">
          <Info className="w-10 h-10 mb-3 opacity-40 text-brand-secondary" />
          <span className="text-sm font-semibold uppercase tracking-widest text-muted">No Dimension Definitions Found</span>
          <p className="text-xs text-muted mt-2 text-center max-w-sm">
            Configure dimension definitions under <strong>Configuration Control → Product Engine</strong> for product <span className="font-mono">{productCode || 'this SKU'}</span>.
          </p>
        </div>
      )}

      {/* ── Bottom Action Bar ─────────────────────────────────────────────── */}
      <div className="flex justify-between pt-4 border-t border-gray-800 mt-6">
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 rounded-lg bg-surface border border-gray-700 text-primary font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 hover:bg-surface-light transition-all outline-none"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
          <span>BACK</span>
        </button>

        <button
          type="submit"
          className="h-12 px-10 rounded-lg bg-accent-gradient text-white font-bold text-xs tracking-wider uppercase shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 hover:brightness-110 transition-all outline-none"
        >
          <span>PROCEED TO DEFECTS</span>
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}
