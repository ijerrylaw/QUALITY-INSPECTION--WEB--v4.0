/**
 * @file JsonViewer.tsx
 * @description Lightweight collapsible, syntax-highlighted JSON viewer —
 * no external dependency (react-json-view et al. aren't in package.json;
 * this covers the one use case — ApprovalsQueue.tsx's amendment diff modal
 * — without adding one).
 *
 * Accepts either a real object/array or a JSON-encoded string (some diffed
 * fields — e.g. Submission.dimensions/defects/gradingSnapshot — arrive as
 * already-parsed objects on the proposed side but as raw JSON-string DB
 * columns on the original side, since AmendmentLog.originalValues is
 * `JSON.stringify(originalSubmission)` over the raw Prisma row). Non-JSON
 * strings/primitives pass through unchanged.
 *
 * UI_DESIGN_SYSTEM.md §1.3 Strict Font Protocol: font-mono for all data.
 * Colors reuse existing tokens (text-muted, brand-secondary, emerald,
 * indigo) rather than inventing a new palette.
 */

import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { DiffNode } from '../../lib/diffTree';

/** Parses a JSON-encoded string into its object/array value; passes anything else through unchanged. Exported for diffTree.ts's normalization step. */
export function tryParseJSON(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function JsonPrimitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted italic">null</span>;
  if (value === undefined) return <span className="text-muted italic">undefined</span>;
  if (typeof value === 'string') return <span className="text-emerald-400">&quot;{value}&quot;</span>;
  if (typeof value === 'number') return <span className="text-brand-secondary">{value}</span>;
  if (typeof value === 'boolean') return <span className="text-indigo-400">{String(value)}</span>;
  return <span className="text-primary">{String(value)}</span>;
}

const INDENT_PX = 14;

interface JsonNodeProps {
  label?: string;
  value: unknown;
  depth: number;
  isLast: boolean;
}

function JsonNode({ label, value, depth, isLast }: JsonNodeProps) {
  const isArray = Array.isArray(value);
  const isContainer = isArray || (value !== null && typeof value === 'object');
  const [expanded, setExpanded] = useState(true);

  const keyPrefix = label !== undefined ? (
    <span className="text-muted">&quot;{label}&quot;<span className="text-gray-600">: </span></span>
  ) : null;
  const trailingComma = !isLast ? <span className="text-gray-600">,</span> : null;

  if (!isContainer) {
    return (
      <div style={{ paddingLeft: depth * INDENT_PX }}>
        {keyPrefix}
        <JsonPrimitive value={value} />
        {trailingComma}
      </div>
    );
  }

  const entries: [string | undefined, unknown][] = isArray
    ? (value as unknown[]).map((v) => [undefined, v])
    : Object.entries(value as Record<string, unknown>);

  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  if (entries.length === 0) {
    return (
      <div style={{ paddingLeft: depth * INDENT_PX }}>
        {keyPrefix}
        <span className="text-gray-500">{openBracket}{closeBracket}</span>
        {trailingComma}
      </div>
    );
  }

  return (
    <div>
      <div style={{ paddingLeft: depth * INDENT_PX }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-0.5 hover:bg-white/5 rounded -ml-4 pl-4 outline-none"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted shrink-0" strokeWidth={2.5} />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted shrink-0" strokeWidth={2.5} />
          )}
          {keyPrefix}
          <span className="text-gray-500">{openBracket}</span>
          {!expanded && (
            <span className="text-gray-600 italic px-1">
              {entries.length} {isArray ? (entries.length === 1 ? 'item' : 'items') : (entries.length === 1 ? 'key' : 'keys')}
            </span>
          )}
          {!expanded && <span className="text-gray-500">{closeBracket}</span>}
        </button>
        {!expanded && trailingComma}
      </div>
      {expanded && (
        <>
          {entries.map(([k, v], i) => (
            <JsonNode key={k ?? i} label={k} value={v} depth={depth + 1} isLast={i === entries.length - 1} />
          ))}
          <div style={{ paddingLeft: depth * INDENT_PX }} className="text-gray-500">
            {closeBracket}
            {trailingComma}
          </div>
        </>
      )}
    </div>
  );
}

export interface JsonViewerProps {
  data: unknown;
}

