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
`AUDIT_REPORT.md` had grown to 3509 lines / 17 sections. See
`CHANGELOG.md`'s header for the archival note.

---

## Open Items

2. **Real defect taxonomy seeded for `prof_default` only.** MEDLINE,
   CARDINAL, and HENRY SCHEIN profiles still hold placeholder/demo defect
   content, not the real 47-defect taxonomy.
   → `CHANGELOG.md` §12 (intro), §7.6/§7.7 (original gap).

3. **30 of 47 seeded defects' Visual-tier assignments are an unconfirmed
   working draft.** Assigned from a 2021 leftover spreadsheet template
   and, for 5 defects, reasoning alone with no data backing at all —
   expected to be revisited once real QA input is available.
   → `CHANGELOG.md` §12.8.

8. **RESOLVED 2026-09-02** (commit `18e9df5`). ~~`test_post.js`'s hardcoded
   `batchNumber` is stale — no longer matches the real
   `[Line][Side][YJJJ][Sequence]` lot-number format. Inert manual script
   (not wired into any npm script or CI), candidate for deletion or
   updating.~~ Deleted rather than updated, per Jerry's decision. Confirmed
   beforehand that nothing referenced it (no npm script, no CI config —
   there is no `.github/workflows`, and no import/require anywhere in the
   repo). Typecheck + lint + full frontend test suite (59) green after
   removal.
   → `CHANGELOG.md` §15.

10. **RESOLVED 2026-09-01** (commit `0ea09a1`). ~~Three independently-maintained
    "default profile" seeds disagree on BARRIER's `evaluationMode`; PACKAGING
    drift isolated to one of them.~~ ~~The backend's `HARDCODED_DEFAULT_PROFILE`
    (`resolveVerdict.ts`) sets `CUMULATIVE` for BARRIER / `''` for
    PACKAGING; the frontend's separate hardcoded fallback
    (`ConfigContext.tsx`) sets `'N/A'` for both.~~

    **Fix — one canonical seed, machine-enforced.** The three hand-written
    copies were replaced by a single source of truth,
    `backend/src/engine/defaultProfileSeed.ts`, which all three consumers now
    derive from instead of restating:
    - `resolveVerdict.ts`'s `HARDCODED_DEFAULT_PROFILE`
    - `ConfigContext.tsx`'s zero-profile fallback (BARRIER `'N/A'` → `CUMULATIVE`)
    - `QualityRules.tsx`'s `defaultProfiles` seed (BARRIER *and* PACKAGING
      `'N/A'` → canonical)

    Canonical per-category values, which stay INDEPENDENT of each other rather
    than one blanket default: BARRIER `CUMULATIVE` (the actual #10
    disagreement — a numeric zero-tolerance AND category, never `'N/A'`),
    CRITICAL/MAJOR `CUMULATIVE`, MINOR `GRANULAR`, PACKAGING `''` (preserving
    the 2026-08-25 true-exclusion fix intact). Only field-name adaptation
    (`aqlLevel`/`evaluationMode` vs `aql`/`evalMode` vs `currentClass`) stays
    local to each consumer.

    **Why it's a mirror, not a shared import.** The frontend cannot import from
    `backend/` — `frontend/tsconfig.app.json` is `include: ["src"]` with no path
    aliases, which is why ~30 other constants in this codebase are hand-mirrored.
    `frontend/src/lib/defaultProfileSeed.ts` is therefore a deliberate mirror.
    **Unlike every other mirror in the codebase, this pair is machine-enforced:**
    `frontend/src/lib/__tests__/defaultProfileSeed.sync.test.ts` imports BOTH
    halves (Vitest resolves through Vite, so a test can cross the boundary even
    though application code cannot) and asserts deep equality — so a recurrence
    of this exact finding fails CI instead of shipping silently. Verified by
    injecting the original BARRIER→`'N/A'` drift and confirming the test goes red.

    **Backend grading is byte-identical to before** — the derived profile was
    asserted deep-equal to the pre-change inline literal, categories and defect
    definitions both. No submission grades differently; #18's frozen
    `gradingSnapshot` rows are untouched.

    ---

    *Historical context retained below.*

    **PACKAGING half fixed 2026-08-25** (RECORD ONLY build): `ConfigContext.tsx`'s
    fallback now sets `''` for PACKAGING too, matching `resolveVerdict.ts` —
    both fallbacks now genuinely skip it via `aqlEvaluator.ts`'s true-exclusion
    path instead of only the backend one doing so. **Still open:**
    - **BARRIER still disagrees** — `resolveVerdict.ts` sets `CUMULATIVE`
      (correct: BARRIER is a numeric zero-tolerance AND category), while
      `ConfigContext.tsx` still sets `'N/A'` (wrong: `'N/A'` means qualitative
      state-encoded, not zero-tolerance-count — see `aqlEvaluator.ts`'s N/A
      branch). Not touched by this build — out of scope for the RECORD ONLY
      task, which only named the PACKAGING line. Same reachability caveat as
      below (zero-usable-profile state only).
    - **A third, previously-undocumented copy of this exact fallback exists**:
      `QualityRules.tsx`'s local `defaultProfiles` (~line 90-101, the
      Quality Rules admin screen's own initial-state seed, used when
      `config.inspectionProfiles` is empty). It carries the *same* stale
      pattern as the old `ConfigContext.tsx` fallback — BARRIER: `'N/A'`,
      PACKAGING: `'N/A'` (not fixed as part of this build; not explicitly
      in scope). Unlike `ConfigContext.tsx`'s fallback (display-only, never
      sent to the backend), this one is a real editable admin form's seed —
      if an admin opens Quality Rules on a zero-profile install and hits
      Save without touching BARRIER/PACKAGING, this stale `'N/A'` pair gets
      persisted into `AppConfig.inspectionProfiles` for real, at which point
      it stops being a "fallback" and becomes the live profile — a path the
      other two fallbacks don't have.

    **Audit-confirmed 2026-09-01** — the scope that the fix above then closed:
    - **PACKAGING between `resolveVerdict.ts` and `ConfigContext.tsx` was
      already resolved** — both used `''`. That half of the original finding
      was closed by the 2026-08-25 build.
    - **Was remaining (a):** BARRIER was an unchanged three-way split —
      `resolveVerdict.ts` `CUMULATIVE` (correct) / `ConfigContext.tsx`
      `'N/A'` / `QualityRules.tsx` `defaultProfiles` seed `'N/A'`.
    - **Was remaining (b):** PACKAGING was still `'N/A'` *specifically* in the
      `QualityRules.tsx` `defaultProfiles` seed (the third copy), while
      `resolveVerdict.ts` and `ConfigContext.tsx` agreed it should be `''`.

    **Diagnosed 2026-08-11:**
    - **Backend** — `backend/src/engine/resolveVerdict.ts:38-59`
      (`HARDCODED_DEFAULT_PROFILE` const), consumed at two call sites inside
      `resolveVerdict()`: (a) line 385, when an explicit `profileId ===
      'prof_default'` is requested but not found in AppConfig's
      `inspectionProfiles`; (b) lines 420-424, the final safety net when *no*
      AppConfig profile has usable rules at all (`categories.length === 0`
      or none carry both `aqlLevel` and `evaluationMode`). Server-side, runs
      inside verdict computation — shared by all four routes that call
      `resolveVerdict()` (`POST /api/submissions`, `POST
      /api/verdict/preview`, `POST /api/submissions/:id/amendments`, `POST
      /api/amendments/:id/approve`). This is the profile that actually
      grades a submission.
    - **Frontend** — `frontend/src/context/ConfigContext.tsx:291-315`, inside
      `fetchConfig()`. Triggers only when the `GET /api/config` response's
      `inspectionProfiles` array is missing or empty (a genuinely
      zero-profile AppConfig). Injects a display-only profile object into
      React state so the wizard's profile dropdown and category displays are
      never empty. Never sent to the backend for grading — it only shapes
      what the UI shows.
    - **Reachability:** same real-world trigger (a zero-usable-profile
      AppConfig — e.g. a fresh install before any admin-authored profile
      exists), but through two independent layers. In that state, the
      wizard displays the frontend's injected profile (BARRIER/PACKAGING as
      `N/A`, read by UI logic like `StepDefects.tsx`'s `isQualitativeAql()`
      gate — see `CHANGELOG.md` §12.2 — to decide toggle-vs-counter
      rendering) while the user's actual submission is graded server-side
      against the backend's own hardcoded profile (BARRIER as `CUMULATIVE`,
      a quantitative zero-tolerance count). So the same zero-state user flow
      can show one evaluation mode in the UI and grade under a different one
      — reachable together, not just theoretically overlapping.
    - **Read: drift, not deliberate.** `resolveVerdict.ts:27`'s own comment
      states *"Mirrors ConfigContext.tsx getResolvedProfile() fallback"* —
      confirming these two were intended to stay identical. They no longer
      are. Unintentional drift, not two purposefully different behaviors.
    → `CHANGELOG.md` §3.B3 (secondary finding).

