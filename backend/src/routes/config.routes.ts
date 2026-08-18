/**
 * @file config.routes.ts
 * @description Express REST endpoints for Quality Inspection v4.0 System Configuration.
 *
 * Provides GET /api/config and PATCH /api/config interacting directly with
 * the AppConfig singleton model in SQLite via PrismaClient.
 *
 * Level 1 System Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 * Level 2 Feature Spec: v4_optimized_blueprint.md & implementation_plan.md
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prismaClient';
import type { AppConfig } from '../../generated/prisma/client';
import { requireRole } from '../middleware/auth';

const router = Router();

/** JSON field names on AppConfig model that store arrays or objects */
const JSON_FIELDS = [
  'productCodes',
  'lines',
  'shifts',
  'sides',
  'sizes',
  'sampleSizes',
  'productProfileMap',
  'skuMaterials',
  'skuWeights',
  'skuColors',
  'skuTreatments',
  'skuLengths',
  'skuTextures',
  'dimensions',
  'targetWeight',
  'productMatrixConfig',
  'aqlCategories',
  'defectDefinitions',
  'inspectionProfiles',
] as const;

type JsonFieldName = (typeof JSON_FIELDS)[number];

/**
 * Safely parses a JSON string or returns fallback value.
 */
function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Product codes are plain JSON-blob strings on AppConfig, with no FK to
 * Submission — this computes the real, current lock state on demand
 * (a product code with >=1 referencing Submission is "locked") instead of
 * storing a flag that could drift out of sync. See §5 of the Product Engine
 * discovery report.
 */
