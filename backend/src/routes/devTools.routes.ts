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
 *  DELETE /api/dev/submissions/by-product-code   body: { productCode }
 *    Same wipe, but scoped to ONE exact productCode: deletes only the
 *    AmendmentLog rows whose parent Submission has that productCode, then
 *    only those Submissions. Every other productCode's submissions — and
 *    PinUser/M365UserRole/AppConfig — are untouched. Returns before/after
 *    counts for that code and whether it unlocked (afterCount === 0).
 *
 * AUDIT_REPORT.md carries an open item noting this router exists and must
 * be manually confirmed dead/removed before go-live, even though it's
 * env-gated — a conscious pre-launch checklist item, not just trust-the-gate.
 *
 * Password gate (issue #24): on top of the NODE_ENV guard, every route here
 * also requires the caller to send the shared secret as `{ "password": "..." }`
 * in the JSON body, checked against the WIPE_ENDPOINT_PASSWORD env var. Unlike
 * the HOST/TLS_* vars in server.ts, this one has NO default: if it is unset the
 * gate fails closed (401, no wipe). See `requireWipePassword` below.
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

/**
 * Password gate for every wipe route on this router (issue #24). Runs right
 * after `blockInProduction`, before any wipe logic. The caller must send the
 * shared secret as `{ "password": "..." }` in the JSON body — not a header,
 * not a query param.
 *
 * The secret is `WIPE_ENDPOINT_PASSWORD`. It follows the env-var-loading
 * pattern used elsewhere (server.ts) with one deliberate difference: it has
 * NO default. If it is unset (or empty) the gate refuses every wipe — fail
 * closed — so a misconfigured environment can't silently leave the endpoint
 * open. A missing or wrong password is answered 401 and the wipe never runs.
 */
function requireWipePassword(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env['WIPE_ENDPOINT_PASSWORD'];
  if (!expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const raw = (req.body ?? {}) as { password?: unknown };
  const provided = typeof raw.password === 'string' ? raw.password : '';
  if (provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

router.use(requireWipePassword);

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

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/dev/submissions/by-product-code   body: { productCode }
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/submissions/by-product-code', async (req: Request, res: Response) => {
  try {
    const raw = (req.body ?? {}) as { productCode?: unknown };
    const productCode = typeof raw.productCode === 'string' ? raw.productCode.trim() : '';
    if (!productCode) {
      res.status(400).json({ error: 'productCode is required.' });
      return;
    }

    const beforeCount = await prisma.submission.count({ where: { productCode } });
    if (beforeCount === 0) {
      res.status(404).json({ error: `No submissions found for product code "${productCode}".` });
      return;
    }

    // FK-safe order: AmendmentLog children (scoped by their parent
    // Submission's productCode) before the Submission parents — one
    // transaction so a mid-wipe failure can't orphan AmendmentLog rows.
    // Only rows matching this exact productCode are touched; PinUser and
    // M365UserRole are never referenced.
    await prisma.$transaction([
      prisma.amendmentLog.deleteMany({ where: { submission: { productCode } } }),
      prisma.submission.deleteMany({ where: { productCode } }),
    ]);

    const afterCount = await prisma.submission.count({ where: { productCode } });

    res.status(200).json({
      productCode,
      beforeCount,
      afterCount,
      // getProductCodeUsage() (config.routes.ts) treats a code with zero
      // referencing Submissions as unlocked — true here once afterCount is 0.
      unlocked: afterCount === 0,
    });
  } catch (err) {
    console.error('[DELETE /api/dev/submissions/by-product-code]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

export default router;
