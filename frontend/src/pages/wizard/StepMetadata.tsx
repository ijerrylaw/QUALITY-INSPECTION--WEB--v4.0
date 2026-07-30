/**
 * @file StepMetadata.tsx
 * @description Step 1 of the Smart Quality Inspection Wizard.
 *
 * Implements the 13 batch fields:
 * Profile, Product Code, Glove Size, Date/Time, Shift (auto), Line, Side,
 * Lot No (auto 4-digit), Sequence No, Total Carton, Sample Size, Glove Weight,
 * Full System Lot No (auto).
 *
 * Enforces mandatory validation and strict UI_DESIGN_SYSTEM.md formatting.
 */

import { useState, useEffect, useMemo } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { Activity, Clock, Box, Scaling, Scale, ArrowRight, Barcode, Calendar, Hash, SplitSquareHorizontal, ChevronDown } from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';

export interface StepMetadataProps {
  onNext: (data: any) => void;
  initialData?: Record<string, any>;
}

export function StepMetadata({ onNext, initialData }: StepMetadataProps) {
  const { config, isLoading } = useConfig();
  const { addToast } = useToast();

  const availableLines = useMemo(() => {
    if (!config?.lines) return [];
    return config.lines;
  }, [config?.lines]);

  // Form State
  const [profileId, setProfileId] = useState<string>(initialData?.profileId || '');
  const [productCode, setProductCode] = useState<string>(initialData?.productCode || localStorage.getItem('wizard_productCode') || '');
  const [size, setSize] = useState<string>(initialData?.size || localStorage.getItem('wizard_size') || '');
  const [lineId, setLineId] = useState<string>(initialData?.lineId || localStorage.getItem('wizard_lineId') || '');
  const [side, setSide] = useState<string>(initialData?.side || localStorage.getItem('wizard_side') || 'A');
  const [sequenceNo, setSequenceNo] = useState<string>(initialData?.sequenceNo || '001');
  const [totalCarton, setTotalCarton] = useState<string>(initialData?.totalCarton || '');
  const [sampleSize, setSampleSize] = useState<string>(initialData?.sampleSize || localStorage.getItem('wizard_sampleSize') || '');
  const [gloveWeight, setGloveWeight] = useState<string>(initialData?.gloveWeight || '');
  
  const [timestamp, setTimestamp] = useState<Date>(initialData?.timestamp ? new Date(initialData.timestamp) : new Date());

  // Handle manual date change
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setTimestamp(new Date(e.target.value));
    }
  };

  // Hydrate initial selection when config loads
  useEffect(() => {
    if (config && !initialData?.lineId) {
      if (!productCode && config.productCodes?.[0]) setProductCode(config.productCodes[0]);
      if (!size && config.sizes?.[0]) setSize(config.sizes[0]);
      if (!lineId && availableLines[0]) setLineId(availableLines[0].id);
      if (!sampleSize) {
        setSampleSize(config.sampleSizes?.includes(125) ? '125' : (config.sampleSizes?.[0]?.toString() || '125'));
      }
      if (!totalCarton) setTotalCarton('18');
    }
  }, [config, initialData, productCode, size, lineId, sampleSize, totalCarton, availableLines]);

  // Auto-select Profile and Extract Weight based on Product Code
  useEffect(() => {
    if (config && productCode) {
      const mapped = config.productProfileMap?.[productCode];
      if (mapped && mapped.length > 0) {
        setProfileId(mapped[0]);
      } else if (config.inspectionProfiles?.[0]) {
        setProfileId(config.inspectionProfiles[0].id);
      }
      
      // Extract standard glove weight from product code (index 1 to 3, e.g., N035... -> 035 -> 3.5g)
      if (productCode.length >= 4 && !initialData?.gloveWeight) {
        const weightStr = productCode.substring(1, 4);
        const weightVal = parseFloat(weightStr) / 10;
        if (!isNaN(weightVal)) {
          setGloveWeight(weightVal.toFixed(2));
        }
      }
    }
  }, [config, productCode, initialData]);

  // Cache selections to localStorage for session persistence
  useEffect(() => {
    if (productCode) localStorage.setItem('wizard_productCode', productCode);
    if (size) localStorage.setItem('wizard_size', size);
    if (lineId) localStorage.setItem('wizard_lineId', lineId);
    if (side) localStorage.setItem('wizard_side', side);
    if (sampleSize) localStorage.setItem('wizard_sampleSize', sampleSize);
  }, [productCode, size, lineId, side, sampleSize]);

  const selectedLine = useMemo(() => availableLines.find((l: any) => l.id === lineId) || availableLines[0], [availableLines, lineId]);

  useEffect(() => {
    if (availableLines.length > 0 && !availableLines.find((l: any) => l.id === lineId)) {
      setLineId(availableLines[0].id);
    }
  }, [availableLines, lineId]);

  useEffect(() => {
    if (selectedLine && config?.sides) {
      if (!config.sides.find((s: any) => s.id === side) && config.sides.length > 0) {
        setSide(config.sides[0].id);
      }
    }
  }, [selectedLine, side, config?.sides]);

  // ── Automations: Shift, 4-Digit Lot No, Full System Lot No ─────────
  const { effectiveDate, activeShift, lot4Digit, fullSystemLotNo } = useMemo(() => {
    const hours = timestamp.getHours();
    
    // Determine active shift based on dynamic config.shifts with duration & midnight rollover
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
          // Midnight rollover (e.g. 20:00 to 08:00)
          isMatch = currentMinutes >= startMins || currentMinutes < (endMins % 1440);
        }
        
        if (isMatch) {
          const startStr = `${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute).padStart(2, '0')}`;
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
      isNightRollover = hours >= 0 && hours < 8;
      if (isNightRollover) currentShift = 'Night';
      else if (hours >= 8 && hours < 20) currentShift = 'Day';
      else currentShift = 'Night';
    }

    const prodDate = new Date(timestamp);
    if (isNightRollover) {
      prodDate.setDate(prodDate.getDate() - 1);
    }

    // Calculate Julian Date (Day of Year)
    const startOfYear = new Date(prodDate.getFullYear(), 0, 0);
    const diff = prodDate.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const julian = dayOfYear.toString().padStart(3, '0');
    
    // 4-Digit Lot No: Last digit of year + 3-digit Julian (e.g. 2026 -> 6 + 182 -> 6182)
    const yearDigit = prodDate.getFullYear().toString().slice(-1);
    const generated4DigitLot = `${yearDigit}${julian}`;

    // Full System Lot No: [Line][Side][Lot4Digit][Sequence]
    const safeLine = lineId || 'XXX';
    const safeSide = side || 'A';
    const safeSeq = sequenceNo.padStart(3, '0') || '001';
    const fullLot = `${safeLine}${safeSide}${generated4DigitLot}${safeSeq}`;

    return {
      effectiveDate: prodDate,
      activeShift: currentShift,
      lot4Digit: generated4DigitLot,
      fullSystemLotNo: fullLot
    };
  }, [timestamp, lineId, side, sequenceNo]);

  if (isLoading || !config) {
    return (
      <div className="bg-surface border border-gray-800 rounded-lg p-8 flex items-center justify-center">
        <span className="text-sm font-semibold uppercase tracking-wider text-muted font-mono">
          LOADING BATCH CONFIGURATION...
        </span>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Mandatory Validation
    if (!profileId || !productCode || !size || !lineId || !side || !sequenceNo || !totalCarton || !sampleSize || !gloveWeight) {
      addToast('error', 'Please fill in all mandatory fields before proceeding.');
      return;
    }

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
      fullSystemLotNo
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ── Left Column: Manual Inputs ────────────────────────────────────────── */}
        <div className="lg:col-span-8 bg-surface border border-gray-800 rounded-lg p-6 space-y-6 shadow-sm">
          <h2 className="text-xl font-bold uppercase tracking-wide text-primary border-b border-gray-800 pb-3 flex items-center gap-2">
            <Box className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            INSPECTION METADATA & SETUP
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Field 1: Auto-Selected Profile (Hidden from UI per spec to reduce load) */}
            <input type="hidden" name="profileId" value={profileId} />

            {/* Field 2: Product Code */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Barcode className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                PRODUCT CODE
              </label>
              <div className="relative">
                <select
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled className="bg-surface text-primary py-2 px-3">Select Product Code...</option>
                  {(config.productCodes || []).map((code) => (
                    <option key={code} value={code} className="bg-surface text-primary py-2 px-3 hover:bg-brand-primary">
                      {code}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Field 3: Glove Size */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Scaling className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                GLOVE SIZE
              </label>
              <div className="relative">
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled className="bg-surface text-primary py-2 px-3">Select Size...</option>
                  {(config.sizes || []).map((s) => (
                    <option key={s} value={s} className="bg-surface text-primary py-2 px-3 hover:bg-brand-primary">
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Field 6: Line */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                PRODUCTION LINE
              </label>
              <div className="relative">
                <select
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled className="bg-surface text-primary py-2 px-3">Select Line...</option>
                  {availableLines.map((l: any) => (
                    <option key={l.id} value={l.id} className="bg-surface text-primary py-2 px-3 hover:bg-brand-primary">
                      {l.id} ({l.name})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Field 7: Side */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <SplitSquareHorizontal className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                SIDE
              </label>
              <div className="relative">
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  {(config?.sides || []).map((s: any) => (
                    <option key={s.id} value={s.id} className="bg-surface text-primary py-2 px-3 hover:bg-brand-primary">
                      {s.id} ({s.name})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Field 9: Sequence No */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                SEQUENCE NO
              </label>
              <input
                type="text"
                value={sequenceNo}
                onChange={(e) => setSequenceNo(e.target.value)}
                placeholder="e.g. 001"
                className="w-full h-12 px-4 rounded-lg bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary outline-none transition-all shadow-inner"
              />
            </div>

            {/* Field 10: Total Carton */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Box className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                TOTAL CARTON
              </label>
              <input
                type="number"
                value={totalCarton}
                onChange={(e) => setTotalCarton(e.target.value)}
                placeholder="0"
                min="1"
                className="w-full h-12 px-4 rounded-lg bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary outline-none transition-all shadow-inner"
              />
            </div>

            {/* Field 11: Sample Size */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                SAMPLE SIZE
              </label>
              <div className="relative">
                <select
                  value={sampleSize}
                  onChange={(e) => setSampleSize(e.target.value)}
                  className="w-full h-12 bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-mono outline-none cursor-pointer transition-all appearance-none"
                >
                  <option value="" disabled className="bg-surface text-primary py-2 px-3">Select Sample Size...</option>
                  {(config.sampleSizes || []).map((ss) => (
                    <option key={ss} value={ss.toString()} className="bg-surface text-primary font-mono py-2 px-3 hover:bg-brand-primary">
                      {ss}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-4 pointer-events-none" />
              </div>
            </div>

            {/* Field 12: Glove Weight */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                GLOVE WEIGHT (g)
              </label>
              <input
                type="number"
                step="0.01"
                value={gloveWeight}
                onChange={(e) => setGloveWeight(e.target.value)}
                placeholder="e.g. 4.50"
                className="w-full h-12 px-4 rounded-lg bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary outline-none transition-all shadow-inner"
              />
            </div>

          </div>
        </div>

        {/* ── Right Column: Automations ─────────────────────────────────────────── */}
        <div className="lg:col-span-4 bg-brand-primary/5 p-6 rounded-lg border border-brand-primary/20 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          
          <div className="space-y-5 relative z-10">
            <h2 className="text-lg font-bold uppercase tracking-wide text-brand-secondary flex items-center gap-2 border-b border-brand-primary/20 pb-3">
              <Clock className="w-5 h-5" strokeWidth={2} />
              SYSTEM AUTOMATIONS
            </h2>

            {/* Field 4: Date/Time (Editable) */}
            <div className="bg-canvas/50 p-3 rounded-lg border border-gray-800 shadow-inner">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-brand-secondary" />
                DATE & TIME (MANUAL OVERRIDE)
              </label>
              <input 
                type="datetime-local" 
                value={new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                onChange={handleDateChange}
                className="w-full h-10 bg-surface border border-gray-700 rounded text-sm text-primary font-mono px-3 outline-none focus:border-brand-secondary [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:hover:opacity-80 transition-opacity"
              />
            </div>

            {/* Field 5: Shift (Auto) */}
            <div className="bg-canvas/50 p-3 rounded-lg border border-gray-800 shadow-inner">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">AUTO-CALCULATED SHIFT</label>
              <div className="text-sm font-mono text-primary flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${activeShift === 'Off-Shift' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                {activeShift}
              </div>
            </div>

            {/* Field 8: 4-Digit Lot No */}
            <div className="bg-canvas/50 p-3 rounded-lg border border-gray-800 shadow-inner">
               <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">4-DIGIT LOT NO (YJJJ)</label>
               <div className="text-sm font-mono text-primary flex items-center gap-2">
                 <span className="text-brand-secondary font-bold text-lg">{lot4Digit}</span>
               </div>
            </div>

            {/* Field 13: Full System Lot No */}
            <div className="pt-2">
              <label className="text-[10px] font-bold text-brand-primary uppercase tracking-widest block mb-2">FULL SYSTEM LOT NUMBER</label>
              <div className="bg-canvas border border-brand-secondary/30 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between shadow-[0_0_15px_rgba(45,212,191,0.1)] gap-3">
                <span className="text-xl sm:text-2xl font-mono font-bold tracking-widest text-white text-center sm:text-left break-all">
                  {fullSystemLotNo}
                </span>
                <Barcode className="w-8 h-8 text-brand-secondary/50 shrink-0 hidden sm:block" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Action Bar ────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-4 border-t border-gray-800 mt-6">
        <button
          type="submit"
          className="h-12 w-full md:w-auto px-10 rounded-lg bg-accent-gradient text-white font-semibold text-sm tracking-wider uppercase shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 hover:brightness-110 transition-all outline-none"
        >
          <span>PROCEED TO PHYSICAL DIMENSIONS</span>
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}
