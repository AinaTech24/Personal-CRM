# Deploying Aina CRM to a Hostinger VPS

Target: Ubuntu 22.04/24.04 VPS, MySQL on the same box, nginx in front, HTTPS via
Let's Encrypt, app kept alive by PM2.

Assumes a domain (say `crm.ainatech.in`) with an A record pointing at the VPS IP.
Replace it throughout.

---

## Read this first — three things specific to this app

Generic Next.js guides will break Aina CRM in ways that look fine at first. All
three below are silent failures: the app boots, serves pages, and looks healthy.

### 1. Never run more than one instance

`server.js` puts the Socket.io server on `globalThis.__io` so API routes can emit
from the same process:

```js
const io = new Server(httpServer, { path: "/socket.io" });
globalThis.__io = io;   // API routes emit through this
```

Every realtime feature depends on the emitting code and the connected socket
living in **one process**. Run two workers and an API route in worker A emits to
`__io` in worker A — clients attached to worker B never hear it. Notifications and
live updates then work for roughly half your users, at random, with nothing in
the logs.

So: **`pm2 start ... -i 1` (fork mode). Never `-i max`, never `cluster`.** The
standard "use all your cores" advice is wrong for this app.

Scaling past one process needs `@socket.io/redis-adapter` (a second datastore and
a broker between instances). A single VPS process handles an internal CRM's load
comfortably; don't take that on until you need it.

### 2. Raise nginx's upload limit

Every file in this app — avatars, company logo, signature, task attachments,
project documents — is base64 inside a JSON body, not a multipart upload. Base64
adds ~33%, and the server accepts avatars up to ~1.5 MB.

nginx's default `client_max_body_size` is **1 MB**, so uploads fail with `413`
before reaching Node. Set it to `10m` (below).

### 3. The build talks to the database

`npm run build` is `prisma generate && prisma db push && next build`. The push is
what creates and updates tables — this project has no migrations directory, so
`schema.prisma` is the source of truth.

That means `DATABASE_URL` must be set **at build time**, not just at runtime, and
MySQL must be running before you build.

It also means a schema edit that MySQL can't apply non-destructively **fails the
build**. That's deliberate — the alternative is silent drift. When that happens,
Prisma will suggest `--force-reset`. **That drops the entire database. Never add
it to the build.** Fix the schema instead (make the column nullable, add a
default, backfill first).

---

## 1. Server prep

SSH in as root from Hostinger's panel, then make a non-root user:

```bash
adduser aina
usermod -aG sudo aina
rsync --archive --chown=aina:aina ~/.ssh /home/aina   # keep your SSH key
```

Reconnect as `aina`. Everything below runs as that user.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw
```

Firewall — note 3306 is **not** opened. MySQL stays on localhost:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Timezone (the app is fixed to Asia/Kolkata, so match it — server-side dates and
`createdAt` ordering read correctly in logs):

```bash
sudo timedatectl set-timezone Asia/Kolkata
```

Node 20 (Next 16 needs ≥20.9; Render used 20.18):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # expect v20.x
```

---

## 2. MySQL

```bash
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo mysql_secure_installation
```

Create the database and a dedicated user — not root:

```bash
sudo mysql
```

```sql
CREATE DATABASE aina_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'aina'@'localhost' IDENTIFIED BY 'PUT_A_LONG_RANDOM_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON aina_crm.* TO 'aina'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

`ALL PRIVILEGES` on that one database is required: `prisma db push` issues DDL
(CREATE/ALTER TABLE) during every build, so a data-only grant would fail the
build.

Confirm MySQL is bound to localhost only:

```bash
sudo grep bind-address /etc/mysql/mysql.conf.d/mysqld.cnf   # want 127.0.0.1
```

Because every uploaded file is stored base64 in `LongText`, rows get large. The
MySQL 8 default `max_allowed_packet` (64 MB) is fine for the app, but `mysqldump`
restores of big rows can trip over the client default — raise it if a restore
ever fails:

```ini
# /etc/mysql/mysql.conf.d/mysqld.cnf under [mysqld]
max_allowed_packet = 128M
```

---

## 3. Deploy the app

```bash
cd /home/aina
git clone https://github.com/bhavesh-bhoi/Personal-CRM.git aina-crm
cd aina-crm
```

Create `.env` (root of the project):

```bash
nano .env
```

```ini
DATABASE_URL="mysql://aina:PUT_A_LONG_RANDOM_PASSWORD_HERE@localhost:3306/aina_crm"

