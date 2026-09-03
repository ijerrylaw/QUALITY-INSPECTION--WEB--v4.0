/**
 * @file accessLog.ts
 * @description Shared writer for AccessLog rows — the audit trail behind
 * GET /api/access-log (System Admin, Group A only). Called from the three
 * write points that need it: M365 login (m365Users.routes.ts's
 * POST /m365-login), PIN login (pinUsers.routes.ts's POST /pin-login), and
 * PATCH /api/config (config.routes.ts).
 *
 * Failure to write an audit row must never break the login/config flow it's
 * auditing — errors are caught and logged here, never rethrown.
 */

import type { Request } from 'express';
import prisma from './prismaClient';

export type AccessLogAction =
  | 'M365_LOGIN_SUCCESS'
  | 'M365_LOGIN_FAILURE'
  | 'PIN_LOGIN_SUCCESS'
  | 'PIN_LOGIN_FAILURE'
  | 'CONFIG_WRITE'
  /**
   * A PATCH /api/config that was ATTEMPTED but rejected before anything
   * persisted — currently only when the profile-registry sync would drop a
   * locked defect/category (ProfileRegistrySyncError). The write is fully
   * rolled back, so unlike CONFIG_WRITE nothing changed; the row exists so a
   * rejected save is still visible in the audit trail rather than leaving a
   * silent gap. The `_FAILURE` suffix matches the existing LOGIN_FAILURE
   * naming, so AccessLogPanel.tsx renders it red with no frontend change.
   */
  | 'CONFIG_WRITE_FAILURE';

export async function logAccess(
  req: Request,
  params: {
    userId?: string | null;
    role?: string | null;
    /** Copied in at write time — see the model's doc comment in schema.prisma. */
    userDisplayName?: string | null;
    action: AccessLogAction;
    detail?: string | null;
  },
): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        userId: params.userId ?? null,
        role: params.role ?? null,
        userDisplayName: params.userDisplayName ?? null,
        action: params.action,
        detail: params.detail ?? null,
        ipAddress: req.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[logAccess] Failed to write AccessLog row:', error);
  }
}
