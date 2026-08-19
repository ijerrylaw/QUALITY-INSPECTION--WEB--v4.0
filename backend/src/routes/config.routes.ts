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
import type { ProductsMap, ProductConfig } from '../lib/productEntry';

const router = Router();

/**
 * JSON field names on AppConfig model that store arrays or objects.
 *
 * B6 — productCodes / productMatrixConfig / productProfileMap are deliberately
 * ABSENT from this list. Those three DB columns are no longer written: the
 * consolidated `products` column is now the sole write target for the product
 * registry (see the PATCH handler below). Their columns are left in place and
 * frozen at whatever value they held when B6 shipped — no schema migration —
 * and nothing reads them any more except resolveProductRegistry()'s
 * unmigrated-database fallback.
 *
 * The API contract is unchanged: PATCH still ACCEPTS those three field names in
 * the request body, and GET still RETURNS them (projected out of `products`).
 * Only where they land in storage has changed.
 */
const JSON_FIELDS = [
  'lines',
  'shifts',
  'sides',
  'sizes',
  'sampleSizes',
  'skuMaterials',
  'skuWeights',
  'skuColors',
  'skuTreatments',
  'skuLengths',
  'skuTextures',
  'dimensions',
  'targetWeight',
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
 * Normalizes a payload field that may arrive either as a real object/array or
 * as a pre-serialized JSON string.
 *
 * The JSON_FIELDS write loop has always tolerated both forms (`typeof === 'string'`
 * is written through verbatim, anything else is stringified), and the previous
 * write-hook then re-parsed whatever landed. B6 consumes these fields before the
 * write instead of after it, so that same tolerance has to be applied here to
 * keep string-form payloads behaving exactly as they did.
 */
function coerceJSON<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
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

    // True when this PATCH supplies any of the three legacy-shaped product
    // fields, OR the additive productAttributes field (duplicate+edit) —
    // which is exactly when the `products` registry has to be rebuilt and
    // re-validated below. The API still accepts the three legacy field names
    // unchanged (the request contract is unchanged); only their destination
    // has moved. productAttributes is new — see buildProductsMap()'s docs.
    const touchesProductStructures =
      Array.isArray(payload.productCodes) ||
      payload.productMatrixConfig !== undefined ||
      payload.productProfileMap !== undefined ||
      payload.productAttributes !== undefined;

    // Shared across the validation checks and the `products` write below —
    // only fetched once.
    const currentConfig = touchesProductStructures
      ? await prisma.appConfig.findUnique({ where: { id: '1' } })
      : null;

    // The CURRENT registry, read through `products` (same resolver, and
    // therefore same unmigrated-database fallback, as GET /api/config). Empty
    // defaults rather than null so the first-run create path needs no special
    // casing — equivalent to the `?? []` / `?? {}` the checks used before.
    const currentRegistry = currentConfig
      ? resolveProductRegistry(currentConfig)
      : { productCodes: [], productMatrixConfig: {}, productProfileMap: {} };
    const currentProducts = safeParseJSON<ProductsMap>(currentConfig?.products, {});

    // ── B6: build `products` FIRST, then validate against it ─────────────────
    // Previously this ran LAST, after the three legacy structures had been
    // validated and queued for writing, deriving `products` from them as a
    // mirror. Now the order is inverted: the incoming payload (still in the
    // legacy field shapes — the API contract is unchanged) is folded into one
    // authoritative in-memory `products` object up front, every check below
    // reads from that object, and it is the only thing persisted.
    //
    // Anything the payload does not supply falls back to the CURRENT value, so
    // a partial PATCH (e.g. only productMatrixConfig) leaves the rest intact —
    // exactly as the previous write-hook's `?? currentConfig?.<column>`
    // fallbacks did, but sourced through the registry resolver instead of the
    // raw columns (which are no longer written, and so must not be trusted as
    // a fallback source going forward).
    //
    // buildProductsMap() also preserves each code's `attributes` verbatim —
    // they have no legacy source and would otherwise be wiped.
    const incomingProducts: ProductsMap | null = touchesProductStructures
      ? buildProductsMap(
          Array.isArray(payload.productCodes)
            ? (payload.productCodes as string[])
            : currentRegistry.productCodes,
          payload.productMatrixConfig !== undefined
            ? coerceJSON<Record<string, ProductConfig>>(payload.productMatrixConfig, currentRegistry.productMatrixConfig)
            : currentRegistry.productMatrixConfig,
          payload.productProfileMap !== undefined
            ? coerceJSON<Record<string, string>>(payload.productProfileMap, currentRegistry.productProfileMap)
            : currentRegistry.productProfileMap,
          currentProducts,
          payload.productAttributes !== undefined
            ? coerceJSON<Record<string, unknown>>(payload.productAttributes, {})
            : undefined,
        )
      : null;

    /**
     * The matrix map the payload actually supplied, normalized. Used ONLY to
     * scope the two productMatrixConfig-gated checks below to the same set of
     * codes they examined before B6 — the values they compare are read from
     * `incomingProducts`, but WHICH codes get examined is unchanged.
     */
    const suppliedMatrix: Record<string, unknown> =
      payload.productMatrixConfig !== undefined
        ? coerceJSON<Record<string, unknown>>(payload.productMatrixConfig, {})
        : {};

    // Reject removal of any product code still referenced by a real Submission.
    // productCodes is a flat JSON string[] with no DB-level FK to Submission, so
    // this is the only enforcement point — a client could otherwise send a
    // PATCH that silently drops a code still in use (see Product Engine
    // discovery report §5). Must run before the JSON_FIELDS write-through below.
    if (Array.isArray(payload.productCodes) && incomingProducts) {
      const currentCodes = currentRegistry.productCodes;
      // B6: the resulting registry's keyset, read off the built `products`
      // object rather than the raw payload array. buildProductsMap() keys
      // strictly off productCodes[], so this is the same set the payload asked
      // for — just sourced from the object that will actually be persisted.
      const newCodes: string[] = Object.keys(incomingProducts);
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
    if (payload.productMatrixConfig !== undefined && typeof payload.productMatrixConfig === 'object' && incomingProducts) {
      const usage = await getProductCodeUsage();
      const lockedChanges: { productCode: string; submissionCount: number; changedFields: string[] }[] = [];

      // B6: both sides of the diff now come from `products` — the stored entry's
      // .matrix vs the built entry's .matrix. Deliberately still iterating the
      // codes the PAYLOAD supplied, not every code in `incomingProducts`, so the
      // set of codes examined is byte-for-byte the same as before B6 (per this
      // session's like-for-like scope decision). The `?? suppliedMatrix[...]`
      // fallback covers a code present in the matrix payload but absent from
      // productCodes[]: buildProductsMap() keys off productCodes[] and so would
      // not carry such a code, and this keeps the compared value identical to
      // what the pre-B6 check would have used.
      for (const productCode of Object.keys(suppliedMatrix)) {
        const submissionCount = usage[productCode] ?? 0;
        if (submissionCount === 0) continue;

        const changedFields: string[] = [];
        diffValues(
          currentProducts[productCode]?.matrix,
          incomingProducts[productCode]?.matrix ?? suppliedMatrix[productCode],
          '',
          changedFields,
        );
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
    if (payload.productMatrixConfig !== undefined && incomingProducts) {
      // B6: the values validated are read from the built `products` object
      // (entry.matrix), while the SET of codes validated stays scoped to what
      // the payload supplied — same rejection condition as before B6, just a
      // different in-memory source. Validating every code in `incomingProducts`
      // instead would newly reject a payload touching one product because of a
      // pre-existing bad value on an unrelated one.
      const matrixToValidate: Record<string, unknown> = {};
      for (const productCode of Object.keys(suppliedMatrix)) {
        matrixToValidate[productCode] =
          incomingProducts[productCode]?.matrix ?? suppliedMatrix[productCode];
      }

      const invalidFields = validateProductMatrixConfig(matrixToValidate);
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

    // ── Persist the product registry (B6) ─────────────────────────────────────
    // `products` is now the SOLE write target for the product registry. The
    // object was built at the top of this handler and every check above has
    // already passed against it, so this is a straight serialize — no second
    // derivation, and no path by which what was validated can differ from what
    // is stored.
    //
    // productCodes / productMatrixConfig / productProfileMap are intentionally
    // NOT written: they are absent from JSON_FIELDS, so their columns keep
    // whatever value they held when B6 shipped and are frozen from here on.
    if (incomingProducts) {
      updateData['products'] = JSON.stringify(incomingProducts);
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
