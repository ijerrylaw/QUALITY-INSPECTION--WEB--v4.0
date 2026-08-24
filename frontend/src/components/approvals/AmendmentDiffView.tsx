/**
 * @file AmendmentDiffView.tsx
 * @description Flattened, section-grouped, human-labeled replacement for
 * ApprovalsQueue.tsx's old two-column red/green JSON diff (JsonViewer.tsx's
 * `DiffJsonViewer`). Renders one row per leaf field — label on the left,
 * `old value → new value` on the right (old in Rose, new highlighted in
 * Emerald) — grouped under Batch Setup / Dimensions / Defects / Verdict
 * headers, each split into a raw (operator-entered) sub-group shown first
 * and a "Calculated from the above" derived sub-group shown below, each
 * with its own "N unchanged fields not shown" collapse (UI_DESIGN_SYSTEM.md
 * §4.12).
 *
 * Colors: reuses the existing Rose(old)/Emerald(new) convention already
 * established for this exact screen (JsonViewer.tsx, §4.12) rather than
 * Amber — Amber is reserved for the "Action Required / Warning" semantic
 * (§4.9) and isn't documented anywhere as a change-highlight color, so
 * repurposing it here would collide with its existing meaning. The old
 * value is color-coded only (no strikethrough) — the Rose/Emerald contrast
 * is the one signal that matters; layering strikethrough on top was
 * redundant.
 *
 * The underlying diff computation (`buildDiffTree`/`collectUnchanged`,
 * diffTree.ts) is unchanged and reused as-is — this file only walks the
 * resulting `DiffNode` tree differently. `collectUnchanged()` is still
 * top-level-of-subtree-only (deliberately non-recursive, see diffTree.ts),
 * so per-section (and per raw/derived sub-group) collapse is achieved by
 * calling it once per synthetic subtree rather than once on the whole tree.
 */

import { useState } from 'react';
import { ChevronRight, ChevronDown, ArrowRight } from 'lucide-react';
import type { DiffNode } from '../../lib/diffTree';
import { collectUnchanged } from '../../lib/diffTree';
import type { UnchangedEntry } from '../../lib/diffTree';
import { JsonViewer } from '../ui/JsonViewer';
import {
  AMENDMENT_DIFF_SECTIONS,
  OTHER_SECTION_ID,
  OTHER_SECTION_TITLE,
  SUBMISSION_FIELD_LABELS,
  DIMENSION_STAT_LABELS,
  isDerivedTopLevelField,
} from '../../lib/amendmentDiffLabels';
import type { SectionId, DefectLabelContext, ProfileDisplayValue } from '../../lib/amendmentDiffLabels';

