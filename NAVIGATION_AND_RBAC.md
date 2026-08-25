# Information & Navigation Architecture

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines the Routing Map, Role-Based Access Control (RBAC), Permission Groups, and Session Mechanics.

---

## 1. DEPLOYMENT MODEL: SINGLE-TENANT-PER-DEPLOYMENT

**This app is single-tenant-per-deployment, not shared-instance multi-tenant.** Each company that runs this app gets its own separate installation and its own separate database — never a shared instance with data walls between customers. Isolation is achieved structurally, by each company running its own install, not by any in-app tenant-scoping mechanism.

Consistent with that model, there is **no formal `Tenant`/`Facility`/`Line`/`Machine` relational hierarchy anywhere in the schema** — confirmed by a full `schema.prisma` read. Production context is captured as flat, unconstrained string fields directly on `Submission` (`machineId`, `shift`, `batchNumber`, `productCode`, `size`), not a graph of related entities. Within one install, all data is global to that install — e.g. `GET /api/submissions` returns the 50 most recent submissions company-wide, with no facility/line filter, by design.

> **Vestigial fields, not real scoping:** `User.tenantId`/`User.facilityId` (`frontend/src/context/AuthContext.tsx`) are hardcoded display literals (`'TENANT_ONEGLOVE_01'`, `'GLOBAL'` or `'KLANG_PLANT'` depending on login path) baked into the two login functions. They're never sent to the backend, never used to filter any query, and no backend model has a matching column. Don't read these as evidence of real multi-tenancy — they aren't wired to anything.

> **`SystemSettings.tsx`'s "Tenant ID" field** (under `/system`) belongs to a fully separate, not-yet-backend-wired future SharePoint-sync feature — decorative today (hardcoded fake GUID default, `setTimeout`-mocked "Test Connection," a save handler that only fires a toast). Unrelated to access control.

---

## 2. ROLES & PERMISSION GROUPS

Five roles exist. `EXECUTIVE` was merged into `MANAGER` (2026-08-24) — confirmed via a dedicated discovery pass that the two were behaviorally identical everywhere in the codebase (both always mapped to Group B, no code branched on the specific string, zero existing DB rows, no schema change required). On top of the roles sits a coarser **permission group** layer (A/B/C) that most access checks actually gate on. Group is always **derived** from `role` via a pure lookup (`PERMISSION_GROUPS` — `backend/src/middleware/auth.ts`, mirrored in `frontend/src/context/AuthContext.tsx`, kept in sync by convention across the two runtimes, not shared code). Group is never stored on a user record, so it cannot drift independently of role.

| Group | Roles | Real job titles (per Jerry) | Auth Method | Access |
| :---: | :--- | :--- | :--- | :--- |
| **A** | `ADMIN` | IT Admin, C-Suite, Directors | M365 SSO only | Full, including System Admin |
| **B** | `MANAGER` | Department Managers (covers Executives too — see merge note above) | M365 SSO only | Full, except System Admin |
| **C** | `SUPERVISOR`, `LEADER`, `OPERATOR`, `INTERN` | Supervisors, Operators, Leaders/General Workers, Interns | PIN or M365 SSO (M365 for `SUPERVISOR` only — see §3.1) | Wizard + Inspection Records only |

`role` is still the thing every check actually inspects (`requireRole`/`X-User-Role` server-side, `user.role` client-side) — `requireGroup(...)`/`rolesInGroups(...)` are additive conveniences that expand a group list to its equivalent role list, not a replacement system.

**Real identity is never collapsed down to just the group:** `User.title` (frontend) and `PinUser.jobTitle` (backend) carry the actual job title (e.g. "Plant Director", "Line Leader") for display/audit — never read by any permission check, which uses `role` alone.

**Login method does not determine access.** A Supervisor logging in via M365 still resolves to `role: 'SUPERVISOR'` → Group C, identical to a Supervisor logging in via PIN — confirmed live. "Login method and permission level are independent" is a deliberate design rule, not an incidental fact.

---

## 3. AUTHENTICATION: LOGIN METHODS

### 3.1 Microsoft 365 / Azure AD — live MSAL popup, real role resolution

