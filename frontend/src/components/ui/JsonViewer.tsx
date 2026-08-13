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

function tryParseJSON(value: unknown): unknown {
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
