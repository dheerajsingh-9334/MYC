# Deployment Guide — MyCOps

Two services, two platforms:

| Service  | Platform  | Path         |
| -------- | --------- | ------------ |
| Frontend | Vercel    | `frontend/`  |
| Backend  | Railway / Render | `backend/` |

The repo also ships `.env.example` files in both folders so a new contributor
can bootstrap their local env without seeing real secrets.

---

## 1. Backend — pick one platform

### Railway

1. New project → Deploy from GitHub → pick this repo.
2. Set **Root Directory** to `backend`.
3. Railway auto-detects Node. It will use `railway.json` for the start command:
   `npx prisma migrate deploy && node dist/index.js`.
4. Add environment variables (see [§3](#3-env-vars)). For DB:
   - Provision a Postgres plugin **or** point `DATABASE_URL` at your existing
     Supabase pooler URL.
   - Set `DIRECT_URL` to the session-mode connection (used by migrations).
5. First deploy will run migrations. Health check is `GET /api/health`.

### Render

1. New Blueprint Instance → connect the repo. Render reads `render.yaml` in
   the `backend/` folder.
2. Fill in the `sync: false` env vars in the Render dashboard:
   `DATABASE_URL`, `DIRECT_URL`, `FRONTEND_URL`.
3. Click **Apply**. The blueprint provisions the web service and generates
   `JWT_SECRET` / `JWT_REFRESH_SECRET` for you.

---

## 2. Frontend — Vercel

1. New Project → import this repo.
2. Set **Root Directory** to `frontend`. Framework: Next.js (auto-detected).
3. Vercel reads `vercel.json` from the frontend folder.
4. Add environment variables (see [§3](#3-env-vars)). The only one is
   `NEXT_PUBLIC_API_URL` — set it to your backend's public URL, e.g.
   `https://myc-ops-backend.up.railway.app`.
   > `NEXT_PUBLIC_*` is **build-time inlined**. If you change the value
   > later you must redeploy, not just edit env.
5. Deploy. The dashboard lives at `https://<project>.vercel.app`.

---

## 3. Env vars

### Frontend (`frontend/.env.production`)

| Key                    | Example                          | Notes                          |
| ---------------------- | -------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_URL`  | `https://api.example.com`        | No trailing slash. Build-time. |

### Backend (`backend/.env.production`)

| Key                     | Example / generator                                        | Notes                                |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------ |
| `NODE_ENV`              | `production`                                               |                                      |
| `PORT`                  | `4000`                                                     | PaaS usually overrides this.         |
| `DATABASE_URL`          | `postgresql://…pooler…:6543/postgres?pgbouncer=true`       | Pooled, used at runtime.             |
| `DIRECT_URL`            | `postgresql://…:5432/postgres`                             | Direct, used by Prisma migrations.   |
| `JWT_SECRET`            | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` | At least 32 bytes. |
| `JWT_REFRESH_SECRET`    | (different from above)                                     | Same generator.                      |
| `JWT_EXPIRES_IN`        | `15m`                                                      |                                      |
| `JWT_REFRESH_EXPIRES_IN`| `7d`                                                       |                                      |
| `FRONTEND_URL`          | `https://app.example.com`                                  | Comma-separate multiple origins.     |

Generate secrets locally with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 4. CORS

`backend/src/index.ts` sets:

```ts
origin: process.env.FRONTEND_URL || 'http://localhost:3000'
```

For multi-origin setups (e.g. staging + production frontends), replace that
with a small allowlist:

```ts
const allowed = (process.env.FRONTEND_URL ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) =>
    !origin || allowed.includes(origin) ? cb(null, true) : cb(new Error('CORS')),
  credentials: true,
}));
```

---

## 5. Database migrations on first deploy

The `startCommand` runs `npx prisma migrate deploy` before booting the API.
This is the production-safe variant of `migrate dev` — it applies pending
migrations without generating new ones. To add a new migration:

```bash
cd backend
npx prisma migrate dev --name <change>   # creates + applies locally
git add prisma/migrations
git commit -m "migration: <change>"
git push                                   # CI re-runs migrate deploy
```

---

## 6. Smoke test after deploy

```bash
curl https://<backend-host>/api/health
# → { "ok": true, "db": "up" }

# Then load the frontend and log in with admin@myc.in / password123
# (seed the prod DB before going live — see README §1)
```

---

## 7. Files added by this guide

```
frontend/
  .env.example              ← committed, safe template
  .env.production           ← placeholder, replace before deploy
  vercel.json               ← Vercel project config + security headers
  next.config.ts            ← prod image-remote-patterns hook
backend/
  .env.example              ← committed, safe template
  .env.production           ← placeholder, replace before deploy
  render.yaml               ← Render Blueprint
  railway.json              ← Railway deploy config
  Procfile                  ← alternative start (Heroku-style)
  .gitignore                ← excludes node_modules, dist, uploads, .env*
```