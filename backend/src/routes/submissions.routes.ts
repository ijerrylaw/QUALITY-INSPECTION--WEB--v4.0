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
// HARDCODED GLOBAL STANDARD DEFAULT PROFILE
// Mirrors ConfigContext.tsx getResolvedProfile() fallback.
// Used when no profile is resolved from AppConfig or an explicit profileId.
//
// evaluationMode choices (per aqlEvaluator.ts):
//   CUMULATIVE — sum all defect counts ≤ Ac; correct for zero-tolerance too
//   GRANULAR   — each defect type individually ≤ Ac
//   N/A        — qualitative state encoding (0=unset, 1=pass, 2=fail)
//   ''         — informational-only row; engine skips it
// ─────────────────────────────────────────────────────────────────────────────

const HARDCODED_DEFAULT_PROFILE = {
  id:   'prof_default',
  name: 'GLOBAL STANDARD (DEFAULT)',
  aqlCategories: [
    // AND = zero tolerance: CUMULATIVE mode with {ac:0,re:1} threshold
    { id: 'BARRIER',   name: 'BARRIER',   aqlLevel: 'AND',           evaluationMode: 'CUMULATIVE' },
    { id: 'CRITICAL',  name: 'CRITICAL',  aqlLevel: '1.5',           evaluationMode: 'CUMULATIVE' },
    { id: 'MAJOR',     name: 'MAJOR',     aqlLevel: '2.5',           evaluationMode: 'CUMULATIVE' },
    { id: 'MINOR',     name: 'MINOR',     aqlLevel: '4.0',           evaluationMode: 'GRANULAR'   },
    // PACKAGING is qualitative; '' causes engine to skip it (informational only)
    { id: 'PACKAGING', name: 'PACKAGING', aqlLevel: 'PASS/FAIL/NIL', evaluationMode: ''           },
  ],
  defectDefinitions: [
    // Engine matches defect defs to categories via currentClass === category.name || category.id
    { id: 'def_hole',     name: 'Hole',       currentClass: 'BARRIER',   defaultClass: 'BARRIER'   },
    { id: 'def_tear',     name: 'Tear',       currentClass: 'BARRIER',   defaultClass: 'BARRIER'   },
    { id: 'def_stain',    name: 'Stain',      currentClass: 'CRITICAL',  defaultClass: 'CRITICAL'  },
    { id: 'def_particle', name: 'Particle',   currentClass: 'CRITICAL',  defaultClass: 'CRITICAL'  },
    { id: 'def_dirt',     name: 'Dirt',       currentClass: 'MAJOR',     defaultClass: 'MAJOR'     },
    { id: 'def_flow',     name: 'Flow Mark',  currentClass: 'MINOR',     defaultClass: 'MINOR'     },
    { id: 'def_box',      name: 'Box Damage', currentClass: 'PACKAGING', defaultClass: 'PACKAGING' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE-NORMALIZATION HELPERS
// AppConfig-stored profiles use { categoryId } on defect definitions,
// but the evaluateAQLVerdict engine expects { currentClass }.
// These helpers produce plain objects the engine can consume without type errors.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeForEngine(profile: {
  aqlCategories?: any[];
  defectDefinitions?: any[];
}): { categories: any[]; defectDefinitions: any[] } {
  const categories = (profile.aqlCategories ?? []).map((c: any) => ({
    id:             String(c.id            ?? ''),
    name:           String(c.name          ?? ''),
    aqlLevel:       String(c.aqlLevel      ?? ''),
    evaluationMode: String(c.evaluationMode ?? ''),
  }));

  const defectDefinitions = (profile.defectDefinitions ?? []).map((d: any) => ({
    id:           String(d.id   ?? ''),
    name:         String(d.name ?? ''),
    // Map either Prisma field or AppConfig JSON field to the engine's expected name
    currentClass: String(d.currentClass ?? d.categoryId ?? ''),
    defaultClass: String(d.defaultClass ?? d.categoryId ?? ''),
  }));

  return { categories, defectDefinitions };
}

/**
 * A profile is usable for AQL evaluation only if at least one category
 * has both aqlLevel and evaluationMode configured.
 */
function hasUsableRules(profile: any): boolean {
  return (profile?.aqlCategories ?? []).some(
    (c: any) => c.aqlLevel && String(c.aqlLevel).trim() !== ''
                && c.evaluationMode && String(c.evaluationMode).trim() !== '',
  );
}

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

    // ── 2. Fetch AppConfig once — used for both profileMap and profile list ────
    const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' } });
    const profilesList: any[] = appConfig?.inspectionProfiles
      ? safeParseJSON<any[]>(appConfig.inspectionProfiles, [])
      : [];

    // ── 3. Resolve profileId ──────────────────────────────────────────────────
    // Priority: explicit profileId in body > productProfileMap in AppConfig > null
    let profileId = (body['profileId'] as string | undefined | null) || null;

    if (!profileId && appConfig?.productProfileMap) {
      const productCode = String(body['productCode']);
      const profileMap  = safeParseJSON<Record<string, string>>(appConfig.productProfileMap, {});
      profileId         = profileMap[productCode] ?? null;
    }

    // ── 4. Resolve profile categories and defect definitions for the engine ────
    //
    // Resolution order:
    //   a) Explicit profileId → find in AppConfig.inspectionProfiles → normalize
    //   b) Explicit profileId === 'prof_default' AND not found above → hardcoded default
    //   c) Unknown profileId (not in list and not 'prof_default') → 404
    //   d) No profileId at all → first AppConfig profile with usable rules (normalized)
    //                            OR hardcoded default as final fallback
    //
    // Normalization ensures AppConfig JSON { categoryId } maps to engine's { currentClass }.
    // The engine always runs with real AQL rules — verdict is never trivially PASSED.
    // `validDbProfileId` is set separately and stays null for AppConfig-only profiles.

    let categories: any[]        = [];
    let defectDefinitions: any[] = [];
    let evaluationProfileId: string | null = null;

    if (profileId) {
      // Look up in AppConfig profiles
      let profile = profilesList.find((p: any) => p.id === profileId);

      // Sentinel for the UI-configured global standard default
      if (!profile && profileId === 'prof_default') {
        profile = HARDCODED_DEFAULT_PROFILE;
      }

      if (!profile) {
        res.status(404).json({ error: `InspectionProfile '${profileId}' not found.` });
        return;
      }

      const normalized  = normalizeForEngine(profile);
      categories        = normalized.categories;
      defectDefinitions = normalized.defectDefinitions;
      evaluationProfileId = String(profile.id);
    }

    // Safety net: no profileId was resolved, or the resolved profile has no usable rules.
    // Use the first AppConfig profile that has valid rules, or the hardcoded default.
    if (categories.length === 0 || !categories.some((c) => c.aqlLevel && c.evaluationMode)) {
      const usableAppConfigProfile = profilesList.find(hasUsableRules) ?? null;
      if (usableAppConfigProfile) {
        const normalized  = normalizeForEngine(usableAppConfigProfile);
        categories        = normalized.categories;
        defectDefinitions = normalized.defectDefinitions;
        evaluationProfileId = String(usableAppConfigProfile.id);
      } else {
        const normalized  = normalizeForEngine(HARDCODED_DEFAULT_PROFILE);
        categories        = normalized.categories;
        defectDefinitions = normalized.defectDefinitions;
        evaluationProfileId = 'prof_default';
      }
    }

    // ── 5. Run native AQL verdict engine ──────────────────────────────────────
    const { verdict, categoryResults } = evaluateAQLVerdict({
      sampleSize,
      categories,
      defectDefinitions,
      defectCounts,
    });

    console.log(
      `[POST /api/submissions] profile=${evaluationProfileId ?? 'none'} ` +
      `sampleSize=${sampleSize} verdict=${verdict} ` +
      `cats=${categories.length} ` +
      `defects=${JSON.stringify(defectCounts)}`,
    );

    // ── 6. Resolve validDbProfileId — only set if profile exists in the DB table ─
    // Prevents Prisma FK constraint errors from AppConfig-only profiles.
    let validDbProfileId: string | null = null;
    if (profileId) {
      const existsInDb = await prisma.inspectionProfile.findUnique({ where: { id: profileId } });
      if (existsInDb) validDbProfileId = profileId;
    }

    // ── 7. Insert into Database ───────────────────────────────────────────────
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
// Commits the proposed newValues to the Submission record.
// Sets amendmentStatus → 'APPROVED' on both the Submission and AmendmentLog.
// The reviewer is mocked until Azure AD integration is complete.
amendmentsRouter.post('/:id/approve', async (req: Request, res: Response) => {
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

    const now = new Date().toISOString();

    // 3. Transaction: apply newValues to the Submission + mark both as APPROVED
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
          ...(newValues['verdict']              != null && { verdict:             String(newValues['verdict']) }),
          ...(newValues['totalCarton']          != null && { totalCarton:         Number(newValues['totalCarton']) }),
          ...(newValues['gloveWeight']          != null && { gloveWeight:         parseFloat(String(newValues['gloveWeight'])) }),
          ...(newValues['profileId']            != null && { profileId:           String(newValues['profileId']) }),
        },
      }),
      prisma.amendmentLog.update({
        where: { id: amendmentLog.id },
        data: {
          status:     'APPROVED',
          reviewedBy: 'executive@oneglove.com', // Mock until Azure AD integration
          reviewedAt: now,
        },
      }),
    ]);

    res.json({
      message: 'Amendment approved and merged successfully.',
      submission: updatedSubmission,
      amendmentLog: updatedLog,
    });
  } catch (err) {
    console.error('[POST /api/amendments/:id/approve]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ── POST /api/amendments/:id/reject ───────────────────────────────────────
// Discards the draft amendment. Sets amendmentStatus → 'REJECTED'.
amendmentsRouter.post('/:id/reject', async (req: Request, res: Response) => {
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
