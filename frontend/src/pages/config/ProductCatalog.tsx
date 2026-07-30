/**
 * @file ProductCatalog.tsx
 * @description Product Catalog & Matrix Configuration Component.
 *
 * Unified grid for managing Factory Topology (Lines, Shifts), 
 * Glove Definitions (Sizes, AQL Sample Sizes), and SKU Builder Dictionaries.
 * Includes a Save Configuration action to persist changes via PATCH /api/config.
 *
 * Strict Compliance with UI_DESIGN_SYSTEM.md:
 *  - bg-surface for cards, border-gray-800 for borders.
 *  - text-lg font-semibold uppercase text-primary for sub-headers.
 *  - JetBrains Mono (font-mono) for all numeric values and sizes.
 */

import { useState, useEffect } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../components/ui/ToastProvider';
import { Activity, Clock, Scaling, Ruler, Tag, Beaker, Save, Loader2, Database } from 'lucide-react';
import type { LineOption, ShiftOption, SKUOption } from '../../context/ConfigContext';

// --- API Helper ---
const API_BASE_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:4009';

export function ProductCatalog() {
  const { config, isLoading, refreshConfig } = useConfig();
  const { addToast } = useToast();

  const [isSaving, setIsSaving] = useState(false);

  // Local state for edits - Factory Topology
  const [lines, setLines] = useState<LineOption[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);

  // Local state for edits - SKU Builder Dictionaries
  const [productCodes, setProductCodes] = useState<string[]>([]);
  const [skuMaterials, setSkuMaterials] = useState<SKUOption[]>([]);
  const [skuWeights, setSkuWeights] = useState<SKUOption[]>([]);
  const [skuColors, setSkuColors] = useState<SKUOption[]>([]);
  const [skuTreatments, setSkuTreatments] = useState<SKUOption[]>([]);
  const [skuLengths, setSkuLengths] = useState<SKUOption[]>([]);
  const [skuTextures, setSkuTextures] = useState<SKUOption[]>([]);

  // Initialize local state from global config
  useEffect(() => {
    if (config) {
      setLines(config.lines || []);
      setShifts(config.shifts || []);
      setSizes(config.sizes || []);
      
      setProductCodes(config.productCodes || []);
      setSkuMaterials(config.skuMaterials || []);
      setSkuWeights(config.skuWeights || []);
      setSkuColors(config.skuColors || []);
      setSkuTreatments(config.skuTreatments || []);
      setSkuLengths(config.skuLengths || []);
      setSkuTextures(config.skuTextures || []);
    }
  }, [config]);

  if (isLoading || !config) {
    return <div className="text-muted text-sm">Loading catalog matrices...</div>;
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        lines,
        shifts,
        sizes,
        productCodes,
        skuMaterials,
        skuWeights,
        skuColors,
        skuTreatments,
        skuLengths,
        skuTextures,
      };

      const response = await fetch(`${API_BASE_URL}/api/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      await refreshConfig();
      addToast('success', 'Product Catalog configuration saved successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ProductCatalog] Save failed:', message);
      addToast('error', `Failed to save configuration: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Helper renderer for SKUOption arrays
  const renderSkuOptions = (options: SKUOption[]) => (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <div 
          key={opt.value} 
          className="bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-2"
        >
          <span className="font-mono text-white/50">{opt.value}</span>
          <span>{opt.label}</span>
        </div>
      ))}
      {options.length === 0 && <span className="text-muted text-xs italic">No entries configured</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Factory Topology Matrix ────────────────────────────────────────── */}
      <h2 className="text-xl font-bold uppercase text-primary tracking-wide border-b border-gray-800 pb-2">
        Factory Topology
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Factory Lines */}
        <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-gray-800/60 pb-3">
            <Activity className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            <h3 className="text-lg font-semibold uppercase text-primary tracking-wide">
              FACTORY LINES
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {lines.map((line) => (
              <div 
                key={line.id} 
                className="bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-2"
              >
                <span className="font-mono text-white/50">{line.id}</span>
                <span>{line.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Factory Shifts */}
        <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-gray-800/60 pb-3">
            <Clock className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            <h3 className="text-lg font-semibold uppercase text-primary tracking-wide">
              FACTORY SHIFTS
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {shifts.map((shift) => (
              <div 
                key={shift.id} 
                className="bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-2"
              >
                <span className="font-mono text-white/50">{shift.id}</span>
                <span>{shift.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Supported Sizes */}
        <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-gray-800/60 pb-3">
            <Scaling className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            <h3 className="text-lg font-semibold uppercase text-primary tracking-wide">
              SUPPORTED SIZES
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((size) => (
              <div 
                key={size} 
                className="bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 text-xs font-semibold rounded-lg px-3 py-2 font-mono"
              >
                {size}
              </div>
            ))}
          </div>
      </div>

      {/* ── SKU Builder Dictionaries ───────────────────────────────────────── */}
      <h2 className="text-xl font-bold uppercase text-primary tracking-wide border-b border-gray-800 pb-2 pt-4">
        SKU Builder Dictionaries
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Product Codes */}
        <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-gray-800/60 pb-3">
            <Database className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            <h3 className="text-lg font-semibold uppercase text-primary tracking-wide">
              PRODUCT CODES
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {productCodes.map((code) => (
              <div 
                key={code} 
                className="bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 text-xs font-semibold rounded-lg px-3 py-2 font-mono"
              >
                {code}
              </div>
            ))}
            {productCodes.length === 0 && <span className="text-muted text-xs italic">No entries configured</span>}
          </div>
        </div>

        {/* Materials */}
        <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-gray-800/60 pb-3">
            <Beaker className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            <h3 className="text-lg font-semibold uppercase text-primary tracking-wide">
              MATERIALS
            </h3>
          </div>
          {renderSkuOptions(skuMaterials)}
        </div>

        {/* Weights */}
        <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-gray-800/60 pb-3">
            <Tag className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            <h3 className="text-lg font-semibold uppercase text-primary tracking-wide">
              WEIGHTS
            </h3>
          </div>
          {renderSkuOptions(skuWeights)}
        </div>

        {/* Colors */}
        <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-gray-800/60 pb-3">
            <Tag className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            <h3 className="text-lg font-semibold uppercase text-primary tracking-wide">
              COLORS
            </h3>
          </div>
          {renderSkuOptions(skuColors)}
        </div>

        {/* Treatments */}
        <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-gray-800/60 pb-3">
            <Tag className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            <h3 className="text-lg font-semibold uppercase text-primary tracking-wide">
              TREATMENTS
            </h3>
          </div>
          {renderSkuOptions(skuTreatments)}
        </div>

        {/* Lengths & Textures */}
        <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-gray-800/60 pb-3">
            <Tag className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            <h3 className="text-lg font-semibold uppercase text-primary tracking-wide">
              LENGTHS & TEXTURES
            </h3>
          </div>
          <div className="space-y-4">
            <div>
              <h4 className="text-xs uppercase text-muted font-semibold mb-2 tracking-wider">Lengths</h4>
              {renderSkuOptions(skuLengths)}
            </div>
            <div>
              <h4 className="text-xs uppercase text-muted font-semibold mb-2 tracking-wider">Textures</h4>
              {renderSkuOptions(skuTextures)}
            </div>
          </div>
        </div>

      </div>
      
      {/* ── Save Action Bar ────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-6 border-t border-gray-800">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="h-12 px-6 rounded-lg bg-accent-gradient text-white font-semibold text-sm tracking-wide shadow-lg shadow-brand-primary/20 flex items-center gap-2 hover:brightness-110 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2} />
          ) : (
            <Save className="w-5 h-5" strokeWidth={2} />
          )}
          <span>SAVE CONFIGURATION</span>
        </button>
      </div> 
    </div>
  );
}
