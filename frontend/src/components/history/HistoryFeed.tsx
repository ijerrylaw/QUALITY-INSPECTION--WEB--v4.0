/**
 * @file HistoryFeed.tsx
 * @description Inspection Records data table with expandable row defect breakdown.
 *
 * UI_DESIGN_SYSTEM.md compliance:
 * - §1.2  Structural Geometry: compact p-6 / space-y-4 page wrapper, h-9 inputs.
 * - §1.3  Strict Font Protocol: font-mono for all database values / metrics.
 *         Inspector email remains font-sans (readable long-form text exemption).
 * - §2.3  Scrollbars: custom scrollbar-thin on overflow container.
 * - §4.2  Standard Reading Data Tables: py-3 px-3 row padding, stacked data cells.
 *         Top stack value: text-sm font-mono text-primary.
 *         Bottom stack value: text-xs font-mono text-muted.
 * - §4.4  Summary Data Cards: category headers text-[10px] font-bold uppercase text-muted.
 * - §4.8A Value Chips: defect pills font-mono text-[10px] bg-gray-800/50 border border-gray-700/50.
 * - §4.8B State Badges: rounded-full text-[10px] font-bold uppercase tracking-wider.
 * - §4.9  Action Required / Warning: Amber for AWAITING APPROVAL state.
 * - §1.2  Tier 3 container for nested defect table: bg-canvas border border-gray-700.
 *
 * NAVIGATION_AND_RBAC.md compliance:
 * - "AMEND RECORD" is visible to all roles on /history.
 * - Amendment submission routes to /approvals (Exec, Manager, Admin only).
 *
 * Amendment Workflow:
 * - Clicking "AMEND RECORD" navigates to /wizard?amend=[id] which pre-fills all fields.
 * - AmendmentStatus 'PENDING_APPROVAL' renders as "AWAITING APPROVAL" badge (Amber).
 *
 * Auto-refresh:
 * - Refetches submissions on window focus (e.g., after navigating back from wizard).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronRight,
  Edit2,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { API_BASE_URL, useConfig } from '../../context/ConfigContext';

// ── Types ────────────────────────────────────────────────────────────────────

type AmendmentStatus =
  | 'UNMODIFIED'
  | 'AMENDMENT_DRAFTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

interface Submission {
  id: string;
  productCode: string;
  productionDate: string;
  samplingTime: string;
  submissionTimestamp?: string;
  machineId?: string;
  shift?: string;
  batchNumber: string;
  size?: string;
  sampleSize: number;
  defects?: Record<string, number> | string;
  verdict: 'PASSED' | 'FAILED';
  userPrincipalName?: string;
  amendmentStatus: AmendmentStatus;
  totalCarton?: number;
  gloveWeight?: number;
  profileId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely parse defects — the backend may serialize defects as a JSON string
 * rather than a nested object. We guard against both cases here.
 */
function parseDefects(defects: Record<string, number> | string | undefined): Record<string, number> {
  if (!defects) return {};
  if (typeof defects === 'string') {
    try { return JSON.parse(defects) as Record<string, number>; } catch { return {}; }
  }
  return defects;
}

/** Sum all defect counts into a single integer. */
function sumDefects(defects: Record<string, number> | string | undefined): number {
  const obj = parseDefects(defects);
  return Object.values(obj).reduce((acc, n) => acc + (Number(n) || 0), 0);
}

/** Derive a sortable ISO string from productionDate + samplingTime. */
function getSortKey(sub: Submission): string {
  const date = (sub.productionDate || '').split('T')[0];
  const time = (sub.samplingTime || '').split('T')[1]?.substring(0, 5) ?? sub.samplingTime ?? '';
  return `${date}T${time}`;
}

// ── Badge sub-components ─────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: 'PASSED' | 'FAILED' }) {
  if (verdict === 'PASSED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
        PASS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30">
      FAIL
    </span>
  );
}