# Generate with: openssl rand -base64 48
JWT_SECRET="PASTE_A_LONG_RANDOM_SECRET"

APP_URL="https://crm.ainatech.in"

# OS-level push notifications (attendance reminders, unread messages, etc.
# reaching a closed app or background tab). Generate once with:
#   npx web-push generate-vapid-keys
# Without these, push quietly does nothing — no error, notifications just
# never arrive — everything else in the app works the same either way.
VAPID_PUBLIC_KEY="PASTE_THE_GENERATED_PUBLIC_KEY"
VAPID_PRIVATE_KEY="PASTE_THE_GENERATED_PRIVATE_KEY"
VAPID_SUBJECT="mailto:admin@ainatech.in"

# Lets the two cron-only routes (attendance reminders, monthly reports —
# see §9 below) authenticate as a scheduler instead of a logged-in admin.
# Generate with: openssl rand -base64 32
CRON_SECRET="PASTE_A_LONG_RANDOM_SECRET"

# Encrypts Password Manager entries and the SMTP password at rest — without
# it, saving either will fail outright (not fall back to plaintext).
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY="PASTE_THE_GENERATED_64-CHARACTER_HEX_STRING"

# Only read by `npm run db:seed`, once. Delete these three lines afterwards.
SEED_ADMIN_EMAIL="you@ainatech.in"
SEED_ADMIN_PASSWORD="a-strong-password"
SEED_ADMIN_NAME="Your Name"
```

**`NODE_ENV`, `PORT` and `HOST` deliberately aren't in there** — putting them in
`.env` looks right and does nothing. `server.js` reads them at the top of the
file:

```js
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "localhost";
const port = Number(process.env.PORT ?? 3000);
```

That runs before `next()` is constructed, and `.env` is only loaded later, inside
Next. So those three lines see the real OS environment and nothing else — set
from `.env`, the app would silently start in **dev mode** on port 3000. They're
set in PM2 instead (§4). The rest (`DATABASE_URL`, `JWT_SECRET`, `APP_URL`) are
read inside route handlers, after Next has loaded `.env`, so they work from the
file.

```bash
chmod 600 .env    # it holds the DB password and signing secret
```

Notes on those values:

- **`JWT_SECRET`** must be long and random. Every session cookie is signed with
  it; changing it later signs everyone out immediately (tokens stop verifying).
  It is read by `src/proxy.ts` on the edge, where there is no database — which is
  why it can't ever move into the admin UI.
- **`APP_URL`** is also editable at Settings → Workspace → Application, and the
  stored value wins over this one. Set it correctly here anyway so invite links
  work before anyone visits the settings page.
- **`ENCRYPTION_KEY`** must be a 64-character hex string (32 bytes) — changing
  or losing it makes every already-saved Password Manager entry and the SMTP
  password undecryptable (they'll need to be re-entered). `npm run build`
  encrypts any pre-existing plaintext rows on first deploy after this is set.

Install, build, seed:

```bash
npm ci
npm run build      # generate + db push (creates every table) + next build
npm run db:seed    # first super admin
```

Then remove the three `SEED_ADMIN_*` lines from `.env` — the seed is one-shot
(it exits early if the user exists), so leaving them just keeps a copy of your
admin password in a file forever.

Smoke test before nginx:

```bash
npm start &
curl -I http://127.0.0.1:3000/login   # expect 200
kill %1
```

---

## 4. PM2

```bash
sudo npm install -g pm2
```

Create `/home/aina/aina-crm/ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: "aina-crm",
      script: "server.js",
      cwd: "/home/aina/aina-crm",

      // MUST stay fork/1. Socket.io lives in-process on globalThis.__io, so a
      // second instance silently breaks realtime for whoever lands on it.
      exec_mode: "fork",
      instances: 1,

      // These three must be real env vars — server.js reads them before Next
      // loads .env, so setting them there would leave the app in dev mode on
      // the wrong interface. Everything else comes from .env via Next.
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOST: "127.0.0.1",
      },

      max_memory_restart: "800M",
      time: true,
    },
  ],
};
```

`HOST=127.0.0.1` keeps Node off the public interface — nginx should be the only
thing that can reach it. Without it `server.js` binds `localhost`, which is
equivalent here, but be explicit.

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u aina --hp /home/aina    # run the command it prints
pm2 logs aina-crm --lines 30
```

