/**
 * @file amendmentGateScope.test.ts
 * @description Structural guards on WHERE the acknowledged-changes gate is
 * allowed to run. Both invariants are about placement rather than behaviour, so
 * they are asserted against the route source itself — there is no runtime call
 * that could observe "the gate was not consulted here".
 *
 * These exist because both invariants are load-bearing and both are the kind of
 * thing a later, well-meaning change would break while making the gate
 * "stricter":
 *
 *   1. A new (non-amendment) submission has no prior record to diff against, so
 *      the gate must never touch POST /api/submissions.
 *   2. Grandfathering is structural, not a date cutoff: the gate runs only at
 *      amendment CREATION. Wiring it into the approve route would retroactively
 *      fail every already-PENDING draft, all of which carry
 *      `acknowledgedChanges` NULL.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE_SOURCE = readFileSync(join(__dirname, '..', 'submissions.routes.ts'), 'utf8');

/**
 * Identifiers that must not appear in a handler the gate has no business in.
 *
 * Includes `computeAmendmentChanges` even though merely COMPUTING a diff is
 * harmless: neither the approve route nor the create route has a meaningful
 * "before" to diff against, so any reference in them is a mistake regardless of
 * whether it goes on to reject.
 */
const GATE_IDENTIFIERS = [
  'computeAmendmentChanges',
  'findUnacknowledgedChanges',
  'unacknowledgedChanges',
];

/**
 * The rejection itself — what "enforcement" means, as distinct from computing a
 * diff. `POST /:id/amendment-preview` calls the same comparator read-only to
 * build the wizard's checklist, so counting comparator CALLS would conflate the
 * two; only this identifier marks a request being refused.
 */
const ENFORCEMENT_IDENTIFIER = 'findUnacknowledgedChanges(';

/** Returns the source between two anchors, for scoping an assertion to one handler. */
function sliceBetween(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor);
  expect(start, `anchor not found: ${startAnchor}`).toBeGreaterThan(-1);
  expect(end, `anchor not found: ${endAnchor}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('acknowledged-changes gate scope', () => {
  it('(d) leaves new submissions (POST /api/submissions) untouched', () => {
    const createHandler = sliceBetween(
      ROUTE_SOURCE,
      "router.post('/', requireRole",
      "router.get('/'",
    );

    for (const identifier of GATE_IDENTIFIERS) {
      expect(
        createHandler.includes(identifier),
        `POST /api/submissions must not reference ${identifier} — a new submission ` +
          'has no prior record to diff against (locked scope decision #7).',
      ).toBe(false);
    }
  });

  it('(c) leaves the approve route untouched, so pre-gate drafts can never fail it', () => {
    const approveHandler = sliceBetween(
      ROUTE_SOURCE,
      "amendmentsRouter.post('/:id/approve'",
      "amendmentsRouter.post('/:id/reject'",
    );

    for (const identifier of GATE_IDENTIFIERS) {
      expect(
        approveHandler.includes(identifier),
        `POST /api/amendments/:id/approve must not reference ${identifier} — every ` +
          'already-PENDING draft carries acknowledgedChanges NULL and would fail ' +
          'retroactively. Grandfathering depends on this route staying clean.',
      ).toBe(false);
    }
  });

  it('enforces the gate in exactly one place — the amendment draft route', () => {
    const enforcementSites = ROUTE_SOURCE.split(ENFORCEMENT_IDENTIFIER).length - 1;
    expect(enforcementSites, 'the gate should reject in exactly one place').toBe(1);

    const draftHandler = sliceBetween(
      ROUTE_SOURCE,
      "router.post('/:id/amendments'",
      'AMENDMENTS ROUTER',
    );
    expect(draftHandler).toContain(ENFORCEMENT_IDENTIFIER);
  });

  it('lets the preview route COMPUTE the diff but never reject on it', () => {
    // The checklist endpoint must share the comparator — that shared call is the
    // whole reason the wizard's checkboxes and the gate can't disagree — while
    // staying a read-only report. If it ever started rejecting, an operator would
    // be blocked at the review step with no way to acknowledge anything.
    const previewHandler = sliceBetween(
      ROUTE_SOURCE,
      "router.post('/:id/amendment-preview'",
      "router.post('/:id/amendments'",
    );

    expect(previewHandler).toContain('computeAmendmentChanges(');
    expect(previewHandler).not.toContain(ENFORCEMENT_IDENTIFIER);
    expect(previewHandler).not.toContain('res.status(400).json({\n          error:');
    // Read-only: it must not write, or "preview" would be a lie.
    expect(previewHandler).not.toContain('prisma.$transaction(');
    expect(previewHandler).not.toContain('prisma.amendmentLog.create(');
    expect(previewHandler).not.toContain('prisma.submission.update(');
  });

  it('has no skip path left — an absent acknowledgment set is rejected, not bypassed', () => {
    // The required-flip. Before it, the draft route read
    // `if (acknowledgedChanges !== null) { ...enforce... }` — absence skipped the
    // gate entirely so the backend could ship ahead of the wizard. The wizard now
    // always sends the field, so that condition must be gone: its survival would
    // mean any caller can opt out of the gate by omitting one key.
    const draftHandler = sliceBetween(
      ROUTE_SOURCE,
      "router.post('/:id/amendments'",
      'AMENDMENTS ROUTER',
    );

    expect(draftHandler).toContain('acknowledgedChanges === null');
    expect(draftHandler).toContain('acknowledgedChanges is required');
    // The old permissive guard, in either spelling.
    expect(draftHandler).not.toContain('acknowledgedChanges !== null');
  });

  it('requires reasonCode while leaving the free note optional', () => {
    // The requiredness swapped between the two: the checkable closed vocabulary
    // became mandatory, the unverifiable free text became optional. A revival of
    // the old `!body.reason` guard would block every amendment whose reason is
    // not OTHER, since the wizard leaves the note blank for those.
    const draftHandler = sliceBetween(
      ROUTE_SOURCE,
      "router.post('/:id/amendments'",
      'AMENDMENTS ROUTER',
    );

    expect(draftHandler).toContain('!isAmendmentReasonCode(body.reasonCode)');
    expect(draftHandler).toContain('reasonCode is required');
    expect(draftHandler).not.toContain("error: 'Amendment reason is required'");
  });

  it('rejects before anything is written — no recompute, no transaction', () => {
    const draftHandler = sliceBetween(
      ROUTE_SOURCE,
      "router.post('/:id/amendments'",
      'AMENDMENTS ROUTER',
    );

    const gateIndex = draftHandler.indexOf('computeAmendmentChanges(');
    const recomputeIndex = draftHandler.indexOf('await resolveVerdict(');
    const transactionIndex = draftHandler.indexOf('prisma.$transaction(');

    expect(recomputeIndex).toBeGreaterThan(gateIndex);
    expect(transactionIndex).toBeGreaterThan(gateIndex);
  });
});
