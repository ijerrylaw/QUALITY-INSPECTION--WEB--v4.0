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
import { ProfileRegistrySyncError, syncProfileRegistry } from '../lib/profileRegistrySync';
import type { SourceProfile } from '../lib/profileRegistrySync';
import { loadProfileRulesMap } from '../engine/profileRules';
import type { AppConfig } from '../../generated/prisma/client';
import { requireRole } from '../middleware/auth';
import { logAccess } from '../lib/accessLog';
// resolveProductRegistry lives in lib/productEntry.ts as of B4 — shared with
// the grading engine (resolveVerdict.ts) so both read the registry through
// exactly one implementation.
import { buildProductsMap, resolveProductRegistry } from '../lib/productEntry';
import type { ProductsMap, ProductConfig } from '../lib/productEntry';

const router = Router();

/**
 * JSON field names on AppConfig model that store arrays or objects.
 *
 * B6 — productCodes / productMatrixConfig / productProfileMap are deliberately
 * ABSENT from this list. Those three DB columns stopped being written at B6:
 * the consolidated `products` column is the sole write target for the product
 * registry (see the PATCH handler below). The columns themselves were later
 * DROPPED from the schema entirely (AUDIT_REPORT.md #37 Part 2) once
 * resolveProductRegistry()'s unmigrated-database fallback — their last
 * reader — was confirmed no longer needed and removed.
 *
 * The API contract is unchanged: PATCH still ACCEPTS those three field names in
 * the request body, and GET still RETURNS them (projected out of `products`).
 * Only where they land in storage has changed.
 *
 * Stage A — `inspectionProfiles` is now ABSENT for the same reason. Since
 * Stage 2 the grading engine reads categories/defects from the registry
 * tables (Category / Defect / ProfileCategory / ProfileCategoryDefect), and
 * Stage A0 moved profile IDENTITY onto the Profile table; the PATCH handler
 * projects the incoming payload into both via syncProfileRegistry(). Nothing
 * reads the AppConfig.inspectionProfiles column any more, so it is left in
 * place and frozen at its last-written value (schema-column drop is Stage B).
 * PATCH still ACCEPTS the `inspectionProfiles` key in the request body — it is
 * the sync input — and GET still RETURNS `inspectionProfiles`, reconstructed
 * from Profile + the registry tables by reconstructInspectionProfiles().
 *
 * `aqlCategories` / `defectDefinitions` are now ABSENT for the same reason as
 * `inspectionProfiles` above — same shape of cleanup, one stage at a time.
 * These are the root-level legacy columns (AUDIT_REPORT.md #37): every real
 * reader consumes the per-profile nested `profile.aqlCategories` /
 * `.defectDefinitions`, reconstructed from the Category/Defect/ProfileCategory
 * registry by reconstructInspectionProfiles() above — nothing has read the
 * root-level columns since the Master Defect List Stage 2 engine cutover.
 * Left in place and frozen at their last-written value (both already `[]`);
 * schema-column drop is a separately-scoped future stage. PATCH still ACCEPTS
 * both key names in the request body (silently ignored, matching how any
 * unrecognized payload key behaves) and GET still RETURNS them, unchanged,
 * straight off the frozen columns (`config.routes.ts`'s `formatAppConfig()`).
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

/** One category rejected by validateInspectionProfiles(). */
interface UnsetEvalModeCategory {
  profileId: string;
  profileName: string;
  categoryId: string;
  categoryName: string;
}

