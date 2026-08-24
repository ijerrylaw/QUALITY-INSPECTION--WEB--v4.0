/**
 * @file AmendmentDiffView.tsx
 * @description Flattened, section-grouped, human-labeled replacement for
 * ApprovalsQueue.tsx's old two-column red/green JSON diff (JsonViewer.tsx's
 * `DiffJsonViewer`). Renders one row per leaf field — label on the left,
 * `old value → new value` on the right (old struck-through/dimmed in Rose,
 * new highlighted in Emerald) — grouped under Batch Setup / Dimensions /
 * Defects / Verdict headers, each with its own "N unchanged fields not
 * shown" collapse (UI_DESIGN_SYSTEM.md §4.12).
 *
 * Colors: reuses the existing Rose(old)/Emerald(new) convention already
 * established for this exact screen (JsonViewer.tsx, §4.12) rather than
 * Amber — Amber is reserved for the "Action Required / Warning" semantic
 * (§4.9) and isn't documented anywhere as a change-highlight color, so
 * repurposing it here would collide with its existing meaning.
 *
 * The underlying diff computation (`buildDiffTree`/`collectUnchanged`,
 * diffTree.ts) is unchanged and reused as-is — this file only walks the
 * resulting `DiffNode` tree differently. `collectUnchanged()` is still
 * top-level-of-subtree-only (deliberately non-recursive, see diffTree.ts),
 * so per-section collapse is achieved by calling it once per synthetic
 * section subtree rather than once on the whole tree.
 */

import { useState } from 'react';
import { ChevronRight, ChevronDown, ArrowRight } from 'lucide-react';
import type { DiffNode } from '../../lib/diffTree';
import { collectUnchanged } from '../../lib/diffTree';
import { JsonViewer } from '../ui/JsonViewer';
import {
  AMENDMENT_DIFF_SECTIONS,
  OTHER_SECTION_ID,
  OTHER_SECTION_TITLE,
  SUBMISSION_FIELD_LABELS,
  DIMENSION_STAT_LABELS,
} from '../../lib/amendmentDiffLabels';
import type { SectionId, DefectLabelContext, ProfileDisplayValue } from '../../lib/amendmentDiffLabels';

export interface AmendmentDiffViewProps {
  /** Root diff tree from buildDiffTree() — its `children` are the top-level Submission fields. */
  tree: DiffNode;
  /** `dimensionId -> display name`, resolved for this amendment's productCode. */
  dimensionLabels: Record<string, string>;
  /** `defectId -> display name`, resolved for this amendment's profileId (see resolveDefectLabelContext). */
  defectLabelContext: DefectLabelContext;
  /** Resolves a raw `profileId` diff-side value to a display name (strict match, same rule as defectLabelContext). */
  resolveProfileValue: (raw: unknown) => ProfileDisplayValue;
}

// ── Leaf flattening ────────────────────────────────────────────────────────

interface DiffRow {
  /** Path from the section root to this leaf — e.g. ['dimensions','fingerThickness',0] or ['batchNumber']. */
  keyPath: (string | number)[];
  node: DiffNode;
}

/** Recursively collects changed/added/removed leaves under `node`, skipping unchanged subtrees entirely. */
function collectChangedLeaves(node: DiffNode, path: (string | number)[]): DiffRow[] {
  if (node.status === 'unchanged') return [];
  if (!node.children) {
    return [{ keyPath: path, node }];
  }
  const rows: DiffRow[] = [];
  for (const [key, child] of Object.entries(node.children)) {
    const segment: string | number = node.isArray ? Number(key) : key;
    rows.push(...collectChangedLeaves(child, [...path, segment]));
  }
  return rows;
}

/** Builds a synthetic DiffNode wrapping only `fields` of `tree.children`, for per-section collapse/rendering. */
function pickSectionNode(tree: DiffNode, fields: string[]): DiffNode {
  const children: Record<string, DiffNode> = {};
  for (const f of fields) {
    if (tree.children && f in tree.children) children[f] = tree.children[f];
  }
  const anyChanged = Object.values(children).some((c) => c.status !== 'unchanged');
  return { status: anyChanged ? 'changed' : 'unchanged', children, isArray: false };
}

// ── Label resolution per row ───────────────────────────────────────────────

function labelForRow(
  sectionId: SectionId,
  keyPath: (string | number)[],
  dimensionLabels: Record<string, string>,
  defectLabels: Record<string, string>,
): string {
  const top = String(keyPath[0]);
  const rest = keyPath.slice(1);

  if (sectionId === 'defects') {
    const defectId = String(rest[0] ?? top);
    return defectLabels[defectId] ?? defectId;
  }

  if (sectionId === 'dimensions') {
    const dimId = String(rest[0]);
    const dimLabel = dimensionLabels[dimId] ?? dimId;
    if (top === 'dimensions') {
      const slotIdx = rest[1];
      return typeof slotIdx === 'number' ? `${dimLabel} — Slot ${slotIdx + 1}` : dimLabel;
    }
    // dimensionMins.<dimId>.<statKey>[.<arrayIdx>]
    const statKey = rest[1] !== undefined ? String(rest[1]) : undefined;
    if (statKey === undefined) return dimLabel;
    const statLabel = DIMENSION_STAT_LABELS[statKey] ?? statKey;
    const idx = rest[2];
    return typeof idx === 'number' ? `${dimLabel} — ${statLabel} — Slot ${idx + 1}` : `${dimLabel} — ${statLabel}`;
  }

  // 'batch' / 'verdict' / 'other' — all leaf fields at this level are scalars.
  return SUBMISSION_FIELD_LABELS[top] ?? top;
}

// ── Value formatting ───────────────────────────────────────────────────────

