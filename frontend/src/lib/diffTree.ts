/**
 * @file diffTree.ts
 * @description Recursive structural diff between an AmendmentLog's original and
 * proposed submission payloads, for ApprovalsQueue.tsx's amendment diff modal.
 *
 * `AmendmentLog.originalValues` is `JSON.stringify(originalSubmission)` — a raw
 * Prisma row, where `dimensions`/`dimensionMins`/`defects` are JSON-encoded
 * *strings*. `AmendmentLog.newValues` is the frontend's payload, where those
 * same fields are live objects. Both sides are normalized (JSON-string leaves
 * parsed) via `tryParseJSON` (JsonViewer.tsx) before comparison, or a field
 * that's byte-identical would still be flagged as "changed" purely from that
 * type-shape mismatch.
 *
 * A fixed set of administrative/workflow fields (`NON_SUBSTANTIVE_DIFF_FIELDS`)
 * is excluded from the diff entirely — these are never genuinely user-edited
 * via the amendment form (DB-only columns, requester identity sent alongside
 * `newValues` rather than inside it, server-computed grading fields, etc.), so
 * they'd otherwise show as spurious changed/added/removed noise on literally
 * every amendment regardless of what was actually edited.
 *
 * Arrays are compared index-by-index (not content-matched/LCS) — validated
 * safe against real dev.db data: every array inside `dimensions`/
 * `dimensionMins` (gloveLength, palmThickness, etc.) is fixed-length and
 * fixed-order across all amendment logs inspected. `defects`, by contrast, is
 * an object (key:count map) that genuinely gains/loses keys between versions,
 * so it goes through the object path (key-set union), not this array path.
 */

import { tryParseJSON } from '../components/ui/JsonViewer';

export type DiffStatus = 'unchanged' | 'changed' | 'added' | 'removed';

export interface DiffNode {
  status: DiffStatus;
  /** Present when this key/index exists on the original side. */
  original?: unknown;
  /** Present when this key/index exists on the proposed side. */
  proposed?: unknown;
  /** Present for object/array containers — diffed children keyed by field name or array index (as a string). */
  children?: Record<string, DiffNode>;
  /** True if `children` represents an array (vs. a plain object) — tells the renderer whether to show index labels. */
  isArray?: boolean;
}

/**
 * Top-level Submission fields that are never genuinely user-edited via the
 * amendment form — excluded from the diff tree entirely (not shown, not
 * counted toward the "N unchanged fields not shown" summary either).
 * Confirmed via live dev.db inspection: all ~10 of these differ on EVERY
 * amendment regardless of what was actually changed, purely from how
 * originalValues (raw DB row) and newValues (frontend payload) are shaped —
 * see file header.
 */
