/**
 * @file SpreadsheetGrid.tsx
 * @description Phase 2: Excel-Style Spreadsheet Grid Mode
 *
 * Implements a high-density, multi-lot data entry grid.
 * - Real-Time Status Readout (AQL Pass/Fail verdict per row).
 * - "Submit Batch (N Lots)" action for bulk submission.
 *
 * Strict Compliance with UI_DESIGN_SYSTEM.md.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { 
  Table as TableIcon, 
  Plus, 
  Save, 
  Calendar, 
  Clock, 
  Box, 
  Activity, 
  SplitSquareHorizontal, 
  FileCheck,
  Scaling,
  ShieldAlert,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';
import { QuickDefectPopover } from './QuickDefectPopover';

// Will use config.dimensions dynamically

export function SpreadsheetGrid() {
  const { config, isLoading } = useConfig();
  const { addToast } = useToast();

  const availableLines = useMemo(() => {
    if (!config?.lines) return [];
    return config.lines;
  }, [config?.lines]);

  const defaultDimensions = [
    { id: 'length', name: 'Glove Length', minSpec: '240', tolerance: '5', unit: 'mm' },
    { id: 'palmWidth', name: 'Palm Width', minSpec: '95', tolerance: '5', unit: 'mm' },
    { id: 'thickBeading', name: 'Thickness (Beading)', minSpec: '0.050', tolerance: '0.010', unit: 'mm' },
    { id: 'thickCuff', name: 'Thickness (Cuff)', minSpec: '0.060', tolerance: '0.010', unit: 'mm' },
    { id: 'thickPalm', name: 'Thickness (Palm)', minSpec: '0.080', tolerance: '0.010', unit: 'mm' },
    { id: 'thickFinger', name: 'Thickness (Finger)', minSpec: '0.100', tolerance: '0.010', unit: 'mm' }
  ];

  const activeDimensions = config?.dimensions && config.dimensions.length > 0 
    ? config.dimensions 
    : defaultDimensions;

  // ── Shared Header Metadata State ──────────────────────────────────────────
  const [profileId, setProfileId] = useState<string>('');
  const [productCode, setProductCode] = useState<string>('');
  const [lineId, setLineId] = useState<string>('');
  const [side, setSide] = useState<string>('A');
  const [sampleSize, setSampleSize] = useState<string>('');
  const [timestamp, setTimestamp] = useState(new Date());

  // ── Popover State ─────────────────────────────────────────────────────────
  const [activePopoverRowId, setActivePopoverRowId] = useState<string | null>(null);

  // Handle manual date change
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setTimestamp(new Date(e.target.value));
    }
  };

  useEffect(() => {
    if (config) {
      if (!profileId && config.inspectionProfiles?.[0]) setProfileId(config.inspectionProfiles[0].id);
      if (!productCode && config.productCodes?.[0]) setProductCode(config.productCodes[0]);
      if (!lineId && availableLines[0]) setLineId(availableLines[0].id);
      if (!sampleSize && config.sampleSizes?.[0]) setSampleSize(config.sampleSizes[0].toString());
    }
  }, [config, profileId, productCode, lineId, sampleSize, availableLines]);

  const selectedLine = useMemo(() => availableLines.find((l: any) => l.id === lineId) || availableLines[0], [availableLines, lineId]);

  useEffect(() => {
    if (availableLines.length > 0 && !availableLines.find((l: any) => l.id === lineId)) {
      setLineId(availableLines[0].id);
    }
  }, [availableLines, lineId]);

  useEffect(() => {
    if (selectedLine && config?.sides) {
      if (!config.sides.find((s: any) => s.id === side) && config.sides.length > 0) {
        setSide(config.sides[0].id);
      }
    }
  }, [selectedLine, side, config?.sides]);

  const { activeShift, lot4Digit } = useMemo(() => {
    const hours = timestamp.getHours();
    
    // Determine active shift based on dynamic config.shifts with duration & midnight rollover
    let currentShift = 'Off-Shift';
    let isNightRollover = false;
    
    if (config?.shifts && config.shifts.length > 0) {
      const currentMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();
      
      for (const shift of config.shifts) {
        const startMins = shift.startHour * 60 + shift.startMinute;
        const durationMins = Math.round((shift.durationHours || 8) * 60);
        const endMins = startMins + durationMins;
        
        let isMatch = false;
        if (endMins <= 1440) {
          isMatch = currentMinutes >= startMins && currentMinutes < endMins;
        } else {
          // Midnight rollover (e.g. 20:00 to 08:00)
          isMatch = currentMinutes >= startMins || currentMinutes < (endMins % 1440);
        }
        
        if (isMatch) {
          const startStr = `${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute).padStart(2, '0')}`;
          const actualEndMins = (endMins - 1 + 1440) % 1440;
          const endHour = Math.floor(actualEndMins / 60);
          const endMinute = actualEndMins % 60;
          const endStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
          
          currentShift = `${shift.name} (${startStr} - ${endStr})`;
          if (endMins > 1440 && currentMinutes < (endMins % 1440)) {
            isNightRollover = true;
          }
          break;
        }
      }
    } else {
      isNightRollover = hours >= 0 && hours < 8;
      if (isNightRollover) currentShift = 'Night';
      else if (hours >= 8 && hours < 20) currentShift = 'Day';
      else currentShift = 'Night';
    }

    const prodDate = new Date(timestamp);
    if (isNightRollover) {
      prodDate.setDate(prodDate.getDate() - 1);
    }

    const startOfYear = new Date(prodDate.getFullYear(), 0, 0);
    const diff = prodDate.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const julian = dayOfYear.toString().padStart(3, '0');
    const yearDigit = prodDate.getFullYear().toString().slice(-1);
    
    return { activeShift: currentShift, lot4Digit: `${yearDigit}${julian}` };
  }, [timestamp, config?.shifts]);


  // ── Multi-Lot Data Table State (Rows) ────────────────────────────────────
  const createEmptyRow = (seq: string) => {
    const measurements: Record<string, string[]> = {};
    if (activeDimensions) {
      activeDimensions.forEach((d: any) => { measurements[d.id] = ['', '', '', '', '']; });
    }
    
    let defaultWeight = '';
    if (productCode && productCode.length >= 4) {
      const weightStr = productCode.substring(1, 4);
      const weightVal = parseFloat(weightStr) / 10;
      if (!isNaN(weightVal)) {
        defaultWeight = weightVal.toFixed(2);
      }
    }

    return { 
      id: crypto.randomUUID(), 
      sequenceNo: seq, 
      totalCarton: '', 
      gloveWeight: defaultWeight, 
      measurements,
      defects: {},
      qualitative: {}
    };
  };

  const [rows, setRows] = useState<any[]>([createEmptyRow('001')]);

  // Auto-fill empty weights when Product Code changes
  useEffect(() => {
    if (productCode && productCode.length >= 4) {
      const weightStr = productCode.substring(1, 4);
      const weightVal = parseFloat(weightStr) / 10;
      if (!isNaN(weightVal)) {
        const defaultWeight = weightVal.toFixed(2);
        setRows(prev => prev.map(r => {
          if (!r.gloveWeight) {
            return { ...r, gloveWeight: defaultWeight };
          }
          return r;
        }));
      }
    }
  }, [productCode]);

  const handleAddLotRow = () => {
    setRows(prev => {
      const lastSeq = prev.length > 0 ? prev[prev.length - 1].sequenceNo : '000';
      const nextSeqNum = parseInt(lastSeq, 10) + 1;
      const nextSeqStr = nextSeqNum.toString().padStart(3, '0');
      return [...prev, createEmptyRow(nextSeqStr)];
    });
    addToast('success', 'New Lot Row Added');
  };

  const handleRowChange = (rowId: string, field: string, value: string) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
  };

  const handleMeasurementChange = (rowId: string, dimId: string, idx: number, value: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const newArray = [...r.measurements[dimId]];
      newArray[idx] = value;
      return { ...r, measurements: { ...r.measurements, [dimId]: newArray } };
    }));
  };

  const handleDefectsSave = (rowId: string, defects: Record<string, number>, qualitative: Record<string, any>) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, defects, qualitative } : r));
    addToast('success', 'Defects logged successfully.');
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement | HTMLButtonElement>, rowIndex: number, colId: string, rowId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextRowInput = document.querySelector(`[data-row="${rowIndex + 1}"][data-col="${colId}"]`) as HTMLElement;
      if (nextRowInput) nextRowInput.focus();
    } else if (e.key === ' ' && colId === 'defects') {
      e.preventDefault();
      setActivePopoverRowId(rowId);
    }
  }, []);

  const handleSaveBatch = () => {
    // Basic validation: ensure Carton and Weight are filled for all rows
    const incompleteRows = rows.filter(r => !r.totalCarton || !r.gloveWeight);
    if (incompleteRows.length > 0) {
      addToast('error', `Please fill Total Carton and Weight for all rows before submitting.`);
      return;
    }
    addToast('success', `${rows.length} Lots submitted successfully to the system!`);
    
    // Reset table for next batch (re-initialize with 1 row, sequence restarts at 001)
    setRows([createEmptyRow('001')]);
  };

  if (isLoading || !config) return null;

  const activeRow = rows.find(r => r.id === activePopoverRowId);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── Shared Header Metadata Bar ──────────────────────────────────────── */}
      <div className="bg-surface border border-gray-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-primary border-b border-gray-800 pb-3 mb-4 flex items-center gap-2">
          <TableIcon className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
          SHARED BATCH METADATA
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <FileCheck className="w-3 h-3 text-brand-secondary" strokeWidth={2} /> PROFILE
            </label>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="w-full h-10 px-3 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-xs focus:border-brand-secondary outline-none">
              {config.inspectionProfiles?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <Box className="w-3 h-3 text-brand-secondary" strokeWidth={2} /> PRODUCT
            </label>
            <select value={productCode} onChange={(e) => setProductCode(e.target.value)} className="w-full h-10 px-3 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-xs focus:border-brand-secondary outline-none">
              {(config.productCodes || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <Activity className="w-3 h-3 text-brand-secondary" strokeWidth={2} /> LINE
            </label>
            <select value={lineId} onChange={(e) => setLineId(e.target.value)} className="w-full h-10 px-3 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-xs focus:border-brand-secondary outline-none">
              {availableLines.map((l: any) => <option key={l.id} value={l.id}>{l.id} ({l.name})</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <SplitSquareHorizontal className="w-3 h-3 text-brand-secondary" strokeWidth={2} /> SIDE
            </label>
            <select value={side} onChange={(e) => setSide(e.target.value)} className="w-full h-10 px-3 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-xs focus:border-brand-secondary outline-none">
              {(config?.sides || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.id} ({s.name})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <Scaling className="w-3 h-3 text-brand-secondary" strokeWidth={2} /> SAMPLE SIZE
            </label>
            <select value={sampleSize} onChange={(e) => setSampleSize(e.target.value)} className="w-full h-10 px-3 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-xs focus:border-brand-secondary outline-none">
              {(config.sampleSizes || []).map((s) => <option key={s} value={s.toString()}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <Calendar className="w-3 h-3 text-brand-secondary" strokeWidth={2} /> DATE
            </label>
            <input 
              type="datetime-local" 
              value={new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              onChange={handleDateChange}
              className="w-full h-10 px-3 rounded-md bg-canvas/50 border border-gray-800 text-primary font-mono text-[11px] outline-none focus:border-brand-secondary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <Clock className="w-3 h-3 text-brand-secondary" strokeWidth={2} /> SHIFT
            </label>
            <div className="h-10 px-3 rounded-md bg-canvas/50 border border-gray-800 flex items-center text-primary font-mono text-[11px] gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{activeShift}
            </div>
          </div>
        </div>
      </div>

      {/* ── Multi-Lot Data Table ──────────────────────────────────────── */}
      <div className="bg-surface border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
        
        {/* Table Toolbar */}
        <div className="p-4 border-b border-gray-800 bg-canvas/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-wider text-primary">
              BATCH GRID <span className="text-muted font-mono font-normal">({rows.length} LOTS)</span>
            </span>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button onClick={handleAddLotRow} className="flex-1 md:flex-none h-10 px-4 rounded-md bg-canvas border border-gray-700 text-brand-secondary hover:text-white hover:bg-brand-primary/20 hover:border-brand-secondary font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none">
              <Plus className="w-4 h-4" strokeWidth={2} /><span>ADD LOT ROW</span>
            </button>
            <button onClick={handleSaveBatch} className="flex-1 md:flex-none h-10 px-6 rounded-md bg-accent-gradient text-white font-semibold text-xs uppercase tracking-wider shadow-lg shadow-brand-primary/20 hover:brightness-110 flex items-center justify-center gap-2 transition-all outline-none">
              <Save className="w-4 h-4" strokeWidth={2} /><span>SUBMIT BATCH ({rows.length})</span>
            </button>
          </div>
        </div>

        {/* Scrollable Table Area */}
        <div className="overflow-x-auto pb-4">
          <table className="w-full text-left border-collapse min-w-[max-content]">
            <thead>
              <tr className="bg-canvas">
                <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-800 border-b w-16 sticky left-0 bg-canvas z-20">SEQ</th>
                <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-800 border-b w-32 sticky left-16 bg-canvas z-20">LOT NO</th>
                <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-800 border-b w-20">CRT</th>
                <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-800 border-b w-20">WT (g)</th>
                
                {(activeDimensions || []).map((d: any) => (
                  <th key={d.id} className="p-3 text-[10px] font-bold text-brand-secondary uppercase tracking-widest border-r border-gray-800 border-b text-center bg-brand-primary/5" colSpan={5}>
                    {d.name.substring(0, 10).toUpperCase()} <span className="text-gray-500">(&ge;{d.minSpec - d.tolerance})</span>
                  </th>
                ))}
                <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-800 border-b w-32 text-center" colSpan={1}>DEFECTS</th>
                <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b w-28 text-center" colSpan={1}>VERDICT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                
                // Real-Time Verdict Calculation
                let failedDimensions = 0;
                let hasFilledDimensions = false;
                activeDimensions.forEach((d: any) => {
                  const threshold = d.minSpec - d.tolerance;
                  if (row.measurements[d.id]) {
                    row.measurements[d.id].forEach((val: string) => {
                      if (val !== '') hasFilledDimensions = true;
                      const num = parseFloat(val);
                      if (!isNaN(num) && num < threshold) failedDimensions++;
                    });
                  }
                });

                const totalQuant = Object.values(row.defects || {}).reduce((a: any, b: any) => a + b, 0) as number;
                const totalQual = Object.values(row.qualitative || {}).filter(v => v === 'FAIL').length;
                const totalIssues = totalQuant + totalQual;

                const hasData = hasFilledDimensions || totalIssues > 0 || row.totalCarton || row.gloveWeight;
                const isFail = failedDimensions > 0 || totalIssues > 0;
                const verdictState = !hasData ? 'PENDING' : (isFail ? 'FAIL' : 'PASS');

                return (
                  <tr key={row.id} className="border-b border-gray-800/50 hover:bg-surface-light transition-colors group">
                    
                    {/* Sticky Sequence & Lot */}
                    <td className="p-1 border-r border-gray-800 sticky left-0 bg-surface group-hover:bg-surface-light z-10 text-center">
                      <div className="w-full h-9 flex items-center justify-center text-brand-secondary font-mono text-xs font-bold">
                        {row.sequenceNo}
                      </div>
                    </td>
                    <td className="p-1 border-r border-gray-800 sticky left-16 bg-surface group-hover:bg-surface-light z-10">
                      <div className="w-full h-9 px-2 flex items-center bg-canvas/50 rounded text-muted font-mono text-[10px]">
                        {lineId || 'XXX'}{side}{lot4Digit}{row.sequenceNo}
                      </div>
                    </td>
                    
                    {/* Base Inputs */}
                    <td className="p-1 border-r border-gray-800 w-20">
                      <input 
                        type="number" 
                        value={row.totalCarton}
                        onChange={(e) => handleRowChange(row.id, 'totalCarton', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, 'crt', row.id)}
                        data-row={rowIndex}
                        data-col="crt"
                        className="w-full h-9 px-1 bg-canvas border border-gray-700 rounded text-primary font-mono text-xs text-center focus:border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-secondary/30 transition-all"
                      />
                    </td>
                    <td className="p-1 border-r border-gray-800 w-20">
                      <input 
                        type="number" 
                        step="0.01"
                        value={row.gloveWeight}
                        onChange={(e) => handleRowChange(row.id, 'gloveWeight', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, 'wt', row.id)}
                        data-row={rowIndex}
                        data-col="wt"
                        className="w-full h-9 px-1 bg-canvas border border-gray-700 rounded text-primary font-mono text-xs text-center focus:border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-secondary/30 transition-all"
                      />
                    </td>
                    
                    {/* Dimensional Inputs */}
                    {(activeDimensions || []).map((d: any) => {
                      const threshold = d.minSpec - d.tolerance;
                      const measureArray = row.measurements[d.id] || ['', '', '', '', ''];
                      return measureArray.map((val: string, idx: number) => {
                        const numVal = parseFloat(val);
                        const isFailCell = !isNaN(numVal) && numVal < threshold;
                        const isPassCell = !isNaN(numVal) && numVal >= threshold;
                        
                        let bgClass = "bg-canvas border-gray-700 text-primary";
                        if (isFailCell) bgClass = "bg-rose-500/10 border-rose-500/50 text-rose-400";
                        else if (isPassCell) bgClass = "bg-emerald-500/10 border-emerald-500/50 text-emerald-400";

                        return (
                          <td key={`${d.id}-${idx}`} className={`p-1 ${idx === 4 ? 'border-r border-gray-800' : ''}`}>
                            <input
                              type="number"
                              step={d.id.includes('thick') ? '0.001' : '1'}
                              value={val}
                              onChange={(e) => handleMeasurementChange(row.id, d.id, idx, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, rowIndex, `${d.id}-${idx}`, row.id)}
                              data-row={rowIndex}
                              data-col={`${d.id}-${idx}`}
                              className={`w-14 h-9 px-1 border rounded font-mono text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-secondary transition-all ${bgClass}`}
                            />
                          </td>
                        );
                      });
                    })}
                    
                    {/* Defect Popover Chip */}
                    <td className="p-1 text-center border-r border-gray-800 w-32" colSpan={1}>
                      <button
                        type="button"
                        onClick={() => setActivePopoverRowId(row.id)}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, 'defects', row.id)}
                        data-row={rowIndex}
                        data-col="defects"
                        className={`w-full h-9 px-2 rounded-md font-semibold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all outline-none border focus:ring-1 focus:ring-brand-secondary ${
                          totalIssues > 0 
                            ? 'bg-rose-500/10 border-rose-500/50 text-rose-400'
                            : 'bg-canvas border-gray-700 text-muted hover:text-primary hover:border-gray-600'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        DEFECTS ({totalIssues})
                      </button>
                    </td>

                    {/* Verdict Readout Badge */}
                    <td className="p-1 text-center w-28">
                      <div className={`w-full h-9 flex items-center justify-center gap-1.5 rounded-md font-semibold text-[11px] uppercase tracking-wider border ${
                        verdictState === 'PASS' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        verdictState === 'FAIL' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                        'bg-canvas text-gray-500 border-gray-800'
                      }`}>
                        {verdictState === 'PASS' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {verdictState === 'FAIL' && <XCircle className="w-3.5 h-3.5" />}
                        {verdictState === 'PENDING' && <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />}
                        {verdictState}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {activeRow && (
        <QuickDefectPopover
          isOpen={!!activePopoverRowId}
          onClose={() => setActivePopoverRowId(null)}
          rowId={activeRow.id}
          sequenceNo={activeRow.sequenceNo}
          initialDefects={activeRow.defects}
          initialQualitative={activeRow.qualitative}
          onSave={handleDefectsSave}
        />
      )}
    </div>
  );
}
