import { NextFunction, Response } from 'express';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { AuthRequest } from './auth';

/**
 * Gates a route behind one of School's boolean `feature*` columns. A
 * super_admin (no schoolId) always bypasses this — feature flags are a
 * per-school setting, not a platform-wide one.
 */
export const requireFeature = (featureKey: string) =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.schoolId) {
      next();
      return;
    }

    const school = await prisma.school.findUnique({
      where: { id: req.user.schoolId },
      select: { [featureKey]: true } as Record<string, true>,
    });

    const enabled = school ? (school as unknown as Record<string, boolean>)[featureKey] : false;

    if (!enabled) {
      send(res, 403, undefined, 'This feature is not enabled for your school.');
      return;
    }

    next();
  };
