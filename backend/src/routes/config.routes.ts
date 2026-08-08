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

    res.json(formatAppConfig(config));
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

    res.json(formatAppConfig(updatedConfig));
  } catch (error) {
    console.error('[PATCH /api/config] Error:', error);
    res.status(500).json({ error: 'Failed to update system configuration', details: error?.message || String(error) });
  }
});

export default router;