11. **RESOLVED 2026-09-02 — not a bug; deliberate behavior confirmed.**
    ~~Confirmed live, 2026-08-10: an unrecognized explicit `profileId`
    still hard-fails `POST /api/submissions` with a `404`, instead of
    degrading gracefully through the fallback chain the way a missing
    `profileId` does.~~

    Jerry confirmed 2026-09-02 that the `404` is **intentional**: a
    submission is a permanent record, so failing loudly on an explicit
    `profileId` that resolves to nothing is preferable to silently grading
    the record against a fallback profile the caller never asked for. The
    asymmetry with `POST /api/verdict/preview` (which degrades a bad
    `profileId` to the safety-net profile and returns `200`) is likewise
    deliberate — preview results are disposable and never persisted, so a
    graceful fallback there costs nothing.

    Re-verified against current source this session (dev server not running;
    curl not re-run, but the code paths are unambiguous):
    `submissions.routes.ts` calls `resolveVerdict()` with the default
    `onUnresolvedProfile: 'throw'`, which raises `VerdictProfileNotFoundError`
    for an explicit id that is neither in `AppConfig.inspectionProfiles` nor
    the `'prof_default'` sentinel; the route catches it, returns `404`, and
    `return`s before any `prisma.submission.create`. `/api/verdict/preview`
    passes `onUnresolvedProfile: 'fallback'`. Absent/empty `profileId` never
    enters the throw path (`if (profileId)` guard in `resolveVerdict`).
    Documented in `API_AND_INTEGRATION_SPEC.md`'s `POST /api/submissions`
    section (commit `f1ee49b`).

    ---

    *Original finding retained below.*

    Verified directly: `curl -X POST
    /api/verdict/preview` with a bogus `profileId` returns `200` and
    falls back to `prof_default` (this endpoint uses `resolveVerdict()`'s
    `'fallback'` mode); the same bogus `profileId` sent to `POST
    /api/submissions` (default `'throw'` mode) returns `404
    {"error":"InspectionProfile '...' not found."}` with no submission
    created. This was an open question at the time of the original
    finding (B6) — now confirmed still true, not superseded by the later
    relational-table removal (§10.3), which changed a different code path
    (what gets persisted to `Submission.profileId`, not `resolveVerdict()`'s
    own unresolved-explicit-id behavior).
    → `CHANGELOG.md` §3.B6.

12. **RESOLVED 2026-09-02** (commit `b7d935a`). ~~Minor color-token drift:
    one live line in `BatchEntry.tsx` uses a non-canonical Tailwind color
    instead of the mandated token.~~ `BatchEntry.tsx:877`'s Remove Lot trash
    button now uses `hover:text-rose-500 hover:bg-rose-500/10` instead of the
    `red-500` pair, per `UI_DESIGN_SYSTEM.md`'s "Danger (Fail)" rule ("use
    `rose-500`/`rose-400` utility classes for component-level failure
    styling"). Confirmed the only `red-*` occurrence in the file; single-line
    change, no logic touched; typecheck + lint + full frontend test suite (59
    tests) green. `DevToolsPage.tsx`'s raw `red-*` tokens remain out of scope
    — tied to item #24's fate.

    ---

    *Original finding retained below.*

    **Narrowed 2026-09-01** after an audit pass confirmed current state:
    - **Was still open:** a single line, `BatchEntry.tsx:877`, uses
      `hover:text-red-500 hover:bg-red-500/10` instead of the mandated
      `rose-500` token.
    - **Resolved:** the former dead-file sub-finding is gone — the
      `components/wizard/*` prototype files were deleted (commits
      `40a81b7` / `735fb20`), and `ConfigDashboard.tsx` now correctly uses
      `rose-400`/`rose-300` only.
    - **New, not-yet-tracked observation (low priority):**
      `DevToolsPage.tsx` uses raw `red-500`/`red-600`/`red-900`/`red-400`
      tokens throughout. It's the dev-only page from item #24 and shares
      that item's fate — if #24 is deleted pre-go-live this drift goes with
      it, so it is not worth a separate fix now.
    (Split off from the former `Badge.tsx` finding — that component's own
    geometry violation is now fixed and resolved, see `CHANGELOG.md`
    §18.6.)
    → `CHANGELOG.md` §3.B8 (original finding).

13. **A brand-new install's zero-state default profile is code-level, not
    admin-editable.** `HARDCODED_DEFAULT_PROFILE` (`resolveVerdict.ts`) is
    baked into backend source and only ever used as the very-first-run
    fallback before an admin sets up a real profile via `QualityRules.tsx`
    — low-stakes remainder of a larger question that was otherwise
    superseded by the single-tenant-per-deployment correction.
    → `CHANGELOG.md` §5.4, §9.2.

