# CHANGELOG.md

**Purpose:** Permanent, append-only archive of this project's full audit/
findings/fix history. Every section below was originally written into
`AUDIT_REPORT.md` in the course of a real work session, and is kept verbatim
with its original §-numbering preserved as historical record (not renumbered).

**For current open findings only, see `AUDIT_REPORT.md`** — it's now a
short, standalone list of what's still unresolved, each item pointing back
to the relevant section here for full context/reasoning. Most of what
follows is closed/historical: fixed bugs, resolved design questions, and
completed feature work, kept here because it's real project history, not
because it's still actionable.

**§1-§40 live in `archived/CHANGELOG_sections-1-40.md`** (everything up to
2026-08-27). They were moved there unchanged when this file passed 7,500 lines;
their §-numbers are unaltered, so an existing citation to `CHANGELOG.md §N` for
N <= 40 resolves to §N in that archive file. This file starts at §41.

**Archival note (2026-08-10):** this file was originally split out of a single
`AUDIT_REPORT.md` that had grown to 3509 lines / 17 sections, at the point
where reading it for fresh-session orientation cost more tokens than the
small number of genuinely open items justified. Nothing was rewritten
or summarized in that split either.

---

## Table of Contents

- [§41](#41-qualitative-na-category-pass-state-snapshot-proof-odour-defect-type-2026-09-02) — Qualitative (N/A) Category — PASS-State Snapshot Proof + `Odour` Defect Type — 2026-09-02
- [§42](#42-master-defect-list--category-inventory--stage-1-schema--migration--2026-09-03) — Master Defect List + Category Inventory — Stage 1 (Schema + Migration) — 2026-09-03
- [§43](#43-master-defect-list--category-inventory--stage-2-engine-cutover--2026-09-03) — Master Defect List + Category Inventory — Stage 2 (Engine Cutover) — 2026-09-03
- [§44](#44-master-defect-list--category-inventory--stage-3-management-surfaces--2026-09-03) — Master Defect List + Category Inventory — Stage 3 (Management Surfaces) — 2026-09-03
- [§45](#45-patch-apiconfig-made-atomic--rejected-saves-now-audited--2026-09-03) — PATCH /api/config made atomic + rejected saves now audited — 2026-09-03
- [§46](#46-category-becomes-name-only-evaluationmode-moves-to-profilecategory--2026-09-03) — Category becomes name-only; evaluationMode moves to ProfileCategory — 2026-09-03
- [§47](#47-38-docs-audit-flagged-items-closed-ai_rulesmd-34-navigation_and_rbacmd-31-api_and_integration_specmd-1--2026-09-05) — #38 docs-audit flagged items closed: AI_RULES.md §3/§4, NAVIGATION_AND_RBAC.md §3.1, API_AND_INTEGRATION_SPEC.md §1 — 2026-09-05
- [§48](#48-amendment-change-acknowledgment-gate--2026-09-05) — Amendment change-acknowledgment gate — 2026-09-05
- [§49](#49-appconfig-legacy-json-column-cleanup-audit_report-37--2026-09-05) — AppConfig legacy-JSON column cleanup (AUDIT_REPORT #37) — 2026-09-05
- [§50](#50-six-core-reference-docs--audit-corrections-audit_report-38-companion-to-47--2026-09-05) — Six core reference docs — audit corrections (AUDIT_REPORT #38; companion to §47) — 2026-09-05
- [§51](#51-cross-profile-amendment-diff--category-membership-changes-now-surfaced-audit_report-42--2026-09-05) — Cross-profile amendment diff — category-membership changes now surfaced (AUDIT_REPORT #42) — 2026-09-05
- [§52](#52-picker-modal-titles-use-select-not-add-audit_report-43--2026-09-06) — Picker modal titles use SELECT not ADD (AUDIT_REPORT #43) — 2026-09-06
- [§53](#53-category-and-defect-action-verbs-finalized-manage-register-add-supersedes-52--2026-09-06) — Category and Defect action verbs finalized: MANAGE, REGISTER, ADD (supersedes §52) — 2026-09-06
- [§54](#54-registrymanagermodal-blurb-and-help-text-wording-closes-53-loose-ends--2026-09-06) — RegistryManagerModal blurb and help text wording (closes §53 loose ends) — 2026-09-06
- [§55](#55-defect-taxonomy-reconciled-against-the-qa-tab-audit_report-2-and-3--2026-09-06) — Defect taxonomy reconciled against the QA tab (AUDIT_REPORT #2 and #3) — 2026-09-06
- [§56](#56-backendfrontend-tls-cert--host-port-made-environment-configurable-closes-installer_package_manifestmd-tls-blocker--2026-09-06) — Backend/frontend TLS cert + host/port made environment-configurable (closes INSTALLER_PACKAGE_MANIFEST.md TLS blocker) — 2026-09-06
- [§57](#57-real-data-cleanup-checkpoint-before-devdb-and-proddb-separation--2026-09-07) — Real-data cleanup checkpoint before dev.db and prod.db separation — 2026-09-07
- [§58](#58-production-database-separated-from-the-dev-seed-via-a-database_url-default--2026-09-07) — Production database separated from the dev seed via a DATABASE_URL default — 2026-09-07
- [§59](#59-quality-analytics-menu-item-frozen-behind-a-frontend-feature-flag--2026-09-07) — Quality Analytics menu item frozen behind a frontend feature flag — 2026-09-07
- [§60](#60-github-actions-ci-workflow-runs-the-quality-gate-on-push-and-pr-to-master--2026-09-07) — GitHub Actions CI workflow runs the quality gate on push and PR to master — 2026-09-07
- [§61](#61-dev-tools-wipe-endpoint-gated-behind-a-password-issue-24--2026-09-07) — Dev-tools wipe endpoint gated behind a password (issue #24) — 2026-09-07
- [§62](#62-production-hardening-pass--frontend-console-stripping-and-generic-backend-500s--2026-09-07) — Production-hardening pass — frontend console stripping and generic backend 500s — 2026-09-07
- [§63](#63-pre-packaging-cleanup--neutral-source-comments-wider-editor-ignores-changelog-archive-split--2026-09-07) — Pre-packaging cleanup — neutral source comments, wider editor ignores, CHANGELOG archive split — 2026-09-07
- [§64](#64-redirect-uri-panel-derives-the-live-value-instead-of-a-hardcoded-list--2026-09-07) — Redirect URI panel derives the live value instead of a hardcoded list — 2026-09-07
- [§65](#65-on-prem-installer-and-packaging-step--windows-service-seeded-database-exclusion-verification--2026-09-07) — On-prem installer and packaging step — Windows service, seeded database, exclusion verification — 2026-09-07
- [§66](#66-installer-generates-a-self-signed-tls-certificate-when-none-is-supplied--2026-09-07) — Installer generates a self-signed TLS certificate when none is supplied — 2026-09-07
- [§67](#67-nssm-service-wrapper-bundled-into-the-installer-package--2026-09-07) — NSSM service wrapper bundled into the installer package — 2026-09-07
- [§68](#68-installer-review-fixes-host-aware-health-check-and-service-management-commands--2026-09-11) — Installer review fixes: HOST-aware health check and service management commands — 2026-09-11

---

## 41. Qualitative (N/A) Category — PASS-State Snapshot Proof + `Odour` Defect Type — 2026-09-02

Closes `AUDIT_REPORT.md` open item #14 (previously "PARTIALLY RESOLVED
2026-09-02"). The FAIL path for a qualitative (N/A-mode) category had already
been proven live — submission `cmtjgvxps0001eoc4e5ji6vtv`, where
`qualitativeState`, `totalDefectTypes`, and the lot verdict all froze into
the `gradingSnapshot` correctly. What stayed unobservable: a PASS state for
a qualitative defect type, because `prof_default`'s only qualitative category
(OTHERS) had just one defect type (Donning) — no sibling to hold a PASS while
another failed.

**Unblocking config change:** Jerry added a second defect type, **Odour**, to
the OTHERS category in `prof_default` (2026-09-02), specifically so a mixed
PASS/FAIL qualitative category could exist.

**Proof submission:** a real PIN-wizard submission under Jason Tan's account
recorded **Donning = PASS, Odour = FAIL** in the OTHERS category. Jerry
live-verified the Inspection Records expanded panel:

- category header reads **"1 of 2 failed"** — the PASS defect type is counted
  in the denominator;
- only the **Odour FAIL chip** renders — PASS states are intentionally not
  shown as chips, per the locked display spec (FAILs only);
- category verdict is **FAIL** — any FAIL in a qualitative category fails the
  category.

Both PASS and FAIL qualitative states are now confirmed to freeze and render
correctly from a live `gradingSnapshot`. Item #14 fully RESOLVED.

---

## 42. Master Defect List + Category Inventory — Stage 1 (Schema + Migration) — 2026-09-03

First stage of moving defect/category definitions out of per-profile JSON and
into a global vocabulary that profiles select from. **Schema and data only** —
`aqlEvaluator.ts`, `resolveVerdict.ts`, `buildFrozenCategoryAnalysis()`,
`QualityRules.tsx` and the wizard are all untouched, and
`AppConfig.inspectionProfiles` remains the live grading source of truth. Stage 2
rewires the call sites.

Preceded by a read-only discovery pass whose findings were re-verified against
the live DB immediately before any write.

### What the discovery pass corrected

The working assumption going in was that both profiles already shared a
category set and only defect *naming* differed. Neither half held up:

- **Category sets genuinely differ.** Only `AND` and `BARRIER` are common.
  FACTORY STANDARD has `VISUALS` / `OTHERS` / `RECORD ONLY`; MEDLINE has
  `VISUAL — CRITICAL` / `MAJOR` / `MINOR`. FACTORY STANDARD collapses all
  cosmetic defects into one bucket at AQL 2.5; MEDLINE splits them across a
  three-tier severity ladder (1.0 / 2.5 / 4.0). These are different quality
  regimes, not naming drift, so the inventory unions them as **distinct rows**
  rather than collapsing either into the other.
- **Defect ids were already a de-facto global namespace.** 46 of 50 distinct
  defects carry the same id *and* the same name in both profiles, and every
  stored defect is already exactly `{id, name, categoryId}`. The merge was far
  cheaper than expected.

### New models (`schema.prisma`)

| Model | Purpose |
| --- | --- |
| `Defect` | Global Master Defect List |
| `Category` | Global Category Inventory (superset) |
| `ProfileCategory` | Which categories a profile uses, at what AQL level |
| `ProfileCategoryDefect` | Which defects a profile records under which category |

Full field-level rationale in `DATA_SCHEMAS_AND_TYPES.md` §2.2. The decisions
worth restating here:

- **Canonical ids are the existing `def_*` / category slugs, never re-minted.**
  This was the single highest-risk item. `Submission.defects` and
  `gradingSnapshot.defectItems[].id` store those exact strings on 27 rows, and
  `POST /api/amendments/:id/approve` re-grades by feeding them back through
  `resolveVerdict()`. Re-IDing would make every lookup miss, resolve counts to
  `0` via `defectCounts[def.id] ?? 0`, and could flip a stored verdict
  `FAILED → PASSED` while overwriting the original snapshot. `DEF-001` /
  `CAT-001` are a **separate cosmetic display field**, never a lookup key.
- **AQL lives on `ProfileCategory`, not `Category`** — two profiles may grade
  the same global category at different AQL levels.
- **`nameKey @unique`** enforces the master list's no-duplicate-names rule at
  the DB level, inverting the old per-profile rule. SQLite `UNIQUE` is
  case-sensitive, so a bare `name @unique` would admit `'Wet Glove'` twice.
- **`ProfileCategoryDefect.profileId` is denormalized** purely to make
  `@@unique([profileId, defectId])` expressible — a defect in two categories of
  one profile would be double-counted by both `evaluateAQLVerdict()` and
  `buildFrozenCategoryAnalysis()`.
- **`sortOrder`** preserves admin-authored ordering the JSON arrays carry
  implicitly, so Stage 2 does not reshuffle every profile screen.

### The `RECORD_ONLY` ↔ `''` trap

`Category.evaluationMode` uses a clean enum
(`CUMULATIVE`/`GRANULAR`/`QUALITATIVE`/`RECORD_ONLY`) while the engine reads
`'CUMULATIVE'`/`'GRANULAR'`/`'N/A'`/`''`. **Two of four rows are not identity
mappings**, and `RECORD_ONLY ↔ ''` is load-bearing: the empty string is the only
trigger for `aqlEvaluator.ts`'s true-exclusion path
(`if (!category.evaluationMode) continue;`), pinned down in
`defaultProfileSeed.ts` as `EMPTY_EVAL_MODE_IS_RECORD_ONLY`. Mapping it back to
`null` produces a hard 400 from `validateInspectionProfiles()`; mapping it to
`'CUMULATIVE'` would start grading a record-only category — and FACTORY
STANDARD's RECORD ONLY category already holds `def_sagging` in a real frozen
submission.

New `backend/src/lib/categoryEvaluationMode.ts` is the single canonical
translation in both directions. Both functions **throw** on unrecognised input
rather than falling back, because a silent default here is exactly how a
record-only category would start failing lots.

### Migration (`backend/scripts/backfill-master-defect-list.ts`)

Run once against `dev.db`. Additive only — never writes `AppConfig`,
`Submission`, or `AmendmentLog`.

| Table | Rows |
| --- | --- |
| `Category` | 8 |
| `Defect` | 49 |
| `ProfileCategory` | 10 |
| `ProfileCategoryDefect` | 96 |

**One conflict, exactly as predicted.** `'Wet Glove'` existed as
`def_wet_glove_1` (FACTORY STANDARD) and `def_wet_glove` (MEDLINE) — a
fingerprint of `handleDuplicateProfile`'s cross-profile id deduplication.
`def_wet_glove_1` won on the **locked** rule (it appears in a real frozen
snapshot); `def_wet_glove` does not survive as a global row, and MEDLINE's join
points at `def_wet_glove_1` under `VISUAL — MAJOR` at AQL 2.5, grading
unchanged. Both selection rules — locked-wins and default-profile-wins — pointed
the same way, so no judgement call was needed.

Locked-id safety is enforced structurally: the script refuses to alias away any
id referenced by a frozen `gradingSnapshot`, aborts if *both* sides of a
conflict are locked rather than guessing, and aborts if any locked id is absent
from the profiles it is migrating. Lock state is **derived** from snapshots on
every run, never stored as a drift-prone boolean — same reasoning as
`getProductCodeUsage()`.

### Verification

- **Round-trip check inside the script**: both profiles reproduce identical
  category sets, AQL levels, and per-category defect membership vs the live
  JSON, defect-for-defect. The script aborts if it cannot prove this. Row counts
  alone were not treated as sufficient — membership can be wrong while counts
  are right.
- **Purely additive, proven by SHA-256 per table** before and after the run:
  `Submission` (27), `AppConfig` (1), `AmendmentLog` (22), `AccessLog` (59),
  `PinUser` (2), `M365UserRole` (5) all byte-identical.
- **Unicode integrity**: all 8 category and 49 defect names byte-identical to
  source, including the U+2014 em-dash in MEDLINE's `VISUAL — …` names (the
  Windows console renders it as `?`, so this was checked by codepoint).
- All 29 locked defect ids and 5 locked category ids present in the new tables.
- 0 duplicate `nameKey`s; 0 defects in >1 category per profile; 0 denormalized
  `profileId` mismatches against parent; `DEF-001`..`DEF-049` with no gaps.
- `tsc --noEmit` clean; `vitest` 20/20 passing.

Applied with `prisma db push` + `prisma generate` per `AI_RULES.md` §7.

Safety tag `pre-master-defect-list` (annotated, pushed to origin) points at
`8a7f451`, the commit immediately before this work.

---

## 43. Master Defect List + Category Inventory — Stage 2 (Engine Cutover) — 2026-09-03

The AQL engine now grades from the global Category/Defect tables instead of the
`AppConfig.inspectionProfiles` JSON blob. Schema unchanged from §42; this is a
read-source swap plus the write-hook that keeps the two representations in step
until the admin UI moves at Stage 3.

### What moved, and what deliberately did not

`resolveVerdict()` resolves a profile's categories, per-profile AQL levels, and
defect membership through the new `backend/src/engine/profileRules.ts`, which
reads `ProfileCategory` / `ProfileCategoryDefect` / `Category` / `Defect` in two
queries and returns them in the engine's own shape.

Profile **identity** did NOT move — there is no Profile table, so profiles still
live in the JSON. `resolveVerdict()` asks the JSON *"does this profile exist and
what is it called"* and asks `profileRules` *"what are its rules"*. Three
consequences were preserved deliberately:

- A profile present in the JSON with **no** `ProfileCategory` rows behaves
  exactly like the old empty-`aqlCategories` case: it falls through to the
  safety net rather than grading against nothing.
- The safety net still scans `profilesList` in **AppConfig order**, so "first
  usable profile" cannot silently become "first in map iteration order".
- The first-run bootstrap stays **seed-based**, since on a fresh install the new
  tables are empty too.

### The name-OR-id join is gone

`DefectDefinition.currentClass`, matched against `category.name || category.id`,
became `categoryId` matched strictly by id — in both `evaluateAQLVerdict()` and
`buildFrozenCategoryAnalysis()`, which must never disagree about a category's
membership. `defaultClass` was deleted outright: set on every defect, read by
nothing.

Verified before removing the name arm that nothing depended on it. Every stored
defect links by id, and the zero-state seed's category ids are identical to
their names so both arms agreed. **Only the engine test's fixtures used the name
path** (`currentClass: 'VISUAL'` against `id: 'cat_visual'`); they now link by id
like real data. The fallback was a live hazard: the engine would grade a
name-linked defect that both the wizard and the admin UI — id-only, always —
rendered as an empty category.

### Write-hook: PATCH /api/config re-projects on every profile write

Stage 2 moved the engine while the admin UI still writes JSON. Without a
projection on write, the first Quality Rules edit would leave the engine grading
pre-edit rules while the UI showed the new ones — silently. That is the exact
failure class §10 was logged for, so `PATCH /api/config` now calls
`syncProfileRegistry()` whenever the payload touches `inspectionProfiles`. Same
write-hook shape B2 used for `AppConfig.products`.

New `src/lib/profileRegistrySync.ts` is the single implementation of that
projection; `scripts/backfill-master-defect-list.ts` was refactored into a thin
CLI wrapper around it, keeping only its reporting and round-trip proof. Two
copies of this projection would drift the way the three copies of the profile
seed did (§10). The refactored script was verified to produce a byte-identical
plan to the committed §42 run.

A sync failure returns **409 with the specific conflict**, never swallowed — if
the tables could not be updated, the engine is still on the old rules and the
admin has to know. The sync runs after the AppConfig write, so a failure can
never leave the JSON unwritten but the tables updated.

### Bug found by end-to-end testing the hook

Moving a defect between two categories of the same profile violated
`@@unique([profileId, defectId])`: the planned row carried a new
`profileCategoryId` while the stale row still held the same
`(profileId, defectId)` pair, and the prune only ran *after* the upserts. Defect
links are now pruned **before** inserting — a row is stale if the plan no longer
contains its `(profileId, defectId)` at all, or contains it under a different
`profileCategory` — so a move is a clean delete-then-insert. This would also
have broken a backfill re-run after any defect moved. The §42 denormalized
unique constraint is what caught it.

Global `Defect`/`Category` rows are never deleted by a prune, only join rows: a
defect dropped from every profile may still be referenced by a frozen
`gradingSnapshot` and must stay resolvable.

### Regression proof

New `scripts/regression-grading-snapshot.ts` captures the complete
`resolveVerdict()` output for every stored case and deep-diffs two runs. Both
runs were pointed at the same frozen database copy so a concurrent dev-server
write could not pollute the comparison.

**76 cases: 27 submissions + 27 synthetic MEDLINE + 22 amendment approve-path.**

**Zero** changes to any grading-bearing field across all 76 — verdict,
per-category `passed`, `threshold` (Ac/Re), `actualAqlAchieved`,
`failingDefects`, `evaluationMode`, `aqlLevel`, `totalDefectTypes`,
`dimensionResults`, `evaluationProfileId`/`Name`. Submissions 27/27 and
amendments 22/22 byte-identical.

One case differed, in `defectItems` only, and it is the §42 alias merge working
as designed: submission `cmtbaas2l000a58c4fyrbtnd8` recorded `def_wet_glove_1`,
and MEDLINE's OLD rules looked for its own `def_wet_glove` and **missed it**.
Now that the two are one canonical defect, MEDLINE finds it — strictly more
correct. Blast radius zero: MEDLINE has no submissions and no products mapped to
it, so this combination is reachable only in the synthetic replay. Verdict,
pass/fail and Ac/Re were unchanged even there.

RECORD ONLY was checked explicitly, as the highest-risk category type: it
appears in 49 of the 76 cases, always with `passed: null`, `threshold: null`,
`evaluationMode: ''`, and **zero** `CategoryResult` entries — still fully
excluded from the verdict, including the two cases where `def_sagging` was
actually recorded under it (count 5, `failing: false`).

The write-hook was tested end-to-end on a database copy: edit profile JSON →
tables stale → `syncProfileRegistry()` → the engine immediately grades
`def_donning` under its new category (OTHERS/`N/A` → VISUALS/`GRANULAR`), and
restoring the edit restores the original placement.

`tsc --noEmit` clean; `vitest` 20/20.

### Not done in this stage

The old embedded fields are still present and still written —
`AppConfig.inspectionProfiles` holds both profiles and all 96 embedded defect
definitions, and `aqlCategories`/`defectDefinitions` remain as the empty legacy
columns they already were. Removal is a later cleanup stage, after the Stage 3
UI cutover.

---

## 44. Master Defect List + Category Inventory — Stage 3 (Management Surfaces) — 2026-09-03

Admin surfaces for the two global registries: view them, register new entries,
rename existing ones, and see what is locked. **Management only** — nothing in
this stage assigns an entry to a profile or a category. The per-category
"+ ADD" buttons, `handleAddDefect()`, the kanban drag-and-drop and profile
duplication are all deliberately untouched; they become picker surfaces at
Stage 4.

### Backend — six Group A/B endpoints

```
GET   /api/registry/categories      list + lock state + usage counts
POST  /api/registry/categories      create { name, evaluationMode }
PATCH /api/registry/categories/:id  rename / re-mode   (409 if locked)
GET   /api/registry/defects         list + lock state + usage counts
POST  /api/registry/defects         create { name }
PATCH /api/registry/defects/:id     rename            (409 if locked)
```

`requireGroup('A','B')` throughout, matching `/config` and `PATCH /api/config`.
Not Group A only — that tier is reserved for System Admin, and this is ordinary
configuration work. The two `GET`s are gated rather than ungated-because-
non-mutating: they serve configuration-administration data with no consumer
outside Configuration Control.

**Lock enforcement is server-side.** Every rename re-derives lock state per
request and returns `409` naming the number of submissions involved. Renaming a
locked entry is refused because frozen `gradingSnapshot`s carry the name
captured at submit time; letting the registry name drift would leave two names
for one id in the audit trail with no way to tell which inspection saw which.

The derivation is not restated anywhere. `lib/profileRegistrySync.ts` gains
`loadLockUsage()` (counts per id), and the existing `loadLockState()` becomes a
projection of it — one scan, one definition, so the boolean and the count can
never disagree about what "locked" means. Counts are per **submission**, not per
occurrence, so the number reads as "used in N inspections".

Ids and codes follow the established conventions: canonical ids are slugified
server-side into the existing family (`def_pin_hole`), and display codes
continue from the current maximum rather than filling gaps — a code is what
people read off the screen and quote, so it must never move or be reused.

### A Stage 3/4 interaction, guarded

An admin can now register a name in the registry, while `QualityRules.tsx` still
mints its own slug id for free-text names. The same name arriving down both
paths collided with `nameKey`'s UNIQUE constraint as a raw Prisma 500.
`applyRegistryPlan()` now detects it and raises `ProfileRegistrySyncError`,
which `PATCH /api/config` already converts to a clean 409 explaining that names
are unique system-wide. The whole interaction disappears at Stage 4.

Newly registered entries survive later config writes: `applyRegistryPlan()`'s
prune only ever deletes JOIN rows, never global `Defect`/`Category` rows, so an
entry not yet used by any profile is a legitimate resting state.

### Frontend — one modal, parameterized

`RegistryManagerModal` serves both registries via an `entity` prop. The two
flows differ in exactly one field (a category carries an evaluation mode, a
defect does not), so two near-identical components would have drifted the moment
either gained a column.

Searchable table, "register new", inline rename of unlocked entries. Locked rows
are greyed with a padlock and show "used in N submissions" plus the reason.
Display codes are read-only everywhere. A `409` carrying `locked` also triggers
a reload, so a row that became locked since the list was fetched corrects itself
rather than sitting there looking editable.

Button wiring, per the locked design:

- **"+ ADD CATEGORY"** keeps its position and prominence in DEFECT CATEGORY
  SETUP but now opens the Category Inventory instead of creating a category
  inline.
- **"+ ADD DEFECT"** is new, on the DEFECT MANAGEMENT KANBAN title row at
  title-level prominence, opening the Master Defect List.

The old inline-create path is **removed, not bypassed**: `isAddingCategory`,
`newCategoryForm`, `startAddingCategory()`, `saveAddCategory()` and the inline
add-category table row are all gone, verified at zero references. A stale
comment in `handleDuplicateProfile` describing `saveAddCategory`'s id generator
was rewritten rather than left dangling.

Styling follows `UI_DESIGN_SYSTEM.md`: emerald ghost-outline header buttons
(§3.5), standard toolbar with search (§4.3), standard reading data table (§4.2),
value chips for codes and pill state badges for evaluation modes — emerald for
the two modes that grade, grey for the two that do not (§4.8).

### Verification

Backend tested over real HTTPS against an **isolated instance on port 4109**
backed by a copy of `dev.db`, so the dev server and its database were untouched:

- **RBAC** on read and write routes: no header `401`, unrecognized role `401`,
  `OPERATOR` `403`, `SUPERVISOR` `403`, `MANAGER` `200`, `ADMIN` `200`
- **Create**: valid `201` (`DEF-050` / `CAT-009`, continuing from the max),
  case+whitespace-variant duplicate `409`, blank name `400`, bad
  `evaluationMode` `400`
- **Edit unlocked**: `200`, rename verified **persisted** on re-read
- **Edit locked**: `def_knocking` `409`, category `AND` `409`, `BARRIER`
  mode-only `409` — all three verified **unchanged** on re-read, no leak
- **Edge**: rename onto an existing name `409`, empty body `400`, unknown id
  `404`

backend `tsc --noEmit` clean, `vitest` 20/20; frontend `tsc -b` clean, `vitest`
63/63 across 11 files. App confirmed loading with no module errors.

**Note for future sessions:** both dev servers speak **HTTPS**, not HTTP
(`server.ts` uses `https.createServer`, and `vite.config.ts` sets `https`).
Earlier sessions recorded the dev server as "unreachable from this environment";
that was plain HTTP being spoken to a TLS socket. `curl -k https://localhost:4009`
works fine.

---

## 45. PATCH /api/config made atomic + rejected saves now audited — 2026-09-03

An accidental Kanban edit surfaced two real gaps in the Stage 2 write-sync hook.

**The incident.** `def_odour` is a defect frozen into a real FAILED submission's
`gradingSnapshot` (lot `A001A6245003`) — it is one of the reasons that lot
failed. FACTORY STANDARD's OTHERS category was its only home in any profile.
Deleting it there and saving asked the registry projection to drop a locked
defect from the Master Defect List, which `planRegistry()` correctly refuses.
The save returned `409` — but the way it did so was wrong twice.

### Gap 1 — the write was not atomic

`PATCH /api/config` wrote the `AppConfig` JSON first, then ran
`syncProfileRegistry()`. On a projection failure the JSON was already
committed, so the stored profiles said "def_odour gone" while the grading
tables (what `engine/profileRules.ts` actually reads) still had it. A silent
split-brain: the Kanban showed one thing, the engine graded another, and
nothing forced resolution. The 409 body literally said *"your changes were
saved, but…"*.

**Fix:** the `AppConfig` upsert and `syncProfileRegistry()` now run inside one
`prisma.$transaction(async (tx) => …)`. A `ProfileRegistrySyncError` thrown by
the projection propagates out of the callback and rolls the JSON write back
with it. A rejected save changes nothing, and the 409 says so.

`profileRegistrySync.ts`'s `loadLockState` / `loadLockUsage` /
`applyRegistryPlan` / `syncProfileRegistry` each gained an optional `db`
parameter (`RegistryDb = Prisma.TransactionClient`) defaulting to the module
singleton — so the one-off backfill script and the registry routes call them
unchanged, and only `PATCH /api/config` threads the `tx` client through. 20s
transaction timeout covers `applyRegistryPlan()`'s ~160 sequential upserts
against local SQLite.

This is the **first interactive (callback-form) `$transaction`** in the
codebase — every prior use is the array/batch form. Confirmed working with
`@prisma/adapter-libsql`.

### Gap 2 — no audit trail on a rejected save

`logAccess()` ran only after a successful sync, so the failed attempt left no
`AccessLog` row at all — despite (pre-fix-1) a write having partially landed.
`AppConfig.updatedAt` had moved with nothing to explain it.

**Fix:** new `AccessLogAction` value `'CONFIG_WRITE_FAILURE'`, written on the
rejection path with the specific conflict in `detail`. Distinct from
`CONFIG_WRITE` because nothing was persisted. The `_FAILURE` suffix matches the
existing `M365_LOGIN_FAILURE` / `PIN_LOGIN_FAILURE` naming, so
`AccessLogPanel.tsx` renders it red with no frontend change.

### Verification

Over real HTTPS against an isolated instance on port 4119 backed by a copy of
`dev.db` (dev server untouched):

| Case | Result |
| --- | --- |
| Delete locked `def_odour`, save | `409`; `AppConfig.updatedAt` **unchanged** (JSON rolled back); `def_odour` untouched in the tables; `CONFIG_WRITE_FAILURE` logged with the reason |
| Non-profile save (`companyName`) | `200`; transaction commits; `CONFIG_WRITE` logged |
| Profile save re-adding `def_odour` to OTHERS | `200`; sync succeeds **inside** the transaction; JSON and tables both end at `['def_donning','def_odour']`; `CONFIG_WRITE` logged |

backend `tsc --noEmit` clean, `vitest` 20/20; frontend `tsc -b` clean.

### Not fixed by this change

The **live `dev.db` is still split-brained** from the original incident —
FACTORY STANDARD's JSON has 48 defect definitions, the tables have 49
(`def_odour` present in the tables, absent from the JSON). The fix prevents
recurrence; it does not heal the existing divergence. That is resolved by
re-adding `def_odour` to OTHERS through the Kanban, which — with this change —
now runs through the transaction and commits cleanly (third test row above).
Until then, **every** Quality Rules save 409s, because no projectable plan can
omit a locked defect. That is the intended forcing function.

---

## 46. Category becomes name-only; evaluationMode moves to ProfileCategory — 2026-09-03

Design correction to Stages 1–3, not new functionality.

### The problem

`Category.evaluationMode` made a category's grading behaviour a **permanent,
global property of its name**. "AND" meant `CUMULATIVE` everywhere, forever,
for every profile that adopted it. That was wrong on its own terms: AQL level
was already per-profile (on `ProfileCategory`), so the model was internally
inconsistent — one grading parameter was profile-owned and the other was not.
It also had no way to express a legitimate case: two profiles adopting the same
category name under different evaluation modes.

### The correction

`Category` is now a **name and nothing else**, exactly symmetric with `Defect`
— both are `{ id, code, name, nameKey }`. `evaluationMode` joins `aqlLevel` on
`ProfileCategory`, so **all** grading behaviour is decided by the adopting
profile.

```
Category         id, code, name, nameKey            (name-only)
ProfileCategory  + evaluationMode, beside aqlLevel  (per-profile)
```

`ProfileCategory.evaluationMode` deliberately carries **no `@default`**: a
silent fallback is precisely how a `RECORD_ONLY` category would quietly become
graded, so every writer must state the mode explicitly.

### Migration

Two `db push` steps rather than one, to avoid destroying rows. SQLite cannot add
a required column to a populated table, and `--force-reset` would have dropped
all 29 submissions.

1. **Phase A** — add the column under a temporary `@default("CUMULATIVE")` and
   drop `Category.evaluationMode`. That drop was the only data loss (8 values)
   and required explicit user consent, since Prisma blocks AI agents from
   `--accept-data-loss` by design.
2. **Backfill** — re-run `scripts/backfill-master-defect-list.ts`. The migration
   *is* the existing projection: `planRegistry()` now captures `evaluationMode`
   per profile-category from that profile's own JSON (through
   `categoryEvaluationMode.ts`, so RECORD ONLY's `''` becomes `RECORD_ONLY`),
   and `applyRegistryPlan()` writes it on the join. Round-tripped clean for both
   profiles.
3. **Phase B** — remove the temporary default.

**Precondition verified in live data before backfilling, not assumed:** `AND`
and `BARRIER` — the only categories shared by FACTORY STANDARD and MEDLINE —
carry `CUMULATIVE` in both, so the move was lossless and no profile pair
conflicts.

### Code

- `profileRules.ts` reads `pc.evaluationMode` instead of
  `pc.category.evaluationMode`.
- `planRegistry()` no longer warns on cross-profile mode differences — that is
  now **legal**, not a conflict. Only a differing *name* for one id still warns.
- `registry.routes.ts` category endpoints are name-only: `POST`/`PATCH` no
  longer accept or validate `evaluationMode`, `GET` no longer returns it.
- `RegistryManagerModal.tsx` drops the EVAL MODE column, the mode selector on
  register and rename, and the now-dead `isCategory` branch — the two registries
  are structurally identical, so the shared component is now the honest
  representation rather than a convenience.
- `categoryEvaluationMode.ts` is **unchanged**. The `RECORD_ONLY <-> ''`
  contract stays exactly as it was; only *where* the raw value is read from
  moved.

Untouched deliberately: the USAGE column, lock state, and padlock treatment.
Locking is about the name/identity — the thing frozen snapshots reference — and
never was about `evaluationMode`.

The DEFECT CATEGORY SETUP table needed no change and got none: it renders from
`config.inspectionProfiles`, where each category already carries its own
per-profile `aql` and `evalMode`. Verified against the live `GET /api/config`.

### Verification

The 80-case grading regression (29 submissions + 29 synthetic MEDLINE + 22
amendment approve-path) was run **twice against the same database contents**:
once with the PRE-rework code in a temporary `git worktree` at `HEAD` against a
pre-rework database copy, then with the post-rework code.

**ALL 80 CASES BYTE-IDENTICAL.** Row counts unchanged — Category 8, Defect 49,
ProfileCategory 10, ProfileCategoryDefect 96, Submission 29, AmendmentLog 22.

backend `tsc --noEmit` clean, `vitest` 20/20; frontend `tsc -b` clean, `vitest`
63/63.

### Consequence for Stage 4

The picker must ask for **evaluationMode at adoption time** — when a profile
takes a category out of the inventory — alongside the AQL level. It is no
longer supplied at category registration, because a registered category has no
mode. `CAT-009` is a permanently skipped display code (a `ZZ Rework Probe`
category created while verifying the live API was deleted; codes are never
reused).

## 47. #38 docs-audit flagged items closed: AI_RULES.md §3/§4, NAVIGATION_AND_RBAC.md §3.1, API_AND_INTEGRATION_SPEC.md §1 — 2026-09-05

The #38 docs-audit pass (six-core-MD sweep triggered by the `AppConfig`
legacy-JSON cleanup) surfaced three items it deliberately left unresolved
rather than correcting unilaterally — two genuine judgment calls for Jerry,
one gap needing checkable external facts. All three were closed in one
session once Jerry supplied the missing decisions/facts.

### AUDIT_REPORT.md #41 — endpoint documentation coverage gap

Nine real, live backend endpoints existed in code but were never written up
in `API_AND_INTEGRATION_SPEC.md`'s REST API ENDPOINTS section, and eight of
them were also missing from `NAVIGATION_AND_RBAC.md` §5.1's session-gate
table (`GET /api/access-log` was already correctly listed there — the
original #41 flag was itself slightly wrong on that one point, corrected in
the closing note rather than repeated).

Added three new `API_AND_INTEGRATION_SPEC.md` §1 subsections, matching the
existing Role/Payload/Response/Auth bullet structure, full shapes verified
against the actual route handlers (not assumed):
- **Access Log (Group A Route):** `GET /api/access-log`.
- **Microsoft 365 User Administration (Group A Routes):** all six
  `/api/m365-users*` routes (`GET`, `POST /invite`, `PATCH /:id`,
  `PATCH /:id/deactivate`, `PATCH /:id/reactivate`, `DELETE /:id`) plus
  `POST /api/auth/m365-login` and `POST /api/auth/claim-bootstrap-admin`.
- **Dev Tools (Development Only):** `DELETE /api/dev/submissions/all` —
  confirmed via `devTools.routes.ts` to be the *only* route under
  `/api/dev/*`, so nothing else was missed.

`NAVIGATION_AND_RBAC.md` §5.1 gained 8 new table rows for the same
endpoints (minus `GET /api/access-log`, already present).

Commit `8e59dba` (`AUDIT_REPORT.md` cites `006e676` — see the
self-referencing-hash note below).

### AUDIT_REPORT.md #39 — AI_RULES.md §3/§4 process-rule staleness

Jerry decided both sub-issues previously flagged as ambiguous:

- **§3 (WORKSPACE EXECUTION MODES):** removed the "retained for historical
  context only" / Antigravity-retirement blockquote it incorrectly shared
  with §2 — Plan Mode is real, current Claude Code behavior (the very Plan
  Mode used to close out #41 minutes earlier in the same session), not a
  retired Antigravity artifact. Rewrote the Plan/Execute Mode bullets to
  describe the actual `EnterPlanMode`/`ExitPlanMode` tool mechanics: task-
  shape-triggered entry (not a typed `/plan` command), read-only except for
  the plan file while active, `ExitPlanMode` to request approval. §2's
  identical blockquote was left untouched — correct there, since §2's
  model-tier table did include real Antigravity-era choices. Also fixed a
  now-stale cross-reference in the file header (line 5), which pointed to
  "historical notes in §2 and §3" — corrected to just §2.
- **§4 (renamed EXECUTION PROTOCOL, was "INCREMENTAL EXECUTION PROTOCOL /
  Micro-Step Rule"):** replaced "One Complete File per Turn" plus
  approve-before-every-next-file with the rule actually practiced across
  recent sessions — batched multi-file turns are normal, and approval
  gates are reserved for genuinely irreversible steps (schema drops,
  `--accept-data-loss`, force-push), cross-referencing §5's Git Safety
  rules instead of duplicating them. §5 already described this philosophy
  correctly; §4 was the section that had drifted from it. "No Incomplete
  Code Snippets" was kept unchanged — still accurate.

Commit `2436a2a` (`AUDIT_REPORT.md` cites `f646211`).

### AUDIT_REPORT.md #40 — Entra redirect URI protocol mismatch

`NAVIGATION_AND_RBAC.md` §3.1 documented the dev redirect URI as
`http://localhost:4001`; the dev server serves HTTPS only, but Entra's
`http://localhost` exemption meant the doc *might* still have been
technically correct — an external fact the codebase alone couldn't settle.
Jerry checked the actual Azure Portal App Registration (Authentication →
Single-page application): the real registered value is `https://
localhost:4001` — the doc was genuinely wrong, not exempted.

Corrected the line, and added a second registered redirect URI Jerry
flagged from a prior IT correspondence — `https://10.10.110.31:4001` (LAN
access, this laptop's reserved/static IP) — which was not stale but simply
absent from all six core MDs, confirmed by a full grep before adding it.
Both values were independently cross-checked against already-live code that
already treated them as authoritative: `EnvironmentInfoPanel.tsx`'s
`EXPECTED_REDIRECT_URIS` array and `vite.config.ts`'s mkcert
HTTPS-for-both-hosts setup, both predating this fix and both agreeing with
the Portal.

Commit `5435266` (`AUDIT_REPORT.md` cites `af104d5`).

### The self-referencing commit hash — an accepted, unavoidable quirk

Each of these three close-outs cites its own commit's hash inside
`AUDIT_REPORT.md`, in the same file that commit changes — a chicken-and-egg
problem with no exact solution: editing the citation to match a hash always
produces a *new* hash, confirmed empirically (one case cycled through four
different hashes before the citation was accepted as one generation stale).
The pattern settled on and reused for all three: write the entry, commit,
read the real hash back, do **exactly one** amend to insert it, and stop —
never loop chasing exact convergence. Each entry's cited hash is therefore
one amend-generation behind the real final commit; this is expected, not a
bug, should it ever be noticed later.

### Verification

Documentation-only across all three — no code, schema, or behavior
changes. Backend `tsc --noEmit` clean, 24/24 tests; frontend `tsc -b`
clean, `oxlint` 0 errors, 88/88 tests — run once at session close to
confirm the doc-only diffs hadn't touched anything else.

---

## 48. Amendment change-acknowledgment gate — 2026-09-05

An amendment's stated reason had no structural relationship to what the
amendment actually changed. The case that prompted this is lot
`A001A6247003`: its note read `"wrong inpsection profile"` while the same
payload also raised `def_thin_weak_spot` and `def_shining_oily_mark` from 0
to 1. Nothing in the app could distinguish that from an amendment whose
reason genuinely covered its contents — the reason was free text, and free
text is not checkable against anything.

Investigated first as a suspected engine bug, then fixed as a process gap
rather than a code defect.

Commits: `1ad0eca` (feat), `0c88f66` (chore(dev.db)).

### What the investigation actually found

The two 0→1 defect counts were **not** produced by the cross-profile
recompute. Both defects are, and always were, full members of FACTORY
STANDARD's `VISUALS` category (GRANULAR, AQL 2.5) — not orphaned, not
invisible — and the original submission simply never recorded them. The
counts were in the client's POST body: `POST /:id/amendments` stores
`JSON.stringify(body.newValues)` verbatim, and the only code path that can
put `def_thin_weak_spot: 1` there is `handleIncrement()` in
`StepDefects.tsx`. Two increment taps during the amend session, on top of the
intended profile switch.

So the engine was correct and the amendment was, in the app's own terms,
valid. What was missing was any requirement that the person submitting it had
*seen* what they were submitting.

### The gate

`backend/src/lib/amendmentDiff.ts` — a field-agnostic comparator producing a
flat `{path, changeType, from, to}` list. Three things it has to get right:

- **Serialization asymmetry.** `originalValues` is the raw Prisma row, where
  `defects`/`dimensions` are JSON *strings*; `newValues` is the frontend
  payload, where the same fields are live *objects*. Without normalization
  every amendment would report both as changed.
- **Sparse defects.** A defect id absent from one side means "never
  recorded" (count 0), not "no value to compare" — so a 0-vs-1 key reports as
  `modified` (0 → 1), matching what `AmendmentDiffView` displays.
- **Omission means untouched.** An amendment is a `Partial<Submission>` and
  legitimately omits fields it does not change; `POST /api/amendments/:id/approve`
  already reads every field as `newValues[k] ?? existing[k]`. Treating an
  omitted key as a removal would report a dozen phantom changes per amendment.

Path granularity is a **wire contract**, not an implementation detail — the
strings round-trip as the acknowledgment keys. One entry per scalar
(`profileId`), per defect (`defects.<id>`), per dimension
(`dimensions.<id>`, whole 5-slot array — an operator re-measures a dimension,
not a slot). `dimensionMins` is excluded as derived from `dimensions`;
`verdict` is deliberately **not** excluded.

### Why a preview endpoint rather than a client-side comparator

`POST /api/submissions/:id/amendment-preview` is read-only and runs the same
`computeAmendmentChanges()` the gate runs. A client-side re-derivation was
considered and rejected: if the checklist finds N changes and the gate finds
N+1, the operator ticks every box, the button enables, and the submit 400s on
a change that has no checkbox — with no recovery path in the UI. Sharing one
implementation makes that state unreachable. `frontend/src/lib/amendmentPayload.ts`
closes the same hole from the other side: one builder for both the preview
and the submit, so the two provably diff identical input.

### Per-change checkboxes, not one blanket confirm

A single "I confirm all changes are intentional" box costs the same whether
an amendment changes one field or twelve, so it proves nothing about whether
anything was read — it would have been ticked just as readily on
`A001A6247003`. One box per change means the cost of confirming scales with
what is being changed, and an unexpected line item is something the operator
has to physically look at.

### Reason: requiredness swapped between two fields

`reasonCode` (closed four-code vocabulary, `lib/amendmentReason.ts`) became
**required**; `reason`/`supervisorNote` became the **optional** note. The
checkable field is now mandatory and the unverifiable one is not — which is
the whole lesson of the originating incident. The note is required
client-side only for `OTHER`, where the code carries no information by
itself. `reasonCode` is an **audit** field: nothing compares it against the
diff, deliberately — proving the requester saw every change is the
acknowledgment set's job, and mapping a reason to an expected field-set would
be both unmaintainable and wrong.

### Sequencing: shipped optional, flipped in the same change as the UI

Both fields shipped nullable and validated-only-when-present so the backend
could land before the wizard that populates them. Making either
unconditionally required at that point would have 400'd every amendment from
the live frontend. The flip to required landed in the same change that makes
the wizard always send them — verified live first, in that order.

### Grandfathering is structural, not a date cutoff

The gate runs only at draft creation, and `POST /api/amendments/:id/approve`
never re-validates a payload (it only recomputes the verdict), so
already-pending drafts cannot fail it retroactively. No timestamp constant
and no schema version marker were needed. `acknowledgedChanges` NULL is what
marks a pre-gate row, and the approver's `AcknowledgmentRollup` banner reads
exactly that to flag it amber for manual review.

`backend/src/routes/__tests__/amendmentGateScope.test.ts` guards four
invariants by source inspection — there is no runtime call that can observe
"this code was *not* consulted here":
1. Gate stays out of the approve route.
2. Gate stays out of `POST /api/submissions` (no prior record to diff).
3. The preview route may compute but must never reject or write.
4. Exactly one enforcement site, placed ahead of the recompute and the
   transaction so a rejection writes nothing.

### Schema

Two additive nullable columns via `prisma db push` (never `migrate dev`, per
`AI_RULES.md` §7), previewed with `migrate diff --script` first — no drops,
no table rewrite:

```sql
ALTER TABLE "AmendmentLog" ADD COLUMN "acknowledgedChanges" TEXT;
ALTER TABLE "AmendmentLog" ADD COLUMN "reasonCode" TEXT;
```

**`null` vs `'[]'` on `acknowledgedChanges` is load-bearing.** `null` = a
caller that never ran the gate (pre-gate rows; post-flip it is an outright
rejection). `'[]'` = a gate-aware client reporting nothing to acknowledge,
still enforced. Collapsing them either reopens the bypass or rejects a valid
no-op amendment.

### Also fixed

`NON_SUBSTANTIVE_DIFF_FIELDS` in `frontend/src/lib/diffTree.ts` was missing
`gloveWeightSnapshot` — it postdates the rest of that list. Because
`oneSidedNode()` recurses into a one-sided container, every amendment diff
rendered an "Other Fields" section containing one `GLOVE WEIGHT SNAPSHOT` row
per nested key of the frozen `DimensionResult` (11 of them), all sharing the
same label since `labelForRow` reads only `keyPath[0]`. That field was the
section's only occupant, so excluding it empties the section rather than
merely tidying it.

### Cross-workspace mirror

The frontend cannot import from `backend/` at build time
(`tsconfig.app.json` is `include: ["src"]`), so `amendmentReason.ts` exists
twice, drift-guarded by `amendmentReason.sync.test.ts` — the same test-only
cross-boundary import already used for `defaultProfileSeed` (AUDIT_REPORT.md
#10). Drift here is not cosmetic: a code added on the frontend alone would
render in the dropdown and then 400 every submission that selected it.

### Verification

Backend 58/58, frontend 113/113, `tsc` clean both sides, `oxlint` 0 errors
with the warning count unchanged from baseline. `dev.db` `integrity_check`
ok, `foreign_key_check` clean.

Live click-through as a PIN operator (Jason Tan / OT4321) on lot
`A001A6247001`: the `OTHER`-requires-note rule flipped the label and
placeholder as specified; the checklist rendered two real changes with
humanized labels (`FACTORY STANDARD → MEDLINE`, `EMBEDDED PARTICLE 0 → 1`)
and agreed with the independent pre-submit summary; submit stayed disabled at
0/2 and 1/2 and enabled at 2/2; the round trip persisted `reasonCode` and
`acknowledgedChanges` correctly. A direct POST around the disabled button was
rejected naming exactly the unacknowledged change. The test amendment was
then rejected through `POST /api/amendments/:id/reject` — note that route
takes the **submission** id, not the AmendmentLog id.

Approver-side verification (Group A, MSAL — not drivable from an agent
session) was done by Jerry directly: a fresh post-flip amendment acknowledged
10 paths including `verdict` and a `dimensions.<id>` entry, and three
pre-gate rows (`acknowledgedChanges` NULL) were reviewed through the amber
untracked banner.

---

## 49. AppConfig legacy-JSON column cleanup (AUDIT_REPORT #37) — 2026-09-05

Closes `AUDIT_REPORT.md` #37. Commits `dd27e5d`, `ac5a44a`, `1b4dbe2`, plus
three `chore(dev.db)` checkpoints. Relocated here 2026-09-06 from the resolved
list in `AUDIT_REPORT.md`, verbatim in substance.

### What discovery found

Two independent dead/dying groups of `AppConfig` JSON columns:

- **`aqlCategories` / `defectDefinitions`** — written on every `PATCH /api/config`
  but never meaningfully read. Every real reader consumes the per-profile nested
  field reconstructed from the Master Defect List registry (§42–§46) instead.
- **`productCodes` / `productMatrixConfig` / `productProfileMap`** — writes already
  frozen since the B6 product-record consolidation; read only by
  `resolveProductRegistry()`'s unmigrated-database fallback in
  `backend/src/lib/productEntry.ts`.

### The three-stage removal (same shape as the earlier `inspectionProfiles` Stage A/B arc)

- **Part 1** — dropped `aqlCategories` / `defectDefinitions` from
  `config.routes.ts`'s `JSON_FIELDS`. The schema columns were left in place,
  frozen (both already `"[]"`); their column-level drop was deferred to a
  separately-scoped later stage. Live `PATCH` proof against an isolated `dev.db`
  copy: a deliberately poisoned payload for both fields left the stored columns
  byte-identical, while the real per-profile reconstruction (registry-backed) was
  unaffected.
- **Part 2** — confirmed the unmigrated-database fallback in
  `resolveProductRegistry()` (`productEntry.ts`) was no longer needed (every live
  deployment had already migrated onto `AppConfig.products`), removed it, and
  dropped all three legacy product columns via `prisma db push
  --accept-data-loss` (27 → 24 surviving `AppConfig` columns). Rollback tag
  `pre-appconfig-legacy-cleanup` pushed beforehand.
- **Stage B** (same day) — the Part 1 deferral came due. Re-confirmed via a fresh
  full-codebase grep (not reusing the Part 1 evidence) that
  `aqlCategories` / `defectDefinitions` still had zero real reads, then dropped
  both columns the same way (24 → 22 surviving `AppConfig` columns).
  `formatAppConfig()`'s `GET` projection — the one remaining column-shaped read,
  since it echoed the columns back in the response — now hardcodes `[]` (the
  value it always produced). Rollback tag
  `pre-aqlcategories-defectdefinitions-column-drop` pushed beforehand.

### API contract

Unchanged throughout every stage. `PATCH` / `GET /api/config` still accept and
return all five field names; only storage moved, then disappeared.

### Verification (each stage)

88/88 regression cases byte-identical, proven twice for every schema drop (a
frozen pre-drop copy and the live post-drop `dev.db`). Backend `tsc` + 20/20
tests; frontend `tsc` + 74/74 tests; oxlint 0 errors. `PRAGMA integrity_check` /
`foreign_key_check` clean. Zero remaining references to the dropped fields in the
regenerated Prisma client.

### Doc corrections made in the same arc

`schema.prisma` tombstone comments for both column groups (disambiguated from the
unrelated, earlier `inspectionProfiles` "Stage B"); `DATA_SCHEMAS_AND_TYPES.md`
§3.1's now-false fallback claim corrected. This closure also triggered the
six-core-doc audit pass — see §50.

---

## 50. Six core reference docs — audit corrections (AUDIT_REPORT #38; companion to §47) — 2026-09-05

Closes `AUDIT_REPORT.md` #38. Commit `e451494`. Relocated here 2026-09-06 from
the resolved list in `AUDIT_REPORT.md`, verbatim in substance.

Docs-audit pass across all six core reference docs (`AI_RULES.md`,
`API_AND_INTEGRATION_SPEC.md`, `DATA_SCHEMAS_AND_TYPES.md`,
`ISO2859_MATH_ENGINE.md`, `NAVIGATION_AND_RBAC.md`, `UI_DESIGN_SYSTEM.md`),
triggered by §49's column drops.

### Root cause

Two already-completed migrations whose downstream doc references were never
updated:
1. Profile identity moving off `AppConfig.inspectionProfiles` JSON onto the
   `Profile` table (Stage A0, then the column dropped entirely at Stage B).
2. `DefectDefinition` dropping `currentClass` / `defaultClass` for a strict
   `categoryId` link at the Master Defect List Stage 2 engine cutover (§43).

### Three of six docs needed correction

- **`API_AND_INTEGRATION_SPEC.md`** — `POST /api/submissions`'s `profileId`
  sanity-check / 404 paths renamed from `AppConfig.inspectionProfiles` to the
  `Profile` table; the registry section's stale "until Stage 4 replaces it" note
  updated to reflect that Stage 4's pickers shipped without changing the write
  mechanism.
- **`DATA_SCHEMAS_AND_TYPES.md`** — the largest correction. §2.1 rewritten: no
  JSON column exists, the documented interfaces are a pure wire contract (PATCH
  payload / GET response shape), `currentClass` / `defaultClass` gone from both
  the engine and the reconstructed response. §2.2 had an internal contradiction
  with its own later "As-migrated state" section — two stale "profile identity is
  still on the JSON side" claims corrected to match. §1 / §3 storage comments
  corrected to match §3.1's already-accurate account.
- **`ISO2859_MATH_ENGINE.md`** — two lines repeating the same stale
  profile-identity claim, corrected.

### The other three docs

`AI_RULES.md`, `NAVIGATION_AND_RBAC.md`, `UI_DESIGN_SYSTEM.md` had nothing in
scope for this schema-cleanup arc. The first two carried unrelated content worth
flagging rather than fixing unilaterally; those flagged items were decided by
Jerry and closed separately — see **§47** (AUDIT_REPORT #39 `AI_RULES.md` §3/§4
process-rule staleness, #40 Entra redirect URI, #41 endpoint documentation
coverage gap). `UI_DESIGN_SYSTEM.md` is pure styling convention, unrelated.

### Verification

Documentation-only — no code, schema, or behaviour change. Backend `tsc --noEmit`
clean, 24/24 tests; frontend `tsc -b` clean, oxlint 0 errors, 74/74 tests.

---

## 51. Cross-profile amendment diff — category-membership changes now surfaced (AUDIT_REPORT #42) — 2026-09-05

Closes `AUDIT_REPORT.md` #42. Commits `127267f`, `7952b4b`, `14ff794`. Relocated
here 2026-09-06 from the resolved list in `AUDIT_REPORT.md`, verbatim in
substance.

### The bug

Investigated against the real pending amendment on lot `A001A6247003`
(FACTORY STANDARD → MEDLINE). The amendment diff view was genuinely broken, not
merely confusing: it compared only raw `{defectId: count}` with zero concept of
AQL category membership. So a profile switch could silently move `def_sagging`
from an excluded RECORD ONLY category into MEDLINE's BARRIER category — flipping
BARRIER from PASS to FAIL — and orphan `def_donning` / `def_odour` entirely
(MEDLINE has no OTHERS-equivalent), with **none of it visible anywhere in the
diff**, even fully expanded, because none of those three defects' recorded
*counts* changed.

### Fix — three parts, verified against the same real amendment (read-only throughout; never approved/rejected/mutated)

- **Part 1** (`127267f`) — `amendmentDiffLabels.ts`'s
  `resolveCrossProfileDefectContext()` now resolves BOTH the before- and
  after-profile's defect→category maps (the old function resolved only one,
  always the proposed side). `detectDefectCategoryChange()` flags three distinct,
  separately-badged cases in `AmendmentDiffView.tsx` — `'moved'` /
  `'evalModeChanged'` (Cyan, informational) and `'orphaned'` (Amber, Action
  Required) — and a defect-level row now stays visible whenever EITHER its count
  OR its category assignment changed, not count alone. Caught mid-build:
  `GET /api/config` actually emits the legacy `aql` / `evalMode` field names, not
  the canonical `aqlLevel` / `evaluationMode`, so `buildDefectCategoryMap()`
  checks both spellings now. New `RecomputedVerdictSummary.tsx` surfaces
  `AmendmentLog.recomputedVerdict` / `recomputedCategoryResults` — already
  computed correctly at draft time, never rendered anywhere before this.
- **Part 2** (`7952b4b`) — `evaluateAQLVerdict()` now warns when a recorded
  defect count matches no category in the active profile at all, built from every
  category regardless of `evaluationMode` (specifically NOT just the categories
  that reach a grading branch — the naive version misfired on every normal RECORD
  ONLY category before this distinction was caught and fixed pre-ship). Grading
  behaviour unchanged; visibility only.
- **Part 3** (`14ff794`) — test coverage for both parts, fixtures modelled on the
  real category / defect ids above, not invented data.

### Verification

88/88 regression cases byte-identical (frozen `dev.db` copy — proves Part 2 is a
pure no-op for grading). Backend 24/24 tests, frontend 88/88 tests, both `tsc`
clean, oxlint 0 errors. The Part 2 warning also fired live and correctly during
the regression replay itself — 12 times, every one for `def_donning` /
`def_odour` specifically, zero false positives for any RECORD ONLY-category
defect across the full real dataset. Final check: pulled the REAL `GET /api/config`
response and the real amendment's before/after values (read-only) and ran them
through the actual shipped `resolveCrossProfileDefectContext()` /
`detectDefectCategoryChange()` (not reconstructed fixtures) — confirmed
byte-for-byte: `def_sagging` → `'moved'` (RECORD ONLY → BARRIER),
`def_donning` / `def_odour` → `'orphaned'`, both resolving to real names rather
than raw ids.

### Not done

Full live-UI click-through in ApprovalsQueue was not performed — Group A/B routes
require M365 SSO, which cannot be completed in a sandboxed browser session; open
if a visual confirmation on top of the data-level verification is wanted. The
real `A001A6247003` amendment was never mutated — still `PENDING_APPROVAL`,
exactly as found.

---

## 52. Picker modal titles use SELECT not ADD (AUDIT_REPORT #43) — 2026-09-06

Closes `AUDIT_REPORT.md` #43, originally raised against §44 (Master Defect List +
Category Inventory — Stage 3). Commit `1942ee1`.

### Discovery (read-only pass, no re-investigation needed for the fix)

The string `ADD CATEGORY` / `ADD DEFECT` was live in two UI places with two
different meanings, plus a third near-collision:

- **Create a new global entry** — `QualityRules.tsx` §3.5: the `+ ADD CATEGORY`
  button on the DEFECT CATEGORY SETUP header and the `+ ADD DEFECT` button on the
  DEFECT MANAGEMENT KANBAN header both open `RegistryManagerModal`, which
  registers a brand-new entry into the global Category Inventory / Master Defect
  List, system-wide.
- **Select an existing global entry** — `CategoryPickerModal.tsx` /
  `DefectPickerModal.tsx`: reached from the §3.6 per-profile dashed `+ ADD`
  buttons, these only put an entry that already exists in the registry into the
  active profile (for a category, also choosing its AQL level + evaluation mode
  inline). Their own `<h3>` titles restated `ADD CATEGORY` / `ADD DEFECT`,
  reading as "create" when nothing is created.
- The two picker flows also disagreed with each other at the label/code level:
  the category flow said **Adopt** (`aria-label` "Adopt a category from the
  Category Inventory"; `handleAdoptCategory`), the defect flow said **Add**
  (`aria-label` "Add a defect from the Master Defect List"; `handlePickDefect`).

No functional bug — each location behaves consistently and was documented — but
an admin reading the UI cold could not tell the create button from the pick
modal.

### Decision — rename the picker titles to SELECT, leave the create buttons alone

Display/label-only. No logic changed; no function or variable renamed.

- `CategoryPickerModal.tsx` — `<h3>` `ADD CATEGORY` → `SELECT CATEGORY`;
  `aria-label` "Adopt a category from the Category Inventory" → "Select a category
  from the Category Inventory"; the `@description` "Stage 4b picker" opening
  sentence reworded "opens this to ADOPT" → "opens this to SELECT".
- `DefectPickerModal.tsx` — `<h3>` `ADD DEFECT` → `SELECT DEFECT`; `aria-label`
  "Add a defect from the Master Defect List" → "Select a defect from the Master
  Defect List".
- `QualityRules.tsx` — the two inline comments above the §3.6 dashed buttons, and
  the `showCategoryPicker` state-var comment, reworded "Adopt"/"Add" → "Select"
  (they describe the button, not the mechanism).
- Both modals' sub-lines already read "Choose from the … List" and were left
  as-is — consistent with the new title, no "Add"/"Adopt" verb.
- `UI_DESIGN_SYSTEM.md` §3.5 ("Primary Add Actions — Header Buttons") gained a
  paragraph: `ADD [ENTITY]` means create-a-new-entity; the registry header
  buttons are the true instance of the pattern; the look-alike picker modals are
  a separate "select existing" action titled `SELECT …` and are not an instance
  of this pattern even though their internal `REGISTER NEW …` button borrows the
  emerald ghost-outline styling.

### Deliberately unchanged

- The §3.5 `+ ADD CATEGORY` / `+ ADD DEFECT` registry header buttons — they
  create; `ADD` is correct. Also the `QualityRules.tsx` comment that contrasts
  the picker with "the header ADD CATEGORY button".
- The §3.6 per-profile dashed buttons — their visible label is just `+ ADD` (not
  the full string) and they were never part of the collision.
- The per-row action inside each picker — a `+ ADD` pill whose `title` reads
  `Adopt "<name>" into <profile>` (category) / `Add "<name>" to <category>`
  (defect). That is the row-level act of filing the *already-selected* existing
  entry into the profile; it mirrors the untouched §3.6 `+ ADD` buttons and does
  not imply creation, so it was left. The Adopt/Add wording split there is
  cosmetic and stops at the tooltip.
- `handleAdoptCategory` and its JSDoc (which opens "Adopts a category chosen from
  the global Category Inventory…") — the doc verb is anchored to the retained
  function name; "adoption" is the established domain term for creating a
  `ProfileCategory` join row, used across the modal `@description` mechanics
  prose, `RegistryManagerModal`, and `CategoryPickerModal.test.tsx`
  ("adoption flow"). Renaming that vocabulary was out of scope.
- `ConfigDashboard.tsx` — a dead/unreachable file (§§197, 231, 2470) carrying a
  non-wired `Add Defect` button; explicitly out of scope. `archived/` blueprints
  untouched.

### Verification

- `grep -ri "ADD CATEGORY|ADD DEFECT"` over `frontend/src` afterward: the only
  hits are the two §3.5 create buttons (intended) and the `QualityRules.tsx`
  comment describing that button. No picker `<h3>` or `aria-label` still says
  `ADD`.
- Frontend `vitest run` — 113/113 (18 files, incl. `CategoryPickerModal.test.tsx`).
  Backend `vitest run` — 58/58 (7 files). Both byte-identical to before, as
  expected for a string/comment-only change. Frontend `tsc -b` clean; `oxlint`
  0 errors (44 pre-existing warnings, none in the three touched source files).

### The self-referencing commit hash

Same accepted quirk noted in §47: this entry cites the hash of the commit that
writes it. Per the settled pattern — write the entry, commit, read the real hash,
do exactly one amend to insert it, stop — the cited hash ends up one
amend-generation stale. Expected, not a bug.

---

## 53. Category and Defect action verbs finalized: MANAGE, REGISTER, ADD (supersedes §52) — 2026-09-06

Closes `AUDIT_REPORT.md` #43 for real. Commit `a30e394`. **Supersedes §52**
(commit `c456235`, cited in-doc as `1942ee1` per the self-referencing-hash
quirk).

### What §52 got wrong

§52 renamed the two per-profile picker modal titles `ADD CATEGORY` / `ADD
DEFECT` → `SELECT CATEGORY` / `SELECT DEFECT`, justified by the claim that the
`QualityRules.tsx` §3.5 header buttons (also labelled `ADD CATEGORY` / `ADD
DEFECT`) "genuinely create a new global entry" and so had first claim on the
`ADD` verb.

A follow-up read-only discovery pass showed that claim was false. Those header
buttons run `setRegistryModal('category' | 'defect')` — they **open**
`RegistryManagerModal` and nothing more. Creating an entry is a further,
explicit `REGISTER CATEGORY` / `REGISTER DEFECT` click *inside* that modal. The
header button is a navigation affordance, not a create action, so naming it
`ADD` was wrong on its own terms — and renaming the pickers to `SELECT` to
"yield" `ADD` to it solved nothing.

The same pass found the surrounding vocabulary was inconsistent in more places
than the titles:

- **Create** was `REGISTER <NOUN>` inside `RegistryManagerModal` but `REGISTER
  NEW <NOUN>` on the pickers' create-handoff buttons — same action, two labels.
- **Attach-to-profile** was `SELECT` (picker `<h3>`, post-§52), `CHOOSE` (picker
  sub-lines and `DefectPickerModal`'s `@description`), `ADD` (the `+ ADD` dashed
  openers, per-row buttons, footer counts), and `Adopt` (the Category picker's
  row-opener tooltip and its locked-row tooltip) — four verbs for one action,
  and `Adopt` appeared only on the Category side.
- **Structural divergence:** the Category picker has an extra inline AQL / eval-
  mode confirm step (so two "attach" controls per row, tooltipped `Adopt … into`
  then `Add … to`); the Defect picker attaches in one click (`Add … to`).

### The finalized model — three verbs, one meaning each

| Verb | Meaning | Where it appears now |
|---|---|---|
| **MANAGE** | Open the global registry/management view. Creates nothing, attaches nothing. | `QualityRules.tsx` §3.5 header buttons: `MANAGE CATEGORIES` / `MANAGE DEFECTS` (open `RegistryManagerModal`) |
| **REGISTER** | Create a brand-new global entry. | `RegistryManagerModal` `addLabel`: `REGISTER CATEGORY` / `REGISTER DEFECT`; picker create-handoff buttons: same wording (dropped `NEW`) |
| **ADD** | Attach an entry that already exists in the registry to the active profile. | picker `<h3>`: `ADD CATEGORY` / `ADD DEFECT`; §3.6 dashed `+ ADD` openers; picker per-row + confirm buttons; picker footer "N … available to add" |

### Before → after (every string touched)

**`frontend/src/pages/config/QualityRules.tsx`**

| Loc | Before | After |
|---|---|---|
| ~604 header button | `ADD CATEGORY` | `MANAGE CATEGORIES` |
| ~893 header button | `ADD DEFECT` | `MANAGE DEFECTS` |
| ~162 state comment | `to SELECT a global category for this profile` | `to ADD a global category to this profile` |
| ~163 state comment | `the header "ADD CATEGORY" button` | `the header "MANAGE CATEGORIES" button` |
| ~758 inline comment | `Select a category from the global Category Inventory (Stage 4b picker)` | `Add a category from the global Category Inventory (Stage 4b picker)` |
| ~981 inline comment | `Select from the global Master Defect List (Stage 4a picker)` | `Add from the global Master Defect List (Stage 4a picker)` |
| ~451 JSDoc (`handlePickDefect`) | `backdrop, or "REGISTER NEW DEFECT".` | `backdrop, or "REGISTER DEFECT".` |
| ~1042 comment | `picker's "REGISTER NEW DEFECT".` | `picker's "REGISTER DEFECT".` |

**`frontend/src/components/config/CategoryPickerModal.tsx`**

| Loc | Before | After |
|---|---|---|
| ~4 `@description` | `opens this to SELECT a category from the global Category Inventory for the active profile` | `opens this to ADD a category from the global Category Inventory to the active profile` |
| ~9 `@description` | `+ REGISTER NEW.` | `+ REGISTER CATEGORY.` |
| ~22 `@description` | `Confirming an adoption flips the row` | `Confirming flips the row` |
| ~27 `@description` | `adopted into a DIFFERENT profile — adoption only creates` | `added to a DIFFERENT profile — that add only creates` |
| ~32 `@description` | `REGISTER NEW routes to RegistryManagerModal.` | `REGISTER CATEGORY routes to RegistryManagerModal.` |
| ~67 prop JSDoc | `the profile the adoption files into` | `the profile the entry is added to` |
| ~72 prop JSDoc | `A profile selects a category at most once` / `the admin adopts rows this session` | `A profile holds a category at most once` / `the admin adds rows this session` |
| ~76 prop JSDoc | `Hands back one confirmed adoption.` | `Hands back one confirmed add.` |
| ~98 state comment | `Rows adopted in THIS session` | `Rows added in THIS session` |
| ~195 `aria-label` | `Select a category from the Category Inventory` | `Add a category from the Category Inventory` |
| ~203 `<h3>` | `SELECT CATEGORY` | `ADD CATEGORY` |
| ~206 sub-line | `Choose from the Category Inventory and set its AQL level + evaluation mode for {profileName}.` | `Add a category from the Category Inventory and set its AQL level + evaluation mode for {profileName}.` |
| ~237 toolbar button | `REGISTER NEW CATEGORY` | `REGISTER CATEGORY` |
| ~352 locked-row tooltip | `can still be adopted here` | `can still be added here` |
| ~368 already-in tooltip | `Already selected by this profile` | `Already in this profile` |
| ~376 row-opener tooltip | `Adopt "{name}" into {profileName}` | `Add "{name}" to {profileName}` |

**`frontend/src/components/config/DefectPickerModal.tsx`**

| Loc | Before | After |
|---|---|---|
| ~4 `@description` | `opens this to CHOOSE a defect from the global Master Defect List, instead of free-typing` | `opens this to ADD a defect from the global Master Defect List to the active profile, instead of free-typing` |
| ~23 `@description` | `"Register a new defect" routes to the existing RegistryManagerModal` | `"REGISTER DEFECT" routes to the existing RegistryManagerModal` |
| ~162 `aria-label` | `Select a defect from the Master Defect List` | `Add a defect from the Master Defect List` |
| ~170 `<h3>` | `SELECT DEFECT` | `ADD DEFECT` |
| ~173 sub-line | `Choose from the Master Defect List — files under {categoryName} in this profile.` | `Add a defect from the Master Defect List — files under {categoryName} in this profile.` |
| ~205 toolbar button | `REGISTER NEW DEFECT` | `REGISTER DEFECT` |

**`frontend/src/components/config/RegistryManagerModal.tsx`** (comment consistency only — the `addLabel` strings `REGISTER CATEGORY` / `REGISTER DEFECT` were already correct)

| Loc | Before | After |
|---|---|---|
| ~10 `@description` | `a decision the adopting PROFILE makes` | `a decision the owning PROFILE makes` |
| ~13 `@description` | `at the moment it adopts a category` | `at the moment it adds a category` |

**`frontend/src/lib/aqlCategoryOptions.ts`**

| Loc | Before | After |
|---|---|---|
| ~5 `@description` | `CategoryPickerModal.tsx (Stage 4b adoption) both need` | `CategoryPickerModal.tsx (Stage 4b picker) both need` |

**`frontend/src/components/config/CategoryPickerModal.test.tsx`** (one assertion + comment/label consistency)

| Loc | Before | After |
|---|---|---|
| ~189 assertion | `findByRole('button', { name: /register new category/i })` | `findByRole('button', { name: /register category/i })` |
| ~186 test name | `'REGISTER NEW CATEGORY routes to onRegisterNew'` | `'REGISTER CATEGORY routes to onRegisterNew'` |
| ~3 / ~9 file header | `category-adoption picker` / `REGISTER NEW routes out` | `category picker` / `REGISTER CATEGORY routes out` |
| ~70 / ~89 describe/test names | `adoption flow` / `confirming an adoption` | `add flow` / `confirming an add` |

**`UI_DESIGN_SYSTEM.md` §3.5** — the paragraph added in §52 (framing `ADD CATEGORY`
as create vs `SELECT CATEGORY` as select) was wrong on both counts and was
replaced with the three-way MANAGE / REGISTER / ADD model above. The §115
`+ ADD CATEGORY` "create pattern" example is replaced by `REGISTER CATEGORY` as
the canonical create example.

### Deliberately not changed

- **Identifiers** `handleAdoptCategory`, `CategoryAdoption` (exported type),
  `handlePickDefect` — renaming code identifiers is outside a vocabulary/label
  pass and would churn call sites and (for `handleAdoptCategory`) its
  name-mirroring JSDoc at `QualityRules.tsx` ~331. Flagged for a possible
  future rename.
- **`QualityRules.tsx` ~201** — `handleDuplicateProfile`'s JSDoc ("ADOPTS the
  same category ids…") is about profile duplication, not this flow. Untouched.
- **`RegistryManagerModal` defect blurb** — "Every defect name the system knows.
  Profiles select from this list." The lowercase "select" is descriptive prose,
  not a control label; left as-is, noted here for a future call. **Closed in §54.**
- **`RegistryManagerModal` `@description`** — "register new entries" still carried
  the redundant "new". **Closed in §54.**
- **The §3.6 dashed `+ ADD` buttons** — already correct under the final model.

### Verification

- Grep sweep over `frontend/src` for `SELECT CATEGORY`, `SELECT DEFECT`,
  `CHOOSE`, `Choose from`, `adopt`, `REGISTER NEW`, `Already selected`: zero
  remaining matches tied to the Category/Defect create-vs-attach flows. Residual
  hits are all unrelated (PIN "choose a new PIN", ProductEngine "choose
  different identity components", the eval-mode "choose a mode" tooltip) or the
  three intentionally-kept identifiers above.
- `REGISTER CATEGORY` / `REGISTER DEFECT` now byte-identical between
  `RegistryManagerModal` (`addLabel`) and both picker create-handoff buttons.
- Frontend `vitest run` — 113/113 (18 files); the one affected test
  (`CategoryPickerModal.test.tsx` "REGISTER CATEGORY routes to onRegisterNew")
  updated and passing. Backend `vitest run` — 58/58 (7 files). Frontend
  `tsc -b` clean; `oxlint` 0 errors (pre-existing warnings only, none in touched
  files). `DefectPickerModal.test.tsx` needed no change (no string assertions on
  the renamed labels).

### The self-referencing commit hash

Same quirk as §47 / §52: `a30e394` is replaced by exactly one amend and is
thereafter one amend-generation stale. Expected.

---

## 54. RegistryManagerModal blurb and help text wording (closes §53 loose ends) — 2026-09-06

Prose-only follow-up to §53. Commit `dd9eb5f`. Closes the two wording loose
ends §53 left flagged under "Deliberately not changed", for full consistency with
the MANAGE / REGISTER / ADD model. No logic, no control labels — three string
literals in `RegistryManagerModal.tsx`.

| Loc | Before | After |
|---|---|---|
| ~16 `@description` | `View the registry, register new entries, rename existing ones.` | `View the registry, register entries, rename existing ones.` |
| ~54 `ENTITY_CONFIG.defect.blurb` | `Every defect name the system knows. Profiles select from this list.` | `Every defect name the system knows. Profiles add from this list.` |
| ~62 `ENTITY_CONFIG.category.blurb` | `Every severity category name the system knows. Each profile picks its own subset and sets its own AQL level and evaluation mode.` | `Every severity category name the system knows. Each profile adds its own subset and sets its own AQL level and evaluation mode.` |

The category blurb had no literal "select from" but its "picks its own subset"
was the equivalent phrase; aligned to `adds` for verb parity between the two
entities. "register new entries" drops the "new" now that `REGISTER CATEGORY` /
`REGISTER DEFECT` is the standardized create-action name (no `NEW`).

`AUDIT_REPORT.md` #43 needed no change — it referenced only the intentionally-
kept identifiers, never these two wording items, as open.

### Verification

- `grep -i "select from" / "register new"` across `RegistryManagerModal.tsx`:
  zero matches. No other stray occurrences.
- Frontend `vitest run` — 113/113 (18 files). Backend `vitest run` — 58/58
  (7 files). Byte-identical to before, as expected for a prose-only change.
  Frontend `tsc -b` clean; `oxlint` 0 errors.

### The self-referencing commit hash

Same quirk as §47 / §52 / §53: `dd9eb5f` is replaced by exactly one amend
and is thereafter one amend-generation stale. Expected.

---

## 55. Defect taxonomy reconciled against the QA tab (AUDIT_REPORT #2 and #3) — 2026-09-06

Closes `AUDIT_REPORT.md` #2 and #3. **Documentation-only** — no code, schema,
`dev.db`, or category/defect data changed. The reconciliation behind the closure
was a read-only analysis; this section records its outcome, and #2/#3 were moved
from the `AUDIT_REPORT.md` open list to its resolved summary in the same change.

### Background — both items were "blocked, needs real data"

- **#2** — the real 47-defect taxonomy had only ever been seeded into
  `prof_default`, and there was no confirmed real-world source to validate even
  that one against.
- **#3** — 30 of `prof_default`'s seeded defects (47 then, 48 now) carried their
  Visual-tier assignment over from a 2021 leftover spreadsheet template, 5 of
  them placed by reasoning alone. Flagged an unconfirmed working draft pending
  real QA input.

### The reconciliation

Read-only comparison of `prof_default`'s live `dev.db` taxonomy
(`Profile` / `Category` / `ProfileCategory` / `ProfileCategoryDefect` /
`Defect`) against `docs/reference/2026-07 JUL.xlsx`.

An earlier pass read the **wrong sheet** — the `Edit` tab, a 2021-era template
showing a 5-tier (`Accept No Defect` / `Barrier` / `Critical Visual` /
`Visual Major` / `Visual Minor`) / 65-field structure. That structure is real in
that sheet but is **not** canonical. Jerry confirmed against live app data that
the **`QA` tab** is the sheet real inspectors use, and the workbook was then
reduced to just that tab.

**QA tab structure** — one physical header row, no merged cells, no tier/category
label cells. Grouping is implicit: defect columns run in three contiguous blocks,
each closed by its own `Total …` subtotal column.

| QA block | # defect fields |
|---|---|
| Accept No Defect (AND) | 8 |
| Barrier | 9 (includes `Sagging`) |
| Visual Quality Rule | 30 — **one flat block, no Critical/Major/Minor sub-tiers** |
| DONNING (standalone column) | 1 |

48 defect-entry fields total. Columns 106–160 are per-defect DPM (defects-per-
million) computed columns, **not** entry fields; they still carry vestigial split
names from the `Edit`-era taxonomy (`Big Lump`, `Latex Residue`, `Thin Spot` /
`Weak Spot` separately, `Small Dirt` / `Small Lump` / `Small Stain`, `Dirt` /
`Stain` separately, `Shining`, `Wet / Oily Look`, `Excessive Powder`). These are
spreadsheet cruft, not gaps in `dev.db`.

### Result — #2 (taxonomy completeness)

**47 of 48 QA defect fields match `prof_default` exactly**, normalized for
trivial punctuation / whitespace / case only (`Dirt/stain` ↔ `Dirt / Stain`,
`Shining/Oily Mark` ↔ `Shining / Oily Mark`, leading spaces on the pinhole
names). 47 also sit in the equivalent category:

| QA block | `prof_default` category | agree |
|---|---|---|
| Accept No Defect (AND) | AND | 8 / 8 |
| Barrier | BARRIER | 8 / 9 (see `Sagging` below) |
| Visual Quality Rule | VISUALS | 30 / 30 |
| DONNING | OTHERS (`Donning`) | 1 / 1 |

**Nothing in QA is missing from `dev.db`; nothing in `prof_default` is a
leftover/extra absent from QA.** The `prof_default` taxonomy is confirmed
complete and correct against real factory practice — the data blocker on #2 is
lifted.

**The one discrepancy — `Sagging`'s category.** QA's `Sagging` column sits
physically inside the Barrier block; `dev.db` has `Sagging` under **RECORD ONLY**
(`evaluationMode = RECORD_ONLY` — tracked, excluded from AQL grading).
**Decision (Jerry):** RECORD ONLY is the correct, intentional placement —
`Sagging` should be recorded but must not count toward pass/fail. A column's
position in the QA spreadsheet is layout, not a statement of grading intent.
**No change to `Sagging`'s category.** (`def_sagging` also appears in at least
one frozen submission's `gradingSnapshot` under RECORD ONLY, so the confirmed
placement matches the historical record.)

### Result — #3 (the 30 unconfirmed Visual-tier drafts)

**Resolved.** The QA tab's Visual Quality Rule block is a **single flat category
with no Critical/Major/Minor sub-tiers**, and it matches `prof_default`'s flat
`VISUALS` category **member-for-member** — the same 30 defects. There is no finer
tier for the 30 drafts to be assigned to; the draft placements are confirmed
correct as-is. `Former Crack`, which the `Edit` tab had filed under AND,
correctly sits in `VISUALS` per the canonical QA tab.

### Scope note

#2 and #3 were always about `prof_default` — the profile that carries the real
taxonomy. The current relational config holds two profiles, `prof_default`
(FACTORY STANDARD) and `prof_1787197871523` (MEDLINE); MEDLINE's
Critical/Major/Minor visual ladder is a deliberately distinct grading regime and
was not in scope for this reconciliation. The CARDINAL / HENRY SCHEIN profiles
named in the original #2 text are not present as seeded profiles in the current
config.

### Verification

Read-only throughout. QA tab parsed with `openpyxl`; `prof_default` read from a
copy of `dev.db`. No migration, no `prisma db push`, no code edit, no write to
`dev.db` or the workbook. The only files changed by this closure are
`AUDIT_REPORT.md` and this `CHANGELOG.md`.

---

## 56. Backend/frontend TLS cert + host/port made environment-configurable (closes INSTALLER_PACKAGE_MANIFEST.md TLS blocker) — 2026-09-06

Closes the "Secondary, non-AI deployment note" `INSTALLER_PACKAGE_MANIFEST.md`
had flagged: `backend/server.ts` and `frontend/vite.config.ts` both
`fs.readFileSync`'d a hardcoded `frontend/10.10.110.31+1*.pem` path — this
laptop's mkcert cert, keyed to its reserved/static LAN IP — plus a hardcoded
`0.0.0.0` bind. The app could not start on any other host. Landed across two
sessions; this entry covers both.

### What changed

Four env vars, all OPTIONAL, added to both `backend/server.ts` and
`frontend/vite.config.ts`:

| Var | Backend default | Frontend default |
|---|---|---|
| `HOST` | `0.0.0.0` | `0.0.0.0` |
| `PORT` | `4009` (pre-existing) | `4001` (pre-existing) |
| `TLS_KEY_PATH` | `frontend/10.10.110.31+1-key.pem` | same |
| `TLS_CERT_PATH` | `frontend/10.10.110.31+1.pem` | same |

Every default reproduces the exact laptop values byte-for-byte, so local dev
needs nothing set. A relative `TLS_*` value resolves against the **repo
root** (parent of both `backend/` and `frontend/`) in both files, so one pair
of values serves both processes; an absolute path is used as-is. No other
server behavior, routing, CORS/JSON middleware, or TLS logic touched.

New `backend/.env.example` (backend already loads `.env` via
`dotenv/config`). `frontend/.env.example` gained a documented "Host & TLS"
block. Neither file contains real cert/key contents — paths and placeholders
only; the `.pem` files themselves stay gitignored (`frontend/.gitignore`,
already tracked as untracked before this change — `git ls-files` confirms
zero `.pem` files under version control, then and now).

### Session 2 — `loadEnv()` wiring for the frontend

Session 1 deliberately left the frontend's four vars readable only from the
real process environment (`$env:TLS_CERT_PATH=...`), since Vite does not load
`.env`/`.env.local` into `process.env` on its own — that mechanism is
reserved for `VITE_*`-prefixed client vars exposed via `import.meta.env`.
This session wires Vite's own `loadEnv()` into `vite.config.ts` (config-side,
config-time only — nothing new reaches the shipped client bundle) so all four
can now also be set in `frontend/.env.local`, right alongside the existing
`VITE_MSAL_CLIENT_ID` / `VITE_MSAL_TENANT_ID`. `envDir` is `__dirname`
(`frontend/`) — Vite's own default, and where `.env.local` already lives —
not the repo root; only the *default* `TLS_KEY_PATH`/`TLS_CERT_PATH` fallback
strings resolve against the repo root, unchanged from session 1. Real
process-environment values still win over the file when both are set,
matching dotenv's usual shell-beats-file precedence and `backend/server.ts`'s
own `dotenv/config` (which never clobbers an already-set `process.env` key).

**Checked for conflicts, as required before landing this:** `loadEnv()`
returns a plain object — it does not itself mutate `process.env` — so it
does not interact with Vite's own internal `VITE_*` env loading elsewhere in
its startup path, and reads the same two files a second time redundantly but
harmlessly. The one behavior change worth flagging: `PORT` in
`frontend/.env.local` now moves the frontend dev server, where before it was
shell-only. This does **not** newly reach `backend/server.ts` — `loadEnv`'s
`envDir` is scoped to `frontend/`, and the backend loads its own, separate
`backend/.env` — so the two sides stay independently configurable. The
pre-existing shared-environment risk is unchanged, not worsened: a `PORT` set
in an actual shared shell (or via root `npm run dev`'s combined process
environment, which both workspaces' `npm run dev` inherit) still reaches
both `process.env['PORT']` reads, exactly as it did before this session,
since `env()`'s process-environment check is still checked first either way.
Documented in `frontend/.env.example`.

### Verification

- `tsc -b` (frontend) / `tsc --noEmit` (backend): clean, both sessions.
- Backend `vitest run` — 58/58 (7 files). Frontend `vitest run` — 113/113
  (18 files); the two `console.error`/`console.warn` lines in that run are
  the suite's own simulated-500 fixtures, not failures.
- **Default path (no `.env` values, no shell vars set), both sessions:**
  started both dev servers via `.claude/launch.json`; backend log printed
  `Bound to: 0.0.0.0:4009 TLS cert: …\frontend\10.10.110.31+1.pem` — the
  exact original path, resolved through the new env-var fallback. `GET
  /api/health` returned `200 {"status":"ok","database":"connected"}` over
  real TLS. Frontend served HTTPS on `4001` with the `Network:` line present
  (confirming the `0.0.0.0` bind held). Loaded `https://localhost:4001` in a
  real browser: zero console errors, `/api/config` and
  `/api/auth/pin-directory` both `200 OK` cross-origin over TLS — live proof
  both certs loaded and are still trusted.
- **Override path (session 2 only):** backed up `frontend/.env.local`,
  appended a temporary `PORT=4055`, ran `vite` directly. Vite bound `4055`
  (`curl` `200`) and **not** `4001` (`curl` timed out) — the file value was
  read and won, not a coincidental fallback. Killed the process, restored
  `frontend/.env.local` from the backup byte-for-byte (`git diff` confirms
  no residual change — the file is gitignored throughout), then re-started
  the frontend dev server and re-confirmed it was back on `4001` by default.
- No code, schema, or `dev.db` change. `backend/server.ts`,
  `frontend/vite.config.ts`, `backend/.env.example` (new),
  `frontend/.env.example`, and `INSTALLER_PACKAGE_MANIFEST.md`'s stale TLS
  blocker note (now marked resolved) are the only files this closure
  touches, plus this `CHANGELOG.md` entry.

---

## 57. Real-data cleanup checkpoint before dev.db and prod.db separation — 2026-09-07

A deliberate stage point. The config control contents were reviewed and
amended in the live app — Factory & Line Setup, Product Engine, and Quality
Rules — to bring `dev.db` as close to real One Glove Group practice as it
has been to date, and all test submissions were confirmed purged to zero.
This checkpoint is taken **ahead of** the planned `dev.db` → `prod.db`
separation; that DB fork is the next step and is not part of this commit.

**What changed vs `00ddef3`:**

- **`Submission` / `AmendmentLog`:** 0 rows, unchanged. Test data was
  cleared in `00ddef3`; still empty — verified, not re-purged.
- **Product Engine (`AppConfig.products`) — the only substantive config
  change.** Every product (all 17) now carries a `BEADING THICKNESS`
  dimension, recorded consistently: `decimals: 3`, `isGraded: false`
  (record-only — measured and stored, never graded against a threshold),
  and a per-size entry of `{minSpec: "1.000", tolerance: "MIN"}` across all
  six sizes XS–XXL. In `00ddef3` only `N025SKB-OC-24FT` had this dimension;
  its existing def was re-standardised here (`decimals` 2→3, `minSpec`
  `"1.00"`→`"1.000"` on all six sizes) and the other 16 were added. All 17
  products received a fresh `lastAmended` of 2026-09-07.
- **Factory & Line Setup** (`lines`, `shifts`, `sides`, `sizes`,
  `sampleSizes`) and **Quality Rules** (`Category`, `Defect`,
  `ProfileCategory`, `ProfileCategoryDefect`): reviewed in the live app, no
  edits required — byte-identical to `00ddef3`.
- **`AccessLog`:** +10 rows (144 → 154) — four `M365_LOGIN_SUCCESS` and six
  `CONFIG_WRITE` / `Product Engine` entries, all the reviewing admin from
  `127.0.0.1` on 2026-09-07. This is the audit trail of the review session
  itself.
- **`M365UserRole`:** one row's `updatedAt` refreshed by login re-sync; no
  role or identity value changed.
- **`AppConfig.updatedAt` / `lastHistoryViewedAt`:** timestamp bumps.

No schema change, no `prisma db push`, no code edit. `backend/dev.db` and
this `CHANGELOG.md` entry are the only files this checkpoint touches.

### Verification

Read-only inspection. `HEAD:backend/dev.db` was extracted to a scratch copy
and compared table-by-table against the working tree, with a recursive JSON
diff of `AppConfig.products`, over a read-only `sqlite3` connection (Python
stdlib; no `sqlite3` on PATH). Every `BEADING THICKNESS` def was checked for
exact name, `decimals: 3`, and `isGraded === false`; the graded/record-only
semantics are defined by `isDimensionGraded()` in
`backend/src/engine/dimensionEvaluator.ts`. Row-count deltas and the
`products` diff were reconciled against the operator's account of the
session before committing.

---

## 58. Production database separated from the dev seed via a DATABASE_URL default — 2026-09-07

The runtime database is now `backend/prod.db`, separate from the git-tracked
`backend/dev.db` seed. Forked from the §57 checkpoint, so `prod.db` starts as
the reviewed real-practice configuration with zero submissions.

### What was already there

`DATABASE_URL` was **already environment-driven** — this closure did not
introduce that, it removed a hard requirement. `prisma/schema.prisma`'s
`datasource db` block carries **no `url`**: Prisma 7 supplies it at runtime
through a driver adapter. `backend/src/lib/prismaClient.ts` read
`process.env['DATABASE_URL']` and passed it to `PrismaLibSql({ url })`, and
`backend/prisma.config.ts` reads the same variable for CLI use. Both are fed by
`import 'dotenv/config'` in `server.ts`, which loads `backend/.env`.

The gap was that `prismaClient.ts` **threw** when the variable was unset — there
was no default — and the value in `backend/.env` was the CWD-relative
`"file:./dev.db"`.

### Changes

- **`backend/prod.db`** created as a one-time file copy of `dev.db` at commit
  `9e959df`, verified byte-identical (same `sha256`) with
  `PRAGMA integrity_check` returning `ok`. No filtering and no profile deletion:
  2 profiles, 8 categories, 49 defects, 95 profile-defect links, 17 products,
  0 submissions.
- **`backend/src/lib/prismaClient.ts`** — env-wins-with-default, the same pattern
  as `HOST` / `PORT` / `TLS_KEY_PATH` / `TLS_CERT_PATH` in `server.ts` (§56). Set
  `DATABASE_URL` is used **verbatim**, so the deployment contract is unchanged;
  unset falls back to the tracked `dev.db`. The resolution is factored into an
  exported `resolveDatabaseUrl(env)` so it is testable without constructing a
  client.
- **`backend/.env.example`** — `DATABASE_URL` documented commented-out with a
  placeholder absolute path aimed at `prod.db`. Also corrected a stale header
  claiming `DATABASE_URL` was the one non-optional variable; every variable in
  that file is now optional.
- **`backend/.gitignore`** — `prod.db` plus its `-journal` / `-wal` / `-shm`
  companions, with a comment recording that `dev.db` deliberately stays
  **tracked** as this repo's seed/reference database.
- **`INSTALLER_PACKAGE_MANIFEST.md`** — new §3.1 (resolution table, absolute-path
  guidance for service contexts where the working directory is not guaranteed,
  how `prod.db` is created at install time behind an existence check so re-runs
  and updates never overwrite live data). Row 9 rewritten and row 9a added for
  `prod.db`; `prod.db` added to both exclude lists and to the packaging
  verification checks.

### Two decisions worth recording

**The default is absolute, not `file:./dev.db`.** It is derived from the backend
package directory via `__dirname`. A CWD-relative default silently resolves
against whatever directory the process happened to start in, which would create
and then talk to an *empty* database rather than failing loudly — a
wrong-database failure mode, not a missing-database one. An explicitly-set
`DATABASE_URL` is passed through untouched, so this affects only the fallback.
For the same reason an empty or whitespace-only value counts as unset: `??`
alone would forward `""` into libsql and fail far from the cause, losing the
old `if (!url)` guard's intent.

**`backend/prisma.config.ts` was deliberately left without a fallback.** It
already honours `DATABASE_URL`, which is all an installer needs to point CLI
operations at `prod.db`. Leaving it to fail loudly when the variable is unset is
the safer behaviour for schema-mutating commands — a silent default to `dev.db`
there could push a schema onto the seed database by accident.

### Two hazards found and recorded, not introduced

- **The rsync packaging route would have swept `prod.db` into the package.**
  `.gitignore` protects the `git archive` route but does nothing for a
  working-tree `rsync`/`robocopy`, and `prod.db` exists on any developer
  machine. Now explicitly excluded, and asserted absent by the §3 checks.
- **The manifest's claim that the server "builds a fresh DB via
  `prisma migrate deploy`" is unproven.** `prisma/migrations/` has been drifted
  from the live schema since long before that manifest (§5.2) because this
  project uses `prisma db push`. That claim was not repeated; §3.1 records it as
  an explicit blocker and prefers seeding from the shipped `dev.db` copy.

Also documented: never point a production deployment at `dev.db`, since a
`git pull` of any `chore(dev.db)` commit would overwrite it and silently destroy
live data.

### Verification

- Backend `tsc --noEmit` and frontend `tsc -b`: both clean.
- Backend `vitest run` — 58/58 (7 files). Frontend `vitest run` — 113/113
  (18 files); the two `console.error`/`console.warn` lines are the suite's own
  simulated-500 fixtures, not failures.
- **libsql URL form probed empirically before writing the default**, rather than
  assumed: `file:` + a native backslashed Windows absolute path, `file:` + a
  forward-slashed absolute path, and the existing `file:./dev.db` all connect
  and return the same row counts. No slash conversion is needed.
- **Unset path, live:** started a real backend with `env -u DATABASE_URL`, from a
  **foreign working directory**, on spare port `4055` via the §56 `PORT`/`HOST`
  variables so the running dev server was never touched. `/api/health` returned
  `"database":"connected"`; `/api/config` returned 17 products with the exact
  `dev.db` codes; `/api/auth/pin-directory` returned both `PinUser` rows with
  ids matching `dev.db` exactly. **No stray `dev.db` was created in the foreign
  working directory** — direct proof the absolute default resolved as intended,
  where the previous relative form would have created an empty database there.
- **Set path, live:** the dev server on `4009` (which `tsx watch` restarted on
  the `prismaClient.ts` edit) came back healthy on the `backend/.env` value —
  17 products, 2 PIN users. No regression in either direction.
- No schema change, no `prisma db push`, no migration. `backend/dev.db` is
  untouched and still tracked at `9e959df`; `prod.db` is gitignored and appears
  nowhere in `git status`.

---

## 59. Quality Analytics menu item frozen behind a frontend feature flag — 2026-09-07

The "QUALITY ANALYTICS" area (side-menu item + `/analytics` route) is frozen
pending the next version release. This is a **reversible toggle, not a
removal** — nothing about `AnalyticsPage`, `AnalyticsDashboard`, or the
route/nav wiring was deleted. **Code-only: no schema, no migration, no
`dev.db`/`prod.db` change.**

### The flag

- **`frontend/src/lib/featureFlags.ts`** (new) — a single build-time boolean,
  `QUALITY_ANALYTICS_ENABLED = false`, at the top of the file with a comment
  explaining the freeze is temporary and that flipping it back to `true` and
  rebuilding fully restores the feature with no other change required. This is
  the only file to touch to unfreeze.

### Nav — visible but inert (`frontend/src/components/layout/Sidebar.tsx`)

- `SidebarItem` gains an optional `frozen?: boolean`; the `/analytics` entry
  sets `frozen: !QUALITY_ANALYTICS_ENABLED`. Every other entry is unchanged.
- When `frozen` is true the item still renders (kept visible for
  discoverability) but as a plain `<div>` — **not** a `<NavLink>`/`<a>`, so
  there is no `href` to follow and nothing in the tab order — with
  `aria-disabled="true"`, `tabIndex={-1}`, `cursor-not-allowed`,
  `pointer-events-none`, dimmed text, and a **"Coming soon"** badge next to the
  label. No `onClick`, so a click (mouse or synthetic) does nothing.
- When `frozen` is false the map falls through to the **exact original
  `<NavLink>`** render path, untouched.

### Route — direct navigation blocked (`frontend/src/App.tsx`)

- **`frontend/src/components/routing/FeatureRoute.tsx`** (new) — a small guard:
  `enabled === false` → `<Navigate to={fallback} replace />` (fallback
  defaults to the dashboard, `/wizard`); `enabled === true` → renders
  `children` verbatim, a transparent pass-through.
- The `/analytics` `<Route>` is now wrapped
  `<FeatureRoute enabled={QUALITY_ANALYTICS_ENABLED}>` **outside** the existing
  `<RoleRoute allowedRoles={GROUP_AB_ROLES}><AnalyticsPage /></RoleRoute>`.
  With the flag off, a typed URL / bookmark / back-forward / deep link to
  `/analytics` redirects to `/wizard` instead of mounting the page. With the
  flag on, `FeatureRoute` is a pass-through and the element is byte-for-byte
  the pre-freeze `RoleRoute`-wrapped `AnalyticsPage`.

### Tests

- **`frontend/src/components/routing/__tests__/FeatureRoute.test.tsx`** (new,
  4 tests) — flag off redirects a direct `/analytics` hit to the dashboard;
  flag on renders the guarded element unchanged; a custom `fallback` is
  honoured; and a trip-wire asserting the shipped `QUALITY_ANALYTICS_ENABLED`
  is still `false`.
- **`frontend/src/components/layout/__tests__/Sidebar.frozenItem.test.tsx`**
  (new, 4 tests) — the "QUALITY ANALYTICS" label is present but not inside an
  `<a>`; the row is a `<div>` with `aria-disabled="true"` / `tabindex="-1"`;
  it carries a "Coming soon" badge; clicking it leaves the route on `/wizard`;
  and the other nav items are still real links. `useAuth` / `useConfig` /
  `useWizardGuard` / `useHistoryIndicator` are mocked (this app's Group A
  login is MSAL-popup based, undrivable in a sandboxed browser —
  NAVIGATION_AND_RBAC.md §3.1); the flag itself is the real one.

### Verification

- Frontend `tsc -b`: clean. `oxlint`: 0 errors (pre-existing warnings only,
  none in the new files).
- Frontend `vitest run` — **121/121** (20 files), the 113/113 baseline plus
  the 8 new tests. The two `console.error`/`console.warn` 500 lines are the
  suite's own simulated-failure fixtures.
- No schema change, no `prisma` command, no `dev.db`/`prod.db` write. Backend
  untouched.

---

## 60. GitHub Actions CI workflow runs the quality gate on push and PR to master — 2026-09-07

Until now the project's quality gate (typecheck / lint / test for both
workspaces) only ran when someone ran it by hand. `.github/workflows/ci.yml`
(new, and the repo's first CI config of any kind) now runs it automatically.
**Code-only: a workflow file plus this entry — no schema, migration, or
`dev.db` change, and no application code touched.**

### Trigger

- `push` to `master` and `pull_request` targeting `master`.

### Job — one job, sequential steps

A single `quality-gate` job on `ubuntu-latest`. **Not** split into a
frontend/backend matrix: the gate is small, the backend typecheck and tests
depend on `prisma generate` having run, and a matrix would double the
`npm ci` + cache cost for no isolation benefit worth having here. Steps, in
order, each failing the job on any non-zero exit (Actions' default; no
`continue-on-error`):

1. `actions/checkout@v4`.
2. `actions/setup-node@v4` — Node **22** with `cache: npm`. There is no
   `.nvmrc` and no `engines` pin tighter than the root `"node": ">=18"`;
   local dev runs v24. 22 (current LTS) was chosen as the CI baseline and
   matches `backend/package.json`'s `@types/node: ^22`. *(Assumption — no
   repo file dictates the exact version.)*
3. `npm ci` at the repo root — one `package-lock.json`, npm **workspaces**
   (`frontend`, `backend`) installs both. No monorepo tool beyond npm itself.
4. `npx prisma generate` in `backend/` — the Prisma client generates to
   `backend/generated/prisma` (gitignored, `output = "../generated/prisma"`
   in `backend/prisma/schema.prisma`), and the backend typecheck + tests
   import those types, so this runs first. `prisma.config.ts` is auto-loaded
   from the `backend/` cwd; `generate` needs no DB connection.
5. `npx tsc --noEmit` in `backend/` — `backend/tsconfig.json` has no `noEmit`
   and there is no backend typecheck script, so the flag is passed
   explicitly, matching the documented local baseline command.
6. `npm test` in `backend/` → `vitest run` (backend's only script).
7. `npx playwright install --with-deps chromium` in `frontend/` —
   `frontend/vitest.config.ts` runs tests in Vitest **browser mode** via
   Playwright/Chromium, so the browser and its OS libraries must be present.
8. `npx tsc -b` in `frontend/` — the typecheck half of the `build` script
   (`tsc -b && vite build`); there is no standalone frontend typecheck
   script.
9. `npm run lint` in `frontend/` → `oxlint` (confirmed: `frontend`'s `lint`
   script is `oxlint`, config at `frontend/.oxlintrc.json`; **not** eslint,
   and the backend has no lint script).
10. `npm test` in `frontend/` → `vitest run`.

### Exact scripts referenced (verified against `package.json`, not assumed)

| Workspace | Script | Value |
|---|---|---|
| root | — | npm workspaces: `["frontend", "backend"]`, single `package-lock.json` |
| frontend | `lint` | `oxlint` |
| frontend | `test` | `vitest run` |
| frontend | `build` | `tsc -b && vite build` (CI uses `tsc -b` alone for typecheck) |
| backend | `test` | `vitest run` |
| backend | typecheck | no script — `npx tsc --noEmit` per the local baseline |

### Verification

- `.github/workflows/ci.yml` is well-formed YAML and every `run:` command is
  copied from the `package.json` scripts above.
- **Not executed.** GitHub Actions cannot be triggered from this environment,
  so the workflow has never actually run. It must be confirmed by watching
  the first real push or PR to `master` pick it up — in particular the
  Playwright install step and the browser-mode frontend test run, which are
  the parts most likely to need adjustment on a clean CI runner.

---

## 61. Dev-tools wipe endpoint gated behind a password (issue #24) — 2026-09-07

The dev-only destructive-tools router (`backend/src/routes/devTools.routes.ts`)
exposes two data-wiping routes — `DELETE /api/dev/submissions/all` and
`DELETE /api/dev/submissions/by-product-code`. Until now the only thing in
front of them was the `NODE_ENV !== 'production'` guard (a double guard: the
router's own `blockInProduction` plus the conditional `app.use` in
`server.ts`). In any non-production environment they fired on request alone,
so an accidental call — or anyone who could reach the port — wiped the test
data. Issue #24 asked for a password in front of them; the routes themselves
are unchanged and stay in the tree until go-live. **Code-only: one new
env var and a middleware. No schema, migration, Prisma command, or
`dev.db` / `prod.db` change; no application logic outside this router
touched.**

### The gate

A new router-level middleware, `requireWipePassword`, mounted with
`router.use()` immediately after `blockInProduction` — so it runs before any
wipe route's own body parsing or logic, for every route on the router,
present and future.

- **Secret:** `WIPE_ENDPOINT_PASSWORD`, read as `process.env['WIPE_ENDPOINT_PASSWORD']`,
  the same bracket-access pattern `server.ts` uses for `HOST` / `PORT` /
  `TLS_KEY_PATH` / `TLS_CERT_PATH`.
- **No default — fail closed.** The four vars in `server.ts` all `?? <laptop
  value>` so local dev needs none of them. This one deliberately does not: if
  it is unset or empty, the middleware answers `401` and the wipe never runs.
  A misconfigured environment cannot leave the endpoint open, only closed.
- **Transport:** the caller sends `{ "password": "..." }` in the JSON request
  body — not a header, not a query string. `by-product-code` already reads
  `productCode` from the same body, so its callers now send both keys.
- **Check:** exact-string compare against the env var. Missing key, non-string
  value, or wrong value → `401 { "error": "Unauthorized" }`, no wipe. Match →
  `next()` and the existing wipe logic runs completely unchanged.
- **No logging / audit trail** — deliberately kept minimal per the issue.

### Files

- **`backend/src/routes/devTools.routes.ts`** — added `requireWipePassword`
  and its `router.use()`; expanded the file header comment. `NextFunction` was
  already imported.
- **`backend/.env.example`** — new "Dev-tools wipe password" section
  documenting the var and its no-default / fail-closed behaviour.

Jerry's gitignored `backend/.env` currently has only `DATABASE_URL`; to keep
using the local dev wipe tools he must add `WIPE_ENDPOINT_PASSWORD=<value>`
to it. Left for him to set — no value was invented.

### Verification

- Backend `npx tsc --noEmit`: clean.
- Backend `npm test` → `vitest run`: 58/58, unchanged from baseline.
- Frontend untouched; `tsc -b` / `oxlint` / `vitest run` re-run as a
  regression check, all at baseline (121/121).

---

## 62. Production-hardening pass — frontend console stripping and generic backend 500s — 2026-09-07

Follow-up to the read-only production-hardening audit (task 4). Source maps
were already confirmed disabled; this closes the two remaining items. **Code-
only: build config + one new backend lib module + call-site edits. No schema,
migration, Prisma command, or `dev.db` change.**

### Part 1 — `console.*` stripped from the production frontend bundle

Before: nothing removed `console.*` from `vite build` output — all 31
`console.error` / `console.warn` diagnostics in `frontend/src` shipped in the
bundle (plus a handful more from vendored deps).

`frontend/vite.config.ts` now sets, under `build.rollupOptions.output`:

```
minify: {
  compress: { dropConsole: true, dropDebugger: true },
  mangle: true,
  codegen: true,
}
```

- **Why not `esbuild: { drop: ['console'] }`** (the usual Vite recipe): this
  project is on Vite 8, which is rolldown-based and minifies with **oxc**, not
  esbuild. `vite build` prints *"Both esbuild and oxc options were set. oxc
  options will be used and esbuild options will be ignored"* and the esbuild
  `drop` is a no-op — verified: a build with that option still had 47
  `console.*` occurrences in `dist/`. Console removal on this toolchain is an
  oxc-**minifier** flag (`compress.dropConsole`), set on the rolldown output
  options. Vite spreads user `rolldownOptions.output` last (over its computed
  `minify: true`), so this override wins.
- **`mangle` / `codegen` kept `true`** so the bundle is still fully minified —
  an object `minify` replaces Vite's default `minify: true` wholesale, so the
  other two sub-options have to be restated or the output balloons.
- **Production build only.** `build.rollupOptions` is not consulted by
  `vite dev` or the vitest browser runner (neither minifies), so local dev and
  the test suite keep full console output — confirmed: the frontend vitest run
  still prints its `[console.warn]` / `[console.error]` fixture lines.
- **No source changed.** All 31 `console.*` call sites in `frontend/src` are
  left exactly as they were; they just don't reach the shipped bundle.

Verified: `rm -rf dist && npm run build` then
`grep -rho 'console\.[a-z]*' dist/assets/*.js` → **0 matches** (was 47).

### Part 2 — backend unexpected-500s no longer leak raw error text

Before: ~12 of ~38 error-response sites returned
`{ error: 'Internal server error', details: String(err) }` on an unexpected
500 — raw error text (Prisma constraint/column names, file paths) to the
client, in every environment, with no `NODE_ENV` gate. There was also no
global Express error handler; a synchronous throw in a handler fell through to
no handler at all.

**New — `backend/src/lib/internalError.ts`:**

- `internalErrorBody(err, message?)` — the single decision point. In
  production (`NODE_ENV === 'production'`): `{ error }` only. Outside
  production: `{ error, details: String(err) }`, preserving local debugging.
  Same `NODE_ENV` gate the `/api/dev` router mount and the wipe-password
  fail-closed already use.
- `globalErrorHandler(err, req, res, next)` — 4-arg Express error middleware.
  Logs `[unhandled] <method> <url>` + the error (message + stack) via
  `console.error`, then sends `internalErrorBody(err)`. Delegates to Express's
  built-in handler if headers were already sent.

**`backend/server.ts`** — mounts `app.use(globalErrorHandler)` last, after the
404 fallback.

**Call sites converted** to `res.status(500).json(internalErrorBody(err))`
(behaviour identical to before outside production; generic in production):

- `backend/src/routes/submissions.routes.ts` — 9 sites (the former lines 451,
  641, 799, 850, 1116, 1181, 1393, 1456, 1513).
- `backend/src/routes/devTools.routes.ts` — 2 sites (120, 164).
- `backend/src/routes/config.routes.ts` — 1 site (the PATCH catch-all, ~846),
  via `internalErrorBody(error, 'Failed to update system configuration')` to
  keep its specific client message.

**Deliberately untouched:**

- The ~26 already-generic sites (`pinUsers` / `m365Users` / `registry` /
  `accessLog` routes, the `config` GET handler).
- Curated 4xx domain `details` — `config.routes.ts:826` (409 registry-sync
  conflict) and `submissions.routes.ts:1257/1265/1273` (422
  `VerdictProfileNotFoundError` family). These strings are app-authored and
  meant to reach the client as-is.
- `submissions.routes.ts` lines ~362 / ~366 / ~1504 (`{ error: err.message,
  code: 'NO_USABLE_*' }`) — semi-curated domain errors with a stable `code`,
  not part of the audit's leak list.

### Verification

- Backend `npx tsc --noEmit`: clean. `npm test` → `vitest run`: **58/58**,
  unchanged.
- Frontend `tsc -b`: clean. `oxlint`: **0 errors** (44 pre-existing warnings,
  none in `vite.config.ts` or the changed files). `vitest run`: **121/121**,
  unchanged; the two `console` 500 lines are the suite's own fixtures.
- Frontend production build: exit 0, `dist/` contains **0** `console.*`.
- Backend dev server (`NODE_ENV` unset) reboots cleanly on the new
  `server.ts` import; `GET /api/health` ok, 404 fallback intact.


---

## 63. Pre-packaging cleanup — neutral source comments, wider editor ignores, CHANGELOG archive split — 2026-09-07

Housekeeping ahead of §65's first real package build. Three unrelated items,
grouped only because each one is a thing that would otherwise have shipped to a
customer server or made the repo harder to work in.

**Source-comment rewording.** `INSTALLER_PACKAGE_MANIFEST.md` §4 flagged that
four backend files carry `Level 1 System Precedence: AI_RULES.md ...` /
`(superseded the Antigravity-era ...)` in their header comments, and that the
backend ships as TypeScript source, so those comments reach the server verbatim.
All four were reworded to cite the live spec documents by their neutral names:
`server.ts`, `src/engine/aqlEvaluator.ts`, `src/routes/config.routes.ts`,
`src/routes/submissions.routes.ts`.

The manifest also recorded that the two frontend files with the same comment —
`src/context/ConfigContext.tsx` and `src/pages/WizardPage.tsx` — did *not* need
changing, because the frontend was to ship as `vite build` output, which strips
comments. **That reasoning no longer holds:** §65's installer builds the frontend
on the target server, so `frontend/src` ships as source too. Both were reworded
as well. Six files total, not four.

**Editor/assistant ignore entry widened.** `.gitignore` listed a single tool's
workspace directory. It now covers the usual set — `.claude/`, `.cursor/`,
`.windsurf/`, `.aider*`, `.continue/`, `.idea/`, `.vscode/` — and the comment
describes the category rather than one product. The stray empty
`backend/.windsurf/` directory noted in the manifest (§2 row 7) was deleted;
verified beforehand as containing zero files and zero tracked paths.

**CHANGELOG split.** This file had reached 7,585 lines, so opening it for
orientation cost more than its closed, historical majority justified — the same
problem, and the same remedy, as the 2026-08-10 split that created it out of
`AUDIT_REPORT.md`. §1-§40 moved verbatim to
`archived/CHANGELOG_sections-1-40.md`, on a clean date boundary: everything
archived is 2026-08-27 or earlier, and the current September arc stays here.

Section numbering is deliberately NOT reset — a citation to `CHANGELOG.md §N`
for N <= 40 now resolves to §N in the archive file, and both files carry a
pointer saying so. The move was verified programmatically rather than by eye:
both section bodies compare byte-identical against the pre-split file as stored
in git, and no `##` heading was lost.

**Database migration:** none. Comments, ignore rules and documents only.

---

## 64. Redirect URI panel derives the live value instead of a hardcoded list — 2026-09-07

`EnvironmentInfoPanel.tsx` rendered a hand-maintained array literal:

```ts
const EXPECTED_REDIRECT_URIS = ['https://localhost:4001', 'https://10.10.110.31:4001'];
```

Its own comment conceded it was manually maintained. On any host other than this
laptop it is simply wrong — so the panel whose stated purpose is diagnosing an
Entra redirect-URI mismatch was itself displaying URIs that Entra would reject,
with no indication it was guessing. The static LAN IP survived §56, which
otherwise removed every hardcoded copy of that address.

**Fix.** `lib/msalConfig.ts` now exports the value it already computed for MSAL:

| export | meaning |
|---|---|
| `redirectUri` | what MSAL actually sends: `VITE_MSAL_REDIRECT_URI`, else `window.location.origin` |
| `configuredRedirectUri` | the build-time override, when set — lets the panel report *how* the value was derived, not just what it is |

The panel renders those two, and states plainly that Entra matches literally, so
every additional address the app is reached from needs its own registered entry.
Nothing needs editing when the app moves host. On a deployed install the answer
is correct for free, because §65 serves the API and the SPA from one origin.

`frontend/.env.example` carried an "add it to `EXPECTED_REDIRECT_URIS`"
instruction that became a dead citation; repointed at System > Environment.

**Test.** New `EnvironmentInfoPanel.redirectUri.test.tsx`, 3 tests, real
Chromium. It deliberately does **not** mock `msalConfig` — mocking the module
under test would make it structurally incapable of catching a regression back to
a literal, which is the entire failure being guarded. One assertion needed
scoping to the Redirect URI card by its own label: the origin legitimately
appears twice on the panel, since Runtime Addresses > Frontend composes the same
string from the same `window.location` parts.

**Database migration:** none. Frontend only.

---

## 65. On-prem installer and packaging step — Windows service, seeded database, exclusion verification — 2026-09-07

Implements the packaging step `INSTALLER_PACKAGE_MANIFEST.md` specified but
explicitly left unwritten ("No installer/packaging script exists in this repo
yet ... This file is the spec that the future packaging step MUST follow"), plus
the server-side installer the manifest sketched as `install/install.(sh|ps1|md)`.

### 65.1 `package.ps1` — builds the shippable folder (development machine)

Never ships; it is pruned from its own output, because its exclusion list names
every internal document by filename and would be a disclosure in itself.

Built from `git archive HEAD`, not the working tree. That distinction is the
whole point: `git archive` structurally *cannot* emit `.git/` or anything
gitignored, whereas a `robocopy /MIR` or a `Compress-Archive` from the repo root
sweeps in all 7 MB of history, `node_modules/`, and `docs/` with its real
customer `.xlsx` exports — and one forgotten exclude ships the lot silently.

Tracked-but-internal paths are then pruned. Root `*.md` goes wholesale rather
than by name, so a newly added root document is excluded by default instead of
shipping until someone remembers to list it; `install/README.txt` is `.txt`
precisely so it survives that rule. Also pruned: `archived/`, `docs/`,
`.github/`, `backend/scripts/`, editor state, every `.gitignore`, all test code,
and the git-tracked `backend/dev.db`.

The build then **fails** on any forbidden path, any forbidden string
(`AI_RULES`, `Antigravity`, `Co-Authored-By`), or any missing required file.
Those assertions are the actual contract; the prune list is merely how the
package is expected to satisfy them.

This was proven rather than assumed, and it earned its keep on the first run: the
forbidden-path check caught `.gitignore`, which is tracked and which the prune
list had missed. After the fix, an **independent** audit of the output — run
outside the script, case-insensitively, across every text file — found no
occurrence of `claude`, `anthropic`, `antigravity`, `ai_rules`, `co-authored-by`,
`windsurf` or `copilot`, and no `.md`, `.map`, `.pem`, `.xlsx` or test file
anywhere. Package: 127 files, 2.6 MB, top level exactly `backend/`, `frontend/`,
`install/`, `install.ps1`, `package.json`, `package-lock.json`, `scripts/`.

### 65.2 `install.ps1` — installs on the server

Windows PowerShell 5.1 compatible (the Server default). Every step prints `[ OK ]`
or `[FAIL]`, and each failure prints a `WHAT TO DO:` block naming the exact
remedy — the operator is an administrator, not a developer. Re-running is safe;
existing data and configuration are never overwritten.

Order: prerequisites (Administrator, Node >= 20.19, npm, NSSM) -> configuration
file -> TLS -> database -> `npm ci` -> `prisma generate` -> frontend build ->
service registration -> service start -> HTTPS health check.

**Configuration.** On first run it copies `backend/.env.example` to
`backend/.env`, appends an explicit `REQUIRED` block, and **stops** with exit
code 2 and instructions. It generates no values: the four site-specific settings
are written as `CHANGE_ME` placeholders, with the recommended shape in a comment
above each. Later runs validate all six required keys for presence *and* for a
surviving placeholder, since a half-edited `.env` is the likeliest failure and
the least visible from a service that merely won't start. `DATABASE_URL` is
additionally required to be `file:`-prefixed, absolute, and not `dev.db` —
pointing production at the tracked seed would let a future update destroy live
data.

**TLS.** No certificate is generated, deliberately: a self-signed certificate
warns in every browser and Entra ID sign-in would not work at all. The installer
only wires `TLS_KEY_PATH`/`TLS_CERT_PATH` to wherever IT places the PEM pair, and
fails with an explicit "ask IT for a certificate from the company CA" message
when they are absent. Stated as a prerequisite in `install/README.txt`, alongside
Node and NSSM — NSSM is likewise not downloaded, only detected.

**Database.** `install/seed.db` is copied to the `DATABASE_URL` location on first
install only, guarded by an existence check, so an update leaves live data
untouched. `prisma migrate deploy` is not attempted: the manifest records that
`prisma/migrations/` has been drifted from the live schema since long before it,
and nothing demonstrates that it reproduces the current schema.

**Service.** NSSM, configured `SERVICE_AUTO_START` with `AppExit Default Restart`,
a 5 s restart delay and a 10 s crash-loop throttle, with rotating stdout/stderr
logs. It runs `node --import tsx server.ts` as one supervised process: routing it
through npm would interpose a shell wrapper, so a stop or crash-restart would act
on the wrapper and could orphan the real server still holding the port.
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set for `npm ci` — build tooling is
required (the frontend compiles here, so `--omit=dev` is not an option), which
drags in the test runner, and a production server has no use for several hundred
MB of browsers.

### 65.3 Three defects this work exposed

**`vite build` required a TLS certificate.** `vite.config.ts` read both `.pem`
files at config-load time, so a build failed with `ENOENT` before compiling a
single module on any machine lacking a certificate at this laptop's default path
— that is every server, and it would have broken the installer's build step
outright. The read is now deferred and gated to `command === 'serve'`, since a
build never opens a socket. Verified both directions: builds successfully with
`TLS_KEY_PATH`/`TLS_CERT_PATH` pointing into a nonexistent directory, while
`vite dev` still serves HTTPS and still refuses plain HTTP.

**`backend/.env` was never loaded under the service.** `import 'dotenv/config'`
resolves `.env` against `process.cwd()`. Local development works only by
coincidence — `npm run dev --workspace=backend` happens to run from inside
`backend/`. A service has no such guarantee.

This was the serious one, because it failed *silently*: every setting in `.env`
is optional with a baked-in development default, so the server started happily on
all of them. A production install would have run against the bundled `dev.db`
rather than the site's database, looked for the original laptop's certificate,
and — `NODE_ENV` being unset too — **mounted the destructive `/api/dev`
maintenance routes that must never exist in production**. New
`src/lib/loadEnv.ts` resolves the file from the backend package directory via
`__dirname` and is imported first for its side effect, preserving the ordering
`import 'dotenv/config'` relied on (`prismaClient.ts` reads `DATABASE_URL` as it
loads). Same reasoning `prismaClient.ts` already applies to its own default;
dotenv precedence is unchanged, so the real process environment still wins.

**Nothing served the frontend.** `server.ts` was API-only, and the UI came from
the Vite *dev* server — so "runs as a Windows service" had no answer for how an
operator reaches the app. It now mounts `express.static(frontend/dist)` plus a
history fallback, after the API routers and before the JSON 404, guarded by an
`existsSync` on the built `index.html` so local development is untouched
(verified: with `dist/` removed, `GET /` still returns the original
`{"error":"Route not found"}`). One origin serves both, which is what lets the
frontend's existing defaults work with no configuration — `API_BASE_URL` falls
back to `https://<page hostname>:4009` and MSAL's `redirectUri` to
`window.location.origin`, both simply this server. The fallback route uses a
RegExp with a negative lookahead rather than `'*'`: it behaves identically on
Express 4 and 5, and it keeps `/api` and `/api/...` out of the fallback so an
unknown API route still returns JSON rather than HTML that a `fetch()` caller
would hit as an opaque parse error. A backend `start` script was added.

### 65.4 Deliberate divergences from the manifest

Both follow from building the frontend on the server instead of shipping a
prebuilt bundle, which is what makes the package independent of any particular
build machine:

- `frontend/src` and its build configuration now ship, so the manifest's
  frontend prune list (§3, "never `frontend/src/`") does not apply. The
  consequence for §63's comment rewording is noted there.
- The seed database ships as `install/seed.db` sourced from `prod.db` rather than
  from `dev.db`. The two are byte-identical (§58), and the manifest's §3.1
  option 1 is otherwise followed exactly.

`install.ps1` sits at the repository root rather than under `install/`.

### 65.5 Verification

`package.ps1` run to a clean pass, with the independent audit above.
`install.ps1` exercised end-to-end against the produced package: first run
stopped at exit 2 having created `.env`; an unedited re-run failed naming all
four surviving placeholders; a wrong TLS path failed with the certificate
message; the full run then completed `npm ci` (363 packages), `prisma generate`
and the frontend build at exit 0. The service command line was then run exactly
as NSSM invokes it — from the application root — confirming the env file was
injected, `/api/health` 200 against the seeded database, `/` and `/system` 200
`text/html`, real config data returned, and `/api/dev` 404 under
`NODE_ENV=production`.

**Not verified:** NSSM service registration, start, and the post-start health
check. NSSM is not installed on this development laptop, so steps 8-9 of
`install.ps1` have not been executed. Everything they depend on has been.

Quality gate: backend `tsc --noEmit` clean + 58/58 Vitest; frontend `tsc -b`
clean + 124/124 Vitest (21 files, up from 121/121 across 20 — the three new
tests in §64); `oxlint` 0 errors.

**Database migration:** none. No schema change, no `prisma db push`, no migration
added or modified, and `dev.db` untouched.

---

## 66. Installer generates a self-signed TLS certificate when none is supplied — 2026-09-07

Follows §65. That installer required the operator to place a PEM certificate +
key at the configured paths and failed loudly if they were missing, on the
assumption an internal CA would issue one. Confirmed since: the target site has
no internal CA, so the certificate is self-signed regardless — and asking a
non-developer operator to run `New-SelfSignedCertificate`, wrestle the private
key out of the Windows certificate store into PEM, and build a correct SAN by
hand is not a reasonable ask. `install.ps1` now does it.

### What changed in `install.ps1`

**STEP 3 ("Checking TLS certificate")** went from *verify-or-fail* to
*keep-or-generate*:

- If valid PEM cert **and** key are already at `TLS_CERT_PATH` / `TLS_KEY_PATH`
  — a re-run, or an operator-supplied certificate — they are left **byte-for-byte
  untouched** (verified: file hashes identical across a second run). The step
  prints the existing cert's subject and expiry, and warns if it has expired.
- If neither exists, a self-signed certificate is generated for this server.
- If exactly one exists, or a file is not readable PEM, both are regenerated
  together so the pair matches.

**How the certificate is built.** No `New-SelfSignedCertificate`, no certificate
store. Windows PowerShell 5.1 runs on .NET Framework, whose CNG-backed keys
cannot be exported as plaintext parameters through the `RSA` API
(`ExportParameters($true)` throws "operation not supported") — the blocker that
makes the store route a dead end here. Instead:

1. `RSACryptoServiceProvider` (a legacy CSP key — its parameters are always
   plainly exportable on .NET Framework) generates a 2048-bit key.
2. `System.Security.Cryptography.X509Certificates.CertificateRequest` builds the
   certificate around that key: `CN=<primary address>`, a Subject Alternative
   Name extension (proper `IPAddress=` entries for IPs, `DNS=` for names),
   `serverAuth` EKU, basic constraints (not a CA), key usage. `CreateSelfSigned`
   with a −1 day / +5 year window.
3. The private key is hand-encoded from its `RSAParameters` into a PKCS#1
   `RSAPrivateKey` DER structure (a tiny ~40-line DER writer added to the
   script) and written as `-----BEGIN RSA PRIVATE KEY-----`; the certificate is
   written as `-----BEGIN CERTIFICATE-----`. Both are exactly what
   `backend/server.ts` already feeds to `https.createServer({ key, cert })`.
4. `icacls` restricts the private-key file to `SYSTEM` + `Administrators` — the
   accounts the NSSM service (LocalSystem) and the installer actually run as.

`CertificateRequest` needs .NET Framework 4.7.2+ (Windows Server 2019+, Windows
10 1809+). If it is absent the step fails with that requirement stated and the
manual-PEM fallback spelled out.

**SAN / subject selection.** `CN` and the first SAN entry come from `HOST` when
it is a specific address (the confirmed deployment sets `HOST` to the server's
fixed IP). When `HOST` is `0.0.0.0` the step warns and falls back to the
machine name plus every detected non-loopback IPv4. `localhost` and `127.0.0.1`
are always included so the post-start health check against `https://localhost`
matches too.

**Console output.** Generation prints a boxed, operator-pitched block: this is a
self-signed certificate, browsers will show a one-time "not secure" warning on
first visit per machine, that is expected and not an error, the connection is
still encrypted, and IT can suppress the warning by pushing the cert file to
clients' Trusted Root store. The closing summary repeats the warning note when a
cert was generated this run.

**Validity: 5 years** (`$CertValidityYears`), so renewal is not a routine chore;
to force a fresh pair, delete both PEM files and re-run.

### Documentation

- `install/README.txt`: the TLS certificate moved from a "must already be in
  place" prerequisite to an "usually nothing to do" section; added a
  "THE BROWSER SECURITY WARNING" section; the troubleshooting entry for a
  missing cert (which can no longer happen) replaced with one for the rare
  .NET-too-old case.
- The `.env` block `install.ps1` writes on first run, and its first-run
  ACTION REQUIRED console message, now describe auto-generation and the reason
  to set `HOST` to a fixed IP.
- `backend/.env.example`'s Host & TLS note points at the installer's behaviour.

### Verification

Run live on this Windows machine against a package built by `package.ps1`:

- **Generate path:** `install.ps1 -SkipServiceInstall` with `HOST=10.10.110.31`
  and cert paths in an empty folder → certificate written with
  `Subject CN=10.10.110.31`, SAN `IP Address=10.10.110.31, DNS Name=<host>,
  DNS Name=localhost, IP Address=127.0.0.1`, EKU Server Authentication, expiry
  2031-09-07. `node https.createServer({key,cert})` loaded the pair, completed a
  TLS handshake, and answered `GET /api/health` with `200`. Private-key file
  ACL confirmed `SYSTEM` + `Administrators` read-only.
- **Keep path:** a second `install.ps1 -SkipServiceInstall` reported
  "Certificate present … Left exactly as-is"; both file hashes unchanged.
- **Standalone:** the DER-writer + `CertificateRequest` sequence exercised in
  isolation first, with a byte-level check of the emitted PEM.

**Not verified:** NSSM service registration/start and the post-start health
check (steps 8–9) — NSSM is not installed on this development laptop, unchanged
from §65. The certificate the service would load has been verified through Node
directly.

Quality gate: backend `tsc --noEmit` clean + 58/58 Vitest; frontend `tsc -b`
clean + 124/124 Vitest; `oxlint` 0 errors. `install.ps1` and `package.ps1`
pass a PowerShell parser check.

**Database migration:** none. PowerShell installer and documentation only — no
schema change, no `prisma db push`, no migration added or modified, no
application code touched, `dev.db` untouched.

---

## 67. NSSM service wrapper bundled into the installer package — 2026-09-07

§65's installer treated NSSM (the tool that runs the app as a Windows service)
as a prerequisite Hakim had to download from nssm.cc and either put on PATH or
point at with `-NssmPath`. That is an avoidable manual step, and it made the
happy path depend on nssm.cc being reachable during the trial install (it threw
connection resets twice during this session's research). NSSM is ~360 KB and
public domain, so it now ships inside the package.

### The binary and how it was vetted

`install/tools/nssm.exe` — **NSSM 2.24-101-g897c7ad, win64, 2017-04-26**.

Not the last tagged stable release (2.24, from 2014): nssm.cc's own download
page tells "Windows 10 Creators Update or newer" users to take this pre-release
instead, because 2.24 has service-startup failures on modern Windows — which is
every OS this app deploys on. 2.24-101-g897c7ad is also the build the Chocolatey
`nssm` package ships, which is what makes an independent checksum cross-check
possible.

nssm.cc publishes **no** SHA256 and **no** code signature (NSSM binaries are not
Authenticode signed). It does publish a SHA1 per download. Verification before
committing the binary was therefore a cross-check of a fresh HTTPS download
against two independent sources:

| Artefact | Hash | Cross-checked against |
|---|---|---|
| `nssm-2.24-101-g897c7ad.zip` | SHA1 `ca2f6782a05af85facf9b620e047b01271edd11d` | the hash printed on nssm.cc/download — exact match |
| same zip | SHA256 `99f5045fffbffb745d67fe3a065a953c4a3d9c253b868892d9b685b0ee7d07b8` | Chocolatey `nssm` package `checksum64` (moderator-reviewed, years-stable) — exact match |
| `win64/nssm.exe` extracted | **SHA256 `eee9c44c29c2be011f1f1e43bb8c3fca888cb81053022ec5a0060035de16d848`** | recomputed with both `sha256sum` and PowerShell `Get-FileHash`; PE version resource reads CompanyName "Iain Patterson" / ProductName "NSSM 64-bit" / "Public Domain … 2003-2017"; `nssm.exe version` prints `NSSM 2.24-101-g897c7ad 64-bit`; grep of the binary for `AI_RULES` / `Antigravity` / `Co-Authored-By` / `claude` / `anthropic` → nothing |

The full provenance record ships alongside the binary at
`install/tools/README-nssm.txt`, so a customer security review has it on hand.

### `install.ps1` STEP 1

Resolution order for `$NssmPath`:

1. An explicit `-NssmPath` wins (fails fast if that path does not exist).
2. Otherwise `install\tools\nssm.exe`, **only if its SHA256 matches the value
   pinned in the script** (`EEE9C44C…`). A mismatch prints expected-vs-actual
   and falls through — a binary that fails verification is never executed.
3. Otherwise `nssm` on PATH.
4. Otherwise `Fail 'NSSM is not available.'` telling the operator to re-copy the
   package or supply `-NssmPath`.

The success line names which source was used, e.g.
`[ OK ]  NSSM (bundled, SHA256 verified): …\install\tools\nssm.exe`.

### `package.ps1`

- `install/tools/nssm.exe` added to `$RequiredPaths` — a missing bundled binary
  now fails the package build.
- `.exe` added to `$BinaryExtensions` so the forbidden-string scan skips it (a
  `Select-String` pass over a 360 KB binary is slow and meaningless); its
  integrity is covered by the SHA256 pin instead.
- New verify step: the packaged `install/tools/nssm.exe` SHA256 is checked
  against `$NssmExeSha256` (same value as install.ps1), so a corrupted or
  swapped binary fails the build, not just the customer install.
- Nothing prunes `install/tools/` — it is under `install/`, which is payload.

### Docs

`install/README.txt`: NSSM removed from "BEFORE YOU START" (now one prerequisite,
Node.js); a note explains it ships in the package and `-NssmPath` overrides it;
STEP 4 and the troubleshooting entry updated. install.ps1 header / `.PARAMETER
NssmPath` updated to match.

### Verification

- `package.ps1` run to a clean pass: `install/tools/nssm.exe` present in the
  output, SHA256 matches the pin, forbidden-string scan skips it, required-paths
  check passes. Independent post-build audit (case-insensitive grep of the whole
  package for AI-tooling strings) still clean.
- `install.ps1 -SkipServiceInstall` against the built package: STEP 1 reports
  `NSSM (bundled, SHA256 verified)`.
- `-NssmPath` override honoured; a tampered/renamed bundled binary falls through
  to PATH / the loud failure as designed.
- `nssm.exe version` runs on this x64 host.
- Quality gate: backend `tsc` + 58/58, frontend `tsc` + 124/124, `oxlint` 0
  errors; both `.ps1` pass a parser check.

**Not verified:** NSSM service registration/start (steps 8–9) — the bundled
binary is confirmed to run and to be selected, but a real service install still
needs an elevated run on a server, unchanged from §65/§66.

**Database migration:** none. A vendored binary, PowerShell, and documentation —
no schema change, no `prisma db push`, no migration, no application code, `dev.db`
untouched.

---

## 68. Installer review fixes: HOST-aware health check and service management commands — 2026-09-11

A final review of the §63-§67 installer arc found a real trial-blocker plus two
smaller rough edges, all from the same root cause: pieces of `install.ps1`
assumed the server always answers on `localhost`, or that `nssm` is always on
PATH, and §66/§67 quietly made both assumptions false on the recommended setup.

**The trial-blocker.** STEP 9's health check hit `https://localhost:$Port`
unconditionally, but `server.ts` binds to `HOST` verbatim, and §66's own
guidance tells the operator to set `HOST` to the server's fixed IP so the
certificate matches it. A specific `HOST` binds ONLY that interface — not
loopback too. Reproduced live: with `HOST=10.10.110.31`, `netstat` showed
`TCP 10.10.110.31:4009 LISTENING`, and both `https://localhost:4009` and
`https://127.0.0.1:4009` refused the connection while `https://10.10.110.31:4009`
answered fine. STEP 9 would have looped ten times, then printed
`Fail 'The service is running but is not answering requests.'` — a false
failure, on exactly the setup the installer itself recommends, during the
one run (a trial install) where a clean pass matters most.

**Fix:** one HOST-aware test, computed once right after STEP 2 resolves `HOST`
and `PORT`, and reused everywhere an address is needed:

- `$HostIsSpecific` — true when `HOST` is neither `0.0.0.0`, `::`, empty, nor
  `localhost`.
- `$HealthHost` — the address THIS script probes, on THIS machine, right after
  install: the specific `HOST` when set, else `localhost` (correct, because
  `0.0.0.0` also answers on loopback).
- `$PublicHost` — the address shown to the operator for STAFF to use, from
  other machines: the specific `HOST` when set, else the computer name (NOT
  `localhost`, which would tell every visitor to reach their own PC). Same
  fallback as before this fix, so the unchanged `HOST=0.0.0.0` path is
  unaffected.

STEP 3's certificate-SAN logic had independently reimplemented the same
`HOST`-is-specific test in its own scope — the exact kind of duplication that
let this bug exist in the first place (STEP 9 simply never got a copy of it).
It now reuses `$HostIsSpecific` too, so there is one source of truth for "what
address does this server actually answer on."

**Also fixed, same review pass:**

- `install.ps1`'s closing "Staff open the app at" line and `install/README.txt`
  used the plain `$env:COMPUTERNAME` regardless of `HOST`; now uses
  `$PublicHost`, so the address the operator is told to share always matches
  what the server is actually bound to (and the certificate's CN).
- `install.ps1`'s closing "Managing the service" block and three spots in
  `install/README.txt` (EVERYDAY MANAGEMENT, and the "UPDATING TO A NEWER
  VERSION" stop-the-service step) told the operator to run bare `nssm status` /
  `nssm restart` / `nssm stop` — commands that fail outright since §67 stopped
  putting `nssm.exe` on PATH. Replaced with `services.msc` (right-click
  Start/Stop/Restart, no typing) as the primary suggestion and `sc.exe`
  (built into Windows, no path needed) as the command-line option; NSSM is
  kept as a documented fallback with its real path, `install\tools\nssm.exe`.

**Verification.** Built a package from HEAD, overlaid the fixed `install.ps1`,
and reproduced the original repro exactly: `HOST=10.10.110.31`, boot the built
server as NSSM would (`node --import tsx server.ts`, `cwd` = app root). Ran the
fixed STEP 9 logic against it — `HealthHost` resolved to `10.10.110.31`,
`https://10.10.110.31:4009/api/health` returned `200`, while a control check
against `https://localhost:4009` still failed to connect (confirming this is
the same bug, not an environment quirk, and the fix routes around it). Then
reset `HOST=0.0.0.0` and re-ran: `HealthHost` resolved to `localhost`,
`PublicHost` to the computer name, health check `200` — the unchanged default
path still behaves exactly as before.

Quality gate: backend `tsc --noEmit` clean + 58/58 Vitest; frontend `tsc -b`
clean + 124/124 Vitest; `oxlint` 0 errors; `install.ps1` and `package.ps1`
both pass a PowerShell parser check.

**Not in scope for this pass** (flagged in the review as optional/low-priority):
`INSTALLER_PACKAGE_MANIFEST.md` not mentioning §66/§67 (nothing in it is
incorrect), and `install.ps1`'s `NODE_ENV` check being case-insensitive where
`server.ts`'s is case-sensitive.

**Database migration:** none. `install.ps1` and `install/README.txt` only — no
schema change, no `prisma db push`, no migration, no application code touched,
`dev.db` untouched.