function AmendmentBadge({ status }: { status: AmendmentStatus }) {
  switch (status) {
    case 'UNMODIFIED':
      return <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Original</span>;
    case 'AMENDMENT_DRAFTED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-700/50 text-gray-400 border border-gray-600/50">
          DRAFTED
        </span>
      );
    case 'PENDING_APPROVAL':
      // §4.9 — Amber for "Action Required / Warning" / pending approval states
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
          AWAITING APPROVAL
        </span>
      );
    case 'APPROVED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          AMENDED
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30">
          REJECTED
        </span>
      );
    default:
      return <span className="text-[10px] text-muted">—</span>;
  }
}

// ── Table header helper ───────────────────────────────────────────────────────

function Th({ children, isSticky = false }: { children: React.ReactNode; isSticky?: boolean }) {
  if (isSticky) {
    return (
      <th className="sticky left-0 bg-surface z-10 text-xs font-semibold uppercase tracking-wider text-muted py-3 px-3 border-b border-r border-gray-700/50 text-left whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
        {children}
      </th>
    );
  }
  return (
    <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-3 border-b border-gray-800 text-left whitespace-nowrap">
      {children}
    </th>
  );
}

// ── Nested Defect Summary Table ───────────────────────────────────────────────

/**
 * Renders the expanded-row defect breakdown panel.
 * Resolves defect IDs → names using the linked InspectionProfile from ConfigContext.
 * Groups defects by AQL category.
 *
 * UI_DESIGN_SYSTEM.md:
 * §4.4  Category headers: text-[10px] font-bold uppercase text-muted
 * §4.8A Defect pills: font-mono text-[10px] bg-gray-800/50 border border-gray-700/50
 * §3.3  Grid layout for defect pills
 */