14. **PARTIALLY RESOLVED 2026-09-02.** ~~No qualitative (PASS/FAIL/NIL)
    defect category exists on any currently configured profile. This code
    path has zero live test coverage. Flag for manual test pass when a
    profile first adds a qualitative-tier defect to confirm the entire
    verdict chain works end-to-end for this dimension type.~~

    **Premise was already stale + FAIL path now covered end-to-end.**
    `prof_default` in fact already carries a qualitative category — **OTHERS**
    (`evalMode: 'N/A'`, `aql: 'PASS/FAIL'`, one defect "Donning"). The full
    verdict chain was exercised on real data this session:
    - Submission `cmtjgvxps0001eoc4e5ji6vtv` created through the **PIN wizard**
      (Jason Tan / kiosk), `N035MNV-OC-24FT`, with OTHERS → Donning marked
      **FAIL** (plus two GRANULAR VISUALS types independently failed, two
      CUMULATIVE categories, one RECORD ONLY — mixed-mode in one record).
    - Frozen `gradingSnapshot` verified directly (API, not UI): the OTHERS
      category froze `evaluationMode: 'N/A'`, `totalCount: 1`, `passed: false`,
      `actualAqlAchieved.status: 'QUALITATIVE'`, and its `defectItems[]` entry
      carries `qualitativeState: 'FAIL'` — decoded from state code `2` at
      freeze time (`DATA_SCHEMAS_AND_TYPES.md` §AppConfig /
      `ISO2859_MATH_ENGINE.md` §2), not left as a raw state-code number. Lot
      verdict `FAILED` end-to-end.
    - `totalDefectTypes` froze before zero-count filtering (OTHERS 1,
      VISUALS 30) — confirms the #33 / `f66bb99` denominator capture on real
      stored data.
    Backend engine coverage for the GRANULAR/QUALITATIVE grading paths landed
    separately (#33, commit `45bf502`). No engine or schema change — the new
    submission is local test data, committed as a dev.db checkpoint (`14f9cee`).

    **Still open:** the **PASS** and **unrecorded (NIL / state 0)** states for
    a qualitative category have not been observed in a frozen snapshot.
    `prof_default`'s only qualitative category (OTHERS) has a single defect
    type, so no PASS sibling can appear alongside the tested FAIL entry.
    Revisit when a profile configures a multi-defect qualitative category, or
    when a snapshot with a PASS/NIL qualitative entry is otherwise available.

15. **RESOLVED 2026-09-01.** ~~Amendment discard-guard's new-entry
    dirty-check is fragile — anchored to `sequenceNo` being the only field
    with no auto-population path, a hidden dependency a future
    auto-population change elsewhere would silently bypass.~~ The
    new-submission dirty-check in `frontend/src/utils/wizardDirty.ts` was
    reworked to key off an explicit `sequenceTouched` flag (set only on
    real operator input) instead of relying on `sequenceNo` having no
    auto-population path. The dependency — including the later-added
    sequence-hint prefill and the `totalCarton`/`gloveWeight` auto-fill
    paths that are also deliberately not treated as "dirty" — is now
    documented inline with a comment block at the top of the
    new-submission branch (`wizardDirty.ts` ~lines 110-126).

16. **RESOLVED 2026-09-02.** ~~`prisma db push` does not auto-regenerate the
    Prisma client. This has caused integration bugs twice (schema changes
    persisted but client still used old types).~~ Documented in a new
    `AI_RULES.md` §7 "PRISMA / DATABASE WORKFLOW" section, which now carries
    both this project's standing DB-workflow rules together: (a) `prisma db
    push` only, never `prisma migrate dev` (the existing rule — it had lived
    only in `CHANGELOG.md` §5.2 as historical context, not in any operating-
    protocol doc), and (b) the new note that `db push` leaves the generated
    client untouched, so `prisma generate` must be run manually after every
    `db push` (unlike `prisma migrate deploy`, which regenerates).

    ---

    *Original finding retained below.*

    Recommend documenting this as a required manual step in project workflow
    notes: always run `prisma generate` after any `db push`, or use `prisma
    migrate deploy` (which auto-regenerates) in production workflows.

17. **RESOLVED 2026-09-01** (commit `0ea09a1`, same build as #10).
    ~~`ConfigContext.tsx`'s `getResolvedProfile()` defaults every category's
    `evalMode` to `'CUMULATIVE'` whenever neither `evalMode` nor
    `evaluationMode` is set — on ANY profile, not just the zero-usable-profile
    case the recent fix (commit `606b5e4`) addressed.~~

    **Fix, in three parts.**
    1. **The substitution is no longer silent.** `getResolvedProfile()` still
       resolves a safe display value — throwing would take down the six
       render-path callers that read it through `useMemo` (`HistoryFeed`,
       `StepDefects`, `StepReviewSubmit`, `SubmissionSummary`, `WizardPage`,
       plus ConfigContext's own memos) — but now tags the category with
       `AQLCategory.evalModeUnset: true`. A misconfigured category is therefore
       distinguishable from one deliberately set to `CUMULATIVE`, which is
       precisely the distinction the old `?? 'CUMULATIVE'` destroyed.
       `evalModeUnset` is set at resolve time only and never persisted.
    2. **Save-time hard validation.** `PATCH /api/config` now rejects any
       profile carrying a category with no evaluation mode —
       `validateInspectionProfiles()` in `backend/src/routes/config.routes.ts`,
       returning `400` naming each offending category. Scoped to payloads that
       actually supply `inspectionProfiles`, so a PATCH touching an unrelated
       field is never blocked by a pre-existing bad profile (same scoping rule
       as the adjacent `validateProductMatrixConfig()` check).
    3. **Admin visibility.** `QualityRules.tsx` renders an amber **NOT SET**
       badge on any such category, so an admin can see and fix it before the
       save validation blocks them. It reads RAW `config.inspectionProfiles`,
       not `getResolvedProfile()` output — the latter has already substituted a
       value, so the badge could never fire from it.

    **`''` is NOT unset — the load-bearing subtlety.** An empty evaluation mode
    is a real, deliberate value (RECORD ONLY / true exclusion, the only thing
    that triggers `aqlEvaluator.ts`'s `if (!category.evaluationMode) continue;`
    skip path). Every check added here uses `??` never `||` and distinguishes
    genuinely absent (`undefined`/`null`) from `''`; treating `''` as missing
    would have broken the entire RECORD ONLY feature shipped 2026-08-25.
    Both field spellings are dual-read as well — real admin-authored saves
    persist `evalMode`, while the seeds and engine use `evaluationMode`, so
    checking only one would have rejected every genuine save.

    **Forward-only.** Nothing is backfilled or rewritten. All 3 live profiles
    (15 categories) already carry explicit modes, so the new validation blocks
    nothing today; any pre-existing category with an unset mode keeps grading
    against `resolveVerdict.ts`'s own fallbacks and is simply refused the next
    time someone tries to SAVE it, with the NOT SET badge showing which one.

    **Pending manual verification:** the NOT SET badge and the save-rejection
    message have not been live-clicked — Configuration Control is Group A/B
    (M365/MSAL) gated, the same sandbox limitation as items #19/#20/#21. Note
    the badge cannot appear on any currently-configured profile, since none has
    an unset mode.

    ---

    *Original finding retained below.*

    `frontend/src/context/ConfigContext.tsx:589-590`:
    ```
    evalMode: cat.evalMode ?? cat.evaluationMode ?? 'CUMULATIVE',
    evaluationMode: (cat.evaluationMode ?? cat.evalMode ?? 'CUMULATIVE') as EvaluationMode,
    ```
    This runs for every category on every profile this function resolves,
    including real, admin-authored profiles that simply have a category left
    without an evalMode set (e.g. mid-edit in `QualityRules.tsx`, or a
    category added via some path that doesn't set the field). Such a
    category silently displays and behaves as `CUMULATIVE` — a real,
    quantitative evaluation mode — rather than surfacing as unset/misconfigured.
    Distinct from finding #10 (which was about the backend's and frontend's
    two independent *hardcoded fallback profiles* disagreeing with each
    other): this is about `getResolvedProfile()`'s category-normalization
    step silently masking a missing field on otherwise-real profile data.
    First flagged during the zero-usable-profile fix (see `hasUsableCategories()`'s
    doc comment at `ConfigContext.tsx:293-302`, which already calls out that
    callers must pass the raw profile, never this function's output, to avoid
    exactly this masking) but not yet logged as its own finding until now.
    ~~Not yet scoped — needs a decision on what an unset evalMode *should* do
    (surface as an error/warning in `QualityRules.tsx`? require the field at
    save time? keep the default but only for the documented zero-state case?)
    before a fix is drafted.~~ **Decided 2026-09-01:** all three at once —
    warn in `QualityRules.tsx`, require the field at save time, and keep the
    default only as a tagged last-resort display value. See the fix above.

18. **RESOLVED 2026-09-01.** ~~Defect breakdown display silently re-grades
    against current config, can contradict the submission's own frozen
    verdict.~~

    **Fix:** `Submission.gradingSnapshot` (+ `gradingSnapshotProfileName`)
    now freezes a self-contained per-category analysis
    (`FrozenCategoryAnalysis`, `backend/src/engine/resolveVerdict.ts`) at
    submission time and again at amendment-approval time
    (`backend/src/routes/submissions.routes.ts`). `HistoryFeed.tsx`'s
    `DefectBreakdownPanel` renders that frozen snapshot directly for any
    submission that has one — no `getResolvedProfile()` name lookup, no
    `/api/verdict/preview` re-POST — so the expanded panel and the
    collapsed `VerdictBadge` can no longer disagree for new or amended
    submissions. Both fix directions from the original write-up were taken:
    (a) the persisted snapshot, plus (b) an explicit live-re-grade label
    for the one case still using a live lookup (below).

    **Caveat (accepted, not a regression):** pre-existing legacy rows
    submitted before `gradingSnapshot` existed have no snapshot and are
    deliberately NOT backfilled. Those rows still live re-grade against
    current config on expand — but now render an explicit drift banner
    (`HistoryFeed.tsx` ~line 632) stating the breakdown is a live
    re-computation, not a historical reproduction, rather than silently
    contradicting the badge. The original detail below is retained for
    context.

    ---

    `Submission.defects` stores only an `id→count` map plus one final
    frozen `verdict` string (documented, intentional design —
    DATA_SCHEMAS_AND_TYPES.md line 48). No defect name, category, or
    per-category pass/fail is persisted at submission time.

    `HistoryFeed.tsx`'s `DefectBreakdownPanel` does two live lookups against
    **current** config when a submission's row is expanded: (1) resolves
    defect/category names via `getResolvedProfile(sub.profileId)` — always
    current, never frozen; (2) re-POSTs to `/api/verdict/preview` and
    re-evaluates pass/fail from scratch against the current profile, rather
    than reproducing what was true at submission time.

    **Consequence:** renaming a defect or moving it to a different category
    (or retuning a category's AQL level) in `QualityRules.tsx` can make a
    historical, already-approved submission's expanded panel show `CATEGORY
    FAILED` while its own collapsed row badge (`VerdictBadge`, bound to the
    frozen `sub.verdict`) still shows the original `PASS` — two elements of
    the same row visibly disagreeing, with no indication to the user that the
    expanded view is a live re-grade rather than a historical reproduction.

    **Not affected:** CSV export (only exports frozen `verdict` + raw aggregate
    count, id-agnostic). Amendment draft preview also live-recomputes, but
    arguably correctly so for that specific context (shows "what would this
    grade as under today's rules," not history).

    **Two fix directions identified, not yet decided:** (a) persist a
    name/category snapshot on `Submission` at submit time (schema change, has
    migration implications for existing rows), or (b) keep the live lookup but
    clearly label the expanded panel as a live re-grade, not history (smaller
    UI-only fix, no schema change). Needs its own dedicated planning session
    before implementation — deliberately not decided here. Same severity class
    as the now-closed `productMatrixConfig` finding (`CHANGELOG.md` §18.1):
    silent retroactive rewrite of what a historical inspection record appears
    to have graded, visible directly in the UI with zero indication the
    displayed breakdown may no longer match what was true at submission time.

19. **Product Engine's multi-expand feature has never been live-clicked in a
    real browser.** Implemented (commit `fc0983e`, "allow multiple Product
    Engine rows expanded for side-by-side viewing") and passes typecheck/build,
    but never exercised end-to-end in an actual browser session. No defect is
    suspected — tracking-only, pending Jerry's manual check.

20. **Approvals Queue "Load More" pagination + refresh-after-approve/reject
    has never been live-clicked in a real browser.** Backend verified live via
    direct API calls (`curl`/fetch against the running server); the frontend
    UI interaction itself — clicking "Load More", approving/rejecting and
    confirming the list refreshes correctly — has never been driven through
    an actual browser session. Blocked the same way as items #21/#22 below:
    the sandboxed Browser pane cannot complete the M365/MSAL popup OAuth flow
    real Approvals Queue access requires (see item #9, Group A/B permission
    gate). No defect is suspected — tracking-only, pending Jerry's manual
    check.

21. **The Graded/Record-only dimension toggle and the merged Edit/Rename
    identity sub-panel have never been live-clicked as a combined flow.**
    Both features (`CHANGELOG.md` §20, §21) are implemented and have been
    logic-verified and API-verified across two sessions — typecheck clean,
    production build succeeds, code paths traced by hand — but neither has
    been driven through an actual browser click-through, individually or
    together, in the real running app. Same MSAL/Group A-B sandboxed-browser
    limitation as items #9/#20: the Browser pane cannot complete the popup
    OAuth flow needed to reach these admin-only screens as a real user. No
    defect is suspected — tracking-only, pending Jerry's manual check.

22. **RESOLVED 2026-08-25.** ~~`StepReviewSubmit.tsx`'s pre-submit "Category
    Breakdown" table silently omits RECORD ONLY categories entirely~~ —
    discovered while building the RECORD ONLY AQL Level (Defect Category
    Setup). `categoryVerdicts` (`StepReviewSubmit.tsx:215-231`, pre-fix) was
    built by mapping over `previewState.categoryResults`, the array
    `POST /api/verdict/preview` returns from `evaluateAQLVerdict()`. That
    engine's true-exclusion skip path (`aqlEvaluator.ts:242`,
    `if (!category.evaluationMode) continue;` — exactly what RECORD ONLY
    relies on) means a RECORD ONLY category never gets a `CategoryResult`
    pushed at all, so it was structurally absent from `categoryResults`, not
    merely `passed: null` within it — a RECORD ONLY category's recorded
    defect counts from Step 3 (Defect Tabulation) never appeared anywhere in
    Step 4's per-category review, even though the operator did record them.

    **Fix:** `categoryVerdicts` now iterates the LOCAL profile's
    `aqlCategories` (not `previewState.categoryResults`'s own array order),
    joining in each category's `VerdictCategoryResult` when the server
    returned one, and synthesizing a client-computed row for any category
    detected as RECORD ONLY (`isRecordOnlyAql()`, mirrors
    `StepDefects.tsx`/`AqlCategoryAnalysisPanel.tsx`'s own copies of this
    check) that has none — same pattern `HistoryFeed.tsx`'s
    `buildCategoryAnalysis()` already used (see below), applied here for the
    first time. The synthesized row's quantity is summed client-side from
    `inspectionData.defects` against `defectDefinitions` filtered to that
    category, since no server total exists for it. Rendered with the same
    gray Eye-badge convention as `AqlCategoryAnalysisPanel.tsx` (commit
    `acf7edc`) — no new visual pattern introduced. `totalDefects` (the
    "Total Defects Recorded" / "Verdict Impact" KPI card) was checked and
    confirmed unaffected: it's still summed directly from
    `previewState.categoryResults` alone, so it already excluded RECORD ONLY
    quantities before this fix and continues to — verified live via a
    Vitest browser-mode regression test (see below), not just by inspection.
    Display-only change — `resolveVerdict.ts`/`aqlEvaluator.ts` untouched;
    RECORD ONLY categories remain fully excluded from the actual lot verdict.

    **Verified live** (real Chromium via Vitest browser mode — MSAL/PIN-login
    blockers made an actual click-through infeasible, same limitation as the
    RECORD ONLY build session): new permanent regression test
    `frontend/src/pages/wizard/__tests__/StepReviewSubmit.recordOnly.test.tsx`
    renders the real `StepReviewSubmit` component with a mocked profile
    (one graded CUMULATIVE category + one RECORD ONLY category) and a mocked
    `POST /api/verdict/preview` response that reproduces the engine's real
    omission shape. Confirms: the RECORD ONLY category renders with its
    correct quantity and the Eye badge, has no PASS/FAIL badge, and the KPI
    total stays server-verdict-derived (doesn't double-count the RECORD ONLY
    quantity). Both tests pass.

23. **RESOLVED 2026-08-26.** ~~Stale dimension state on product switch
    (`WizardPage.tsx` `handleUpdate`).~~ Switching products mid-wizard (Batch
    Setup → Dimensions → back → different product → Dimensions) left MIN/MAX
    badges and pre-filled sample values stuck on the previous product's spec,
    while the TARGET label correctly updated. Caused false OUT OF SPEC
    grading against stale numbers.

    **Severity:** Medium (false grading, not data corruption — no submission
    was affected, caught during manual wizard testing before real
    config/real users).

    **Root cause:** `WizardPage.tsx:160` `handleUpdate` did a naive
    `{...prev, ...partial}` merge; `StepDimensions.tsx:184` trusted
    non-empty `initialData.dimensions` verbatim on every mount instead of
    re-deriving from the current product spec.

    **Fix:** `WizardPage.tsx:160-174` — `handleUpdate` now strips
    `dimensions`/`dimensionStats`/`dimensionDirtySlots` from `prev` when
    `productCode` or `size` changes in the incoming partial, forcing
    `StepDimensions` to reseed fresh defaults on next visit.

    **Verification status: CLOSED.** Fix confirmed fully general via kiosk
    PIN login (Jason Tan) across 4 products spanning every structural
    variant in the current 18-product config:
    - N035MNV-OC-24FT, N035MBK-OC-24FT, N050MNV-OC-24FT — standard
      3-dimension fully-specced products.
    - N025SKB-OC-24FT — the one structural outlier in config: 4
      `dimensionDefs` (vs. the usual 3) including a RECORD-ONLY dimension
      ("BEADING THICKNESS", `isGraded: false`, `minSpec`/`tolerance` stored
      as empty strings). Confirmed via direct DOM read that all 5 Beading
      slots reset to genuine empty strings (not stale carryover) on entry,
      and the card fully disappears (6→5 dimension count, not orphaned) on
      switching away. Compliance tracker correctly excluded ungraded slots
      from the pass count throughout.

    No other product in config has a RECORD-ONLY dimension, a differing
    dimension count, or any other structural variance — so no further edge
    cases remain to test against the current catalog. Fix mechanism (clears
    the whole dimensions/dimensionStats/dimensionDirtySlots bucket keyed
    only on productCode/size change) is dimension-count- and
    grading-mode-agnostic, so it should hold automatically for any future
    product added to config, RECORD-ONLY or otherwise.

    **Related (not a bug):** Cuff Thickness's "1,2,3,4,5" placeholder text
    is generic `placeholder={(idx+1)}` slot-index hint
    (`StepDimensions.tsx:471`), unrelated to spec data, applies to every
    dimension card by design.

24. **LOGGED 2026-09-02 — deliberate pre-launch checklist item, not an active
    fix.** A dev-only "Delete All Submissions" tool exists (2026-08-26) and
    must be manually confirmed dead/removed before go-live. `DELETE
    /api/dev/submissions/all` (`backend/src/routes/devTools.routes.ts`) wipes
    every `Submission` + `AmendmentLog` row (FK-safe order, single
    transaction) for dev/test cleanup — never touches `PinUser` or
    `M365UserRole`. The frontend surface is `/dev-tools`
    (`frontend/src/pages/DevToolsPage.tsx`), deliberately unlinked from
    `Sidebar.tsx` and not inside System Admin, gated behind a typed
    `"DELETE ALL"` confirmation.

    **Structural production gates (double-layered, both verified live):**
    - Backend: `server.ts` only mounts `/api/dev` when `NODE_ENV !==
      'production'` at startup, and the router's own `blockInProduction`
      middleware re-checks `NODE_ENV` on every request and 404s first,
      before any other logic. Verified live: a second backend instance
      started with `NODE_ENV=production` returned `404 {"error":"Route not
      found"}` on the delete endpoint while `/api/health` kept working
      normally.
    - Frontend: `DevToolsPage` reads `import.meta.env.PROD` (Vite's
      build-time mirror of `NODE_ENV === 'production'`) and renders `null`
      regardless of how `/dev-tools` is reached. Verified live: a real `npm
      run build` output contained zero occurrences of the page's UI strings
      (dead-code-eliminated), and serving that build + logging in showed a
      genuinely blank content pane at `/dev-tools`.

    **Why this stays logged despite the gate being verified:** an env-gated
    dev tool that deletes all inspection data is exactly the kind of thing
    that must be a conscious pre-launch checklist item, not something trusted
    to a flag alone. Before go-live: confirm the deployment's `NODE_ENV` is
    actually set to `production`, and consider deleting
    `devTools.routes.ts`/`DevToolsPage.tsx`/the `/dev-tools` route and
    `/api/dev` mount outright rather than relying on the gate indefinitely.

    **Decision 2026-09-02 (Jerry):** this stays a deliberate pre-launch
    checklist item and is **not** to be actioned during active development.
    The dev-tools wipe is still in regular use for test-data cleanup, so
    removing it now would slow testing for no present safety benefit (both
    structural gates above are verified). The delete-outright vs.
    keep-gated call is explicitly deferred to immediately before go-live, at
    which point `NODE_ENV` must be manually confirmed as `production`. No
    action pending right now.

25. **`N035MNV-OC-24FT`'s stored `dimensionDefs` have swapped ids/names —
    pre-existing data bug, unrelated to and not fixed by the
    Weight/Length/Palm Width/Cuff/Palm/Finger unification (2026-08-26).**
    Discovered while auditing `dev.db` for the canonical-id convention that
    build's presence-axis work relies on. Every other product with a
    `cuffThickness`/`palmThickness`/`fingerThickness` triplet has each id
    correctly paired with its matching name, e.g. `{id: "cuffThickness",
    name: "CUFF THICKNESS"}`. `N035MNV-OC-24FT` instead has:
    ```json
    {"id": "fingerThickness", "name": "CUFF THICKNESS", ...}
    {"id": "palmThickness",   "name": "PALM THICKNESS", ...}
    {"id": "dim_1785494533463", "name": "FINGER THICKNESS", ...}
    ```
    — i.e. the row labeled "CUFF THICKNESS" is actually stored under the
    `fingerThickness` id, and "FINGER THICKNESS" is under an unrelated
    random id, not `fingerThickness`. Any historical submission measurements
    for this product are keyed by whichever id was live at entry time, so
    they display under the id's stored *name*, not necessarily the physically
    correct dimension. Left untouched deliberately: the canonical-merge logic
    added in this build (`mergeCanonicalDimensionDefs()`,
    `ConfigContext.tsx`/`dimensionEvaluator.ts`) matches by *name*, so this
    product's "CUFF THICKNESS" and "FINGER THICKNESS" rows both already
    satisfy presence under their current (mismatched) ids — renaming/re-iding
    them to fix the swap would orphan whatever historical measurements
    already point at those ids. Needs a human decision (and likely a
    one-off, data-only correction script, not a config-save) before it can
    be fixed safely.

26. **RESOLVED 2026-09-02.** ~~Doc updates deferred following the Weight/
    Length/Palm Width/Cuff/Palm/Finger unification build (2026-08-26).~~
    Both passes completed, written against the actual source
    (`backend/src/engine/dimensionEvaluator.ts` / `resolveVerdict.ts`), not
    the finding prose:
    - **`DATA_SCHEMAS_AND_TYPES.md` §3** — `ProductConfig` now documents
      `lengthIsGraded` / `palmWidthIsGraded` (the fixed-row equivalents of
      `ProductDimensionDef.isGraded`, same "only literal `false` is ever
      written, default never materialized" convention, read through
      `isDimensionGraded()`), plus an explicit note that there is
      deliberately **no** `weightIsGraded` — `evaluateWeight()` takes no
      `isGraded` param and hard-codes `isGraded: true`; Glove Weight has a
      real always-on evaluator with no record-only mode, by design.
    - **`ISO2859_MATH_ENGINE.md` §5** — new bullets describe `evaluateWeight()`
      as a scalar single-value threshold check (1-element `fails`, reusing the
      same `target ± tolerance` / `'MIN'` formula as the 5-slot path), folded
      into `failedDimensions` by `resolveVerdict.ts` and frozen into
      `Submission.gloveWeightSnapshot`; and the presence-axis rule that
      `mergeCanonicalDimensionDefs()` makes Cuff/Palm/Finger Thickness (matched
      by normalized name, never id) permanent non-deletable slots on every
      product, while Beading Thickness is deliberately excluded and stays
      optional/deletable.

    ---

    *Original finding retained below.*

    `DATA_SCHEMAS_AND_TYPES.md` §3
    (`ProductDimensionDef`/`ProductConfig`/`SizeConfig`) needs a pass to
    document the new `ProductConfig.lengthIsGraded`/`palmWidthIsGraded`
    fields (mirroring `ProductDimensionDef.isGraded`'s existing docs, same
    "only literal `false` is ever written" convention) and to note that
    Glove Weight now has a real grading evaluator (always-on, no
    record-only mode — deliberately no `weightIsGraded` counterpart).
    `ISO2859_MATH_ENGINE.md` §5 needs an update describing
    `evaluateWeight()` (`backend/src/engine/dimensionEvaluator.ts`) — a
    scalar single-value threshold check, distinct from every other
    dimension's 5-slot measurement — and the presence-axis rule that Cuff/
    Palm/Finger Thickness (not Beading) are now permanent, non-deletable
    slots on every product via `mergeCanonicalDimensionDefs()`. Deliberately
    not edited as part of this build, per standing convention (doc updates
    are their own explicit follow-up step, not a silent mid-task revision).

27. **RESOLVED 2026-09-02** (`UI_DESIGN_SYSTEM.md` half was 2026-08-26).
    ~~Doc updates deferred following the wizard-visibility (OFF/RECORD ONLY/
    GRADED) build.~~ The remaining `DATA_SCHEMAS_AND_TYPES.md` §3 half is now
    done: `ProductDimensionDef.wizardVisible` and
    `ProductConfig.lengthWizardVisible` / `palmWidthWizardVisible` are
    documented, mirroring `isGraded`'s "only literal `false` is ever written,
    default never materialized" convention and read through the single-source
    `isWizardVisible()` (`dimensionEvaluator.ts` / `ConfigContext.tsx`), while
    stating explicitly that the flag is genuinely independent of `isGraded` —
    toggling one never reads or writes the other, and all four
    visible/off × graded/record-only combinations are valid. No Weight
    counterpart (Glove Weight is always shown, always graded).

    ---

    *Original finding retained below.*

    - **`UI_DESIGN_SYSTEM.md` — RESOLVED.** New §4.14 documents the
      dimension mode control: it's since been replaced (`DimensionModeCycle`,
      a single cycling icon — Ruler/cyan=Graded, Eye/amber=Record Only,
      EyeOff/grey=Off) rather than the `DimensionModeSelect` dropdown
      originally shipped in this build, and §4.14 documents the current
      icon control, not the superseded dropdown. Also notes the OFF
      skip-path behavior (filtered from `StepDimensions.tsx`/`BatchEntry.tsx`'s
      rendered list entirely, never reaches `dimensionEvaluator.ts`'s
      evaluation loop — a strict superset of the RECORD ONLY skip-path, not
      a new evaluation mode).
    - **Still open — `DATA_SCHEMAS_AND_TYPES.md` §3.** Needs a pass to
      document `ProductDimensionDef.wizardVisible` and
      `ProductConfig.lengthWizardVisible`/`palmWidthWizardVisible` — same
      "only literal `false` is ever written, default never materialized"
      convention as `isGraded`, but a genuinely independent flag (toggling
      one never touches the other). Deliberately not edited as part of
      this build, per standing convention.

28. **RESOLVED 2026-08-26.** ~~Doc update deferred for dimension field
    label styling, across two builds~~ — `UI_DESIGN_SYSTEM.md` §1.3 now
    documents the label convention for dimension field names in
    `ProductConfigAccordion.tsx` and `StepDimensions.tsx`/`BatchEntry.tsx`:
    Inter throughout (no `font-mono` — field names are labels, not data),
    permanent fields (Glove Weight/Length/Palm Width, Cuff/Palm/Finger
    Thickness) at full-opacity `font-semibold text-primary`, optional/
    deletable fields (Beading Thickness, future custom dims) at
    `font-medium text-primary/60` — driven by the same
    `isCanonicalThicknessDim()` check already used to gate the Trash
    button, in both files identically.

29. **RESOLVED 2026-09-01** (commit `347549f`; doc update deferred at the time
    and completed here). ~~AQL level vocabulary asymmetry between the
    assignable whitelist and the Actual AQL ladder.~~

    **Resolution — the ladder was narrowed.** The open question below ("add
    `'10'` to `ISO_WHITELIST`, or narrow the ladder to the assignable six")
    was decided in favour of narrowing. `ISO_WHITELIST` remains the source of
    truth for what is assignable, and the achievement ladder now matches it:
    - New `ACHIEVABLE_AQL_LEVELS` (`backend/src/engine/iso2859-matrix.ts`) —
      the six assignable levels, `'0.65'` … `'6.5'`. `findActualAqlAchieved()`
      scans and reports only these, so it can never surface a level a category
      could not have been assigned.
    - `EXCEEDS_ALL` now carries `'6.5'`'s Ac/Re (the loosest *achievable*
      bar that was missed) instead of `'10'`'s. A count that would only have
      fit under the matrix's `'10'` column is now `EXCEEDS_ALL`.
    - `ActualAqlAchieved.aqlLevel` narrowed to `AchievableAQLLevel | null`.
    - `SUPPORTED_AQL_LEVELS` (all 7) and the `ISO_2859_MATRIX` `'10'` columns
      are deliberately **kept** — `getAQLThresholds()` still resolves a
      directly-supplied `'10'` assigned level, so the latent-bug fix below
      stays intact. Only what the ladder *scans and reports* changed.

    Guarded by `backend/src/engine/__tests__/findActualAqlAchieved.test.ts`,
    including a full bracket × count sweep asserting `'10'` is never returned.

    **Forward-only:** any pre-existing frozen `gradingSnapshot` row carrying an
    actual level of `'10'` is an accepted historical artifact — grading is never
    recomputed after freeze (#18), and nothing was backfilled.

    ---

    *Original finding retained below.*

    Raised by the "Actual AQL Achieved" build
    (2026-08-27). The ladder (`findActualAqlAchieved()`,
    `ISO2859_MATH_ENGINE.md` §2A) scans all 7 `SUPPORTED_AQL_LEVELS`
    including `'10'`, while Configuration Control's assignable whitelist
    (`QualityRules.tsx`'s `ISO_WHITELIST`) stops at `'6.5'`. A category can
    therefore report an *actual* level of `10` that it could never have been
    *assigned*. Scanning all 7 was an explicit decision (the metric is meant
    to be independent of what's currently assignable, and including `'10'`
    means fewer categories fall into the `EXCEEDS_ALL` hard-fail state) —
    recorded here because the two vocabularies are now deliberately
    different, not because the current behavior is wrong. ~~Open question for
    a future build: add `'10'` to `ISO_WHITELIST`, or narrow the ladder to
    the assignable six.~~ (Decided — see the resolution above.)

    **Latent bug this exposed (already fixed, not open):** `'10'` never
    resolved at all before this build. `getAQLThresholds()`'s
    `normaliseAQLKey()` pads any all-digit string to `'10.0'`, which is not a
    matrix key — so every AQL 10 lookup silently fell through to
    `INDETERMINATE_THRESHOLD` (`{ac:0}`), i.e. graded AQL 10 as *zero
    tolerance*. Unreachable through the admin UI (hence no stored submission
    is affected), but reachable by direct API call. Fixed by trying the exact
    matrix key before the padded form.
    → `CHANGELOG.md` §35.

30. **N/A-mode categories carry no Actual AQL by design.** `ISO2859_MATH_ENGINE.md`
    §2 defines N/A mode as qualitative — `defectCounts` holds state codes
    (0=unrecorded, 1=pass, 2=fail), not defect counts — so there is no count
    to run the ladder against, even though N/A is a *graded* mode that does
    affect the verdict. Resolved by recording an explicit `QUALITATIVE`
    state rather than fabricating an AQL level from a state code, and the UI
    renders no Actual AQL chip for those rows. Logged here (rather than
    silently resolved) because "every graded category gets an actual AQL"
    does not, and cannot, hold literally for N/A.
    → `CHANGELOG.md` §35.

31. **Dimensions section name/unit resolution is live, not frozen — an
    accepted, not fixed, gap.** Raised by the Inspection Results panel
    restructure (2026-08-27), which added a "Dimensions" table to the record
    detail view (`DimensionsPanel.tsx`). The measured/spec/compliance data
    itself IS frozen (`Submission.dimensionMins` +
    `Submission.gloveWeightSnapshot`, both computed once at submit time,
    never recomputed), but the dimension's display NAME and unit are resolved
    against the product's CURRENT `dimensionDefs` (`resolveProductMatrix()` +
    `mergeCanonicalDimensionDefs()`) — the same class of drift risk
    `gradingSnapshot` eliminated for AQL category names, reintroduced here for
    dimension names specifically. If a dimension def is renamed or deleted
    after a lot was submitted, that lot's historical record will show
    whatever name the def carries NOW (or the raw id, if deleted), not what it
    was called at submit time. Explicitly accepted rather than fixed in this
    build: renaming a dimension def post-submission is rare, and freezing
    names too would mean widening `dimensionMins`'s own JSON shape (a
    client-written field), a larger change than this build's scope. Revisit
    if a real historical-accuracy complaint ever surfaces.
    → `CHANGELOG.md` §36.

32. **Accepted exception to §4.8A's literal "Value Chips MUST be uppercase"
    rule: raw defect identifiers are never CSS-uppercased.** Raised by the
    Inspection Results panel visual consistency rework (2026-08-27), which
    audited every chip in `AqlCategoryAnalysisPanel.tsx`/`DimensionsPanel.tsx`
    against `UI_DESIGN_SYSTEM.md` and fixed every missing `uppercase` class
    found — except the Unclassified block's raw defect-id chip (e.g.
    `def_hole`) and the expanded per-defect-type pill's name text, both left
    un-uppercased on purpose. Forcing `uppercase` there would render
    `DEF_HOLE`/`HOLE` — a real legibility regression for an identifier/name,
    and inconsistent with how defect names are displayed everywhere else in
    this codebase (never CSS-uppercased). Their size was still brought to
    §4.8A's mandated `text-[10px]` (was `text-[11px]`) — only the casing rule
    is the accepted exception, not the whole chip spec.
    → `CHANGELOG.md` §37.

