/**
 * @file prismaClient.ts
 * @description Prisma Client singleton for the QI Backend.
 *
 * Prisma 7 requires an explicit driver adapter. We use @prisma/adapter-libsql
 * which provides a pure-JS/WASM SQLite client (no native build tools needed).
 *
 * DATABASE_URL must be in libsql format, e.g. "file:./prisma/dev.db".
 * This is set in backend/.env and loaded via `import 'dotenv/config'` in server.ts
 * before this module is imported.
 *
 * Uses a globalThis cache to prevent multiple PrismaClient instances from
 * being created during hot-module reloads in development (tsx watch mode).
 */

import { PrismaLibSql } from '@prisma/adapter-libsql';


import { PrismaClient } from '../../generated/prisma/client';

// ── Singleton pattern ─────────────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as {
  __qi_prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('[prismaClient] DATABASE_URL is not set. Check your backend/.env file.');
  }

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
