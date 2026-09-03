/**
 * @file registry.routes.ts
 * @description Management surface for the two GLOBAL registries introduced in
 * Stage 1 — the Master Defect List (`Defect`) and the Category Inventory
 * (`Category`). Read, create, and rename; nothing here assigns an entry to a
 * profile or a category.
 *
 * ── Scope boundary (Stage 3) ────────────────────────────────────────────────
 * These endpoints deliberately do NOT touch ProfileCategory or
 * ProfileCategoryDefect. Which defects a profile records under which category
 * is still owned by QualityRules.tsx's JSON writes, re-projected by
 * PATCH /api/config's syncProfileRegistry() hook. Stage 4 replaces that
 * free-text path with a picker that writes the join tables directly; until
 * then a globally-registered entry simply sits unused by any profile, which is
 * a legitimate state — applyRegistryPlan()'s prune only ever deletes JOIN rows,
 * never global Defect/Category rows, so a fresh registration survives every
 * subsequent config write.
 *
 * ── Locking is derived, and enforced HERE, not just in the UI ───────────────
 * An entry is locked once it appears in any Submission.gradingSnapshot. That
 * derivation is not restated in this file: it comes from
 * lib/profileRegistrySync.ts's loadLockUsage(), the same scan the Stage 1
 * backfill and the Stage 2 sync hook use, so "locked" cannot come to mean two
 * different things in two places. The rename endpoints re-check it server-side
 * on every request — a disabled input is a courtesy, not a control, and a
 * direct API call must be refused just as firmly.
 *
 * Renaming a locked entry is refused because the frozen snapshots that
 * reference it carry the name captured at submit time. Letting the registry
 * name drift away from that would leave two different names for one id in the
 * audit trail, with no way to tell which inspection saw which.
 *
 * ── RBAC ────────────────────────────────────────────────────────────────────
 * Group A/B throughout (requireGroup('A','B')), matching the rest of
 * Configuration Control — /config is Group A/B and PATCH /api/config is
 * Group A/B (NAVIGATION_AND_RBAC.md §4/§5). Not Group A only: that tier is
 * reserved for System Admin, and this is ordinary configuration work.
 *
 * Endpoints:
 *   GET   /api/registry/categories        list + lock state + usage count
 *   POST  /api/registry/categories        create { name, evaluationMode }
 *   PATCH /api/registry/categories/:id    rename / re-mode  (409 if locked)
 *   GET   /api/registry/defects           list + lock state + usage count
 *   POST  /api/registry/defects           create { name }
 *   PATCH /api/registry/defects/:id       rename            (409 if locked)
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prismaClient';
import { requireGroup } from '../middleware/auth';
import { loadLockUsage, normalizeName } from '../lib/profileRegistrySync';
import { CATEGORY_EVALUATION_MODES, isCategoryEvaluationMode } from '../lib/categoryEvaluationMode';

export const registryRouter = Router();

/** Registry entries are created by people typing into a box; keep names sane. */
const MAX_NAME_LENGTH = 80;

type EntityKind = 'defect' | 'category';

const ENTITY = {
  defect:   { label: 'Defect',   idPrefix: 'def_', codePrefix: 'DEF', listLabel: 'Master Defect List' },
  category: { label: 'Category', idPrefix: 'cat_', codePrefix: 'CAT', listLabel: 'Category Inventory' },
} as const;

/**
 * Slugifies a display name into the canonical id form the existing data uses
 * (`def_pin_hole`), disambiguating with a numeric suffix on collision — the
 * same generator shape QualityRules.tsx has always applied, so ids minted here
 * are indistinguishable from ids minted by the legacy path.
 *
 * Note the two-layer relationship with the name check: names are rejected as
 * duplicates case-insensitively BEFORE we get here, so this loop only ever
 * fires for genuinely different names that happen to slug identically
 * ("Wet Glove!" vs "Wet Glove?").
 */
function buildId(kind: EntityKind, name: string, taken: Set<string>): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const base = `${ENTITY[kind].idPrefix}${slug || Date.now()}`;
  let id = base;
  let n = 1;
  while (taken.has(id)) id = `${base}_${n++}`;
  return id;
}

