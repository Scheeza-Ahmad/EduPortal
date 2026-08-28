import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { send } from '../utils/response';

export interface AccessTokenPayload {
  userId: string;
  role: string;
  schoolId: string | null;
  impersonatedBy?: string; // set when this token was issued via super-admin impersonation
}

export interface AuthRequest extends Request {
  user?: AccessTokenPayload;
}

export function verifyToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    send(res, 401, undefined, 'Missing or invalid Authorization header');
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as AccessTokenPayload;
    req.user = payload;
    next();
  } catch {
    send(res, 401, undefined, 'Invalid or expired access token');
  }
}
