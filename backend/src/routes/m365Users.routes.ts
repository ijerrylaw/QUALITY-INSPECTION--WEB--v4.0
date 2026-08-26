/**
 * @file m365Users.routes.ts
 * @description Real MSAL/Entra ID SSO role assignment (NAVIGATION_AND_RBAC.md §3.1).
 *
 * The granted Entra security group previously covered only Group A/B
 * (ADMIN/MANAGER) staff — nothing in Entra itself distinguishes which role a
 * given member should get, and the granted Graph permissions (openid,
 * profile, email, User.Read) don't include group-membership-detail scopes.
 * This file owns the resulting aadObjectId -> role mapping, mirroring the
 * PinUser pattern but for SSO users (who have no PinUser row).
 *
 * SUPERVISOR is now also M365-eligible (app-level: this file's
 * M365_ELIGIBLE_ROLES). NOTE: this only controls what role an admin can
 * *assign* once someone reaches this app's login screen — if the Entra-side
 * security group gating who can complete the MSAL popup at all is still
 * scoped to Group A/B only, a newly-invited Supervisor won't be able to log
 * in until that Entra group membership is updated too (an IT-side step,
 * outside this codebase).
 *
 * EXECUTIVE was merged into MANAGER (zero behavioral differences, zero
 * existing rows) — LEADER stays PIN-only, deliberately never added here.
 *
 * State model — see schema.prisma's M365UserRole doc comment for the full
 * (aadObjectId, role, isActive) truth table.
 *
 * Endpoints:
 *
 *  GET    /api/m365-users                    List all M365 role mappings.
 *  POST   /api/m365-users/invite              Pre-register a future admin/manager/supervisor by email.
 *  PATCH  /api/m365-users/:id                 Assign/change a role.
 *  PATCH  /api/m365-users/:id/deactivate      Revoke access (or an unclaimed invite).
 *  PATCH  /api/m365-users/:id/reactivate      Restore access.
 *  DELETE /api/m365-users/:id                 Hard-delete.
 *
 *  All five above require Group A only (requireGroup('A')) — role assignment
 *  and offboarding can grant/remove System Admin, so it's gated tighter than
 *  PIN admin (Group A/B) to avoid a Manager self-escalating.
 *
 *  No delete-safety history check (unlike PinUser's DELETE): traced via
 *  backend/src/lib/identity.ts — Submission/AmendmentLog store a frozen
 *  displayName/userPrincipalName snapshot at write time for SSO rows, never
 *  a live FK/join back to M365UserRole. Deleting a row here has zero effect
 *  on any existing inspection/amendment record or its display.
 *
 *  Last-active-ADMIN lockout guards three actions (PATCH away from ADMIN,
 *  deactivate, delete) — see requireNotLastActiveAdmin() below. The count
 *  only ever includes OTHER active ADMIN rows, so acting on a target that is
 *  itself already inactive (or not currently ADMIN) never falsely trips it.
 *
 * Also exports:
 *  - m365AuthRouter (mounted at /api/auth):
 *      - POST /m365-login            deliberately ungated, same trust model
 *        as /api/auth/pin-login: by the time this is called, MSAL has
 *        already completed a real Entra login popup. Full branching logic
 *        below (returning/invited/revoked/bootstrap-eligible/pending).
 *      - POST /claim-bootstrap-admin  deliberately ungated (there is no
 *        admin yet to gate against on a fresh install) — race-safe via a
 *        fixed sentinel row id, see BOOTSTRAP_ADMIN_ROW_ID below.
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prismaClient';
import { requireGroup } from '../middleware/auth';
import { logAccess } from '../lib/accessLog';

const M365_ELIGIBLE_ROLES = ['ADMIN', 'MANAGER', 'SUPERVISOR'] as const;
type M365EligibleRole = (typeof M365_ELIGIBLE_ROLES)[number];

function isM365EligibleRole(value: unknown): value is M365EligibleRole {
  return typeof value === 'string' && (M365_ELIGIBLE_ROLES as readonly string[]).includes(value);
}

function toPublicM365User(u: {
  id: string;
  aadObjectId: string | null;
  userPrincipalName: string;
  displayName: string;
  jobTitle: string | null;
  role: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: u.id,
    aadObjectId: u.aadObjectId,
    userPrincipalName: u.userPrincipalName,
    displayName: u.displayName,
    jobTitle: u.jobTitle,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/**
 * True Prisma error shape check for a unique-constraint violation (P2002),
 * without importing @prisma/client's error classes (this project's Prisma
 * client is generated to a project-relative path, see prismaClient.ts).
 */
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/**
 * Guards the three actions that can strip the system's last active admin:
 * PATCH away from ADMIN, deactivate, and delete. Only blocks when the
 * TARGET itself is currently role='ADMIN' AND isActive=true — acting on a
 * target that's already inactive, or not currently ADMIN, is never blocked
 * by this (there is no "last active admin" to protect in that case).
 * Counts every OTHER active ADMIN row, excluding the target by id.
 */
