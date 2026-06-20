import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    req.user = payload;
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