function DefectBreakdownPanel({
  sub,
  onAmend,
}: {
  sub: Submission;
  onAmend: (id: string) => void;
}) {
  const { getResolvedProfile } = useConfig();
  const parsedDefects = parseDefects(sub.defects);
  // Filter out corrupt entries: numeric-only keys are character-position
  // artifacts from double-serialized JSON in pre-v4.1 submissions.
  // Real defect IDs always contain non-digit characters (e.g. "def_hole").
  const defectEntries = Object.entries(parsedDefects).filter(
    ([id, count]) => count > 0 && !/^\d+$/.test(id)
  );

  // Resolve InspectionProfile for name/category lookup.
  // If profileId is null, pass undefined so getResolvedProfile falls back
  // to the default profile (isDefault:true or profiles[0]).
  const profile = useMemo(() => {
    return getResolvedProfile(sub.profileId ?? undefined);
  }, [sub.profileId, getResolvedProfile]);

  // Build a lookup: defectId → { name, categoryName }
  // The InspectionProfile stores defects in a FLAT `defectDefinitions` array,
  // each with a `categoryId` that links to an AQLCategory. We resolve the
  // category name by cross-referencing aqlCategories.
  type DefectMeta = { name: string; categoryName: string };
  const defectLookup = useMemo((): Record<string, DefectMeta> => {
    const lookup: Record<string, DefectMeta> = {};
    if (!profile) return lookup;

    // Build a map: categoryId → categoryName for fast lookups
    const categoryNameById: Record<string, string> = {};
    for (const cat of (profile as any).aqlCategories ?? []) {
      categoryNameById[cat.id] = cat.name;
    }

    // Iterate the flat defectDefinitions array
    for (const defect of (profile as any).defectDefinitions ?? []) {
      const categoryName = categoryNameById[defect.categoryId] ?? 'OTHER';
      lookup[defect.id] = { name: defect.name, categoryName };
    }

    return lookup;
  }, [profile]);

  // Group defect entries by category name
  type GroupedDefects = Record<string, { defectId: string; displayName: string; count: number }[]>;
  const grouped = useMemo((): GroupedDefects => {
    const groups: GroupedDefects = {};
    for (const [defectId, count] of defectEntries) {
      const meta = defectLookup[defectId];
      const categoryName = meta?.categoryName ?? 'OTHER';
      const displayName = meta?.name ?? defectId;
      if (!groups[categoryName]) groups[categoryName] = [];
      groups[categoryName].push({ defectId, displayName, count });
    }
    return groups;
  }, [defectEntries, defectLookup]);

  const categoryOrder = useMemo(() => {
    if (profile) {
      const profileCategories = ((profile as any).aqlCategories ?? []).map((c: any) => c.name as string);
      const present = profileCategories.filter((name: string) => grouped[name]);
      // Append any that weren't in profile order (e.g., 'OTHER')
      const extra = Object.keys(grouped).filter((k) => !present.includes(k)).sort();
      return [...present, ...extra];
    }
    return Object.keys(grouped).sort();
  }, [profile, grouped]);

  const totalDefects = sumDefects(parsedDefects);

  return (
    <td colSpan={10} className="p-0 border-b border-gray-700/50 bg-canvas shadow-inner">
      <div className="px-6 py-4 space-y-4">

        {/* ── Defect Summary Grouped Container ──────────────────────────── */}
        <div className="rounded-lg border border-gray-800 overflow-hidden bg-surface">
          {/* Panel header */}
          <div className="bg-gray-800/50 px-4 py-2 flex items-center justify-between border-b border-gray-800">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Defect Breakdown
            </span>
            <span className="text-[10px] font-mono text-muted">
              {totalDefects > 0 ? `${totalDefects} Total Defects` : 'No defects recorded'}
            </span>
          </div>

          {/* Panel body — grouped by category */}
          <div className="p-4">
            {defectEntries.length > 0 ? (
              <div className="space-y-4">
                {categoryOrder.map((categoryName) => {
                  const items = grouped[categoryName];
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={categoryName}>
                      {/* §4.4 Category header */}
                      <div className="text-[10px] font-bold uppercase text-muted tracking-wider mb-2 pb-1 border-b border-gray-800/80">
                        {categoryName}
                      </div>
                      {/* §3.3 Flex wrap of defect pills */}
                      <div className="flex flex-wrap gap-2">
                        {items.map(({ defectId, displayName, count }) => (
                          <div
                            key={defectId}
                            className="inline-flex items-center gap-2 bg-canvas border border-gray-700/50 rounded-md px-3 py-1.5 shadow-sm"
                          >
                            {/* §4.8A Value chip: defect name */}
                            <span className="font-mono text-[11px] text-primary">
                              {displayName}
                            </span>
                            {/* Count pill — rose tint to signal failures */}
                            <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 min-w-[1.5rem] text-center">
                              {count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-muted font-sans text-center py-2">
                No defects recorded for this lot.
              </div>
            )}
          </div>
        </div>

        {/* ── Amendment Action ─────────────────────────────────────────────── */}
        {sub.amendmentStatus !== 'PENDING_APPROVAL' && sub.amendmentStatus !== 'APPROVED' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onAmend(sub.id)}
              className="h-9 px-4 rounded-lg bg-canvas border border-brand-primary/50 text-brand-secondary hover:bg-brand-primary/10 hover:border-brand-primary font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
            >
              <Edit2 className="w-3.5 h-3.5" strokeWidth={2} />
              AMEND RECORD
            </button>
          </div>
        )}

        {sub.amendmentStatus === 'PENDING_APPROVAL' && (
          <div className="flex justify-end">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70">
              Amendment submitted — awaiting approval in the Approvals Queue.
            </span>
          </div>
        )}
      </div>
    </td>
  );
}

// ── HistoryFeed ───────────────────────────────────────────────────────────────

export function HistoryFeed() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // ── Fetch (extracted so it can be called on focus events) ─────────────────
  const fetchSubmissions = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/submissions`)
      .then((res) => res.json())
      .then((data) => {
        setSubmissions(data.submissions || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch history:', err);
        setLoading(false);
      });
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // ── Auto-refresh on window focus (e.g., navigate back from wizard) ────────
  useEffect(() => {
    window.addEventListener('focus', fetchSubmissions);
    return () => window.removeEventListener('focus', fetchSubmissions);
  }, [fetchSubmissions]);

  // Filter & Sort (newest first)
  const filteredSubmissions = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return submissions
      .filter(
        (sub) =>
          (sub.batchNumber || '').toLowerCase().includes(query) ||
          (sub.productCode || '').toLowerCase().includes(query)
      )
      .sort((a, b) => getSortKey(b).localeCompare(getSortKey(a)));
  }, [submissions, searchTerm]);

  /** Toggle row expansion. Clicking the same row collapses it. */
  const handleRowClick = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  /** Navigate to wizard in amendment mode. */
  const handleAmend = (id: string) => {
    navigate(`/wizard?amend=${id}`);
  };

  return (
    <div className="space-y-4">

      {/* ── §4.3 Data Table Toolbar ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        {/* Search */}
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search by Lot Number or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-10 pr-4 bg-canvas border border-gray-700 rounded-lg font-mono text-sm text-primary focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none transition-colors"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="secondary" className="px-4 flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4" strokeWidth={2} />
            FILTER
          </Button>
          <Button variant="secondary" className="px-4 flex items-center gap-2 w-full sm:w-auto">
            <Download className="w-4 h-4" strokeWidth={2} />
            EXPORT CSV
          </Button>
        </div>
      </div>

      {/* ── §4.2 High-Density Data Table ───────────────────────────────────── */}
      <div className="bg-surface border border-gray-800 rounded-lg overflow-x-auto shadow-sm scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        <table className="w-full text-left whitespace-nowrap">
          <thead>
            <tr>
              {/* Expand toggle column */}
              <th className="bg-canvas w-10 py-3 px-2 border-b border-gray-800" />
              {/* Ordered per StepMetadata.tsx labels */}
              <Th isSticky>
                <div>FULL SYSTEM</div>
                <div className="text-[10px] text-gray-500">LOT NUMBER</div>
              </Th>
              <Th>PRODUCT CODE</Th>
              <Th>
                <div>DATE</div>
                <div className="text-[10px] text-gray-500">TIME</div>
              </Th>
              <Th>VERDICT</Th>
              <Th>STATUS</Th>
              <Th>
                <div>PRODUCTION LINE</div>
                <div className="text-[10px] text-gray-500">SHIFT</div>
              </Th>
              <Th>
                <div>GLOVE SIZE</div>
                <div className="text-[10px] text-gray-500">SAMPLE SIZE</div>
              </Th>
              <Th>
                <div>TOTAL CARTON</div>
                <div className="text-[10px] text-gray-500">GLOVE WEIGHT (g)</div>
              </Th>
              <Th>INSPECTOR</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted font-mono animate-pulse uppercase tracking-wider text-sm">
                  Loading inspection records...
                </td>
              </tr>
            ) : filteredSubmissions.length > 0 ? (
              filteredSubmissions.map((sub) => {
                const dateStr = (sub.productionDate || '').split('T')[0];
                const timeStr =
                  (sub.samplingTime || '').split('T')[1]?.substring(0, 5) ||
                  sub.samplingTime ||
                  '—';
                const totalDefects = sumDefects(sub.defects);
                const isExpanded = expandedRowId === sub.id;

                return (
                  // React.Fragment lets us pair the data row with its optional expanded panel row
                  <tr
                    key={`${sub.id}-row`}
                    onClick={() => handleRowClick(sub.id)}
                    className={`hover:bg-white/5 transition-colors cursor-pointer group ${isExpanded ? 'bg-white/[0.03]' : ''}`}
                  >
                    {/* Expand toggle chevron */}
                    <td className={`py-3 px-2 border-b border-gray-700/50 text-center transition-colors ${isExpanded ? 'bg-brand-primary/5' : ''}`}>
                      <span className="text-muted group-hover:text-primary transition-colors inline-flex items-center justify-center">
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4" strokeWidth={2} />
                          : <ChevronRight className="w-4 h-4" strokeWidth={2} />
                        }
                      </span>
                    </td>

                    {/* 1. FULL SYSTEM LOT NUMBER (Sticky Left) */}
                    <td className="sticky left-0 bg-surface z-10 py-3 px-3 border-b border-r border-gray-700/50 text-sm font-mono text-primary shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-gray-800 transition-colors">
                      {sub.batchNumber || '—'}
                    </td>

                    {/* 2. PRODUCT CODE */}
                    <td className="py-3 px-3 border-b border-gray-700/50 text-sm font-mono text-primary">
                      {sub.productCode || '—'}
                    </td>

                    {/* 3. DATE & TIME (Stacked) */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary">{dateStr || '—'}</div>
                      <div className="text-xs font-mono text-muted">{timeStr}</div>
                    </td>

                    {/* 4. VERDICT & TOTAL DEFECTS */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="flex flex-col gap-1.5 items-start">
                        <VerdictBadge verdict={sub.verdict} />
                        {totalDefects > 0 && (
                          <div 
                            className="flex items-center gap-1 cursor-pointer select-none group/hint" 
                            onClick={(e) => { e.stopPropagation(); handleRowClick(sub.id); }}
                            title="Click to view defect breakdown"
                          >
                            <span className="text-[10px] font-mono text-rose-400/90 font-bold bg-rose-500/10 px-1.5 rounded border border-rose-500/20">
                              {totalDefects} defect{totalDefects !== 1 ? 's' : ''}
                            </span>
                            <span className="text-[9px] font-sans text-muted/50 group-hover/hint:text-primary/70 transition-colors">
                              {isExpanded ? '▲ hide' : '▼ detail'}
                            </span>
                          </div>
                        )}
                        {totalDefects === 0 && (
                          <span className="text-[10px] font-mono text-emerald-500/70">
                            0 defects
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 5. STATUS */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <AmendmentBadge status={sub.amendmentStatus} />
                    </td>

                    {/* 6. PRODUCTION LINE & SHIFT (Stacked) */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary">{sub.machineId || '—'}</div>
                      <div className="text-xs font-mono text-muted">{sub.shift ? sub.shift.split(' (')[0] : '—'}</div>
                    </td>

                    {/* 8. GLOVE SIZE & SAMPLE SIZE (Stacked) */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary">{sub.size || '—'}</div>
                      <div className="text-xs font-mono text-muted">{sub.sampleSize ?? '—'}</div>
                    </td>

                    {/* 9. TOTAL CARTON & GLOVE WEIGHT (Stacked) */}
                    <td className="py-3 px-3 border-b border-gray-700/50">
                      <div className="text-sm font-mono text-primary">{sub.totalCarton ?? '—'}</div>
                      <div className="text-xs font-mono text-muted">
                        {sub.gloveWeight != null ? `${sub.gloveWeight}g` : '—'}
                      </div>
                    </td>

                    {/* 10. INSPECTOR (Font Exemption: font-sans for readability) */}
                    <td className="py-3 px-3 border-b border-gray-700/50 text-sm text-muted max-w-[160px] truncate font-sans">
                      {sub.userPrincipalName || '—'}
                    </td>
                  </tr>
                );
              }).flatMap((rowEl) => {
                // We need to insert the expansion panel as a sibling <tr>.
                // flatMap lets us emit [dataRow, expansionRow] for each submission.
                const sub = filteredSubmissions.find((s) => rowEl.key === `${s.id}-row`);
                if (!sub) return [rowEl];
                const isExpanded = expandedRowId === sub.id;
                if (!isExpanded) return [rowEl];

                return [
                  rowEl,
                  <tr key={`${sub.id}-panel`} className="bg-canvas">
                    <DefectBreakdownPanel sub={sub} onAmend={handleAmend} />
                  </tr>,
                ];
              })
            ) : (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted text-sm font-sans">
                  {searchTerm
                    ? `No records found matching "${searchTerm}"`
                    : 'No inspection records found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
