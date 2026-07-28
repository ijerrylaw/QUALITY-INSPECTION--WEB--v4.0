import React, { useState, useEffect, useMemo } from 'react';
import { Factory, Calendar, Clock, Barcode, Box } from 'lucide-react';
import { Button } from '../ui/Button';

// Mock Config Data (In real app, this would come from a Context/API)
const FACILITIES = [
  { id: 'K', name: 'Klang Plant' },
  { id: 'I', name: 'Ipoh Plant' },
  { id: 'P', name: 'Penang Plant' }
];

const LINES = Array.from({ length: 12 }, (_, i) => ({
  id: `L${(i + 1).toString().padStart(2, '0')}`,
  name: `Line ${i + 1}`
}));

const SKUS = [
  { id: 'N035SKB-OC-24FT', name: 'Nitrile 3.5g Cobalt Blue' },
  { id: 'L050SWH-SM-18SM', name: 'Latex 5.0g White Smooth' },
  { id: 'N040SBK-TX-24FT', name: 'Nitrile 4.0g Black Textured' }
];

interface StepBatchInfoProps {
  onNext: (data: any) => void;
  initialData?: any;
}

export function StepBatchInfo({ onNext, initialData }: StepBatchInfoProps) {
  const [facility, setFacility] = useState(initialData?.facility || FACILITIES[0].id);
  const [line, setLine] = useState(initialData?.line || LINES[0].id);
  const [sku, setSku] = useState(initialData?.sku || SKUS[0].id);
  const [timestamp, setTimestamp] = useState(new Date());

  // Auto-update timestamp every minute
  useEffect(() => {
    const timer = setInterval(() => setTimestamp(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Automations
  const { effectiveDate, shift, julianDate, lotNumber } = useMemo(() => {
    const hours = timestamp.getHours();
    
    // Night Shift Rollover Logic
    // If between Midnight and 8:00 AM, assign to Shift 'C' and subtract 1 day from Production Date
    const isNightRollover = hours >= 0 && hours < 8;
    const prodDate = new Date(timestamp);
    if (isNightRollover) {
      prodDate.setDate(prodDate.getDate() - 1);
    }

    // Determine Shift
    let currentShift = 'A';
    if (isNightRollover) currentShift = 'C';
    else if (hours >= 16) currentShift = 'B';

    // Calculate Julian Date (Day of Year)
    const startOfYear = new Date(prodDate.getFullYear(), 0, 0);
    const diff = prodDate.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const julian = dayOfYear.toString().padStart(3, '0');
    
    const yearSuffix = prodDate.getFullYear().toString().slice(-2);

    // Construct Lot Number (e.g., K-L01-26214-C)
    const lot = `${facility}-${line}-${yearSuffix}${julian}-${currentShift}`;

    return {
      effectiveDate: prodDate,
      shift: currentShift,
      julianDate: julian,
      lotNumber: lot
    };
  }, [timestamp, facility, line]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({
      facility,
      line,
      sku,
      shift,
      effectiveDate: effectiveDate.toISOString(),
      lotNumber
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Manual Inputs */}
        <div className="space-y-6 bg-surface p-6 rounded-xl border border-gray-800 shadow-sm">
          <h2 className="text-xl font-bold text-primary flex items-center gap-2">
            <Box className="w-5 h-5 text-brand-secondary" />
            Production Details
          </h2>
          
          <div className="space-y-4">
            {/* Facility & Line Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Facility</label>
                <div className="relative">
                  <Factory className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <select 
                    value={facility} 
                    onChange={(e) => setFacility(e.target.value)}
                    className="w-full bg-canvas border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-sm font-medium text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all appearance-none"
                  >
                    {FACILITIES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Line</label>
                <select 
                  value={line} 
                  onChange={(e) => setLine(e.target.value)}
                  className="w-full bg-canvas border border-gray-700 rounded-lg py-2.5 px-4 text-sm font-medium text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all appearance-none"
                >
                  {LINES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>

            {/* SKU Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Product SKU</label>
              <select 
                value={sku} 
                onChange={(e) => setSku(e.target.value)}
                className="w-full bg-canvas border border-gray-700 rounded-lg py-2.5 px-4 text-sm font-medium text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all appearance-none"
              >
                {SKUS.map(s => <option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: Automations */}
        <div className="space-y-6 bg-brand-primary/5 p-6 rounded-xl border border-brand-primary/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          
          <h2 className="text-xl font-bold text-brand-secondary flex items-center gap-2">
            <Clock className="w-5 h-5" />
            System Automations
          </h2>

          <div className="space-y-5 relative z-10">
            {/* Shift & Date Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-canvas/50 p-3 rounded-lg border border-gray-800">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Effective Date</label>
                <div className="text-sm font-mono text-primary flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-brand-secondary" />
                  {effectiveDate.toLocaleDateString('en-GB')}
                </div>
              </div>
              <div className="bg-canvas/50 p-3 rounded-lg border border-gray-800">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Active Shift</label>
                <div className="text-sm font-mono text-primary flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Shift {shift}
                </div>
              </div>
            </div>

            <div className="bg-canvas/50 p-3 rounded-lg border border-gray-800">
               <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Julian Day (YYJJJ)</label>
               <div className="text-sm font-mono text-primary">
                 {effectiveDate.getFullYear().toString().slice(-2)}<span className="text-brand-secondary">{julianDate}</span>
               </div>
            </div>

            {/* Generated Lot Number */}
            <div className="pt-2">
              <label className="text-[10px] font-bold text-brand-primary uppercase tracking-widest block mb-2">Generated Lot Number</label>
              <div className="bg-canvas border-2 border-brand-secondary/30 rounded-lg p-4 flex items-center justify-between shadow-[0_0_15px_rgba(45,212,191,0.1)]">
                <span className="text-2xl font-mono font-bold tracking-[0.2em] text-white">
                  {lotNumber}
                </span>
                <Barcode className="w-8 h-8 text-brand-secondary/50" />
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="flex justify-end pt-6 border-t border-gray-800">
        <Button type="submit" size="lg" className="w-full md:w-auto px-12">
          CONTINUE TO AQL PLAN
        </Button>
      </div>
    </form>
  );
}
