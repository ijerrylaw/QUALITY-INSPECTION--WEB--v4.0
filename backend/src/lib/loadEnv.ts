/**
 * @file loadEnv.ts
 * @description Loads backend/.env from an ABSOLUTE path, anchored to this
 * package's own directory. Import this for its side effect, before anything
 * that reads process.env.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * server.ts previously used `import 'dotenv/config'`, which resolves `.env`
 * against `process.cwd()`. That works in local development only by coincidence:
 * `npm run dev --workspace=backend` happens to run with the working directory
 * set to backend/, so the file is found.
 *
 * Under a Windows service there is no such guarantee — the working directory is
 * whatever the service manager was configured with, and for this app that is the
 * application root, one level up. `.env` was therefore silently not found, and
 * because every setting it holds is optional with a baked-in default, the server
 * did not fail: it started with the DEVELOPMENT defaults. That meant the
 * production service would have used backend/dev.db instead of the real
 * database, looked for the original laptop's TLS certificate, and — because
 * NODE_ENV was also unset — mounted the destructive /api/dev maintenance routes
 * that are supposed to exist only outside production.
 *
 * Anchoring to __dirname removes the dependency on the working directory
 * entirely, for exactly the reason src/lib/prismaClient.ts anchors its own
 * DATABASE_URL default rather than leaving it CWD-relative: a silent wrong
 * answer is far worse than a loud failure.
 *
 * Precedence is unchanged — dotenv never overwrites a variable that is already
 * set in the real process environment, so a value supplied by the service
 * manager or the shell still wins over the file.
 */

import path from 'node:path';

import dotenv from 'dotenv';

/** backend/ — this file lives at backend/src/lib/loadEnv.ts. */
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.resolve(BACKEND_ROOT, '.env') });
