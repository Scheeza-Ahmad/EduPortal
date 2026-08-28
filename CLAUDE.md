# CLAUDE.md — EduPortal Project Context

> Single source of truth for Claude (AI assistant) when helping with this
> codebase. Paste this at the start of every new Claude session.
> Update whenever a major decision is made or a phase is completed.

---

## Project Overview

**Name:** EduPortal (school management portal — demo)
**Team:** S26CS044 — University of Central Punjab, Lahore
**Developer:** Scheeza Ahmad (AI/ML Engineer, AWS Lead, Scrum Master)
**GitHub:** Scheeza-Ahmad
**Mode:** Demo for one school | Free tier only | End-to-end complete build
**Stage:** Phase 1 in progress — Auth + Super Admin

EduPortal is a full-stack school management portal covering:
authentication, role-based access, student profiles, timetable,
subjects, activities, submissions, grading, attendance, announcements,
parent access, and smart automations — all on free tier hosting.

---

## Tech Stack (Free Tier Final)

| Layer        | Choice                                         | Free Limit         |
|--------------|------------------------------------------------|--------------------|
| Frontend     | Next.js 14 (App Router) + TypeScript           | Vercel free        |
| Styling      | Tailwind CSS + shadcn/ui                       | —                  |
| Backend      | Node.js + Express + TypeScript                 | Railway $5 credit  |
| ORM          | Prisma                                         | —                  |
| Database     | PostgreSQL via Supabase                        | 500MB free         |
| Auth         | JWT + bcrypt (rounds=12) + refresh tokens      | —                  |
| File Upload  | Cloudinary (NOT AWS S3)                        | 25GB free          |
| Email        | Resend                                         | 3,000/month free   |
| PDF          | @react-pdf/renderer                            | —                  |
| Cron Jobs    | node-cron (runs inside Railway server)         | —                  |
| Hosting FE   | Vercel                                         | Free               |
| Hosting BE   | Railway                                        | Free ($5 credit)   |
| DB Hosting   | Supabase                                       | Free               |
| CI/CD        | GitHub Actions                                 | Free               |

---

## Security Stack (Applied from Phase 1 — never skip)

| Library              | Purpose                                          |
|----------------------|--------------------------------------------------|
| Helmet.js            | Secure HTTP headers (XSS, clickjacking, MIME)    |
| express-rate-limit   | Max 5 login attempts / IP / 15 min               |
| bcrypt (rounds=12)   | Password hashing                                 |
| JWT httpOnly cookie  | Refresh token — XSS-safe storage                |
| JWT memory storage   | Access token — never in localStorage             |
| Zod                  | Input validation on every API endpoint           |
| CORS whitelist       | Only FRONTEND_URL allowed                        |
| Soft delete          | isActive=false, never hard delete                |
| Audit log            | Every admin/super action auto-recorded           |
| RBAC middleware      | Every route protected by role check              |

---

## Roles

| Role         | Scope              | Key Responsibility                        |
|--------------|--------------------|-------------------------------------------|
| super_admin  | Platform-wide      | Schools, billing, audit, backups          |
| school_admin | One school         | Students, teachers, timetable, reports    |
| teacher      | Assigned subjects  | Activities, grading, attendance           |
| student      | Own data only      | View, submit, track progress              |
| parent       | Child's data only  | Read-only, alerts, consent forms          |

Super admin account is SEEDED — never self-registerable.
All other accounts created by the role above them.

---

## Prisma Schema (models — high level)

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  password     String   // bcrypt hashed, never returned in response
  role         Role     // super_admin | school_admin | teacher | student | parent
  schoolId     String?  // null for super_admin
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
}

model School {
  id        String   @id @default(cuid())
  name      String
  city      String
  adminId   String?
  isActive  Boolean  @default(true)
  features  Json     // { parentPortal, aiFeatures, smsNotify, urdu }
  createdAt DateTime @default(now())
}

model Class {
  id       String @id @default(cuid())
  schoolId String
  name     String  // e.g. "Class 9"
  section  String  // e.g. "A"
}

model Subject {
  id          String @id @default(cuid())
  name        String
  classId     String
  teacherId   String
  creditHours Int
}

model StudentProfile {
  id       String @id @default(cuid())
  userId   String @unique
  classId  String
  rollNo   String
  parentId String?
}