async function requireNotLastActiveAdmin(target: { id: string; role: string | null; isActive: boolean }): Promise<boolean> {
  if (target.role !== 'ADMIN' || !target.isActive) return true; // not currently a protected admin — action allowed
  const otherActiveAdmins = await prisma.m365UserRole.count({
    where: { role: 'ADMIN', isActive: true, NOT: { id: target.id } },
  });
  return otherActiveAdmins > 0;
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

// POST /api/m365-users/invite — pre-register a future admin/manager/
// supervisor by email, before they've ever logged in. Claimed automatically
// on their first real MSAL login (see m365AuthRouter's /m365-login branch c
// below).
m365UsersRouter.post('/invite', requireGroup('A'), async (req: Request, res: Response) => {
  try {
    const body = req.body as { userPrincipalName?: string; displayName?: string; role?: string };
    const userPrincipalName = (body.userPrincipalName ?? '').trim();
    const displayName = (body.displayName ?? '').trim() || userPrincipalName;

    if (!userPrincipalName) {
      res.status(400).json({ error: 'userPrincipalName is required' });
      return;
    }
    if (!isM365EligibleRole(body.role)) {
      res.status(400).json({ error: `role must be one of: ${M365_ELIGIBLE_ROLES.join(', ')}` });
      return;
    }

    const existing = await prisma.m365UserRole.findUnique({ where: { userPrincipalName } });
    if (existing) {
      res.status(409).json({
        error: existing.aadObjectId
          ? 'This person already has an M365 access row (claimed).'
          : 'This person has already been invited.',
      });
      return;
    }

    const created = await prisma.m365UserRole.create({
      data: { aadObjectId: null, userPrincipalName, displayName, role: body.role, isActive: true },
    });

    res.status(201).json(toPublicM365User(created));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'This person has already been invited or has an access row.' });
      return;
    }
    console.error('[POST /api/m365-users/invite] Error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
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

    if (existing.role === 'ADMIN' && body.role !== 'ADMIN') {
      const allowed = await requireNotLastActiveAdmin(existing);
      if (!allowed) {
        res.status(409).json({ error: 'Cannot demote the last administrator — promote another user to ADMIN first.' });
        return;
      }
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

// PATCH /api/m365-users/:id/deactivate — also the mechanism for revoking an
// invite that hasn't been claimed yet (aadObjectId still null): the row's
// isActive flips to false either way, and login-claim logic (branch c) skips
// an inactive invited row rather than letting it be silently claimed.
m365UsersRouter.patch('/:id/deactivate', requireGroup('A'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const existing = await prisma.m365UserRole.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'M365 user not found' });
      return;
    }

    const allowed = await requireNotLastActiveAdmin(existing);
    if (!allowed) {
      res.status(409).json({ error: 'Cannot deactivate the last administrator — promote another user to ADMIN first.' });
      return;
    }

    const updated = await prisma.m365UserRole.update({
      where: { id },
      data: { isActive: false },
    });

    res.json(toPublicM365User(updated));
  } catch (error) {
    console.error('[PATCH /api/m365-users/:id/deactivate] Error:', error);
    res.status(500).json({ error: 'Failed to deactivate M365 user' });
  }
});

// PATCH /api/m365-users/:id/reactivate — no PinUser equivalent exists (PIN's
// own admin screen deliberately has no reactivate, per NAVIGATION_AND_RBAC.md
// §3.2's documented scope choice); added for M365 users per this feature's
// own design.
m365UsersRouter.patch('/:id/reactivate', requireGroup('A'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const existing = await prisma.m365UserRole.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'M365 user not found' });
      return;
    }

    const updated = await prisma.m365UserRole.update({
      where: { id },
      data: { isActive: true },
    });

    res.json(toPublicM365User(updated));
  } catch (error) {
    console.error('[PATCH /api/m365-users/:id/reactivate] Error:', error);
    res.status(500).json({ error: 'Failed to reactivate M365 user' });
  }
});

