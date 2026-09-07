# Installer Package Manifest — what ships to a server, what never does

**Status: IMPLEMENTED 2026-09-07 — see `CHANGELOG.md` §65.** This file remains the
spec; the two scripts that now satisfy it are:

| Script | Runs on | Role | Ships? |
|---|---|---|---|
| `package.ps1` | development machine | builds the package from `git archive HEAD`, prunes, then **fails** on any forbidden path/string or missing required file | **No** — pruned from its own output, since its exclusion list names every internal document by filename |
| `install.ps1` | target server | prerequisites → `.env` → TLS → seed DB → `npm ci` → `prisma generate` → frontend build → NSSM service → health check | Yes, with `install/README.txt` |

Two intentional divergences from the sections below, both following from the
decision to BUILD THE FRONTEND ON THE SERVER rather than ship a prebuilt bundle
(which is what makes the package independent of any one build machine):

1. **`frontend/src` and its build config now ship**, so the §1/§3 rule "never
   `frontend/src/`" does not apply. Consequence: the two frontend files in §4's
   table no longer get their comments stripped by `vite build`, and were
   reworded along with the four backend ones (`CHANGELOG.md` §63).
2. **The seed database ships as `install/seed.db` sourced from `prod.db`**, not
   from `dev.db`. The two are byte-identical (`CHANGELOG.md` §58); §3.1 option 1
   is otherwise followed exactly.

`install.ps1` sits at the repository root rather than under `install/`.

The §3 exclude recipes below are retained as the specification of intent — the
implemented equivalents live in `package.ps1`, which additionally asserts the §3
verification checks rather than leaving them to be run by hand.

**Goal restated:** the folder copied to a customer's server must not reveal that
AI tooling (Claude Code, Antigravity) was used to build this app. The local repo
and its git history are explicitly out of scope and are not being changed.

---

## 1. What SHOULD be in the installer package (allowlist)

The package is the runtime app only: a pre-built frontend, the backend it needs to
run, dependency manifests for a clean `npm install` on the server, the Prisma
schema + migrations, install/update scripts, and env templates. Nothing else.

```
<package-root>/
├── frontend/
│   └── dist/                         # output of `npm run build --workspace=frontend`
│       ├── index.html                #   (static SPA — the ONLY frontend artifact
│       ├── assets/*.js               #    that ships; minified, comments stripped
│       └── assets/*.css              #    by Vite/esbuild — see §4 note)
│
├── backend/
│   ├── server.ts                     # entrypoint  ┐
│   ├── src/**/*.ts                   # app code    │ EXCLUDING every __tests__/ dir
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/**             # all migration.sql + migration_lock.toml
│   ├── prisma.config.ts
│   ├── tsconfig.json
│   └── package.json                  # backend dependency manifest
│
├── package.json                      # root: workspaces + engines + `allowScripts`
├── package-lock.json                 # root lockfile — required for reproducible
│                                     #   `npm ci` on the server
│
├── scripts/
│   └── setup.mjs                     # day-zero Entra credential wizard (`npm run setup`)
│
├── install/                          # NEW — to be written with the packaging step
│   ├── install.(sh|ps1|md)           # npm ci → prisma migrate deploy → build check → start
│   └── update.(sh|ps1|md)            # git-less update: swap files, npm ci, migrate deploy
│
├── backend/.env.example              # EXISTS (added 2026-09-06) — template, keys +
│                                     #   placeholder values only:
│                                     #   DATABASE_URL -> backend/prod.db  (see §3.1)
│                                     #   PORT=4009  HOST=0.0.0.0  NODE_ENV=production
│                                     #   TLS_KEY_PATH / TLS_CERT_PATH  (see §4 TLS note)
│
└── frontend/.env.example             # EXISTS — already placeholder-only (all-zero GUIDs);
                                      #   ship as-is. Consumed at BUILD time, so on a
                                      #   pre-built package it is informational only.
```

### Notes on specific "should ship" items

- **`frontend/dist/` only** — never `frontend/src/`, `frontend/README.md`,
  `frontend/vite.config.ts`, `frontend/index.html` (the source one),
  `frontend/*.pem`, `frontend/.env.local`, or `frontend/node_modules`.
