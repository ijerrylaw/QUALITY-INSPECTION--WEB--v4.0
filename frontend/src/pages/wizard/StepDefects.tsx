/**
 * @file StepDefects.tsx
 * @description Step 3 of the Smart Quality Inspection Wizard.
 *
 * Provides high-speed tablet defect logging categorized by severity.
 * 
 * Implements two distinct interaction models based on the Category's AQL:
 * 1. Quantitative (e.g., AQL 1.5, AND): Rapid-tap counter grid (-/count/+).
 * 2. Qualitative (AQL PASS / FAIL / NIL): 3-way toggle chips.
 *
 * Strict Compliance with UI_DESIGN_SYSTEM.md.
 */

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, AlertCircle, AlertTriangle, Info, ArrowLeft, ArrowRight, Minus, Plus, CheckSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { useConfig } from '../../context/ConfigContext';

export interface StepDefectsProps {
  inspectionData?: Record<string, any>;
  onNext: (data: any) => void;
  onBack: () => void;
}

export interface SeverityCategory {
  id: string;
  name: string;
  aqlLevel: string;
  badgeColor: string;
  icon: typeof ShieldAlert;
}

const IconMap: Record<string, any> = {
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckSquare,
};

type QualitativeState = 'PASS' | 'FAIL' | 'NIL' | undefined;

