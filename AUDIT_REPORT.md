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

1. **Submission-identity-stamping gap.** `Submission.aadObjectId`/
   `userPrincipalName` are hardcoded literals (`'mock-user-id'`,
   `'operator@oneglove.com'`, `'sample-data-not-a-real-user'`) on every
   submission, regardless of login method (PIN or M365) — no submission
   today is attributable to any real user. The third literal appears on
   10 of the 14 baseline rows. Blocks building a reliable "does this user
   have submission history" check (concretely, this is what blocked PIN
   hard-delete in the Staff PIN Access task).
   First flagged: Staff PIN Access session. → `CHANGELOG.md` §17.

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

9. **Real Azure AD/MSAL integration is still blocked** on Jerry's IT
   manager providing real credentials (Tenant ID, Client ID, Client
   Secret). Mock M365 login remains the only path in the interim,
   dev-gated (`import.meta.env.DEV`) so it can't leak into production.
   → `CHANGELOG.md` §11.7.

10. **Two independently-maintained "default profile" fallbacks disagree
    on `evaluationMode`.** The backend's `HARDCODED_DEFAULT_PROFILE`
    (`resolveVerdict.ts`) sets `CUMULATIVE` for BARRIER / `''` for
    PACKAGING; the frontend's separate hardcoded fallback
    (`ConfigContext.tsx`) sets `'N/A'` for both. Never reconciled.

    **Diagnosed 2026-08-11:**
    - **Backend** — `backend/src/engine/resolveVerdict.ts:37-59`
      (`HARDCODED_DEFAULT_PROFILE` const), consumed at two call sites inside
      `resolveVerdict()`: (a) line 238, when an explicit `profileId ===
      'prof_default'` is requested but not found in AppConfig's
      `inspectionProfiles`; (b) line 268, the final safety net when *no*
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
    `frontend/src/context/ConfigContext.tsx:392-393`:
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
    doc comment at `ConfigContext.tsx:155-158`, which already calls out that
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

21. **No `UI_DESIGN_SYSTEM.md` token exists for "live editable field's value
    differs from its amendment-original value."** Needed for amendment
    mode's field-level changed-highlight (`StepMetadata.tsx`,
    `StepDimensions.tsx`, `StepDefects.tsx`, 2026-08-14). Checked Chapter 1
    core tokens, §3.1–3.7 form controls, §4.8 badges, §4.12 diff coloring,
    and §5.1–5.3 alerts — nothing fits. The two closest candidates were both
    explicitly ruled out: §4.12's Rose=Original/Emerald=Proposed diff pair
    is scoped to the read-only two-column diff viewer (`JsonViewer.tsx`,
    Approvals Queue / Pre-Submit Summary), not a live-editable input; §3.4's
    `text-muted opacity-80`→`text-primary` pair (reused for the now-closed
    finding #20 — see `CHANGELOG.md` §18.8) is a different semantic —
    prefill-trust state, not amendment-change state.

    **Resolved for this implementation, pending formal doc addition:**
    reused Cyan/Info (`bg-brand-secondary/5 border-brand-secondary/50`) —
    the closest existing semantic, already used for informational/
    provenance signals (§5.3 Info, §4.8D presence dots). Applied consistently
    across all three step components via each field's own
    `hasFieldChanged()` comparison. **Next step:** ratify this as a formal
    token in `UI_DESIGN_SYSTEM.md` (e.g. a new §5.3-adjacent or §3.x entry
    for "Amendment Changed Field"), or replace with a purpose-picked color if
    Cyan/Info's reuse turns out to read as ambiguous once seen live.

22. **`AI_RULES.md`'s "One Complete File per Turn" rule was necessarily
    exceeded for the amendment-mode changed-field highlight (2026-08-14).**
    Unlike the entry-mode sequence-number fix (single-file workaround
    found), this feature is inherently cross-cutting: the same visual
    treatment and the same `hasFieldChanged()` comparison had to land in
    `StepMetadata.tsx`, `StepDimensions.tsx`, and `StepDefects.tsx` — one
    component per wizard step, all three explicitly required by the task's
    own verification criteria (one field changed-highlight test per step).
    No single-file decomposition existed. Confirmed with the user before
    proceeding rather than silently breaking the rule or arbitrarily
    picking one file to "count." Noting here so the exception is visible
    in the same place other rule-tension findings live, not just in this
    session's chat history.

24. **`OriginalValueNote`'s conditional-mount pattern caused a layout
    jiggle** — the note returned `null` (unmounting entirely) whenever the
    field was unchanged, so every edit that moved a field's value toward or
    away from its original caused sibling fields to reflow as the note's
    box appeared/disappeared. **Fixed 2026-08-14:** the note now stays
    mounted for the whole amendment session (toggling Tailwind's
    `invisible` instead of unmounting) once `hasOriginal` is true, so its
    height is always reserved and edits never shift sibling layout. Outside
    amendment mode (`hasOriginal` false) it still renders nothing at all —
    zero footprint, unchanged from prior behavior, so entry mode's layout
    is untouched.