33. **RESOLVED 2026-09-02** (commit `45bf502`; harness half was
    `347549f`/`0ea09a1`). ~~`aqlEvaluator.ts`'s per-defect GRANULAR grading
    is not tested at the engine level.~~ Raised by the DEFECTS
    header/breakdown fix (2026-09-01, commit `f66bb99`).

    **Fix — direct engine coverage for `evaluateAQLVerdict()`.**
    `backend/src/engine/__tests__/evaluateAQLVerdict.test.ts` (9 tests) now
    exercises the GRANULAR rule directly, pinned to a real ISO 2859-1 matrix
    cell (n=125, AQL `'2.5'` → `{ac:7, re:8}`, read from `ISO_2859_MATRIX`, not
    hardcoded): count 7 (= Ac) passes, count 8 (= Re) fails, count 10 fails.
    This closes the gap that `347549f`/`0ea09a1` left — those added only
    *adjacent* coverage (`findActualAqlAchieved.test.ts` for the Actual-AQL
    ladder, `validateInspectionProfiles.test.ts` for config-save validation);
    `evaluateAQLVerdict()` itself was still invoked by zero tests until now.

    **Discovery pass found no bug** — this was a pure coverage gap;
    `evaluateAQLVerdict()` matches `ISO2859_MATH_ENGINE.md` §2 as written and
    no engine code was changed. Confirmed by test:
    - Each defect type is evaluated **independently** against Ac. A single
      failing type fails the category, but `failingDefects` is scoped to the
      failing type(s) only — passing siblings are neither pulled in nor able to
      rescue the category, and multiple types can fail at once (not collapsed
      to the single worst count).
    - RECORD ONLY (`evaluationMode: ''`) produces no `CategoryResult` and cannot
      affect the verdict — a large count on such a category is never treated as
      GRANULAR failure data.

