/**
 * @file ConfigPage.tsx
 * @description Phase 3: Configuration Control Engine
 *
 * Implements the 3-submenu architecture:
 * 1. Factory & Line Setup
 * 2. Product Engine
 * 3. Quality Rules
 *
 * Includes the Submenu-Level Save Action Bar, 'Unsaved Changes' dirty indicator,
 * and a navigation guard to prevent accidental data loss.
 *
 * Strict Compliance with UI_DESIGN_SYSTEM.md.
 */

import { useState, useMemo } from 'react';

const isDeepEqual = (obj1: any, obj2: any): boolean => {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 == null || obj2 == null) return false;
  
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    for (let i = 0; i < obj1.length; i++) {
      if (!isDeepEqual(obj1[i], obj2[i])) return false;
    }
    return true;
  }
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!keys2.includes(key) || !isDeepEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
};
import { useConfig, API_BASE_URL } from '../context/ConfigContext';
import { useAuth, authHeader } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { 
  Building2, 
  PackageSearch, 
  ShieldCheck, 
  RefreshCw, 
  AlertTriangle, 
  Save, 
  X,
  Check,
  RotateCcw
} from 'lucide-react';
import { FactorySetup } from './config/FactorySetup';
import { ProductEngine } from './config/ProductEngine';
import { QualityRules } from './config/QualityRules';

type ConfigTab = 'factory' | 'product' | 'quality';

