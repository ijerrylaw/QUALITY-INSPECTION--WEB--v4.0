/**
 * @file server.ts
 * @description Quality Inspection v4.0 Native Backend Server Entrypoint.
 *
 * Registered Routes:
 *   - GET  /api/health       -> Health check endpoint
 *   - GET  /api/config       -> System configuration (AppConfig singleton)
 *   - PATCH /api/config      -> Update system configuration
 *   - POST /api/submissions  -> Save AQL inspection submission & verdict
 *   - GET  /api/submissions  -> List 50 recent inspection submissions
 *   - GET  /api/submissions/:id -> Get single submission details
 *   - POST /api/verdict/preview -> Read-only verdict preview, no persistence
 *
 * Level 1 System Precedence: UI_DESIGN_SYSTEM.md
 * Level 2 Feature Spec: API_AND_INTEGRATION_SPEC.md § 1 (REST API Endpoints —
 *   the full surface this entrypoint wires up)
 */

// MUST stay the first import: it populates process.env (DATABASE_URL, TLS paths,
// NODE_ENV) from backend/.env, and the modules below read those values as they
// load. Resolves the file from this package's directory rather than the working
// directory — see src/lib/loadEnv.ts for why that distinction is load-bearing
// when running as a service.
import './src/lib/loadEnv';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import prisma from './src/lib/prismaClient';
import configRouter from './src/routes/config.routes';
import submissionsRouter, { amendmentsRouter, verdictRouter } from './src/routes/submissions.routes';
import { pinUsersRouter, pinAuthRouter } from './src/routes/pinUsers.routes';
import { m365UsersRouter, m365AuthRouter } from './src/routes/m365Users.routes';
import accessLogRouter from './src/routes/accessLog.routes';
import registryRouter from './src/routes/registry.routes';
import devToolsRouter from './src/routes/devTools.routes';
import { globalErrorHandler } from './src/lib/internalError';

const app = express();
const PORT = process.env['PORT'] ? Number(process.env['PORT']) : 4009;
const HOST = process.env['HOST'] ?? '0.0.0.0';

// Same mkcert-generated, local-CA-trusted cert the frontend uses (see
// frontend/vite.config.ts) — required because Entra ID only allows HTTPS
// for any non-localhost redirect URI, and MSAL's redirectUri is derived
// from the frontend page's own origin, not this server's. Read from
// frontend/ by default (backend and frontend are sibling folders) rather
// than duplicating the files here, so there's a single source of truth if
// Jerry ever has to regenerate them (e.g. the LAN IP changes).
//
// ── Host/TLS deployment env vars (see backend/.env.example) ──────────────────
// All four are OPTIONAL. Their defaults reproduce this laptop's original
// hardcoded dev setup exactly, so local dev needs no env vars set at all.
//   HOST           bind address for the listener      (default 0.0.0.0 — all NICs)
//   PORT           listen port                        (default 4009)
//   TLS_KEY_PATH   TLS private key, PEM   (default frontend/10.10.110.31+1-key.pem)
//   TLS_CERT_PATH  TLS certificate, PEM   (default frontend/10.10.110.31+1.pem)
// A relative TLS path resolves against the repo root (the parent of this
// backend/ folder); an absolute path is used as-is. frontend/vite.config.ts
// resolves TLS_KEY_PATH/TLS_CERT_PATH against that same repo root, so a single
// value serves both processes. On another host, point these at that machine's
// own cert — the .pem files themselves are gitignored and never shipped.
const REPO_ROOT = path.resolve(__dirname, '..');
const TLS_KEY_PATH = path.resolve(REPO_ROOT, process.env['TLS_KEY_PATH'] ?? 'frontend/10.10.110.31+1-key.pem');
const TLS_CERT_PATH = path.resolve(REPO_ROOT, process.env['TLS_CERT_PATH'] ?? 'frontend/10.10.110.31+1.pem');

const httpsOptions = {
  key: fs.readFileSync(TLS_KEY_PATH),
  cert: fs.readFileSync(TLS_CERT_PATH),
};

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    // Quick DB query to verify Prisma database connectivity
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      service: 'QI Backend v4.0',
      database: 'connected',
      port: PORT,
      protocol: 'https',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      service: 'QI Backend v4.0',
      database: 'disconnected',
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

