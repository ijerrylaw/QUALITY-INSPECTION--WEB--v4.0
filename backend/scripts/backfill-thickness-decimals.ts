/**
 * @file backfill-thickness-decimals.ts
 * @description One-off: Cuff/Palm/Finger/Beading Thickness dimensionDefs
 * entries were seeded/entered with `decimals: 2` ("0.00") across the product
 * catalog; the intended precision for these 4 fields is `decimals: 3`
 * ("0.000"). Pure display/rounding-precision correction — does NOT touch
 * target/tolerance values (those live separately, in each size's
 * `sizes[size].dimensions[dimId]`), `isGraded` state, or any other
 * dimension (Length/Palm Width/Weight decimals are untouched).
 *
 * Matches by normalized name (uppercased, whitespace-collapsed) — same
 * convention as `mergeCanonicalDimensionDefs()`/`isCanonicalThicknessDim()`
 * (frontend/src/context/ConfigContext.tsx, backend/src/engine/
 * dimensionEvaluator.ts) — NOT by id, since at least one product
 * (N035MNV-OC-24FT) has known mismatched ids/names (AUDIT_REPORT.md #25)
 * and this script must still reach its dimensionDefs entries correctly by
 * whatever name they carry, without touching the id/name pairing itself.
 *
 * Safe to re-run (idempotent — a no-op once every matching field is
 * already `decimals: 3`).
 *
 * Usage: npx tsx scripts/backfill-thickness-decimals.ts   (from backend/)
 */

import 'dotenv/config';
import prisma from '../src/lib/prismaClient';

const TARGET_NAMES = new Set(['CUFF THICKNESS', 'PALM THICKNESS', 'FINGER THICKNESS', 'BEADING THICKNESS']);
const TARGET_DECIMALS = 3;

function normalizeDimName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

async function main() {
  const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' } });
  if (!appConfig?.products) {
    console.log('[backfill-thickness-decimals] AppConfig.products is empty — nothing to do.');
    return;
  }

  const products: Record<string, any> = JSON.parse(appConfig.products);
  const codes = Object.keys(products);

  // ── Lock pre-check ─────────────────────────────────────────────────────
  // This script writes directly to AppConfig.products, bypassing PATCH
  // /api/config's locked-code deep diff entirely — so it must do its own
  // equivalent check rather than assume dev.db's current all-unlocked state
  // will still hold by the time this runs.
  const lockedRows = await prisma.submission.findMany({
    where: { productCode: { in: codes } },
    select: { productCode: true },
    distinct: ['productCode'],
  });
  if (lockedRows.length > 0) {
    const lockedCodes = lockedRows.map((r) => r.productCode);
    console.error(
      `[backfill-thickness-decimals] Aborting — ${lockedCodes.length} product code(s) have ` +
      `existing Submission rows and are locked: ${lockedCodes.join(', ')}. This script does not ` +
      'implement PATCH /api/config\'s per-field locked-code protection, so it refuses to run at ' +
      'all while any target product is locked, rather than partially applying the fix.',
    );
    process.exitCode = 1;
    return;
  }

  // ── Snapshot before-state for the verification diff ───────────────────
  let totalMatchingFields = 0;
  let changedFields = 0;
  const changedDetail: { code: string; id: string; name: string; from: number | undefined }[] = [];

  for (const code of codes) {
    const defs = products[code]?.matrix?.dimensionDefs;
    if (!Array.isArray(defs)) continue;

    for (const def of defs) {
      if (!TARGET_NAMES.has(normalizeDimName(def.name ?? ''))) continue;
      totalMatchingFields++;

      if (def.decimals !== TARGET_DECIMALS) {
        changedDetail.push({ code, id: def.id, name: def.name, from: def.decimals });
        def.decimals = TARGET_DECIMALS;
        changedFields++;
      }
    }
  }

  if (changedFields === 0) {
    console.log(
      `[backfill-thickness-decimals] All ${totalMatchingFields} matching field(s) across ` +
      `${codes.length} product code(s) are already decimals: ${TARGET_DECIMALS} — nothing to do.`,
    );
    return;
  }

  await prisma.appConfig.update({
    where: { id: '1' },
    data: { products: JSON.stringify(products) },
  });

  console.log(
    `[backfill-thickness-decimals] Updated ${changedFields} of ${totalMatchingFields} matching ` +
    `field(s) across ${codes.length} product code(s) to decimals: ${TARGET_DECIMALS}:`,
  );
  for (const c of changedDetail) {
    console.log(`  - ${c.code} / ${c.id} (${c.name}): ${c.from} -> ${TARGET_DECIMALS}`);
  }
}

main()
  .catch((err) => {
    console.error('[backfill-thickness-decimals] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
