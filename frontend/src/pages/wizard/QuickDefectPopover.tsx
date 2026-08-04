/**
 * @file QuickDefectPopover.tsx
 * @description Quick Defect Popover Modal for the Grid Mode.
 *
 * Appears as an overlay when a user clicks or presses Spacebar on the "Defects" chip
 * in the Spreadsheet Grid. Mirrors the exact same interaction model as StepDefects.tsx:
 * - 48px touch targets for quantitative counters.
 * - 3-way toggle chips for qualitative PASS/FAIL/NIL categories.
 */

import { useState } from 'react';
import { ShieldAlert, X, Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useConfig } from '../../context/ConfigContext';
import { getDisplayId } from './StepDefects';

export interface QuickDefectPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  rowId: string;
  sequenceNo: string;
  initialDefects: Record<string, number>;
  initialQualitative: Record<string, 'PASS' | 'FAIL' | 'NIL' | undefined>;
  onSave: (rowId: string, defects: Record<string, number>, qualitative: Record<string, any>) => void;
}



export function QuickDefectPopover({ isOpen, onClose, rowId, sequenceNo, initialDefects, initialQualitative, onSave }: QuickDefectPopoverProps) {
  const { config } = useConfig();
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [defectCounts, setDefectCounts] = useState<Record<string, number>>(initialDefects || {});
  const [qualitativeStates, setQualitativeStates] = useState<Record<string, any>>(initialQualitative || {});

  if (!isOpen) return null;

  const handleIncrement = (defectId: string) => {
    setDefectCounts(prev => ({ ...prev, [defectId]: (prev[defectId] || 0) + 1 }));
  };

  const handleDecrement = (defectId: string) => {
    setDefectCounts(prev => {
      const current = prev[defectId] || 0;
      if (current <= 0) return prev;
      return { ...prev, [defectId]: current - 1 };
    });
  };

  const setQualState = (defectId: string, state: any) => {
    setQualitativeStates(prev => ({ ...prev, [defectId]: state }));
  };

  const activeCategory = config?.aqlCategories?.find((c: any) => c.id === activeCategoryId) || config?.aqlCategories?.[0] || {};
  const activeDefects = config?.defectDefinitions?.filter((d: any) => d.categoryId === activeCategory?.id) || [];
  const isQualitativeCategory = activeCategory?.aql === 'PASS/FAIL/NIL';

  const handleSave = () => {
    onSave(rowId, defectCounts, qualitativeStates);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-canvas border border-gray-800 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-surface">
          <div>
             <h3 className="text-lg font-bold uppercase tracking-wide text-primary flex items-center gap-2">
               <ShieldAlert className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
               QUICK DEFECT ENTRY <span className="text-muted font-mono font-normal">| SEQ {sequenceNo}</span>
             </h3>
          </div>
          <button onClick={onClose} className="p-2 text-muted hover:text-white rounded-lg hover:bg-gray-800 transition-colors outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-2 p-4 border-b border-gray-800 bg-canvas scrollbar-hide">
          {config?.aqlCategories?.map((cat: any) => {
            const isActive = (activeCategoryId || config?.aqlCategories?.[0]?.id) === cat.id;
            return (
              <button
                 key={cat.id}
                 onClick={() => setActiveCategoryId(cat.id)}
                 className={`h-10 px-5 whitespace-nowrap rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none border cursor-pointer shrink-0 ${
                   isActive ? 'bg-brand-primary text-white border-brand-secondary shadow-lg shadow-brand-primary/20' : 'bg-canvas text-muted border-gray-800 hover:text-primary hover:bg-surface shadow-inner'
                 }`}
               >
                 <span>{cat.name}</span>
               </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto bg-surface flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeDefects.map((defect: any) => {
              const displayId = getDisplayId(defect);

              if (isQualitativeCategory) {
                const state = qualitativeStates[defect.id] || 'NIL';
                return (
                  <div key={defect.id} className="bg-canvas border border-gray-700/50 rounded-lg p-3 shadow-sm flex flex-col justify-between">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-primary truncate">{defect.name}</span>
                      <span className="font-mono text-[10px] text-muted uppercase tracking-widest shrink-0">ID: {displayId}</span>
                    </div>
                    <div className="inline-flex bg-surface p-1 rounded-lg border border-gray-800 items-center gap-1 w-full justify-between shadow-inner">
                      <button onClick={() => setQualState(defect.id, 'PASS')} className={`flex-1 h-8 flex items-center justify-center rounded-md text-xs font-bold uppercase tracking-wider transition-all outline-none ${state === 'PASS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-sm' : 'text-muted hover:text-primary hover:bg-surface/50 border border-transparent'}`}>PASS</button>
                      <button onClick={() => setQualState(defect.id, 'FAIL')} className={`flex-1 h-8 flex items-center justify-center rounded-md text-xs font-bold uppercase tracking-wider transition-all outline-none ${state === 'FAIL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 shadow-sm' : 'text-muted hover:text-primary hover:bg-surface/50 border border-transparent'}`}>FAIL</button>
                      <button onClick={() => setQualState(defect.id, 'NIL')} className={`flex-1 h-8 flex items-center justify-center rounded-md text-xs font-bold uppercase tracking-wider transition-all outline-none ${state === 'NIL' ? 'bg-gray-700/40 text-gray-300 border border-gray-600 shadow-sm' : 'text-muted hover:text-primary hover:bg-surface/50 border border-transparent'}`}>NIL</button>
                    </div>
                  </div>
                );
              }

              const count = defectCounts[defect.id] || 0;
              return (
                <div key={defect.id} className="bg-canvas border border-gray-700/50 rounded-lg p-3 shadow-sm flex flex-col justify-between hover:border-gray-700 transition-colors">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-primary truncate">{defect.name}</span>
                    <span className="font-mono text-[10px] text-muted uppercase tracking-widest shrink-0">ID: {displayId}</span>
                  </div>
                  <div className="flex items-center justify-between bg-surface rounded-lg p-1 border border-gray-800 shadow-inner">
                    <motion.button whileTap={{ scale: 0.92 }} onClick={() => handleDecrement(defect.id)} disabled={count === 0} className="w-8 h-8 shrink-0 flex items-center justify-center bg-canvas border border-gray-700 rounded-md text-muted hover:text-rose-400 hover:border-rose-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors outline-none">
                      <Minus className="w-4 h-4" strokeWidth={2.5} />
                    </motion.button>
                    <div className="flex-1 flex justify-center">
                      <span className={`text-2xl font-mono font-bold ${count > 0 ? 'text-brand-secondary' : 'text-gray-500'}`}>{count.toString().padStart(2, '0')}</span>
                    </div>
                    <motion.button whileTap={{ scale: 0.92 }} onClick={() => handleIncrement(defect.id)} className="w-8 h-8 shrink-0 flex items-center justify-center bg-canvas border border-gray-700 rounded-md text-brand-secondary hover:bg-brand-primary/20 hover:border-brand-secondary transition-colors outline-none shadow-[0_0_10px_rgba(8,200,205,0.1)]">
                      <Plus className="w-4 h-4" strokeWidth={2.5} />
                    </motion.button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-canvas flex justify-end">
          <button onClick={handleSave} className="h-10 px-6 rounded-lg bg-accent-gradient text-white font-semibold text-xs uppercase tracking-wider shadow-md hover:brightness-110 flex items-center gap-2 outline-none">
            CONFIRM DEFECTS
          </button>
        </div>

      </div>
    </div>
  );
}

