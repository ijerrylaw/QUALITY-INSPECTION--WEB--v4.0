/**
 * @file StepMetadata.tsx
 * @description Step 1 of the Smart Quality Inspection Wizard.
 *
 * Implements the 13 batch fields:
 * Profile (user-selected dropdown), Product Code, Glove Size, Date/Time (manual override),
 * Shift (auto), Line, Side, 4-Digit Lot No (auto YJJJ), Sequence No,
 * Total Carton, Sample Size, Glove Weight (auto-extracted from SKU prefix),
 * Full System Lot No (auto assembled).
 *
 * FREE NAVIGATION REFACTOR:
 * - Added `onUpdate` prop: fires on every field change, immediately pushing
 *   partial data up to WizardPage's `inspectionData`. This ensures no data is
 *   lost when the user jumps between wizard tabs freely.
 * - Local state is preserved for complex computed values (shift, lot, timestamp).
 * - `onNext` continues to fire on "Proceed" for step advancement.
 *
 * PROFILE RE-ALIGNMENT (Turn 3):
 * - Profile is NOW user-selected via dropdown in Step 1 (product-agnostic).
 * - productProfileMap lookup has been removed.
 * - Profile pre-selects the profile flagged isDefault:true on config load.
 * - Glove weight extracted from chars 1–3 of Product Code per ISO2859_MATH_ENGINE.md §3.
 * - Julian date compression (YJJJ) and Night Shift midnight rollover per ISO2859_MATH_ENGINE.md §4.
 * - All dropdowns hydrated from live AppConfig fields.
 *
 * Strict UI compliance:
 * - Inter for all UI chrome labels, buttons, headers.
 * - JetBrains Mono (font-mono) for all numeric data, codes, and readouts.
 * - 48px (h-12) touch targets per UI_DESIGN_SYSTEM.md §1.2.
 * - bg-canvas / bg-surface / bg-brand-primary token hierarchy per §1.1.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useConfig } from '../../context/ConfigContext';
import {
  resolveShiftAndEffectiveDate,
  composeYJJJ,
  composeFullLotNumber,
  fetchSuggestedNextSequence,
} from '../../utils/lotNumber';
import {
  Activity,
  Clock,
  Box,
  Scaling,
  Scale,
  Barcode,
  Calendar,
  Hash,
  SplitSquareHorizontal,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';

export interface StepMetadataProps {
  onNext: (data: Record<string, any>) => void;
  onUpdate?: (partialData: Record<string, any>) => void;
  initialData?: Record<string, any>;
  originalData?: Record<string, any> | null;
}

export function StepMetadata({ onNext, onUpdate, initialData, originalData }: StepMetadataProps) {
  const { config, isLoading } = useConfig();
  const { addToast } = useToast();

  // ── Form State ───────────────────────────────────────────────────────────
  const [profileId, setProfileId] = useState<string>(initialData?.profileId || '');
  const [productCode, setProductCode] = useState<string>(
    initialData?.productCode || localStorage.getItem('wizard_productCode') || ''
  );
  const [size, setSize] = useState<string>(
    initialData?.size || localStorage.getItem('wizard_size') || ''
  );
  const [lineId, setLineId] = useState<string>(
    initialData?.lineId || localStorage.getItem('wizard_lineId') || ''
  );
  const [side, setSide] = useState<string>(
    initialData?.side || localStorage.getItem('wizard_side') || 'A'
  );
  // No auto-default — Sequence must be genuinely operator-entered every time
  // (auto-incrementing would capture submission order, not true production
  // order; the business explicitly does not want that — see lotNumber.ts).
  const [sequenceNo, setSequenceNo] = useState<string>(initialData?.sequenceNo || '');
  const [totalCarton, setTotalCarton] = useState<string>(initialData?.totalCarton?.toString() || '');
  const [sampleSize, setSampleSize] = useState<string>(
    initialData?.sampleSize?.toString() || localStorage.getItem('wizard_sampleSize') || ''
  );
  const [gloveWeight, setGloveWeight] = useState<string>(() => {
    if (initialData?.gloveWeight !== undefined && initialData?.gloveWeight !== null && initialData?.gloveWeight !== '') {
      const num = parseFloat(initialData.gloveWeight.toString());
      if (!isNaN(num)) {
        const dec = config?.productMatrixConfig?.[initialData.productCode || '']?.weightDecimals ?? 0;
        return num.toFixed(dec);
      }
    }
    return '';
  });
  const [timestamp, setTimestamp] = useState<Date>(
    initialData?.timestamp ? new Date(initialData.timestamp) : new Date()
  );

  const availableLines = useMemo(() => config?.lines ?? [], [config?.lines]);

  // ── ISO2859_MATH_ENGINE.md §3: Hydrate defaults from config on first load ─
  useEffect(() => {
    if (!config || initialData?.lineId) return;
    if (!productCode && config.productCodes?.[0]) setProductCode(config.productCodes[0]);
    if (!size && config.sizes?.[0]) setSize(config.sizes[0]);
    if (!lineId && availableLines[0]) setLineId(availableLines[0].id);
    if (!sampleSize) {
      const preferred = config.sampleSizes?.includes(125) ? '125' : (config.sampleSizes?.[0]?.toString() ?? '125');
      setSampleSize(preferred);
    }
    if (!totalCarton) setTotalCarton('18');
  }, [config]); // intentionally fire once

  // ── ISO2859_MATH_ENGINE.md §3: Pre-select isDefault profile on config load ─────────
  // Profiles are PRODUCT-AGNOSTIC — user selects from dropdown in this step.
  // On first load: pre-select the profile flagged isDefault:true, or the first.
  useEffect(() => {
    if (!config || profileId) return; // already set (e.g. retained from previous lot)
    const defaultProfile =
      config.inspectionProfiles?.find((p) => p.isDefault) ??
      config.inspectionProfiles?.[0];
    if (defaultProfile) setProfileId(defaultProfile.id);
  }, [config]);

  // ── Auto-populate Glove Weight from Product Engine size setup ────────────────
  const lastPopulatedRef = useRef<{ productCode: string; size: string }>({ 
    productCode: initialData?.gloveWeight ? (initialData.productCode ?? '') : '', 
    size: initialData?.gloveWeight ? (initialData.size ?? '') : '' 
  });

  useEffect(() => {
    if (!productCode || !size) return;
    
    // If productCode and size match the last auto-populated (or mounted) values,
    // do not overwrite. This preserves manual edits when jumping tabs.
    if (lastPopulatedRef.current.productCode === productCode && lastPopulatedRef.current.size === size) {
      return;
    }
    lastPopulatedRef.current = { productCode, size };

    const matrixEntry = config?.productMatrixConfig?.[productCode];
    const sizeEntry = matrixEntry?.sizes?.[size];
    
    if (sizeEntry?.weightTarget) {
      const dec = matrixEntry?.weightDecimals ?? 0;
      const num = parseFloat(sizeEntry.weightTarget);
      if (!isNaN(num)) {
        setGloveWeight(num.toFixed(dec));
      } else {
        setGloveWeight(sizeEntry.weightTarget);
      }
    } else {
      setGloveWeight(''); // clear if no target configured
    }
  }, [productCode, size, config]);


  // Enforce side validity when line changes
  useEffect(() => {
    if (config?.sides && config.sides.length > 0) {
      if (!config.sides.find((s: any) => s.id === side)) {
        setSide(config.sides[0].id);
      }
    }
  }, [config?.sides]);

  // Enforce line validity
  useEffect(() => {
    if (availableLines.length > 0 && !availableLines.find((l: any) => l.id === lineId)) {
      setLineId(availableLines[0].id);
    }
  }, [availableLines]);

  // Cache selections to localStorage for session persistence
  useEffect(() => {
    if (productCode) localStorage.setItem('wizard_productCode', productCode);
    if (size) localStorage.setItem('wizard_size', size);
    if (lineId) localStorage.setItem('wizard_lineId', lineId);
    if (side) localStorage.setItem('wizard_side', side);
    if (sampleSize) localStorage.setItem('wizard_sampleSize', sampleSize);
  }, [productCode, size, lineId, side, sampleSize]);

  // ── ISO2859_MATH_ENGINE.md §4: Shift + Julian Date + Lot Assembly ─────────
  // effectiveDate/activeShift/lot4Digit depend only on `timestamp` (already
  // correctly seeded from initialData on mount, incl. amendment prefill) plus
  // config.shifts, so recomputing them here always reproduces the original
  // values. fullSystemLotNo additionally weaves in `side`/`sequenceNo`, which
  // an amendment's initialData never supplies (not persisted separately from
  // the assembled lot string) — freezing it below avoids overwriting the real
  // original lot number with one rebuilt from wrong side/sequence defaults.
  const computedLot = useMemo(() => {
    const { effectiveDate, activeShift } = resolveShiftAndEffectiveDate(timestamp, config?.shifts);
    const lot4Digit = composeYJJJ(effectiveDate);
    const fullSystemLotNo = composeFullLotNumber(lineId, side, lot4Digit, sequenceNo);

    return { effectiveDate, activeShift, lot4Digit, fullSystemLotNo };
  }, [timestamp, lineId, side, sequenceNo, config?.shifts]);

  // Freeze fullSystemLotNo from initialData (amendment prefill) until the user
  // actually edits an input that would change it — then fall through to the
  // live recompute above, matching amendment mode's "all fields editable" intent.
  // Compares against a fixed mount-time snapshot (not a "have I run yet" flag) —
  // a ref-flag guard breaks under StrictMode, which invokes effects twice
  // (mount → cleanup → mount) on the same instance in development, making a
  // "skip only the first run" flag see its second invocation as a real change.
  const [frozenLotNo, setFrozenLotNo] = useState<string | null>(initialData?.fullSystemLotNo || null);
  const lotSeedRef = useRef({ lineId, side, sequenceNo, timestamp, shifts: config?.shifts });
  useEffect(() => {
    const seed = lotSeedRef.current;
    const unchanged =
      seed.lineId === lineId &&
      seed.side === side &&
      seed.sequenceNo === sequenceNo &&
      seed.timestamp === timestamp &&
      seed.shifts === config?.shifts;
    if (unchanged) return;
    setFrozenLotNo(null);
  }, [lineId, side, sequenceNo, timestamp, config?.shifts]);

  const { effectiveDate, activeShift, lot4Digit } = computedLot;
  const fullSystemLotNo = frozenLotNo ?? computedLot.fullSystemLotNo;

  // ── Sequence Hint: non-binding advisory, never pre-fills or restricts ───────
  // "Suggested next" = (max existing sequence for this Line+Side+YJJJ group) + 1.
  const [suggestedNextSeq, setSuggestedNextSeq] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!lineId || !side || !lot4Digit) {
      setSuggestedNextSeq(null);
      return;
    }
    fetchSuggestedNextSequence(lineId, side, lot4Digit).then((result) => {
      if (!cancelled) setSuggestedNextSeq(result);
    });
    return () => { cancelled = true; };
  }, [lineId, side, lot4Digit]);

  // ── Auto-save: Push all computed + local state up to parent on every change ─
  // Fires whenever any field or computed lot value changes, so WizardPage always
  // has current data even if the user jumps tabs without clicking "Proceed".
  useEffect(() => {
    onUpdate?.({
      profileId,
      productCode,
      size,
      lineId,
      side,
      sequenceNo,
      totalCarton: totalCarton ? parseInt(totalCarton, 10) : '',
      sampleSize: sampleSize ? parseInt(sampleSize, 10) : '',
      gloveWeight: gloveWeight ? parseFloat(gloveWeight) : '',
      effectiveDate: effectiveDate.toISOString(),
      shift: activeShift,
      lot4Digit,
      fullSystemLotNo,
      timestamp: timestamp.toISOString(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profileId, productCode, size, lineId, side, sequenceNo,
    totalCarton, sampleSize, gloveWeight, timestamp,
    effectiveDate, activeShift, lot4Digit, fullSystemLotNo,
  ]);

  // ── Loading Guard ─────────────────────────────────────────────────────────
  if (isLoading || !config) {
    return (
      <div className="bg-surface border border-gray-800 rounded-lg p-8 flex items-center justify-center h-64">
        <span className="text-sm font-semibold uppercase tracking-wider text-muted font-mono animate-pulse">
          LOADING BATCH CONFIGURATION...
        </span>
      </div>
    );
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) setTimestamp(new Date(e.target.value));
  };

  // ── Form Submit with Mandatory Validation ─────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!profileId) { addToast('error', 'Inspection Profile is required.'); return; }
    if (!productCode) { addToast('error', 'Product Code is required.'); return; }
    if (!size) { addToast('error', 'Glove Size is required.'); return; }
    if (!lineId) { addToast('error', 'Production Line is required.'); return; }
    if (!side) { addToast('error', 'Side is required.'); return; }
    if (!sequenceNo) { addToast('error', 'Sequence Number is required.'); return; }
    if (!totalCarton) { addToast('error', 'Total Carton is required.'); return; }
    if (!sampleSize) { addToast('error', 'Sample Size is required.'); return; }
    if (!gloveWeight) { addToast('error', 'Glove Weight is required.'); return; }

    onNext({
      profileId,
      productCode,
      size,
      lineId,
      side,
      sequenceNo,
      totalCarton: parseInt(totalCarton, 10),
      sampleSize: parseInt(sampleSize, 10),
      gloveWeight: parseFloat(gloveWeight),
      effectiveDate: effectiveDate.toISOString(),
      shift: activeShift,
      lot4Digit,
      fullSystemLotNo,
      timestamp: timestamp.toISOString(),
    });
  };
  const weightDecimals = config?.productMatrixConfig?.[productCode]?.weightDecimals ?? 0;
  const weightStep = weightDecimals === 0 ? '1' : (1 / Math.pow(10, weightDecimals)).toFixed(weightDecimals);

  return (
    <form id="wizard-step-form" onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── LEFT COLUMN: Manual Inputs ──────────────────────────────────── */}
        <div className="lg:col-span-8 bg-surface border border-gray-700/50 rounded-lg p-4 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold uppercase text-primary border-b border-gray-700/50 pb-3 flex items-center gap-2">
            <Box className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            INSPECTION METADATA & SETUP
          </h2>

          {/* ── INSPECTION PROFILE DROPDOWN (user-selectable, product-agnostic) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
              INSPECTION PROFILE
            </label>
            <div className="relative">
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
              >
                <option value="" disabled>Select Inspection Profile...</option>
                {(config.inspectionProfiles || []).map((p: any) => (
                  <option key={p.id} value={p.id} className="bg-surface text-primary">
                    {p.name}{p.isDefault ? ' (DEFAULT)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6 pt-1">

            {/* Product Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Barcode className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                PRODUCT CODE
              </label>
              <div className="relative">
                <select
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled>Select Product Code...</option>
                  {(config.productCodes || []).map((code) => (
                    <option key={code} value={code} className="bg-surface text-primary">{code}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Glove Size */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Scaling className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                GLOVE SIZE
              </label>
              <div className="relative">
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled>Select Size...</option>
                  {(config.sizes || []).map((s) => (
                    <option key={s} value={s} className="bg-surface text-primary">{s}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Production Line */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                PRODUCTION LINE
              </label>
              <div className="relative">
                <select
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled>Select Line...</option>
                  {availableLines.map((l: any) => (
                    <option key={l.id} value={l.id} className="bg-surface text-primary">{l.id} ({l.name})</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Side */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <SplitSquareHorizontal className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                SIDE
              </label>
              <div className="relative">
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  {(config?.sides || []).map((s: any) => (
                    <option key={s.id} value={s.id} className="bg-surface text-primary">{s.id} ({s.name})</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Sequence No */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Hash className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                SEQUENCE NO
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={sequenceNo}
                onChange={(e) => setSequenceNo(e.target.value.replace(/\D/g, ''))}
                onBlur={() => {
                  if (sequenceNo) setSequenceNo(sequenceNo.padStart(3, '0'));
                }}
                placeholder="001"
                className="w-full h-9 px-4 rounded-lg bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 outline-none transition-all"
              />
              {suggestedNextSeq !== null && (
                <div className="text-[10px] text-muted font-mono mt-1">
                  Suggested next for {lineId}/{side}/{lot4Digit}: {String(suggestedNextSeq).padStart(3, '0')}
                </div>
              )}
            </div>

            {/* Total Carton */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Box className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                TOTAL CARTON
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={totalCarton}
                onChange={(e) => setTotalCarton(e.target.value.replace(/\D/g, ''))}
                onBlur={() => {
                  if (totalCarton) setTotalCarton(totalCarton.padStart(2, '0'));
                }}
                placeholder="01"
                className="w-full h-9 px-4 rounded-lg bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 outline-none transition-all"
              />
              {originalData?.totalCarton !== undefined && String(originalData.totalCarton) !== String(totalCarton) && (
                <div className="text-[10px] text-muted font-mono mt-1">
                  Original: {originalData.totalCarton || '—'}
                </div>
              )}
            </div>

            {/* Sample Size */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Hash className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                SAMPLE SIZE
              </label>
              <div className="relative">
                <select
                  value={sampleSize}
                  onChange={(e) => setSampleSize(e.target.value)}
                  className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled>Select Sample Size...</option>
                  {(config.sampleSizes || []).map((ss) => (
                    <option key={ss} value={ss.toString()} className="bg-surface text-primary font-mono">{ss}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              {originalData?.sampleSize !== undefined && String(originalData.sampleSize) !== String(sampleSize) && (
                <div className="text-[10px] text-muted font-mono mt-1">
                  Original: {originalData.sampleSize || '—'}
                </div>
              )}
            </div>

            {/* Glove Weight (auto-extracted, user-editable override) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Scale className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                GLOVE WEIGHT (g)
              </label>
              <input
                type="number"
                step={weightStep}
                value={gloveWeight}
                onChange={(e) => setGloveWeight(e.target.value)}
                onBlur={() => {
                  if (gloveWeight) {
                    const parsed = parseFloat(gloveWeight);
                    if (!isNaN(parsed)) {
                      setGloveWeight(parsed.toFixed(weightDecimals));
                    } else {
                      setGloveWeight('');
                    }
                  }
                }}
                placeholder="e.g. 5.2"
                className="w-full h-9 px-4 rounded-lg bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 outline-none transition-all"
              />
              {originalData?.gloveWeight !== undefined && String(originalData.gloveWeight) !== String(gloveWeight) && (
                <div className="text-[10px] text-muted font-mono mt-1">
                  Original: {originalData.gloveWeight || '—'}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── RIGHT COLUMN: System Automations ────────────────────────────── */}
        <div className="lg:col-span-4 bg-brand-primary/5 p-4 rounded-lg border border-brand-primary/20 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

          <div className="space-y-4 relative z-10">
            <h2 className="text-lg font-semibold uppercase text-brand-secondary flex items-center gap-2 border-b border-brand-primary/20 pb-3">
              <Clock className="w-5 h-5" strokeWidth={2} />
              SYSTEM AUTOMATIONS
            </h2>

            {/* Date & Time (manual override) */}
            <div className="bg-canvas/50 p-3 rounded-lg border border-gray-800">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-brand-secondary" />
                DATE & TIME (MANUAL OVERRIDE)
              </label>
              <input
                type="datetime-local"
                value={new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                onChange={handleDateChange}
                className="w-full h-9 bg-surface border border-gray-700 rounded-lg text-sm text-primary font-mono px-3 outline-none focus:border-brand-secondary [color-scheme:dark] transition-opacity"
              />
            </div>

            {/* Auto-Calculated Shift */}
            <div className="bg-canvas/50 p-3 rounded-lg border border-gray-800">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">AUTO-CALCULATED SHIFT</label>
              <div className="text-sm font-mono text-primary flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${activeShift === 'Off-Shift' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                {activeShift}
              </div>
            </div>

            {/* 4-Digit Lot No (YJJJ) */}
            <div className="bg-canvas/50 p-3 rounded-lg border border-gray-800">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">4-DIGIT LOT NO (YJJJ)</label>
              <div className="text-sm font-mono flex items-center gap-2">
                <span className="text-brand-secondary font-bold text-lg tracking-wider">{lot4Digit}</span>
              </div>
            </div>

            {/* Full System Lot Number — Critical Output Display per UI_DESIGN_SYSTEM.md §4.6 */}
            <div className="pt-2">
              <label className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest block mb-2">FULL SYSTEM LOT NUMBER</label>
              <div className="bg-gray-900 border border-brand-secondary/50 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between shadow-inner gap-3">
                <span className="text-xl sm:text-2xl font-mono font-bold tracking-widest text-white text-center sm:text-left break-all">
                  {fullSystemLotNo}
                </span>
                <Barcode className="w-8 h-8 text-brand-secondary/50 shrink-0 hidden sm:block" />
              </div>
            </div>
          </div>
        </div>
      </div>

    </form>
  );
}

