import React, { useMemo, useState } from 'react';
import { ClipboardCheck, ShieldAlert, CheckCircle2, XCircle, Save, Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface StepReviewSubmitProps {
  inspectionData: any;
  onSubmit: () => void;
  onBack: () => void;
}

export function StepReviewSubmit({ inspectionData, onSubmit, onBack }: StepReviewSubmitProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Evaluate the verdict based on defect counts vs thresholds
  const evaluation = useMemo(() => {
    const thresholds = inspectionData.thresholds || [];
    const defects = inspectionData.defects || {};
    
    // We mock the defect category lookup here since we don't have the full definitions prop passed down
    // In a real scenario, we'd map over defects and sum by category.
    // For this step, let's derive it directly if we know which defect belongs to which cat.
    // Or simpler: We know the thresholds and we know the raw counts.
    // Let's re-use a minimal map for demo:
    const DEFECT_MAP: Record<string, string> = {
      'd1': 'c1', 'd2': 'c1', 
      'd3': 'c2', 'd4': 'c2', 
      'd5': 'c3', 'd6': 'c3', 
      'd7': 'c4', 'd8': 'c4', 'd9': 'c4'
    };

    let isFail = false;
    const categoryResults = thresholds.map((t: any) => {
      // Sum defects belonging to this category
      let sum = 0;
      Object.entries(defects).forEach(([defectId, count]) => {
        if (DEFECT_MAP[defectId] === t.id) {
          sum += (count as number);
        }
      });

      const failed = sum >= t.re;
      if (failed) isFail = true;

      return {
        ...t,
        totalDefects: sum,
        failed
      };
    });

    return {
      verdict: isFail ? 'FAILED' : 'PASSED',
      categoryResults
    };
  }, [inspectionData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Mock API call
    setTimeout(() => {
      setIsSubmitting(false);
      onSubmit();
    }, 1500);
  };

  const isPass = evaluation.verdict === 'PASSED';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Verdict Header */}
      <div className={`p-8 rounded-2xl border-2 shadow-xl flex items-center justify-between ${
        isPass 
          ? 'bg-green-900/10 border-green-500/30 shadow-green-500/5' 
          : 'bg-red-900/10 border-red-500/30 shadow-red-500/5'
      }`}>
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2 text-muted">
            Automated Verdict
          </h2>
          <div className="flex items-center gap-4">
            {isPass ? (
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            ) : (
              <XCircle className="w-12 h-12 text-red-500" />
            )}
            <span className={`text-5xl font-black tracking-tight ${
              isPass ? 'text-green-400' : 'text-red-500'
            }`}>
              {evaluation.verdict}
            </span>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-mono text-muted">LOT: <span className="text-white">{inspectionData.lotNumber}</span></p>
          <p className="text-sm font-mono text-muted">SKU: <span className="text-white">{inspectionData.sku}</span></p>
          <p className="text-sm font-mono text-muted mt-2">Sample Size: <span className="text-brand-secondary font-bold">{inspectionData.sampleSize}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Breakdown */}
        <div className="bg-surface p-6 rounded-xl border border-gray-800 shadow-sm">
          <h3 className="text-lg font-bold text-primary mb-6 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-brand-secondary" />
            AQL Compliance Breakdown
          </h3>
          
          <div className="space-y-3">
            {evaluation.categoryResults.map((cat: any) => (
              <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg bg-canvas border border-gray-700">
                <div>
                  <h4 className="font-semibold text-primary">{cat.name}</h4>
                  <span className="text-xs font-mono text-muted">Limit: AC {cat.ac} / RE {cat.re}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-mono font-bold ${
                    cat.failed ? 'text-red-500' : 'text-green-400'
                  }`}>
                    {cat.totalDefects}
                  </span>
                  {cat.failed ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Check className="w-5 h-5 text-green-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Confirmation */}
        <div className="bg-canvas p-6 rounded-xl border border-gray-800 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-brand-secondary" />
              Sign-off & Submit
            </h3>
            <p className="text-sm text-muted leading-relaxed">
              By submitting this record, you cryptographically sign off on the accuracy of these measurements. 
              The system will log your Azure AD credentials and timestamp this batch.
            </p>
            <div className="mt-6 p-4 rounded-lg bg-surface border border-gray-700 flex items-center gap-4">
               <div className="w-10 h-10 rounded-full bg-brand-primary/20 flex items-center justify-center">
                 <span className="font-bold text-brand-secondary">OP</span>
               </div>
               <div>
                 <p className="font-bold text-primary text-sm">Current Operator</p>
                 <p className="text-xs font-mono text-muted">Verified via Session</p>
               </div>
            </div>
          </div>

          <div className="flex justify-between pt-8">
            <Button type="button" variant="secondary" onClick={onBack} disabled={isSubmitting}>
              BACK
            </Button>
            <Button 
              type="button" 
              size="lg" 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              className={`px-8 flex items-center gap-2 ${
                isPass ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              {isSubmitting ? 'SUBMITTING...' : 'SUBMIT INSPECTION'}
              <Save className="w-5 h-5" />
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
