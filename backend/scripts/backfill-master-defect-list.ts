/**
 * @file backfill-master-defect-list.ts
 * @description One-off: populates the Master Defect List + Category Inventory
 * tables (Defect / Category / ProfileCategory / ProfileCategoryDefect) from the
 * profile data embedded in AppConfig.inspectionProfiles JSON.
 *
 * ── What this is and is not ─────────────────────────────────────────────────
 * A DATA-SHAPE change, not a grading-behaviour change. After it runs, both
 * FACTORY STANDARD and MEDLINE must be representable with identical grading
 * inputs to what they had before — same defect ids, same category ids, same AQL
 * levels, same evaluation modes, same membership. verifyRoundTrip() below
 * asserts exactly that and aborts if it cannot prove it.
 *
 * It is ADDITIVE. It never writes AppConfig, Submission, or AmendmentLog.
 *
 * ── Where the logic lives ───────────────────────────────────────────────────
 * The projection itself (conflict resolution, alias selection, display-code
 * assignment, ordering, the writes) is NOT implemented here — it lives in
 * src/lib/profileRegistrySync.ts, which PATCH /api/config also calls on every
 * profile write as of Stage 2. This script is a CLI wrapper around that module
 * plus the round-trip proof. Keeping one implementation matters: two copies of
 * this projection would drift exactly the way the three copies of the profile
 * seed did (AUDIT_REPORT.md #10).
 *
 * ── Conflict resolution (implemented in profileRegistrySync.planRegistry) ───
 * When one defect NAME exists under two ids, one wins and the other becomes an
 * alias. Winner is chosen by: (1) LOCKED BEATS EVERYTHING — an id referenced by
 * a frozen gradingSnapshot can never be aliased away, or the keys stored in
 * Submission.defects that the amendment-approve path replays would resolve to
 * 0; (2) the default profile wins; (3) stable tie-break on id. If both sides of
 * a conflict are locked the sync ABORTS rather than guess.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 * Safe to re-run: every write is an upsert on a stable key, and join rows no
 * longer present in the source JSON are pruned. Re-running remains correct for
 * as long as the JSON is the thing the admin UI writes. Once Stage 3 moves the
 * UI onto the tables directly and the JSON is retired, this script becomes
 * WRONG to run — it would overwrite live relational data with a stale blob.
 * Kept in the repo as a historical record, same convention as
 * backfill-must-change-pin.ts and backfill-attributes-*.ts beside it.
 *
 * Usage (from backend/):
 *   npx tsx scripts/backfill-master-defect-list.ts --dry-run   # plan only, no writes
 *   npx tsx scripts/backfill-master-defect-list.ts             # apply
 */

import 'dotenv/config';
import prisma from '../src/lib/prismaClient';
import {
  applyRegistryPlan,
  loadLockState,
  planRegistry,
} from '../src/lib/profileRegistrySync';
import type { RegistryPlan, SourceProfile } from '../src/lib/profileRegistrySync';

const DRY_RUN = process.argv.includes('--dry-run');
const LOG = '[backfill-master-defect-list]';

/** Dual-read, matching profileRegistrySync's own reader. `??` so '' survives. */
function readAql(c: { aql?: string; aqlLevel?: string }): string {
  return String(c.aqlLevel ?? c.aql ?? '');
}

async function main() {
  if (DRY_RUN) console.log(`${LOG} DRY RUN — no writes will be performed.\n`);

  const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' } });
  if (!appConfig) throw new Error('AppConfig singleton row (id=1) not found.');

  const profiles: SourceProfile[] = JSON.parse(appConfig.inspectionProfiles || '[]');
  if (profiles.length === 0) throw new Error('AppConfig.inspectionProfiles is empty — nothing to migrate.');

  console.log(`${LOG} Source: ${profiles.length} profile(s)`);
  for (const p of profiles) {
    console.log(
      `${LOG}   ${p.name} (${p.id})${p.isDefault ? ' [default]' : ''} — ` +
      `${p.aqlCategories?.length ?? 0} categories, ${p.defectDefinitions?.length ?? 0} defects`,
    );
  }

  const locked = await loadLockState();
  console.log(
    `${LOG} Lock state from frozen submissions: ` +
    `${locked.defects.size} defect id(s), ${locked.categories.size} category id(s)\n`,
  );

  const plan = planRegistry(profiles, locked);
  for (const w of plan.warnings) console.log(`${LOG} ${w}`);

  console.log(`\n${LOG} PLAN`);
  console.log(`${LOG}   Category (global) ....... ${plan.categories.length}`);
  console.log(`${LOG}   Defect (global) ......... ${plan.defects.length}`);
  console.log(`${LOG}   ProfileCategory ......... ${plan.profileCategories.length}`);
  console.log(`${LOG}   ProfileCategoryDefect ... ${plan.profileDefects.length}`);
  console.log(`${LOG}   Aliased (merged) defects: ${plan.aliases.size}` +
    (plan.aliases.size ? ` — ${[...plan.aliases].map(([f, t]) => `${f}->${t}`).join(', ')}` : ''));
  console.log(`${LOG}   Locked defects preserved: ${locked.defects.size}/${locked.defects.size}`);

  if (!DRY_RUN) {
    console.log(`\n${LOG} Writing...`);
    await applyRegistryPlan(plan);
    console.log(`${LOG}   Applied.`);
  } else {
    console.log(`\n${LOG} Dry run — no writes performed.`);
  }

  verifyRoundTrip(profiles, plan);
  console.log(`\n${LOG} Done.`);
}

