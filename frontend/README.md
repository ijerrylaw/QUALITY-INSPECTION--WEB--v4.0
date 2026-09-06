# QUALITY INSPECTION (WEB) v4.0 — Frontend

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · Lucide Icons · Framer Motion

---

## Running the dev servers

```bash
# From the monorepo root — runs frontend + backend together (concurrently)
npm run dev
```

Frontend only: `npm run dev --workspace=frontend`.

| Server | Port | Notes |
|---|---|---|
| Frontend (Vite) | `4001` | `strictPort: true` in `vite.config.ts` |
| Backend (Express) | `4009` | see `../backend/server.ts` |

Both dev servers run over **HTTPS** using a local mkcert certificate
(`frontend/10.10.110.31+1*.pem`, covering `localhost` and the LAN IP) — required
because Entra ID only allows HTTPS redirect URIs for non-`localhost` hosts. See
`vite.config.ts` and `../backend/server.ts`.

`.claude/launch.json` also starts both together.

---

## Authoritative docs

All AI agents (and humans) working on this frontend should read the relevant doc
before touching code:

| Doc | Governs |
|---|---|
| `../AI_RULES.md` | AI-agent operating protocol, model-tier matrix, execution/git-safety rules, Prisma workflow |
| `../UI_DESIGN_SYSTEM.md` | Colors, typography, badge semantics, layout patterns |
| `../DATA_SCHEMAS_AND_TYPES.md` | TypeScript interfaces, Prisma shapes, wire contracts |
| `../NAVIGATION_AND_RBAC.md` | Route map, roles/permission groups, login mechanics, session gate |
| `../ISO2859_MATH_ENGINE.md` | AQL math, evaluation modes, dimension & weight pass/fail logic |
| `../API_AND_INTEGRATION_SPEC.md` | REST endpoint contracts, auth flows |

---

## Authentication (dev)

Both login paths are **real**, not mocked.

* **Microsoft 365 / Entra ID SSO** — `AuthContext.tsx`'s `loginWithM365()` runs a
  real `msalInstance.loginPopup()` (`src/lib/msalConfig.ts`), then resolves the
  signed-in user's role via `POST /api/auth/m365-login`. Requires
  `frontend/.env.local` with `VITE_MSAL_CLIENT_ID` and `VITE_MSAL_TENANT_ID` —
  copy `frontend/.env.example` and fill in real values, or run `npm run setup`
  (from repo root), an interactive wizard that writes `.env.local`. App
  Registration type: SPA, no client secret. Details: `NAVIGATION_AND_RBAC.md` §3.1.
  * MSAL popup OAuth cannot be completed in a sandboxed/headless browser — real
    M365 login only verifies in a full external browser.
* **PIN login** — real `PinUser` table, scrypt-hashed PINs, identity-first flow
  (search the staff directory → pick an account → enter that account's 6-digit
  PIN). There is no universal/default PIN. Details: `NAVIGATION_AND_RBAC.md` §3.2.

---

## Environment

* `API_BASE_URL` (`src/context/ConfigContext.tsx`) resolves to `VITE_API_URL`, or
  falls back to `https://<the hostname the page was loaded from>:4009`.
* `frontend/.env.local` is only needed for MSAL credentials (above); it is
  gitignored (`*.local`). `frontend/.env.example` documents the shape.

---

## Source layout

```
src/
├── pages/           # one file per route (WizardPage, HistoryPage, ApprovalsPage,
│   │                #   ConfigPage, SystemPage, PinAdminPage, DevToolsPage,
│   │                #   LoginPage, Bootstrap/Pending/Revoked/SetPin gate pages)
│   ├── wizard/       # 4-step wizard steps + BatchEntry grid + amendment UI
│   └── config/       # Configuration Control sub-panels
├── components/       # history/ approvals/ config/ analytics/ pinadmin/ system/
│   │                #   auth/ layout/ ui/
├── context/          # AuthContext, ConfigContext, HistoryIndicatorContext,
│   │                #   WizardGuardContext
├── lib/              # msalConfig.ts, engine mirrors, diff/label helpers
├── App.tsx           # routes + RoleRoute gating
└── main.tsx          # app entry
```
