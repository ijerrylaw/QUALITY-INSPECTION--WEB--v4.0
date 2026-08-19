/**
 * @file ProductEngine.tsx
 * @description Phase 3: Configuration Control - Product Engine
 */

import { useState, useRef } from 'react';
import {
  Plus,
  Trash,
  Edit2,
  Copy,
  ArrowUp,
  ArrowDown,
  Box,
  ChevronDown,
  ChevronRight,
  Layers,
  AlertTriangle,
  Check,
  X,
  Clock,
  Lock
} from 'lucide-react';
import { useConfig, hasUsableProductMatrix, resolveProductRegistry } from '../../context/ConfigContext';
import type { SKUOption, ProductConfig } from '../../context/ConfigContext';
import { DictionaryManager } from './DictionaryManager';
import { ProductConfigAccordion } from './ProductConfigAccordion';

interface ProductEngineProps {
  onDirty: () => void;
  onChange: (data: any) => void;
}

export function ProductEngine({ onDirty, onChange }: ProductEngineProps) {
  const { config } = useConfig();
  const productCodeUsage = config?.productCodeUsage || {};
  const isCodeLocked = (code: string) => (productCodeUsage[code] ?? 0) > 0;

  // ── Local State ─────────────────────────────────────────────────────────
  const [skuMaterials, setSkuMaterials] = useState<SKUOption[]>(config?.skuMaterials || [{value: 'N', label: 'Nitrile'}]);
  const [skuWeights, setSkuWeights] = useState<SKUOption[]>(config?.skuWeights || [{value: '025', label: '2.5g'}]);
  const [skuColors, setSkuColors] = useState<SKUOption[]>(config?.skuColors || [{value: 'SKB', label: 'Sky Blue'}]);
  const [skuTreatments, setSkuTreatments] = useState<SKUOption[]>(config?.skuTreatments || [{value: 'OC', label: 'Online Chlorinated'}]);
  const [skuLengths, setSkuLengths] = useState<SKUOption[]>(config?.skuLengths || [{value: '24', label: '24cm'}]);
  const [skuTextures, setSkuTextures] = useState<SKUOption[]>(config?.skuTextures || [{value: 'FT', label: 'Finger Textured'}]);

  // B3 read-cutover: the registered-products list and every code's dimension/
  // size matrix are now sourced from the consolidated `products` structure
  // (via resolveProductRegistry) instead of the legacy productCodes[] /
  // productMatrixConfig pair. Everything downstream — the rendered list, lock
  // badges, SETUP REQUIRED badges, the accordion, and the save handlers — is
  // deliberately unchanged and still operates on these two local variables,
  // so only the SOURCE of the seed moved, not any behavior.
  //
  // WRITES are intentionally untouched (B2's design; write-path consolidation
  // is B6): triggerChange still sends productCodes + productMatrixConfig, and
  // PATCH /api/config still validates and persists them exactly as before,
  // rebuilding `products` from them via its write-hook.
  const initialRegistry = resolveProductRegistry(config);
  const [productCodes, setProductCodes] = useState<string[]>(initialRegistry.productCodes);
  const [productMatrixConfig, setProductMatrixConfig] = useState<Record<string, ProductConfig>>(initialRegistry.productMatrixConfig);

  // Accordion state — expandedCodes (view-only expand/collapse) is
  // independent per row and can hold multiple codes at once, for side-by-
  // side comparison. editingCode is deliberately a single value, not part
  // of the set: only one code may be in Edit mode system-wide at a time
  // (unchanged from before — see the Move/Edit/Delete disable logic below,
  // which still gates on "is any code being edited", not per-row).
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [expandedProductDraft, setExpandedProductDraft] = useState<ProductConfig | null>(null);

  // Delete confirmation state — every removal requires confirmation; locked
  // (submission-referenced) codes never reach this state, the control is
  // disabled before the user can click it.
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);

  // SKU Builder Selections
  const [selMat, setSelMat] = useState('');
  const [selWgt, setSelWgt] = useState('');
  const [selCol, setSelCol] = useState('');
  const [selTrt, setSelTrt] = useState('');
  const [selLen, setSelLen] = useState('');
  const [selTex, setSelTex] = useState('');

  // Duplicate+edit — reuses the existing PRODUCT CODE REGISTRATION panel
  // (the six dropdowns above) rather than a parallel UI. `duplicatingFrom`
  // is the source code while the panel is pre-filled and awaiting submit;
  // null means the panel is in normal "Add" mode. registrationPanelRef/
  // firstSelectRef exist only to scroll/focus the panel into view when
  // Duplicate is clicked on a row that's currently off-screen.
  const [duplicatingFrom, setDuplicatingFrom] = useState<string | null>(null);
  const registrationPanelRef = useRef<HTMLDivElement>(null);
  const firstSelectRef = useRef<HTMLSelectElement>(null);

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
  // Blocks Add/Duplicate submission while another row is mid-edit — the same
  // "only one code editable system-wide" invariant Move/Edit/Delete already
  // enforce. This matters specifically because a successful Duplicate now
  // lands the NEW code into edit mode immediately: without this guard, that
  // would silently steal edit mode away from whatever row the user already
  // had open, discarding its unsaved draft with no warning.
  const canSubmitRegistration = canBuildSKU && !productCodes.includes(derivedSKU) && !editingCode;

  const resetRegistrationPanel = () => {
    setSelMat(''); setSelWgt(''); setSelCol(''); setSelTrt(''); setSelLen(''); setSelTex('');
    setDuplicatingFrom(null);
  };

  // Pre-fills the six dropdowns from the source code's current attributes and
  // switches the existing PRODUCT CODE REGISTRATION panel into "Duplicating
  // from X" mode — no parallel UI. Available on every code, including locked
  // ones (this is the only way to change a locked code's specs: the locked
  // code itself stays permanently immutable, but a new, unlocked, freely-
  // editable copy of it can always be created). Missing/null attributes
  // (e.g. N035MNV-OC-24FT, never backfilled) leave their dropdown blank
  // rather than fabricating a value — canBuildSKU then correctly keeps the
  // submit button disabled until the user picks something for every one.
  const handleDuplicateProduct = (code: string) => {
    const attrs = config?.products?.[code]?.attributes;
    setSelMat(attrs?.material ?? '');
    setSelWgt(attrs?.weight ?? '');
    setSelCol(attrs?.color ?? '');
    setSelTrt(attrs?.innerSurface ?? '');
    setSelLen(attrs?.length ?? '');
    setSelTex(attrs?.texture ?? '');
    setDuplicatingFrom(code);
    registrationPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    firstSelectRef.current?.focus();
  };

  const handleCancelDuplicate = () => {
    resetRegistrationPanel();
  };

  const handleAddProduct = () => {
    if (!canSubmitRegistration) return;

    const updatedCodes = [...productCodes, derivedSKU];

    // Duplicate mode: copy the source's full matrix wholesale (all sizes,
    // targets, tolerances, decimals, dynamic dimension defs) rather than
    // re-entering it — deep-cloned so editing the new code's draft can never
    // mutate the source's stored entry. Normal Add mode: unchanged blank
    // STANDARD_SIZES matrix, exactly as before this feature.
    const newMatrixEntry: ProductConfig = duplicatingFrom
      ? JSON.parse(JSON.stringify(productMatrixConfig[duplicatingFrom] || { dimensionDefs: [], sizes: {} }))
      : (() => {
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
          return { dimensionDefs: [], sizes: initialSizes };
        })();

    const updatedMatrix = {
      ...productMatrixConfig,
      [derivedSKU]: newMatrixEntry
    };

    setProductCodes(updatedCodes);
    setProductMatrixConfig(updatedMatrix);

    if (duplicatingFrom) {
      // profileId is deliberately NOT copied — every new code starts with
      // profileId: null, consistent with product-level profile defaults not
      // being used by this app (every real submission carries its own
      // explicit profileId from the required wizard field).
      triggerChange({
        productCodes: updatedCodes,
        productMatrixConfig: updatedMatrix,
        productAttributes: {
          [derivedSKU]: { material: selMat, weight: selWgt, color: selCol, innerSurface: selTrt, length: selLen, texture: selTex }
        }
      });

      // Land the new code in edit mode immediately, same as clicking the Edit
      // pencil — but seeded from `newMatrixEntry` directly rather than via
      // handleStartEditProduct(derivedSKU), which would read the pre-update
      // (stale) `productMatrixConfig` closure and miss the just-created entry.
      // Only ever touches the new code's own state — expandedCodes gains an
      // entry, it never loses one, so any other currently-expanded row is
      // completely unaffected.
      setEditingCode(derivedSKU);
      setExpandedCodes(prev => new Set(prev).add(derivedSKU));
      setExpandedProductDraft(JSON.parse(JSON.stringify(newMatrixEntry)));
    } else {
      triggerChange({ productCodes: updatedCodes, productMatrixConfig: updatedMatrix });
    }

    resetRegistrationPanel();
  };

  const handleRemoveProduct = (code: string) => {
    if (isCodeLocked(code)) return; // defense-in-depth; UI already disables this path
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
    if (editingCode === code) return; // Don't collapse the row actively being edited
    setExpandedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const handleStartEditProduct = (code: string) => {
    setEditingCode(code);
    setExpandedCodes(prev => new Set(prev).add(code)); // ensure the row is visibly expanded while editing
    setExpandedProductDraft(JSON.parse(JSON.stringify(productMatrixConfig[code] || { dimensionDefs: [], sizes: {} })));
  };

  const handleSaveProductConfig = (code: string) => {
    // Only stamp a new lastAmended / push a change if something in the
    // draft actually differs from what's stored — previously this ran
    // unconditionally on every Save click, so opening a product to look at
    // it and clicking the checkmark without editing anything still
    // rewrote lastAmended and marked the whole config page dirty (same
    // class of false-positive already fixed for the wizard in 8b116d8).
    if (expandedProductDraft) {
      const stored = productMatrixConfig[code] || { dimensionDefs: [], sizes: {} };
      const actuallyChanged = JSON.stringify(expandedProductDraft) !== JSON.stringify(stored);
      if (actuallyChanged) {
        const draftWithTime = {
          ...expandedProductDraft,
          lastAmended: new Date().toISOString()
        };
        const updatedMatrix = { ...productMatrixConfig, [code]: draftWithTime };
        setProductMatrixConfig(updatedMatrix);
        triggerChange({ productMatrixConfig: updatedMatrix });
      }
    }
    setEditingCode(null);
    setExpandedProductDraft(null);
  };

  const handleCancelProductConfig = () => {
    setEditingCode(null);
    setExpandedProductDraft(null);
  };

  // Check if a product's matrix is fully configured — mirrors the real
  // grading-readiness gate (hasUsableProductMatrix, the finding #5 guard
  // used by dimensionEvaluator.ts/resolveVerdict.ts and StepDimensions.tsx)
  // rather than a separate, unrelated condition. Previously required at
  // least one custom/dynamic dimension to exist, which has nothing to do
  // with whether a product is actually gradeable — a product needing only
  // the three fixed dimensions (Weight/Length/Palm Width) could never clear
  // the old check. hasUsableProductMatrix() itself only evaluates one size
  // at a time and doesn't know about "no sizes enabled at all", so that
  // case is handled explicitly here.
  const isSetupIncomplete = (code: string) => {
    const conf = productMatrixConfig[code];
    if (!conf) return true;
    const enabledSizes = Object.keys(conf.sizes);
    if (enabledSizes.length === 0) return true;
    return !enabledSizes.every(size => hasUsableProductMatrix(conf, size));
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
      <div ref={registrationPanelRef} className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-800 bg-surface flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
            <Box className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            PRODUCT CODE REGISTRATION
          </h3>
          <p className="text-xs text-muted mt-1 font-normal normal-case">Assemble new Product Codes from the dictionaries.</p>
          </div>
        </div>

        {duplicatingFrom && (
          <div className="px-4 py-2.5 bg-brand-secondary/5 border-b border-brand-secondary/20 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-secondary flex items-center gap-2">
              <Copy className="w-3.5 h-3.5" strokeWidth={2} />
              Duplicating from <span className="font-mono normal-case">{duplicatingFrom}</span>
            </span>
            <button
              onClick={handleCancelDuplicate}
              className="text-[10px] font-bold uppercase tracking-wider text-muted hover:text-white flex items-center gap-1 outline-none"
              title="Cancel — back to normal Add mode"
            >
              <X className="w-3 h-3" strokeWidth={2} />
              Cancel
            </button>
          </div>
        )}

        <div className="p-4 bg-canvas flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <select ref={firstSelectRef} value={selMat} onChange={e => setSelMat(e.target.value)} className="h-9 px-2 bg-canvas border border-gray-700 rounded-lg font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none">
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
              disabled={!canSubmitRegistration}
              title={editingCode ? 'Save or cancel the active edit first' : undefined}
              className="h-12 px-8 rounded-lg bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {duplicatingFrom ? (<><Copy className="w-5 h-5" /> CREATE DUPLICATE</>) : (<><Plus className="w-5 h-5" /> ADD PRODUCT CODE</>)}
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
            const isExpanded = expandedCodes.has(code);
            const isEditingThis = editingCode === code;
            const needsSetup = isSetupIncomplete(code);

            return (
              <div key={code} className="border-b border-gray-800 last:border-b-0 group/prod">
                {/* Row Header */}
                <div
                  className={`h-12 px-4 flex items-center justify-between transition-colors ${isExpanded && !isEditingThis ? 'bg-surface' : 'cursor-pointer hover:bg-surface-light'}`}
                  onClick={() => handleToggleExpandProduct(code)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-brand-secondary" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                    <span className="font-mono text-sm text-primary tracking-wide">{code}</span>
                    {isCodeLocked(code) && (
                      <span
                        className="flex items-center gap-1 bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                        title={`Referenced by ${productCodeUsage[code]} submission${productCodeUsage[code] === 1 ? '' : 's'} — cannot be edited or deleted`}
                      >
                        <Lock className="w-3 h-3" /> Locked ({productCodeUsage[code]})
                      </span>
                    )}
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
                  <div className={`flex items-center gap-1 transition-opacity ${isEditingThis ? 'opacity-100' : 'opacity-0 group-hover/prod:opacity-100'}`} onClick={e => e.stopPropagation()}>
                    {isEditingThis ? (
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
                          disabled={index === 0 || !!editingCode}
                          className={`p-1.5 rounded-md transition-colors outline-none ${editingCode || index === 0 ? 'text-gray-700 cursor-not-allowed' : 'text-muted hover:text-white hover:bg-gray-800'}`}
                          title="Move Up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveProductCode(index, 'down')}
                          disabled={index === productCodes.length - 1 || !!editingCode}
                          className={`p-1.5 rounded-md transition-colors outline-none ${editingCode || index === productCodes.length - 1 ? 'text-gray-700 cursor-not-allowed' : 'text-muted hover:text-white hover:bg-gray-800'}`}
                          title="Move Down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { if (!isCodeLocked(code)) handleStartEditProduct(code); }}
                          disabled={!!editingCode || isCodeLocked(code)}
                          className={`p-1.5 rounded-md transition-colors outline-none ${(editingCode || isCodeLocked(code)) ? 'text-gray-700 cursor-not-allowed' : 'text-muted hover:text-white hover:bg-gray-800'}`}
                          title={
                            editingCode
                              ? 'Save active edits first'
                              : isCodeLocked(code)
                                ? `Cannot edit — used by ${productCodeUsage[code]} submission${productCodeUsage[code] === 1 ? '' : 's'}`
                                : 'Edit Config'
                          }
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {/* Duplicate — deliberately NOT gated on isCodeLocked(code).
                            This is the only way to change a locked code's specs:
                            the locked code itself remains permanently immutable,
                            but duplicating it creates a brand-new, unlocked copy
                            that can be freely edited. Still gated on !!editingCode
                            like every other row action, since a successful
                            duplicate immediately enters edit mode for the new
                            code (see canSubmitRegistration). */}
                        <button
                          onClick={() => handleDuplicateProduct(code)}
                          disabled={!!editingCode}
                          className={`p-1.5 rounded-md transition-colors outline-none ${editingCode ? 'text-gray-700 cursor-not-allowed' : 'text-muted hover:text-white hover:bg-gray-800'}`}
                          title={editingCode ? 'Save active edits first' : `Duplicate — create an editable copy of ${code}`}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteCode(code)}
                          disabled={!!editingCode || isCodeLocked(code)}
                          className={`p-1.5 rounded-md transition-colors outline-none ${(editingCode || isCodeLocked(code)) ? 'text-gray-700 cursor-not-allowed' : 'text-muted hover:text-rose-400 hover:bg-rose-500/10'}`}
                          title={
                            editingCode
                              ? 'Save active edits first'
                              : isCodeLocked(code)
                                ? `Cannot delete — used by ${productCodeUsage[code]} submission${productCodeUsage[code] === 1 ? '' : 's'}`
                                : 'Remove'
                          }
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
                    config={isEditingThis ? (expandedProductDraft ?? { dimensionDefs: [], sizes: {} }) : (productMatrixConfig[code] || { dimensionDefs: [], sizes: {} })}
                    onChange={isEditingThis ? setExpandedProductDraft : () => {}}
                    isReadOnly={!isEditingThis}
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

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      {confirmDeleteCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-canvas border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="flex items-start gap-4 p-4 border-b border-gray-800">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-400" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-lg font-bold uppercase tracking-wide text-primary mb-1">
                  REMOVE PRODUCT CODE?
                </h3>
                <p className="text-sm text-muted">
                  Remove <span className="font-mono font-bold text-white">{confirmDeleteCode}</span> and its dimension/size configuration from the registry? This takes effect once you save configuration, and cannot be undone.
                </p>
              </div>
            </div>
            <div className="p-4 bg-surface flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteCode(null)}
                className="h-10 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
              >
                <X className="w-4 h-4" strokeWidth={2} />
                <span>CANCEL</span>
              </button>
              <button
                onClick={() => { handleRemoveProduct(confirmDeleteCode); setConfirmDeleteCode(null); }}
                className="h-10 px-5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none border border-rose-500/50 shadow-sm"
              >
                <Trash className="w-4 h-4" strokeWidth={2} />
                <span>CONFIRM REMOVE</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}