---

## 5. nginx

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/aina-crm
```

```nginx
server {
    listen 80;
    server_name crm.ainatech.in;

    # Files arrive base64-encoded inside JSON bodies, so they're ~33% larger
    # than the original. nginx's 1m default rejects avatar and logo uploads
    # with 413 before Node ever sees them.
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Socket.io: without these two, the WebSocket handshake fails and it
        # falls back to slow HTTP polling — realtime "works" but badly.
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # The Security → Active sessions list shows this as the device IP.
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Socket.io pings every ~25s, so 60s would usually survive — this is
        # headroom so idle sockets aren't cut mid-session.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/aina-crm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

`X-Forwarded-For` matters beyond convention: `createSessionCookie()` reads that
header to label sessions. Without it every device in Settings → Security shows
the same IP.

---

## 6. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.ainatech.in
```

Certbot rewrites the vhost for 443 and adds the redirect. Renewal installs its
own timer; check it:

```bash
sudo certbot renew --dry-run
```

Then confirm `APP_URL` (and Settings → Workspace → Application) uses `https://`.
Cookies are `secure` in production, so the app only works over HTTPS anyway.

---

## 7. Updating

```bash
cd /home/aina/aina-crm
git pull origin main
npm ci
npm run build        # applies any schema change via db push
pm2 restart aina-crm
```

There's a gap between `pm2 restart` and the app being ready (Next boots, Prisma
connects), so expect a few seconds of 502. For an internal CRM that's fine; if it
isn't, `pm2 reload` needs cluster mode, which this app can't use — see gotcha 1.

If a build fails on `db push`, **stop and read it**. It means the schema change
can't apply without data loss. Fix the schema; never reach for `--force-reset`.

---

## 8. Backups

The database holds every uploaded file as base64, so dumps are big and matter
more than usual — losing it loses the documents too.

```bash
sudo mkdir -p /var/backups/aina && sudo chown aina:aina /var/backups/aina
nano /home/aina/backup.sh
```

```bash
#!/bin/bash
set -euo pipefail
STAMP=$(date +%F-%H%M)
mysqldump --single-transaction --quick \
  -u aina -p"PUT_A_LONG_RANDOM_PASSWORD_HERE" aina_crm \
  | gzip > "/var/backups/aina/aina_crm-$STAMP.sql.gz"
find /var/backups/aina -name '*.sql.gz' -mtime +14 -delete
```

```bash
chmod 700 /home/aina/backup.sh    # contains the DB password
crontab -e
```

```
0 2 * * * /home/aina/backup.sh >> /home/aina/backup.log 2>&1
```

`--single-transaction` keeps the dump consistent without locking writes.

A backup on the same disk as the database is not a backup — it dies with the VPS.
Copy them off (`rclone`, `scp` from another host, Hostinger snapshots) and
restore one somewhere at least once. An untested backup is a guess.

---

## 9. Attendance, meeting & task reminders, and monthly reports (cron)

Several routes exist purely to be hit on a schedule — nothing in the app
calls them on its own, because a single Node process has no built-in
scheduler:

- **`/api/attendance/send-reminders`** — nudges anyone within 30 minutes of
  a shift's check-in/check-out window closing who hasn't acted yet, plus a
  fixed 12:45 lunch-break nudge to anyone currently at work and not already
  on a break (toast, bell, and OS push). Needs to run every **~15 minutes**,
  comfortably under that 30-minute window.