- **Backend ships as TypeScript source** (the app currently runs via `tsx`). If the
  packaging step instead pre-compiles to `.js` (`tsc`), ship `backend/dist/` +
  `backend/prisma/` + manifests and drop the `.ts`. **Either way** the AI-tooling
  comments in `backend/server.ts` / `src/**` still ship unless stripped — see §4.
- **`package-lock.json`** must ship so the server runs `npm ci` (exact, reproducible)
  rather than `npm install`.
- **Prisma migrations ship**; the server runs `npx prisma migrate deploy` to build a
  fresh empty database. The dev database file is never copied (see §2).
- **`scripts/setup.mjs`** is safe to ship — checked, contains no AI-tooling references.
- **`.env.example` templates ship; real `.env` / `.env.local` never do** (see §2).

---

## 2. What must NEVER be included — and current status

| # | Item | In repo? | Ships under a correct allowlist? | Notes |
|---|------|----------|-------------------------------|-------|
| 1 | **`.git/`** (all history, every commit message + `Antigravity AI` authorship + 320 `Co-Authored-By: Claude` trailers) | yes, `.git/` is 7.0 MB | **No** — allowlist copies named paths, never `.git/` | The single biggest disclosure vector. An allowlist/`git archive`-based package excludes it structurally. A naive "copy the whole project folder" would include it — see §4. |
| 2 | **`docs/` folder** | `docs/` exists on disk with `docs/reference/2026-05…07 *.xlsx` (real One Glove production data) — **not git-tracked** (`*.xlsx` gitignored) | **No** — `docs/` is not on the allowlist | The `.xlsx` files are real customer data *and* the source of taxonomy reconciliation; must never ship. |
| 3 | **`AI_RULES.md`** (root) | yes, tracked | **No** — root `*.md` are not on the allowlist | Whole file is "AI Project Rules & Workspace Operating Protocol". Most obvious tell. |
| 4 | **`CHANGELOG.md`, `AUDIT_REPORT.md`** | yes, tracked (CHANGELOG is 447 KB) | **No** | Both contain "Claude Code" / "Antigravity" / model-ID prose. |
| 5 | **The other root spec docs** (`API_AND_INTEGRATION_SPEC.md`, `DATA_SCHEMAS_AND_TYPES.md`, `ISO2859_MATH_ENGINE.md`, `NAVIGATION_AND_RBAC.md`, `UI_DESIGN_SYSTEM.md`) | yes, tracked | **No** | Not AI-revealing per se, but internal design docs with no place on a customer server. Excluded for the same reason as #3/#4. |
| 6 | **`archived/` folder** (8 files incl. `archived/AI_RULES.md` titled "Antigravity AI Project Rules") | yes, tracked | **No** — not on the allowlist | Superseded predecessor docs; referenced by nothing runnable. |
| 7 | **`.claude/`** (and any `.cursor/`, `.windsurf/`, `.aider*`, `.continue/`, `.idea/`, `.vscode/`) | `.claude/` on disk, **gitignored** (`.gitignore:15`), never tracked. Empty `backend/.windsurf/` on disk, untracked, not ignored. | **No** — not on the allowlist; also gitignored so absent from `git archive` | Confirmed explicitly. **DONE 2026-09-07 (`CHANGELOG.md` §63):** the stray empty `backend/.windsurf/` was deleted and `.gitignore` widened to cover all of these. `package.ps1` prunes them and every `.gitignore` besides. |
| 8 | **`node_modules/`** (root, `frontend/`, `backend/`) | on disk, gitignored | **No** — the server runs `npm ci` itself | Copying it would also be slow, platform-wrong, and could carry `.package-lock`/bin junk. |
| 9 | **`backend/dev.db`** (seed/reference SQLite data) | **yes — git-TRACKED** (deliberately; `backend/.gitignore` does *not* list `dev.db`) | **No** — not on the allowlist. The server runs against `backend/prod.db` instead (see §3.1) | Because it is tracked, a `git archive` package would include it unless explicitly excluded. It is on the exclude list (§3). Note the earlier "consider `git rm --cached backend/dev.db`" suggestion is **superseded**: `dev.db` stays tracked as this repo's seed/reference database, and the *runtime* database is the separate, gitignored `prod.db` — see §3.1. |
| 9a | **`backend/prod.db`** (live production data) | **no — gitignored** (`backend/.gitignore`, with its `-journal`/`-wal`/`-shm` companions) | **No** — created on the server at install time, never packaged | Machine-local runtime data. Absent from any `git archive` because it is gitignored, but a working-tree `rsync`/`robocopy` **would** pick it up from a developer machine — hence the explicit exclude in §3. See §3.1 for how it is created. |
| 10 | **`backend/test_api.mjs`, `backend/test_api.ps1`, `backend/test_fail.json`, `backend/test_pass.json`** | yes, tracked | **No** — not on the allowlist (backend allowlist is `server.ts` + `src/**` minus `__tests__` + `prisma/**` + manifests) | Ad-hoc API test scaffolding. |
| 11 | **All `__tests__/` dirs + `*.test.ts`** under `backend/src/` and `frontend/src/` | yes, tracked | **No** — allowlist excludes `**/__tests__/**`; frontend ships only `dist/` | — |
| 12 | **`backend/scripts/` one-off backfill scripts** (`backfill-*.ts`, `regression-grading-snapshot.ts`) | yes, tracked | **No** — `backend/scripts/` is not on the allowlist | Historical data-migration one-offs, not runtime. Exclude. |
| 13 | **`*.pem`, `mkcert.exe`** (`frontend/10.10.110.31+1*.pem`) | gitignored (`frontend/.gitignore`), not tracked | **No** | Machine-specific dev TLS material. The server must generate/provide its own cert (see §4 caveat about the hardcoded path). |
| 14 | **Real `.env` files** — `backend/.env` (holds `DATABASE_URL`), `frontend/.env.local` (holds real tenant/client GUIDs) | gitignored, not tracked | **No** — only `*.env.example` ships | — |
| 15 | **Source maps (`*.js.map`)** | none produced | **No** — confirmed, see §4 | Holds. |
| 16 | **`frontend/vite.config.ts`, `frontend/README.md`, editor/OS cruft** (`.DS_Store`, `*.log`) | mixed | **No** | Not on the allowlist. |

