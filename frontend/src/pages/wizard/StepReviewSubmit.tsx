/**
 * @file StepReviewSubmit.tsx
 * @description Step 4 of the Smart Quality Inspection Wizard.
 *
 * Final review page presenting a summary of all entered batch data,
 * physical dimensions, and defect tabulations. Displays the auto-generated
 * ISO 2859-1 verdict (Pass/Fail). Includes the "Retain Context" toggle
 * to streamline the next batch entry loop.
 *
 * Strict Compliance with UI_DESIGN_SYSTEM.md.
 */

import { useState, useMemo } from 'react';
import { 
  ClipboardCheck, 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  BookmarkCheck, 
  Box, 
  Ruler, 
  ShieldAlert, 
  ArrowRight
} from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';

export interface StepReviewSubmitProps {
  inspectionData: Record<string, any>;
  onSubmit: (retainContext: boolean) => void;
  onBack: () => void;
}

export function StepReviewSubmit({ inspectionData, onSubmit, onBack }: StepReviewSubmitProps) {
  const { addToast } = useToast();
  
  // Retain Context feature state (defaults to true for rapid entry loop)
  const [retainContext, setRetainContext] = useState<boolean>(true);

  // ── Auto-Generate Final Verdict (ISO 2859-1 Mock Logic) ─────────────────
  const { verdict, reason, totalDefects, failedDimensions } = useMemo(() => {
    // 1. Check Dimensions
    const dimStats = inspectionData?.dimensionStats || {};
    let failedDims = 0;
    Object.keys(dimStats).forEach(dim => {
      if (dimStats[dim].fails.some((f: boolean) => f === true)) {
        failedDims++;
      }
    });

    // 2. Check Quantitative Defects
    const quantDefects = inspectionData?.defects || {};
    const totalQuant = Object.values(quantDefects).reduce((sum: number, count: any) => sum + (count as number), 0) as number;

    // 3. Check Qualitative Defects
    const qualDefects = inspectionData?.qualitative || {};
    const totalQualFails = Object.values(qualDefects).filter(s => s === 'FAIL').length;

    const totalIssues = totalQuant + totalQualFails;

    let finalVerdict = 'PASS';
    let failReason = '';

    if (failedDims > 0 || totalIssues > 0) {
      finalVerdict = 'FAIL';
      const reasons = [];
      if (failedDims > 0) reasons.push(`${failedDims} Out-of-Spec Dimensions`);
      if (totalIssues > 0) reasons.push(`${totalIssues} Defect(s) Found`);
      failReason = reasons.join(' & ');
    }

    return { 
      verdict: finalVerdict, 
      reason: failReason,
      totalDefects: totalIssues,
      failedDimensions: failedDims
    };
  }, [inspectionData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addToast('success', 'Inspection submitted to system.');
    onSubmit(retainContext);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── Top Verdict Banner ─────────────────────────────────────────────── */}
      <div className={`p-6 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm ${
        verdict === 'PASS' 
          ? 'bg-emerald-500/10 border-emerald-500/30' 
          : 'bg-rose-500/10 border-rose-500/30'
      }`}>
        <div className="flex items-center gap-4">
          {verdict === 'PASS' ? (
            <CheckCircle2 className="w-12 h-12 text-emerald-400" strokeWidth={2} />
          ) : (
            <XCircle className="w-12 h-12 text-rose-400" strokeWidth={2} />
          )}
          <div>
            <h2 className={`text-2xl font-bold uppercase tracking-wide ${verdict === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}`}>
              ISO 2859-1 VERDICT: {verdict}
            </h2>
            <p className={`text-sm font-semibold uppercase tracking-wider mt-1 ${verdict === 'PASS' ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
              {verdict === 'PASS' ? 'LOT MEETS ACCEPTABLE QUALITY LIMITS' : `LOT REJECTED: ${reason}`}
            </p>
          </div>
        </div>
        
        <div className="bg-canvas border border-gray-800 rounded-lg px-6 py-3 shadow-inner text-center">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">FINAL SYSTEM LOT</span>
          <span className="text-xl font-mono font-bold text-white tracking-widest">
            {inspectionData?.fullSystemLotNo || 'UNKNOWN'}
          </span>
        </div>
      </div>

      {/* ── Summary Cards Grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Card 1: Metadata */}
        <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b border-gray-800 pb-3 mb-4 flex items-center gap-2">
            <Box className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            BATCH METADATA
          </h3>
          <div className="space-y-4 flex-1">
            <div className="flex justify-between items-center border-b border-gray-800/50 pb-2">
              <span className="text-xs text-muted font-semibold uppercase tracking-wider">Line</span>
              <span className="text-sm font-mono text-white">{inspectionData?.lineId || '--'}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-800/50 pb-2">
              <span className="text-xs text-muted font-semibold uppercase tracking-wider">Product</span>
              <span className="text-sm font-mono text-white">{inspectionData?.productCode || '--'} ({inspectionData?.size || '--'})</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-800/50 pb-2">
              <span className="text-xs text-muted font-semibold uppercase tracking-wider">Shift</span>
              <span className="text-sm font-mono text-white">{inspectionData?.shift || '--'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted font-semibold uppercase tracking-wider">Sample Size</span>
              <span className="text-sm font-mono text-white">{inspectionData?.sampleSize || '--'} Pcs</span>
            </div>
          </div>
        </div>

        {/* Card 2: Physical Dimensions */}
        <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b border-gray-800 pb-3 mb-4 flex items-center gap-2">
            <Ruler className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            PHYSICAL DIMENSIONS
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            <div className="text-4xl font-mono font-bold text-white mb-2">30</div>
            <span className="text-xs text-muted font-semibold uppercase tracking-widest text-center">
              Total Slots<br/>Measured
            </span>
            
            <div className="w-full mt-6 flex items-center justify-between bg-canvas rounded-lg border border-gray-800 p-3 shadow-inner">
               <span className="text-xs text-muted font-semibold uppercase tracking-wider">Failing Slots</span>
               <span className={`text-lg font-mono font-bold ${failedDimensions > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                 {failedDimensions}
               </span>
            </div>
          </div>
        </div>

        {/* Card 3: Defect Tabulation */}
        <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b border-gray-800 pb-3 mb-4 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            DEFECT TABULATION
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            <div className="text-4xl font-mono font-bold text-white mb-2">{totalDefects}</div>
            <span className="text-xs text-muted font-semibold uppercase tracking-widest text-center">
              Total Defects<br/>Recorded
            </span>

            <div className="w-full mt-6 flex items-center justify-between bg-canvas rounded-lg border border-gray-800 p-3 shadow-inner">
               <span className="text-xs text-muted font-semibold uppercase tracking-wider">Verdict Impact</span>
               <span className={`text-lg font-mono font-bold ${totalDefects > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                 {totalDefects > 0 ? 'FAIL' : 'PASS'}
               </span>
            </div>
          </div>
        </div>

      </div>



      {/* ── Bottom Action Navigation & Toggle ─────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between pt-6 border-t border-gray-800 gap-6">
        
        <button
          type="button"
          onClick={onBack}
          className="h-12 w-full md:w-auto px-6 rounded-lg bg-surface text-muted hover:text-primary border border-gray-800 font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
          <span>BACK TO DEFECTS</span>
        </button>

        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          {/* Retain Context for Next Batch Toggle */}
          <label 
            className="h-12 w-full md:w-auto px-4 rounded-lg bg-surface border border-gray-800 flex items-center justify-center gap-3 cursor-pointer select-none hover:bg-surface-light transition-all"
            title="When enabled, metadata like Line, Shift, and Product Code are preserved for the next batch."
          >
            <input
              type="checkbox"
              checked={retainContext}
              onChange={(e) => setRetainContext(e.target.checked)}
              className="w-4 h-4 rounded border-gray-700 bg-canvas text-brand-primary focus:ring-brand-secondary focus:ring-offset-canvas"
            />
            <div className="flex items-center gap-2">
              <BookmarkCheck className={`w-4 h-4 ${retainContext ? 'text-emerald-400' : 'text-muted'}`} strokeWidth={2} />
              <span className={`text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${retainContext ? 'text-primary' : 'text-muted'}`}>
                RETAIN CONTEXT FOR NEXT BATCH
              </span>
            </div>
          </label>

          <button
            type="submit"
            className="h-12 w-full md:w-auto px-8 rounded-lg bg-accent-gradient text-white font-semibold text-sm tracking-wider uppercase shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 hover:brightness-110 transition-all outline-none"
          >
            <ClipboardCheck className="w-5 h-5" strokeWidth={2} />
            <span>SUBMIT & NEXT LOT</span>
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </form>
  );
}