// DELETE /api/m365-users/:id — hard delete. No history-safety check (unlike
// PinUser's DELETE) — confirmed via backend/src/lib/identity.ts that no
// Submission/AmendmentLog data references M365UserRole live; SSO identity is
// a frozen snapshot on those rows, not a join. Last-active-admin lockout
// still applies.
m365UsersRouter.delete('/:id', requireGroup('A'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const existing = await prisma.m365UserRole.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'M365 user not found' });
      return;
    }

    const allowed = await requireNotLastActiveAdmin(existing);
    if (!allowed) {
      res.status(409).json({ error: 'Cannot delete the last administrator — promote another user to ADMIN first.' });
      return;
    }

    await prisma.m365UserRole.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/m365-users/:id] Error:', error);
    res.status(500).json({ error: 'Failed to delete M365 user' });
  }
});

// ── /api/auth (public — this IS the post-MSAL-login step) ──────────────────
export const m365AuthRouter = Router();

/**
 * Fixed, well-known row id for the one-time bootstrap admin. Using a literal
 * id (instead of the default cuid()) makes the CREATE step in
 * /claim-bootstrap-admin race-safe purely via the primary key's uniqueness
 * constraint — enforced atomically by SQLite at INSERT time regardless of
 * transaction isolation-level subtleties. Two concurrent claims can both
 * observe "table is empty" before either writes, but only one INSERT with
 * this id can ever succeed; the loser gets a P2002 it can be reliably
 * caught and reported as "already claimed," not a generic 500 or a silent
 * duplicate admin.
 */
const BOOTSTRAP_ADMIN_ROW_ID = 'm365_bootstrap_admin';

// POST /api/auth/m365-login — called immediately after a real MSAL popup
// login succeeds. Branches on the signed-in person's aadObjectId/UPN:
//
//   a. Known aadObjectId, isActive true  → normal return, unchanged behavior.
//   b. Known aadObjectId, isActive false → access revoked (distinct status).
//   c. Unknown aadObjectId, but an unclaimed invite row exists for this UPN
//      (aadObjectId null, role set) → claim it (set aadObjectId, refresh
//      displayName, keep role) if that invite is still active; if the
//      invite itself was revoked (isActive false), same "revoked" status
//      as (b) — never silently claimable once revoked.
//   d. No match by either, and the WHOLE table is empty → bootstrap-eligible,
//      no row created yet (Stage 2 frontend offers the claim flow).
//   e. No match, table not empty → unchanged existing behavior: create a
//      role: null pending row (Access Pending screen).
//
// Response envelope is consistent across all branches:
//   { role: string | null, status: 'active' | 'revoked' | 'invite-claimed' | 'bootstrap-eligible' | 'pending' }
// `role` alone (branches a/e) is unchanged from the pre-existing response
// shape, so the current frontend (not touched in this pass) keeps working
// exactly as before for those two branches without reading `status` at all.
m365AuthRouter.post('/m365-login', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      aadObjectId?: string;
      userPrincipalName?: string;
      displayName?: string;
      jobTitle?: string;
    };

    const aadObjectId = (body.aadObjectId ?? '').trim();
    const userPrincipalName = (body.userPrincipalName ?? '').trim();
    const displayName = (body.displayName ?? '').trim();
    const jobTitle = (body.jobTitle ?? '').trim();
    // Only overwrite a stored jobTitle when this login actually supplied
    // one — a transient Graph failure (frontend sends '' when its own
    // Graph call failed) must never blank out a previously captured value.
    // Spread into every data/update/create object below.
    const jobTitleUpdate = jobTitle ? { jobTitle } : {};

    if (!aadObjectId || !userPrincipalName || !displayName) {
      await logAccess(req, { userId: null, role: null, action: 'M365_LOGIN_FAILURE' });
      res.status(400).json({ error: 'aadObjectId, userPrincipalName, and displayName are required' });
      return;
    }

    // a/b: known aadObjectId.
    const byAad = await prisma.m365UserRole.findUnique({ where: { aadObjectId } });
    if (byAad) {
      if (!byAad.isActive) {
        await logAccess(req, { userId: aadObjectId, role: byAad.role, action: 'M365_LOGIN_FAILURE' });
        res.json({ role: null, status: 'revoked' });
        return;
      }
      await prisma.m365UserRole.update({
        where: { aadObjectId },
        data: { userPrincipalName, displayName, ...jobTitleUpdate },
      });
      await logAccess(req, { userId: aadObjectId, role: byAad.role, action: 'M365_LOGIN_SUCCESS' });
      res.json({ role: byAad.role, status: 'active' });
      return;
    }

    // c: unclaimed invite for this UPN (looked up regardless of isActive so
    // a revoked invite is reported as 'revoked', never silently claimable).
    const invited = await prisma.m365UserRole.findFirst({
      where: { userPrincipalName, aadObjectId: null, role: { not: null } },
    });
    if (invited) {
      if (!invited.isActive) {
        await logAccess(req, { userId: aadObjectId, role: invited.role, action: 'M365_LOGIN_FAILURE' });
        res.json({ role: null, status: 'revoked' });
        return;
      }
      const claimed = await prisma.m365UserRole.update({
        where: { id: invited.id },
        data: { aadObjectId, displayName, ...jobTitleUpdate },
      });
      await logAccess(req, { userId: aadObjectId, role: claimed.role, action: 'M365_LOGIN_SUCCESS' });
      res.json({ role: claimed.role, status: 'invite-claimed' });
      return;
    }

    // d/e: no match by either — check whether this is a genuinely fresh
    // install (table completely empty) before falling back to the existing
    // auto-provision-pending behavior.
    const totalRows = await prisma.m365UserRole.count();
    if (totalRows === 0) {
      await logAccess(req, { userId: aadObjectId, role: null, action: 'M365_LOGIN_SUCCESS' });
      res.json({ role: null, status: 'bootstrap-eligible' });
      return;
    }

    // e: existing behavior, unchanged.
    const created = await prisma.m365UserRole.upsert({
      where: { aadObjectId },
      update: { userPrincipalName, displayName, ...jobTitleUpdate },
      create: { aadObjectId, userPrincipalName, displayName, role: null, ...jobTitleUpdate },
    });
    await logAccess(req, { userId: aadObjectId, role: created.role, action: 'M365_LOGIN_SUCCESS' });
    res.json({ role: created.role, status: 'pending' });
  } catch (error) {
    console.error('[POST /api/auth/m365-login] Error:', error);
    res.status(500).json({ error: 'Failed to process M365 login' });
  }
});

