# PurCheaper as pure SaaS — model & viability

## What we are (MVP)

**PurCheaper is software**, not a courier company — **with first-class integrations** into driver platforms.

| You provide | Partner owns |
|-------------|----------------|
| Multi-tenant order OS | Device custody & liability |
| **Connectors: Roadie, Shipt, Uber Direct (planned), DoorDash Drive (planned), custom webhooks, own fleet** | Commercial relationship + fees with those platforms |
| Dual status (partner + driver apps) | Outcomes of the physical pickup |
| Tracking number integration | Carrier labels & postage |
| Partner-defined door checklists | Grading rules & disputes |
| Same-day **pay gate** tools | Seller payment funds |
| API / dashboard / event log | Seller support |

Partners pay a **monthly SaaS subscription**.  
They do **not** pay PurCheaper a per-package courier fee — platform labor is billed by Roadie/Shipt/etc. under *their* accounts.

---

## Pricing (MVP)

| Plan | Monthly | Included orders | Overage |
|------|---------|-----------------|---------|
| Starter | **$99** | 200 | $0.25 / order |
| Growth | **$249** | 1,500 | $0.15 / order |
| Network | **$699** | 10,000 | $0.08 / order |

---

## Product capabilities (this iteration)

1. **Partner status updates** — full lifecycle including `shipped` / `in_transit` / `delivered`
2. **Driver status updates** — field lifecycle + pack/verify
3. **Tracking** — `tracking_number`, `tracking_carrier`, `tracking_url` (UPS/FedEx/USPS helpers)
4. **Partner-owned checklists** — templates API; copied onto each order
5. **Event log** — who changed what (partner vs driver)
6. **Driver platform integrations** — Roadie, Shipt (live connectors MVP/mock), Uber Direct & DoorDash Drive planned, manual fleet, custom webhook
7. **Economics panel** — SaaS bill, not driver COGS

### API surface (MVP)

```
POST /api/partner/orders/:id/status
POST /api/partner/orders/:id/tracking
POST /api/partner/orders/:id/dispatch          # Roadie / Shipt / manual / webhook
GET  /api/partner/integrations
POST /api/partner/integrations/:provider/connect
POST /api/integrations/webhooks/:provider     # inbound from platforms
POST /api/driver/orders/:id/status
POST /api/driver/orders/:id/tracking
GET  /api/partner/checklists
POST /api/partner/checklists
```

Typical buyback integration:

1. Create order when quote accepted (`POST /partner/orders`) with `external_ref`
2. **Dispatch** via Roadie/Shipt/fleet (`POST .../dispatch`) or driver claims in-app
3. Door checklist completed → `verified` | `mismatch`
4. Partner releases pay → `paid`
5. Partner (or driver) posts **parcel** tracking → `shipped`
6. Optional status to `delivered` when buyback receives unit

---

## Can this succeed? (honest)

### Why the SaaS pivot is *stronger* than logistics-as-a-service

| Factor | Logistics fee model | Pure SaaS |
|--------|---------------------|-----------|
| Gross margin | Thin, labor-heavy | **Software-like 70–90%** |
| Ops burden | Daily dispatch firefighting | Support + product |
| Liability | High (custody, theft) | **Low** (partner owns) |
| Scalability | Linear with drivers | Cloud multi-tenant |
| Sales story | “We’ll pick up phones” | “Run same-day buyback ops in one system” |
| Competition | Roadie/Uber/UPS | Homegrown spreadsheets + Shopify hacks |

### What still has to be true

1. **Buyback sites feel pain** — same-day conversion vs mail-in, and messy status across drivers/labels/pay.
2. **You sell software that is operationally complete** — status + tracking + checklist + pay gate + API, not a toy CRM.
3. **Onboarding is self-serve** — API docs, sample payloads, checklist builder (MVP has templates).
4. **You do not secretly become their courier** — scope discipline.

### Realistic odds (SaaS framing)

| Outcome | Odds if you execute 12–18 mo |
|---------|------------------------------|
| Fail to get 5 paying partners | Common if no design partners |
| **$2–10k MRR lifestyle SaaS** | **Plausible** with 10–40 buyback/refurb shops |
| **$50k+ MRR niche platform** | Possible if you own “same-day buyback OS” category in US |
| Horizontal “all reverse logistics” giant | Unlikely without heavy capital |

**Net:** The SaaS pivot **raises** odds of a durable business vs running last-mile yourself, **if** you nail GTM to buyback/refurb operators. It **lowers** the need for dense Wasatch driver networks as a company asset (partners bring drivers wherever they operate).

### Risks unique to SaaS

- **“Why not build it?”** — answer: dual actor workflows + tracking + pay gate + audit log in weeks, not quarters.
- **Churn** if product is only a status dropdown — must stay sticky via API embedded in their buy flow.
- **Feature gravity** toward marketplace logistics — resist unless you charge enterprise professional services separately.

---

## Recommended GTM for SaaS MVP

1. **Positioning:** “Same-day buyback operations software — your drivers, your liability, our system of record.”
2. **Design partners:** 2–3 online buyback sites; free pilot plan, paid Growth after 30 days.
3. **Must-have demo path:** create order → driver status → partner status → tracking → paid.
4. **Ship Render** only after that path is airtight (you’re not on Render yet — good).
5. **North star metric:** weekly active partner accounts with ≥1 API order create.

---

## Bottom line

Yes — **this “minor” change is actually a major strategic improvement**:  
you sell **control-plane software** and stay out of package labor and doorstep liability.

Success is **more about packaging + distribution to buyback operators** than about hiring drivers in Utah. The Wasatch corridor remains a great *story* and *demo market*, not a required company-owned fleet.