export function StepDefects({ inspectionData, onNext, onBack }: StepDefectsProps) {
  const { config, isLoading } = useConfig();
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  
  // State for quantitative defects (counts)
  const [defectCounts, setDefectCounts] = useState<Record<string, number>>(inspectionData?.defects || {});
  
  // State for qualitative defects (PASS/FAIL/NIL)
  const [qualitativeStates, setQualitativeStates] = useState<Record<string, QualitativeState>>(inspectionData?.qualitative || {});

  const handleIncrement = (defectId: string) => {
    setDefectCounts((prev) => ({ ...prev, [defectId]: (prev[defectId] || 0) + 1 }));
  };

  const handleDecrement = (defectId: string) => {
    setDefectCounts((prev) => {
      const current = prev[defectId] || 0;
      if (current <= 0) return prev;
      return { ...prev, [defectId]: current - 1 };
    });
  };

  const setQualState = (defectId: string, state: QualitativeState) => {
    setQualitativeStates(prev => ({ ...prev, [defectId]: state }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ defects: defectCounts, qualitative: qualitativeStates });
  };

  const activeCategory = config?.aqlCategories?.find((c: any) => c.id === activeCategoryId) || config?.aqlCategories?.[0] || {};
  const activeDefects = config?.defectDefinitions?.filter((d: any) => d.categoryId === activeCategory?.id) || [];
  
  // Calculate total defect count for quantitative items
  const totalQuantitativeDefects = Object.values(defectCounts).reduce((sum, count) => sum + count, 0);
  // Count how many fails we have in qualitative items
  const totalQualitativeFails = Object.values(qualitativeStates).filter(s => s === 'FAIL').length;
  
  const totalIssues = totalQuantitativeDefects + totalQualitativeFails;

  const isQualitativeCategory = activeCategory?.aql === 'PASS/FAIL/NIL';

  if (isLoading || !config) return null;

  const ActiveIcon = IconMap[activeCategory?.iconName] || ShieldAlert;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-surface border border-gray-800 rounded-xl p-6 space-y-6 shadow-sm">
        
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800/80 pb-4">
          <div>
            <h2 className="text-xl font-bold uppercase tracking-wide text-primary flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-brand-secondary" strokeWidth={2} />
              DEFECT TABULATION
            </h2>
            <p className="text-sm font-normal text-muted mt-1">
              Select a severity tier tab below to record defects.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-canvas text-brand-secondary border border-gray-700 shadow-inner">
              LOT: {inspectionData?.fullSystemLotNo || 'N/A'}
            </span>
          </div>
        </div>

        {/* ── Severity Tabs ────────────────────────────────────────────────── */}
        <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide">
          {config?.aqlCategories?.map((cat: any) => {
            const Icon = IconMap[cat.iconName] || ShieldAlert;
            const isActive = (activeCategoryId || config?.aqlCategories?.[0]?.id) === cat.id;
            return (
               <button
                 key={cat.id}
                 type="button"
                 onClick={() => setActiveCategoryId(cat.id)}
                 className={`h-12 px-5 whitespace-nowrap rounded-lg font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none border cursor-pointer shrink-0 ${
                   isActive 
                     ? 'bg-brand-primary text-white border-brand-secondary shadow-lg shadow-brand-primary/20' 
                     : 'bg-canvas text-muted hover:text-primary hover:bg-surface-light border-gray-800 shadow-inner'
                 }`}
               >
                 <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-brand-secondary'}`} strokeWidth={2} />
                 <span>{cat.name}</span>
               </button>
            );
          })}
        </div>

        {/* ── Active Category Container ───────────────────────────────────── */}
        <div className="p-6 rounded-xl bg-canvas border border-gray-800/80 space-y-6 shadow-inner">
          <div className="flex items-center justify-between border-b border-gray-800/60 pb-4">
            <h3 className="text-lg font-semibold uppercase tracking-wide text-primary flex items-center gap-2">
              <ActiveIcon className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
              {activeCategory?.name} CLASSIFICATION
            </h3>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border ${activeCategory?.bg} ${activeCategory?.color} ${activeCategory?.border}`}>
                AQL: {activeCategory?.aql}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {activeDefects.map((defect) => {
              
              if (isQualitativeCategory) {
                // QUALITATIVE RENDER (PASS / FAIL / NIL)
                const state = qualitativeStates[defect.id] || 'NIL';
                
                return (
                  <div key={defect.id} className="bg-surface border border-gray-800 rounded-xl p-5 flex flex-col justify-between shadow-sm">
                    <div className="mb-5">
                      <span className="text-sm font-bold text-primary tracking-wide block truncate">{defect.name}</span>
                      <span className="text-[10px] text-muted uppercase font-mono tracking-widest mt-1 block">ID: {defect.id}</span>
                    </div>
                    
                    {/* 3-State Qualitative Segmented Toggle */}
                    <div className="inline-flex bg-canvas p-1 rounded-lg border border-gray-800 h-12 items-center gap-1 w-full justify-between shadow-inner">
                      {/* PASS Button */}
                      <button
                        type="button"
                        onClick={() => setQualState(defect.id, 'PASS')}
                        className={`flex-1 h-10 px-3 flex items-center justify-center rounded-md text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer select-none outline-none ${
                          state === 'PASS' 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 font-bold shadow-sm' 
                            : 'text-muted hover:text-primary hover:bg-surface/50 border border-transparent'
                        }`}
                      >
                        PASS
                      </button>
                      
                      {/* FAIL Button */}
                      <button
                        type="button"
                        onClick={() => setQualState(defect.id, 'FAIL')}
                        className={`flex-1 h-10 px-3 flex items-center justify-center rounded-md text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer select-none outline-none ${
                          state === 'FAIL' 
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 font-bold shadow-sm' 
                            : 'text-muted hover:text-primary hover:bg-surface/50 border border-transparent'
                        }`}
                      >
                        FAIL
                      </button>

                      {/* NIL Button */}
                      <button
                        type="button"
                        onClick={() => setQualState(defect.id, 'NIL')}
                        className={`flex-1 h-10 px-3 flex items-center justify-center rounded-md text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer select-none outline-none ${
                          state === 'NIL' 
                            ? 'bg-gray-700/40 text-gray-300 border border-gray-600 font-medium shadow-sm' 
                            : 'text-muted hover:text-primary hover:bg-surface/50 border border-transparent'
                        }`}
                      >
                        NIL
                      </button>
                    </div>
                  </div>
                );
              }

              // QUANTITATIVE RENDER (Numeric Counters)
              const count = defectCounts[defect.id] || 0;
              return (
                <div key={defect.id} className="bg-surface border border-gray-800 rounded-xl p-5 flex flex-col justify-between shadow-sm hover:border-gray-700 transition-colors">
                  <div className="mb-5">
                    <span className="text-sm font-bold text-primary tracking-wide block truncate">
                      {defect.name}
                    </span>
                    <span className="text-[10px] text-muted uppercase font-mono tracking-widest mt-1 block">
                      ID: {defect.id}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between bg-canvas rounded-lg p-2 border border-gray-800 shadow-inner">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleDecrement(defect.id)}
                      disabled={count === 0}
                      className="w-12 h-12 shrink-0 flex items-center justify-center bg-surface border border-gray-700 rounded-md text-muted hover:text-rose-400 hover:border-rose-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors outline-none"
                    >
                      <Minus className="w-6 h-6" strokeWidth={2.5} />
                    </motion.button>
                    
                    <div className="flex-1 flex justify-center">
                      <span className={`text-3xl font-mono font-bold ${count > 0 ? 'text-brand-secondary' : 'text-gray-500'}`}>
                        {count.toString().padStart(2, '0')}
                      </span>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleIncrement(defect.id)}
                      className="w-12 h-12 shrink-0 flex items-center justify-center bg-surface border border-gray-700 rounded-md text-brand-secondary hover:bg-brand-primary/20 hover:border-brand-secondary transition-colors outline-none shadow-[0_0_10px_rgba(45,212,191,0.1)]"
                    >
                      <Plus className="w-6 h-6" strokeWidth={2.5} />
                    </motion.button>
                  </div>
                </div>
              );
            })}
            
            {activeDefects.length === 0 && (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted border-2 border-dashed border-gray-800/60 rounded-xl bg-surface/50">
                <Info className="w-8 h-8 mb-2 opacity-50 text-brand-secondary" />
                <span className="text-sm font-semibold uppercase tracking-widest">No definitions mapped to this category.</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Summary Bar ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-5 bg-brand-primary/10 border border-brand-primary/20 rounded-xl shadow-sm">
          <span className="text-sm font-bold uppercase tracking-widest text-brand-secondary">
            TOTAL RECORDED ISSUES
          </span>
          <div className="flex items-center gap-3 bg-surface px-4 py-2 rounded-lg border border-gray-800 shadow-inner">
            <ShieldAlert className={`w-5 h-5 ${totalIssues > 0 ? 'text-rose-400' : 'text-emerald-400'}`} strokeWidth={2} />
            <span className={`text-2xl font-mono font-bold ${totalIssues > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {totalIssues}
            </span>
          </div>
        </div>
      </div>

      {/* ── Bottom Action Navigation Bar ──────────────────────────────────── */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-800">
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 rounded-lg bg-surface text-muted hover:text-primary border border-gray-800 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
          <span>BACK TO DIMENSIONS</span>
        </button>

        <button
          type="submit"
          className="h-12 px-8 rounded-lg bg-accent-gradient text-white font-semibold text-sm tracking-wider uppercase shadow-lg shadow-brand-primary/20 flex items-center gap-2 hover:brightness-110 transition-all outline-none"
        >
          <span>PROCEED TO REVIEW</span>
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}