/** Renders `data` (object/array, or a JSON-encoded string) as a collapsible, indented, syntax-highlighted tree. Falls back to plain text for non-JSON values. */
export function JsonViewer({ data }: JsonViewerProps) {
  const parsed = tryParseJSON(data);

  if (parsed === null || typeof parsed !== 'object') {
    return <span className="font-mono text-sm">{String(parsed ?? '—')}</span>;
  }

  return (
    <div className="font-mono text-xs leading-relaxed overflow-x-auto">
      <JsonNode value={parsed} depth={0} isLast={true} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIFF-AWARE RENDERING (ApprovalsQueue.tsx's Amendment Request diff modal)
//
// Walks a DiffNode tree (diffTree.ts) and renders ONLY the content that's
// changed/added/removed for one side — an 'unchanged' node (leaf or whole
// subtree) is skipped entirely, not shown collapsed. See diffTree.ts's file
// header for why this exists instead of just diffing top-level keys.
// ─────────────────────────────────────────────────────────────────────────────

export type DiffSide = 'original' | 'proposed';

/** True if `node` has anything to show on `side` — a container is visible if any descendant is, an 'added' leaf is original-side-invisible, a 'removed' leaf is proposed-side-invisible. */
function diffNodeHasVisibleContent(node: DiffNode, side: DiffSide): boolean {
  if (node.status === 'unchanged') return false;
  if (!node.children) {
    if (node.status === 'changed') return true;
    if (node.status === 'added') return side === 'proposed';
    if (node.status === 'removed') return side === 'original';
    return false;
  }
  return Object.values(node.children).some((child) => diffNodeHasVisibleContent(child, side));
}

function DiffStatusBadge({ status }: { status: DiffNode['status'] }) {
  if (status === 'added') return <span className="mr-1 text-emerald-400 font-bold">+</span>;
  if (status === 'removed') return <span className="mr-1 text-rose-400 font-bold">&minus;</span>;
  return null;
}

interface DiffTreeNodeProps {
  label?: string;
  node: DiffNode;
  side: DiffSide;
  depth: number;
  isLast: boolean;
}

/** Nested (non-top-level) diff renderer — mirrors JsonNode's indent/bracket structure, but skips unchanged children and colors leaves by diff status instead of by type. */
function DiffTreeNode({ label, node, side, depth, isLast }: DiffTreeNodeProps) {
  if (!diffNodeHasVisibleContent(node, side)) return null;

  const keyPrefix = label !== undefined ? (
    <span className="text-muted">&quot;{label}&quot;<span className="text-gray-600">: </span></span>
  ) : null;
  const trailingComma = !isLast ? <span className="text-gray-600">,</span> : null;

  if (!node.children) {
    const value = side === 'original' ? node.original : node.proposed;
    const isContainerValue = value !== null && typeof value === 'object';
    const colorClass =
      node.status === 'added' ? 'text-emerald-400' :
      node.status === 'removed' ? 'text-rose-400' :
      side === 'original' ? 'text-rose-400' : 'text-emerald-400';

    return (
      <div style={{ paddingLeft: depth * INDENT_PX }} className="py-0.5">
        {keyPrefix}
        <DiffStatusBadge status={node.status} />
        {isContainerValue ? (
          <JsonViewer data={value} />
        ) : (
          <span className={`text-sm font-mono ${colorClass}`}>{String(value ?? '—')}</span>
        )}
        {trailingComma}
      </div>
    );
  }

  const visibleEntries = Object.entries(node.children).filter(([, child]) => diffNodeHasVisibleContent(child, side));
  const openBracket = node.isArray ? '[' : '{';
  const closeBracket = node.isArray ? ']' : '}';

  return (
    <div>
      <div style={{ paddingLeft: depth * INDENT_PX }}>
        {keyPrefix}
        <span className="text-gray-500">{openBracket}</span>
      </div>
      {visibleEntries.map(([k, child], i) => (
        <DiffTreeNode
          key={k}
          label={node.isArray ? `[${k}]` : k}
          node={child}
          side={side}
          depth={depth + 1}
          isLast={i === visibleEntries.length - 1}
        />
      ))}
      <div style={{ paddingLeft: depth * INDENT_PX }} className="text-gray-500">
        {closeBracket}
        {trailingComma}
      </div>
    </div>
  );
}

export interface DiffJsonViewerProps {
  /** Root diff tree from buildDiffTree() — its `children` are the top-level submission fields. */
  tree: DiffNode;
  side: DiffSide;
}

/**
 * Renders one side (Original or Proposed) of a diff tree, showing only
 * changed/added/removed top-level fields — each as its own bordered box,
 * matching the pre-existing per-field box styling — with unchanged fields
 * hidden entirely. A field whose value is itself a partially-changed
 * container recurses via DiffTreeNode, so only the genuinely-differing
 * nested content (down to individual array elements) is shown inside it.
 */
export function DiffJsonViewer({ tree, side }: DiffJsonViewerProps) {
  if (!tree.children) return null;
  const entries = Object.entries(tree.children).filter(([, node]) => diffNodeHasVisibleContent(node, side));

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      {entries.map(([key, node]) => {
        const boxClass =
          node.status === 'added'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : node.status === 'removed'
            ? 'bg-rose-500/10 border-rose-500/30'
            : side === 'original'
            ? 'bg-rose-500/10 border-rose-500/30'
            : 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]';

        const value = side === 'original' ? node.original : node.proposed;
        const isContainerValue = value !== null && typeof value === 'object';
        const leafColorClass = side === 'original' ? 'text-rose-400' : 'text-emerald-400';

        return (
          <div key={key} className={`p-3 rounded-lg border ${boxClass}`}>
            <span className="flex items-center text-[10px] font-bold text-muted uppercase mb-1">
              <DiffStatusBadge status={node.status} />
              {key}
            </span>
            {!node.children ? (
              isContainerValue ? (
                <JsonViewer data={value} />
              ) : (
                <span className={`text-sm font-mono ${leafColorClass}`}>{String(value ?? '—')}</span>
              )
            ) : (
              <div className="font-mono text-xs leading-relaxed overflow-x-auto">
                <DiffTreeNode node={node} side={side} depth={0} isLast={true} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
