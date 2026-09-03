/**
 * @file backfill-master-defect-list.ts
 * @description One-off: populates the Stage 1 Master Defect List + Category
 * Inventory tables (Defect / Category / ProfileCategory / ProfileCategoryDefect)
 * from the profile data currently embedded in AppConfig.inspectionProfiles JSON.
 *
 * ── What this is and is not ─────────────────────────────────────────────────
 * This is a DATA-SHAPE change, not a grading-behaviour change. After it runs,
 * both FACTORY STANDARD and MEDLINE must be representable with byte-identical
 * grading inputs to what they had before — same defect ids, same category ids,
 * same AQL levels, same evaluation modes, same membership. The script asserts
 * exactly that at the end (verifyRoundTrip) and aborts if it cannot prove it.
 *
 * It is ADDITIVE. It never writes to AppConfig, Submission, or AmendmentLog —
 * the embedded JSON stays the live source of truth for grading until Stage 2
 * rewires the engine. Nothing in this script can change a stored verdict.
 *
 * ── Conflict resolution ─────────────────────────────────────────────────────
 * Two defects in different profiles may share a NAME under different ids
 * (today: exactly one such pair — 'Wet Glove' as def_wet_glove_1 in FACTORY
 * STANDARD and def_wet_glove in MEDLINE, a fingerprint of QualityRules.tsx's
 * profile-clone path deduping ids across all profiles). The master list keeps
 * ONE row per name, so one id must win and the other becomes an alias.
 *
 * Winner is chosen by, in order:
 *   1. LOCKED BEATS EVERYTHING. An id referenced by any Submission's frozen
 *      gradingSnapshot can never be aliased away — dropping it would orphan
 *      the keys in Submission.defects that the amendment-approve path feeds
 *      back through resolveVerdict(), silently resolving those counts to 0.
 *      If both sides of a conflict are locked, the script ABORTS rather than
 *      guess; that case needs a human decision and does not exist today.
 *   2. The default profile (FACTORY STANDARD) wins, per the locked design.
 *   3. Stable tie-break on id, so re-runs are deterministic.
 *
 * For the one live conflict both rules point the same way: def_wet_glove_1 is
 * the locked one AND the FACTORY STANDARD one. No judgement call is needed.
 *
 * ── Display codes ───────────────────────────────────────────────────────────
 * DEF-001.. is assigned alphabetically by name; CAT-001.. in first-appearance
 * order across profiles (keeping the two universally-shared categories as
 * CAT-001/CAT-002). Codes are assigned ONCE. On a re-run, existing codes are
 * preserved verbatim and only code-less rows get new numbers, continuing from
 * the current maximum — a code that moves is worse than a numbering gap.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 * Safe to re-run: every write is an upsert on a stable key, and join rows that
 * no longer appear in the source JSON are pruned. Re-running after a Stage 2
 * cutover (once the JSON is no longer authoritative) would be WRONG — at that
 * point this script would overwrite live relational data with stale JSON.
 * Kept in the repo after running as a historical record, same convention as
 * backfill-must-change-pin.ts and backfill-attributes-*.ts beside it.
 *
 * Usage (from backend/):
 *   npx tsx scripts/backfill-master-defect-list.ts --dry-run   # plan only, no writes
 *   npx tsx scripts/backfill-master-defect-list.ts             # apply
 */

import 'dotenv/config';
import prisma from '../src/lib/prismaClient';
import { fromEngineEvaluationMode } from '../src/lib/categoryEvaluationMode';

const DRY_RUN = process.argv.includes('--dry-run');
const LOG = '[backfill-master-defect-list]';

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE SHAPES (AppConfig.inspectionProfiles JSON)
// ─────────────────────────────────────────────────────────────────────────────

interface SourceCategory {
  id: string;
  name: string;
  /** Admin-UI spelling. The engine's `aqlLevel` is the same value. */
  aql?: string;
  aqlLevel?: string;
  /** Admin-UI spelling. The engine's `evaluationMode` is the same value. */
  evalMode?: string;
  evaluationMode?: string;
}

interface SourceDefect {
  id: string;
  name: string;
  categoryId: string;
}

interface SourceProfile {
  id: string;
  name: string;
  isDefault?: boolean;
  aqlCategories?: SourceCategory[];
  defectDefinitions?: SourceDefect[];
}

