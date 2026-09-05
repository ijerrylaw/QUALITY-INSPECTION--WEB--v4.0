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

39. **Flagged, not resolved — AI_RULES.md §3/§4 process-rule ambiguity.**
    Surfaced during the #38 docs-audit pass; deliberately not corrected
    unilaterally since it's a judgment call about how work should proceed,
    not a factual staleness.
    - §3 ("WORKSPACE EXECUTION MODES") sits under a blockquote framing the
      whole section as historical/Antigravity-only ("retained for historical
      context only"), but its content ("Plan Mode... Claude will outline the
      strategy and request approval") describes a mode Claude Code also has —
      unclear whether §3 means to describe Claude Code's actual current Plan
      Mode or is purely a historical Antigravity artifact.
    - §4's "One Complete File per Turn" and "explicitly request user approval
      before proceeding to the next turn or file" do not match observed
      practice across this and recent sessions (multi-file batched edits per
      turn, approval gates only at genuinely irreversible steps like a schema
      drop, not after every file). Needs Jerry's call on whether §4 should be
      updated to match actual practice or whether practice should tighten to
      match §4.

40. **Flagged, not resolved — Entra redirect URI protocol mismatch.**
    `NAVIGATION_AND_RBAC.md` §3.1 documents the dev Redirect URI as
    `http://localhost:4001`, but `frontend/vite.config.ts` serves the dev
    server over HTTPS only (mkcert cert, `https: httpsOptions`) — confirmed
    2026-09-05. Entra does exempt `http://localhost` redirect URIs from its
    HTTPS requirement, so this may be exactly what's registered in the Entra
    App Registration and simply correct; verifying that requires checking the
    actual Azure Portal registration, an external fact this session can't
    confirm from the codebase alone. Not corrected — needs Jerry (or whoever
    has Entra admin access) to confirm the registered value.

41. **Flagged, not resolved — endpoint documentation coverage gap.**
    Surfaced during the #38 docs-audit pass. Three groups of real, live
    endpoints are absent from `API_AND_INTEGRATION_SPEC.md`'s "REST API
    ENDPOINTS" section and from `NAVIGATION_AND_RBAC.md` §5.1's session-gate
    table: `GET /api/access-log`; the full M365 admin CRUD surface
    (`GET/PATCH/DELETE /api/m365-users`, `POST /api/m365-users/invite`,
    `PATCH /api/m365-users/:id/deactivate`/`reactivate`,
    `POST /api/auth/claim-bootstrap-admin`); and the dev-tools routes
    (`DELETE /api/dev/submissions/all` et al., #24 above). Not a stale
    reference — nothing false is claimed, these routes are simply never
    written up — so left as a to-do rather than authored unilaterally
    (writing accurate, complete endpoint docs for ~9 routes is a distinct,
    larger task than correcting existing prose).

---

## Resolved (summary — full detail in CHANGELOG.md)

37. **RESOLVED 2026-09-05** (`dd27e5d`, `ac5a44a`, `1b4dbe2` + three
    `chore(dev.db)` checkpoints). Discovery found two independent
    dead/dying groups of `AppConfig` JSON columns: `aqlCategories`/
    `defectDefinitions` (written every PATCH, never meaningfully read —
    every real reader consumes the per-profile nested field reconstructed
    from the Master Defect List registry instead) and `productCodes`/
    `productMatrixConfig`/`productProfileMap` (writes already frozen at B6;
    read only by `resolveProductRegistry()`'s unmigrated-database fallback).
    Fixed in three stages, same shape as the `inspectionProfiles` Stage A/B
    arc:
    - **Part 1** — dropped `aqlCategories`/`defectDefinitions` from
      `config.routes.ts`'s `JSON_FIELDS`. Columns left in place, frozen (both
      already `"[]"`); their schema-column drop deferred to a separately-scoped
      future stage. Live PATCH proof against an isolated `dev.db` copy: a
      poisoned payload for both fields left the stored columns byte-identical
      while the real per-profile reconstruction (registry-backed) was
      unaffected.
    - **Part 2** — confirmed the unmigrated-database fallback in
      `resolveProductRegistry()` (`productEntry.ts`) was no longer needed
      (every live deployment had migrated onto `AppConfig.products`),
      removed it, and dropped all three legacy columns via `prisma db push
      --accept-data-loss` (27 → 24 surviving `AppConfig` columns). Rollback
      tag `pre-appconfig-legacy-cleanup` pushed beforehand.
    - **Stage B** (2026-09-05, same-day follow-up) — the Part 1 deferral
      came due: re-confirmed via a fresh full-codebase grep (not reusing the
      Part 1 evidence) that `aqlCategories`/`defectDefinitions` still had zero
      real reads, then dropped both columns the same way (24 → 22 surviving
      `AppConfig` columns). `formatAppConfig()`'s GET projection — the one
      remaining column-shaped read, since it echoed the columns back in the
      response — now hardcodes `[]` instead (the value it always produced).
      Rollback tag `pre-aqlcategories-defectdefinitions-column-drop` pushed
      beforehand.
    API contract unchanged throughout every stage — `PATCH`/`GET /api/config`
    still accept/return all five field names; only storage moved, then
    disappeared. Verification (each stage): 88/88 regression cases
    byte-identical, proven twice for every schema drop (frozen pre-drop copy
    and live post-drop `dev.db`); backend tsc + 20/20 tests, frontend tsc +
    74/74 tests, oxlint 0 errors; `PRAGMA integrity_check`/`foreign_key_check`
    clean; zero remaining references to the dropped fields in the regenerated
    Prisma client. Doc corrections: `schema.prisma` tombstone comments for
    both groups (disambiguated from the unrelated, earlier `inspectionProfiles`
    "Stage B"), `DATA_SCHEMAS_AND_TYPES.md` §3.1's now-false fallback claim
    corrected. See #38 for the follow-up docs-audit pass this closure
    triggered across the six core reference docs.

38. **RESOLVED 2026-09-05** (`e451494`). Docs-audit pass on all six core
    reference docs (`AI_RULES.md`, `API_AND_INTEGRATION_SPEC.md`,
    `DATA_SCHEMAS_AND_TYPES.md`, `ISO2859_MATH_ENGINE.md`,
    `NAVIGATION_AND_RBAC.md`, `UI_DESIGN_SYSTEM.md`), triggered by #37's
    column drops. Root cause of everything found: two already-completed
    migrations whose downstream doc references were never updated — profile
    identity moving off `AppConfig.inspectionProfiles` JSON onto the `Profile`
    table (Stage A0, then the column dropped entirely at Stage B), and
    `DefectDefinition` dropping `currentClass`/`defaultClass` for a strict
    `categoryId` link at the Master Defect List Stage 2 engine cutover.
    Three of six docs needed correction:
    - `API_AND_INTEGRATION_SPEC.md` — `POST /api/submissions`'s profileId
      sanity-check/404 paths renamed from `AppConfig.inspectionProfiles` to
      the `Profile` table; the registry section's stale "until Stage 4
      replaces it" note updated to reflect that Stage 4's pickers shipped
      without changing the write mechanism.
    - `DATA_SCHEMAS_AND_TYPES.md` — the largest correction. §2.1 rewritten:
      no JSON column exists, the documented interfaces are a pure wire
      contract (PATCH payload / GET response shape), `currentClass`/
      `defaultClass` are gone from both the engine and the reconstructed
      response. §2.2 had an internal contradiction with its own later
      "As-migrated state" section — two stale "profile identity is still on
      the JSON side" claims corrected to match. §1/§3 storage comments
      corrected to match §3.1's already-accurate account.
    - `ISO2859_MATH_ENGINE.md` — two lines repeating the same stale
      profile-identity claim, corrected.
    `AI_RULES.md`, `NAVIGATION_AND_RBAC.md`, `UI_DESIGN_SYSTEM.md` had nothing
    in scope to correct (the first two had content worth flagging instead —
    see #39/#40/#41 — the third is pure CSS/styling convention, unrelated to
    the schema-cleanup arc). Per the task's brief, ambiguous or contested
    content was flagged rather than resolved unilaterally — see #39
    (AI_RULES.md process-rule ambiguity), #40 (Entra redirect URI protocol
    question), #41 (endpoint documentation coverage gap).

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
