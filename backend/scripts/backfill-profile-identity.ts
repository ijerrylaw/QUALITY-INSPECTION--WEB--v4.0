/**
 * @file backfill-profile-identity.ts
 * @description One-off: populates the Profile table (id, name, isDefault,
 * sortOrder) from the identities embedded in AppConfig.inspectionProfiles JSON.
 *
 * ── What this is and is not ─────────────────────────────────────────────────
 * A DATA-SHAPE change, not a behaviour change. It reads ONLY the identity
 * fields of each profile — id, name, isDefault, and array position — and never
 * looks at aqlCategories / defectDefinitions (those are already represented by
 * the Category / Defect / ProfileCategory / ProfileCategoryDefect tables since
 * Stage 2). After it runs, Profile carries exactly the identities the JSON
 * array carries, in the same order.
 *
 * It is ADDITIVE. It never writes AppConfig, Submission, or AmendmentLog.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 * Safe to re-run: every write is an upsert keyed on the existing profileId
 * string, and Profile rows whose id is no longer present in the JSON array are
 * pruned — the same full-array-replace semantics syncProfileRegistry() applies
 * on every PATCH /api/config from Stage A0 onward.
 *
 * ── Lifetime ────────────────────────────────────────────────────────────────
 * Once syncProfileRegistry() is maintaining Profile on every write (Stage A0),
 * this script is only needed for the initial population. Kept in the repo as a
 * historical record, same convention as backfill-master-defect-list.ts beside
 * it. It stays correct to re-run for as long as the JSON blob is still written;
 * once the JSON write is retired (Stage A) it becomes WRONG to run.
 *
 * Usage (from backend/):
 *   npx tsx scripts/backfill-profile-identity.ts --dry-run   # plan only, no writes
 *   npx tsx scripts/backfill-profile-identity.ts             # apply
 */

import 'dotenv/config';
import prisma from '../src/lib/prismaClient';

const DRY_RUN = process.argv.includes('--dry-run');
const LOG = '[backfill-profile-identity]';

interface SourceProfileIdentity {
  id?: unknown;
  name?: unknown;
  isDefault?: unknown;
}

async function main() {
  if (DRY_RUN) console.log(`${LOG} DRY RUN — no writes will be performed.\n`);

  const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' } });
  if (!appConfig) throw new Error('AppConfig singleton row (id=1) not found.');

  let profiles: SourceProfileIdentity[];
  try {
    profiles = JSON.parse(appConfig.inspectionProfiles || '[]');
  } catch (err) {
    throw new Error(`AppConfig.inspectionProfiles is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(profiles)) throw new Error('AppConfig.inspectionProfiles did not parse to an array.');
  if (profiles.length === 0) throw new Error('AppConfig.inspectionProfiles is empty — nothing to backfill.');

  const planned = profiles.map((p, index) => {
    const id = typeof p.id === 'string' ? p.id : '';
    if (!id) throw new Error(`Profile at index ${index} has no string id — refusing to mint one.`);
    return {
      id,
      name: typeof p.name === 'string' ? p.name : '',
      isDefault: p.isDefault === true,
      sortOrder: index,
    };
  });

  console.log(`${LOG} Source: ${planned.length} profile identit${planned.length === 1 ? 'y' : 'ies'}`);
  for (const p of planned) {
    console.log(`${LOG}   [${p.sortOrder}] ${p.name} (${p.id})${p.isDefault ? ' [default]' : ''}`);
  }

  const existing = await prisma.profile.findMany({ select: { id: true } });
  const keepIds = new Set(planned.map((p) => p.id));
  const toPrune = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
  if (toPrune.length) {
    console.log(`${LOG} Will prune ${toPrune.length} Profile row(s) not in the JSON array: ${toPrune.join(', ')}`);
  }

  if (DRY_RUN) {
    console.log(`\n${LOG} Dry run — no writes performed.`);
  } else {
    console.log(`\n${LOG} Writing...`);
    for (const p of planned) {
      await prisma.profile.upsert({
        where: { id: p.id },
        create: { id: p.id, name: p.name, isDefault: p.isDefault, sortOrder: p.sortOrder },
        update: { name: p.name, isDefault: p.isDefault, sortOrder: p.sortOrder },
      });
    }
    if (toPrune.length) {
      await prisma.profile.deleteMany({ where: { id: { in: toPrune } } });
    }
    console.log(`${LOG}   Applied.`);
  }

  // Round-trip proof: the Profile table must now reproduce the JSON array's
  // identities, in order.
  const rows = await prisma.profile.findMany({ orderBy: { sortOrder: 'asc' } });
  const rebuilt = rows.map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault, sortOrder: r.sortOrder }));
  const same = JSON.stringify(rebuilt) === JSON.stringify(planned);
  console.log(`\n${LOG} ROUND-TRIP: Profile table ${same ? 'matches' : 'DOES NOT MATCH'} the JSON identities`);
  if (!same) {
    console.log(`${LOG}   expected: ${JSON.stringify(planned)}`);
    console.log(`${LOG}   actual  : ${JSON.stringify(rebuilt)}`);
    if (!DRY_RUN) throw new Error('Round-trip verification failed.');
  }
  console.log(`${LOG} Done.`);
}

main()
  .catch((err) => {
    console.error(`${LOG} Failed:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
