/**
 * @file pinUsers.routes.ts
 * @description Self-managed PIN administration for floor staff who don't have
 * company email/Microsoft accounts (AUDIT_REPORT.md §11).
 *
 * Endpoints:
 *
 *  GET    /api/pin-users              List all PIN users (active + inactive).
 *  POST   /api/pin-users              Create a new PIN user.
 *  PATCH  /api/pin-users/:id/deactivate  Deactivate a PIN user (frees the PIN for reuse).
 *  DELETE /api/pin-users/:id          Hard-delete a PIN user — only allowed when
 *        the user has zero Submission/AmendmentLog history (409 otherwise,
 *        pointing the caller at Deactivate instead).
 *
 *  All four above require Group A or B (requireGroup('A', 'B')) — matches
 *  Jerry's rule that department managers (Group B) typically manage their own
 *  staff; Group C (including Supervisors) cannot reach this screen at all.
 *
 * Also exports:
 *  - pinAuthRouter (mounted at /api/auth):
 *      - POST /pin-login   deliberately ungated since it IS the login step;
 *        no role exists yet to check.
 *      - POST /pin-change  self-service PIN change (Staff PIN Access task,
 *        AUDIT_REPORT.md). Also ungated — identity is established by
 *        verifying `currentPin` against every active row (same scan
 *        `/pin-login` already does), never by trusting a client-passed
 *        userId. Available to any PIN-logged-in user, not just Group A/B.
 *
 * pinHash/pinSalt are never included in any response.
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prismaClient';
import { requireGroup } from '../middleware/auth';
import { hashPin, verifyPin, isValidSixDigitPin } from '../lib/pin';

const PIN_ELIGIBLE_ROLES = ['OPERATOR', 'LEADER', 'SUPERVISOR'] as const;
type PinEligibleRole = (typeof PIN_ELIGIBLE_ROLES)[number];

function isPinEligibleRole(value: unknown): value is PinEligibleRole {
  return typeof value === 'string' && (PIN_ELIGIBLE_ROLES as readonly string[]).includes(value);
}

function toPublicPinUser(u: { id: string; name: string; jobTitle: string; role: string; active: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: u.id,
    name: u.name,
    jobTitle: u.jobTitle,
    role: u.role,
    active: u.active,
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
    const body = req.body as { name?: string; jobTitle?: string; role?: string; pin?: string };
    const name = (body.name ?? '').trim();
    const jobTitle = (body.jobTitle ?? '').trim();

    if (!name) {
      res.status(400).json({ error: 'name is required' });
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

    // PIN uniqueness is only enforced among active rows — deactivating a
    // person frees their PIN for reuse.
    const activeUsers = await prisma.pinUser.findMany({ where: { active: true } });
    const collision = activeUsers.some((u) => verifyPin(body.pin as string, u.pinHash, u.pinSalt));
    if (collision) {
      res.status(409).json({ error: 'This PIN is already in use by an active user.' });
      return;
    }

    const { pinHash, pinSalt } = hashPin(body.pin as string);
    const created = await prisma.pinUser.create({
      data: { name, jobTitle, role: body.role, pinHash, pinSalt },
    });

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

// POST /api/auth/pin-login
pinAuthRouter.post('/pin-login', async (req: Request, res: Response) => {
  try {
    const body = req.body as { pin?: string };
    if (!isValidSixDigitPin(body.pin)) {
      res.status(401).json({ error: 'Invalid PIN' });
      return;
    }

    const activeUsers = await prisma.pinUser.findMany({ where: { active: true } });
    const match = activeUsers.find((u) => verifyPin(body.pin as string, u.pinHash, u.pinSalt));

    if (!match) {
      res.status(401).json({ error: 'Invalid PIN' });
      return;
    }

    res.json({ id: match.id, name: match.name, jobTitle: match.jobTitle, role: match.role });
  } catch (error) {
    console.error('[POST /api/auth/pin-login] Error:', error);
    res.status(500).json({ error: 'Failed to process PIN login' });
  }
});

// POST /api/auth/pin-change — self-service PIN change, ungated. Identity is
// established purely by finding which active PinUser's pinHash the submitted
// currentPin verifies against (same scan pin-login already does) — no userId
// is ever accepted from the client.
pinAuthRouter.post('/pin-change', async (req: Request, res: Response) => {
  try {
    const body = req.body as { currentPin?: string; newPin?: string };

    if (!isValidSixDigitPin(body.currentPin)) {
      res.status(401).json({ error: 'Current PIN is incorrect.' });
      return;
    }
    if (!isValidSixDigitPin(body.newPin)) {
      res.status(400).json({ error: 'New PIN must be exactly 6 digits.' });
      return;
    }

    const activeUsers = await prisma.pinUser.findMany({ where: { active: true } });
    const self = activeUsers.find((u) => verifyPin(body.currentPin as string, u.pinHash, u.pinSalt));
    if (!self) {
      res.status(401).json({ error: 'Current PIN is incorrect.' });
      return;
    }

    // Uniqueness among active rows, excluding the resolved user's own row —
    // same rule POST /api/pin-users enforces at creation time.
    const collision = activeUsers.some(
      (u) => u.id !== self.id && verifyPin(body.newPin as string, u.pinHash, u.pinSalt)
    );
    if (collision) {
      res.status(409).json({ error: 'This PIN is already in use by an active user.' });
      return;
    }

    const { pinHash, pinSalt } = hashPin(body.newPin as string);
    const updated = await prisma.pinUser.update({
      where: { id: self.id },
      data: { pinHash, pinSalt },
    });

    res.json(toPublicPinUser(updated));
  } catch (error) {
    console.error('[POST /api/auth/pin-change] Error:', error);
    res.status(500).json({ error: 'Failed to change PIN' });
  }
});
