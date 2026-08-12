# API Endpoints & Enterprise Integrations Spec

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines REST API contracts, authentication endpoints (PIN login, mocked M365), and Microsoft Graph / SharePoint syncing.  
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
  * **Auth:** Requires `X-User-Role` header, Group A/B (`EXECUTIVE`, `MANAGER`, `ADMIN`) — see `NAVIGATION_AND_RBAC.md` §5.1.

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
  * **Important:** `profileId` is stored as a plain opaque string, checked against `AppConfig.inspectionProfiles`/the `'prof_default'` sentinel (not a Prisma foreign key — `InspectionProfile` was removed as a relational model). A miss logs a warning and stores `null` rather than hard-failing.
  * **Response 201:** `{ submission, verdict: 'PASSED' | 'FAILED', categoryResults[] }`
  * **Frozen snapshot (AUDIT_REPORT.md #18):** The persisted `submission` also carries `gradingSnapshot`/`gradingSnapshotProfileName` — a richer, self-contained `FrozenCategoryAnalysis[]` (names, AQL level, threshold, eval mode, pass/fail, full per-category defect breakdown) computed by `resolveVerdict()` and stored as JSON. This is **not the same shape** as the response's `categoryResults[]` (which stays the engine's audit-trail `CategoryResult[]` — no `aqlLevel`, failing-defects-only). `HistoryFeed.tsx` reads `gradingSnapshot` directly instead of re-querying `POST /api/verdict/preview`.
  * **Auth:** Requires `X-User-Role` header, any authenticated role — see `NAVIGATION_AND_RBAC.md` §5.1.

* `GET /api/submissions/:id`
  * **Role:** Returns a single submission by ID with its `amendmentLogs`.
  * **Response:** `{ submission }` with relations included.
  * **Auth:** None required.

* `POST /api/submissions/:id/amendments`
  * **Role:** Drafts an amendment request on an existing submission. Sets `amendmentStatus` to `PENDING_APPROVAL` and creates an `AmendmentLog` record.
  * **Payload:** `{ reason: string, newValues: Partial<Submission> }`
  * **Note:** Does NOT re-evaluate the AQL verdict. The verdict in `newValues` is whatever the caller supplies.
  * **Auth:** Requires `X-User-Role` header, any authenticated role.

---

### Verdict Preview (read-only, no persistence)

* `POST /api/verdict/preview`
  * **Role:** Read-only wrapper around `resolveVerdict()` — runs the same profile-resolution + AQL evaluation used by every persisting route, but writes nothing. Callers:
    - `StepReviewSubmit.tsx` (wizard) — always, for its live pre-submit preview.
    - `HistoryFeed.tsx` — **legacy fallback only**, for submissions with no `gradingSnapshot` (AUDIT_REPORT.md #18). Rows with a snapshot render it directly and never call this endpoint.
  * **Payload:** `{ profileId?: string | null, productCode?: string, sampleSize: number, defects: Record<string, number> }`
  * **Response 200:** The full `ResolveVerdictResult` shape — `{ verdict, categoryResults[], categoryAnalysis[], evaluationProfileName, failedDimensions, dimensionResults[], evaluationProfileId, requestedProfileId }`.
  * **Note:** Resolves profiles in `'fallback'` mode (an unresolvable `profileId` degrades to the safety-net profile instead of throwing) — appropriate for a non-authoritative preview, unlike `POST /api/submissions` and `POST /api/amendments/:id/approve` which both throw on an unresolvable explicit `profileId`.
  * **Auth:** Requires `X-User-Role` header, any authenticated role.

---

### Amendments & Approvals (Group A/B Routes)

* `GET /api/amendments/pending`
  * **Role:** Returns all submissions where `amendmentStatus === 'PENDING_APPROVAL'`, with the most recent `AmendmentLog` included for the diff viewer.
  * **Auth:** None required.

* `POST /api/amendments/:id/approve`
  * **Role:** Applies `newValues` from the latest pending `AmendmentLog` to the `Submission` record. Sets `amendmentStatus` to `APPROVED` on both the submission and the log.
  * **Important:** The AQL verdict **and** physical dimension results are recomputed server-side via the shared `resolveVerdict()` engine at approval time — the client-supplied `newValues.verdict` is never trusted for persistence, only retained on the `AmendmentLog` (`recomputedVerdict`, `recomputedCategoryResults`, `recomputedFailedDimensions`, `recomputedDimensionResults`) for audit comparison against what was originally drafted.
  * **Frozen snapshot refreeze (AUDIT_REPORT.md #18):** `Submission.gradingSnapshot`/`gradingSnapshotProfileName` are also rewritten in this same `$transaction`, alongside `verdict` — the two are always written together so a submission's frozen category analysis can never drift out of sync with its own stored verdict.
  * **Response 200:** Includes a `verdictRecompute: { clientSupplied, serverRecomputed, mismatch }` diagnostic block so callers can see whether the recomputed verdict differed from the client's draft.
  * **Auth:** Requires `X-User-Role` header, Group A/B (`EXECUTIVE`, `MANAGER`, `ADMIN`).

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
  * **Role:** Creates a new PIN login for floor staff. Validates `role` against the PIN-eligible allow-list (`OPERATOR`, `LEADER`, `SUPERVISOR`), requires an exactly-6-digit PIN, and rejects (`409`) a PIN already in use by another *active* user.
  * **Payload:** `{ name: string, jobTitle: string, role: 'OPERATOR' | 'LEADER' | 'SUPERVISOR', pin: string }`
  * **Response 201:** The created `PinUser` (no `pinHash`/`pinSalt`).
  * **Auth:** Requires `X-User-Role` header, Group A/B.

* `PATCH /api/pin-users/:id/deactivate`
  * **Role:** Soft-deletes a PIN login. The row is kept for audit history; its PIN becomes free for reuse by a new active user.
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

---

## 2. AUTHENTICATION

Full RBAC/session detail (permission groups, idle expiry, dev-gating mechanics) lives in `NAVIGATION_AND_RBAC.md` §2-§5 — this section covers only the two login endpoints/flows and their payloads.

* **Server-side role gate:** Every mutating REST endpoint above requires an `X-User-Role` request header (client-claimed, not a cryptographic token) checked by `requireRole()`/`requireGroup()` — see `NAVIGATION_AND_RBAC.md` §5.1 for the full endpoint-by-endpoint table. This is unrelated to the two login flows below and applies regardless of which one authenticated the caller.

* **Microsoft 365 / Azure AD — mocked in dev, real integration pending:**
  - **Intended flow (not yet implemented):** MSAL popup authenticates against Microsoft 365; the JWT is parsed to extract `aadObjectId`/`userPrincipalName` for stamping on submissions. Blocked on Jerry's IT manager providing real Azure credentials (Tenant ID, Client ID, Client Secret).
  - **Current dev-only mock:** `frontend/src/context/AuthContext.tsx`'s `loginWithM365(mockIdentityId)` resolves one of 5 hardcoded mock identities spanning all three permission groups — no network call, no real token. `aadObjectId`/`userPrincipalName` on submission payloads are hardcoded mock values until real Azure AD wiring lands. Stripped from production bundles via an `import.meta.env.DEV` gate (build-verified — see `NAVIGATION_AND_RBAC.md` §3.1).

* **PIN login — real, not mocked:**
  - `POST /api/auth/pin-login` (payload/response documented under "PIN User Administration" above) verifies against a real `PinUser` table (scrypt-hashed PINs). Restricted to the three PIN-eligible roles (`OPERATOR`/`LEADER`/`SUPERVISOR`).
  - Managed via `GET/POST /api/pin-users` and `PATCH /api/pin-users/:id/deactivate` (Group A/B only — see above).
  - `POST /api/auth/pin-change` (documented above) lets any PIN-logged-in user change their own PIN — no Group A/B auth needed, since the correct current PIN is itself the identity check.

---

## 3. SHAREPOINT SYNC SERVICE (Graph API)
*[PLANNED — NOT YET IMPLEMENTED]*

* **Objective:** Background service that silently pushes submission data to Microsoft 365.
* **Planned Logic:**
  1. MSAL token fetch (`getSharePointAccessToken`).
  2. Site ID lookup based on environment config.
  3. Graph API `POST` or `PATCH` routines targeting the designated `IPQA_Master_Data` SharePoint list.