/**
 * Rejects any inspection profile carrying a category with NO evaluation mode
 * (AUDIT_REPORT.md #17). Before this existed, such a category was silently
 * normalised to CUMULATIVE client-side and behaved as a real quantitative mode
 * without anyone having chosen it.
 *
 * Deliberately narrow — this rejects ONLY a genuinely absent value:
 *   - `''`    is VALID (RECORD ONLY / true exclusion, aqlEvaluator.ts's skip path)
 *   - `'N/A'` is VALID (qualitative PASS/FAIL)
 * Treating `''` as missing here would break the entire RECORD ONLY feature.
 * Both field spellings are checked (`evaluationMode` from the seeds/engine,
 * `evalMode` from real admin-authored saves) — checking one would reject every
 * genuine save from QualityRules.tsx.
 *
 * FORWARD-ONLY, by design: nothing is backfilled or rewritten. A pre-existing
 * profile with an unset mode keeps working for grading (resolveVerdict.ts still
 * has its own fallbacks) and is simply refused the next time someone tries to
 * SAVE it — with QualityRules.tsx's amber "NOT SET" badge showing which category
 * to fix first.
 */
function validateInspectionProfiles(profiles: unknown): UnsetEvalModeCategory[] {
  const errors: UnsetEvalModeCategory[] = [];
  if (!Array.isArray(profiles)) return errors;

  for (const profile of profiles as any[]) {
    const categories = profile?.aqlCategories;
    if (!Array.isArray(categories)) continue;

    for (const cat of categories) {
      // `??` not `||`, so a deliberate '' is preserved as a real value.
      const mode = cat?.evaluationMode ?? cat?.evalMode;
      if (mode === undefined || mode === null) {
        errors.push({
          profileId:    String(profile?.id ?? ''),
          profileName:  String(profile?.name ?? ''),
          categoryId:   String(cat?.id ?? ''),
          categoryName: String(cat?.name ?? ''),
        });
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
/**
 * Rebuilds the nested `inspectionProfiles` array for the GET/PATCH /api/config
 * response from the Profile table (identity: id, name, isDefault, order) plus
 * the registry tables (rules: category selection, per-profile AQL + evaluation
 * mode, defect membership) — instead of echoing the AppConfig.inspectionProfiles
 * JSON blob verbatim. Stage A0: the blob is still WRITTEN for now, but is no
 * longer the read source here, so the next stage can retire that write.
 *
 * The emitted shape is deliberately identical to what the blob produced:
 *   { id, name, isDefault,
 *     aqlCategories:     [{ id, name, aql, evalMode }],
 *     defectDefinitions: [{ id, name, categoryId }] }
 * `aql` / `evalMode` carry the same engine/admin dialect the blob stored
 * ('CUMULATIVE' | 'GRANULAR' | 'N/A' | '' for evalMode) — loadProfileRulesMap()
 * already returns exactly those values. A profile with no ProfileCategory rows
 * comes back with empty arrays, matching an empty-aqlCategories blob entry.
 *
 * Two known, signed-off departures from a byte-for-byte echo of the current
 * blob, both corrections rather than regressions (Stage A0 discovery):
 *   - FACTORY STANDARD: two VISUALS defects that had been appended to the tail
 *     of the flat defectDefinitions array (out of their category's run) now
 *     sort back into their category. Within-category order is unchanged.
 *   - MEDLINE: the orphaned legacy id `def_wet_glove` is emitted as the
 *     canonical `def_wet_glove_1` the grading engine already uses everywhere;
 *     zero stored submissions/amendments reference the old id.
 */
async function reconstructInspectionProfiles(): Promise<any[]> {
  const [profiles, rulesByProfile] = await Promise.all([
    prisma.profile.findMany({ orderBy: { sortOrder: 'asc' } }),
    loadProfileRulesMap(),
  ]);
  return profiles.map((p) => {
    const rules = rulesByProfile.get(p.id);
    return {
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      aqlCategories: (rules?.categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        aql: c.aqlLevel,
        evalMode: c.evaluationMode,
      })),
      defectDefinitions: (rules?.defectDefinitions ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        categoryId: d.categoryId,
      })),
    };
  });
}

export async function formatAppConfig(config: AppConfig) {
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
    inspectionProfiles: await reconstructInspectionProfiles(),
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
          accentColor: 'cobalt',
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
      ...(await formatAppConfig(config)),
      productCodeUsage: await getProductCodeUsage(),
    });
  } catch (error) {
    console.error('[GET /api/config] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve system configuration' });
  }
});

