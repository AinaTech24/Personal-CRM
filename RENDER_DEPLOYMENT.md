# Deploying Aina CRM on Render

This is the recommended path for this app. Aina CRM is a single Next.js codebase with a
**custom Node server** (`server.js`) that also runs **Socket.io** for realtime updates on the
same process/port. Render's "Web Service" runtime is a persistent Node process (not
serverless), so it supports this architecture as-is — **no code changes needed**.

> Vercel was considered but isn't a fit here: its serverless functions can't host the custom
> server or keep a persistent Socket.io connection open. Everything (UI + API + realtime)
> deploys as one Render Web Service instead.

---

## 0. What you need first

- This repo pushed to GitHub (done — `github.com/bhavesh-bhoi/Personal-CRM`).
- A MySQL database Render can reach. Render doesn't offer managed MySQL itself (only
  Postgres/Redis), so use an external managed MySQL provider — **Railway**, **Aiven**, or
  **PlanetScale** all have simple free/cheap tiers that work well with Prisma. Any of them give
  you a `DATABASE_URL`-style connection string.
- A **new, freshly generated `JWT_SECRET`** — see the security note below before anything else.

---

## Security note — rotate the JWT secret before deploying

An earlier commit in this repo briefly included a saved session cookie (`aina_session`) from
local testing. That cookie is only valid if it can still be verified against the app's
`JWT_SECRET`. **Generate a brand-new secret for production** and you're safe — the old cookie
(and every other session) becomes worthless the moment the app starts using a different key:

```bash
openssl rand -base64 48
```

Use that value as `JWT_SECRET` in Render's environment variables (step 3 below). Never reuse
whatever value was in your local `.env` if you're at all unsure it was exposed.

---

## 1. Set up the database

Pick one (Railway is the fastest to get going):

1. Create a MySQL database on Railway/Aiven/PlanetScale.
2. Copy its connection string — reshape it into the Prisma format if needed:
   ```
   mysql://USER:PASSWORD@HOST:PORT/DATABASE_NAME
   ```
3. Keep this handy for step 3.

> Uploaded files (profile images, task attachments, project documents) are stored **inside
> MySQL** as base64 columns — there's no separate file/object storage to configure.

---

## 2. Create the Web Service on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect your GitHub account and select the `bhavesh-bhoi/Personal-CRM` repo.
3. Render detects `render.yaml` in the repo root and proposes the `aina-crm` web service —
   confirm it.

If you'd rather not use the blueprint, create it manually instead:
**New** → **Web Service** → select the repo → :
- **Runtime**: Node
- **Build Command**: `npm ci && npx prisma generate && npm run build`
- **Start Command**: `npm start`
- **Plan**: Starter (or higher — Free tier spins down on idle, which drops Socket.io
  connections and is not recommended for a realtime app)

---

## 3. Configure environment variables

In the service's **Environment** tab, add:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:PORT/DB` from step 1 |
| `JWT_SECRET` | the freshly generated secret from the security note above |
| `APP_URL` | `https://YOUR-SERVICE-NAME.onrender.com` (or your custom domain once attached) |
| `NODE_ENV` | `production` |
| `SEED_ADMIN_EMAIL` | e.g. `admin@ainatech.in` |
| `SEED_ADMIN_PASSWORD` | a strong password — change it after first login |
| `SEED_ADMIN_NAME` | e.g. `Super Admin` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | optional — can instead be configured later in-app under **Email (SMTP)** |

Render auto-sets `PORT`; `server.js` already reads `process.env.PORT` so no change needed.

---

## 4. First deploy — push the schema and seed the admin

Render runs your build/start commands automatically on every push, but the database schema
needs to be applied once (and any time the schema changes). Easiest way: run it from your own
machine, pointed at the production database.

```bash
# From the project root, temporarily set DATABASE_URL to the production DB
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DB" npx prisma db push
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DB" npx tsx prisma/seed.ts
```

(On Windows PowerShell: `$env:DATABASE_URL="..."; npx prisma db push`.)

Alternatively, use Render's **Shell** tab on the deployed service (once the first deploy
succeeds) to run `npx prisma db push` and `npm run db:seed` directly against the already-wired
`DATABASE_URL`.

---

## 5. Deploy

Click **Create Web Service** (blueprint) or **Deploy** (manual). Render will:
1. Clone the repo, run the build command.
2. Start the service with `npm start`.
3. Give you a URL like `https://aina-crm.onrender.com`.

Watch the **Logs** tab for `Aina CRM ready on http://localhost:<port>` to confirm it started
cleanly.

---

## 6. Verify

1. Visit the Render URL — the login page should load.
2. Log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
3. Open a Leads or Tasks board in two browser tabs and confirm realtime updates (drag a card
   in one tab, watch it update in the other) — this proves Socket.io is working over Render's
   proxy (it supports WebSockets by default, no extra config needed, unlike some other PaaS).
4. Upload a task attachment and re-download it — confirms MySQL file storage works.

---

## 7. Custom domain (optional)

Render → your service → **Settings** → **Custom Domains** → add your domain, then update your
DNS with the CNAME/A record Render shows you. Once it's verified and SSL is issued, update
`APP_URL` to the new domain and redeploy (or just trigger a manual restart) so invite links use
the right URL.

---

## 8. Updating / redeploying

Render auto-deploys on every push to `main` by default. For schema changes, remember to run
`npx prisma db push` (or `prisma migrate deploy` once you adopt migrations) against the
production `DATABASE_URL` — Render does **not** do this automatically as part of the build.

---

## 9. Backups

Whichever managed MySQL provider you chose (Railway/Aiven/PlanetScale) handles automated
backups — check their dashboard to confirm backups are enabled and review the retention
window. Since all uploaded files live in the same database, a DB backup is a full backup of the
app's data.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build fails on `prisma generate` | Make sure `DATABASE_URL` is set in the environment (Prisma needs it at generate time in some configs) — it is, from step 3. |
| 502 / service won't start | Check the Logs tab; usually a missing env var. Confirm `DATABASE_URL` is reachable from Render's network (Railway/Aiven dashboards show an "allow all IPs" or Render-specific allowlist option). |
| Realtime not updating | Confirm you're on the Starter plan or above — the Free plan spins the service down after 15 minutes of inactivity, which drops open Socket.io connections and adds cold-start delay. |
| Login fails after first deploy | Confirm you ran `prisma db push` + the seed script against the production DB (step 4). |
| Invite links point to the wrong domain | Set `APP_URL` correctly and redeploy/restart. |
