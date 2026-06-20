import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth.middleware';
import {
  draftWriteSchema,
  DRAFT_TTL_MS,
  MAX_DRAFT_DATA_BYTES,
  DraftWriteBody,
} from '../schemas/draft.schemas';

const router = Router();

// Kinds that may be written/read without auth (the public onboard form).
// For all other kinds, the route enforces auth.
const PUBLIC_KINDS = new Set<DraftWriteBody['kind']>(['onboard_application']);

// Per-request auth gate. The router runs this on every request; it allows
// public kinds through unauthenticated and forces auth for everything else.
// Without this gate, the per-handler `requireAuthIfNeeded` check has no
// `req.user` to inspect — `requireAuth` is the only thing that populates it.
router.use((req, res, next) => {
  // For PUT the kind is in the body, so it's already parsed by express.json()
  // before this middleware runs. For GET/DELETE it's in the query string.
  const kind =
    (req.body?.kind as DraftWriteBody['kind'] | undefined) ??
    (req.query?.kind as DraftWriteBody['kind'] | undefined);
  if (kind && PUBLIC_KINDS.has(kind)) return next();
  return requireAuth(req, res, next);
});

// ── helpers ────────────────────────────────────────────────────────
function buildDraftKey(args: {
  kind: DraftWriteBody['kind'];
  contextId: string;
  userId?: string | null;
  orgId?: string | null;
  browserId?: string | null;
}): string {
  const { kind, contextId, userId, orgId, browserId } = args;
  if (PUBLIC_KINDS.has(kind)) {
    // Public: scope by kind + context + browserId. Two browsers on the
    // same token get isolated drafts. The browserId is required for
    // public kinds; the caller must provide it.
    if (!browserId) throw new Error('browserId required for public drafts');
    return `public:${kind}:${contextId}:${browserId}`;
  }
  // Authed: scope by org + user. Multi-org safety.
  if (!userId || !orgId) throw new Error('user/org required for authed drafts');
  return `org:${orgId}:user:${userId}:${kind}:${contextId}`;
}

function getBrowserId(req: Request): string | null {
  const v = req.header('X-Browser-Id');
  return v && v.length > 0 && v.length <= 100 ? v : null;
}

// Body cap middleware: reject PUT bodies over 64 KB before parsing.
// Express's express.json() parses before our handler, so we let zod do
// the deep check, but the route also rejects overly large JSON upfront.
function checkBodySize(req: Request, res: Response, next: NextFunction) {
  const cl = parseInt(req.header('content-length') || '0', 10);
  if (cl > MAX_DRAFT_DATA_BYTES + 1024) {
    res.status(413).json({ error: 'Draft payload too large' });
    return;
  }
  next();
}

// Per-IP rate limit on PUT: 60/minute. In-memory token bucket.
const RATE_LIMIT_BUCKET = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
function rateLimitPut(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const bucket = RATE_LIMIT_BUCKET.get(ip);
  if (!bucket || bucket.resetAt < now) {
    RATE_LIMIT_BUCKET.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Too many draft saves. Please slow down.' });
    return;
  }
  next();
}

// Resolve effective auth context for the request. Public kinds may
// proceed without req.user; authed kinds require it.
function requireAuthIfNeeded(req: Request, kind: DraftWriteBody['kind']): boolean {
  if (PUBLIC_KINDS.has(kind)) return true;
  return Boolean(req.user?.userId && req.user?.orgId);
}

