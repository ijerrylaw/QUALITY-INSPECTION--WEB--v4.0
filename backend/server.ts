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
 * Level 1 System Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 * Level 2 Feature Spec: v4_optimized_blueprint.md & implementation_plan.md
 */

import 'dotenv/config'; // Load .env before anything else (DATABASE_URL etc.)
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

const app = express();
const PORT = process.env['PORT'] ? Number(process.env['PORT']) : 4009;

// Same mkcert-generated, local-CA-trusted cert the frontend uses (see
// frontend/vite.config.ts) — required because Entra ID only allows HTTPS
// for any non-localhost redirect URI, and MSAL's redirectUri is derived
// from the frontend page's own origin, not this server's. Read from
// frontend/ via a relative path (backend and frontend are sibling folders)
// rather than duplicating the files here, so there's a single source of
// truth if Jerry ever has to regenerate them (e.g. the LAN IP changes).
const httpsOptions = {
  key: fs.readFileSync(path.resolve(__dirname, '../frontend/10.10.110.31+1-key.pem')),
  cert: fs.readFileSync(path.resolve(__dirname, '../frontend/10.10.110.31+1.pem')),
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

// ── 404 Fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Server Start ──────────────────────────────────────────────────────────────
https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
  console.log(`[QI Backend v4.0] Server running → https://localhost:${PORT}`);
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
});
