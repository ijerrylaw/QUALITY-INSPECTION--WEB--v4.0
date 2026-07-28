import React, { useState, useMemo } from 'react';
import { Calculator, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';

// Mock AQL Categories (Normally fetched from InspectionProfile via SKU mapping)
const MOCK_AQL_CATEGORIES = [
  { id: 'c1', name: 'Zero Tolerance', aqlLevel: 'AND' },
  { id: 'c2', name: 'Critical Defect', aqlLevel: '0.65' },
  { id: 'c3', name: 'Major Visual', aqlLevel: '1.5' },
  { id: 'c4', name: 'Minor Visual', aqlLevel: '4.0' },
];

const ISO_BRACKETS = [13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250];

// Simplified Mock ISO Matrix for Demo (Size -> AQL Level -> {ac, re})
const MOCK_ISO_MATRIX: Record<number, Record<string, { ac: number, re: number }>> = {
  125: { '0.65': { ac: 2, re: 3 }, '1.5': { ac: 5, re: 6 }, '4.0': { ac: 10, re: 11 } },
  200: { '0.65': { ac: 3, re: 4 }, '1.5': { ac: 7, re: 8 }, '4.0': { ac: 14, re: 15 } },
  315: { '0.65': { ac: 5, re: 6 }, '1.5': { ac: 10, re: 11 }, '4.0': { ac: 21, re: 22 } },
};

interface StepAqlPlanProps {
  inspectionData: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function StepAqlPlan({ inspectionData, onNext, onBack }: StepAqlPlanProps) {
  const [rawSampleSize, setRawSampleSize] = useState<string>('200');

  // Calculate Snapped Size and Limits
  const { snappedSize, thresholds } = useMemo(() => {
    const size = parseInt(rawSampleSize) || 0;
    
    // Snap to nearest ISO bracket
    let snapped = ISO_BRACKETS[0];
    let minDiff = Math.abs(size - ISO_BRACKETS[0]);
    for (const b of ISO_BRACKETS) {
      const diff = Math.abs(size - b);
      if (diff < minDiff) {
        minDiff = diff;
        snapped = b;
      }
    }

    // Lookup thresholds
    const limits = MOCK_AQL_CATEGORIES.map(cat => {
      if (cat.aqlLevel === 'AND') {
        return { ...cat, ac: 0, re: 1 };
      }
      // Use exact lookup or fallback to default proportional mock
      const bracketLimits = MOCK_ISO_MATRIX[snapped];
      if (bracketLimits && bracketLimits[cat.aqlLevel]) {
        return { ...cat, ...bracketLimits[cat.aqlLevel] };
      }
      
      // Fallback fallback math for demo if matrix missing
      const baseLevel = parseFloat(cat.aqlLevel) || 1.5;
      const calculatedAc = Math.max(0, Math.floor((snapped * baseLevel) / 100 * 2.5));
      return { ...cat, ac: calculatedAc, re: calculatedAc + 1 };
    });

    return { snappedSize: snapped, thresholds: limits };
  }, [rawSampleSize]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({
      sampleSize: snappedSize,
      thresholds
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Input */}
        <div className="space-y-6 bg-surface p-6 rounded-xl border border-gray-800 shadow-sm">
          <h2 className="text-xl font-bold text-primary flex items-center gap-2">
            <Calculator className="w-5 h-5 text-brand-secondary" />
            Sampling Plan
          </h2>
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Requested Sample Size</label>
            <input 
              type="number"
              value={rawSampleSize}
              onChange={(e) => setRawSampleSize(e.target.value)}
              className="w-full bg-canvas border border-gray-700 rounded-lg py-3 px-4 text-2xl font-mono text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all"
              placeholder="e.g. 200"
              min="1"
            />
            <p className="text-xs text-gray-500 mt-2">
              Based on SKU <span className="font-mono text-brand-secondary">{inspectionData.sku || 'UNKNOWN'}</span>. The system will automatically snap to the nearest standard ISO 2859-1 bracket.
            </p>
          </div>

          <div className="mt-8 p-4 bg-brand-primary/10 border border-brand-primary/20 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">Effective ISO Sample Size</p>
              <div className="text-4xl font-mono font-bold text-white mt-1">{snappedSize}</div>
            </div>
            <ShieldCheck className="w-12 h-12 text-brand-secondary opacity-50" />
          </div>
        </div>

        {/* Right Column: Thresholds Matrix */}
        <div className="space-y-6 bg-canvas p-6 rounded-xl border border-gray-800 shadow-sm">
          <h2 className="text-xl font-bold text-primary flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Active AQL Thresholds
          </h2>

          <div className="space-y-3">
            {thresholds.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-surface border border-gray-700">
                <div>
                  <h3 className="font-semibold text-primary">{t.name}</h3>
                  <span className="text-xs font-mono text-muted">AQL {t.aqlLevel}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <span className="block text-[10px] font-bold text-green-500 uppercase">AC</span>
                    <span className="block font-mono text-lg text-green-400">{t.ac}</span>
                  </div>
                  <div className="text-center">
                    <span className="block text-[10px] font-bold text-red-500 uppercase">RE</span>
                    <span className="block font-mono text-lg text-red-400">{t.re}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="flex justify-between pt-6 border-t border-gray-800">
        <Button type="button" variant="secondary" onClick={onBack} className="px-8">
          BACK
        </Button>
        <Button type="submit" size="lg" className="px-12 flex items-center gap-2">
          CONTINUE TO DEFECTS
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </form>
  );
}
