import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Plus, Minus, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';

// Mock Defect Definitions
const DEFECT_DEFINITIONS = [
  { id: 'd1', name: 'Hole at Crotch', categoryId: 'c1' },
  { id: 'd2', name: 'Torn Cuff', categoryId: 'c1' },
  { id: 'd3', name: 'Weak Spot', categoryId: 'c2' },
  { id: 'd4', name: 'Embedded Particle', categoryId: 'c2' },
  { id: 'd5', name: 'Oil Stain', categoryId: 'c3' },
  { id: 'd6', name: 'Discoloration', categoryId: 'c3' },
  { id: 'd7', name: 'Uneven Texture', categoryId: 'c4' },
  { id: 'd8', name: 'Slight Color Variation', categoryId: 'c4' },
  { id: 'd9', name: 'Packaging Dent', categoryId: 'c4' },
];

interface StepDefectCounterProps {
  inspectionData: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function StepDefectCounter({ inspectionData, onNext, onBack }: StepDefectCounterProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<string>('c1');
  const [counts, setCounts] = useState<Record<string, number>>({});

  const thresholds = inspectionData.thresholds || [];

  const handleIncrement = (defectId: string) => {
    setCounts(prev => ({ ...prev, [defectId]: (prev[defectId] || 0) + 1 }));
  };

  const handleDecrement = (defectId: string) => {
    setCounts(prev => ({ ...prev, [defectId]: Math.max(0, (prev[defectId] || 0) - 1) }));
  };

  const activeDefects = useMemo(() => {
    return DEFECT_DEFINITIONS.filter(d => d.categoryId === activeCategoryId);
  }, [activeCategoryId]);

  const activeThreshold = useMemo(() => {
    return thresholds.find((t: any) => t.id === activeCategoryId) || { ac: 0, re: 1, name: 'Unknown' };
  }, [activeCategoryId, thresholds]);

  const categoryTotal = useMemo(() => {
    return activeDefects.reduce((sum, def) => sum + (counts[def.id] || 0), 0);
  }, [counts, activeDefects]);

  const isFailingCategory = categoryTotal >= activeThreshold.re;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({
      defects: counts,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
        {thresholds.map((cat: any) => {
          const isActive = cat.id === activeCategoryId;
          const catTotal = DEFECT_DEFINITIONS
            .filter(d => d.categoryId === cat.id)
            .reduce((sum, d) => sum + (counts[d.id] || 0), 0);
          
          const isFailing = catTotal >= cat.re;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategoryId(cat.id)}
              className={`flex-shrink-0 relative px-6 py-4 rounded-xl font-bold tracking-wide transition-all ${
                isActive 
                  ? 'bg-surface border-2 border-brand-primary text-primary shadow-lg shadow-brand-primary/10' 
                  : 'bg-canvas border border-gray-800 text-muted hover:bg-surface/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span>{cat.name}</span>
                {catTotal > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-mono ${
                    isFailing ? 'bg-red-500/20 text-red-400' : 'bg-brand-primary/20 text-brand-secondary'
                  }`}>
                    {catTotal}
                  </span>
                )}
                {isFailing && <AlertCircle className="w-4 h-4 text-red-500" />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-surface border border-gray-800 rounded-xl p-6 min-h-[400px] flex flex-col">
        {/* Category Header & Progress */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-bold text-primary">{activeThreshold.name}</h2>
            <p className="text-sm font-mono text-muted mt-1">
              Limit: AC {activeThreshold.ac} / RE {activeThreshold.re}
            </p>
          </div>
          <div className="text-right">
            <span className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Total Found</span>
            <div className="flex items-center justify-end gap-2 mt-1">
              {isFailingCategory ? (
                <XCircle className="w-8 h-8 text-red-500 animate-pulse" />
              ) : (
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              )}
              <span className={`text-4xl font-mono font-bold ${isFailingCategory ? 'text-red-500' : 'text-primary'}`}>
                {categoryTotal}
              </span>
            </div>
          </div>
        </div>

        {/* Defect Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
          <AnimatePresence mode="popLayout">
            {activeDefects.map(defect => {
              const count = counts[defect.id] || 0;
              return (
                <motion.div
                  key={defect.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-canvas border border-gray-700 rounded-xl p-4 flex flex-col justify-between"
                >
                  <h3 className="font-semibold text-primary mb-4 truncate" title={defect.name}>
                    {defect.name}
                  </h3>
                  
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleDecrement(defect.id)}
                      disabled={count === 0}
                      className="w-12 h-12 rounded-lg bg-surface border border-gray-700 flex items-center justify-center text-muted disabled:opacity-50 active:scale-95 transition-transform"
                    >
                      <Minus className="w-6 h-6" />
                    </button>
                    
                    <span className="text-3xl font-mono font-bold text-white px-4">
                      {count}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleIncrement(defect.id)}
                      className="w-16 h-16 rounded-xl bg-brand-primary text-canvas flex items-center justify-center shadow-lg shadow-brand-primary/20 active:scale-90 transition-transform"
                    >
                      <Plus className="w-8 h-8 stroke-[3]" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t border-gray-800">
        <Button type="button" variant="secondary" onClick={onBack} className="px-8">
          BACK
        </Button>
        <Button type="submit" size="lg" className="px-12 flex items-center gap-2">
          REVIEW & SUBMIT
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </form>
  );
}
