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

Six roles exist, unchanged from the original design. On top of them sits a coarser **permission group** layer (A/B/C) that most access checks actually gate on. Group is always **derived** from `role` via a pure lookup (`PERMISSION_GROUPS` — `backend/src/middleware/auth.ts`, mirrored in `frontend/src/context/AuthContext.tsx`, kept in sync by convention across the two runtimes, not shared code). Group is never stored on a user record, so it cannot drift independently of role.

| Group | Roles | Real job titles (per Jerry) | Auth Method | Access |
| :---: | :--- | :--- | :--- | :--- |
| **A** | `ADMIN` | IT Admin, C-Suite, Directors | M365 SSO only | Full, including System Admin |
| **B** | `EXECUTIVE`, `MANAGER` | Department Managers, Executives (a level below Manager) | M365 SSO only | Full, except System Admin |
| **C** | `SUPERVISOR`, `LEADER`, `OPERATOR` | Supervisors, Operators, Leaders/General Workers | PIN or M365 SSO | Wizard + Inspection Records only |

`role` is still the thing every check actually inspects (`requireRole`/`X-User-Role` server-side, `user.role` client-side) — `requireGroup(...)`/`rolesInGroups(...)` are additive conveniences that expand a group list to its equivalent role list, not a replacement system.

**Real identity is never collapsed down to just the group:** `User.title` (frontend) and `PinUser.jobTitle` (backend) carry the actual job title (e.g. "Plant Director", "Line Leader") for display/audit — never read by any permission check, which uses `role` alone.

**Login method does not determine access.** A Supervisor logging in via mock M365 still resolves to `role: 'SUPERVISOR'` → Group C, identical to a Supervisor logging in via PIN — confirmed live. "Login method and permission level are independent" is a deliberate design rule, not an incidental fact.

---

## 3. AUTHENTICATION: LOGIN METHODS

### 3.1 Microsoft 365 / Azure AD — credentials received, MSAL.js wiring pending

**Credentials received:** Tenant ID and Client ID obtained from IT on 2026-08-10. **Real MSAL.js implementation is not yet started** — that work is queued as a separate task, pending its own `/grill-me` session before code begins.

