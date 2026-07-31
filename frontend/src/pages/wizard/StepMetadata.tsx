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

import { useState, useEffect, useMemo } from 'react';
import { useConfig } from '../../context/ConfigContext';
import {
  Activity,
  Clock,
  Box,
  Scaling,
  Scale,
  ArrowRight,
  Barcode,
  Calendar,
  Hash,
  SplitSquareHorizontal,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';

export interface StepMetadataProps {
  onNext: (data: any) => void;
  initialData?: Record<string, any>;
}

export function StepMetadata({ onNext, initialData }: StepMetadataProps) {
  const { config, isLoading, getResolvedProfile } = useConfig();
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
  const [sequenceNo, setSequenceNo] = useState<string>(initialData?.sequenceNo || '001');
  const [totalCarton, setTotalCarton] = useState<string>(initialData?.totalCarton?.toString() || '');
  const [sampleSize, setSampleSize] = useState<string>(
    initialData?.sampleSize?.toString() || localStorage.getItem('wizard_sampleSize') || ''
  );
  const [gloveWeight, setGloveWeight] = useState<string>(
    initialData?.gloveWeight?.toString() || ''
  );
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

  // ── ISO2859_MATH_ENGINE.md §3: Auto-extract Glove Weight from SKU prefix ───────
  useEffect(() => {
    if (!productCode || productCode.length < 4 || initialData?.gloveWeight) return;
    const weightStr = productCode.substring(1, 4);
    const weightVal = parseFloat(weightStr) / 10;
    if (!isNaN(weightVal)) {
      const parts = weightVal.toFixed(2).split('.');
      setGloveWeight(`${parts[0].padStart(2, '0')}.${parts[1]}`);
    }
  }, [productCode]);


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
  const { effectiveDate, activeShift, lot4Digit, fullSystemLotNo } = useMemo(() => {
    // --- Shift resolution from dynamic config.shifts ---
    let currentShift = 'Off-Shift';
    let isNightRollover = false;

    if (config?.shifts && config.shifts.length > 0) {
      const currentMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();

      for (const shift of config.shifts) {
        const startMins = shift.startHour * 60 + shift.startMinute;
        const durationMins = Math.round((shift.durationHours || 8) * 60);
        const endMins = startMins + durationMins;

        let isMatch = false;
        if (endMins <= 1440) {
          isMatch = currentMinutes >= startMins && currentMinutes < endMins;
        } else {
          // Midnight rollover (e.g. Night shift 20:00–08:00)
          isMatch = currentMinutes >= startMins || currentMinutes < (endMins % 1440);
        }

        if (isMatch) {
          const startStr = `${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute).padStart(2, '0')}`;
          // Subtract 1 minute from end display per ISO2859_MATH_ENGINE.md §4
          const actualEndMins = (endMins - 1 + 1440) % 1440;
          const endHour = Math.floor(actualEndMins / 60);
          const endMinute = actualEndMins % 60;
          const endStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
          currentShift = `${shift.name} (${startStr} - ${endStr})`;

          if (endMins > 1440 && currentMinutes < (endMins % 1440)) {
            isNightRollover = true;
          }
          break;
        }
      }
    } else {
      // Fallback if no shifts configured
      const h = timestamp.getHours();
      isNightRollover = h >= 0 && h < 8;
      if (isNightRollover) currentShift = 'Night';
      else if (h >= 8 && h < 20) currentShift = 'Day';
      else currentShift = 'Night';
    }

    // Night rollover: subtract 1 day from effective production date
    const prodDate = new Date(timestamp);
    if (isNightRollover) prodDate.setDate(prodDate.getDate() - 1);

    // --- Julian Date Compression (Day of Year) ---
    const startOfYear = new Date(prodDate.getFullYear(), 0, 0);
    const diff = prodDate.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const julian = dayOfYear.toString().padStart(3, '0');

    // 4-Digit Lot: last digit of year + 3-digit Julian (e.g. 2026 → 6 + 182 → 6182)
    const yearDigit = prodDate.getFullYear().toString().slice(-1);
    const generated4DigitLot = `${yearDigit}${julian}`;

    // Full System Lot: [Line][Side][Lot4Digit][Sequence]
    const safeLine = lineId || 'XXX';
    const safeSide = side || 'A';
    const safeSeq = sequenceNo.padStart(3, '0') || '001';
    const fullLot = `${safeLine}${safeSide}${generated4DigitLot}${safeSeq}`;

    return {
      effectiveDate: prodDate,
      activeShift: currentShift,
      lot4Digit: generated4DigitLot,
      fullSystemLotNo: fullLot,
    };
  }, [timestamp, lineId, side, sequenceNo, config?.shifts]);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── LEFT COLUMN: Manual Inputs ──────────────────────────────────── */}
        <div className="lg:col-span-8 bg-surface border border-gray-800 rounded-lg p-6 space-y-6 shadow-sm">
          <h2 className="text-xl font-bold uppercase tracking-wide text-primary border-b border-gray-800 pb-3 flex items-center gap-2">
            <Box className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            INSPECTION METADATA & SETUP
          </h2>

          {/* ── INSPECTION PROFILE DROPDOWN (user-selectable, product-agnostic) */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
              INSPECTION PROFILE
            </label>
            <div className="relative">
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="w-full h-12 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
              >
                <option value="" disabled>Select Inspection Profile...</option>
                {(config.inspectionProfiles || []).map((p: any) => (
                  <option key={p.id} value={p.id} className="bg-surface text-primary">
                    {p.name}{p.isDefault ? ' (DEFAULT)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Product Code */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Barcode className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                PRODUCT CODE
              </label>
              <div className="relative">
                <select
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled>Select Product Code...</option>
                  {(config.productCodes || []).map((code) => (
                    <option key={code} value={code} className="bg-surface text-primary">{code}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Glove Size */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Scaling className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                GLOVE SIZE
              </label>
              <div className="relative">
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled>Select Size...</option>
                  {(config.sizes || []).map((s) => (
                    <option key={s} value={s} className="bg-surface text-primary">{s}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Production Line */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                PRODUCTION LINE
              </label>
              <div className="relative">
                <select
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled>Select Line...</option>
                  {availableLines.map((l: any) => (
                    <option key={l.id} value={l.id} className="bg-surface text-primary">{l.id} ({l.name})</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Side */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <SplitSquareHorizontal className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                SIDE
              </label>
              <div className="relative">
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  {(config?.sides || []).map((s: any) => (
                    <option key={s.id} value={s.id} className="bg-surface text-primary">{s.id} ({s.name})</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Sequence No */}
            <div className="space-y-2">
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
                className="w-full h-12 px-4 rounded-lg bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 outline-none transition-all"
              />
            </div>

            {/* Total Carton */}
            <div className="space-y-2">
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
                className="w-full h-12 px-4 rounded-lg bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 outline-none transition-all"
              />
            </div>

            {/* Sample Size */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Hash className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                SAMPLE SIZE
              </label>
              <div className="relative">
                <select
                  value={sampleSize}
                  onChange={(e) => setSampleSize(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled>Select Sample Size...</option>
                  {(config.sampleSizes || []).map((ss) => (
                    <option key={ss} value={ss.toString()} className="bg-surface text-primary font-mono">{ss}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Glove Weight (auto-extracted, user-editable override) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Scale className="w-3 h-3 text-brand-secondary" strokeWidth={2} />
                GLOVE WEIGHT (g)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={gloveWeight}
                onChange={(e) => {
                  let val = e.target.value.replace(/[^0-9.]/g, '');
                  const dotIndex = val.indexOf('.');
                  if (dotIndex !== -1) {
                    const beforeDot = val.slice(0, dotIndex).slice(0, 2);
                    const afterDot = val.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
                    val = `${beforeDot}.${afterDot}`;
                  } else {
                    val = val.slice(0, 2);
                  }
                  setGloveWeight(val);
                }}
                onBlur={() => {
                  if (gloveWeight) {
                    const parsed = parseFloat(gloveWeight);
                    if (!isNaN(parsed)) {
                      const parts = parsed.toFixed(2).split('.');
                      setGloveWeight(`${parts[0].padStart(2, '0')}.${parts[1]}`);
                    } else {
                      setGloveWeight('');
                    }
                  }
                }}
                placeholder="00.00"
                className="w-full h-12 px-4 rounded-lg bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 outline-none transition-all"
              />
            </div>

          </div>
        </div>

        {/* ── RIGHT COLUMN: System Automations ────────────────────────────── */}
        <div className="lg:col-span-4 bg-brand-primary/5 p-6 rounded-lg border border-brand-primary/20 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

          <div className="space-y-5 relative z-10">
            <h2 className="text-lg font-bold uppercase tracking-wide text-brand-secondary flex items-center gap-2 border-b border-brand-primary/20 pb-3">
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
                className="w-full h-10 bg-surface border border-gray-700 rounded text-sm text-primary font-mono px-3 outline-none focus:border-brand-secondary [color-scheme:dark] transition-opacity"
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

      {/* ── Bottom Action Bar ────────────────────────────────────────────── */}
      <div className="flex justify-end pt-4 border-t border-gray-800 mt-6">
        <button
          type="submit"
          className="h-12 w-full md:w-auto px-10 rounded-lg bg-accent-gradient text-white font-bold text-xs tracking-wider uppercase shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 hover:brightness-110 transition-all outline-none"
        >
          <span>PROCEED TO PHYSICAL DIMENSIONS</span>
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}
