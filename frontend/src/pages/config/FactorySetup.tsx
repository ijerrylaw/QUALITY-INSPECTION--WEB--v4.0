/**
 * @file FactorySetup.tsx
 * @description Phase 3: Configuration Control - Factory & Line Setup
 *
 * Provides interfaces to manage:
 * 1. Production Lines
 * 2. Shift Registration Times (Start Hour/Minute, Duration)
 * 3. Sides (A, Z, etc.)
 *
 * Communicates dirty state up to ConfigPage parent.
 */

import { useState } from 'react';
import { 
  Plus, 
  Trash, 
  Activity, 
  Clock, 
  SplitSquareHorizontal,
  ArrowUp,
  ArrowDown,
  Edit2,
  AlertTriangle,
  Check,
  X
} from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';

interface FactorySetupProps {
  onDirty: () => void;
  onChange: (data: any) => void;
}

const checkShiftOverlap = (shift1: any, shift2: any): boolean => {
  if (shift1.id === shift2.id) return false;
  const start1 = shift1.startHour * 60 + shift1.startMinute;
  const dur1 = Math.round((shift1.durationHours || 0) * 60);
  const end1 = start1 + dur1;

  const start2 = shift2.startHour * 60 + shift2.startMinute;
  const dur2 = Math.round((shift2.durationHours || 0) * 60);
  const end2 = start2 + dur2;

  for (let m = 0; m < 1440; m += 15) {
    const in1 = end1 <= 1440 ? (m >= start1 && m < end1) : (m >= start1 || m < (end1 % 1440));
    const in2 = end2 <= 1440 ? (m >= start2 && m < end2) : (m >= start2 || m < (end2 % 1440));
    if (in1 && in2) return true;
  }
  return false;
};

