# Antigravity AI Project Rules & Workspace Operating Protocol

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines the strict behavioral constraints, model selection rules, and execution protocols for AI agents operating within this workspace.  
**Platform Scope:** Rules in §2 and §3 are split by platform. Rules in §1, §4, and §5 are **universal** — they apply on both Antigravity and Claude Code without exception.

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

### 2A. ANTIGRAVITY PLATFORM
Evaluate task complexity and select the appropriate model tier from the **IDE model dropdown selector** before executing:

| Tier | Category | Primary Model | Fallback Model | Target Task Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Fast Execution** | Gemini 3.6 Flash (High) | Gemini 3.5 Flash (High) | Single-file styling tweaks, CSS layout fixes, simple prop updates. |
| **Tier 2** | **Heavy Logic & State** | Claude Sonnet 4.6 (Thinking) | Gemini 3.1 Pro (High) | Complex React hooks, state reducers, form validation, schema refactoring. |
| **Tier 3** | **Architectural Overhaul** | Claude Opus 4.6 (Thinking) | Gemini 3.1 Pro (High) | Multi-file integration breakages, cross-module context bugs, system refactors. |

*Quota Exceeded Protocol:* If the Primary model reaches rate limits, seamlessly drop down to the designated Fallback Model without interrupting the prompt sequence.

### 2B. CLAUDE CODE PLATFORM
Model selection is controlled at the **Claude Code app level** (model picker in the sidebar or `/model` command), not per-task. Match the tier to the task scope before starting a session:

| Tier | Category | Model | Target Task Scope |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **Fast Execution** | `claude-haiku-4-5` | Single-file styling tweaks, CSS layout fixes, simple prop updates. |
| **Tier 2** | **Heavy Logic & State** | `claude-sonnet-4-6` *(current default)* | Complex React hooks, state reducers, form validation, schema refactoring. |
| **Tier 3** | **Architectural Overhaul** | `claude-opus-5` | Multi-file integration breakages, cross-module context bugs, system refactors. |

*Rate Limit Protocol:* Claude Code does not auto-switch models. If a session hits limits, manually switch via the model picker before re-prompting.

---

## 3. WORKSPACE EXECUTION MODES

### 3A. ANTIGRAVITY PLATFORM
* **Architect / Plan Mode:** Used strictly for system analysis, schema drafting, and breaking down plans into micro-steps. No files may be modified in this mode.
* **Agent / Code Mode:** Used for active file editing. The agent must have direct workspace write permissions enabled.

### 3B. CLAUDE CODE PLATFORM
* **Plan Mode:** Invoke with `/plan` or ask Claude to "think through the approach" before any file is touched. Claude will outline the strategy and request approval. No files are modified until the user explicitly says to proceed.
* **Execute Mode:** The default mode. Claude uses Edit, Write, and Bash tools directly. For architectural changes, always enter Plan Mode first.

---

## 4. INCREMENTAL EXECUTION PROTOCOL (Micro-Step Rule)
*(Universal — applies on both Antigravity and Claude Code)*

* **One Complete File per Turn:** Edit or write strictly **one complete file per execution turn**.
* **No Incomplete Code Snippets:** Deliver fully functional, standalone file modules. Do not output truncated code blocks or placeholders (e.g., `// ... rest of code`).
* **Mandatory Build Verification & User Approval:** After completing each file edit, the AI MUST run a build or typecheck validation (`npm run build` or `tsc`), present a concise summary of changes and verification results, and explicitly request user approval before proceeding to the next turn or file.

---

## 5. GIT SAFETY & WORKSPACE SECURITY
*(Universal — applies on both Antigravity and Claude Code)*

* **Pre-Refactor Commit Reminders:** Proactively remind the user to execute a Git commit (`git commit`) prior to performing cross-file deletions or major architectural refactoring.
* **Zero Silent Breaking Changes:** Do not rename, remove, or modify existing exported types, interfaces, or API signatures unless explicitly instructed.
* **Core Tech Stack Guardrail:** Rely strictly on `React 19`, `Vite`, `Tailwind v4`, `Lucide Icons`, and `Framer Motion`. Do not install unapproved third-party NPM packages.
