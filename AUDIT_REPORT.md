# AUDIT_REPORT.md

**Purpose:** Current, still-open findings only — nothing else. This file
exists so a fresh session can read the whole thing in one pass and know
what's actually unresolved, without wading through resolved history.

**For full project history — fixed bugs, resolved design questions,
completed feature builds, and the original write-up behind every item
below — see `CHANGELOG.md`.** It's the permanent, append-only archive;
this file is not. Each item below points to the `CHANGELOG.md` section
with its full original context, reasoning, and verification trail.

**Last split from a combined file:** 2026-08-10, when the original
`AUDIT_REPORT.md` had grown to 3509 lines / 17 sections.
**Trimmed 2026-09-02:** resolved items condensed to short summaries and
accepted-by-design items moved to their own section — full original
prose for every item remains in `CHANGELOG.md` at the pointers given.

---

## Open Items

2. **Real defect taxonomy seeded for `prof_default` only.** MEDLINE,
   CARDINAL, and HENRY SCHEIN profiles still hold placeholder/demo defect
   content, not the real 47-defect taxonomy. No action possible until
   real taxonomy data is available.
   → `CHANGELOG.md` §12 (intro), §7.6/§7.7.

3. **30 of 47 seeded defects' Visual-tier assignments are an unconfirmed
   working draft.** Assigned from a 2021 leftover spreadsheet template
   and, for 5 defects, reasoning alone with no data backing. No action
   possible until real QA input is available.
   → `CHANGELOG.md` §12.8.

13. **A brand-new install's zero-state default profile is code-level, not
    admin-editable.** `HARDCODED_DEFAULT_PROFILE` (`resolveVerdict.ts`) is
    baked into backend source, used only as the very-first-run fallback
    before an admin sets up a real profile. Low-stakes; largely superseded
    by the single-tenant-per-deployment correction. No fix scheduled.
    → `CHANGELOG.md` §5.4, §9.2.

24. **Pre-launch checklist item — dev-tools wipe, not an active fix.** A
    dev-only "Delete All Submissions" tool (`DELETE
    /api/dev/submissions/all`, `/dev-tools`) exists for test-data cleanup.
    Both production gates verified live (backend 404s under
    `NODE_ENV=production`; frontend dead-code-eliminates the page).
    **Decision 2026-09-02 (Jerry):** stays gated and in active use during
    development; not to be touched now. Before go-live: manually confirm
    deployment `NODE_ENV=production`, and decide delete-outright vs.
    keep-gated.
    → `CHANGELOG.md` §24.

---

## Resolved (summary — full detail in CHANGELOG.md)

43. **RESOLVED 2026-09-06 — two passes** (`1942ee1`, superseded by
    `a30e394`). The `ADD CATEGORY` / `ADD DEFECT` string was reused
    for distinct actions. The **first pass** (`1942ee1`, `CHANGELOG.md`
    §52) renamed the two picker modal titles to `SELECT …` on the premise
    that the §3.5 header buttons "genuinely create a new global entry".
    Post-fix discovery showed that premise was wrong: the header buttons
    only **open** `RegistryManagerModal` — they create nothing themselves —
    and the wider Category/Defect vocabulary was inconsistent in more
    places than the titles (`Adopt` vs `Add`, `REGISTER` vs `REGISTER
    NEW`, `CHOOSE` vs `SELECT`). The **second pass** (`a30e394`,
    `CHANGELOG.md` §53) finalises one vocabulary across both flows:
    **MANAGE** (`MANAGE CATEGORIES` / `MANAGE DEFECTS` header buttons —
    open the registry view, no create/attach), **REGISTER** (`REGISTER
    CATEGORY` / `REGISTER DEFECT` — the create-a-new-global-entry action,
    identical whether reached in `RegistryManagerModal` or via a picker's
    handoff; the picker buttons dropped the `NEW`), and **ADD** (`ADD
    CATEGORY` / `ADD DEFECT` picker titles, `+ ADD` dashed openers, per-row
    / confirm / footer text — attach an existing registry entry to the
    active profile). `UI_DESIGN_SYSTEM.md` §3.5 rewritten to the three-way
    model. Identifiers `handleAdoptCategory` / `CategoryAdoption` /
    `handlePickDefect` intentionally not renamed. Frontend 113/113 +
    backend 58/58; `tsc -b` / `oxlint` clean.
    → `CHANGELOG.md` §53 (supersedes §52).