function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ── Row rendering ───────────────────────────────────────────────────────────

function DiffRowView({
  label,
  node,
  unavailableNote,
  formatOriginal,
  formatProposed,
}: {
  label: string;
  node: DiffNode;
  unavailableNote?: boolean;
  formatOriginal?: (v: unknown) => string;
  formatProposed?: (v: unknown) => string;
}) {
  const showOld = node.status !== 'added';
  const showNew = node.status !== 'removed';
  const originalIsContainer = node.original !== null && typeof node.original === 'object';
  const proposedIsContainer = node.proposed !== null && typeof node.proposed === 'object';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 py-2.5 px-3">
      <span className="text-[11px] font-bold text-muted uppercase tracking-wide shrink-0 sm:max-w-[45%]">
        {label}
        {unavailableNote && (
          <span className="ml-1.5 text-[10px] font-normal normal-case italic text-amber-400/80">
            (profile unavailable)
          </span>
        )}
      </span>
      <span className="text-sm font-mono flex items-center gap-2 flex-wrap sm:justify-end">
        {showOld && (
          <span className={`text-rose-400 ${showNew ? 'line-through opacity-60' : 'font-semibold'}`}>
            {originalIsContainer ? <JsonViewer data={node.original} /> : (formatOriginal ?? formatValue)(node.original)}
          </span>
        )}
        {showOld && showNew && <ArrowRight className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={2} />}
        {showNew && (
          <span className="text-emerald-400 font-semibold">
            {proposedIsContainer ? <JsonViewer data={node.proposed} /> : (formatProposed ?? formatValue)(node.proposed)}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Section rendering ───────────────────────────────────────────────────────

function AmendmentDiffSection({
  sectionId,
  title,
  sectionNode,
  dimensionLabels,
  defectLabelContext,
  resolveProfileValue,
  showUnchanged,
  onToggleUnchanged,
}: {
  sectionId: SectionId;
  title: string;
  sectionNode: DiffNode;
  dimensionLabels: Record<string, string>;
  defectLabelContext: DefectLabelContext;
  resolveProfileValue: (raw: unknown) => ProfileDisplayValue;
  showUnchanged: boolean;
  onToggleUnchanged: () => void;
}) {
  const changedRows = collectChangedLeaves(sectionNode, []);
  const unchangedEntries = collectUnchanged(sectionNode);

  if (changedRows.length === 0 && unchangedEntries.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-brand-secondary uppercase tracking-widest">{title}</h4>

      {changedRows.length > 0 ? (
        <div className="divide-y divide-gray-800/60 border border-gray-800 rounded-lg overflow-hidden bg-canvas/30">
          {changedRows.map((row, i) => {
            const isProfileRow = sectionId === 'batch' && String(row.keyPath[0]) === 'profileId';
            const isDefectRow = sectionId === 'defects';
            const unavailableNote = isDefectRow && defectLabelContext.unavailable;

            return (
              <DiffRowView
                key={i}
                label={labelForRow(sectionId, row.keyPath, dimensionLabels, defectLabelContext.labels)}
                node={row.node}
                unavailableNote={unavailableNote}
                formatOriginal={isProfileRow ? (v) => resolveProfileValue(v).label : undefined}
                formatProposed={isProfileRow ? (v) => resolveProfileValue(v).label : undefined}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-muted italic px-3 py-2">No changes in this section.</div>
      )}

      {unchangedEntries.length > 0 && (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={onToggleUnchanged}
            className="w-full flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-muted uppercase tracking-wider hover:bg-white/5 transition-colors outline-none"
          >
            {showUnchanged ? (
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
            )}
            {unchangedEntries.length} unchanged field{unchangedEntries.length === 1 ? '' : 's'} not shown
          </button>
          {showUnchanged && (
            <div className="px-4 pb-3 space-y-1.5 border-t border-gray-800 bg-canvas/30">
              {unchangedEntries.map(({ path, value }) => (
                <div key={path} className="pt-3 first:pt-3">
                  <span className="block text-[10px] font-bold text-muted uppercase mb-1">
                    {SUBMISSION_FIELD_LABELS[path] ?? path}
                  </span>
                  {value !== null && typeof value === 'object' ? (
                    <JsonViewer data={value} />
                  ) : (
                    <span className="text-sm font-mono text-muted">{String(value ?? '—')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Top-level view ───────────────────────────────────────────────────────────

export function AmendmentDiffView({ tree, dimensionLabels, defectLabelContext, resolveProfileValue }: AmendmentDiffViewProps) {
  const [expandedSections, setExpandedSections] = useState<Partial<Record<SectionId, boolean>>>({});

  const coveredFields = new Set(AMENDMENT_DIFF_SECTIONS.flatMap((s) => s.fields));
  const otherFields = tree.children ? Object.keys(tree.children).filter((k) => !coveredFields.has(k)) : [];
  const allSections = [
    ...AMENDMENT_DIFF_SECTIONS,
    ...(otherFields.length > 0 ? [{ id: OTHER_SECTION_ID, title: OTHER_SECTION_TITLE, fields: otherFields }] : []),
  ];

  const toggle = (id: SectionId) => setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-6">
      {allSections.map((section) => (
        <AmendmentDiffSection
          key={section.id}
          sectionId={section.id}
          title={section.title}
          sectionNode={pickSectionNode(tree, section.fields)}
          dimensionLabels={dimensionLabels}
          defectLabelContext={defectLabelContext}
          resolveProfileValue={resolveProfileValue}
          showUnchanged={Boolean(expandedSections[section.id])}
          onToggleUnchanged={() => toggle(section.id)}
        />
      ))}
    </div>
  );
}