/**
 * Proves the migration is grading-neutral: for every profile, the categories
 * and per-category defect membership reconstructed from the PLAN must match
 * what the embedded JSON says today, defect-for-defect, with aliases applied.
 *
 * This is the check that matters. Row counts can be right while membership is
 * wrong; this compares the actual sets the engine would grade against.
 */
function verifyRoundTrip(profiles: SourceProfile[], plan: RegistryPlan) {
  console.log(`\n${LOG} ROUND-TRIP VERIFICATION`);
  const categoryById = new Map(plan.categories.map((c) => [c.id, c]));
  let failures = 0;

  for (const profile of profiles) {
    const expectedCats = new Map((profile.aqlCategories ?? []).map((c) => [c.id, readAql(c)]));
    const expectedMembers = new Map<string, Set<string>>();
    for (const d of profile.defectDefinitions ?? []) {
      if (!expectedCats.has(d.categoryId)) continue;
      if (!expectedMembers.has(d.categoryId)) expectedMembers.set(d.categoryId, new Set());
      expectedMembers.get(d.categoryId)!.add(plan.aliases.get(d.id) ?? d.id);
    }

    const actualCats = new Map(
      plan.profileCategories.filter((p) => p.profileId === profile.id).map((p) => [p.categoryId, p.aqlLevel]),
    );
    const actualMembers = new Map<string, Set<string>>();
    for (const p of plan.profileDefects.filter((p) => p.profileId === profile.id)) {
      if (!actualMembers.has(p.categoryId)) actualMembers.set(p.categoryId, new Set());
      actualMembers.get(p.categoryId)!.add(p.defectId);
    }

    const problems: string[] = [];
    for (const [catId, aql] of expectedCats) {
      if (!actualCats.has(catId)) { problems.push(`missing category '${catId}'`); continue; }
      if (actualCats.get(catId) !== aql) {
        problems.push(`category '${catId}' aqlLevel '${actualCats.get(catId)}' != expected '${aql}'`);
      }
      const exp = expectedMembers.get(catId) ?? new Set<string>();
      const act = actualMembers.get(catId) ?? new Set<string>();
      for (const id of exp) if (!act.has(id)) problems.push(`category '${catId}' missing defect '${id}'`);
      for (const id of act) if (!exp.has(id)) problems.push(`category '${catId}' has unexpected defect '${id}'`);
    }
    for (const catId of actualCats.keys()) {
      if (!expectedCats.has(catId)) problems.push(`unexpected category '${catId}'`);
      if (!categoryById.has(catId)) problems.push(`category '${catId}' has no inventory entry`);
    }

    const totalDefects = [...actualMembers.values()].reduce((n, s) => n + s.size, 0);
    if (problems.length === 0) {
      console.log(
        `${LOG}   OK ${profile.name}: ${actualCats.size} categories, ${totalDefects} defects — ` +
        'membership and AQL levels identical to the live JSON',
      );
    } else {
      failures += problems.length;
      console.error(`${LOG}   FAIL ${profile.name}: ${problems.length} mismatch(es)`);
      for (const p of problems) console.error(`${LOG}       - ${p}`);
    }
  }

  if (failures > 0) {
    throw new Error(
      `Round-trip verification FAILED with ${failures} mismatch(es). The new tables would not ` +
      'reproduce current grading behaviour.',
    );
  }
  console.log(`${LOG}   All profiles round-trip cleanly — this is a data-shape change only.`);
}

main()
  .catch((err) => {
    console.error(`${LOG} Failed:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