export interface AmendmentDiffViewProps {
  /** Root diff tree from buildDiffTree() — its `children` are the top-level Submission fields. */
  tree: DiffNode;
  /** `dimensionId -> display name`, resolved for this amendment's productCode. */
  dimensionLabels: Record<string, string>;
  /** `dimensionId -> decimal places`, same source/order as `dimensionLabels` — used to round dimensionMins' derived numeric stats. */
  dimensionDecimals: Record<string, number>;
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

// ── Dimension-stat numeric rounding ─────────────────────────────────────────
// dimensionMins.<dimId>.<statKey> for statKey in NUMERIC_DIMENSION_STAT_KEYS
// are computed client-side (sum/divide, StepDimensions.tsx) and prone to raw
// floating-point artifacts (e.g. 0.052000000000000005) — round to the same
// decimal precision the wizard already displays for that dimension's own
// measurement inputs (buildDimensionDecimalsMap), not an invented constant.
// `fails` (boolean[]) and `isMin`/`isGraded` (boolean) are excluded — they
// aren't floats.

const NUMERIC_DIMENSION_STAT_KEYS = new Set(['min', 'max', 'avg', 'threshold', 'maxThreshold']);

function dimensionStatRowInfo(
  sectionId: SectionId,
  keyPath: (string | number)[],
): { dimId: string; statKey: string } | null {
  if (sectionId !== 'dimensions') return null;
  if (String(keyPath[0]) !== 'dimensionMins') return null;
  if (keyPath.length !== 3) return null; // excludes fails[idx], which is length 4
  const statKey = String(keyPath[2]);
  if (!NUMERIC_DIMENSION_STAT_KEYS.has(statKey)) return null;
  return { dimId: String(keyPath[1]), statKey };
}

function formatDimensionStatValue(value: unknown, decimals: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return formatValue(value);
  return value.toFixed(decimals);
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
  muted,
}: {
  label: string;
  node: DiffNode;
  unavailableNote?: boolean;
  formatOriginal?: (v: unknown) => string;
  formatProposed?: (v: unknown) => string;
  muted?: boolean;
}) {
  const showOld = node.status !== 'added';
  const showNew = node.status !== 'removed';
  const originalIsContainer = node.original !== null && typeof node.original === 'object';
  const proposedIsContainer = node.proposed !== null && typeof node.proposed === 'object';

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 py-2.5 px-3 ${muted ? 'opacity-80' : ''}`}>
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
          <span className={`text-rose-400 ${showNew ? 'opacity-60' : 'font-semibold'}`}>
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

// ── Unchanged-fields collapse (used once per raw/derived sub-group) ────────

function UnchangedCollapse({
  entries,
  expanded,
  onToggle,
}: {
  entries: UnchangedEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-muted uppercase tracking-wider hover:bg-white/5 transition-colors outline-none"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
        )}
        {entries.length} unchanged field{entries.length === 1 ? '' : 's'} not shown
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-gray-800 bg-canvas/30">
          {entries.map(({ path, value }) => (
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
  );
}

// ── Raw/derived sub-group rendering ─────────────────────────────────────────

function DiffSubgroup({
  heading,
  muted,
  rows,
  unchangedEntries,
  sectionId,
  dimensionLabels,
  dimensionDecimals,
  defectLabelContext,
  resolveProfileValue,
  showUnchanged,
  onToggleUnchanged,
}: {
  heading?: string;
  muted?: boolean;
  rows: DiffRow[];
  unchangedEntries: UnchangedEntry[];
  sectionId: SectionId;
  dimensionLabels: Record<string, string>;
  dimensionDecimals: Record<string, number>;
  defectLabelContext: DefectLabelContext;
  resolveProfileValue: (raw: unknown) => ProfileDisplayValue;
  showUnchanged: boolean;
  onToggleUnchanged: () => void;
}) {
  if (rows.length === 0 && unchangedEntries.length === 0) return null;

  return (
    <div className={`space-y-1.5 ${muted ? 'pt-1' : ''}`}>
      {heading && (
        <h5 className="text-[10px] font-semibold text-muted/70 uppercase tracking-widest">{heading}</h5>
      )}

      {rows.length > 0 ? (
        <div className={`divide-y divide-gray-800/60 border border-gray-800 rounded-lg overflow-hidden ${muted ? 'bg-canvas/15' : 'bg-canvas/30'}`}>
          {rows.map((row, i) => {
            const isProfileRow = sectionId === 'batch' && String(row.keyPath[0]) === 'profileId';
            const isDefectRow = sectionId === 'defects';
            const unavailableNote = isDefectRow && defectLabelContext.unavailable;
            const statInfo = dimensionStatRowInfo(sectionId, row.keyPath);

            let formatOriginal: ((v: unknown) => string) | undefined;
            let formatProposed: ((v: unknown) => string) | undefined;
            if (isProfileRow) {
              formatOriginal = (v) => resolveProfileValue(v).label;
              formatProposed = (v) => resolveProfileValue(v).label;
            } else if (statInfo) {
              const decimals = dimensionDecimals[statInfo.dimId] ?? 0;
              formatOriginal = (v) => formatDimensionStatValue(v, decimals);
              formatProposed = (v) => formatDimensionStatValue(v, decimals);
            }

            return (
              <DiffRowView
                key={i}
                label={labelForRow(sectionId, row.keyPath, dimensionLabels, defectLabelContext.labels)}
                node={row.node}
                unavailableNote={unavailableNote}
                formatOriginal={formatOriginal}
                formatProposed={formatProposed}
                muted={muted}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-muted italic px-3 py-2">No changes.</div>
      )}

      <UnchangedCollapse entries={unchangedEntries} expanded={showUnchanged} onToggle={onToggleUnchanged} />
    </div>
  );
}

// ── Section rendering ───────────────────────────────────────────────────────

function AmendmentDiffSection({
  sectionId,
  title,
  sectionNode,
  dimensionLabels,
  dimensionDecimals,
  defectLabelContext,
  resolveProfileValue,
  expandedGroups,
  onToggleGroup,
}: {
  sectionId: SectionId;
  title: string;
  sectionNode: DiffNode;
  dimensionLabels: Record<string, string>;
  dimensionDecimals: Record<string, number>;
  defectLabelContext: DefectLabelContext;
  resolveProfileValue: (raw: unknown) => ProfileDisplayValue;
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
}) {
  const changedRows = collectChangedLeaves(sectionNode, []);
  const unchangedEntries = collectUnchanged(sectionNode);

  if (changedRows.length === 0 && unchangedEntries.length === 0) return null;

  const rawRows = changedRows.filter((r) => !isDerivedTopLevelField(String(r.keyPath[0])));
  const derivedRows = changedRows.filter((r) => isDerivedTopLevelField(String(r.keyPath[0])));
  const rawUnchanged = unchangedEntries.filter((e) => !isDerivedTopLevelField(e.path));
  const derivedUnchanged = unchangedEntries.filter((e) => isDerivedTopLevelField(e.path));

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-brand-secondary uppercase tracking-widest">{title}</h4>

      <DiffSubgroup
        rows={rawRows}
        unchangedEntries={rawUnchanged}
        sectionId={sectionId}
        dimensionLabels={dimensionLabels}
        dimensionDecimals={dimensionDecimals}
        defectLabelContext={defectLabelContext}
        resolveProfileValue={resolveProfileValue}
        showUnchanged={Boolean(expandedGroups[`${sectionId}:raw`])}
        onToggleUnchanged={() => onToggleGroup(`${sectionId}:raw`)}
      />

      <DiffSubgroup
        heading="Calculated from the above"
        muted
        rows={derivedRows}
        unchangedEntries={derivedUnchanged}
        sectionId={sectionId}
        dimensionLabels={dimensionLabels}
        dimensionDecimals={dimensionDecimals}
        defectLabelContext={defectLabelContext}
        resolveProfileValue={resolveProfileValue}
        showUnchanged={Boolean(expandedGroups[`${sectionId}:derived`])}
        onToggleUnchanged={() => onToggleGroup(`${sectionId}:derived`)}
      />
    </div>
  );
}

// ── Top-level view ───────────────────────────────────────────────────────────

export function AmendmentDiffView({
  tree,
  dimensionLabels,
  dimensionDecimals,
  defectLabelContext,
  resolveProfileValue,
}: AmendmentDiffViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const coveredFields = new Set(AMENDMENT_DIFF_SECTIONS.flatMap((s) => s.fields));
  const otherFields = tree.children ? Object.keys(tree.children).filter((k) => !coveredFields.has(k)) : [];
  const allSections = [
    ...AMENDMENT_DIFF_SECTIONS,
    ...(otherFields.length > 0 ? [{ id: OTHER_SECTION_ID, title: OTHER_SECTION_TITLE, fields: otherFields }] : []),
  ];

  const toggle = (key: string) => setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-6">
      {allSections.map((section) => (
        <AmendmentDiffSection
          key={section.id}
          sectionId={section.id}
          title={section.title}
          sectionNode={pickSectionNode(tree, section.fields)}
          dimensionLabels={dimensionLabels}
          dimensionDecimals={dimensionDecimals}
          defectLabelContext={defectLabelContext}
          resolveProfileValue={resolveProfileValue}
          expandedGroups={expandedGroups}
          onToggleGroup={toggle}
        />
      ))}
    </div>
  );
}