/**
 * Buckets a PATCH /api/config payload into the admin-UI section(s) it
 * touched, purely from which top-level keys are present — no diff engine,
 * per the AccessLog CONFIG_WRITE spec. Mirrors which ConfigPage.tsx/
 * SystemPage.tsx panel actually sends each field (see each panel's
 * triggerChange()/handleSave()). Joined with ", " on the rare request that
 * touches more than one bucket (shouldn't normally happen — each panel
 * saves independently — but a hand-crafted request could).
 */
const CONFIG_WRITE_SECTIONS: { label: string; keys: string[] }[] = [
  { label: 'Factory Setup', keys: ['lines', 'shifts', 'sides'] },
  { label: 'Quality Rules', keys: ['inspectionProfiles', 'sampleSizes', 'aqlCategories', 'defectDefinitions'] },
  {
    label: 'Product Engine',
    keys: [
      'productCodes', 'productMatrixConfig', 'productProfileMap', 'productAttributes',
      'skuMaterials', 'skuWeights', 'skuColors', 'skuTreatments', 'skuLengths', 'skuTextures',
      'dimensions', 'targetWeight', 'sizes',
    ],
  },
  { label: 'System Admin', keys: ['companyName', 'portalTitle', 'logoImage', 'accentColor'] },
];

function inferConfigWriteDetail(payload: Record<string, unknown>): string {
  const sections = CONFIG_WRITE_SECTIONS
    .filter((section) => section.keys.some((key) => payload[key] !== undefined))
    .map((section) => section.label);
  return sections.length > 0 ? sections.join(', ') : 'Configuration';
}

/**
 * Resolves the acting user's display name for a CONFIG_WRITE AccessLog row,
 * from the same `{ loginMethod, ... }` identity fragment `authIdentity(user)`
 * (frontend/src/context/AuthContext.tsx) already spreads into other write
 * payloads (e.g. ApprovalsQueue.tsx's approve/reject calls) — ConfigPage.tsx/
 * CompanyBrandingPanel.tsx now spread the same fragment into their PATCH
 * body. Best-effort only: unlike backend/src/lib/identity.ts's
 * resolveIdentity() (used by Submission/AmendmentLog writes), a missing/
 * malformed identity fragment here must never fail the config save itself —
 * it only means this one audit row's name comes back null.
 *
 * PATCH /api/config is Group A/B (MANAGER/ADMIN) only, and both are M365-only
 * roles (NAVIGATION_AND_RBAC.md §2) — the PIN branch can't be reached by any
 * route in this app today, but is still handled here for consistency with
 * the shared identity-fragment shape, the same way identity.ts does for both
 * login methods.
 */
