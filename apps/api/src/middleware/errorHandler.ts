import { NextFunction, Request, Response } from 'express';
import { send } from '../utils/response';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error(err);
  send(res, 500, undefined, 'Internal server error');
}
