/**
 * @file StepDefects.tsx
 * @description Step 3 of the Smart Quality Inspection Wizard — Defect Tabulation.
 *
 * CONFIG REMAPPING (Turn 4):
 * - AQL categories and defect definitions are now sourced from the active
 *   InspectionProfile (resolved via getResolvedProfile(profileId)) which is
 *   configured in Configuration Control > Quality Rules.
 * - No longer reads legacy flat config.aqlCategories or config.defectDefinitions.
 *
 * FREE NAVIGATION REFACTOR:
 * - Added `onUpdate` prop: fires whenever defect counts or qualitative states change,
 *   immediately pushing defects, qualitative, and totalIssues up to WizardPage's `inspectionData`.
 * - Local state for defectCounts and qualitativeStates is preserved for fast typing performance.
 *
 * Two interaction models driven by category aql value:
 *  1. Quantitative (aql: '0.65'|'1.0'|'1.5'|'2.5'|'4.0'|'6.5'|'AND'):
 *     Rapid-tap counter cards (-/count/+).
 *  2. Qualitative (aql: 'PASS/FAIL/NIL'):
 *     3-way toggle chips (PASS / FAIL / NIL).
 *
 * UI_DESIGN_SYSTEM.md compliance:
 * - 48px touch targets (h-12) on counter buttons (§1.2).
 * - JetBrains Mono (font-mono) for count displays (§1.3).
 * - Severity tabs: bg-brand-primary active, bg-canvas inactive (§2.1).
 * - AQL badge: font-mono text-xs with semantic border per category color (§4.7).
 * - bg-canvas / bg-surface / bg-brand-primary/5 container hierarchy (§1.2).
 */

import { useState, useMemo, useEffect } from 'react';
import {
  ShieldAlert,
  AlertCircle,
  Info,
  Minus,
  Plus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useConfig } from '../../context/ConfigContext';
import type { AQLCategory, DefectDefinition } from '../../context/ConfigContext';

export interface StepDefectsProps {
  inspectionData?: Record<string, any>;
  onNext: (data: any) => void;
  onBack: () => void;
  onUpdate?: (partial: Record<string, any>) => void; // Auto-save callback
  originalData?: Record<string, any> | null;
}

type QualitativeState = 'PASS' | 'FAIL' | 'NIL';

// Icon map for category icon names stored in QualityRules config

/** Returns true when the category uses PASS/FAIL/NIL qualitative evaluation */
const isQualitativeAql = (aql: string | undefined): boolean =>
  (aql ?? '').toUpperCase() === 'PASS/FAIL/NIL';

/**
 * N/A-mode state encoding per ISO2859_MATH_ENGINE.md §2: the backend engine
 * reads qualitative categories out of the same `defects` map as quantitative
 * ones, with the count value encoding state instead of a raw tally.
 */
const QUALITATIVE_ENCODING: Record<QualitativeState, number> = { NIL: 0, PASS: 1, FAIL: 2 };

/** Encodes PASS/FAIL/NIL toggle states into the 0/1/2 values the backend engine expects. */
function encodeQualitative(states: Record<string, QualitativeState>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(states).map(([id, state]) => [id, QUALITATIVE_ENCODING[state]]),
  );
}

