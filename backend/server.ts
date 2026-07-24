import 'dotenv/config'; // Load .env before anything else (DATABASE_URL etc.)
import express from 'express';
import cors from 'cors';
import submissionsRouter from './src/routes/submissions';

const app = express();
const PORT = process.env['PORT'] ? Number(process.env['PORT']) : 4009;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'QI Backend v4.0', timestamp: new Date().toISOString() });
});

// ── Feature routes ────────────────────────────────────────────────────────────
app.use('/api/submissions', submissionsRouter);

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[QI Backend v4.0] Server running → http://localhost:${PORT}`);
  console.log(`  Health:   GET  http://localhost:${PORT}/api/health`);
  console.log(`  Evaluate: POST http://localhost:${PORT}/api/submissions/evaluate`);
});
