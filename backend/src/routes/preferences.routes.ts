import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

// Known keys per page — used for a lightweight sanity check on values.
// Not exhaustive: unknown keys are stored as raw strings. The frontend
// is the source of truth for encoding.

const MAX_VALUE_BYTES = 16 * 1024; // 16 KB per preference value

// GET /api/preferences?page=...
router.get('/', async (req: Request, res: Response) => {
  const page = String(req.query.page || '');
  if (!page) {
    res.status(400).json({ error: 'page required' });
    return;
  }
  try {
    const rows = await prisma.userViewPreference.findMany({
      where: { userId: req.user.userId, page },
    });
    const preferences: Record<string, string> = {};
    for (const r of rows) preferences[r.key] = r.value;
    res.json({ preferences });
  } catch (err) {
    console.error('[preferences] GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/preferences  body: { page, key, value }
router.put('/', async (req: Request, res: Response) => {
  const { page, key, value } = req.body || {};
  if (!page || !key || typeof value !== 'string') {
    res.status(400).json({ error: 'page, key, and string value required' });
    return;
  }
  if (page.length > 100 || key.length > 100) {
    res.status(400).json({ error: 'page and key must be under 100 chars' });
    return;
  }
  if (value.length > MAX_VALUE_BYTES) {
    res.status(413).json({ error: 'value too large' });
    return;
  }
  try {
    await prisma.userViewPreference.upsert({
      where: {
        userId_page_key: { userId: req.user.userId, page, key },
      },
      create: { userId: req.user.userId, page, key, value },
      update: { value, updatedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[preferences] PUT error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/preferences?page=...&key=...
router.delete('/', async (req: Request, res: Response) => {
  const page = String(req.query.page || '');
  const key = String(req.query.key || '');
  if (!page || !key) {
    res.status(400).json({ error: 'page and key required' });
    return;
  }
  try {
    await prisma.userViewPreference.deleteMany({
      where: { userId: req.user.userId, page, key },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[preferences] DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
