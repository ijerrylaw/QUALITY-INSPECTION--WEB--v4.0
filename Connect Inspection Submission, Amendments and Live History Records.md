# Implementation Plan: Connect Inspection Submissions, Amendments & Live History Records

Integrate full end-to-end backend persistence for AQL inspection submissions and amendments, fixing the bug where submitted inspections and amendment requests do not update the **INSPECTION RECORDS** (`/history`) and **APPROVALS QUEUE** (`/approvals`) pages.

## User Review Required

> [!IMPORTANT]
> **Executive+ Role-Based Access Control (RBAC):**
> In accordance with `NAVIGATION_ARCHITECTURE.md`, approval authority for amendments is strictly restricted to Executive level and above (`EXECUTIVE`, `MANAGER`, `ADMIN`). Operators, Line Leaders, and Supervisors can draft and submit amendment requests from `/history`, but cannot access `/approvals` or approve/reject amendments.

> [!NOTE]
> **Error Handling & Offline Retention:**
> If a submission or amendment request fails due to an offline backend server or network timeout, the application will display an error toast notification via `useToast()` and **retain the user's entered form/grid state intact on screen** so no typed work is lost.

> [!TIP]
> **Model Recommendation (AI_RULES Rule 5):**
> **Recommended Tier: Pro / Reasoning-Heavy Model**
> This task requires multi-file coordination across Guided Wizard, Spreadsheet Grid, History Feed, Approvals Queue, Auth Context, and Backend Amendment routes.

---

## Open Questions

*None — All architectural decisions, data models, error handling strategies, and RBAC constraints have been fully resolved during the `/grill-me` alignment session.*

---

## Proposed Changes

### Auth & RBAC Domain

#### [MODIFY] [AuthContext.tsx](file:///c:/Users/JerryLaw/antigravity/QUALITY-INSPECTION-%28WEB%29-v4.0/frontend/src/context/AuthContext.tsx)
- Extend `UserRole` type definition to include `'EXECUTIVE'`:
  `export type UserRole = 'OPERATOR' | 'LEADER' | 'SUPERVISOR' | 'EXECUTIVE' | 'MANAGER' | 'ADMIN';`
- Update M365/PIN mock user profiles to support testing with Executive role.

#### [MODIFY] [Sidebar.tsx](file:///c:/Users/JerryLaw/antigravity/QUALITY-INSPECTION-%28WEB%29-v4.0/frontend/src/components/layout/Sidebar.tsx)
- Update navigation access for `/approvals` (APPROVALS QUEUE) to allow only Executive level and above:
  `roles: ['EXECUTIVE', 'MANAGER', 'ADMIN']`
- Keep `/history` and `/wizard` accessible to all roles.

---

### Backend API Domain

#### [NEW] [amendments.routes.ts](file:///c:/Users/JerryLaw/antigravity/QUALITY-INSPECTION-%28WEB%29-v4.0/backend/src/routes/amendments.routes.ts)
- Create Express router for amendment operations:
  - `POST /api/submissions/:id/amendments`: Validates amendment request payload (`originalValues`, `newValues`, `reason`, `requestedBy`). Creates an `AmendmentLog` database record and sets the parent submission `amendmentStatus = 'PENDING_APPROVAL'`.
  - `GET /api/amendments/pending`: Returns all `AmendmentLog` records with status `PENDING_APPROVAL` along with target `Submission` metadata for the Approvals Queue.
  - `POST /api/amendments/:id/approve`: Validates Executive+ authority, applies `newValues` onto the parent `Submission` record in SQLite, re-runs the AQL verdict engine (`evaluateAQLVerdict`), updates submission `amendmentStatus = 'APPROVED'`, and sets `AmendmentLog.status = 'APPROVED'`.
  - `POST /api/amendments/:id/reject`: Sets `AmendmentLog.status = 'REJECTED'` and parent submission `amendmentStatus = 'REJECTED'`.

#### [MODIFY] [submissions.routes.ts](file:///c:/Users/JerryLaw/antigravity/QUALITY-INSPECTION-%28WEB%29-v4.0/backend/src/routes/submissions.routes.ts)
- Ensure `GET /api/submissions` includes `amendmentLogs` relation and orders submissions by `createdAt desc`.
- Ensure `POST /api/submissions` calculates and stores the AQL verdict properly.

#### [MODIFY] [server.ts](file:///c:/Users/JerryLaw/antigravity/QUALITY-INSPECTION-%28WEB%29-v4.0/backend/server.ts)
- Mount `amendments.routes.ts` at `/api/amendments`.

