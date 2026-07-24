/**
 * @file submissions.ts
 * @description Express router for AQL inspection submission endpoints.
 *
 * Endpoints:
 *
 *  POST /api/submissions/evaluate
 *    Stateless evaluation — calculates PASS/FAIL verdict without writing to DB.
 *    Ideal for Postman / curl testing and frontend verdict preview.
 *
 *  POST /api/submissions
 *    Full submission: evaluates verdict + persists to SQLite via Prisma.
 *    Requires an existing InspectionProfile in the DB (profileId field).
 *
 *  GET  /api/submissions
 *    Returns the 50 most recent submissions (paginated in Phase 5).
 *
 *  GET  /api/submissions/:id
 *    Returns a single submission with amendment logs and profile details.
 */

import { Router, Request, Response } from 'express';
import { evaluateAQLVerdict } from '../engine/evaluateAQLVerdict';
import prisma from '../lib/prismaClient';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions/evaluate  (STATELESS — no DB write)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stateless AQL evaluation endpoint.
 *
 * Request body (JSON):
 * {
 *   "sampleSize": 125,
 *   "categories": [
 *     { "id": "cat-1", "name": "Barrier Defects", "aqlLevel": "AND (Zero Tolerance)", "evaluationMode": "GRANULAR" },
 *     { "id": "cat-2", "name": "Major Visual",    "aqlLevel": "2.5",                   "evaluationMode": "CUMULATIVE" }
 *   ],
 *   "defectDefinitions": [
 *     { "id": "def-1", "name": "Pinhole",       "currentClass": "cat-1" },
 *     { "id": "def-2", "name": "Colour Streak", "currentClass": "cat-2" }
 *   ],
 *   "defects": {
 *     "def-1": 0,
 *     "def-2": 6
 *   }
 * }
 *
 * Response (JSON):
 * {
 *   "verdict": "FAILED",
 *   "categoryResults": [ ... ]
 * }
 */
router.post('/evaluate', (req: Request, res: Response) => {
  try {
    const { sampleSize, categories, defectDefinitions, defects } = req.body as {
      sampleSize: unknown;
      categories: unknown;
      defectDefinitions: unknown;
      defects: unknown;
    };

    // ── Validation ────────────────────────────────────────────────────────────
    const missing: string[] = [];
    if (sampleSize === undefined || sampleSize === null) missing.push('sampleSize');
    if (!Array.isArray(categories)) missing.push('categories (must be array)');
    if (!Array.isArray(defectDefinitions)) missing.push('defectDefinitions (must be array)');
    if (typeof defects !== 'object' || defects === null || Array.isArray(defects))
      missing.push('defects (must be object)');

    if (missing.length > 0) {
      res.status(400).json({
        error: 'Missing or malformed required fields',
        missing,
      });
      return;
    }

    // ── Evaluate ──────────────────────────────────────────────────────────────
    const result = evaluateAQLVerdict({
      sampleSize: Number(sampleSize),
      categories: categories as Parameters<typeof evaluateAQLVerdict>[0]['categories'],
      defectDefinitions: defectDefinitions as Parameters<typeof evaluateAQLVerdict>[0]['defectDefinitions'],
      defectCounts: defects as Record<string, number>,
    });

    res.status(200).json(result);
  } catch (err) {
    console.error('[POST /api/submissions/evaluate]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions  (PERSISTED — writes to SQLite)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;

    // ── Validate required fields ──────────────────────────────────────────────
    const required = [
      'productCode', 'productionDate', 'samplingTime',
      'machineId', 'shift', 'batchNumber', 'size', 'sampleSize',
      'dimensions', 'dimensionMins', 'defects',
      'aadObjectId', 'userPrincipalName',
    ];
    const missing = required.filter((f) => body[f] === undefined || body[f] === null);
    if (missing.length > 0) {
      res.status(400).json({ error: 'Missing required fields', missing });
      return;
    }

    const sampleSize = Number(body['sampleSize']);
    const defectCounts = body['defects'] as Record<string, number>;

    // ── Fetch InspectionProfile (if provided) for evaluation ─────────────────
    let categories: Parameters<typeof evaluateAQLVerdict>[0]['categories'] = [];
    let defectDefinitions: Parameters<typeof evaluateAQLVerdict>[0]['defectDefinitions'] = [];

    const profileId = body['profileId'] as string | undefined;
    if (profileId) {
      const profile = await prisma.inspectionProfile.findUnique({
        where: { id: profileId },
        include: { aqlCategories: true, defectDefinitions: true },
      });
      if (!profile) {
        res.status(404).json({ error: `InspectionProfile '${profileId}' not found.` });
        return;
      }
      categories = profile.aqlCategories.map((c: { id: string; name: string; aqlLevel: string; evaluationMode: string }) => ({
        id: c.id,
        name: c.name,
        aqlLevel: c.aqlLevel,
        evaluationMode: c.evaluationMode as 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '',
      }));
      defectDefinitions = profile.defectDefinitions.map((d: { id: string; name: string; currentClass: string }) => ({
        id: d.id,
        name: d.name,
        currentClass: d.currentClass,
      }));
    }

    // ── Run verdict engine ────────────────────────────────────────────────────
    const { verdict, categoryResults } = evaluateAQLVerdict({
      sampleSize,
      categories,
      defectDefinitions,
      defectCounts,
    });

    // ── Persist submission ────────────────────────────────────────────────────
    const submission = await prisma.submission.create({
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
        totalCarton:         body['totalCarton'] != null ? Number(body['totalCarton']) : null,
        gloveWeight:         body['gloveWeight']  != null ? Number(body['gloveWeight'])  : null,
        profileId:           profileId ?? null,
      },
    });

    res.status(201).json({ submission, verdict, categoryResults });
  } catch (err) {
    console.error('[POST /api/submissions]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/submissions  (list, most recent 50)
// ─────────────────────────────────────────────────────────────────────────────

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

export default router;
