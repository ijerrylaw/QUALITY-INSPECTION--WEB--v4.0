/**
 * @file wipeGate.ts
 * @description Single source of truth for whether the dev-tools wipe routes
 * (`/api/dev/submissions/*`, devTools.routes.ts) are blocked in this process.
 *
 * Both production layers of the wipe gate read this — the `/api/dev` router
 * mount in server.ts and the router's own `blockInProduction` guard — so the
 * structural double guard stays intact and the two layers can never disagree.
 * The third layer, `requireWipePassword` (WIPE_ENDPOINT_PASSWORD), is separate
 * and applies in EVERY environment, overridden or not.
 *
 * Rule:
 *   NODE_ENV !== 'production'                                -> not blocked
 *   NODE_ENV === 'production', ALLOW_WIPE_IN_PRODUCTION=true -> not blocked
 *   NODE_ENV === 'production', anything else                 -> blocked (404)
 *
 * ALLOW_WIPE_IN_PRODUCTION is a deliberate, TEMPORARY switch for the
 * soft-launch testing period (CHANGELOG §74) — not a permanent relaxation.
 * It fails closed: only the exact lowercase string `true` enables it; unset,
 * empty, `false`, `TRUE`, `1`, `yes`, etc. all leave the routes blocked. That
 * matches the strict `=== 'production'` comparison NODE_ENV itself gets.
 *
 * Scoped to the wipe gate ONLY. Every other NODE_ENV-driven behaviour (generic
 * 500 bodies in internalError.ts, the Prisma HMR cache in prismaClient.ts)
 * still reads NODE_ENV directly and is unaffected by this flag.
 */

export function isWipeAllowedInProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['ALLOW_WIPE_IN_PRODUCTION'] === 'true';
}

export function areWipeRoutesBlocked(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['NODE_ENV'] === 'production' && !isWipeAllowedInProduction(env);
}