/**
 * Both field spellings coexist in stored data (categories saved by
 * QualityRules.tsx use `aql`/`evalMode`; the seeds use `aqlLevel`/
 * `evaluationMode`). Every reader in this codebase dual-reads, so this one
 * must too. `??` not `||`, so evalMode '' survives as RECORD ONLY.
 */
function readAql(c: SourceCategory): string {
  return String(c.aqlLevel ?? c.aql ?? '');
}
function readEvalMode(c: SourceCategory): string | null | undefined {
  return c.evaluationMode ?? c.evalMode;
}

/** trim -> lowercase -> collapse internal whitespace. Mirrors QualityRules.tsx. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log(`${LOG} DRY RUN — no writes will be performed.\n`);

  // ── 1. Load source ────────────────────────────────────────────────────────
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

  // ── 2. Compute lock state from frozen submissions ─────────────────────────
  // Derived, never stored — a stored boolean could drift out of sync with the
  // snapshots that are the actual authority. Same reasoning as
  // getProductCodeUsage() in config.routes.ts.
  const submissions = await prisma.submission.findMany({
    where: { gradingSnapshot: { not: null } },
    select: { gradingSnapshot: true },
  });

  const lockedDefectIds = new Set<string>();
  const lockedCategoryIds = new Set<string>();
  for (const s of submissions) {
    const snapshot = JSON.parse(s.gradingSnapshot as string) as {
      id?: string;
      defectItems?: { id?: string }[];
    }[];
    for (const cat of snapshot) {
      if (cat.id) lockedCategoryIds.add(cat.id);
      for (const d of cat.defectItems ?? []) {
        if (d.id) lockedDefectIds.add(d.id);
      }
    }
  }
  console.log(
    `${LOG} Lock state from ${submissions.length} frozen submission(s): ` +
    `${lockedDefectIds.size} defect id(s), ${lockedCategoryIds.size} category id(s)\n`,
  );

  // ── 3. Build the global Category inventory ────────────────────────────────
  // First-appearance order across profiles. Categories are a SUPERSET: two
  // profiles' differing category sets are both preserved as distinct rows.
  interface PlannedCategory {
    id: string;
    name: string;
    nameKey: string;
    evaluationMode: string;
    firstSeenIn: string;
  }
  const categoryById = new Map<string, PlannedCategory>();
  const categoryByNameKey = new Map<string, string>();

  for (const profile of profiles) {
    const isDefault = profile.isDefault === true;
    for (const cat of profile.aqlCategories ?? []) {
      const nameKey = normalizeName(cat.name);
      const evaluationMode = fromEngineEvaluationMode(readEvalMode(cat));
      const existing = categoryById.get(cat.id);

      if (!existing) {
        // A different category id already using this display name would break
        // Category.nameKey's global @unique. Does not occur today.
        const clash = categoryByNameKey.get(nameKey);
        if (clash && clash !== cat.id) {
          throw new Error(
            `Category name collision: '${cat.name}' is used by both id '${clash}' and id '${cat.id}'. ` +
            'The global inventory requires unique category names — resolve this in the source data first.',
          );
        }
        categoryById.set(cat.id, {
          id: cat.id, name: cat.name, nameKey, evaluationMode, firstSeenIn: profile.name,
        });
        categoryByNameKey.set(nameKey, cat.id);
        continue;
      }

      // Same id in a second profile. Identical today (AND/BARRIER match
      // exactly in both); if they ever diverge, the default profile wins.
      if (existing.name !== cat.name || existing.evaluationMode !== evaluationMode) {
        console.warn(
          `${LOG} ⚠ Category '${cat.id}' differs between profiles ` +
          `(${existing.firstSeenIn}: name='${existing.name}' mode=${existing.evaluationMode}; ` +
          `${profile.name}: name='${cat.name}' mode=${evaluationMode}). ` +
          `Keeping ${isDefault ? profile.name : existing.firstSeenIn}'s values.`,
        );
        if (isDefault) {
          categoryById.set(cat.id, {
            ...existing, name: cat.name, nameKey, evaluationMode,
          });
        }
      }
    }
  }

  // Every category frozen into a submission must survive into the inventory.
  for (const id of lockedCategoryIds) {
    if (!categoryById.has(id)) {
      throw new Error(
        `Locked category '${id}' appears in a frozen gradingSnapshot but is absent from every ` +
        'profile in AppConfig — it cannot be dropped from the inventory. Aborting.',
      );
    }
  }

  // ── 4. Build the global Defect list, resolving name conflicts ─────────────
  interface PlannedDefect {
    id: string;
    name: string;
    nameKey: string;
    sourceProfile: string;
    locked: boolean;
  }
  const defectByNameKey = new Map<string, PlannedDefect>();
  /** losing id -> winning canonical id */
  const aliasMap = new Map<string, string>();

  for (const profile of profiles) {
    const isDefault = profile.isDefault === true;
    for (const def of profile.defectDefinitions ?? []) {
      const nameKey = normalizeName(def.name);
      const locked = lockedDefectIds.has(def.id);
      const incoming: PlannedDefect = {
        id: def.id, name: def.name, nameKey, sourceProfile: profile.name, locked,
      };
      const existing = defectByNameKey.get(nameKey);

      if (!existing) {
        defectByNameKey.set(nameKey, incoming);
        continue;
      }
      if (existing.id === def.id) {
        // Same defect in both profiles — the common case (46 of 50).
        if (locked) existing.locked = true;
        continue;
      }

      // Genuine conflict: one name, two ids. Pick a winner.
      if (existing.locked && incoming.locked) {
        throw new Error(
          `Unresolvable conflict: '${def.name}' exists as BOTH '${existing.id}' and '${def.id}', ` +
          'and both are locked by real submissions. Neither can be aliased away without ' +
          'orphaning stored defect counts. This needs a human decision — aborting.',
        );
      }

      let winner: PlannedDefect;
      let loser: PlannedDefect;
      if (existing.locked !== incoming.locked) {
        // Rule 1 — locked always wins.
        [winner, loser] = existing.locked ? [existing, incoming] : [incoming, existing];
      } else if (isDefault) {
        // Rule 2 — default profile (FACTORY STANDARD) wins.
        [winner, loser] = [incoming, existing];
      } else {
        // Rule 3 — deterministic tie-break so re-runs agree.
        [winner, loser] = existing.id < def.id ? [existing, incoming] : [incoming, existing];
      }

      console.log(
        `${LOG} CONFLICT '${def.name}': '${winner.id}' wins over '${loser.id}' ` +
        `(${winner.locked ? 'locked by a real submission' : `from default profile ${winner.sourceProfile}`}). ` +
        `'${loser.id}' becomes an alias.`,
      );
      winner.locked = winner.locked || loser.locked;
      defectByNameKey.set(nameKey, winner);
      aliasMap.set(loser.id, winner.id);
    }
  }

  // Safety net: an alias target must exist, and no locked id may be aliased.
  for (const [from, to] of aliasMap) {
    if (lockedDefectIds.has(from)) {
      throw new Error(`Refusing to alias locked defect '${from}' -> '${to}'. Aborting.`);
    }
  }
  // Every defect frozen into a submission must survive into the master list.
  const plannedDefectIds = new Set([...defectByNameKey.values()].map((d) => d.id));
  for (const id of lockedDefectIds) {
    if (!plannedDefectIds.has(id)) {
      throw new Error(
        `Locked defect '${id}' appears in a frozen gradingSnapshot but is absent from every ` +
        'profile in AppConfig — it cannot be dropped from the master list. Aborting.',
      );
    }
  }

  // ── 5. Assign display codes (preserving any already issued) ───────────────
  const existingDefects = await prisma.defect.findMany({ select: { id: true, code: true } });
  const existingCategories = await prisma.category.findMany({ select: { id: true, code: true } });
  const defectCodeById = new Map(existingDefects.map((d) => [d.id, d.code]));
  const categoryCodeById = new Map(existingCategories.map((c) => [c.id, c.code]));

  const nextNumber = (codes: Iterable<string>, prefix: string): number => {
    let max = 0;
    for (const code of codes) {
      const m = new RegExp(`^${prefix}-(\\d+)$`).exec(code);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
  };

  let defectSeq = nextNumber(defectCodeById.values(), 'DEF');
  const orderedDefects = [...defectByNameKey.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  for (const d of orderedDefects) {
    if (!defectCodeById.has(d.id)) defectCodeById.set(d.id, `DEF-${pad3(defectSeq++)}`);
  }

  let categorySeq = nextNumber(categoryCodeById.values(), 'CAT');
  const orderedCategories = [...categoryById.values()]; // already first-appearance order
  for (const c of orderedCategories) {
    if (!categoryCodeById.has(c.id)) categoryCodeById.set(c.id, `CAT-${pad3(categorySeq++)}`);
  }

  // ── 6. Plan the per-profile joins ─────────────────────────────────────────
  interface PlannedProfileCategory {
    profileId: string; categoryId: string; aqlLevel: string; sortOrder: number;
  }
  interface PlannedProfileDefect {
    profileId: string; categoryId: string; defectId: string; sortOrder: number;
  }
  const plannedProfileCategories: PlannedProfileCategory[] = [];
  const plannedProfileDefects: PlannedProfileDefect[] = [];

  for (const profile of profiles) {
    const selectedCategoryIds = new Set<string>();
    (profile.aqlCategories ?? []).forEach((cat, index) => {
      selectedCategoryIds.add(cat.id);
      plannedProfileCategories.push({
        profileId: profile.id, categoryId: cat.id, aqlLevel: readAql(cat), sortOrder: index,
      });
    });

    // sortOrder is per-category, taken from the defect's position within its
    // own category in the source array — that is the order QualityRules.tsx
    // renders and handleMoveDefect() rearranges.
    const perCategoryCounter = new Map<string, number>();
    const seenDefectIds = new Set<string>();

    for (const def of profile.defectDefinitions ?? []) {
      const canonicalId = aliasMap.get(def.id) ?? def.id;

      if (!selectedCategoryIds.has(def.categoryId)) {
        // Would violate the FK to ProfileCategory. Does not occur today.
        console.warn(
          `${LOG} ⚠ ${profile.name}: defect '${def.id}' points at category '${def.categoryId}', ` +
          'which the profile does not define. Skipping — it is unreachable by the engine too.',
        );
        continue;
      }
      if (seenDefectIds.has(canonicalId)) {
        // Would violate @@unique([profileId, defectId]) — e.g. a profile
        // holding both sides of an aliased conflict. Does not occur today.
        console.warn(
          `${LOG} ⚠ ${profile.name}: '${def.id}' resolves to '${canonicalId}', already present ` +
          'in this profile. Skipping the duplicate (one category per defect per profile).',
        );
        continue;
      }
      seenDefectIds.add(canonicalId);

      const order = perCategoryCounter.get(def.categoryId) ?? 0;
      perCategoryCounter.set(def.categoryId, order + 1);
      plannedProfileDefects.push({
        profileId: profile.id, categoryId: def.categoryId, defectId: canonicalId, sortOrder: order,
      });
    }
  }

  // ── 7. Report the plan ────────────────────────────────────────────────────
  console.log(`\n${LOG} PLAN`);
  console.log(`${LOG}   Category (global) ....... ${orderedCategories.length}`);
  console.log(`${LOG}   Defect (global) ......... ${orderedDefects.length}`);
  console.log(`${LOG}   ProfileCategory ......... ${plannedProfileCategories.length}`);
  console.log(`${LOG}   ProfileCategoryDefect ... ${plannedProfileDefects.length}`);
  console.log(`${LOG}   Aliased (merged) defects: ${aliasMap.size}` +
    (aliasMap.size ? ` — ${[...aliasMap].map(([f, t]) => `${f}->${t}`).join(', ')}` : ''));
  console.log(`${LOG}   Locked defects preserved: ${lockedDefectIds.size}/${lockedDefectIds.size}`);

  if (DRY_RUN) {
    console.log(`\n${LOG} Dry run complete — no writes performed.`);
    await verifyRoundTrip(profiles, categoryById, aliasMap, plannedProfileCategories, plannedProfileDefects);
    return;
  }

  // ── 8. Write ──────────────────────────────────────────────────────────────
  console.log(`\n${LOG} Writing...`);

  for (const c of orderedCategories) {
    const data = {
      code: categoryCodeById.get(c.id) as string,
      name: c.name,
      nameKey: c.nameKey,
      evaluationMode: c.evaluationMode,
    };
    await prisma.category.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }
  console.log(`${LOG}   Category upserted: ${orderedCategories.length}`);

  for (const d of orderedDefects) {
    const data = { code: defectCodeById.get(d.id) as string, name: d.name, nameKey: d.nameKey };
    await prisma.defect.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
  }
  console.log(`${LOG}   Defect upserted: ${orderedDefects.length}`);

  const profileCategoryIdByKey = new Map<string, string>();
  for (const pc of plannedProfileCategories) {
    const row = await prisma.profileCategory.upsert({
      where: { profileId_categoryId: { profileId: pc.profileId, categoryId: pc.categoryId } },
      create: pc,
      update: { aqlLevel: pc.aqlLevel, sortOrder: pc.sortOrder },
    });
    profileCategoryIdByKey.set(`${pc.profileId}::${pc.categoryId}`, row.id);
  }
  console.log(`${LOG}   ProfileCategory upserted: ${plannedProfileCategories.length}`);

  for (const pd of plannedProfileDefects) {
    const profileCategoryId = profileCategoryIdByKey.get(`${pd.profileId}::${pd.categoryId}`) as string;
    await prisma.profileCategoryDefect.upsert({
      where: { profileCategoryId_defectId: { profileCategoryId, defectId: pd.defectId } },
      create: { profileCategoryId, defectId: pd.defectId, profileId: pd.profileId, sortOrder: pd.sortOrder },
      update: { sortOrder: pd.sortOrder },
    });
  }
  console.log(`${LOG}   ProfileCategoryDefect upserted: ${plannedProfileDefects.length}`);

  // Prune join rows that no longer appear in the source (re-run hygiene).
  const keepPd = new Set(plannedProfileDefects.map((p) => `${p.profileId}::${p.defectId}`));
  const stalePd = (await prisma.profileCategoryDefect.findMany({ select: { id: true, profileId: true, defectId: true } }))
    .filter((r) => !keepPd.has(`${r.profileId}::${r.defectId}`));
  if (stalePd.length) {
    await prisma.profileCategoryDefect.deleteMany({ where: { id: { in: stalePd.map((r) => r.id) } } });
    console.log(`${LOG}   ProfileCategoryDefect pruned: ${stalePd.length}`);
  }

  const keepPc = new Set(plannedProfileCategories.map((p) => `${p.profileId}::${p.categoryId}`));
  const stalePc = (await prisma.profileCategory.findMany({ select: { id: true, profileId: true, categoryId: true } }))
    .filter((r) => !keepPc.has(`${r.profileId}::${r.categoryId}`));
  if (stalePc.length) {
    await prisma.profileCategory.deleteMany({ where: { id: { in: stalePc.map((r) => r.id) } } });
    console.log(`${LOG}   ProfileCategory pruned: ${stalePc.length}`);
  }

  await verifyRoundTrip(profiles, categoryById, aliasMap, plannedProfileCategories, plannedProfileDefects);
  console.log(`\n${LOG} Done.`);
}

/**
 * Proves the migration is grading-neutral: for every profile, the categories
 * and per-category defect membership reconstructed from the PLAN must match
 * what the embedded JSON says today, defect-for-defect, with the alias applied.
 *
 * This is the check that matters. Row counts can be right while membership is
 * wrong; this compares the actual sets the engine would grade against.
 */
async function verifyRoundTrip(
  profiles: SourceProfile[],
  categoryById: Map<string, { id: string; name: string; evaluationMode: string }>,
  aliasMap: Map<string, string>,
  plannedProfileCategories: { profileId: string; categoryId: string; aqlLevel: string }[],
  plannedProfileDefects: { profileId: string; categoryId: string; defectId: string }[],
) {
  console.log(`\n${LOG} ROUND-TRIP VERIFICATION`);
  let failures = 0;

  for (const profile of profiles) {
    // Expected, straight from the live JSON the engine reads today.
    const expectedCats = new Map(
      (profile.aqlCategories ?? []).map((c) => [c.id, readAql(c)]),
    );
    const expectedMembers = new Map<string, Set<string>>();
    for (const d of profile.defectDefinitions ?? []) {
      if (!expectedCats.has(d.categoryId)) continue;
      if (!expectedMembers.has(d.categoryId)) expectedMembers.set(d.categoryId, new Set());
      expectedMembers.get(d.categoryId)!.add(aliasMap.get(d.id) ?? d.id);
    }

    // Actual, from the plan.
    const actualCats = new Map(
      plannedProfileCategories.filter((p) => p.profileId === profile.id).map((p) => [p.categoryId, p.aqlLevel]),
    );
    const actualMembers = new Map<string, Set<string>>();
    for (const p of plannedProfileDefects.filter((p) => p.profileId === profile.id)) {
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
      const mode = categoryById.get(catId)?.evaluationMode;
      if (!mode) problems.push(`category '${catId}' has no inventory entry`);
    }

    const totalDefects = [...actualMembers.values()].reduce((n, s) => n + s.size, 0);
    if (problems.length === 0) {
      console.log(
        `${LOG}   ✓ ${profile.name}: ${actualCats.size} categories, ${totalDefects} defects — ` +
        'membership and AQL levels identical to the live JSON',
      );
    } else {
      failures += problems.length;
      console.error(`${LOG}   ✗ ${profile.name}: ${problems.length} mismatch(es)`);
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