// POST /api/auth/claim-bootstrap-admin — deliberately ungated (there is no
// admin yet to require on a fresh install). Re-checks at call time that the
// table is still completely empty (never trusts an earlier "eligible"
// response) — see BOOTSTRAP_ADMIN_ROW_ID above for how the actual creation
// is made race-safe against a concurrent second claim.
m365AuthRouter.post('/claim-bootstrap-admin', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      aadObjectId?: string;
      userPrincipalName?: string;
      displayName?: string;
      jobTitle?: string;
    };

    const aadObjectId = (body.aadObjectId ?? '').trim();
    const userPrincipalName = (body.userPrincipalName ?? '').trim();
    const displayName = (body.displayName ?? '').trim();
    const jobTitle = (body.jobTitle ?? '').trim();

    if (!aadObjectId || !userPrincipalName || !displayName) {
      res.status(400).json({ error: 'aadObjectId, userPrincipalName, and displayName are required' });
      return;
    }

    const totalRows = await prisma.m365UserRole.count();
    if (totalRows > 0) {
      res.status(409).json({ error: 'Bootstrap admin has already been claimed for this install.' });
      return;
    }

    try {
      const created = await prisma.m365UserRole.create({
        data: {
          id: BOOTSTRAP_ADMIN_ROW_ID,
          aadObjectId,
          userPrincipalName,
          displayName,
          role: 'ADMIN',
          isActive: true,
          ...(jobTitle ? { jobTitle } : {}),
        },
      });
      res.status(201).json({ role: created.role, status: 'active' });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        // Lost the race — someone else's claim committed first.
        res.status(409).json({ error: 'Bootstrap admin has already been claimed for this install.' });
        return;
      }
      throw err;
    }
  } catch (error) {
    console.error('[POST /api/auth/claim-bootstrap-admin] Error:', error);
    res.status(500).json({ error: 'Failed to claim bootstrap admin' });
  }
});
