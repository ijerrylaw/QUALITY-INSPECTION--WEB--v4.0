/**
 * @file profileRegistrySync.ts
 * @description Projects AppConfig.inspectionProfiles JSON into the global
 * Master Defect List / Category Inventory tables. The single source of truth
 * for that projection — used by both the one-off Stage 1 backfill script and,
 * from Stage 2 onward, by PATCH /api/config on every profile write.
 *
 * ── Why PATCH has to call this ──────────────────────────────────────────────
 * Stage 2 moved the ENGINE onto these tables while the ADMIN UI still writes
 * the JSON blob (the UI moves at Stage 3). Without a projection on write, the
 * first Quality Rules edit would leave the engine grading against pre-edit
 * rules while the UI displayed the new ones — silently, with no error. That is
 * the exact failure class AUDIT_REPORT.md #10 was logged for (the wizard
 * displaying one evaluation mode while the server graded under another), so
 * the two representations are kept in lock-step on every write instead.
 *
 * Same shape as the B2 write-hook that kept AppConfig.products byte-identical
 * to the legacy product structures while B4 swapped the read side over.
 *
 * ── Ordering ────────────────────────────────────────────────────────────────
 * sortOrder is captured from the JSON array indices — category order from
 * aqlCategories, and each defect's order from its position WITHIN ITS OWN
 * category in the flat defectDefinitions array. engine/profileRules.ts reads
 * both back to reproduce the array order the frozen snapshot depends on.
 */

import prisma from './prismaClient';
import { fromEngineEvaluationMode } from './categoryEvaluationMode';

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE SHAPES (AppConfig.inspectionProfiles JSON)
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceCategory {
  id: string;
  name: string;
  /** Admin-UI spelling; the engine's `aqlLevel` carries the same value. */
  aql?: string;
  aqlLevel?: string;
  /** Admin-UI spelling; the engine's `evaluationMode` carries the same value. */
  evalMode?: string;
  evaluationMode?: string;
}

export interface SourceDefect {
  id: string;
  name: string;
  categoryId: string;
}

export interface SourceProfile {
  id: string;
  name: string;
  isDefault?: boolean;
  aqlCategories?: SourceCategory[];
  defectDefinitions?: SourceDefect[];
}

/**
 * Both field spellings coexist in stored data (categories saved by
 * QualityRules.tsx use `aql`/`evalMode`; the seeds use `aqlLevel`/
 * `evaluationMode`). `??` not `||`, so an evalMode of '' survives as the real
 * RECORD ONLY value instead of being coerced away.
 */
function readAql(c: SourceCategory): string {
  return String(c.aqlLevel ?? c.aql ?? '');
}
function readEvalMode(c: SourceCategory): string | null | undefined {
  return c.evaluationMode ?? c.evalMode;
}

/** trim -> lowercase -> collapse internal whitespace. Mirrors QualityRules.tsx. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN
// ─────────────────────────────────────────────────────────────────────────────

export interface PlannedCategory {
  id: string; name: string; nameKey: string; evaluationMode: string; firstSeenIn: string;
}
export interface PlannedDefect {
  id: string; name: string; nameKey: string; sourceProfile: string; locked: boolean;
}
export interface PlannedProfileCategory {
  profileId: string; categoryId: string; aqlLevel: string; sortOrder: number;
}
export interface PlannedProfileDefect {
  profileId: string; categoryId: string; defectId: string; sortOrder: number;
}

export interface RegistryPlan {
  categories: PlannedCategory[];
  defects: PlannedDefect[];
  profileCategories: PlannedProfileCategory[];
  profileDefects: PlannedProfileDefect[];
  /** losing defect id -> winning canonical id, for name conflicts. */
  aliases: Map<string, string>;
  lockedDefectIds: Set<string>;
  lockedCategoryIds: Set<string>;
  warnings: string[];
}

/** Thrown when the source data cannot be projected without a human decision. */
export class ProfileRegistrySyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileRegistrySyncError';
  }
}

/**
 * Reads lock state from frozen submissions. Derived on every call, never
 * stored — a cached boolean could drift from the snapshots that are the actual
 * authority. Same reasoning as getProductCodeUsage() in config.routes.ts.
 */
