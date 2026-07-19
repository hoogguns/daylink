# Deploy PurCheaper on Render (HTTPS)

Render puts **HTTPS in front of your app automatically**. You do not install certificates or configure Nginx for TLS.

## What you get

| URL type | HTTPS |
|----------|--------|
| `https://PurCheaper-xxxx.onrender.com` | Automatic (free TLS) |
| Custom domain e.g. `https://PurCheaper.com` | Automatic after DNS is set |

HTTP requests are redirected to HTTPS by Render’s edge.

---

## Option A — Dashboard (fastest)

1. Push latest code to **https://github.com/hoogguns/purcheaper** (already done if you’re up to date).
2. Go to [https://dashboard.render.com](https://dashboard.render.com) → sign in with GitHub.
3. **New +** → **Web Service**.
4. Connect **hoogguns/purcheaper**.
5. Settings:

   | Field | Value |
   |-------|--------|
   | **Name** | `PurCheaper` |
   | **Region** | Oregon (or closest) |
   | **Runtime** | Node |
   | **Build command** | `npm install` |
   | **Start command** | `npm start` |
   | **Instance type** | Free (or Starter if you need a disk) |

6. **Environment** variables:

   | Key | Value |
   |-----|--------|
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | long random string (Render can generate) |
   | `DB_PATH` | `./data/purcheaper.json` (free) or `/var/data/purcheaper.json` (with disk) |
   | `COGS_DRIVER` | `20` (optional) |
   | `COGS_SUPPLIES` | `2.5` |
   | `COGS_RISK` | `1.5` |
   | `COGS_OPS` | `3` |

   Do **not** set `PORT` — Render injects it. PurCheaper already uses `process.env.PORT`.

7. Click **Create Web Service**. Wait for the first deploy (green).
8. Open **`https://<your-service>.onrender.com`** — padlock = HTTPS is live.

Health check: `https://<your-service>.onrender.com/api/health`

---

## Option B — Blueprint (`render.yaml`)

1. In Render: **New +** → **Blueprint**.
2. Select **hoogguns/purcheaper** (repo root has `render.yaml`).
3. Apply. Set/confirm env vars (especially `JWT_SECRET`).
4. Deploy.

---

## Custom domain + HTTPS

1. In the Render service → **Settings** → **Custom Domains** → **Add**.
2. Enter `PurCheaper.com` and/or `www.PurCheaper.com`.
3. Render shows DNS records (usually a **CNAME** to `something.onrender.com`).
4. At your DNS host (Namecheap, Cloudflare, Google Domains, etc.), add those records.
5. Wait for DNS (minutes to a few hours). Render provisions a **Let’s Encrypt** cert automatically.
6. Visit **`https://yourdomain.com`**.

If you use Cloudflare: proxy can stay orange-clouded; SSL mode **Full** is fine with Render.

---

## Important: data on free tier

Render **free** web services:

- Spin down after idle (~15 min) — first request can be slow.
- **Filesystem is ephemeral** — `purcheaper.json` is wiped on redeploy/restart.

For a real pilot:

- Use a **paid** instance + **persistent disk** mounted at `/var/data`, with `DB_PATH=/var/data/purcheaper.json`, **or**
- Move later to Postgres (Render Postgres) when you’re ready.

Demo seed runs automatically if the DB file is empty on boot.

---

## After deploy checklist

- [ ] `https://…/api/health` returns `{"ok":true,…}`
- [ ] Partner login works on `/dashboard`
- [ ] Set a strong `JWT_SECRET` (not the local dev secret)
- [ ] Optional: `CORS_ORIGIN=https://yourdomain.com` if you ever split frontend/API
- [ ] Custom domain shows valid cert in the browser

---

## Local vs Render

| | Local | Render |
|--|--------|--------|
| URL | `http://localhost:3847` | `https://….onrender.com` |
| TLS | none | automatic |
| PORT | 3847 from `.env` | set by Render |
| DB | `./data/purcheaper.json` | ephemeral unless disk |
