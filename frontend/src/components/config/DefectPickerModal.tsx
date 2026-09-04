/**
 * @file DefectPickerModal.tsx
 * @description Stage 4a picker — the per-category "+ ADD" button in the Defect
 * Management Kanban opens this to CHOOSE a defect from the global Master Defect
 * List, instead of free-typing a new name.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * Lists every entry in the Master Defect List (GET /api/registry/defects — the
 * same read the RegistryManagerModal uses, Group A/B, already the caller's
 * group on the /config screen). Picking one hands its canonical `{ id, name }`
 * back to QualityRules.tsx, which appends it to the active profile's
 * defectDefinitions for the clicked category — the exact local-state shape the
 * old free-text path produced, so nothing downstream of `triggerChange` changes.
 *
 * ── Multi-add, modal stays open ────────────────────────────────────────────
 * Picking a row does NOT close the modal — the row flips to the greyed
 * "already in this profile" state in place and the admin can keep adding more
 * defects to the same category in one session, then CLOSE (or Esc / backdrop)
 * when done. The available-row action is a "+ ADD" pill, deliberately not a
 * checkmark: a green tick read as an already-confirmed selection.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 * - It never creates or renames a registry entry. "Register a new defect"
 *   routes to the existing RegistryManagerModal (one registration path, not two).
 * - It does not write to the server. The pick lands in draftConfig and is
 *   persisted only by the screen's single SAVE CONFIGURATION action, via
 *   PATCH /api/config, alongside every other pending change.
 *
 * ── Lock state ─────────────────────────────────────────────────────────────
 * A locked defect (in use by a frozen gradingSnapshot) can still be added to a
 * profile and later moved between categories — lock only forbids renaming or
 * deleting it (Stage 4a decision (d)). The padlock here is therefore purely
 * informational, matching RegistryManagerModal's treatment.
 *
 * Styling follows UI_DESIGN_SYSTEM.md — bg-canvas modal card, §4.3 search
 * toolbar, §4.2 reading table, value chips for codes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Lock, Plus, Search, Tag, X } from 'lucide-react';
import { API_BASE_URL } from '../../context/ConfigContext';
import { authHeader, useAuth } from '../../context/AuthContext';

interface DefectRegistryEntry {
  id: string;
  code: string;
  name: string;
  locked: boolean;
  submissionCount: number;
  profileCount: number;
}

interface Props {
  /** Display name of the Kanban column the pick will be filed under. */
  categoryName: string;
  /**
   * Defect ids already present ANYWHERE in the active profile. A defect sits
   * under at most one category per profile (@@unique([profileId, defectId])),
   * so an already-present entry is shown greyed with an "ALREADY IN THIS
   * PROFILE" label — to relocate it the admin drags its card, not re-adds it.
   * Grows as the admin adds rows in this session (the parent re-derives it
   * from its updated draft), and `justAddedIds` covers the render before that
   * prop round-trips.
   */
  existingDefectIds: string[];
  /**
   * Hands back the chosen entry's canonical id + name. Does NOT close the
   * modal — the row flips in place and the admin can keep adding.
   */
  onPick: (entry: { id: string; name: string }) => void;
  onClose: () => void;
  /** Opens the RegistryManagerModal so a brand-new defect can be registered. */
  onRegisterNew: () => void;
}

export default function DefectPickerModal({
  categoryName,
  existingDefectIds,
  onPick,
  onClose,
  onRegisterNew,
}: Props) {
  const { user } = useAuth();

  const [entries, setEntries] = useState<DefectRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Rows picked in THIS session — flips them to the greyed state immediately,
  // before the parent's updated existingDefectIds prop round-trips back.
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set());

  const dialogRef = useRef<HTMLDivElement>(null);
  const inProfile = useMemo(
    () => new Set([...existingDefectIds, ...justAddedIds]),
    [existingDefectIds, justAddedIds],
  );

  const handleAdd = useCallback((entry: DefectRegistryEntry) => {
    onPick({ id: entry.id, name: entry.name });
    setJustAddedIds((prev) => new Set(prev).add(entry.id));
  }, [onPick]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/registry/defects`, {
        headers: { ...authHeader(user) },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setEntries(await res.json());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the Master Defect List.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? entries.filter((e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q))
      : entries;
    // Selectable entries first, already-in-profile entries last, each block
    // alphabetical — so the list the admin can actually act on is at the top.
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
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add a defect from the Master Defect List"
        className="bg-canvas border border-gray-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="p-4 border-b border-gray-800 bg-surface flex justify-between items-start gap-4 shrink-0">
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
              ADD DEFECT
            </h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">
              Choose from the Master Defect List — files under{' '}
              <span className="font-mono font-bold text-brand-secondary uppercase">{categoryName}</span>
              {' '}in this profile.
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
              placeholder="Search defects by name or code…"
              className="w-full h-9 pl-8 pr-2 bg-canvas border border-gray-700 rounded font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none"
            />
          </div>
          <button
            onClick={onRegisterNew}
            className="h-9 px-4 rounded-md bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none shrink-0"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>REGISTER NEW DEFECT</span>
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
                    ? `No defect matches "${search}".`
                    : 'The Master Defect List is empty. Register a defect first.'}
                </td></tr>
              )}

              {!isLoading && !loadError && filtered.map((entry) => {
                const isIn = inProfile.has(entry.id);
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
                            title="In use by inspection records — can be added and moved between categories, but not renamed or deleted."
                            className="shrink-0 flex items-center"
                          >
                            <Lock className="w-3 h-3 text-muted" />
                          </span>
                        )}
                        <span className="font-mono text-sm text-primary">{entry.name}</span>
                        {isIn && (
                          <span className="text-[10px] text-muted uppercase tracking-wide">· already in this profile</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end">
                        {isIn ? (
                          <span
                            title="Already in this profile — drag its card on the Kanban to move it"
                            className="w-8 h-8 rounded flex items-center justify-center text-muted"
                          >
                            <Check className="w-4 h-4" />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAdd(entry)}
                            title={`Add "${entry.name}" to ${categoryName}`}
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
            {isLoading ? '…' : `${availableCount} defect${availableCount === 1 ? '' : 's'} available to add`}
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