export async function loadLockState(): Promise<{ defects: Set<string>; categories: Set<string> }> {
  const submissions = await prisma.submission.findMany({
    where: { gradingSnapshot: { not: null } },
    select: { gradingSnapshot: true },
  });
  const defects = new Set<string>();
  const categories = new Set<string>();
  for (const s of submissions) {
    let snapshot: { id?: string; defectItems?: { id?: string }[] }[];
    try {
      snapshot = JSON.parse(s.gradingSnapshot as string);
    } catch {
      continue;
    }
    for (const cat of snapshot) {
      if (cat.id) categories.add(cat.id);
      for (const d of cat.defectItems ?? []) if (d.id) defects.add(d.id);
    }
  }
  return { defects, categories };
}

/**
 * Pure projection: JSON profiles + lock state -> the rows that should exist.
 *
 * Conflict resolution when one NAME appears under two different ids, in order:
 *   1. LOCKED BEATS EVERYTHING — an id referenced by a frozen gradingSnapshot
 *      can never be aliased away, or the keys stored in Submission.defects that
 *      the amendment-approve path replays would resolve to 0.
 *   2. The default profile wins.
 *   3. Stable tie-break on id, so repeated runs agree.
 *
 * @throws ProfileRegistrySyncError when the data needs a human decision
 *   (both sides of a conflict locked, a locked id missing entirely, or two
 *   category ids claiming one name).
 */
