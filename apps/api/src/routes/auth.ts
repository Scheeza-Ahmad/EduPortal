import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { forgotPassword, login, logout, refresh, resetPassword } from '../controllers/auth.controller';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  // A static message can't tell the user how long they're locked for.
  // `req.rateLimit.resetTime` is the moment this IP's window clears, so
  // compute the remaining minutes here and put it straight in the JSON
  // body — CORS isn't configured to expose the RateLimit-* headers, so a
  // frontend read of those would silently come back empty.
  handler: (req, res) => {
    // express-rate-limit attaches this at runtime but doesn't augment the
    // global Express.Request type for it — cast rather than fight the types.
    const resetTime = (req as unknown as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    const retryAfterMinutes = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 60000))
      : 15;

    res.status(429).json({
      success: false,
      error: `Too many attempts. You're locked out for ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}. Please try again after ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`,
      retryAfterMinutes,
    });
  },
});

router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.post('/forgot-password', loginLimiter, forgotPassword);
router.post('/reset-password', loginLimiter, resetPassword);

export default router;
