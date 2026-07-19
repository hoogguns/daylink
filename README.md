# DayLink

**Same-day device pickup logistics for online buyback stores.**

Pilot market: **Salt Lake City metro — Wasatch Front (Ogden → Salt Lake City → Provo), Utah.**

DayLink connects cell phone / device buyback websites with sellers at home via trained gig-economy drivers. Drivers verify the device against the buyback site’s quoted specs, pack it to SOP, and unlock **same-day seller payment** when everything matches — a competitive edge in a crowded mail-in market.

| Surface | URL (local) | Audience |
|--------|-------------|----------|
| Marketing site | http://localhost:3847/ | Sellers, partners, press |
| Partner dashboard | http://localhost:3847/dashboard | Buyback website operators |
| Partner onboarding | http://localhost:3847/partners | New buyback partners |
| Driver portal | http://localhost:3847/drivers | Trained gig drivers |
| Pricing | http://localhost:3847/partners#pricing | Partner pricing sheet |
| Economics | http://localhost:3847/dashboard#economics | Live invoice + profit + calculator |
| Launch checklist | http://localhost:3847/launch | Internal go-live list |
| REST API | http://localhost:3847/api/* | Integrations |

## Why this product

- **Buyback sites** need faster cash-to-seller without taking on blind fraud risk.
- **Sellers** abandon quotes when payout is “7–14 days after we receive the phone.”
- **DayLink** inserts doorstep verification + packing so payment can fire the same day **only after a match**.

## Stack

- **Backend:** Node.js, Express, JSON file store, JWT + API keys
- **Frontend:** Dense static HTML/CSS/JS (no build step) served by Express
- **Auth:** Partner JWT / `X-API-Key`, Driver JWT

## Quick start

```bash
npm install
cp .env.example .env
npm run seed
npm start
```

Open http://localhost:3847

### Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Partner | `partner@wasatchbuyback.demo` | `demo1234` |
| Driver | `sam.driver@daylink.demo` | `driver1234` |

Reset demo data:

```bash
npm run db:reset
```

## Order lifecycle

```
pending → assigned → en_route → picked_up → verifying → verified → paid
                                              ↘ mismatch (pay held)
```

1. Buyback partner creates an order (dashboard or API) with `expected_specs` and `quoted_amount`.
2. Trained driver claims / is assigned and goes en route.
3. Driver picks up, runs verification checklist, packs device.
4. **Match** → `verified` → partner releases same-day pay.
5. **Mismatch** → `mismatch` → partner reviews before any funds move.

## Partner API (highlights)

```http
POST /api/auth/partner/login
POST /api/partner/orders
GET  /api/partner/orders
GET  /api/partner/orders/:id
POST /api/partner/orders/:id/pay
POST /api/partner/orders/:id/assign
GET  /api/partner/stats
GET  /api/partner/economics
GET  /api/partner/pricing
GET  /api/partner/drivers
GET  /api/pricing
```

Authenticate with `Authorization: Bearer <token>` or `X-API-Key: dl_live_…`.

## How DayLink makes money

Partners pay **platform + per completed pickup** (see `/partners#pricing`).  
Your cost is mainly **driver + pack kit + risk + ops** (~$27 default; override with `COGS_*` env vars).  

**Contribution** = partner invoice − COGS on completed pickups.  
The partner dashboard **This month · money** panel shows both **their spend** and **your estimated profit** on their volume.

## Launch

1. Set a strong `JWT_SECRET` and `NODE_ENV=production` on the host.  
2. Walk `/launch` checklist.  
3. Create a real partner account (or use demo seed only for demos).  
4. Point a domain at the Node process (or put it behind a reverse proxy).  
5. Review `/privacy` and `/terms` with counsel before scale.

```bash
npm install
cp .env.example .env
# edit JWT_SECRET, COGS_*, PORT
npm start
```

Public:

```http
GET  /api/health
GET  /api/coverage
GET  /api/stats
GET  /api/how-it-works
POST /api/leads
```

## Project layout

```
daylink/
  server/           Express API, SQLite, seed
  public/           Marketing + partner + driver UIs
  data/             SQLite DB (gitignored)
  package.json
  README.md
```

## Market

- **State:** Utah  
- **Corridor:** Ogden · Layton · Bountiful · Salt Lake City · Murray · Sandy · Draper · Lehi · Orem · Provo  
- **Model:** Gig drivers + DayLink buyback training (packing, locks, condition grades)

## Repo

https://github.com/hoogguns/daylink

## License

MIT