37. **RESOLVED 2026-09-05** (`dd27e5d`, `ac5a44a`, `1b4dbe2` + three
    `chore(dev.db)` checkpoints). Two dead/dying `AppConfig` JSON column
    groups — `aqlCategories`/`defectDefinitions` and `productCodes`/
    `productMatrixConfig`/`productProfileMap` — frozen then dropped from the
    schema in three stages (27 → 24 → 22 surviving columns), rollback-tagged
    each time. API contract unchanged; 88/88 regression byte-identical at
    every stage. Triggered the six-core-doc audit pass (#38).
    → `CHANGELOG.md` §49.

38. **RESOLVED 2026-09-05** (`e451494`). Docs-audit pass on the six core
    reference docs, triggered by #37's column drops. `API_AND_INTEGRATION_SPEC.md`,
    `DATA_SCHEMAS_AND_TYPES.md`, and `ISO2859_MATH_ENGINE.md` corrected for two
    already-completed migrations (profile identity onto the `Profile` table;
    `DefectDefinition` strict `categoryId` link). Three ambiguous items were
    flagged, not fixed — closed separately as #39/#40/#41.
    → `CHANGELOG.md` §50 (and §47 for #39/#40/#41).

39. **RESOLVED 2026-09-05** (`f646211`). Jerry decided both sub-issues the
    #38 pass flagged; `AI_RULES.md` §3 (Plan/Execute Mode mechanics — dropped
    the wrong Antigravity-retirement blockquote) and §4 (batched multi-file
    turns replace "one file per turn") rewritten to match current practice.
    → `CHANGELOG.md` §47.

40. **RESOLVED 2026-09-05** (`af104d5`). `NAVIGATION_AND_RBAC.md` §3.1's dev
    redirect URI corrected `http://` → `https://localhost:4001` against the
    actual Azure Portal App Registration, and the previously-undocumented
    `https://10.10.110.31:4001` LAN URI added. Cross-checked against live
    `EnvironmentInfoPanel.tsx` / `vite.config.ts`.
    → `CHANGELOG.md` §47.

41. **RESOLVED 2026-09-05** (`006e676`). Nine live endpoints absent from
    `API_AND_INTEGRATION_SPEC.md` written up (access-log, the M365 admin CRUD
    surface, `DELETE /api/dev/submissions/all`); eight also added to
    `NAVIGATION_AND_RBAC.md` §5.1's session-gate table. `GET /api/access-log`
    was already in that table — the original flag was wrong on that one point.
    → `CHANGELOG.md` §47.

42. **RESOLVED 2026-09-05** (`127267f`, `7952b4b`, `14ff794`). The amendment
    diff view compared only raw `{defectId: count}` and so hid category-
    membership changes caused by a profile switch (a defect moving into a
    graded category, or orphaning entirely, with no count change).
    `AmendmentDiffView.tsx` now badges `moved`/`evalModeChanged`/`orphaned`
    cases; `evaluateAQLVerdict()` warns on a defect matching no category.
    Grading unchanged (88/88 byte-identical); verified against the real
    `A001A6247003` amendment, read-only.
    → `CHANGELOG.md` §51.

20. **RESOLVED 2026-09-02 — live-verified by Jerry** (`75b93fd`). Root
    cause was not a missing feature: `PAGE_SIZE = 50` exceeded the actual
    row count (21 pending amendments), so the server correctly returned
    `hasMore: false` and the button correctly hid itself. Dropped
    `ApprovalsQueue.tsx`'s `PAGE_SIZE` to 10; confirmed live — Load More
    fetches and appends across pages with no dupes/skips, button hides
    once exhausted.

36. **RESOLVED 2026-09-02 — live-verified by Jerry** (`75b93fd`). Same
    root cause as #20 (26 total submissions < `PAGE_SIZE = 50`). Dropped
    `HistoryFeed.tsx`'s `PAGE_SIZE` to 10 (`EXPORT_PAGE_SIZE = 200` left
    untouched — CSV export still pulls the full set). Confirmed live —
    Load More works correctly and export is unaffected.

19. **RESOLVED 2026-09-02 — live-verified by Jerry.** Product Engine
    multi-expand (commit `fc0983e`) confirmed good in a real browser:
    multiple rows stay independently expanded, and collapsing one leaves
    the others untouched.

