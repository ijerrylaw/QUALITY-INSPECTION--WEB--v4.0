/**
 * @file amendmentDiff.ts
 * @description Server-side, field-agnostic comparator between a Submission's
 * stored row and an amendment's proposed `newValues` — the authority behind the
 * acknowledged-changes gate on `POST /api/submissions/:id/amendments`.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * An amendment's stated reason had no structural link to what it actually
 * changed. On lot A001A6247003 the requester's note read "wrong inspection
 * profile" while the same payload also raised two defect counts from 0 to 1
 * (`def_thin_weak_spot`, `def_shining_oily_mark`) — invisible to anyone who
 * trusted the note. This module makes the server compute, independently of the
 * client, exactly what an amendment changes, so the requester can be required
 * to acknowledge each one.
 *
 * ── Relationship to the frontend's diffTree.ts ──────────────────────────────
 * Deliberately NOT a port of `frontend/src/lib/diffTree.ts`, and deliberately
 * not shared with it. That module builds a recursive render TREE (with
 * unchanged-collapse, per-slot leaves, added/removed subtree styling) for the
 * approver's diff modal. This one emits a FLAT, canonical change list whose
 * `path` strings are a wire contract — the acknowledgment keys the client sends
 * back. Different outputs, different consumers, different stability
 * requirements: a rendering tweak in the viewer must never silently move an
 * acknowledgment key. The overlap is the exclusion set and the JSON-string
 * normalization, both restated here with their reasons rather than imported
 * across the workspace boundary.
 *
 * ── Path granularity is a wire contract ─────────────────────────────────────
 * `path` values are what the client echoes back in `acknowledgedChanges`.
 * Changing one is a breaking API change, not a refactor.
 *
 *   scalar top-level field   ->  "profileId", "sampleSize", "verdict", ...
 *   defects                  ->  "defects.<defectId>"     (one per defect)
 *   dimensions               ->  "dimensions.<dimId>"     (one per dimension,
 *                                 whole 5-slot array as from/to — an operator
 *                                 re-measures a dimension, not a slot)
 */

/** How a single field changed between the stored row and the proposal. */
export type AmendmentChangeType = 'modified' | 'added' | 'removed';

/** One acknowledgeable change. `path` is the acknowledgment key — see file header. */
export interface AmendmentChange {
  path: string;
  changeType: AmendmentChangeType;
  from: unknown;
  to: unknown;
}

/**
 * Top-level Submission fields the gate never asks anyone to acknowledge.
 *
 * Three distinct reasons, kept in one set because the comparator treats them
 * identically — but they are NOT interchangeable if this list is ever revisited:
 *
 * (1) SHAPE NOISE — present on the stored Prisma row but never on the frontend
 *     payload, or vice versa. Diffing them reports changes that describe how the
 *     two sides are serialized, not anything a person did. Mirrors
 *     `NON_SUBSTANTIVE_DIFF_FIELDS` in frontend/src/lib/diffTree.ts.
 *
 * (2) SERVER-FROZEN GRADING DATA — written by resolveVerdict() at submit and
 *     amendment-approval time, never by an operator. `gloveWeightSnapshot` is
 *     here for that reason, and it is ALSO the one field the frontend's own
 *     exclusion list is missing: it postdates that list, so every amendment diff
 *     in the approver's modal currently renders a spurious
 *     "gloveWeightSnapshot: removed" row. Tracked separately; not this module's
 *     bug to fix, but this module must not reproduce it.
 *
 * (3) DERIVED — `dimensionMins` is computed client-side FROM `dimensions`
 *     (StepDimensions.tsx; DATA_SCHEMAS_AND_TYPES.md §1) and carries no
 *     independent operator intent. Requiring its acknowledgment would make one
 *     re-measurement cost ~10 checkboxes, all restating the single
 *     `dimensions.<dimId>` change that caused them.
 *
 * `verdict` is deliberately NOT excluded despite also being derived: it is the
 * one derived field whose change is the whole point of the record, so a proposal
 * that moves it must be acknowledged explicitly.
 */
