# QUALITY INSPECTION (WEB) v4.0 — Frontend

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · Lucide Icons · Framer Motion  
**Dev Port:** `4001` (strict — `strictPort: true` in `vite.config.ts`)  
**Backend:** Express on port `4009` — see `../backend/`

---

## Quick Start

```bash
# From the monorepo root
npm run dev --workspace=frontend
```

Or via `.claude/launch.json` / Antigravity launch config (starts both frontend and backend together).

---

## Project Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── WizardPage.tsx          # 4-step guided wizard + batch entry grid
│   │   ├── HistoryPage.tsx         # Inspection Records page shell
│   │   ├── ApprovalsPage.tsx       # Amendment diff viewer & approval queue
│   │   ├── AnalyticsPage.tsx       # Pareto charts & defect trend dashboards
│   │   ├── ConfigPage.tsx          # Configuration Control (Factory/Product/Quality tabs)
│   │   └── SystemPage.tsx          # System & Tenant Admin
│   │
│   ├── pages/wizard/
│   │   ├── StepMetadata.tsx        # Step 1 — Batch Setup & profile selection
│   │   ├── StepDimensions.tsx      # Step 2 — Physical dimension measurements
│   │   ├── StepDefects.tsx         # Step 3 — AQL defect tally
│   │   ├── StepReviewSubmit.tsx    # Step 4 — Review & submit
│   │   └── BatchEntry.tsx          # Spreadsheet-mode batch entry grid
│   │
│   ├── components/
│   │   ├── history/
│   │   │   └── HistoryFeed.tsx     # Inspection records table + AQL breakdown panel
│   │   ├── approvals/              # Amendment diff viewer components
│   │   ├── config/                 # Configuration Control sub-panels
│   │   └── ui/                     # Shared primitives (Button, Toast, etc.)
│   │
│   ├── context/
│   │   ├── ConfigContext.tsx        # AppConfig state + getResolvedProfile()
│   │   └── AuthContext.tsx          # Mock M365 / PIN auth state
│   │
│   └── main.tsx                    # App entry — React Router routes
│
├── vite.config.ts                  # Port 4001, strictPort: true
└── package.json
```

---

## Key Architectural Rules

All AI agents working on this frontend MUST read the following docs before touching code:

| Doc | Governs |
|---|---|
| `../AI_RULES.md` | Execution protocol, model selection, one-file-per-turn rule |
| `../UI_DESIGN_SYSTEM.md` | Colors, typography, badge semantics, layout patterns |
| `../DATA_SCHEMAS_AND_TYPES.md` | TypeScript interfaces, dual field-naming conventions |
| `../NAVIGATION_AND_RBAC.md` | Route map, role permissions |
| `../ISO2859_MATH_ENGINE.md` | AQL math, evaluation modes, dimension pass/fail logic |
| `../API_AND_INTEGRATION_SPEC.md` | REST endpoint contracts, mock auth notes |

---

## Authentication (Dev Mock)

| Method | Resulting Role |
|---|---|
| M365 SSO popup | `ADMIN` |
| PIN `123456` | `OPERATOR` |

Real Azure AD / MSAL integration is planned but not yet wired.

---

## Environment

* API base URL is set in `ConfigContext.tsx`: `http://localhost:4009`
* No `.env` file required for local dev — all config is hardcoded for the dev environment.
