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
// resolveProductRegistry lives in lib/productEntry.ts as of B4 — shared with
// the grading engine (resolveVerdict.ts) so both read the registry through
// exactly one implementation and one fallback policy.
import { buildProductsMap, resolveProductRegistry } from '../lib/productEntry';
import type { ProductsMap } from '../lib/productEntry';

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
 * Collects dotted-path differences between two JSON-shaped values (used to
 * diff one product's stored ProductConfig against an incoming one). Walks
 * plain objects/arrays recursively; any other value type is compared with
 * ===, so e.g. '240' vs 240 or '240' vs '241' both register as a diff.
 */
function diffValues(current: unknown, incoming: unknown, path: string, out: string[]): void {
  if (current === incoming) return;
  const currentIsObj = current !== null && typeof current === 'object';
  const incomingIsObj = incoming !== null && typeof incoming === 'object';
  if (currentIsObj && incomingIsObj) {
    const keys = new Set([...Object.keys(current as object), ...Object.keys(incoming as object)]);
    for (const key of keys) {
      diffValues((current as any)[key], (incoming as any)[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }
  out.push(path);
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
 *
 * B3: productCodes/productMatrixConfig/productProfileMap are now DERIVED from
 * `products` rather than read from their own columns. Values are unchanged —
 * only their source is. `products` itself is also exposed now, so the admin UI
 * (ProductEngine.tsx) can read the consolidated structure directly. That
 * deliberately supersedes Session A's "GET must not expose products"
 * constraint, which existed only because nothing read it yet.
 */
export function formatAppConfig(config: AppConfig) {
  const registry = resolveProductRegistry(config);
  return {
    id: config.id,
    companyName: config.companyName,
    portalTitle: config.portalTitle,
    logoImage: config.logoImage,
    accentColor: config.accentColor,
    productCodes: registry.productCodes,
    lines: safeParseJSON<{ id: string; name: string }[]>(config.lines, []),
    shifts: safeParseJSON<{ id: string; name: string; startHour: number; startMinute: number; durationHours: number }[]>(config.shifts, []),
    sides: safeParseJSON<{ id: string; name: string }[]>(config.sides, []),
    sizes: safeParseJSON<string[]>(config.sizes, []),
    sampleSizes: safeParseJSON<number[]>(config.sampleSizes, []),
    productProfileMap: registry.productProfileMap,
    skuMaterials: safeParseJSON<{ value: string; label: string }[]>(config.skuMaterials, []),
    skuWeights: safeParseJSON<{ value: string; label: string }[]>(config.skuWeights, []),
    skuColors: safeParseJSON<{ value: string; label: string }[]>(config.skuColors, []),
    skuTreatments: safeParseJSON<{ value: string; label: string }[]>(config.skuTreatments, []),
    skuLengths: safeParseJSON<{ value: string; label: string }[]>(config.skuLengths, []),
    skuTextures: safeParseJSON<{ value: string; label: string }[]>(config.skuTextures, []),
    dimensions: safeParseJSON<any[]>(config.dimensions, []),
    targetWeight: safeParseJSON<{ target: number; tolerance: number }>(config.targetWeight, { target: 0, tolerance: 0 }),
    productMatrixConfig: registry.productMatrixConfig,
    aqlCategories: safeParseJSON<any[]>(config.aqlCategories, []),
    defectDefinitions: safeParseJSON<any[]>(config.defectDefinitions, []),
    inspectionProfiles: safeParseJSON<any[]>(config.inspectionProfiles, []),
    /**
     * The consolidated per-product-code structure — now the read source of
     * truth for the admin/config surface (ProductEngine.tsx). Exposed as of
     * B3; the three fields above are projections of it, kept in the response
     * so every existing consumer (the wizard, in particular) is untouched by
     * this cutover.
     */
    products: safeParseJSON<ProductsMap>(config.products, {}),
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

    // True when this PATCH touches any of the three legacy product structures —
    // which is also exactly when the `products` mirror below has to be rebuilt.
    const touchesProductStructures =
      Array.isArray(payload.productCodes) ||
      payload.productMatrixConfig !== undefined ||
      payload.productProfileMap !== undefined;

    // Shared across the two lock-related checks and the `products` write-hook
    // below — only fetched once. productProfileMap was added to the condition
    // for the write-hook's benefit (the two lock checks don't consult it);
    // both of those checks are independently gated by their own `if` and read
    // through `currentConfig?.` with a parse fallback, so widening when this
    // is fetched cannot change their behavior.
    const currentConfig = touchesProductStructures
      ? await prisma.appConfig.findUnique({ where: { id: '1' } })
      : null;

    // B3: the two lock checks below now read the CURRENT registry through
    // `products` (same resolver, and therefore same fallback behavior, as
    // GET /api/config) instead of off the legacy columns directly. Values are
    // identical — B2 keeps the two byte-identical on every write — so neither
    // check's decisions change; they simply consult one source of truth.
    // Deriving once here also means both checks provably see the same view,
    // rather than each parsing its own column independently.
    const currentRegistry = currentConfig ? resolveProductRegistry(currentConfig) : null;

    // Reject removal of any product code still referenced by a real Submission.
    // productCodes is a flat JSON string[] with no DB-level FK to Submission, so
    // this is the only enforcement point — a client could otherwise send a
    // PATCH that silently drops a code still in use (see Product Engine
    // discovery report §5). Must run before the JSON_FIELDS write-through below.
    if (Array.isArray(payload.productCodes)) {
      const currentCodes = currentRegistry?.productCodes ?? [];
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

    // Reject any change to a locked product code's dimension/size matrix.
    // The productCodes-removal check above only guarded against deleting a
    // locked code's registry entry — it did not stop editing that code's
    // productMatrixConfig[code] in place, which is the same integrity hole
    // (a LIVE submission's frozen grading context must never be able to
    // drift from the config that produced it). Diffs against the currently
    // stored entry rather than just checking presence, since a save of an
    // unrelated (unlocked) product legitimately re-sends every product's
    // unchanged entry in the same payload (see ProductEngine.tsx's
    // triggerChange, which always sends the whole productMatrixConfig).
    if (payload.productMatrixConfig !== undefined && typeof payload.productMatrixConfig === 'object') {
      const currentMatrix = currentRegistry?.productMatrixConfig ?? {};
      const usage = await getProductCodeUsage();
      const lockedChanges: { productCode: string; submissionCount: number; changedFields: string[] }[] = [];

      for (const [productCode, incomingEntry] of Object.entries(payload.productMatrixConfig as Record<string, any>)) {
        const submissionCount = usage[productCode] ?? 0;
        if (submissionCount === 0) continue;

        const changedFields: string[] = [];
        diffValues(currentMatrix[productCode], incomingEntry, '', changedFields);
        if (changedFields.length > 0) {
          lockedChanges.push({ productCode, submissionCount, changedFields });
        }
      }

      if (lockedChanges.length > 0) {
        res.status(409).json({
          error: 'Cannot modify dimension/size configuration for product code(s) referenced by existing submissions',
          lockedProductCodes: lockedChanges,
        });
        return;
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

    // ── Keep AppConfig.products in sync (Session B2) ──────────────────────────
    // The consolidated per-product-code structure (see lib/productEntry.ts) had
    // no automated write path: it was only ever as fresh as the last manual
    // re-run of scripts/migrate-products-field.ts, so any edit made through
    // this endpoint in between runs silently drifted it out of sync. This hook
    // closes that gap.
    //
    // Deliberately placed AFTER every existing validation and lock check above
    // (delete-safety 409, locked-code matrix diff 409, non-numeric target 400)
    // and AFTER the JSON_FIELDS loop — so it can only ever run on a payload
    // that has already fully passed, and mirrors the exact values those checks
    // approved. It adds no rules of its own and cannot admit a write the
    // legacy structures would have rejected.
    //
    // Atomic by construction: this only adds a field to `updateData`, which the
    // single upsert below writes in one statement. `products` can never land
    // without the legacy structures it mirrors, or vice versa.
    if (touchesProductStructures) {
      // Read the FINAL values — what this PATCH is actually about to persist.
      // updateData holds the already-normalized JSON string for any of the
      // three present in the payload; anything absent keeps its stored value.
      const finalCodes = safeParseJSON<string[]>(
        updateData['productCodes'] ?? currentConfig?.productCodes, [],
      );
      const finalMatrix = safeParseJSON<Record<string, any>>(
        updateData['productMatrixConfig'] ?? currentConfig?.productMatrixConfig, {},
      );
      const finalProfileMap = safeParseJSON<Record<string, string>>(
        updateData['productProfileMap'] ?? currentConfig?.productProfileMap, {},
      );
      // Read only so per-code attributes survive — they have no legacy source.
      const existingProducts = safeParseJSON<ProductsMap>(currentConfig?.products, {});

      updateData['products'] = JSON.stringify(
        buildProductsMap(finalCodes, finalMatrix, finalProfileMap, existingProducts),
      );
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
