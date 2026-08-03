/**
 * @file QualityRules.tsx
 * @description Phase 3: Configuration Control - Quality Rules
 *
 * Provides interfaces to manage:
 * 1. Inspection Profiles (CRUD, Default)
 * 2. Defect Category Setup — AQL level & Evaluation Mode per category (CUMULATIVE / GRANULAR / N/A)
 * 3. ISO Sample Sizes — single source of truth (moved from ProductEngine)
 * 4. Defect Management Kanban Board (per profile, drag-and-drop)
 *
 * Data contracts: DATA_SCHEMAS_AND_TYPES.md (EvaluationMode: CUMULATIVE | GRANULAR | N/A)
 * Math logic: ISO2859_MATH_ENGINE.md
 */

import { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckSquare,
  Lock,
  Plus,
  Trash,
  Edit2,
  LayoutGrid,
  Check,
  X,
  Settings2,
  ChevronDown,
  ListOrdered,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';

interface QualityRulesProps {
  onDirty: () => void;
  onChange: (data: any) => void;
}

// ISO 2859-1 AQL whitelist — ISO2859_MATH_ENGINE.md §1
const ISO_WHITELIST = ['AND', '0.65', '1.0', '1.5', '2.5', '4.0', '6.5', 'PASS/FAIL/NIL'];
// Evaluation Modes — DATA_SCHEMAS_AND_TYPES.md §2
const EVAL_MODES: string[] = ['CUMULATIVE', 'GRANULAR'];

const IconMap: Record<string, any> = {
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckSquare,
};

export function QualityRules({ onDirty, onChange }: QualityRulesProps) {
  const { config } = useConfig();
  
  // ── Local State ─────────────────────────────────────────────────────────
  const defaultProfiles = [
    {
      id: 'prof_default',
      name: 'GLOBAL STANDARD',
      isDefault: true,
      aqlCategories: [
        { id: 'BARRIER',   name: 'BARRIER',   aql: 'AND',           evalMode: 'N/A' },
        { id: 'CRITICAL',  name: 'CRITICAL',  aql: '1.5',           evalMode: 'CUMULATIVE' },
        { id: 'MAJOR',     name: 'MAJOR',     aql: '2.5',           evalMode: 'CUMULATIVE' },
        { id: 'MINOR',     name: 'MINOR',     aql: '4.0',           evalMode: 'GRANULAR' },
        { id: 'PACKAGING', name: 'PACKAGING', aql: 'PASS/FAIL/NIL', evalMode: 'N/A' },
      ],
      defectDefinitions: [
        { id: 'def_hole', name: 'Hole', categoryId: 'BARRIER' },
        { id: 'def_tear', name: 'Tear', categoryId: 'BARRIER' },
        { id: 'def_stain', name: 'Stain', categoryId: 'CRITICAL' },
        { id: 'def_particle', name: 'Particle', categoryId: 'CRITICAL' },
        { id: 'def_dirt', name: 'Dirt', categoryId: 'MAJOR' },
        { id: 'def_flow', name: 'Flow Mark', categoryId: 'MINOR' },
        { id: 'def_box', name: 'Box Damage', categoryId: 'PACKAGING' },
      ]
    }
  ];

  const [profiles, setProfiles] = useState<any[]>(config?.inspectionProfiles?.length ? config.inspectionProfiles : defaultProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string>(profiles[0]?.id || 'prof_default');

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editProfileName, setEditProfileName] = useState('');

  // ── ISO Sample Sizes State ───────────────────────────────────────────────
  const DEFAULT_SAMPLE_SIZES = [13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250];
  const [sampleSizes, setSampleSizes] = useState<number[]>(
    config?.sampleSizes?.length ? config.sampleSizes : DEFAULT_SAMPLE_SIZES
  );
  const [newSampleSize, setNewSampleSize] = useState('');
  const [isAddingSampleSize, setIsAddingSampleSize] = useState(false);
  const [editingSampleSize, setEditingSampleSize] = useState<number | null>(null);
  const [editSampleSizeVal, setEditSampleSizeVal] = useState('');

  // ── Kanban State ─────────────────────────────────────────────────────────
  const [draggedDefectId, setDraggedDefectId] = useState<string | null>(null);
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [newDefectName, setNewDefectName] = useState('');
  const [editingDefectId, setEditingDefectId] = useState<string | null>(null);
  const [editDefectName, setEditDefectName] = useState('');

  // ── Generic Change Trigger ────────────────────────────────────────────────
  const triggerChange = (newProfiles: any[], newSampleSizes?: number[]) => {
    onDirty();
    onChange({
      inspectionProfiles: newProfiles,
      ...(newSampleSizes !== undefined ? { sampleSizes: newSampleSizes } : {}),
    });
  };

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const activeCategories = activeProfile.aqlCategories || [];
  const activeDefects = activeProfile.defectDefinitions || [];

  // Profiles
  const handleAddProfile = () => {
    const newId = `prof_${Date.now()}`;
    const newProfile = {
      id: newId,
      name: 'NEW PROFILE',
      isDefault: false,
      aqlCategories: [],
      defectDefinitions: []
    };
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    setActiveProfileId(newId);
    triggerChange(updated);
  };

  const handleDuplicateProfile = () => {
    const newId = `prof_${Date.now()}`;
    const newProfile = {
      ...activeProfile,
      id: newId,
      name: `${activeProfile.name} (COPY)`,
      isDefault: false,
    };
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    setActiveProfileId(newId);
    triggerChange(updated);
  };

  const handleSetDefaultProfile = (id: string) => {
    const updated = profiles.map(p => ({ ...p, isDefault: p.id === id }));
    setProfiles(updated);
    triggerChange(updated);
  };

  const saveProfileEdit = (id: string) => {
    if (!editProfileName.trim()) { setEditingProfileId(null); return; }
    const updated = profiles.map(p => p.id === id ? { ...p, name: editProfileName.trim().toUpperCase() } : p);
    setProfiles(updated);
    setEditingProfileId(null);
    triggerChange(updated);
  };

  // Categories
  const handleUpdateCategory = (id: string, field: 'aql' | 'evalMode', value: string) => {
    const updatedCats = activeCategories.map((c: any) => {
      if (c.id !== id) return c;
      const newCat = { ...c, [field]: value };
      
      // Auto-lock evalMode per ISO2859_MATH_ENGINE.md §1 (Zero Tolerance Overrides)
      if (field === 'aql' && (value === 'AND' || value === 'PASS/FAIL/NIL')) {
        newCat.evalMode = 'N/A';
      } else if (field === 'aql' && newCat.evalMode === 'N/A') {
        newCat.evalMode = 'CUMULATIVE';
      }
      return newCat;
    });
    
    const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, aqlCategories: updatedCats } : p);
    setProfiles(updatedProfiles);
    triggerChange(updatedProfiles);
  };

  const handleAddCategory = () => {
    const newCat = {
      id: `cat_${Date.now()}`,
      name: 'NEW CATEGORY',
      aql: '1.5',
      evalMode: 'CUMULATIVE',
    };
    const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, aqlCategories: [...activeCategories, newCat] } : p);
    setProfiles(updatedProfiles);
    triggerChange(updatedProfiles);
  };

  // ── Sample Size Handlers ──────────────────────────────────────────────────
  const handleAddSampleSize = () => {
    const val = parseInt(newSampleSize.trim(), 10);
    if (!isNaN(val) && val > 0 && !sampleSizes.includes(val)) {
      const updated = [...sampleSizes, val].sort((a, b) => a - b);
      setSampleSizes(updated);
      setNewSampleSize('');
      setIsAddingSampleSize(false);
      triggerChange(profiles, updated);
    } else {
      setIsAddingSampleSize(false);
      setNewSampleSize('');
    }
  };

  const handleEditSampleSize = (oldSize: number, newSizeStr: string) => {
    const val = parseInt(newSizeStr.trim(), 10);
    if (isNaN(val) || val <= 0 || (val !== oldSize && sampleSizes.includes(val))) {
      setEditingSampleSize(null);
      return;
    }
    const updated = sampleSizes.map(s => s === oldSize ? val : s).sort((a, b) => a - b);
    setSampleSizes(updated);
    setEditingSampleSize(null);
    triggerChange(profiles, updated);
  };

  const handleRemoveSampleSize = (size: number) => {
    const updated = sampleSizes.filter(s => s !== size);
    setSampleSizes(updated);
    triggerChange(profiles, updated);
  };

  const handleMoveSampleSize = (size: number, dir: 'up' | 'down') => {
    const idx = sampleSizes.indexOf(size);
    if (idx < 0) return;
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === sampleSizes.length - 1) return;
    const updated = [...sampleSizes];
    const temp = updated[idx];
    updated[idx] = updated[dir === 'up' ? idx - 1 : idx + 1];
    updated[dir === 'up' ? idx - 1 : idx + 1] = temp;
    setSampleSizes(updated);
    triggerChange(profiles, updated);
  };

  const handleRemoveCategory = (id: string) => {
    const updatedCats = activeCategories.filter((c: any) => c.id !== id);
    const updatedDefs = activeDefects.filter((d: any) => d.categoryId !== id);
    const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, aqlCategories: updatedCats, defectDefinitions: updatedDefs } : p);
    setProfiles(updatedProfiles);
    triggerChange(updatedProfiles);
  };

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, defectId: string) => {
    setDraggedDefectId(defectId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const handleDrop = (e: React.DragEvent, targetCategoryId: string) => {
    e.preventDefault();
    if (draggedDefectId) {
      const updatedDefs = activeDefects.map((d: any) => d.id === draggedDefectId ? { ...d, categoryId: targetCategoryId } : d);
      const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, defectDefinitions: updatedDefs } : p);
      setProfiles(updatedProfiles);
      setDraggedDefectId(null);
      triggerChange(updatedProfiles);
    }
  };

  // CRUD Defects
  const handleAddDefect = (categoryId: string) => {
    if (newDefectName.trim()) {
      const newId = `def_${Date.now()}`;
      const updatedDefs = [...activeDefects, { id: newId, name: newDefectName.trim(), categoryId }];
      const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, defectDefinitions: updatedDefs } : p);
      setProfiles(updatedProfiles);
      setNewDefectName('');
      setAddingToCategory(null);
      triggerChange(updatedProfiles);
    }
  };

  const handleDeleteDefect = (id: string) => {
    const updatedDefs = activeDefects.filter((d: any) => d.id !== id);
    const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, defectDefinitions: updatedDefs } : p);
    setProfiles(updatedProfiles);
    triggerChange(updatedProfiles);
  };

  const startEditingDefect = (defect: { id: string, name: string }) => {
    setEditingDefectId(defect.id);
    setEditDefectName(defect.name);
  };

  const saveEditDefect = (id: string) => {
    if (editDefectName.trim()) {
      const updatedDefs = activeDefects.map((d: any) => d.id === id ? { ...d, name: editDefectName.trim() } : d);
      const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, defectDefinitions: updatedDefs } : p);
      setProfiles(updatedProfiles);
      triggerChange(updatedProfiles);
    }
    setEditingDefectId(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300 w-full">
      
      {/* ── Top Control Bar: Profile Selection ────────────────────────────── */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-800 bg-surface flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              INSPECTION PROFILES
            </h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">Select or create rulesets to assign to specific SKUs.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDuplicateProfile} className="h-9 px-4 rounded-md bg-canvas border border-gray-700 text-muted hover:text-white hover:bg-gray-800 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0">
              DUPLICATE
            </button>
            <button onClick={handleAddProfile} className="h-9 px-4 rounded-md bg-canvas border border-gray-700 text-brand-secondary hover:text-white hover:bg-brand-primary/20 hover:border-brand-secondary font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0">
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span>NEW PROFILE</span>
            </button>
          </div>
        </div>
        
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex items-center min-w-[280px]">
            <select
              value={activeProfileId}
              onChange={(e) => setActiveProfileId(e.target.value)}
              className="w-full h-9 px-3 pr-10 rounded-lg bg-canvas border border-gray-700 font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none appearance-none cursor-pointer"
            >
              {profiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isDefault ? '(DEFAULT)' : ''}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>

          {editingProfileId === activeProfileId ? (
            <div className="flex items-center gap-2 bg-surface p-1 rounded-lg border border-brand-secondary shadow-sm">
              <input
                autoFocus
                value={editProfileName}
                onChange={e => setEditProfileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveProfileEdit(activeProfileId);
                  if (e.key === 'Escape') setEditingProfileId(null);
                }}
                className="h-9 px-2 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none w-48"
              />
              <button onClick={() => saveProfileEdit(activeProfileId)} className="h-9 px-3 rounded bg-brand-primary/20 text-brand-secondary hover:bg-brand-primary/30 flex items-center gap-2 font-bold text-xs outline-none">
                <Check className="w-4 h-4" /> SAVE
              </button>
              <button onClick={() => setEditingProfileId(null)} className="h-9 px-3 rounded bg-canvas text-muted hover:text-white border border-gray-700 flex items-center gap-2 font-bold text-xs outline-none">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditingProfileId(activeProfileId); setEditProfileName(activeProfile.name); }} className="h-9 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-white flex items-center gap-2 font-bold text-xs transition-colors outline-none">
                <Edit2 className="w-4 h-4" /> RENAME
              </button>
              {!activeProfile?.isDefault && (
                <button onClick={() => handleSetDefaultProfile(activeProfileId)} className="h-9 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-emerald-400 hover:border-emerald-500/30 flex items-center gap-2 font-bold text-xs transition-colors outline-none">
                  <Check className="w-4 h-4" /> SET AS DEFAULT
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Split Grid: Defect Category Setup + ISO Sample Sizes ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left (2/3): Defect Category Setup ─────────────────────────────── */}
        <div className="lg:col-span-2 bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-800 bg-surface flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                DEFECT CATEGORY SETUP
              </h3>
              <p className="text-xs text-muted mt-1 font-normal normal-case">Bind ISO 2859-1 inspection levels to severity categories.</p>
            </div>
            <button
              onClick={handleAddCategory}
              className="h-9 px-4 rounded-md bg-canvas border border-gray-700 text-brand-secondary hover:text-white hover:bg-brand-primary/20 hover:border-brand-secondary font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span>ADD</span>
            </button>
          </div>

          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[480px]">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider">Severity Category</th>
                  <th className="py-3 px-3 text-xs font-semibold text-brand-secondary uppercase tracking-wider w-36">AQL Level</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-40">Eval Mode</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider text-right w-12">Act.</th>
                </tr>
              </thead>
              <tbody>
                {activeCategories.map((cat: any) => {
                  const isAutoLocked = cat.aql === 'AND' || cat.aql === 'PASS/FAIL/NIL';

                  return (
                    <tr key={cat.id} className="hover:bg-surface/50 transition-colors group border-b border-gray-700/50">
                      <td className="py-3 px-3">
                        <span className="font-mono text-sm font-bold text-primary">{cat.name}</span>
                      </td>

                      <td className="py-3 px-3">
                        <select
                          value={cat.aql}
                          onChange={(e) => handleUpdateCategory(cat.id, 'aql', e.target.value)}
                          className="w-full h-9 px-2 rounded-md bg-canvas border border-gray-700 font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none transition-all cursor-pointer"
                        >
                          {ISO_WHITELIST.map(aql => (
                            <option key={aql} value={aql}>{aql}</option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 px-3">
                        <div className="relative">
                          <select
                            value={cat.evalMode}
                            onChange={(e) => handleUpdateCategory(cat.id, 'evalMode', e.target.value)}
                            disabled={isAutoLocked}
                            className={`w-full h-9 px-2 rounded-md border font-mono text-sm outline-none transition-all ${
                              isAutoLocked
                                ? 'bg-canvas border-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                                : 'bg-canvas border-gray-700 text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary cursor-pointer'
                            }`}
                          >
                            {isAutoLocked ? (
                              <option value="N/A">N/A (Auto-Locked)</option>
                            ) : (
                              EVAL_MODES.map(mode => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))
                            )}
                          </select>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleRemoveCategory(cat.id)}
                          className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors outline-none ml-auto"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Right (1/3): ISO Sample Sizes ──────────────────────────────────── */}
        <div className="lg:col-span-1 bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 border-b border-gray-800 bg-surface">
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              ISO SAMPLE SIZES
            </h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">Standard AQL bracket sizes for lot sampling.</p>
          </div>

          <div className="p-4 flex flex-col gap-2 flex-1">
            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
              {sampleSizes.map((size, idx) => (
                <div
                  key={size}
                  className="py-3 px-3 border-b border-gray-700/50 flex items-center justify-between group relative hover:bg-surface-light transition-colors"
                >
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
                          className="w-full h-9 px-2 pr-12 rounded bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-muted font-mono pointer-events-none">Enter ↵</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => handleEditSampleSize(size, editSampleSizeVal)} className="w-6 h-6 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingSampleSize(null)} className="w-6 h-6 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="font-mono text-sm text-primary">{size}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleMoveSampleSize(size, 'up')} disabled={idx === 0} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-primary disabled:opacity-20 outline-none">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleMoveSampleSize(size, 'down')} disabled={idx === sampleSizes.length - 1} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-primary disabled:opacity-20 outline-none">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button onClick={() => { setEditingSampleSize(size); setEditSampleSizeVal(String(size)); }} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white hover:bg-gray-700 outline-none">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleRemoveSampleSize(size)} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-rose-400 hover:bg-rose-500/10 outline-none">
                          <Trash className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {isAddingSampleSize ? (
              <div className="py-3 px-3 border-b border-gray-700/50 flex items-center gap-1">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="number"
                    autoFocus
                    value={newSampleSize}
                    onChange={(e) => setNewSampleSize(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSampleSize();
                      if (e.key === 'Escape') { setIsAddingSampleSize(false); setNewSampleSize(''); }
                    }}
                    placeholder="e.g. 800"
                    className="w-full h-9 px-2 pr-14 rounded bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] text-muted font-mono pointer-events-none">Enter ↵</span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={handleAddSampleSize} className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/20 outline-none">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setIsAddingSampleSize(false); setNewSampleSize(''); }} className="p-1.5 rounded text-rose-400 hover:bg-rose-500/20 outline-none">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingSampleSize(true)}
                className="mt-2 w-full h-10 rounded border border-dashed border-gray-700 bg-transparent text-muted hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 flex items-center justify-center gap-2 font-semibold text-[11px] uppercase tracking-wider transition-all outline-none"
              >
                <Plus className="w-4 h-4" /> ADD
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Section: Defect Management Kanban Board ──────────────────────────── */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="p-4 border-b border-gray-800 bg-surface">
          <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            DEFECT MANAGEMENT KANBAN
          </h3>
          <p className="text-xs text-muted mt-1 font-normal normal-case">Drag and drop defects to remap their severity categorization in real-time.</p>
        </div>
        
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-4 min-w-max pb-4">
            {activeCategories.map((cat: any) => {
              const catDefects = activeDefects.filter((d: any) => d.categoryId === cat.id);
              
              return (
                <div 
                  key={cat.id} 
                  className={`w-72 shrink-0 bg-surface border border-gray-800 rounded-xl flex flex-col`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, cat.id)}
                >
                  {/* Column Header */}
                  <div className={`p-3 border-b border-gray-800 bg-canvas/50 flex items-center justify-between rounded-t-xl ${
                    draggedDefectId ? 'bg-surface-light border-dashed' : ''
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs uppercase tracking-wider text-primary font-mono">{cat.name}</span>
                    </div>
                    <span className="text-[10px] font-mono bg-gray-800 text-muted px-2 py-0.5 rounded-full">{catDefects.length}</span>
                  </div>

                  {/* Column Body */}
                  <div className="p-3 flex-1 overflow-y-auto max-h-[400px] space-y-2">
                    {catDefects.map((defect: any) => (
                      <div 
                        key={defect.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, defect.id)}
                        className="bg-canvas border border-gray-700 rounded-lg p-2.5 flex items-center justify-between group cursor-grab active:cursor-grabbing hover:bg-surface-light shadow-sm transition-all"
                      >
                        {editingDefectId === defect.id ? (
                          <div className="flex items-center gap-1 w-full">
                            <div className="relative flex-1 min-w-0">
                              <input 
                                autoFocus
                                type="text" 
                                value={editDefectName}
                                onChange={(e) => setEditDefectName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEditDefect(defect.id);
                                  if (e.key === 'Escape') setEditingDefectId(null);
                                }}
                                className="w-full h-9 px-2 pr-14 rounded bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted font-mono pointer-events-none">Enter ↵</span>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button onClick={() => saveEditDefect(defect.id)} className="p-1 rounded text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingDefectId(null)} className="p-1 rounded text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span className="font-mono text-sm font-bold text-primary select-none">{defect.name}</span>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                              <button onClick={() => startEditingDefect(defect)} className="p-1 rounded hover:bg-gray-700 text-muted hover:text-white outline-none">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteDefect(defect.id)} className="p-1 rounded hover:bg-rose-500/20 text-muted hover:text-rose-400 outline-none">
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    
                    {/* Inline Add Form */}
                    {addingToCategory === cat.id ? (
                      <div className="bg-canvas border border-gray-700 rounded-lg p-2 shadow-inner flex items-center gap-1">
                        <div className="relative flex-1 min-w-0">
                          <input 
                            autoFocus
                            type="text"
                            value={newDefectName}
                            onChange={(e) => setNewDefectName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddDefect(cat.id);
                              if (e.key === 'Escape') setAddingToCategory(null);
                            }}
                            placeholder="Defect Name..."
                            className="w-full h-9 px-2 pr-14 rounded bg-canvas border border-gray-700 text-primary font-mono text-sm focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                          />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-muted font-mono pointer-events-none">Enter ↵</span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => handleAddDefect(cat.id)} className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setAddingToCategory(null)} className="p-1.5 rounded text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setAddingToCategory(cat.id)}
                        className="w-full h-10 rounded border border-dashed border-gray-700 bg-transparent text-muted hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 flex items-center justify-center gap-2 font-semibold text-[11px] uppercase tracking-wider transition-all outline-none"
                      >
                        <Plus className="w-4 h-4" /> ADD
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}