// ── GET /api/drafts?kind=...&contextId=... ─────────────────────────
router.get('/', async (req: Request, res: Response) => {
  const kind = String(req.query.kind || '') as DraftWriteBody['kind'];
  const contextId = String(req.query.contextId || '');
  if (!kind || !contextId) {
    res.status(400).json({ error: 'kind and contextId required' });
    return;
  }
  if (!requireAuthIfNeeded(req, kind)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const browserId = PUBLIC_KINDS.has(kind) ? getBrowserId(req) : null;
  if (PUBLIC_KINDS.has(kind) && !browserId) {
    res.status(400).json({ error: 'X-Browser-Id header required for public drafts' });
    return;
  }

  try {
    const draftKey = buildDraftKey({
      kind,
      contextId,
      userId: req.user?.userId ?? null,
      orgId: req.user?.orgId ?? null,
      browserId,
    });

    const draft = await prisma.formDraft.findUnique({ where: { draftKey } });
    if (!draft) {
      res.json({ draft: null });
      return;
    }
    // Skip expired drafts (treat as gone)
    if (draft.expiresAt && draft.expiresAt < new Date()) {
      res.json({ draft: null });
      return;
    }
    res.json({
      draft: {
        id: draft.id,
        data: draft.data,
        revision: draft.revision,
        updatedAt: draft.updatedAt,
      },
    });
  } catch (err) {
    console.error('[drafts] GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/drafts ────────────────────────────────────────────────
router.put('/', checkBodySize, rateLimitPut, async (req: Request, res: Response) => {
  const parsed = draftWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid draft payload', details: parsed.error.flatten() });
    return;
  }
  const { kind, contextId, data, revision } = parsed.data;

  if (!requireAuthIfNeeded(req, kind)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const browserId = PUBLIC_KINDS.has(kind) ? getBrowserId(req) : null;
  if (PUBLIC_KINDS.has(kind) && !browserId) {
    res.status(400).json({ error: 'X-Browser-Id header required for public drafts' });
    return;
  }

  // Reject payloads over the size cap.
  const serialized = JSON.stringify(data);
  if (serialized.length > MAX_DRAFT_DATA_BYTES) {
    res.status(413).json({ error: 'Draft payload too large' });
    return;
  }

  try {
    const draftKey = buildDraftKey({
      kind,
      contextId,
      userId: req.user?.userId ?? null,
      orgId: req.user?.orgId ?? null,
      browserId,
    });

    // Conflict protection: if a draft exists at a higher revision, reject.
    const existing = await prisma.formDraft.findUnique({ where: { draftKey } });
    if (existing && revision < existing.revision) {
      res.status(409).json({
        error: 'Stale draft revision',
        currentRevision: existing.revision,
      });
      return;
    }

    const expiresAt = new Date(Date.now() + DRAFT_TTL_MS[kind]);

    const draft = await prisma.formDraft.upsert({
      where: { draftKey },
      create: {
        organisationId: req.user?.orgId ?? null,
        userId: req.user?.userId ?? null,
        kind,
        contextId,
        browserId,
        draftKey,
        data: data as Prisma.InputJsonValue,
        revision: 1,
        expiresAt,
      },
      update: {
        data: data as Prisma.InputJsonValue,
        revision: { increment: 1 },
        expiresAt,
        updatedAt: new Date(),
      },
    });

    res.json({
      draft: {
        id: draft.id,
        data: draft.data,
        revision: draft.revision,
        updatedAt: draft.updatedAt,
      },
    });
  } catch (err) {
    console.error('[drafts] PUT error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/drafts?kind=...&contextId=... ──────────────────────
router.delete('/', async (req: Request, res: Response) => {
  const kind = String(req.query.kind || '') as DraftWriteBody['kind'];
  const contextId = String(req.query.contextId || '');
  if (!kind || !contextId) {
    res.status(400).json({ error: 'kind and contextId required' });
    return;
  }
  if (!requireAuthIfNeeded(req, kind)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const browserId = PUBLIC_KINDS.has(kind) ? getBrowserId(req) : null;
  if (PUBLIC_KINDS.has(kind) && !browserId) {
    res.status(400).json({ error: 'X-Browser-Id header required for public drafts' });
    return;
  }

  try {
    const draftKey = buildDraftKey({
      kind,
      contextId,
      userId: req.user?.userId ?? null,
      orgId: req.user?.orgId ?? null,
      browserId,
    });
    await prisma.formDraft.deleteMany({ where: { draftKey } });
    res.json({ ok: true });
  } catch (err: any) {
    // deleteMany is idempotent — empty result is fine.
    if (err?.code === 'P2025') {
      res.json({ ok: true });
      return;
    }
    console.error('[drafts] DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