- **`/api/meetings/send-reminders`** — fires every meeting whose "Remind me
  at" time has passed, to the organizer and every attendee (toast, bell,
  and OS push). Needs to run every **~5 minutes** — a reminder is a specific
  instant someone picked, not a 30-minute window, so this wants a tighter
  cadence than the attendance one.
- **`/api/tasks/send-reminders`** — same idea, for a task's own "Remind me
  at" time, to whoever it's assigned to. Also every **~5 minutes**.
- **`/api/attendance/send-monthly-reports`** — emails everyone their
  attendance snapshot for the month that just ended. Needs to run **once a
  month**, just after midnight on the 1st.

All four authenticate a scheduler via the `x-cron-secret` header matching
`CRON_SECRET` from `.env` (§3) — **without that env var set, these routes
just 403 every request and silently never fire.** Skipping this step is the
most likely reason reminders "don't work": the feature is fully built and
does nothing until something is actually configured to call it.

```bash
crontab -e
```

```
*/15 * * * * curl -s -o /dev/null -X POST -H "x-cron-secret: PUT_THE_SAME_CRON_SECRET_FROM_ENV" https://crm.ainatech.in/api/attendance/send-reminders
*/5 * * * * curl -s -o /dev/null -X POST -H "x-cron-secret: PUT_THE_SAME_CRON_SECRET_FROM_ENV" https://crm.ainatech.in/api/meetings/send-reminders
*/5 * * * * curl -s -o /dev/null -X POST -H "x-cron-secret: PUT_THE_SAME_CRON_SECRET_FROM_ENV" https://crm.ainatech.in/api/tasks/send-reminders
1 0 1 * * curl -s -o /dev/null -X POST -H "x-cron-secret: PUT_THE_SAME_CRON_SECRET_FROM_ENV" https://crm.ainatech.in/api/attendance/send-monthly-reports
```

The OS-push half of all three reminder routes (the part that reaches a phone
with the tab closed or the PWA backgrounded) additionally needs
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` set (§3) — without them
`sendPushToUsers` quietly no-ops, so the in-app toast/bell would still fire
but nothing would ever reach a closed app. Confirm both pieces landed by
checking `pm2 logs aina-crm` right after a manual test hit (`curl` the same
command above) — a 200 with `"sent": 0` means it ran but nobody was due; a
403 means `CRON_SECRET` doesn't match; no line at all means the cron itself
never fired (check `grep CRON /var/log/syslog` or `journalctl -u cron`).

---

## 10. Moving from Render

1. Dump Aiven and load it in: `mysqldump ... | mysql -u aina -p aina_crm`
2. Keep the **same `JWT_SECRET`** to avoid signing everyone out — or accept it
   and let people log in again.
3. Point DNS at the VPS.
4. Update `APP_URL` (env and/or Settings → Workspace → Application).
5. Watch `pm2 logs aina-crm` on first traffic.
6. Suspend the Render service once the VPS is serving.

`render.yaml` can stay; it's inert without a Render service attached.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| 502 from nginx | App isn't listening. `pm2 logs aina-crm` — usually a bad `DATABASE_URL` or MySQL down. |
| Realtime works for some users, not others | More than one instance. `pm2 list` must show a single fork-mode process. |
| Upload fails at ~1 MB | `client_max_body_size` missing or too small. |
| Sockets fall back to polling / drop | `Upgrade`/`Connection` headers missing from the nginx location block. |
| Every session shows the same IP | `X-Forwarded-For` not set. |
| Slow, dev-mode behaviour in production | `NODE_ENV` set in `.env` instead of PM2 — `server.js` reads it before Next loads the file, so it never sees it and starts in dev mode. |
| Build fails on `db push` | A destructive schema change. Fix the schema — never `--force-reset`. |
| Invite links point at the wrong host | `APP_URL` / Settings → Workspace → Application. |
| Everyone signed out after a deploy | `JWT_SECRET` changed. |
| SMTP `ENETUNREACH` | Host has no outbound IPv6. Already handled — the mailer resolves mail hosts to IPv4. |
