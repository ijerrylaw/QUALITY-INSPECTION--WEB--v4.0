/**
 * @file auth.ts
 * @description Role-gate middleware for mutating routes (AUDIT_REPORT.md §9.1/§10 Part 1).
 *
 * This checks a client-claimed role header, not a cryptographically verified
 * identity — there is no session/JWT/token system anywhere in this app yet
 * (NAVIGATION_AND_RBAC.md §4 marks that [PLANNED — NOT YET IMPLEMENTED]).
 * A client that wanted to lie about its own role still could, the same way
 * today's mock M365 popup / PIN login are not real auth either. What this
 * closes is the actual gap AUDIT_REPORT.md §9.1 flagged: before this file,
 * a caller could mutate data while claiming no identity at all. After this,
 * a role must be claimed and it must be on the route's allow-list.
 */

import type { Request, Response, NextFunction } from 'express';

// Keep in sync with frontend/src/context/AuthContext.tsx's UserRole type
// and NAVIGATION_AND_RBAC.md §2.
export type UserRole = 'OPERATOR' | 'LEADER' | 'SUPERVISOR' | 'EXECUTIVE' | 'MANAGER' | 'ADMIN';

export const ALL_ROLES: UserRole[] = ['OPERATOR', 'LEADER', 'SUPERVISOR', 'EXECUTIVE', 'MANAGER', 'ADMIN'];

/**
 * Permission GROUPS (AUDIT_REPORT.md §11) — a coarser layer on top of the six
 * real-job-title-mapped roles above, independent of login method (a
 * Supervisor logs in via M365 like Group B does, but sits in Group C for
 * access purposes). Keep in sync with
 * frontend/src/context/AuthContext.tsx's PERMISSION_GROUPS.
 *
 *   Group A — IT Admin, C-Suite, Directors     — full access incl. System Admin
 *   Group B — department Managers, Executives  — full access except System Admin
 *   Group C — Supervisors, Operators, Leaders   — Wizard + Inspection Records only
 */
export type PermissionGroup = 'A' | 'B' | 'C';

export const PERMISSION_GROUPS: Record<UserRole, PermissionGroup> = {
  ADMIN: 'A',
  EXECUTIVE: 'B',
  MANAGER: 'B',
  SUPERVISOR: 'C',
  LEADER: 'C',
  OPERATOR: 'C',
};

/**
 * Express middleware factory — same 401/403 semantics as requireRole(), but
 * expressed in terms of access GROUPS rather than individual roles.
 */
export function requireGroup(...allowedGroups: PermissionGroup[]) {
  const allowedRoles = ALL_ROLES.filter((role) => allowedGroups.includes(PERMISSION_GROUPS[role]));
  return requireRole(...allowedRoles);
}

/**
 * Express middleware factory — reads the X-User-Role request header and
 * checks it against `allowedRoles`. 401 if no role was claimed at all or the
 * claimed role isn't recognized; 403 if it's recognized but not permitted.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claimed = req.header('X-User-Role');

    if (!claimed) {
      res.status(401).json({ error: 'Authentication required: no user role provided.' });
      return;
    }

    if (!ALL_ROLES.includes(claimed as UserRole)) {
      res.status(401).json({ error: `Unrecognized role: '${claimed}'.` });
      return;
    }

    if (!allowedRoles.includes(claimed as UserRole)) {
      res.status(403).json({ error: `Role '${claimed}' is not permitted to perform this action.` });
      return;
    }

    next();
  };
}