**Credentials wired (2026-08-12), setup wizard added (2026-08-24):** Tenant ID and Client ID live in `frontend/.env.local` (`VITE_MSAL_TENANT_ID`, `VITE_MSAL_CLIENT_ID`) — set either by hand or via `npm run setup` (`scripts/setup.mjs`), a day-zero CLI wizard that prompts for both, validates the Tenant ID against Microsoft's live OpenID discovery endpoint before writing anything, and detects the machine's LAN IPv4 addresses so the operator knows which Redirect URIs still need registering in the Entra App Registration. **Note:** MSAL popup-based OAuth cannot be tested in Claude Code's Browser pane (sandboxed environment limitation); real M365 login can only be verified in a full external browser. See [[project_browser_pane_msal_limitation]] for details.

**App Registration details (confirmed):**
* App type: Single-Page Application (SPA) — no Client Secret required or issued (correct for MSAL.js in a browser context).
* Redirect URI (dev): `http://localhost:4001` — will need a second production redirect URI once a production URL is finalized.
* API permissions granted: `openid`, `profile`, `email`, `User.Read` (standard Microsoft Graph read-only access to the authenticated user's own basic profile only — no files, calendar, mail, or other-user access).
* **jobTitle is NOT available as an ID token claim** in this tenant's Entra configuration — `AuthContext.tsx`'s `resolveM365User()` fetches it via a separate `User.Read` call to Microsoft Graph after sign-in (falling back to an empty title on a Graph hiccup, since title is display/audit-only and never read by a permission check).

**Real flow (live in code — `frontend/src/context/AuthContext.tsx`, `backend/src/routes/m365Users.routes.ts`):**
* `loginWithM365()` runs a real `msalInstance.loginPopup(loginRequest)` — no mock identity picker, no dev/prod branching. On success it calls `resolveM365User()`, which fetches `jobTitle` from Graph and `POST`s `{ aadObjectId, userPrincipalName, displayName, jobTitle }` to `POST /api/auth/m365-login` to resolve the person's role server-side. The same resolution also runs silently on mount (`AuthProvider`'s reauth effect) for a cached MSAL account, so a page refresh re-resolves role from the backend rather than trusting stale client state.
* `POST /api/auth/m365-login` (deliberately ungated — by the time it's called, MSAL has already completed a real Entra popup) branches on the `M365UserRole` table (`backend/prisma/schema.prisma`) to return one of five statuses (`LoginStatus` in `AuthContext.tsx`):
  1. **`active`** — known `aadObjectId`, row active → returns the stored `role`.
  2. **`revoked`** — known `aadObjectId` (or a matched invite) but `isActive: false` → `role: null`, blocks access.
  3. **`invite-claimed`** — no `aadObjectId` match, but an unclaimed invite exists for this UPN (created via `POST /api/m365-users/invite`) → claims it, returns the invited `role`.
  4. **`bootstrap-eligible`** — no match by either, and the `M365UserRole` table is completely empty (fresh install) → `role: null`; the frontend offers `claimBootstrapAdmin()` (`POST /api/auth/claim-bootstrap-admin`, also ungated since no admin exists yet to gate against) to self-assign the first `ADMIN`, race-safe via a fixed sentinel row id.
  5. **`pending`** — no match by either, table not empty → auto-provisions a `role: null` row; the frontend shows the Access Pending screen until a Group A admin assigns a role via `M365UserRolesPanel.tsx` (`PATCH /api/m365-users/:id`).
* Role assignment/offboarding (`GET/PATCH/DELETE /api/m365-users`, `POST /api/m365-users/invite`, `PATCH /api/m365-users/:id/deactivate`, `PATCH /api/m365-users/:id/reactivate`) is Group A only (`requireGroup('A')`) — tighter than PIN admin's Group A/B, since it can grant or remove System Admin. A last-active-ADMIN lockout guards demotion, deactivation, and deletion so the system can never be left with zero active admins.

**Access control (Entra scope):**
* SSO app-level eligibility spans Group A/B/C, but only as far as `SUPERVISOR` within Group C — `ADMIN`, `MANAGER`, `SUPERVISOR` are the three roles `M365UserRolesPanel.tsx` can invite/assign (`backend/src/routes/m365Users.routes.ts`'s `M365_ELIGIBLE_ROLES`). `LEADER`, `OPERATOR`, and `INTERN` remain PIN-only by deliberate decision, with no M365 path.
* **Entra-side dependency, not yet confirmed:** this app-level eligibility only controls what role an admin can *assign* once someone reaches the login screen — it does not by itself change who can complete the Entra security group's login gate. If that Entra-side security group is still scoped to Manager/Admin-tier staff only, a newly-invited Supervisor won't be able to complete the MSAL popup until that group's membership is updated too (an IT-side step, outside this codebase).

### 3.2 PIN Login — real, not mocked

For floor staff without a company email/Microsoft account (high-turnover roles).

* Backed by a real `PinUser` table (`backend/prisma/schema.prisma`): `name`, `employeeId` (company-assigned ID, required + globally unique, always stored/displayed uppercase, no enforced format — see below), `jobTitle` (free-text real title, display/audit only), `role` (restricted server-side to `OPERATOR` | `LEADER` | `SUPERVISOR` | `INTERN` — Group C only), `pinHash`/`pinSalt` (Node's built-in `crypto.scryptSync`; PINs are never stored in plaintext), `active` (soft-delete — deactivated rows are kept for audit history), `mustChangePin` (see below).
* **Identity-first login.** The kiosk (`LoginPage.tsx`) no longer resolves identity from the PIN alone: step 1 is a searchable staff directory (filter-as-you-type by name or Employee ID, sorted alphabetically), fed by `GET /api/auth/pin-directory` — ungated (pre-authentication), explicitly `select`-scoped to `{ id, name, employeeId }` only for active rows, never `pinHash`/`pinSalt`/`jobTitle`/`role`. Step 2 is the existing PIN dots + numeric keypad, now scoped to the account chosen in step 1, with a "Not you? Go back" affordance to return to step 1. `POST /api/auth/pin-login` takes `{ userId, pin }` and verifies `pin` against ONLY that one active row's hash — no more scan-all-active-rows matching. This is why **PIN uniqueness across staff is no longer enforced anywhere** (creation, self-change, admin reset): once identity is chosen before the PIN, two staff sharing a PIN is unambiguous and harmless, and checking/reporting a collision would only leak "a valid PIN exists somewhere" pre-identity-selection. Deactivated accounts are excluded from the directory and cannot log in even with a correct old PIN (`active: true` is part of the lookup itself, not a post-hoc check).
* **mustChangePin — ADMIN/MANAGER never knows a PIN holder's actual working PIN.** `PinUser.mustChangePin` (`Boolean @default(true)`) is set whenever an ADMIN/MANAGER issues a PIN — at creation (`POST /api/pin-users`) or at reset (`PATCH /api/pin-users/:id/reset-pin`, see below) — and cleared only when the PIN holder sets their own PIN via `POST /api/auth/pin-change`. While true, `App.tsx`'s `ProtectedRoute` renders `SetPinPage.tsx` (full-screen, non-dismissible) in place of the app shell for any `loginMethod === 'PIN'` session — same gate-before-shell pattern as `PendingAccessPage`/`RevokedAccessPage`/`BootstrapAdminPage` — forcing the worker to replace the admin-issued temp PIN with one only they know before reaching Wizard/History. Applies uniformly to all four Group C PIN-eligible roles (the gate is on `loginMethod`, not role). Existing accounts as of this field's introduction were explicitly backfilled to `false` (`backend/scripts/backfill-must-change-pin.ts`, run once) — current staff are never retroactively forced through the gate for a PIN they already own.
* **Reset flow — in person only, no self-service trigger.** A worker who forgets their PIN requests a reset in person; there is no in-app self-service reset. `PATCH /api/pin-users/:id/reset-pin` (Group A/B, `PinAdminPanel.tsx`'s "Reset PIN" action per roster row) lets an ADMIN/MANAGER issue a new temp PIN, which sets `mustChangePin: true` again. No uniqueness check (see above).
* Managed via the **Staff PIN Access** screen (`/pin-admin`, Group A/B only — see §4): create (name, employee ID, job title, role, 6-digit PIN — masked `type="password"` input, `autoComplete="new-password"`) and deactivate. The roster defaults to active-only, with a "Show Deactivated" toggle to reveal deactivated rows (visually dimmed, "Deactivated" badge) and a "Temp PIN" badge on any active row still pending its own `mustChangePin` change. **`name`/`jobTitle`/`role` remain uneditable after creation, by deliberate scope choice — `employeeId` is the sole exception.** `PATCH /api/pin-users/:id` lets Group A/B edit `employeeId` only (required, globally unique across all rows — not just active ones, since it's a permanent real-world identity key — and normalized to uppercase server-side regardless of input case); a request body containing `name`/`jobTitle`/`role` is rejected outright rather than silently ignored. Never editable by the PIN user themselves — they have no authenticated session that reaches this route. No reactivate or history view, still by deliberate scope choice.
* **Self-service PIN change** — `POST /api/auth/pin-change` (`backend/src/routes/pinUsers.routes.ts`, same ungated `pinAuthRouter` as `pin-login`). Lets any PIN-logged-in user change their own PIN without manager involvement, reachable via a "Change My PIN" button in `Sidebar.tsx`'s footer (shown only when `user.loginMethod === 'PIN'`) — and reused as-is by `SetPinPage.tsx`'s forced first-login gate above. Payload is `{ userId, currentPin, newPin }`, identity-scoped the same way `pin-login` now is (verifies `currentPin` against only the named user's own row) — no longer a bare scan-all match on `currentPin` alone, which would have become a real ambiguity risk once PIN uniqueness was dropped (two active users could share a `currentPin`, and a scan with no `userId` has no way to know which one is actually mid-change). `newPin` must be exactly 6 digits; no uniqueness check. `401` on a wrong current PIN. Clears `mustChangePin` on success.
* **Hard-delete for zero-history PIN users — implemented and live.** `DELETE /api/pin-users/:id` (`backend/src/routes/pinUsers.routes.ts`, Group A/B) permanently removes a `PinUser` row, but only when it has zero attributable history — checked across `Submission.pinUserId`, `AmendmentLog.requestedByPinUserId`, and `AmendmentLog.reviewedByPinUserId`. Any history returns `409 { error: 'This user has submission history — use Deactivate instead.' }`. Wired into `PinAdminPanel.tsx`'s delete flow with a confirm step. This became buildable once real per-user identity stamping landed (`Submission.pinUserId` FK, replacing the old hardcoded-literal identity columns — `CHANGELOG.md` §5.17); soft-deactivate remains the only removal path for a PIN user with real history.

---

## 4. ROUTING MAP & ACCESS

| Route | Label | Group Access | Functional Description |
| :--- | :--- | :---: | :--- |
| `/wizard` | QUALITY ENTRY WIZARD | A, B, C (all) | Dual-Mode Data Entry: Guided 4-Step Wizard & Multi-Lot Batch Entry Grid. |
| `/history` | INSPECTION RECORDS | A, B, C (all) | Searchable log of past AQL inspections. Expandable AQL category breakdown per record. Export CSV. |
| `/approvals` | APPROVALS QUEUE | A, B | Side-by-side diff viewer for approving or rejecting post-submission amendment drafts. |
| `/analytics` | QUALITY ANALYTICS | A, B | Dynamic Pareto charts, defect trends, and machine comparisons. *[PLANNED — partial implementation]* |
| `/config` | CONFIGURATION CONTROL | A, B | Submenus for Factory Setup, Product Engine, and Quality Rules (profiles, AQL categories, defect definitions). |
| `/pin-admin` | STAFF PIN ACCESS | A, B | Create/deactivate PIN logins for floor staff (§3.2). |
| `/system` | SYSTEM ADMIN | A only | Azure AD / SharePoint sync settings (decorative — §1), enterprise user management. |

* **Default landing route:** all roles land on `/wizard` after login.
* **Unauthorized direct navigation** — typing a gated URL directly, not just having the nav link hidden — bounces to `/wizard`, enforced by `RoleRoute` in `frontend/src/App.tsx`. `RoleRoute`'s allow-lists and `Sidebar.tsx`'s nav-visibility filter are now both derived from the same `rolesInGroups(...)` source (`AuthContext.tsx`), so they cannot silently disagree with each other the way they previously did (`Sidebar` and `RoleRoute` used independently hand-maintained role arrays that had drifted apart on `/analytics`, `/approvals`, and `/config` — see `AUDIT_REPORT.md` §11.1).
* **Planned but not yet implemented on `/history`:** Bulk CSV/Excel import. Currently export-only.

---

## 5. SESSION MECHANICS

### 5.1 Server-side role gate (`X-User-Role` header)

Every mutating backend route is gated by `requireRole(...)`/`requireGroup(...)` (`backend/src/middleware/auth.ts`), which reads the `X-User-Role` request header set by the frontend's `authHeader(user)` helper (`AuthContext.tsx`) on every mutating `fetch()` call:

| Endpoint | Required access |
| :--- | :--- |
| `PATCH /api/config` | Group A/B (`MANAGER`, `ADMIN`) |
| `POST /api/submissions` | Any authenticated role |
| `POST /api/submissions/:id/amendments` | Any authenticated role |
| `POST /api/submissions/mark-history-viewed` | Any authenticated role |
| `POST /api/amendments/:id/approve` | Group A/B |
| `POST /api/amendments/:id/reject` | Group A/B |
| `GET /api/pin-users`, `POST /api/pin-users`, `PATCH /api/pin-users/:id/deactivate` | Group A/B |
| `POST /api/auth/pin-login` | Ungated — this *is* the login step |
| `POST /api/auth/pin-change` | Ungated — the correct current PIN *is* the identity check (§3.2) |
| All `GET` routes (`/api/health`, `/api/config`, `/api/submissions`) and `POST /api/verdict/preview` | Ungated — non-mutating |

Missing header → `401`. Header present but not a recognized role string → `401`. Recognized role outside the route's allow-list → `403`.

> **Not cryptographic auth — stated plainly:** the header is a client-claimed role with no session/JWT/signature behind it, matching the mock-auth maturity of the rest of this app's login flows (§3 above). What it closes is narrower and real: a caller can no longer mutate data while claiming no identity at all, and a caller claiming a role outside a route's allow-list is rejected server-side, independent of whatever the client-side `RoleRoute` UI gate shows. Before this existed, **zero** backend authentication or authorization middleware existed anywhere in this codebase — every mutating endpoint was reachable by any HTTP client with no role check of any kind.

### 5.2 Token-based sessions — still not implemented

Stateless HTTP/REST with JWT bearer tokens (or equivalent) scoped by `userId` remains `[PLANNED — NOT YET IMPLEMENTED]`. Today's "session" is just in-memory React state (`AuthContext`'s `user`), lost on page refresh — both M365 and PIN logins re-authenticate from scratch each time. *(Earlier drafts of this doc scoped a future JWT to `tenantId`/`facilityId`/`lineId` as well as `userId`; per §1's correction, only `userId` scoping would ever be needed — there's no cross-tenant boundary for a token to carry.)*

### 5.3 Idle session expiry — PIN sessions only

`frontend/src/components/auth/IdleSessionGuard.tsx` auto-logs-out **PIN-based sessions only** (`user.loginMethod === 'PIN'`) after a period of inactivity — these are shared floor-tablet kiosks, unlike M365 sessions, which are assumed to be personal devices. Resets on `mousedown`/`keydown`/`touchstart`/`wheel`; on fire, logs out and shows an info toast, landing the user back on `/login`.

```ts
export const PIN_SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
```

**Explicitly a placeholder, not a settled spec** — tune once real floor usage patterns are observed.

---

## 6. SIDEBAR NAVIGATION MECHANICS
*(Refer to `UI_DESIGN_SYSTEM.md` for exact height, color, and padding tokens.)*

* **Responsive Collapsible Behavior:** Auto-collapses to an icon-only strip (`w-20`) on tablet breakpoints and expands (`w-64`) on desktop monitors.
* **Active State:** Highlighted nav item uses `bg-brand-primary text-white`.
* **Inactive State:** `text-muted hover:text-primary hover:bg-surface-light transition-colors`.
* **Nav visibility source of truth:** `Sidebar.tsx`'s item list is filtered by the same `rolesInGroups(...)` allow-lists that gate the routes themselves (§4) — see §4's note on the drift this eliminated.
