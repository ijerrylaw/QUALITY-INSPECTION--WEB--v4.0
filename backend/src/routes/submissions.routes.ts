/**
 * @file submissions.routes.ts
 * @description Native v4.0 Express router for AQL inspection submission endpoints.
 *
 * Endpoints:
 *
 *  POST /api/submissions
 *    Full inspection submission flow:
 *      1. Validate incoming payload against Submission schema fields.
 *      2. Resolve InspectionProfile + evaluate verdict via resolveVerdict() (engine/resolveVerdict.ts).
 *      3. Reject with 409 if `batchNumber` (the Full System Lot Number) already
 *         exists — this app records the operator-entered lot number, it never
 *         invents one (ISO2859_MATH_ENGINE.md §4), so a collision means the
 *         same physical lot was recorded twice.
 *      4. Persist the final Submission record (including verdict) to SQLite via Prisma.
 *
 *  GET  /api/submissions
 *    Returns a page of submissions ordered by creation date descending (see
 *    query params on the handler below). Defaults to page 1 / 50 rows when
 *    called with no params, matching this endpoint's original behavior.
 *
 *  GET  /api/submissions/sequence-hint
 *    Non-binding advisory: suggested next Sequence No for a Line+Side+YJJJ
 *    group. Never restricts or pre-fills — see ISO2859_MATH_ENGINE.md §4.
 *    Also returns suggestedTotalCarton — the Total Carton value from the
 *    most recent prior submission in the same Line+Side+YJJJ group — which
 *    the wizard DOES use to pre-fill (editable default, not advisory-only).
 *
 *  GET  /api/submissions/new-indicator
 *    Global (not per-user) advisory: whether any Submission was created
 *    after the last time ANY user viewed Inspection Records (or since the
 *    start of today, if that's more recent — see effectiveLastViewedAt).
 *    Drives the sidebar "new lot" dot + row badges in HistoryFeed.tsx.
 *
 *  POST /api/submissions/mark-history-viewed
 *    Records that a user just viewed Inspection Records — updates the same
 *    global timestamp GET /new-indicator reads. Called once by HistoryFeed.tsx
 *    on mount, after it has captured the pre-update threshold for row badges.
 *
 *  GET  /api/submissions/:id
 *    Returns a single submission with its amendment logs. `profileId` is an
 *    opaque reference (see AUDIT_REPORT.md §9.3/§10 Part 3) — no relational
 *    profile record is hydrated; resolve it against AppConfig.inspectionProfiles
 *    client-side if needed, same as ConfigContext.tsx's getResolvedProfile().
 *
 *  POST /api/submissions/:id/amendments
 *    Drafts an amendment (PENDING_APPROVAL) and previews — informationally, non-blocking —
 *    what the server would recompute the verdict as.
 *
 * Also exports:
 *  - amendmentsRouter (mounted at /api/amendments) — pending queue, approve, reject.
 *  - verdictRouter     (mounted at /api/verdict)    — read-only verdict preview, no persistence.
 *
 * Level 1 System Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 * Level 2 Feature Spec: v4_optimized_blueprint.md & implementation_plan.md
 */

