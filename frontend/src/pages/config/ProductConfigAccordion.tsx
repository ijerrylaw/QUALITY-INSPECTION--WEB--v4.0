import React, { useState } from 'react';
import { Plus, Edit2, Trash, Check, X, ToggleLeft, ToggleRight, ArrowUp, ArrowDown } from 'lucide-react';
import type { ProductConfig, ProductDimensionDef, ProductDimensionValue } from '../../context/ConfigContext';

interface Props {
  config: ProductConfig;
  onChange: (newConfig: ProductConfig) => void;
  isReadOnly?: boolean;
}

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export function ProductConfigAccordion({ config, onChange, isReadOnly = false }: Props) {
  const dimensionDefs = config.dimensionDefs || [];
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

  const applyDecimalsToValue = (v: string, dec: number) => {
    if (!v || v.toUpperCase() === 'MIN') return v;
    const n = parseFloat(v);
    return isNaN(n) ? v : n.toFixed(dec);
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

  return (
    <div className="bg-canvas border-t border-gray-800 p-6 animate-in slide-in-from-top-2">
      <div className="w-full overflow-x-auto bg-surface border border-gray-800 rounded-xl shadow-xl">
        <table className="w-full table-fixed text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-canvas border-b border-gray-800">
              <th className="py-2.5 px-3 border-r border-gray-800/50 w-[16%]"></th>
              <th className="py-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-muted font-mono text-center border-r border-gray-800/50 w-[6%] overflow-hidden">UOM</th>
              
              {STANDARD_SIZES.map(size => {
                const isActive = !!sizes[size];
                
                return (
                  <React.Fragment key={size}>
                    <th className={`py-2.5 px-1 text-[11px] font-bold uppercase tracking-wider border-r border-gray-800/50 text-center relative font-mono transition-colors w-[8%] overflow-hidden ${isActive ? 'text-primary bg-surface' : 'text-gray-600 bg-canvas/30'}`}>
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
                    <th className={`py-2.5 px-1 text-[11px] font-bold uppercase tracking-wider border-r border-gray-800/50 text-center font-mono transition-colors w-[5%] overflow-hidden ${isActive ? 'text-muted bg-surface' : 'text-gray-700 bg-canvas/30'}`}>&plusmn; TOL</th>
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
                        onChange={e => handleUpdateFixed(size, 'weightTarget', e.target.value)}
                        className={`w-full h-9 rounded-md px-2 text-xs font-mono text-center outline-none transition-all ${
                          isActive 
                            ? 'bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 text-primary' 
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
                        className={`w-full h-9 rounded-md px-1 text-xs font-mono text-center outline-none transition-all ${
                          isActive 
                            ? `bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 ${wgtTol.toUpperCase() === 'MIN' ? 'text-rose-400 font-bold' : 'text-primary'}` 
                            : 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                        }`}
                      />
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {/* GLOVE LENGTH */}
            <tr className="hover:bg-surface-light/40 transition-colors border-b border-gray-800/50">
              <td className="py-2.5 px-3 border-r border-gray-800/50 text-sm font-semibold text-brand-secondary uppercase">
                GLOVE LENGTH
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

                return (
                  <React.Fragment key={size}>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${isActive ? 'bg-canvas/10' : 'bg-canvas/50'}`}>
                      <input 
                        type="text"
                        value={lenTarget}
                        disabled={!isActive || isReadOnly}
                        onChange={e => handleUpdateFixed(size, 'lengthTarget', e.target.value)}
                        className={`w-full h-9 rounded-md px-2 text-xs font-mono text-center outline-none transition-all ${
                          isActive 
                            ? 'bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 text-primary' 
                            : 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                        }`}
                      />
                    </td>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${!isActive ? 'bg-canvas/50' : 'bg-canvas/10'}`}>
                      <input 
                        type="text"
                        value={lenTol}
                        disabled={!isActive || isReadOnly}
                        onChange={e => handleUpdateFixed(size, 'lengthTolerance', formatTolerance(e.target.value))}
                        className={`w-full h-9 rounded-md px-1 text-xs font-mono text-center outline-none transition-all ${
                          isActive 
                            ? `bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 ${lenTol.toUpperCase() === 'MIN' ? 'text-rose-400 font-bold' : 'text-primary'}` 
                            : 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                        }`}
                      />
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {/* PALM WIDTH */}
            <tr className="hover:bg-surface-light/40 transition-colors border-b border-gray-800/50">
              <td className="py-2.5 px-3 border-r border-gray-800/50 text-sm font-semibold text-brand-secondary uppercase">
                PALM WIDTH
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

                return (
                  <React.Fragment key={size}>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${isActive ? 'bg-canvas/10' : 'bg-canvas/50'}`}>
                      <input 
                        type="text"
                        value={palmTarget}
                        disabled={!isActive || isReadOnly}
                        onChange={e => handleUpdateFixed(size, 'palmWidthTarget', e.target.value)}
                        className={`w-full h-9 rounded-md px-2 text-xs font-mono text-center outline-none transition-all ${
                          isActive 
                            ? 'bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 text-primary' 
                            : 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                        }`}
                      />
                    </td>
                    <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${!isActive ? 'bg-canvas/50' : 'bg-canvas/10'}`}>
                      <input 
                        type="text"
                        value={palmTol}
                        disabled={!isActive || isReadOnly}
                        onChange={e => handleUpdateFixed(size, 'palmWidthTolerance', formatTolerance(e.target.value))}
                        className={`w-full h-9 rounded-md px-1 text-xs font-mono text-center outline-none transition-all ${
                          isActive 
                            ? `bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 ${palmTol.toUpperCase() === 'MIN' ? 'text-rose-400 font-bold' : 'text-primary'}` 
                            : 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                        }`}
                      />
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {/* DYNAMIC DIMENSIONS */}
            {dimensionDefs.map((def, index) => {
              const isEditing = editingDim?.id === def.id;

              return (
                <tr key={def.id} className="hover:bg-surface-light/40 transition-colors group/row">
                  <td className="py-2.5 px-3 border-r border-gray-800/50 relative">
                    {isEditing ? (
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
                          className="w-full bg-canvas border border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded px-2 h-7 text-sm font-semibold text-primary outline-none uppercase"
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
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-primary uppercase">{def.name}</span>
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
                            <button onClick={() => setEditingDim(def)} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white hover:bg-gray-800 outline-none">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleRemoveDimension(def.id)} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-rose-400 hover:bg-rose-500/10 outline-none">
                              <Trash className="w-3 h-3" />
                            </button>
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
                        className="w-full min-w-[40px] bg-canvas border border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded px-1 h-7 text-[11px] font-bold text-primary text-center outline-none"
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
                    
                    return (
                      <React.Fragment key={`${size}-${def.id}`}>
                        <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${isActive ? 'bg-brand-primary/5' : 'bg-canvas/50'}`}>
                          <input 
                            type="text"
                            value={dimVal.minSpec}
                            disabled={!isActive || isReadOnly}
                            onChange={e => handleUpdateDimensionValue(size, def.id, 'minSpec', e.target.value)}
                            className={`w-full h-9 rounded-md px-2 text-xs font-mono text-center outline-none transition-all ${
                              isActive
                                ? 'bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 text-primary'
                                : 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
                            }`}
                          />
                        </td>
                        <td className={`py-2.5 px-2 border-r border-gray-800/50 transition-colors ${!isActive ? 'bg-canvas/50' : 'bg-surface'}`}>
                          <input 
                            type="text"
                            value={dimVal.tolerance}
                            disabled={!isActive || isReadOnly}
                            onChange={e => handleUpdateDimensionValue(size, def.id, 'tolerance', formatTolerance(e.target.value))}
                            className={`w-full h-9 rounded-md px-1 text-xs font-mono text-center outline-none transition-all ${
                              isActive
                                ? `bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 ${dimVal.tolerance.toUpperCase() === 'MIN' ? 'text-rose-400 font-bold' : 'text-primary'}`
                                : 'bg-transparent border-transparent text-gray-700 cursor-not-allowed'
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
                    className="w-full h-12 flex items-center justify-center text-xs font-semibold text-muted hover:text-brand-secondary hover:bg-surface-light/40 uppercase gap-2 transition-colors outline-none"
                  >
                    <Plus className="w-4 h-4" /> ADD NEW DIMENSION
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