21. **RESOLVED 2026-09-02 — live-verified by Jerry.** Graded/Record-only
    dimension mode toggle (cycling Ruler/Eye/EyeOff) and the merged Edit/
    Rename identity sub-panel both confirmed good together in a real
    browser — no stale label, no conflicting state.

8. **RESOLVED 2026-09-02** (`18e9df5`). Stale `test_post.js` (mismatched
   `batchNumber` format) deleted — confirmed unused anywhere in the repo.
   → `CHANGELOG.md` §15.

10. **RESOLVED 2026-09-01** (`0ea09a1`). Three hand-maintained default-
    profile seeds (BARRIER/PACKAGING `evaluationMode`) disagreed. Replaced
    with one canonical `backend/src/engine/defaultProfileSeed.ts`; the
    frontend mirror is machine-enforced via a sync test that fails CI on
    drift. Backend grading confirmed byte-identical to before.
    → `CHANGELOG.md` §3.B3.

11. **RESOLVED 2026-09-02 — not a bug.** Confirmed deliberate: an
    unrecognized explicit `profileId` 404s on `POST /api/submissions`
    (permanent record, fail loud) but degrades gracefully on `/api/
    verdict/preview` (disposable). Documented in
    `API_AND_INTEGRATION_SPEC.md` (`f1ee49b`).
    → `CHANGELOG.md` §3.B6.

12. **RESOLVED 2026-09-02** (`b7d935a`). `BatchEntry.tsx:877`'s stray
    `red-500` → `rose-500` token fix; confirmed the only occurrence.
    `DevToolsPage.tsx`'s raw `red-*` tokens remain out of scope, tied to
    #24.
    → `CHANGELOG.md` §3.B8.

14. **RESOLVED 2026-09-02 — live-verified by Jerry.** FAIL path was already
    proven (submission `cmtjgvxps0001eoc4e5ji6vtv` — `qualitativeState`,
    `totalDefectTypes`, and lot verdict all froze). The remaining gap — no
    multi-defect qualitative category existed to observe a PASS sibling —
    was closed by adding a second defect type (**Odour**) to
    `prof_default`'s OTHERS category; a real PIN submission (Jason Tan) then
    recorded Donning = PASS + Odour = FAIL in OTHERS. Panel live-verified:
    header "1 of 2 failed", only the Odour FAIL chip shown (PASS counted in
    the denominator, not rendered as a chip, per the locked spec), category
    verdict FAIL. PASS and FAIL qualitative states now both confirmed to
    freeze and render in a live `gradingSnapshot`.
    → `CHANGELOG.md` §14, §35, §41.

15. **RESOLVED 2026-09-01.** Amendment discard-guard's dirty-check
    reworked to key off an explicit `sequenceTouched` flag instead of
    relying on `sequenceNo` having no auto-population path; dependency
    documented inline in `wizardDirty.ts`.
    → `CHANGELOG.md` §15 (design note).

16. **RESOLVED 2026-09-02.** Documented in `AI_RULES.md` §7 "PRISMA /
    DATABASE WORKFLOW": `prisma db push` only (never `migrate dev`), and
    `prisma generate` must be run manually after every `db push`.
    → `CHANGELOG.md` §5.2 (original context).