import { Router, Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { resolveVerdict, VerdictProfileNotFoundError, VerdictNoUsableProfileError, VerdictNoUsableDimensionConfigError } from '../engine/resolveVerdict';
import { FIXED_DIM_WEIGHT } from '../engine/dimensionEvaluator';
import prisma from '../lib/prismaClient';
import {
  PIN_USER_DISPLAY_SELECT,
  displayNameOf,
  resolveIdentity,
  type PinUserDisplay,
} from '../lib/identity';
import { requireRole, ALL_ROLES } from '../middleware/auth';

const router = Router();

/** Maximum lifetime APPROVED amendments per Submission — rejected/pending
 *  drafts don't count (see POST /:id/amendments' pre-flight check below). */
const MAX_APPROVED_AMENDMENTS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Valid AmendmentStatus enum values (DATA_SCHEMAS_AND_TYPES.md) — used to
 *  validate the `amendmentStatus` filter query param on GET /api/submissions. */
const AMENDMENT_STATUSES = ['UNMODIFIED', 'AMENDMENT_DRAFTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;

/**
 * Required string-typed fields on every incoming submission payload.
 *
 * Identity fields are deliberately absent — which of them are required
 * depends on the caller's loginMethod, so they're validated by
 * resolveIdentity() (lib/identity.ts) rather than by this flat list.
 */
const REQUIRED_STRING_FIELDS = [
  'productCode',
  'productionDate',
  'samplingTime',
  'machineId',
  'shift',
  'batchNumber',
  'size',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY JOINS & DISPLAY-NAME MAPPING
//
// Every endpoint that returns a Submission or AmendmentLog resolves the
// creator's name server-side, so no client ever has to know whether a row
// came from a PIN login or an SSO one. Clients read `inspectorName` /
// `requestedByName` / `reviewedByName` and nothing else.
//
// The `select` in these includes is load-bearing, not stylistic: PinUser
// carries pinHash/pinSalt, and `include: { pinUser: true }` would serialize
// them straight into the response body.
// ─────────────────────────────────────────────────────────────────────────────

const SUBMISSION_IDENTITY_INCLUDE = {
  pinUser: { select: PIN_USER_DISPLAY_SELECT },
} as const;

const AMENDMENT_LOG_IDENTITY_INCLUDE = {
  requestedByPinUser: { select: PIN_USER_DISPLAY_SELECT },
  reviewedByPinUser: { select: PIN_USER_DISPLAY_SELECT },
} as const;

interface AmendmentLogIdentityFields {
  requestedBy: string | null;
  requestedByDisplayName: string | null;
  requestedByPinUser: PinUserDisplay | null;
  reviewedBy: string | null;
  reviewedByDisplayName: string | null;
  reviewedByPinUser: PinUserDisplay | null;
}

interface SubmissionIdentityFields {
  userPrincipalName: string | null;
  displayName: string | null;
  pinUser: PinUserDisplay | null;
}

/** Adds requestedByName/reviewedByName to an AmendmentLog. */
function withAmendmentLogNames<T extends AmendmentLogIdentityFields>(log: T) {
  return {
    ...log,
    requestedByName: displayNameOf({
      pinUser: log.requestedByPinUser,
      displayName: log.requestedByDisplayName,
      userPrincipalName: log.requestedBy,
    }),
    reviewedByName: displayNameOf({
      pinUser: log.reviewedByPinUser,
      displayName: log.reviewedByDisplayName,
      userPrincipalName: log.reviewedBy,
    }),
  };
}

/** Adds inspectorName to a Submission, and names to any amendment logs it carries. */
function withSubmissionNames<
  T extends SubmissionIdentityFields & { amendmentLogs?: AmendmentLogIdentityFields[] },
>(submission: T) {
  return {
    ...submission,
    inspectorName: displayNameOf(submission),
    ...(submission.amendmentLogs && {
      amendmentLogs: submission.amendmentLogs.map(withAmendmentLogNames),
    }),
  };
}

/**
 * Normalizes a `defects`/`dimensions` value that may arrive as a JSON string
 * (as stored on Submission/AmendmentLog) or already as a parsed object (as
 * sent by the frontend in a fresh payload) into a plain object.
 */
function parseJSONObjectField<T = unknown>(raw: unknown): Record<string, T> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, T>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, T>;
  return {};
}

/**
 * Sanity-checks a profileId against the Profile table — the source of profile
 * IDENTITY as of Stage A0 (previously read out of AppConfig.inspectionProfiles
 * JSON; the relational InspectionProfile table before that had been removed as
 * always-empty, AUDIT_REPORT.md §9.3 Option B / §10 Part 3). Still not a
 * foreign key on Submission — just a same-request check so an obviously-wrong
 * id (typo, stale reference, deleted profile) degrades to null with a log line
 * instead of being stored as if it were valid. `'prof_default'` is accepted
 * even when absent from the table, matching resolveVerdict.ts's own
 * hardcoded-default sentinel handling.
 */
/**
 * True if `err` is a Prisma unique-constraint violation (code P2002) on the
 * given column — used to translate a race-condition collision on
 * `Submission.batchNumber` (the pre-insert findFirst check below is not
 * atomic) into the same clean, specific error response as the pre-check.
 */
function isUniqueConstraintViolation(err: unknown, field: string): boolean {
  return (
    typeof err === 'object' && err !== null &&
    'code' in err && (err as { code?: unknown }).code === 'P2002' &&
    Array.isArray((err as { meta?: { target?: unknown } }).meta?.target) &&
    ((err as { meta?: { target?: unknown[] } }).meta?.target ?? []).includes(field)
  );
}

async function isKnownProfileId(profileId: string): Promise<boolean> {
  if (profileId === 'prof_default') return true;
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { id: true } });
  return profile !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions  (PERSISTED — writes to SQLite)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full inspection submission endpoint.
 *
 * Request body (JSON):
 * {
 *   "productCode":    "N035SKB-OC-24FT",
 *   "productionDate": "2025-07-25",
 *   "samplingTime":   "08:30",
 *   "machineId":      "M01",
 *   "shift":          "Shift 1 (Morning)",
 *   "batchNumber":    "BT-2025-001",
 *   "size":           "M",
 *   "sampleSize":     125,
 *   "dimensions":     { "thickness": [0.12, 0.11], "length": [280, 281] },
 *   "dimensionMins":  { "thickness": 0.10, "length": 270 },
 *   "defects":        { "def-id-1": 2, "def-id-2": 0 },
 *   "profileId":      "optional-profile-cuid",   // optional
 *   "totalCarton":    1200,                        // optional
 *   "gloveWeight":    5.2,                         // optional
 *
 *   // Identity — shape depends on how the submitter logged in.
 *   // PIN login:
 *   "loginMethod":    "PIN",
 *   "pinUserId":      "pin-user-cuid",
 *   // ...or M365/SSO login:
 *   "loginMethod":       "M365",
 *   "aadObjectId":       "azure-ad-object-id",
 *   "userPrincipalName": "operator@factory.com",
 *   "displayName":       "Amir Hassan"            // optional
 * }
 *
 * Response 201 (JSON):
 * {
 *   "submission": { ..., "inspectorName": "Ahmad Razak" },
 *   "verdict": "PASSED" | "FAILED",
 *   "categoryResults": [ ... ]
 * }
 */
router.post('/', requireRole(...ALL_ROLES), async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;

    // ── 1. Validate required string fields ─────────────────────────────────────
    const missingFields: string[] = [];

    for (const field of REQUIRED_STRING_FIELDS) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        missingFields.push(field);
      }
    }

    if (body['sampleSize'] === undefined || body['sampleSize'] === null) {
      missingFields.push('sampleSize');
    }
    if (body['dimensions'] === undefined || body['dimensions'] === null) {
      missingFields.push('dimensions');
    }
    if (body['dimensionMins'] === undefined || body['dimensionMins'] === null) {
      missingFields.push('dimensionMins');
    }
    if (
      body['defects'] === undefined ||
      body['defects'] === null ||
      typeof body['defects'] !== 'object' ||
      Array.isArray(body['defects'])
    ) {
      missingFields.push('defects (must be a key:count object)');
    }

    // Identity is validated separately because which fields are required
    // depends on how the submitter logged in. Rejecting here is deliberate:
    // a submission with no resolvable identity would be permanently
    // unattributable, which is worse than refusing to record it.
    const identityResult = resolveIdentity(body);
    if (!identityResult.ok) {
      missingFields.push(...identityResult.missingFields);
    }

    if (missingFields.length > 0) {
      res.status(400).json({ error: 'Missing or malformed required fields', missingFields });
      return;
    }
    const identity = identityResult.ok ? identityResult.identity : null;

    const sampleSize = Number(body['sampleSize']);
    if (!Number.isFinite(sampleSize) || sampleSize < 2) {
      res.status(400).json({ error: 'sampleSize must be a number ≥ 2' });
      return;
    }

    const defectCounts = body['defects'] as Record<string, number>;
    const requestedProfileId = (body['profileId'] as string | undefined | null) || null;

    // ── 2. Resolve profile + evaluate verdict via the single source of truth ───
    let verdict: 'PASSED' | 'FAILED';
    let categoryResults;
    let categoryAnalysis;
    let evaluationProfileName: string | null;
    let evaluationProfileId: string | null;
    let requestedProfileIdEcho: string | null;
    // Frozen Glove Weight compliance — see schema.prisma's gloveWeightSnapshot doc.
    // null when no gloveWeight was supplied (result.dimensionResults then has no
    // FIXED_DIM_WEIGHT entry at all — evaluateWeight() only runs when size + gloveWeight
    // are both present, resolveVerdict.ts).
    let gloveWeightSnapshot: string | null;

    try {
      const result = await resolveVerdict({
        profileId: requestedProfileId,
        productCode: String(body['productCode']),
        sampleSize,
        defectCounts,
        size: String(body['size']),
        dimensionMeasurements: body['dimensions'] as Record<string, string[]>,
        gloveWeight: body['gloveWeight'] != null ? Number(body['gloveWeight']) : undefined,
      });
      verdict = result.verdict;
      categoryResults = result.categoryResults;
      categoryAnalysis = result.categoryAnalysis;
      evaluationProfileName = result.evaluationProfileName;
      evaluationProfileId = result.evaluationProfileId;
      requestedProfileIdEcho = result.requestedProfileId;
      const weightResult = result.dimensionResults.find((d) => d.id === FIXED_DIM_WEIGHT) ?? null;
      gloveWeightSnapshot = weightResult ? JSON.stringify(weightResult) : null;
    } catch (err) {
      if (err instanceof VerdictProfileNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof VerdictNoUsableProfileError) {
        res.status(500).json({ error: err.message, code: 'NO_USABLE_PROFILE' });
        return;
      }
      if (err instanceof VerdictNoUsableDimensionConfigError) {
        res.status(500).json({ error: err.message, code: 'NO_USABLE_DIMENSION_CONFIG' });
        return;
      }
      throw err;
    }

    console.log(
      `[POST /api/submissions] profile=${evaluationProfileId ?? 'none'} ` +
      `sampleSize=${sampleSize} verdict=${verdict} ` +
      `cats=${categoryResults.length} ` +
      `defects=${JSON.stringify(defectCounts)}`,
    );

    // ── 3. Resolve validDbProfileId — sanity-check against AppConfig JSON ────────
    // No FK to violate anymore (§9.3 Option B / §10 Part 3) — this is a
    // same-request sanity check, not referential integrity enforcement.
    // Uses requestedProfileId (the id actually asked for), not evaluationProfileId
    // (which may point at a safety-net substitute used only for grading).
    let validDbProfileId: string | null = null;
    if (requestedProfileIdEcho) {
      if (await isKnownProfileId(requestedProfileIdEcho)) {
        validDbProfileId = requestedProfileIdEcho;
      } else {
        console.warn(`[POST /api/submissions] profileId '${requestedProfileIdEcho}' not found in AppConfig.inspectionProfiles — storing null.`);
      }
    }

    // ── 4. Lot number uniqueness — the operator records the ERP's lot number,
    //    this app never invents one, so a collision means either the same
    //    physical lot was recorded twice or the Line/Side/Date/Sequence
    //    inputs that composed it were wrong. Pre-check for a friendly error;
    //    the DB's own @unique constraint (schema.prisma) is the atomic
    //    backstop against a race between this check and the insert below.
    const batchNumber = String(body['batchNumber']);
    const existing = await prisma.submission.findFirst({ where: { batchNumber } });
    if (existing) {
      res.status(409).json({ error: 'This lot number already exists.', batchNumber });
      return;
    }

    // ── 5. Insert into Database ───────────────────────────────────────────────
    let newSubmission;
    try {
      newSubmission = await prisma.submission.create({
        data: {
          productCode:         String(body['productCode']),
          productionDate:      String(body['productionDate']),
          samplingTime:        String(body['samplingTime']),
          submissionTimestamp: new Date().toISOString(),
          machineId:           String(body['machineId']),
          shift:               String(body['shift']),
          batchNumber,
          size:                String(body['size']),
          sampleSize,
          dimensions:          JSON.stringify(body['dimensions']),
          dimensionMins:       JSON.stringify(body['dimensionMins']),
          defects:             JSON.stringify(defectCounts),
          verdict,
          // Exactly one identity side is populated — see lib/identity.ts.
          pinUserId:           identity?.pinUserId ?? null,
          aadObjectId:         identity?.aadObjectId ?? null,
          userPrincipalName:   identity?.userPrincipalName ?? null,
          displayName:         identity?.displayName ?? null,
          amendmentStatus:     'UNMODIFIED',
          totalCarton:  body['totalCarton'] != null ? Number(body['totalCarton']) : null,
          gloveWeight:  body['gloveWeight']  != null ? Number(body['gloveWeight'])  : null,
          profileId:    validDbProfileId,
          gradingSnapshot:            JSON.stringify(categoryAnalysis),
          gradingSnapshotProfileName: evaluationProfileName,
          gloveWeightSnapshot,
        },
        include: SUBMISSION_IDENTITY_INCLUDE,
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err, 'batchNumber')) {
        res.status(409).json({ error: 'This lot number already exists.', batchNumber });
        return;
      }
      throw err;
    }

    res.status(201).json({ submission: withSubmissionNames(newSubmission), verdict, categoryResults });

  } catch (err) {
    console.error('[POST /api/submissions]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/submissions  (paginated list, most recent first)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const AMENDMENTS_PENDING_PAGE_SIZE = 30;

/**
 * Returns a page of submissions ordered by creation date descending.
 *
 * Query params (all optional, defensively parsed — an invalid/missing value
 * falls back to its default or is simply ignored, so a caller with no params
 * at all keeps behaving exactly as this endpoint always has: page 1, 50 rows,
 * no filtering):
 *   page   — 1-based page number. Default 1.
 *   limit  — rows per page. Default 50, clamped to a max of 200 (a per-page
 *            size guard, not a reintroduction of the old hard ceiling — every
 *            row remains reachable via `page`).
 *   search — case-insensitive substring match against `batchNumber` OR
 *            `productCode` (SQLite's LIKE is case-insensitive for ASCII by
 *            default). Mirrors the search box previously implemented
 *            client-side in HistoryFeed.tsx — moved server-side so it (and
 *            CSV export, which reuses this same endpoint) aren't limited to
 *            whatever page happens to be loaded in memory.
 *   dateFrom / dateTo — yyyy-mm-dd. Filters on `productionDate` (the
 *            operator-editable, rollover-adjusted "effective production
 *            date" — see ISO2859_MATH_ENGINE.md §4), inclusive of the full
 *            day at each end.
 *   verdict — 'PASSED' | 'FAILED'. Any other value is ignored.
 *   amendmentStatus — one of AMENDMENT_STATUSES. Any other value is ignored.
 *   lineId — exact match against `machineId` (the real column
 *            `WizardPage.tsx` writes the operator's chosen Production Line
 *            into — same column `sequence-hint` already filters on).
 *   inspector — case-insensitive substring match against the submitter's
 *            display name — `pinUser.name`, `displayName`, or
 *            `userPrincipalName`, the same three fields in the same
 *            fallback order `lib/identity.ts`'s `displayNameOf()` uses for
 *            the `inspectorName` this endpoint already returns.
 *   side — single-character match. NOT a stored column — `side` only exists
 *            embedded inside `batchNumber` ([Line][Side][YJJJ][Sequence],
 *            ISO2859_MATH_ENGINE.md §4). Derived the same way
 *            `WizardPage.tsx`'s amendment-reopen logic already does:
 *            `batchNumber.slice(machineId.length, machineId.length + 1)`,
 *            since `machineId` is a real column holding the exact Line
 *            prefix. Because Prisma can't express a per-row-length
 *            substring in a `where`, this filter is applied AFTER fetching
 *            every row matching the other filters (still server-side, just
 *            not a native SQL predicate) — see the branch below.
 *
 * `id` is folded in as a secondary sort key alongside `createdAt` because
 * SQLite's DateTime has finite resolution — two rows created in the same
 * instant would otherwise tie nondeterministically across page boundaries.
 *
 * The same `where` is applied to both `findMany` and `count()` below, so
 * `totalCount`/`hasMore` reflect the filtered set — Load More paginates
 * correctly under an active filter instead of counting against the whole table.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const parsedPage = Number(req.query['page']);
    const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

    const parsedLimit = Number(req.query['limit']);
    const limit = Number.isInteger(parsedLimit) && parsedLimit >= 1
      ? Math.min(parsedLimit, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

    const skip = (page - 1) * limit;

    const where: Prisma.SubmissionWhereInput = {};
    // Independent OR-blocks (search, inspector) can't both live on `where.OR`
    // directly — the second would silently clobber the first. Collected here
    // and merged into `where.AND` below instead.
    const andConditions: Prisma.SubmissionWhereInput[] = [];

    const search = typeof req.query['search'] === 'string' ? req.query['search'].trim() : '';
    if (search) {
      andConditions.push({
        OR: [
          { batchNumber: { contains: search } },
          { productCode: { contains: search } },
        ],
      });
    }

    const dateFrom = typeof req.query['dateFrom'] === 'string' ? req.query['dateFrom'] : '';
    const dateTo = typeof req.query['dateTo'] === 'string' ? req.query['dateTo'] : '';
    if (dateFrom || dateTo) {
      where.productionDate = {
        ...(dateFrom && { gte: `${dateFrom}T00:00:00.000Z` }),
        ...(dateTo && { lte: `${dateTo}T23:59:59.999Z` }),
      };
    }

    const verdictParam = req.query['verdict'];
    if (verdictParam === 'PASSED' || verdictParam === 'FAILED') {
      where.verdict = verdictParam;
    }

    const amendmentStatusParam = req.query['amendmentStatus'];
    if (typeof amendmentStatusParam === 'string' && (AMENDMENT_STATUSES as readonly string[]).includes(amendmentStatusParam)) {
      where.amendmentStatus = amendmentStatusParam;
    }

    const lineId = typeof req.query['lineId'] === 'string' ? req.query['lineId'].trim() : '';
    if (lineId) {
      where.machineId = lineId;
    }

    const inspector = typeof req.query['inspector'] === 'string' ? req.query['inspector'].trim() : '';
    if (inspector) {
      // Mirrors lib/identity.ts's displayNameOf() fallback chain exactly
      // (pinUser.name → displayName → userPrincipalName) — otherwise a row
      // whose only identity string is userPrincipalName (displayName null,
      // no pinUser — e.g. legacy/sample SSO rows) would be invisible to this
      // filter despite the table showing that same value as its Inspector.
      andConditions.push({
        OR: [
          { pinUser: { name: { contains: inspector } } },
          { displayName: { contains: inspector } },
          { userPrincipalName: { contains: inspector } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    // `side` isn't a stored column (see the doc comment above) — Prisma can't
    // express a per-row-length substring in a `where`, so when it's active
    // this fetches every row matching the OTHER filters (unbounded), derives
    // Side in JS, filters, then paginates the filtered set manually. When
    // `side` is absent, the normal DB-level skip/take path below is
    // untouched — no behavior change, no performance cost for the common case.
    const sideParam = typeof req.query['side'] === 'string' ? req.query['side'].trim() : '';

    let submissions;
    let totalCount;

    if (sideParam) {
      const candidates = await prisma.submission.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          ...SUBMISSION_IDENTITY_INCLUDE,
          amendmentLogs: { include: AMENDMENT_LOG_IDENTITY_INCLUDE },
        },
      });
      const filtered = candidates.filter((sub) => {
        const linePrefix = sub.machineId ?? '';
        const derivedSide = sub.batchNumber.slice(linePrefix.length, linePrefix.length + 1);
        return derivedSide === sideParam;
      });
      totalCount = filtered.length;
      submissions = filtered.slice(skip, skip + limit);
    } else {
      [submissions, totalCount] = await Promise.all([
        prisma.submission.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
          include: {
            ...SUBMISSION_IDENTITY_INCLUDE,
            amendmentLogs: { include: AMENDMENT_LOG_IDENTITY_INCLUDE },
          },
        }),
        prisma.submission.count({ where }),
      ]);
    }

    const hasMore = skip + submissions.length < totalCount;

    res.status(200).json({
      submissions: submissions.map(withSubmissionNames),
      count: submissions.length,
      page,
      limit,
      totalCount,
      hasMore,
    });
  } catch (err) {
    console.error('[GET /api/submissions]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/submissions/sequence-hint  (non-binding advisory)
// Registered BEFORE /:id — Express matches routes in order, and /:id would
// otherwise swallow this path, treating "sequence-hint" as an id.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns two non-binding-to-compute advisories for a given Line+Side+YJJJ
 * group, both derived from the same batchNumber-prefix match (kept in one
 * endpoint/query so the two suggestions can never drift apart):
 *
 *  - suggestedNext: max existing Sequence No + 1, per ISO2859_MATH_ENGINE.md
 *    §4. Sequence has no auto-default and is never auto-incremented by this
 *    app, since it must reflect true production order, not submission
 *    order — the caller only ever displays this as a hint, never pre-fills.
 *  - suggestedTotalCarton: Total Carton from the most recent prior
 *    submission (by createdAt) in the same group — since one production
 *    line only ever runs one product at a time, Line+YJJJ+Side alone
 *    identifies "the lot this line is currently running", and Total
 *    Carton is typically constant across a lot's submissions (varying only
 *    at the tail end). The caller DOES pre-fill the field with this value
 *    (still fully editable), unlike suggestedNext.
 *
 * The caller composes `${lineId}${side}${yjjj}` as the batchNumber prefix;
 * the trailing 3 characters of each matching batchNumber are parsed as the
 * sequence. Query params: lineId, side, yjjj (all required — missing any
 * returns nulls rather than an error, since both fields are advisory).
 */
router.get('/sequence-hint', async (req: Request, res: Response) => {
  try {
    const lineId = String(req.query['lineId'] ?? '');
    const side = String(req.query['side'] ?? '');
    const yjjj = String(req.query['yjjj'] ?? '');

    if (!lineId || !side || !yjjj) {
      res.status(200).json({ suggestedNext: null, suggestedTotalCarton: null });
      return;
    }

    const prefix = `${lineId}${side}${yjjj}`;
    const matches = await prisma.submission.findMany({
      where: { machineId: lineId, batchNumber: { startsWith: prefix } },
      select: { batchNumber: true, totalCarton: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    let maxSeq: number | null = null;
    for (const { batchNumber } of matches) {
      const seqStr = batchNumber.slice(-3);
      const seq = Number(seqStr);
      if (Number.isInteger(seq) && (maxSeq === null || seq > maxSeq)) {
        maxSeq = seq;
      }
    }

    // `matches` is ordered createdAt desc, so the first entry is the most
    // recent prior submission in this Line+Side+YJJJ group.
    const suggestedTotalCarton = matches[0]?.totalCarton ?? null;

    res.status(200).json({
      suggestedNext: maxSeq === null ? null : maxSeq + 1,
      suggestedTotalCarton,
    });
  } catch (err) {
    console.error('[GET /api/submissions/sequence-hint]', err);
    res.status(200).json({ suggestedNext: null, suggestedTotalCarton: null });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/submissions/new-indicator + POST /api/submissions/mark-history-viewed
// Registered BEFORE /:id for the same reason as /sequence-hint above.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `effectiveLastViewedAt` = max(AppConfig.lastHistoryViewedAt, start of
 * today) — folding "a new calendar day clears the indicator" into this one
 * comparison, with no cron/scheduled job: once midnight passes, today's
 * start alone exceeds any lastViewedAt timestamp from yesterday.
 */
async function computeEffectiveLastViewedAt(): Promise<Date> {
  const config = await prisma.appConfig.findUnique({ where: { id: '1' }, select: { lastHistoryViewedAt: true } });
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const lastViewed = config?.lastHistoryViewedAt ?? new Date(0);
  return lastViewed > todayStart ? lastViewed : todayStart;
}

/**
 * Global (not per-user) advisory: has any Submission been created since the
 * effective last-viewed threshold? `createdAt` never changes on amendment/
 * approval (only `updatedAt` does), so this naturally counts only genuinely
 * new original submissions, never amendment activity on existing rows.
 */
router.get('/new-indicator', async (_req: Request, res: Response) => {
  try {
    const effectiveLastViewedAt = await computeEffectiveLastViewedAt();
    const newCount = await prisma.submission.count({
      where: { createdAt: { gt: effectiveLastViewedAt } },
    });
    res.status(200).json({ hasNew: newCount > 0, effectiveLastViewedAt: effectiveLastViewedAt.toISOString() });
  } catch (err) {
    console.error('[GET /api/submissions/new-indicator]', err);
    res.status(200).json({ hasNew: false, effectiveLastViewedAt: new Date().toISOString() });
  }
});

/** Any recognized role may mark History as viewed — matches the same ALL_ROLES gate already used on POST / and POST /:id/amendments, so PIN-authenticated Group C users work too. */
router.post('/mark-history-viewed', requireRole(...ALL_ROLES), async (_req: Request, res: Response) => {
  try {
    // upsert, not update — the AppConfig singleton is normally created by
    // GET /api/config on app load, but this stays correct even if this
    // somehow fires first (e.g. a fresh DB with an unusual load order).
    await prisma.appConfig.upsert({
      where: { id: '1' },
      update: { lastHistoryViewedAt: new Date() },
      create: { id: '1', lastHistoryViewedAt: new Date() },
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[POST /api/submissions/mark-history-viewed]', err);
    res.status(500).json({ error: 'Failed to mark history as viewed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/submissions/:id  (single record with full relations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a single submission with its amendment logs and linked profile details.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const submissionId = String(req.params['id']);
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        ...SUBMISSION_IDENTITY_INCLUDE,
        amendmentLogs: {
          orderBy: { createdAt: 'asc' },
          include: AMENDMENT_LOG_IDENTITY_INCLUDE,
        },
      },
    });

    if (!submission) {
      res.status(404).json({ error: `Submission '${submissionId}' not found.` });
      return;
    }

    res.status(200).json({ submission: withSubmissionNames(submission) });
  } catch (err) {
    console.error('[GET /api/submissions/:id]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions/:id/amendments  (draft an amendment request)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an AmendmentLog record and sets the Submission status to PENDING_APPROVAL.
 *
 * Rejects with 409 if this Submission already has MAX_APPROVED_AMENDMENTS
 * (3) APPROVED amendments in its lifetime — rejected/still-pending drafts
 * don't count. Mirrors HistoryFeed.tsx's client-side AMEND RECORD button
 * disable at the same threshold.
 *
 * Also computes an informational, non-blocking preview of what the server
 * would recompute the verdict as (via resolveVerdict()), so a supervisor
 * reviewing the queue later isn't surprised at approval time. If the
 * amendment's profile can't be resolved, the draft still succeeds —
 * recomputedVerdict/recomputedCategoryResults are simply left null.
 *
 * Request body (JSON):
 * {
 *   "reason": "Data entry error in defect count",
 *   "newValues": {
 *     "productCode": "...",
 *     // ... full submission payload
 *   },
 *   // Requester identity, same shape as POST /api/submissions:
 *   "loginMethod": "PIN" | "M365",
 *   "pinUserId": "..."   // PIN, or aadObjectId/userPrincipalName/displayName for M365
 * }
 */
router.post('/:id/amendments', requireRole(...ALL_ROLES), async (req: Request, res: Response) => {
  try {
    const submissionId = String(req.params['id']);
    const body = req.body as { reason?: string; newValues?: Record<string, unknown> };

    if (!body.reason || !body.reason.trim()) {
      res.status(400).json({ error: 'Amendment reason is required' });
      return;
    }

    if (!body.newValues || typeof body.newValues !== 'object') {
      res.status(400).json({ error: 'newValues payload is required' });
      return;
    }

    // Who is asking for this change — an amendment with no attributable
    // requester defeats the point of the audit trail it creates.
    const identityResult = resolveIdentity(req.body as Record<string, unknown>);
    if (!identityResult.ok) {
      res.status(400).json({
        error: 'Missing or malformed required fields',
        missingFields: identityResult.missingFields,
      });
      return;
    }
    const requester = identityResult.identity;

    // 1. Fetch the original submission
    const originalSubmission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!originalSubmission) {
      res.status(404).json({ error: `Submission '${submissionId}' not found.` });
      return;
    }

    // 1b. Hard-block: max 3 APPROVED amendments per Submission, lifetime.
    // Defense-in-depth — HistoryFeed.tsx already disables the AMEND RECORD
    // button client-side at this same threshold, but stale page state or a
    // direct API call must still be rejected server-side.
    const approvedAmendmentCount = await prisma.amendmentLog.count({
      where: { submissionId, status: 'APPROVED' },
    });
    if (approvedAmendmentCount >= MAX_APPROVED_AMENDMENTS) {
      res.status(409).json({
        error: `Maximum amendments reached (${approvedAmendmentCount}/${MAX_APPROVED_AMENDMENTS}). This submission cannot be amended further.`,
        approvedAmendmentCount,
        maxApprovedAmendments: MAX_APPROVED_AMENDMENTS,
      });
      return;
    }

    // 2. Informational recompute preview — never blocks the draft itself.
    const newValues = body.newValues;
    let recomputedVerdict: string | null = null;
    let recomputedCategoryResults: string | null = null;
    let recomputedFailedDimensions: number | null = null;
    let recomputedDimensionResults: string | null = null;

    try {
      const preview = await resolveVerdict({
        profileId: (newValues['profileId'] as string | undefined) ?? originalSubmission.profileId,
        productCode: String(newValues['productCode'] ?? originalSubmission.productCode),
        sampleSize: Number(newValues['sampleSize'] ?? originalSubmission.sampleSize),
        defectCounts: parseJSONObjectField<number>(newValues['defects'] ?? originalSubmission.defects),
        size: String(newValues['size'] ?? originalSubmission.size),
        dimensionMeasurements: parseJSONObjectField<string[]>(newValues['dimensions'] ?? originalSubmission.dimensions),
        gloveWeight: (() => {
          const v = newValues['gloveWeight'] ?? originalSubmission.gloveWeight;
          return v != null ? Number(v) : undefined;
        })(),
      });
      recomputedVerdict = preview.verdict;
      recomputedCategoryResults = JSON.stringify(preview.categoryResults);
      recomputedFailedDimensions = preview.failedDimensions;
      recomputedDimensionResults = JSON.stringify(preview.dimensionResults);
    } catch (err) {
      if (err instanceof VerdictProfileNotFoundError) {
        console.warn(
          `[POST /api/submissions/:id/amendments] Recompute preview unavailable for submission ` +
          `'${submissionId}': ${err.message}`,
        );
        // recomputedVerdict/recomputedCategoryResults stay null — draft still proceeds.
      } else if (err instanceof VerdictNoUsableProfileError) {
        console.error(
          `[POST /api/submissions/:id/amendments] Recompute preview unavailable for submission ` +
          `'${submissionId}' — system-wide config problem: ${err.message}`,
        );
        // recomputedVerdict/recomputedCategoryResults stay null — draft still proceeds.
      } else if (err instanceof VerdictNoUsableDimensionConfigError) {
        console.error(
          `[POST /api/submissions/:id/amendments] Recompute preview unavailable for submission ` +
          `'${submissionId}' — dimension config problem: ${err.message}`,
        );
        // recomputedVerdict/recomputedCategoryResults stay null — draft still proceeds.
      } else {
        throw err;
      }
    }

    // 3. Perform transaction: update status and insert log
    const transaction = await prisma.$transaction([
      prisma.submission.update({
        where: { id: submissionId },
        data: { amendmentStatus: 'PENDING_APPROVAL' },
      }),
      prisma.amendmentLog.create({
        data: {
          submissionId,
          originalValues: JSON.stringify(originalSubmission),
          newValues: JSON.stringify(body.newValues),
          requestedByPinUserId:   requester.pinUserId,
          requestedBy:            requester.userPrincipalName,
          requestedByDisplayName: requester.displayName,
          requestedAt: new Date().toISOString(),
          supervisorNote: body.reason.trim(),
          status: 'PENDING_APPROVAL',
          recomputedVerdict,
          recomputedCategoryResults,
          recomputedFailedDimensions,
          recomputedDimensionResults,
        },
        include: AMENDMENT_LOG_IDENTITY_INCLUDE,
      }),
    ]);

    res.status(201).json({
      message: 'Amendment submitted successfully for approval.',
      submission: transaction[0],
      amendmentLog: withAmendmentLogNames(transaction[1]),
      recomputedVerdict,
    });
  } catch (err) {
    console.error('[POST /api/submissions/:id/amendments]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// AMENDMENTS ROUTER  (API_AND_INTEGRATION_SPEC.md §1 — Amendments & Approvals)
// Mounted at /api/amendments in server.ts
// ─────────────────────────────────────────────────────────────────────────────

export const amendmentsRouter = Router();

// ── GET /api/amendments/pending ────────────────────────────────────────────
// Returns submissions where amendmentStatus === 'PENDING_APPROVAL', including
// the most recent AmendmentLog for each (for the diff viewer). Paginated —
// same shape as GET /api/submissions (AUDIT_REPORT.md: this endpoint was
// previously unbounded, same bug class already fixed there).
amendmentsRouter.get('/pending', async (req: Request, res: Response) => {
  try {
    const parsedPage = Number(req.query['page']);
    const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

    const parsedLimit = Number(req.query['limit']);
    const limit = Number.isInteger(parsedLimit) && parsedLimit >= 1
      ? Math.min(parsedLimit, MAX_PAGE_SIZE)
      : AMENDMENTS_PENDING_PAGE_SIZE;

    const skip = (page - 1) * limit;
    const where: Prisma.SubmissionWhereInput = { amendmentStatus: 'PENDING_APPROVAL' };

    const [pending, totalCount] = await Promise.all([
      prisma.submission.findMany({
        where,
        // `id` added as a secondary sort key alongside `updatedAt` — same
        // rationale as the submissions list above: SQLite's DateTime has
        // finite resolution, so two rows updated in the same instant would
        // otherwise tie nondeterministically across page boundaries.
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: {
          ...SUBMISSION_IDENTITY_INCLUDE,
          amendmentLogs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: AMENDMENT_LOG_IDENTITY_INCLUDE,
          },
        },
      }),
      prisma.submission.count({ where }),
    ]);

    const hasMore = skip + pending.length < totalCount;

    res.json({
      amendments: pending.map(withSubmissionNames),
      count: pending.length,
      page,
      limit,
      totalCount,
      hasMore,
    });
  } catch (err) {
    console.error('[GET /api/amendments/pending]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ── POST /api/amendments/:id/approve ──────────────────────────────────────
// Recomputes the verdict server-side via resolveVerdict() and persists that
// recomputed value — the client-supplied newValues.verdict is NEVER trusted
// for persistence. Both values are stored on the AmendmentLog for audit.
// If the amendment's profile can't be resolved, approval hard-fails: this is
// the one place a verdict is permanently written, so we never guess here.
// The reviewer's identity comes from the request body (see lib/identity.ts).
amendmentsRouter.post('/:id/approve', requireRole('MANAGER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const submissionId = String(req.params['id']);

    // Who is approving — this is the accountability record for a permanent
    // change to a verdict, so it must name a real reviewer.
    const identityResult = resolveIdentity(req.body as Record<string, unknown>);
    if (!identityResult.ok) {
      res.status(400).json({
        error: 'Missing or malformed required fields',
        missingFields: identityResult.missingFields,
      });
      return;
    }
    const reviewer = identityResult.identity;

    // 1. Find the latest pending AmendmentLog for this submission
    const amendmentLog = await prisma.amendmentLog.findFirst({
      where: { submissionId, status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'desc' },
    });

    if (!amendmentLog) {
      res.status(404).json({ error: `No pending amendment found for submission '${submissionId}'.` });
      return;
    }

    // 2. Parse the proposed newValues
    let newValues: Record<string, unknown>;
    try {
      newValues = JSON.parse(amendmentLog.newValues) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: 'AmendmentLog newValues is not valid JSON.' });
      return;
    }

    // 3. Fetch the current submission — provides fallback values for any
    //    field the amendment doesn't touch (an amendment may only change a subset).
    const existingSubmission = await prisma.submission.findUnique({ where: { id: submissionId } });
    if (!existingSubmission) {
      res.status(404).json({ error: `Submission '${submissionId}' not found.` });
      return;
    }

    // 4. Recompute the verdict server-side — the authoritative check.
    let recomputed;
    try {
      recomputed = await resolveVerdict({
        profileId: (newValues['profileId'] as string | undefined) ?? existingSubmission.profileId,
        productCode: String(newValues['productCode'] ?? existingSubmission.productCode),
        sampleSize: Number(newValues['sampleSize'] ?? existingSubmission.sampleSize),
        defectCounts: parseJSONObjectField<number>(newValues['defects'] ?? existingSubmission.defects),
        size: String(newValues['size'] ?? existingSubmission.size),
        dimensionMeasurements: parseJSONObjectField<string[]>(newValues['dimensions'] ?? existingSubmission.dimensions),
        gloveWeight: (() => {
          const v = newValues['gloveWeight'] ?? existingSubmission.gloveWeight;
          return v != null ? Number(v) : undefined;
        })(),
      });
    } catch (err) {
      if (err instanceof VerdictProfileNotFoundError) {
        res.status(422).json({
          error: 'Cannot verify this amendment — its inspection profile could not be resolved. ' +
                 'Nothing was changed; resolve the profile reference before approving.',
          details: err.message,
        });
        return;
      }
      if (err instanceof VerdictNoUsableProfileError) {
        res.status(422).json({
          error: 'Cannot verify this amendment — no AppConfig profile has usable AQL rules configured. ' +
                 'Nothing was changed; fix the inspection profile configuration before approving.',
          details: err.message,
        });
        return;
      }
      if (err instanceof VerdictNoUsableDimensionConfigError) {
        res.status(422).json({
          error: 'Cannot verify this amendment — no usable dimension spec is configured for this ' +
                 'product/size. Nothing was changed; fix the Product Engine configuration before approving.',
          details: err.message,
        });
        return;
      }
      throw err;
    }

    const clientSuppliedVerdict = newValues['verdict'] != null ? String(newValues['verdict']) : null;
    const now = new Date().toISOString();

    // 4b. Resolve a sanity-checked profileId — no FK to violate anymore
    //     (§9.3 Option B / §10 Part 3: the relational InspectionProfile table
    //     was removed, it sat at 0 rows always). Checked against
    //     AppConfig.inspectionProfiles JSON instead, mirroring the same
    //     isKnownProfileId() sanity check POST /api/submissions already applies.
    let validDbProfileId: string | null = null;
    if (newValues['profileId'] != null) {
      const requestedId = String(newValues['profileId']);
      if (await isKnownProfileId(requestedId)) {
        validDbProfileId = requestedId;
      } else {
        console.warn(`[POST /api/amendments/:id/approve] profileId '${requestedId}' not found in AppConfig.inspectionProfiles — storing null.`);
      }
    }

    // 5. Lot number uniqueness — same invariant as POST /api/submissions.
    //    Only relevant if this amendment actually changes batchNumber to a
    //    value different from the submission's own current one.
    const amendedBatchNumber = newValues['batchNumber'] != null ? String(newValues['batchNumber']) : null;
    if (amendedBatchNumber !== null && amendedBatchNumber !== existingSubmission.batchNumber) {
      const collision = await prisma.submission.findFirst({
        where: { batchNumber: amendedBatchNumber, id: { not: submissionId } },
      });
      if (collision) {
        res.status(409).json({ error: 'This lot number already exists.', batchNumber: amendedBatchNumber });
        return;
      }
    }

    // 6. Transaction: apply newValues to the Submission + mark both as APPROVED.
    //    verdict is ALWAYS the server-recomputed value — newValues.verdict is
    //    never written to the Submission, only kept for audit comparison below.
    let updatedSubmission, updatedLog;
    try {
      [updatedSubmission, updatedLog] = await prisma.$transaction([
      prisma.submission.update({
        where: { id: submissionId },
        data: {
          amendmentStatus: 'APPROVED',
          // Apply all proposed field changes from newValues
          ...(newValues['productCode']         != null && { productCode:         String(newValues['productCode']) }),
          ...(newValues['productionDate']       != null && { productionDate:      String(newValues['productionDate']) }),
          ...(newValues['samplingTime']         != null && { samplingTime:        String(newValues['samplingTime']) }),
          ...(newValues['machineId']            != null && { machineId:           String(newValues['machineId']) }),
          ...(newValues['shift']                != null && { shift:               String(newValues['shift']) }),
          ...(newValues['batchNumber']          != null && { batchNumber:         String(newValues['batchNumber']) }),
          ...(newValues['size']                 != null && { size:                String(newValues['size']) }),
          ...(newValues['sampleSize']           != null && { sampleSize:          Number(newValues['sampleSize']) }),
          ...(newValues['dimensions']           != null && { dimensions:          typeof newValues['dimensions'] === 'string' ? newValues['dimensions'] : JSON.stringify(newValues['dimensions']) }),
          ...(newValues['dimensionMins']        != null && { dimensionMins:       typeof newValues['dimensionMins'] === 'string' ? newValues['dimensionMins'] : JSON.stringify(newValues['dimensionMins']) }),
          ...(newValues['defects']              != null && { defects:             typeof newValues['defects'] === 'string' ? newValues['defects'] : JSON.stringify(newValues['defects']) }),
          verdict:                             recomputed.verdict,
          ...(newValues['totalCarton']          != null && { totalCarton:         Number(newValues['totalCarton']) }),
          ...(newValues['gloveWeight']          != null && { gloveWeight:         parseFloat(String(newValues['gloveWeight'])) }),
          ...(newValues['profileId']            != null && { profileId:           validDbProfileId }),
          // Refreeze the grading snapshot alongside verdict — must always be
          // written together so they can never drift apart (AUDIT_REPORT.md #18).
          gradingSnapshot:            JSON.stringify(recomputed.categoryAnalysis),
          gradingSnapshotProfileName: recomputed.evaluationProfileName,
          // Refreeze Glove Weight compliance in the same transaction, same rationale.
          gloveWeightSnapshot: (() => {
            const w = recomputed.dimensionResults.find((d) => d.id === FIXED_DIM_WEIGHT);
            return w ? JSON.stringify(w) : null;
          })(),
        },
        include: SUBMISSION_IDENTITY_INCLUDE,
      }),
      prisma.amendmentLog.update({
        where: { id: amendmentLog.id },
        data: {
          status:     'APPROVED',
          reviewedByPinUserId:   reviewer.pinUserId,
          reviewedBy:            reviewer.userPrincipalName,
          reviewedByDisplayName: reviewer.displayName,
          reviewedAt: now,
          recomputedVerdict:          recomputed.verdict,
          recomputedCategoryResults:  JSON.stringify(recomputed.categoryResults),
          recomputedFailedDimensions: recomputed.failedDimensions,
          recomputedDimensionResults: JSON.stringify(recomputed.dimensionResults),
        },
        include: AMENDMENT_LOG_IDENTITY_INCLUDE,
      }),
      ]);
    } catch (err) {
      if (isUniqueConstraintViolation(err, 'batchNumber')) {
        res.status(409).json({ error: 'This lot number already exists.', batchNumber: amendedBatchNumber });
        return;
      }
      throw err;
    }

    if (clientSuppliedVerdict != null && clientSuppliedVerdict !== recomputed.verdict) {
      console.warn(
        `[POST /api/amendments/:id/approve] Verdict mismatch on submission '${submissionId}': ` +
        `client-supplied='${clientSuppliedVerdict}' server-recomputed='${recomputed.verdict}'. ` +
        `Persisted the server-recomputed value; both are stored on AmendmentLog '${amendmentLog.id}' for audit.`,
      );
    }

    res.json({
      message: 'Amendment approved and merged successfully.',
      submission: withSubmissionNames(updatedSubmission),
      amendmentLog: withAmendmentLogNames(updatedLog),
      verdictRecompute: {
        clientSupplied: clientSuppliedVerdict,
        serverRecomputed: recomputed.verdict,
        mismatch: clientSuppliedVerdict != null && clientSuppliedVerdict !== recomputed.verdict,
      },
    });
  } catch (err) {
    console.error('[POST /api/amendments/:id/approve]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ── POST /api/amendments/:id/reject ───────────────────────────────────────
// Discards the draft amendment. Sets amendmentStatus → 'REJECTED'.
amendmentsRouter.post('/:id/reject', requireRole('MANAGER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const submissionId = String(req.params['id']);
    const body = req.body as { reason?: string };

    // Who is rejecting — same accountability requirement as approval.
    const identityResult = resolveIdentity(req.body as Record<string, unknown>);
    if (!identityResult.ok) {
      res.status(400).json({
        error: 'Missing or malformed required fields',
        missingFields: identityResult.missingFields,
      });
      return;
    }
    const reviewer = identityResult.identity;

    // 1. Find the latest pending AmendmentLog
    const amendmentLog = await prisma.amendmentLog.findFirst({
      where: { submissionId, status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'desc' },
    });

    if (!amendmentLog) {
      res.status(404).json({ error: `No pending amendment found for submission '${submissionId}'.` });
      return;
    }

    const now = new Date().toISOString();

    // 2. Transaction: reject both the log and the submission status
    const [updatedSubmission, updatedLog] = await prisma.$transaction([
      prisma.submission.update({
        where: { id: submissionId },
        data: { amendmentStatus: 'REJECTED' },
        include: SUBMISSION_IDENTITY_INCLUDE,
      }),
      prisma.amendmentLog.update({
        where: { id: amendmentLog.id },
        data: {
          status:        'REJECTED',
          reviewedByPinUserId:   reviewer.pinUserId,
          reviewedBy:            reviewer.userPrincipalName,
          reviewedByDisplayName: reviewer.displayName,
          reviewedAt:    now,
          supervisorNote: body.reason?.trim() ?? amendmentLog.supervisorNote,
        },
        include: AMENDMENT_LOG_IDENTITY_INCLUDE,
      }),
    ]);

    res.json({
      message: 'Amendment rejected.',
      submission: withSubmissionNames(updatedSubmission),
      amendmentLog: withAmendmentLogNames(updatedLog),
    });
  } catch (err) {
    console.error('[POST /api/amendments/:id/reject]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VERDICT ROUTER  (read-only, no persistence)
// Mounted at /api/verdict in server.ts
// ─────────────────────────────────────────────────────────────────────────────

export const verdictRouter = Router();

// ── POST /api/verdict/preview ──────────────────────────────────────────────
// Computes a verdict + category breakdown WITHOUT writing to the database,
// via the same resolveVerdict() used by every persisting route. Used by
// StepReviewSubmit.tsx (wizard review step) and HistoryFeed.tsx (historical
// record display) so both show exactly what the server would compute.
//
// Unlike the persisting routes, an unresolved profileId does not hard-fail
// here — it falls back through the normal safety net (same as "no profileId
// supplied at all"), since this is a read-only, non-authoritative preview.
verdictRouter.post('/preview', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;

    if (body['sampleSize'] == null || !Number.isFinite(Number(body['sampleSize']))) {
      res.status(400).json({ error: 'sampleSize must be a number' });
      return;
    }
    if (
      body['defects'] == null ||
      typeof body['defects'] !== 'object' ||
      Array.isArray(body['defects'])
    ) {
      res.status(400).json({ error: 'defects must be a key:count object' });
      return;
    }

    let result;
    try {
      result = await resolveVerdict({
        profileId: (body['profileId'] as string | null | undefined) ?? null,
        productCode: body['productCode'] as string | undefined,
        sampleSize: Number(body['sampleSize']),
        defectCounts: body['defects'] as Record<string, number>,
        onUnresolvedProfile: 'fallback',
      });
    } catch (err) {
      if (err instanceof VerdictNoUsableProfileError) {
        res.status(500).json({ error: err.message, code: 'NO_USABLE_PROFILE' });
        return;
      }
      throw err;
    }

    res.json(result);
  } catch (err) {
    console.error('[POST /api/verdict/preview]', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
});