export const AMENDMENT_GATE_EXCLUDED_FIELDS: ReadonlySet<string> = new Set([
  // (1) shape noise
  'id',
  'createdAt',
  'updatedAt',
  'submissionTimestamp',
  'amendmentStatus',
  'aadObjectId',
  'userPrincipalName',
  'displayName',
  'pinUserId',
  // (2) server-frozen grading data
  'gradingSnapshot',
  'gradingSnapshotProfileName',
  'gloveWeightSnapshot',
  // (3) derived
  'dimensionMins',
]);

/** Fields whose value is a `Record<key, …>` that the gate expands one level. */
const DEFECTS_FIELD = 'defects';
const DIMENSIONS_FIELD = 'dimensions';

/**
 * Parses a JSON-encoded string into its value, passing through anything that is
 * already an object.
 *
 * Load-bearing for this comparator: `originalValues` is the raw Prisma row,
 * where `defects`/`dimensions` are JSON *strings*, while `newValues` is the
 * frontend payload, where the same fields are live *objects*. Without this,
 * every amendment would report both as changed purely from that type mismatch.
 */
function parseMaybeJSON(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '' || !/^[[{]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Structural equality by canonical JSON, with object keys sorted so key ORDER never reads as a change. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return canonicalJSON(a) === canonicalJSON(b);
}

function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

/** Coerces a defect map entry to its count. Mirrors `toDefectCount` in AmendmentDiffView.tsx. */
function toDefectCount(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  const parsed = parseMaybeJSON(value);
  return isPlainObject(parsed) ? parsed : {};
}

/**
 * Expands `defects` into one change per defect id.
 *
 * A defect id absent from one side means "never recorded" (count 0), NOT "no
 * value to compare" — `Submission.defects` is a sparse `Record<defectId, count>`
 * (DATA_SCHEMAS_AND_TYPES.md §1). Both sides are therefore resolved to an
 * explicit count before comparison, so a 0-vs-1 key reports as `modified`
 * (0 → 1) rather than `added`, and an absent-vs-explicit-0 key reports nothing
 * at all. Same implicit-zero rule `AmendmentDiffView.tsx` applies for display,
 * restated here because the gate must agree with what the reviewer is shown.
 */
function diffDefects(originalRaw: unknown, proposedRaw: unknown): AmendmentChange[] {
  const original = asRecord(originalRaw);
  const proposed = asRecord(proposedRaw);
  const changes: AmendmentChange[] = [];

  for (const defectId of unionKeys(original, proposed)) {
    const from = toDefectCount(original[defectId]);
    const to = toDefectCount(proposed[defectId]);
    if (from === to) continue;
    changes.push({ path: `${DEFECTS_FIELD}.${defectId}`, changeType: 'modified', from, to });
  }
  return changes;
}

/**
 * Expands `dimensions` into one change per dimension id, comparing whole
 * measurement arrays.
 *
 * Per-DIMENSION rather than per-SLOT on purpose: an operator re-measures a
 * dimension as one act, so five slot-level acknowledgments for one re-measure
 * would be noise the requester learns to click through — the exact failure mode
 * this gate exists to prevent. Unlike `defects`, a dimension id genuinely can
 * appear or disappear (the wizard drops recorded measurements on a product/size
 * switch — WizardPage.tsx's handleUpdate), so added/removed are real here.
 */
function diffDimensions(originalRaw: unknown, proposedRaw: unknown): AmendmentChange[] {
  const original = asRecord(originalRaw);
  const proposed = asRecord(proposedRaw);
  const changes: AmendmentChange[] = [];

  for (const dimId of unionKeys(original, proposed)) {
    const inOriginal = Object.prototype.hasOwnProperty.call(original, dimId);
    const inProposed = Object.prototype.hasOwnProperty.call(proposed, dimId);
    const path = `${DIMENSIONS_FIELD}.${dimId}`;

    if (inOriginal && !inProposed) {
      changes.push({ path, changeType: 'removed', from: original[dimId], to: undefined });
    } else if (!inOriginal && inProposed) {
      changes.push({ path, changeType: 'added', from: undefined, to: proposed[dimId] });
    } else if (!valuesEqual(original[dimId], proposed[dimId])) {
      changes.push({ path, changeType: 'modified', from: original[dimId], to: proposed[dimId] });
    }
  }
  return changes;
}

function unionKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
}

/**
 * Computes every acknowledgeable change between a stored Submission row and an
 * amendment's proposed values.
 *
 * ── Absence in `proposed` means UNTOUCHED, not removed ──────────────────────
 * Only keys PRESENT in `proposed` are considered at the top level. An amendment
 * payload is a `Partial<Submission>` and legitimately omits fields it does not
 * change; `POST /api/amendments/:id/approve` already reads every field as
 * `newValues[k] ?? existing[k]`, so an omitted key provably means "keep the
 * stored value". Treating omission as a removal would report a dozen phantom
 * changes on every amendment. (The nested `defects`/`dimensions` maps are the
 * exception — the wizard always sends those whole, so a key missing INSIDE them
 * is real information and is handled by the two helpers above.)
 *
 * Results are sorted by `path` so the list is stable across calls — the client
 * renders it in order and tests can compare it directly.
 */
export function computeAmendmentChanges(
  originalValues: Record<string, unknown>,
  proposedValues: Record<string, unknown>,
): AmendmentChange[] {
  const changes: AmendmentChange[] = [];

  for (const key of Object.keys(proposedValues)) {
    if (AMENDMENT_GATE_EXCLUDED_FIELDS.has(key)) continue;

    if (key === DEFECTS_FIELD) {
      changes.push(...diffDefects(originalValues[key], proposedValues[key]));
      continue;
    }
    if (key === DIMENSIONS_FIELD) {
      changes.push(...diffDimensions(originalValues[key], proposedValues[key]));
      continue;
    }

    const hadKey = Object.prototype.hasOwnProperty.call(originalValues, key);
    const from = parseMaybeJSON(originalValues[key]);
    const to = parseMaybeJSON(proposedValues[key]);

    // Nulling out an optional field (totalCarton, gloveWeight) is a removal;
    // supplying one the row never had is an addition. Everything else that
    // differs is a plain modification.
    if (!hadKey || from === null || from === undefined) {
      if (to === null || to === undefined) continue; // absent -> absent: nothing happened
      changes.push({ path: key, changeType: 'added', from: undefined, to });
      continue;
    }
    if (to === null || to === undefined) {
      changes.push({ path: key, changeType: 'removed', from, to: undefined });
      continue;
    }
    if (!valuesEqual(from, to)) {
      changes.push({ path: key, changeType: 'modified', from, to });
    }
  }

  return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Returns the changes the requester did NOT acknowledge.
 *
 * An empty result means the acknowledgment set covered everything the server
 * independently found. Acknowledgment keys the server did not produce are
 * ignored rather than rejected — a client that over-acknowledges (e.g. echoing a
 * stale path after the operator edited a field back to its original value) is
 * not doing anything unsafe, and failing it would turn a benign race into a hard
 * error the operator cannot resolve.
 */
export function findUnacknowledgedChanges(
  changes: readonly AmendmentChange[],
  acknowledgedPaths: readonly string[],
): AmendmentChange[] {
  const acknowledged = new Set(acknowledgedPaths);
  return changes.filter((change) => !acknowledged.has(change.path));
}

/**
 * Normalizes the client-supplied `acknowledgedChanges` field.
 *
 * Returns `null` when the field is ABSENT — which the route treats as a
 * pre-gate client and lets through (see the route's gate block). `null` is
 * therefore meaningfully different from `[]`: an empty array is a client that
 * ran the gate and found nothing to acknowledge, and it is still enforced.
 *
 * Throws for a present-but-malformed value, so a client sending the wrong shape
 * gets a 400 instead of silently skipping the gate.
 */
export function parseAcknowledgedChanges(raw: unknown): string[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string')) {
    throw new TypeError('acknowledgedChanges must be an array of change-path strings.');
  }
  return raw as string[];
}
