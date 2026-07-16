# Deploying Aina CRM on Hostinger

Aina CRM is a **Next.js app with a custom Node.js server** (`server.js`) that also runs a
**Socket.io** realtime server on the same port, backed by **MySQL** (via Prisma). Because it
needs a long‑running Node process and WebSockets, it must be deployed on a **Hostinger VPS**
(or Hostinger Cloud). Shared/Business web hosting cannot keep a persistent Node + WebSocket
server running and is **not** supported for this app.

> Recommended plan: **Hostinger VPS** (KVM 1 or higher) with Ubuntu 22.04/24.04.

---

## 0. What you need before starting

- A Hostinger **VPS** with root/SSH access (hPanel → VPS → Manage → SSH details).
- A **domain** (or subdomain) with its DNS **A record** pointed at the VPS IP.
- The app source (this repository) on GitHub, or a zip you can upload.
- Values for the environment variables (see [step 5](#5-configure-environment-variables)).

---

## 1. Connect to the VPS

```bash
ssh root@YOUR_VPS_IP
```

Update the system:

```bash
apt update && apt upgrade -y
```

---

## 2. Install Node.js, MySQL, Nginx, PM2

### Node.js 20 LTS (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # should print v20.x
npm -v
```

### MySQL server (MariaDB is fine too)

```bash
apt install -y mysql-server
systemctl enable --now mysql
mysql_secure_installation   # set a root password, answer Y to the hardening prompts
```

### Nginx (reverse proxy + SSL termination)

```bash
apt install -y nginx
systemctl enable --now nginx
```

### PM2 (keeps the Node server running & auto‑restarts)

```bash
npm install -g pm2
```

### Git (to pull the code)

```bash
apt install -y git
```

---

## 3. Create the database and a DB user

Open the MySQL shell:

```bash
mysql -u root -p
```

Then run (change the password):

```sql
CREATE DATABASE aina_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'aina'@'localhost' IDENTIFIED BY 'STRONG_DB_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON aina_crm.* TO 'aina'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Note:** Uploaded files (profile images, task attachments, project documents) are stored
> **inside MySQL** as base64 columns — there is no separate file storage to configure or back up.
> Just back up the database and you have everything.

---

## 4. Get the code onto the server

```bash
# Pick a directory for apps
mkdir -p /var/www && cd /var/www

# Clone your repository (replace with your repo URL)
git clone https://github.com/YOUR_ORG/aina-crm.git
cd aina-crm

# Install dependencies
npm ci        # (or: npm install)
```

---

## 5. Configure environment variables

Create a `.env` file in the project root (`/var/www/aina-crm/.env`):

```bash
nano .env
```

Paste and edit:

```env
# --- Database ---
DATABASE_URL="mysql://aina:STRONG_DB_PASSWORD_HERE@localhost:3306/aina_crm"

# --- Auth ---
# Generate a long random secret:  openssl rand -base64 48
JWT_SECRET="PASTE_A_LONG_RANDOM_SECRET_HERE"

# --- App ---
# Public URL of the site (used in invite links). Must match your domain + https.
APP_URL="https://crm.yourdomain.com"
# Port the Node server listens on locally (Nginx proxies to this). Default 3000.
PORT=3000
NODE_ENV=production

# --- First Super Admin (created by the seed script) ---
SEED_ADMIN_EMAIL="admin@ainatech.in"
SEED_ADMIN_PASSWORD="CHANGE_THIS_STRONG_PASSWORD"
SEED_ADMIN_NAME="Super Admin"

# --- SMTP (optional; can also be configured later in the app UI under Email (SMTP)) ---
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM="Aina CRM <no-reply@yourdomain.com>"
```

Generate a strong `JWT_SECRET`:

```bash
openssl rand -base64 48
```

> SMTP is optional here — an admin can configure it in‑app at **Email (SMTP)** in the sidebar,
> and those settings are stored in the database and take precedence over these env values.

---

## 6. Set up the database schema and seed the admin

```bash
# Generate the Prisma client
npm run db:generate

# Create all tables from the schema (first deploy).
npx prisma db push
#   For an established DB with migration history, use:  npx prisma migrate deploy

# Create the first Super Admin from the SEED_ADMIN_* env vars
npm run db:seed
```

---

## 7. Build the app

```bash
npm run build
```

---

## 8. Start the server with PM2

The app runs via its custom server (`npm start` → `node server.js`).

```bash
# Start it under PM2
pm2 start npm --name aina-crm -- start

# Save the process list and enable start-on-boot
pm2 save
pm2 startup    # run the command it prints, then:  pm2 save

# Useful commands
pm2 status
pm2 logs aina-crm
pm2 restart aina-crm
```

At this point the app is running on `http://127.0.0.1:3000` (or your `PORT`).

---

## 9. Configure Nginx as a reverse proxy (with WebSocket support)

Socket.io needs the `Upgrade`/`Connection` headers to be forwarded, or realtime updates
(notifications, live board changes) won't work.

Create the site config:

```bash
nano /etc/nginx/sites-available/aina-crm
```

Paste (replace the domain and `PORT` if you changed it):

```nginx
server {
    listen 80;
    server_name crm.yourdomain.com;

    # Allow large uploads (attachments/documents are up to 10MB, base64 adds ~33%)
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket upgrade (required for Socket.io realtime)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
```

Enable it and reload:

```bash
ln -s /etc/nginx/sites-available/aina-crm /etc/nginx/sites-enabled/
nginx -t          # test the config
systemctl reload nginx
```

---

## 10. Enable HTTPS (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d crm.yourdomain.com
```

Certbot edits the Nginx config to add SSL and sets up auto‑renewal. Confirm renewal works:

```bash
certbot renew --dry-run
```

Make sure `APP_URL` in `.env` uses `https://` — if you change it, `pm2 restart aina-crm`.

---

## 11. Firewall (recommended)

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

Do **not** open port 3000 publicly — only Nginx (80/443) should be reachable; it proxies to
Node locally.

---

## 12. Verify

1. Visit `https://crm.yourdomain.com` — the login page should load.
2. Log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
3. Open a Leads/Tasks board in two tabs and confirm realtime updates (drag a card / create one)
   — this proves the Socket.io WebSocket path through Nginx works.
4. Upload a task attachment and re‑download it — confirms MySQL file storage works.

---

## 13. Updating / redeploying a new version

```bash
cd /var/www/aina-crm
git pull

npm ci
npm run db:generate
npx prisma db push          # or: npx prisma migrate deploy
npm run build
pm2 restart aina-crm
```

---

## 14. Backups

Everything (including uploaded files) lives in MySQL, so a DB dump is a full backup.

```bash
# Manual backup
mysqldump -u aina -p aina_crm > aina_crm_$(date +%F).sql

# Restore
mysql -u aina -p aina_crm < aina_crm_YYYY-MM-DD.sql
```

Automate it with a daily cron job:

```bash
crontab -e
# Add (runs 2am daily, keeps in /root/backups):
0 2 * * * mkdir -p /root/backups && mysqldump -u aina -pSTRONG_DB_PASSWORD_HERE aina_crm > /root/backups/aina_crm_$(date +\%F).sql
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| 502 Bad Gateway | Node not running — `pm2 status`, `pm2 logs aina-crm`. Check `PORT` matches Nginx `proxy_pass`. |
| Realtime not updating | WebSocket headers missing — confirm the `Upgrade`/`Connection` lines are in the Nginx `location /` block; `nginx -t && systemctl reload nginx`. |
| `PrismaClientInitializationError` | `DATABASE_URL` wrong, or DB user lacks privileges. Re‑check step 3 and the `.env`. |
| Invite links point to `localhost` | Set `APP_URL` to your real `https://` domain, then `pm2 restart aina-crm`. |
| Login fails after deploy | Ensure `npm run db:seed` ran (creates the Super Admin) and the schema was pushed. |
| Uploads fail over ~10MB | App caps files at 10MB; also confirm Nginx `client_max_body_size` is `20M`. |
| Changes not showing after `git pull` | You must `npm run build` and `pm2 restart aina-crm` — production serves the built output. |

---

## Quick reference — one‑shot deploy (after prerequisites installed)

```bash
cd /var/www && git clone https://github.com/YOUR_ORG/aina-crm.git && cd aina-crm
npm ci
# create .env (step 5)
npm run db:generate && npx prisma db push && npm run db:seed
npm run build
pm2 start npm --name aina-crm -- start && pm2 save
# configure Nginx (step 9) + certbot (step 10)
```
