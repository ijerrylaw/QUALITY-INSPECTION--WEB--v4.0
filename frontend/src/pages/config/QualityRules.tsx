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

import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Copy,
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
  AlertTriangle,
  Ruler,
  Eye,
  Lock,
} from 'lucide-react';
import RegistryManagerModal from '../../components/config/RegistryManagerModal';
import type { RegistryEntity } from '../../components/config/RegistryManagerModal';
import DefectPickerModal from '../../components/config/DefectPickerModal';
import CategoryPickerModal from '../../components/config/CategoryPickerModal';
import { useConfig, API_BASE_URL } from '../../context/ConfigContext';
import { authHeader, useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/ToastProvider';
import {
  DEFAULT_AQL_CATEGORY_SEED,
  DEFAULT_DEFECT_DEFINITION_SEED,
  DEFAULT_PROFILE_ID,
  isEvalModeUnset,
} from '../../lib/defaultProfileSeed';
// AQL-level / eval-mode option lists + auto-lock rules — extracted verbatim to
// lib/ so CategoryPickerModal (Stage 4b) reuses the exact same selectors. The
// inline category editor below (updateCategoryForm / saveEditCategory / the
// edit-row JSX) is unchanged — only where these constants live moved.
import { ISO_WHITELIST, EVAL_MODES, getAutoLockLabel, getAutoLockValue } from '../../lib/aqlCategoryOptions';

interface QualityRulesProps {
  onDirty: () => void;
  onChange: (data: any) => void;
}

/** Read-only Eval Mode display text — a saved RECORD ONLY category's evalMode is '', which would otherwise render as a blank cell. */
function formatEvalMode(aql: string, evalMode: string): string {
  if (evalMode) return evalMode;
  if (aql === 'RECORD ONLY') return 'RECORD ONLY';
  return evalMode;
}



export function QualityRules({ onDirty, onChange }: QualityRulesProps) {
  const { config } = useConfig();
  const { user } = useAuth();
  const { addToast } = useToast();

  // ── Local State ─────────────────────────────────────────────────────────
  // Seed values come from defaultProfileSeed.ts — the canonical source shared
  // with resolveVerdict.ts and ConfigContext.tsx (machine-enforced mirror).
  // This copy previously restated them and carried the stale BARRIER: 'N/A' /
  // PACKAGING: 'N/A' pair, which mattered more here than in the other two:
  // this seed backs a real editable admin form, so hitting Save on a
  // zero-profile install PERSISTED those wrong values as the live profile.
  // See AUDIT_REPORT.md #10.
  const defaultProfiles = [
    {
      id: DEFAULT_PROFILE_ID,
      name: 'GLOBAL STANDARD',
      isDefault: true,
      aqlCategories: DEFAULT_AQL_CATEGORY_SEED.map(c => ({
        id: c.id,
        name: c.name,
        aql: c.aql,
        evalMode: c.evalMode,
      })),
      defectDefinitions: DEFAULT_DEFECT_DEFINITION_SEED.map(d => ({
        id: d.id,
        name: d.name,
        categoryId: d.categoryId,
      })),
    }
  ];

  const [profiles, setProfiles] = useState<any[]>(config?.inspectionProfiles?.length ? config.inspectionProfiles : defaultProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string>(profiles[0]?.id || 'prof_default');

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editProfileName, setEditProfileName] = useState('');
  const [confirmDeleteProfileId, setConfirmDeleteProfileId] = useState<string | null>(null);

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
  // Which Kanban column's "+ ADD" opened the picker, if any. Replaces the old
  // inline free-text add row (addingToCategory / newDefectName) — defects are
  // now chosen from the global Master Defect List, never typed here (Stage 4a).
  const [pickerCategoryId, setPickerCategoryId] = useState<string | null>(null);

  // ── Master Defect List — lock state ──────────────────────────────────────
  // The Kanban itself never wrote to the registry, but it now needs to KNOW
  // which defects are locked by a frozen gradingSnapshot, so a locked card's
  // Delete is disabled here the same way RegistryManagerModal disables Rename.
  // (A locked defect may still be dragged to another category — Stage 4a
  // decision (d) — so drag is never gated on this.) One GET, refreshed whenever
  // the RegistryManagerModal closes (it may have registered or renamed one).
  const [lockedDefectIds, setLockedDefectIds] = useState<Set<string>>(new Set());
  const [registryRefreshKey, setRegistryRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/registry/defects`, {
          headers: { ...authHeader(user) },
        });
        if (!res.ok) return;
        const rows: { id: string; locked: boolean }[] = await res.json();
        if (!cancelled) {
          setLockedDefectIds(new Set(rows.filter((r) => r.locked).map((r) => r.id)));
        }
      } catch {
        // Non-fatal — worst case a locked card's Delete looks enabled, and the
        // server still rejects the save with 409 + CONFIG_WRITE_FAILURE.
      }
    })();
    return () => { cancelled = true; };
  }, [user, registryRefreshKey]);

  // ── Category Setup State ─────────────────────────────────────────────────
  // Which global registry modal is open, if any. Replaces the old inline
  // category-create row: categories are now registered in the global Category
  // Inventory (Stage 3), not invented ad hoc inside one profile.
  const [registryModal, setRegistryModal] = useState<RegistryEntity | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryForm, setEditCategoryForm] = useState({ name: '', aql: '1.5', evalMode: 'CUMULATIVE' });
  // Stage 4b: the bottom-of-table "+ ADD" opens the Category Inventory picker
  // to ADOPT a global category into this profile (choosing its AQL + eval mode
  // in the same flow). Distinct from the header "ADD CATEGORY" button, which
  // opens RegistryManagerModal to manage the global inventory itself.
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

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

  /**
   * Duplicates the active profile.
   *
   * Categories and defects are references into the GLOBAL Category Inventory /
   * Master Defect List now (Stage 1+), not profile-owned rows — so the copy
   * ADOPTS the same category ids and defect ids as the source, at the same AQL
   * levels / evaluation modes, with each defect kept under the same category id.
   * Nothing is minted and nothing is re-derived from a name.
   *
   * This is the same shape the Stage 4 pickers produce, and the same thing two
   * live profiles already do: FACTORY STANDARD and MEDLINE both reference the
   * global `AND` and `BARRIER` category ids. `syncProfileRegistry` (PATCH
   * /api/config) projects each shared id into its OWN ProfileCategory /
   * ProfileCategoryDefect join row per profile, so the copy grades identically
   * to the source with no id collision.
   *
   * Objects/arrays are shallow-copied per element so the copy never aliases the
   * source's `aqlCategories` / `defectDefinitions` (a plain spread of
   * `activeProfile` would share those array references and any later edit to one
   * profile would silently mutate the other). Every other profile field is
   * carried over verbatim by the spread; only id / name / isDefault are
   * overridden. Sample sizes are top-level config, not per-profile, so they are
   * untouched here.
   */
  const handleDuplicateProfile = () => {
    const newProfileId = `prof_${Date.now()}`;
    const newProfile = {
      ...activeProfile,
      id: newProfileId,
      name: `${activeProfile.name} (COPY)`,
      isDefault: false,
      aqlCategories: (activeProfile.aqlCategories || []).map((cat: any) => ({ ...cat })),
      defectDefinitions: (activeProfile.defectDefinitions || []).map((def: any) => ({ ...def })),
    };
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    setActiveProfileId(newProfileId);
    triggerChange(updated);
  };

  const handleSetDefaultProfile = (id: string) => {
    const updated = profiles.map(p => ({ ...p, isDefault: p.id === id }));
    setProfiles(updated);
    triggerChange(updated);
  };

  // 'prof_default' is the hardcoded sentinel every submission and the
  // resolveVerdict.ts safety net falls back to by id (independent of the
  // isDefault flag, which admins can freely reassign) — deleting it would
  // break AQL grading for any product code without an explicit/resolved
  // profile. Never removable, regardless of which profile isDefault.
  const requestDeleteProfile = () => {
    if (activeProfile.id === 'prof_default') {
      addToast('error', 'GLOBAL STANDARD (DEFAULT) cannot be deleted — every submission falls back to it for AQL grading.');
      return;
    }
    setConfirmDeleteProfileId(activeProfile.id);
  };

  const handleDeleteProfile = () => {
    if (!confirmDeleteProfileId) return;
    const deleted = profiles.find(p => p.id === confirmDeleteProfileId);
    const updated = profiles.filter(p => p.id !== confirmDeleteProfileId);
    setProfiles(updated);
    if (activeProfileId === confirmDeleteProfileId) {
      setActiveProfileId(updated[0]?.id ?? 'prof_default');
    }
    triggerChange(updated);
    setConfirmDeleteProfileId(null);
    addToast('success', `Profile "${deleted?.name ?? ''}" removed. Click Save Configuration to persist.`);
  };

  const saveProfileEdit = (id: string) => {
    if (!editProfileName.trim()) { setEditingProfileId(null); return; }
    const updated = profiles.map(p => p.id === id ? { ...p, name: editProfileName.trim().toUpperCase() } : p);
    setProfiles(updated);
    setEditingProfileId(null);
    triggerChange(updated);
  };

  // Categories
  const updateCategoryForm = (formSetter: any, field: string, value: string) => {
    formSetter((prev: any) => {
      const next = { ...prev, [field]: value };
      // PASS/FAIL is qualitative (no numeric Ac/Re threshold applies) — N/A
      // is the only valid mode, and is still evaluated (aqlEvaluator.ts's
      // N/A branch). RECORD ONLY excludes the category from verdict
      // computation entirely, via evaluationMode: '' (see getAutoLockValue).
      // AND is zero-tolerance but still a numeric count check
      // (ISO2859_MATH_ENGINE.md §2, resolveVerdict.ts's
      // HARDCODED_DEFAULT_PROFILE both specify CUMULATIVE) — it must never
      // be auto-locked here.
      const lockValue = field === 'aql' ? getAutoLockValue(value) : null;
      if (lockValue !== null) {
        next.evalMode = lockValue;
      } else if (field === 'aql' && (next.evalMode === 'N/A' || next.evalMode === '')) {
        next.evalMode = 'CUMULATIVE';
      }
      return next;
    });
  };

  const startEditingCategory = (cat: any) => {
    setEditingCategoryId(cat.id);
    setEditCategoryForm({ name: cat.name, aql: cat.aql, evalMode: cat.evalMode });
  };

  const saveEditCategory = (catId: string) => {
    if (!editCategoryForm.name.trim()) return;
    const updatedCats = activeCategories.map((c: any) => c.id === catId ? {
      ...c,
      name: editCategoryForm.name.trim().toUpperCase(),
      aql: editCategoryForm.aql,
      evalMode: editCategoryForm.evalMode
    } : c);
    const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, aqlCategories: updatedCats } : p);
    setProfiles(updatedProfiles);
    setEditingCategoryId(null);
    triggerChange(updatedProfiles);
  };

  const handleMoveCategory = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === activeCategories.length - 1) return;

    const updatedCats = [...activeCategories];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updatedCats[index], updatedCats[newIndex]] = [updatedCats[newIndex], updatedCats[index]];

    const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, aqlCategories: updatedCats } : p);
    setProfiles(updatedProfiles);
    triggerChange(updatedProfiles);
  };

  /**
   * Adopts a category chosen from the global Category Inventory (Stage 4b
   * picker) into the active profile, at the AQL level + evaluation mode picked
   * inline. The appended entry — { id, name, aql, evalMode } — is the exact
   * shape saveEditCategory writes, so triggerChange / PATCH /api/config /
   * syncProfileRegistry all handle it unchanged (a new category id in a
   * profile's aqlCategories JSON already projects to a fresh ProfileCategory
   * join row).
   *
   * `name` is stored verbatim from the registry — NOT upper-cased like
   * saveEditCategory does — so applyRegistryPlan's category upsert stays a
   * genuine no-op and never rewrites the global Category's stored name.
   *
   * A profile selects a category at most once (@@unique([profileId, categoryId])
   * on ProfileCategory); the picker greys an already-selected row, this is the
   * backstop. Does NOT close the picker — it stays open for multi-add.
   */
  const handleAdoptCategory = (entry: { id: string; name: string; aql: string; evalMode: string }) => {
    if (activeCategories.some((c: any) => c.id === entry.id)) {
      addToast('error', `"${entry.name}" is already in this profile.`);
      return;
    }
    const updatedCats = [...activeCategories, {
      id: entry.id, name: entry.name, aql: entry.aql, evalMode: entry.evalMode,
    }];
    const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, aqlCategories: updatedCats } : p);
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

  /**
   * Files a defect chosen from the global Master Defect List under `categoryId`
   * in the active profile. Replaces the old free-text handleAddDefect: the id
   * and name are the registry's canonical values (never slugified here), and
   * the local-state shape appended to defectDefinitions — { id, name,
   * categoryId } — is byte-identical to what the free-text path produced, so
   * triggerChange / PATCH /api/config / syncProfileRegistry are all unchanged.
   *
   * A defect sits under at most one category per profile
   * (@@unique([profileId, defectId])), so an id already anywhere in this
   * profile is rejected — the picker also greys that row out, but this is the
   * backstop. To relocate an existing defect the admin drags its card.
   *
   * Does NOT close the picker — it stays open for multi-add, with each picked
   * row flipping to "already in this profile" in place (the modal re-reads the
   * updated defect id list from the prop below). Closed via CLOSE / Esc /
   * backdrop, or "REGISTER NEW DEFECT".
   */
  const handlePickDefect = (entry: { id: string; name: string }, categoryId: string) => {
    if (activeDefects.some((d: any) => d.id === entry.id)) {
      addToast('error', `"${entry.name}" is already in this profile — drag its card to move it.`);
      return;
    }
    const updatedDefs = [...activeDefects, { id: entry.id, name: entry.name, categoryId }];
    const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, defectDefinitions: updatedDefs } : p);
    setProfiles(updatedProfiles);
    triggerChange(updatedProfiles);
  };

  const handleDeleteDefect = (defectId: string) => {
    // Locked defects may not be deleted (Stage 4a decision (d)) — the same rule
    // RegistryManagerModal / PATCH /api/registry enforce for rename. The server
    // also refuses it (planRegistry throws if a locked id is dropped from its
    // last profile), but stopping it here keeps the failure out of the save.
    if (lockedDefectIds.has(defectId)) {
      const locked = activeDefects.find((d: any) => d.id === defectId);
      addToast('error', `"${locked?.name ?? defectId}" is used in inspection records and cannot be deleted.`);
      return;
    }
    const updatedDefs = activeDefects.filter((d: any) => d.id !== defectId);
    const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, defectDefinitions: updatedDefs } : p);
    setProfiles(updatedProfiles);
    triggerChange(updatedProfiles);
  };

  const handleMoveDefect = (defectId: string, direction: 'up' | 'down') => {
    const targetDefect = activeDefects.find((d: any) => d.id === defectId);
    if (!targetDefect) return;

    const catDefects = activeDefects.filter((d: any) => d.categoryId === targetDefect.categoryId);
    const catIndex = catDefects.findIndex((d: any) => d.id === defectId);
    if (catIndex < 0) return;
    if (direction === 'up' && catIndex === 0) return;
    if (direction === 'down' && catIndex === catDefects.length - 1) return;

    const swapTarget = catDefects[direction === 'up' ? catIndex - 1 : catIndex + 1];
    const updatedDefs = [...activeDefects];
    const idxA = updatedDefs.findIndex((d: any) => d.id === defectId);
    const idxB = updatedDefs.findIndex((d: any) => d.id === swapTarget.id);

    if (idxA >= 0 && idxB >= 0) {
      [updatedDefs[idxA], updatedDefs[idxB]] = [updatedDefs[idxB], updatedDefs[idxA]];
      const updatedProfiles = profiles.map(p => p.id === activeProfileId ? { ...p, defectDefinitions: updatedDefs } : p);
      setProfiles(updatedProfiles);
      triggerChange(updatedProfiles);
    }
  };

  // Defect RENAME was removed at Stage 4a: a defect's name is a property of the
  // global Master Defect List now, not of a profile's copy of it. Renaming
  // happens only in RegistryManagerModal (which refuses it for locked entries,
  // server-enforced). The Kanban card no longer carries an inline name editor.

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
              <button onClick={handleDuplicateProfile} className="h-9 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-white hover:bg-gray-800 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0">
                <Copy className="w-4 h-4" /> DUPLICATE
              </button>
              <button onClick={requestDeleteProfile} className="h-9 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0">
                <Trash className="w-4 h-4" /> DELETE PROFILE
              </button>
              <button onClick={handleAddProfile} className="h-9 px-4 rounded-lg bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0">
                <Plus className="w-4 h-4" strokeWidth={2} />
                <span>ADD PROFILE</span>
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
              onClick={() => setRegistryModal('category')}
              title="Open the global Category Inventory"
              className="h-9 px-4 rounded-md bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span>ADD CATEGORY</span>
            </button>
          </div>

          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[480px]">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider">Severity Category</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-36">AQL Level</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-40">Eval Mode</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeCategories.map((cat: any, index: number) => {
                  const isEditing = editingCategoryId === cat.id;
                  const targetAql = isEditing ? editCategoryForm.aql : cat.aql;
                  const autoLockLabel = getAutoLockLabel(targetAql);
                  const isAutoLocked = autoLockLabel != null;

                  return (
                    <tr key={cat.id} className="hover:bg-surface-light transition-colors group border-b border-gray-700/50">
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <div className="relative">
                            <input
                              type="text"
                              autoFocus
                              value={editCategoryForm.name}
                              onChange={(e) => updateCategoryForm(setEditCategoryForm, 'name', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditCategory(cat.id);
                                if (e.key === 'Escape') setEditingCategoryId(null);
                              }}
                              className="w-full h-9 px-2 rounded-md bg-canvas border border-brand-secondary ring-1 ring-brand-secondary font-mono text-sm font-bold text-primary outline-none transition-all uppercase"
                              placeholder="Category Name"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-brand-secondary font-mono pointer-events-none">Enter ↵</span>
                          </div>
                        ) : (
                          <span className="font-mono text-sm font-bold text-brand-secondary uppercase">{cat.name}</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {isEditing ? (
                          <select
                            value={editCategoryForm.aql}
                            onChange={(e) => updateCategoryForm(setEditCategoryForm, 'aql', e.target.value)}
                            className="w-full h-9 px-2 rounded-md bg-canvas border border-gray-700 font-mono text-sm text-primary focus:border-brand-secondary outline-none cursor-pointer"
                          >
                            {ISO_WHITELIST.map(aql => (
                              <option key={aql} value={aql}>{aql}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-mono text-sm text-primary">{cat.aql}</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {isEditing ? (
                          <select
                            value={editCategoryForm.evalMode}
                            onChange={(e) => updateCategoryForm(setEditCategoryForm, 'evalMode', e.target.value)}
                            disabled={isAutoLocked}
                            className={`w-full h-9 px-2 rounded-md border font-mono text-sm outline-none ${
                              isAutoLocked
                                ? 'bg-canvas border-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                                : 'bg-canvas border-gray-700 text-primary focus:border-brand-secondary cursor-pointer'
                            }`}
                          >
                            {isAutoLocked ? (
                              <option value={editCategoryForm.evalMode}>{autoLockLabel}</option>
                            ) : (
                              EVAL_MODES.map(mode => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))
                            )}
                          </select>
                        ) : isEvalModeUnset(cat) ? (
                          /* AUDIT_REPORT.md #17 — this category carries NO
                             evaluation mode at all. Only reachable on profiles
                             saved before save-time validation existed (forward-
                             only fix, nothing was backfilled). Surfaced here so
                             an admin can see and fix it BEFORE the save-time
                             validation blocks them with an error. Distinct from
                             evalMode === '' just below, which is a deliberate
                             RECORD ONLY, not a missing value. */
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-wide"
                            title="No Evaluation Mode is set for this category. Edit it and choose a mode — saving this profile will be rejected until you do."
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={2} />
                            NOT SET
                          </span>
                        ) : (
                          <span className="font-mono text-sm text-primary inline-flex items-center gap-1.5">
                            {cat.evalMode === '' ? (
                              <Eye className="w-3.5 h-3.5 text-gray-500 shrink-0" strokeWidth={2} />
                            ) : (
                              <Ruler className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={2} />
                            )}
                            {formatEvalMode(cat.aql, cat.evalMode)}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => saveEditCategory(cat.id)} className="w-8 h-8 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingCategoryId(null)} className="w-8 h-8 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleMoveCategory(index, 'up')}
                              disabled={index === 0}
                              className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors outline-none" title="Move Up"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleMoveCategory(index, 'down')}
                              disabled={index === activeCategories.length - 1}
                              className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors outline-none" title="Move Down"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => startEditingCategory(cat)}
                              className="p-1.5 rounded-md text-muted hover:text-white hover:bg-gray-800 transition-colors outline-none" title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRemoveCategory(cat.id)}
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

                {/* Adopt a category from the global Category Inventory (Stage 4b picker) */}
                <tr>
                  <td colSpan={4} className="py-2 px-3">
                    <button
                      onClick={() => setShowCategoryPicker(true)}
                      className="w-full h-10 rounded border border-dashed border-gray-700 bg-transparent text-muted hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 flex items-center justify-center gap-2 font-semibold text-[11px] uppercase tracking-wider transition-all outline-none"
                    >
                      <Plus className="w-4 h-4" /> ADD
                    </button>
                  </td>
                </tr>
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
        <div className="p-4 border-b border-gray-800 bg-surface flex justify-between items-center gap-4">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              DEFECT MANAGEMENT KANBAN
            </h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">Drag and drop defects to remap their severity categorization in real-time.</p>
          </div>
          <button
            onClick={() => setRegistryModal('defect')}
            title="Open the global Master Defect List"
            className="h-9 px-4 rounded-md bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>ADD DEFECT</span>
          </button>
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
                  <div className={`p-3 border-b border-gray-800 bg-canvas/50 flex flex-col gap-2 rounded-t-xl ${
                    draggedDefectId ? 'bg-surface-light border-dashed' : ''
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-brand-secondary uppercase tracking-wider">{cat.name}</span>
                      <span className="text-[10px] font-mono bg-gray-800 text-muted px-2 py-0.5 rounded-full">{catDefects.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono text-[10px] uppercase px-2 py-0.5 rounded">AQL: {cat.aql}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                        cat.evalMode === 'N/A' || cat.evalMode === ''
                          ? 'bg-gray-500/10 border-gray-500/30 text-gray-400'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      }`}>
                        {cat.evalMode === '' && <Eye className="w-3 h-3" strokeWidth={2} />}
                        {formatEvalMode(cat.aql, cat.evalMode)}
                      </span>
                    </div>
                  </div>

                  {/* Column Body */}
                  <div className="p-3 flex-1 overflow-y-auto max-h-[400px] space-y-2">
                    {catDefects.map((defect: any, idx: number) => {
                      const isLocked = lockedDefectIds.has(defect.id);
                      return (
                        <div
                          key={defect.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, defect.id)}
                          className="bg-canvas border border-gray-700 rounded-lg p-2.5 flex items-center justify-between group cursor-grab active:cursor-grabbing hover:bg-surface-light shadow-sm transition-all"
                        >
                          <span className="font-mono text-sm font-bold text-primary select-none inline-flex items-center gap-1.5 min-w-0">
                            {isLocked && (
                              <Lock
                                className="w-3 h-3 text-muted shrink-0"
                                strokeWidth={2}
                                aria-label="Used in inspection records — name is locked, cannot be deleted"
                              />
                            )}
                            <span className="truncate">{defect.name}</span>
                          </span>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0">
                            <button
                              onClick={() => handleMoveDefect(defect.id, 'up')}
                              disabled={idx === 0}
                              className="p-1 rounded text-muted hover:text-white disabled:opacity-20 outline-none"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveDefect(defect.id, 'down')}
                              disabled={idx === catDefects.length - 1}
                              className="p-1 rounded text-muted hover:text-white disabled:opacity-20 outline-none"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDefect(defect.id)}
                              disabled={isLocked}
                              className="p-1 rounded hover:bg-rose-500/20 text-muted hover:text-rose-400 outline-none disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted"
                              title={isLocked ? 'Used in inspection records — cannot be deleted' : 'Remove from this profile'}
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add from the global Master Defect List (Stage 4a picker) */}
                    <button
                      onClick={() => setPickerCategoryId(cat.id)}
                      className="w-full h-10 rounded border border-dashed border-gray-700 bg-transparent text-muted hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 flex items-center justify-center gap-2 font-semibold text-[11px] uppercase tracking-wider transition-all outline-none"
                    >
                      <Plus className="w-4 h-4" /> ADD
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Delete Profile Confirmation Modal — matches ConfigPage.tsx's
           discard/navigation-guard modal pattern (bg-black/70 backdrop,
           bg-canvas card, rose AlertTriangle icon, cancel/confirm pair) ── */}
      {confirmDeleteProfileId && (() => {
        const target = profiles.find(p => p.id === confirmDeleteProfileId);
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-canvas border border-gray-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
              <div className="flex items-start gap-4 p-4 border-b border-gray-800">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-rose-400" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-wide text-primary mb-1">
                    DELETE PROFILE?
                  </h3>
                  <p className="text-sm text-muted">
                    Are you sure you want to permanently delete{' '}
                    <span className="font-bold text-white uppercase">{target?.name}</span>? This cannot be undone — any product codes still mapped to this profile will fall back to the default profile for grading.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-surface flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmDeleteProfileId(null)}
                  className="h-10 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                  <span>CANCEL</span>
                </button>
                <button
                  onClick={handleDeleteProfile}
                  className="h-10 px-5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none border border-rose-500/50 shadow-sm"
                >
                  <Trash className="w-4 h-4" strokeWidth={2} />
                  <span>CONFIRM DELETE</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Global registry management ───────────────────────────────────────
          Reached from the two section header buttons, and from the defect
          picker's "REGISTER NEW DEFECT". Manages the GLOBAL Master Defect List /
          Category Inventory — registering and renaming entries system-wide. It
          does not assign anything to a profile; the Kanban "+ ADD" picker and
          drag-and-drop own that. Closing it bumps registryRefreshKey so the
          Kanban's lock state (and the picker's list, next time it opens) pick
          up a just-registered or just-renamed entry. */}
      {registryModal && (
        <RegistryManagerModal
          entity={registryModal}
          onClose={() => { setRegistryModal(null); setRegistryRefreshKey((k) => k + 1); }}
        />
      )}

      {/* ── Defect picker (Stage 4a) — the per-category "+ ADD" button ───────── */}
      {pickerCategoryId && (() => {
        const pickerCategory = activeCategories.find((c: any) => c.id === pickerCategoryId);
        if (!pickerCategory) return null;
        return (
          <DefectPickerModal
            categoryName={pickerCategory.name}
            existingDefectIds={activeDefects.map((d: any) => d.id)}
            onPick={(entry) => handlePickDefect(entry, pickerCategoryId)}
            onClose={() => setPickerCategoryId(null)}
            onRegisterNew={() => { setPickerCategoryId(null); setRegistryModal('defect'); }}
          />
        );
      })()}

      {/* ── Category picker (Stage 4b) — the bottom-of-table "+ ADD" ─────────── */}
      {showCategoryPicker && (
        <CategoryPickerModal
          profileName={activeProfile.name}
          existingCategoryIds={activeCategories.map((c: any) => c.id)}
          onPick={handleAdoptCategory}
          onClose={() => setShowCategoryPicker(false)}
          onRegisterNew={() => { setShowCategoryPicker(false); setRegistryModal('category'); }}
        />
      )}

    </div>
  );
}