export const NON_SUBSTANTIVE_DIFF_FIELDS = new Set<string>([
  'id',
  'createdAt',
  'updatedAt',
  'submissionTimestamp',
  'amendmentStatus',
  'aadObjectId',
  'userPrincipalName',
  'displayName',
  'pinUserId',
  'gradingSnapshot',
  'gradingSnapshotProfileName',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Normalizes a value for comparison/diffing: parses JSON-encoded strings, leaves everything else as-is. */
function normalize(value: unknown): unknown {
  return tryParseJSON(value);
}

function primitivesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Covers number-vs-numeric-string and similar loose-equal cases without
  // treating null/undefined as equal to each other's absence (handled by
  // the added/removed branches before this is ever called).
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Recursively diffs `original` vs `proposed` (already known to exist on both
 * sides — presence/absence is handled by the caller). Both are normalized
 * before comparison.
 */
function diffValue(rawOriginal: unknown, rawProposed: unknown): DiffNode {
  const original = normalize(rawOriginal);
  const proposed = normalize(rawProposed);

  const originalIsObject = isPlainObject(original);
  const proposedIsObject = isPlainObject(proposed);
  const originalIsArray = Array.isArray(original);
  const proposedIsArray = Array.isArray(proposed);

  // Both plain objects — diff by key-set union.
  if (originalIsObject && proposedIsObject) {
    return diffObject(original, proposed);
  }

  // Both arrays — diff by index, up to the shorter length (see file header).
  if (originalIsArray && proposedIsArray) {
    return diffArray(original, proposed);
  }

  // Shape mismatch (object vs array vs primitive) — treat as an opaque leaf
  // rather than attempting to recurse into mismatched structures.
  if (originalIsObject || proposedIsObject || originalIsArray || proposedIsArray) {
    const equal = JSON.stringify(original) === JSON.stringify(proposed);
    return { status: equal ? 'unchanged' : 'changed', original, proposed };
  }

  // Both primitives.
  const equal = primitivesEqual(original, proposed);
  return { status: equal ? 'unchanged' : 'changed', original, proposed };
}

function diffObject(original: Record<string, unknown>, proposed: Record<string, unknown>): DiffNode {
  const keys = Array.from(new Set([...Object.keys(original), ...Object.keys(proposed)]));
  const children: Record<string, DiffNode> = {};
  let anyChanged = false;

  for (const key of keys) {
    const inOriginal = Object.prototype.hasOwnProperty.call(original, key);
    const inProposed = Object.prototype.hasOwnProperty.call(proposed, key);

    let child: DiffNode;
    if (inOriginal && !inProposed) {
      child = { status: 'removed', original: normalize(original[key]) };
    } else if (!inOriginal && inProposed) {
      child = { status: 'added', proposed: normalize(proposed[key]) };
    } else {
      child = diffValue(original[key], proposed[key]);
    }

    children[key] = child;
    if (child.status !== 'unchanged') anyChanged = true;
  }

  return {
    status: anyChanged ? 'changed' : 'unchanged',
    original,
    proposed,
    children,
    isArray: false,
  };
}

function diffArray(original: unknown[], proposed: unknown[]): DiffNode {
  const children: Record<string, DiffNode> = {};
  let anyChanged = false;
  const minLen = Math.min(original.length, proposed.length);

  for (let i = 0; i < minLen; i += 1) {
    const child = diffValue(original[i], proposed[i]);
    children[String(i)] = child;
    if (child.status !== 'unchanged') anyChanged = true;
  }
  for (let i = minLen; i < original.length; i += 1) {
    children[String(i)] = { status: 'removed', original: normalize(original[i]) };
    anyChanged = true;
  }
  for (let i = minLen; i < proposed.length; i += 1) {
    children[String(i)] = { status: 'added', proposed: normalize(proposed[i]) };
    anyChanged = true;
  }

  return {
    status: anyChanged ? 'changed' : 'unchanged',
    original,
    proposed,
    children,
    isArray: true,
  };
}

/**
 * Builds the top-level diff tree between an AmendmentLog's original and
 * proposed submission payloads, excluding `excludeKeys` entirely (see
 * `NON_SUBSTANTIVE_DIFF_FIELDS`).
 */
export function buildDiffTree(
  original: Record<string, unknown>,
  proposed: Record<string, unknown>,
  excludeKeys: Set<string> = NON_SUBSTANTIVE_DIFF_FIELDS,
): DiffNode {
  const filteredOriginal: Record<string, unknown> = {};
  const filteredProposed: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(original)) {
    if (!excludeKeys.has(k)) filteredOriginal[k] = v;
  }
  for (const [k, v] of Object.entries(proposed)) {
    if (!excludeKeys.has(k)) filteredProposed[k] = v;
  }

  return diffObject(filteredOriginal, filteredProposed);
}

export interface UnchangedEntry {
  path: string;
  value: unknown;
}

/**
 * Collects top-level fields of `tree` that are entirely unchanged, one entry
 * per field — for the diff modal's expandable "N unchanged fields not shown"
 * summary. Deliberately NOT recursive: a partially-changed top-level field
 * (e.g. `dimensionMins` with one differing threshold) is skipped here even
 * though most of its sub-fields are individually unchanged — those are
 * already implied by the changed-side view showing just the differing part,
 * and flattening them out here would turn a handful of reviewable blocks
 * into dozens of individual leaf-path rows (e.g.
 * "dimensionMins.palmThickness.fails.0"), which is unusable in practice.
 * The caller renders each returned entry with the plain (non-diff)
 * JsonViewer, and derives the summary count from this same array so the
 * header number always matches what's shown when expanded.
 */
export function collectUnchanged(tree: DiffNode): UnchangedEntry[] {
  if (!tree.children) return [];
  const results: UnchangedEntry[] = [];
  for (const [key, child] of Object.entries(tree.children)) {
    if (child.status === 'unchanged') {
      results.push({ path: key, value: child.original !== undefined ? child.original : child.proposed });
    }
  }
  return results;
}
