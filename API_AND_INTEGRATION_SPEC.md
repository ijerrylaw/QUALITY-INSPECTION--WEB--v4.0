# API Endpoints & Enterprise Integrations Spec

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines REST API contracts, authentication endpoints (PIN login, live M365 SSO), and Microsoft Graph / SharePoint syncing.  
*(Note: JSON payload schemas referenced here are defined in `DATA_SCHEMAS_AND_TYPES.md`.)*

---

## 1. REST API ENDPOINTS (Express Backend — Port 4009)

### Health

* `GET /api/health`
  * **Role:** Returns server and database connectivity status.
  * **Response:** `{ status: 'ok' | 'error', service, database: 'connected' | 'disconnected', timestamp }`
  * **Auth:** None required.

---

### Configuration (Group A/B Routes)

* `GET /api/config`
  * **Role:** Returns the full `AppConfig` singleton (parsed from the Prisma `AppConfig` row). Includes `inspectionProfiles`, `productProfileMap`, `productCodes`, `lines`, `shifts`, `sizes`, `sampleSizes`, `dimensions`, and all SKU option arrays.
  * **Note:** `inspectionProfiles` and `productProfileMap` are returned as already-parsed objects (not raw JSON strings).
  * **Auth:** None required.

* `PATCH /api/config`
  * **Role:** Partially updates the global `AppConfig`.
  * **Payload:** Accepts a partial `AppConfig` object. Any supplied key is merged and persisted.
  * **Locked product codes:** a product code referenced by ≥1 `Submission` is "locked" (computed on demand, not stored). Two independent rejections guard it, both checked before any write:
    - Removing a locked code from `productCodes[]` — **Response 409:** `{ error, lockedProductCodes: [{ productCode, submissionCount }] }`
    - Changing ANY field of a locked code's stored record — `matrix`, `attributes`, OR `profileId` (see `DATA_SCHEMAS_AND_TYPES.md` §3.1's `ProductEntry`) — **Response 409:** `{ error, lockedProductCodes: [{ productCode, submissionCount, changedFields }] }`, where `changedFields` lists the dotted-path fields that differ from the stored record. Widened 2026-08-20 (commit `19cd645`) from a matrix-only check to cover the whole record, and from "codes present in the payload's `productMatrixConfig`" to every locked code — a payload that omits `productMatrixConfig` entirely no longer bypasses the check.
  * **Atomic write + grading-table projection.** When the payload touches `inspectionProfiles`, the `AppConfig` write and the profile-registry projection (`syncProfileRegistry()` — the Stage 2 hook that keeps the global `Category`/`Defect`/`ProfileCategory`/`ProfileCategoryDefect` tables the engine grades from in step with the stored JSON) run inside **one interactive Prisma transaction**. If the projection cannot be built — currently only when it would drop a defect or category that is locked by a frozen `Submission.gradingSnapshot` — the transaction aborts and the JSON write **rolls back with it**. A rejected save changes nothing; the stored profile and what the engine grades stay in step.
    - **Response 409:** `{ error, details }` where `details` is the specific conflict (e.g. `Locked defect 'def_odour' … is absent from every profile`). The wording is explicit that nothing was saved.
    - A rejected attempt still writes an **`AccessLog` row with `action: 'CONFIG_WRITE_FAILURE'`** (distinct from `CONFIG_WRITE` — nothing changed), so a save that was tried and refused is visible in the audit trail rather than leaving a silent gap. `AppConfig.updatedAt` does **not** move.
  * **Auth:** Requires `X-User-Role` header, Group A/B (`MANAGER`, `ADMIN`) — see `NAVIGATION_AND_RBAC.md` §5.1.

---

### Submissions & History

* `GET /api/submissions`
  * **Role:** Returns the 50 most recent inspection submissions, ordered by creation date descending. Includes `amendmentLogs` for each record.
  * **Auth:** None required.

