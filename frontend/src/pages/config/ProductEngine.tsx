/**
 * @file ProductEngine.tsx
 * @description Phase 3: Configuration Control - Product Engine
 *
 * Provides interfaces to manage:
 * 1. SKU Dictionary Managers (Material, Weight, Color, Treatment, Length, Texture)
 * 2. Product Code Builder (SKU Concatenator)
 * 3. Active Product Catalog
 * 4. SKU Dimension Target Matrix (Min Spec + Tolerance)
 * 5. Target Glove Weight
 * 6. Glove Sizes & ISO Sample Sizes
 *
 * Communicates dirty state up to ConfigPage parent.
 */

import { useState } from 'react';
import { 
  Plus, 
  Trash, 
  Edit2,
  ArrowUp,
  ArrowDown,
  Box, 
  Ruler, 
  Scale,
  Check,
  X,
  Scaling,
  ListOrdered,
  ChevronDown,
  Layers
} from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';
import type { SKUOption } from '../../context/ConfigContext';
import { DictionaryManager } from './DictionaryManager';

interface ProductEngineProps {
  onDirty: () => void;
  onChange: (data: any) => void;
}

export function ProductEngine({ onDirty, onChange }: ProductEngineProps) {
  const { config } = useConfig();
  
  // ── Local State ─────────────────────────────────────────────────────────
  const [skuMaterials, setSkuMaterials] = useState<SKUOption[]>(config?.skuMaterials || [{value: 'N', label: 'Nitrile'}]);
  const [skuWeights, setSkuWeights] = useState<SKUOption[]>(config?.skuWeights || [{value: '025', label: '2.5g'}]);
  const [skuColors, setSkuColors] = useState<SKUOption[]>(config?.skuColors || [{value: 'SKB', label: 'Sky Blue'}]);
  const [skuTreatments, setSkuTreatments] = useState<SKUOption[]>(config?.skuTreatments || [{value: 'OC', label: 'Online Chlorinated'}]);
  const [skuLengths, setSkuLengths] = useState<SKUOption[]>(config?.skuLengths || [{value: '24', label: '24cm'}]);
  const [skuTextures, setSkuTextures] = useState<SKUOption[]>(config?.skuTextures || [{value: 'FT', label: 'Finger Textured'}]);

  const [productCodes, setProductCodes] = useState(config?.productCodes || []);
  const [productProfileMap, setProductProfileMap] = useState<Record<string, string>>(config?.productProfileMap || {});

  // SKU Builder Selections
  const [selMat, setSelMat] = useState('');
  const [selWgt, setSelWgt] = useState('');
  const [selCol, setSelCol] = useState('');
  const [selTrt, setSelTrt] = useState('');
  const [selLen, setSelLen] = useState('');
  const [selTex, setSelTex] = useState('');

  const defaultDimensions = [
    { id: 'length', name: 'Glove Length', minSpec: '240', tolerance: '5', unit: 'mm' },
    { id: 'palmWidth', name: 'Palm Width', minSpec: '95', tolerance: '5', unit: 'mm' },
    { id: 'thickBeading', name: 'Thickness (Beading)', minSpec: '0.050', tolerance: '0.010', unit: 'mm' },
    { id: 'thickCuff', name: 'Thickness (Cuff)', minSpec: '0.060', tolerance: '0.010', unit: 'mm' },
    { id: 'thickPalm', name: 'Thickness (Palm)', minSpec: '0.080', tolerance: '0.010', unit: 'mm' },
    { id: 'thickFinger', name: 'Thickness (Finger)', minSpec: '0.100', tolerance: '0.010', unit: 'mm' }
  ];

  const [dimensions, setDimensions] = useState(
    config?.dimensions && config.dimensions.length > 0 
      ? config.dimensions 
      : defaultDimensions
  );

  const [targetWeight, setTargetWeight] = useState(config?.targetWeight || { target: 3.50, tolerance: 0.20 });

  const [sizes, setSizes] = useState(config?.sizes || ['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  const [newSize, setNewSize] = useState('');
  const [editingSize, setEditingSize] = useState<string | null>(null);
  const [editSizeVal, setEditSizeVal] = useState('');
  const [isAddingSize, setIsAddingSize] = useState(false);

  const [sampleSizes, setSampleSizes] = useState(config?.sampleSizes || [13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250]);
  const [newSampleSize, setNewSampleSize] = useState('');
  const [editingSampleSize, setEditingSampleSize] = useState<number | null>(null);
  const [editSampleSizeVal, setEditSampleSizeVal] = useState('');
  const [isAddingSampleSize, setIsAddingSampleSize] = useState(false);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const triggerChange = (updates: any) => {
    onDirty();
    onChange({
      skuMaterials, skuWeights, skuColors, skuTreatments, skuLengths, skuTextures,
      productCodes, productProfileMap, dimensions, targetWeight, sizes, sampleSizes,
      ...updates
    });
  };

  const handleAddDict = (key: string, list: SKUOption[], setter: any, val: string, lbl: string) => {
    if (!list.find(o => o.value === val)) {
      const updated = [...list, { value: val, label: lbl }];
      setter(updated);
      triggerChange({ [key]: updated });
    }
  };

  const handleRemoveDict = (key: string, list: SKUOption[], setter: any, val: string) => {
    const updated = list.filter(o => o.value !== val);
    setter(updated);
    triggerChange({ [key]: updated });
  };

  const handleEditDict = (key: string, list: SKUOption[], setter: any, oldVal: string, newVal: string, newLbl: string) => {
    const updated = list.map(o => o.value === oldVal ? { value: newVal, label: newLbl } : o);
    setter(updated);
    triggerChange({ [key]: updated });
  };

  const handleMoveDict = (key: string, list: SKUOption[], setter: any, val: string, dir: 'up'|'down') => {
    const idx = list.findIndex(o => o.value === val);
    if (idx < 0) return;
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === list.length - 1) return;
    const updated = [...list];
    const temp = updated[idx];
    updated[idx] = updated[dir === 'up' ? idx - 1 : idx + 1];
    updated[dir === 'up' ? idx - 1 : idx + 1] = temp;
    setter(updated);
    triggerChange({ [key]: updated });
  };

  const derivedSKU = `${selMat}${selWgt}${selCol}-${selTrt}-${selLen}${selTex}`;
  const canBuildSKU = selMat && selWgt && selCol && selTrt && selLen && selTex;

  const handleAddProduct = () => {
    if (canBuildSKU && !productCodes.includes(derivedSKU)) {
      const updatedCodes = [...productCodes, derivedSKU];
      const updatedMap = { ...productProfileMap };
      const defaultProfile = config?.inspectionProfiles?.find((p: any) => p.isDefault) || config?.inspectionProfiles?.[0];
      if (defaultProfile) {
        updatedMap[derivedSKU] = defaultProfile.id;
        setProductProfileMap(updatedMap);
      }
      setProductCodes(updatedCodes);
      triggerChange({ productCodes: updatedCodes, productProfileMap: updatedMap });
      // Reset builder
      setSelMat(''); setSelWgt(''); setSelCol(''); setSelTrt(''); setSelLen(''); setSelTex('');
    }
  };

  const handleRemoveProduct = (code: string) => {
    const updatedCodes = productCodes.filter(c => c !== code);
    const updatedMap = { ...productProfileMap };
    delete updatedMap[code];
    setProductCodes(updatedCodes);
    setProductProfileMap(updatedMap);
    triggerChange({ productCodes: updatedCodes, productProfileMap: updatedMap });
  };

  const handleUpdateProfileMap = (code: string, profileId: string) => {
    const updatedMap = { ...productProfileMap, [code]: profileId };
    setProductProfileMap(updatedMap);
    triggerChange({ productProfileMap: updatedMap });
  };

  const handleUpdateDimension = (id: string, field: 'minSpec' | 'tolerance' | 'isZeroTolerance', value: any) => {
    let updated = dimensions.map(d => d.id === id ? { ...d, [field]: value } : d);
    
    if (field === 'isZeroTolerance' && value === true) {
      updated = updated.map(d => {
        if (d.id !== id) return d;
        const zeroStr = id.includes('thick') ? '0.000' : '0';
        return { ...d, tolerance: zeroStr };
      });
    }

    setDimensions(updated);
    triggerChange({ dimensions: updated });
  };

  const handleDimensionBlur = (id: string, field: 'minSpec' | 'tolerance') => {
    const updated = dimensions.map(d => {
      if (d.id !== id) return d;
      let val = parseFloat(d[field] as string) || 0;
      if (id === 'length') val = Math.min(999, Math.round(val));
      if (id === 'palmWidth') val = Math.min(99, Math.round(val));
      
      let formatted = val.toString();
      if (id.includes('thick')) {
        formatted = val.toFixed(3);
      } else {
        formatted = val.toFixed(0);
      }
      return { ...d, [field]: formatted };
    });
    setDimensions(updated);
    triggerChange({ dimensions: updated });
  };

  const handleUpdateWeight = (field: 'target' | 'tolerance', value: string) => {
    const updated = { ...targetWeight, [field]: parseFloat(value) || 0 };
    setTargetWeight(updated);
    triggerChange({ targetWeight: updated });
  };

  const startEditingSize = (size: string) => {
    setEditingSize(size);
    setEditSizeVal(size);
  }

  const handleAddSize = () => {
    if (newSize.trim() && !sizes.includes(newSize.trim().toUpperCase())) {
      const updated = [...sizes, newSize.trim().toUpperCase()];
      setSizes(updated);
      setNewSize('');
      setIsAddingSize(false);
      triggerChange({ sizes: updated });
    } else if (!newSize.trim()) {
      setIsAddingSize(false);
    }
  };

  const handleEditSize = (oldSize: string, newSizeVal: string) => {
    const val = newSizeVal.trim().toUpperCase();
    if (!val || (val !== oldSize && sizes.includes(val))) {
      setEditingSize(null);
      return;
    }
    const updated = sizes.map(s => s === oldSize ? val : s);
    setSizes(updated);
    setEditingSize(null);
    triggerChange({ sizes: updated });
  };

  const handleRemoveSize = (size: string) => {
    const updated = sizes.filter(s => s !== size);
    setSizes(updated);
    triggerChange({ sizes: updated });
  };

  const handleMoveSize = (size: string, dir: 'up'|'down') => {
    const idx = sizes.indexOf(size);
    if (idx < 0) return;
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === sizes.length - 1) return;
    const updated = [...sizes];
    const temp = updated[idx];
    updated[idx] = updated[dir === 'up' ? idx - 1 : idx + 1];
    updated[dir === 'up' ? idx - 1 : idx + 1] = temp;
    setSizes(updated);
    triggerChange({ sizes: updated });
  };

  const handleAddSampleSize = () => {
    const val = parseInt(newSampleSize.trim(), 10);
    if (!isNaN(val) && !sampleSizes.includes(val)) {
      const updated = [...sampleSizes, val];
      setSampleSizes(updated);
      setNewSampleSize('');
      setIsAddingSampleSize(false);
      triggerChange({ sampleSizes: updated });
    } else if (!newSampleSize.trim()) {
      setIsAddingSampleSize(false);
    }
  };

  const handleEditSampleSize = (oldSize: number, newSizeStr: string) => {
    const val = parseInt(newSizeStr.trim(), 10);
    if (isNaN(val) || (val !== oldSize && sampleSizes.includes(val))) {
      setEditingSampleSize(null);
      return;
    }
    const updated = sampleSizes.map(s => s === oldSize ? val : s);
    setSampleSizes(updated);
    setEditingSampleSize(null);
    triggerChange({ sampleSizes: updated });
  };

  const handleRemoveSampleSize = (size: number) => {
    const updated = sampleSizes.filter(s => s !== size);
    setSampleSizes(updated);
    triggerChange({ sampleSizes: updated });
  };

  const handleMoveSampleSize = (size: number, dir: 'up'|'down') => {
    const idx = sampleSizes.indexOf(size);
    if (idx < 0) return;
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === sampleSizes.length - 1) return;
    const updated = [...sampleSizes];
    const temp = updated[idx];
    updated[idx] = updated[dir === 'up' ? idx - 1 : idx + 1];
    updated[dir === 'up' ? idx - 1 : idx + 1] = temp;
    setSampleSizes(updated);
    triggerChange({ sampleSizes: updated });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 w-full">
      
      {/* ── Section 1: SKU Dictionaries ────────────────────────────────────── */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-800 bg-surface">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            SKU BUILDER DICTIONARIES
          </h3>
          <p className="text-xs text-muted mt-1">Manage the strict nomenclature components used to generate Product Codes.</p>
        </div>
        <div className="p-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
          <DictionaryManager
            title="1. Material"
            description="1 Character (e.g. N for Nitrile)"
            options={skuMaterials}
            onAdd={(v, l) => handleAddDict('skuMaterials', skuMaterials, setSkuMaterials, v, l)}
            onRemove={(v) => handleRemoveDict('skuMaterials', skuMaterials, setSkuMaterials, v)}
            onEdit={(old, v, l) => handleEditDict('skuMaterials', skuMaterials, setSkuMaterials, old, v, l)}
            valuePlaceholder="N"
            labelPlaceholder="Nitrile"
            maxLength={1}
          />
          <DictionaryManager
            title="2. Glove Weight"
            description="3 Digits (e.g. 025 for 2.5g)"
            options={skuWeights}
            onAdd={(v, l) => handleAddDict('skuWeights', skuWeights, setSkuWeights, v, l)}
            onRemove={(v) => handleRemoveDict('skuWeights', skuWeights, setSkuWeights, v)}
            onEdit={(old, v, l) => handleEditDict('skuWeights', skuWeights, setSkuWeights, old, v, l)}
            onMove={(val, dir) => handleMoveDict('skuWeights', skuWeights, setSkuWeights, val, dir)}
            valuePlaceholder="025"
            labelPlaceholder="2.5g"
            maxLength={3}
          />
          <DictionaryManager
            title="3. Color"
            description="3 Characters (e.g. SKB for Sky Blue)"
            options={skuColors}
            onAdd={(v, l) => handleAddDict('skuColors', skuColors, setSkuColors, v, l)}
            onRemove={(v) => handleRemoveDict('skuColors', skuColors, setSkuColors, v)}
            onEdit={(old, v, l) => handleEditDict('skuColors', skuColors, setSkuColors, old, v, l)}
            valuePlaceholder="SKB"
            labelPlaceholder="Sky Blue"
            maxLength={3}
          />
          <DictionaryManager
            title="4. Inner Surface"
            description="2 Characters (e.g. OC for Online Chlorinated)"
            options={skuTreatments}
            onAdd={(v, l) => handleAddDict('skuTreatments', skuTreatments, setSkuTreatments, v, l)}
            onRemove={(v) => handleRemoveDict('skuTreatments', skuTreatments, setSkuTreatments, v)}
            onEdit={(old, v, l) => handleEditDict('skuTreatments', skuTreatments, setSkuTreatments, old, v, l)}
            valuePlaceholder="OC"
            labelPlaceholder="Online Chlor"
            maxLength={2}
          />
          <DictionaryManager
            title="5. Glove Length"
            description="2 Digits (e.g. 24 for 24cm)"
            options={skuLengths}
            onAdd={(v, l) => handleAddDict('skuLengths', skuLengths, setSkuLengths, v, l)}
            onRemove={(v) => handleRemoveDict('skuLengths', skuLengths, setSkuLengths, v)}
            onEdit={(old, v, l) => handleEditDict('skuLengths', skuLengths, setSkuLengths, old, v, l)}
            valuePlaceholder="24"
            labelPlaceholder="24cm"
            maxLength={2}
          />
          <DictionaryManager
            title="6. Texture"
            description="2 Characters (e.g. FT for Finger Textured)"
            options={skuTextures}
            onAdd={(v, l) => handleAddDict('skuTextures', skuTextures, setSkuTextures, v, l)}
            onRemove={(v) => handleRemoveDict('skuTextures', skuTextures, setSkuTextures, v)}
            onEdit={(old, v, l) => handleEditDict('skuTextures', skuTextures, setSkuTextures, old, v, l)}
            valuePlaceholder="FT"
            labelPlaceholder="Finger Textured"
            maxLength={2}
          />
        </div>
      </div>

      {/* ── Section 2: Product Code Assembler & Catalog ────────────────────── */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-800 bg-surface">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
            <Box className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            PRODUCT CODE REGISTRATION & CATALOG
          </h3>
          <p className="text-xs text-muted mt-1">Assemble new SKUs using the dictionaries above and assign them to Inspection Profiles.</p>
        </div>
        
        <div className="p-5 border-b border-gray-800/50 bg-canvas flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <select value={selMat} onChange={e => setSelMat(e.target.value)} className="h-10 bg-surface border border-gray-700 rounded-lg px-2 text-xs text-primary font-mono outline-none focus:border-brand-secondary">
              <option value="">Mat (1)</option>
              {skuMaterials.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selWgt} onChange={e => setSelWgt(e.target.value)} className="h-10 bg-surface border border-gray-700 rounded-lg px-2 text-xs text-primary font-mono outline-none focus:border-brand-secondary">
              <option value="">Wgt (3)</option>
              {skuWeights.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selCol} onChange={e => setSelCol(e.target.value)} className="h-10 bg-surface border border-gray-700 rounded-lg px-2 text-xs text-primary font-mono outline-none focus:border-brand-secondary">
              <option value="">Col (3)</option>
              {skuColors.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selTrt} onChange={e => setSelTrt(e.target.value)} className="h-10 bg-surface border border-gray-700 rounded-lg px-2 text-xs text-primary font-mono outline-none focus:border-brand-secondary">
              <option value="">Trt (2)</option>
              {skuTreatments.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selLen} onChange={e => setSelLen(e.target.value)} className="h-10 bg-surface border border-gray-700 rounded-lg px-2 text-xs text-primary font-mono outline-none focus:border-brand-secondary">
              <option value="">Len (2)</option>
              {skuLengths.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selTex} onChange={e => setSelTex(e.target.value)} className="h-10 bg-surface border border-gray-700 rounded-lg px-2 text-xs text-primary font-mono outline-none focus:border-brand-secondary">
              <option value="">Tex (2)</option>
              {skuTextures.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="h-12 flex-1 rounded-lg bg-surface border border-gray-700 flex items-center justify-center font-mono text-lg font-bold text-brand-secondary tracking-widest shadow-inner">
              {canBuildSKU ? derivedSKU : <span className="text-muted opacity-50">___ ___ ___ - __ - __ __</span>}
            </div>
            <button 
              onClick={handleAddProduct}
              disabled={!canBuildSKU || productCodes.includes(derivedSKU)}
              className="h-12 px-8 rounded-lg bg-accent-gradient text-white font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-brand-primary/20 hover:brightness-110 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Plus className="w-5 h-5" /> ADD TO CATALOG
            </button>
          </div>
        </div>

        <div className="p-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Active Catalog ({productCodes.length})</h4>
          <div className="flex flex-col gap-2">
            {productCodes.map(code => (
              <div key={code} className="h-12 pl-4 pr-2 rounded-lg bg-surface border border-gray-700 flex items-center justify-between group hover:border-gray-500 transition-all">
                <span className="font-mono text-sm font-bold text-primary tracking-wide">{code}</span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">PROFILE:</label>
                    <div className="relative">
                      <select
                        value={productProfileMap[code] || ''}
                        onChange={(e) => handleUpdateProfileMap(code, e.target.value)}
                        className="h-8 px-3 pr-8 rounded-md bg-canvas border border-gray-700 text-brand-secondary font-medium text-xs focus:border-brand-secondary outline-none cursor-pointer w-48 appearance-none"
                      >
                        <option value="" disabled>Select Profile...</option>
                        {config?.inspectionProfiles?.map((p: any) => (
                          <option key={p.id} value={p.id} className="text-primary">{p.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-muted absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRemoveProduct(code)}
                    className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors outline-none"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {productCodes.length === 0 && (
              <div className="text-sm text-muted text-center py-6 italic">No products in catalog. Assemble one above.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* ── Section 3: Dimensional Spec Matrix ─────────────────────────────── */}
        <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="p-5 border-b border-gray-800 bg-surface">
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <Ruler className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              DIMENSION TARGET MATRIX
            </h3>
            <p className="text-xs text-muted mt-1">Set the minimum specs and tolerances used for auto-evaluation.</p>
          </div>
          
          <div className="p-5">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="pb-3 text-[10px] font-bold text-muted uppercase tracking-wider">Dimension</th>
                  <th className="pb-3 text-[10px] font-bold text-muted uppercase tracking-wider w-24">Target (&ge;)</th>
                  <th className="pb-3 text-[10px] font-bold text-muted uppercase tracking-wider w-28">&plusmn; Tolerance</th>
                  <th className="pb-3 text-[10px] font-bold text-muted uppercase tracking-wider text-center w-28">Zero Tol</th>
                  <th className="pb-3 text-[10px] font-bold text-muted uppercase tracking-wider w-12 text-right">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {dimensions.map(dim => {
                  const isThick = dim.id.includes('thick');
                  const stepVal = isThick ? '0.001' : '1';
                  const maxVal = dim.id === 'length' ? '999' : dim.id === 'palmWidth' ? '99' : undefined;

                  return (
                  <tr key={dim.id} className="hover:bg-surface/50 transition-colors group">
                    <td className="py-2 text-xs font-semibold text-primary">{dim.name}</td>
                    <td className="py-2">
                      <input 
                        type="number" 
                        step={stepVal}
                        min="0"
                        max={maxVal}
                        value={dim.minSpec}
                        onChange={(e) => handleUpdateDimension(dim.id, 'minSpec', e.target.value)}
                        onBlur={() => handleDimensionBlur(dim.id, 'minSpec')}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
                        className="w-full h-8 px-2 bg-surface border border-gray-700 rounded text-brand-secondary font-mono text-xs focus:border-brand-secondary outline-none"
                      />
                    </td>
                    <td className="py-2">
                      <input 
                        type="number" 
                        step={stepVal}
                        min="0"
                        max={maxVal}
                        value={dim.tolerance}
                        onChange={(e) => handleUpdateDimension(dim.id, 'tolerance', e.target.value)}
                        onBlur={() => handleDimensionBlur(dim.id, 'tolerance')}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
                        disabled={dim.isZeroTolerance}
                        className="w-full h-8 px-2 bg-surface border border-gray-700 rounded text-muted font-mono text-xs focus:border-brand-secondary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleUpdateDimension(dim.id, 'isZeroTolerance', !dim.isZeroTolerance)}
                        className={`h-6 px-2 rounded-full border text-[9px] font-bold tracking-wider uppercase transition-all ${
                          dim.isZeroTolerance 
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/50' 
                            : 'bg-surface border-gray-700 text-muted hover:border-gray-500'
                        }`}
                      >
                        {dim.isZeroTolerance ? 'ZERO TOL' : 'OFF'}
                      </button>
                    </td>
                    <td className="py-2 text-[10px] font-mono text-gray-500 text-right uppercase">{dim.unit}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6 flex flex-col">
          
          {/* ── Section 4: Target Glove Weight ───────────────────────────────── */}
          <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-800 bg-surface flex items-center gap-2">
              <Scale className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">TARGET GLOVE WEIGHT</h3>
            </div>
            <div className="p-4 flex gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">TARGET (g)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={targetWeight.target}
                  onChange={(e) => handleUpdateWeight('target', e.target.value)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
                  className="w-full h-10 px-3 rounded-md bg-surface border border-gray-700 text-brand-secondary font-mono text-sm font-bold focus:border-brand-secondary outline-none transition-all"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">&plusmn; TOLERANCE (g)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={targetWeight.tolerance}
                  onChange={(e) => handleUpdateWeight('tolerance', e.target.value)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
                  className="w-full h-10 px-3 rounded-md bg-surface border border-gray-700 text-muted font-mono text-sm focus:border-brand-secondary outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* ── Section 5: Glove Sizes ───────────────────────────────────────── */}
          <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm flex-1">
            <div className="p-4 border-b border-gray-800 bg-surface flex items-center gap-2">
              <Scaling className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">GLOVE SIZES</h3>
            </div>
            <div className="p-4">
              <div className="flex flex-col gap-2 mb-4">
                {sizes.map((size, idx) => (
                  <div key={size} className="h-8 pl-3 pr-1 rounded bg-surface border border-gray-700 flex items-center justify-between group">
                    {editingSize === size ? (
                      <div className="relative flex items-center w-full gap-1">
                        <div className="relative flex-1 min-w-0">
                          <input
                            type="text"
                            autoFocus
                            value={editSizeVal}
                            onChange={(e) => setEditSizeVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEditSize(size, editSizeVal);
                              if (e.key === 'Escape') setEditingSize(null);
                            }}
                            className="w-full h-6 px-1 pr-12 rounded bg-canvas border border-brand-secondary text-primary font-mono text-[10px] outline-none min-w-0 uppercase"
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-muted font-mono pointer-events-none">Enter ↵</span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => handleEditSize(size, editSizeVal)} className="w-5 h-5 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingSize(null)} className="w-5 h-5 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="font-mono text-xs font-bold text-primary">{size}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleMoveSize(size, 'up')} disabled={idx === 0} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-primary disabled:opacity-30 outline-none">
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleMoveSize(size, 'down')} disabled={idx === sizes.length - 1} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-primary disabled:opacity-30 outline-none">
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button onClick={() => startEditingSize(size)} className="p-1.5 rounded-md hover:bg-surface-light text-muted hover:text-white transition-colors outline-none" title="Edit">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleRemoveSize(size)} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-rose-400 hover:bg-rose-500/10 shrink-0 outline-none">
                            <Trash className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                
                {isAddingSize && (
                  <div className="relative h-8 pl-3 pr-1 rounded bg-surface border border-gray-700 flex items-center w-full gap-1">
                    <div className="relative flex-1 min-w-0">
                      <input 
                        autoFocus
                        type="text" 
                        value={newSize}
                        onChange={(e) => setNewSize(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddSize();
                          if (e.key === 'Escape') setIsAddingSize(false);
                        }}
                        placeholder="New Size (e.g. XXXL)"
                        className="w-full h-6 px-1 pr-12 rounded bg-canvas border border-brand-secondary text-primary font-mono text-[10px] outline-none uppercase min-w-0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-muted font-mono pointer-events-none">Enter ↵</span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={handleAddSize} className="w-5 h-5 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => setIsAddingSize(false)} className="w-5 h-5 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {!isAddingSize && (
                <button 
                  onClick={() => setIsAddingSize(true)}
                  className="w-full h-8 rounded border border-dashed border-gray-700 bg-surface-light/30 text-muted hover:text-brand-secondary hover:border-brand-secondary hover:bg-brand-primary/10 font-semibold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all outline-none"
                >
                  <Plus className="w-3 h-3" /> ADD SIZE
                </button>
              )}
            </div>
          </div>

          {/* ── Section 6: ISO Sample Sizes ──────────────────────────────────── */}
          <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm flex-1">
            <div className="p-4 border-b border-gray-800 bg-surface flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">ISO SAMPLE SIZES</h3>
            </div>
            <div className="p-4">
              <div className="flex flex-col gap-2 mb-4 h-64 overflow-y-auto pr-2">
                {sampleSizes.map((size, idx) => (
                  <div key={size} className="h-8 pl-3 pr-1 rounded bg-surface border border-gray-700 flex items-center justify-between group shrink-0">
                    {editingSampleSize === size ? (
                      <div className="relative flex items-center w-full gap-1">
                        <div className="relative flex-1 min-w-0">
                          <input
                            type="number"
                            autoFocus
                            value={editSampleSizeVal}
                            onChange={(e) => setEditSampleSizeVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEditSampleSize(size, editSampleSizeVal);
                              if (e.key === 'Escape') setEditingSampleSize(null);
                            }}
                            className="w-full h-6 px-1 pr-12 rounded bg-canvas border border-brand-secondary text-primary font-mono text-[10px] outline-none min-w-0"
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-muted font-mono pointer-events-none">Enter ↵</span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => handleEditSampleSize(size, editSampleSizeVal)} className="w-5 h-5 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingSampleSize(null)} className="w-5 h-5 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="font-mono text-xs font-bold text-primary">{size}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleMoveSampleSize(size, 'up')} disabled={idx === 0} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-primary disabled:opacity-30 outline-none">
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleMoveSampleSize(size, 'down')} disabled={idx === sampleSizes.length - 1} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-primary disabled:opacity-30 outline-none">
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button onClick={() => { setEditingSampleSize(size); setEditSampleSizeVal(size.toString()); }} className="p-1.5 rounded-md hover:bg-surface-light text-muted hover:text-white transition-colors outline-none" title="Edit">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleRemoveSampleSize(size)} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-rose-400 hover:bg-rose-500/10 shrink-0 outline-none">
                            <Trash className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                
                {isAddingSampleSize && (
                  <div className="relative h-8 pl-3 pr-1 rounded bg-surface border border-gray-700 flex items-center w-full shrink-0 gap-1">
                    <div className="relative flex-1 min-w-0">
                      <input 
                        type="number"
                        autoFocus
                        value={newSampleSize}
                        onChange={(e) => setNewSampleSize(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddSampleSize();
                          if (e.key === 'Escape') setIsAddingSampleSize(false);
                        }}
                        placeholder="New Quantity"
                        className="w-full h-6 px-1 pr-12 rounded bg-canvas border border-brand-secondary text-primary font-mono text-[10px] outline-none min-w-0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-muted font-mono pointer-events-none">Enter ↵</span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={handleAddSampleSize} className="w-5 h-5 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => setIsAddingSampleSize(false)} className="w-5 h-5 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {!isAddingSampleSize && (
                <button 
                  onClick={() => setIsAddingSampleSize(true)}
                  className="w-full h-8 rounded border border-dashed border-gray-700 bg-surface-light/30 text-muted hover:text-brand-secondary hover:border-brand-secondary hover:bg-brand-primary/10 font-semibold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all outline-none shrink-0"
                >
                  <Plus className="w-3 h-3" /> ADD SAMPLE SIZE
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
