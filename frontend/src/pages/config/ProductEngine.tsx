/**
 * @file ProductEngine.tsx
 * @description Phase 3: Configuration Control - Product Engine
 */

import { useState } from 'react';
import {
  Plus,
  Trash,
  Edit2,
  ArrowUp,
  ArrowDown,
  Box,
  ChevronDown,
  ChevronRight,
  Layers,
  AlertTriangle,
  Check,
  X,
  Clock
} from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';
import type { SKUOption, ProductConfig } from '../../context/ConfigContext';
import { DictionaryManager } from './DictionaryManager';
import { ProductConfigAccordion } from './ProductConfigAccordion';

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
  const [productMatrixConfig, setProductMatrixConfig] = useState<Record<string, ProductConfig>>(config?.productMatrixConfig || {});

  // Accordion state
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [expandedProductDraft, setExpandedProductDraft] = useState<ProductConfig | null>(null);

  // SKU Builder Selections
  const [selMat, setSelMat] = useState('');
  const [selWgt, setSelWgt] = useState('');
  const [selCol, setSelCol] = useState('');
  const [selTrt, setSelTrt] = useState('');
  const [selLen, setSelLen] = useState('');
  const [selTex, setSelTex] = useState('');

  // ── Handlers ─────────────────────────────────────────────────────────────
  const triggerChange = (updates: any) => {
    onDirty();
    onChange({
      skuMaterials, skuWeights, skuColors, skuTreatments, skuLengths, skuTextures,
      productCodes, productMatrixConfig,
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
      
      const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
      const initialSizes: Record<string, any> = {};
      STANDARD_SIZES.forEach(size => {
        initialSizes[size] = { 
          weightTarget: '', weightTolerance: '', 
          lengthTarget: '', lengthTolerance: '', 
          palmWidthTarget: '', palmWidthTolerance: '',
          dimensions: {} 
        };
      });
      
      const updatedMatrix = { 
        ...productMatrixConfig,
        [derivedSKU]: { dimensionDefs: [], sizes: initialSizes }
      };

      setProductCodes(updatedCodes);
      setProductMatrixConfig(updatedMatrix);
      triggerChange({ productCodes: updatedCodes, productMatrixConfig: updatedMatrix });
      
      setSelMat(''); setSelWgt(''); setSelCol(''); setSelTrt(''); setSelLen(''); setSelTex('');
    }
  };

  const handleRemoveProduct = (code: string) => {
    const updatedCodes = productCodes.filter(c => c !== code);
    const updatedMatrix = { ...productMatrixConfig };
    delete updatedMatrix[code];
    setProductCodes(updatedCodes);
    setProductMatrixConfig(updatedMatrix);
    triggerChange({ productCodes: updatedCodes, productMatrixConfig: updatedMatrix });
  };

  const moveProductCode = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === productCodes.length - 1) return;
    
    const newCodes = [...productCodes];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newCodes[index], newCodes[newIndex]] = [newCodes[newIndex], newCodes[index]];
    
    setProductCodes(newCodes);
    onDirty();
    triggerChange({ productCodes: newCodes, productMatrixConfig });
  };

  const handleToggleExpandProduct = (code: string) => {
    if (expandedProductDraft) return; // Prevent collapsing/expanding while editing
    setExpandedProduct(expandedProduct === code ? null : code);
  };

  const handleStartEditProduct = (code: string) => {
    setExpandedProduct(code);
    setExpandedProductDraft(JSON.parse(JSON.stringify(productMatrixConfig[code] || { dimensionDefs: [], sizes: {} })));
  };

  const handleSaveProductConfig = (code: string) => {
    if (expandedProductDraft) {
      const draftWithTime = { 
        ...expandedProductDraft, 
        lastAmended: new Date().toISOString() 
      };
      const updatedMatrix = { ...productMatrixConfig, [code]: draftWithTime };
      setProductMatrixConfig(updatedMatrix);
      triggerChange({ productMatrixConfig: updatedMatrix });
    }
    setExpandedProduct(null);
    setExpandedProductDraft(null);
  };

  const handleCancelProductConfig = () => {
    setExpandedProduct(null);
    setExpandedProductDraft(null);
  };

  // Check if a product's matrix is fully configured
  const isSetupIncomplete = (code: string) => {
    const conf = productMatrixConfig[code];
    if (!conf) return true;
    if (Object.keys(conf.sizes).length === 0) return true;
    if (conf.dimensionDefs.length === 0) return true;
    return false;
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300 w-full">
      
      {/* ── Section 1: PRODUCT CODE DICTIONARY (6x1 Grid Squeezed) ─────────── */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-800 bg-surface">
          <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            PRODUCT CODE DICTIONARY
          </h3>
          <p className="text-xs text-muted mt-1 font-normal normal-case">Manage the strict nomenclature components.</p>
        </div>
        {/* Squeezed Grid container */}
        <div className="p-2 grid grid-cols-2 md:grid-cols-6 gap-2">
          <div className="scale-95 origin-top">
            <DictionaryManager
              title="1. Material"
              description="1 Char"
              options={skuMaterials}
              onAdd={(v, l) => handleAddDict('skuMaterials', skuMaterials, setSkuMaterials, v, l)}
              onRemove={(v) => handleRemoveDict('skuMaterials', skuMaterials, setSkuMaterials, v)}
              onEdit={(old, v, l) => handleEditDict('skuMaterials', skuMaterials, setSkuMaterials, old, v, l)}
              onMove={(val, dir) => handleMoveDict('skuMaterials', skuMaterials, setSkuMaterials, val, dir)}
              valuePlaceholder="N"
              labelPlaceholder="Nitrile"
              maxLength={1}
            />
          </div>
          <div className="scale-95 origin-top">
            <DictionaryManager
              title="2. Glove Weight"
              description="3 Digits"
              options={skuWeights}
              onAdd={(v, l) => handleAddDict('skuWeights', skuWeights, setSkuWeights, v, l)}
              onRemove={(v) => handleRemoveDict('skuWeights', skuWeights, setSkuWeights, v)}
              onEdit={(old, v, l) => handleEditDict('skuWeights', skuWeights, setSkuWeights, old, v, l)}
              onMove={(val, dir) => handleMoveDict('skuWeights', skuWeights, setSkuWeights, val, dir)}
              valuePlaceholder="025"
              labelPlaceholder="2.5g"
              maxLength={3}
            />
          </div>
          <div className="scale-95 origin-top">
            <DictionaryManager
              title="3. Color"
              description="3 Chars"
              options={skuColors}
              onAdd={(v, l) => handleAddDict('skuColors', skuColors, setSkuColors, v, l)}
              onRemove={(v) => handleRemoveDict('skuColors', skuColors, setSkuColors, v)}
              onEdit={(old, v, l) => handleEditDict('skuColors', skuColors, setSkuColors, old, v, l)}
              onMove={(val, dir) => handleMoveDict('skuColors', skuColors, setSkuColors, val, dir)}
              valuePlaceholder="SKB"
              labelPlaceholder="Sky Blue"
              maxLength={3}
            />
          </div>
          <div className="scale-95 origin-top">
            <DictionaryManager
              title="4. Inner Surface"
              description="2 Chars"
              options={skuTreatments}
              onAdd={(v, l) => handleAddDict('skuTreatments', skuTreatments, setSkuTreatments, v, l)}
              onRemove={(v) => handleRemoveDict('skuTreatments', skuTreatments, setSkuTreatments, v)}
              onEdit={(old, v, l) => handleEditDict('skuTreatments', skuTreatments, setSkuTreatments, old, v, l)}
              onMove={(val, dir) => handleMoveDict('skuTreatments', skuTreatments, setSkuTreatments, val, dir)}
              valuePlaceholder="OC"
              labelPlaceholder="Online"
              maxLength={2}
            />
          </div>
          <div className="scale-95 origin-top">
            <DictionaryManager
              title="5. Glove Length"
              description="2 Digits"
              options={skuLengths}
              onAdd={(v, l) => handleAddDict('skuLengths', skuLengths, setSkuLengths, v, l)}
              onRemove={(v) => handleRemoveDict('skuLengths', skuLengths, setSkuLengths, v)}
              onEdit={(old, v, l) => handleEditDict('skuLengths', skuLengths, setSkuLengths, old, v, l)}
              onMove={(val, dir) => handleMoveDict('skuLengths', skuLengths, setSkuLengths, val, dir)}
              valuePlaceholder="24"
              labelPlaceholder="24cm"
              maxLength={2}
            />
          </div>
          <div className="scale-95 origin-top">
            <DictionaryManager
              title="6. Texture"
              description="2 Chars"
              options={skuTextures}
              onAdd={(v, l) => handleAddDict('skuTextures', skuTextures, setSkuTextures, v, l)}
              onRemove={(v) => handleRemoveDict('skuTextures', skuTextures, setSkuTextures, v)}
              onEdit={(old, v, l) => handleEditDict('skuTextures', skuTextures, setSkuTextures, old, v, l)}
              onMove={(val, dir) => handleMoveDict('skuTextures', skuTextures, setSkuTextures, val, dir)}
              valuePlaceholder="FT"
              labelPlaceholder="Textured"
              maxLength={2}
            />
          </div>
        </div>
      </div>

      {/* ── Section 2: PRODUCT CODE REGISTRATION ───────────────────────────── */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-800 bg-surface flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
            <Box className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            PRODUCT CODE REGISTRATION
          </h3>
          <p className="text-xs text-muted mt-1 font-normal normal-case">Assemble new Product Codes from the dictionaries.</p>
          </div>
        </div>
        
        <div className="p-4 bg-canvas flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <select value={selMat} onChange={e => setSelMat(e.target.value)} className="h-9 px-2 bg-canvas border border-gray-700 rounded-lg font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none">
              <option value="">1. MATERIAL</option>
              {skuMaterials.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selWgt} onChange={e => setSelWgt(e.target.value)} className="h-9 px-2 bg-canvas border border-gray-700 rounded-lg font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none">
              <option value="">2. GLOVE WEIGHT</option>
              {skuWeights.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selCol} onChange={e => setSelCol(e.target.value)} className="h-9 px-2 bg-canvas border border-gray-700 rounded-lg font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none">
              <option value="">3. COLOR</option>
              {skuColors.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selTrt} onChange={e => setSelTrt(e.target.value)} className="h-9 px-2 bg-canvas border border-gray-700 rounded-lg font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none">
              <option value="">4. INNER SURFACE</option>
              {skuTreatments.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selLen} onChange={e => setSelLen(e.target.value)} className="h-9 px-2 bg-canvas border border-gray-700 rounded-lg font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none">
              <option value="">5. GLOVE LENGTH</option>
              {skuLengths.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
            </select>
            <select value={selTex} onChange={e => setSelTex(e.target.value)} className="h-9 px-2 bg-canvas border border-gray-700 rounded-lg font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none">
              <option value="">6. TEXTURE</option>
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
              className="h-12 px-8 rounded-lg bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Plus className="w-5 h-5" /> ADD PRODUCT CODE
            </button>
          </div>
        </div>
      </div>

      {/* ── Section 3: REGISTERED PRODUCTS ─────────────────────────────────── */}
      <div className="bg-canvas border border-gray-800 rounded-xl shadow-sm">
        <div className="p-4 border-b border-gray-800 bg-surface">
          <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
            <Box className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            REGISTERED PRODUCTS ({productCodes.length})
          </h3>
          <p className="text-xs text-muted mt-1 font-normal normal-case">Configure dimensions and sizes per product.</p>
        </div>

        <div className="flex flex-col">
          {productCodes.map((code, index) => {
            const isExpanded = expandedProduct === code;
            const needsSetup = isSetupIncomplete(code);

            return (
              <div key={code} className="border-b border-gray-800 last:border-b-0 group/prod">
                {/* Row Header */}
                <div 
                  className={`h-12 px-4 flex items-center justify-between transition-colors ${isExpanded && !expandedProductDraft ? 'bg-surface' : 'cursor-pointer hover:bg-surface-light'}`}
                  onClick={() => handleToggleExpandProduct(code)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-brand-secondary" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                    <span className="font-mono text-sm text-primary tracking-wide">{code}</span>
                    {needsSetup ? (
                      <span className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                        <AlertTriangle className="w-3 h-3" /> Setup Required
                      </span>
                    ) : productMatrixConfig[code]?.lastAmended ? (
                      <span className="flex items-center gap-1 bg-gray-800/50 text-muted border border-gray-700/50 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono">
                        <Clock className="w-3 h-3" /> UPDATED: {
                          new Date(productMatrixConfig[code].lastAmended!).getFullYear() + '-' +
                          String(new Date(productMatrixConfig[code].lastAmended!).getMonth() + 1).padStart(2, '0') + '-' +
                          String(new Date(productMatrixConfig[code].lastAmended!).getDate()).padStart(2, '0') + ' ' +
                          String(new Date(productMatrixConfig[code].lastAmended!).getHours()).padStart(2, '0') + ':' +
                          String(new Date(productMatrixConfig[code].lastAmended!).getMinutes()).padStart(2, '0')
                        }
                      </span>
                    ) : null}
                  </div>
                  <div className={`flex items-center gap-1 transition-opacity ${(expandedProductDraft && isExpanded) ? 'opacity-100' : 'opacity-0 group-hover/prod:opacity-100'}`} onClick={e => e.stopPropagation()}>
                    {(expandedProductDraft && isExpanded) ? (
                      <>
                        <button onClick={() => handleSaveProductConfig(code)} className="w-7 h-7 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleCancelProductConfig()} className="w-7 h-7 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => moveProductCode(index, 'up')} 
                          disabled={index === 0 || !!expandedProductDraft}
                          className={`p-1.5 rounded-md transition-colors outline-none ${expandedProductDraft || index === 0 ? 'text-gray-700 cursor-not-allowed' : 'text-muted hover:text-white hover:bg-gray-800'}`} 
                          title="Move Up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => moveProductCode(index, 'down')} 
                          disabled={index === productCodes.length - 1 || !!expandedProductDraft}
                          className={`p-1.5 rounded-md transition-colors outline-none ${expandedProductDraft || index === productCodes.length - 1 ? 'text-gray-700 cursor-not-allowed' : 'text-muted hover:text-white hover:bg-gray-800'}`} 
                          title="Move Down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleStartEditProduct(code)} 
                          disabled={!!expandedProductDraft}
                          className={`p-1.5 rounded-md transition-colors outline-none ${expandedProductDraft ? 'text-gray-700 cursor-not-allowed' : 'text-muted hover:text-white hover:bg-gray-800'}`} 
                          title={expandedProductDraft ? 'Save active edits first' : 'Edit Config'}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleRemoveProduct(code)} 
                          disabled={!!expandedProductDraft}
                          className={`p-1.5 rounded-md transition-colors outline-none ${expandedProductDraft ? 'text-gray-700 cursor-not-allowed' : 'text-muted hover:text-rose-400 hover:bg-rose-500/10'}`} 
                          title={expandedProductDraft ? 'Save active edits first' : 'Remove'}
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Accordion Body */}
                {isExpanded && (
                  <ProductConfigAccordion 
                    config={expandedProductDraft || productMatrixConfig[code] || { dimensionDefs: [], sizes: {} }}
                    onChange={expandedProductDraft ? setExpandedProductDraft : () => {}}
                    isReadOnly={!expandedProductDraft}
                  />
                )}
              </div>
            );
          })}
          {productCodes.length === 0 && (
            <div className="text-sm text-muted text-center py-6 italic">No products in catalog. Assemble one above.</div>
          )}
        </div>
      </div>

    </div>
  );
}



