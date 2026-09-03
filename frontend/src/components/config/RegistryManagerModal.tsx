/**
 * @file RegistryManagerModal.tsx
 * @description Management surface for the two GLOBAL registries — the Master
 * Defect List and the Category Inventory. One component parameterized by
 * `entity`, because the two flows differ in exactly one field: a category
 * carries an evaluation mode, a defect does not. Two near-identical components
 * would have drifted the moment either gained a column.
 *
 * ── Scope (Stage 3) ─────────────────────────────────────────────────────────
 * View the registry, register new entries, rename existing ones. This modal
 * does NOT add an entry to a profile or a category — that is the Stage 4
 * picker's job, reached from the per-category "+ ADD" buttons and the kanban,
 * which this stage deliberately leaves alone.
 *
 * ── Locking ─────────────────────────────────────────────────────────────────
 * An entry is locked once it appears in any submission's frozen grading
 * snapshot. Locked rows are greyed, carry a padlock, and have their inputs
 * disabled with an explanation of why. None of that is the control: the
 * server re-derives lock state and refuses the write with a 409 regardless
 * (registry.routes.ts). The UI state exists so people are not invited to
 * attempt something that will fail.
 *
 * Display codes (DEF-001 / CAT-001) are read-only everywhere, always — they
 * are what people read off the screen and quote to each other.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Pencil, Plus, Search, X, Check, Loader2, Tag } from 'lucide-react';
import { API_BASE_URL } from '../../context/ConfigContext';
import { authHeader, useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/ToastProvider';

/** Which registry this modal is managing. */
export type RegistryEntity = 'defect' | 'category';

/** The four Category Inventory evaluation modes (backend: categoryEvaluationMode.ts). */
const EVALUATION_MODES = ['CUMULATIVE', 'GRANULAR', 'QUALITATIVE', 'RECORD_ONLY'] as const;
type EvaluationMode = (typeof EVALUATION_MODES)[number];

/** Human wording for each mode — the enum name alone doesn't say what it does. */
const MODE_HELP: Record<EvaluationMode, string> = {
  CUMULATIVE:  'All defect counts in the category are summed, and the total is compared to Ac.',
  GRANULAR:    'Each defect type is checked on its own against Ac.',
  QUALITATIVE: 'Recorded as pass/fail per item rather than counted.',
  RECORD_ONLY: 'Captured for the record but excluded from the verdict entirely.',
};

/**
 * Evaluation-mode badge colour. Emerald for the two modes that actually grade,
 * grey for the two that do not — matching UI_DESIGN_SYSTEM.md §4.8B, where
 * emerald means "evaluation mode active" and grey means inactive/skip.
 */
function modeBadgeClass(mode: string): string {
  return mode === 'CUMULATIVE' || mode === 'GRANULAR'
    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
    : 'bg-gray-500/10 border-gray-500/30 text-gray-400';
}

interface RegistryEntry {
  id: string;
  code: string;
  name: string;
  evaluationMode?: string;
  locked: boolean;
  submissionCount: number;
  profileCount: number;
}

const ENTITY_CONFIG = {
  defect: {
    title: 'MASTER DEFECT LIST',
    blurb: 'Every defect name the system knows. Profiles select from this list.',
    path: 'defects',
    noun: 'defect',
    addLabel: 'REGISTER DEFECT',
    searchPlaceholder: 'Search defects by name or code…',
  },
  category: {
    title: 'CATEGORY INVENTORY',
    blurb: 'Every severity category the system knows. Each profile picks its own subset and sets its own AQL level.',
    path: 'categories',
    noun: 'category',
    addLabel: 'REGISTER CATEGORY',
    searchPlaceholder: 'Search categories by name or code…',
  },
} as const;

interface Props {
  entity: RegistryEntity;
  onClose: () => void;
}