---

### Frontend Wizard Domain

#### [MODIFY] [StepReviewSubmit.tsx](file:///c:/Users/JerryLaw/antigravity/QUALITY-INSPECTION-%28WEB%29-v4.0/frontend/src/pages/wizard/StepReviewSubmit.tsx)
- Extract identity details (`user.id` as `aadObjectId`, `user.email`/`user.name` as `userPrincipalName`) from `useAuth()`.
- On clicking **SUBMIT & NEXT LOT**:
  - Construct complete payload matching `POST /api/submissions` schema.
  - Execute `fetch('${API_BASE_URL}/api/submissions', { method: 'POST', body: ... })`.
  - On HTTP 201 Success: Trigger success toast and invoke `onSubmit(retainContext)` to reset wizard.
  - On HTTP/Network Error: Trigger error toast (`Failed to submit inspection. Please check backend connection.`) and **retain draft state on screen without resetting**.

#### [MODIFY] [SpreadsheetGrid.tsx](file:///c:/Users/JerryLaw/antigravity/QUALITY-INSPECTION-%28WEB%29-v4.0/frontend/src/pages/wizard/SpreadsheetGrid.tsx)
- On clicking **SUBMIT BATCH**:
  - Iterate through valid lot rows and execute `POST ${API_BASE_URL}/api/submissions` calls.
  - On Success: Trigger success toast and clear completed grid rows.
  - On Error: Trigger error toast and **retain grid rows intact** for retry.

---

### Frontend History & Approvals Domain

#### [MODIFY] [HistoryFeed.tsx](file:///c:/Users/JerryLaw/antigravity/QUALITY-INSPECTION-%28WEB%29-v4.0/frontend/src/components/history/HistoryFeed.tsx)
- Replace static `MOCK_SUBMISSIONS` with a `useEffect` fetch to `GET ${API_BASE_URL}/api/submissions`.
- Implement fallback: If backend fetch fails (e.g. backend server offline), display fallback mock records so UI remains functional.
- Add an **"Request Amendment"** button to table rows.
- Create an **Amendment Request Modal** component allowing users to edit defect counts/metadata, enter a mandatory reason, and submit `POST ${API_BASE_URL}/api/submissions/:id/amendments`.
- Update row status badge dynamically to `PENDING`.

#### [MODIFY] [ApprovalsQueue.tsx](file:///c:/Users/JerryLaw/antigravity/QUALITY-INSPECTION-%28WEB%29-v4.0/frontend/src/components/approvals/ApprovalsQueue.tsx)
- Replace static mock array with dynamic fetch to `GET ${API_BASE_URL}/api/amendments/pending`.
- Wire **APPROVE & MERGE** button to `POST ${API_BASE_URL}/api/amendments/:id/approve`. On success, remove item from queue and show toast.
- Wire **REJECT** button to `POST ${API_BASE_URL}/api/amendments/:id/reject`. On success, remove item from queue and show toast.
- Enforce Executive+ authorization checks.

---

## Verification Plan

### Automated Tests
- Build verification: `npm run build` in `frontend` and `backend` to ensure strict TypeScript compilation.
- Backend API tests: Exercise `POST /api/submissions`, `GET /api/submissions`, `POST /api/submissions/:id/amendments`, `GET /api/amendments/pending`, and `POST /api/amendments/:id/approve`.

### Manual Verification
1. **Guided Wizard & Spreadsheet Grid Submissions:**
   - Submit a lot in Guided Wizard (`/wizard`). Verify success toast and confirm submission appears at top of `/history`.
   - Submit multi-lot batch in Spreadsheet Grid (`/wizard`). Confirm both lots appear in `/history`.
2. **Amendment Request & History Flow:**
   - On `/history`, click "Request Amendment" on a record, enter modified values & reason, and submit.
   - Confirm status changes to `PENDING` badge in `/history`.
3. **Executive+ Approval Flow:**
   - Log in as Operator/Supervisor — confirm `/approvals` is hidden from left sidebar.
   - Log in as Executive/Manager/Admin — navigate to `/approvals` (APPROVALS QUEUE).
   - Review diff, click **APPROVE & MERGE**. Confirm record status updates to `AMENDED` in `/history` and verdict is re-evaluated if defect counts changed.
4. **Error Handling & Offline Retention:**
   - Stop backend server. Submit an inspection — verify error toast appears and typed form data remains intact on screen.
   - Load `/history` while backend is offline — verify fallback display works gracefully.
