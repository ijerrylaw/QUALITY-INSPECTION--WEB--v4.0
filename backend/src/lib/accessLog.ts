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
  | 'CONFIG_WRITE';

export async function logAccess(
  req: Request,
  params: { userId?: string | null; role?: string | null; action: AccessLogAction; detail?: string | null },
): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        userId: params.userId ?? null,
        role: params.role ?? null,
        action: params.action,
        detail: params.detail ?? null,
        ipAddress: req.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[logAccess] Failed to write AccessLog row:', error);
  }
}
