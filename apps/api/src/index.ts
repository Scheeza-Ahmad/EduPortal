import 'dotenv/config';
import express from 'express';
// Patches Express so a rejected promise inside an async route handler is
// forwarded to errorHandler automatically. Without this (plain Express 4),
// a thrown/rejected error in any `async function` handler just hangs the
// request until the frontend's axios timeout — which is what was showing up
// as generic "Failed to load ___" errors across the app. Must be imported
// right after express, before any router/route is defined.
import 'express-async-errors';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import superRoutes from './routes/super';
import adminRoutes from './routes/admin';
import teacherRoutes from './routes/teacher';
import studentRoutes from './routes/student';
import financeRoutes from './routes/finance';
import coordinatorRoutes from './routes/coordinator';
import uploadRoutes from './routes/upload';
import { errorHandler } from './middleware/errorHandler';
import { startJobs } from './jobs';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

// This gates every request (dashboards poll several endpoints per page,
// portals refresh on tab focus, etc.) — 100/15min was tight enough that an
// ordinary admin session could exhaust it and then get a 429 on something as
// harmless as clicking Logout. The real per-account brute-force protection
// lives on /api/auth/login specifically (see routes/auth.ts's loginLimiter,
// 5 attempts/15min — unchanged, and not something this limit should affect).
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please wait a moment.' },
});
app.use(globalLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

// Lightweight keep-alive target for the frontend's periodic ping — avoids a
// Railway cold start between requests during a quiet session.
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.use('/api/auth', authRoutes);
app.use('/api/super', superRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/coordinator', coordinatorRoutes);
app.use('/api/upload', uploadRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`EduPortal API listening on port ${PORT}`);
  startJobs();
});
