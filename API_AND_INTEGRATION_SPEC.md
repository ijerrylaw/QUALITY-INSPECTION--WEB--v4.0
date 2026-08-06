# API Endpoints & Enterprise Integrations Spec

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines REST API contracts, Azure AD M365 authentication flows, and Microsoft Graph / SharePoint syncing.  
*(Note: JSON payload schemas referenced here are defined in `DATA_SCHEMAS_AND_TYPES.md`.)*

---

## 1. REST API ENDPOINTS (Express Backend — Port 4009)

### Health

* `GET /api/health`
  * **Role:** Returns server and database connectivity status.
  * **Response:** `{ status: 'ok' | 'error', service, database: 'connected' | 'disconnected', timestamp }`
  * **Auth:** None required.

---

### Configuration (Admin+ Routes)

* `GET /api/config`
  * **Role:** Returns the full `AppConfig` singleton (parsed from the Prisma `AppConfig` row). Includes `inspectionProfiles`, `productProfileMap`, `productCodes`, `lines`, `shifts`, `sizes`, `sampleSizes`, `dimensions`, and all SKU option arrays.
  * **Note:** `inspectionProfiles` and `productProfileMap` are returned as already-parsed objects (not raw JSON strings).

* `PATCH /api/config`
  * **Role:** Partially updates the global `AppConfig`.
  * **Payload:** Accepts a partial `AppConfig` object. Any supplied key is merged and persisted.

---

### Submissions & History

* `GET /api/submissions`
  * **Role:** Returns the 50 most recent inspection submissions, ordered by creation date descending. Includes `amendmentLogs` for each record.

* `POST /api/submissions`
  * **Role:** Submits a completed AQL inspection. Runs the `evaluateAQLVerdict` engine and persists the result.
  * **Payload:** Full `Submission` object. `profileId` is **optional** — if absent or empty, the backend resolves the profile in this order:
    1. `productProfileMap[productCode]` in AppConfig
    2. First AppConfig profile with valid `aqlLevel` + `evaluationMode` rules
    3. Hardcoded GLOBAL STANDARD (DEFAULT) profile
  * **Important:** `profileId` stored in the DB will be `null` if no Prisma `InspectionProfile` row exists for the resolved profile (AppConfig-only profiles are not FK-linked).
  * **Response 201:** `{ submission, verdict: 'PASSED' | 'FAILED', categoryResults[] }`

* `GET /api/submissions/:id`
  * **Role:** Returns a single submission by ID with its `amendmentLogs` and linked `profile` (if any).
  * **Response:** `{ submission }` with relations included.

* `POST /api/submissions/:id/amendments`
  * **Role:** Drafts an amendment request on an existing submission. Sets `amendmentStatus` to `PENDING_APPROVAL` and creates an `AmendmentLog` record.
  * **Payload:** `{ reason: string, newValues: Partial<Submission> }`
  * **Note:** Does NOT re-evaluate the AQL verdict. The verdict in `newValues` is whatever the caller supplies.

---

### Amendments & Approvals (Executive+ Routes)

* `GET /api/amendments/pending`
  * **Role:** Returns all submissions where `amendmentStatus === 'PENDING_APPROVAL'`, with the most recent `AmendmentLog` included for the diff viewer.

* `POST /api/amendments/:id/approve`
  * **Role:** Applies `newValues` from the latest pending `AmendmentLog` to the `Submission` record. Sets `amendmentStatus` to `APPROVED` on both the submission and the log.
  * **Important:** This applies the pre-stored `newValues` verbatim — it does **not** recompute the AQL verdict. Any verdict change must be explicitly included in `newValues` at amendment-draft time.

* `POST /api/amendments/:id/reject`
  * **Role:** Discards the draft amendment. Sets `amendmentStatus` to `REJECTED` on both the submission and the log.
  * **Payload (optional):** `{ reason: string }` — overrides the `supervisorNote` on the log if provided.

---

## 2. ENTERPRISE AUTHENTICATION (Azure AD / MSAL)
*(Currently mocked in development — see §2 note below)*

* **Intended Flow:** Integrates a popup window flow to authenticate against Microsoft 365, verifying corporate identity.
* **Data Extraction:** Parses the JWT to extract `aadObjectId` and `userPrincipalName` for stamping on submissions.
* **[MOCK IN DEV]:** The current implementation uses a mock auth context:
  - M365 SSO popup → logs in as `ADMIN` role
  - 6-digit PIN (`123456`) → logs in as `OPERATOR` role
  - `aadObjectId` and `userPrincipalName` are hardcoded mock values on submission payloads until Azure AD wiring is complete.

---

## 3. SHAREPOINT SYNC SERVICE (Graph API)
*[PLANNED — NOT YET IMPLEMENTED]*

* **Objective:** Background service that silently pushes submission data to Microsoft 365.
* **Planned Logic:**
  1. MSAL token fetch (`getSharePointAccessToken`).
  2. Site ID lookup based on environment config.
  3. Graph API `POST` or `PATCH` routines targeting the designated `IPQA_Master_Data` SharePoint list.
