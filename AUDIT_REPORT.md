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

24. **A dev-only "Delete All Submissions" tool exists (2026-08-26) and must be
    manually confirmed dead/removed before go-live.** `DELETE
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

    **Why this is still an open item despite the gate being verified:** an
    env-gated dev tool that deletes all inspection data is exactly the kind
    of thing that must be a conscious pre-launch checklist item, not
    something trusted to a flag alone. Before go-live: confirm the
    deployment's `NODE_ENV` is actually set to `production`, and consider
    deleting `devTools.routes.ts`/`DevToolsPage.tsx`/the `/dev-tools` route
    and `/api/dev` mount outright rather than relying on the gate
    indefinitely.

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

26. **Doc updates deferred following the Weight/Length/Palm Width/Cuff/Palm/
    Finger unification build (2026-08-26).** `DATA_SCHEMAS_AND_TYPES.md` §3
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

27. **PARTIALLY RESOLVED 2026-08-26.** Doc updates deferred following the
    wizard-visibility (OFF/RECORD ONLY/GRADED) build.
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

29. **AQL level vocabulary asymmetry between the assignable whitelist and
    the Actual AQL ladder.** Raised by the "Actual AQL Achieved" build
    (2026-08-27). The ladder (`findActualAqlAchieved()`,
    `ISO2859_MATH_ENGINE.md` §2A) scans all 7 `SUPPORTED_AQL_LEVELS`
    including `'10'`, while Configuration Control's assignable whitelist
    (`QualityRules.tsx`'s `ISO_WHITELIST`) stops at `'6.5'`. A category can
    therefore report an *actual* level of `10` that it could never have been
    *assigned*. Scanning all 7 was an explicit decision (the metric is meant
    to be independent of what's currently assignable, and including `'10'`
    means fewer categories fall into the `EXCEEDS_ALL` hard-fail state) —
    recorded here because the two vocabularies are now deliberately
    different, not because the current behavior is wrong. Open question for
    a future build: add `'10'` to `ISO_WHITELIST`, or narrow the ladder to
    the assignable six.

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
