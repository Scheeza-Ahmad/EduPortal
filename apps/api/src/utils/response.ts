import { Response } from 'express';

export function send(res: Response, status: number, data?: unknown, error?: string): Response {
  if (error) {
    return res.status(status).json({ success: false, error });
  }
  return res.status(status).json({ success: true, data: data ?? null });
}
