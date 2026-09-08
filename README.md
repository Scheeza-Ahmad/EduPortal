# EduPortal 🎓

A full-stack, multi-tenant **school management portal** — authentication,
role-based dashboards, timetables, activities & grading, attendance, fees,
report cards, announcements, and automated email jobs, built end-to-end on
free-tier infrastructure.

> Built for **S26CS044 — University of Central Punjab, Lahore**
> Developer: **Scheeza Ahmad** (AI/ML Engineer, AWS Lead, Scrum Master)

---

## ✨ Highlights

- **6 roles, 6 dashboards** — Super Admin, School Admin, Teacher, Student,
  Finance Officer, Coordinator — each with its own scoped views and
  permissions.
- **JWT auth done right** — short-lived access token kept in memory
  (never `localStorage`), long-lived refresh token in an `httpOnly` +
  `Secure` + `SameSite=Strict` cookie, silent refresh on reload, rate-limited
  login with a clear lockout message.
- **Automated jobs** — 20+ `node-cron` jobs covering backups, digests,
  attendance alerts, due-date reminders, suspicious-login alerts, and more.
- **Multi-tenant by design** — every query scoped by `schoolId`; soft
  deletes everywhere (`isActive`), nothing is ever hard-deleted.
- **Fast by default** — parallelized queries, targeted DB indexes, SWR
  caching on data-heavy pages, dynamic imports for heavy libraries
  (PDF rendering, charts), and image optimization — see [Performance](#-performance).
- **PDF report cards & fee receipts**, **Cloudinary** file uploads,
  **Resend** transactional email, all on free tiers.

---

## 🏗️ Tech Stack

| Layer          | Choice                                    | Notes                     |
|----------------|--------------------------------------------|----------------------------|
| Frontend       | Next.js 14 (App Router) + TypeScript       | Vercel free tier           |
| UI             | Tailwind CSS + shadcn/ui + Radix           | —                          |
| Data fetching  | SWR + Axios                                | Global cache config        |
| Charts         | Recharts (lazy-loaded)                     | —                          |
| PDF            | `@react-pdf/renderer` (lazy-loaded)        | Report cards, fee receipts |
| Backend        | Node.js + Express + TypeScript             | Railway free tier          |
| ORM            | Prisma                                     | —                          |
| Database       | PostgreSQL via Supabase                    | 500 MB free                |
| Auth           | JWT (access + refresh) + bcrypt (12 rounds)| httpOnly refresh cookie    |
| File storage   | Cloudinary                                 | 25 GB free                 |
| Email          | Resend                                     | 3,000/month free           |
| Cron           | node-cron (in-process on the API server)   | —                          |
| Validation     | Zod                                        | Every request body         |
| Security       | Helmet, `express-rate-limit`, CORS whitelist | —                        |

---

## 🧑‍🤝‍🧑 Roles

| Role           | Scope                | Responsibility                                  |
|----------------|-----------------------|--------------------------------------------------|
| `super_admin`  | Platform-wide         | Schools, feature flags, audit log, backups       |
| `school_admin` | One school            | Students, teachers, classes, timetable, reports  |
| `teacher`      | Assigned subjects     | Activities, grading, attendance, class fees      |
| `student`      | Own data only         | Activities, submissions, grades, fees, timetable |
| `finance`      | One school            | Fee structure, invoicing, payments, reports       |
| `coordinator`  | Assigned wing         | Teacher/student oversight, wing-level reports    |

Accounts are always created by the role above them — there is no public
self-registration; the super admin account is seeded.

---

## 📂 Project Structure

```
eduportal/
├── apps/
│   ├── web/                     # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/          # /login (role-select → sign in → forgot password)
│   │   │   ├── super-admin/     # Platform administration
│   │   │   ├── admin/           # School admin dashboard
│   │   │   ├── teacher/         # Teacher dashboard
│   │   │   ├── student/         # Student dashboard
│   │   │   ├── finance/         # Finance officer dashboard
│   │   │   └── coordinator/     # Coordinator dashboard
│   │   ├── components/          # Shared UI (shadcn/ui, tables, layout)
│   │   └── lib/                 # api client, SWR fetcher, contexts, helpers
│   └── api/                     # Express backend
│       ├── src/
│       │   ├── routes/          # auth, admin, teacher, student, finance, coordinator, super, upload
│       │   ├── controllers/     # Business logic per route
│       │   ├── middleware/      # auth (JWT verify), RBAC, validation
│       │   ├── services/        # Cloudinary, Resend, PDF generation
│       │   ├── jobs/            # 20+ cron / event-driven automation jobs
│       │   └── utils/           # prisma client, response helpers, mailer
│       └── prisma/
│           ├── schema.prisma
│           └── seed.ts          # Seeds the super admin account
├── .env.example
└── CLAUDE.md                    # Internal engineering/AI-assistant context doc
```

---

## 🔐 Auth Flow

```
1. POST /api/auth/login
   → Zod validation
   → rate-limited: 5 attempts / IP / 15 min (see Security below)
   → bcrypt.compare(password, hash)
   → access token  (JWT, 15 min, kept in memory on the client)
   → refresh token (JWT, 7 days, httpOnly + Secure + SameSite=Strict cookie)
   → { success: true, data: { accessToken, user, branding, features } }

2. Every protected request
   → Authorization: Bearer <accessToken>
   → verifyToken middleware decodes it → req.user
   → requireRole(...) / requireFeature(...) middleware guards the route

3. Access token expired (401 on a protected route)
   → axios interceptor calls POST /api/auth/refresh
   → server reads the httpOnly cookie, verifies + rotates the refresh token
   → new access token issued, original request retried transparently

4. Wrong credentials (401 on /api/auth/login itself)
   → excluded from the refresh/redirect flow above — the user stays on the
     login form and simply sees "Incorrect email or password"

5. Too many attempts (429)
   → the server computes exactly how many minutes remain in the current
     rate-limit window and returns it in the response, e.g.
     "Too many attempts. You're locked out for 12 minutes. Please try
     again after 12 minutes." — shown inline, no page reload
```

### Login rate limiting, in detail

- **`express-rate-limit`**, 5 attempts per **IP** per 15-minute window, on
  `/login`, `/forgot-password`, and `/reset-password`. Self-expires — no
  manual unlock needed, and none exists.
- A separate **in-memory failed-attempt counter** (also per IP) fires an
  email alert to every `super_admin` after 3 failed attempts on the same
  IP within 15 minutes — informational only, it does not block anything.
- Neither mechanism ever touches a user's `isActive` flag — this is IP-level
  throttling, not an account lock.

---

## 🛡️ Security

- **Helmet** — secure HTTP headers (XSS, clickjacking, MIME sniffing).
- **`express-rate-limit`** — global (500 req / 15 min / IP) and a stricter
  login limiter (5 / 15 min / IP) with a lockout-minutes message.
- **bcrypt**, 12 rounds, for every password hash.
- **JWT** — access token in memory only; refresh token in an `httpOnly`
  cookie, rotated on every use.
- **Zod** — every request body validated before it reaches a controller.
- **CORS whitelist** — only `FRONTEND_URL` is allowed, credentials enabled.
- **Soft delete everywhere** — `isActive = false`, never a hard `DELETE`.
- **Audit log** — every super admin / school admin action is recorded.
- **RBAC middleware** — every route explicitly declares which roles may
  call it.

---

## ⚡ Performance

EduPortal was profiled and tuned for fast navigation across the board:

- **Parallelized queries** — independent DB calls across dashboard/report
  controllers run via `Promise.all` instead of sequentially.
- **Targeted indexes** — added on the columns dashboards and reports
  actually filter/sort by.
- **A combined dashboard endpoint** (`/api/admin/dashboard`) — one round
  trip instead of several for the admin landing page.
- **SWR caching** — data-heavy pages fetch through SWR with a shared
  global config (`revalidateOnFocus: false`, a 5s dedupe window), so
  repeat navigation to the same page is instant instead of re-fetching.
- **Lazy-loaded heavy libraries** — `@react-pdf/renderer` and `recharts`
  are dynamically imported only where actually used (a "Download PDF"
  click, a chart render), which took several pages from 550–588 KB of
  initial JS down to 120–160 KB.
- **Image optimization** — `next/image` + tuned `next.config.mjs`.
- **Tuned Prisma connection/logging** for production.

---

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 18.18
- A PostgreSQL database (Supabase recommended — free tier)
- Cloudinary, Resend accounts (both have free tiers)

### Setup

```bash
# 1. Install dependencies (npm workspaces)
npm install

# 2. Configure environment variables
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local   # only NEXT_PUBLIC_* vars are needed here
# fill in DATABASE_URL, JWT secrets, Cloudinary, Resend, etc.

# 3. Set up the database
cd apps/api
npx prisma migrate dev
npm run seed                          # creates the seeded super admin

# 4. Run both apps (from the repo root, two terminals)
npm run dev:api                       # http://localhost:4000
npm run dev:web                       # http://localhost:3000
```

### Useful scripts (repo root)

| Script              | What it does                          |
|----------------------|----------------------------------------|
| `npm run dev:web`     | Start the Next.js dev server          |
| `npm run dev:api`     | Start the Express dev server          |
| `npm run build:web`   | Production build — frontend          |
| `npm run build:api`   | Compile TypeScript — backend         |
| `npm run typecheck`   | `tsc --noEmit` across all workspaces  |
| `npm run lint`        | Lint across all workspaces            |

---

## 📡 API Response Format

Every endpoint responds with a consistent envelope:

```json
{ "success": true, "data": { } }
{ "success": false, "error": "message here" }
```

## 🤖 Automation Jobs

20+ jobs live in `apps/api/src/jobs/`, a mix of scheduled (`node-cron`) and
event-driven (fired synchronously on the relevant action), covering:
weekly backups, monthly/weekly reports and digests, storage-usage warnings,
suspicious-login alerts, attendance/absence alerts, due-date reminders and
auto-lock, ungraded-submission reminders, badge awards, school/teacher
inactivity alerts, and wing/school performance summaries.

---

## 🌐 Deployment

| Piece      | Host      | Tier              |
|------------|-----------|-------------------|
| Frontend   | Vercel    | Free              |
| Backend    | Railway   | Free ($5 credit)  |
| Database   | Supabase  | Free (500 MB)     |
| CI/CD      | GitHub Actions | Free         |

---

## 📄 License

Private project — built for academic coursework (UCP, Lahore). Not licensed
for external redistribution.