async function getProductCodeUsage(): Promise<Record<string, number>> {
  const usage = await prisma.submission.groupBy({
    by: ['productCode'],
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of usage) {
    result[row.productCode] = row._count._all;
  }
  return result;
}

/**
 * A clean numeric string: digits and an optional single decimal point (e.g.
 * '105', '105.5', '.5'), or empty/unset (a size row may legitimately have no
 * target yet — see hasUsableProductMatrix()). Mirrors what the frontend's
 * formatTarget() in ProductConfigAccordion.tsx can actually produce now that
 * it strips non-numeric characters on keystroke — this is the server-side
 * backstop for the same fields in case a client bypasses that UI.
 */
const NUMERIC_TARGET_RE = /^\d*\.?\d*$/;

function isValidNumericTarget(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  return NUMERIC_TARGET_RE.test(value) && /\d/.test(value);
}

interface InvalidTargetField {
  productCode: string;
  size: string;
  field: string;
  value: unknown;
}

/**
 * Validates weightTarget/lengthTarget/palmWidthTarget and dynamic-dimension
 * minSpec across every product/size in an incoming productMatrixConfig
 * payload — the four fields dimensionEvaluator.ts reads directly as grading
 * thresholds (see Product Engine discovery report §3). Tolerance fields are
 * intentionally out of scope here: they already went through the frontend's
 * formatTolerance() sanitizer before this validation existed and are not
 * read the same way (they also carry the 'MIN' sentinel, which this numeric
 * check would wrongly reject).
 */
function validateProductMatrixConfig(matrix: unknown): InvalidTargetField[] {
  const errors: InvalidTargetField[] = [];
  if (!matrix || typeof matrix !== 'object') return errors;

  for (const [productCode, conf] of Object.entries(matrix as Record<string, any>)) {
    const sizes = conf?.sizes;
    if (!sizes || typeof sizes !== 'object') continue;

    for (const [size, sizeEntry] of Object.entries(sizes as Record<string, any>)) {
      for (const field of ['weightTarget', 'lengthTarget', 'palmWidthTarget'] as const) {
        const value = sizeEntry?.[field];
        if (!isValidNumericTarget(value)) errors.push({ productCode, size, field, value });
      }

      const dimensions = sizeEntry?.dimensions;
      if (dimensions && typeof dimensions === 'object') {
        for (const [dimId, dimValue] of Object.entries(dimensions as Record<string, any>)) {
          const minSpec = (dimValue as any)?.minSpec;
          if (!isValidNumericTarget(minSpec)) {
            errors.push({ productCode, size, field: `dimensions.${dimId}.minSpec`, value: minSpec });
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Formats a raw Prisma AppConfig database record into a clean, parsed DTO.
 */
export function formatAppConfig(config: AppConfig) {
  return {
    id: config.id,
    companyName: config.companyName,
    portalTitle: config.portalTitle,
    logoImage: config.logoImage,
    accentColor: config.accentColor,
    productCodes: safeParseJSON<string[]>(config.productCodes, []),
    lines: safeParseJSON<{ id: string; name: string }[]>(config.lines, []),
    shifts: safeParseJSON<{ id: string; name: string; startHour: number; startMinute: number; durationHours: number }[]>(config.shifts, []),
    sides: safeParseJSON<{ id: string; name: string }[]>(config.sides, []),
    sizes: safeParseJSON<string[]>(config.sizes, []),
    sampleSizes: safeParseJSON<number[]>(config.sampleSizes, []),
    productProfileMap: safeParseJSON<Record<string, string>>(config.productProfileMap, {}),
    skuMaterials: safeParseJSON<{ value: string; label: string }[]>(config.skuMaterials, []),
    skuWeights: safeParseJSON<{ value: string; label: string }[]>(config.skuWeights, []),
    skuColors: safeParseJSON<{ value: string; label: string }[]>(config.skuColors, []),
    skuTreatments: safeParseJSON<{ value: string; label: string }[]>(config.skuTreatments, []),
    skuLengths: safeParseJSON<{ value: string; label: string }[]>(config.skuLengths, []),
    skuTextures: safeParseJSON<{ value: string; label: string }[]>(config.skuTextures, []),
    dimensions: safeParseJSON<any[]>(config.dimensions, []),
    targetWeight: safeParseJSON<{ target: number; tolerance: number }>(config.targetWeight, { target: 0, tolerance: 0 }),
    productMatrixConfig: safeParseJSON<Record<string, any>>(config.productMatrixConfig, {}),
    aqlCategories: safeParseJSON<any[]>(config.aqlCategories, []),
    defectDefinitions: safeParseJSON<any[]>(config.defectDefinitions, []),
    inspectionProfiles: safeParseJSON<any[]>(config.inspectionProfiles, []),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/config
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Fetches current system configuration. Auto-creates default singleton row if missing.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    let config = await prisma.appConfig.findUnique({
      where: { id: '1' },
    });

    if (!config) {
      config = await prisma.appConfig.create({
        data: {
          id: '1',
          companyName: 'QUALITY INSPECTION',
          portalTitle: 'QI Portal v4.0',
          accentColor: 'emerald',
          sizes: JSON.stringify(['XS', 'S', 'M', 'L', 'XL']),
          sampleSizes: JSON.stringify([13, 20, 32, 50, 80, 125, 200, 315, 500]),
          shifts: JSON.stringify([
            { id: 'S1', name: 'Shift A (Morning)', startHour: 8, startMinute: 0, durationHours: 12 },
            { id: 'S2', name: 'Shift B (Night)', startHour: 20, startMinute: 0, durationHours: 12 },
          ]),
          sides: JSON.stringify([
            { id: 'A', name: 'Outer (Side A)' },
            { id: 'Z', name: 'Inner (Side Z)' },
          ]),
          lines: JSON.stringify([
            { id: 'L1', name: 'Line 1' },
            { id: 'L2', name: 'Line 2' },
          ]),
        },
      });
    }

    res.json({
      ...formatAppConfig(config),
      productCodeUsage: await getProductCodeUsage(),
    });
  } catch (error) {
    console.error('[GET /api/config] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve system configuration' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/config
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Updates system configuration parameters in the AppConfig singleton.
 * Automatically serializes arrays and objects into JSON strings before DB save.
 */
router.patch('/', requireRole('EXECUTIVE', 'MANAGER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const updateData: Record<string, any> = {};

    // Reject removal of any product code still referenced by a real Submission.
    // productCodes is a flat JSON string[] with no DB-level FK to Submission, so
    // this is the only enforcement point — a client could otherwise send a
    // PATCH that silently drops a code still in use (see Product Engine
    // discovery report §5). Must run before the JSON_FIELDS write-through below.
    if (Array.isArray(payload.productCodes)) {
      const currentConfig = await prisma.appConfig.findUnique({ where: { id: '1' } });
      const currentCodes = safeParseJSON<string[]>(currentConfig?.productCodes, []);
      const newCodes: string[] = payload.productCodes;
      const removedCodes = currentCodes.filter((c) => !newCodes.includes(c));

      if (removedCodes.length > 0) {
        const usage = await prisma.submission.groupBy({
          by: ['productCode'],
          where: { productCode: { in: removedCodes } },
          _count: { _all: true },
        });

        if (usage.length > 0) {
          const lockedProductCodes = usage.map((u) => ({
            productCode: u.productCode,
            submissionCount: u._count._all,
          }));
          res.status(409).json({
            error: 'Cannot remove product code(s) referenced by existing submissions',
            lockedProductCodes,
          });
          return;
        }
      }
    }

    // Reject non-numeric target-field values (weightTarget/lengthTarget/
    // palmWidthTarget/dimension minSpec) — these feed dimensionEvaluator.ts's
    // grading math directly, unlike the six SKU dictionary attributes. The
    // frontend now strips non-numeric characters on keystroke (see
    // ProductConfigAccordion.tsx's formatTarget), but PATCH /api/config has
    // no other guard against a client that bypasses the UI entirely.
    if (payload.productMatrixConfig !== undefined) {
      const invalidFields = validateProductMatrixConfig(payload.productMatrixConfig);
      if (invalidFields.length > 0) {
        res.status(400).json({
          error: 'productMatrixConfig contains non-numeric target value(s)',
          invalidFields,
        });
        return;
      }
    }

    // String / scalar fields
    if (typeof payload.companyName === 'string') updateData['companyName'] = payload.companyName;
    if (typeof payload.portalTitle === 'string') updateData['portalTitle'] = payload.portalTitle;
    if (payload.logoImage !== undefined) updateData['logoImage'] = payload.logoImage;
    if (typeof payload.accentColor === 'string') updateData['accentColor'] = payload.accentColor;

    // JSON fields (serialize arrays/objects if provided)
    for (const field of JSON_FIELDS) {
      if (payload[field] !== undefined) {
        if (typeof payload[field] === 'string') {
          updateData[field] = payload[field];
        } else {
          updateData[field] = JSON.stringify(payload[field]);
        }
      }
    }

    const updatedConfig = await prisma.appConfig.upsert({
      where: { id: '1' },
      update: updateData,
      create: {
        id: '1',
        ...updateData,
      },
    });

    res.json({
      ...formatAppConfig(updatedConfig),
      productCodeUsage: await getProductCodeUsage(),
    });
  } catch (error) {
    console.error('[PATCH /api/config] Error:', error);
    res.status(500).json({
      error: 'Failed to update system configuration',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
