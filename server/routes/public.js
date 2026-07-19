const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const { marketplaceStats } = require('../services/orders');
const { PLANS, COGS, cogsPerPickup } = require('../config/pricing');

const router = express.Router();

const COVERAGE = {
  market: 'Salt Lake City metro — Wasatch Front',
  state: 'Utah',
  corridor: 'Ogden → Salt Lake City → Provo',
  cities: [
    { name: 'Ogden', zone: 'north' },
    { name: 'Layton', zone: 'north' },
    { name: 'Bountiful', zone: 'north' },
    { name: 'Salt Lake City', zone: 'central' },
    { name: 'West Valley City', zone: 'central' },
    { name: 'Murray', zone: 'central' },
    { name: 'Sandy', zone: 'central' },
    { name: 'Draper', zone: 'south' },
    { name: 'Lehi', zone: 'south' },
    { name: 'Orem', zone: 'south' },
    { name: 'Provo', zone: 'south' },
  ],
  hours: '7 days / week, typically 8am–8pm MT',
  promise: 'Same-day pickup and payment eligibility after on-site verification',
};

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'purcheaper',
    market: COVERAGE.market,
    version: '1.1.0',
    env: process.env.NODE_ENV || 'development',
  });
});

/** Public pricing sheet (no auth) — pure SaaS */
router.get('/pricing', (_req, res) => {
  res.json({
    market: COVERAGE.market,
    currency: 'USD',
    model: 'saas_subscription',
    plans: Object.values(PLANS).filter((p) => p.id !== 'pilot'),
    notes: [
      'Subscription SaaS for buyback operators — not a courier marketplace fee.',
      'Partners own drivers, liability, and door-grading checklists.',
      'Included order volume per plan; soft overage only if you exceed the cap.',
      'Tracking numbers, dual status (partner + driver), API, payment-gate tools included.',
    ],
    platform_cogs_note: 'PurCheaper COGS is hosting/support — not per-package labor.',
    platform_cogs: COGS,
  });
});

router.get('/coverage', (_req, res) => {
  res.json(COVERAGE);
});

router.get('/stats', (_req, res) => {
  // public marketing stats (aggregated, non-sensitive)
  const s = marketplaceStats();
  res.json({
    market: COVERAGE.market,
    demo_orders_tracked: s.orders,
    active_partner_accounts: s.partners,
    trained_drivers: s.drivers,
    paid_volume_demo: s.paid_volume,
    paid_today_demo: s.paid_today_count,
  });
});

router.get('/how-it-works', (_req, res) => {
  res.json({
    title: 'How PurCheaper works',
    audiences: {
      sellers: [
        { step: 1, title: 'Sell online', body: 'Get a quote from your preferred online buyback store.' },
        { step: 2, title: 'Book pickup', body: 'Choose PurCheaper same-day pickup for the Wasatch Front.' },
        { step: 3, title: 'Hand off at home', body: 'A trained gig driver arrives at your door.' },
        { step: 4, title: 'Get paid same day', body: 'After the device matches the quote specs, payment releases the same day.' },
      ],
      partners: [
        { step: 1, title: 'Connect your buyback flow', body: 'Create pickup orders via dashboard or API when a seller accepts a quote.' },
        { step: 2, title: 'Your drivers claim the job', body: 'You staff drivers (gig or W-2). They use PurCheaper for status + your checklist.' },
        { step: 3, title: 'Door grade on your rules', body: 'Partner-owned checklists grade the device; you own liability and outcomes.' },
        { step: 4, title: 'Track + pay + ship', body: 'Push carrier tracking, dual status updates, same-day pay gate when verified.' },
      ],
    },
  });
});

router.post('/leads', (req, res) => {
  const { type, name, email, company, phone, message } = req.body || {};
  if (!type || !name || !email) {
    return res.status(400).json({ error: 'type, name, and email are required' });
  }
  if (!['partner', 'seller', 'driver', 'general'].includes(type)) {
    return res.status(400).json({ error: 'type must be partner, seller, driver, or general' });
  }
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO leads (id, type, name, email, company, phone, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, type, name, email, company || null, phone || null, message || null);
  res.status(201).json({ ok: true, id, message: 'Thanks — we will be in touch shortly.' });
});

module.exports = router;
