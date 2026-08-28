import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { sendEmail } from '../utils/mailer';
import { AccessTokenPayload, AuthRequest } from '../middleware/auth';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';
const OTP_EXPIRY_MINUTES = 10;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  } as jwt.SignOptions);
}

function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  } as jwt.SignOptions);
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: REFRESH_COOKIE_PATH,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

async function issueRefreshToken(userId: string, res: Response): Promise<void> {
  const rawToken = signRefreshToken(userId);
  const decoded = jwt.decode(rawToken) as { exp: number };

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(decoded.exp * 1000),
    },
  });

  res.cookie(REFRESH_COOKIE_NAME, rawToken, refreshCookieOptions());
}

// ---------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid email or password format');
    return;
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    send(res, 401, undefined, 'Invalid credentials');
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    send(res, 401, undefined, 'Invalid credentials');
    return;
  }

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });

  await issueRefreshToken(user.id, res);

  send(res, 200, {
    accessToken,
    user: { id: user.id, name: user.name, role: user.role },
  });
}

// ---------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------

export async function logout(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (rawToken) {
    await prisma.refreshToken.deleteMany({
      where: { tokenHash: hashToken(rawToken) },
    });
  }

  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  send(res, 200, { message: 'Logged out' });
}

// ---------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------

export async function refresh(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!rawToken) {
    send(res, 401, undefined, 'Missing refresh token');
    return;
  }

  let decoded: { userId: string };
  try {
    decoded = jwt.verify(rawToken, process.env.JWT_REFRESH_SECRET as string) as { userId: string };
  } catch {
    send(res, 401, undefined, 'Invalid or expired refresh token');
    return;
  }

  const tokenHash = hashToken(rawToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    send(res, 401, undefined, 'Refresh token no longer valid');
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || !user.isActive) {
    send(res, 401, undefined, 'User no longer active');
    return;
  }

  // Rotate: revoke the used refresh token, issue a new one + new access token.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  await issueRefreshToken(user.id, res);

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });

  send(res, 200, { accessToken });
}

// ---------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid email');
    return;
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Always respond the same way — don't reveal whether the email exists.
  if (user && user.isActive) {
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 12);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
      },
    });

    await sendEmail({
      to: user.email,
      subject: 'EduPortal password reset code',
      html: `<p>Your password reset code is <strong>${otp}</strong>. It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>`,
    });
  }

  send(res, 200, { message: 'If that email exists, a reset code has been sent.' });
}

// ---------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8),
});

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid input');
    return;
  }

  const { email, otp, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    send(res, 400, undefined, 'Invalid or expired code');
    return;
  }

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!resetToken) {
    send(res, 400, undefined, 'Invalid or expired code');
    return;
  }

  const otpMatches = await bcrypt.compare(otp, resetToken.otpHash);
  if (!otpMatches) {
    send(res, 400, undefined, 'Invalid or expired code');
    return;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
  ]);

  send(res, 200, { message: 'Password reset successful' });
}

// Re-export type for routes that need req.user typing.
export type { AuthRequest };
