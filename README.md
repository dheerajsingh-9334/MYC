# MyCOps — Client Pipeline Operations Platform

A full-stack operations platform for managing 100+ coaching clients through a **9-step sequential pipeline**. Built with Express.js, Next.js 14, and PostgreSQL.

## Architecture

| Layer | Tech |
|---|---|
| Backend | Node.js + Express.js |
| Frontend | Next.js 14 (App Router) |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | JWT (access + refresh) |
| Styling | Tailwind CSS + CSS custom properties |

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL running locally
- Database created: `CREATE DATABASE myc_ops;`

### 1. Configure Backend

```bash
cd backend
# Edit .env and set your DATABASE_URL
cp .env .env.local
```

Update `backend/.env`:
```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/myc_ops"
```

### 2. Migrate & Seed Database

```bash
cd backend
npm install
npx prisma migrate dev --name init
npx ts-node src/prisma/seed.ts
```

### 3. Start Backend

```bash
cd backend
npm run dev
# → API running at http://localhost:4000
```

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
# → App running at http://localhost:3000
```

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@myc.in | password123 |
| Tech Team | rajan@myc.in | password123 |
| Design Team | neha@myc.in | password123 |
| Sales Team | sneha@myc.in | password123 |

## Features (Phase 1)

- **Pipeline Dashboard** — Live view of all 100+ clients across 9 steps with status filters
- **Standup Briefing** — Auto-generated daily brief: overdue, blocked, and due-today clients
- **My Tasks** — Team member task view grouped by urgency with mark-done and blocker-raise
- **Client Detail** — 9-step progress tracker, task list, step history timeline
- **Add Client** — One-click add triggers auto-task creation and team notification
- **Step Configuration** — Edit step names, SLAs, owning teams, and task templates
- **Team Management** — Invite/deactivate team members, view active task counts
- **Pipeline Engine** — Auto-advancement when all tasks complete; manual override with audit trail
- **SLA Cron** — Hourly check; notifies admins of overdue tasks
- **JWT Auth** — Role-based access: admin sees everything, team_member sees own tasks

## API Endpoints

See `myc-agent-prompt.md` for the full API spec.

## Project Structure

```
MYC/
├── backend/           # Express.js API
│   ├── src/
│   │   ├── routes/    # auth, clients, tasks, steps, users, standup, dashboard
│   │   ├── services/  # pipeline.service.ts, cron.service.ts
│   │   ├── middleware/ # auth.middleware.ts
│   │   └── prisma/    # schema, client, seed
│   └── package.json
│
└── frontend/          # Next.js 14
    ├── app/
    │   ├── login/
    │   ├── dashboard/
    │   ├── standup/
    │   ├── tasks/
    │   ├── clients/[id]/
    │   ├── team/
    │   └── settings/steps/
    ├── components/
    │   ├── layout/    # Sidebar, Topbar, AppLayout
    │   ├── ui/        # StatusBadge
    │   └── pipeline/  # AddClientModal
    └── lib/           # api.ts
```