export function FactorySetup({ onDirty, onChange }: FactorySetupProps) {
  const { config } = useConfig();
  
  // ── Local State ─────────────────────────────────────────────────────────
  const [lines, setLines] = useState(config?.lines || [
    { id: 'L01', name: 'Line 1' },
    { id: 'L02', name: 'Line 2' }
  ]);

  const [shifts, setShifts] = useState(config?.shifts || [
    { id: 'morning', name: 'Morning Shift', startHour: 8, startMinute: 0, durationHours: 12 },
    { id: 'night', name: 'Night Shift', startHour: 20, startMinute: 0, durationHours: 12 }
  ]);

  const [sides, setSides] = useState(config?.sides || [
    { id: 'A', name: 'Outer (Side A)' },
    { id: 'Z', name: 'Inner (Side Z)' }
  ]);

  // Inline Editing State (Lines)
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editLineForm, setEditLineForm] = useState({ id: '', name: '' });

  // Inline Editing State (Sides)
  const [editingSideId, setEditingSideId] = useState<string | null>(null);
  const [editSideForm, setEditSideForm] = useState({ id: '', name: '' });

  // Inline Editing State (Shifts)
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editShiftForm, setEditShiftForm] = useState({ id: '', name: '', startHour: 8, startMinute: 0, durationHours: 12 });
  const [isAddingShift, setIsAddingShift] = useState(false);
  const [newShiftForm, setNewShiftForm] = useState({ name: '', startHour: 8, startMinute: 0, durationHours: 12 });

  // ── Handlers ─────────────────────────────────────────────────────────────
  const triggerChange = (newLines: any[], newShifts: any[], newSides: any[]) => {
    onChange({ lines: newLines, shifts: newShifts, sides: newSides });
    onDirty();
  };

  // Lines
  const handleAddLine = () => {
    const newId = `L${(lines.length + 1).toString().padStart(2, '0')}`;
    const newLines = [...lines, { id: newId, name: '' }];
    setLines(newLines);
    setEditingLineId(newId);
    setEditLineForm({ id: newId, name: '' });
    triggerChange(newLines, shifts, sides);
  };

  const handleRemoveLine = (id: string) => {
    const newLines = lines.filter(l => l.id !== id);
    setLines(newLines);
    triggerChange(newLines, shifts, sides);
  };

  const startEditingLine = (line: any) => {
    setEditingLineId(line.id);
    setEditLineForm({ id: line.id, name: line.name });
  };

  const saveEditingLine = (oldId: string) => {
    const newLines = lines.map(l => l.id === oldId ? { ...l, id: editLineForm.id.toUpperCase(), name: editLineForm.name } : l);
    setLines(newLines);
    setEditingLineId(null);
    triggerChange(newLines, shifts, sides);
  };

  // Sides
  const handleAddSide = () => {
    const newId = ``;
    const newSides = [...sides, { id: newId, name: `` }];
    setSides(newSides);
    setEditingSideId(newId);
    setEditSideForm({ id: newId, name: '' });
    triggerChange(lines, shifts, newSides);
  };

  const handleRemoveSide = (id: string) => {
    const newSides = sides.filter(s => s.id !== id);
    setSides(newSides);
    triggerChange(lines, shifts, newSides);
  };

  const startEditingSide = (side: any) => {
    setEditingSideId(side.id);
    setEditSideForm({ id: side.id, name: side.name });
  };

  const saveEditingSide = (oldId: string) => {
    const newSides = sides.map(s => s.id === oldId ? { ...s, id: editSideForm.id.toUpperCase(), name: editSideForm.name } : s);
    setSides(newSides);
    setEditingSideId(null);
    triggerChange(lines, shifts, newSides);
  };

  // Shifts
  const handleRemoveShift = (id: string) => {
    const newShifts = shifts.filter(s => s.id !== id);
    setShifts(newShifts);
    triggerChange(lines, newShifts, sides);
  };

  const startEditingShift = (shift: any) => {
    setIsAddingShift(false);
    setEditingShiftId(shift.id);
    setEditShiftForm({
      id: shift.id,
      name: shift.name,
      startHour: shift.startHour ?? 8,
      startMinute: shift.startMinute ?? 0,
      durationHours: shift.durationHours ?? 12
    });
  };

  const saveEditingShift = (id: string) => {
    if (!editShiftForm.name.trim()) return;
    const newShifts = shifts.map((s: any) => s.id === id ? { ...s, ...editShiftForm, name: editShiftForm.name.trim() } : s);
    setShifts(newShifts);
    setEditingShiftId(null);
    triggerChange(lines, newShifts, sides);
  };

  const startAddingShift = () => {
    setEditingShiftId(null);
    setIsAddingShift(true);
    setNewShiftForm({
      name: `Shift ${String.fromCharCode(65 + shifts.length)}`,
      startHour: 8,
      startMinute: 0,
      durationHours: 12
    });
  };

  const saveNewShift = () => {
    if (!newShiftForm.name.trim()) return;
    const newId = `shift_${Date.now()}`;
    const newShifts = [...shifts, { id: newId, name: newShiftForm.name.trim(), startHour: newShiftForm.startHour, startMinute: newShiftForm.startMinute, durationHours: newShiftForm.durationHours }];
    setShifts(newShifts);
    setIsAddingShift(false);
    triggerChange(lines, newShifts, sides);
  };

  const moveLine = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === lines.length - 1) return;
    
    const newLines = [...lines];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newLines[index], newLines[newIndex]] = [newLines[newIndex], newLines[index]];
    
    setLines(newLines);
    triggerChange(newLines, shifts, sides);
  };

  const moveShift = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === shifts.length - 1) return;
    
    const newShifts = [...shifts];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newShifts[index], newShifts[newIndex]] = [newShifts[newIndex], newShifts[index]];
    
    setShifts(newShifts);
    triggerChange(lines, newShifts, sides);
  };

  const moveSide = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sides.length - 1) return;
    
    const newSides = [...sides];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newSides[index], newSides[newIndex]] = [newSides[newIndex], newSides[index]];
    
    setSides(newSides);
    triggerChange(lines, shifts, newSides);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── Section 1: Production Lines ────────────────────────────────────── */}
        <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col h-full">
          <div className="p-4 border-b border-gray-800 bg-surface flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              PRODUCTION LINES
            </h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">Manage active lines available for assignment during inspections.</p>
          </div>
        </div>

        <div className="p-4 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-muted w-32">Line ID (Code)</th>
                <th className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-muted flex-1">Display Name</th>
                <th className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-muted text-right w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="">
              {lines.map((line: any, index: number) => {
                const isEditing = editingLineId === line.id;
                
                return (
                  <tr key={line.id} className="hover:bg-surface/50 transition-colors group border-b border-gray-700/50">
                    <td className="py-3 px-3">
                      {isEditing ? (
                        <input 
                          type="text"
                          value={editLineForm.id}
                          onChange={(e) => setEditLineForm({ ...editLineForm, id: e.target.value })}
                          className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded font-mono text-sm font-bold text-brand-secondary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none uppercase"
                        />
                      ) : (
                        <span className="font-mono text-sm font-bold text-brand-secondary">{line.id}</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {isEditing ? (
                        <div className="relative">
                          <input 
                            type="text"
                            autoFocus
                            value={editLineForm.name}
                            onChange={(e) => setEditLineForm({ ...editLineForm, name: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditingLine(line.id);
                              if (e.key === 'Escape') setEditingLineId(null);
                            }}
                            className="w-full h-9 px-2 pr-20 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                            placeholder="Line Name"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none">Enter ↵</span>
                        </div>
                      ) : (
                        <span className="font-mono text-sm text-primary">{line.name}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => saveEditingLine(line.id)} className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/20 transition-colors outline-none" title="Save (Enter)">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingLineId(null)} className="p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 transition-colors outline-none" title="Cancel (Esc)">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => moveLine(index, 'up')}
                            disabled={index === 0}
                            className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors outline-none" title="Move Up"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => moveLine(index, 'down')}
                            disabled={index === lines.length - 1}
                            className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors outline-none" title="Move Down"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => startEditingLine(line)}
                            className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 outline-none transition-colors" title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleRemoveLine(line.id)}
                            className="p-1.5 rounded-md text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors outline-none" title="Remove"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-xs text-muted italic">No lines configured</td>
                </tr>
              )}
            </tbody>
          </table>
          
          <button 
            onClick={handleAddLine}
            className="w-full mt-4 h-10 rounded-md border border-dashed border-gray-700 bg-transparent text-muted hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>ADD</span>
          </button>
        </div>
      </div>
      
      {/* ── Section 2: Sides Registration ────────────────────────────────────── */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-800 bg-surface flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <SplitSquareHorizontal className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              SIDES CONFIGURATION
            </h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">Manage glove sides (e.g., Side A, Side Z) available during inspection.</p>
          </div>
        </div>

        <div className="p-4 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-muted w-32">Side ID</th>
                <th className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-muted flex-1">Display Name</th>
                <th className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-muted text-right w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="">
              {sides.map((side: any, index: number) => {
                const isEditing = editingSideId === side.id;
                
                return (
                  <tr key={side.id} className="hover:bg-surface/50 transition-colors group border-b border-gray-700/50">
                    <td className="py-3 px-3">
                      {isEditing ? (
                        <input 
                          type="text"
                          value={editSideForm.id}
                          onChange={(e) => setEditSideForm({ ...editSideForm, id: e.target.value })}
                          className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded font-mono text-sm font-bold text-brand-secondary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none uppercase"
                        />
                      ) : (
                        <span className="font-mono text-sm font-bold text-brand-secondary">{side.id}</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {isEditing ? (
                        <div className="relative">
                          <input 
                            type="text"
                            autoFocus
                            value={editSideForm.name}
                            onChange={(e) => setEditSideForm({ ...editSideForm, name: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditingSide(side.id);
                              if (e.key === 'Escape') setEditingSideId(null);
                            }}
                            className="w-full h-9 px-2 pr-20 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                            placeholder="Side Name"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none">Enter ↵</span>
                        </div>
                      ) : (
                        <span className="font-mono text-sm text-primary">{side.name}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => saveEditingSide(side.id)} className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/20 transition-colors outline-none" title="Save (Enter)">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingSideId(null)} className="p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 transition-colors outline-none" title="Cancel (Esc)">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => moveSide(index, 'up')}
                            disabled={index === 0}
                            className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors outline-none" title="Move Up"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => moveSide(index, 'down')}
                            disabled={index === sides.length - 1}
                            className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors outline-none" title="Move Down"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => startEditingSide(side)}
                            className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 outline-none transition-colors" title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleRemoveSide(side.id)}
                            className="p-1.5 rounded-md text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors outline-none" title="Remove"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sides.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-xs text-muted italic">No sides configured</td>
                </tr>
              )}
            </tbody>
          </table>
          
          <button 
            onClick={handleAddSide}
            className="w-full mt-4 h-10 shrink-0 rounded-md border border-dashed border-gray-700 bg-transparent text-muted hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>ADD</span>
          </button>
        </div>
      </div>
      
      </div> {/* End of Grid Wrapper */}

      {/* ── Section 3: Shift Registration ────────────────────────────────── */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="p-4 border-b border-gray-800 bg-surface flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              SHIFT REGISTRATION
            </h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">Define factory shift schedules for auto-shift calculations and reporting.</p>
          </div>
        </div>
        
        {shifts.some((s1: any) => shifts.some((s2: any) => checkShiftOverlap(s1, s2))) && (
          <div className="p-3 bg-rose-500/10 border-b border-rose-500/30 text-rose-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Warning: Overlapping shift working hours detected. Please adjust start times or durations.</span>
          </div>
        )}
        
        <div className="p-4 flex-1 flex flex-col gap-4">
          {shifts.map((shift: any, index: number) => {
            const isEditing = editingShiftId === shift.id;
            const overlappingPartner = shifts.find((s: any) => checkShiftOverlap(shift, s));
            
            const startHour = isEditing ? editShiftForm.startHour : (shift.startHour || 0);
            const startMinute = isEditing ? editShiftForm.startMinute : (shift.startMinute || 0);
            const durationHours = isEditing ? editShiftForm.durationHours : (shift.durationHours || 8);

            const startMins = startHour * 60 + startMinute;
            const endMins = startMins + Math.round(durationHours * 60);

            const startStr = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
            const actualEndMins = (endMins - 1 + 1440) % 1440;
            const endHour = Math.floor(actualEndMins / 60);
            const endMinute = actualEndMins % 60;
            const endStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
            const shiftTimeRangeStr = `${startStr} - ${endStr}`;
            
            return (
              <div key={shift.id} className={`bg-surface border rounded-lg p-4 transition-all group ${
                overlappingPartner ? 'border-rose-500/50 bg-rose-500/5' : 'border-gray-800'
              }`}>
                {isEditing ? (
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="relative">
                        <input 
                          type="text" 
                          autoFocus
                          value={editShiftForm.name}
                          onChange={(e) => setEditShiftForm({ ...editShiftForm, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditingShift(shift.id);
                            if (e.key === 'Escape') setEditingShiftId(null);
                          }}
                          className="w-full h-9 px-2 pr-16 bg-canvas border border-gray-700 rounded font-mono text-sm font-bold text-brand-secondary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                          placeholder="Shift Name (e.g. Shift A or A)"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none font-mono">Enter ↵</span>
                      </div>
                      <div className="text-[10px] font-mono text-brand-secondary">Preview: {shiftTimeRangeStr}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted">Start Hour</label>
                          <input 
                            type="text" 
                            value={String(editShiftForm.startHour ?? 0).padStart(2, '0')}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '');
                              const val = parseInt(raw, 10);
                              const safeVal = isNaN(val) ? 0 : Math.min(23, Math.max(0, val));
                              setEditShiftForm({ ...editShiftForm, startHour: safeVal });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditingShift(shift.id);
                              if (e.key === 'Escape') setEditingShiftId(null);
                            }}
                            className="h-9 px-2 w-16 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none text-center"
                          />
                        </div>
                        <span className="font-bold text-muted pt-4">:</span>
                        <div className="flex flex-col">
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted">Start Min</label>
                          <input 
                            type="text" 
                            value={String(editShiftForm.startMinute ?? 0).padStart(2, '0')}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '');
                              const val = parseInt(raw, 10);
                              const safeVal = isNaN(val) ? 0 : Math.min(59, Math.max(0, val));
                              setEditShiftForm({ ...editShiftForm, startMinute: safeVal });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditingShift(shift.id);
                              if (e.key === 'Escape') setEditingShiftId(null);
                            }}
                            className="h-9 px-2 w-16 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none text-center"
                          />
                        </div>
                      </div>

                      <div className="h-8 w-px bg-gray-800 hidden md:block"></div>

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted">Duration (Hrs)</label>
                        <input 
                          type="number" 
                          min="1" max="24" step="0.5"
                          value={editShiftForm.durationHours}
                          onChange={(e) => setEditShiftForm({ ...editShiftForm, durationHours: parseFloat(e.target.value) || 0 })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditingShift(shift.id);
                            if (e.key === 'Escape') setEditingShiftId(null);
                          }}
                          className="h-9 px-2 w-20 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none text-center"
                        />
                      </div>

                      <div className="flex items-center gap-1 pl-2 border-l border-gray-800">
                        <button onClick={() => saveEditingShift(shift.id)} className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/20 transition-colors outline-none" title="Save (Enter)">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingShiftId(null)} className="p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 transition-colors outline-none" title="Cancel (Esc)">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-brand-secondary">{shift.name}</span>
                      <span className="text-[10px] font-mono text-muted bg-gray-800/50 border border-gray-700/50 px-2 py-0.5 rounded flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {shiftTimeRangeStr}
                      </span>
                      {overlappingPartner && (
                        <span className="text-[10px] font-bold uppercase text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Overlaps with {overlappingPartner.name}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => moveShift(index, 'up')}
                        disabled={index === 0}
                        className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors outline-none" title="Move Up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => moveShift(index, 'down')}
                        disabled={index === shifts.length - 1}
                        className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors outline-none" title="Move Down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => startEditingShift(shift)}
                        className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 transition-colors outline-none" title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleRemoveShift(shift.id)}
                        className="p-1.5 rounded-md text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors outline-none" title="Remove"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {isAddingShift && (
            <div className="bg-surface border border-brand-secondary/60 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-4 transition-all">
              <div className="flex-1 space-y-1">
                <div className="relative">
                  <input 
                    type="text" 
                    autoFocus
                    value={newShiftForm.name}
                    onChange={(e) => setNewShiftForm({ ...newShiftForm, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveNewShift();
                      if (e.key === 'Escape') setIsAddingShift(false);
                    }}
                    className="w-full h-9 px-2 pr-16 bg-canvas border border-gray-700 rounded font-mono text-sm font-bold text-brand-secondary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                    placeholder="New Shift Name (e.g. Shift C)"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none font-mono">Enter ↵</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted">Start Hour</label>
                    <input 
                      type="text" 
                      value={String(newShiftForm.startHour ?? 0).padStart(2, '0')}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        const val = parseInt(raw, 10);
                        const safeVal = isNaN(val) ? 0 : Math.min(23, Math.max(0, val));
                        setNewShiftForm({ ...newShiftForm, startHour: safeVal });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveNewShift();
                        if (e.key === 'Escape') setIsAddingShift(false);
                      }}
                      className="h-9 px-2 w-16 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none text-center"
                    />
                  </div>
                  <span className="font-bold text-muted pt-4">:</span>
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted">Start Min</label>
                    <input 
                      type="text" 
                      value={String(newShiftForm.startMinute ?? 0).padStart(2, '0')}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        const val = parseInt(raw, 10);
                        const safeVal = isNaN(val) ? 0 : Math.min(59, Math.max(0, val));
                        setNewShiftForm({ ...newShiftForm, startMinute: safeVal });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveNewShift();
                        if (e.key === 'Escape') setIsAddingShift(false);
                      }}
                      className="h-9 px-2 w-16 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none text-center"
                    />
                  </div>
                </div>

                <div className="h-8 w-px bg-gray-800 hidden md:block"></div>

                <div className="flex flex-col">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted">Duration (Hrs)</label>
                  <input 
                    type="number" 
                    min="1" max="24" step="0.5"
                    value={newShiftForm.durationHours}
                    onChange={(e) => setNewShiftForm({ ...newShiftForm, durationHours: parseFloat(e.target.value) || 0 })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveNewShift();
                      if (e.key === 'Escape') setIsAddingShift(false);
                    }}
                    className="h-9 px-2 w-20 rounded-md bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none text-center"
                  />
                </div>

                <div className="flex items-center gap-1 pl-2 border-l border-gray-800">
                  <button onClick={saveNewShift} className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/20 transition-colors outline-none" title="Save (Enter)">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setIsAddingShift(false)} className="p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 transition-colors outline-none" title="Cancel (Esc)">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {shifts.length === 0 && !isAddingShift && (
            <div className="text-center py-6 text-sm text-muted italic">No shifts configured.</div>
          )}
          
          {!isAddingShift && (
            <button 
              onClick={startAddingShift}
              className="w-full h-10 rounded-md border border-dashed border-gray-700 bg-transparent text-muted hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all outline-none"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span>ADD</span>
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

