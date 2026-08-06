/**
 * @file submissions.routes.ts
 * @description Native v4.0 Express router for AQL inspection submission endpoints.
 *
 * Endpoints:
 *
 *  POST /api/submissions
 *    Full inspection submission flow:
 *      1. Validate incoming payload against Submission schema fields.
 *      2. Resolve InspectionProfile (from explicit profileId, or via AppConfig.productProfileMap).
 *      3. Invoke the native evaluateAQLVerdict engine (aqlEvaluator.ts) with raw Prisma types.
 *      4. Persist the final Submission record (including verdict) to SQLite via Prisma.
 *
 *  GET  /api/submissions
 *    Returns the 50 most recent submissions, ordered by creation date descending.
 *
 *  GET  /api/submissions/:id
 *    Returns a single submission with its amendment logs and linked profile details.
 *
 * Level 1 System Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 * Level 2 Feature Spec: v4_optimized_blueprint.md & implementation_plan.md
 */

import { Router, Request, Response } from 'express';
import { evaluateAQLVerdict } from '../engine/aqlEvaluator';
import prisma from '../lib/prismaClient';

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

/** Safely parses a JSON string; returns fallback on failure. */
function safeParseJSON<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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
router.post('/', async (req: Request, res: Response) => {
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

    // ── 2. Resolve InspectionProfile ──────────────────────────────────────────
    // Priority: explicit profileId > productProfileMap in AppConfig > no profile
    let profileId = body['profileId'] as string | undefined | null;

    if (!profileId) {
      // Attempt auto-resolution via AppConfig.productProfileMap
      const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' } });
      if (appConfig?.productProfileMap) {
        const productCode = String(body['productCode']);
        const profileMap = safeParseJSON<Record<string, string>>(appConfig.productProfileMap, {});
        profileId = profileMap[productCode] ?? null;
      }
    }

    // ── 3. Fetch InspectionProfile and native Prisma types ─────────────────────
    let categories: Awaited<ReturnType<typeof prisma.aQLCategory.findMany>> = [];
    let defectDefinitions: Awaited<ReturnType<typeof prisma.defectDefinition.findMany>> = [];

    if (profileId) {
      const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' } });
      const profilesList = appConfig?.inspectionProfiles 
        ? safeParseJSON<any[]>(appConfig.inspectionProfiles, []) 
        : [];
        
      let profile = profilesList.find(p => p.id === profileId);

      if (!profile && profileId === 'prof_default') {
        // Fallback for unsaved mock profile from UI
        profile = {
          id: 'prof_default',
          aqlCategories: [
            { id: 'BARRIER',   name: 'BARRIER',   aqlLevel: 'AND',           evaluationMode: 'N/A' },
            { id: 'CRITICAL',  name: 'CRITICAL',  aqlLevel: '1.5',           evaluationMode: 'CUMULATIVE' },
            { id: 'MAJOR',     name: 'MAJOR',     aqlLevel: '2.5',           evaluationMode: 'CUMULATIVE' },
            { id: 'MINOR',     name: 'MINOR',     aqlLevel: '4.0',           evaluationMode: 'GRANULAR' },
            { id: 'PACKAGING', name: 'PACKAGING', aqlLevel: 'PASS/FAIL/NIL', evaluationMode: 'N/A' },
          ],
          defectDefinitions: [
            { id: 'def_hole', name: 'Hole', categoryId: 'BARRIER' },
            { id: 'def_tear', name: 'Tear', categoryId: 'BARRIER' },
            { id: 'def_stain', name: 'Stain', categoryId: 'CRITICAL' },
            { id: 'def_particle', name: 'Particle', categoryId: 'CRITICAL' },
            { id: 'def_dirt', name: 'Dirt', categoryId: 'MAJOR' },
            { id: 'def_flow', name: 'Flow Mark', categoryId: 'MINOR' },
            { id: 'def_box', name: 'Box Damage', categoryId: 'PACKAGING' },
          ]
        };
      }

      if (!profile) {
        res.status(404).json({ error: `InspectionProfile '${profileId}' not found.` });
        return;
      }

      categories = profile.aqlCategories || [];
      defectDefinitions = profile.defectDefinitions || [];
    }

    // ── 4. Run native AQL verdict engine ──────────────────────────────────────
    const { verdict, categoryResults } = evaluateAQLVerdict({
      sampleSize,
      categories,
      defectDefinitions,
      defectCounts,
    });

    // Verify if profile exists in native DB to avoid Prisma foreign key constraint errors
    let validDbProfileId = null;
    if (profileId) {
      const existsInDb = await prisma.inspectionProfile.findUnique({ where: { id: profileId } });
      if (existsInDb) validDbProfileId = profileId;
    }

    // ── 5. Insert into Database ───────────────────────────────────────────────
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
 * Request body (JSON):
 * {
 *   "reason": "Data entry error in defect count",
 *   "newValues": {
 *     "productCode": "...",
 *     // ... full submission payload
 *   }
 * }
 */
router.post('/:id/amendments', async (req: Request, res: Response) => {
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

    // 2. Perform transaction: update status and insert log
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
        },
      }),
    ]);

    res.status(201).json({
      message: 'Amendment submitted successfully for approval.',
      submission: transaction[0],
      amendmentLog: transaction[1],
    });
  } catch (err) {
    console.error('[POST /api/submissions/:id/amendments]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

export default router;
