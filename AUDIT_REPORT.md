# AUDIT_REPORT.md

**Scope:** Read-only discovery/verification pass. Nothing in this pass was fixed, refactored, or edited.
**Date:** 2026-08-07
**Method:** Three parallel codebase-exploration passes (structure/docs, routing/RBAC/UI, engine/config/amendments), followed by direct source verification of the highest-stakes claims (`App.tsx`, `AuthContext.tsx`, `config.routes.ts`, `submissions.routes.ts`, `StepReviewSubmit.tsx`, `git status`).

---

## 1. Executive Summary — Top 5 Issues by Risk

| # | Issue | Severity |
|---|---|---|
| 1 | A **fourth, undocumented, live copy of the AQL verdict engine** runs inside the actual submission/amendment wizard (`frontend/src/pages/wizard/StepReviewSubmit.tsx`) with a different bracket table, different snap algorithm, different matrix values, and no `N/A`-mode handling — materially different math from the real backend engine, yet its output is what operators see and what gets written into amendments. | **Critical** |
| 2 | **Amendment approval persists the verdict verbatim** (`backend/src/routes/submissions.routes.ts:541`) with no re-invocation of `evaluateAQLVerdict`. Combined with #1, an approved amendment can carry a verdict computed by the least-accurate engine copy in the codebase, permanently, with no server-side check against the defect counts in the same amendment. | **Critical** |
| 3 | **Zero backend authentication/authorization exists at all.** All RBAC is enforced only in the React router (`RoleRoute` in `frontend/src/App.tsx`); every Express endpoint, including `PATCH /api/config` and `POST /api/amendments/:id/approve`, is completely open to any caller who can reach port 4009 (no auth middleware registered in `backend/server.ts`). This is a narrower gap than `NAVIGATION_AND_RBAC.md` claims (routes *are* client-side gated) but arguably more severe, since the actual data-mutation endpoints have no protection whatsoever. | **High** |
| 4 | **Sidebar navigation visibility disagrees with the router's actual role gates** on all three restricted routes (`/approvals`, `/analytics`, `/config`) — e.g. a SUPERVISOR sees an "Approvals" nav link that immediately bounces them back to `/wizard`, while an EXECUTIVE is authorized for `/config` by the router but the sidebar never shows them the link. | **Medium** |
| 5 | **Multi-tenancy is decorative only.** No `Tenant`/`Facility`/`Line`/`Machine` model, no `tenantId`/`facilityId` column, anywhere in the Prisma schema; the frontend's `tenantId`/`facilityId` are hardcoded mock strings never transmitted to or enforced by the backend. This matters directly for the stated goal of reselling to other glove manufacturers — the app is effectively single-tenant today, with no schema scaffolding in place for multi-tenant separation. | **Medium–High** (severity rises with resale timeline) |

---

## 2. Part A — Baseline Discovery

### 2.1 Git status

```
On branch master
Your branch is ahead of 'origin/master' by 1 commit.
Changes not staged for commit:
	modified:   backend/dev.db
Untracked files:
	.claude/
```

