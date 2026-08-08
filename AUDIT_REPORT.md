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
