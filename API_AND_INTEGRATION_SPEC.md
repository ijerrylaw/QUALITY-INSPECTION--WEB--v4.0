# API Endpoints & Enterprise Integrations Spec

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines REST API contracts, Azure AD M365 authentication flows, and Microsoft Graph / SharePoint syncing. 
*(Note: JSON payload schemas referenced here are defined in DATA_SCHEMAS_AND_TYPES.md).*

---

## 1. REST API ENDPOINTS (Express Backend - Port 4009)

### Submissions & History
* `GET /api/submissions`
  * **Role:** Fetches inspection history. Supports filtering by Lot Number or SKU.
* `POST /api/submissions`
  * **Role:** Submits a completed inspection.
  * **Payload:** Requires complete `Submission` object.
* `POST /api/submissions/:id/amendments`
  * **Role:** Drafts an amendment request on an existing submission. Requires `reason` string. Sets status to `PENDING_APPROVAL`.

### Amendments & Approvals (Executive+ Routes)
* `GET /api/amendments/pending`
  * **Role:** Fetches all submissions where `amendmentStatus === 'PENDING_APPROVAL'`.
* `POST /api/amendments/:id/approve`
  * **Role:** Commits draft changes to database, updates verdict, and sets status to `APPROVED`.
* `POST /api/amendments/:id/reject`
  * **Role:** Discards the draft and resets status to `REJECTED`.

### Configuration Management (Admin+ Routes)
* `PATCH /api/config`
  * **Role:** Updates global variables. 
  * **Payload:** Accepts partial `AppConfig` objects.

---

## 2. ENTERPRISE AUTHENTICATION (Azure AD / MSAL)
* **Flow:** Integrates a popup window flow to authenticate against Microsoft 365, verifying corporate identity.
* **Data Extraction:** Safely parses the JWT to extract `aadObjectId` and `userPrincipalName` for stamping on submissions.

## 3. SHAREPOINT SYNC SERVICE (Graph API)
* **Objective:** Background service that silently pushes data to Microsoft 365.
* **Logic:** 
  1. Executes MSAL token fetching (`getSharePointAccessToken`).
  2. Performs Site ID lookup based on environment config.
  3. Executes Graph API `POST` or `PATCH` routines targeting the designated `IPQA_Master_Data` SharePoint list.