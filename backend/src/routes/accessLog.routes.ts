/**
 * @file accessLog.routes.ts
 * @description Read-only access to the AccessLog audit trail (System Admin,
 * Group A only — NAVIGATION_AND_RBAC.md §2 reserves System Admin for Group A).
 * Rows are written elsewhere (backend/src/lib/accessLog.ts, called from
 * m365Users.routes.ts, pinUsers.routes.ts, and config.routes.ts) — this file
 * only serves them back.
 *
 * Endpoints:
 *
 *  GET /api/access-log  Paginated, newest-first. Same page/limit contract as
 *      GET /api/amendments/pending (AUDIT_REPORT.md) — `page` (1-based,
 *      default 1), `limit` (default 50, capped at 200).
 *
 *  Group A only (requireGroup('A')) — tighter than the PIN/M365 admin
 *  screens (Group A/B), since this surfaces every user's login/config-write
 *  history, not just one admin task.
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prismaClient';
import { requireGroup } from '../middleware/auth';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export const accessLogRouter = Router();

accessLogRouter.get('/', requireGroup('A'), async (req: Request, res: Response) => {
  try {
    const parsedPage = Number(req.query['page']);
    const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

    const parsedLimit = Number(req.query['limit']);
    const limit = Number.isInteger(parsedLimit) && parsedLimit >= 1
      ? Math.min(parsedLimit, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

    const skip = (page - 1) * limit;

    const [logs, totalCount] = await Promise.all([
      prisma.accessLog.findMany({
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.accessLog.count(),
    ]);

    const hasMore = skip + logs.length < totalCount;

    res.json({ logs, count: logs.length, page, limit, totalCount, hasMore });
  } catch (error) {
    console.error('[GET /api/access-log] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve access log' });
  }
});

export default accessLogRouter;