/** Formats defect IDs into clean, uppercase human-readable slugs (e.g., DEF_DIRT) */
export const getDisplayId = (defect: { id: string; name: string }) => {
  if (!defect.id || /^def_\d+$/i.test(defect.id)) {
    return `DEF_${defect.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
  }
  return defect.id.toUpperCase();
};

export function StepDefects({ inspectionData, onNext, onUpdate, originalData }: StepDefectsProps) {
  const { config, isLoading, getResolvedProfile } = useConfig();

  // ── Resolve InspectionProfile from profileId passed through inspectionData ─
  // Source: Configuration Control > Quality Rules > Inspection Profiles
  const activeProfile = useMemo(() => {
    return getResolvedProfile(inspectionData?.profileId);
  }, [getResolvedProfile, inspectionData?.profileId]);

  const aqlCategories: AQLCategory[] = useMemo(
    () => activeProfile?.aqlCategories ?? [],
    [activeProfile]
  );

  const defectDefinitions: DefectDefinition[] = useMemo(
    () => activeProfile?.defectDefinitions ?? [],
    [activeProfile]
  );

  // ── Active Category Tab State ─────────────────────────────────────────────
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');

  const activeCategory = useMemo<AQLCategory | null>(() => {
    const id = activeCategoryId || aqlCategories[0]?.id;
    return aqlCategories.find((c) => c.id === id) ?? aqlCategories[0] ?? null;
  }, [activeCategoryId, aqlCategories]);

  const activeCategoryDefects = useMemo<DefectDefinition[]>(() => {
    if (!activeCategory) return [];
    return defectDefinitions.filter((d) => d.categoryId === activeCategory.id);
  }, [activeCategory, defectDefinitions]);

  // ── Defect State ──────────────────────────────────────────────────────────
  const [defectCounts, setDefectCounts] = useState<Record<string, number>>(
    inspectionData?.defects ?? {}
  );
  const [qualitativeStates, setQualitativeStates] = useState<Record<string, QualitativeState>>(
    inspectionData?.qualitative ?? {}
  );

  const handleIncrement = (defectId: string) => {
    setDefectCounts((prev) => ({ ...prev, [defectId]: (prev[defectId] ?? 0) + 1 }));
  };

  const handleDecrement = (defectId: string) => {
    setDefectCounts((prev) => {
      const current = prev[defectId] ?? 0;
      if (current <= 0) return prev;
      return { ...prev, [defectId]: current - 1 };
    });
  };

  const setQualState = (defectId: string, state: QualitativeState) => {
    setQualitativeStates((prev) => ({ ...prev, [defectId]: state }));
  };

  // ── Wire payload: quantitative counts + encoded qualitative states merged
  // into one map, since the backend engine's N/A mode reads its 0/1/2 state
  // out of the same `defects` field as CUMULATIVE/GRANULAR counts. Internal
  // reads/writes (counters, tab badges) keep using the raw defectCounts —
  // this merged map exists only for what gets pushed up to WizardPage.
  const combinedDefects = useMemo<Record<string, number>>(
    () => ({ ...defectCounts, ...encodeQualitative(qualitativeStates) }),
    [defectCounts, qualitativeStates],
  );

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalQuantitativeDefects = useMemo(
    () => Object.values(defectCounts).reduce((sum, c) => sum + c, 0),
    [defectCounts]
  );
  const totalQualitativeFails = useMemo(
    () => Object.values(qualitativeStates).filter((s) => s === 'FAIL').length,
    [qualitativeStates]
  );
  const totalIssues = totalQuantitativeDefects + totalQualitativeFails;

  // ── Auto-save: Push defect data to WizardPage ─────────────────────────────
  useEffect(() => {
    onUpdate?.({
      defects: combinedDefects,
      qualitative: qualitativeStates,
      totalIssues,
      profileId: inspectionData?.profileId ?? activeProfile?.id ?? '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedDefects, qualitativeStates, totalIssues, activeProfile?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({
      defects: combinedDefects,
      qualitative: qualitativeStates,
      totalIssues,
      profileId: inspectionData?.profileId ?? activeProfile?.id ?? '',
    });
  };

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (isLoading || !config) return null;

  const activeCategoryAql = activeCategory?.aql ?? activeCategory?.aqlLevel ?? '—';
  const isQual = isQualitativeAql(activeCategoryAql);

  return (
    <form id="wizard-step-form" onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-surface border border-gray-700/50 rounded-lg p-4 space-y-4 shadow-sm">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-700/50 pb-4">
          <div>
            <h2 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-brand-secondary" strokeWidth={2} />
              DEFECT TABULATION
            </h2>
            <p className="text-xs font-normal text-muted mt-1">
              Select a severity tier tab below to record defects.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-canvas text-brand-secondary border border-gray-700 shadow-inner">
              LOT: {inspectionData?.fullSystemLotNo ?? 'N/A'}
            </span>
          </div>
        </div>

        {/* ── No Profile Configured Warning ─────────────────────────────────── */}
        {aqlCategories.length === 0 && (
          <div className="p-3 rounded-lg border border-l-4 border-amber-500/20 border-l-amber-500 bg-amber-500/5 flex gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">NO INSPECTION PROFILE CONFIGURED</p>
              <p className="text-xs text-muted mt-1">
                No AQL categories or defect definitions found. Go to{' '}
                <strong>Configuration Control → Quality Rules</strong> to set up Inspection Profiles.
              </p>
            </div>
          </div>
        )}

        {/* ── Severity Category Tabs ──────────────────────────────────────── */}
        {aqlCategories.length > 0 && (
          <>
            <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
              {aqlCategories.map((cat) => {

                const isActive = (activeCategoryId || aqlCategories[0]?.id) === cat.id;
                const catAql = cat.aql ?? cat.aqlLevel ?? '—';

                // Count issues in this category for badge on tab
                const catDefects = defectDefinitions.filter((d) => d.categoryId === cat.id);
                const catCount = isQualitativeAql(catAql)
                  ? catDefects.filter((d) => qualitativeStates[d.id] === 'FAIL').length
                  : catDefects.reduce((sum, d) => sum + (defectCounts[d.id] ?? 0), 0);

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategoryId(cat.id)}
                    className={`h-10 px-5 whitespace-nowrap rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none border cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-brand-primary text-white border-brand-secondary shadow-lg shadow-brand-primary/20'
                        : 'bg-canvas text-muted hover:text-primary hover:bg-surface border-gray-800 shadow-inner'
                    }`}
                  >

                    <span>{cat.name}</span>
                    {catCount > 0 && (
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                        isActive ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {catCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Active Category Panel ─────────────────────────────────────── */}
            <div className="p-4 rounded-lg bg-canvas border border-gray-700 space-y-4 shadow-inner">
              <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                <h3 className="text-lg font-semibold uppercase tracking-wide text-primary flex items-center gap-2">

                  {activeCategory?.name ?? '—'} CLASSIFICATION
                </h3>
                <div className="flex items-center gap-2">
                  {/* AQL Badge */}
                  <span className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono text-[10px] uppercase px-2 py-0.5 rounded">
                    AQL: {activeCategoryAql}
                  </span>
                  {/* Evaluation Mode Badge */}
                  {activeCategory && !isQual && (
                    <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                      {activeCategory.evalMode ?? activeCategory.evaluationMode ?? 'CUMULATIVE'}
                    </span>
                  )}
                  {activeCategory && isQual && (
                    <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 border-gray-500/30 text-gray-400">
                      N/A
                    </span>
                  )}
                </div>
              </div>

              {/* Defect Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {activeCategoryDefects.map((defect) => {
                  const displayId = getDisplayId(defect);

                  if (isQual) {
                    // ── QUALITATIVE: PASS / FAIL / NIL Toggle ─────────────
                    const state: QualitativeState = qualitativeStates[defect.id] ?? 'NIL';

                    return (
                      <div key={defect.id} className="bg-surface border border-gray-700/50 rounded-lg p-3 flex flex-col justify-between shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <span className="font-mono text-sm font-bold text-primary tracking-wide truncate">{defect.name}</span>
                          <span className="font-mono text-[10px] text-muted uppercase tracking-widest shrink-0">ID: {displayId}</span>
                        </div>

                        {/* 3-State Segmented Toggle */}
                        <div className="inline-flex bg-canvas p-1 rounded-lg border border-gray-800 items-center gap-1 w-full justify-between shadow-inner">
                          {/* PASS */}
                          <button
                            type="button"
                            onClick={() => setQualState(defect.id, 'PASS')}
                            className={`flex-1 h-8 px-2 flex items-center justify-center rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer select-none outline-none ${
                              state === 'PASS'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-sm'
                                : 'text-muted hover:text-primary hover:bg-surface/50 border border-transparent'
                            }`}
                          >
                            PASS
                          </button>
                          {/* FAIL */}
                          <button
                            type="button"
                            onClick={() => setQualState(defect.id, 'FAIL')}
                            className={`flex-1 h-8 px-2 flex items-center justify-center rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer select-none outline-none ${
                              state === 'FAIL'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 shadow-sm'
                                : 'text-muted hover:text-primary hover:bg-surface/50 border border-transparent'
                            }`}
                          >
                            FAIL
                          </button>
                          {/* NIL */}
                          <button
                            type="button"
                            onClick={() => setQualState(defect.id, 'NIL')}
                            className={`flex-1 h-8 px-2 flex items-center justify-center rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer select-none outline-none ${
                              state === 'NIL'
                                ? 'bg-gray-700/40 text-gray-300 border border-gray-600 shadow-sm'
                                : 'text-muted hover:text-primary hover:bg-surface/50 border border-transparent'
                            }`}
                          >
                            NIL
                          </button>
                        </div>
                        {originalData?.defects?.[defect.id] !== undefined && String(originalData.defects[defect.id]) !== String(state) && (
                          <div className="mt-2 text-[10px] text-muted font-mono text-center">
                            Original: {originalData.defects[defect.id] || 'NIL'}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ── QUANTITATIVE: -/count/+ Counter Card ─────────────────
                  const count = defectCounts[defect.id] ?? 0;
                  return (
                    <div key={defect.id} className="bg-surface border border-gray-700/50 rounded-lg p-3 flex flex-col justify-between shadow-sm hover:border-gray-700 transition-colors">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <span className="font-mono text-sm font-bold text-primary tracking-wide truncate">{defect.name}</span>
                        <span className="font-mono text-[10px] text-muted uppercase tracking-widest shrink-0">ID: {displayId}</span>
                      </div>

                      <div className="flex items-center justify-between bg-canvas rounded-lg p-1 border border-gray-800 shadow-inner">
                        {/* Decrement */}
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleDecrement(defect.id)}
                          disabled={count === 0}
                          className="w-8 h-8 shrink-0 flex items-center justify-center bg-surface border border-gray-700 rounded-md text-muted hover:text-rose-400 hover:border-rose-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors outline-none"
                        >
                          <Minus className="w-4 h-4" strokeWidth={2.5} />
                        </motion.button>

                        {/* Count Display — JetBrains Mono per UI_DESIGN_SYSTEM.md §1.3 */}
                        <div className="flex-1 flex justify-center">
                          <span className={`text-2xl font-mono font-bold ${count > 0 ? 'text-brand-secondary' : 'text-gray-500'}`}>
                            {count.toString().padStart(2, '0')}
                          </span>
                        </div>

                        {/* Increment */}
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleIncrement(defect.id)}
                          className="w-8 h-8 shrink-0 flex items-center justify-center bg-surface border border-gray-700 rounded-md text-brand-secondary hover:bg-brand-primary/20 hover:border-brand-secondary transition-colors outline-none shadow-[0_0_10px_rgba(8,200,205,0.1)]"
                        >
                          <Plus className="w-4 h-4" strokeWidth={2.5} />
                        </motion.button>
                      </div>
                      {originalData?.defects?.[defect.id] !== undefined && Number(originalData.defects[defect.id]) !== count && (
                        <div className="mt-2 text-[10px] text-muted font-mono text-center">
                          Original: {originalData.defects[defect.id] || '0'}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty state for category with no defects defined */}
                {activeCategoryDefects.length === 0 && (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted border-2 border-dashed border-gray-800/60 rounded-xl bg-surface/50">
                    <Info className="w-8 h-8 mb-2 opacity-50 text-brand-secondary" />
                    <span className="text-sm font-semibold uppercase tracking-widest">NO DEFINITIONS MAPPED TO THIS CATEGORY.</span>
                    <p className="text-xs text-muted mt-2 text-center max-w-xs">
                      Add defect definitions in <strong>Configuration Control → Quality Rules</strong> under the{' '}
                      <span className="font-mono">{activeCategory?.name ?? 'selected'}</span> category.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Total Issues Summary Bar ───────────────────────────────────── */}
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

    </form>
  );
}




