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
import parentRoutes from './routes/parent';
import financeRoutes from './routes/finance';
import coordinatorRoutes from './routes/coordinator';
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

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
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
app.use('/api/parent', parentRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/coordinator', coordinatorRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`EduPortal API listening on port ${PORT}`);
  startJobs();
});
