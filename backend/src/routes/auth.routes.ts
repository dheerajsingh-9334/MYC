import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

// POST /api/auth/signup
// Two modes:
//   1. First-ever signup: body { email, password, fullName, organisationName, organisationSlug? }
//      Creates the Organisation and a first admin user.
//   2. Admin-invited signup: body { email, password, fullName, role, teamName?, organisationId? }
//      Requires admin auth (Bearer token in Authorization header). Creates
//      a new user in the calling admin's organisation (or the specified one).
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body || {};
    if (!email || !password || !fullName) {
      res.status(400).json({ error: 'email, password, and fullName are required' });
      return;
    }
    if (String(password).length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    // ── Mode 1: first-ever signup (no admin yet) ─────────────────
    const totalUsers = await prisma.user.count();
    const authHeader = req.headers.authorization;
    const isFirstSignup = totalUsers === 0 && !authHeader;

    if (isFirstSignup) {
      const { organisationName, organisationSlug } = req.body || {};
      if (!organisationName) {
        res.status(400).json({ error: 'organisationName is required for the first signup' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await prisma.organisation.create({
        data: {
          name: organisationName,
          slug: organisationSlug || organisationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          users: {
            create: {
              email,
              passwordHash,
              fullName,
              role: 'admin',
              isActive: true,
            },
          },
        },
        include: { users: true },
      });
      const admin = result.users[0];
      console.log(`✅ First signup: org "${result.name}" + admin "${admin.email}"`);
      res.status(201).json({
        message: 'Organisation and admin account created',
        organisation: { id: result.id, name: result.name, slug: result.slug },
        user: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
      });
      return;
    }

    // ── Mode 2: admin-invited signup ─────────────────────────────
    if (!authHeader) {
      res.status(401).json({ error: 'Unauthorized — first signup must include organisationName' });
      return;
    }
    // Verify the JWT manually (don't trust requireAuth middleware here
    // because we want to surface a clearer error if the token is missing).
    try {
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.JWT_SECRET as string);
    } catch {
      res.status(401).json({ error: 'Invalid or missing token' });
      return;
    }

    const { role, teamName, organisationId } = req.body || {};
    const validRoles = ['admin', 'team_leader', 'team_member', 'client'];
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ error: 'role must be one of: admin, team_leader, team_member, client' });
      return;
    }

    // Resolve org: explicit body field, or fall back to caller's org
    let orgId = organisationId;
    if (!orgId) {
      const decoded = jwt.decode(authHeader.split(' ')[1]) as any;
      orgId = decoded?.orgId;
    }
    if (!orgId) {
      res.status(400).json({ error: 'organisationId required (or caller must belong to an org)' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        organisationId: orgId,
        email,
        passwordHash,
        fullName,
        role,
        teamName: teamName || null,
        isActive: true,
      },
    });

    res.status(201).json({
      message: 'User created',
      user: { id: newUser.id, email: newUser.email, fullName: newUser.fullName, role: newUser.role, teamName: newUser.teamName },
    });
  } catch (err: any) {
    console.error('[auth.signup] error:', err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organisation: true },
    });

    if (!user || !user.isActive) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { userId: user.id, orgId: user.organisationId, role: user.role, email: user.email, teamName: user.teamName ?? undefined };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET as string, {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    } as jwt.SignOptions);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        teamName: user.teamName,
        organisationId: user.organisationId,
        organisation: { name: user.organisation.name, slug: user.organisation.slug },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) { res.status(400).json({ error: 'Refresh token required' }); return; }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as any;
    const accessToken = jwt.sign(
      { userId: payload.userId, orgId: payload.orgId, role: payload.role, email: payload.email, teamName: payload.teamName },
      process.env.JWT_SECRET as string,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' } as jwt.SignOptions
    );
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res: Response) => {
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { organisation: true },
    });
    if (!user || !user.isActive) { res.status(404).json({ error: 'User not found' }); return; }

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      teamName: user.teamName,
      organisationId: user.organisationId,
      organisation: { name: user.organisation.name, slug: user.organisation.slug },
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
