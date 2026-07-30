/**
 * @file StepDimensions.tsx
 * @description Step 2 of the Smart Quality Inspection Wizard.
 *
 * Implements the large card grid layout for Physical Dimensions.
 * 6 dimensions (Length, Width, 4x Thickness) * 5 slots = 30 total slots.
 * Features real-time statistics (Min, Avg), out-of-spec delta badges,
 * and a 30-slot compliance tracker badge.
 *
 * Strict Compliance with UI_DESIGN_SYSTEM.md:
 *  - 48px touch targets for numerical inputs.
 *  - font-mono for all data fields and delta indicators.
 *  - Red delta text for out-of-spec slots.
 */

import { useState, useMemo } from 'react';
import { Ruler, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfig } from '../../context/ConfigContext';

export interface StepDimensionsProps {
  onNext: (data: any) => void;
  onBack: () => void;
  initialData?: Record<string, any>;
}

// Will use config.dimensions dynamically

export function StepDimensions({ onNext, onBack, initialData }: StepDimensionsProps) {
  const { addToast } = useToast();
  const { config } = useConfig();

  const defaultDimensions = [
    { id: 'length', name: 'Glove Length', minSpec: '240', tolerance: '5', unit: 'mm' },
    { id: 'palmWidth', name: 'Palm Width', minSpec: '95', tolerance: '5', unit: 'mm' },
    { id: 'thickBeading', name: 'Beading Thickness', minSpec: '0.050', tolerance: '0.010', unit: 'mm' },
    { id: 'thickCuff', name: 'Cuff Thickness', minSpec: '0.060', tolerance: '0.010', unit: 'mm' },
    { id: 'thickPalm', name: 'Palm Thickness', minSpec: '0.080', tolerance: '0.010', unit: 'mm' },
    { id: 'thickFinger', name: 'Finger Thickness', minSpec: '0.100', tolerance: '0.010', unit: 'mm' }
  ];

  const activeDimensions = config?.dimensions && config.dimensions.length > 0 
    ? config.dimensions 
    : defaultDimensions;

  // Initialize a matrix for the 30 slots: Record<dimensionId, string[5]>
  const [measurements, setMeasurements] = useState<Record<string, string[]>>(() => {
    if (initialData?.dimensions) return initialData.dimensions;
    const initial: Record<string, string[]> = {};
    if (activeDimensions) {
      activeDimensions.forEach((d: any) => {
        initial[d.id] = ['', '', '', '', ''];
      });
    }
    return initial;
  });

  const handleSlotChange = (dimId: string, index: number, value: string) => {
    setMeasurements(prev => {
      const newArray = [...prev[dimId]];
      newArray[index] = value;
      return { ...prev, [dimId]: newArray };
    });
  };

  // ── Real-Time Evaluation Engine ──────────────────────────────────────────
  const { totalSlots, filledSlots, passedSlots, failedSlots, stats } = useMemo(() => {
    let filled = 0;
    let passed = 0;
    let failed = 0;
    const calcStats: Record<string, { min: number; avg: number; fails: boolean[] }> = {};
    let dimensionCount = 0;

    if (activeDimensions) {
      dimensionCount = activeDimensions.length;
      activeDimensions.forEach((dim: any) => {
        const vals = measurements[dim.id] || ['', '', '', '', ''];
        const numVals = vals.map((v: string) => parseFloat(v)).filter((v: number) => !isNaN(v));
        
        const threshold = dim.minSpec - dim.tolerance;
        const fails = vals.map((v: string) => {
          const num = parseFloat(v);
          return !isNaN(num) && num < threshold;
        });

        vals.forEach((v: string, i: number) => {
          if (v !== '') {
            filled++;
            if (fails[i]) failed++;
            else passed++;
          }
        });

        const min = numVals.length > 0 ? Math.min(...numVals) : 0;
        const avg = numVals.length > 0 ? numVals.reduce((a: number, b: number) => a + b, 0) / numVals.length : 0;

        calcStats[dim.id] = { min, avg, fails };
      });
    }

    const tSlots = dimensionCount * 5;
    return { totalSlots: tSlots, filledSlots: filled, passedSlots: passed, failedSlots: failed, stats: calcStats };
  }, [measurements, config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filledSlots < totalSlots) {
      addToast('error', 'Please complete all 30 measurement slots before proceeding.');
      return;
    }
    onNext({ dimensions: measurements, dimensionStats: stats });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── Top Summary & Compliance Tracker ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-surface border border-gray-800 rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-wide text-primary flex items-center gap-2">
            <Ruler className="w-6 h-6 text-brand-secondary" strokeWidth={2} />
            PHYSICAL DIMENSIONS
          </h2>
          <p className="text-sm font-normal text-muted mt-1">
            Record 5 samples per dimension. Out-of-spec measurements are flagged automatically.
          </p>
        </div>

        {/* 30-Slot Compliance Badge */}
        <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border shadow-inner ${failedSlots > 0 ? 'bg-rose-500/10 border-rose-500/30' : (filledSlots === 30 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-canvas border-gray-800')}`}>
          {failedSlots > 0 ? (
            <AlertTriangle className="w-8 h-8 text-rose-400" strokeWidth={2} />
          ) : filledSlots === 30 ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400" strokeWidth={2} />
          ) : (
            <AlertCircle className="w-8 h-8 text-amber-400" strokeWidth={2} />
          )}
          
          <div className="flex flex-col">
            <span className={`text-xs font-semibold uppercase tracking-wider ${failedSlots > 0 ? 'text-rose-400' : (filledSlots === 30 ? 'text-emerald-400' : 'text-amber-400')}`}>
              COMPLIANCE TRACKER
            </span>
            <span className="text-lg font-bold font-mono text-white tracking-tight">
              {passedSlots}/{totalSlots} SLOTS PASSED
            </span>
            {failedSlots > 0 && (
              <span className="text-[11px] font-bold uppercase text-rose-400 mt-0.5 tracking-wider">
                {failedSlots} OUT OF SPEC
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Dimension Cards Grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {activeDimensions.map((dim: any) => {
          const dimStats = stats[dim.id] || { min: 0, avg: 0, fails: [] };
          const threshold = dim.minSpec - dim.tolerance;

          return (
            <div key={dim.id} className="bg-surface border border-gray-800 rounded-xl p-5 shadow-sm hover:border-gray-700 transition-colors">
              
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-3 mb-4">
                <span className="text-sm font-bold uppercase tracking-wider text-primary">
                  {dim.name} <span className="text-muted text-xs normal-case ml-1 font-normal">({dim.unit})</span>
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-secondary bg-brand-primary/10 px-2 py-1 rounded-md border border-brand-secondary/30">
                  MIN: {threshold}{dim.unit}
                </span>
              </div>

              {/* 5 Input Slots */}
              <div className="grid grid-cols-5 gap-3">
                {(measurements[dim.id] || ['', '', '', '', '']).map((val, idx) => {
                  const isFail = dimStats.fails[idx];
                  const numVal = parseFloat(val);
                  const delta = (!isNaN(numVal) && isFail) ? (numVal - threshold).toFixed(3) : null;
                  const isThickness = dim.id.toLowerCase().includes('thick');

                  return (
                    <div key={idx} className="flex flex-col">
                      <input
                        type="number"
                        step={isThickness ? '0.001' : '1'}
                        value={val}
                        onChange={(e) => handleSlotChange(dim.id, idx, e.target.value)}
                        placeholder={(idx + 1).toString()}
                        className={`w-full h-12 rounded-lg bg-canvas text-center font-mono text-sm shadow-inner transition-all outline-none border focus:ring-1 
                          ${isFail ? 'border-rose-500/50 text-rose-400 bg-rose-500/5 focus:ring-rose-500/30' : 'border-gray-700 text-primary focus:border-brand-secondary focus:ring-brand-secondary/30'}`}
                      />
                      {/* Slot-Level Delta Indicator Badge */}
                      {isFail && (
                        <div className="mt-1 text-[11px] font-mono font-bold tracking-tight text-rose-400 flex items-center justify-center gap-0.5">
                          {delta}{dim.unit}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Auto-Calculated Stats */}
              <div className="mt-5 flex items-center gap-4 pt-3 border-t border-gray-800/50">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">MINIMUM</span>
                  <span className="text-sm font-mono text-primary">{dimStats.min > 0 ? dimStats.min.toFixed(dim.id.toLowerCase().includes('thick') ? 3 : 1) : '--'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">AVERAGE</span>
                  <span className="text-sm font-mono text-primary">{dimStats.avg > 0 ? dimStats.avg.toFixed(dim.id.toLowerCase().includes('thick') ? 3 : 1) : '--'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom Action Bar ────────────────────────────────────────────────── */}
      <div className="flex justify-between pt-4 border-t border-gray-800 mt-6">
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 rounded-lg bg-surface border border-gray-700 text-primary font-semibold text-sm tracking-wider uppercase flex items-center justify-center gap-2 hover:bg-surface-light transition-all outline-none"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
          <span>BACK</span>
        </button>
        
        <button
          type="submit"
          className="h-12 px-10 rounded-lg bg-accent-gradient text-white font-semibold text-sm tracking-wider uppercase shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 hover:brightness-110 transition-all outline-none"
        >
          <span>PROCEED TO DEFECTS</span>
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}
