import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';

export interface JwtPayload {
  userId: string;
  orgId: string;
  role: string;
  email: string;
  teamName?: string;   // populated for team_leader and team_member
}

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  let token = req.headers.authorization?.split(' ')[1];
  if (!token && req.query.token) {
    token = req.query.token as string;
  }
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    
    // Fetch fresh user data from DB to ensure roles/teams are always up to date!
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true, teamName: true, isActive: true }
    });
    
    if (!dbUser || !dbUser.isActive) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.user = {
      ...payload,
      role: dbUser.role,
      teamName: dbUser.teamName ?? undefined
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * requireRole(...roles)
 *  - 'admin' always passes admin
 *  - 'team_leader' is treated as a promotion above 'team_member' but below 'admin'
 */
export const requireRole = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };

/**
 * requireAdminOrLeader — passes admin OR team_leader
 */
export const requireAdminOrLeader = (req: Request, res: Response, next: NextFunction) => {
  if (req.user.role !== 'admin' && req.user.role !== 'team_leader') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
};