export function planRegistry(
  profiles: SourceProfile[],
  locked: { defects: Set<string>; categories: Set<string> },
): RegistryPlan {
  const warnings: string[] = [];

  // ── Categories: first-appearance order, superset across profiles ──────────
  const categoryById = new Map<string, PlannedCategory>();
  const categoryByNameKey = new Map<string, string>();

  for (const profile of profiles) {
    const isDefault = profile.isDefault === true;
    for (const cat of profile.aqlCategories ?? []) {
      const nameKey = normalizeName(cat.name);
      let evaluationMode: string;
      try {
        evaluationMode = fromEngineEvaluationMode(readEvalMode(cat));
      } catch (err) {
        throw new ProfileRegistrySyncError(
          `Category '${cat.name}' in profile '${profile.name}': ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const existing = categoryById.get(cat.id);

      if (!existing) {
        const clash = categoryByNameKey.get(nameKey);
        if (clash && clash !== cat.id) {
          throw new ProfileRegistrySyncError(
            `Category name collision: '${cat.name}' is used by both id '${clash}' and id '${cat.id}'. ` +
            'The global Category Inventory requires unique category names.',
          );
        }
        categoryById.set(cat.id, { id: cat.id, name: cat.name, nameKey, evaluationMode, firstSeenIn: profile.name });
        categoryByNameKey.set(nameKey, cat.id);
        continue;
      }

      if (existing.name !== cat.name || existing.evaluationMode !== evaluationMode) {
        warnings.push(
          `Category '${cat.id}' differs between profiles (${existing.firstSeenIn}: name='${existing.name}' ` +
          `mode=${existing.evaluationMode}; ${profile.name}: name='${cat.name}' mode=${evaluationMode}). ` +
          `Keeping ${isDefault ? profile.name : existing.firstSeenIn}'s values.`,
        );
        if (isDefault) {
          categoryByNameKey.delete(existing.nameKey);
          categoryById.set(cat.id, { ...existing, name: cat.name, nameKey, evaluationMode });
          categoryByNameKey.set(nameKey, cat.id);
        }
      }
    }
  }

  for (const id of locked.categories) {
    if (!categoryById.has(id)) {
      throw new ProfileRegistrySyncError(
        `Locked category '${id}' appears in a frozen gradingSnapshot but is absent from every profile. ` +
        'It cannot be dropped from the Category Inventory.',
      );
    }
  }

  // ── Defects: one row per name, conflicts aliased ──────────────────────────
  const defectByNameKey = new Map<string, PlannedDefect>();
  const aliases = new Map<string, string>();

  for (const profile of profiles) {
    const isDefault = profile.isDefault === true;
    for (const def of profile.defectDefinitions ?? []) {
      const nameKey = normalizeName(def.name);
      const isLocked = locked.defects.has(def.id);
      const incoming: PlannedDefect = {
        id: def.id, name: def.name, nameKey, sourceProfile: profile.name, locked: isLocked,
      };
      const existing = defectByNameKey.get(nameKey);

      if (!existing) { defectByNameKey.set(nameKey, incoming); continue; }
      if (existing.id === def.id) { if (isLocked) existing.locked = true; continue; }

      if (existing.locked && incoming.locked) {
        throw new ProfileRegistrySyncError(
          `Unresolvable conflict: '${def.name}' exists as both '${existing.id}' and '${def.id}', and both are ` +
          'locked by real submissions. Neither can be aliased away without orphaning stored defect counts.',
        );
      }

      let winner: PlannedDefect;
      let loser: PlannedDefect;
      if (existing.locked !== incoming.locked) {
        [winner, loser] = existing.locked ? [existing, incoming] : [incoming, existing];
      } else if (isDefault) {
        [winner, loser] = [incoming, existing];
      } else {
        [winner, loser] = existing.id < def.id ? [existing, incoming] : [incoming, existing];
      }

      warnings.push(
        `Defect name conflict '${def.name}': '${winner.id}' wins over '${loser.id}' ` +
        `(${winner.locked ? 'locked by a real submission' : `from default profile ${winner.sourceProfile}`}); ` +
        `'${loser.id}' becomes an alias.`,
      );
      winner.locked = winner.locked || loser.locked;
      defectByNameKey.set(nameKey, winner);
      aliases.set(loser.id, winner.id);
    }
  }

  for (const [from, to] of aliases) {
    if (locked.defects.has(from)) {
      throw new ProfileRegistrySyncError(`Refusing to alias locked defect '${from}' -> '${to}'.`);
    }
  }
  const plannedDefectIds = new Set([...defectByNameKey.values()].map((d) => d.id));
  for (const id of locked.defects) {
    if (!plannedDefectIds.has(id)) {
      throw new ProfileRegistrySyncError(
        `Locked defect '${id}' appears in a frozen gradingSnapshot but is absent from every profile. ` +
        'It cannot be dropped from the Master Defect List.',
      );
    }
  }

  // ── Per-profile joins ─────────────────────────────────────────────────────
  const profileCategories: PlannedProfileCategory[] = [];
  const profileDefects: PlannedProfileDefect[] = [];

  for (const profile of profiles) {
    const selected = new Set<string>();
    (profile.aqlCategories ?? []).forEach((cat, index) => {
      selected.add(cat.id);
      profileCategories.push({
        profileId: profile.id, categoryId: cat.id, aqlLevel: readAql(cat), sortOrder: index,
      });
    });

    const perCategoryCounter = new Map<string, number>();
    const seen = new Set<string>();

    for (const def of profile.defectDefinitions ?? []) {
      const canonicalId = aliases.get(def.id) ?? def.id;
      if (!selected.has(def.categoryId)) {
        warnings.push(
          `${profile.name}: defect '${def.id}' points at category '${def.categoryId}', which the profile does ` +
          'not define. Skipped — it is unreachable by the engine too.',
        );
        continue;
      }
      if (seen.has(canonicalId)) {
        warnings.push(
          `${profile.name}: '${def.id}' resolves to '${canonicalId}', already present in this profile. ` +
          'Skipped the duplicate (one category per defect per profile).',
        );
        continue;
      }
      seen.add(canonicalId);
      const order = perCategoryCounter.get(def.categoryId) ?? 0;
      perCategoryCounter.set(def.categoryId, order + 1);
      profileDefects.push({
        profileId: profile.id, categoryId: def.categoryId, defectId: canonicalId, sortOrder: order,
      });
    }
  }

  return {
    categories: [...categoryById.values()],
    defects: [...defectByNameKey.values()],
    profileCategories,
    profileDefects,
    aliases,
    lockedDefectIds: locked.defects,
    lockedCategoryIds: locked.categories,
    warnings,
  };
}

/**
 * Writes a plan to the database, then prunes join rows the plan no longer
 * contains. Every write is an upsert on a stable key, so applying the same
 * plan twice is a no-op.
 *
 * Display codes (DEF-001 / CAT-001) are assigned ONCE: existing codes are
 * preserved verbatim and only code-less rows get new numbers, continuing from
 * the current maximum. A code that moves is worse than a numbering gap, since
 * these are what people read off a picker.
 */
