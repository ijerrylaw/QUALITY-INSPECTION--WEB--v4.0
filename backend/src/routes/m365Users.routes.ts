/**
 * @file m365Users.routes.ts
 * @description Real MSAL/Entra ID SSO role assignment (NAVIGATION_AND_RBAC.md §3.1).
 *
 * The granted Entra security group covers Group A+B (ADMIN/EXECUTIVE/MANAGER)
 * as a single group — nothing in Entra itself distinguishes which of the
 * three roles a given member should get, and the granted Graph permissions
 * (openid, profile, email, User.Read) don't include group-membership-detail
 * scopes. This file owns the resulting aadObjectId -> role mapping, mirroring
 * the PinUser pattern but for SSO users (who have no PinUser row).
 *
 * Endpoints:
 *
 *  GET   /api/m365-users        List all M365 role mappings (pending first).
 *  PATCH /api/m365-users/:id    Assign a role (ADMIN/EXECUTIVE/MANAGER).
 *
 *  Both above require Group A only (requireGroup('A')) — role assignment can
 *  grant System Admin, so it's gated tighter than PIN admin (Group A/B) to
 *  avoid a Manager self-escalating.
 *
 * Also exports:
 *  - m365AuthRouter (mounted at /api/auth):
 *      - POST /m365-login   deliberately ungated, same trust model as
 *        /api/auth/pin-login: by the time this is called, MSAL has already
 *        completed a real Entra login popup. Upserts the caller's row —
 *        auto-provisions with role: null on first-ever login (pending,
 *        no access yet) rather than rejecting, so an admin can see and
 *        assign them via GET/PATCH /api/m365-users above.
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prismaClient';
import { requireGroup } from '../middleware/auth';

const M365_ELIGIBLE_ROLES = ['ADMIN', 'EXECUTIVE', 'MANAGER'] as const;
type M365EligibleRole = (typeof M365_ELIGIBLE_ROLES)[number];

function isM365EligibleRole(value: unknown): value is M365EligibleRole {
  return typeof value === 'string' && (M365_ELIGIBLE_ROLES as readonly string[]).includes(value);
}

function toPublicM365User(u: {
  id: string;
  aadObjectId: string;
  userPrincipalName: string;
  displayName: string;
  role: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: u.id,
    aadObjectId: u.aadObjectId,
    userPrincipalName: u.userPrincipalName,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// ── /api/m365-users (Group A only) ──────────────────────────────────────────
export const m365UsersRouter = Router();

// GET /api/m365-users — pending (role: null) rows first, so an admin sees
// who's waiting for assignment immediately.
m365UsersRouter.get('/', requireGroup('A'), async (_req: Request, res: Response) => {
  try {
    const users = await prisma.m365UserRole.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
    });
    const pending = users.filter((u) => u.role === null);
    const assigned = users.filter((u) => u.role !== null);
    res.json({ m365Users: [...pending, ...assigned].map(toPublicM365User) });
  } catch (error) {
    console.error('[GET /api/m365-users] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve M365 users' });
  }
});

// PATCH /api/m365-users/:id
m365UsersRouter.patch('/:id', requireGroup('A'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const body = req.body as { role?: string };

    if (!isM365EligibleRole(body.role)) {
      res.status(400).json({ error: `role must be one of: ${M365_ELIGIBLE_ROLES.join(', ')}` });
      return;
    }

    const existing = await prisma.m365UserRole.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'M365 user not found' });
      return;
    }

    const updated = await prisma.m365UserRole.update({
      where: { id },
      data: { role: body.role },
    });

    res.json(toPublicM365User(updated));
  } catch (error) {
    console.error('[PATCH /api/m365-users/:id] Error:', error);
    res.status(500).json({ error: 'Failed to update M365 user role' });
  }
});

// ── /api/auth (public — this IS the post-MSAL-login step) ──────────────────
export const m365AuthRouter = Router();

// POST /api/auth/m365-login — called immediately after a real MSAL popup
// login succeeds. Upserts the role-mapping row by aadObjectId (creating it
// with role: null on first sight) and returns the currently assigned role,
// if any.
m365AuthRouter.post('/m365-login', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      aadObjectId?: string;
      userPrincipalName?: string;
      displayName?: string;
    };

    const aadObjectId = (body.aadObjectId ?? '').trim();
    const userPrincipalName = (body.userPrincipalName ?? '').trim();
    const displayName = (body.displayName ?? '').trim();

    if (!aadObjectId || !userPrincipalName || !displayName) {
      res.status(400).json({ error: 'aadObjectId, userPrincipalName, and displayName are required' });
      return;
    }

    const record = await prisma.m365UserRole.upsert({
      where: { aadObjectId },
      update: { userPrincipalName, displayName },
      create: { aadObjectId, userPrincipalName, displayName, role: null },
    });

    res.json({ role: record.role });
  } catch (error) {
    console.error('[POST /api/auth/m365-login] Error:', error);
    res.status(500).json({ error: 'Failed to process M365 login' });
  }
});
