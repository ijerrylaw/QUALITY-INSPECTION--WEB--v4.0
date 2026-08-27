/**
 * @file pinUsers.routes.ts
 * @description Self-managed PIN administration for floor staff who don't have
 * company email/Microsoft accounts (AUDIT_REPORT.md §11).
 *
 * Endpoints:
 *
 *  GET    /api/pin-users              List all PIN users (active + inactive).
 *  POST   /api/pin-users              Create a new PIN user.
 *  PATCH  /api/pin-users/:id/deactivate  Deactivate a PIN user.
 *  PATCH  /api/pin-users/:id/reset-pin   Issue a new temp PIN, sets
 *        `mustChangePin: true` — the ADMIN/MANAGER-facing counterpart to a
 *        worker's own POST /api/auth/pin-change below. Used when a worker
 *        forgets their PIN and requests a reset in person; no self-service
 *        reset trigger exists in-app by design.
 *  DELETE /api/pin-users/:id          Hard-delete a PIN user — only allowed when
 *        the user has zero Submission/AmendmentLog history (409 otherwise,
 *        pointing the caller at Deactivate instead).
 *
 *  All five above require Group A or B (requireGroup('A', 'B')) — matches
 *  Jerry's rule that department managers (Group B) typically manage their own
 *  staff; Group C (including Supervisors) cannot reach this screen at all.
 *
 * Also exports:
 *  - pinAuthRouter (mounted at /api/auth):
 *      - GET  /pin-directory  ungated, pre-authentication account picker for
 *        the kiosk login screen (LoginPage.tsx) — identity-first login now
 *        requires the worker to select their own account before entering a
 *        PIN, rather than a PIN alone resolving identity via a scan-all
 *        match. Deliberately NOT `toPublicPinUser()`/the Group A/B roster
 *        shape — explicitly `select`-scoped to `{ id, name, employeeId }`
 *        only, since this is reachable with no auth at all.
 *      - POST /pin-login   deliberately ungated since it IS the login step.
 *        Identity-scoped: takes `{ userId, pin }` (the account chosen via
 *        /pin-directory) and verifies `pin` against ONLY that one active
 *        row's hash — no more scan-all-active-rows matching. This is *why*
 *        PIN uniqueness across staff no longer matters (see `active` field's
 *        doc comment on `PinUser`, schema.prisma) — two workers sharing a
 *        PIN is unambiguous once identity is chosen first, so this route
 *        (and every PIN-setting route below) neither checks nor reports PIN
 *        collisions.
 *      - POST /pin-change  self-service PIN change (Staff PIN Access task,
 *        AUDIT_REPORT.md; also what the forced first-login `SetPinPage`
 *        reuses). Takes `{ userId, currentPin, newPin }` — identity-scoped
 *        the same way `/pin-login` now is (verifies `currentPin` against
 *        only the named user's own row), rather than a scan-all match on
 *        `currentPin` alone. That scan-all approach predates this file's
 *        identity-first redesign and, left as-is, would have become a real
 *        ambiguity/misattribution risk the moment PIN uniqueness was
 *        dropped (two active users could share a `currentPin`, and a bare
 *        scan has no way to know which one is actually mid-login). Clears
 *        `mustChangePin` on success. Available to any PIN-logged-in user,
 *        not just Group A/B.
 *
 * pinHash/pinSalt are never included in any response.
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prismaClient';
import { requireGroup } from '../middleware/auth';
import { hashPin, verifyPin, isValidSixDigitPin } from '../lib/pin';
import { logAccess } from '../lib/accessLog';

/// True if `err` is a Prisma unique-constraint violation (code P2002) on the
/// given column — mirrors submissions.routes.ts's isUniqueConstraintViolation,
/// translating a race-condition collision (the pre-update/pre-insert findFirst
/// check below is not atomic) into the same clean, specific error response.
function isUniqueConstraintViolation(err: unknown, field: string): boolean {
  return (
    typeof err === 'object' && err !== null &&
    'code' in err && (err as { code?: unknown }).code === 'P2002' &&
    Array.isArray((err as { meta?: { target?: unknown } }).meta?.target) &&
    ((err as { meta?: { target?: unknown[] } }).meta?.target ?? []).includes(field)
  );
}

const PIN_ELIGIBLE_ROLES = ['OPERATOR', 'LEADER', 'SUPERVISOR', 'INTERN'] as const;
type PinEligibleRole = (typeof PIN_ELIGIBLE_ROLES)[number];

function isPinEligibleRole(value: unknown): value is PinEligibleRole {
  return typeof value === 'string' && (PIN_ELIGIBLE_ROLES as readonly string[]).includes(value);
}

function toPublicPinUser(u: { id: string; name: string; employeeId: string; jobTitle: string; role: string; active: boolean; mustChangePin: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: u.id,
    name: u.name,
    employeeId: u.employeeId,
    jobTitle: u.jobTitle,
    role: u.role,
    active: u.active,
    mustChangePin: u.mustChangePin,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// ── /api/pin-users (Group A/B only) ─────────────────────────────────────────
export const pinUsersRouter = Router();

// GET /api/pin-users
pinUsersRouter.get('/', requireGroup('A', 'B'), async (_req: Request, res: Response) => {
  try {
    const users = await prisma.pinUser.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ pinUsers: users.map(toPublicPinUser) });
  } catch (error) {
    console.error('[GET /api/pin-users] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve PIN users' });
  }
});

// POST /api/pin-users
pinUsersRouter.post('/', requireGroup('A', 'B'), async (req: Request, res: Response) => {
  try {
    const body = req.body as { name?: string; employeeId?: string; jobTitle?: string; role?: string; pin?: string };
    const name = (body.name ?? '').trim();
    const employeeId = (body.employeeId ?? '').trim().toUpperCase();
    const jobTitle = (body.jobTitle ?? '').trim();

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!employeeId) {
      res.status(400).json({ error: 'employeeId is required' });
      return;
    }
    if (!jobTitle) {
      res.status(400).json({ error: 'jobTitle is required' });
      return;
    }
    if (!isPinEligibleRole(body.role)) {
      res.status(400).json({ error: `role must be one of: ${PIN_ELIGIBLE_ROLES.join(', ')}` });
      return;
    }
    if (!isValidSixDigitPin(body.pin)) {
      res.status(400).json({ error: 'pin must be exactly 6 digits' });
      return;
    }

    // employeeId uniqueness — pre-check for a friendly error; the DB's own
    // @unique constraint (schema.prisma) is the atomic backstop against a
    // race between this check and the insert below. employeeId is a
    // permanent real-world identity key, checked across ALL rows, not just
    // active ones. PIN itself is deliberately NOT checked for uniqueness —
    // see the file header's POST /pin-login doc comment for why a shared
    // PIN across staff is harmless (and reporting a collision would leak
    // "a valid PIN exists somewhere" pre-selection-of-identity).
    const existingEmployeeId = await prisma.pinUser.findFirst({ where: { employeeId } });
    if (existingEmployeeId) {
      res.status(409).json({ error: 'This Employee ID is already in use.' });
      return;
    }

    const { pinHash, pinSalt } = hashPin(body.pin as string);
    let created;
    try {
      created = await prisma.pinUser.create({
        data: { name, employeeId, jobTitle, role: body.role, pinHash, pinSalt },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err, 'employeeId')) {
        res.status(409).json({ error: 'This Employee ID is already in use.' });
        return;
      }
      throw err;
    }

    res.status(201).json(toPublicPinUser(created));
  } catch (error) {
    console.error('[POST /api/pin-users] Error:', error);
    res.status(500).json({ error: 'Failed to create PIN user' });
  }
});

// PATCH /api/pin-users/:id/deactivate
pinUsersRouter.patch('/:id/deactivate', requireGroup('A', 'B'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const existing = await prisma.pinUser.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'PIN user not found' });
      return;
    }

    const updated = await prisma.pinUser.update({
      where: { id },
      data: { active: false },
    });

    res.json(toPublicPinUser(updated));
  } catch (error) {
    console.error('[PATCH /api/pin-users/:id/deactivate] Error:', error);
    res.status(500).json({ error: 'Failed to deactivate PIN user' });
  }
});

// PATCH /api/pin-users/:id/reset-pin — ADMIN/MANAGER-issued temp PIN. Worker
// requests a reset in person (no self-service reset trigger exists in-app,
// by design — only Group A/B can issue a new temp PIN); this replaces
// pinHash/pinSalt with the admin-entered PIN and sets mustChangePin: true,
// so the worker is forced through SetPinPage.tsx on their next login before
// this temp PIN can become their actual working PIN. No uniqueness check —
// see the file header's POST /pin-login doc comment.
pinUsersRouter.patch('/:id/reset-pin', requireGroup('A', 'B'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const body = req.body as { pin?: string };

    if (!isValidSixDigitPin(body.pin)) {
      res.status(400).json({ error: 'pin must be exactly 6 digits' });
      return;
    }

    const existing = await prisma.pinUser.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'PIN user not found' });
      return;
    }

    const { pinHash, pinSalt } = hashPin(body.pin as string);
    const updated = await prisma.pinUser.update({
      where: { id },
      data: { pinHash, pinSalt, mustChangePin: true },
    });

    res.json(toPublicPinUser(updated));
  } catch (error) {
    console.error('[PATCH /api/pin-users/:id/reset-pin] Error:', error);
    res.status(500).json({ error: 'Failed to reset PIN' });
  }
});

// PATCH /api/pin-users/:id — SCOPED to employeeId only. This is a deliberate,
// narrow exception to PinUser's otherwise deliberate no-edit rule
// (NAVIGATION_AND_RBAC.md) — name/jobTitle/role remain uneditable. A request
// body containing any of those is rejected outright rather than silently
// ignored, so callers never assume this endpoint does more than it does.
pinUsersRouter.patch('/:id', requireGroup('A', 'B'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const body = req.body as Record<string, unknown>;

    const disallowedKeys = ['name', 'jobTitle', 'role'].filter((k) => k in body);
    if (disallowedKeys.length > 0) {
      res.status(400).json({ error: `This endpoint only supports editing employeeId. Remove: ${disallowedKeys.join(', ')}` });
      return;
    }

    const employeeId = typeof body['employeeId'] === 'string' ? body['employeeId'].trim().toUpperCase() : '';
    if (!employeeId) {
      res.status(400).json({ error: 'employeeId is required' });
      return;
    }

    const existing = await prisma.pinUser.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'PIN user not found' });
      return;
    }

    // Uniqueness pre-check, excluding this row's own current value.
    const collision = await prisma.pinUser.findFirst({ where: { employeeId, id: { not: id } } });
    if (collision) {
      res.status(409).json({ error: 'This Employee ID is already in use.' });
      return;
    }

    let updated;
    try {
      updated = await prisma.pinUser.update({ where: { id }, data: { employeeId } });
    } catch (err) {
      if (isUniqueConstraintViolation(err, 'employeeId')) {
        res.status(409).json({ error: 'This Employee ID is already in use.' });
        return;
      }
      throw err;
    }

    res.json(toPublicPinUser(updated));
  } catch (error) {
    console.error('[PATCH /api/pin-users/:id] Error:', error);
    res.status(500).json({ error: 'Failed to update PIN user' });
  }
});

// DELETE /api/pin-users/:id — hard delete, gated on zero submission/amendment
// history. History-bearing users must go through /:id/deactivate instead
// (see PinUser model doc in schema.prisma — deactivate-only preserves audit
// trail attribution).
pinUsersRouter.delete('/:id', requireGroup('A', 'B'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const existing = await prisma.pinUser.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'PIN user not found' });
      return;
    }

    const [submissionCount, requestedCount, reviewedCount] = await Promise.all([
      prisma.submission.count({ where: { pinUserId: id } }),
      prisma.amendmentLog.count({ where: { requestedByPinUserId: id } }),
      prisma.amendmentLog.count({ where: { reviewedByPinUserId: id } }),
    ]);

    if (submissionCount > 0 || requestedCount > 0 || reviewedCount > 0) {
      res.status(409).json({ error: 'This user has submission history — use Deactivate instead.' });
      return;
    }

    await prisma.pinUser.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/pin-users/:id] Error:', error);
    res.status(500).json({ error: 'Failed to delete PIN user' });
  }
});

// ── /api/auth (public — this IS the login step) ─────────────────────────────
export const pinAuthRouter = Router();

// GET /api/auth/pin-directory — ungated, pre-authentication account picker
// for the kiosk login screen's identity-first redesign (LoginPage.tsx). Only
// name + employeeId, active accounts only — explicitly `select`-scoped
// (never toPublicPinUser(), which is a superset) so pinHash/pinSalt/
// jobTitle/role can never leak here even by future accident.
// Sorted by employeeId (not name) to match the kiosk picker's ID-first
// display order — this orderBy is the single source of truth for directory
// ordering; LoginPage.tsx filters this array but never re-sorts it.
pinAuthRouter.get('/pin-directory', async (_req: Request, res: Response) => {
  try {
    const pinUsers = await prisma.pinUser.findMany({
      where: { active: true },
      orderBy: { employeeId: 'asc' },
      select: { id: true, name: true, employeeId: true },
    });
    res.json({ pinUsers });
  } catch (error) {
    console.error('[GET /api/auth/pin-directory] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve PIN directory' });
  }
});

// POST /api/auth/pin-login — identity-first: the client selects an account
// via GET /pin-directory first, then submits { userId, pin }. Verified
// against ONLY that one active row's hash — no more scan-all-active-rows
// matching (see file header). `active: true` is part of the lookup itself
// (not a post-hoc check) so a deactivated account can't log in even with a
// correct old PIN.
pinAuthRouter.post('/pin-login', async (req: Request, res: Response) => {
  try {
    const body = req.body as { userId?: string; pin?: string };
    const userId = typeof body.userId === 'string' ? body.userId : '';

    if (!userId || !isValidSixDigitPin(body.pin)) {
      await logAccess(req, { userId: userId || null, role: null, userDisplayName: null, action: 'PIN_LOGIN_FAILURE' });
      res.status(401).json({ error: 'Invalid PIN' });
      return;
    }

    const match = await prisma.pinUser.findFirst({ where: { id: userId, active: true } });
    if (!match || !verifyPin(body.pin as string, match.pinHash, match.pinSalt)) {
      await logAccess(req, { userId, role: match?.role ?? null, userDisplayName: match?.name ?? null, action: 'PIN_LOGIN_FAILURE' });
      res.status(401).json({ error: 'Invalid PIN' });
      return;
    }

    await logAccess(req, { userId: match.id, role: match.role, userDisplayName: match.name, action: 'PIN_LOGIN_SUCCESS' });

    res.json({
      id: match.id,
      name: match.name,
      jobTitle: match.jobTitle,
      role: match.role,
      mustChangePin: match.mustChangePin,
    });
  } catch (error) {
    console.error('[POST /api/auth/pin-login] Error:', error);
    res.status(500).json({ error: 'Failed to process PIN login' });
  }
});

// POST /api/auth/pin-change — self-service PIN change (also what the forced
// first-login SetPinPage reuses). Identity-scoped the same way /pin-login
// now is: { userId, currentPin, newPin }, verified against only the named
// user's own row. Deliberately NOT a scan-all-active-rows match on
// currentPin alone anymore — that predates this file's identity-first
// redesign, and since PIN uniqueness is no longer enforced (see file
// header), a bare scan could no longer reliably tell which of several
// same-PIN active users is actually mid-change. Both callers already know
// their own userId (the just-completed login response, or the already-
// authenticated session), so this is no less "self-service" than before —
// currentPin is still the real proof-of-identity factor, just checked
// against the right row instead of all of them. No uniqueness check on
// newPin — see file header. Clears mustChangePin on success.
pinAuthRouter.post('/pin-change', async (req: Request, res: Response) => {
  try {
    const body = req.body as { userId?: string; currentPin?: string; newPin?: string };
    const userId = typeof body.userId === 'string' ? body.userId : '';

    if (!userId || !isValidSixDigitPin(body.currentPin)) {
      res.status(401).json({ error: 'Current PIN is incorrect.' });
      return;
    }
    if (!isValidSixDigitPin(body.newPin)) {
      res.status(400).json({ error: 'New PIN must be exactly 6 digits.' });
      return;
    }

    const self = await prisma.pinUser.findFirst({ where: { id: userId, active: true } });
    if (!self || !verifyPin(body.currentPin as string, self.pinHash, self.pinSalt)) {
      res.status(401).json({ error: 'Current PIN is incorrect.' });
      return;
    }

    const { pinHash, pinSalt } = hashPin(body.newPin as string);
    const updated = await prisma.pinUser.update({
      where: { id: self.id },
      data: { pinHash, pinSalt, mustChangePin: false },
    });

    res.json(toPublicPinUser(updated));
  } catch (error) {
    console.error('[POST /api/auth/pin-change] Error:', error);
    res.status(500).json({ error: 'Failed to change PIN' });
  }
});
