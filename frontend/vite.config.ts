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

const httpsOptions = {
  key: fs.readFileSync(resolve(REPO_ROOT, env('TLS_KEY_PATH') ?? 'frontend/10.10.110.31+1-key.pem')),
  cert: fs.readFileSync(resolve(REPO_ROOT, env('TLS_CERT_PATH') ?? 'frontend/10.10.110.31+1.pem')),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: env('HOST') ?? '0.0.0.0',
    port: env('PORT') ? Number(env('PORT')) : 4001,
    strictPort: true,
    https: httpsOptions
  }
})
