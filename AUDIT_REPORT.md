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

6. **Tenant-scoped admin role question is unanswered.** Whether a future
   role tier above or alongside `ADMIN` is ever wanted — even within one
   single-tenant-per-deployment install — is raised nowhere in the docs
   or code, and has no stated answer either way.
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
