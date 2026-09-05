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
  detectDefectCategoryChange,
  formatEvalModeForDisplay,
} from '../../lib/amendmentDiffLabels';
import type {
  SectionId,
  CrossProfileDefectContext,
  ProfileDisplayValue,
  DefectCategoryChange,
  DefectCategoryChangeKind,
} from '../../lib/amendmentDiffLabels';

export interface AmendmentDiffViewProps {
  /** Root diff tree from buildDiffTree() — its `children` are the top-level Submission fields. */
  tree: DiffNode;
  /** `dimensionId -> display name`, resolved for this amendment's productCode. */
  dimensionLabels: Record<string, string>;
  /** `dimensionId -> decimal places`, same source/order as `dimensionLabels` — used to round dimensionMins' derived numeric stats. */
  dimensionDecimals: Record<string, number>;
  /** Both sides' defect label + category context (see resolveCrossProfileDefectContext) — a profile-switch amendment's before/after profile can differ, so this is never a single flat map. */
  defectContext: CrossProfileDefectContext;
  /** Resolves a raw `profileId` diff-side value to a display name (strict match, same rule as defectContext). */
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

// ── Defects: implicit-zero + category-aware diffing (AUDIT_REPORT.md #42) ──
// `defects` is a sparse Record<defectId, count> — a defect id absent from one
// side means "never recorded" (count 0), not "no value to compare." The
// generic diffTree.ts algorithm doesn't know this (it's a domain rule
// specific to this one field, not something the shared diff engine should
// bake in), so it marks a key present only on one side as 'added'/'removed'
// — which rendered as a bare value with no arrow, and never entered the
// unchanged-collapse count even when the "real" comparison (0 vs 0) is a
// no-op. Resolving both sides to an explicit count here, per key, fixes
// both: a 0-vs-N key renders as "0 → N" like any other changed row, and a
// 0-vs-0 key collapses into "N unchanged fields not shown" like any other
// untouched field — bypassing collectChangedLeaves/collectUnchanged (which
// operate at DiffStatus/top-level-of-subtree granularity, not this field's
// domain-specific implicit-zero rule) for the defects section only.
//
// AUDIT_REPORT.md #42 found that count-equality alone is NOT sufficient
// reason to treat a defect as unchanged: a profile-switch amendment can move
// a defect to a different category, change its evaluationMode, or drop it
// from every category the new profile defines — all while its raw count
// stays identical — and none of that was visible. A row now stays visible
// (never collapsed) if EITHER the count changed OR
// `detectDefectCategoryChange` finds a category-level change.
function toDefectCount(value: unknown): number {
  return typeof value === 'number' ? value : (Number(value) || 0);
}

export interface DefectDiffRow {
  defectId: string;
  originalCount: number;
  proposedCount: number;
  /** Non-null when this defect's category/evalMode assignment differs between the before and after profile — see `detectDefectCategoryChange`. */
  categoryChange: DefectCategoryChange | null;
}

function resolveDefectRows(
  defectsNode: DiffNode | undefined,
  defectContext: CrossProfileDefectContext,
): { rows: DefectDiffRow[]; unchangedEntries: UnchangedEntry[] } {
  const rows: DefectDiffRow[] = [];
  const unchangedEntries: UnchangedEntry[] = [];
  if (!defectsNode?.children) return { rows, unchangedEntries };

  for (const [defectId, child] of Object.entries(defectsNode.children)) {
    const originalCount = toDefectCount(child.original);
    const proposedCount = toDefectCount(child.proposed);
    const categoryChange = detectDefectCategoryChange(
      defectContext.before.categories[defectId],
      defectContext.after.categories[defectId],
    );

    if (originalCount === proposedCount && !categoryChange) {
      unchangedEntries.push({ path: defectId, value: proposedCount });
    } else {
      rows.push({ defectId, originalCount, proposedCount, categoryChange });
    }
  }
  return { rows, unchangedEntries };
}

// ── Category-change badge (moved / evalModeChanged / orphaned) ────────────

const CATEGORY_CHANGE_BADGE: Record<DefectCategoryChangeKind, { label: string; classes: string }> = {
  // Amber — Action Required / Warning (UI_DESIGN_SYSTEM.md §4.9): a defect
  // silently dropping out of grading entirely warrants a reviewer's attention,
  // distinct from the merely-informational Cyan used below.
  orphaned: {
    label: 'Orphaned — Not Graded',
    classes: 'bg-amber-500/10 border border-amber-500/30 text-amber-400',
  },
  // Cyan — Info/provenance (§5.3): a genuine change the reviewer must see,
  // but not inherently a problem the way an orphaned defect is.
  moved: {
    label: 'Moved Category',
    classes: 'bg-brand-secondary/10 border border-brand-secondary/30 text-brand-secondary',
  },
  evalModeChanged: {
    label: 'Eval Mode Changed',
    classes: 'bg-brand-secondary/10 border border-brand-secondary/30 text-brand-secondary',
  },
};

const CATEGORY_CHANGE_EXPLANATION: Record<DefectCategoryChangeKind, string> = {
  orphaned: 'No category under the proposed profile covers this defect — it would be excluded from grading entirely if approved.',
  moved: 'This defect is graded under a different category under the proposed profile.',
  evalModeChanged: 'Same category, but the proposed profile grades it under a different evaluation mode.',
};

function categoryLabel(info: { categoryName: string; aqlLevel: string; evaluationMode: string } | null): string {
  if (!info) return '—';
  return `${info.categoryName} (${formatEvalModeForDisplay(info.aqlLevel, info.evaluationMode)})`;
}

function DefectCategoryChangeDetail({ change }: { change: DefectCategoryChange }) {
  const badge = CATEGORY_CHANGE_BADGE[change.kind];
  return (
    <div className="flex flex-col gap-1 pt-1">
      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${badge.classes}`}>
          {badge.label}
        </span>
        <span className="text-rose-400/80">{categoryLabel(change.before)}</span>
        {change.kind !== 'orphaned' && (
          <>
            <ArrowRight className="w-3 h-3 text-muted shrink-0" strokeWidth={2} />
            <span className="text-emerald-400">{categoryLabel(change.after)}</span>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted italic">{CATEGORY_CHANGE_EXPLANATION[change.kind]}</p>
    </div>
  );
}

function DefectRowView({ row, labels }: { row: DefectDiffRow; labels: Record<string, string> }) {
  const name = labels[row.defectId] ?? row.defectId;
  const countChanged = row.originalCount !== row.proposedCount;

  return (
    <div className="flex flex-col gap-1 py-2.5 px-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4">
        <span className="text-[11px] font-bold text-muted uppercase tracking-wide shrink-0 sm:max-w-[45%]">
          {name}
        </span>
        <span className="text-sm font-mono flex items-center gap-2 flex-wrap sm:justify-end">
          {countChanged ? (
            <>
              <span className="text-rose-400 opacity-60">{row.originalCount}</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={2} />
              <span className="text-emerald-400 font-semibold">{row.proposedCount}</span>
            </>
          ) : (
            <span className="text-primary">{row.proposedCount}</span>
          )}
        </span>
      </div>
      {row.categoryChange && <DefectCategoryChangeDetail change={row.categoryChange} />}
    </div>
  );
}

// ── Label resolution per row ───────────────────────────────────────────────

function labelForRow(
  sectionId: SectionId,
  keyPath: (string | number)[],
  dimensionLabels: Record<string, string>,
): string {
  const top = String(keyPath[0]);
  const rest = keyPath.slice(1);

  // 'defects' never reaches this generic path — it has its own bespoke
  // DefectRowView (see resolveDefectRows/DefectRowView above).

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
  formatOriginal,
  formatProposed,
  muted,
}: {
  label: string;
  node: DiffNode;
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
  labelForPath = (path) => SUBMISSION_FIELD_LABELS[path] ?? path,
}: {
  entries: UnchangedEntry[];
  expanded: boolean;
  onToggle: () => void;
  labelForPath?: (path: string) => string;
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
                {labelForPath(path)}
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
  resolveProfileValue,
  showUnchanged,
  onToggleUnchanged,
  labelForPath,
}: {
  heading?: string;
  muted?: boolean;
  rows: DiffRow[];
  unchangedEntries: UnchangedEntry[];
  sectionId: SectionId;
  dimensionLabels: Record<string, string>;
  dimensionDecimals: Record<string, number>;
  resolveProfileValue: (raw: unknown) => ProfileDisplayValue;
  showUnchanged: boolean;
  onToggleUnchanged: () => void;
  labelForPath?: (path: string) => string;
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
                label={labelForRow(sectionId, row.keyPath, dimensionLabels)}
                node={row.node}
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

      <UnchangedCollapse entries={unchangedEntries} expanded={showUnchanged} onToggle={onToggleUnchanged} labelForPath={labelForPath} />
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
  defectContext,
  resolveProfileValue,
  expandedGroups,
  onToggleGroup,
}: {
  sectionId: SectionId;
  title: string;
  sectionNode: DiffNode;
  dimensionLabels: Record<string, string>;
  dimensionDecimals: Record<string, number>;
  defectContext: CrossProfileDefectContext;
  resolveProfileValue: (raw: unknown) => ProfileDisplayValue;
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
}) {
  // Defects gets its own category-aware, implicit-zero resolution instead of
  // the generic DiffStatus-based walk — see resolveDefectRows() above. Every
  // other section keeps the standard collectChangedLeaves/collectUnchanged path.
  if (sectionId === 'defects') {
    const { rows, unchangedEntries } = resolveDefectRows(sectionNode.children?.['defects'], defectContext);
    if (rows.length === 0 && unchangedEntries.length === 0) return null;
    const showUnchanged = Boolean(expandedGroups[`${sectionId}:raw`]);

    return (
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-brand-secondary uppercase tracking-widest flex items-center gap-2">
          {title}
          {defectContext.unavailable && (
            <span className="text-[10px] font-normal normal-case italic text-amber-400/80">
              (proposed profile unavailable — defect names/categories may be incomplete)
            </span>
          )}
        </h4>
        {rows.length > 0 ? (
          <div className="divide-y divide-gray-800/60 border border-gray-800 rounded-lg overflow-hidden bg-canvas/30">
            {rows.map((row) => (
              <DefectRowView key={row.defectId} row={row} labels={defectContext.labels} />
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted italic px-3 py-2">No changes.</div>
        )}
        <UnchangedCollapse
          entries={unchangedEntries}
          expanded={showUnchanged}
          onToggle={() => onToggleGroup(`${sectionId}:raw`)}
          labelForPath={(defectId) => defectContext.labels[defectId] ?? defectId}
        />
      </div>
    );
  }

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
  defectContext,
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
          defectContext={defectContext}
          resolveProfileValue={resolveProfileValue}
          expandedGroups={expandedGroups}
          onToggleGroup={toggle}
        />
      ))}
    </div>
  );
}
