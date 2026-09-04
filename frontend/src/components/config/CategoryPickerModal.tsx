/**
 * @file CategoryPickerModal.tsx
 * @description Stage 4b picker — the bottom-of-table "+ ADD" in DEFECT CATEGORY
 * SETUP opens this to ADOPT a category from the global Category Inventory into
 * the active profile, choosing its AQL level + evaluation mode in the same flow.
 *
 * ── One combined flow ──────────────────────────────────────────────────────
 * Modelled on DefectPickerModal: search + list from GET /api/registry/categories
 * + REGISTER NEW. But a Category is a name only — how it grades is a per-profile
 * decision (DATA_SCHEMAS_AND_TYPES.md §2.2) — so picking a row expands it inline
 * to an AQL-level + evaluation-mode selector (the SAME ISO_WHITELIST / EVAL_MODES
 * / auto-lock rules QualityRules.tsx's inline editor uses, from
 * lib/aqlCategoryOptions.ts). Confirming hands back
 * `{ id, name, aql, evalMode }`; the parent appends it to the active profile's
 * `aqlCategories` in draftConfig — the exact shape saveEditCategory writes — so
 * nothing downstream of triggerChange / PATCH /api/config changes. The existing
 * syncProfileRegistry projection already turns a new category id in a profile's
 * JSON into a fresh ProfileCategory join row (it is how FACTORY STANDARD and
 * MEDLINE already share the AND / BARRIER category ids).
 *
 * ── Multi-add, modal stays open ────────────────────────────────────────────
 * Confirming an adoption flips the row to the greyed "already in this profile"
 * state in place and keeps the modal open; close via CLOSE / Esc / backdrop.
 *
 * ── Lock state ─────────────────────────────────────────────────────────────
 * A category locked by a frozen gradingSnapshot in SOME profile can still be
 * adopted into a DIFFERENT profile — adoption only creates a new ProfileCategory
 * row and never touches the global Category's identity. The padlock here is
 * informational; only rename/delete of the global entity is lock-gated.
 *
 * ── Not this stage ─────────────────────────────────────────────────────────
 * - No registry create/rename here — REGISTER NEW routes to RegistryManagerModal.
 * - No server write — draftConfig only, saved by the screen's single SAVE.
 * - No defect bootstrapping — defects are added afterward via the Kanban "+ ADD"
 *   once the new category's column exists.
 *
 * Styling follows UI_DESIGN_SYSTEM.md — bg-canvas modal card, §4.3 search
 * toolbar, §4.2 reading table, value chips for codes, §3.1 selects.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Lock, Plus, Search, Tag, X } from 'lucide-react';
import { API_BASE_URL } from '../../context/ConfigContext';
import { authHeader, useAuth } from '../../context/AuthContext';
import { ISO_WHITELIST, EVAL_MODES, getAutoLockLabel, getAutoLockValue } from '../../lib/aqlCategoryOptions';

interface CategoryRegistryEntry {
  id: string;
  code: string;
  name: string;
  locked: boolean;
  submissionCount: number;
  profileCount: number;
}

/** What the parent needs to append one ProfileCategory-equivalent to draftConfig. */
export interface CategoryAdoption {
  id: string;
  name: string;
  /** engine/admin-UI dialect: 'AND' | '0.65' | ... | 'PASS/FAIL' | 'RECORD ONLY' */
  aql: string;
  /** engine dialect: 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '' (RECORD ONLY) */
  evalMode: string;
}

interface Props {
  /** Display name of the profile the adoption files into — header context only. */
  profileName: string;
  /**
   * Category ids already in the active profile. A profile selects a category at
   * most once, so an already-present entry is shown greyed with an "ALREADY IN
   * THIS PROFILE" label. Grows as the admin adopts rows this session (the parent
   * re-derives it); `justAddedIds` covers the render before that round-trips.
   */
  existingCategoryIds: string[];
  /** Hands back one confirmed adoption. Does NOT close the modal (multi-add). */
  onPick: (entry: CategoryAdoption) => void;
  onClose: () => void;
  /** Opens RegistryManagerModal (category mode) to register a brand-new name. */
  onRegisterNew: () => void;
}

