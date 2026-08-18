import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useConfig, API_BASE_URL, hasUsableCategories, hasUsableProductMatrix } from '../../context/ConfigContext';
import { useAuth, authHeader, authIdentity } from '../../context/AuthContext';
import { useToast } from '../../components/ui/ToastProvider';
import {
  resolveShiftAndEffectiveDate,
  composeYJJJ,
  composeFullLotNumber,
  fetchSuggestedNextSequence,
} from '../../utils/lotNumber';
import {
  ShieldCheck, Barcode, Scaling, Activity, Calendar,
  Hash, CheckCircle2, XCircle, Plus, ChevronRight, Ruler, AlertTriangle, AlertCircle, Trash2
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
        <h4 className="text-sm font-bold uppercase tracking-wider text-primary">Physical Dimensions</h4>
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
        <h4 className="text-sm font-bold uppercase tracking-wider text-primary">Defect Tabulation</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {aqlCategories.map((cat: any) => {
          const catDefects = defectDefinitions.filter((d: any) => d.categoryId === cat.id);
          if (catDefects.length === 0) return null;
          return (
            <div key={cat.id} className="space-y-2">
              <div className="flex items-end justify-between border-b border-gray-800 pb-1 gap-2">
                <span className="font-mono text-sm font-bold uppercase tracking-wider text-primary truncate">{cat.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono text-[10px] uppercase px-2 py-0.5 rounded">AQL: {cat.aql}</span>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
                    cat.evalMode === 'N/A' 
                      ? 'bg-gray-500/10 border-gray-500/30 text-gray-400' 
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}>
                    {cat.evalMode}
                  </span>
                </div>
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

export interface BatchEntryHandle {
  submitBatch: () => void;
}

export const BatchEntry = forwardRef<BatchEntryHandle>((_props, ref) => {
  const { config, isLoading } = useConfig();
  const { user } = useAuth();
  const { addToast } = useToast();

  // --- Shared Metadata ---
  const [profileId, setProfileId] = useState<string>('');

  // ── Zero-usable-dimension entry gate ────────────────────────────────────
  // Raw lookup (not getResolvedProfile()) — see hasUsableCategories() docstring
  // for why the normalised/defaulted form would hide exactly this condition.
  const selectedProfile = useMemo(
    () => config?.inspectionProfiles?.find((p) => p.id === profileId) ?? null,
    [config?.inspectionProfiles, profileId],
  );
  const isProfileUnusable = Boolean(profileId) && !hasUsableCategories(selectedProfile);
  const [productCode, setProductCode] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [lineId, setLineId] = useState<string>('');

  // ── Zero-usable-dimension-matrix entry gate (AUDIT_REPORT.md finding #5) ──
  const matrixEntry = useMemo(
    () => config?.productMatrixConfig?.[productCode] ?? null,
    [config?.productMatrixConfig, productCode],
  );
  const isMatrixUnusable = Boolean(productCode) && Boolean(size)
    && !hasUsableProductMatrix(matrixEntry, size);
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
    // Sequence No is intentionally left blank — no auto-default, no
    // auto-increment. Auto-incrementing would capture submission order, not
    // true production order (operators consolidate multi-lot test results
    // out of production order routinely); the business explicitly does not
    // want that. Side/Sample Size/Total Carton remain convenience copies from
    // the previous row since Sequence is the only field this requirement
    // applies to.
    let prevSampleSize = '125';
    let prevTotalCarton = '18';
    let prevSide = 'A';

    if (rows.length > 0) {
      const lastRow = rows[rows.length - 1];
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
      sequenceNo: '',
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

  // ── Shared lot-number/shift resolution (lotNumber.ts) ─────────────────────
  // Single shared timestamp + config.shifts → one effectiveDate/activeShift/
  // YJJJ for the whole batch; each row then composes its own full lot number
  // from its own `side` + `sequenceNo` via composeFullLotNumber().
  const { effectiveDate, activeShift } = useMemo(
    () => resolveShiftAndEffectiveDate(timestamp, config?.shifts),
    [timestamp, config?.shifts],
  );
  const yjjj = useMemo(() => composeYJJJ(effectiveDate), [effectiveDate]);

  // ── Sequence Hints: non-binding advisory, never pre-fills or restricts ─────
  // Pre-fetched once per available Side (typically 2) when Line/date changes,
  // rather than once per row, since multiple rows commonly share a Side.
  const [sequenceHints, setSequenceHints] = useState<Record<string, number | null>>({});
  useEffect(() => {
    let cancelled = false;
    const sides = config?.sides ?? [];
    if (!lineId || !yjjj || sides.length === 0) {
      setSequenceHints({});
      return;
    }
    Promise.all(
      sides.map(async (s) => [s.id, await fetchSuggestedNextSequence(lineId, s.id, yjjj)] as const),
    ).then((entries) => {
      if (!cancelled) setSequenceHints(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [lineId, yjjj, config?.sides]);

  const hasRealData = (r: BatchLotRow) => {
    const dimsDirty = r.dirtySlots
      ? Object.values(r.dirtySlots).some(slots => slots.some(isDirty => isDirty))
      : false;
    const defsHasData = Object.values(r.defects).some(v => v > 0);
    return dimsDirty || defsHasData;
  };

  const handleSubmitBatch = async () => {
    const validRows = rows.filter(hasRealData);
    if (validRows.length === 0) {
      addToast('info', 'No lots have data entered yet.');
      return;
    }

    if (isProfileUnusable) {
      addToast('error', 'This product profile has no usable inspection categories configured — contact an admin before inspecting this lot.');
      return;
    }

    if (isMatrixUnusable) {
      addToast('error', 'Dimension spec not configured for this product/size — contact an admin before inspecting this lot.');
      return;
    }

    // Side and Sequence No are required for a well-formed lot number —
    // Sequence specifically has no auto-default (see handleAddRow), so a row
    // with real inspection data but a blank sequence must block the whole
    // batch rather than silently submit a malformed batchNumber.
    const incompleteRow = validRows.find((row) => !row.side || !row.sequenceNo);
    if (incompleteRow) {
      const rowNum = rows.findIndex((r) => r.id === incompleteRow.id) + 1;
      addToast('error', `Lot #${rowNum} is missing its Sequence No. — required before submitting the batch.`);
      return;
    }

    const submissions = validRows.map(row => ({
      productCode,
      productionDate: effectiveDate.toISOString(),
      samplingTime: timestamp.toISOString(),
      machineId: lineId,
      shift: activeShift,
      batchNumber: composeFullLotNumber(lineId, row.side, yjjj, row.sequenceNo),
      size,
      sampleSize: parseInt(row.sampleSize) || 125,
      dimensions: row.dimensions,
      dimensionMins: {},
      defects: row.defects,
      ...authIdentity(user),
      totalCarton: parseInt(row.totalCarton) || 0,
      profileId,
    }));

    try {
      const results = await Promise.allSettled(
        submissions.map(sub =>
          fetch(`${API_BASE_URL}/api/submissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(user) },
            body: JSON.stringify(sub),
          }).then(async (res) => {
            if (!res.ok) {
              let message = `Server error (${res.status})`;
              try {
                const errJson = await res.json();
                message = errJson?.error ?? message;
              } catch (_) {}
              throw new Error(message);
            }
            return res.json();
          })
        )
      );

      let successCount = 0;
      const failureMessages: string[] = [];
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          successCount++;
          updateRowField(validRows[idx].id, 'dirtySlots', {});
          updateRowField(validRows[idx].id, 'dimensions', {});
          updateRowField(validRows[idx].id, 'defects', {});
        } else {
          const msg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          const rowNum = rows.findIndex((r) => r.id === validRows[idx].id) + 1;
          failureMessages.push(`Lot #${rowNum}: ${msg}`);
        }
      });

      if (successCount === validRows.length) {
        addToast('success', `Successfully submitted ${successCount} lots.`);
      } else if (successCount > 0) {
        addToast('info', `Submitted ${successCount} lots. Failed: ${failureMessages.join('; ')}`);
      } else {
        addToast('error', `Failed to submit batch: ${failureMessages.join('; ')}`);
      }
    } catch (err) {
      console.error(err);
      addToast('error', 'An error occurred during submission.');
    }
  };

  useImperativeHandle(ref, () => ({
    submitBatch: handleSubmitBatch
  }));

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
    <div className="space-y-4 h-full flex flex-col pt-6">

      {/* ── SHARED METADATA (Tier 2 Container) ───────────────────────────── */}
      <div className="bg-surface border border-gray-700/50 rounded-lg p-4 shrink-0 shadow-sm">
        <div className="flex justify-between items-start mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-secondary">Shared Batch Metadata</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          
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
            <div className="text-xs font-mono text-primary mt-1 flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${activeShift === 'Off-Shift' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {activeShift}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Hash className="w-3 h-3" /> LOT (YJJJ)
            </label>
            <div className="w-full h-9 bg-surface-light/50 border border-transparent rounded-lg px-2 flex items-center text-sm font-mono text-brand-secondary font-bold cursor-not-allowed opacity-80">
              {yjjj}
            </div>
          </div>

        </div>

        {/* ── Zero-Usable-Dimension Blocking Banner ───────────────────────── */}
        {isProfileUnusable && (
          <div className="mt-3 p-3 rounded-lg border border-l-4 border-amber-500/30 border-l-amber-500 bg-amber-500/5 flex gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">PROFILE NOT USABLE</p>
              <p className="text-xs text-muted mt-1">
                This product profile has no usable inspection categories configured — contact an admin
                before inspecting this lot. Go to <strong>Configuration Control → Quality Rules</strong> to
                fix its AQL categories.
              </p>
            </div>
          </div>
        )}

        {/* ── Zero-Usable-Dimension-Matrix Blocking Banner ────────────────── */}
        {isMatrixUnusable && (
          <div className="mt-3 p-3 rounded-lg border border-l-4 border-amber-500/30 border-l-amber-500 bg-amber-500/5 flex gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">PRODUCT DIMENSIONS NOT CONFIGURED</p>
              <p className="text-xs text-muted mt-1">
                Glove Length and Palm Width have no spec configured for <span className="font-mono">{productCode}</span> · <span className="font-mono">{size}</span> — measurements cannot be graded.
                Contact an admin to configure this product under <strong>Configuration Control → Product Engine</strong> before inspecting this lot.
              </p>
            </div>
          </div>
        )}
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
            className="h-9 px-4 rounded-md bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>ADD LOT</span>
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
                const dimsHasData = row.dirtySlots ? Object.values(row.dirtySlots).some(slots => slots.some(isDirty => isDirty)) : false;
                const defsHasData = Object.values(row.defects).some(v => v > 0);
                const hasData = dimsHasData || defsHasData;
                const lotNumber = composeFullLotNumber(lineId, row.side, yjjj, row.sequenceNo);
                const rowHint = sequenceHints[row.side];

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
                      {rowHint !== null && rowHint !== undefined && (
                        <div className="text-[9px] font-mono text-muted leading-none mt-0.5 whitespace-nowrap">
                          next: {String(rowHint).padStart(3, '0')}
                        </div>
                      )}
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
                        className={`h-8 px-8 rounded transition-colors text-xs font-bold uppercase tracking-wider mx-auto flex items-center justify-center w-24 ${
                          dimsHasData 
                            ? 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700' 
                            : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white border border-transparent'
                        }`}
                      >
                        ENTRY
                      </button>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button 
                        onClick={() => { setSelectedRowId(row.id); setActiveTab('visual'); }}
                        className={`h-8 px-8 rounded transition-colors text-xs font-bold uppercase tracking-wider mx-auto flex items-center justify-center w-24 ${
                          defsHasData 
                            ? 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700' 
                            : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white border border-transparent'
                        }`}
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
                <div className="flex items-center gap-3 ml-4 border-l border-gray-700 pl-4">
                  <span className="text-primary text-sm font-mono uppercase font-normal">
                    {productCode} {size ? `- ${size}` : ''}
                  </span>
                  <span className="text-brand-secondary text-sm font-mono uppercase font-bold tracking-widest">
                    {composeFullLotNumber(lineId, activeRow.side, yjjj, activeRow.sequenceNo)}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedRowId(null)}
                className="w-8 h-8 rounded hover:bg-surface-light text-muted hover:text-white flex items-center justify-center transition-colors"
              >
                <XCircle className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
            
            {/* Modal Tabs */}
            <div className="flex items-center px-6 border-b border-gray-800 bg-surface shrink-0 pt-2 gap-1">
              <button
                onClick={() => setActiveTab('dimensions')}
                className={`h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                  activeTab === 'dimensions' ? 'bg-brand-primary text-white' : 'bg-surface text-muted hover:text-primary hover:bg-surface-light'
                }`}
              >
                <Ruler className="w-4 h-4" />
                PHYSICAL DIMENSIONS
              </button>
              <button
                onClick={() => setActiveTab('visual')}
                className={`h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                  activeTab === 'visual' ? 'bg-brand-primary text-white' : 'bg-surface text-muted hover:text-primary hover:bg-surface-light'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                DEFECT TABULATION
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
                className="h-10 px-6 rounded-lg bg-surface border border-gray-700 text-xs font-bold uppercase tracking-wider text-muted hover:text-white transition-colors"
              >
                DONE
              </button>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const idx = rows.findIndex(r => r.id === selectedRowId);
                    if (idx > 0) setSelectedRowId(rows[idx - 1].id);
                  }}
                  disabled={rows.findIndex(r => r.id === selectedRowId) === 0}
                  className="h-10 px-4 rounded-lg bg-surface-light border border-gray-700 text-xs font-bold uppercase tracking-wider text-primary hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  PREVIOUS LOT
                </button>
                <button 
                  onClick={() => {
                    const idx = rows.findIndex(r => r.id === selectedRowId);
                    if (idx < rows.length - 1) setSelectedRowId(rows[idx + 1].id);
                  }}
                  disabled={rows.findIndex(r => r.id === selectedRowId) === rows.length - 1}
                  className="h-10 px-4 rounded-lg bg-brand-primary text-xs font-bold uppercase tracking-wider text-white hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
                >
                  NEXT LOT <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});