model Activity {
  id         String       @id @default(cuid())
  subjectId  String
  type       ActivityType // assignment | quiz | project | presentation
  title      String
  description String?
  dueDate    DateTime
  totalMarks Int
  fileUrl    String?      // Cloudinary URL
  isDraft    Boolean      @default(false)
  createdAt  DateTime     @default(now())
}

model Submission {
  id          String   @id @default(cuid())
  activityId  String
  studentId   String
  fileUrl     String?  // Cloudinary URL
  textContent String?
  submittedAt DateTime @default(now())
  isLate      Boolean  @default(false)
}

model Grade {
  id           String   @id @default(cuid())
  submissionId String   @unique
  marks        Float
  feedback     String?
  gradedAt     DateTime @default(now())
}

model Attendance {
  id        String           @id @default(cuid())
  studentId String
  subjectId String
  date      DateTime
  status    AttendanceStatus // present | absent | late
}

model AuditLog {
  id          String   @id @default(cuid())
  userId      String
  action      String
  targetTable String?
  targetId    String?
  ip          String?
  createdAt   DateTime @default(now())
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  message   String
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())
}

model Badge {
  id        String   @id @default(cuid())
  studentId String
  type      String   // perfect_week | top_of_class | streak_7
  awardedAt DateTime @default(now())
}
```

---

## Build Order

Building one role at a time — fully — before moving to next.

- [x] Phase 0 — Setup & Architecture
- [ ] Phase 1 — Auth + Super Admin        ← CURRENT
- [ ] Phase 2 — School Admin
- [ ] Phase 3 — Teacher
- [ ] Phase 4 — Student
- [ ] Phase 5 — Parent
- [ ] Phase 6 — AI + i18n + PWA
- [ ] Phase 7 — Testing + Deployment

---

## Folder Structure

```
eduportal/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/             # /login, /forgot-password
│   │   │   ├── super-admin/        # /super-admin/dashboard, /schools, /audit
│   │   │   ├── admin/              # /admin/dashboard, /students, /timetable
│   │   │   ├── teacher/            # /teacher/dashboard, /activities
│   │   │   ├── student/            # /student/dashboard, /submit
│   │   │   └── parent/             # /parent/dashboard, /child
│   │   ├── components/             # Shared UI (navbar, sidebar, table)
│   │   └── lib/                    # apiClient, hooks, utils
│   └── api/                        # Express backend
│       ├── src/
│       │   ├── routes/             # auth.ts, super.ts, admin.ts, teacher.ts...
│       │   ├── controllers/        # Business logic per route
│       │   ├── middleware/         # auth.ts, rbac.ts, rateLimit.ts, validate.ts
│       │   ├── services/           # db queries, cloudinary, resend, pdf
│       │   ├── jobs/               # All cron job files
│       │   └── utils/              # helpers, audit.ts, response.ts
│       └── prisma/
│           ├── schema.prisma
│           └── seed.ts             # Seeds super admin account
├── .env.example
├── phases.txt
└── CLAUDE.md                       # This file
```

---

## API Response Format

Every endpoint returns:
```json
{ "success": true, "data": {} }
{ "success": false, "error": "message here" }
```

---

## API Routes

```
# Auth
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/reset-password

# Super Admin
GET    /api/super/stats
GET    /api/super/schools
POST   /api/super/schools
PATCH  /api/super/schools/:id
DELETE /api/super/schools/:id         # soft delete
PATCH  /api/super/schools/:id/features
GET    /api/super/audit-logs
POST   /api/super/backup
POST   /api/super/impersonate/:userId

# School Admin
GET    /api/admin/stats
GET    /api/admin/students
POST   /api/admin/students
PATCH  /api/admin/students/:id
POST   /api/admin/students/bulk-import
GET    /api/admin/teachers
POST   /api/admin/teachers
PATCH  /api/admin/teachers/:id
GET    /api/admin/classes
POST   /api/admin/classes
GET    /api/admin/timetable
POST   /api/admin/timetable
GET    /api/admin/report-cards/:studentId

# Teacher
GET    /api/teacher/subjects
GET    /api/teacher/activities
POST   /api/teacher/activities
PATCH  /api/teacher/activities/:id
GET    /api/teacher/submissions/:activityId
PATCH  /api/teacher/submissions/:id/grade
POST   /api/teacher/attendance

# Student
GET    /api/student/dashboard
GET    /api/student/activities
POST   /api/student/submit/:activityId
GET    /api/student/grades
GET    /api/student/attendance
GET    /api/student/grade-card