const DEFAULT_FORM = { aql: '1.5', evalMode: 'CUMULATIVE' };

export default function CategoryPickerModal({
  profileName,
  existingCategoryIds,
  onPick,
  onClose,
  onRegisterNew,
}: Props) {
  const { user } = useAuth();

  const [entries, setEntries] = useState<CategoryRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Rows adopted in THIS session — flips them to the greyed state immediately.
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set());
  // Which row is expanded for AQL / eval-mode selection, if any.
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ aql: string; evalMode: string }>(DEFAULT_FORM);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inProfile = useMemo(
    () => new Set([...existingCategoryIds, ...justAddedIds]),
    [existingCategoryIds, justAddedIds],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/registry/categories`, {
        headers: { ...authHeader(user) },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setEntries(await res.json());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the Category Inventory.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // Esc cancels an open row-picker first, then closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pickingId) setPickingId(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pickingId]);

  const startPicking = useCallback((entry: CategoryRegistryEntry) => {
    setForm(DEFAULT_FORM);
    setPickingId(entry.id);
  }, []);

  const updateForm = useCallback((field: 'aql' | 'evalMode', value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Mirrors updateCategoryForm() in QualityRules.tsx: PASS/FAIL forces
      // evalMode 'N/A', RECORD ONLY forces '' (true exclusion), and stepping AQL
      // OFF an auto-lock value resets a locked-in 'N/A'/'' back to CUMULATIVE.
      const lockValue = field === 'aql' ? getAutoLockValue(value) : null;
      if (lockValue !== null) next.evalMode = lockValue;
      else if (field === 'aql' && (next.evalMode === 'N/A' || next.evalMode === '')) next.evalMode = 'CUMULATIVE';
      return next;
    });
  }, []);

  const confirmAdd = useCallback((entry: CategoryRegistryEntry) => {
    onPick({ id: entry.id, name: entry.name, aql: form.aql, evalMode: form.evalMode });
    setJustAddedIds((prev) => new Set(prev).add(entry.id));
    setPickingId(null);
  }, [onPick, form]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? entries.filter((e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q))
      : entries;
    return [...rows].sort((a, b) => {
      const ai = inProfile.has(a.id) ? 1 : 0;
      const bi = inProfile.has(b.id) ? 1 : 0;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    });
  }, [entries, search, inProfile]);

  const availableCount = useMemo(
    () => entries.filter((e) => !inProfile.has(e.id)).length,
    [entries, inProfile],
  );

  const colSpan = 3;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !pickingId) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Adopt a category from the Category Inventory"
        className="bg-canvas border border-gray-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="p-4 border-b border-gray-800 bg-surface flex justify-between items-start gap-4 shrink-0">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              ADD CATEGORY
            </h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">
              Choose from the Category Inventory and set its AQL level + evaluation mode for{' '}
              <span className="font-mono font-bold text-brand-secondary uppercase">{profileName}</span>.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-primary hover:bg-surface-light outline-none shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Toolbar (UI_DESIGN_SYSTEM §4.3) ────────────────────────────── */}
        <div className="px-4 pt-4 flex justify-between items-center gap-3 shrink-0">
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories by name or code…"
              className="w-full h-9 pl-8 pr-2 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
            />
          </div>
          <button
            onClick={onRegisterNew}
            className="h-9 px-4 rounded-md bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>REGISTER NEW CATEGORY</span>
          </button>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-24">Code</th>
                <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider">Name</th>
                <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider text-right w-24">Add</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={colSpan} className="py-10 text-center text-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…
                </td></tr>
              )}

              {!isLoading && loadError && (
                <tr><td colSpan={colSpan} className="py-10 text-center text-rose-400 text-sm">
                  {loadError}
                  <button onClick={() => void load()} className="ml-3 underline hover:text-rose-300 outline-none">Retry</button>
                </td></tr>
              )}

              {!isLoading && !loadError && filtered.length === 0 && (
                <tr><td colSpan={colSpan} className="py-10 text-center text-muted text-sm">
                  {search
                    ? `No category matches "${search}".`
                    : 'The Category Inventory is empty. Register a category first.'}
                </td></tr>
              )}

              {!isLoading && !loadError && filtered.map((entry) => {
                const isIn = inProfile.has(entry.id);
                const isPicking = pickingId === entry.id && !isIn;

                if (isPicking) {
                  const autoLockLabel = getAutoLockLabel(form.aql);
                  const isAutoLocked = autoLockLabel != null;
                  return (
                    <tr key={entry.id} className="border-b border-gray-700/50 bg-brand-primary/5">
                      <td colSpan={colSpan} className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] uppercase bg-gray-800/50 border border-gray-700/50 text-muted rounded px-2 py-0.5">
                            {entry.code}
                          </span>
                          <span className="font-mono text-sm font-bold text-brand-secondary uppercase">{entry.name}</span>

                          <span className="text-[10px] text-muted uppercase tracking-wide ml-2">AQL</span>
                          <select
                            value={form.aql}
                            onChange={(e) => updateForm('aql', e.target.value)}
                            className="h-8 px-2 rounded-md bg-canvas border border-gray-700 font-mono text-xs text-primary focus:border-brand-secondary outline-none cursor-pointer"
                          >
                            {ISO_WHITELIST.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>

                          <span className="text-[10px] text-muted uppercase tracking-wide">Eval Mode</span>
                          <select
                            value={form.evalMode}
                            onChange={(e) => updateForm('evalMode', e.target.value)}
                            disabled={isAutoLocked}
                            className={`h-8 px-2 rounded-md border font-mono text-xs outline-none ${
                              isAutoLocked
                                ? 'bg-canvas border-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                                : 'bg-canvas border-gray-700 text-primary focus:border-brand-secondary cursor-pointer'
                            }`}
                          >
                            {isAutoLocked
                              ? <option value={form.evalMode}>{autoLockLabel}</option>
                              : EVAL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>

                          <div className="flex items-center gap-1 ml-auto">
                            <button
                              onClick={() => confirmAdd(entry)}
                              title={`Add "${entry.name}" to ${profileName}`}
                              className="h-8 px-3 rounded border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1 outline-none transition-all"
                            >
                              <Check className="w-3.5 h-3.5" /> ADD
                            </button>
                            <button
                              onClick={() => setPickingId(null)}
                              title="Cancel"
                              className="w-8 h-8 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={entry.id}
                    className={`border-b border-gray-700/50 transition-colors ${
                      isIn ? 'opacity-40' : 'hover:bg-surface-light'
                    }`}
                  >
                    <td className="py-3 px-3">
                      <span className="font-mono text-[10px] uppercase bg-gray-800/50 border border-gray-700/50 text-muted rounded px-2 py-0.5">
                        {entry.code}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {entry.locked && (
                          <span
                            title="In use by inspection records in another profile — can still be adopted here; only renaming or deleting the global category is blocked."
                            className="shrink-0 flex items-center"
                          >
                            <Lock className="w-3 h-3 text-muted" />
                          </span>
                        )}
                        <span className="font-mono text-sm text-primary uppercase">{entry.name}</span>
                        {isIn && (
                          <span className="text-[10px] text-muted uppercase tracking-wide">· already in this profile</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end">
                        {isIn ? (
                          <span
                            title="Already selected by this profile"
                            className="w-8 h-8 rounded flex items-center justify-center text-muted"
                          >
                            <Check className="w-4 h-4" />
                          </span>
                        ) : (
                          <button
                            onClick={() => startPicking(entry)}
                            title={`Adopt "${entry.name}" into ${profileName}`}
                            className="h-7 px-2.5 rounded border border-dashed border-gray-700 bg-transparent text-muted hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 flex items-center gap-1 font-semibold text-[11px] uppercase tracking-wider transition-all outline-none"
                          >
                            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                            ADD
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-gray-800 bg-surface flex items-center justify-between gap-4 shrink-0">
          <p className="text-xs text-muted">
            {isLoading ? '…' : `${availableCount} categor${availableCount === 1 ? 'y' : 'ies'} available to add`}
          </p>
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md bg-canvas border border-gray-700 text-muted hover:text-primary hover:border-gray-600 font-bold text-xs uppercase tracking-wider transition-all outline-none"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
