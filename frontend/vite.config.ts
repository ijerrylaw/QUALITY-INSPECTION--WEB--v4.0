import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// mkcert-generated, local-CA-trusted cert covering both `localhost` and the
// LAN IP (10.10.110.31 — reserved/static for this laptop per IT). Required
// because Entra ID only allows HTTPS for any non-localhost redirect URI.
// Resolved via import.meta.url rather than a bare relative path so this
// works regardless of the cwd Vite is launched from (root `npm run dev`
// vs. running `vite` directly inside frontend/).
//
// ── Host/TLS deployment env vars (see frontend/.env.example § Host & TLS) ────
// All four are OPTIONAL. Their defaults reproduce this laptop's original
// hardcoded dev setup exactly, so local dev needs no env vars set at all.
//   HOST           dev-server bind address            (default 0.0.0.0 — all NICs)
//   PORT           dev-server port                    (default 4001)
//   TLS_KEY_PATH   TLS private key, PEM   (default frontend/10.10.110.31+1-key.pem)
//   TLS_CERT_PATH  TLS certificate, PEM   (default frontend/10.10.110.31+1.pem)
// A relative TLS path resolves against the repo root (the parent of this
// frontend/ folder) — the same base backend/server.ts uses, so a single value
// serves both processes; an absolute path is used as-is.
//
// Vite does NOT load .env/.env.local into process.env by default (that's
// reserved for VITE_*-prefixed client vars) — `loadEnv()` here is the
// standard Vite mechanism to read the current mode's .env files ourselves,
// config-side. envDir is __dirname (frontend/), Vite's own default — the
// same directory VITE_MSAL_CLIENT_ID/VITE_MSAL_TENANT_ID already live in
// (frontend/.env.local), so these four can be set right alongside them.
// mode '' + the empty-string prefix filter means: load `.env` + `.env.local`
// (no mode-specific file, since no --mode flag is used by `npm run dev`/
// `vite build` here) and don't restrict to the VITE_ prefix. Real
// process-environment values still win when both are set — matches
// dotenv/Vite's own precedence (shell env > .env file) and backend/server.ts's
// `dotenv/config`, which never overwrites an already-set process.env value.
const fileEnv = loadEnv('', __dirname, '')
const env = (key: string): string | undefined => process.env[key] ?? fileEnv[key]

// Read lazily, and ONLY for `vite dev`. This used to be a top-level const, which
// meant the config module read both .pem files the moment Vite loaded it —
// including during `vite build`, which never opens a socket and has no use for
// TLS material. On any machine without a cert at the configured path that made
// the production build fail outright with ENOENT before compiling a single
// module, which is exactly the situation on a freshly provisioned server (the
// installer builds the frontend there, and the cert is supplied separately by
// IT). Deferring the read keeps dev behaviour identical while letting a build
// succeed on a machine that has no certificate at all.
const readHttpsOptions = () => ({
  key: fs.readFileSync(resolve(REPO_ROOT, env('TLS_KEY_PATH') ?? 'frontend/10.10.110.31+1-key.pem')),
  cert: fs.readFileSync(resolve(REPO_ROOT, env('TLS_CERT_PATH') ?? 'frontend/10.10.110.31+1.pem')),
})

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Strip every `console.*` call and `debugger` statement from the
        // PRODUCTION bundle. This Vite (v8, rolldown/oxc) ignores esbuild's
        // `drop` option — console removal is an oxc-minifier feature, set here
        // via `compress.dropConsole` on the rolldown output options. This runs
        // only during `vite build`; `vite dev` and the vitest browser runner
        // don't minify, so local dev/test keep full console output. `mangle`
        // and `codegen` are left on so the bundle is still fully minified
        // (matching Vite's default `minify: true` behaviour). The ~30
        // `console.error` / `console.warn` diagnostics in src/ stay in the
        // source unchanged; they just don't reach the shipped bundle.
        // See CHANGELOG §62.
        minify: {
          compress: { dropConsole: true, dropDebugger: true },
          mangle: true,
          codegen: true,
        },
      },
    },
  },
  // `command` is 'serve' for `vite dev` and 'build' for `vite build`.
  server: command === 'serve'
    ? {
        host: env('HOST') ?? '0.0.0.0',
        port: env('PORT') ? Number(env('PORT')) : 4001,
        strictPort: true,
        https: readHttpsOptions()
      }
    : undefined
}))
