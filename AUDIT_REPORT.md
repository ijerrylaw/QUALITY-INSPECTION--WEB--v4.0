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

**Phase 1+2 plan source:** the numbered "Step 1-11" execution order referenced
throughout this section (and in commit messages/session summaries as
"Phase 2 step N") is not written down anywhere in this repository — it lives
in a Claude Code plan file, `C:\Users\JerryLaw\.claude\plans\cozy-wondering-volcano.md`
("Phase 1+2: Consolidate AQL Verdict Engine + Server-Side Amendment
Recompute"), external to this repo. Noting the exact path here since a future
cold session (or a different machine) has no way to find it otherwise — this
doc only ever referenced individual steps in passing, never the source.

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

### 5.4 Hardcoded default profile should become per-tenant configurable (future multi-tenancy phase)

**Severity: Design note — not a bug, no action needed now.** Related to
§5.3 but a distinct, longer-term question. Logged as a placeholder for a
future multi-tenancy phase, not for action in this cleanup effort.

**Context:** §5.3 will eventually be fixed as a narrow, contained change —
making `resolveVerdict()` correctly read real admin-configured profiles
(`aql`/`evalMode` fields) instead of silently falling back to a hardcoded
default. That fix is purely about making *real* profiles work.

**The separate question this does NOT address:** the hardcoded default
profile itself (`HARDCODED_DEFAULT_PROFILE` in `backend/src/engine/resolveVerdict.ts`)
is a code-level fallback, not something any admin configured — its name
("GLOBAL STANDARD (DEFAULT)"), categories (BARRIER/CRITICAL/MAJOR/MINOR/PACKAGING),
and defect list are baked into the backend source itself.

**Product direction:** this app is intended to eventually serve multiple
factories/customers beyond One Glove Group, each with their own defect
names, product names, categories, and profile setups. Nothing about
today's default profile — including its name, categories, or defect list —
is meant to be universal or "correct" for other factories. The current live
database is test/flow-validation data only; no real production inspections
exist yet, so there's no historical-data migration concern here, just a
forward design decision.

**Implication for later:** once multi-tenancy work begins, the hardcoded
default profile should be reconsidered — likely replaced with a
per-tenant configurable default (something each factory sets up in their
own Configuration Control), rather than a single global fallback baked into
backend code. §5.3's fix makes real profiles gradable; it deliberately does
NOT redesign what "default" means for a multi-tenant future — that's this
item.

**Status:** not scoped, not planned, no action taken. Placeholder for when
the multi-tenancy phase is actually scoped.

### 5.5 Amendment prefill race condition — StepMetadata.tsx overwrites real data with recomputed defaults

**Severity: High. Status: FIXED and verified live, 2026-08-07.**

Originally discovered while live-verifying Phase 2 step 8 (`WizardPage.tsx`
— decoding N/A-mode qualitative states on amendment prefill). The bug was
pre-existing in `StepMetadata.tsx`, just newly surfaced by testing
amendment prefill live against a real submission for the first time in
this project's history. Root cause and original repro are preserved below
for context; the fix and its verification follow.

**Original root cause:**
- `frontend/src/pages/wizard/StepMetadata.tsx`'s local field state
  (`profileId`, `productCode`, `size`, `lineId`, `sampleSize`,
  `totalCarton`, `gloveWeight`, `timestamp`) initialized from the
  `initialData` prop only inside `useState(...)` initializers — a
  one-time read at mount, with no effect re-syncing local state if
  `initialData` changed on a later render.
- `fullSystemLotNo`, `lot4Digit`, `activeShift`, `effectiveDate` were
  **never read from `initialData` at all** — always freshly recomputed
  from `lineId`/`side`/`sequenceNo`/`timestamp` via a `useMemo`, using
  today's date and whatever line/side/sequence local state currently held.
- An auto-save `useEffect` unconditionally called `onUpdate?.(...)` with
  all of the above on every mount and on every change to any of them.
- `WizardPage.tsx`'s `handleUpdate` (`(partial) =>
  setInspectionData(prev => ({...prev, ...partial}))`) is a shallow merge,
  not a replace — so a stale push landing *after* the correct
  `setInspectionData(mappedData)` silently clobbered real values. Confirmed
  live via temporary debug instrumentation against a real test submission
  (batch `S8-AMEND-VERIFY-BATCH`, since deleted): `productCode`, `size`,
  `lineId`, `sampleSize`, `fullSystemLotNo` reverted to demo defaults /
  today's auto-generated lot number, while `defects`/`qualitative`/
  `dimensions` (fields `StepMetadata` never touches) stayed correct in the
  same corrupted object — proof of the merge-clobber mechanism.

**The fix (two parts, both required):**

1. **`frontend/src/pages/WizardPage.tsx`** — stop `StepMetadata` from ever
   mounting with stale/empty data during amendment load:
   - `isLoadingAmendment` now lazy-initializes to `isAmendmentMode` instead
     of `false`, so it's already `true` on the very first render whenever
     `?amend=` is present — closing the gap where render #1 could mount
     `StepMetadata` before the fetch effect even started.
   - The Step 1 content area now renders a loading placeholder instead of
     `<StepMetadata>` whenever `isAmendmentMode && isLoadingAmendment`, so
     the component mounts **exactly once**, already holding the correct
     fetched `initialData`. The old `key={amend-${amendId}-${isLoadingAmendment}}`
     remount trick (which fired a mount *before* data arrived, relying on a
     second forced remount afterward) is no longer needed and was
     simplified to `key={amendId ?? 'new'}`.

2. **`frontend/src/pages/wizard/StepMetadata.tsx`** — even with a single
   correctly-timed mount, `fullSystemLotNo` still wouldn't match the
   original: it's assembled from `line + side + lot4Digit + sequence`, and
   `side`/`sequenceNo` are never persisted separately from the assembled
   string (no DB column — confirmed against `backend/prisma/schema.prisma`),
   so `WizardPage`'s amendment mapping can't supply them and they always
   fall back to their defaults. `effectiveDate`/`lot4Digit`/`activeShift`
   depend only on `timestamp` (which *is* correctly restored), so they
   self-correct once `timestamp` is right — the fix only needed to freeze
   `fullSystemLotNo` itself:
   - `fullSystemLotNo` is now local state, seeded from
     `initialData.fullSystemLotNo` when present, falling back to the live
     `useMemo` computation otherwise.
   - An effect invalidates the frozen value (falls back to live recompute)
     once the user actually edits `lineId`/`side`/`sequenceNo`/`timestamp`/
     `config.shifts` — matching amendment mode's "all fields editable"
     intent — by comparing current values against a **fixed mount-time
     snapshot**, not a "have I run before" ref flag. A ref-flag guard was
     tried first and failed under React 18 `StrictMode` (enabled in
     `main.tsx`): StrictMode invokes effects twice per mount (mount →
     cleanup → mount again) on the *same* component instance in dev, so a
     "skip only the first invocation" flag sees its second invocation as a
     real change and incorrectly resets the frozen value immediately after
     seeding it. Comparing against a snapshot captured once via
     `useRef({ lineId, side, sequenceNo, timestamp, shifts: config?.shifts })`
     is idempotent under repeated same-value invocations and only fires on
     an actual change, regardless of how many times React re-runs the
     effect for unchanged inputs.

**Known residual gap (accepted, not fixed):** `side` and `sequenceNo`
themselves still display their defaults (not the original values) in
amendment mode's Step 1 form, since — as above — they're genuinely not
recoverable from the persisted record. `fullSystemLotNo` (the field that
matters — the "critical output" per `UI_DESIGN_SYSTEM.md` §4.6, and the
value actually persisted/displayed everywhere else) is correct regardless,
since it's now frozen from the original record rather than reassembled
from these two defaulted fields. If the two display fields ever need to
show correct original values too, `side`/`sequenceNo` would need to either
become real DB columns or be parsed back out of `batchNumber` (fixed-width
suffix: last 3 chars = sequence, preceding 4 = lot4Digit, preceding 1 =
side) — deferred as out of scope for this fix since it wasn't required by
acceptance criteria and parsing a composite string is a fragile approach
better done deliberately, not as a side effect of this bug fix.

**Compounding factor (separate, still unfixed):** `Submission.profileId`
is `null` for every submission in the current (demo/test) dataset — a
separate, already-known effect of `submissions.routes.ts`'s FK-existence
check against the real Prisma `InspectionProfile` table (AppConfig-JSON
profile ids created via Configuration Control, e.g.
`prof_1785833175441`, never exist in that separate table, so
`validDbProfileId` stays null on every submission — see §B6/§2.4). So
`StepMetadata`'s "pre-select isDefault profile" effect still auto-selects
the current default profile for any amendment whose original submission
didn't have a linked DB profile row — a related but distinct gap from
§5.5's race condition, and one that may need its own product decision
(should amendment mode preserve "no profile was linked" instead of
silently substituting the default?). Observed as expected/unchanged
during this fix's live verification below — not something §5.5's fix
touches or is responsible for.

**Verified live, end to end (2026-08-07):** created a fresh real test
submission via the actual browser UI (not seeded/synthetic data) — profile
HENRY SHEIN, product `N035MNV-OC-24FT`, size `L`, line `A003`, side `Z`,
sequence `007`, sample size `315`, total carton `25`, real dimension data,
and a real N/A-mode FAIL toggle on the PACKAGING category's "Box Damage"
defect (`def_box`) — yielding lot `A003Z6219007`. Then: History → expand
row → Amend → confirmed all Step 1 fields (`productCode`, `size`,
`lineId`, `sampleSize`, `totalCarton`, `gloveWeight`, `fullSystemLotNo`,
`lot4Digit`, `shift`, `effectiveDate`) plus Dimensions and the PACKAGING
FAIL toggle round-tripped correctly and stayed stable navigating between
wizard steps → filled a reason and submitted the amendment → confirmed
the `POST /api/submissions/:id/amendments` response carried the correct
`batchNumber: "A003Z6219007"`, `defects`, `dimensions`, and
`verdict: "FAILED"` → logged in as an elevated (M365/ADMIN) user and
confirmed the Approvals Queue entry and its diff viewer showed the correct
lot number, product code, and matching original/proposed data with no
corruption. `profileId` showed the known compounding-factor default
substitution described above and nothing else. Cleaned up afterward:
deleted the test `Submission` and its `AmendmentLog` row directly via
Prisma (no DELETE endpoint exists), restoring `dev.db` to its 19-row
baseline (`AmendmentLog` back to 0 rows) — confirmed both via direct
Prisma count and in the browser (History: 19 rows, no trace of the test
lot; Approvals Queue: "NO PENDING APPROVALS"). Typecheck clean throughout;
no debug instrumentation left in the committed code.

### 5.6 StepReviewSubmit.tsx duplicated AQL verdict logic, with wrong threshold values — wired to POST /api/verdict/preview

**Severity: High. Status: FIXED and verified live, 2026-08-08.**

**Where:** `frontend/src/pages/wizard/StepReviewSubmit.tsx` (Step 4 —
Review & Submit) had its own inline copy of ISO 2859-1 bracket-snapping,
AQL matrix, and per-category verdict evaluation, computed synchronously in
a `useMemo`. This was a duplicate of logic already consolidated on the
backend into a single source of truth
(`backend/src/engine/aqlEvaluator.ts` + `backend/src/engine/resolveVerdict.ts`),
used by every persisting route.

**Discovery:** the intended replacement, `POST /api/verdict/preview`,
turned out to **already exist and be fully implemented** — mounted at
`/api/verdict` in `backend/server.ts`, calling the exact same
`resolveVerdict()` used by `POST /api/submissions` and
`POST /api/submissions/:id/amendments`. It was simply unused: no frontend
file called it, despite its own doc comment claiming it was already used
by `StepReviewSubmit.tsx` and `HistoryFeed.tsx`. It is also undocumented
in `API_AND_INTEGRATION_SPEC.md`'s endpoint list (§1) — noted here since
that doc must not be edited this session.

**A real, previously-undetected data bug was found and confirmed live
while verifying the fix**, not just a theoretical duplication risk: the
old client-side `AQL_MATRIX` had `{ac: 5, re: 6}` for AQL level `'1.0'` at
sample size `315`. The backend's `ISO_2859_MATRIX`
(`backend/src/engine/iso2859-matrix.ts`) — derived directly from ISO
2859-1's Poisson acceptance-probability formula, with each cell's
derivation documented inline (e.g. `λ=3.150, Pa(Ac=5)=90.1% → Ac=7,
Pa=98.6%`) — has `{ac: 7, re: 8}` for that exact cell. Live-tested: 6
`Hole` defects recorded against a BARRIER category (AQL 1.0, n=315). Under
the old client math, `6 >= re(6)` → the wizard would have shown **FAIL**.
Under the new server-verified math, `6 <= ac(7)` → correctly **PASS**,
matching the same-request `POST /api/submissions` response's independently
server-computed `verdict: "PASSED"` exactly. This means the wizard's
Step 4 preview could show a verdict opposite to what the server actually
persists — the exact class of bug `/api/verdict/preview`'s own doc
comment says it exists to prevent ("so both show exactly what the server
would compute").

Two lower-severity, confirmed-but-less-consequential divergences in the
same old client copy, both eliminated by deleting it in favor of the
server call rather than needing separate fixes:
- Bracket list: `ISO2859_MATH_ENGINE.md` §1's canonical list is `[2, 3, 5,
  8, 13, 20, 32, 50, 80, 125, 200, 315, 500]` (matches the backend's
  `SAMPLE_SIZE_BRACKETS` exactly); the old client's `ISO_BRACKETS` was
  `[13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250]` — missing 2/3/5/8,
  with an erroneous 800/1250 not in the standard.
- Snap algorithm: the doc requires "nearest standard bracket, ties go to
  the larger" (same as the backend's `snapToBracket()`); the old client's
  `snapToIsoBracket()` instead always rounded **up** to the first bracket
  `>= n`. Not reachable through the current UI (the Sample Size dropdown
  only offers exact standard-bracket values from `config.sampleSizes`, so
  old and new algorithms always agreed in practice) — confirmed
  analytically instead, e.g. `n=90`: old → 125, new (correct) → 80.

**Not part of this fix — a separate, pre-existing system, confirmed
deliberately out of scope:** dimension pass/fail (`inspectionData.dimensionStats`
→ `failedDimensions`) has no server-side equivalent anywhere in this
codebase (confirmed by grep across all of `backend/src`).
`ISO2859_MATH_ENGINE.md` documents AQL verdict logic (§1-2) and physical
dimension evaluation (§5) as two independent systems; `failedDimensions`
stays a local computation, OR'd with the server's AQL verdict for the
final `overallVerdict` — same combination logic as before, just with the
AQL half now server-sourced instead of duplicated.

**The fix:** `StepReviewSubmit.tsx` now calls `POST /api/verdict/preview`
in a `useEffect` (payload: `{profileId, productCode, sampleSize, defects}`
— `inspectionData.defects` already carries N/A-mode qualitative states as
0/1/2-encoded values, no transform needed), tracked via a
`{status: 'loading'|'error'|'success', ...}` state. All render-facing
values (`overallVerdict`, `totalDefects`, `categoryVerdicts`) are derived
from that state each render rather than computed inline. A `null`
(unknown) state is treated distinctly from `0`/`PASS` everywhere in the
UI — e.g. the Defect Tabulation KPI card shows `—`/`PENDING`, not a
falsely-reassuring `0`/`PASS`, while loading or errored. Since the actual
Submit button lives in `WizardPage.tsx` (wired via `form="wizard-step-form"`
to the `<form>` this file owns) and that file was out of scope to touch,
submission is instead blocked inside this file's own `onSubmit` handler —
it no-ops with a toast (and a persistent inline status line, since a toast
alone is easy to miss) unless `previewState.status === 'success'`. An
amber error banner with a Retry button appears on fetch failure, matching
the existing `AlertTriangle` / `border-amber-500/30 border-l-4` convention
used elsewhere (`WizardPage.tsx`'s amendment banner, `HistoryFeed.tsx`).
The one remaining local bracket-snap call (`snapToIsoBracket`, used only
for the "ISO Bracket: X" and per-category "n=X" display text — never fed
into verdict math, before or after) was replaced with a correctly-sourced
`snapToDisplayBracket` mirroring the backend's canonical bracket list and
algorithm — the same "display-only inline copy" pattern
`ISO2859_MATH_ENGINE.md` §2 already documents for `HistoryFeed.tsx`.

**`HistoryFeed.tsx` still has its own separate inline AQL copy** per
`ISO2859_MATH_ENGINE.md` §2's own listing — a sibling duplicate, not
touched by this fix (out of scope; only `StepReviewSubmit.tsx` was in
scope this session).

**Verified live, end to end (2026-08-08):** real submission through the
actual wizard UI (profile GLOBAL STANDARD DEFAULT, product
`N035MNV-OC-24FT`, size `L`, line `A003`, sample size `315`, 6 `Hole`
defects recorded against BARRIER) → confirmed the `POST /api/verdict/preview`
network call fired with the correct payload and its response
(`ac:7,re:8`, `verdict:"PASSED"`) matched the rendered banner and category
breakdown exactly → navigated Step 4 → Step 3 → Step 4 to confirm the
preview re-fetches cleanly with no console errors or stale-state leaks →
stopped the backend process entirely to force a real fetch failure:
confirmed the "VERDICT UNAVAILABLE" error banner, Retry button, `—`/`PENDING`
Defect Tabulation card, and blocked-submission notice all appeared, and
confirmed via the network log that clicking "SUBMIT LOT" while in this
state made **no** `POST /api/submissions` request — the guard held.
Restarted the backend (confirmed via its startup log listing all routes
including `/api/verdict/preview`), clicked Retry, confirmed full recovery
to the correct `PASS` state — the error-simulation left no lasting change,
only the running process was stopped and restarted. Submitted the lot for
real: `POST /api/submissions` returned `201` with independently
server-computed `verdict: "PASSED"`, matching the wizard's preview exactly.
Typecheck clean throughout. Cleaned up afterward: deleted the test
`Submission` row directly via Prisma, restoring `dev.db` to its 19-row
baseline (0 amendment logs) — confirmed via direct Prisma count.

### 5.7 Amendment verdict goes stale if defects are edited after prefill — StepReviewSubmit has no way to write back into WizardPage's inspectionData

**Severity: Medium. Status: FIXED and verified live, 2026-08-08.**

Originally identified while scoping §5.6, logged separately per explicit
instruction rather than silently implying it was covered by that fix.
Fixed in this same session as its own dedicated task.

**Original root cause:** `StepReviewSubmitProps`
(`frontend/src/pages/wizard/StepReviewSubmit.tsx`) had no `onUpdate`
callback, and `WizardPage.tsx` never passed one when rendering
`<StepReviewSubmit>` — so nothing in this file, before or after §5.6's
fix, ever wrote its computed `overallVerdict` back into `WizardPage.tsx`'s
`inspectionData.overallVerdict`.

In amendment mode, `inspectionData.overallVerdict` was set exactly once,
at prefill time, from the original record's stored verdict
(`WizardPage.tsx`'s amendment-fetch mapping:
`overallVerdict: target.verdict === 'PASSED' ? 'PASS' : 'FAIL'` — see
§5.5) and never refreshed afterward. `WizardPage.tsx`'s `handleSubmit`
sends this value verbatim as `newValues.verdict` in the
`POST /api/submissions/:id/amendments` payload — and per
`API_AND_INTEGRATION_SPEC.md` §1, neither that endpoint nor
`POST /api/amendments/:id/approve` re-evaluates it — so if the operator
edited defects or dimensions on Steps 2/3 after prefill, a stale verdict
computed *before* that edit could end up **persisted** as the approved
outcome, silently disagreeing with what Step 4 actually showed on screen
at submit time.

Re-confirmed before fixing (re-reading both files fresh, not relying on
the original diagnosis): grepped `overallVerdict` across all of
`frontend/src` — only 3 sites exist, all in `WizardPage.tsx` (the SET at
prefill, and 2 READs). Confirmed this is **amendment-mode-only**: the
standard (new-submission) READ (`WizardPage.tsx:327`,
`inspectionData.overallVerdict ?? 'PASS'`) is harmless because that field
is *always* `undefined` outside amendment mode (nothing else ever sets
it) and `POST /api/submissions` ignores `body.verdict` entirely, always
persisting its own independently server-computed verdict from
`resolveVerdict()`.

**The fix:** two minimal edits.
- `frontend/src/pages/wizard/StepReviewSubmit.tsx`: added
  `onUpdate?: (partial: Record<string, any>) => void;` to
  `StepReviewSubmitProps` (matching `StepMetadataProps.onUpdate`'s exact
  convention), and one small effect syncing the derived verdict up on
  every genuine change:
  ```ts
  useEffect(() => {
    if (overallVerdict) onUpdate?.({ overallVerdict });
  }, [overallVerdict, onUpdate]);
  ```
  Guarded on non-null so the transient loading/error state from §5.6's
  `/api/verdict/preview` call never overwrites a previously-known good
  value in shared state (harmless either way, since `handleSubmit`'s
  existing guard already blocks dispatch unless the preview succeeded —
  but keeping `inspectionData.overallVerdict` monotonically meaningful is
  cleaner). No infinite-loop risk: `handleUpdate`'s merge only touches
  `overallVerdict`, leaving `profileId`/`productCode`/`defects`
  referentially unchanged, so §5.6's fetch effect (keyed on those fields
  plus a `defects` signature) never re-fires from this.
- `frontend/src/pages/WizardPage.tsx`: one line,
  `onUpdate={handleUpdate}` added to the existing `<StepReviewSubmit>`
  call — the same prop every other step component already receives.

**Verified live, end to end (2026-08-08), covering both halves of
`overallVerdict`'s OR logic (server AQL verdict AND client dimension
check — confirmed per explicit instruction, not just the defect path):**

1. *Defect-driven flip:* created a fresh, real, all-passing submission
   (0 defects, 0 out-of-spec dimensions) via the actual wizard UI. Opened
   it as an amendment, edited a `Hole` defect count from 0 to 8 on Step 3
   (BARRIER category, AQL 1.0, n=315 → `ac=7`), confirmed Step 4's verdict
   flipped to FAIL, submitted, and inspected the
   `POST /api/submissions/:id/amendments` request: `newValues.verdict:
   "FAILED"` — correctly reflecting the edit, versus
   `originalValues.verdict: "PASSED"` (the untouched original).
2. *Dimension-driven flip:* created a second fresh all-passing submission,
   opened it as an amendment, left defects untouched (still 0, so the
   server's AQL verdict stays PASSED) and instead edited a Glove Length
   dimension sample from `240` to `230` on Step 2 (below its 240mm
   `minThreshold`), confirmed Step 4 showed "LOT REJECTED — 1 DIMENSION
   ISSUE(S)", submitted, and inspected the request:
   `newValues.verdict: "FAILED"` — correctly reflecting the dimension
   failure even though the server's own independent, AQL-only
   `recomputedVerdict` field (informational, per `resolveVerdict.ts`'s own
   doc comment) was `"PASSED"`, since the server has no concept of
   dimensions at all (confirmed in §5.6). This divergence between
   `newValues.verdict` and `recomputedVerdict` is expected and correct —
   it's exactly why dimensions must stay OR'd in client-side rather than
   deferred to the server, and confirms the client value (not the
   server's AQL-only cross-check) is the one that correctly drives the
   amendment's actual outcome.

Both amendments correctly routed to `PENDING_APPROVAL`. Typecheck clean
after each of the two file edits. Cleaned up afterward: deleted both test
`Submission` rows and their 2 `AmendmentLog` rows directly via Prisma,
restoring `dev.db` to its 19-row baseline (0 amendment logs) — confirmed
via direct Prisma count.

### 5.8 HistoryFeed.tsx duplicated AQL verdict logic — wired to POST /api/verdict/preview (Phase 1+2 Step 10)

**Severity: Critical (per original audit §B2). Status: FIXED and verified
live, 2026-08-08.**

Step 10 of the Phase 1+2 plan (see the plan-source note at the top of this
section). `frontend/src/components/history/HistoryFeed.tsx`'s
`DefectBreakdownPanel` carried its own inline copy of the ISO 2859-1
engine (`ISO_MATRIX`, `getThreshold`, and the pass/fail determination
inside `buildCategoryAnalysis`) — the "display-only" duplicate
`ISO2859_MATH_ENGINE.md` §2 already documented (unlike §5.6's
`StepReviewSubmit.tsx` copy, which was undocumented). Unlike that copy,
this one's bracket list and matrix *values* were actually correct
(spot-checked against `backend/src/engine/iso2859-matrix.ts` before
touching anything — e.g. n=315/AQL 1.0 = `{ac:7,re:8}` in both). The real
bug here was architectural (a second engine that can silently drift) plus
one confirmed, concretely observable defect:

**`buildCategoryAnalysis`'s qualitative (PASS/FAIL/NIL) branch always set
`passed = null` and never evaluated FAIL states at all** — so any category
with a qualitative FAIL recorded rendered a gray "N/A" badge in the
History panel instead of red "FAIL", regardless of what the operator
actually toggled. This was directly observed earlier in this same session
(§5.5's live verification transcript: "PACKAGING PASS/FAIL/NIL N/A
qualitative 2 found N/A Box Damage 2") without recognizing the cause at
the time — traced to this exact branch once Step 10 began. The real
engine's `N/A` mode (`defectCounts[id] === 2` → fail) has no such gap. A
second, lower-severity discrepancy already documented in this report's
§B2-3 (zero-tolerance checked before `evaluationMode`, marking a different
defect set as "failing" for GRANULAR zero-tolerance categories, same
overall outcome) is also resolved as a side effect of removing the local
determination logic entirely.

**The fix:** deleted `ISO_MATRIX`/`getThreshold` and the
`isZeroTolerance/isPassFailNil/CUMULATIVE/GRANULAR` determination if-chain
from `buildCategoryAnalysis`; kept the local category/defect *iteration*
(which categories exist, which defects belong to each, their raw
counts — still sourced from `useConfig()`'s resolved profile, since the
UI shows non-failing defect pills too, not just the server's
failing-only list) and the `isZeroTolerance`/`isPassFailNil`/`snapBracket`
helpers (kept, but now purely cosmetic label/text selectors, not verdict
math). `buildCategoryAnalysis` is now a pure join: local iteration +
server's `POST /api/verdict/preview` response (same
`resolveVerdict()`/`evaluateAQLVerdict()` call `StepReviewSubmit.tsx`
already uses per §5.6), matched by `categoryId`, for `passed` and
`threshold`. One cosmetic rule kept exactly as before: since the server's
`CUMULATIVE` `failingDefects` is a single synthetic "category total"
entry rather than a per-defect list, every non-zero defect pill in a
failing `CUMULATIVE` category still renders red (matches pre-existing
visual behavior); `GRANULAR`/`N/A` modes use the server's real per-defect
`failingDefects` list directly — this is what fixes the qualitative badge
bug.

The fetch is lazy by construction, no extra gating needed:
`DefectBreakdownPanel` only *mounts* when its row is expanded
(`HistoryFeed`'s existing `if (!isExpanded) return [dataRow]` guard), so a
plain `useEffect` inside it fires exactly once per expansion and nowhere
else — verified live (see below) rather than assumed. Loading/error states
render inline within the existing panel (a brief "Loading AQL analysis…"
line, or an amber inline note on error) with graceful degradation — raw
defect counts/pills still show without pass/fail badges, since this is a
read-only historical view, not a submission gate (no retry button needed,
unlike §5.6's higher-stakes wizard context).

**Verified live, end to end (2026-08-08):** confirmed via the Network tab
that loading `/history` (with all rows collapsed) triggers **zero**
`POST /api/verdict/preview` calls — the last request after page load was
the row-list's own `GET /api/submissions`, nothing verdict-related.
Created a fresh test submission (sample size 13, chosen so small AQL
thresholds are easy to exceed) with defects deliberately spanning three
evaluation modes: `BARRIER` (CUMULATIVE, Hole=2 > ac=1 → FAIL),
`MINOR VISUAL` (GRANULAR, Flow Mark=3 > ac=2 → FAIL), and `PACKAGING`
(qualitative, Box Damage toggled FAIL). Expanded the row: confirmed
exactly one new `POST /api/verdict/preview` call fired (request
immediately following the page-load's `GET /api/submissions`, not before)
and its response matched the rendered badges exactly — critically,
**`PACKAGING` now rendered red "FAIL"**, not the old gray "N/A", with
"Box Damage" shown as the failing defect — confirming the exact bug
described above is fixed. Collapsed and re-expanded the same row: stable,
identical correct output, no console errors or React unmounted-component
warnings. Also expanded an older, pre-existing (not created this session)
passing record with 5 different defects across BARRIER/CRITICAL
VISUAL/MAJOR VISUAL/MINOR VISUAL/NEW CATEGORY — all rendered correctly
(PASS badges, correct per-defect pills, including a GRANULAR category
with two different non-failing defect types shown side by side) —
confirms the fix works across real historical data, not just newly
crafted test cases. Typecheck clean throughout. Cleaned up afterward:
deleted the test `Submission` row directly via Prisma, restoring `dev.db`
to its 19-row baseline (0 amendment logs) — confirmed via direct Prisma
count.

### 5.9 Amendment approval's server-side recompute is dimension-blind — a dimension-only-failing amendment can still be approved as PASSED

**Severity: High. Status: FIXED and verified live, 2026-08-08.**

**Scope expansion discovered and confirmed during this fix, before any code
was written:** the root cause — `resolveVerdict()` being AQL-only — is not
confined to the approve endpoint. `POST /api/submissions` (the primary,
highest-traffic persist path) never reads `body['verdict']` at all
(confirmed via grep — zero references in that handler); its persisted
`Submission.verdict` came 100% from the same AQL-only `resolveVerdict()`.
This means **every initial submission ever made via the wizard has been
dimension-blind at the point of persistence since inception**, not just
amendments — the wizard's dimension-aware banner was always display-only
and never round-tripped to what got stored. Confirmed with the user before
proceeding and fixed in the same pass, since it's the same root function
with a ~2-line wiring change per call site.

**The fix (server-side recompute, not a client-trust shortcut):** rather
than trusting the client-computed `fails` booleans already present in
`Submission.dimensionMins` (which, despite its stale/misleading Prisma
comment claiming `{thickness:number}`, actually stores the full
`{min,max,avg,fails,threshold,maxThreshold,isMin}` stats object
`StepDimensions.tsx` computes — see §5.11), the server now independently
re-derives dimension pass/fail from raw measurements, mirroring the same
"never trust client-derived pass/fail, only trust raw inputs" principle
already applied to AQL:

- **New `backend/src/engine/dimensionEvaluator.ts`** — pure function
  replicating `StepDimensions.tsx`'s evaluation engine byte-for-byte
  (fixed rows GLOVE LENGTH/PALM WIDTH + dynamic `dimensionDefs` from
  `AppConfig.productMatrixConfig[productCode]` falling back to
  `AppConfig.dimensions`, `getDimSpec()`'s exact resolution chain
  including the `tolerance === 'MIN'` string convention, and the
  `threshold`/`maxThreshold` formulas from `ISO2859_MATH_ENGINE.md` §5).
  Deliberately mirrors the frontend's quirks rather than "fixing" them —
  e.g. `ProductDimensionDef.isMin` is intentionally never read, matching
  the frontend's actual behavior.
- **`resolveVerdict.ts`** — extended with optional `size` +
  `dimensionMeasurements` params. When both are supplied, it resolves
  `productMatrixConfig`/global dimension defs off the same `AppConfig` row
  already fetched for AQL (no extra query), evaluates dimensions, and folds:
  `verdict = aqlVerdict === 'FAILED' || failedDimensions > 0 ? 'FAILED' : 'PASSED'`
  — same combination rule `StepReviewSubmit.tsx` already applies
  client-side. Omitting the params skips dimension evaluation entirely
  (today's AQL-only behavior), so `POST /api/verdict/preview` and its two
  frontend callers (`StepReviewSubmit.tsx`, `HistoryFeed.tsx`) were
  deliberately left unwired this session — they already combine AQL +
  dimension correctly for *display*, and touching them risked
  double-counting or unnecessary frontend churn for a backend-scoped fix.
- **`submissions.routes.ts`** — wired `size`/raw `dimensions` (with the
  same `newValues[...] ?? existing[...]` fallback pattern already used for
  `sampleSize`/`defects`) into all three persisting/recomputing call sites:
  `POST /api/submissions` (closes the newly-found bigger gap),
  `POST /api/submissions/:id/amendments` (draft preview, informational),
  and `POST /api/amendments/:id/approve` (this finding's original target).

**Schema change:** `AmendmentLog` gained two nullable columns —
`recomputedFailedDimensions Int?` and `recomputedDimensionResults String?`
(JSON `DimensionResult[]`) — mirroring the existing
`recomputedVerdict`/`recomputedCategoryResults` pair, so a reviewer can see
*why* a recompute is FAILED (AQL vs. dimensions) instead of just the final
verdict. Applied via `prisma db push` rather than `prisma migrate dev`,
consistent with the workaround already documented in §5.2 (the live
`dev.db` has drifted from the recorded migration history since before this
session; `migrate dev` still proposes a full data-losing reset). No data
loss — confirmed via direct Prisma count before and after (19
submissions / 0 amendment logs, unchanged).

**Verified live (2026-08-08), three real HTTP traces against the actual
product config in `dev.db` (`N035MNV-OC-24FT`, size `M`), not synthetic
data:**

1. *Dimension-only failure, initial submit* (0 defects; one `PALM
   THICKNESS` measurement slot at `0.05` against a `0.060` MIN threshold,
   all other dimensions in spec) — `POST /api/submissions` persisted
   `verdict: "FAILED"`. Before this fix this would have persisted
   `"PASSED"` (confirmed independently via `/api/verdict/preview` with the
   same defect counts and no dimension data: AQL side alone returns
   `"PASSED"` with all 6 categories passing).
2. *Same submission, drafted then approved as an amendment* (trivial
   `batchNumber`-only change, dimensions untouched) —
   `POST /api/submissions/:id/amendments` correctly previewed
   `recomputedVerdict: "FAILED"` with `recomputedFailedDimensions: 1` and
   `recomputedDimensionResults` correctly isolating `palmThickness` as the
   sole failing dimension (`fails: [false,false,true,false,false]`,
   matching the deliberately-out-of-spec slot index). Approving it
   persisted `Submission.verdict: "FAILED"` — this is §5.9's original
   target scenario, now fixed: the approve endpoint no longer silently
   overrides a correct dimension-driven FAILED with an AQL-only PASSED.
3. *Regression checks:* an all-in-spec submission (0 defects, all
   dimensions passing) persisted `"PASSED"` — no false positives
   introduced. A dimensions-clean, AQL-failing submission (`def_hole: 10`
   against BARRIER's `ac:1,re:2` at n=20) persisted `"FAILED"` with
   `failedDimensions: 0` — AQL path unaffected.

`npx tsc --noEmit -p backend` clean after every file (only the
pre-existing §5.1 `config.routes.ts` error remains, unchanged). No
frontend files touched this session. Test submissions/amendment logs
deleted after verification; `dev.db` confirmed back at the 19/0 baseline.

**Original finding text, preserved for context (superseded by the fix
above):**

**Where:** `backend/src/routes/submissions.routes.ts`'s
`POST /api/amendments/:id/approve` (confirmed, reading the live code
directly, not the docs) already does the right thing architecturally: it
calls `resolveVerdict()` server-side and **unconditionally** persists
`verdict: recomputed.verdict` (line ~500) — the client-supplied
`newValues.verdict` is never trusted for persistence, only kept for an
audit-log mismatch comparison. This means §5.7's fix (keeping the client's
displayed/submitted verdict in sync with edits) turned out to matter less
for the *final persisted outcome* than originally understood when that fix
was written — the approve endpoint was already going to override it with
a fresh recompute either way. (§5.7's fix still matters for what a
reviewer *sees* in the Approvals Queue diff before deciding, and for
`AmendmentLog.newValues.verdict`'s own accuracy as an audit record — just
not for what ultimately gets written to `Submission.verdict` on approval.)

**The gap:** `resolveVerdict()` — and therefore this approve-time
recompute — is **AQL-only**. It has no concept of dimension pass/fail
anywhere (confirmed repeatedly this session: grepped all of `backend/src`
for "dimension", zero hits; `ISO2859_MATH_ENGINE.md` documents AQL logic
and dimension logic as two fully independent systems). `overallVerdict`
as shown to the operator in the wizard is `serverAqlVerdict === 'FAILED'
|| failedDimensions > 0` — the dimension half exists **only** client-side,
computed in `StepReviewSubmit.tsx`, and is never transmitted to or
recomputed by the approve endpoint at all.

**Consequence, confirmed via this session's own §5.7 live test data:**
drafting an amendment with a dimension-only failure (0 defects, one
dimension edited out of spec) correctly produced
`newValues.verdict: "FAILED"` in the draft (§5.7's fix working as
intended) — but the draft's own `recomputedVerdict` (the approve-time
engine's own informational preview, same `resolveVerdict()` call the
approve endpoint uses) was `"PASSED"`, since it never saw the dimension
data at all. **If that amendment were approved today, the approve
endpoint would persist `Submission.verdict = 'PASSED'`** — silently
discarding the dimension failure and overriding the client's correct
`'FAILED'` value with its own incorrect `'PASSED'` recompute. This is not
hypothetical or unconfirmed: the exact response proving it
(`recomputedVerdict: "PASSED"` alongside a real, deliberately-created
dimension failure) is already captured in §5.7's verification section
above, from this same session — this finding is the follow-through on
what that response actually implies for the approval path, not a new
repro.

**Why this matters more than it might first appear:** the approve
endpoint is the *one place* a verdict is ever permanently, authoritatively
written after initial submission (its own code comment says as much:
"this is the one place a verdict is permanently written, so we never
guess here" — but it does effectively guess, for dimensions, by ignoring
them entirely rather than by any explicit decision). A supervisor
reviewing and approving a dimension-driven-FAIL amendment in good faith,
seeing the correct `FAILED` value in the diff viewer, would have that
correct decision silently overwritten by the server's own recompute at
the moment of approval.

**Correct fix, for whoever picks this up:** either (a) extend
`resolveVerdict()`'s contract (or wrap it) to accept dimension-fail data
and fold it into the persisted verdict the same way `StepReviewSubmit.tsx`
already does client-side (`aqlVerdict === 'FAILED' || failedDimensions > 0`),
requiring the approve endpoint to receive `dimensionMins`/dimension-fail
data from `newValues` (already present in the payload, just unused for
this purpose) — the more architecturally consistent option, matching
"never trust the client for what gets persisted"; or (b) explicitly
special-case dimension failures as an override the approve endpoint
respects from `newValues` while still never trusting the *AQL* portion of
the client's verdict. Needs a product decision on which, plus a schema/data
question: dimension fail state currently only exists as the `fails: boolean[]`
arrays inside `dimensionMins` JSON, not a first-class summary field —
worth deciding whether to keep deriving it inline or add a persisted
summary column. Out of scope for Step 10 (backend/schema-level work, a
different file and a different kind of change than the Step 10 task this
session was scoped to).

### 5.10 API_AND_INTEGRATION_SPEC.md's approve-endpoint claim is stale

**Severity: Low (documentation accuracy, not a functional bug). Status:
not fixed — logged 2026-08-08, discovered while investigating §5.9. Not
fixed because the six core docs must not be edited by this session per
explicit instruction; logged here instead so the discrepancy isn't lost.**

`API_AND_INTEGRATION_SPEC.md` §1 currently states, for
`POST /api/amendments/:id/approve`: "This applies the pre-stored
`newValues` verbatim — it does **not** recompute the AQL verdict. Any
verdict change must be explicitly included in `newValues` at
amendment-draft time." This is no longer accurate — per §5.9 above, the
live code recomputes server-side via `resolveVerdict()` and always
persists that recomputed value, never `newValues.verdict` verbatim. The
doc's claim was accurate for the pre-Phase-1+2 state described in this
report's original §B4 finding, but Phase 1+2 Step 5 (per the plan-source
note above) fixed exactly this, and the doc was never updated to match.
Whoever eventually edits the six core docs should correct this line — and
should note it now recomputes **both** AQL and physical dimensions (§5.9
fixed the dimension half 2026-08-08).

### 5.11 `Submission.dimensionMins`'s schema comment and doc reference are stale — the field doesn't store minimums

**Severity: Low (documentation accuracy, not a functional bug). Status:
not fixed — logged 2026-08-08, discovered while scoping §5.9's fix. Not
fixed because `DATA_SCHEMAS_AND_TYPES.md` is one of the six core docs and
must not be edited by this session; the `schema.prisma` comment is
implementation (fair game) but wasn't touched since correcting it wasn't
necessary for §5.9's fix — logged here instead so the discrepancy isn't
lost.**

`backend/prisma/schema.prisma`'s `Submission.dimensionMins` field carries
the comment `// DimensionMinimums: { thickness: number; length: number }`.
`DATA_SCHEMAS_AND_TYPES.md` §1 references a `DimensionMinimums` type by
name on the `Submission` interface but never actually defines it anywhere
in the doc (confirmed via full-repo grep — no `interface DimensionMinimums`
exists anywhere, only this one comment and one type reference).

**What the field actually stores, confirmed by reading `WizardPage.tsx`
directly (lines ~176, 272, 325):** `dimensionMins: inspectionData.dimensionStats`
— the *full* per-dimension stats object `StepDimensions.tsx` computes:
`{ min, max, avg, fails: boolean[], threshold, maxThreshold, isMin }`,
keyed by dimension id. Not a simple minimums map. This turned out to be
useful groundwork for §5.9 (it's what `StepReviewSubmit.tsx`'s
`failedDimensions` memo already reads client-side), even though §5.9's
fix ultimately chose to re-derive dimension pass/fail from raw
measurements server-side rather than trust this client-computed field.

**Also note:** `frontend/src/pages/wizard/BatchEntry.tsx` (line 455)
always sends `dimensionMins: {}` regardless of what was actually measured
— harmless today since nothing read `dimensionMins` for verdict purposes
before §5.9, and §5.9's fix doesn't read it either (it recomputes from raw
`dimensions` instead), but worth knowing this field is unreliable for
batch-created submissions if anything is ever built that trusts it directly.

**Suggested fix, for whoever edits the six core docs next:** replace the
stale `DimensionMinimums` type reference with the actual shape (or
document `dimensionMins` as a legacy/misleading field name kept for
backward compatibility), and correct the matching `schema.prisma` comment
to match.

### 5.12 Amendment approval crashes (500) whenever the amendment touches `profileId` — FK constraint violation on `Submission.update()`

**Severity: High. Status: FIXED and verified live, 2026-08-08. Discovered
during Step 11's live amendment/approval trace (below), not anticipated by
any prior session.**

**The bug:** `POST /api/amendments/:id/approve` (`submissions.routes.ts`,
the update-data object inside the `prisma.$transaction`) wrote
`profileId: String(newValues['profileId'])` straight into
`prisma.submission.update()` whenever `newValues.profileId` was non-null,
with no existence check. `Submission.profileId` is a real FK into the
`InspectionProfile` table — confirmed empty (0 rows) via direct Prisma
query — because actual profiles live in `AppConfig.inspectionProfiles`
JSON (see §5.5's "compounding factor" note and §B6/§2.4). Writing any
AppConfig-JSON profile id (e.g. `prof_default`) there violates the FK
constraint and crashes the whole approve transaction.

**Why this isn't a narrow edge case:** `newValues.profileId` gets
populated on essentially every real amendment, not just contrived ones.
`Submission.profileId` is `null` for all 19 baseline submissions (same
already-known gap). Reopening any of them for amendment leaves
`StepMetadata.tsx`'s local `profileId` state falsy, which fires its
"pre-select the default profile" effect (`WizardPage.tsx` line ~113-118),
populating `newValues.profileId` with a real value on submit. So the
crash was not specific to this session's test data — it reproduces for
essentially any amendment approved today, on any of the 19 real records.
This makes it the actual severity-blocking finding of this pass, not a
corner case.

Contrast with `POST /api/submissions` (lines ~189-193, 216 as of §5.9),
which already guards this exact case: it only sets `profileId` after
confirming `prisma.inspectionProfile.findUnique(...)` finds a match,
falling back to `null` otherwise (`validDbProfileId`). The approve
endpoint never had that guard — a gap that predates this session; Step
11 is what first exercised the code path live and surfaced it.

**The fix:** added the identical `validDbProfileId` safety net to the
approve endpoint, immediately before the transaction — look up
`newValues.profileId` in `InspectionProfile` and use the resolved id only
if it actually exists there, otherwise fall back to `null` (same
fallback the submit/draft endpoints already produce). One file changed:
`backend/src/routes/submissions.routes.ts` (new block before the
`prisma.$transaction` call, and the `profileId` line inside the
`Submission.update()` data object switched from
`String(newValues['profileId'])` to the resolved `validDbProfileId`).
`npx tsc --noEmit -p backend` clean (only the pre-existing §5.1
`config.routes.ts` error remains).

**Verified live (2026-08-08):** reproduced the crash first (500,
`PrismaClientKnownRequestError: Foreign key constraint violated` at
`submissions.routes.ts:496`, the exact line-number in the error trace
confirming the diagnosis before any fix was written), applied the fix,
restarted the backend (`tsx server.ts` has no watch mode — a code change
requires a manual restart to take effect), and re-submitted the identical
pending amendment through the Approvals Queue UI without touching
anything else. Second attempt: `200 OK`,
`"message":"Amendment approved and merged successfully."`, `Submission`
row updated with `amendmentStatus: "APPROVED"`, `profileId: null` (the
expected, already-documented fallback — not a new gap), and all amended
fields (`defects`, `dimensions`, `verdict`) correctly persisted — see the
full trace in the Step 11 write-up below. No other endpoint touches
`profileId` this way, so the fix is scoped to this one call site.

### 5.13 Amendment wizard's Defects step double-counts qualitative defects in "TOTAL RECORDED ISSUES" — display only, wire payload unaffected

**Severity: Low (cosmetic). Status: not fixed — logged 2026-08-08,
discovered during Step 11's live amendment trace. Not fixed because the
user chose to log and continue rather than pause Step 11 for it.**

**The bug:** reopening an amendment on a submission whose original
qualitative (N/A-mode) defect was non-NIL shows an inflated "TOTAL
RECORDED ISSUES" count on the amendment wizard's Defects step. Repro used
in this session: original submission had `PACKAGING`'s `def_box` = FAIL
(raw encoded `2`) plus 5 quantitative defects (`def_hole:2, def_dirt:2,
def_flow:1`) — real total issues = 6, matching what the original
submission's own Review step correctly showed. Reopening it as an
amendment showed **8**.

**Root cause:** `WizardPage.tsx`'s amendment prefill (~line 143-183)
correctly builds a decoded `qualitative` map for the toggle UI, but also
sets `defects: rawDefects` — the *raw*, unfiltered defects map, which
still contains the qualitative category's raw encoded value
(`def_box: 2`). `StepDefects.tsx` seeds its quantitative `defectCounts`
state directly from `inspectionData?.defects` on mount
(`useState(inspectionData?.defects ?? {})`, line ~113) with no filtering
by category eval mode, so `def_box`'s raw `2` leaks into `defectCounts`
as if it were a quantitative count. The summary bar then double-counts
it: `totalQuantitativeDefects` (sums the now-polluted `defectCounts`,
including `def_box`'s leftover `2`) *plus* `totalQualitativeFails`
(separately counts the same defect via `qualitativeStates`) = 7 + 1 = 8.
Toggling the qualitative defect to a different state doesn't clear the
leftover value either — it only updates `qualitativeStates`, confirmed by
watching the counter change from 8 → 7 (not 8 → 5) after flipping
`def_box` FAIL→PASS during this session's live test.

**Confirmed display-only — the submitted payload is correct:**
`combinedDefects = { ...defectCounts, ...encodeQualitative(qualitativeStates) }`
(`StepDefects.tsx` ~line 141) spreads the freshly-encoded qualitative
state *last*, so `def_box` in the actual wire payload always reflects the
live toggle position, not the polluted `defectCounts` leftover. Verified
directly in this session's network trace: with `def_box` toggled to PASS,
the draft amendment's `POST /api/submissions/:id/amendments` request body
carried `defects.def_box: 1` (correct PASS encoding) despite the on-screen
counter reading 7, and the approved `Submission.defects` persisted the
same correct value. No category's per-defect display is affected either
— `def_box` only ever renders as PACKAGING's PASS/FAIL/NIL toggle
(`isQual` branch), never as a quantitative counter card, so the pollution
has no other visible surface beyond this one summary number.

**Likely fix, for whoever picks this up:** in `StepDefects.tsx`'s
`defectCounts` initializer (~line 113), filter `inspectionData?.defects`
down to only the ids belonging to non-qualitative categories before
seeding state — mirroring the same category-eval-mode split
`combinedDefects`/`encodeQualitative` already apply on the way out, just
applied on the way in too.

## 6. Step 11 — End-to-End Verification Pass (Phase 1+2 close-out)

**Status: COMPLETE, 2026-08-08.** Per `cozy-wondering-volcano.md`'s
Step 11 definition ("trace one full flow end-to-end ... confirming the
verdict at each stage matches what the engine alone would produce"),
extended beyond the plan's original AQL-only scope to also cover
dimensions, N/A/qualitative encoding, and the audit columns added by
§5.5-§5.11 — none of which existed when Step 11 was originally scoped.
Full live browser trace against the real dev server (no synthetic/seeded
data), using product `N035MNV-OC-24FT`, size `M`, sample size `13`
(bracket thresholds: BARRIER/CRITICAL/NEW CATEGORY ac=1/re=2 @ AQL 1.0/1.5,
MAJOR ac=1/re=2 @ AQL 2.5, MINOR ac=2/re=3 @ AQL 4.0, PACKAGING zero-tolerance
ac=0/re=1).

**1. Fresh submission covering CUMULATIVE fail, GRANULAR fail/pass, N/A
fail, all dimensions clean** — defects `def_hole:2` (BARRIER, CUMULATIVE,
2>ac1 → FAIL), `def_dirt:2` (MAJOR, GRANULAR, 2>ac1 → FAIL), `def_flow:1`
(MINOR, GRANULAR, 1≤ac2 → PASS, exercising a passing GRANULAR case
alongside the failing one), `def_box` toggled FAIL (PACKAGING, N/A). All
35 dimension slots left at their in-spec defaults. Confirmed agreement
across all four layers:
   - **Wizard banner** (`StepReviewSubmit.tsx`): "ISO 2859-1 VERDICT: FAIL
     — LOT REJECTED — 6 DEFECT(S) FOUND" (0 dimension issues).
   - **`POST /api/verdict/preview`** response: `verdict:"FAILED"`, with
     PACKAGING correctly rendered `passed:false` /
     `failingDefects:[{defectName:"Box Damage",count:2,...}]` — the exact
     N/A-FAIL-renders-as-FAIL-not-N/A case §5.8 fixed, reconfirmed here.
   - **`POST /api/submissions`** persisted response: top-level
     `verdict:"FAILED"`, `Submission.verdict:"FAILED"`, identical
     `categoryResults` to the preview call.
   - **History view**, row expanded: verdict badge FAIL, AQL Category
     Analysis panel shows BARRIER/MAJOR FAIL, PACKAGING FAIL with "Box
     Damage: 2" pill rendered red — matches the wizard/preview exactly.
   - `Submission.profileId` persisted `null` despite `GLOBAL STANDARD
     (DEFAULT)` being explicitly selected in the wizard — re-confirmed
     the already-documented §5.5/§B6 gap still holds (the `InspectionProfile`
     table is empty; `POST /api/submissions`'s `validDbProfileId` check
     silently falls back to `null`). Not a Step 11 regression — pre-existing,
     logged, and harmless here since `productProfileMap` correctly
     reconstructs `prof_default` at recompute time regardless.

**2. Isolated dimension-only-failure case — the wizard-banner-vs-persisted-verdict data point requested explicitly for the record:**
   Second submission, same product/size/sample size, **all 6 AQL
   categories left clean** (0 defects / NIL) so the dimension
   contribution can't be masked by a simultaneous AQL failure. One
   measurement pushed out of spec: **PALM THICKNESS, slot 3, set to
   `0.050mm`** against the size `M` target of `≥0.060mm` (MIN tolerance,
   threshold = minSpec exactly) — delta `-0.010mm`. All other 34 slots
   left at their in-spec defaults.

   | Layer | Result |
   |---|---|
   | Wizard's live banner (`StepReviewSubmit.tsx`) | **FAIL** — "ISO 2859-1 VERDICT: FAIL — LOT REJECTED — 1 DIMENSION ISSUE(S)" (0 defects; Defect Tabulation card's own "Verdict Impact" read PASS in isolation, confirming the FAIL came entirely from the dimension side) |
   | Server `POST /api/verdict/preview` (AQL-only, by design per §5.9) | **`"verdict":"PASSED"`**, `failedDimensions:0`, `dimensionResults:[]` — confirmed this endpoint never evaluates dimensions at all, regardless of actual measurements (`resolveVerdict()` called without `size`/`dimensionMeasurements` params at this call site) |
   | Server `POST /api/submissions` persisted result (dimension-aware `resolveVerdict()` per §5.9's fix) | **top-level `"verdict":"FAILED"`, `Submission.verdict:"FAILED"`**, all 6 `categoryResults` entries `passed:true` (AQL side independently clean) |
   | History view | Verdict badge **FAIL** at the table level (confirms the persisted value round-trips correctly to display) |

   **Conclusion: the wizard banner and the persisted server verdict agree
   (both FAIL) for this dimension-only case.** The one layer that
   *doesn't* know about the dimension failure — `/api/verdict/preview` —
   is exactly the one §5.9 documented as intentionally left AQL-only, and
   nothing persists from that endpoint's response alone, so its blind
   spot never reaches the database. This directly answers the sanity
   check flagged at the start of this session: `/api/verdict/preview` and
   `resolveVerdict()`'s dimension-aware persisting call sites are not two
   independently-evolved engines that could silently disagree — they are
   the same `resolveVerdict()` function, invoked two different ways by
   explicit, documented design. **Also confirms §5.9's original fix
   claim still holds under a fresh, independent repro**: a dimension-only
   failure is no longer silently swallowed into a false `PASSED` at
   persistence time. (Also confirmed: the History view has no way to
   surface *why* a dimension-only-failing record failed — the row's
   verdict badge is correct, but with 0 raw defects no expand affordance
   exists, and `DefectBreakdownPanel` has no dimension section even if
   forced open. Not a correctness bug — dimension display in History was
   never in scope for §5.9 — but worth noting as a real UX gap for anyone
   picking up dimension-related work later.)

**3. Combined defect + dimension amendment through approval** — amended
submission #1 from step 1 above: flipped `PACKAGING`/`def_box` FAIL→PASS
(defect-side edit) and pushed the fixed `GLOVE LENGTH` dimension's slot 3
from `240` to `235mm` (below the `≥240mm` MIN target — dimension-side
edit), in the same amendment.
   - **Draft preview** (`POST /api/submissions/:id/amendments`):
     `recomputedVerdict:"FAILED"` (BARRIER/MAJOR AQL fails carry over
     unchanged), `recomputedCategoryResults` correctly shows `PACKAGING`
     now `passed:true`, `recomputedFailedDimensions:1`,
     `recomputedDimensionResults` correctly isolates `__fixed_length__`
     (GLOVE LENGTH) as the sole `failed:true` entry with
     `fails:[false,false,true,false,false]` matching the edited slot —
     first live confirmation of these two audit columns populating
     correctly with a defect change and a dimension change present
     *simultaneously* (§5.9's own verification only exercised them
     separately).
   - **Approval** hit the §5.12 bug above (500, FK constraint violation)
     on first attempt — fixed live mid-session, see §5.12 for the full
     trace. Second attempt after the fix: `200 OK`,
     `Submission.amendmentStatus:"APPROVED"`,
     `Submission.defects.def_box:1`, `Submission.dimensions.__fixed_length__`
     showing the amended `235` slot, `Submission.verdict:"FAILED"` — all
     persisted correctly, matching the draft preview exactly.
   - **History view**, post-approval: STATUS badge changed
     ORIGINAL→AMENDED, verdict still FAIL, raw defect count changed 7→6
     (reflecting `def_box`'s encoding flipping 2→1), AQL Category
     Analysis panel shows PACKAGING now PASS with "Box Damage: 1" —
     amendment correctly reflected end-to-end.

**4. Regressions spot-checked in-flow (not re-tested in isolation):**
§5.5 (amendment prefill) — Step 1 fields (profile, product, size, line,
side, sample size, glove weight, dimensions, defects, qualitative
toggles) all correctly repopulated on both amendment opens, no clobbering
observed. §5.7 (verdict staleness) — banner verdict tracked every defect
edit live and matched what was actually submitted at each stage. §5.8
(HistoryFeed N/A rendering) — PACKAGING rendered FAIL-then-PASS correctly
across both the original and amended states. §5.9 (dimension audit
columns) — exercised under a new combined-edit condition not covered by
its own original verification, still correct. No regressions found.

**Two new findings surfaced by this pass, not by any prior session**:
§5.12 (approve-endpoint FK crash — fixed live) and §5.13 (amendment
Defects-step double-count — logged, cosmetic). Both discovered only
because this was the first time the consolidated verdict/amendment
system was exercised as one continuous flow rather than per-fix in
isolation — exactly what Step 11 was for.

**Test data cleanup:** both test submissions and the one amendment log
deleted directly via Prisma after verification; `dev.db` confirmed back
at the 19-submission / 0-amendment-log baseline (verified via direct
count before and after cleanup).

**This closes Step 11 and Phase 1+2.** All of §5.5-§5.13 are now either
fixed-and-verified or explicitly logged for later, and the full
consolidated system (AQL engine, dimension engine, N/A/qualitative
encoding, amendment draft/approve recompute, audit columns) has been
verified holding together as one continuous flow, not just as
individually-tested fixes.

---

## 7. Pre-Seeding Audit — Step 1: Profile/Config vs. Real Production Data

**Status: READ-ONLY. Nothing in this section was fixed, refactored, or
edited — no code changes, no edits to the six core docs.** This begins a
new, separate step sequence agreed with the user in this session, for
pre-seeding verification before real One Glove Group production data is
loaded. Like the Phase 1+2 "Step 1-11" plan referenced at the top of §5,
this sequencing itself is **not written down anywhere in this repository**
— it exists only as this session's chat context. Flagging that here so a
future cold session isn't left guessing what "Step 1" refers to, the same
problem §5's header already called out for the Phase 1+2 plan file.

**Ground truth used below:** three real product codes and their defect
taxonomy, extracted by the user from three clean months (May/June/July) of
production spreadsheets — see this session's task prompt for the full
list. Not re-derived from any file in this repo; treated as external
input to compare the live config against.

### 7.1 Scope clarification — "productMatrixConfig" is not the AQL/defect profile system

The task framing that motivated this audit ("confirm whether
`AppConfig.productMatrixConfig` has correct, matching profiles... and
surface any silent fallback to the hardcoded default profile") conflates
two **separate, independently-keyed** config systems that only share the
word "product" in their names. Confirmed directly from
`DATA_SCHEMAS_AND_TYPES.md` §3 and live code (`resolveVerdict.ts`,
`dimensionEvaluator.ts`):

| System | AppConfig field | Keyed by | Governs | Consumed by |
|---|---|---|---|---|
| **Dimension spec matrix** | `productMatrixConfig: Record<productCode, ProductConfig>` | `productCode` directly | Per-size physical dimension min/max specs (glove length, palm width, thickness, etc.) + weight target | `dimensionEvaluator.ts` (`resolveVerdict.ts`'s dimension half), `StepDimensions.tsx`, `BatchEntry.tsx` |
| **AQL/defect profile system** | `productProfileMap: Record<productCode, profileId>` + `inspectionProfiles: InspectionProfile[]` | `productCode` → `profileId` → profile object | AQL categories, defect names, evaluation modes — the actual §5.3/§5.4 fallback mechanism | `resolveVerdict.ts`'s AQL half (via `aqlEvaluator.ts`) |

These have **no shared code path** — `productMatrixConfig` is never
consulted for AQL/defect grading, and `productProfileMap`/
`inspectionProfiles` are never consulted for dimension specs. A product
code can be perfectly configured in one and completely absent from the
other (and, per §7.3/§7.5 below, this is exactly what's currently
happening). **Both systems are audited below**, since both are required
for a real product code to grade correctly end-to-end, and both turn out
to have their own, mechanically different, silent-fallback behavior.

### 7.2 Confirmation: AppConfig is DB-backed (Prisma), not a static file

Verified directly, not assumed: `backend/prisma/schema.prisma`'s
`AppConfig` model (lines 212-273) is a real Prisma singleton table
(`id: '1'`), with `productProfileMap`, `productMatrixConfig`, and
`inspectionProfiles` all stored as `String @default(...)` JSON-serialized
columns. Queried the **live** `backend/dev.db` row directly via a
throwaway read-only script (`prisma.appConfig.findUnique({where:{id:'1'}})`,
run through the same `PrismaClient`/`@prisma/adapter-libsql` singleton
`backend/src/lib/prismaClient.ts` uses — no separate DB connection logic
invented for this audit) rather than reading any doc's description of what
it should contain. The Prisma `InspectionProfile` DB table (the *other*,
separate profile system per §2.4/§5.5/§5.12) is confirmed still empty (0
rows) — real profiles live exclusively in the `AppConfig.inspectionProfiles`
JSON blob, consistent with every prior finding referencing this gap.

**Live `AppConfig` row content relevant to this audit (verbatim, 2026-08-08):**
- `productCodes` (the wizard/BatchEntry product-code `<select>`'s only
  source, confirmed in `StepMetadata.tsx:409` — a strict native `<select>`,
  no free-text entry): `["N035MNV-OC-24FT"]` — **one entry.**
- `productProfileMap`: `{"N025SKB-OC-24FT":"prof_default","N035MNV-OC-24FT":"prof_default","R030MNV-OC-24FT":"prof_default","N030MNV-OC-24FT":"prof_default"}`
- `sizes`: `["XS","S","M","L","XL"]`
- `sampleSizes`: `[13,20,32,50,80,125,200,315,500]`
- `productMatrixConfig`: one key only, `"N035MNV-OC-24FT"` (full
  per-size dimension/weight spec, `lastAmended: "2026-08-03T09:50:37.031Z"`)
- `inspectionProfiles`: 4 profiles — `prof_default`/"GLOBAL STANDARD"
  (`isDefault:true`), `prof_1784996123131`/"MEDLINE",
  `prof_1785374308668`/"CARDINAL", `prof_1785833175441`/"HENRY SHEIN".

### 7.3 Located: the profile-resolution and dimension-resolution logic

**AQL/profile side** — `backend/src/engine/resolveVerdict.ts`, already
documented extensively in §5.3 (fixed) and quoted here only for the parts
new to this audit:
- Lines 219-227: `profileId = params.profileId || null`, then **only if
  still falsy**, `productProfileMap[productCode]` is consulted (line 221-224).
- Lines 233-256: if a `profileId` (from either source) doesn't resolve to
  a real profile object, behavior depends on the caller's
  `onUnresolvedProfile` setting — `'throw'` (persisting routes' default) →
  `VerdictProfileNotFoundError`; `'fallback'` (the read-only preview route)
  → silently proceeds to the safety net with no warning logged for *this*
  branch specifically (the one `console.warn` at line 243 only fires for
  the different "profileId was set but not found" sub-case, not the
  "no profileId resolved at all" case — see §7.5).
- Lines 258-273 (the safety net): if zero categories were populated (which
  happens whenever `profileId` never got set, i.e. no explicit id **and**
  no `productProfileMap` hit), picks
  `profilesList.find(hasUsableRules) ?? HARDCODED_DEFAULT_PROFILE` —
  **first-in-array-order**, not by any relevance/match criterion.

**Dimension side** — `backend/src/engine/dimensionEvaluator.ts`, new
since §5.9, not previously audited for missing-product-code behavior:
- Line 135: `matrixEntry = productMatrixConfig?.[productCode]` — a plain
  object index, `undefined` if the code isn't a key.
- Line 136: `sizeEntry = matrixEntry?.sizes?.[size]` — also `undefined`
  when `matrixEntry` is `undefined`.
- Lines 138-150: with no `matrixEntry`, `dynamicDimensions` falls back to
  `globalDimensionDefs` (`AppConfig.dimensions`, 6 generic entries with
  their own flat `minSpec`/`tolerance`).
- Lines 92-96 (`getDimSpec`, fixed rows): with no `sizeEntry`,
  `target = parseFloat(sizeEntry?.lengthTarget ?? '0') || 0` → **0**, and
  `threshold = minSpec > 0 ? minSpec - tolerance : 0` → **0**, with
  `maxThreshold` defaulting to `Infinity`. **There is no error path or
  logging anywhere in this file** — unlike `resolveVerdict.ts`, a missing
  product code here is unconditionally silent, with no `'throw'` mode to
  even opt into.

### 7.4 Visual category structure — 3-family vs. 5-family — NOT resolved, flagged as instructed

Per the task's explicit instruction, this discrepancy is **not
reconciled here**. What was determined instead: **the engine and schema
impose no fixed category count or structure at all.**
`AQLCategory[]`/`DefectDefinition[]` (`DATA_SCHEMAS_AND_TYPES.md` §2.1)
and `evaluateAQLVerdict()` (`ISO2859_MATH_ENGINE.md` §2,
`backend/src/engine/aqlEvaluator.ts`) iterate whatever categories a
profile happens to contain — 3, 5, or any other number are equally valid
to the code. So neither the "QA sheet" (3-family: AND/Barrier/Visual
combined) nor the "Edit sheet" (5-family: AND/Barrier/CriticalVisual(1.0)/
MajorVisual(2.5)/MinorVisual(4.0)) reading is "expected" by the engine —
**this is a business/data-authoring decision, not a code constraint**, and
needs to be made before any real profile is seeded, because it determines
the shape of the profile that gets authored.

**What the live `prof_default` profile actually implements today (see
7.2's raw dump) doesn't cleanly match either reading:** 6 categories —
BARRIER (1.0/CUMULATIVE), CRITICAL VISUAL (1.5/CUMULATIVE), MAJOR VISUAL
(2.5/GRANULAR), MINOR VISUAL (4.0/GRANULAR), NEW CATEGORY (1.0/CUMULATIVE),
PACKAGING (PASS/FAIL/NIL/N/A). This is closer in *shape* to the 5-family
(Edit sheet) reading than the 3-family one, but:
- has **no dedicated `AND`/zero-tolerance category at all** — the real
  8-defect AND family (Cut, Embedded Particle, Knocking, Mixed Size, Mixed
  Type, Tear, Touching, Double Glove/Dip) has no home in the live profile;
- CRITICAL VISUAL is AQL `1.5`, not the `1.0` the Edit sheet's "Critical
  Visual (AQL 1.0)" tier implies;
- carries an unexplained sixth category (`NEW CATEGORY`) and a `PACKAGING`
  category that correspond to nothing in the given real taxonomy (may be a
  legitimate separate business need — nothing in the ground truth supplied
  to this audit confirms or denies that, so it's flagged, not judged).

**Also unresolved, flagged rather than guessed at:** the user's ground
truth states the QA sheet treats all 30 Visual defects as **one combined
category** for its real Pass/Fail/DPM/AQL computation, but doesn't specify
what `evaluationMode` (CUMULATIVE vs. GRANULAR) that combined category — or
any of the three split tiers, if the 5-family reading is chosen instead —
actually uses in the real formulas. **This audit cannot verify the live
profile's `evaluationMode` values against real ground truth** for that
reason; it can only report what's currently configured (above) and note
that the underlying QA-sheet formula detail wasn't part of the ground
truth handed to this session.

### 7.5 Silent-fallback trace (own subsection, per instruction)

**Critical prerequisite finding: there are two different call sites with
opposite `profileId` behavior, and only one of them actually exercises
`productProfileMap` today.** Verified by reading every `resolveVerdict()`
call site in `backend/src/routes/submissions.routes.ts` and the two
frontend callers directly:

| Call site | `profileId` sent? | Reaches `productProfileMap`? |
|---|---|---|
| `POST /api/submissions` (initial submit) | **Always explicit** — `StepMetadata.tsx`/`BatchEntry.tsx` both make Profile a required dropdown field, pre-filled via `config.inspectionProfiles.find(p=>p.isDefault) ?? [0]` **independent of the chosen product code** (confirmed: no effect keyed on `productCode` sets `profileId` in either file) | **No** — explicit id always short-circuits the map lookup (`resolveVerdict.ts:219-224`) |
| `POST /api/submissions/:id/amendments`, `.../approve` | Explicit, from `newValues.profileId ?? existing.profileId` | No, same reason |
| `POST /api/verdict/preview` called from `StepReviewSubmit.tsx` (wizard Step 4 live preview) | Explicit — `inspectionData.profileId`, same required field | No |
| `POST /api/verdict/preview` called from `HistoryFeed.tsx`'s `DefectBreakdownPanel` (History row expand) | `sub.profileId ?? null` — and **`Submission.profileId` is `null` for every submission that has ever been persisted**, per the already-documented §5.5/§5.12 empty-`InspectionProfile`-table gap | **Yes — this is the only live call site where `productProfileMap` is actually consulted**, and it fires on every single History-row expansion |

This means the exact mechanism the task set out to trace
(`productCode → productProfileMap → profile`) is presently **live only
through History view**, not through the submission path — the submission
path bypasses it entirely via the always-explicit, product-code-blind
"default profile" pre-fill. This is itself worth noting for §5.4: the
`ISO2859_MATH_ENGINE.md` §3 claim ("Selecting a SKU triggers a lookup in
`productProfileMap`... to auto-load the correct `InspectionProfile`") is
**not actually wired into either submission UI** — confirmed by reading
both files, no `productCode`-keyed effect sets `profileId` in either.

**Per-product-code trace, using the live data from §7.2:**

**`N025SKB-OC-24FT`**
- `productProfileMap["N025SKB-OC-24FT"]` → `"prof_default"` — exact key match, byte-for-byte, no whitespace/casing issue found.
- `profilesList.find(p => p.id === 'prof_default')` → **found** (the real, admin-authored "GLOBAL STANDARD" profile, not the code-only `HARDCODED_DEFAULT_PROFILE` constant — same id string, different object/provenance, see the callout below).
- Safety net not triggered (categories populated, `BARRIER` has both `aql`/`evalMode` set).
- **Verdict: CLEAN MATCH** — but see 7.6, the profile it cleanly matches to has almost no real defect-taxonomy content.
- **Cannot be exercised via the submission UI at all** — this code isn't in `productCodes`, so it can't be selected in the wizard or `BatchEntry` grid today. Only reachable if a submission for it existed via direct API and was later viewed in History.

**`N035MNV-OC-24FT`**
- `productProfileMap["N035MNV-OC-24FT"]` → `"prof_default"` — exact match, same as above.
- **Verdict: CLEAN MATCH**, same mechanism as `N025SKB-OC-24FT`.
- The one code actually present in `productCodes` (selectable) **and** in `productMatrixConfig` (real per-size dimension specs) — the only one of the three that resolves cleanly on *both* the AQL side and the dimension side.

**`N030SKB-OC-24FT`**
- `productProfileMap["N030SKB-OC-24FT"]` → **not a key.** The map instead contains `"N030MNV-OC-24FT"` and `"R030MNV-OC-24FT"` — neither matches. Both look like corrupted copies of `N035MNV-OC-24FT` (the `035`→`030` segment was updated but `MNV` was never corrected to `SKB`; one entry additionally has `N`→`R` on the leading character). This is precisely the "near-miss, not an obvious typo" pattern the task asked to watch for, just manifesting as a wrong middle token rather than whitespace/casing.
- `profileId` stays `null` → the `if (profileId)` block (`resolveVerdict.ts:233-256`, including its one `console.warn`) is **skipped entirely, not entered** — this case produces **zero log output of any kind**, silent even server-side.
- Safety net (line 260) fires: `profilesList.find(hasUsableRules)` scans in array order — `prof_default` is first **and** usable, so it wins.
- **Verdict: SILENT FALLBACK** — lands on `prof_default` today only because it happens to be first in the array and the only other 2 real codes also map there; this is a coincidence of current data, not a designed match. If `prof_default` were ever removed from `inspectionProfiles`, or a different profile were inserted earlier in the array, this code would silently start grading against a **different, unrelated** profile (e.g. `MEDLINE`) with no error and no log line anywhere.
- Also **not selectable** in `productCodes` and **absent from `productMatrixConfig`** — same as `N025SKB-OC-24FT`, compounding the AQL-side silent fallback with a dimension-side one (below).

**Dimension-matrix trace (`productMatrixConfig`), same three codes:**

| Product code | `productMatrixConfig` entry? | Result |
|---|---|---|
| `N025SKB-OC-24FT` | No | **SILENT FALLBACK** — the two fixed dimensions (GLOVE LENGTH, PALM WIDTH — the headline rows per `ISO2859_MATH_ENGINE.md` §5 and `StepDimensions.tsx`) get `threshold=0, maxThreshold=Infinity`: a **total no-op**, no measurement can ever fail them. The 6 global dynamic dimensions (from `AppConfig.dimensions`) still apply *some* check — flat, size-blind values (e.g. glove length min 240mm regardless of size) — real thresholds, just not product/size-specific ones. |
| `N035MNV-OC-24FT` | Yes — full per-size spec, 5 dynamic dims, recently amended (2026-08-03) | **CLEAN MATCH** |
| `N030SKB-OC-24FT` | No | Same **SILENT FALLBACK** as `N025SKB-OC-24FT` |

Unlike the AQL side, `dimensionEvaluator.ts` has **no `'throw'` option at
all** — there is no way for a caller to request loud failure on a missing
product code here; every unresolved case degrades silently by
construction. No `LOUD FAILURE` case exists anywhere in the dimension
subsystem today.

### 7.6 Summary table

| Product code | Profile-map match | Selectable in UI (`productCodes`) | `productMatrixConfig` entry | Category structure | Defect names present (of real 47) | AQL levels vs. ground truth | Eval modes vs. ground truth | Sample sizes (50/80/125) supported | AQL fallback behavior | Dimension fallback behavior |
|---|---|---|---|---|---|---|---|---|---|---|
| **N025SKB-OC-24FT** | Exact key match → `prof_default` | **No** | **No** | 6 categories (BARRIER/CRIT VISUAL/MAJOR VISUAL/MINOR VISUAL/NEW CATEGORY/PACKAGING) — no dedicated AND family | **~3 of 47** (see 7.7) | Partial: BARRIER 1.0 ✓, CRITICAL VISUAL 1.5 ✗(should be 1.0 per Edit sheet), MAJOR 2.5 ✓, MINOR 4.0 ✓, AND missing entirely | Not verifiable — real formula not supplied | Yes (`sampleSizes` includes all 3) | **CLEAN MATCH** (to `prof_default`) | **SILENT FALLBACK** (fixed dims no-op) |
| **N035MNV-OC-24FT** | Exact key match → `prof_default` | **Yes** (only one in list) | **Yes** (real per-size spec) | Same as above | Same as above | Same as above | Same as above | Yes | **CLEAN MATCH** | **CLEAN MATCH** |
| **N030SKB-OC-24FT** | **No key** — wrong entries (`N030MNV…`, `R030MNV…`) present instead | **No** | **No** | Same as above (via safety net, same profile object) | Same as above | Same as above | Same as above | Yes | **SILENT FALLBACK** (zero log output) | **SILENT FALLBACK** (fixed dims no-op) |

### 7.7 Defect-name cross-check detail (backs the "~3 of 47" figure above)

All three real codes ultimately resolve (cleanly or via fallback) to the
same `prof_default` profile content, so this check is done once, against
that profile's 11 defects across 6 categories, spot-checked against the
real 47-name taxonomy:

- **Exact string matches (3):** `Porous` (live: MAJOR VISUAL), `Thin Layer`
  (live: MAJOR VISUAL), `Flow Mark` (live: MINOR VISUAL) — genuinely
  present in both, though the real taxonomy doesn't specify which of the
  three Visual tiers each belongs to (see 7.4), so tier-correctness can't
  be independently confirmed.
- **Same name, wrong family (1):** `Tear` — exists in both, but real
  ground truth places it in the **AND** family (zero tolerance); the live
  profile has it under **BARRIER** (AQL 1.0, CUMULATIVE). Same word,
  different grading rule entirely.
- **Near-misses (compound/partial names):** live `Hole` vs. real
  `Visible Hole` (Barrier family in ground truth; live has it under
  BARRIER too, so category is plausible even though the name is
  truncated); live `Stain` + `Dirt` (two separate live defects, CRITICAL
  VISUAL and MAJOR VISUAL respectively) vs. real `Dirt/Stain` (one
  compound Visual-family name); live `Thin Spot` vs. real
  `Thin/Weak Spot`; live `Particle` vs. real `Embedded Particle` (real:
  AND family; live: CRITICAL VISUAL — another cross-family mismatch, same
  pattern as `Tear`).
- **No correspondence in the real 47 at all:** `Donning` (live: NEW
  CATEGORY), `Box Damage` (live: PACKAGING) — PACKAGING as a family isn't
  represented anywhere in the given ground truth's AND/Barrier/Visual
  structure.
- **Missing entirely (real defects with zero live representation):** the
  remaining ~40 of 47 real names — including all of AND except `Tear`
  (Cut, Knocking, Mixed Size, Mixed Type, Touching, Double Glove/Dip,
  Embedded Particle-by-that-exact-name), all 9 real Barrier names except
  the `Hole`≈`Visible Hole` near-miss (Burst, Multiple Pinhole, Pinhole At
  Crotch/Cuff/Finger/Finger Tip/Palm, Sagging), and ~27 of the 30 real
  Visual names (Lump, Flocking, Former Crack, Powder Mark, Rough Surface,
  Fish Eye, Line Mark, White Beading, Wet Glove, Shining/Oily Mark, Color
  Spotting, Incomplete Beading, Blister Beading, Discoloration, Glove Not
  Chlorinated, Glove Not Reverse, Overcured Glove, Rolled Cuff/Bead,
  Creasing Glove, Sticky, Sticky Pleat, Uncured Glove, Slip Mark, Smell
  Glove, White Patches, and more).
- **Checked the other 3 live profiles too** (`MEDLINE`, `CARDINAL`,
  `HENRY SHEIN`) in case `productProfileMap` should have pointed
  elsewhere: none come closer — `MEDLINE`/`CARDINAL` have only 6 defects
  each (a subset of `prof_default`'s set), `HENRY SHEIN` has the identical
  11-defect set as `prof_default`. No profile currently in `AppConfig`
  contains the real 47-name taxonomy, or anything close to it.

**Bottom line: independent of the fallback-mechanism question in §7.5,
the profile every real product code lands on today — cleanly or by
fallback — is demo/placeholder content, not a reflection of One Glove
Group's actual defect taxonomy.** Fixing the `productProfileMap` typos
alone (making `N030SKB-OC-24FT` resolve "cleanly") would not fix this —
it would just cleanly match it to the same wrong content the other two
codes already cleanly match to.

### 7.8 What this implies for §5.4 (informational only — not designed or implemented here)

- §5.4 framed the open question as "should the *hardcoded* default profile
  become per-tenant configurable." This audit surfaces a **prerequisite**
  question: right now, "no `productProfileMap` entry for this product
  code" and "no profile configured for this tenant yet" are
  indistinguishable — both silently land on the same first-usable-profile
  safety net (§7.5). A per-tenant default redesign should probably decide
  whether a missing map entry should stay silent (today's behavior) or
  become admin-visible (a warning badge, a config-health check, etc.),
  especially once real multi-product seeding begins and "silently graded
  against the wrong profile" becomes a live-data risk instead of a
  demo-data curiosity.
- `productMatrixConfig`'s silent fallback (§7.3, §7.5) is a **separate**
  gap from §5.3/§5.4's AQL-side fallback — different file, different
  mechanism (a no-op via zeroed thresholds, not a substituted profile
  object), and **not touched by §5.3's fix at all**. Worth folding into
  the same design conversation rather than assuming "the profile fallback
  is fixed" also covers dimensions.
- Seeding needs to populate **three** independently-keyed structures for
  each real product code, not one: `productCodes` (make it selectable at
  all), `productProfileMap` (route it to the right AQL profile), and
  `productMatrixConfig` (give it real dimension specs). A code can be
  perfectly correct in one and silently broken in the other two, as
  `N025SKB-OC-24FT` and `N030SKB-OC-24FT` currently demonstrate.
- Per §7.5's finding that `productProfileMap` is currently dead code on
  the submission path (profile is always operator-picked, pre-filled
  product-code-blind), whoever picks up §5.4 should also decide whether to
  actually wire the `ISO2859_MATH_ENGINE.md` §3-documented "select SKU →
  auto-load profile" behavior into `StepMetadata.tsx`/`BatchEntry.tsx`, or
  formally treat operator-selected-profile-with-default-prefill as the
  permanent intended design and correct the doc instead.
- The 3-family-vs-5-family decision (§7.4) has to be made **before**
  profile authoring starts, since it determines the category shape of
  whatever real profile(s) get seeded — this is a business decision to
  get from whoever owns the QA sheet, not something derivable from the
  code or schema.
- Whatever real profile eventually replaces today's placeholder content
  needs the actual 47-name taxonomy authored from scratch (§7.7) — no
  amount of fixing `productProfileMap` keys or `productMatrixConfig`
  entries substitutes for that; those fixes only get a real product code
  routed to *a* profile, not to a *correct* one.

---

## 8. Five Open Questions — Read-Only Investigation

**Status: READ-ONLY. No code changes, no edits to the six core docs.** Five
specific questions, each answered from the actual doc text and/or actual
code/schema/git history — not inferred. Every claim below is cited to a
doc section or a file/line. Two sub-questions turned out to have no
existing answer anywhere in the repo; flagged explicitly in place rather
than glossed over.

**Caveat on `archived/` citations (§8.1, §8.4): per Jerry, everything in
`archived/` may be outdated.** `archived/V4_MASTER_BLUEPRINT.md` is used
below in two places as supporting evidence, not as proof of current
intent — it's a superseded doc version by definition (that's why it's in
`archived/`), and nothing confirms its content still reflects what's
actually intended today. Both citations are flagged inline with this same
caveat repeated at the point of use, so neither can be read in isolation
as settled fact.

### 8.1 — Q1: Is ISO 2859 sampling math fixed, or tenant-configurable?

**`ISO2859_MATH_ENGINE.md` §1** ("ISO 2859-1 MASTER AQL LOOKUP ENGINE")
describes bracket snapping and the threshold matrix lookup with no
per-tenant/per-profile override language anywhere — confirmed by reading
the full doc (93 lines) end to end; the word "tenant" does not appear in
it at all, and "profile" appears only in §3's `productProfileMap`
description (which selects *which AQL level* to use, not the underlying
`ac`/`re` numbers — see below). **The doc itself never explicitly frames
this as a "fixed vs. configurable" design decision** — it's silent on the
question as a stated principle, not just terse about it.

**The code is unambiguous, though.** `backend/src/engine/iso2859-matrix.ts:1-30`
(file header): *"DO NOT MODIFY this file without cross-referencing against
the official ISO 2859-1:2005 standard document. All changes must be
reviewed and approved."* — a single `ISO_2859_MATRIX` constant
(lines 135-372) shaped `Record<sampleSize, Record<aqlLevel, {ac, re}>>`,
with no tenant/profile/product dimension anywhere in that shape. It is
imported and used as-is by `aqlEvaluator.ts`/`resolveVerdict.ts` for every
profile, every product code, every tenant (today: the only tenant).

**Confirmed nothing in `AppConfig` varies the underlying numbers either:**
- `AppConfig.sampleSizes` (live value: `[13,20,32,50,80,125,200,315,500]`,
  §7.2) is a picklist of which sample sizes the wizard's dropdown offers —
  `schema.prisma`'s own comment on this field: `/// JSON: number[] — valid
  AQL sample sizes` — not a table of `ac`/`re` values.
- Every `AQLCategory` object inside every live `inspectionProfiles` entry
  (§7.2's raw dump) carries only an `aqlLevel`/`aql` **string selector**
  (e.g. `"1.0"`, `"2.5"`, `"AND"`) — never a numeric `ac`/`re` override.
  That string is looked up in the one global `ISO_2859_MATRIX`.

**`archived/V4_MASTER_BLUEPRINT.md:193`** (⚠️ archived — may be outdated,
per Jerry; cited here only as corroborating context, not as proof of
current intent. Not one of the six core docs; `backend/prisma/schema.prisma:3`
claims it as an origin — *"Source of Truth: V4_MASTER_BLUEPRINT.md § 4
(Core Data Structures)"* — but that claim is itself just a code comment,
not independent confirmation the blueprint's content is still current)
states the intended mechanism: *"a strict customer (e.g., Ansell) to
require tighter AQL levels (e.g., 0.65 for Barrier) for specific product
codes, overriding the standard factory defaults (1.0)."* If still
accurate, this would confirm what varies per profile/tenant is **which
AQL level is assigned to a category**, not the ISO standard's own `ac`/`re`
numbers for that level — consistent with what the code actually does
today, but "consistent with" here means the archived doc doesn't
contradict the code, not that the code was verified to follow it.

**Answer: sampling math (bracket list + `ac`/`re` matrix) is a single,
fixed, standards-derived constant, shared globally across every profile
and tenant, in the *code as it exists today* — that part is directly
verified, independent of the archived doc.** Only the AQL-level-string
assignment per category is profile-configurable. The live
`ISO2859_MATH_ENGINE.md` doc never states the "fixed vs. configurable"
framing directly — that framing isn't addressed anywhere in the live doc
text itself. The archived blueprint's matching language is noted only as
context on possible original intent; given the outdated-content caveat
above, it isn't treated as confirming evidence for what's *currently*
intended.

### 8.2 — Q2: Does anything already anticipate a tenant-scoped admin role?

**`NAVIGATION_AND_RBAC.md` §2** (lines 17-25) — full current role list, 6
roles: `OPERATOR` (PIN, `/wizard` `/history`), `LEADER` (PIN or M365,
same two routes), `SUPERVISOR` (M365 w/ PIN fallback, adds `/analytics`),
`EXECUTIVE` (M365 only, adds `/approvals` `/config`), `MANAGER` (M365
only, same as Executive), `ADMIN` (M365 only, "All Routes including
`/system`"). Confirmed identical in code:
**`frontend/src/context/AuthContext.tsx:5`** —
`export type UserRole = 'OPERATOR' | 'LEADER' | 'SUPERVISOR' | 'EXECUTIVE' | 'MANAGER' | 'ADMIN';`
— no 7th role exists anywhere in the type system either.

**Who can edit `AppConfig`/config routes today, confirmed directly:**
`backend/src/routes/config.routes.ts:140` —
`router.patch('/', async (req: Request, res: Response) => { ... })` — no
middleware argument between the path and the handler, i.e. no
auth/role-check function runs before this handler at all. This is
consistent with (not a new finding beyond) the original audit's §B1/
Executive-Summary-#3 finding that `backend/server.ts` never registers any
auth middleware globally either. **Actual current enforcement is
client-side only**: `/config` is gated to EXECUTIVE/MANAGER/ADMIN via
`RoleRoute` in `App.tsx` (already cited in the original audit); the
`PATCH /api/config` endpoint itself has zero server-side role check and
will execute for any caller who reaches port 4009, regardless of role.

**Every `[PLANNED]` marker in the doc, grepped exhaustively across the
full file (3 total occurrences):** `/analytics` "partial implementation"
(§3, line 37); Bulk CSV/Excel import on `/history` (§3, line 41); JWT
bearer tokens "scoped by `tenantId`, `facilityId`, `lineId`, and `userId`"
(§4, line 47, *"PLANNED — NOT YET IMPLEMENTED"*). **None of these three
planned items names an additional role.** The JWT item describes a
planned *auth/session mechanism* scoped to the six existing roles by
tenant/facility/line/user, not a new role tier. §1's "Multi-Tenant &
Organizational Hierarchy" (`Tenant → Facility → Line → Machine/Shift/Batch`)
describes a planned **data** hierarchy, again not a role.

**Answer: no tenant-scoped admin role (e.g. a `TENANT_ADMIN`/`PLATFORM_ADMIN`
tier sitting above or across the existing `ADMIN`) is documented, planned,
or implemented anywhere in this repo — genuinely not addressed.** The
existing `ADMIN` role is described only as "System IT Admins" with no
statement either way on whether it's meant to be scoped per-tenant or
global across tenants once multi-tenancy exists; the doc never raises that
question, because multi-tenancy itself isn't implemented at all (per the
original audit's §B7). This part of Q2 has no existing answer — an open
decision.

### 8.3 — Q3: What does `lastAmended` actually do, and does any AppConfig versioning pattern exist?

**Where it's declared:** `DATA_SCHEMAS_AND_TYPES.md` §3, `ProductConfig`
interface: `lastAmended?: string;` (doc line ~184) — a bare type
declaration, no described behavior in the doc text itself.

**Where it's written — exactly once, unconditionally, no comparison:**
`frontend/src/pages/config/ProductEngine.tsx:164-176`,
`handleSaveProductConfig()`:
```ts
const draftWithTime = { ...expandedProductDraft, lastAmended: new Date().toISOString() };
```
This stamps the current time on every save, with **no read of the
previous `lastAmended` value first** — no staleness check, no
optimistic-concurrency comparison, no "has this changed since I opened the
editor" guard.

**Where it's read — display only, one place:** same file,
`frontend/src/pages/config/ProductEngine.tsx:374-387` — renders a
`Clock`-icon badge reading `UPDATED: {YYYY-MM-DD HH:MM}` next to each
product code in the Product Engine's list view, manually formatted from
the raw ISO string. **No other logic consumes this value anywhere** — not
for sorting, not for filtering, not for conflict detection. Confirmed via
a repo-wide grep for `lastAmended`: it appears in exactly 4 files total —
`DATA_SCHEMAS_AND_TYPES.md` (type only), `ConfigContext.tsx` (the
frontend's local mirror of the `ProductConfig` type, field declaration
only — no runtime usage), `ProductEngine.tsx` (the write + display
described above), and this report itself (from the prior session's §7.2).

**Any AppConfig-equivalent of `AmendmentLog`?** `AmendmentLog`
(`schema.prisma:87-135`) is a real, dedicated audit-trail model for
`Submission` changes: `originalValues`/`newValues` JSON snapshots,
`requestedBy`/`reviewedBy`/`requestedAt`/`reviewedAt`, `status`, plus the
`recomputedVerdict`/`recomputedCategoryResults`/
`recomputedFailedDimensions`/`recomputedDimensionResults` audit columns
added in §5.9/§c4be2e8. **Grepped the full `schema.prisma` for any
model name containing `History`, `Version`, or `Audit` — zero matches
beyond `AmendmentLog` itself.** No `AppConfigHistory`, `ConfigVersion`,
`ProfileAuditLog`, or anything analogous exists. `AppConfig` is a strict
Prisma singleton (`id String @id @default("1")`) that `PATCH /api/config`
overwrites in place (already documented in the original audit's §B5) —
editing or deleting a profile, category, or defect leaves **zero** history
anywhere.

**Answer: `lastAmended` is a write-once-per-save, display-only timestamp
— never compared, checked, or used for any conflict/staleness logic.**
It also only exists on `productMatrixConfig` entries (dimension specs) —
`inspectionProfiles` entries (the AQL/defect profiles themselves) carry no
timestamp of any kind, confirmed by the live `inspectionProfiles` dump in
§7.2 (no `lastAmended`/`updatedAt`/similar key on any of the 4 profile
objects). **No versioning/history pattern exists anywhere for AppConfig
content**, in contrast to `Submission`'s real, dedicated `AmendmentLog`
system.

### 8.4 — Q4: Was the profile/defect system ever meant to be relational tables, not JSON blobs?

**`DATA_SCHEMAS_AND_TYPES.md` §2.1** (lines 68-73) documents the
JSON-blob shape as **current fact**, stated matter-of-factly with no
rationale given and no mention of a relational alternative:
*"AppConfig JSON (`AppConfig.inspectionProfiles` field): Profiles are
stored as a serialized JSON array. Field names in the JSON blob may differ
from Prisma field names... The backend normalizes these before passing
them to the engine."* A full-doc grep for `relational`/`normalize`/
`normalization` returns zero hits beyond this one categoryId/currentClass
dual-naming note — **the doc never discusses relational tables as an
intended or rejected alternative at all.**

**But the relational shape already exists in the schema, unused, not
merely "documented as intended":**
`backend/prisma/schema.prisma:143-155` (`InspectionProfile`),
`:163-179` (`AQLCategory`, real FK `profileId → InspectionProfile`,
`onDelete: Cascade`, `@@unique([profileId, name])`), `:187-200`
(`DefectDefinition`, same FK pattern) — a fully normalized design, already
built. Confirmed empty (0 rows) via the live-DB query in §7.2's task —
real profile data has never once been written through these tables.

**Git history (`git log --all -- backend/prisma/schema.prisma`, 6 commits
total, oldest to newest):**
1. `7533b12` (2026-07-23, *"Session 2A - Database Schema"*) — introduces
   the relational `InspectionProfile`/`AQLCategory`/`DefectDefinition`
   models (confirmed via `git show 7533b12` — these appear as new `+`
   lines in this commit; this is the original schema).
2. `823ccf1` (2026-07-28, commit message literally just *"20260728"*, no
   descriptive text) — adds `aqlCategories`, `defectDefinitions`, **and**
   `inspectionProfiles` as three parallel `String @default("[]")` JSON
   columns directly on `AppConfig`, **all three in the same commit**,
   five days after the relational tables already existed — confirmed via
   `git show 823ccf1 -- backend/prisma/schema.prisma`.
3. `4534bb6` (2026-07-30, *"feat: refactor docs architecture and update
   wizard/config UI components"*) — adds only `productMatrixConfig`
   (a 1-line diff, confirmed via `git show --stat`);
   `aqlCategories`/`defectDefinitions`/`inspectionProfiles` untouched.
4. No commit since (`208f39d`, `c4be2e8`, `e3cd705`) touches these fields
   at all.

**No commit message across any of the 6 commits explains the decision**
to add a second, JSON-blob-based system alongside the already-existing
relational one, or states an intent to abandon the relational tables.

**The closest thing to an explanation found, and it predates all Prisma
work — ⚠️ archived, may be outdated, per Jerry; treat as historical color,
not a settled account of intent:** `archived/V4_MASTER_BLUEPRINT.md`
(`schema.prisma:3` claims it as source of truth, but that's a code
comment, not independent confirmation the blueprint still reflects
current thinking) lines 100-140 define `AQLCategory`/`DefectDefinition`/
`InspectionProfile` as standalone TypeScript interfaces (the shape that
became the relational Prisma models) **and, separately, in the same
document**, embed `defectDefinitions: DefectDefinition[]`,
`aqlCategories?: AQLCategory[]`, and `inspectionProfiles?: InspectionProfile[]`
directly on its own `AppConfig` interface (blueprint lines 130-140) —
i.e., if this archived doc is still an accurate record, **the blueprint
itself specified both shapes, unreconciled, before either was ever
implemented.** Given the outdated-content caveat, this is offered as a
plausible historical trace, not as a confirmed root cause.

**Answer: no explicit intent statement exists anywhere in the live docs,
code, or commit history — this is genuinely open, not inferable one way
or the other.** What's independently confirmed from `git log`/`git show`
alone, with no dependency on the archived doc: the relational shape was
built first (Session 2A, `7533b12`) and has sat completely unused since; a
parallel JSON-blob shape was added five days later (`823ccf1`) with no
recorded rationale in that commit or any other. The archived blueprint's
own unreconciled dual-shape (above) is a *possible* explanation for where
that ambiguity originated, offered with the caveat that the archived
doc's reliability as a record of current intent is itself unconfirmed.
Whether the JSON-blob approach was a deliberate simplification or the
relational tables are simply an abandoned false start is **not stated
anywhere reliable in this repo** — flagged as an open question for Jerry,
not answered here.

### 8.5 — Q5: Does any config-editing UI for defect names/AQL already exist?

**Yes — a live, fully wired one, not something to build from zero.**
`frontend/src/pages/ConfigPage.tsx:54-56,303-311` imports and renders
`QualityRules` (alongside `FactorySetup` and `ProductEngine`) at `/config`
(already established as live/routed in the original audit's §2.3).

**`frontend/src/pages/config/QualityRules.tsx:1-13`** (its own header
doc comment): *"Phase 3: Configuration Control - Quality Rules. Provides
interfaces to manage: 1. Inspection Profiles (CRUD, Default) 2. Defect
Category Setup — AQL level & Evaluation Mode per category (CUMULATIVE /
GRANULAR / N/A) 3. ISO Sample Sizes... 4. Defect Management Kanban Board
(per profile, drag-and-drop)."* This is not aspirational documentation of
a stub — confirmed by direct comparison that this component's
`defaultProfiles` seed data (lines 49-71: `prof_default`/"GLOBAL STANDARD",
with `def_hole`/`def_tear`/`def_stain`/`def_particle`/`def_dirt`/
`def_flow`/`def_box`) matches the live `inspectionProfiles` content
queried directly from `dev.db` in §7.2 almost exactly (down to the exact
defect IDs) — **this component is the actual tool that produced the live
config already audited in §7**, not a disconnected mock.

Real CRUD handlers present in the file: `handleAddProfile` (line 116),
`handleDuplicateProfile` (131), `handleSetDefaultProfile` (145),
`handleMoveCategory` (210), `handleRemoveCategory` (269),
`handleAddDefect` (297), `handleDeleteDefect` (320), `handleMoveDefect`
(327) — full add/remove/reorder for both categories and defects, plus an
`ISO_WHITELIST` (line 39: `['AND', '0.65', '1.0', '1.5', '2.5', '4.0',
'6.5', 'PASS/FAIL/NIL']`) and `EVAL_MODES` (line 41:
`['CUMULATIVE', 'GRANULAR']`) constraining category edits to valid
values.

**The dead `ConfigDashboard.tsx`** (already flagged unreachable in the
original audit's §2.5/B8) does have a "Defect Definitions" tab
(`frontend/src/components/config/ConfigDashboard.tsx:15-24,76-104`) with
a `defect.class` `<select defaultValue=...>` per row — but beyond the
whole component being unimported/dead, **this specific control is
non-functional even on paper**: line 24 is
`const [defects] = useState(INITIAL_DEFECTS);` — no setter is destructured
at all, so there is no code path by which a class change could ever be
persisted into state, dead component or not.

**Answer: `QualityRules.tsx` is a complete, live, functioning
defect-name/AQL-category-editing UI already reachable at `/config` for
EXECUTIVE/MANAGER/ADMIN.** The seeding/authoring work implied by §7's
findings (populating the real 47-defect taxonomy, deciding the 3-vs-5
Visual family structure, fixing `productProfileMap`/`productMatrixConfig`
entries) can be done **through this existing UI** — it does not require
new editing UI to be built. `ConfigDashboard.tsx`'s defect tab is dead
code and would need real state wiring even if resurrected, so it isn't a
usable second option.

### 8.6 — Summary: what remains genuinely open

Of the five questions, **four have concrete, evidence-backed answers from
live docs/code/git history alone, independent of `archived/`**
(§8.1's code-verified matrix behavior, §8.2, §8.3, §8.4's `git log`
findings, §8.5). The two `archived/V4_MASTER_BLUEPRINT.md` citations
(§8.1, §8.4) are corroborating color only, flagged per Jerry's note that
`archived/` content may be outdated — neither question's core answer
depends on the archived doc being accurate. **Two specific sub-points have
no existing answer anywhere in this repo, archived or otherwise,** and are
open decisions for Jerry, not inferred here:
1. **(Q2)** Whether a future tenant-scoped admin role/tier is intended at
   all, and if so whether it sits above, alongside, or replaces the
   existing `ADMIN` role — nothing in `NAVIGATION_AND_RBAC.md` or the
   codebase raises this question, let alone answers it.
2. **(Q4)** Whether the JSON-blob profile/defect storage shape was a
   deliberate design decision or the relational Prisma tables represent an
   abandoned first attempt that was never formally retired — no commit
   message, doc, or code comment (live or archived) states either
   position with any confirmed reliability.

---

## 9. Status Check — Auth Fix, Known-Issues Refresh, Relational-vs-Blob Effort

**Status: READ-ONLY. No code changes, no edits to the six core docs.**
Every claim below is from directly reading the live code in this pass, not
from memory of prior sessions or trust in old doc labels.

### ⚠️ Business-model correction — read this before B7 or §5.4

**This app is SINGLE-TENANT-PER-DEPLOYMENT, not shared-instance
multi-tenant.** Each company that buys this app gets its own separate
installation and its own separate database — never a shared instance with
data walls between customers. This corrects the assumption underlying the
original audit's **B7** ("Multi-tenancy reality check") and the framing of
**§5.4** below: both measured this app against a shared-instance
architecture (one running app, many customers, `tenantId` columns,
cross-tenant query scoping) that is **not the actual target model**. Under
single-tenant-per-deployment, `tenantId` scoping, cross-company auth
isolation, and a shared-instance data model are not needed — ever — because
isolation is already achieved structurally, by each company simply running
their own install. The `Tenant → Facility → Line → Machine` hierarchy
described in `NAVIGATION_AND_RBAC.md` §1 and the "eventually serve multiple
factories/customers" framing in §5.4 should be read through this
correction going forward.

**This does not touch the config-route auth gap below (§9.1)** — that's
about role-based access *within* one company's own install (an OPERATOR
vs. an ADMIN hitting the same backend), which matters identically under
single-tenant-per-deployment as it would under any other model.

**Not acted on now, per instruction** — this correction is logged here so
it's on record; reflecting it into `NAVIGATION_AND_RBAC.md`/B7's own text
is deferred to Phase 8's doc-update pass, not done in this session.

### 9.1 — Auth-fix status (highest priority)

**Directly checked, not assumed: the fix was never applied. Zero backend
authentication or authorization middleware exists anywhere in this
codebase, on any route, as of this pass.**

- **`backend/server.ts:25-30`** — the entire global middleware stack is
  `app.use(cors())` and `app.use(express.json({limit:'5mb'}))`. No
  auth/session/token middleware is registered before the four route
  mounts (`/api/config`, `/api/submissions`, `/api/amendments`,
  `/api/verdict`, lines 55-58).
- **Every individual route registration takes exactly two arguments —
  path and handler — with no middleware function between them.** Checked
  all of them directly:
  - `backend/src/routes/config.routes.ts:95` (`router.get('/', ...)`),
    `:140` (`router.patch('/', ...)`)
  - `backend/src/routes/submissions.routes.ts:106` (`router.post('/', ...)`),
    `:235` (`router.get('/', ...)`), `:256` (`router.get('/:id', ...)`),
    `:303` (`router.post('/:id/amendments', ...)`), `:407`
    (`amendmentsRouter.get('/pending', ...)`), `:434`
    (`amendmentsRouter.post('/:id/approve', ...)`), `:571`
    (`amendmentsRouter.post('/:id/reject', ...)`), `:633`
    (`verdictRouter.post('/preview', ...)`)
- **No auth middleware file exists to register even if someone forgot to
  wire it in** — `Glob` for `backend/src/**/*auth*` and
  `backend/src/middleware/**` both return zero results. There's nothing
  half-built; this was never started.

**Answer: no, the fix was never applied.** `PATCH /api/config`,
`POST /api/amendments/:id/approve`, and every other mutating endpoint
remain reachable by any HTTP client that can hit port 4009, with no role
check of any kind — identical to the original audit's B1 finding. RBAC
continues to be enforced **only** client-side, via `RoleRoute` in
`frontend/src/App.tsx` (unchanged since the original audit; not
re-verified line-by-line in this pass since nothing in this session
touched it, but nothing suggests it changed either — a UI-only guard is
trivially bypassed by any direct API call regardless). **Per instruction,
not fixed in this pass — this is the top open item in this report,
carried forward as ranked item #1 below.**

### 9.2 — Known Issues refresh (§5.1 – §5.13)

Each item re-checked against live code in this pass. Where a fix is
credited to a specific commit, that commit was confirmed via `git log`/
`git show`, not inferred from the doc's own prior narrative.

| § | Issue | Doc's old label | **Current status** |
|---|---|---|---|
| 5.1 | `config.routes.ts:174` `error?.message` on `unknown` — typecheck error | not fixed | **STILL OPEN**, unchanged. Re-read the exact line directly: `res.status(500).json({ error: '...', details: error?.message \|\| String(error) });` — identical to the original finding. Trivial, low-urgency, unrelated to anything else in this pass. |
| 5.2 | Migration history drift (`dev.db` vs. recorded migrations) | not fixed | **STILL OPEN**, unchanged and slightly worse in scope than when logged. `backend/prisma/migrations/` still contains only `20260723114800_init_schema` + `migration_lock.toml` — confirmed via direct directory listing. Every schema change since (AmendmentLog recompute columns, `AmendmentLog.recomputedFailedDimensions`/`recomputedDimensionResults`) was applied via `prisma db push`, per §5.9's own note — the drift has grown, not shrunk. Still an open decision, not a regression. |
| 5.3 | `resolveVerdict.ts` only read `aqlLevel`/`evaluationMode`, never `aql`/`evalMode` — real profiles silently ungraded | not fixed (deferred 2026-08-07) | **ALREADY RESOLVED.** `git log` shows commit `30385e5` — *"fix: read aql/evalMode field-name variants in resolveVerdict (§5.3)"* — explicitly fixing this by number. Confirmed independently by reading the live `normalizeForEngine()`/`hasUsableRules()` in `resolveVerdict.ts` directly (lines 90-91, 113-114): both already do `c.aqlLevel ?? c.aql` / `c.evaluationMode ?? c.evalMode`, exactly the fix the doc's own "Correct fix" section recommended. **The doc's "not fixed" status label was simply never updated after the fix landed** — this is the clearest example of doc/code drift found in this pass. This is also, separately, why §7's audit found `N025SKB-OC-24FT`/`N035MNV-OC-24FT` resolving *cleanly* to the real `prof_default` profile rather than falling back — that clean resolution depends on this exact fix. |
| 5.4 | Hardcoded default profile should become per-tenant configurable | design note, deferred to "the multi-tenancy phase" | **SUPERSEDED in its original framing** by the business-model correction above — there is no shared-instance "multi-tenancy phase" coming, so "per-tenant configurable" as literally stated no longer applies. **A narrower question survives, reframed:** each single-tenant install still ships with `HARDCODED_DEFAULT_PROFILE` baked into `resolveVerdict.ts` source code (not admin-editable) as the zero-state fallback, used only when *no* AppConfig-configured profile has usable rules yet. Since `QualityRules.tsx` already supports admin-driven profile CRUD including "Set Default" (`handleSetDefaultProfile`, confirmed in §8.5), the remaining gap is narrow and low-stakes: a brand-new install's very first bootstrapping default is code-level, not admin-configurable, until an admin sets up a real profile through the UI. Not the cross-tenant-conflict risk originally framed — a much smaller, single-install "first-run default" question. |
| 5.5 | Amendment prefill race condition (`StepMetadata.tsx`) | FIXED, verified 2026-08-08 | **ALREADY RESOLVED, confirmed still holding.** Re-read `StepMetadata.tsx` directly: `lastPopulatedRef` (line 121), `frozenLotNo`/`lotSeedRef` snapshot pattern (lines 267-268) — the exact fix mechanism described in the original write-up — all still present, unchanged. |
| 5.6 | `StepReviewSubmit.tsx` duplicated AQL engine, wrong thresholds | FIXED, verified 2026-08-08 | **ALREADY RESOLVED, independently reconfirmed** — this session's own §7.5 read `StepReviewSubmit.tsx`'s `POST /api/verdict/preview` call directly (explicit `profileId` from `inspectionData`) as part of tracing the profile-fallback mechanism; the server-call wiring described in §5.6 is still live. |
| 5.7 | Amendment verdict stale after post-prefill edits | FIXED, verified 2026-08-08 | **ALREADY RESOLVED, confirmed still holding.** Re-read `StepReviewSubmit.tsx` directly: the `useEffect(() => { if (overallVerdict) onUpdate?.({ overallVerdict }); }, [overallVerdict, onUpdate])` sync (lines 197-199) is still present, unchanged. |
| 5.8 | `HistoryFeed.tsx` duplicated AQL engine, N/A-mode badge bug | FIXED, verified 2026-08-08 | **ALREADY RESOLVED, independently reconfirmed** — this session's own §7.5 read `HistoryFeed.tsx`'s `DefectBreakdownPanel` calling `POST /api/verdict/preview` with `profileId: sub.profileId ?? null` directly; the server-delegated determination described in §5.8 is still live. |
| 5.9 | Amendment approval / initial submit dimension-blind | FIXED, verified 2026-08-08 | **ALREADY RESOLVED, confirmed still holding** — this session's §9.1 read of the approve endpoint (lines 469-476) and §7.3's earlier read of `resolveVerdict.ts` both confirm `size`/`dimensionMeasurements` are still wired into all three persisting call sites, with the `aqlVerdict === 'FAILED' \|\| failedDimensions > 0` fold intact. **Cross-reference, not a regression:** §7.3/§7.5 subsequently found a *different*, unrelated silent-fallback gap in the same dimension subsystem — missing `productMatrixConfig` entries silently zero out the two fixed-dimension thresholds for `N025SKB-OC-24FT`/`N030SKB-OC-24FT`. That's a data-completeness gap this fix doesn't address and was never meant to; §5.9's own fix (dimensions get evaluated *when data exists*) is unaffected and correctly resolved on its own terms. |
| 5.10 | `API_AND_INTEGRATION_SPEC.md`'s approve-endpoint doc claim is stale | not fixed (doc edit forbidden) | **STILL OPEN, unchanged.** The six core docs remain off-limits in every session to date, including this one — the doc still incorrectly implies the approve endpoint applies `newValues.verdict` verbatim. Low urgency (doc accuracy, not a functional bug), unchanged since logged. |
| 5.11 | `Submission.dimensionMins` schema comment/doc type reference stale | not fixed (doc edit forbidden) | **STILL OPEN, unchanged.** Re-read `schema.prisma`'s comment directly (during this session's §8.4 investigation): still reads `// DimensionMinimums: { thickness: number; length: number }`, still doesn't match the actual full-stats-object shape the field stores. Unchanged, low urgency. |
| 5.12 | Amendment approval 500s on `profileId` FK violation | FIXED, verified 2026-08-08 | **ALREADY RESOLVED, confirmed still holding.** Re-read the approve endpoint directly (this session, lines 492-503, 528): the `validDbProfileId` guard (`prisma.inspectionProfile.findUnique` existence check before writing) is present and unchanged, and `Submission.update()`'s `profileId` field uses the resolved `validDbProfileId`, not a raw `String(newValues['profileId'])`. |
| 5.13 | Amendment Defects step double-counts qualitative defects in display total | not fixed (cosmetic, logged) | **STILL OPEN, unchanged.** Re-read `StepDefects.tsx:113-115` directly: `defectCounts` is still seeded via `useState<Record<string,number>>(inspectionData?.defects ?? {})` with no category-eval-mode filtering — the exact unfiltered-seed pattern originally described. Display-only, cosmetic, confirmed unchanged. |

**Net count: 6 STILL OPEN (5.1, 5.2, 5.10, 5.11, 5.13, plus the newly
reframed remainder of 5.4), 6 ALREADY RESOLVED and independently
reconfirmed still holding (5.3, 5.5, 5.6, 5.7, 5.8, 5.9, 5.12 — that's
actually 7, see note), 1 SUPERSEDED-in-its-original-framing (5.4).** Note
on the count: 5.4 is counted once, under SUPERSEDED, not double-counted
under STILL OPEN — its narrow reframed remainder is real but categorically
different from the other STILL OPEN items (a design nicety, not a bug).
**The single most important correction in this refresh is §5.3**: it was
fixed by commit `30385e5` but the doc never stopped saying "not fixed,"
which — if trusted at face value — would have misdirected anyone reading
this report into re-investigating or re-fixing an already-solved problem.

### 9.3 — Relational tables vs. JSON blob: effort/tradeoffs (lightweight first pass, not a recommendation)

**Current persistence pattern, confirmed directly:** there is exactly
**one** write path for profile/category/defect data today.
`QualityRules.tsx` mutates a plain JS array in local React state
(`handleAddProfile`, `handleRemoveCategory`, `handleAddDefect`, etc., all
cited in §8.5) → calls `onChange(data)` → `ConfigPage.tsx`'s
`handleFactoryChange` (`ConfigPage.tsx:152-154`) merges it into one
`draftConfig` object → `handleSave()` (`ConfigPage.tsx:127-136`) fires a
**single** `PATCH /api/config` with the entire `draftConfig` — including
the whole `inspectionProfiles` array — as one JSON body. The backend
re-serializes that whole array back into the `inspectionProfiles` string
column in one `prisma.appConfig.upsert()` call. There are no per-entity
endpoints (no `POST /api/profiles`, no `PATCH /api/profiles/:id/categories/:catId`,
etc.) — the entire profile system is a single whole-blob overwrite, both
ways.

**Option A — revive the relational tables (`InspectionProfile`/
`AQLCategory`/`DefectDefinition`):**
- **Schema:** the tables themselves are already well-formed (proper FKs,
  `onDelete: Cascade`, `@@unique([profileId, name])` on `AQLCategory` —
  `schema.prisma:143-200`, confirmed in §8.4) — no schema redesign needed,
  just actual usage.
- **`resolveVerdict.ts`:** would need real rework, not a small patch.
  Today it does one `prisma.appConfig.findUnique` + `JSON.parse` +
  in-memory `Array.find()` (`resolveVerdict.ts:214-256`). Moving to
  relational storage means replacing that with real Prisma relational
  queries (`prisma.inspectionProfile.findUnique({where:{id}, include:{aqlCategories:true, defectDefinitions:true}})`-shaped
  calls) at every resolution branch — the explicit-id lookup, the
  `productProfileMap` branch, and the safety-net "first usable profile"
  scan (which today is a synchronous array scan and would become a real
  query, e.g. needing an `isDefault`-first ordering or a dedicated query).
  `normalizeForEngine()`'s dual-field-name handling (`aql`/`evalMode` vs.
  `aqlLevel`/`evaluationMode`) would likely still be needed unless the
  write side is also migrated cleanly, since the Prisma `AQLCategory`
  model's own columns are already named `aqlLevel`/`evaluationMode` (no
  `aql`/`evalMode` aliasing at the schema level) — so a clean migration
  would let this normalization step be *dropped* for relationally-sourced
  data, but only once nothing writes the `aql`/`evalMode` shape anymore.
- **`QualityRules.tsx`:** the larger lift. Every one of its 8+ CRUD
  handlers (§8.5's list: `handleAddProfile`, `handleDuplicateProfile`,
  `handleSetDefaultProfile`, `handleMoveCategory`, `handleRemoveCategory`,
  `handleAddDefect`, `handleDeleteDefect`, `handleMoveDefect`) currently
  mutates local array state with no network call per action — moving to
  relational tables means either (a) converting each into a real,
  immediate REST call against new per-entity endpoints that don't exist
  yet (a full CRUD API surface: create/rename/delete profile, category,
  defect, each independently), which changes the save model from
  "draft-then-batch-PATCH" to "save-as-you-go," a real UX/architecture
  change, not just a backend swap; or (b) keeping today's
  draft-then-batch-save UX and having the backend **diff** the incoming
  whole-profile JSON against the current relational rows on `PATCH
  /api/config` (or a new endpoint) and translate that into
  upserts/deletes server-side — less frontend disruption, but real new
  backend diffing logic that doesn't exist in any form today.
- **Other consumers to update:** `ConfigContext.tsx`'s
  `getResolvedProfile()` (client-side display resolution, mentioned in
  §5.3/§B3) currently reads the same JSON-blob shape — would need its own
  update if the frontend ever reads profiles from a real API instead of
  the `GET /api/config` blob, though it could plausibly keep reading a
  server-formatted JSON shape even if the backend's storage changes
  underneath, decoupling this from the storage decision itself.

**Option B — keep the JSON blob, remove the dead relational tables:**
- Much smaller: drop the 3 unused Prisma models
  (`InspectionProfile`/`AQLCategory`/`DefectDefinition`) and their
  relation on `Submission.profileId` (currently a real FK, `schema.prisma:66-68`,
  `profileId String?` + `profile InspectionProfile? @relation(...)`) —
  one migration, no application-code changes required to
  `QualityRules.tsx` or `resolveVerdict.ts`, since both already work
  entirely against the JSON blob today.
- **Direct side benefit:** if `Submission.profileId` stops being an
  enforced FK (becomes a plain nullable string, storing whatever profile
  id was in effect at submit time as an opaque historical reference),
  the entire class of bug §5.12 had to guard against — writing an
  AppConfig-JSON profile id into a column with a real FK constraint into
  an empty relational table — becomes structurally impossible rather than
  patched. The `validDbProfileId` existence-check guards in both
  `POST /api/submissions` and the approve endpoint (§9.2's 5.12 entry)
  could be simplified or removed entirely under this option, since there
  would be nothing left to validate against.

**Migration risk for the data currently in the JSON blob, if Option A is
chosen:** low, given current volume. The live `inspectionProfiles` blob
holds exactly 4 profiles (`prof_default`, `MEDLINE`, `CARDINAL`,
`HENRY SHEIN` — confirmed in §7.2), a few dozen categories/defects total —
a one-time, mechanical migration script (parse JSON → Prisma `create()`
calls) is low-effort and low-risk purely on data-volume grounds. Two real
wrinkles, both already documented elsewhere in this report, not new:
(1) the `aql`/`evalMode` vs. `aqlLevel`/`evaluationMode` field-name
inconsistency (§5.3) and the `categoryId` vs. `currentClass` dual-naming
(`DATA_SCHEMAS_AND_TYPES.md` §2.1) would need to be reconciled *during*
the migration script, not just at read time; (2) **zero existing
`Submission` rows reference any profile via FK today** — every submission
in the live dataset has `profileId: null` (confirmed repeatedly: §5.5,
§5.12, §7.2's raw `Submission` dump) — so there is no
orphaned-FK/broken-history risk on the migration; historical submissions
simply have nothing to remap.

**No recommendation given, per instruction — this is scoping detail for
Jerry's decision, not a proposed direction.**

### 9.4 — DECISION LOGGED: Visual category structure resolved (5 families)

**§7.4/§7.6's "3-family vs. 5-family" open question is now resolved by
Jerry.** Visual defects grade as **three separate severity tiers**, not
one combined category:

- **Critical Visual** — AQL 1.0
- **Visual Major** — AQL 2.5
- **Visual Minor** — AQL 4.0

Combined with the two families already unambiguous from the ground truth
(**AND** / Accept No Defect — zero tolerance, and **Barrier**), the real
profile structure is **5 families total**: AND, Barrier, Critical Visual,
Visual Major, Visual Minor. This resolves the discrepancy §7.4 explicitly
declined to reconcile (the "QA sheet" 's combined-Visual reading is not
the one being implemented).

**No schema or code change is implied by this note alone** — it only
closes the open question so future profile-authoring work (still pending,
per ranked item #2 below) starts from the right assumption instead of
guessing between two documented-but-unresolved readings. Recorded here,
not implemented: the live `prof_default`/`MEDLINE`/`CARDINAL`/
`HENRY SHEIN` profiles still don't reflect this structure or the real
47-defect taxonomy (§7.6/§7.7) — that authoring work is unchanged in scope
by this decision, just now unblocked on the structural question.

---

## Ranked Open Items (as of this pass)

Priority order reflects what blocks what, not effort or preference —
decisions on all of these remain Jerry's.

1. **Backend auth middleware never applied (§9.1).** Every mutating
   endpoint, including config writes and amendment approval, is open to
   any caller with no role check. This is a within-single-install gap
   (ADMIN vs. OPERATOR), unaffected by the multi-tenancy correction above
   — still the single highest-severity open item in this report.
2. **Real defect taxonomy and product/profile config were never seeded**
   (§7) — `productCodes`, `productProfileMap`, and `productMatrixConfig`
   are each incomplete or wrong for 2 of the 3 real product codes, and the
   live profile content itself is placeholder data unrelated to the real
   47-defect taxonomy. Blocks any real production use regardless of what
   else gets fixed.
3. **3-family-vs-5-family Visual category structure (§7.4/§7.6) is an
   unmade decision that blocks #2** — profile authoring can't start
   correctly until this is decided.
4. **Relational-tables-vs-JSON-blob decision (§8.4/§9.3)** — not urgent on
   its own (both are structurally sound as they stand — the relational
   tables are just unused; the JSON blob works but has no CRUD API), but
   worth deciding before any new profile-editing capability is built on
   top of one or the other, to avoid building twice.
5. **Tenant-scoped admin role question (§8.2/§8.6)** — now lower-stakes
   given the single-tenant-per-deployment correction above (no
   cross-tenant access-control gap exists to close), but the underlying
   "does ADMIN need a tier above it within one install" question is still
   open if that's ever wanted.
6. **Housekeeping items** (§9.2's STILL OPEN list: 5.1 typecheck error,
   5.2 migration-history drift, 5.10/5.11 stale doc text, 5.13 cosmetic
   double-count, 5.4's narrowed first-run-default question) — all
   low-urgency, none blocking, none newly discovered as more severe than
   originally logged.
7. **Doc corrections owed once the six core docs are back in scope**
   (Phase 8, not now): the multi-tenancy correction above needs to land in
   `NAVIGATION_AND_RBAC.md`/B7; §5.3's now-stale "not fixed" label needs
   correcting in this report itself; §5.10/§5.11's doc-accuracy items;
   and `AI_RULES.md`'s stale model-ID table (original audit's §B9).

---

## 10. Code Change Pass — Auth Middleware, Visual-Tier Decision, Relational Table Removal

**Status: CODE CHANGES. Two commits landed this session
(`2a05d51` Part 1, `c32a1b1` Part 3), plus this doc-only append. No edits
to the six core docs.** Each part below follows the discovery → plan →
one-file-per-turn → typecheck → live-verify → commit cycle; `dev.db` was
restored to the 19-submission/0-amendment-log baseline before each of the
two code commits (confirmed via direct Prisma row counts both times, not
assumed).

**Ranked-items update (supersedes §9's list above, not edited in place —
same non-destructive pattern as §9.2's §5.3 correction):** ranked items
**#1** (auth middleware) and part of **#4** (relational-vs-blob decision)
from §9's closing list are now resolved by this section. §9's list is left
as-is above as the historical record of what this pass started from.

### 10.1 — Part 1: Backend auth middleware — RESOLVED

Full design rationale already recorded in the approved plan and is not
repeated here; this is the implementation-and-verification record.

**What shipped** (commit `2a05d51`):
- `backend/src/middleware/auth.ts` (new) — `requireRole(...allowedRoles)`,
  a middleware factory reading the `X-User-Role` request header and
  checking it against a per-route allow-list. Missing header → `401`;
  unrecognized role string → `401`; recognized-but-not-permitted → `403`.
- Wired into 5 backend routes: `PATCH /api/config` and
  `POST /api/amendments/:id/approve`/`reject` (EXECUTIVE, MANAGER, ADMIN
  only, per `NAVIGATION_AND_RBAC.md` §2's `/config`/`/approvals` gates);
  `POST /api/submissions` and `POST /api/submissions/:id/amendments`
  (all 6 roles, matching `/wizard`'s "all roles" gate).
  `GET /api/config`, the other `GET` routes, and
  `POST /api/verdict/preview` deliberately left ungated — non-mutating,
  and `GET /api/config` specifically is needed by every role just to
  render pages, not `/config`-page-specific.
- `frontend/src/context/AuthContext.tsx` gained `authHeader(user)`, wired
  into the 5 corresponding mutating `fetch()` call sites across
  `WizardPage.tsx` (×2), `BatchEntry.tsx`, `ConfigPage.tsx`, and
  `ApprovalsQueue.tsx`. `ProductCatalog.tsx`'s own `PATCH /api/config`
  call was deliberately left unwired — it's dead code (unreachable, per
  the original audit's §2.5).

**Explicitly not real cryptographic auth, stated plainly (again) here:**
the header is a client-claimed role with no session/JWT/signature behind
it — matching the mock-auth maturity of the rest of this app's login
flows (`NAVIGATION_AND_RBAC.md` §4 still marks token-based sessions
`[PLANNED — NOT YET IMPLEMENTED]`). What changed is narrow and real: a
caller can no longer mutate data while claiming **no** identity at all,
and a caller claiming a role outside the route's allow-list is rejected
server-side, independent of whatever the React `RoleRoute` UI gate shows.

**Live verification, all via the real running app (not simulated),
covering every scenario the task specified:**

| Scenario | Method | Endpoint(s) | Result |
|---|---|---|---|
| No `X-User-Role` header at all | `curl` | `PATCH /api/config`, `POST /api/amendments/:id/approve` | `401`, `"Authentication required: no user role provided."` |
| `X-User-Role: OPERATOR` | `curl` | same two, plus `.../reject` | `403`, `"Role 'OPERATOR' is not permitted to perform this action."` |
| `X-User-Role: SUPERADMIN` (unrecognized) | `curl` | `PATCH /api/config` | `401`, `"Unrecognized role: 'SUPERADMIN'."` |
| `X-User-Role: ADMIN` | `curl` | `PATCH /api/config` | `200` |
| `X-User-Role: EXECUTIVE` | `curl` | `.../reject` (nonexistent id) | Passed the auth gate, reached real business logic — `404` `"No pending amendment found"`, not `401`/`403` |
| **ADMIN, real UI** | Browser — mock M365 login → `/config` → the existing dev-tool dirty-state trigger → **Save Configuration** | `PATCH /api/config` | `200`, confirmed via network trace including the `X-User-Role: ADMIN` header (implied by the preceding CORS preflight `OPTIONS` succeeding, since a custom header is what triggers a preflight at all) |
| **OPERATOR, real UI** | Browser — PIN `123456` login → full wizard click-through → **Submit Lot** | `POST /api/submissions` | `201 Created`, real submission persisted and verdict server-computed correctly |

**One test-tooling note, not an application bug:** the Browser pane's
simulated mouse clicks did not reliably trigger onClick handlers on this
app's `motion.button` (Framer Motion) elements and React Router `<Link>`s
in this preview environment specifically — confirmed via
`getBoundingClientRect`/`elementFromPoint` that click coordinates were
landing exactly on the right element each time, yet no state change
followed. Switched to dispatching real `MouseEvent('click', {bubbles:true})`
via `javascript_tool` at the same DOM nodes for the rest of this
session's browser verification — this is not a shortcut around the app's
logic (the dispatched event runs through the exact same React handler a
real click would), just a different event-injection mechanism to work
around what appears to be a Browser-pane/Framer-Motion interaction quirk,
unrelated to anything this session changed.

**`dev.db` cleanup before commit:** one test submission created during
OPERATOR verification (`cmskfi1z60000awc4v0xxf6aw`) deleted directly via
Prisma; confirmed back at 19 submissions / 0 amendment logs before
`git commit`.

### 10.2 — Part 2: Visual-tier decision — see §9.4

Recorded as **§9.4** above (kept there rather than duplicated here, since
it's a documentation-only decision note, not a code change, and §9.4 sits
naturally alongside §9.3's relational-tables discussion it partially
unblocks). No code or schema change was implied or made by this decision
alone.

### 10.3 — Part 3: Relational table removal — RESOLVED

Full design already recorded in the approved plan; this is the
implementation-and-verification record. Commit `c32a1b1`.

**Discovery turned up one thing the original §8.4/§9.3 pass hadn't
catalogued:** confirmed via a fresh schema grep that `Submission.profile`
was the only relation into `InspectionProfile` from outside the three
models themselves — matching the plan's assumption — but the
**typechecker**, not the schema grep, subsequently caught two more
code-level dependencies neither discovery pass had surfaced:
`aqlEvaluator.ts` imported `AQLCategory`/`DefectDefinition` **types**
(not queries) directly from the generated Prisma client for its function
signatures, and `GET /api/submissions/:id` had an
`include: { profile: { include: {...} } }` clause. Both are exactly the
kind of thing the plan's own "confirm nothing else references them via a
repo-wide grep" verification step was there to catch — it did, via the
compiler rather than the grep.

**What shipped:**
- `schema.prisma`: removed `InspectionProfile`/`AQLCategory`/
  `DefectDefinition` entirely; `Submission.profileId` is now a plain
  nullable `String` with no relation. Applied via `prisma db push` (per
  instruction — never `migrate dev`, given §5.2's already-drifted
  migration history).
- `submissions.routes.ts`: both `validDbProfileId` guards (in
  `POST /api/submissions` and the approve endpoint) replaced with a new
  `isKnownProfileId()` helper — **chose to keep a sanity check rather
  than drop validation entirely** (the option the plan explicitly left
  open): checks the requested id against `AppConfig.inspectionProfiles`
  JSON keys (or the `'prof_default'` sentinel) instead of a DB `findUnique`,
  logs a `console.warn` and stores `null` on a miss rather than hard-failing
  — same degrade-gracefully behavior as before, just checking against the
  system that's actually authoritative now. Also removed the newly-found
  broken `include: { profile: {...} } }` clause from `GET /api/submissions/:id`.
- `aqlEvaluator.ts`: replaced the Prisma-client type import with local
  `AQLCategory`/`DefectDefinition` interfaces matching
  `DATA_SCHEMAS_AND_TYPES.md` §2.1's actual AppConfig-JSON shape — the
  shape the function has always actually received at runtime (via
  `resolveVerdict.ts`'s `normalizeForEngine()`), which the old Prisma-typed
  signature never really described correctly in the first place (masked
  by `any[]`-typed variables one level up).
- `check_db.ts`/`check_db.js` (ad-hoc dev scripts, not part of any
  build/test pipeline): one broken line each fixed — direct, mechanical
  fallout of the model removal, not scope creep.

**An unanticipated, genuinely positive side effect, confirmed live, not
assumed:** `Submission.profileId` now persists as the real profile id
(e.g. `"prof_default"`) instead of always being `null`. Previously, the
FK-existence check queried the permanently-empty `InspectionProfile`
table, so it **always** failed and silently degraded to `null` for every
real submission ever made (the "compounding factor" documented in
§5.5/§5.12). The new check queries the system that actually has the real
profiles in it, so it actually finds them.

**Live verification, real UI, real data, full amendment lifecycle:**
1. Fresh submission via the real wizard (ADMIN session, product
   `N035MNV-OC-24FT`) → `POST /api/submissions` → `201`, response body
   confirmed `"profileId":"prof_default"` (not `null`) and
   `verdict:"PASSED"` server-computed correctly against the live
   `AppConfig.inspectionProfiles` data — proving `/api/verdict/preview`'s
   own read path also survived the schema change intact.
2. Amended that same submission through History → "Amend Record" → real
   amendment wizard → `POST /api/submissions/:id/amendments` → `201`.
3. Approved it through the real Approvals Queue UI → "Review Diff" →
   "Approve & Merge" → `POST /api/amendments/:id/approve` → **`200 OK`**
   — **this is the exact endpoint §5.12's FK-constraint crash originally
   hit.** Response confirmed `amendmentStatus:"APPROVED"`,
   `profileId:"prof_default"` persisted through the merge, and
   `recomputedVerdict:"PASSED"` computed correctly by the now
   JSON-blob-sanity-checked `resolveVerdict()` path.
4. **§5.12's crash scenario is now structurally impossible, not just
   newly guarded** — there is no FK left in the schema for a bad
   `profileId` to violate, regardless of what guard code does or doesn't
   run.

**`npx tsc --noEmit -p backend` clean** after every file (only the
pre-existing, unrelated §5.1 `config.routes.ts` error remains — confirmed
unchanged by this pass). **`dev.db` cleanup before commit:** the test
submission and its one amendment log deleted directly via Prisma;
confirmed back at 19 submissions / 0 amendment logs before `git commit`.

### 10.4 — Updated ranked items (supersedes §9's list for items #1 and #4)

1. ~~Backend auth middleware never applied~~ — **RESOLVED, §10.1.**
2. **Real defect taxonomy and product/profile config were never seeded**
   (§7) — unchanged, still the top remaining blocker for real production
   use. Now unblocked on the structural question (§9.4 resolved the
   3-vs-5-family decision), but the actual authoring work is untouched by
   this session.
3. ~~3-family-vs-5-family Visual category structure~~ — **RESOLVED,
   §9.4.** 5 families: AND, Barrier, Critical Visual, Visual Major,
   Visual Minor.
4. ~~Relational-tables-vs-JSON-blob decision~~ — **RESOLVED, §10.3.**
   Chose removal (Option B). The relational tables no longer exist;
   `AppConfig.inspectionProfiles` JSON is now the sole, unambiguous
   source of truth for profile data, with no dead alternative sitting
   next to it.
5. **Tenant-scoped admin role question (§8.2/§8.6)** — unchanged, still
   open, still lower-stakes given the single-tenant-per-deployment
   correction (§9).
6. **Housekeeping items** (§9.2's STILL OPEN list) — unchanged: 5.1
   typecheck error, 5.2 migration-history drift, 5.10/5.11 stale doc
   text, 5.13 cosmetic double-count, 5.4's narrowed first-run-default
   question.
7. **Doc corrections owed once the six core docs are back in scope**
   (Phase 8) — unchanged from §9's list, plus one addition: this
   session's `X-User-Role` header mechanism and the `Submission.profileId`
   FK removal aren't reflected in `API_AND_INTEGRATION_SPEC.md` or
   `DATA_SCHEMAS_AND_TYPES.md` yet either.

---

## 11. Permission Groups (A/B/C), Self-Managed PIN Admin, Idle Expiry, Dev-Gated M365 Mock

**Status: CODE CHANGES. Two commits landed this session (`152f6bd` backend,
`9218e20` frontend), plus this doc-only append. No edits to the six core
docs.** Full discovery → plan (approved) → one-file-per-turn → typecheck →
live-verify → commit cycle, same discipline as §10. `dev.db` was restored to
the 19-submission/0-amendment-log/0-PinUser baseline (confirmed via direct
row counts) before both commits.

Context for this section: real Microsoft/Entra ID login remains blocked on
Jerry's IT manager providing real Azure credentials (Tenant ID, Client ID,
Client Secret) — not available this session either. Everything below was
chosen specifically because it does **not** depend on those credentials, so
the eventual swap stays a small, isolated change. Confirmed again this
session, directly: the System Admin page's Azure AD/SharePoint fields
(`SystemSettings.tsx`) are for a separate, unrelated future SharePoint-sync
feature and have zero backend wiring (no `fetch` call anywhere in that
component) — not touched, not conflated with login.

### 11.1 — Discovery findings (before any code was written)

- **PIN login was 100% hardcoded, traced directly, not assumed:**
  `AuthContext.loginWithPIN` did `if (pin !== '123456') throw`, client-side
  only, and ignored its own `userId` parameter — every successful PIN login
  returned the identical `{ name: 'Factory Worker', role: 'OPERATOR' }`
  object regardless of which name was picked from `LoginPage.tsx`'s 3-entry
  dropdown. That dropdown was decorative: no per-person identity existed
  anywhere in the app, and `schema.prisma` had **no `User` table of any
  kind** — auth was 100% in-memory/mock on the frontend, confirmed via
  direct schema read.
- **`Sidebar.tsx` and `App.tsx`'s `RoleRoute` already disagreed with each
  other**, independent of anything Jerry asked for in this task — a
  pre-existing bug, not something this session introduced:
  - `RoleRoute` gated `/analytics` to
    `['SUPERVISOR','EXECUTIVE','MANAGER','ADMIN']`; `Sidebar` gated the same
    route's nav link to `['SUPERVISOR','MANAGER','ADMIN']` (missing
    `EXECUTIVE` — an Executive who typed the URL directly would have
    reached a page their own nav never showed them).
  - `Sidebar` gated `/approvals` to `['SUPERVISOR','MANAGER','ADMIN']`;
    `RoleRoute` gated it to `['EXECUTIVE','MANAGER','ADMIN']` — a Supervisor
    saw an Approvals link in their sidebar that, if clicked, would have
    bounced them straight back to `/wizard`.
  - `Sidebar` gated `/config` to `['MANAGER','ADMIN']`, again missing
    `EXECUTIVE`, which `RoleRoute` did allow.
- **System Admin page has no backend surface to gate.** Read
  `SystemSettings.tsx` directly: `handleTestConnection`/`handleSave` are
  `setTimeout` + toast, no `fetch` call exists in the file at all. Its
  existing `RoleRoute allowedRoles={['ADMIN']}` gate (already Group-A-only
  before this session) is the full extent of what's gate-able today —
  confirmed, not changed, no fake endpoint invented just to have something
  to gate.
- **Provider nesting matters for where idle-expiry could live:** `App.tsx`
  wraps `AuthProvider > ConfigProvider > ToastProvider`. `AuthProvider` is a
  parent of `ToastProvider` in the tree, so `AuthContext` itself cannot call
  `useToast()` — idle-expiry's user-facing toast had to live in a sibling
  component inside `ToastProvider`, not inside `AuthContext`.

### 11.2 — Group mapping design

Jerry's three access groups map exactly onto the six existing `UserRole`
values already wired through `requireRole`/`RoleRoute`/`Sidebar` — no new
role values, no schema migration for the role system itself:

| Group | Roles | Real job titles (per Jerry) | Access |
|---|---|---|---|
| **A** | `ADMIN` | IT Admin, C-Suite, Directors | Full, incl. System Admin |
| **B** | `EXECUTIVE`, `MANAGER` | department Managers, Executives (a level below Manager) | Full, except System Admin |
| **C** | `SUPERVISOR`, `LEADER`, `OPERATOR` | Supervisors, Operators, Leaders/General Workers | Wizard + Inspection Records only |

Group is **always derived** from `role` via a pure `PERMISSION_GROUPS`
lookup (`backend/src/middleware/auth.ts`, mirrored in
`frontend/src/context/AuthContext.tsx` — same "keep in sync" comment
convention already used between those two files for `UserRole` itself). It
is never stored on a user record, so it cannot drift independently of role.
`role` itself is unchanged, still the thing `requireRole`/`X-User-Role`
actually checks — `requireGroup(...)` is additive, expanding a group list to
the equivalent role list and delegating to the existing `requireRole(...)`,
not a replacement for it.

Per Jerry's explicit instruction not to collapse real identity down to just
the group: `User` (frontend) gained a `title: string` field (e.g. "Plant
Director", "Line Leader") that is purely for display/audit — never read by
any permission check — separate from the permission-relevant `role`. The
same separation exists on the new `PinUser` table (`jobTitle` free text vs.
`role` enum, see §11.4).

One deliberate, explicit implementation of Jerry's own framing: a
Supervisor's mock M365 identity (`usr_supervisor_001`, added this session —
see §11.4) resolves to `role: 'SUPERVISOR'` → **Group C**, confirmed live
(§11.6) — logging in via Microsoft does not imply elevated access, matching
"login method and permission level are independent."

**Doc drift flagged, not fixed (six core docs stay off-limits):**
`NAVIGATION_AND_RBAC.md` §2's per-role table still lists SUPERVISOR (Level
3) with `/analytics` access and doesn't distinguish Group B's Executive
from a C-suite "Executive." Jerry's group model in this task explicitly
supersedes that — Supervisors lose `/analytics`/`/approvals` under the new
rule regardless of what the doc's original per-role table says. The code
now matches Jerry's stated model, not the doc; the doc is unedited per
standing instruction.

### 11.3 — Backend: `requireGroup()` + `PinUser`

- `backend/src/middleware/auth.ts` — additive only, `requireRole()` itself
  untouched. Added `PermissionGroup` type, `PERMISSION_GROUPS` map, and
  `requireGroup(...allowedGroups)` which filters `ALL_ROLES` by group
  membership and delegates to `requireRole(...)`.
- `backend/prisma/schema.prisma` — new `PinUser` model: `name`, `jobTitle`
  (free text), `role` (validated in route code to one of
  `OPERATOR`/`LEADER`/`SUPERVISOR` — the "no email"/"PIN fallback" roles
  per `NAVIGATION_AND_RBAC.md` §2), `pinHash`/`pinSalt` (Node's built-in
  `crypto.scryptSync`, no new dependency — PINs are never stored in
  plaintext), `active` (soft-delete; deactivated rows are kept for audit
  history and their PIN becomes free for reuse). Applied via
  `prisma db push`, matching this project's existing convention (migrations
  are already known-drifted per §5.2; every schema change since init has
  gone through `db push`, not a new migration file).
- `backend/src/routes/pinUsers.routes.ts` (new) — two routers from one
  file, mirroring how `submissions.routes.ts` already exports three
  routers from a single file:
  - `pinUsersRouter` at `/api/pin-users`, **every route**
    `requireGroup('A', 'B')`: `GET /` (list, active+inactive, never
    returns `pinHash`/`pinSalt`), `POST /` (create — validates role
    allow-list, exactly-6-digit PIN, and PIN uniqueness among active rows
    only, 409 on collision), `PATCH /:id/deactivate`.
  - `pinAuthRouter` at `/api/auth`, **deliberately ungated** — `POST
    /pin-login` *is* the login step, there is no role to check yet. Scans
    active `PinUser` rows and `verifyPin`s against each (fine at
    floor-roster scale); returns `{ id, name, jobTitle, role }` on match,
    401 otherwise.
- `backend/server.ts` — both routers mounted alongside the existing four.

### 11.4 — Frontend: real PIN login, group-derived routing, dev-gated M365

- `frontend/src/context/AuthContext.tsx` — `User` gained `title` and
  `loginMethod: 'M365' | 'PIN'`. `loginWithPIN(pin)` now calls the real
  `POST /api/auth/pin-login` (no more hardcoded check, no more ignored
  `userId` param — identity comes from the PIN itself). `loginWithM365`
  now takes a mock-identity id and self-guards
  (`if (!import.meta.env.DEV) throw`) as defense-in-depth beyond the UI
  gate. `PERMISSION_GROUPS`/`getPermissionGroup`/`rolesInGroups` mirror the
  backend's mapping for use in `Sidebar.tsx`/`App.tsx`.
- `MOCK_M365_IDENTITIES` expanded from the old single hardcoded
  ADMIN-always identity to five, deliberately spanning all three groups
  (two Group A, two Group B, one Group C-via-Supervisor) — the old mock
  made it structurally impossible to test anything but Group A through the
  M365 path; this session's live verification (§11.6) needed all three.
- `frontend/src/pages/LoginPage.tsx` — PIN side dropped the now-meaningless
  3-name dropdown (identity comes from the PIN itself once PINs are real
  and unique per person) — just the keypad. M365 side gained the mock
  identity picker, shown only when `import.meta.env.DEV`.
- `frontend/src/components/layout/Sidebar.tsx` + `frontend/src/App.tsx` —
  the hardcoded, drifted role arrays described in §11.1 were replaced with
  `rolesInGroups('A','B')` / `rolesInGroups('A')` / `rolesInGroups('A','B','C')`,
  a single source of truth shared between nav visibility and actual route
  gating so the two categories of bug found in §11.1 can't recur. New
  `/pin-admin` route + "STAFF PIN ACCESS" nav item, Group A/B only.
- `frontend/src/pages/PinAdminPage.tsx` + `frontend/src/components/pinadmin/PinAdminPanel.tsx`
  (new) — create form (name, job title, role select constrained to the 3
  PIN-eligible roles, 6-digit PIN) + roster table with a Deactivate action,
  fetch pattern copied from the existing `ApprovalsQueue.tsx`
  (`API_BASE_URL` + `authHeader(user)`). No edit/reactivate/history, per
  Jerry's explicit "don't over-build" — create, deactivate, list only.

### 11.5 — Idle expiry (PIN sessions only) and the dev-only M365 gate

**Idle expiry** — `frontend/src/components/auth/IdleSessionGuard.tsx`
(new), mounted as a sibling inside `ToastProvider` in `App.tsx` (per the
provider-nesting finding in §11.1). No-ops unless
`user.loginMethod === 'PIN'`; resets a timer on
`mousedown`/`keydown`/`touchstart`/`wheel`; on fire, calls `logout()` +
shows an info toast, which lands the user back on `/login` via the existing
`ProtectedRoute` guard.

```ts
// Placeholder default — Jerry can tune once real floor usage patterns are observed.
export const PIN_SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
```

**This value is explicitly a placeholder, not a settled spec** — flagged
here per the task's own instruction, not a claim that 15 minutes is correct
for One Glove's actual floor workflow.

**Dev-only M365 gate** — the mock M365 login must never accidentally run
once real Azure AD credentials are wired in next week. Mechanism:
`import.meta.env.DEV` (Vite's built-in dev/prod flag, already the
established pattern in this codebase per `ConfigContext.tsx`/
`ProductCatalog.tsx`) is `false` in any `vite build` production bundle —
no `.env` flag to forget at deploy time. Two layers:
1. `LoginPage.tsx` renders the working mock-identity picker + button only
   when `import.meta.env.DEV`; otherwise a disabled button reading
   "Pending Azure AD configuration."
2. `AuthContext.loginWithM365` self-guards independently
   (`if (!import.meta.env.DEV) throw`), in case anything ever calls it
   outside the gated UI path.

**A real gap was found and fixed during this session's own verification,
not just claimed working:** the first build attempt still leaked all five
mock identities' names/emails/ids into the production bundle. Root cause,
confirmed by grepping the built JS directly: `MOCK_M365_IDENTITIES` was
defined as a plain array constant, and `LoginPage.tsx`'s
`useState(MOCK_M365_IDENTITIES[0].id)` referenced it *unconditionally* —
outside the `import.meta.env.DEV` ternary — so the array was genuinely
reachable at runtime in production (just never displayed), and the minifier
correctly left it in. Fix: the array literal itself is now defined behind
`import.meta.env.DEV ? [...] : []` **at its own definition site**
(`AuthContext.tsx`), and `LoginPage.tsx`'s `useState` initializer changed to
`MOCK_M365_IDENTITIES[0]?.id ?? ''`. Re-verified after the fix — see §11.6.

**Pre-go-live verification command, exact and reproducible:**
```bash
npm run build --workspace=frontend
grep -c "System Administrator\|Plant Director\|QA Executive\|usr_admin_001\|usr_director_001\|usr_manager_001\|usr_exec_001\|usr_supervisor_001\|Lee Mei Ling\|Farah Aziz\|Wong Wei Ming\|Amir Hassan" frontend/dist/assets/*.js
```
Must return `0`. Confirmed `0` after the fix above (was `2` before).

### 11.6 — Live verification, all via the real running app

| Scenario | Method | Result |
|---|---|---|
| ADMIN (Group A) via mock M365 | Browser, real login flow | Sidebar shows all 7 items incl. `/pin-admin` and `/system` |
| MANAGER (Group B) via mock M365 | Browser | Sidebar shows 6 items — everything except `/system` |
| `GET /api/pin-users` — no header | `curl` | `401` `"Authentication required..."` |
| `GET /api/pin-users` — `X-User-Role: SUPERVISOR`/`OPERATOR`/`LEADER` (Group C) | `curl` | `403` for all three |
| `GET /api/pin-users` — `X-User-Role: EXECUTIVE`/`MANAGER`/`ADMIN` | `curl` | `200` for all three |
| OPERATOR (Group C) via real PIN login | Browser, PIN pad → backend `/api/auth/pin-login` | Sidebar shows only Wizard + History |
| Direct client-side nav to `/pin-admin`, `/system` while logged in as OPERATOR (Group C) | `history.pushState` + `popstate` (bypasses nav-hiding entirely, exercises `RoleRoute` itself) | Both bounce to `/wizard` |
| Direct client-side nav to `/system` while logged in as MANAGER (Group B) | same technique | Bounces to `/wizard` |
| Manager creates a PIN (name "Ahmad Razak", role OPERATOR, PIN `739215`) via the real Staff PIN Access screen | Browser, full form submit | `201`, appears in roster immediately |
| New PIN logs in immediately | Browser, PIN pad | Landed on `/wizard` with Group C sidebar (2 items) |
| Manager deactivates that PIN via the real screen | Browser, Deactivate button | Row flips to `DEACTIVATED`, action button disappears |
| Deactivated PIN can no longer log in | `curl` `POST /api/auth/pin-login` | `401` `"Invalid PIN"` |
| Idle expiry | Browser — logged in via PIN, timeout temporarily lowered to 5s for this one test, then genuinely left idle (no `mousedown`/`keydown`/`touchstart`/`wheel`) | Auto-logged-out back to `/login`, reproduced twice; toast is called unconditionally in the same code path as `logout()` and the toast mechanism itself was independently exercised and confirmed working throughout this session's other login flows |
| Dev-gate | `npm run build --workspace=frontend` then grep (see §11.5) | `0` matches after the fix; dev server (`import.meta.env.DEV`) still shows the working mock picker |

**One test-tooling note, consistent with §10.1's earlier finding, not a new
issue:** the Browser pane's simulated `computer` clicks still don't
reliably trigger this app's handlers (confirmed again this session, both on
Framer-Motion `motion.button` elements and on plain buttons/links) —
`javascript_tool`-dispatched real `MouseEvent('click', {bubbles:true})` was
used throughout, same workaround as §10.1. One additional wrinkle found
this session: dispatching several such events **synchronously in a single
script** (e.g., all 6 PIN digits in one `javascript_tool` call) unreliably
raced with React's state batching and produced wrong PIN submissions;
dispatching one digit per separate tool call (matching real per-click
latency) was reliable every time and is the pattern used for all multi-step
flows above.

**`dev.db` cleanup before both commits:** all `PinUser` rows created during
verification (`Ahmad Razak`, plus earlier curl-smoke-test rows) deleted
directly via SQLite before each commit; confirmed back at 19 submissions /
0 amendment logs / 0 PinUsers both times, same discipline as §10.1's
cleanup.

### 11.7 — Still pending real Azure credentials

- Real Entra ID/MSAL sign-in itself — blocked on Jerry's IT manager
  providing Tenant ID / Client ID / Client Secret, unchanged from this
  task's stated context.
- When those arrive, the isolated swap is: replace `AuthContext.loginWithM365`'s
  body with a real MSAL popup/redirect flow that resolves a role from the
  real Azure AD group/claim data (however that ends up being modeled on
  the Azure side) instead of `MOCK_M365_IDENTITIES`, and remove the
  `import.meta.env.DEV` gate around it. Nothing else in this session's
  work needs to change for that swap — `requireGroup`/`PERMISSION_GROUPS`,
  `X-User-Role`, `RoleRoute`, `Sidebar`, and the PIN admin system are all
  independent of *how* a role was obtained.
- The System Admin page's Azure AD/SharePoint fields remain a fully
  separate, not-yet-backend-wired future feature (§11 intro) — not part of
  this swap.

---

## 12. Real Defect Taxonomy Seed — `prof_default` (47 defects, 5 categories)

**Status: DATA CHANGE, applied through the real write path. Commit
`e530f38` (data), plus this doc-only append. No edits to the six core
docs. Scope: `prof_default` only** — MEDLINE, CARDINAL, and HENRY SCHEIN
were confirmed byte-identical before/after and are untouched. This closes
ranked item #2 from §9.4/§9's list (real taxonomy was never seeded) for
`prof_default` specifically.

### 12.1 — Old `prof_default` content (before), confirmed live, not assumed

Read directly from the live `dev.db` `AppConfig.inspectionProfiles` JSON
via the same read-only method as §7.2 (`prisma.appConfig.findUnique`
through `backend/src/lib/prismaClient.ts`), and backed up verbatim to a
scratchpad file before any write. Matches §7.2/§7.4/§7.7's prior findings
exactly: 6 categories (BARRIER 1.0/CUMULATIVE, CRITICAL VISUAL
1.5/CUMULATIVE, MAJOR VISUAL 2.5/GRANULAR, MINOR VISUAL 4.0/GRANULAR, an
unexplained NEW CATEGORY 1.0/CUMULATIVE, and PACKAGING PASS/FAIL/NIL/N/A),
11 defects total, only 3 of which (`Porous`, `Thin Layer`, `Flow Mark`)
were exact-name matches to the real taxonomy.

### 12.2 — Evaluation-mode decision: CUMULATIVE for AND, confirmed not guessed

`ISO2859_MATH_ENGINE.md` §2 states plainly: *"Use this mode [CUMULATIVE]
for zero-tolerance AND categories."* Two independent code-level checks
back this up rather than just trusting the doc's prose:

- `backend/src/engine/resolveVerdict.ts`'s own `HARDCODED_DEFAULT_PROFILE`
  reference profile (line 42) sets its AND-equivalent category to
  `aqlLevel:'AND', evaluationMode:'CUMULATIVE'`, with the inline comment
  *"AND = zero tolerance: CUMULATIVE mode with {ac:0,re:1} threshold."*
- `aqlEvaluator.ts`'s `N/A` mode reads `defectCounts` as a 0/1/2
  qualitative state (not-recorded/pass/fail), not a raw tally — mechanically
  incompatible with AND's actual defects (Cut, Tear, Knocking, etc.),
  which are counted, not toggled. `frontend/src/pages/wizard/StepDefects.tsx`
  confirms this at the UI layer too: its `isQualitativeAql()` gate only
  fires for `PASS/FAIL/NIL`, so AND-family defects always render as the
  quantitative rapid-tap counter cards, never the PASS/FAIL/NIL toggle.

**Contradiction found and flagged, not fixed:** `QualityRules.tsx`'s admin
UI (`updateCategoryForm`, lines 163-166, and the `isAutoLocked` render
gate at line 476) auto-locks any category with `aql === 'AND'` to
`evalMode: 'N/A'` the moment its AQL dropdown is touched, and disables the
Eval Mode dropdown down to a single "N/A (Auto-Locked)" option while
`aql==='AND'`. This directly contradicts both the doc and the backend's
own reference profile. It did not corrupt this seed — the auto-lock only
fires on an actual `aql` field change, and this profile's AND category's
`aql` never changes after being seeded — but it means an admin who opens
the AND category for edit and touches the AQL dropdown (even to re-select
the same `AND` value) would silently flip `evalMode` to `N/A` on save.
**Not fixed in this pass** — flagged here for a future small fix to
`QualityRules.tsx`.

Barrier/Visual-Critical/Visual-Major/Visual-Minor eval modes were set to
match the live `prof_default` profile's own existing, real convention
(read in §12.1, not the code-only `HARDCODED_DEFAULT_PROFILE` sentinel,
which disagreed on one point — see below): CUMULATIVE for the tighter
tiers (Barrier 1.0, Visual-Critical 1.0), GRANULAR for the looser,
many-defect tiers (Visual-Major 2.5, Visual-Minor 4.0). This exactly
matches live `prof_default`'s pre-existing BARRIER/MAJOR VISUAL/MINOR
VISUAL settings. (Note: `HARDCODED_DEFAULT_PROFILE` disagrees on MAJOR —
it hardcodes CUMULATIVE where the live, admin-authored `prof_default` data
has GRANULAR. Per the task's own instruction to prefer "how existing
categories in **prof_default**... are currently configured," the live
profile's GRANULAR won out — `HARDCODED_DEFAULT_PROFILE` is a code-level
safety-net sentinel, not the authoritative live configuration, per §7.5's
already-documented "same id, different provenance" callout.)

### 12.3 — New `prof_default` content (after)

| Category | id | AQL | evalMode | Defect count |
|---|---|---|---|---|
| AND | `AND` | `AND` | `CUMULATIVE` | 8 |
| Barrier | `BARRIER` | `1.0` | `CUMULATIVE` | 9 |
| Visual — Critical | `VISUAL_CRITICAL` | `1.0` | `CUMULATIVE` | 1 |
| Visual — Major | `VISUAL_MAJOR` | `2.5` | `GRANULAR` | 19 |
| Visual — Minor | `VISUAL_MINOR` | `4.0` | `GRANULAR` | 10 |

**Total: 5 categories, 47 defects.** Full defect list: AND — Cut, Embedded
Particle, Knocking, Mixed Size, Mixed Type, Tear, Touching, Double Glove /
Dip. Barrier — Burst, Multiple Pinhole, Pinhole At Crotch/Cuff/Finger/
Finger Tip/Palm, Visible Hole, Sagging. Visual — Critical — Dirt/Stain
(single combined defect, not split — see §12.7's note on this being a
correction mid-task). Visual — Major — Color Spotting, Discoloration,
Glove Not Chlorinated, Glove Not Reverse, Incomplete Beading, Rolled Cuff
/ Bead, Sticky, Lump, Slip Mark, Sticky Pleat, Smell Glove, Thin Layer,
Uncured Glove, Wet Glove, White Patches, Thin/Weak Spot, Porous, Former
Crack, Overcured Glove. Visual — Minor — Blister Beading, Flocking, Line
Mark, Flow Mark, Fish Eye, Powder Mark, Shining/Oily Mark, Rough Surface,
White Beading, Creasing Glove.

Defect `id`s follow the exact convention `QualityRules.tsx`'s
`handleAddDefect` generates (`def_` + lowercased name, non-alphanumerics
collapsed to `_`), category shape is `{ id, name, aql, evalMode }` and
defect shape is `{ id, name, categoryId }` — matching what
`PATCH /api/config` and the rest of the app (`StepDefects.tsx`,
`HistoryFeed.tsx`, the Kanban board) already read/write, confirmed by
reading `QualityRules.tsx` directly rather than inferring from
`DATA_SCHEMAS_AND_TYPES.md`'s slightly different field names (`aql` vs.
documented `aqlLevel` — the doc's own §2.1 caveat already flags that the
AppConfig-JSON and Prisma-engine shapes differ; `resolveVerdict.ts`'s
`normalizeForEngine()` dual-reads both). Optional `iconName`/`color`/`bg`/
`border` category fields were confirmed dead code (grepped, zero reads
anywhere in the frontend) and omitted, matching the existing "NEW
CATEGORY" precedent in the old data which also omitted them.

### 12.4 — `productCodes` addendum

Confirmed still `["N035MNV-OC-24FT"]` (1 of 3 real codes) immediately
before this change, matching §7.2's prior finding exactly. Added the other
two: `productCodes` is now `["N035MNV-OC-24FT", "N025SKB-OC-24FT",
"N030SKB-OC-24FT"]`. `productProfileMap`'s existing typo for
`N030SKB-OC-24FT` (§7.5 — the map has `N030MNV-OC-24FT`/`R030MNV-OC-24FT`
instead) was deliberately left untouched: the wizard's submission path
always sends an explicit `profileId` (operator-picked, default-prefilled),
never consults `productProfileMap`, so the typo doesn't block correct
grading via the wizard — confirmed directly in §12.7's live test 2 below,
which used `N030SKB-OC-24FT` and graded correctly against `prof_default`.

### 12.5 — Write path: real `PATCH /api/config`, not a direct DB write

A one-off script (`GET /api/config` → merge only `prof_default` inside
`inspectionProfiles`, leaving the other 3 profiles byte-for-byte
untouched, plus the `productCodes` addendum → `PATCH /api/config` with
`X-User-Role: ADMIN`) called the actual running Express route on
`localhost:4009` — the same endpoint `QualityRules.tsx`'s Save
Configuration button calls, going through `config.routes.ts`'s real
`prisma.appConfig.upsert()`. Confirmed via response inspection: `PATCH`
returned `200`, the round-tripped `prof_default` had exactly 5
categories/47 defects, and the other 3 profiles compared byte-identical
(`JSON.stringify` equality) to their pre-PATCH state. Independently
re-confirmed by a second, separate read straight from `dev.db` (not
trusting the same script's own response).

One correction along the way, worth recording: `PATCH /api/config`
(`config.routes.ts`) does **no field-level validation** of its own beyond
JSON-serializing whatever's given — the `ISO_WHITELIST` referenced in the
task is a **frontend-only** `<select>` option list in `QualityRules.tsx`,
not a server-side check. The real thing this payload needed to satisfy
was being a member of that whitelist so the admin UI's own dropdown
recognizes the values on subsequent edits — confirmed `AND`/`1.0`/`2.5`/
`4.0` are all present in it.

### 12.6 — Live verification, all via the real running app

| Check | Method | Result |
|---|---|---|
| `/config` → Quality Rules, as ADMIN via mock M365 | Browser | 5 categories with correct AQL/evalMode; Kanban shows correct 8/9/1/19/10 per-category defect counts; single "Dirt/Stain" card under VISUAL — CRITICAL (not split) |
| Live-editability spot-check | Browser — renamed `Sagging` → `Sagging (edit-check)` via the real Edit control, Save Configuration, confirmed server-side via `GET /api/config`, then reverted via a second real `PATCH` | Round-tripped correctly both directions; `ALL CHANGES SAVED`/`UNSAVED CHANGES` banner tracked dirty state correctly |
| Wizard submission, `N025SKB-OC-24FT`, 1× Cut recorded | Browser, full wizard click-through → Submit Lot | `POST /api/submissions` → `201`; verdict `FAILED`; AND category: `n=13, ac=0, re=1, count=1` → `"AND — cumulative total: 1 > ac(0)"` — exact CUMULATIVE zero-tolerance behavior |
| Wizard submission, `N030SKB-OC-24FT`, 2× Color Spotting recorded | Browser | verdict `FAILED`; Visual — Major: `n=13, ac=1, re=2, count=2` → `"Color Spotting: 2 > ac(1)"` — exact GRANULAR per-defect-type behavior, other categories independently PASS |
| Wizard submission, `N035MNV-OC-24FT`, 0 defects | Browser | verdict `PASSED`, all 5 categories PASS |
| History view, `POST /api/verdict/preview` via `HistoryFeed.tsx`'s `DefectBreakdownPanel` | Browser — expanded the `N025SKB-OC-24FT` row | Identical breakdown to the wizard's own preview: same 5 categories, same AND/Cut/FAIL detail — confirms the server-authoritative pattern (§5.6/§5.8, re-confirmed §7.5) holds for the new taxonomy too |

All three real product codes are now exercisable end-to-end (wizard →
server verdict → persisted submission → History detail), which was not
possible before this session (only `N035MNV-OC-24FT` was selectable at
all, per §7.2/§12.4).

### 12.7 — Mid-task correction: combined `Dirt/Stain`, not split

The task, as originally scoped, called for splitting `Dirt/Stain` into
`Dirt/Stain (Large)` (Critical) and `Dirt/Stain (Small)` (Minor) — 48
defects total. Before implementation, Jerry corrected this: use a single
combined `Dirt/Stain` defect under Visual — Critical only, 47 defects
total. The plan, payload, and all live verification above reflect the
corrected 47-defect version; no split ever reached the live database.

### 12.8 — Assumed / unverified defect classifications — review recommended

**Flagged plainly, per Jerry's explicit instruction: none of the
Visual-tier assignments below are confirmed by any current (2026) source.**
The source QA sheet treats all Visual defects as one combined category
with no Critical/Major/Minor split at all. The tiering shipped in this
seed comes from two non-authoritative places and is a **working first
draft**, expected to be revisited by Jerry via the real `QualityRules.tsx`
admin UI once real inspection usage or QA team input is available:

**(a) Matched against old pivot-table tabs found inside the source
spreadsheets, dated May 2021 — a leftover template, not current
documentation (24 defects):**

- Visual — Major (17 of these): Color Spotting, Discoloration, Glove Not
  Chlorinated, Glove Not Reverse, Incomplete Beading, Rolled Cuff / Bead,
  Sticky, Lump, Slip Mark, Sticky Pleat, Smell Glove, Thin Layer, Uncured
  Glove, Wet Glove, White Patches, Thin/Weak Spot, Porous
- Visual — Minor (7 of these): Blister Beading, Flocking, Line Mark, Flow
  Mark, Fish Eye, Powder Mark, Shining/Oily Mark

**(b) No match in the 2021 data at all — assigned by reasoning alone, no
data backing (5 defects):**

- Rough Surface — Minor
- White Beading — Minor
- Creasing Glove — Minor
- Overcured Glove — Major
- Former Crack — Major (per Jerry's explicit override of the 2021 data,
  which had filed this one under AND instead)

**(c) No 2026 tier source either — assigned as the single safest default
for a combined defect (1 defect):**

- Dirt/Stain — Visual — Critical

**In short: 30 of 47 defects (all of Visual — Major and Visual — Minor,
plus Dirt/Stain) carry no confirmed 2026 tier assignment.** AND (8
defects) and Barrier (9 defects) are solid — both families and their
membership are unambiguous from the ground truth supplied for this task.

### 12.9 — Flagged, not fixed: `QualityRules.tsx` has no delete-profile capability

Jerry noticed the admin UI lets you duplicate an inspection profile
(`handleDuplicateProfile`) but not delete/remove one. Traced directly:
grepped the entire frontend for `DeleteProfile`/`RemoveProfile` (any
casing) — **zero matches anywhere.** This isn't a broken or unwired
handler; the capability was simply never built. `QualityRules.tsx`'s
profile toolbar wires exactly three actions: RENAME, DUPLICATE, ADD
PROFILE (plus SET AS DEFAULT when not already default) — no fourth
delete/remove action exists in the component at all. **Not implemented in
this pass**, per the task's explicit instruction to log this as a
scoped-out finding only.

### 12.10 — Cleanup

Three test submissions created during §12.6's live verification
(`N025SKB-OC-24FT`, `N030SKB-OC-24FT`, `N035MNV-OC-24FT`) deleted directly
via Prisma by id after verification completed; confirmed back at 19
submissions / 0 amendment logs both via direct Prisma count and via the
running server's own `GET /api/submissions`, before `git commit`. The
`Sagging (edit-check)` rename from §12.6's edit spot-check was reverted to
`Sagging` via a second real `PATCH /api/config` call before cleanup,
confirmed via `GET /api/config`.

---

## 13. Five Independent Fixes — Cleanup Backlog Pass

**Status: CODE CHANGES. Five separate commits, one per fix (per the
task's explicit instruction — not one combined change), plus this
doc-only append. No edits to the six core docs.** Each fix followed its
own discovery → fix → typecheck → live-verify → commit cycle, per
`AI_RULES.md` §4 (one file per turn, build/typecheck verification before
proceeding). `dev.db` confirmed at the 19-submission/0-amendment-log
baseline before every commit that touched it (Fixes 1, 2, 4, 5 — Fix 3's
own edit happened to net to zero change from the server's prior state, so
no dev.db diff existed to clean).

### 13.1 — Fix 1: typecheck error in `config.routes.ts` (§5.1) — commit `0ab29b3`

`PATCH /api/config`'s catch block did `error?.message || String(error)`
on a value typed `unknown` — `tsc --noEmit` confirmed
`TS2339: Property 'message' does not exist on type '{}'`. No existing
codebase convention for a generic `unknown`-error type guard was found
(`pinUsers.routes.ts`'s catch blocks never touch `.message` at all), but
`submissions.routes.ts` already narrows a *specific* error type via
`instanceof VerdictProfileNotFoundError` before reading `.message` —
matched that idiom generically: `error instanceof Error ? error.message : String(error)`.
**Verification:** re-ran `tsc --noEmit` — zero errors (confirmed gone, not
moved elsewhere). Backend-only, no observable UI behavior change, so no
browser verification was applicable; confirmed the endpoint still
functions normally (`GET`/`PATCH` both `200`) as a regression check.

### 13.2 — Fix 2: amendment wizard double-counted qualitative defects (§5.13) — commit `8e1ab3d`

Root cause traced precisely: `WizardPage.tsx`'s amendment pre-fill sets
`inspectionData.defects` to the submission's **full** persisted `defects`
map (still containing raw 0/1/2 state values for N/A-mode/qualitative
defect ids) *and separately* sets `inspectionData.qualitative` to the
correctly-decoded PASS/FAIL/NIL map for those same ids. `StepDefects.tsx`
seeded `defectCounts` from the former without excluding qualitative ids,
so `totalQuantitativeDefects` summed a qualitative FAIL's raw value
(e.g. `2`) *and* `totalQualitativeFails` counted it again via
`qualitativeStates` — one real defect inflated the displayed total by 2-3x.
Fixed by deriving a `qualitativeDefectIds` set (same category-aql-based
logic `WizardPage.tsx` already uses) and excluding those ids from the
quantitative sum. Confirmed genuinely display-only before touching
anything: `combinedDefects` (what actually gets submitted) merges
`qualitativeStates`-encoded values *over* `defectCounts`, so untouched
qualitative entries always round-trip to their original raw value
regardless of the display bug.

**Live verification:** created a real submission on the HENRY SCHEIN
profile (1× Hole + PACKAGING/Box Damage marked FAIL, total correctly `2`
at creation time — proving the bug is amendment-reopen-specific, not a
creation-time issue) via the real wizard, reopened it as a real amendment
(History → AMEND RECORD), confirmed the Defects step's "TOTAL RECORDED
ISSUES" now reads `2` (was previously reachable at `4`: `1 (Hole)
+ 2 (Box Damage raw state) + 1 (Box Damage qualitative FAIL)`), submitted
the amendment with no changes, and confirmed via
`GET /api/submissions`'s `amendmentLogs[].originalValues`/`newValues`
that the submitted `defects` payload is byte-identical
(`{"def_hole":1,"def_box":2}`) both before and after — the fix touched
only the display total, never the persisted/graded data. Test submission
+ amendment log deleted afterward; confirmed back at 19/0.

### 13.3 — Fix 3: `QualityRules.tsx` AND-category `evalMode` corruption — commit `8b8688a`

Found during the §12 taxonomy seed: `updateCategoryForm`'s `aql==='AND'`
branch force-set `evalMode` to `'N/A'`, and the `isAutoLocked` render gate
disabled the Eval Mode dropdown to a single "N/A (Auto-Locked)" option
for AND categories — contradicting `ISO2859_MATH_ENGINE.md` §2 and
`resolveVerdict.ts`'s own `HARDCODED_DEFAULT_PROFILE` reference profile,
both of which specify `CUMULATIVE` for AND (zero-tolerance is still a
numeric count check, not qualitative — `PASS/FAIL/NIL` is the only
category kind that genuinely requires `N/A`). Fixed by restricting the
auto-lock-to-`N/A` branch to `PASS/FAIL/NIL` only, and removing
`aql === 'AND'` from both `isAutoLocked` computations (edit-row and
add-category forms) — AND categories now get a normal, editable
CUMULATIVE/GRANULAR dropdown like any other numeric AQL level.

**Live verification, both scenarios the task asked for:** opened
`prof_default`'s AND category (seeded `AND`/`CUMULATIVE` in §12) for edit
— (a) leaving the AQL field untouched: Eval Mode dropdown showed as a
normal editable `CUMULATIVE`/`GRANULAR` select, not locked; (b)
deliberately triggering the old bug path directly: changed AQL to `1.5`
(evalMode stayed `CUMULATIVE`, unlocked, as expected for a normal AQL),
then changed it back to `AND` — evalMode **remained `CUMULATIVE`**,
confirmed via the dropdown's selected option and via a direct
`GET /api/config` read after saving. Before the fix, step (b) would have
silently flipped it to `N/A`.

### 13.4 — Fix 4: migration history drift (§5.2) — commit `520d0b8`, plan-mode approved

**This fix required explicit plan-mode approval per the task's
instruction, given the destructive potential of migration tooling in
general — approved before any command ran.** `prisma/migrations/`
contained only the original init migration; every real schema change
since (`AmendmentLog`'s 4 `recomputed*` audit columns, the `PinUser`
table, `AppConfig`'s many added columns, and the
`InspectionProfile`/`AQLCategory`/`DefectDefinition` removal + the
`Submission.profileId` FK drop — §9.3/§10.3) was applied via
`prisma db push`, which never touches migration history.
`prisma migrate status` misleadingly reported "up to date" (it only
checks whether existing migration *files* are marked applied, not
whether they describe the live schema) — the real drift was confirmed via
the fully read-only `prisma migrate diff --from-migrations ./prisma/migrations --to-config-datasource --script`.

**Explicit constraint honored: `prisma migrate dev` was never run** —
that command would have detected this exact drift and offered/forced a
destructive reset of the 19-submission baseline. Instead: the `migrate
diff` output (the literal, accurate description of every `db push` change
since init) was saved as a new migration file
(`20260809120000_reconcile_db_push_drift/migration.sql`), then
`prisma migrate resolve --applied 20260809120000_reconcile_db_push_drift`
was run — Prisma's documented mechanism for exactly this situation
("baseline databases when starting to use Prisma Migrate on existing
databases" / "reconcile hotfixes done manually on databases with your
migration history," per `prisma migrate resolve --help`). `resolve` only
writes a bookkeeping row into `_prisma_migrations` — it never executes
migration SQL against application tables.

**Verification:** confirmed via direct SQL query that the new
`_prisma_migrations` row has `applied_steps_count: 0` (proof zero DDL
ran — a normally-applied migration would show a nonzero count matching
its statement count); a fresh `migrate diff` after `resolve` returned
`-- This is an empty migration.` (zero remaining drift); `Submission`/
`AmendmentLog` row counts unchanged (19/0) before and after; the only
`dev.db` byte diff was that one bookkeeping row, confirmed by inspecting
`_prisma_migrations`'s contents directly.

### 13.5 — Fix 5: delete-profile capability — commit `c4dcd04`

Missing feature (per §12.9's already-logged scoped-out finding), not a
regression — `QualityRules.tsx`'s profile toolbar had RENAME/DUPLICATE/
ADD PROFILE/SET AS DEFAULT but no delete/remove action anywhere. Added a
DELETE PROFILE button next to DUPLICATE, backed by a confirmation modal
reusing `ConfigPage.tsx`'s existing discard/navigation-guard modal
pattern verbatim (`bg-black/70` backdrop, `bg-canvas` card, rose
`AlertTriangle` icon, CANCEL/CONFIRM DELETE pair) — the one confirmation
pattern already established in this codebase, no new dependency or
component style introduced (matches `AI_RULES.md` §5's "Core Tech Stack
Guardrail: do not install unapproved third-party NPM packages").

`prof_default` is blocked from deletion specifically by id — not by
whichever profile currently has `isDefault:true`, since that flag is
freely reassignable via the existing SET AS DEFAULT button, while
`prof_default`'s id string is the actual hardcoded sentinel
`resolveVerdict.ts`'s safety net and `productProfileMap` fall back to
(§7.3/§7.5). Attempting to delete it shows a toast error and never opens
the confirmation modal at all. Deletion itself reuses the exact same
`triggerChange` → `onChange` → `ConfigPage.tsx`'s existing SAVE
CONFIGURATION → real `PATCH /api/config` flow every other profile CRUD
operation in this component already uses — no new backend endpoint, per
the task's instruction.

**Live verification:** attempted deleting `prof_default` — blocked, no
modal opened, `GET /api/config` confirmed all 4 profiles including
`prof_default` unchanged. Created a disposable "NEW PROFILE" via the real
ADD PROFILE button, saved it, selected it, clicked DELETE PROFILE —
confirmation modal rendered with the correct profile name and warning
text, clicked CONFIRM DELETE, clicked SAVE CONFIGURATION, then confirmed
via `GET /api/config` that the profile count returned to 4 with the test
profile genuinely gone and the other 4 real profiles untouched.

## 14. Inspection Records 50-Row Cap + Amendment Lookup Fix

`GET /api/submissions` was hardcoded to `orderBy: createdAt desc, take: 50`
with no query params — any submission beyond the 50 most recent was
permanently unreachable (not merely unpaginated). `HistoryFeed.tsx`
(Inspection Records) fetched that endpoint once and never paged further.
`WizardPage.tsx`'s amendment-prefill effect re-fetched the same capped
endpoint and did a client-side `.find(s => s.id === amendId)` instead of
calling the already-existing `GET /api/submissions/:id` — meaning a
submission older than the 50 most recent could not be amended either,
even though the single-record endpoint that would have fixed this
directly already existed and was unused for this purpose.

**Fix — `backend/src/routes/submissions.routes.ts`:** added `page`
(default 1) / `limit` (default 50, clamped to a max of 200 per-page —
not a reintroduction of the old ceiling, since every row remains
reachable via `page`) query params, both defensively parsed so a
zero-param call behaves exactly as before. Added `id` as a secondary
sort key (`orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`) since
SQLite's `DateTime` has finite resolution and same-instant rows would
otherwise tie nondeterministically across page boundaries. Response is
additive: `{ submissions, count, page, limit, totalCount, hasMore }` —
`count` keeps its old meaning ("rows in this page").

**Fix — `frontend/src/pages/WizardPage.tsx`:** amendment-prefill now
calls `GET /api/submissions/${amendId}` directly (`{ submission }`
singular) instead of searching the capped list, with an explicit
`res.status === 404` branch before parsing JSON. Independent of the
pagination change — works for a record of any age regardless of
whether it's in a currently-loaded page.

**Fix — `frontend/src/components/history/HistoryFeed.tsx`:** added a
"Load More" button (no existing pagination pattern anywhere in this app
to match, so this is the first) backed by `page`/`hasMore`/`loadingMore`
state and a `loadPage(pageNum, { replace })` fetcher that appends
de-duped-by-`id` pages, or replaces outright on initial load and
window-focus refetch. Window-focus refetch re-fetches the full depth
currently loaded (`page * limit` in one request) rather than resetting
to page 1, so tabbing back in doesn't silently truncate a deeply-paged
view — an accepted trade-off (payload grows with how deep a session has
paged) rather than a silent design pick.

**Live verification:** seeded 35 additional `Submission` rows (tagged
`aadObjectId: 'test-seed-verification'` for unambiguous cleanup) to push
past the old 50-row ceiling, with one deliberately backdated to be the
global oldest (`batchNumber: 'TEST-OLDEST-VERIFY-001'`). Confirmed via
direct HTTP: `?page=1&limit=50` excludes it, `?page=2&limit=50` surfaces
it with `hasMore:false`; `GET /api/submissions/<its id>` returns it
directly. In-browser: logged in, opened Inspection Records, clicked
LOAD MORE, found the row, expanded it, clicked AMEND RECORD — wizard
opened in Amendment Mode with the correct lot number and all fields
pre-filled, no crash. Deleted all `test-seed-verification`-tagged rows
afterward and confirmed the exact documented baseline (19 submissions,
0 amendment logs) via both a direct Prisma count and a live
`GET /api/submissions` call.

**Out-of-scope finding (not fixed this turn):** while investigating,
confirmed `GET /api/amendments/pending`
(`submissions.routes.ts`, `amendmentsRouter.get('/pending', ...)`) has
no pagination or row limit at all — it fetches every
`PENDING_APPROVAL` submission unbounded (the nested `amendmentLogs`
include's `take: 1` only limits logs-per-submission, not the submission
list itself). Different shape of the same underlying class of issue as
the list endpoint fixed above, but a separate route backing the
Approvals Queue screen, and wasn't part of what was asked this turn.

**Verification artifact note:** the first seeding attempt used bare
`'08:00'`/`'2026-01-01'` for `productionDate`/`samplingTime`, which
crashed the wizard (`RangeError: Invalid time value`) when opened for
amendment. Confirmed via a real submission's actual stored values that
production data always uses full ISO 8601 datetime strings for both
fields (the schema's `// HH:MM string` / `// ISO date string` comments
are stale — see `schema.prisma:29-31`) — not a real app bug, an artifact
of unrealistic synthetic seed data. Reseeded with full ISO datetimes and
the crash did not reproduce. Flagging only because the stale schema
comments could mislead a future session into generating the same bad
test data.

## 15. Unified Lot Number Composition, Editable Production Date, Uniqueness Enforcement

Confirmed via discovery: "Full System Lot Number" (`Submission.batchNumber`)
had two independent, incompatible generators — `StepMetadata.tsx` (Single
Entry) built `[Line][Side][YJJJ][Sequence]`; `BatchEntry.tsx` built a
completely different `[Line][YYMMDD][Sequence]`, silently dropping `side`
entirely despite tracking it per row. `BatchEntry.tsx` also called an unused
second generator (`generateJulianLotNo()`) purely for a decorative "LOT
(YJJJ)" preview box that never matched what was actually submitted, and
hardcoded `shift: 'Shift 1'` in its POST payload regardless of the actual
date/time entered. Nothing anywhere enforced uniqueness — dev.db had
accumulated the same lot number 7× and 6× by accident. `ISO2859_MATH_ENGINE.md`
§4 documented a third, wrong formula (mislabeled "Machine" instead of "Side").
The lot number is not invented by this app — it must match what the
company's ERP separately registers for the same physical lot; the app's job
is to let the operator record the correct number (validated for format and
uniqueness), not compute or guess it.

**Fix:** Created `frontend/src/utils/lotNumber.ts` — the first non-component
util module in this app — sharing the shift-resolution (incl. night-shift
rollover), YJJJ composition, and full-lot-number composition logic between
both wizards, so they can no longer drift into incompatible formats.
`BatchEntry.tsx`'s two generators were deleted entirely and all 4 call sites
(grid column, modal header, shared-metadata preview, submit payload) now use
the shared util, correctly incorporating each row's own `side`; its submit
payload's `shift` field now uses the real resolved shift instead of the
`'Shift 1'` placeholder, and its production date now feeds a real shift
readout (previously the "DATE / SHIFT" field showed no shift at all).
Sequence No lost its auto-default (`'001'` in `StepMetadata.tsx`) and its
auto-increment (`BatchEntry.tsx`'s `handleAddRow`) — it's now a required,
purely operator-entered field in both wizards, per an explicit business
decision: auto-incrementing would capture submission order, not true
production order, since operators routinely consolidate multi-lot test
results out of production order. A non-binding "suggested next sequence"
hint (max existing sequence + 1 for the same Line+Side+YJJJ group, confirmed
with Jerry over the alternative of showing the raw last-recorded value) is
shown next to the field in both wizards, backed by a new
`GET /api/submissions/sequence-hint` endpoint — advisory only, never
pre-fills or restricts.

**Server-side validation:** `POST /api/submissions` now rejects a colliding
`batchNumber` with `409 { error: 'This lot number already exists.' }` via a
pre-insert check, with a `P2002`-catch backstop around the actual `create()`
call for the race-condition case the pre-check can't close atomically. The
same protection was added to the amendment-approve transaction, since an
amendment can also change `batchNumber` to a colliding value. `Submission.
batchNumber` gained `@unique` in `schema.prisma` as the authoritative DB-level
backstop behind both app-level checks.

**Dev.db cleanup (required before the `@unique` push could succeed):** all 19
existing submissions were confirmed disposable test data. For each of the 3
duplicate groups, kept the oldest row (earliest `createdAt`) and deleted the
rest — no attempt to renumber into a fake sequence, per instruction. Verified
none of the deleted rows had `AmendmentLog` children before deleting (none
did — baseline was 0 amendment logs). **19 → 6 submissions** after cleanup;
this is the new baseline going into future sessions, not restored to 19.
`prisma db push --accept-data-loss` required explicit user consent per
Prisma's own AI-agent safety gate (it detected the invoking agent and
refused to run without a fresh, explicit confirmation) — consent was
obtained before running.

**MDs corrected:** `ISO2859_MATH_ENGINE.md` §4's formula fixed to
`[Line] + [Side] + [YJJJ] + [Sequence]` (was `[Line] + [Machine] + ...`), with
notes on the editable production date, the ERP-matching design intent, the
no-auto-increment Sequence decision, and the shared composition module.
`DATA_SCHEMAS_AND_TYPES.md`'s `batchNumber` comment updated to match, and its
`productionDate`/`samplingTime` comments corrected from the stale
date-only/`"HH:MM"` shapes to the real full-ISO-8601-datetime shape — closing
out the flag raised earlier in this same document (§14's "Verification
artifact note").

**Out-of-scope, flagged not fixed:** `test_post.js`'s hardcoded
`batchNumber: 'K-L01-26214-A'` is confirmed as the origin of that specific
duplicate group (3 identical POSTs). It's not referenced by any npm script or
launch config — inert, standalone manual tooling — but its hardcoded value no
longer matches the real `[Line][Side][YJJJ][Sequence]` format either way.
Left as-is; a candidate for either deletion or updating in a future session.

**Live verification:** confirmed Single Entry and Batch Entry produce
byte-identical `batchNumber` formatting for equivalent Line/Side/date/sequence
inputs; confirmed a duplicate submission is rejected with the clear 409
message end-to-end (backend → `WizardPage.tsx`'s now-cleaned-up error
surfacing → toast); confirmed the sequence hint reflects the correct
suggested-next value for a real post-cleanup Line/Side/date group; confirmed
editing the production date in both wizards updates the YJJJ component and
the displayed shift correctly, including across the existing night-rollover
boundary.