export async function applyRegistryPlan(plan: RegistryPlan): Promise<void> {
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
  const orderedDefects = [...plan.defects].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  for (const d of orderedDefects) {
    if (!defectCodeById.has(d.id)) defectCodeById.set(d.id, `DEF-${pad3(defectSeq++)}`);
  }

  let categorySeq = nextNumber(categoryCodeById.values(), 'CAT');
  for (const c of plan.categories) {
    if (!categoryCodeById.has(c.id)) categoryCodeById.set(c.id, `CAT-${pad3(categorySeq++)}`);
  }

  for (const c of plan.categories) {
    const data = {
      code: categoryCodeById.get(c.id) as string,
      name: c.name,
      nameKey: c.nameKey,
      evaluationMode: c.evaluationMode,
    };
    await prisma.category.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }

  for (const d of orderedDefects) {
    const data = { code: defectCodeById.get(d.id) as string, name: d.name, nameKey: d.nameKey };
    await prisma.defect.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
  }

  const profileCategoryIdByKey = new Map<string, string>();
  for (const pc of plan.profileCategories) {
    const row = await prisma.profileCategory.upsert({
      where: { profileId_categoryId: { profileId: pc.profileId, categoryId: pc.categoryId } },
      create: pc,
      update: { aqlLevel: pc.aqlLevel, sortOrder: pc.sortOrder },
    });
    profileCategoryIdByKey.set(`${pc.profileId}::${pc.categoryId}`, row.id);
  }

  // ── Prune defect links BEFORE inserting, not after ────────────────────────
  // Ordering here is load-bearing. When an admin MOVES a defect between two
  // categories of the same profile, the planned row has a new
  // profileCategoryId while the stale row still holds the same
  // (profileId, defectId) pair — so inserting first trips
  // @@unique([profileId, defectId]) and the whole sync fails. Deleting the
  // rows that no longer match the plan first makes a move a clean
  // delete-then-insert.
  //
  // A row is stale if the plan no longer contains its (profileId, defectId)
  // at all (defect removed from the profile), OR contains it under a
  // DIFFERENT profileCategory (defect moved).
  const plannedLink = new Map(
    plan.profileDefects.map((p) => [
      `${p.profileId}::${p.defectId}`,
      profileCategoryIdByKey.get(`${p.profileId}::${p.categoryId}`) as string,
    ]),
  );
  const staleDefectLinks = (await prisma.profileCategoryDefect.findMany({
    select: { id: true, profileId: true, defectId: true, profileCategoryId: true },
  })).filter((r) => plannedLink.get(`${r.profileId}::${r.defectId}`) !== r.profileCategoryId);
  if (staleDefectLinks.length) {
    await prisma.profileCategoryDefect.deleteMany({
      where: { id: { in: staleDefectLinks.map((r) => r.id) } },
    });
  }

  for (const pd of plan.profileDefects) {
    const profileCategoryId = profileCategoryIdByKey.get(`${pd.profileId}::${pd.categoryId}`) as string;
    await prisma.profileCategoryDefect.upsert({
      where: { profileCategoryId_defectId: { profileCategoryId, defectId: pd.defectId } },
      create: { profileCategoryId, defectId: pd.defectId, profileId: pd.profileId, sortOrder: pd.sortOrder },
      update: { sortOrder: pd.sortOrder },
    });
  }

  // Categories the profile no longer selects. Cascades to any remaining defect
  // links under them. Join rows only — global Defect/Category entries are NEVER
  // deleted here, because a defect dropped from every profile may still be
  // referenced by a frozen gradingSnapshot and must stay resolvable.
  const keepPc = new Set(plan.profileCategories.map((p) => `${p.profileId}::${p.categoryId}`));
  const stalePc = (await prisma.profileCategory.findMany({
    select: { id: true, profileId: true, categoryId: true },
  })).filter((r) => !keepPc.has(`${r.profileId}::${r.categoryId}`));
  if (stalePc.length) {
    await prisma.profileCategory.deleteMany({ where: { id: { in: stalePc.map((r) => r.id) } } });
  }
}

/**
 * Project + apply in one call — what PATCH /api/config uses.
 *
 * @throws ProfileRegistrySyncError if the profiles cannot be projected. The
 *   caller must surface this rather than swallow it: a failed sync means the
 *   engine would keep grading against the previous rules while the UI shows
 *   the new ones, which is precisely the divergence this exists to prevent.
 */
export async function syncProfileRegistry(profiles: SourceProfile[]): Promise<RegistryPlan> {
  const locked = await loadLockState();
  const plan = planRegistry(profiles, locked);
  await applyRegistryPlan(plan);
  return plan;
}
