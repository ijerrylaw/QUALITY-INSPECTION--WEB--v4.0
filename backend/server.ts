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
import express from 'express';
import cors from 'cors';
import prisma from './src/lib/prismaClient';
import configRouter from './src/routes/config.routes';
import submissionsRouter, { amendmentsRouter, verdictRouter } from './src/routes/submissions.routes';
import { pinUsersRouter, pinAuthRouter } from './src/routes/pinUsers.routes';

const app = express();
const PORT = process.env['PORT'] ? Number(process.env['PORT']) : 4009;

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

// ── 404 Fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Server Start ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[QI Backend v4.0] Server running → http://localhost:${PORT}`);
  console.log(`  Health:      GET   http://localhost:${PORT}/api/health`);
  console.log(`  Config:      GET   http://localhost:${PORT}/api/config`);
  console.log(`  Config:      PATCH http://localhost:${PORT}/api/config`);
  console.log(`  Submissions: POST  http://localhost:${PORT}/api/submissions`);
  console.log(`  Submissions: GET   http://localhost:${PORT}/api/submissions`);
  console.log(`  Amendments:  GET   http://localhost:${PORT}/api/amendments/pending`);
  console.log(`  Amendments:  POST  http://localhost:${PORT}/api/amendments/:id/approve`);
  console.log(`  Amendments:  POST  http://localhost:${PORT}/api/amendments/:id/reject`);
  console.log(`  Verdict:     POST  http://localhost:${PORT}/api/verdict/preview`);
  console.log(`  PIN Users:   GET   http://localhost:${PORT}/api/pin-users`);
  console.log(`  PIN Users:   POST  http://localhost:${PORT}/api/pin-users`);
  console.log(`  PIN Login:   POST  http://localhost:${PORT}/api/auth/pin-login`);
});
