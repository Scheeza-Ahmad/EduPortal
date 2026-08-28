import { NextFunction, Response } from 'express';
import { AuthRequest } from './auth';
import { send } from '../utils/response';

export const requireRole =
  (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      send(res, 403, undefined, 'Forbidden');
      return;
    }
    next();
  };
