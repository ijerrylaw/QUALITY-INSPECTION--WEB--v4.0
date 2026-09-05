# AI Project Rules & Workspace Operating Protocol

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines the strict behavioral constraints, model selection rules, and execution protocols for AI agents operating within this workspace.  
**Platform Scope:** All development happens in Claude Code. (Antigravity was used during early prototyping — see the historical note in §2.)

---

## 1. THE MASTER SOURCES OF TRUTH (CROSS-REFERENCE DIRECTORY)
To prevent context bleed, the AI MUST consult the following specialized files for domain-specific rules:
* **Visuals & Styling:** Refer strictly to `UI_DESIGN_SYSTEM.md`.
* **Routing & Security:** Refer strictly to `NAVIGATION_AND_RBAC.md`.
* **Data Shapes & Types:** Refer strictly to `DATA_SCHEMAS_AND_TYPES.md`.
* **Calculation Logic:** Refer strictly to `ISO2859_MATH_ENGINE.md`.
* **Backend Endpoints:** Refer strictly to `API_AND_INTEGRATION_SPEC.md`.
* **Active Cleanup Findings & Progress Log:** Refer to `AUDIT_REPORT.md` for in-progress bug findings, fixes, and deferred design notes from the ongoing housekeeping effort.

---

## 2. MODEL SELECTION & TIER MATRIX

> Antigravity was used during early prototyping but is no longer part of this project's workflow as of August 9, 2026. All development now happens in Claude Code. This section is retained for historical context only.

Model selection is controlled at the **Claude Code app level** (model picker in the sidebar or `/model` command), not per-task. Match the tier to the task scope before starting a session:

| Tier | Category | Model | Target Task Scope |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **Fast Execution** | `claude-haiku-4-5-20251001` | Single-file styling tweaks, CSS layout fixes, simple prop updates. |
| **Tier 2** | **Heavy Logic & State** | `claude-sonnet-5` *(current default)* | Complex React hooks, state reducers, form validation, schema refactoring. |
| **Tier 3** | **Architectural Overhaul** | `claude-opus-5` | Multi-file integration breakages, cross-module context bugs, system refactors. |

*Rate Limit Protocol:* Claude Code does not auto-switch models. If a session hits limits, manually switch via the model picker before re-prompting.

---

## 3. WORKSPACE EXECUTION MODES

* **Plan Mode:** Entered via the `EnterPlanMode` tool — triggered by task shape (a new feature, a multi-file change, an architectural decision, or anything with more than one reasonable approach) rather than typed by the user every time, though the user can also ask Claude to "think through the approach first." While in Plan Mode, only the plan file itself may be written; all other tools are read-only. Claude explores, drafts a concrete plan, and calls `ExitPlanMode` to present it for approval — no other files are touched until the user approves.
* **Execute Mode:** The default mode once a plan is approved (or for tasks that didn't need one). Claude uses Edit, Write, and Bash tools directly, batching as many files as the task needs in one turn (§4).

---

## 4. EXECUTION PROTOCOL

* **Batched multi-file turns are normal.** Edit or write as many files as a single coherent task needs within one execution turn — do not artificially split a change into one-file-per-turn steps. A turn ends when the task (or a sensible checkpoint within it) is actually done, not after each file.
* **No Incomplete Code Snippets:** Deliver fully functional, standalone file modules. Do not output truncated code blocks or placeholders (e.g., `// ... rest of code`).
* **Approval gates are reserved for genuinely irreversible steps** — a schema drop, a `--accept-data-loss` operation, a force-push, or similarly hard-to-reverse action — not after every file or every turn. See §5's Git Safety rules for the specific gated actions. Routine multi-file edits, verified with a build/typecheck pass, do not require a stop-and-approve step before continuing.

---

## 5. GIT SAFETY & WORKSPACE SECURITY

* **Pre-Refactor Commit Reminders:** Proactively remind the user to execute a Git commit (`git commit`) prior to performing cross-file deletions or major architectural refactoring.
* **Zero Silent Breaking Changes:** Do not rename, remove, or modify existing exported types, interfaces, or API signatures unless explicitly instructed.
* **Core Tech Stack Guardrail:** Rely strictly on `React 19`, `Vite`, `Tailwind v4`, and `Lucide Icons`. Do not install unapproved third-party NPM packages.

---

## 6. BROWSER SELF-TESTING CAPABILITY (Confirmed 2026-08-25)

* **Group C (PIN-based login) UI flows — self-testable, confirmed live.** Claude Code has directly click-tested, via Playwright against the real running dev backend, the full identity-first PIN login surface: directory search/filter, account selection, PIN pad entry, wrong-PIN failure/reset, the forced `mustChangePin` gate (`SetPinPage`), self-service PIN change, and "not you? go back" navigation. Going forward, attempt a real Playwright click-through for Group C UI changes as part of verification instead of defaulting to "needs Jerry's manual browser check."
* **Group A/B (MSAL popup OAuth) — confirmed still blocked.** The Microsoft 365 SSO popup flow cannot be completed in this sandbox. Reserve the "needs Jerry's manual browser check" fallback for Group A/B (MSAL-authenticated) work only — it is not a blanket excuse to skip self-testing for Group C.

---

## 7. PRISMA / DATABASE WORKFLOW

* **`prisma db push` only — never `prisma migrate dev`.** This is a standing project rule. The `backend/prisma/migrations/` folder is stale (only `20260723114800_init_schema` is on record; every schema change since was applied via `db push`), so `migrate dev` detects the drift and its only built-in remedy is `migrate reset`, which drops all data. Apply schema changes with `prisma db push` (additive/nullable, non-destructive), which reconciles the live DB directly against `schema.prisma` and ignores migration history. See `CHANGELOG.md` §5.2 for the full history of the drift.
* **`prisma db push` does NOT regenerate the Prisma client.** Unlike `prisma migrate deploy`, `db push` writes the schema to the database but leaves the generated client (`@prisma/client` types) untouched. **Always run `prisma generate` manually after every `db push`.** Skipping it has caused integration bugs twice — the schema change persisted, but backend code kept compiling and running against the old generated types.