# Parent
GET    /api/parent/children
GET    /api/parent/child/:studentId/grades
GET    /api/parent/child/:studentId/attendance
GET    /api/parent/child/:studentId/timetable
```

---

## Auth Flow

```
1. POST /api/auth/login
   → validate with Zod
   → check rate limit (5 attempts / IP / 15min)
   → bcrypt.compare(password, hash)
   → generate accessToken (15min, JWT, signed with ACCESS_SECRET)
   → generate refreshToken (7d, JWT, signed with REFRESH_SECRET)
   → set refreshToken as httpOnly + Secure + SameSite=Strict cookie
   → return { success: true, data: { accessToken, user: { id, name, role } } }

2. Every protected request:
   → Authorization: Bearer <accessToken>
   → verifyToken middleware decodes → sets req.user
   → requireRole middleware checks req.user.role

3. Token expired (401):
   → frontend calls POST /api/auth/refresh
   → server reads httpOnly cookie, verifies refreshToken
   → issues new accessToken
   → returns it
```

---

## RBAC Middleware

```typescript
// middleware/rbac.ts
export const requireRole = (...roles: Role[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    next();
  };

// Route usage:
router.get('/schools', requireRole('super_admin'), getSchools);
router.get('/students', requireRole('school_admin'), getStudents);
router.post('/activities', requireRole('teacher'), createActivity);
```

---

## Automation Jobs (all in apps/api/src/jobs/)

| File                    | Schedule            | What it does                            |
|-------------------------|---------------------|-----------------------------------------|
| weeklyBackup.ts         | Sun 00:00           | DB export → Cloudinary                  |
| monthlyReport.ts        | 1st 08:00           | PDF health report → super admin email   |
| storageWarning.ts       | Daily check         | Alert if Cloudinary > 80%               |
| suspiciousLogin.ts      | Real-time (sync)    | 3 failed logins → super admin email     |
| timetableConflict.ts    | On save (sync)      | Teacher/room double booking check       |
| attendanceAlert.ts      | Daily 18:00         | Students < 75% → admin + parent alert   |
| dueDateLock.ts          | On due date (sync)  | Auto-close submission portal            |
| ungradedReminder.ts     | Daily 10:00         | Submissions ungraded 3+ days → teacher  |
| performanceSnapshot.ts  | Fri 17:00           | Class avg → teacher email               |
| absenceStreak.ts        | On mark (sync)      | 3-day absence → alert teacher + parent  |
| dueDateReminder.ts      | Hourly              | 24hr + 2hr reminders → student email    |
| weeklyDigest.ts         | Mon 08:00           | Progress summary → student email        |
| badgeAward.ts           | On event (sync)     | Milestone hit → badge auto-awarded      |
| absenceNotify.ts        | On mark (sync)      | Absence marked → parent instant alert   |
| lowGradeAlert.ts        | On grade save (sync)| Below threshold → parent alert          |
| monthlyProgress.ts      | 1st of month        | PDF progress → parent email             |

---

## Key Conventions

- Dates: stored UTC, displayed PKT (UTC+5) on frontend
- Files: uploaded to Cloudinary, only URL stored in DB
- Deletes: always soft (isActive = false), never hard delete
- Pagination: all list endpoints support ?page=1&limit=20
- Passwords: never returned in any API response
- Errors: English messages (Urdu translation added in Phase 6)
- School isolation: every query filtered by schoolId from req.user

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...supabase.co/postgres

# JWT
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Resend (email)
RESEND_API_KEY=
EMAIL_FROM=noreply@yourdomain.com

# App
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000

# Seeded super admin credentials
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=
```

---

## Current Status

- [x] Decisions finalized: free tier stack, security plan, role order
- [x] Phases document updated
- [ ] GitHub repo initialized
- [ ] Prisma schema written
- [ ] Auth endpoints built
- [ ] Super Admin dashboard built

Next immediate task: Initialize project, write Prisma schema, build auth.

---

## Decisions Made (do not revisit)

- File storage: Cloudinary (not AWS S3) — free 25GB
- Email: Resend (not Nodemailer) — cleaner API, free tier
- DB hosting: Supabase (not local) — free PostgreSQL
- Backend hosting: Railway (not Render) — simpler DX
- School inactivity alert: deliberately excluded
- Demo mode: one school only — no multi-school billing UI needed

---

*This is the handoff document. Paste at the start of every Claude session.*