17. **RESOLVED 2026-09-01** (`0ea09a1`, same build as #10).
    `getResolvedProfile()`'s silent `evalMode: 'CUMULATIVE'` substitution
    fixed in three parts: tags unset categories `evalModeUnset: true`
    instead of silently substituting; `PATCH /api/config` hard-rejects any
    category with no evaluation mode; `QualityRules.tsx` shows an amber
    **NOT SET** badge. `''` (RECORD ONLY) correctly never treated as
    unset.
    → `CHANGELOG.md` §17 (original finding).

18. **RESOLVED 2026-09-01.** `Submission.gradingSnapshot` now freezes a
    self-contained `FrozenCategoryAnalysis` at submit/amendment-approval
    time; `HistoryFeed.tsx` renders it directly, so the badge and expanded
    breakdown can no longer disagree for new/amended submissions.
    Accepted caveat: legacy pre-snapshot rows still live re-grade, but now
    show an explicit drift banner.
    → `CHANGELOG.md` §18.1 (original finding).

22. **RESOLVED 2026-08-25.** `StepReviewSubmit.tsx`'s pre-submit Category
    Breakdown table now includes RECORD ONLY categories (synthesized
    client-side row when the engine's true-exclusion skip omits them).
    KPI total confirmed unaffected. Verified via Vitest browser-mode
    regression test.
    → `CHANGELOG.md` §22 (original finding).

23. **RESOLVED 2026-08-26.** Stale dimension state on product switch
    fixed — `WizardPage.tsx`'s `handleUpdate` now strips dimension state
    when `productCode`/`size` changes, forcing a fresh reseed. Live-
    verified across all 4 structural variants in current config, including
    the one RECORD-ONLY-dimension product.

25. **RESOLVED 2026-09-02** (`547f5e2`, dev.db data-only). `N035MNV-
    OC-24FT`'s swapped cuff/finger `dimensionDefs` ids corrected in place
    (2 unaffected test submissions deleted first). Found in both
    `AppConfig.products` and legacy `productMatrixConfig`; both fixed.
    Live-verified via PIN kiosk wizard.

26. **RESOLVED 2026-09-02.** Doc passes completed for the Weight/Length/
    Palm Width/Cuff/Palm/Finger unification build:
    `DATA_SCHEMAS_AND_TYPES.md` §3 documents `lengthIsGraded`/
    `palmWidthIsGraded` + the deliberate absence of `weightIsGraded`;
    `ISO2859_MATH_ENGINE.md` §5 documents `evaluateWeight()` and the Cuff/
    Palm/Finger permanent-slot rule.

27. **RESOLVED 2026-09-02** (`UI_DESIGN_SYSTEM.md` half was 2026-08-26).
    Doc passes completed for the wizard-visibility (OFF/RECORD ONLY/
    GRADED) build: `UI_DESIGN_SYSTEM.md` §4.14 documents the
    `DimensionModeCycle` control; `DATA_SCHEMAS_AND_TYPES.md` §3 now
    documents `wizardVisible` fields and confirms independence from
    `isGraded`.

28. **RESOLVED 2026-08-26.** `UI_DESIGN_SYSTEM.md` §1.3 now documents the
    dimension field label convention (permanent vs. optional fields,
    weight/opacity, no `font-mono`).

29. **RESOLVED 2026-09-01** (`347549f`). AQL vocabulary asymmetry resolved
    by narrowing the Actual AQL ladder to the 6 assignable levels (new
    `ACHIEVABLE_AQL_LEVELS`); `EXCEEDS_ALL` now uses `'6.5'`'s Ac/Re.
    `SUPPORTED_AQL_LEVELS` (all 7) and the matrix's `'10'` columns
    deliberately kept for direct-assignment lookups. Guarded by
    `findActualAqlAchieved.test.ts`.
    → `CHANGELOG.md` §35.

33. **RESOLVED 2026-09-02** (`45bf502`). Direct engine coverage added for
    `evaluateAQLVerdict()` (9 tests, `evaluateAQLVerdict.test.ts`) —
    confirmed independent per-defect-type GRANULAR evaluation and RECORD
    ONLY exclusion. Pure coverage gap; no engine bug found.

---

## Accepted Decisions (documented behavior, no action pending)

- **#30** — N/A-mode (qualitative) categories carry no Actual AQL by
  design; an explicit `QUALITATIVE` state is recorded instead of
  fabricating an AQL level from a state code.
  → `CHANGELOG.md` §35.

- **#31** — Dimension section display NAME/unit resolve against current
  `dimensionDefs`, not frozen at submit time (the measured/spec data
  itself IS frozen). Accepted; revisit only if a real historical-accuracy
  complaint surfaces.
  → `CHANGELOG.md` §36.

- **#32** — Raw defect-id chips (e.g. `def_hole`) and the per-defect-type
  pill's name text are deliberately exempt from `UI_DESIGN_SYSTEM.md`
  §4.8A's "uppercase" rule — legibility (`DEF_HOLE`/`HOLE` would be worse)
  and consistency with how defect names render everywhere else.
  → `CHANGELOG.md` §37.

- **#34** — `StepReviewSubmit.tsx`'s "Total Defects Recorded" KPI folds
  N/A fail-counts into the tally (same FAIL-count-not-quantity semantics
  as #22's fixed per-category display). Guarded by a regression test that
  keeps it server-verdict-derived; intentionally left as-is.

- **#35** — All 5 accent-color presets (Cobalt/Emerald/Violet/Amber/Rose)
  verified end-to-end 2026-09-02, including Analytics chart theming via
  the shared `resolveAccentPair()` source of truth. No bug found;
  verification test created, run, and removed — no code change.