* `POST /api/submissions`
  * **Role:** Submits a completed AQL inspection. Runs the `evaluateAQLVerdict` engine and persists the result.
  * **Payload:** Full `Submission` object. `profileId` is **optional** — if absent or empty, the backend resolves the profile in this order:
    1. `productProfileMap[productCode]` in AppConfig
    2. First AppConfig profile with valid `aqlLevel` + `evaluationMode` rules
    3. Hardcoded GLOBAL STANDARD (DEFAULT) profile
  * **Important:** `profileId` is stored as a plain opaque string, checked against `AppConfig.inspectionProfiles`/the `'prof_default'` sentinel (not a Prisma foreign key — `InspectionProfile` was removed as a relational model). If a profile *was* resolved for grading but the requested id fails the storage-time sanity re-check, the warning is logged and `profileId` is stored as `null` rather than blocking the write.
  * **Response 404 (`{ error }`) — explicit but unrecognized `profileId`:** if the payload supplies a non-empty `profileId` that matches no `AppConfig.inspectionProfiles` entry and is not the `'prof_default'` sentinel, `resolveVerdict()` (default `onUnresolvedProfile: 'throw'`) raises `VerdictProfileNotFoundError`; the route returns 404 and **no `Submission` row is created**. This is **by design, not a gap** (AUDIT_REPORT.md #11): a submission is a permanent record, so it must never be silently graded against a fallback profile the caller did not ask for — failing loudly is preferable. Contrast `POST /api/verdict/preview`, which runs in `'fallback'` mode and degrades a bad `profileId` to the safety-net profile with a 200: acceptable there because preview results are disposable and never persisted. An **absent or empty** `profileId` is not a "miss" — it triggers the normal resolution order above, not this 404.
  * **Response 201:** `{ submission, verdict: 'PASSED' | 'FAILED', categoryResults[] }`
  * **Frozen snapshot (AUDIT_REPORT.md #18):** The persisted `submission` also carries `gradingSnapshot`/`gradingSnapshotProfileName` — a richer, self-contained `FrozenCategoryAnalysis[]` (names, AQL level, threshold, eval mode, pass/fail, `actualAqlAchieved`, full per-category defect breakdown) computed by `resolveVerdict()` and stored as JSON. This is **not the same shape** as the response's `categoryResults[]` (which stays the engine's audit-trail `CategoryResult[]` — no `aqlLevel`, failing-defects-only). `HistoryFeed.tsx` reads `gradingSnapshot` directly instead of re-querying `POST /api/verdict/preview`.
  * **Auth:** Requires `X-User-Role` header, any authenticated role — see `NAVIGATION_AND_RBAC.md` §5.1.

* `GET /api/submissions/sequence-hint`
  * **Role:** Non-binding advisory for the wizard's Sequence No + Total Carton fields, for a given Line+Side+YJJJ group.
  * **Query params:** `lineId`, `side`, `yjjj` (all required — missing any returns `{ suggestedNext: null, suggestedTotalCarton: null }` rather than an error, since both fields are advisory).
  * **Response 200:** `{ suggestedNext: number | null, suggestedTotalCarton: number | null }`
    - `suggestedNext` — max existing Sequence No in the group + 1. Display-only hint; the wizard never pre-fills or restricts input with it (Sequence must reflect true production order — `ISO2859_MATH_ENGINE.md` §4).
    - `suggestedTotalCarton` — Total Carton from the most recent prior submission in the same group. Unlike `suggestedNext`, the wizard DOES pre-fill this value (still fully editable).
  * **Auth:** None required.

* `GET /api/submissions/:id`
  * **Role:** Returns a single submission by ID with its `amendmentLogs`.
  * **Response:** `{ submission }` with relations included.
  * **Auth:** None required.

* `GET /api/submissions/new-indicator`
  * **Role:** Global (not per-user) advisory — has any Submission been created since the effective last-viewed threshold? Drives the sidebar "new lot" dot + row badges in `HistoryFeed.tsx`.
  * **Response 200:** `{ hasNew: boolean, effectiveLastViewedAt: string }` — `effectiveLastViewedAt = max(AppConfig.lastHistoryViewedAt, start of today)`, so a new calendar day clears the indicator with no cron job needed.
  * **Auth:** None required.

* `POST /api/submissions/mark-history-viewed`
  * **Role:** Records that a user just viewed Inspection Records — updates the same global `AppConfig.lastHistoryViewedAt` timestamp `GET /new-indicator` reads. Called once by `HistoryFeed.tsx` on mount, after it has captured the pre-update threshold for row badges.
  * **Response 200:** `{ ok: true }`
  * **Auth:** Requires `X-User-Role` header, any authenticated role (matches the same `ALL_ROLES` gate as submission/amendment creation, so PIN-authenticated Group C users work too).

* `POST /api/submissions/:id/amendments`
  * **Role:** Drafts an amendment request on an existing submission. Sets `amendmentStatus` to `PENDING_APPROVAL` and creates an `AmendmentLog` record.
  * **Payload:** `{ reason: string, newValues: Partial<Submission> }`
  * **Note:** Does NOT re-evaluate the AQL verdict. The verdict in `newValues` is whatever the caller supplies.
  * **Amendment limit:** Rejects with `409` if the Submission already has `MAX_APPROVED_AMENDMENTS` (3) **APPROVED** AmendmentLogs — rejected or still-pending drafts don't count. Mirrors `HistoryFeed.tsx`'s client-side AMEND RECORD button disable at the same threshold; this is the defense-in-depth server check for stale page state or direct API calls. **Response 409:** `{ error, approvedAmendmentCount, maxApprovedAmendments }`
  * **Auth:** Requires `X-User-Role` header, any authenticated role.

---

### Verdict Preview (read-only, no persistence)

* `POST /api/verdict/preview`
  * **Role:** Read-only wrapper around `resolveVerdict()` — runs the same profile-resolution + AQL evaluation used by every persisting route, but writes nothing. Callers:
    - `StepReviewSubmit.tsx` (wizard) — always, for its live pre-submit preview.
    - `HistoryFeed.tsx` — **legacy fallback only**, for submissions with no `gradingSnapshot` (AUDIT_REPORT.md #18). Rows with a snapshot render it directly and never call this endpoint.
  * **Payload:** `{ profileId?: string | null, productCode?: string, sampleSize: number, defects: Record<string, number> }`
  * **Response 200:** The full `ResolveVerdictResult` shape — `{ verdict, categoryResults[], categoryAnalysis[], evaluationProfileName, failedDimensions, dimensionResults[], evaluationProfileId, requestedProfileId }`.
  * **`actualAqlAchieved`:** every graded entry in **both** `categoryResults[]` and `categoryAnalysis[]` carries `{ status: 'ACHIEVED' | 'EXCEEDS_ALL' | 'QUALITATIVE', aqlLevel, threshold, evaluatedCount }` — the tightest standard ISO 2859-1 level the observed count still satisfies (`ISO2859_MATH_ENGINE.md` §2A). Required on `categoryResults[]` (which only ever contains graded categories); nullable on `categoryAnalysis[]`, where `null` marks an ungraded RECORD ONLY / OFF category. `StepReviewSubmit.tsx` reads it from `categoryResults[]`; `HistoryFeed.tsx` reads it from the frozen snapshot, falling back to `categoryResults[]` on legacy rows.
  * **Note:** Resolves profiles in `'fallback'` mode (an unresolvable `profileId` degrades to the safety-net profile instead of throwing) — appropriate for a non-authoritative preview, unlike `POST /api/submissions` and `POST /api/amendments/:id/approve` which both throw on an unresolvable explicit `profileId`.
  * **Auth:** None required.

---

### Amendments & Approvals (Group A/B Routes)

* `GET /api/amendments/pending`
  * **Role:** Returns submissions where `amendmentStatus === 'PENDING_APPROVAL'`, with the most recent `AmendmentLog` included for the diff viewer. Ordered by `updatedAt` descending (`id` descending as a tiebreaker).
  * **Query params:** `page` (1-based, default `1`), `limit` (default `50`, capped at `200`) — same pagination contract as `GET /api/submissions`.
  * **Response 200:** `{ amendments[], count, page, limit, totalCount, hasMore }` — `amendments` is the page's rows; `hasMore` indicates whether a further page exists.
  * **Auth:** None required.

* `POST /api/amendments/:id/approve`
  * **Role:** Applies `newValues` from the latest pending `AmendmentLog` to the `Submission` record. Sets `amendmentStatus` to `APPROVED` on both the submission and the log.
  * **Important:** The AQL verdict **and** physical dimension results are recomputed server-side via the shared `resolveVerdict()` engine at approval time — the client-supplied `newValues.verdict` is never trusted for persistence, only retained on the `AmendmentLog` (`recomputedVerdict`, `recomputedCategoryResults`, `recomputedFailedDimensions`, `recomputedDimensionResults`) for audit comparison against what was originally drafted.
  * **Frozen snapshot refreeze (AUDIT_REPORT.md #18):** `Submission.gradingSnapshot`/`gradingSnapshotProfileName` are also rewritten in this same `$transaction`, alongside `verdict` — the two are always written together so a submission's frozen category analysis can never drift out of sync with its own stored verdict.
  * **Response 200:** Includes a `verdictRecompute: { clientSupplied, serverRecomputed, mismatch }` diagnostic block so callers can see whether the recomputed verdict differed from the client's draft.
  * **Auth:** Requires `X-User-Role` header, Group A/B (`MANAGER`, `ADMIN`).

* `POST /api/amendments/:id/reject`
  * **Role:** Discards the draft amendment. Sets `amendmentStatus` to `REJECTED` on both the submission and the log.
  * **Payload (optional):** `{ reason: string }` — overrides the `supervisorNote` on the log if provided.
  * **Auth:** Requires `X-User-Role` header, Group A/B.

---

### PIN User Administration (Group A/B Routes)

* `GET /api/pin-users`
  * **Role:** Lists all `PinUser` rows (active and inactive). Never returns `pinHash`/`pinSalt`.
  * **Auth:** Requires `X-User-Role` header, Group A/B.

* `POST /api/pin-users`
  * **Role:** Creates a new PIN login for floor staff. Validates `role` against the PIN-eligible allow-list (`OPERATOR`, `LEADER`, `SUPERVISOR`, `INTERN`), requires an exactly-6-digit PIN, and rejects (`409`) a PIN already in use by another *active* user.
  * **Payload:** `{ name: string, jobTitle: string, role: 'OPERATOR' | 'LEADER' | 'SUPERVISOR' | 'INTERN', pin: string }`
  * **Response 201:** The created `PinUser` (no `pinHash`/`pinSalt`).
  * **Auth:** Requires `X-User-Role` header, Group A/B.

* `PATCH /api/pin-users/:id/deactivate`
  * **Role:** Soft-deletes a PIN login. The row is kept for audit history; its PIN becomes free for reuse by a new active user.
  * **Auth:** Requires `X-User-Role` header, Group A/B.

* `PATCH /api/pin-users/:id`
  * **Role:** Edits a PIN user's `employeeId` only — the sole exception to `PinUser`'s otherwise deliberate no-edit-after-creation rule. A request body containing `name`, `jobTitle`, or `role` is rejected outright (`400`) rather than silently ignored.
  * **Payload:** `{ employeeId: string }` — normalized to uppercase server-side; uniqueness is checked across ALL rows, not just active ones.
  * **Response 200:** The updated `PinUser` (no `pinHash`/`pinSalt`). **Response 409:** `{ error: 'This Employee ID is already in use.' }` on a collision.
  * **Auth:** Requires `X-User-Role` header, Group A/B.

* `DELETE /api/pin-users/:id`
  * **Role:** Hard-deletes a PIN user, but only when they have zero attributable history — checked across `Submission.pinUserId`, `AmendmentLog.requestedByPinUserId`, and `AmendmentLog.reviewedByPinUserId`.
  * **Response 200:** `{ success: true }`. **Response 409:** `{ error: 'This user has submission history — use Deactivate instead.' }`.
  * **Auth:** Requires `X-User-Role` header, Group A/B.

* `POST /api/auth/pin-login`
  * **Role:** The PIN login step itself. Verifies the submitted PIN against all active `PinUser` rows and returns `{ id, name, jobTitle, role }` on match.
  * **Payload:** `{ pin: string }`
  * **Response:** `200` with the identity object on match, `401 { error: 'Invalid PIN' }` otherwise.
  * **Auth:** None — deliberately ungated, since this endpoint *is* the login step and there is no role to check yet.

* `POST /api/auth/pin-change`
  * **Role:** Self-service PIN change for a PIN-logged-in user. Identity is resolved server-side by scanning active `PinUser` rows and verifying `currentPin` against each hash — **never a client-passed `userId`**. On a match, validates `newPin` (exactly 6 digits, unique among active rows excluding the resolved user's own row) and updates that row's `pinHash`/`pinSalt`.
  * **Payload:** `{ currentPin: string, newPin: string }`
  * **Response:** `200` with the updated `PinUser` (no `pinHash`/`pinSalt`) on success. `401 { error: 'Current PIN is incorrect.' }` if `currentPin` matches no active user. `400 { error: 'New PIN must be exactly 6 digits.' }` for a malformed `newPin`. `409 { error: 'This PIN is already in use by an active user.' }` if `newPin` collides with another active user.
  * **Auth:** None — deliberately ungated, same reasoning as `pin-login`: the correct `currentPin` *is* the identity/authorization check. Available to any PIN-logged-in user, not just Group A/B.

### Global Registry (Master Defect List & Category Inventory)

Management surface for the two global registries introduced in Stage 1 (`DATA_SCHEMAS_AND_TYPES.md` §2.2). Read, create, rename. **Nothing here assigns an entry to a profile or a category** — that stays with `PATCH /api/config`'s `inspectionProfiles` write and its re-projection hook until the Stage 4 picker replaces it.

All six routes are **Group A/B** (`requireGroup('A','B')`), including the two `GET`s.

* `GET /api/registry/categories` · `GET /api/registry/defects`
  * **Response:** `200` with an array of `{ id, code, name, evaluationMode?, locked, submissionCount, profileCount }`. `evaluationMode` is categories-only, and carries the clean enum (`CUMULATIVE` | `GRANULAR` | `QUALITATIVE` | `RECORD_ONLY`), **not** the engine wire format — see the mapping table in `DATA_SCHEMAS_AND_TYPES.md` §2.2.
  * `locked` / `submissionCount` are **derived per request** from frozen `Submission.gradingSnapshot` rows via `loadLockUsage()`, never stored. `submissionCount` counts submissions, not occurrences. `profileCount` is a separate, non-locking figure: how many profiles currently select the entry.

* `POST /api/registry/categories`
  * **Payload:** `{ name: string, evaluationMode: 'CUMULATIVE' | 'GRANULAR' | 'QUALITATIVE' | 'RECORD_ONLY' }`
* `POST /api/registry/defects`
  * **Payload:** `{ name: string }`
  * **Response (both):** `201` with the created entry. The canonical id is slugified server-side into the established family (`def_pin_hole` / `cat_<slug>`), disambiguated with a numeric suffix on collision; the display code (`DEF-050`) continues from the current maximum and never fills a gap or moves. `400` for a blank/oversized name or an unrecognized `evaluationMode`; `409` if the name already exists (compared case-insensitively with internal whitespace collapsed, matching `nameKey`).

* `PATCH /api/registry/categories/:id` — **Payload:** `{ name?, evaluationMode? }` (at least one)
* `PATCH /api/registry/defects/:id` — **Payload:** `{ name }`
  * **Response:** `200` with the updated entry. `404` if the id is unknown. `400` for a blank name, an unrecognized mode, or an empty body. `409` if the new name collides with another entry — **or if the entry is locked**, in which case the body also carries `{ locked: true, submissionCount }`.
  * **Locked entries cannot be renamed, and this is enforced here, not in the UI.** Lock state is re-derived on every request. Frozen grading snapshots store the name captured at submit time, so letting the registry name drift would leave two names for one id in the audit trail with no way to tell which inspection saw which. The modal's disabled inputs are a courtesy; a direct API call is refused identically.

---

## 2. AUTHENTICATION

Full RBAC/session detail (permission groups, idle expiry, dev-gating mechanics) lives in `NAVIGATION_AND_RBAC.md` §2-§5 — this section covers only the two login endpoints/flows and their payloads.

* **Server-side role gate:** Every mutating REST endpoint above requires an `X-User-Role` request header (client-claimed, not a cryptographic token) checked by `requireRole()`/`requireGroup()` — see `NAVIGATION_AND_RBAC.md` §5.1 for the full endpoint-by-endpoint table. This is unrelated to the two login flows below and applies regardless of which one authenticated the caller.

* **Microsoft 365 / Azure AD — live MSAL popup + backend role resolution:**
  - `AuthContext.tsx`'s `loginWithM365()` runs a real `msalInstance.loginPopup()`, then resolves the signed-in user's role via `POST /api/auth/m365-login` (`backend/src/routes/m365Users.routes.ts`) — no mock identities, no dev/prod gating. The full endpoint list, the five-status login lifecycle (`active`/`revoked`/`invite-claimed`/`bootstrap-eligible`/`pending`), and the bootstrap-admin claim flow are documented in `NAVIGATION_AND_RBAC.md` §3.1.
  - `aadObjectId`/`userPrincipalName`/`displayName` are real values read from the MSAL account object (`account.localAccountId`/`account.username`/`account.name`), sent to the backend, and stamped onto `Submission`/`AmendmentLog` rows via `authIdentity()` (`AuthContext.tsx`) — see `DATA_SCHEMAS_AND_TYPES.md` §1's `Submission` interface for the current nullable identity field shape.
  - Credentials (Tenant ID, Client ID — no Client Secret needed for this SPA app registration) have been wired since 2026-08-12; `npm run setup` (`scripts/setup.mjs`) is a day-zero CLI wizard for a new install that prompts for both, validates the Tenant ID against Microsoft's live OpenID discovery endpoint, and writes `frontend/.env.local`.

* **PIN login — real, not mocked:**
  - `POST /api/auth/pin-login` (payload/response documented under "PIN User Administration" above) verifies against a real `PinUser` table (scrypt-hashed PINs). Restricted to the four PIN-eligible roles (`OPERATOR`/`LEADER`/`SUPERVISOR`/`INTERN`).
  - Managed via `GET/POST/PATCH/DELETE /api/pin-users` and `PATCH /api/pin-users/:id/deactivate` (Group A/B only — see above).
  - `POST /api/auth/pin-change` (documented above) lets any PIN-logged-in user change their own PIN — no Group A/B auth needed, since the correct current PIN is itself the identity check.

---

## 3. SHAREPOINT SYNC SERVICE (Graph API)
*[PLANNED — NOT YET IMPLEMENTED]*

* **Objective:** Background service that silently pushes submission data to Microsoft 365.
* **Planned Logic:**
  1. MSAL token fetch (`getSharePointAccessToken`).
  2. Site ID lookup based on environment config.
  3. Graph API `POST` or `PATCH` routines targeting the designated `IPQA_Master_Data` SharePoint list.