---

## 3. Codified exclude pattern (use until a real packaging script exists)

**Preferred: build the package from a clean tree, not the working copy.**

```
# 1. Frontend: produce the static bundle
npm ci
npm run build --workspace=frontend        # -> frontend/dist/

# 2. Backend + shared: export tracked files only, no .git, then prune
git archive --format=tar HEAD | tar -x -C <package-root>

# 3. Prune everything that must never ship (paths relative to <package-root>)
rm -rf  <package-root>/.git \
        <package-root>/docs \
        <package-root>/archived \
        <package-root>/AI_RULES.md \
        <package-root>/CHANGELOG.md \
        <package-root>/AUDIT_REPORT.md \
        <package-root>/API_AND_INTEGRATION_SPEC.md \
        <package-root>/DATA_SCHEMAS_AND_TYPES.md \
        <package-root>/ISO2859_MATH_ENGINE.md \
        <package-root>/NAVIGATION_AND_RBAC.md \
        <package-root>/UI_DESIGN_SYSTEM.md \
        <package-root>/backend/dev.db \
        <package-root>/backend/prod.db \
        <package-root>/backend/test_api.mjs \
        <package-root>/backend/test_api.ps1 \
        <package-root>/backend/test_fail.json \
        <package-root>/backend/test_pass.json \
        <package-root>/backend/scripts \
        <package-root>/frontend/src \
        <package-root>/frontend/public \
        <package-root>/frontend/index.html \
        <package-root>/frontend/vite.config.ts \
        <package-root>/frontend/README.md \
        <package-root>/frontend/tsconfig*.json \
        <package-root>/frontend/eslint.config.js \
        <package-root>/frontend/package.json.disabled-if-any
find <package-root> -type d -name __tests__ -prune -exec rm -rf {} +
find <package-root> -type f -name '*.test.ts' -delete
find <package-root> -type f -name '*.test.tsx' -delete

# 4. Copy in the freshly built frontend
mkdir -p <package-root>/frontend
cp -r frontend/dist <package-root>/frontend/dist

# 5. Add the not-yet-written install/ scripts + backend/.env.example, then archive
```