export default function RegistryManagerModal({ entity, onClose }: Props) {
  const cfg = ENTITY_CONFIG[entity];
  const isCategory = entity === 'category';
  const { user } = useAuth();
  const { addToast } = useToast();

  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMode, setNewMode] = useState<EvaluationMode>('CUMULATIVE');

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editMode, setEditMode] = useState<EvaluationMode>('CUMULATIVE');

  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/registry/${cfg.path}`, {
        headers: { ...authHeader(user) },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setEntries(await res.json());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the registry.');
    } finally {
      setIsLoading(false);
    }
  }, [cfg.path, user]);

  useEffect(() => { void load(); }, [load]);

  // Escape closes the modal, but only when no inline editor is open — otherwise
  // Escape should cancel that editor first, which its own handler does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingId && !isCreating) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editingId, isCreating]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q),
    );
  }, [entries, search]);

  const lockedCount = useMemo(() => entries.filter((e) => e.locked).length, [entries]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusyId('__create__');
    try {
      const res = await fetch(`${API_BASE_URL}/api/registry/${cfg.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body: JSON.stringify(isCategory ? { name, evaluationMode: newMode } : { name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { addToast('error', body.error ?? `Could not register the ${cfg.noun}.`); return; }
      addToast('success', `${body.code} "${body.name}" registered.`);
      setNewName('');
      setNewMode('CUMULATIVE');
      setIsCreating(false);
      await load();
    } catch {
      addToast('error', `Could not reach the server to register the ${cfg.noun}.`);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(entry: RegistryEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditMode((entry.evaluationMode as EvaluationMode) ?? 'CUMULATIVE');
  }

  async function handleSaveEdit(entry: RegistryEntry) {
    const name = editName.trim();
    if (!name) return;
    const unchanged = name === entry.name && (!isCategory || editMode === entry.evaluationMode);
    if (unchanged) { setEditingId(null); return; }

    setBusyId(entry.id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/registry/${cfg.path}/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body: JSON.stringify(isCategory ? { name, evaluationMode: editMode } : { name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A 409 here means the server refused — most likely the entry became
        // locked since this list was fetched. Reload so the row reflects that.
        addToast('error', body.error ?? `Could not update the ${cfg.noun}.`);
        if (res.status === 409 && body.locked) await load();
        return;
      }
      addToast('success', `${entry.code} updated.`);
      setEditingId(null);
      await load();
    } catch {
      addToast('error', `Could not reach the server to update the ${cfg.noun}.`);
    } finally {
      setBusyId(null);
    }
  }

  const colSpan = isCategory ? 5 : 4;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !editingId && !isCreating) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={cfg.title}
        className="bg-canvas border border-gray-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="p-4 border-b border-gray-800 bg-surface flex justify-between items-start gap-4 shrink-0">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              {cfg.title}
            </h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">{cfg.blurb}</p>
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={cfg.searchPlaceholder}
              className="w-full h-9 pl-8 pr-2 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
            />
          </div>
          <button
            onClick={() => { setIsCreating(true); setEditingId(null); }}
            disabled={isCreating}
            className="h-9 px-4 rounded-md bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>{cfg.addLabel}</span>
          </button>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-24">Code</th>
                <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider">Name</th>
                {isCategory && (
                  <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-44">Eval Mode</th>
                )}
                <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider w-44">Usage</th>
                <th className="py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wider text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Create row */}
              {isCreating && (
                <tr className="border-b border-gray-700/50 bg-emerald-500/5">
                  <td className="py-3 px-3">
                    <span className="font-mono text-[10px] uppercase bg-surface-light/50 text-muted rounded px-2 py-0.5 opacity-80">
                      AUTO
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <input
                      type="text"
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleCreate();
                        if (e.key === 'Escape') { setIsCreating(false); setNewName(''); }
                      }}
                      placeholder={`New ${cfg.noun} name`}
                      className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                    />
                  </td>
                  {isCategory && (
                    <td className="py-3 px-3">
                      <select
                        value={newMode}
                        onChange={(e) => setNewMode(e.target.value as EvaluationMode)}
                        title={MODE_HELP[newMode]}
                        className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                      >
                        {EVALUATION_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="py-3 px-3 text-xs text-muted">Not used yet</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => void handleCreate()}
                        disabled={!newName.trim() || busyId === '__create__'}
                        title="Register"
                        className="w-8 h-8 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none disabled:opacity-40"
                      >
                        {busyId === '__create__'
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Check className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => { setIsCreating(false); setNewName(''); }}
                        title="Cancel"
                        className="w-8 h-8 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

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

              {!isLoading && !loadError && filtered.length === 0 && !isCreating && (
                <tr><td colSpan={colSpan} className="py-10 text-center text-muted text-sm">
                  {search ? `No ${cfg.noun} matches "${search}".` : `No ${cfg.noun} entries yet.`}
                </td></tr>
              )}

              {!isLoading && !loadError && filtered.map((entry) => {
                const isEditing = editingId === entry.id;
                const isBusy = busyId === entry.id;
                const lockNote = `Used in ${entry.submissionCount} submission${entry.submissionCount === 1 ? '' : 's'} — inspection records store the name as it was at the time, so it can no longer be changed.`;

                return (
                  <tr
                    key={entry.id}
                    className={`border-b border-gray-700/50 transition-colors ${
                      entry.locked ? 'opacity-60' : 'hover:bg-surface-light'
                    }`}
                  >
                    <td className="py-3 px-3">
                      <span className="font-mono text-[10px] uppercase bg-gray-800/50 border border-gray-700/50 text-muted rounded px-2 py-0.5">
                        {entry.code}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      {isEditing ? (
                        <input
                          type="text"
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSaveEdit(entry);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          {entry.locked && (
                            <span title={lockNote} className="shrink-0 flex items-center">
                              <Lock className="w-3 h-3 text-muted" />
                            </span>
                          )}
                          <span className="font-mono text-sm text-primary">{entry.name}</span>
                        </div>
                      )}
                    </td>

                    {isCategory && (
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <select
                            value={editMode}
                            onChange={(e) => setEditMode(e.target.value as EvaluationMode)}
                            title={MODE_HELP[editMode]}
                            className="w-full h-9 px-2 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
                          >
                            {EVALUATION_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        ) : (
                          <span
                            title={MODE_HELP[(entry.evaluationMode as EvaluationMode)] ?? ''}
                            className={`inline-block rounded-full px-2 py-0.5 border font-bold uppercase tracking-wider text-[10px] ${modeBadgeClass(entry.evaluationMode ?? '')}`}
                          >
                            {entry.evaluationMode}
                          </span>
                        )}
                      </td>
                    )}

                    <td className="py-3 px-3">
                      {entry.locked ? (
                        <span className="text-xs text-muted" title={lockNote}>
                          {entry.submissionCount} submission{entry.submissionCount === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">
                          {entry.profileCount > 0
                            ? `${entry.profileCount} profile${entry.profileCount === 1 ? '' : 's'}, no submissions`
                            : 'Not used yet'}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1">
                        {entry.locked ? (
                          <span
                            title={lockNote}
                            className="w-8 h-8 rounded flex items-center justify-center text-muted cursor-not-allowed"
                          >
                            <Lock className="w-4 h-4" />
                          </span>
                        ) : isEditing ? (
                          <>
                            <button
                              onClick={() => void handleSaveEdit(entry)}
                              disabled={!editName.trim() || isBusy}
                              title="Save"
                              className="w-8 h-8 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none disabled:opacity-40"
                            >
                              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              title="Cancel"
                              className="w-8 h-8 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEdit(entry)}
                            title={`Rename this ${cfg.noun}`}
                            className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-brand-secondary hover:bg-brand-primary/10 outline-none"
                          >
                            <Pencil className="w-4 h-4" />
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
          <p className="text-xs text-muted flex items-center gap-2">
            <Lock className="w-3 h-3" />
            {lockedCount} of {entries.length} locked by existing inspection records and no longer editable.
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
