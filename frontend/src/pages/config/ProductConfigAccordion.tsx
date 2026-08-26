import React, { useState } from 'react';
import { Plus, Edit2, Trash, Check, X, ToggleLeft, ToggleRight, ArrowUp, ArrowDown, Ruler, Eye, AlertCircle } from 'lucide-react';
import { isDimensionGraded, mergeCanonicalDimensionDefs, isCanonicalThicknessDim } from '../../context/ConfigContext';
import type { ProductConfig, ProductDimensionDef, ProductDimensionValue } from '../../context/ConfigContext';

interface Props {
  config: ProductConfig;
  onChange: (newConfig: ProductConfig) => void;
  isReadOnly?: boolean;
}

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export function ProductConfigAccordion({ config, onChange, isReadOnly = false }: Props) {
  // Merged so Cuff/Palm/Finger Thickness always render as permanent rows —
  // see mergeCanonicalDimensionDefs()'s docs. A virtual (not-yet-stored)
  // canonical entry only reaches storage once the admin actually saves some
  // edit to this product, same self-healing pattern as
  // resolveProductRegistry()'s legacy-column fallback.
  const dimensionDefs = mergeCanonicalDimensionDefs(config.dimensionDefs || []);
  const sizes = config.sizes || {};

  const [editingDim, setEditingDim] = useState<{ id: string; name: string; unit: string } | null>(null);

  const triggerChange = (updates: Partial<ProductConfig>) => {
    onChange({ ...config, ...updates });
  };

  // ── Format helpers ──────────────────────────────────────────────────────────
  const FORMAT_OPTIONS = [
    { label: '0',     decimals: 0 },
    { label: '0.0',   decimals: 1 },
    { label: '0.00',  decimals: 2 },
    { label: '0.000', decimals: 3 },
  ];

  const formatTolerance = (val: string) => {
    const upper = val.toUpperCase();
    if (upper.startsWith('M')) return 'MIN';
    return upper.replace(/[^0-9.]/g, '');
  };

  /**
   * Same on-keystroke character-stripping as formatTolerance(), minus the
   * 'MIN' sentinel (targets are always numeric, never that literal). Applied
   * to weightTarget/lengthTarget/palmWidthTarget and dynamic-dimension
   * minSpec — previously unvalidated, unlike their Tolerance siblings, which
   * let a stray non-numeric character (e.g. "105m") through into a value
   * that feeds dimensionEvaluator.ts's grading math untouched.
   */
  const formatTarget = (val: string) => val.replace(/[^0-9.]/g, '');

  const applyDecimalsToValue = (v: string, dec: number) => {
    if (!v || v.toUpperCase() === 'MIN') return v;
    const n = parseFloat(v);
    return isNaN(n) ? v : n.toFixed(dec);
  };

  /**
   * Snapshots the value present when a field is focused, so onBlur can tell
   * "the operator actually typed something this session" apart from "they
   * just clicked in and out" — same class of fix as wizardDirty.ts's
   * sequenceTouched (see commit 8b116d8), applied here because blur-time
   * rounding was firing unconditionally, silently reformatting an already-
   * stored value (e.g. "3.2" -> "3.20") on a field nobody edited and
   * marking the whole page dirty as a side effect of merely viewing it.
   */
  const handleFocusSnapshot = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.dataset.prevValue = e.target.value;
  };

  /** Only rounds — and only calls `apply` — if this field's value actually changed since focus. */
  const handleRoundOnBlur = (e: React.FocusEvent<HTMLInputElement>, dec: number, apply: (v: string) => void) => {
    if (e.target.value !== e.target.dataset.prevValue) {
      apply(applyDecimalsToValue(e.target.value, dec));
    }
  };

  // ── Fixed-row format change ──────────────────────────────────────────────────
  const handleFixedRowFormatChange = (
    decimalField: 'weightDecimals' | 'lengthDecimals' | 'palmWidthDecimals',
    targetField: 'weightTarget' | 'lengthTarget' | 'palmWidthTarget',
    tolField: 'weightTolerance' | 'lengthTolerance' | 'palmWidthTolerance',
    dec: number,
  ) => {
    if (isReadOnly) return;
    const updatedSizes = { ...sizes };
    Object.keys(updatedSizes).forEach(k => {
      const t = updatedSizes[k][targetField];
      const tol = updatedSizes[k][tolField];
      updatedSizes[k] = {
        ...updatedSizes[k],
        [targetField]: applyDecimalsToValue(t || '', dec),
        [tolField]: applyDecimalsToValue(tol || '', dec),
      };
    });
    triggerChange({ sizes: updatedSizes, [decimalField]: dec });
  };

  // ── Dynamic dimension format change ─────────────────────────────────────────
  const handleDimFormatChange = (dimId: string, dec: number) => {
    if (isReadOnly) return;
    const updatedSizes = { ...sizes };
    Object.keys(updatedSizes).forEach(k => {
      const dims = { ...updatedSizes[k].dimensions };
      if (dims[dimId]) {
        dims[dimId] = {
          minSpec: applyDecimalsToValue(dims[dimId].minSpec, dec),
          tolerance: applyDecimalsToValue(dims[dimId].tolerance, dec),
        };
      }
      updatedSizes[k] = { ...updatedSizes[k], dimensions: dims };
    });
    const updatedDefs = dimensionDefs.map(d => d.id === dimId ? { ...d, decimals: dec } : d);
    triggerChange({ dimensionDefs: updatedDefs, sizes: updatedSizes });
  };

  // ── Format selector UI component ─────────────────────────────────────────────
  const FormatSelect = ({
    value,
    onChange: onChangeFn,
  }: { value: number; onChange: (dec: number) => void }) => (
    <select
      value={value}
      disabled={isReadOnly}
      onChange={e => onChangeFn(parseInt(e.target.value))}
      className={`w-full mt-1 rounded px-1 text-[10px] font-mono font-bold text-center outline-none transition-all border ${
        isReadOnly
          ? 'bg-transparent border-transparent text-gray-600 cursor-default'
          : 'bg-canvas border-gray-700 text-brand-secondary hover:border-brand-secondary focus:border-brand-secondary cursor-pointer'
      }`}
    >
      {FORMAT_OPTIONS.map(o => (
        <option key={o.decimals} value={o.decimals}>{o.label}</option>
      ))}
    </select>
  );

  // ── Dimension management ─────────────────────────────────────────────────────
  const handleMoveDimension = (index: number, direction: 'up' | 'down') => {
    const updatedDefs = [...dimensionDefs];
    if (direction === 'up' && index > 0) {
      const temp = updatedDefs[index - 1];
      updatedDefs[index - 1] = updatedDefs[index];
      updatedDefs[index] = temp;
    } else if (direction === 'down' && index < updatedDefs.length - 1) {
      const temp = updatedDefs[index + 1];
      updatedDefs[index + 1] = updatedDefs[index];
      updatedDefs[index] = temp;
    } else {
      return;
    }
    triggerChange({ dimensionDefs: updatedDefs });
  };

  const handleToggleSize = (size: string) => {
    const updatedSizes = { ...sizes };
    if (updatedSizes[size]) {
      delete updatedSizes[size];
    } else {
      const dims: Record<string, ProductDimensionValue> = {};
      dimensionDefs.forEach(d => { dims[d.id] = { minSpec: '', tolerance: '' }; });
      updatedSizes[size] = { weightTarget: '', weightTolerance: '', dimensions: dims };
    }
    triggerChange({ sizes: updatedSizes });
  };

  const handleAddDimension = () => {
    const newId = `dim_${Date.now()}`;
    const newDef: ProductDimensionDef = { id: newId, name: 'NEW DIM', unit: 'mm', decimals: 0 };
    const updatedDefs = [...dimensionDefs, newDef];
    const updatedSizes = { ...sizes };
    for (const s of Object.keys(updatedSizes)) {
      updatedSizes[s] = {
        ...updatedSizes[s],
        dimensions: { ...updatedSizes[s].dimensions, [newId]: { minSpec: '', tolerance: '' } }
      };
    }
    triggerChange({ dimensionDefs: updatedDefs, sizes: updatedSizes });
    setEditingDim({ id: newId, name: 'NEW DIM', unit: 'mm' });
  };

  const handleSaveDimension = () => {
    if (!editingDim) return;
    const { id, name, unit } = editingDim;
    if (!name.trim()) return;
    const updatedDefs = dimensionDefs.map(d => d.id === id ? { ...d, name, unit } : d);
    triggerChange({ dimensionDefs: updatedDefs });
    setEditingDim(null);
  };

  /**
   * Flips one custom dimension between Graded and Record-only.
   *
   * Toggling to Record-only WRITES `isGraded: false`. Toggling back REMOVES
   * the key rather than writing `isGraded: true` — so a def that was flipped
   * and flipped back is byte-identical to how it started. That matters twice:
   * ProductEngine's `actuallyChanged` JSON comparison then correctly reports
   * "nothing changed" (no spurious lastAmended stamp, no dirty page), and the
   * server's locked-code deep diff sees no phantom field. See
   * isDimensionGraded() for why the default is never materialized.
   *
   * Purely a mode flag: no minSpec or tolerance is read, written, cleared or
   * zeroed here, in either direction, however many times it is toggled.
   */
  /**
   * Same toggle rule as handleToggleGraded, but for the fixed GLOVE LENGTH /
   * PALM WIDTH rows, whose graded flag lives directly on ProductConfig
   * (lengthIsGraded/palmWidthIsGraded) rather than inside a dimensionDefs
   * array element. Reverting to Graded sends `undefined` for the field —
   * JSON.stringify/JSON serialization drops an undefined-valued key
   * entirely, the same net effect as handleToggleGraded's rest-destructure,
   * so a toggle-then-toggle-back round-trip is still byte-identical.
   */
  const handleToggleFixedGraded = (field: 'lengthIsGraded' | 'palmWidthIsGraded') => {
    if (isReadOnly) return;
    const graded = isDimensionGraded({ isGraded: config[field] });
    triggerChange({ [field]: graded ? false : undefined });
  };

  const handleToggleGraded = (dimId: string) => {
    if (isReadOnly) return;
    const updatedDefs = dimensionDefs.map(d => {
      if (d.id !== dimId) return d;
      if (isDimensionGraded(d)) return { ...d, isGraded: false };
      const { isGraded: _dropped, ...rest } = d;
      return rest as ProductDimensionDef;
    });
    triggerChange({ dimensionDefs: updatedDefs });
  };

  const handleRemoveDimension = (id: string) => {
    const updatedDefs = dimensionDefs.filter(d => d.id !== id);
    const updatedSizes = { ...sizes };
    for (const s of Object.keys(updatedSizes)) {
      const newDims = { ...updatedSizes[s].dimensions };
      delete newDims[id];
      updatedSizes[s] = { ...updatedSizes[s], dimensions: newDims };
    }
    triggerChange({ dimensionDefs: updatedDefs, sizes: updatedSizes });
    if (editingDim?.id === id) setEditingDim(null);
  };

  const handleUpdateFixed = (sizeKey: string, field: 'weightTarget' | 'weightTolerance' | 'lengthTarget' | 'lengthTolerance' | 'palmWidthTarget' | 'palmWidthTolerance', val: string) => {
    if (!sizes[sizeKey]) return;
    const updatedSizes = { ...sizes };
    if (field === 'lengthTarget' || field === 'lengthTolerance') {
      Object.keys(updatedSizes).forEach(k => {
        updatedSizes[k] = { ...updatedSizes[k], [field]: val };
      });
    } else {
      updatedSizes[sizeKey] = { ...updatedSizes[sizeKey], [field]: val };
    }
    triggerChange({ sizes: updatedSizes });
  };

  const handleUpdateDimensionValue = (sizeKey: string, dimId: string, field: keyof ProductDimensionValue, val: string) => {
    if (!sizes[sizeKey]) return;
    const updatedSizes = { ...sizes };
    const dims = { ...updatedSizes[sizeKey].dimensions };
    dims[dimId] = { ...(dims[dimId] || { minSpec: '', tolerance: '' }), [field]: val };
    updatedSizes[sizeKey] = { ...updatedSizes[sizeKey], dimensions: dims };
    triggerChange({ sizes: updatedSizes });
  };

  // ── Zero-graded-dimensions warning ──────────────────────────────────────
  // Glove Weight is always graded (no isGraded/record-only mode exists for
  // it), so it's excluded here — a product can never reach "zero graded
  // across all 7"; this checks only the 6 toggleable fields (Length, Palm
  // Width, and every dim in the merged list — Cuff/Palm/Finger plus Beading
  // if the product has it). Non-blocking: informational only, never
  // prevents Save.
  const allTogglableFieldsRecordOnly =
    !isDimensionGraded({ isGraded: config.lengthIsGraded }) &&
    !isDimensionGraded({ isGraded: config.palmWidthIsGraded }) &&
    dimensionDefs.length > 0 &&
    dimensionDefs.every((d) => !isDimensionGraded(d));

  return (
    <div className="bg-canvas border-t border-gray-800 p-4 animate-in slide-in-from-top-2 space-y-3">
      {allTogglableFieldsRecordOnly && (
        <div className="p-3 rounded-lg border border-l-4 border-amber-500/30 border-l-amber-500 bg-amber-500/5 flex gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
              ALL DIMENSIONS ARE RECORD-ONLY
            </p>
            <p className="text-xs text-muted mt-1">
              Every gradeable dimension on this product (Glove Length, Palm Width, and all
              custom dimensions) is set to Record-only. Measurements will still be captured,
              but no physical dimension can fail this product's verdict. This does not block
              saving — confirm this is intentional.
            </p>
          </div>
        </div>
      )}
      <div className="w-full overflow-x-auto bg-surface border border-gray-800 rounded-xl shadow-xl">
        <table className="w-full table-fixed text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-canvas border-b border-gray-800">
              <th className="py-2.5 px-3 border-r border-gray-800/50 w-[16%]"></th>
              <th className="py-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted text-center border-r border-gray-800/50 w-[6%] overflow-hidden">UOM</th>
              
              {STANDARD_SIZES.map(size => {
                const isActive = !!sizes[size];
                
                return (
                  <React.Fragment key={size}>
                    <th className={`py-2.5 px-1 text-xs font-semibold uppercase tracking-wider border-r border-gray-800/50 text-center relative transition-colors w-[8%] overflow-hidden ${isActive ? 'text-primary bg-surface' : 'text-gray-600 bg-canvas/30'}`}>
                      <div className="flex flex-col items-center justify-center gap-1">
                        {!isReadOnly && (
                          <button 
                            onClick={() => handleToggleSize(size)}
                            className="outline-none"
                            title={isActive ? `Disable ${size}` : `Enable ${size}`}
                          >
                            {isActive ? (
                              <ToggleRight className="w-6 h-6 text-brand-secondary hover:text-emerald-400 transition-colors" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-gray-600 hover:text-gray-400 transition-colors" />
                            )}
                          </button>
                        )}
                        <span>{size}</span>
                      </div>
                    </th>
                    <th className={`py-2.5 px-1 text-xs font-semibold uppercase tracking-wider border-r border-gray-800/50 text-center transition-colors w-[5%] overflow-hidden ${isActive ? 'text-muted bg-surface' : 'text-gray-700 bg-canvas/30'}`}>&plusmn; TOL</th>
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            
            {/* GLOVE WEIGHT */}
            <tr className="hover:bg-surface-light/40 transition-colors border-b border-gray-800/50">
              <td className="py-2.5 px-3 border-r border-gray-800/50 text-sm font-semibold text-brand-secondary uppercase">
                GLOVE WEIGHT
              </td>
              <td className="py-2 px-2 border-r border-gray-800/50 text-center align-top">
                <span className="text-[11px] font-bold uppercase text-muted font-mono block">gram</span>
                <FormatSelect
                  value={config.weightDecimals ?? 0}
                  onChange={dec => handleFixedRowFormatChange('weightDecimals', 'weightTarget', 'weightTolerance', dec)}
                />
              </td>
              
              {STANDARD_SIZES.map(size => {
                const isActive = !!sizes[size];
                const wgtTarget = sizes[size]?.weightTarget || '';
                const wgtTol = sizes[size]?.weightTolerance || '';

                return (
                  <React.Fragment key={size}>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${isActive ? 'bg-canvas/10' : 'bg-canvas/50'}`}>
                      <input 
                        type="text"
                        value={wgtTarget}
                        disabled={!isActive || isReadOnly}
                        onChange={e => handleUpdateFixed(size, 'weightTarget', formatTarget(e.target.value))}
                        onFocus={handleFocusSnapshot}
                        onBlur={e => handleRoundOnBlur(e, config.weightDecimals ?? 0, v => handleUpdateFixed(size, 'weightTarget', v))}
                        className={`w-full h-9 rounded-md px-2 text-sm font-mono text-center outline-none transition-all ${
                          isActive 
                            ? 'bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary text-primary' 
                            : 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                        }`}
                      />
                    </td>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${!isActive ? 'bg-canvas/50' : 'bg-canvas/10'}`}>
                      <input 
                        type="text"
                        value={wgtTol}
                        disabled={!isActive || isReadOnly}
                        onChange={e => handleUpdateFixed(size, 'weightTolerance', formatTolerance(e.target.value))}
                        onFocus={handleFocusSnapshot}
                        onBlur={e => handleRoundOnBlur(e, config.weightDecimals ?? 0, v => handleUpdateFixed(size, 'weightTolerance', v))}
                        className={`w-full h-9 rounded-md px-1 text-sm font-mono text-center outline-none transition-all ${
                          isActive 
                            ? `bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary ${wgtTol.toUpperCase() === 'MIN' ? 'text-rose-400 font-bold' : 'text-primary'}` 
                            : 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                        }`}
                      />
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {/* GLOVE LENGTH */}
            {(() => {
              const lengthGraded = isDimensionGraded({ isGraded: config.lengthIsGraded });
              return (
            <tr className="hover:bg-surface-light/40 transition-colors border-b border-gray-800/50">
              <td className="py-2.5 px-3 border-r border-gray-800/50 text-sm font-semibold text-brand-secondary uppercase">
                <span className="flex items-center gap-2">
                  GLOVE LENGTH
                  <button
                    onClick={() => handleToggleFixedGraded('lengthIsGraded')}
                    disabled={isReadOnly}
                    className={`w-6 h-6 rounded flex items-center justify-center shrink-0 outline-none transition-colors ${
                      isReadOnly
                        ? `cursor-default ${lengthGraded ? 'text-emerald-400/60' : 'text-gray-500'}`
                        : lengthGraded
                          ? 'text-emerald-400 hover:bg-emerald-500/20'
                          : 'text-gray-400 hover:bg-gray-500/20'
                    }`}
                    title={isReadOnly
                      ? (lengthGraded ? 'Graded' : 'Record-only')
                      : lengthGraded
                        ? 'Graded — click to make Record-only'
                        : 'Record-only — click to make Graded'}
                  >
                    {lengthGraded ? <Ruler className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </span>
              </td>
              <td className="py-2 px-2 border-r border-gray-800/50 text-center align-top">
                <span className="text-[11px] font-bold uppercase text-muted font-mono block">mm</span>
                <FormatSelect
                  value={config.lengthDecimals ?? 0}
                  onChange={dec => handleFixedRowFormatChange('lengthDecimals', 'lengthTarget', 'lengthTolerance', dec)}
                />
              </td>

              {STANDARD_SIZES.map(size => {
                const isActive = !!sizes[size];
                const lenTarget = sizes[size]?.lengthTarget || '';
                const lenTol = sizes[size]?.lengthTolerance || '';
                const specDisabled = !isActive || isReadOnly || !lengthGraded;

                return (
                  <React.Fragment key={size}>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${isActive ? 'bg-canvas/10' : 'bg-canvas/50'}`}>
                      <input
                        type="text"
                        value={lenTarget}
                        disabled={specDisabled}
                        title={!lengthGraded ? 'Record-only — this dimension is not graded, so its spec is not applied' : undefined}
                        onChange={e => handleUpdateFixed(size, 'lengthTarget', formatTarget(e.target.value))}
                        onFocus={handleFocusSnapshot}
                        onBlur={e => handleRoundOnBlur(e, config.lengthDecimals ?? 0, v => handleUpdateFixed(size, 'lengthTarget', v))}
                        className={`w-full h-9 rounded-md px-2 text-sm font-mono text-center outline-none transition-all ${
                          !isActive
                            ? 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                            : !lengthGraded
                              ? 'bg-canvas/40 border border-gray-800 text-gray-600 cursor-not-allowed'
                              : 'bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary text-primary'
                        }`}
                      />
                    </td>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${!isActive ? 'bg-canvas/50' : 'bg-canvas/10'}`}>
                      <input
                        type="text"
                        value={lenTol}
                        disabled={specDisabled}
                        title={!lengthGraded ? 'Record-only — this dimension is not graded, so its spec is not applied' : undefined}
                        onChange={e => handleUpdateFixed(size, 'lengthTolerance', formatTolerance(e.target.value))}
                        onFocus={handleFocusSnapshot}
                        onBlur={e => handleRoundOnBlur(e, config.lengthDecimals ?? 0, v => handleUpdateFixed(size, 'lengthTolerance', v))}
                        className={`w-full h-9 rounded-md px-1 text-sm font-mono text-center outline-none transition-all ${
                          !isActive
                            ? 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                            : !lengthGraded
                              ? 'bg-canvas/40 border border-gray-800 text-gray-600 cursor-not-allowed'
                              : `bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary ${lenTol.toUpperCase() === 'MIN' ? 'text-rose-400 font-bold' : 'text-primary'}`
                        }`}
                      />
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
              );
            })()}

            {/* PALM WIDTH */}
            {(() => {
              const palmGraded = isDimensionGraded({ isGraded: config.palmWidthIsGraded });
              return (
            <tr className="hover:bg-surface-light/40 transition-colors border-b border-gray-800/50">
              <td className="py-2.5 px-3 border-r border-gray-800/50 text-sm font-semibold text-brand-secondary uppercase">
                <span className="flex items-center gap-2">
                  PALM WIDTH
                  <button
                    onClick={() => handleToggleFixedGraded('palmWidthIsGraded')}
                    disabled={isReadOnly}
                    className={`w-6 h-6 rounded flex items-center justify-center shrink-0 outline-none transition-colors ${
                      isReadOnly
                        ? `cursor-default ${palmGraded ? 'text-emerald-400/60' : 'text-gray-500'}`
                        : palmGraded
                          ? 'text-emerald-400 hover:bg-emerald-500/20'
                          : 'text-gray-400 hover:bg-gray-500/20'
                    }`}
                    title={isReadOnly
                      ? (palmGraded ? 'Graded' : 'Record-only')
                      : palmGraded
                        ? 'Graded — click to make Record-only'
                        : 'Record-only — click to make Graded'}
                  >
                    {palmGraded ? <Ruler className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </span>
              </td>
              <td className="py-2 px-2 border-r border-gray-800/50 text-center align-top">
                <span className="text-[11px] font-bold uppercase text-muted font-mono block">mm</span>
                <FormatSelect
                  value={config.palmWidthDecimals ?? 0}
                  onChange={dec => handleFixedRowFormatChange('palmWidthDecimals', 'palmWidthTarget', 'palmWidthTolerance', dec)}
                />
              </td>

              {STANDARD_SIZES.map(size => {
                const isActive = !!sizes[size];
                const palmTarget = sizes[size]?.palmWidthTarget || '';
                const palmTol = sizes[size]?.palmWidthTolerance || '';
                const specDisabled = !isActive || isReadOnly || !palmGraded;

                return (
                  <React.Fragment key={size}>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${isActive ? 'bg-canvas/10' : 'bg-canvas/50'}`}>
                      <input
                        type="text"
                        value={palmTarget}
                        disabled={specDisabled}
                        title={!palmGraded ? 'Record-only — this dimension is not graded, so its spec is not applied' : undefined}
                        onChange={e => handleUpdateFixed(size, 'palmWidthTarget', formatTarget(e.target.value))}
                        onFocus={handleFocusSnapshot}
                        onBlur={e => handleRoundOnBlur(e, config.palmWidthDecimals ?? 0, v => handleUpdateFixed(size, 'palmWidthTarget', v))}
                        className={`w-full h-9 rounded-md px-2 text-sm font-mono text-center outline-none transition-all ${
                          !isActive
                            ? 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                            : !palmGraded
                              ? 'bg-canvas/40 border border-gray-800 text-gray-600 cursor-not-allowed'
                              : 'bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary text-primary'
                        }`}
                      />
                    </td>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${!isActive ? 'bg-canvas/50' : 'bg-canvas/10'}`}>
                      <input
                        type="text"
                        value={palmTol}
                        disabled={specDisabled}
                        title={!palmGraded ? 'Record-only — this dimension is not graded, so its spec is not applied' : undefined}
                        onChange={e => handleUpdateFixed(size, 'palmWidthTolerance', formatTolerance(e.target.value))}
                        onFocus={handleFocusSnapshot}
                        onBlur={e => handleRoundOnBlur(e, config.palmWidthDecimals ?? 0, v => handleUpdateFixed(size, 'palmWidthTolerance', v))}
                        className={`w-full h-9 rounded-md px-1 text-sm font-mono text-center outline-none transition-all ${
                          !isActive
                            ? 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                            : !palmGraded
                              ? 'bg-canvas/40 border border-gray-800 text-gray-600 cursor-not-allowed'
                              : `bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary ${palmTol.toUpperCase() === 'MIN' ? 'text-rose-400 font-bold' : 'text-primary'}`
                        }`}
                      />
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
              );
            })()}

            {/* DYNAMIC DIMENSIONS */}
            {dimensionDefs.map((def, index) => {
              const isEditing = editingDim?.id === def.id;
              const graded = isDimensionGraded(def);
              // Cuff/Palm/Finger Thickness are permanent, non-deletable slots
              // (Beading Thickness is NOT one of these and keeps its Trash
              // button). Rename is also hidden for them: the merge above
              // identifies canonical presence by normalized NAME, so renaming
              // one away from its canonical name would make the next merge
              // pass think it's missing and inject a duplicate.
              const isCanonical = isCanonicalThicknessDim(def);

              return (
                <tr key={def.id} className="hover:bg-surface-light/40 transition-colors group/row">
                  <td className="py-2.5 px-3 border-r border-gray-800/50 relative">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingDim.name}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveDimension();
                              if (e.key === 'Escape') setEditingDim(null);
                            }}
                            onChange={e => setEditingDim({ ...editingDim, name: e.target.value.toUpperCase() })}
                            className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none uppercase"
                          />
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={handleSaveDimension} className="w-7 h-7 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingDim(null)} className="w-7 h-7 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {/* Full labeled grading-mode toggle — the expanded
                            counterpart to the icon-only control shown on the
                            collapsed row. Commits immediately via
                            triggerChange, exactly like the format dropdown
                            beside it; it is not staged through editingDim,
                            which only carries name/unit. */}
                        <button
                          onClick={() => handleToggleGraded(def.id)}
                          className={`w-full h-8 rounded flex items-center justify-center gap-1.5 border text-[10px] font-bold uppercase tracking-wider transition-colors outline-none ${
                            graded
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-gray-500/10 border-gray-500/30 text-gray-400 hover:bg-gray-500/20'
                          }`}
                          title={graded
                            ? 'Graded — measurements are checked against this row’s spec. Click to make Record-only.'
                            : 'Record-only — measurements are captured but never graded. Click to make Graded.'}
                        >
                          {graded ? <Ruler className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>{graded ? 'Graded' : 'Record-only'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-primary uppercase flex items-center gap-2">
                          {def.name}
                          {/* Icon-only grading-mode toggle. Deliberately NOT
                              inside the hover-reveal action group below: this
                              is a persistent mode INDICATOR, and which
                              dimensions are record-only must be legible at a
                              glance. On a locked/read-only code it renders as
                              a static, non-interactive icon rather than
                              disappearing, so the mode stays visible even
                              where it cannot be changed. */}
                          <button
                            onClick={() => handleToggleGraded(def.id)}
                            disabled={isReadOnly}
                            className={`w-6 h-6 rounded flex items-center justify-center shrink-0 outline-none transition-colors ${
                              isReadOnly
                                ? `cursor-default ${graded ? 'text-emerald-400/60' : 'text-gray-500'}`
                                : graded
                                  ? 'text-emerald-400 hover:bg-emerald-500/20'
                                  : 'text-gray-400 hover:bg-gray-500/20'
                            }`}
                            title={isReadOnly
                              ? (graded ? 'Graded' : 'Record-only')
                              : graded
                                ? 'Graded — click to make Record-only'
                                : 'Record-only — click to make Graded'}
                          >
                            {graded ? <Ruler className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </span>
                        {!isReadOnly && (
                          <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleMoveDimension(index, 'up')} 
                              disabled={index === 0}
                              className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted outline-none"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => handleMoveDimension(index, 'down')} 
                              disabled={index === dimensionDefs.length - 1}
                              className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted outline-none"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            {!isCanonical && (
                              <button onClick={() => setEditingDim(def)} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white hover:bg-gray-800 outline-none">
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                            {!isCanonical && (
                              <button onClick={() => handleRemoveDimension(def.id)} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-rose-400 hover:bg-rose-500/10 outline-none">
                                <Trash className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 border-r border-gray-800/50 text-center align-top">
                    {isEditing ? (
                      <input 
                        type="text"
                        value={editingDim.unit}
                        onChange={e => setEditingDim({ ...editingDim, unit: e.target.value })}
                        className="w-full h-9 min-w-[40px] px-1 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary text-center outline-none"
                      />
                    ) : (
                      <span className="text-[11px] font-bold text-muted uppercase font-mono block">{def.unit}</span>
                    )}
                    <FormatSelect
                      value={def.decimals ?? 0}
                      onChange={dec => handleDimFormatChange(def.id, dec)}
                    />
                  </td>

                  {STANDARD_SIZES.map(size => {
                    const isActive = !!sizes[size];
                    const dimVal = sizes[size]?.dimensions[def.id] || { minSpec: '', tolerance: '' };
                    // Record-only greys out the spec inputs but never hides or
                    // clears them: the stored numbers stay on screen and in the
                    // data, so flipping back to Graded restores the exact spec
                    // with nothing retyped. `isReadOnly` (the locked-code
                    // freeze) is a separate, independent reason to disable.
                    const specDisabled = !isActive || isReadOnly || !graded;

                    return (
                      <React.Fragment key={`${size}-${def.id}`}>
                        <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${isActive ? 'bg-brand-primary/5' : 'bg-canvas/50'}`}>
                          <input
                            type="text"
                            value={dimVal.minSpec}
                            disabled={specDisabled}
                            title={!graded ? 'Record-only — this dimension is not graded, so its spec is not applied' : undefined}
                            onChange={e => handleUpdateDimensionValue(size, def.id, 'minSpec', formatTarget(e.target.value))}
                            onFocus={handleFocusSnapshot}
                            onBlur={e => handleRoundOnBlur(e, def.decimals ?? 0, v => handleUpdateDimensionValue(size, def.id, 'minSpec', v))}
                            className={`w-full h-9 rounded-md px-2 text-sm font-mono text-center outline-none transition-all ${
                              !isActive
                                ? 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                                : !graded
                                  ? 'bg-canvas/40 border border-gray-800 text-gray-600 cursor-not-allowed'
                                  : 'bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary text-primary'
                            }`}
                          />
                        </td>
                        <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${!isActive ? 'bg-canvas/50' : 'bg-surface'}`}>
                          <input
                            type="text"
                            value={dimVal.tolerance}
                            disabled={specDisabled}
                            title={!graded ? 'Record-only — this dimension is not graded, so its spec is not applied' : undefined}
                            onChange={e => handleUpdateDimensionValue(size, def.id, 'tolerance', formatTolerance(e.target.value))}
                            onFocus={handleFocusSnapshot}
                            onBlur={e => handleRoundOnBlur(e, def.decimals ?? 0, v => handleUpdateDimensionValue(size, def.id, 'tolerance', v))}
                            className={`w-full h-9 rounded-md px-1 text-sm font-mono text-center outline-none transition-all ${
                              !isActive
                                ? 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                                : !graded
                                  ? 'bg-canvas/40 border border-gray-800 text-gray-600 cursor-not-allowed'
                                  : `bg-canvas border border-gray-700 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary ${dimVal.tolerance.toUpperCase() === 'MIN' ? 'text-rose-400 font-bold' : 'text-primary'}`
                            }`}
                          />
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
            
            {/* ADD NEW DIMENSION ROW */}
            {!isReadOnly && (
              <tr>
                <td colSpan={2 + STANDARD_SIZES.length * 2} className="p-0">
                  <button 
                    onClick={handleAddDimension}
                    className="w-full h-12 rounded border border-dashed border-gray-700 bg-transparent text-muted hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none"
                  >
                    <Plus className="w-4 h-4" strokeWidth={2} />
                    <span>ADD</span>
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

