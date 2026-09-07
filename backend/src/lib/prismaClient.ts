/**
 * @file prismaClient.ts
 * @description Prisma Client singleton for the QI Backend.
 *
 * Prisma 7 requires an explicit driver adapter. We use @prisma/adapter-libsql
 * which provides a pure-JS/WASM SQLite client (no native build tools needed).
 *
 * DATABASE_URL must be in libsql format, e.g. "file:./dev.db" or an absolute
 * "file:C:\path\to\prod.db". It is read from the environment — set it in
 * backend/.env (loaded via `import 'dotenv/config'` in server.ts before this
 * module is imported) or in the real process environment, which wins.
 *
 * ── Which database file? ─────────────────────────────────────────────────────
 * Same env-var-with-default pattern as HOST / PORT / TLS_KEY_PATH /
 * TLS_CERT_PATH in server.ts: the environment wins, and an unset value falls
 * back to the committed dev seed database, so local dev works with no
 * configuration at all.
 *
 *   DATABASE_URL set    -> used verbatim. Production/installer deployments
 *                          point this at backend/prod.db (see
 *                          INSTALLER_PACKAGE_MANIFEST.md); prod.db is created
 *                          at install time and is gitignored.
 *   DATABASE_URL unset  -> "file:<backendRoot>/dev.db" — the git-TRACKED seed
 *                          database, unchanged local-dev behaviour.
 *
 * The default is anchored to this package's own directory rather than left
 * CWD-relative on purpose: a bare "file:./dev.db" silently resolves against
 * whatever directory the process happened to start in, which would quietly
 * create and talk to an *empty* database instead of failing loudly. An
 * explicitly-set DATABASE_URL is passed through untouched, so the deployment
 * contract is unchanged.
 *
 * Uses a globalThis cache to prevent multiple PrismaClient instances from
 * being created during hot-module reloads in development (tsx watch mode).
 */

import path from 'node:path';

import { PrismaLibSql } from '@prisma/adapter-libsql';


import { PrismaClient } from '../../generated/prisma/client';

// ── Singleton pattern ─────────────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as {
  __qi_prisma: PrismaClient | undefined;
};

/** backend/ — this file lives at backend/src/lib/prismaClient.ts. */
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

/** Fallback when DATABASE_URL is unset: the tracked dev seed database. */
const DEFAULT_DATABASE_URL = `file:${path.resolve(BACKEND_ROOT, 'dev.db')}`;

/**
 * Resolve the libsql connection URL. Exported for tests/diagnostics.
 *
 * An empty or whitespace-only DATABASE_URL counts as unset — `??` alone would
 * forward `""` to the adapter and fail deep inside libsql with a far less
 * obvious error than simply using the default.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env['DATABASE_URL'];
  return url && url.trim() !== '' ? url : DEFAULT_DATABASE_URL;
}

function createPrismaClient(): PrismaClient {
  const url = resolveDatabaseUrl();

  // PrismaLibSql accepts { url, authToken? } directly — no need to pre-create a client
  const adapter = new PrismaLibSql({ url });

  // Prisma 7 strict types require adapter; cast to bypass compile-time check
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (PrismaClient as any)({ adapter }) as PrismaClient;
}


export const prisma: PrismaClient =
  globalForPrisma.__qi_prisma ?? createPrismaClient();

// Cache in development to survive HMR restarts
if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.__qi_prisma = prisma;
}

export default prisma;