/**
 * Next free display code (`DEF-050`). Continues from the current maximum
 * rather than filling gaps: codes are what people read off the screen and
 * quote to each other, so a code must never move or be reused, even after a
 * deletion leaves a hole.
 */
function nextCode(codePrefix: string, existing: string[]): string {
  let max = 0;
  const re = new RegExp(`^${codePrefix}-(\\d+)$`);
  for (const code of existing) {
    const m = re.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${codePrefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Trims and validates a submitted name. Returns an error string, or null if fine. */
function validateName(raw: unknown): { name: string } | { error: string } {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { error: 'Name is required.' };
  }
  const name = raw.trim();
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }
  return { name };
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

registryRouter.get('/categories', requireGroup('A', 'B'), async (_req: Request, res: Response) => {
  try {
    const [rows, usage] = await Promise.all([
      prisma.category.findMany({ orderBy: { code: 'asc' } }),
      loadLockUsage(),
    ]);
    // How many profiles currently select each category — distinct from lock
    // state. A category can be in use by a profile yet still renameable,
    // because nothing has been graded against it yet.
    const profileUse = await prisma.profileCategory.groupBy({
      by: ['categoryId'],
      _count: { _all: true },
    });
    const profileCountById = new Map(profileUse.map((p) => [p.categoryId, p._count._all]));

    res.json(rows.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      evaluationMode: c.evaluationMode,
      locked: (usage.categories.get(c.id) ?? 0) > 0,
      submissionCount: usage.categories.get(c.id) ?? 0,
      profileCount: profileCountById.get(c.id) ?? 0,
    })));
  } catch (error) {
    console.error('[GET /api/registry/categories]', error);
    res.status(500).json({ error: 'Failed to load the Category Inventory.' });
  }
});

registryRouter.post('/categories', requireGroup('A', 'B'), async (req: Request, res: Response) => {
  try {
    const parsed = validateName((req.body ?? {})['name']);
    if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }

    const evaluationMode = (req.body ?? {})['evaluationMode'];
    if (!isCategoryEvaluationMode(evaluationMode)) {
      res.status(400).json({
        error: `Evaluation mode must be one of: ${CATEGORY_EVALUATION_MODES.join(', ')}.`,
      });
      return;
    }

    const nameKey = normalizeName(parsed.name);
    const existing = await prisma.category.findMany({ select: { id: true, code: true, nameKey: true, name: true } });
    const clash = existing.find((c) => c.nameKey === nameKey);
    if (clash) {
      res.status(409).json({ error: `A category named "${clash.name}" already exists.` });
      return;
    }

    const created = await prisma.category.create({
      data: {
        id: buildId('category', parsed.name, new Set(existing.map((c) => c.id))),
        code: nextCode('CAT', existing.map((c) => c.code)),
        name: parsed.name,
        nameKey,
        evaluationMode,
      },
    });
    res.status(201).json({
      ...created, locked: false, submissionCount: 0, profileCount: 0,
    });
  } catch (error) {
    console.error('[POST /api/registry/categories]', error);
    res.status(500).json({ error: 'Failed to create the category.' });
  }
});

