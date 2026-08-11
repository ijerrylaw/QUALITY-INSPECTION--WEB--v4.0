/**
 * @file identity.ts
 * @description Resolves who created a Submission or AmendmentLog, for both
 * writing (which columns to populate) and reading (what name to display).
 *
 * The app has two login methods that produce fundamentally different identity
 * shapes, so rows carry a mixed model (see schema.prisma):
 *
 *   PIN login  → `*PinUserId` FK into the real PinUser table
 *   M365 login → free-text `aadObjectId`/`userPrincipalName`/`displayName`
 *                strings, because SSO users have no row in this database
 *
 * Exactly one side is populated per row. Both are nullable, so nothing here
 * can assume either exists — legacy rows predate the whole model and carry
 * hardcoded placeholder literals in the string fields.
 *
 * NOTE ON TRUST: the identity in a request body is taken at face value. There
 * is no session token to verify it against — the app's auth is still
 * client-claimed throughout (see NAVIGATION_AND_RBAC.md §5.1). A caller can
 * therefore claim to be someone else. This is a known, accepted limitation
 * to be closed when real Entra ID SSO lands, not an oversight.
 */

/** Login methods that can produce an identity. Mirrors AuthContext's User.loginMethod. */
export const LOGIN_METHODS = ['PIN', 'M365'] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

/** The identity columns as stored — exactly one side populated. */
export interface ResolvedIdentity {
  pinUserId: string | null;
  aadObjectId: string | null;
  userPrincipalName: string | null;
  displayName: string | null;
}

export interface IdentityValidationFailure {
  ok: false;
  /** Field names to report back in a 400, matching the route's existing shape. */
  missingFields: string[];
}

export interface IdentityValidationSuccess {
  ok: true;
  identity: ResolvedIdentity;
}

export type IdentityValidationResult = IdentityValidationSuccess | IdentityValidationFailure;

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Reads the identity fields off a request body and decides which columns to
 * write, branching on `loginMethod`.
 *
 * Deliberately rejects rather than degrading: a body with no usable identity
 * returns a failure instead of writing nulls everywhere. An unattributed row
 * is worse than the hardcoded placeholder it replaced, because it looks like
 * real data while being permanently untraceable.
 */
export function resolveIdentity(body: Record<string, unknown>): IdentityValidationResult {
  const loginMethod = nonEmptyString(body['loginMethod']);

  if (loginMethod === null) {
    return { ok: false, missingFields: ['loginMethod'] };
  }

  if (!(LOGIN_METHODS as readonly string[]).includes(loginMethod)) {
    return { ok: false, missingFields: [`loginMethod (must be one of: ${LOGIN_METHODS.join(', ')})`] };
  }

  if (loginMethod === 'PIN') {
    const pinUserId = nonEmptyString(body['pinUserId']);
    if (pinUserId === null) {
      return { ok: false, missingFields: ['pinUserId (required when loginMethod is PIN)'] };
    }
    return {
      ok: true,
      identity: { pinUserId, aadObjectId: null, userPrincipalName: null, displayName: null },
    };
  }

  const aadObjectId = nonEmptyString(body['aadObjectId']);
  const userPrincipalName = nonEmptyString(body['userPrincipalName']);
  const missingFields: string[] = [];
  if (aadObjectId === null) missingFields.push('aadObjectId (required when loginMethod is M365)');
  if (userPrincipalName === null) missingFields.push('userPrincipalName (required when loginMethod is M365)');
  if (missingFields.length > 0) {
    return { ok: false, missingFields };
  }

  return {
    ok: true,
    // displayName is optional — an SSO identity without one falls back to its
    // UPN at display time rather than blocking the whole submission.
    identity: {
      pinUserId: null,
      aadObjectId,
      userPrincipalName,
      displayName: nonEmptyString(body['displayName']),
    },
  };
}

/**
 * The PinUser fields that are safe to expose in an API response.
 *
 * PinUser also carries pinHash/pinSalt. Passing `include: { pinUser: true }`
 * would serialize those into the response body, so every query that joins a
 * PinUser must pass this `select` instead. Exported as a shared constant so
 * there is one thing to get right rather than one per call site.
 */
export const PIN_USER_DISPLAY_SELECT = {
  id: true,
  name: true,
  jobTitle: true,
} as const;

/** A PinUser as narrowed by PIN_USER_DISPLAY_SELECT. */
export interface PinUserDisplay {
  id: string;
  name: string;
  jobTitle: string;
}

/**
 * The single place PIN-vs-SSO branching happens for display purposes.
 *
 * Resolves to a person's NAME for both login methods, never an email — the
 * UI shows one consistent "who did this" column regardless of how they
 * logged in. Falls back to the UPN only for SSO rows written before
 * displayName existed, and to a dash when a row has no identity at all
 * (legacy rows, or a PIN user whose row was later hard-deleted).
 */
export function displayNameOf(
  source: {
    pinUser?: PinUserDisplay | null;
    displayName?: string | null;
    userPrincipalName?: string | null;
  } | null | undefined,
): string {
  if (!source) return '—';
  return source.pinUser?.name ?? source.displayName ?? source.userPrincipalName ?? '—';
}
