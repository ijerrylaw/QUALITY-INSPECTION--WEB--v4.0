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

4. **`productProfileMap` has a typo'd entry for `N030SKB-OC-24FT`**
   (map contains `N030MNV-OC-24FT`/`R030MNV-OC-24FT` instead — neither
   matches). Harmless today only because the wizard's submission path
   never consults this map (profile is always operator-picked); but
   `HistoryFeed.tsx`'s row-expand path does consult it, so it's a live
   landmine, not inert.
   → `CHANGELOG.md` §7.5, §12.4.

5. **`productMatrixConfig` has no throw/log option for a missing product
   code.** Unlike the AQL side's `'throw'` mode, a product code with no
   dimension-spec entry silently zeroes out the two fixed-dimension
   thresholds (a total no-op — no measurement can ever fail them) with no
   error and no log line anywhere.
   → `CHANGELOG.md` §7.3, §7.5.

6. ~~**Tenant-scoped admin role question is unanswered.**~~ **Closed, no
   action.** Whether a future role tier above or alongside `ADMIN` is ever
   wanted — even within one single-tenant-per-deployment install — is
   raised nowhere in the docs or code. Group A (IT Admin/C-Suite/Directors)
   covers the current single-tenant-per-deployment architecture. Revisit
   if/when commercialization introduces multi-deployment oversight needs.
   → `CHANGELOG.md` §8.2, §8.6 (Q2), ranked item #5.

7. **`GET /api/amendments/pending` has no pagination or row limit.**
   Fetches every `PENDING_APPROVAL` submission unbounded — same class of
   gap as `GET /api/submissions` had before its own fix, on a different
   route (backs the Approvals Queue screen), not yet touched.
   → `CHANGELOG.md` §14.

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

12. **Dead `Badge.tsx` component + minor color-token drift.** The shared
    badge component is unused anywhere (every screen hand-rolls its own
    badge styling) and itself violates the documented badge geometry.
    `BatchEntry.tsx` uses `red-500`/`hover:bg-red-500/10` instead of the
    mandated `rose-500` token. Dead files (`components/wizard/*`,
    `ConfigDashboard.tsx`) use non-canonical `green-`/`red-`/`yellow-`
    classes instead of `emerald`/`rose`/`amber` — not live bugs, but a
    landmine if any dead file is ever reconnected.
    → `CHANGELOG.md` §3.B8.

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