34. **`StepReviewSubmit.tsx`'s "Total Defects Recorded" KPI folds N/A
    fail-counts into a defect tally.** The KPI sums `cr.totalCount` across
    all categories, including N/A (qualitative) — where `cr.totalCount` is
    the FAIL-item count, not a true defect quantity. Same semantic category
    as the per-category reason-line / Count-label bug fixed one level down
    (2026-09-01, commit `9eced03`), just as a cross-category grand total
    rather than a single category's display. Currently guarded by
    `StepReviewSubmit.recordOnly.test.tsx` (asserts the KPI stays
    server-verdict-derived) and intentionally left as-is — logged for future
    consideration, not an active fix.

35. **Accent-color preset system — all 5 presets verified 2026-09-02, no bug
    found.** Only Cobalt (default) had ever been live-confirmed; Emerald,
    Violet, Amber, Rose, and the propagation into Analytics chart theming had
    never been checked. Verification pass (real Chromium via Vitest browser
    mode). The `/system` → Company Branding accent dropdown is **Group A
    only** — confirmed against `App.tsx`'s `RoleRoute allowedRoles={GROUP_A_ROLES}`
    and `NAVIGATION_AND_RBAC.md` §4, not assumed.
    - All 5 presets set the correct `--color-brand-primary` /
      `--color-brand-secondary` on `:root` via `ConfigContext.tsx`'s accent
      `useEffect`; a `var(--…)` consumer resolves to each preset's hex; and
      cycling preset→preset leaves no stale value (every preset defines both
      halves — no partial preset exists that could strand one).
    - The Company Branding `<select>` renders exactly the 5 presets with the
      right labels + a live swatch; selecting each through the real `onChange`
      re-themes the swatch.
    - Analytics charts derive from the **same single source of truth**
      (`accentColors.ts` `resolveAccentPair`), not a disconnected hardcoded
      palette — `AnalyticsDashboard.tsx:83-92` feeds `accentPair.primary` /
      `.secondary` into the Recharts fill/stroke props (Pareto area fill,
      cumulative trend line + dots, the "Minor Visual" pie slice). Per-preset
      SVG assertion: the active preset's hexes appear and none of the other
      four presets' hexes leak through a stale default. Pass/fail stacked bars
      and the Major/Critical/Zero-Tolerance severity slices correctly stay
      fixed semantic colors, not accent-driven.
    Verification test was created, run, and removed — **no code change**; tree
    clean at `14f9cee`. Two non-bug notes for context: the dropdown preview is
    Save-gated (a picked preset re-themes app-wide only after
    Save → PATCH `/api/config` → `refreshConfig`), and the Analytics page still
    renders mock data (`NAVIGATION_AND_RBAC.md` §4 — "PLANNED — partial
    implementation") — the theming wiring is real regardless.