async function resolveConfigWriterDisplayName(payload: Record<string, unknown>): Promise<string | null> {
  if (payload['loginMethod'] === 'PIN') {
    const pinUserId = typeof payload['pinUserId'] === 'string' ? payload['pinUserId'] : null;
    if (!pinUserId) return null;
    const pinUser = await prisma.pinUser.findUnique({ where: { id: pinUserId }, select: { name: true } });
    return pinUser?.name ?? null;
  }
  if (payload['loginMethod'] === 'M365') {
    const displayName = typeof payload['displayName'] === 'string' ? payload['displayName'].trim() : '';
    const userPrincipalName = typeof payload['userPrincipalName'] === 'string' ? payload['userPrincipalName'].trim() : '';
    // Same fallback order as identity.ts's displayNameOf(): a real name first,
    // the UPN if that's all we have, null otherwise.
    return displayName || userPrincipalName || null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/config
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Updates system configuration parameters in the AppConfig singleton.
 * Automatically serializes arrays and objects into JSON strings before DB save.
 */
router.patch('/', requireRole('MANAGER', 'ADMIN'), async (req: Request, res: Response) => {
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

    // The CURRENT registry, read through `products` (same resolver as
    // GET /api/config). Empty defaults rather than null so the first-run
    // create path needs no special casing — equivalent to the `?? []` / `?? {}`
    // the checks used before.
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

    // Reject any change to a locked product code's stored record — matrix,
    // attributes, AND profileId are ALL frozen together once a code is
    // referenced by a live submission. Originally (B6) this checked only
    // .matrix; attributes/profileId were a documented accepted gap, closed
    // here (2026-08-20) because a locked SOURCE code's attributes could be
    // silently overwritten as an incidental side effect of a request that
    // was nominally about a DIFFERENT code (e.g. Duplicate's
    // productAttributes payload, which is keyed by the NEW code but a
    // hand-crafted request can add any code's key to that same object).
    //
    // Diffs the WHOLE incoming ProductEntry ({ attributes, matrix, profileId
    // — see productEntry.ts}) against the currently stored one, rather than
    // just .matrix, so a change reaching a locked code through ANY of the
    // three fields is caught by the same check.
    //
    // Iterates every LOCKED code (from getProductCodeUsage()), not the set
    // of codes the payload's productMatrixConfig happened to mention. That
    // distinction is load-bearing: the old check's scope
    // (Object.keys(suppliedMatrix)) only ever included a locked code because
    // the real frontend always resends the FULL matrix map on every save. A
    // minimal bypass payload of just `{ productAttributes: { [lockedCode]:
    // {...} } }` — no productMatrixConfig key at all — would leave
    // suppliedMatrix empty and skip the locked code entirely under the old
    // scope, even though it demonstrably still writes to that code's stored
    // record. Gated on incomingProducts (i.e. touchesProductStructures)
    // rather than payload.productMatrixConfig specifically, for the same
    // reason.
    //
    // No false-positive risk from widening: buildProductsMap() reproduces an
    // untouched locked code's attributes/profileId bit-for-bit from
    // `existing` (see its own docs), so an honest resend of unchanged data —
    // the same pattern every save already relies on for unrelated codes'
    // matrices — still diffs to zero changedFields here.
    if (incomingProducts) {
      const usage = await getProductCodeUsage();
      const lockedChanges: { productCode: string; submissionCount: number; changedFields: string[] }[] = [];

      for (const [productCode, submissionCount] of Object.entries(usage)) {
        if (submissionCount === 0) continue;
        // Defensive, not load-bearing: the delete-safety check above already
        // guarantees a locked code is never absent from incomingProducts —
        // removing one from productCodes[] would have 409'd before this
        // point is ever reached.
        if (!(productCode in incomingProducts)) continue;

        const changedFields: string[] = [];
        diffValues(currentProducts[productCode], incomingProducts[productCode], '', changedFields);
        if (changedFields.length > 0) {
          lockedChanges.push({ productCode, submissionCount, changedFields });
        }
      }

      if (lockedChanges.length > 0) {
        res.status(409).json({
          error: 'Cannot modify configuration for product code(s) referenced by existing submissions (dimensions/sizes, attributes, and inspection profile link are all locked)',
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

    // ── Inspection profile validation (AUDIT_REPORT.md #17) ───────────────────
    // Every AQL category must carry an explicit evaluation mode. Runs only when
    // the payload actually supplies inspectionProfiles, so a PATCH touching an
    // unrelated field is never rejected because of a pre-existing bad profile —
    // same scoping rule as the productMatrixConfig check above.
    if (payload.inspectionProfiles !== undefined) {
      const rawProfiles = typeof payload.inspectionProfiles === 'string'
        ? safeParseJSON<any[]>(payload.inspectionProfiles as string, [])
        : payload.inspectionProfiles;

      const unsetEvalModes = validateInspectionProfiles(rawProfiles);
      if (unsetEvalModes.length > 0) {
        const detail = unsetEvalModes
          .map((c) => `"${c.categoryName || c.categoryId}" (profile "${c.profileName || c.profileId}")`)
          .join(', ');
        res.status(400).json({
          error:
            `Every defect category must have an Evaluation Mode set. ` +
            `Missing on: ${detail}.`,
          unsetEvalModes,
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
    // NOT written: the columns themselves were dropped from the schema
    // (AUDIT_REPORT.md #37 Part 2) — `products` is the only storage for the
    // product registry now.
    if (incomingProducts) {
      updateData['products'] = JSON.stringify(incomingProducts);
    }

    // ── Persist the config + project the grading tables ATOMICALLY ───────────
    // The AQL engine reads categories/defects from the global Master Defect
    // List + Category Inventory (engine/profileRules.ts) and profile identity
    // from the Profile table (Stage A0). As of Stage A this route NO LONGER
    // writes the inspectionProfiles JSON column (it is absent from JSON_FIELDS
    // above) — syncProfileRegistry() projecting the payload into the registry
    // tables + Profile is the sole write path. The AppConfig write below still
    // runs for the other fields a Quality Rules save can carry (e.g.
    // sampleSizes) and for any other section's PATCH.
    //
    // Both halves run inside one interactive transaction so they still move
    // together or not at all. Before this was transactional the JSON was
    // written first and the projection second, so a projection failure — a
    // locked defect dropped from its last remaining profile (CHANGELOG §45) —
    // left storage updated while the grading tables were not: a silent
    // split-brain where the UI showed one thing and the engine graded another,
    // with nothing forcing resolution and no audit-log entry that a write had
    // even been attempted. Now a ProfileRegistrySyncError thrown by the
    // projection propagates out of the callback and rolls the whole transaction
    // back with it — a rejected save changes nothing. The generous timeout
    // covers applyRegistryPlan()'s ~160 sequential upserts against local SQLite.
    let updatedConfig: AppConfig;
    try {
      updatedConfig = await prisma.$transaction(
        async (tx) => {
          const written = await tx.appConfig.upsert({
            where: { id: '1' },
            update: updateData,
            create: { id: '1', ...updateData },
          });

          if (payload.inspectionProfiles !== undefined) {
            const profilesForSync = coerceJSON<SourceProfile[]>(payload.inspectionProfiles, []);
            const plan = await syncProfileRegistry(profilesForSync, tx);
            for (const w of plan.warnings) {
              console.warn(`[PATCH /api/config] profile registry sync: ${w}`);
            }
          }

          return written;
        },
        { timeout: 20_000, maxWait: 5_000 },
      );
    } catch (txError) {
      if (txError instanceof ProfileRegistrySyncError) {
        console.error('[PATCH /api/config] Profile registry sync failed — nothing saved:', txError.message);
        // The whole transaction rolled back — the AppConfig write for any other
        // fields in this payload is undone too — but a save was demonstrably
        // attempted, and a rejected write that leaves no trace is itself worth
        // recording. Distinct action from CONFIG_WRITE: nothing changed.
        await logAccess(req, {
          userId: null,
          role: req.header('X-User-Role') ?? null,
          userDisplayName: await resolveConfigWriterDisplayName(payload),
          action: 'CONFIG_WRITE_FAILURE',
          detail: `${inferConfigWriteDetail(payload)} — rejected: ${txError.message}`,
        });
        res.status(409).json({
          error:
            'Your changes were NOT saved. The grading tables could not be updated to match, so nothing ' +
            'was changed — what you see and what the engine grades are still in step. Resolve the ' +
            'conflict below and save again.',
          details: txError.message,
        });
        return;
      }
      throw txError;
    }

    await logAccess(req, {
      userId: null,
      role: req.header('X-User-Role') ?? null,
      userDisplayName: await resolveConfigWriterDisplayName(payload),
      action: 'CONFIG_WRITE',
      detail: inferConfigWriteDetail(payload),
    });

    res.json({
      ...(await formatAppConfig(updatedConfig)),
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