**rsync exclude list (equivalent, if copying from the working tree instead):**

```
--exclude='.git/'            --exclude='.gitignore'
--exclude='.claude/'         --exclude='.cursor/'     --exclude='.windsurf/'
--exclude='.idea/'           --exclude='.vscode/'
--exclude='node_modules/'
--exclude='docs/'            --exclude='archived/'
--exclude='*.md'             # then explicitly re-add only install/*.md if used
--exclude='backend/dev.db'   --exclude='backend/dev.db-*'
--exclude='backend/prod.db'  --exclude='backend/prod.db-*'
--exclude='backend/test_*'   --exclude='backend/scripts/'
--exclude='**/__tests__/'    --exclude='*.test.ts'    --exclude='*.test.tsx'
--exclude='frontend/src/'    --exclude='frontend/public/'
--exclude='frontend/vite.config.ts' --exclude='frontend/index.html'
--exclude='frontend/*.pem'   --exclude='mkcert.exe'
--exclude='*.map'
--exclude='.env'             --exclude='.env.local'   --exclude='.env.production'
--exclude='.DS_Store'        --exclude='*.log'
```

Whichever method is used, the packaging step MUST finish with an automated check
(fail the build on any hit):

```
grep -rIl -e 'Claude' -e 'Anthropic' -e 'Antigravity' -e 'AI_RULES' -e 'Co-Authored-By' <package-root> ; test $? -eq 1
test ! -e <package-root>/.git
test ! -e <package-root>/backend/dev.db
test ! -e <package-root>/backend/prod.db
```

### 3.1 Database: the server runs on `prod.db`, not `dev.db`

The runtime database is **`backend/prod.db`**. It is **not** shipped and **not**
in git — it is created on the target machine at install time and then holds that
site's real inspection data for the rest of its life.

**How the backend picks its database.** `backend/src/lib/prismaClient.ts` reads
`DATABASE_URL` from the environment (via `backend/.env`, loaded by
`import 'dotenv/config'` in `server.ts`, or from the real process environment,
which wins). It follows the same env-var-with-default pattern as
`HOST`/`PORT`/`TLS_KEY_PATH`/`TLS_CERT_PATH`:

| `DATABASE_URL` | Database used |
|---|---|
| set | used verbatim — **this is what the installer sets**, pointing at `prod.db` |
| unset | falls back to `backend/dev.db`, the tracked seed DB — local dev only |

The fallback is an absolute path derived from the backend package directory, so
it does not depend on the working directory the server starts in. In a Windows
service or scheduled-task context the working directory is not guaranteed, so
the installer should set an **absolute** `DATABASE_URL`:

```
DATABASE_URL="file:C:\ProgramData\QualityInspection\prod.db"
```

**How `prod.db` is created at install time.** Two options; pick one and make the
installer do it exactly once, guarded by an existence check so a re-run or an
update never overwrites live data:

1. **Copy the seed** — package `backend/dev.db` as, say, `install/seed.db` (a
   deliberate, renamed copy; the raw `dev.db` path itself stays excluded per §3)
   and copy it to the `prod.db` location on first install. This carries the
   reviewed real-practice configuration — Factory & Line Setup, Product Engine,
   Quality Rules — with zero submissions, which is the intended starting state.
2. **Build an empty schema** — run Prisma against the `prod.db` URL and then
   have an administrator enter all configuration by hand through the app.

Option 1 is strongly preferred: option 2 leaves an operator to re-key the entire
defect taxonomy and product matrix from scratch.

> ⚠️ **Unresolved, and it blocks option 2:** `prisma/migrations/` has been
> drifted from the live schema since long before this manifest (`CHANGELOG.md`
> §5.2) — this project uses `prisma db push`, not `migrate dev`. Do **not**
> assume `prisma migrate deploy` reproduces the current schema on a fresh
> database until that drift is actually reconciled and verified. Nothing in this
> repo demonstrates that it does.

**Never** point a production deployment at `dev.db`: it is overwritten by every
`git pull` of a `chore(dev.db)` commit, which would silently destroy live data.

