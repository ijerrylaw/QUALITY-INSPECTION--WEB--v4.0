/**
 * @file devTools.routes.ts
 * @description Dev-only destructive testing utilities. NEVER reachable in
 * production — see the `blockInProduction` guard below, applied to every
 * route on this router before any other logic runs.
 *
 * Endpoints:
 *
 *  DELETE /api/dev/submissions/all
 *    Wipes every Submission and AmendmentLog row (FK-dependent child table,
 *    deleted first, same transaction) so a developer can reset test data
 *    without touching PinUser/M365UserRole/AppConfig. Returns before/after
 *    counts plus the list of productCodes that were locked solely by rows
 *    this call deleted (getProductCodeUsage() in config.routes.ts computes
 *    "locked" the same way — >=1 referencing Submission — so wiping every
 *    Submission unlocks every productCode that had any).
 *
 * AUDIT_REPORT.md carries an open item noting this router exists and must
 * be manually confirmed dead/removed before go-live, even though it's
 * env-gated — a conscious pre-launch checklist item, not just trust-the-gate.
 */

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prismaClient';

const router = Router();

/**
 * First thing that runs for any route on this router, before any other
 * logic (including parsing/validating the request) — a dev-only endpoint
 * that deletes production data must never get far enough to do anything
 * else when NODE_ENV is 'production'. 404, not 403, so the route's
 * existence isn't even disclosed to a production caller.
 */
function blockInProduction(_req: Request, res: Response, next: NextFunction): void {
  if (process.env['NODE_ENV'] === 'production') {
    res.status(404).json({ error: 'Route not found' });
    return;
  }
  next();
}

router.use(blockInProduction);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/dev/submissions/all
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/submissions/all', async (_req: Request, res: Response) => {
  try {
    const beforeCount = await prisma.submission.count();

    // Distinct productCodes present right now — every one of them is
    // "locked" per getProductCodeUsage()'s >=1-referencing-Submission rule
    // (config.routes.ts), and since this deletes ALL submissions, every one
    // of them is about to unlock.
    const distinctCodes = await prisma.submission.findMany({
      distinct: ['productCode'],
      select: { productCode: true },
    });
    const unlockedProductCodes = distinctCodes.map((row) => row.productCode);

    // FK-safe order: AmendmentLog (child, references Submission) before
    // Submission (parent) — both in one transaction so a mid-wipe failure
    // can't leave orphaned AmendmentLog rows or a half-cleared Submission
    // table. Neither PinUser nor M365UserRole is touched by either call.
    await prisma.$transaction([
      prisma.amendmentLog.deleteMany({}),
      prisma.submission.deleteMany({}),
    ]);

    const afterCount = await prisma.submission.count();

    res.status(200).json({ beforeCount, afterCount, unlockedProductCodes });
  } catch (err) {
    console.error('[DELETE /api/dev/submissions/all]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

export default router;
