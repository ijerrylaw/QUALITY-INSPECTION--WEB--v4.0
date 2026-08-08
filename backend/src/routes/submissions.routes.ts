/**
 * @file submissions.routes.ts
 * @description Native v4.0 Express router for AQL inspection submission endpoints.
 *
 * Endpoints:
 *
 *  POST /api/submissions
 *    Full inspection submission flow:
 *      1. Validate incoming payload against Submission schema fields.
 *      2. Resolve InspectionProfile + evaluate verdict via resolveVerdict() (engine/resolveVerdict.ts).
 *      3. Persist the final Submission record (including verdict) to SQLite via Prisma.
 *
 *  GET  /api/submissions
 *    Returns the 50 most recent submissions, ordered by creation date descending.
 *
 *  GET  /api/submissions/:id
 *    Returns a single submission with its amendment logs and linked profile details.
 *
 *  POST /api/submissions/:id/amendments
 *    Drafts an amendment (PENDING_APPROVAL) and previews — informationally, non-blocking —
 *    what the server would recompute the verdict as.
 *
 * Also exports:
 *  - amendmentsRouter (mounted at /api/amendments) — pending queue, approve, reject.
 *  - verdictRouter     (mounted at /api/verdict)    — read-only verdict preview, no persistence.
 *
 * Level 1 System Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 * Level 2 Feature Spec: v4_optimized_blueprint.md & implementation_plan.md
 */

import { Router, Request, Response } from 'express';
import { resolveVerdict, VerdictProfileNotFoundError } from '../engine/resolveVerdict';
import prisma from '../lib/prismaClient';
import { requireRole, ALL_ROLES } from '../middleware/auth';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Required string-typed fields on every incoming submission payload */
const REQUIRED_STRING_FIELDS = [
  'productCode',
  'productionDate',
  'samplingTime',
  'machineId',
  'shift',
  'batchNumber',
  'size',
  'aadObjectId',
  'userPrincipalName',
] as const;

/**
 * Normalizes a `defects`/`dimensions` value that may arrive as a JSON string
 * (as stored on Submission/AmendmentLog) or already as a parsed object (as
 * sent by the frontend in a fresh payload) into a plain object.
 */
function parseJSONObjectField<T = unknown>(raw: unknown): Record<string, T> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, T>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, T>;
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions  (PERSISTED — writes to SQLite)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full inspection submission endpoint.
 *
 * Request body (JSON):
 * {
 *   "productCode":    "N035SKB-OC-24FT",
 *   "productionDate": "2025-07-25",
 *   "samplingTime":   "08:30",
 *   "machineId":      "M01",
 *   "shift":          "Shift 1 (Morning)",
 *   "batchNumber":    "BT-2025-001",
 *   "size":           "M",
 *   "sampleSize":     125,
 *   "dimensions":     { "thickness": [0.12, 0.11], "length": [280, 281] },
 *   "dimensionMins":  { "thickness": 0.10, "length": 270 },
 *   "defects":        { "def-id-1": 2, "def-id-2": 0 },
 *   "aadObjectId":    "azure-ad-object-id",
 *   "userPrincipalName": "operator@factory.com",
 *   "profileId":      "optional-profile-cuid",   // optional
 *   "totalCarton":    1200,                        // optional
 *   "gloveWeight":    5.2                          // optional
 * }
 *
 * Response 201 (JSON):
 * {
 *   "submission": { ... },
 *   "verdict": "PASSED" | "FAILED",
 *   "categoryResults": [ ... ]
 * }
 */