---

## 4. Risk assessment — does the current approach already exclude everything?

**There is no packaging script yet, so there is nothing that "already" excludes
anything.** The risk of accidental inclusion is **real and high** if the future
step is written naively, because everything dangerous sits at or near the repo
root next to the code that must ship:

- `.git/` (7 MB of history with `Antigravity AI` authorship + Claude trailers),
  `AI_RULES.md`, `CHANGELOG.md`, `AUDIT_REPORT.md`, `archived/`, and `docs/`
  (real `.xlsx` customer data) are all one level above / beside `frontend/` and
  `backend/`. A `xcopy /E`, `robocopy /MIR`, `Compress-Archive -Path .\*`, or
  `tar czf app.tgz .` from the project root would sweep in **all** of it.
- `backend/dev.db` is **git-tracked**, so even the clean `git archive` route
  includes it unless it is explicitly pruned (it is, in §3).

**One risk that an allowlist alone does NOT remove:** the backend ships as source
(it runs via `tsx`), and these shipping files carry AI-tooling references in their
header comments:

| File | Line | Comment text |
|------|------|--------------|
| `backend/server.ts` | 14, 17 | `Level 1 System Precedence: AI_RULES.md …` / `(superseded the Antigravity-era v4_optimized_blueprint.md / implementation_plan.md)` |
| `backend/src/engine/aqlEvaluator.ts` | 13, 15 | same pair |
| `backend/src/routes/config.routes.ts` | 8, 12 | same pair |
| `backend/src/routes/submissions.routes.ts` | 54, 58 | same pair |

`frontend/src/context/ConfigContext.tsx:23` and `frontend/src/pages/WizardPage.tsx:34`
have the same `AI_RULES.md` comment. This section originally reasoned that they were
safe because the frontend ships only as `vite build` output, which strips all
comments — **that reasoning no longer holds**, because the implemented installer
builds the frontend on the server, so `frontend/src` ships as source.

**RESOLVED 2026-09-07 (`CHANGELOG.md` §63).** All **six** files — the four backend
ones in the table above plus those two frontend ones — were reworded to drop the
`AI_RULES.md` reference and the `Antigravity-era` clause, citing the live spec docs
by their neutral names instead. A code-comment edit, unrelated to git-history
rewriting. `package.ps1` now asserts the absence of these strings on every build,
so a reintroduction fails the package rather than shipping.

**Source maps — confirmed clean.** `frontend/vite.config.ts` has no `build` block,
so `build.sourcemap` is Vite's default `false` — `vite build` emits no `*.js.map`.
No `sourceMap` in `backend/tsconfig.json` either, and the backend isn't compiled in
the current run model. Holds as long as nobody sets `sourcemap: true` later; the
§3 automated check (`--exclude='*.map'` + a `find … -name '*.map'` assertion)
guards against regression.

**Secondary, non-AI deployment note — RESOLVED 2026-09-06.** `backend/server.ts`
and `frontend/vite.config.ts` previously `fs.readFileSync` a hardcoded
`frontend/10.10.110.31+1*.pem` path (this laptop's mkcert cert + static LAN IP),
and the app could not start on another host. Both now read `TLS_KEY_PATH` /
`TLS_CERT_PATH` (plus `HOST`) from the environment, falling back to those exact
laptop paths when unset, so local dev is unchanged. A relative value resolves
against the repo root in **both** files, so one setting serves both processes;
absolute paths are used as-is. Documented in `backend/.env.example` and
`frontend/.env.example` (§ Host & TLS) — note Vite does not read `.env` files
into `process.env`, so the frontend's copies must come from the real process
environment. The server still has to supply its own cert: the `.pem` files stay
gitignored and off the package allowlist (§2 row 13).

---

## Database migration

**No.** The original task that produced this file added it as documentation and
changed nothing else. The 2026-09-07 implementation pass (`CHANGELOG.md` §63-§65)
likewise involved no schema change, no `prisma db push`, no migration added or
modified, and left `dev.db` untouched — the installer seeds a *new* database file
from `install/seed.db` on first install only, and never runs `migrate deploy`
(see the §3.1 drift warning, which still stands).
