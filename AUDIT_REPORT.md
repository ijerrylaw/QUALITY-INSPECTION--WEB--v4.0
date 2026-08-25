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

8. **`test_post.js`'s hardcoded `batchNumber` is stale** — no longer
   matches the real `[Line][Side][YJJJ][Sequence]` lot-number format.
   Inert manual script (not wired into any npm script or CI), candidate
   for deletion or updating.
   → `CHANGELOG.md` §15.

10. **Two independently-maintained "default profile" fallbacks disagree
    on `evaluationMode`.** ~~The backend's `HARDCODED_DEFAULT_PROFILE`
    (`resolveVerdict.ts`) sets `CUMULATIVE` for BARRIER / `''` for
    PACKAGING; the frontend's separate hardcoded fallback
    (`ConfigContext.tsx`) sets `'N/A'` for both.~~

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

11. **Confirmed live, 2026-08-10: an unrecognized explicit `profileId`
    still hard-fails `POST /api/submissions` with a `404`**, instead of
    degrading gracefully through the fallback chain the way a missing
    `profileId` does. Verified directly: `curl -X POST
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

12. **Minor color-token drift: `BatchEntry.tsx` and dead files use
    non-canonical Tailwind colors instead of the mandated tokens.**
    `BatchEntry.tsx` uses `red-500`/`hover:bg-red-500/10` instead of the
    mandated `rose-500` token. The fully dead `components/wizard/*`/
    `ConfigDashboard.tsx` files use non-canonical `green-`/`red-`/
    `yellow-` classes instead of `emerald`/`rose`/`amber` — not live bugs,
    but a landmine if any dead file is ever reconnected.
    (Split off from the former `Badge.tsx` finding — that component's own
    geometry violation is now fixed and resolved, see `CHANGELOG.md`
    §18.6. These two sub-findings were never in that fix's scope and
    remain open.)
    → `CHANGELOG.md` §3.B8 (original finding).

13. **A brand-new install's zero-state default profile is code-level, not
    admin-editable.** `HARDCODED_DEFAULT_PROFILE` (`resolveVerdict.ts`) is
    baked into backend source and only ever used as the very-first-run
    fallback before an admin sets up a real profile via `QualityRules.tsx`
    — low-stakes remainder of a larger question that was otherwise
    superseded by the single-tenant-per-deployment correction.
    → `CHANGELOG.md` §5.4, §9.2.

14. **No qualitative (PASS/FAIL/NIL) defect category exists on any
    currently configured profile.** This code path has zero live test
    coverage. Flag for manual test pass when a profile first adds a
    qualitative-tier defect to confirm the entire verdict chain works
    end-to-end for this dimension type.

15. **Amendment discard-guard's new-entry dirty-check is fragile.** The
    dirty-check logic is anchored to `sequenceNo` being the only field
    with no auto-population path. This is a hidden dependency: a future
    config change that adds auto-population elsewhere would silently
    bypass the dirty-check unless a matching exclusion is added. Recommend
    adding a code comment noting this dependency at minimum.

16. **`prisma db push` does not auto-regenerate the Prisma client.** This
    has caused integration bugs twice (schema changes persisted but client
    still used old types). Recommend documenting this as a required manual
    step in project workflow notes: always run `prisma generate` after any
    `db push`, or use `prisma migrate deploy` (which auto-regenerates) in
    production workflows.

17. **`ConfigContext.tsx`'s `getResolvedProfile()` defaults every category's
    `evalMode` to `'CUMULATIVE'` whenever neither `evalMode` nor
    `evaluationMode` is set — on ANY profile, not just the zero-usable-profile
    case the recent fix (commit `606b5e4`) addressed.**
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
    Not yet scoped — needs a decision on what an unset evalMode *should* do
    (surface as an error/warning in `QualityRules.tsx`? require the field at
    save time? keep the default but only for the documented zero-state case?)
    before a fix is drafted.

18. **Defect breakdown display silently re-grades against current config, can
    contradict the submission's own frozen verdict.** `Submission.defects`
    stores only an `id→count` map plus one final frozen `verdict` string
    (documented, intentional design — DATA_SCHEMAS_AND_TYPES.md line 48).
    No defect name, category, or per-category pass/fail is persisted at
    submission time.

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