router.post('/', requireRole(...ALL_ROLES), async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;

    // ── 1. Validate required string fields ─────────────────────────────────────
    const missingFields: string[] = [];

    for (const field of REQUIRED_STRING_FIELDS) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        missingFields.push(field);
      }
    }

    if (body['sampleSize'] === undefined || body['sampleSize'] === null) {
      missingFields.push('sampleSize');
    }
    if (body['dimensions'] === undefined || body['dimensions'] === null) {
      missingFields.push('dimensions');
    }
    if (body['dimensionMins'] === undefined || body['dimensionMins'] === null) {
      missingFields.push('dimensionMins');
    }
    if (
      body['defects'] === undefined ||
      body['defects'] === null ||
      typeof body['defects'] !== 'object' ||
      Array.isArray(body['defects'])
    ) {
      missingFields.push('defects (must be a key:count object)');
    }

    if (missingFields.length > 0) {
      res.status(400).json({ error: 'Missing or malformed required fields', missingFields });
      return;
    }

    const sampleSize = Number(body['sampleSize']);
    if (!Number.isFinite(sampleSize) || sampleSize < 2) {
      res.status(400).json({ error: 'sampleSize must be a number ≥ 2' });
      return;
    }

    const defectCounts = body['defects'] as Record<string, number>;
    const requestedProfileId = (body['profileId'] as string | undefined | null) || null;

    // ── 2. Resolve profile + evaluate verdict via the single source of truth ───
    let verdict: 'PASSED' | 'FAILED';
    let categoryResults;
    let evaluationProfileId: string | null;
    let requestedProfileIdEcho: string | null;

    try {
      const result = await resolveVerdict({
        profileId: requestedProfileId,
        productCode: String(body['productCode']),
        sampleSize,
        defectCounts,
        size: String(body['size']),
        dimensionMeasurements: body['dimensions'] as Record<string, string[]>,
      });
      verdict = result.verdict;
      categoryResults = result.categoryResults;
      evaluationProfileId = result.evaluationProfileId;
      requestedProfileIdEcho = result.requestedProfileId;
    } catch (err) {
      if (err instanceof VerdictProfileNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }

    console.log(
      `[POST /api/submissions] profile=${evaluationProfileId ?? 'none'} ` +
      `sampleSize=${sampleSize} verdict=${verdict} ` +
      `cats=${categoryResults.length} ` +
      `defects=${JSON.stringify(defectCounts)}`,
    );

    // ── 3. Resolve validDbProfileId — only set if profile exists in the DB table ─
    // Prevents Prisma FK constraint errors from AppConfig-only profiles.
    // Uses requestedProfileId (the id actually asked for), not evaluationProfileId
    // (which may point at a safety-net substitute used only for grading).
    let validDbProfileId: string | null = null;
    if (requestedProfileIdEcho) {
      const existsInDb = await prisma.inspectionProfile.findUnique({ where: { id: requestedProfileIdEcho } });
      if (existsInDb) validDbProfileId = requestedProfileIdEcho;
    }

    // ── 4. Insert into Database ───────────────────────────────────────────────
    const newSubmission = await prisma.submission.create({
      data: {
        productCode:         String(body['productCode']),
        productionDate:      String(body['productionDate']),
        samplingTime:        String(body['samplingTime']),
        submissionTimestamp: new Date().toISOString(),
        machineId:           String(body['machineId']),
        shift:               String(body['shift']),
        batchNumber:         String(body['batchNumber']),
        size:                String(body['size']),
        sampleSize,
        dimensions:          JSON.stringify(body['dimensions']),
        dimensionMins:       JSON.stringify(body['dimensionMins']),
        defects:             JSON.stringify(defectCounts),
        verdict,
        aadObjectId:         String(body['aadObjectId']),
        userPrincipalName:   String(body['userPrincipalName']),
        amendmentStatus:     'UNMODIFIED',
        totalCarton:  body['totalCarton'] != null ? Number(body['totalCarton']) : null,
        gloveWeight:  body['gloveWeight']  != null ? Number(body['gloveWeight'])  : null,
        profileId:    validDbProfileId,
      },
    });

    res.status(201).json({ submission: newSubmission, verdict, categoryResults });

  } catch (err) {
    console.error('[POST /api/submissions]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/submissions  (list — most recent 50)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the 50 most recent submissions ordered by creation date descending.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const submissions = await prisma.submission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { amendmentLogs: true },
    });
    res.status(200).json({ submissions, count: submissions.length });
  } catch (err) {
    console.error('[GET /api/submissions]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/submissions/:id  (single record with full relations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a single submission with its amendment logs and linked profile details.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const submissionId = String(req.params['id']);
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        amendmentLogs: { orderBy: { createdAt: 'asc' } },
        profile: {
          include: { aqlCategories: true, defectDefinitions: true },
        },
      },
    });

    if (!submission) {
      res.status(404).json({ error: `Submission '${submissionId}' not found.` });
      return;
    }

    res.status(200).json({ submission });
  } catch (err) {
    console.error('[GET /api/submissions/:id]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions/:id/amendments  (draft an amendment request)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an AmendmentLog record and sets the Submission status to PENDING_APPROVAL.
 *
 * Also computes an informational, non-blocking preview of what the server
 * would recompute the verdict as (via resolveVerdict()), so a supervisor
 * reviewing the queue later isn't surprised at approval time. If the
 * amendment's profile can't be resolved, the draft still succeeds —
 * recomputedVerdict/recomputedCategoryResults are simply left null.
 *
 * Request body (JSON):
 * {
 *   "reason": "Data entry error in defect count",
 *   "newValues": {
 *     "productCode": "...",
 *     // ... full submission payload
 *   }
 * }
 */
router.post('/:id/amendments', requireRole(...ALL_ROLES), async (req: Request, res: Response) => {
  try {
    const submissionId = String(req.params['id']);
    const body = req.body as { reason?: string; newValues?: Record<string, unknown> };

    if (!body.reason || !body.reason.trim()) {
      res.status(400).json({ error: 'Amendment reason is required' });
      return;
    }

    if (!body.newValues || typeof body.newValues !== 'object') {
      res.status(400).json({ error: 'newValues payload is required' });
      return;
    }

    // 1. Fetch the original submission
    const originalSubmission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!originalSubmission) {
      res.status(404).json({ error: `Submission '${submissionId}' not found.` });
      return;
    }

    // 2. Informational recompute preview — never blocks the draft itself.
    const newValues = body.newValues;
    let recomputedVerdict: string | null = null;
    let recomputedCategoryResults: string | null = null;
    let recomputedFailedDimensions: number | null = null;
    let recomputedDimensionResults: string | null = null;

    try {
      const preview = await resolveVerdict({
        profileId: (newValues['profileId'] as string | undefined) ?? originalSubmission.profileId,
        productCode: String(newValues['productCode'] ?? originalSubmission.productCode),
        sampleSize: Number(newValues['sampleSize'] ?? originalSubmission.sampleSize),
        defectCounts: parseJSONObjectField<number>(newValues['defects'] ?? originalSubmission.defects),
        size: String(newValues['size'] ?? originalSubmission.size),
        dimensionMeasurements: parseJSONObjectField<string[]>(newValues['dimensions'] ?? originalSubmission.dimensions),
      });
      recomputedVerdict = preview.verdict;
      recomputedCategoryResults = JSON.stringify(preview.categoryResults);
      recomputedFailedDimensions = preview.failedDimensions;
      recomputedDimensionResults = JSON.stringify(preview.dimensionResults);
    } catch (err) {
      if (err instanceof VerdictProfileNotFoundError) {
        console.warn(
          `[POST /api/submissions/:id/amendments] Recompute preview unavailable for submission ` +
          `'${submissionId}': ${err.message}`,
        );
        // recomputedVerdict/recomputedCategoryResults stay null — draft still proceeds.
      } else {
        throw err;
      }
    }

    // 3. Perform transaction: update status and insert log
    const transaction = await prisma.$transaction([
      prisma.submission.update({
        where: { id: submissionId },
        data: { amendmentStatus: 'PENDING_APPROVAL' },
      }),
      prisma.amendmentLog.create({
        data: {
          submissionId,
          originalValues: JSON.stringify(originalSubmission),
          newValues: JSON.stringify(body.newValues),
          requestedBy: 'operator@oneglove.com', // Mock authentication for now
          requestedAt: new Date().toISOString(),
          supervisorNote: body.reason.trim(),
          status: 'PENDING_APPROVAL',
          recomputedVerdict,
          recomputedCategoryResults,
          recomputedFailedDimensions,
          recomputedDimensionResults,
        },
      }),
    ]);

    res.status(201).json({
      message: 'Amendment submitted successfully for approval.',
      submission: transaction[0],
      amendmentLog: transaction[1],
      recomputedVerdict,
    });
  } catch (err) {
    console.error('[POST /api/submissions/:id/amendments]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// AMENDMENTS ROUTER  (API_AND_INTEGRATION_SPEC.md §1 — Amendments & Approvals)
// Mounted at /api/amendments in server.ts
// ─────────────────────────────────────────────────────────────────────────────

export const amendmentsRouter = Router();

// ── GET /api/amendments/pending ────────────────────────────────────────────
// Returns all submissions where amendmentStatus === 'PENDING_APPROVAL',
// including the most recent AmendmentLog for each (for the diff viewer).
amendmentsRouter.get('/pending', async (_req: Request, res: Response) => {
  try {
    const pending = await prisma.submission.findMany({
      where: { amendmentStatus: 'PENDING_APPROVAL' },
      include: {
        amendmentLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ amendments: pending });
  } catch (err) {
    console.error('[GET /api/amendments/pending]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ── POST /api/amendments/:id/approve ──────────────────────────────────────
// Recomputes the verdict server-side via resolveVerdict() and persists that
// recomputed value — the client-supplied newValues.verdict is NEVER trusted
// for persistence. Both values are stored on the AmendmentLog for audit.
// If the amendment's profile can't be resolved, approval hard-fails: this is
// the one place a verdict is permanently written, so we never guess here.
// The reviewer is mocked until Azure AD integration is complete.
amendmentsRouter.post('/:id/approve', requireRole('EXECUTIVE', 'MANAGER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const submissionId = String(req.params['id']);

    // 1. Find the latest pending AmendmentLog for this submission
    const amendmentLog = await prisma.amendmentLog.findFirst({
      where: { submissionId, status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'desc' },
    });

    if (!amendmentLog) {
      res.status(404).json({ error: `No pending amendment found for submission '${submissionId}'.` });
      return;
    }

    // 2. Parse the proposed newValues
    let newValues: Record<string, unknown>;
    try {
      newValues = JSON.parse(amendmentLog.newValues) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: 'AmendmentLog newValues is not valid JSON.' });
      return;
    }

    // 3. Fetch the current submission — provides fallback values for any
    //    field the amendment doesn't touch (an amendment may only change a subset).
    const existingSubmission = await prisma.submission.findUnique({ where: { id: submissionId } });
    if (!existingSubmission) {
      res.status(404).json({ error: `Submission '${submissionId}' not found.` });
      return;
    }

    // 4. Recompute the verdict server-side — the authoritative check.
    let recomputed;
    try {
      recomputed = await resolveVerdict({
        profileId: (newValues['profileId'] as string | undefined) ?? existingSubmission.profileId,
        productCode: String(newValues['productCode'] ?? existingSubmission.productCode),
        sampleSize: Number(newValues['sampleSize'] ?? existingSubmission.sampleSize),
        defectCounts: parseJSONObjectField<number>(newValues['defects'] ?? existingSubmission.defects),
        size: String(newValues['size'] ?? existingSubmission.size),
        dimensionMeasurements: parseJSONObjectField<string[]>(newValues['dimensions'] ?? existingSubmission.dimensions),
      });
    } catch (err) {
      if (err instanceof VerdictProfileNotFoundError) {
        res.status(422).json({
          error: 'Cannot verify this amendment — its inspection profile could not be resolved. ' +
                 'Nothing was changed; resolve the profile reference before approving.',
          details: err.message,
        });
        return;
      }
      throw err;
    }

    const clientSuppliedVerdict = newValues['verdict'] != null ? String(newValues['verdict']) : null;
    const now = new Date().toISOString();

    // 4b. Resolve a DB-safe profileId — only set if it exists in the real
    //     InspectionProfile table. AppConfig-JSON profile ids (e.g. 'prof_default',
    //     created via Configuration Control) never exist there — see §5.5/§B6's
    //     documented compounding factor — so writing newValues.profileId verbatim
    //     violates the FK constraint on Submission.profileId. Mirrors the same
    //     validDbProfileId safety net POST /api/submissions already applies.
    let validDbProfileId: string | null = null;
    if (newValues['profileId'] != null) {
      const requestedId = String(newValues['profileId']);
      const existsInDb = await prisma.inspectionProfile.findUnique({ where: { id: requestedId } });
      if (existsInDb) validDbProfileId = requestedId;
    }

    // 5. Transaction: apply newValues to the Submission + mark both as APPROVED.
    //    verdict is ALWAYS the server-recomputed value — newValues.verdict is
    //    never written to the Submission, only kept for audit comparison below.
    const [updatedSubmission, updatedLog] = await prisma.$transaction([
      prisma.submission.update({
        where: { id: submissionId },
        data: {
          amendmentStatus: 'APPROVED',
          // Apply all proposed field changes from newValues
          ...(newValues['productCode']         != null && { productCode:         String(newValues['productCode']) }),
          ...(newValues['productionDate']       != null && { productionDate:      String(newValues['productionDate']) }),
          ...(newValues['samplingTime']         != null && { samplingTime:        String(newValues['samplingTime']) }),
          ...(newValues['machineId']            != null && { machineId:           String(newValues['machineId']) }),
          ...(newValues['shift']                != null && { shift:               String(newValues['shift']) }),
          ...(newValues['batchNumber']          != null && { batchNumber:         String(newValues['batchNumber']) }),
          ...(newValues['size']                 != null && { size:                String(newValues['size']) }),
          ...(newValues['sampleSize']           != null && { sampleSize:          Number(newValues['sampleSize']) }),
          ...(newValues['dimensions']           != null && { dimensions:          typeof newValues['dimensions'] === 'string' ? newValues['dimensions'] : JSON.stringify(newValues['dimensions']) }),
          ...(newValues['dimensionMins']        != null && { dimensionMins:       typeof newValues['dimensionMins'] === 'string' ? newValues['dimensionMins'] : JSON.stringify(newValues['dimensionMins']) }),
          ...(newValues['defects']              != null && { defects:             typeof newValues['defects'] === 'string' ? newValues['defects'] : JSON.stringify(newValues['defects']) }),
          verdict:                             recomputed.verdict,
          ...(newValues['totalCarton']          != null && { totalCarton:         Number(newValues['totalCarton']) }),
          ...(newValues['gloveWeight']          != null && { gloveWeight:         parseFloat(String(newValues['gloveWeight'])) }),
          ...(newValues['profileId']            != null && { profileId:           validDbProfileId }),
        },
      }),
      prisma.amendmentLog.update({
        where: { id: amendmentLog.id },
        data: {
          status:     'APPROVED',
          reviewedBy: 'executive@oneglove.com', // Mock until Azure AD integration
          reviewedAt: now,
          recomputedVerdict:          recomputed.verdict,
          recomputedCategoryResults:  JSON.stringify(recomputed.categoryResults),
          recomputedFailedDimensions: recomputed.failedDimensions,
          recomputedDimensionResults: JSON.stringify(recomputed.dimensionResults),
        },
      }),
    ]);

    if (clientSuppliedVerdict != null && clientSuppliedVerdict !== recomputed.verdict) {
      console.warn(
        `[POST /api/amendments/:id/approve] Verdict mismatch on submission '${submissionId}': ` +
        `client-supplied='${clientSuppliedVerdict}' server-recomputed='${recomputed.verdict}'. ` +
        `Persisted the server-recomputed value; both are stored on AmendmentLog '${amendmentLog.id}' for audit.`,
      );
    }

    res.json({
      message: 'Amendment approved and merged successfully.',
      submission: updatedSubmission,
      amendmentLog: updatedLog,
      verdictRecompute: {
        clientSupplied: clientSuppliedVerdict,
        serverRecomputed: recomputed.verdict,
        mismatch: clientSuppliedVerdict != null && clientSuppliedVerdict !== recomputed.verdict,
      },
    });
  } catch (err) {
    console.error('[POST /api/amendments/:id/approve]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ── POST /api/amendments/:id/reject ───────────────────────────────────────
// Discards the draft amendment. Sets amendmentStatus → 'REJECTED'.
amendmentsRouter.post('/:id/reject', requireRole('EXECUTIVE', 'MANAGER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const submissionId = String(req.params['id']);
    const body = req.body as { reason?: string };

    // 1. Find the latest pending AmendmentLog
    const amendmentLog = await prisma.amendmentLog.findFirst({
      where: { submissionId, status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'desc' },
    });

    if (!amendmentLog) {
      res.status(404).json({ error: `No pending amendment found for submission '${submissionId}'.` });
      return;
    }

    const now = new Date().toISOString();

    // 2. Transaction: reject both the log and the submission status
    const [updatedSubmission, updatedLog] = await prisma.$transaction([
      prisma.submission.update({
        where: { id: submissionId },
        data: { amendmentStatus: 'REJECTED' },
      }),
      prisma.amendmentLog.update({
        where: { id: amendmentLog.id },
        data: {
          status:        'REJECTED',
          reviewedBy:    'executive@oneglove.com', // Mock until Azure AD integration
          reviewedAt:    now,
          supervisorNote: body.reason?.trim() ?? amendmentLog.supervisorNote,
        },
      }),
    ]);

    res.json({
      message: 'Amendment rejected.',
      submission: updatedSubmission,
      amendmentLog: updatedLog,
    });
  } catch (err) {
    console.error('[POST /api/amendments/:id/reject]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VERDICT ROUTER  (read-only, no persistence)
// Mounted at /api/verdict in server.ts
// ─────────────────────────────────────────────────────────────────────────────

export const verdictRouter = Router();

// ── POST /api/verdict/preview ──────────────────────────────────────────────
// Computes a verdict + category breakdown WITHOUT writing to the database,
// via the same resolveVerdict() used by every persisting route. Used by
// StepReviewSubmit.tsx (wizard review step) and HistoryFeed.tsx (historical
// record display) so both show exactly what the server would compute.
//
// Unlike the persisting routes, an unresolved profileId does not hard-fail
// here — it falls back through the normal safety net (same as "no profileId
// supplied at all"), since this is a read-only, non-authoritative preview.
verdictRouter.post('/preview', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;

    if (body['sampleSize'] == null || !Number.isFinite(Number(body['sampleSize']))) {
      res.status(400).json({ error: 'sampleSize must be a number' });
      return;
    }
    if (
      body['defects'] == null ||
      typeof body['defects'] !== 'object' ||
      Array.isArray(body['defects'])
    ) {
      res.status(400).json({ error: 'defects must be a key:count object' });
      return;
    }

    const result = await resolveVerdict({
      profileId: (body['profileId'] as string | null | undefined) ?? null,
      productCode: body['productCode'] as string | undefined,
      sampleSize: Number(body['sampleSize']),
      defectCounts: body['defects'] as Record<string, number>,
      onUnresolvedProfile: 'fallback',
    });

    res.json(result);
  } catch (err) {
    console.error('[POST /api/verdict/preview]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});