registryRouter.patch('/categories/:id', requireGroup('A', 'B'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const row = await prisma.category.findUnique({ where: { id } });
    if (!row) { res.status(404).json({ error: `Category '${id}' not found.` }); return; }

    // Server-side lock enforcement — the authority, not the disabled input.
    const usage = await loadLockUsage();
    const count = usage.categories.get(id) ?? 0;
    if (count > 0) {
      res.status(409).json({
        error: `"${row.name}" is used in ${count} submission${count === 1 ? '' : 's'} and can no longer be ` +
               'edited. Inspection records store the name as it was at the time, so changing it now would ' +
               'leave two different names for the same category in the audit trail.',
        locked: true,
        submissionCount: count,
      });
      return;
    }

    const data: { name?: string; nameKey?: string; evaluationMode?: string } = {};

    if ((req.body ?? {})['name'] !== undefined) {
      const parsed = validateName(req.body['name']);
      if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const nameKey = normalizeName(parsed.name);
      const clash = await prisma.category.findFirst({ where: { nameKey, id: { not: id } } });
      if (clash) {
        res.status(409).json({ error: `A category named "${clash.name}" already exists.` });
        return;
      }
      data.name = parsed.name;
      data.nameKey = nameKey;
    }

    if ((req.body ?? {})['evaluationMode'] !== undefined) {
      const mode = req.body['evaluationMode'];
      if (!isCategoryEvaluationMode(mode)) {
        res.status(400).json({
          error: `Evaluation mode must be one of: ${CATEGORY_EVALUATION_MODES.join(', ')}.`,
        });
        return;
      }
      data.evaluationMode = mode;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Nothing to update — supply a name or an evaluation mode.' });
      return;
    }

    const updated = await prisma.category.update({ where: { id }, data });
    res.json({ ...updated, locked: false, submissionCount: 0 });
  } catch (error) {
    console.error('[PATCH /api/registry/categories/:id]', error);
    res.status(500).json({ error: 'Failed to update the category.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFECTS
// ─────────────────────────────────────────────────────────────────────────────

registryRouter.get('/defects', requireGroup('A', 'B'), async (_req: Request, res: Response) => {
  try {
    const [rows, usage] = await Promise.all([
      prisma.defect.findMany({ orderBy: { code: 'asc' } }),
      loadLockUsage(),
    ]);
    const profileUse = await prisma.profileCategoryDefect.groupBy({
      by: ['defectId'],
      _count: { _all: true },
    });
    const profileCountById = new Map(profileUse.map((p) => [p.defectId, p._count._all]));

    res.json(rows.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      locked: (usage.defects.get(d.id) ?? 0) > 0,
      submissionCount: usage.defects.get(d.id) ?? 0,
      profileCount: profileCountById.get(d.id) ?? 0,
    })));
  } catch (error) {
    console.error('[GET /api/registry/defects]', error);
    res.status(500).json({ error: 'Failed to load the Master Defect List.' });
  }
});

registryRouter.post('/defects', requireGroup('A', 'B'), async (req: Request, res: Response) => {
  try {
    const parsed = validateName((req.body ?? {})['name']);
    if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }

    const nameKey = normalizeName(parsed.name);
    const existing = await prisma.defect.findMany({ select: { id: true, code: true, nameKey: true, name: true } });
    const clash = existing.find((d) => d.nameKey === nameKey);
    if (clash) {
      res.status(409).json({ error: `A defect named "${clash.name}" already exists.` });
      return;
    }

    const created = await prisma.defect.create({
      data: {
        id: buildId('defect', parsed.name, new Set(existing.map((d) => d.id))),
        code: nextCode('DEF', existing.map((d) => d.code)),
        name: parsed.name,
        nameKey,
      },
    });
    res.status(201).json({ ...created, locked: false, submissionCount: 0, profileCount: 0 });
  } catch (error) {
    console.error('[POST /api/registry/defects]', error);
    res.status(500).json({ error: 'Failed to create the defect.' });
  }
});

registryRouter.patch('/defects/:id', requireGroup('A', 'B'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const row = await prisma.defect.findUnique({ where: { id } });
    if (!row) { res.status(404).json({ error: `Defect '${id}' not found.` }); return; }

    const usage = await loadLockUsage();
    const count = usage.defects.get(id) ?? 0;
    if (count > 0) {
      res.status(409).json({
        error: `"${row.name}" is used in ${count} submission${count === 1 ? '' : 's'} and can no longer be ` +
               'edited. Inspection records store the name as it was at the time, so changing it now would ' +
               'leave two different names for the same defect in the audit trail.',
        locked: true,
        submissionCount: count,
      });
      return;
    }

    const parsed = validateName((req.body ?? {})['name']);
    if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }

    const nameKey = normalizeName(parsed.name);
    const clash = await prisma.defect.findFirst({ where: { nameKey, id: { not: id } } });
    if (clash) {
      res.status(409).json({ error: `A defect named "${clash.name}" already exists.` });
      return;
    }

    const updated = await prisma.defect.update({
      where: { id },
      data: { name: parsed.name, nameKey },
    });
    res.json({ ...updated, locked: false, submissionCount: 0 });
  } catch (error) {
    console.error('[PATCH /api/registry/defects/:id]', error);
    res.status(500).json({ error: 'Failed to update the defect.' });
  }
});

export default registryRouter;