- The working tree is **not clean**. `backend/dev.db` (a binary SQLite file) has uncommitted changes, and `.claude/` (local tool config) is untracked.
- Local `master` is 1 commit ahead of `origin/master` — unpushed work exists.
- **Assessment:** flagged per your request, but low actual risk. No application source file has uncommitted changes; the only diff is the dev database binary (expected churn from running the app locally) and a local Claude Code config directory. Nothing here indicates lost work. Recommend deciding whether `backend/dev.db` should be gitignored going forward (it currently isn't — check `backend/.gitignore`, which ignores `node_modules`, `.env`, `/generated/prisma` but not `dev.db`) to stop this file from showing as dirty on every session.

### 2.2 Project structure & tech stack

```
QUALITY-INSPECTION-(WEB)-v4.0/
├── AI_RULES.md, API_AND_INTEGRATION_SPEC.md, DATA_SCHEMAS_AND_TYPES.md,
│   ISO2859_MATH_ENGINE.md, NAVIGATION_AND_RBAC.md, UI_DESIGN_SYSTEM.md   ← the 6 docs under review
├── archived/                          # 8 superseded doc versions, not referenced by code
├── test_post.js                       # ad-hoc manual test script (hardcoded oneglove.com email)
├── package.json                       # npm workspaces: [frontend, backend]
│
├── backend/
│   ├── .env                           # DATABASE_URL etc. (gitignored)
│   ├── check_db.js / check_db.ts      # near-duplicate ad-hoc DB inspection scripts
│   ├── dev.db                         # SQLite dev database (~155KB)
│   ├── generated/prisma/              # Prisma-generated client (custom output path, gitignored)
│   ├── prisma/schema.prisma           # Prisma schema (provider = sqlite; comment notes swap to Postgres for prod)
│   ├── prisma/migrations/20260723114800_init_schema/
│   ├── server.ts                      # Express entrypoint, port 4009
│   ├── src/engine/
│   │   ├── aqlEvaluator.ts            # LIVE verdict engine (mounted)
│   │   ├── evaluateAQLVerdict.ts + getAQLThresholds.ts   # DEAD duplicate engine (unmounted)
│   │   └── iso2859-matrix.ts
│   ├── src/lib/prismaClient.ts
│   ├── src/routes/
│   │   ├── config.routes.ts
│   │   ├── submissions.routes.ts      # 614 lines — LIVE, mounted in server.ts
│   │   └── submissions.ts             # 236 lines — DEAD, never imported anywhere
│   └── test_api.mjs / test_api.ps1 / test_fail.json / test_pass.json   # ad-hoc test scripts, no test runner wired up
│
└── frontend/
    ├── src/App.tsx                    # router + RoleRoute/ProtectedRoute
    ├── src/context/AuthContext.tsx    # mock M365/PIN auth
    ├── src/context/ConfigContext.tsx  # AppConfig fetch/merge
    ├── src/components/                # mix of live and dead components (see §2.5)
    └── src/pages/                     # live routed pages + config/wizard subfolders
```

**Tech stack:**
- **Frontend:** React 19.2.7, React Router 7.18.1, Vite 8.1.1, Tailwind CSS 4.0.0, `lucide-react`, `motion` (Framer Motion successor), `recharts`, TypeScript ~6.0.2, oxlint.
- **Backend:** Express 4.21.2, Prisma 7.9.0 (Early Access) with `@prisma/adapter-libsql` + `@libsql/client` (SQLite/libSQL driver), `cors`, `dotenv`, run via `tsx` (no compile step in dev).
- **Database/ORM:** Prisma 7, SQLite for dev (`backend/dev.db`); schema comment indicates PostgreSQL is intended for production but no such config exists yet.
- **Hosting:** **No hosting/deployment config found anywhere** — no `Dockerfile`, `docker-compose.yml`, `vercel.json`, `railway.toml`, CI YAML, or `Procfile`. The only launch config is `.claude/launch.json` (local dev convenience only: Vite on :4001, Express on :4009).

### 2.3 Pages / routes

| Path | Component | Role guard (router) |
|---|---|---|
| `/login` | `LoginPage` | Public |
| `/wizard` | `WizardPage` (multi-step batch inspection submission + amendment editing) | Any authenticated user |
| `/history` | `HistoryPage` → `HistoryFeed` (submission history, verdict display, amendment badges) | Any authenticated user |
| `/approvals` | `ApprovalsPage` → `ApprovalsQueue` (pending amendment approve/reject queue) | EXECUTIVE, MANAGER, ADMIN |
| `/analytics` | `AnalyticsPage` → `AnalyticsDashboard` (Pareto charts, defect trends) | SUPERVISOR, EXECUTIVE, MANAGER, ADMIN |
| `/config` | `ConfigPage` → `FactorySetup`, `ProductEngine`, `QualityRules` | EXECUTIVE, MANAGER, ADMIN |
| `/system` | `SystemPage` → `SystemSettings` (branding, mock SharePoint/Azure AD settings) | ADMIN |

### 2.4 Database tables / models (`backend/prisma/schema.prisma`)

- **`Submission`** — the core inspection record: `productCode`, `productionDate`, `samplingTime`, `machineId` (flat string, no FK), `shift`, `batchNumber`, `size`, `sampleSize`, `dimensions`/`dimensionMins` (JSON strings), `defects` (JSON string), `verdict`, `aadObjectId`, `userPrincipalName`, `amendmentStatus`, `profileId` (nullable FK), plus optional weight/carton fields.
- **`AmendmentLog`** — `submissionId`, `newValues` (JSON string), `status` (PENDING_APPROVAL/APPROVED/REJECTED), `requestedBy`, `reviewedBy`, `reviewedAt`.
- **`InspectionProfile`** — real Prisma-backed profile table (separate from the AppConfig-JSON profile system — see §4.3).
- **`AQLCategory`** — `aqlLevel`, `evaluationMode` (`CUMULATIVE`/`GRANULAR`/`N/A`/`''`).
- **`DefectDefinition`** — `defaultClass`, `currentClass` (no `categoryId` field in Prisma).
- **`AppConfig`** — singleton config row (`id: '1'`), ~19 JSON-serialized string fields (`inspectionProfiles`, `productProfileMap`, `productCodes`, `lines`, `shifts`, SKU dictionaries, etc.) plus scalar `companyName`/`portalTitle`/`logoImage`/`accentColor`. Also still carries **legacy root-level `aqlCategories`/`defectDefinitions` columns** that appear unused by the live profile system (see §5).

**No `Tenant`, `Facility`, `Line`, or `Machine` model exists** — confirmed by full schema read and a repo-wide grep for `tenantId|facilityId|Tenant|Facility` in `backend/` (zero hits).

### 2.5 Orphaned / unused files

Confirmed dead (not imported anywhere, verified by cross-reference grep):

| File | Notes |
|---|---|
| `backend/src/routes/submissions.ts` | Older 236-line twin of the live 614-line `submissions.routes.ts`; `server.ts` only imports the latter. |
| `frontend/src/components/wizard/StepAqlPlan.tsx` | Entire `components/wizard/` subtree (5/5 files) superseded by `pages/wizard/*`. |
| `frontend/src/components/wizard/StepBatchInfo.tsx` | Same. Hardcodes a fixed product-code list (§2.6). |
| `frontend/src/components/wizard/StepDefectCounter.tsx` | Same. |
| `frontend/src/components/wizard/StepReviewSubmit.tsx` | Same. **Name-collides** with the live `pages/wizard/StepReviewSubmit.tsx` — easy to edit the wrong file by mistake. |
| `frontend/src/components/wizard/WizardStepper.tsx` | Same. |
| `frontend/src/components/config/ConfigDashboard.tsx` | Superseded by `pages/config/*`. Hardcodes `SKU_MATERIALS` and a demo profile named after real client "Ansell." |
| `frontend/src/components/ui/Badge.tsx` | Shared badge component, never imported anywhere — and it itself violates the documented badge style (§4.8). |
| `frontend/src/pages/config/InspectionRules.tsx` | Never wired into `ConfigPage.tsx`. Own header comment admits "Uses mock state until the backend Profile API is implemented." Contains `MOCK_PROFILES` referencing "Ansell." |
| `frontend/src/pages/config/ProductCatalog.tsx` | Never imported anywhere. |

Also present but not "dead code" per se — ad-hoc developer scripts with no test-runner wiring: `backend/check_db.js`, `backend/check_db.ts`, `backend/test_api.mjs`, `backend/test_api.ps1`, `backend/test_fail.json`, `backend/test_pass.json`, root `test_post.js`. No `.old`/`.bak`/`*copy*` files found anywhere. No large commented-out code blocks found.

**Dev-only leftover in a live file:** `frontend/src/pages/ConfigPage.tsx` (~line 158, 297-299) renders a "Developer Tool: Mock Edit Button to test Dirty state" directly in the production Configuration Control page.

### 2.6 Doc-vs-code comparison (MOCK / PLANNED / NOT YET IMPLEMENTED claims)

| Doc claim | Still accurate? |
|---|---|
| `API_AND_INTEGRATION_SPEC.md`: `[MOCK IN DEV]` — M365 SSO → ADMIN, PIN 123456 → OPERATOR | **Accurate.** Confirmed directly in `AuthContext.tsx:30-63`. |
| `API_AND_INTEGRATION_SPEC.md`: SharePoint Sync Service `[PLANNED — NOT YET IMPLEMENTED]` | **Accurate.** `SystemSettings.tsx` only has a decorative URL field and a `setTimeout`-mocked "Test Connection" button; no Graph API integration exists anywhere in `backend/`. |
| `NAVIGATION_AND_RBAC.md`: "Role-gating on routes is not yet enforced by the router — all routes are accessible regardless of role" | **STALE / INCORRECT.** `App.tsx:63-82` actively enforces `RoleRoute` on `/approvals`, `/analytics`, `/config`, `/system`. This doc needs updating — see Part B §1. |
| `NAVIGATION_AND_RBAC.md`: `/analytics` "`[PLANNED — partial implementation]`" | Partially stale — `AnalyticsDashboard.tsx` is a fully live, routed, rendering component (not partial in the sense of "not built"), though it does use raw hardcoded demo data rather than live aggregation queries — see §4.8 note. |
| `NAVIGATION_AND_RBAC.md`: "Planned but not yet implemented on `/history`: Bulk CSV/Excel import" | **Accurate** — no import functionality found in `HistoryFeed.tsx`, only export. |
| `NAVIGATION_AND_RBAC.md`: JWT/tenant-scoped sessions `[PLANNED — NOT YET IMPLEMENTED]` | **Accurate**, and understates the gap — see Part B §7. |
| `ISO2859_MATH_ENGINE.md`: `HistoryFeed.tsx` contains a "display-only inline copy" of the verdict engine | **Accurate but incomplete** — the doc misses the far more consequential live duplicate in `StepReviewSubmit.tsx` (Part B §2). |

### 2.7 Hardcoded company-specific values (resale relevance)

| File:Line | Value |
|---|---|
| `frontend/src/components/layout/Sidebar.tsx:71` | `"ONE GLOVE GROUP"` — hardcoded sidebar branding, not sourced from `AppConfig.companyName` |
| `frontend/src/context/AuthContext.tsx:38,40` | `admin@oneglove.com`, `TENANT_ONEGLOVE_01` |
| `frontend/src/context/AuthContext.tsx:60` | `TENANT_ONEGLOVE_01` |
| `frontend/src/pages/WizardPage.tsx:281` | `operator@oneglove.com` (mock submission payload) |
| `frontend/src/pages/wizard/BatchEntry.tsx:458` | `operator@oneglove.com` |
| `frontend/src/components/system/SystemSettings.tsx:111` | `https://oneglove.sharepoint.com/sites/QualityAssurance` default value |
| `backend/src/routes/submissions.routes.ts:442` | `requestedBy: 'operator@oneglove.com'` |
| `backend/src/routes/submissions.routes.ts:551,598` | `reviewedBy: 'executive@oneglove.com'` |
| `test_post.js:15` (root) | `operator@oneglove.com` |
| `frontend/src/components/config/ConfigDashboard.tsx:14,17` | `SKU_MATERIALS = ['Nitrile','Latex','Vinyl','Neoprene']`; demo profile `"Strict Client (Ansell)"` — real third-party company name in demo data (dead file) |
| `frontend/src/pages/config/InspectionRules.tsx:59` | `"ANSELL STRICT RULES"` in `MOCK_PROFILES` (dead file) |
| `frontend/src/pages/config/ProductEngine.tsx:36,38` | Fallback defaults hardcode `'Nitrile'` / `'Sky Blue'` as sole SKU options if `AppConfig` hasn't loaded yet |
| `frontend/src/components/wizard/StepBatchInfo.tsx:18,20` | Hardcoded product-code list (dead file) |

No physical addresses found. All company-specific hardcoding is `oneglove.com`-branded mock data, mostly confined to auth mocks and dead files — genuinely live, non-mock company-specific data is limited to the Sidebar branding string and the SharePoint URL default, both of which are easy single-point fixes before white-labeling for another manufacturer.

---

## 3. Part B — Targeted Verification

### B1. Route security — **Severity: High** (reframed from "Critical" as originally suspected — see explanation)

**Doc claim:** role-gating is not enforced by the router; all routes reachable regardless of role.

**Finding: the doc is wrong about the frontend.** Verified directly in `frontend/src/App.tsx:35-82`:
- `RoleRoute` (lines 36-44) checks `allowedRoles.includes(user.role)` and redirects to `/wizard` if not authorized.
- Applied to `/approvals` (EXECUTIVE/MANAGER/ADMIN, line 64), `/analytics` (SUPERVISOR/EXECUTIVE/MANAGER/ADMIN, line 69), `/config` (EXECUTIVE/MANAGER/ADMIN, line 74), `/system` (ADMIN only, line 79).
- `/wizard` and `/history` are intentionally open to all authenticated roles — matches the doc's own RBAC matrix for those two routes.

**How role resolves** (`AuthContext.tsx`, verified directly):
- `loginWithM365()` (lines 30-43): after a fake 800ms delay, unconditionally sets `role: 'ADMIN'`, `tenantId: 'TENANT_ONEGLOVE_01'`.
- `loginWithPIN()` (lines 46-63): only checks `pin !== '123456'`; on success, unconditionally sets `role: 'OPERATOR'` regardless of which user was selected in the login dropdown.
- **Notable gap the doc doesn't mention:** `LoginPage.tsx` offers a "Leader" account option in the PIN-login dropdown, but `loginWithPIN` always hardcodes `role: 'OPERATOR'` — selecting "Leader" silently logs the user in as OPERATOR, not LEADER. The picked `userId` is stored but never used to derive role.

**Why this is still High severity despite the frontend guard existing:** the guard is 100% client-side. `backend/server.ts` registers only `cors()` and `express.json()` before mounting routes — **no authentication or authorization middleware exists anywhere in the backend.** Every endpoint, including `PATCH /api/config` and `POST /api/amendments/:id/approve`, will execute for any HTTP client that reaches port 4009, with no token, header, or session check of any kind (confirmed: repo-wide grep for `jwt`, `Authorization`, `Bearer`, `passport` in `backend/` returns zero hits, and there's no such dependency in `backend/package.json`). Bypassing the UI's `RoleRoute` entirely (curl, Postman, browser devtools) grants full access to every mutating endpoint regardless of role.

**Recommendation for the doc:** rewrite `NAVIGATION_AND_RBAC.md`'s "not enforced by the router" claim — it's enforced client-side, but needs to explicitly call out that there is **no server-side enforcement at all**, which is the actual security-critical gap.

### B2. Duplicate verdict logic — **Severity: Critical**

**Doc claim:** the real engine lives in `backend/src/engine/aqlEvaluator.ts`; a "display-only" copy exists in `frontend/src/components/history/HistoryFeed.tsx`.

**Confirmed: both exist, plus two more copies the docs don't mention.**

1. **`backend/src/engine/aqlEvaluator.ts:213-323`** (the real, mounted engine, imported by the live `submissions.routes.ts:25`):
   - `N/A` mode (213-256): fails a defect when `defectCounts[def.id] === 2`.
   - `CUMULATIVE` (259-284): sums all defect counts, passes if `total <= threshold.ac`.
   - `GRANULAR` (287-316): fails per-defect if `count > threshold.ac`.
   - Empty `evaluationMode` → category skipped (line 221).
   - Single failing category fails the whole lot.

2. **`backend/src/engine/evaluateAQLVerdict.ts` + `getAQLThresholds.ts`** — byte-for-byte equivalent dead-code duplicate, reachable only through the unmounted `backend/src/routes/submissions.ts`. Not a live risk, but a second full copy that a future refactor could accidentally wire back in.

3. **`frontend/src/components/history/HistoryFeed.tsx:22-145`** — the doc-acknowledged "display-only" copy. One real logic discrepancy found: its zero-tolerance branch (lines 116-119) checks `totalCount === 0` for ALL zero-tolerance categories regardless of `evaluationMode`, before ever checking `evalMode`. For GRANULAR zero-tolerance categories this happens to produce the same pass/fail outcome as the real engine (because `ac` is 0 either way), but it marks a different set of defects as "failing" in the UI than the real engine would — a cosmetic/audit-trail discrepancy, not a wrong verdict. **Low** sub-severity.

4. **NOT disclosed by any doc — `frontend/src/pages/wizard/StepReviewSubmit.tsx`**, the actual Step-4 screen of the live wizard (imported by `WizardPage.tsx:49`, runs on every real submission and every amendment). Verified directly:
   - `ISO_BRACKETS = [13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250]` (line 47) — **different from** the canonical `[2,3,5,8,13,20,32,50,80,125,200,315,500]` used in `iso2859-matrix.ts` and `HistoryFeed.tsx`.
   - `snapToIsoBracket()` (lines 53-59) picks the first bracket `n <= bracket` (rounds up to next tier) — **different algorithm** from `ISO2859_MATH_ENGINE.md §1`'s "nearest, tie→larger" rule, which both `aqlEvaluator.ts` and `HistoryFeed.tsx` correctly implement.
   - Matrix values at shared brackets differ, e.g. `AQL_MATRIX['2.5'][20] = {ac:1, re:2}` here vs. the canonical `{ac:2, re:3}` in `iso2859-matrix.ts:237`.
   - **No `N/A`-mode branch at all** — the evaluation logic only distinguishes GRANULAR vs. everything-else-as-CUMULATIVE. A category configured with `evaluationMode: 'N/A'` would have its state-encoded 0/1/2 values summed as literal defect counts, which can produce a false CUMULATIVE fail.
   - Qualitative ("PASS/FAIL/NIL") handling is keyed off `aqlLevel.toUpperCase() === 'PASS/FAIL/NIL'` reading a separate `qualStates` map — a different data contract than `ISO2859_MATH_ENGINE.md §2` specifies.

   **This is the verdict operators actually see in the Hero Verdict Banner before submitting**, and per B4, its output is exactly what gets written into `newValues.verdict` for amendments and persisted verbatim on approval.

**Other reimplementation check:** grepped both `frontend/src` and `backend/src` for AQL/verdict-adjacent keywords; no other copies found. `StepDefects.tsx`/`BatchEntry.tsx` only tally counts for display, no pass/fail math.

### B3. Dual field-naming normalization — **Severity: Low** (implementation is correct; doc claim holds up)

**Doc claim:** Prisma uses `currentClass`/`defaultClass`, AppConfig JSON uses `categoryId`; backend normalizes before evaluation.

**Confirmed accurate.** Single normalization function, `normalizeForEngine()` in `backend/src/routes/submissions.routes.ts:73-93`:
```
currentClass: String(d.currentClass ?? d.categoryId ?? ''),   // line 88
defaultClass: String(d.defaultClass ?? d.categoryId ?? ''),   // line 89
```
This is called at **every** point where a profile feeds the engine in the live route: the explicit-profileId path (line 258) and both branches of the "safety net" fallback (lines 269 and 274). No un-normalized read of `currentClass`/`categoryId` was found on the live path. Frontend reads of `categoryId` (`ConfigContext.tsx`, `StepReviewSubmit.tsx:212`, `StepDefects.tsx`, `BatchEntry.tsx`, `QualityRules.tsx`, `HistoryFeed.tsx:104`) are all against AppConfig-JSON-shaped data where `categoryId` is the canonical field — normalization isn't applicable there since the frontend never sees raw Prisma `currentClass`. The dead `submissions.ts` reads Prisma-typed `currentClass` directly, which is correct for its (unused) data source.

**Secondary finding (worth noting, not a bug in the normalizer itself):** the backend's hardcoded default profile (`submissions.routes.ts:47,52`) sets `evaluationMode: 'CUMULATIVE'` for BARRIER / `''` for PACKAGING, while the frontend's independent hardcoded fallback default (`ConfigContext.tsx:277,281`) sets `'N/A'` for both — two separately-maintained copies of "the default profile" that disagree with each other. Not currently observed to change outcomes (StepReviewSubmit ignores `evaluationMode` outside GRANULAR anyway, per B2), but it's a second hardcoded-default inconsistency worth consolidating.

### B4. Amendment verdict consistency — **Severity: Critical**

**Doc claim:** approving an amendment applies `newValues` verbatim and does not recompute the verdict.

**Confirmed accurate, and confirmed exploitable given B2.** `POST /api/amendments/:id/approve` (`submissions.routes.ts:497-566`):
```js
prisma.submission.update({
  where: { id: submissionId },
  data: {
    amendmentStatus: 'APPROVED',
    ...(newValues['defects']  != null && { defects: ... }),
    ...(newValues['verdict']  != null && { verdict: String(newValues['verdict']) }),   // line 541
    ...
  },
}),
```
No call to `evaluateAQLVerdict`/`getAQLThresholds` anywhere in the approve handler (confirmed by grep — the only `evaluateAQLVerdict` call in the entire file is at line 282, inside `POST /api/submissions`). The draft endpoint (`POST /api/submissions/:id/amendments`, lines 406-459) also never calls it.

**How likely is this given the current UI flow?** Very likely, not theoretical. `WizardPage.tsx`'s amendment mode (`?amend=<id>`, lines 78-147) reuses the entire standard wizard — `StepDefects.tsx`'s increment/decrement handlers are unconditional in amendment mode, so a user drafting an amendment can freely change defect counts, product code, dimensions, sample size, or any other field. The verdict sent in the amendment payload (`WizardPage.tsx:226`, `inspectionData.overallVerdict`) is computed by `StepReviewSubmit.tsx` — the least-accurate of the four engine copies found in B2. So: a user can change defect counts in an amendment, get a verdict from the buggiest engine copy, and have that verdict written permanently to the record on approval with zero server-side validation against the new defect counts.

### B5. AppConfig serialization integrity — **Severity: Low** (verified safe, no bug found)

**Doc claim:** `inspectionProfiles`/`productProfileMap` are JSON-serialized strings; GET parses them, PATCH re-serializes them, and a partial update shouldn't corrupt the other field.

**Confirmed correct on all counts**, verified directly:
- `GET /api/config` → `formatAppConfig()` (`config.routes.ts:58-87`) parses every `JSON_FIELDS` entry independently via `safeParseJSON` (falls back to `[]`/`{}` on parse failure, never throws).
- `PATCH /api/config` (`config.routes.ts:140-176`) builds `updateData` by only setting keys actually present in `req.body` (loop at lines 152-160), then calls `prisma.appConfig.upsert({ where:{id:'1'}, update: updateData, create: {id:'1', ...updateData} })`. Because `update` only names the keys present in the payload, Prisma leaves every other column — including the other JSON field — untouched. Verified against a real partial-payload call site: `ProductCatalog.tsx:68-82` PATCHes only `{lines, shifts, sizes, productCodes, skuMaterials, ...}`, no `inspectionProfiles`/`productProfileMap`, and `ConfigPage.tsx:127-153` merges child-supplied partial updates before sending. **No field-drop bug exists.** The doc's claim holds up.

### B6. Profile resolution fallback chain — **Severity: Medium** (mostly accurate; one undocumented hard-fail branch)

**Doc claim:** `POST /api/submissions` resolves profile via (1) `productProfileMap[productCode]`, (2) first AppConfig profile with valid rules, (3) hardcoded `GLOBAL STANDARD (DEFAULT)`.

**Confirmed mostly accurate, verified directly in `submissions.routes.ts:217-279`**, but the actual order/branching is more complex than the doc's clean 3-step chain:

1. Line 219: explicit `body.profileId` takes priority if present (undocumented as step 0, but implied by "profileId is optional").
2. Lines 221-225: only if no `profileId` yet — `productProfileMap[productCode]` lookup (doc's step 1).
3. Lines 244-262: **if** a `profileId` was resolved by step 1 or 2 — look it up in `profilesList`; if not found and it's exactly `'prof_default'`, substitute the hardcoded default (doc's step 3); **if not found and it's any other unrecognized id → `res.status(404)` and return immediately** — this path does **not** fall through to steps 2/3 of the documented chain at all.
4. Lines 264-279: the "safety net" — runs whenever no categories were populated yet, or the resolved profile has no category with both `aqlLevel` and `evaluationMode` set. This is the only branch that reaches "first AppConfig profile with usable rules" (doc's step 2) or the hardcoded default (doc's step 3) via fallback rather than explicit request.

**Gap vs. the doc:** an explicit-but-unrecognized `profileId` in the request body hard-fails with a 404 instead of degrading gracefully through the documented fallback chain. The fallback chain is real and does work correctly for the "no profileId supplied" and "empty-rules profile" cases — just not for "invalid profileId supplied," which the doc implies should also degrade gracefully.

### B7. Multi-tenancy reality check — **Severity: Medium–High** (directly relevant to resale plans)

**Doc claim:** `Tenant → Facility → Line → Machine` hierarchy; JWT/tenant-scoped sessions `[PLANNED — NOT YET IMPLEMENTED]`.

**Confirmed: the data model has zero tenant-scoping today, and the gap is more total than the doc's phrasing implies.**
- No `Tenant`, `Facility`, `Line`, or `Machine` model in `schema.prisma` — confirmed by full-schema read.
- `Submission.machineId` is a flat, unconstrained `String` — no relation to any hierarchy entity.
- No `tenantId`/`facilityId` column on `Submission`, `AppConfig`, or any other model — confirmed via repo-wide grep in `backend/`, zero hits outside the frontend mock.
- `AuthContext.tsx`'s `User.tenantId`/`facilityId` are hardcoded literals baked into the two mock login functions, never sourced from a backend record, never sent in any API payload (confirmed: `WizardPage.tsx`'s submission payload and `submissions.routes.ts` have no tenant/facility field anywhere), and never used to filter/scope any query.
- `SystemSettings.tsx:69-84`'s "Tenant ID" field is fully decorative — a hardcoded fake GUID default, a `setTimeout`-mocked "Test Connection," and a save handler that only fires a toast (nothing persisted).
- `GET /api/submissions` returns "the 50 most recent submissions" globally per its own doc comment (`submissions.routes.ts:14-15`), with no tenant/facility filter — any client can read all inspection data across the entire dataset.

**Honest assessment for resale:** this app is effectively single-tenant today, hardcoded to "One Glove Group" in spirit even though the schema doesn't name it explicitly. There is no scaffolding — not even placeholder columns — for separating one manufacturer's data from another's. Before reselling to a second customer, this needs actual schema work (tenant model + foreign keys + query scoping + real auth), not just a config toggle. The good news is the JSON-based `AppConfig` (branding, SKU dictionaries, profiles) is already reasonably parameterized per-instance — the gap is specifically in the `Submission`/`AmendmentLog`/auth layer, which assumes one shared dataset.

### B8. UI design system drift — **Severity: Low–Medium**

**Doc claim (§1.3):** strict Inter/JetBrains-Mono split for chrome vs. data; strict badge color matrix (§4.8), no freelancing.

**Font split:** No violations found in the live, routed screens checked (`HistoryFeed.tsx`, `QualityRules.tsx`, `StepDefects.tsx`) — `font-mono` is applied consistently to lot numbers, product codes, dates, sample sizes, AQL levels, defect counts, and category identity chips, while names/UPNs correctly stay plain per the doc's "Text Data Exemption." **Compliant.**

**Badge color matrix — real findings:**
- The shared `frontend/src/components/ui/Badge.tsx` component is **dead code** (never imported anywhere) and **itself violates** the doc's §4.8B geometry (`rounded-lg`/`font-semibold`/`text-xs` vs. the mandated `rounded-full`/`font-bold`/`text-[10px]`), plus it defines an undocumented `info`/cyan variant not in the doc's emerald/rose/gray/amber matrix. Since nothing imports it, there is **no single source of truth for badge styling** — every screen hand-rolls its own badge Tailwind strings independently (`HistoryFeed.tsx`'s `VerdictBadge`/`AmendmentBadge`, `ApprovalsQueue.tsx`'s pending pill, `StepDefects.tsx`'s inline verdict badges).
- Spot-checked hand-rolled instances are individually **compliant**: `HistoryFeed.tsx:206-252` and `449-464` correctly use the mandated geometry and the emerald/rose/amber/gray palette (plus a plausible 5th "AMENDED" cyan state not anticipated by the doc but not a clear violation either); `ApprovalsQueue.tsx:155-157` matches §4.9; `StepDefects.tsx:245-247`'s AQL chip correctly uses the mandated indigo per §4.8A.
- **Real violation:** `frontend/src/components/analytics/AnalyticsDashboard.tsx:35-50` (live, routed via `/analytics`) uses **raw hex codes** throughout (`#08C8CD`, `#F59E0B`, `#EF4444` mislabeled as `// Red`, and an undocumented `#991B1B` "Dark Red" tier), directly violating §1.1's "raw hex codes are strictly prohibited." Some hex usage may be a technical necessity for Recharts SVG fills, but the doc makes no such carve-out, and the invented "Dark Red" tier isn't in the palette spec at all.
- **Minor violation:** `frontend/src/pages/wizard/BatchEntry.tsx:728` uses `hover:text-red-500`/`hover:bg-red-500/10` instead of the mandated `rose-500` token.
- The fully dead `components/wizard/*` and `components/config/ConfigDashboard.tsx` files are riddled with raw `green-`/`red-`/`yellow-` classes instead of `emerald`/`rose`/`amber` — not a live bug, but a landmine if anyone reconnects one of these files believing it's current.

### B9. AI_RULES.md model references — **Severity: Low** (doc needs updating, not a code bug)

The currently active model for this session is **Claude Sonnet 5** (`claude-sonnet-5`). `AI_RULES.md`'s Claude Code tier matrix (lines ~29-39) instead references `claude-haiku-4-5`, `claude-sonnet-4-6` (marked "current default"), and `claude-opus-5`, alongside an Antigravity-side table naming "Gemini 3.6 Flash," "Gemini 3.5 Flash," "Gemini 3.1 Pro," and "Claude Opus 4.6." None of the Claude Code IDs match the currently released Claude family naming (Fable 5, Opus 5, Sonnet 5, Haiku 4.5) as of this session — `claude-sonnet-4-6` in particular doesn't correspond to any model I'm aware of. This table should be updated to reflect current model IDs; treat it as **stale documentation**, not a functional defect.

---

## 4. Miscellaneous findings (not covered by the numbered items above)

- **Legacy schema surface:** `AppConfig` still has root-level `aqlCategories`/`defectDefinitions` `String @default("[]")` columns (`schema.prisma:248-249`), still parsed/serialized by `config.routes.ts` (`JSON_FIELDS` includes both), even though the live profile system nests categories/defects inside `inspectionProfiles[].aqlCategories`/`.defectDefinitions` per `DATA_SCHEMAS_AND_TYPES.md §2.1`. These root columns appear to be dead schema surface from an earlier design iteration.
- **Duplicate hardcoded "default profile"** with disagreeing `evaluationMode` values between backend (`submissions.routes.ts:47,52`) and frontend (`ConfigContext.tsx:277,281`) — see B3.
- **PIN login can't actually reach LEADER role** despite the login UI offering a "Leader" account option — see B1.
- **`ConfigPage.tsx`'s dev-only "simulate dirty state" button** is live in the production Configuration Control page (§2.5).
- **Name collision:** two different files are both named `StepReviewSubmit.tsx` (`components/wizard/` — dead — and `pages/wizard/` — live), which is a genuine hazard for anyone editing "the" review-submit step without checking which one is actually routed.
- **No test framework wired up anywhere** — the `test_*.mjs/.ps1/.json` and root `test_post.js` files are manual/ad-hoc scripts, not part of any CI or `npm test` script in either `package.json`.
- **`backend/dev.db` is not gitignored** (only `node_modules`, `.env`, `/generated/prisma` are, per `backend/.gitignore`), which is why it shows up dirty in git status on every session — see §2.1.

---

## 5. Known Issues (tracked, not yet fixed)

Issues discovered incidentally while executing the Phase 1+2 remediation
(AQL verdict engine consolidation), logged here so they aren't mistaken for
regressions introduced by that work, and aren't lost track of.

### 5.1 Pre-existing typecheck error — `backend/src/routes/config.routes.ts:174:92`

```
error TS2339: Property 'message' does not exist on type '{}'.
```

**What it actually is, in plain terms:** the `PATCH /api/config` handler's
error branch reads `error?.message` from a caught exception:
```ts
catch (error) {
  res.status(500).json({ ..., details: error?.message || String(error) });
}
```
TypeScript's strict mode doesn't know what shape a caught value will be (it
could be an `Error`, a string, anything — JavaScript lets you `throw`
literally any value), so it types `error` as `unknown` by default. Using
`?.` (optional chaining) on an `unknown` value narrows it to "definitely not
null/undefined" — TypeScript represents that as `{}` — but `{}` still isn't
proven to have a `.message` property, so the type checker flags it.

**This is a compile-time type-strictness complaint, not a runtime bug.**
JavaScript itself doesn't enforce this — at runtime, `error?.message` simply
evaluates to `undefined` if the caught value doesn't have a `.message`
field, and the `|| String(error)` fallback already handles that case
correctly. The endpoint works fine when actually run; `tsc --noEmit` is
just refusing to certify it as type-safe.

**Confirmed pre-existing and unrelated to Phase 1+2:** `git diff HEAD -- backend/src/routes/config.routes.ts`
shows zero changes from this session's work, and the file was last modified
in commit `4534bb6` (2026-07-30), a week before this refactor began. It
first surfaced in this session's typecheck output because Phase 1+2 was the
first time `npx tsc --noEmit -p backend` was run end-to-end as part of the
per-file verification protocol — it was not caused by, and is not touched
by, any file changed in this refactor.

**Status:** not fixed as part of Phase 1+2 (out of scope — unrelated file).
Trivial fix whenever picked up: annotate as `catch (error: unknown)` and
narrow before reading `.message` (e.g. `error instanceof Error ? error.message : String(error)`).

### 5.2 Migration history drift — `prisma/migrations/` vs live `backend/dev.db`

While adding the `AmendmentLog.recomputedVerdict`/`recomputedCategoryResults`
columns (Phase 2, step 4), `npx prisma migrate dev` refused to run: it
detected that the live `dev.db` schema has columns
(`inspectionProfiles`, `aqlCategories`, `defectDefinitions`,
`productMatrixConfig`, `dimensions`, `targetWeight`, `sides` on `AppConfig`)
that the only migration file on record
(`prisma/migrations/20260723114800_init_schema/migration.sql`, dated
2026-07-23) does not define.

**What this means in plain terms:** at some point after that initial
migration was created, `dev.db`'s schema was evolved further — almost
certainly via `prisma db push` (which writes directly to the database
without recording a migration file) rather than `prisma migrate dev` — so
the migration history on disk no longer describes how to reproduce the
live database from scratch. Prisma's `migrate dev` command trusts the
migration history as the source of truth, sees the live DB doesn't match
what replaying those migrations would produce, and its only built-in fix is
`migrate reset` (drops all data and rebuilds purely from migration files).

**This predates Phase 1+2** — nothing in this session's work caused it; it
was inherited. Worked around by using `prisma db push` (reconciles the live
DB directly against `schema.prisma`, ignoring migration history, no data
loss) instead of `prisma migrate dev` for the Phase 2 schema change.

**Status:** not fixed. `prisma migrate dev` will keep refusing (and
proposing a full reset) until this is reconciled — either by hand-writing a
new migration file that captures the missing `AppConfig` columns and
marking it applied via `prisma migrate resolve --applied`, or by accepting
`db push` as this project's actual workflow going forward and treating the
migrations folder as informational/stale. Worth a deliberate decision
before the next schema change rather than hitting the same "reset or
work around it" fork again.

### 5.3 Real AQL profiles silently never used for grading — `aql`/`evalMode` vs `aqlLevel`/`evaluationMode` field-name mismatch

**Severity: Critical.** Discovered while live-testing Phase 2 step 7
(`git log` — session of 2026-08-07). **Confirmed pre-existing**, not caused
by Phase 1+2: the same field-name mismatch exists verbatim in the original
`submissions.routes.ts` code this session inherited (checked via the
pre-refactor version of the file), so this bug predates this session
entirely. Flagging it here rather than fixing it now — logged per an
explicit decision to keep this session scoped to the approved Phase 1+2
plan.

**Where:** `backend/src/engine/resolveVerdict.ts` — `normalizeForEngine()`
(reads `c.aqlLevel` / `c.evaluationMode`) and `hasUsableRules()` (same
fields, checked on the raw un-normalized category object). Both were copied
verbatim from the original inline logic in `submissions.routes.ts` during
Phase 1+2 step 3 — the bug moved with the code, unchanged.

**What's actually broken:** every AQL category ever saved through the real
admin UI (`frontend/src/pages/config/QualityRules.tsx`) is stored with field
names `aql` and `evalMode` — confirmed by reading `QualityRules.tsx`
directly, e.g. `{ id: 'BARRIER', name: 'BARRIER', aql: 'AND', evalMode: 'N/A' }`,
and by inspecting live data via `GET /api/config`. `normalizeForEngine()`
only ever reads `c.aqlLevel` / `c.evaluationMode` — fields that don't exist
on any real saved category — so every real category normalizes to
`aqlLevel: '', evaluationMode: ''`. `resolveVerdict()`'s safety net (`no
categories have both aqlLevel and evaluationMode` → fall back) then treats
every real profile as unusable and silently substitutes its own internal
`HARDCODED_DEFAULT_PROFILE` for grading, **regardless of which profile was
actually requested.**

**Confirmed live**, not just by reading code: called `POST /api/verdict/preview`
with an explicit real `profileId` (`prof_1784996123131`, "MEDLINE") and
defect counts of 99/99. Response:
```json
{ "evaluationProfileId": "prof_default", "requestedProfileId": "prof_1784996123131" }
```
`evaluationProfileId` (what was actually used to grade) never matches
`requestedProfileId` (what was asked for) for any real profile — confirmed
across all 4 real profiles present in the live `AppConfig`
(`prof_default`/"GLOBAL STANDARD", `prof_1784996123131`/"MEDLINE",
`prof_1785374308668`/"CARDINAL", `prof_1785833175441`/"HENRY SHEIN").

**Why this is worse than a simple fallback:** `frontend/src/context/ConfigContext.tsx`'s
`getResolvedProfile()` *does* normalize both field-name variants
client-side, purely for display — so the wizard UI shows the operator
exactly the categories/AQL levels/defects they configured, with no visual
indication anything is wrong. The mismatch only bites when the *same*
profile is re-resolved server-side for grading. Custom categories/defects
that don't exist in the hardcoded fallback (live data has examples: a
custom category `cat_1785806114748`/"NEW CATEGORY" with defects "Porous",
"Thin Layer", "Thin Spot", "Donning") are invisible to grading entirely —
tallying any of those defects has zero effect on the persisted verdict,
because the substituted fallback profile has no matching category to count
them against.

**Correct fix, for whoever picks this up:** make `normalizeForEngine()` and
`hasUsableRules()` accept both field-name variants, mirroring the dual-read
pattern `ConfigContext.tsx` already uses on the frontend:
```ts
aqlLevel:       String(c.aqlLevel ?? c.aql ?? ''),
evaluationMode: String(c.evaluationMode ?? c.evalMode ?? ''),
```
Both functions need the same treatment (`hasUsableRules` currently checks
the raw, un-normalized category object). After fixing, re-verify: (1) a
real profile's `evaluationProfileId` in a `/api/verdict/preview` response
actually matches its `requestedProfileId`, (2) a submission against a
custom category (e.g. the live "NEW CATEGORY"/"Porous" example above)
actually affects the verdict, (3) re-run the full Phase 2 step 7/8/9/10
frontend work against a *real* profile once this is fixed, since those
steps were verified against the hardcoded default profile as a workaround
for this bug and should be re-checked against real data afterward.

**Status:** not fixed. Deferred to a separate follow-up session by explicit
user decision (2026-08-07) — this session stayed scoped to the approved
Phase 1+2 plan instead of expanding to cover it.