**App Registration details (confirmed):**
* App type: Single-Page Application (SPA) — no Client Secret required or issued (correct for MSAL.js in a browser context).
* Redirect URI (dev): `http://localhost:4001` — will need a second production redirect URI once a production URL is finalized.
* API permissions granted: `openid`, `profile`, `email`, `User.Read` (standard Microsoft Graph read-only access to the authenticated user's own basic profile only — no files, calendar, mail, or other-user access).
* **jobTitle is NOT available as an ID token claim** in this tenant's Entra configuration — it must be fetched via a separate `User.Read` call to Microsoft Graph after sign-in, not read directly from the ID token.

**Access control (Entra scope):**
* SSO is restricted to users in a dedicated Entra ID security group containing only Manager/Executive/Admin-tier staff (Group A and Group B in this app — corresponding to `ADMIN`, `EXECUTIVE`, `MANAGER` roles).
* Supervisors and below (Group C: `SUPERVISOR`, `LEADER`, `OPERATOR`) continue using PIN login exclusively. SSO does not need to, and will not, cover floor-tier roles.

**Current state in code:**
* **Dev-only mock** (`frontend/src/context/AuthContext.tsx`'s `MOCK_M365_IDENTITIES`) — 5 identities deliberately spanning all three permission groups (2× Group A, 2× Group B, 1× Group C via a Supervisor identity), so every group is reachable through this login path for testing. The old mock always resolved to `ADMIN` regardless of which name was picked.
* **Gated so it can never leak into production**, three layers:
  1. `LoginPage.tsx` renders the mock-identity picker only when `import.meta.env.DEV` (Vite's build-time dev/prod flag); otherwise a disabled button reads "Pending Azure AD configuration."
  2. `AuthContext.loginWithM365` self-guards independently (`if (!import.meta.env.DEV) throw`), in case anything ever calls it outside the gated UI path.
  3. `MOCK_M365_IDENTITIES` itself is defined behind the same `import.meta.env.DEV` ternary at its own declaration site (not just around its usages), so `vite build`'s minifier drops the array from the production bundle entirely. Verified via `npm run build --workspace=frontend` + grepping the built JS for all five mock names/emails/ids — confirmed `0` matches.

**When MSAL.js wiring is implemented**, the isolated swap will be: replace `loginWithM365`'s body with real MSAL popup/redirect flow that:
* Exchanges an authorization code for an ID token (containing `openid`, `profile`, `email` claims plus any app-specific claims).
* Fetches `jobTitle` via a separate `User.Read` call to Microsoft Graph (not from the token).
* Resolves the authenticated user's role by checking their Entra ID group membership against the configured security group, then maps that to `role` (`ADMIN` / `EXECUTIVE` / `MANAGER` only — others remain in `role: 'SUPERVISOR'` and get PIN login instead).
* Remove the dev gate. Nothing else on this page — `requireGroup`, `X-User-Role`, `RoleRoute`, `Sidebar`, the PIN system — needs to change; all of it is independent of *how* a role was obtained.

### 3.2 PIN Login — real, not mocked

For floor staff without a company email/Microsoft account (high-turnover roles).

* Backed by a real `PinUser` table (`backend/prisma/schema.prisma`): `name`, `jobTitle` (free-text real title, display/audit only), `role` (restricted server-side to `OPERATOR` | `LEADER` | `SUPERVISOR` — Group C only), `pinHash`/`pinSalt` (Node's built-in `crypto.scryptSync`; PINs are never stored in plaintext), `active` (soft-delete — deactivated rows are kept for audit history and their PIN becomes free for reuse).
* `POST /api/auth/pin-login` (`backend/src/routes/pinUsers.routes.ts`) — deliberately ungated, since it *is* the login step; there's no role to check yet. Scans active `PinUser` rows and verifies the submitted PIN against each; returns `{ id, name, jobTitle, role }` on match, `401` otherwise.
* Managed via the **Staff PIN Access** screen (`/pin-admin`, Group A/B only — see §4): create (name, job title, role, 6-digit PIN — uniqueness enforced among active rows only, so a deactivated person's old PIN becomes reusable) and deactivate. The roster defaults to active-only, with a "Show Deactivated" toggle to reveal deactivated rows (visually dimmed, "Deactivated" badge). No edit (of name/jobTitle/role), reactivate, or history view, by deliberate scope choice.
* **Self-service PIN change** — `POST /api/auth/pin-change` (`backend/src/routes/pinUsers.routes.ts`, same ungated `pinAuthRouter` as `pin-login`). Lets any PIN-logged-in user change their own PIN without manager involvement, reachable via a "Change My PIN" button in `Sidebar.tsx`'s footer (shown only when `user.loginMethod === 'PIN'`). Payload is `{ currentPin, newPin }` — **never a client-passed userId**; identity is established purely by finding which active `PinUser` row's hash the submitted `currentPin` verifies against, the same scan `pin-login` already does. `newPin` must be exactly 6 digits and unique among active rows (excluding the resolved user's own row) — identical validation rule to creation. `401` on a wrong current PIN, `409` on a colliding new PIN.
* **Hard-delete for zero-history PIN users — considered, not built.** Deleting a `PinUser` outright (vs. soft-deactivate) was scoped for staff added by mistake with no real floor history, gated on confirming zero associated `Submission` rows first. Discovery found `Submission.aadObjectId`/`userPrincipalName` are hardcoded literals for every submission regardless of login method — no submission today is attributable to any specific user, PIN or M365 — so a "zero history" check cannot be built reliably without first fixing that deeper identity-stamping gap. Descoped; see `AUDIT_REPORT.md` for the full finding. Soft-deactivate remains the only way to remove a PIN login.

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
| `PATCH /api/config` | Group A/B (`EXECUTIVE`, `MANAGER`, `ADMIN`) |
| `POST /api/submissions` | Any authenticated role |
| `POST /api/submissions/:id/amendments` | Any authenticated role |
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
