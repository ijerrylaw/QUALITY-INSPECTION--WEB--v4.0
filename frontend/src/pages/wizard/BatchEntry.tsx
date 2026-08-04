import React, { useState, useEffect, useMemo } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../components/ui/ToastProvider';
import {
  Layers, ShieldCheck, Barcode, Scaling, Activity, Calendar,
  Hash, Box, CheckCircle2, XCircle, Plus, ChevronRight, Edit2,
  Ruler, AlertTriangle, Trash2
} from 'lucide-react';

interface BatchLotRow {
  id: string; // unique internal id for React keys
  sequenceNo: string;
  side: string;
  totalCarton: string;
  sampleSize: string;
  // Dimensions data: dimId -> array of 5 sample strings
  dimensions: Record<string, string[]>;
  dirtySlots?: Record<string, boolean[]>;
  // Visual defects data: defectId -> tally count
  defects: Record<string, number>;
}

// ── SUBCOMPONENTS ──────────────────────────────────────────────────────────

function BatchModalDimensions({ row, updateRow, config, productCode, size }: any) {
  const sizeEntry = config?.productMatrixConfig?.[productCode]?.sizes?.[size] ?? null;
  const matrixEntry = config?.productMatrixConfig?.[productCode];
  
  const activeDimensions = React.useMemo(() => {
    return [
      {
        id:       '__fixed_length__',
        name:     'GLOVE LENGTH',
        unit:     'mm',
        isMin:    false,
        decimals: matrixEntry?.lengthDecimals ?? 0,
      },
      {
        id:       '__fixed_palm__',
        name:     'PALM WIDTH',
        unit:     'mm',
        isMin:    false,
        decimals: matrixEntry?.palmWidthDecimals ?? 0,
      },
      ...(matrixEntry?.dimensionDefs || config?.dimensions || [])
    ];
  }, [matrixEntry, config]);

  const getDimSpec = (dimId: string): { minSpec: number; tolerance: number; isMin: boolean } => {
    if (dimId === '__fixed_length__') {
      const target = parseFloat(sizeEntry?.lengthTarget ?? '0') || 0;
      const tolRaw = sizeEntry?.lengthTolerance ?? '0';
      const isMin  = tolRaw.toUpperCase() === 'MIN';
      return { minSpec: target, tolerance: isMin ? 0 : (parseFloat(tolRaw) || 0), isMin };
    }
    if (dimId === '__fixed_palm__') {
      const target = parseFloat(sizeEntry?.palmWidthTarget ?? '0') || 0;
      const tolRaw = sizeEntry?.palmWidthTolerance ?? '0';
      const isMin  = tolRaw.toUpperCase() === 'MIN';
      return { minSpec: target, tolerance: isMin ? 0 : (parseFloat(tolRaw) || 0), isMin };
    }
    const dimValue = sizeEntry?.dimensions?.[dimId];
    if (dimValue) {
      const tolRaw = dimValue.tolerance ?? '0';
      const isMin  = tolRaw.toUpperCase() === 'MIN';
      return {
        minSpec:   parseFloat(dimValue.minSpec) || 0,
        tolerance: isMin ? 0 : (parseFloat(tolRaw) || 0),
        isMin,
      };
    }
    const dimDef = activeDimensions.find((d: any) => d.id === dimId);
    return {
      minSpec:   parseFloat(dimDef?.minSpec ?? '0') || 0,
      tolerance: parseFloat(dimDef?.tolerance ?? '0') || 0,
      isMin:     false,
    };
  };

  const getDecimalPlaces = (dim: any): number => {
    if (dim.id === '__fixed_length__')  return matrixEntry?.lengthDecimals ?? 0;
    if (dim.id === '__fixed_palm__')    return matrixEntry?.palmWidthDecimals ?? 0;
    if (typeof dim.decimals === 'number') return dim.decimals;
    if (matrixEntry?.sizes) {
      let maxDec = 0;
      Object.values(matrixEntry.sizes).forEach((sc: any) => {
        const dimVal = sc.dimensions?.[dim.id];
        if (dimVal?.minSpec?.includes('.'))  maxDec = Math.max(maxDec, dimVal.minSpec.split('.')[1].length);
        if (dimVal?.tolerance?.includes('.')) maxDec = Math.max(maxDec, dimVal.tolerance.split('.')[1].length);
      });
      if (maxDec > 0) return maxDec;
    }
    return 0;
  };

  // Initialize defaults on mount if empty
  React.useEffect(() => {
    let changed = false;
    const newDims = { ...row.dimensions };
    const newDirty = { ...(row.dirtySlots || {}) };
    
    activeDimensions.forEach((d: any) => {
      if (!newDims[d.id]) {
        const { minSpec } = getDimSpec(d.id);
        const dec = getDecimalPlaces(d);
        newDims[d.id] = Array(5).fill(minSpec > 0 ? minSpec.toFixed(dec) : '');
        newDirty[d.id] = Array(5).fill(false);
        changed = true;
      }
    });
    if (changed) {
      updateRow(row.id, 'dimensions', newDims);
      updateRow(row.id, 'dirtySlots', newDirty);
    }
  }, [activeDimensions, row.id]);

  const handleSlotChange = (dimId: string, index: number, value: string) => {
    const newDims = { ...row.dimensions };
    if (!newDims[dimId]) newDims[dimId] = Array(5).fill('');
    newDims[dimId][index] = value;
    
    const newDirty = { ...(row.dirtySlots || {}) };
    if (!newDirty[dimId]) newDirty[dimId] = Array(5).fill(false);
    newDirty[dimId][index] = true;

    updateRow(row.id, 'dimensions', newDims);
    updateRow(row.id, 'dirtySlots', newDirty);
  };

  const getStep = (dim: any): string => {
    const dec = getDecimalPlaces(dim);
    if (dec === 0) return '1';
    return (1 / Math.pow(10, dec)).toFixed(dec);
  };

  // Calc Stats
  const stats = React.useMemo(() => {
    const calcStats: any = {};
    activeDimensions.forEach((dim: any) => {
      const { minSpec, tolerance, isMin } = getDimSpec(dim.id);
      const threshold    = minSpec > 0 ? minSpec - tolerance : 0;
      const maxThreshold = minSpec > 0 && tolerance > 0 && !isMin ? minSpec + tolerance : Infinity;
      const vals = row.dimensions[dim.id] ?? Array(5).fill('');

      const fails = vals.map((v: string) => {
        const num = parseFloat(v);
        if (isNaN(num)) return false;
        return num < threshold || (!isMin && tolerance > 0 && num > maxThreshold);
      });

      const numVals = vals.map((v: string) => parseFloat(v)).filter((v: number) => !isNaN(v));
      const min = numVals.length > 0 ? Math.min(...numVals) : 0;
      const max = numVals.length > 0 ? Math.max(...numVals) : 0;

      calcStats[dim.id] = { min, max, fails, threshold, maxThreshold, isMin };
    });
    return calcStats;
  }, [row.dimensions, activeDimensions, sizeEntry, matrixEntry]);

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Ruler className="w-5 h-5 text-brand-secondary" />
        <h4 className="text-sm font-bold uppercase tracking-wider text-primary">Dimensions (5 Samples)</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeDimensions.map((dim: any) => {
          const dimStats = stats[dim.id] ?? { min: 0, max: 0, fails: [], threshold: 0, maxThreshold: Infinity, isMin: false };
          const { minSpec, tolerance, isMin: dimIsMin } = getDimSpec(dim.id);
          const effectiveIsMin = dimIsMin || !!dim.isMin;
          const decPlaces = getDecimalPlaces(dim);
          const vals = row.dimensions[dim.id] || Array(5).fill('');
          const dirty = row.dirtySlots?.[dim.id] || Array(5).fill(false);

          return (
            <div key={dim.id} className="bg-surface border border-gray-700/50 rounded-lg p-4 shadow-sm hover:border-gray-700 transition-colors">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-gray-700/50 pb-3 mb-4">
                <span className={`text-sm font-bold uppercase tracking-wider flex items-baseline gap-2 ${dim.id.startsWith('__fixed_') ? 'text-brand-secondary' : 'text-primary'}`}>
                  {dim.name}
                  {minSpec > 0 && (
                    <span className="text-xs font-mono font-normal normal-case text-muted">
                      TARGET: {effectiveIsMin
                        ? `\u2265${minSpec.toFixed(decPlaces)}${dim.unit}`
                        : `${minSpec.toFixed(decPlaces)}${tolerance > 0 ? '\u00b1' + tolerance.toFixed(decPlaces) : ''}${dim.unit}`
                      }
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[10px] uppercase px-2 py-1 rounded-md border ${
                    dimStats.min > 0 && dimStats.min < dimStats.threshold
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold'
                      : 'bg-gray-800/50 border-gray-700/50 text-muted'
                  }`}>
                    MIN: {dimStats.min > 0 ? `${dimStats.min.toFixed(decPlaces)}${dim.unit}` : '\u2014'}
                  </span>
                  {!effectiveIsMin && (
                    <span className={`font-mono text-[10px] uppercase px-2 py-1 rounded-md border ${
                      tolerance > 0 && dimStats.max > 0 && dimStats.max > dimStats.maxThreshold
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold'
                        : 'bg-gray-800/50 border-gray-700/50 text-muted'
                    }`}>
                      MAX: {dimStats.max > 0 ? `${dimStats.max.toFixed(decPlaces)}${dim.unit}` : '\u2014'}
                    </span>
                  )}
                </div>
              </div>

              {/* Grid Inputs */}
              <div className="grid grid-cols-5 gap-1">
                {vals.map((val: string, idx: number) => {
                  const isFail = dimStats.fails[idx] ?? false;
                  const numVal = parseFloat(val);
                  let delta: string | null = null;
                  if (!isNaN(numVal) && isFail) {
                    if (numVal < dimStats.threshold) {
                      delta = (numVal - dimStats.threshold).toFixed(decPlaces);
                    } else if (!effectiveIsMin && tolerance > 0 && numVal > dimStats.maxThreshold) {
                      delta = '+' + (numVal - dimStats.maxThreshold).toFixed(decPlaces);
                    }
                  }

                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <input
                        type="number"
                        step={getStep(dim)}
                        value={val}
                        onChange={(e) => handleSlotChange(dim.id, idx, e.target.value)}
                        onBlur={(e) => {
                          const raw = e.target.value;
                          const n = parseFloat(raw);
                          if (!isNaN(n)) {
                            const snapped = n.toFixed(decPlaces);
                            if (snapped !== raw) handleSlotChange(dim.id, idx, snapped);
                          }
                        }}
                        placeholder={(idx + 1).toString()}
                        className={`w-full h-9 rounded-lg bg-canvas text-center font-mono text-lg shadow-inner transition-all outline-none border focus:ring-1
                          ${isFail
                            ? 'border-rose-500/50 text-rose-400 bg-rose-500/5 focus:ring-rose-500/30'
                            : dirty[idx]
                              ? 'border-gray-700 text-primary focus:border-brand-secondary focus:ring-brand-secondary/30'
                              : 'border-gray-700 text-muted opacity-80 focus:opacity-100 focus:border-brand-secondary focus:ring-brand-secondary/30'
                          }`}
                      />
                      <div className={`mt-0.5 text-[9px] font-mono font-bold tracking-tighter text-rose-500 text-center leading-none ${isFail && delta !== null ? '' : 'invisible'}`}>
                        {isFail && delta !== null ? `${delta}${dim.unit}` : `0.0${dim.unit}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BatchModalVisual({ row, updateRow, config, profileId }: any) {
  const activeProfile = config?.inspectionProfiles?.find((p: any) => p.id === profileId) || config?.inspectionProfiles?.[0];
  const aqlCategories = activeProfile?.aqlCategories || [];
  const defectDefinitions = activeProfile?.defectDefinitions || [];

  const handleIncrement = (defectId: string) => {
    const newDefects = { ...row.defects };
    newDefects[defectId] = (newDefects[defectId] || 0) + 1;
    updateRow(row.id, 'defects', newDefects);
  };

  const handleDecrement = (defectId: string) => {
    const newDefects = { ...row.defects };
    if (newDefects[defectId] > 0) {
      newDefects[defectId] -= 1;
      updateRow(row.id, 'defects', newDefects);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-brand-secondary" />
        <h4 className="text-sm font-bold uppercase tracking-wider text-primary">Visual Defects</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {aqlCategories.map((cat: any) => {
          const catDefects = defectDefinitions.filter((d: any) => d.categoryId === cat.id);
          if (catDefects.length === 0) return null;
          return (
            <div key={cat.id} className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-brand-secondary border-b border-gray-800 pb-1">
                {cat.name}
              </div>
              <div className="space-y-1">
                {catDefects.map((defect: any) => {
                  const count = row.defects[defect.id] || 0;
                  return (
                    <div key={defect.id} className="flex items-center justify-between bg-canvas border border-gray-800 rounded p-2">
                      <span className="text-xs font-semibold text-primary truncate pr-2">{defect.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleDecrement(defect.id)} className="w-6 h-6 rounded bg-surface border border-gray-700 text-muted hover:text-white flex items-center justify-center font-mono font-bold">-</button>
                        <span className="w-6 text-center font-mono text-sm font-bold text-primary">{count}</span>
                        <button onClick={() => handleIncrement(defect.id)} className="w-6 h-6 rounded bg-brand-primary/20 border border-brand-primary/30 text-brand-secondary hover:bg-brand-primary hover:text-white flex items-center justify-center font-mono font-bold">+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MAIN PAGE COMPONENT ───────────────────────────────────────────────────

export function BatchEntry() {
  const { config, isLoading } = useConfig();
  const { addToast } = useToast();

  // --- Shared Metadata ---
  const [profileId, setProfileId] = useState<string>('');
  const [productCode, setProductCode] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [lineId, setLineId] = useState<string>('');
  const [timestamp, setTimestamp] = useState<Date>(new Date());

  // --- Grid State ---
  const [rows, setRows] = useState<BatchLotRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dimensions' | 'visual'>('dimensions');

  // --- Initialize Default Metadata ---
  const availableLines = useMemo(() => config?.lines ?? [], [config?.lines]);
  
  useEffect(() => {
    if (!config) return;
    if (!profileId) {
      const defaultProfile = config.inspectionProfiles?.find((p) => p.isDefault) ?? config.inspectionProfiles?.[0];
      if (defaultProfile) setProfileId(defaultProfile.id);
    }
    if (!productCode && config.productCodes?.[0]) setProductCode(config.productCodes[0]);
    if (!size && config.sizes?.[0]) setSize(config.sizes[0]);
    if (!lineId && availableLines[0]) setLineId(availableLines[0].id);
  }, [config, profileId, productCode, size, lineId, availableLines]);

  // --- Grid Actions ---
  const handleAddRow = () => {
    let nextSeq = '001';
    let prevSampleSize = '125';
    let prevTotalCarton = '18';
    let prevSide = 'A';

    if (rows.length > 0) {
      const lastRow = rows[rows.length - 1];
      const seqNum = parseInt(lastRow.sequenceNo, 10);
      if (!isNaN(seqNum)) {
        nextSeq = String(seqNum + 1).padStart(3, '0');
      }
      prevSampleSize = lastRow.sampleSize;
      prevTotalCarton = lastRow.totalCarton;
      prevSide = lastRow.side;
    } else {
      if (config?.sampleSizes?.length) {
        prevSampleSize = config.sampleSizes.includes(125) ? '125' : String(config.sampleSizes[0]);
      }
      if (config?.sides?.length) {
        prevSide = config.sides[0].id;
      }
    }

    const newRow: BatchLotRow = {
      id: crypto.randomUUID(),
      sequenceNo: nextSeq,
      side: prevSide,
      totalCarton: prevTotalCarton,
      sampleSize: prevSampleSize,
      dimensions: {},
      defects: {}
    };
    setRows([...rows, newRow]);
  };

  const updateRowField = (id: string, field: keyof BatchLotRow, value: any) => {
    setRows(prevRows => prevRows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // --- Detail Modal Variables ---
  const activeRow = rows.find(r => r.id === selectedRowId);

  const generateLotNo = (line: string, ts: Date, seq: string) => {
    if (!line || !ts) return '';
    const dateObj = new Date(ts);
    const YY = dateObj.getFullYear().toString().slice(-2);
    const MM = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const DD = dateObj.getDate().toString().padStart(2, '0');
    const lineStr = line.split(' ')[0].substring(0, 4);
    return `${lineStr}${YY}${MM}${DD}${seq || ''}`;
  };

  // Loading state
  if (isLoading || !config) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-sm font-semibold uppercase tracking-wider text-muted font-mono animate-pulse">
          LOADING BATCH CONFIGURATION...
        </span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 h-full flex flex-col max-h-screen">
      <div className="flex items-center justify-end gap-3 mb-2">
        <button className="h-10 px-6 rounded-lg bg-surface border border-gray-700 text-xs font-bold tracking-wider uppercase hover:bg-surface-light transition-colors">
          SAVE DRAFT
        </button>
        <button className="h-10 px-6 rounded-lg bg-brand-primary text-white text-xs font-bold tracking-wider uppercase hover:opacity-90 transition-opacity">
          SUBMIT BATCH
        </button>
      </div>

      {/* ── SHARED METADATA (Tier 2 Container) ───────────────────────────── */}
      <div className="bg-surface border border-gray-700/50 rounded-lg p-4 shrink-0 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand-secondary mb-3">Shared Batch Metadata</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" /> PROFILE
            </label>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary rounded-lg px-2 text-sm text-primary font-mono outline-none"
            >
              {(config.inspectionProfiles || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Barcode className="w-3 h-3" /> PRODUCT CODE
            </label>
            <select
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
              className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary rounded-lg px-2 text-sm text-primary font-mono outline-none"
            >
              {(config.productCodes || []).map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Scaling className="w-3 h-3" /> SIZE
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary rounded-lg px-2 text-sm text-primary font-mono outline-none"
            >
              {(config.sizes || []).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> LINE
            </label>
            <select
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              className="w-full h-9 bg-canvas border border-gray-700 focus:border-brand-secondary rounded-lg px-2 text-sm text-primary font-mono outline-none"
            >
              {availableLines.map((l: any) => (
                <option key={l.id} value={l.id}>{l.id}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> DATE / SHIFT
            </label>
            <input
              type="datetime-local"
              value={new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              onChange={(e) => { if (e.target.value) setTimestamp(new Date(e.target.value)); }}
              className="w-full h-9 bg-canvas border border-gray-700 rounded-lg text-sm text-primary font-mono px-2 outline-none focus:border-brand-secondary [color-scheme:dark]"
            />
          </div>

        </div>
      </div>

      {/* ── BATCH GRID (Tier 2 Container) ─────────────────────────────────── */}
      <div className="bg-surface border border-gray-700/50 rounded-lg flex flex-col flex-1 min-h-0 shadow-sm">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-surface shrink-0 rounded-t-lg">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">LOT GRID</h2>
            <p className="text-xs text-muted mt-0.5 normal-case">Add lots and click 'Entry' to begin inspection.</p>
          </div>
          <button 
            onClick={handleAddRow}
            className="h-8 px-4 rounded border border-dashed border-gray-600 hover:border-brand-secondary hover:text-brand-secondary hover:bg-brand-primary/10 transition-colors text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> ADD LOT
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-12 text-center">#</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-40 text-center">Lot No</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-20">Seq No</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-20">Side</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-24">Cartons</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-28">Sample</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-32 text-center">DIMENSIONS</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-32 text-center">DEFECTS</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-24 text-center">Status</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-16 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const hasData = Object.keys(row.dimensions).length > 0 || Object.keys(row.defects).length > 0;
                const lotNumber = generateLotNo(lineId, timestamp, row.sequenceNo);
                
                return (
                  <tr key={row.id} className="border-b border-gray-800/50 hover:bg-surface-light group">
                    <td className="py-2 px-3 text-center text-xs font-mono text-muted">{index + 1}</td>
                    <td className="py-2 px-3 text-center text-sm font-mono font-bold text-brand-secondary">{lotNumber}</td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={row.sequenceNo}
                        onChange={(e) => updateRowField(row.id, 'sequenceNo', e.target.value.replace(/\D/g, ''))}
                        onBlur={(e) => updateRowField(row.id, 'sequenceNo', e.target.value.padStart(3, '0'))}
                        className="w-16 h-8 px-2 bg-canvas border border-gray-700 rounded text-sm text-primary font-mono focus:border-brand-secondary outline-none"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={row.side}
                        onChange={(e) => updateRowField(row.id, 'side', e.target.value)}
                        className="w-16 h-8 px-1 bg-canvas border border-gray-700 rounded text-sm text-primary font-mono focus:border-brand-secondary outline-none appearance-none"
                      >
                        {(config.sides || []).map((s: any) => (
                          <option key={s.id} value={s.id}>{s.id}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={row.totalCarton}
                        onChange={(e) => updateRowField(row.id, 'totalCarton', e.target.value.replace(/\D/g, ''))}
                        className="w-16 h-8 px-2 bg-canvas border border-gray-700 rounded text-sm text-primary font-mono focus:border-brand-secondary outline-none"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={row.sampleSize}
                        onChange={(e) => updateRowField(row.id, 'sampleSize', e.target.value)}
                        className="w-20 h-8 px-1 bg-canvas border border-gray-700 rounded text-sm text-primary font-mono focus:border-brand-secondary outline-none"
                      >
                        {(config.sampleSizes || []).map((ss: number) => (
                          <option key={ss} value={ss.toString()}>{ss}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button 
                        onClick={() => { setSelectedRowId(row.id); setActiveTab('dimensions'); }}
                        className="h-8 px-8 rounded bg-brand-primary/10 text-brand-secondary hover:bg-brand-primary hover:text-white transition-colors text-xs font-bold uppercase tracking-wider mx-auto flex items-center justify-center w-24"
                      >
                        ENTRY
                      </button>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button 
                        onClick={() => { setSelectedRowId(row.id); setActiveTab('visual'); }}
                        className="h-8 px-8 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider mx-auto flex items-center justify-center w-24"
                      >
                        ENTRY
                      </button>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {hasData ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 mx-auto">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Filled</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Pending</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button 
                        onClick={() => setRows(rows.filter(r => r.id !== row.id))}
                        className="w-8 h-8 rounded text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors mx-auto flex items-center justify-center"
                        title="Remove Lot"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-sm font-mono text-muted border-dashed border-b border-gray-800">
                    No lots added yet. Click + ADD LOT to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── DETAIL ENTRY MODAL (Tier 3 Overlay) ──────────────────────────── */}
      {selectedRowId && activeRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-canvas border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="h-14 px-6 border-b border-gray-800 bg-surface flex items-center justify-between rounded-t-xl shrink-0">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-bold uppercase text-primary">
                  Lot Details <span className="text-brand-secondary font-mono tracking-widest ml-2">SEQ: {activeRow.sequenceNo}</span>
                </h3>
              </div>
              <button 
                onClick={() => setSelectedRowId(null)}
                className="w-8 h-8 rounded hover:bg-surface-light text-muted hover:text-white flex items-center justify-center transition-colors"
              >
                <XCircle className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
            
            {/* Modal Tabs */}
            <div className="flex items-center gap-4 px-6 border-b border-gray-800 bg-surface shrink-0">
              <button
                onClick={() => setActiveTab('dimensions')}
                className={`h-12 border-b-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  activeTab === 'dimensions' ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-muted hover:text-primary'
                }`}
              >
                Dimensional Inspection
              </button>
              <button
                onClick={() => setActiveTab('visual')}
                className={`h-12 border-b-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  activeTab === 'visual' ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-muted hover:text-primary'
                }`}
              >
                Visual Defects
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-surface-light/5">
              {activeTab === 'dimensions' ? (
                <BatchModalDimensions 
                  row={activeRow} 
                  updateRow={updateRowField} 
                  config={config} 
                  productCode={productCode} 
                  size={size} 
                />
              ) : (
                <BatchModalVisual 
                  row={activeRow} 
                  updateRow={updateRowField} 
                  config={config} 
                  profileId={profileId} 
                />
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="h-16 px-6 border-t border-gray-800 bg-surface flex items-center justify-between rounded-b-xl shrink-0">
              <button 
                onClick={() => setSelectedRowId(null)}
                className="text-xs font-bold uppercase text-muted hover:text-white transition-colors"
              >
                Done
              </button>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const idx = rows.findIndex(r => r.id === selectedRowId);
                    if (idx > 0) setSelectedRowId(rows[idx - 1].id);
                  }}
                  disabled={rows.findIndex(r => r.id === selectedRowId) === 0}
                  className="h-10 px-4 rounded-lg bg-surface-light border border-gray-700 text-xs font-bold uppercase text-primary hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  Save & Prev
                </button>
                <button 
                  onClick={() => {
                    const idx = rows.findIndex(r => r.id === selectedRowId);
                    if (idx < rows.length - 1) setSelectedRowId(rows[idx + 1].id);
                  }}
                  disabled={rows.findIndex(r => r.id === selectedRowId) === rows.length - 1}
                  className="h-10 px-4 rounded-lg bg-brand-primary text-xs font-bold uppercase text-white hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
                >
                  Save & Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}