// ── Native Feature Routes ─────────────────────────────────────────────────────
app.use('/api/config', configRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/amendments', amendmentsRouter);
app.use('/api/verdict', verdictRouter);
app.use('/api/pin-users', pinUsersRouter);
app.use('/api/auth', pinAuthRouter);
app.use('/api/m365-users', m365UsersRouter);
app.use('/api/auth', m365AuthRouter);
app.use('/api/access-log', accessLogRouter);
app.use('/api/registry', registryRouter);

// Dev-only destructive testing utilities — never mounted in production, on
// top of that router's own internal NODE_ENV check (devTools.routes.ts):
// structural double-guard so a slipped/misconfigured env var can't leave
// only one layer standing between this and prod data.
if (process.env['NODE_ENV'] !== 'production') {
  app.use('/api/dev', devToolsRouter);
}

// ── Static SPA (deployed installs only) ───────────────────────────────────────
// On a real server this process is the ONLY thing listening: it serves both the
// JSON API above and the built React bundle, so the app is reachable at a single
// origin (https://<host>:<PORT>). That is what makes the frontend's own defaults
// work with no configuration — ConfigContext's API_BASE_URL falls back to
// `https://<page hostname>:4009` and msalConfig's redirectUri falls back to
// window.location.origin, both of which are simply this origin.
//
// Guarded by an existence check on the built index.html: during local dev
// frontend/dist does not exist (the Vite dev server on :4001 serves the UI
// instead), so none of this mounts and dev behaviour is byte-for-byte unchanged.
const FRONTEND_DIST = path.resolve(REPO_ROOT, 'frontend', 'dist');
const SPA_INDEX = path.join(FRONTEND_DIST, 'index.html');
const SPA_ENABLED = fs.existsSync(SPA_INDEX);

if (SPA_ENABLED) {
  // Hashed asset filenames from `vite build` are safe to serve directly.
  app.use(express.static(FRONTEND_DIST));

  // History fallback for client-side routes (/wizard, /system, ...): hand back
  // index.html so a deep link or a browser refresh doesn't 404. A RegExp is used
  // rather than a '*' string because it behaves identically across Express 4 and
  // 5 (whose path-to-regexp rewrite changed wildcard string handling). The
  // negative lookahead keeps /api and /api/... out of the fallback so unknown
  // API routes still fall through to the JSON 404 below instead of silently
  // returning HTML — which would surface to a fetch() caller as an opaque JSON
  // parse error rather than a clean 404.
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(SPA_INDEX);
  });
}

// ── 404 Fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Last middleware, after every route and the 404 fallback. Catches synchronous
// throws in route handlers and anything forwarded via next(err); logs the full
// error server-side and returns a generic body — the raw `details` string is
// included only outside production (NODE_ENV gate, in src/lib/internalError.ts).
// See CHANGELOG §62.
app.use(globalErrorHandler);

// ── Server Start ──────────────────────────────────────────────────────────────
https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
  console.log(`[QI Backend v4.0] Server running → https://localhost:${PORT}`);
  console.log(`  Bound to:    ${HOST}:${PORT}   TLS cert: ${TLS_CERT_PATH}`);
  console.log(
    SPA_ENABLED
      ? `  Web UI:      serving ${FRONTEND_DIST}`
      : `  Web UI:      not served (no frontend/dist build — use the Vite dev server)`
  );
  console.log(`  Health:      GET   https://localhost:${PORT}/api/health`);
  console.log(`  Config:      GET   https://localhost:${PORT}/api/config`);
  console.log(`  Config:      PATCH https://localhost:${PORT}/api/config`);
  console.log(`  Submissions: POST  https://localhost:${PORT}/api/submissions`);
  console.log(`  Submissions: GET   https://localhost:${PORT}/api/submissions`);
  console.log(`  Amendments:  GET   https://localhost:${PORT}/api/amendments/pending`);
  console.log(`  Amendments:  POST  https://localhost:${PORT}/api/amendments/:id/approve`);
  console.log(`  Amendments:  POST  https://localhost:${PORT}/api/amendments/:id/reject`);
  console.log(`  Verdict:     POST  https://localhost:${PORT}/api/verdict/preview`);
  console.log(`  PIN Users:   GET   https://localhost:${PORT}/api/pin-users`);
  console.log(`  PIN Users:   POST  https://localhost:${PORT}/api/pin-users`);
  console.log(`  PIN Login:   POST  https://localhost:${PORT}/api/auth/pin-login`);
  console.log(`  M365 Users:  GET   https://localhost:${PORT}/api/m365-users`);
  console.log(`  M365 Users:  PATCH https://localhost:${PORT}/api/m365-users/:id`);
  console.log(`  M365 Login:  POST  https://localhost:${PORT}/api/auth/m365-login`);
  console.log(`  Access Log:  GET   https://localhost:${PORT}/api/access-log`);
});