export function ConfigPage() {
  const { config, isLoading, error, refreshConfig } = useConfig();
  const { user } = useAuth();
  const { addToast } = useToast();
  
  const [activeTab, setActiveTab] = useState<ConfigTab>('factory');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // ── Dirty State Management & Navigation Guard ─────────────────────────────
  // In a real app, this state would be lifted from the active child component,
  // or managed via a Context.
  const [draftConfig, setDraftConfig] = useState<any>({});
  
  const isDirty = useMemo(() => {
    if (!config || Object.keys(draftConfig).length === 0) return false;
    for (const key in draftConfig) {
      if (!isDeepEqual((config as any)[key], draftConfig[key])) {
        return true;
      }
    }
    return false;
  }, [config, draftConfig]);
  
  // Holds the intended target tab if user tries to navigate away while dirty
  const [pendingTab, setPendingTab] = useState<ConfigTab | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshConfig();
      addToast('success', 'Configuration re-hydrated from server');
    } catch {
      addToast('error', 'Failed to refresh configuration');
    } finally {
      setIsRefreshing(false);
    }
  };

  const attemptNavigation = (targetTab: ConfigTab) => {
    if (activeTab === targetTab) return;
    
    if (isDirty) {
      setPendingTab(targetTab);
    } else {
      setActiveTab(targetTab);
    }
  };

  const confirmNavigation = () => {
    if (pendingTab) {
      setActiveTab(pendingTab);
      setDraftConfig({}); // Discard changes
      setPendingTab(null);
    }
  };

  const cancelNavigation = () => {
    setPendingTab(null);
  };

  const handleConfirmDiscard = () => {
    setDraftConfig({});
    refreshConfig();
    setShowDiscardConfirm(false);
    addToast('info', 'All unsaved configuration changes discarded.');
  };

  const handleSave = async () => {
    try {
      // Persist to backend. Deliberately no optimistic update here — a
      // rejected save (e.g. deleting a product code still referenced by a
      // submission, HTTP 409) must never make the UI look like it succeeded.
      const response = await fetch(`${API_BASE_URL}/api/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body: JSON.stringify(draftConfig)
      });

      if (!response.ok) {
        let message = 'Failed to save configuration. Please try again.';
        try {
          const errBody = await response.json();
          if (typeof errBody?.error === 'string') {
            message = errBody.error;
            if (Array.isArray(errBody.lockedProductCodes) && errBody.lockedProductCodes.length > 0) {
              const detail = errBody.lockedProductCodes
                .map((l: { productCode: string; submissionCount: number }) =>
                  `${l.productCode} (${l.submissionCount} submission${l.submissionCount === 1 ? '' : 's'})`)
                .join(', ');
              message = `${message}: ${detail}`;
            }
          }
        } catch {
          // Response body wasn't JSON — fall back to the generic message.
        }
        throw new Error(message);
      }

      // Re-sync from server to ensure full consistency
      await refreshConfig();

      addToast('success', 'Configuration changes saved successfully.');
      setDraftConfig({}); // Clear pending drafts
    } catch (err) {
      console.error(err);
      addToast('error', err instanceof Error ? err.message : 'Failed to save configuration. Please try again.');
    }
  };

  const handleFactoryChange = (data: any) => {
    setDraftConfig((prev: any) => ({ ...prev, ...data }));
  };

  // Mock function to simulate user making edits
  const simulateEdit = () => {
    setDraftConfig({ ...draftConfig, _mockDirty: Date.now() });
    addToast('info', 'Edit detected. You have unsaved changes.');
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-canvas text-primary relative">
      
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">
            CONFIGURATION CONTROL
          </h1>
          <p className="text-xs font-normal text-muted mt-1">
            Master settings for Factory Infrastructure, Product Catalog, and ISO 2859-1 Rules.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={isLoading || isRefreshing}
            className="h-10 px-4 rounded-lg bg-surface text-muted hover:text-primary hover:bg-surface-light border border-gray-800 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
            <span>RE-SYNC</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" strokeWidth={2} />
          <div className="flex-1">
            <span className="font-semibold uppercase tracking-wider text-xs block">SERVER CONNECTION ERROR</span>
            <span className="text-xs text-rose-300/80">{error}</span>
          </div>
          <button onClick={handleManualRefresh} className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-semibold uppercase tracking-wide transition-colors">
            RETRY
          </button>
        </div>
      )}

      {/* ── 3-Submenu Architecture (UI_DESIGN_SYSTEM.md §2.1) ─────────────── */}
      <div className="flex overflow-x-auto items-center gap-0 border-b border-gray-800 pb-0 scrollbar-hide">
        <button
          onClick={() => attemptNavigation('factory')}
          className={`h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg text-xs font-bold uppercase tracking-wider transition-all outline-none shrink-0 ${
            activeTab === 'factory'
              ? 'bg-brand-primary text-white shadow-md'
              : 'bg-surface text-muted hover:text-primary hover:bg-surface-light'
          }`}
        >
          <Building2 className="w-4 h-4" strokeWidth={2} />
          <span>FACTORY & LINE SETUP</span>
        </button>

        <button
          onClick={() => attemptNavigation('product')}
          className={`h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg text-xs font-bold uppercase tracking-wider transition-all outline-none shrink-0 ${
            activeTab === 'product'
              ? 'bg-brand-primary text-white shadow-md'
              : 'bg-surface text-muted hover:text-primary hover:bg-surface-light'
          }`}
        >
          <PackageSearch className="w-4 h-4" strokeWidth={2} />
          <span>PRODUCT ENGINE</span>
        </button>

        <button
          onClick={() => attemptNavigation('quality')}
          className={`h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg text-xs font-bold uppercase tracking-wider transition-all outline-none shrink-0 ${
            activeTab === 'quality'
              ? 'bg-brand-primary text-white shadow-md'
              : 'bg-surface text-muted hover:text-primary hover:bg-surface-light'
          }`}
        >
          <ShieldCheck className="w-4 h-4" strokeWidth={2} />
          <span>QUALITY RULES</span>
        </button>
      </div>

      {/* ── Submenu-Level Save Action Bar ─────────────────────────────────────── */}
      <div className={`sticky top-0 z-40 flex items-center justify-between px-6 h-14 rounded-xl border transition-all duration-300 ${
        isDirty ? 'bg-amber-500/10 border-amber-500/30 backdrop-blur-sm' : 'bg-surface/95 border-gray-800/80 backdrop-blur-sm'
      }`}>
        <div className="flex items-center gap-3">
          {isDirty ? (
            <>
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400">UNSAVED CHANGES</span>
            </>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">ALL CHANGES SAVED</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <button
              onClick={() => setShowDiscardConfirm(true)}
              className="h-10 px-5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={2} />
              <span>DISCARD CHANGES</span>
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={!isDirty}
            className={`h-10 px-8 rounded-lg font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none ${
              isDirty 
                ? 'bg-accent-gradient text-white shadow-lg shadow-brand-primary/20 hover:brightness-110'
                : 'bg-canvas text-gray-600 border border-gray-800 cursor-not-allowed opacity-50'
            }`}
          >
            <Save className="w-4 h-4" strokeWidth={2} />
            <span>SAVE CONFIGURATION</span>
          </button>
        </div>
      </div>

      {/* ── Tab Content Area (Placeholders for Steps 11-13) ────────────────── */}
      {isLoading ? (
        <div className="h-64 rounded-xl bg-surface border border-gray-800/80 flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-brand-secondary animate-spin" strokeWidth={2} />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted font-mono">
              HYDRATING SYSTEM CONFIGURATION...
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-gray-800 rounded-xl p-4 min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden">
          
          {/* Developer Tool: Mock Edit Button to test Dirty state */}
          <button onClick={simulateEdit} className="absolute top-4 right-4 text-[10px] uppercase font-mono text-muted hover:text-brand-secondary underline">
            [Dev Tool: Trigger Unsaved Edits]
          </button>

          <div className={activeTab === 'factory' ? "w-full" : "hidden"}>
            <FactorySetup onDirty={() => {}} onChange={handleFactoryChange} />
          </div>

          <div className={activeTab === 'product' ? "w-full" : "hidden"}>
            <ProductEngine onDirty={() => {}} onChange={handleFactoryChange} />
          </div>

          <div className={activeTab === 'quality' ? "w-full" : "hidden"}>
            <QualityRules onDirty={() => {}} onChange={handleFactoryChange} />
          </div>
        </div>
      )}

      {/* ── Navigation Guard Confirmation Modal ────────────────────────────── */}
      {pendingTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-canvas border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            
            <div className="flex items-start gap-4 p-4 border-b border-gray-800">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-lg font-bold uppercase tracking-wide text-primary mb-1">
                  UNSAVED CHANGES DETECTED
                </h3>
                <p className="text-sm text-muted">
                  You have unsaved edits in the <span className="font-bold text-white uppercase">{activeTab}</span> configuration. If you navigate to another section now, these changes will be permanently discarded.
                </p>
              </div>
            </div>

            <div className="p-4 bg-surface flex items-center justify-end gap-3">
              <button
                onClick={cancelNavigation}
                className="h-10 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
              >
                <X className="w-4 h-4" strokeWidth={2} />
                <span>RETURN TO EDITS</span>
              </button>
              <button
                onClick={confirmNavigation}
                className="h-10 px-5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none border border-rose-500/50 shadow-sm"
              >
                <Check className="w-4 h-4" strokeWidth={2} />
                <span>DISCARD CHANGES</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Discard Confirmation Modal ────────────────────────────────────── */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-canvas border border-gray-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="flex items-start gap-4 p-4 border-b border-gray-800">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-400" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-lg font-bold uppercase tracking-wide text-primary mb-1">
                  DISCARD CONFIGURATION?
                </h3>
                <p className="text-sm text-muted">
                  Are you sure you want to discard all unsaved edits in the <span className="font-bold text-white uppercase">{activeTab}</span> configuration? All unsaved modifications will be reverted.
                </p>
              </div>
            </div>

            <div className="p-4 bg-surface flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="h-10 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
              >
                <X className="w-4 h-4" strokeWidth={2} />
                <span>KEEP EDITING</span>
              </button>
              <button
                onClick={handleConfirmDiscard}
                className="h-10 px-5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none border border-rose-500/50 shadow-sm"
              >
                <RotateCcw className="w-4 h-4" strokeWidth={2} />
                <span>CONFIRM DISCARD</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
