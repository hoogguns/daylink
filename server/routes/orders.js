const express = require('express');
const { requirePartner, requireAuth } = require('../middleware/auth');
const {
  createOrder,
  getOrderById,
  listOrders,
  getEvents,
  assignDriver,
  updateStatus,
  verifyDevice,
  processPayment,
  partnerStats,
  partnerEconomics,
} = require('../services/orders');
const { getDb } = require('../db');
const { PLANS, COGS, cogsPerPickup } = require('../config/pricing');

const router = express.Router();

// ── Partner endpoints ──────────────────────────────────────────────

router.get('/partner/stats', requirePartner, (req, res) => {
  res.json(partnerStats(req.user.id));
});

router.get('/partner/economics', requirePartner, (req, res) => {
  try {
    res.json(partnerEconomics(req.user.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/partner/pricing', requirePartner, (_req, res) => {
  res.json({ plans: PLANS, cogs_defaults: COGS, cogs_per_pickup: cogsPerPickup() });
});

router.get('/partner/orders', requirePartner, (req, res) => {
  const { status, q, limit, offset } = req.query;
  const result = listOrders({
    partnerId: req.user.id,
    status: status || undefined,
    q: q || undefined,
    limit: Math.min(parseInt(limit, 10) || 50, 200),
    offset: parseInt(offset, 10) || 0,
  });
  res.json(result);
});

router.post('/partner/orders', requirePartner, (req, res) => {
  const b = req.body || {};
  const required = [
    'seller_name',
    'seller_phone',
    'pickup_address',
    'pickup_city',
    'pickup_zip',
    'device_brand',
    'device_model',
    'device_condition',
    'quoted_amount',
  ];
  for (const field of required) {
    if (b[field] === undefined || b[field] === null || b[field] === '') {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }
  if (Number(b.quoted_amount) <= 0) {
    return res.status(400).json({ error: 'quoted_amount must be positive' });
  }

  try {
    const order = createOrder(req.user.id, {
      ...b,
      quoted_amount: Number(b.quoted_amount),
    });
    res.status(201).json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.get('/partner/orders/:id', requirePartner, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order || order.partner_id !== req.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  const events = getEvents(order.id);
  res.json({ order, events });
});

router.post('/partner/orders/:id/pay', requirePartner, (req, res) => {
  try {
    const order = processPayment(req.params.id, req.user.id, req.body || {});
    res.json({ order, message: 'Same-day payment initiated' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/partner/orders/:id/cancel', requirePartner, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order || order.partner_id !== req.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (['paid', 'cancelled'].includes(order.status)) {
    return res.status(400).json({ error: 'Cannot cancel this order' });
  }
  try {
    const updated = updateStatus(
      order.id,
      'cancelled',
      { type: 'partner', id: req.user.id },
      { cancel_reason: (req.body && req.body.reason) || 'Cancelled by partner' }
    );
    res.json({ order: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/partner/orders/:id/assign', requirePartner, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order || order.partner_id !== req.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  const { driver_id } = req.body || {};
  if (!driver_id) return res.status(400).json({ error: 'driver_id required' });
  try {
    const updated = assignDriver(order.id, driver_id, { type: 'partner', id: req.user.id });
    res.json({ order: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Driver endpoints ───────────────────────────────────────────────

router.get('/driver/orders', requireAuth('driver'), (req, res) => {
  const mine = listOrders({ driverId: req.user.id, limit: 100 });
  const open = listOrders({ status: 'pending', limit: 50 });
  res.json({
    assigned: mine.orders.filter((o) => !['paid', 'cancelled'].includes(o.status)),
    available: open.orders,
  });
});

router.post('/driver/orders/:id/claim', requireAuth('driver'), (req, res) => {
  try {
    const updated = assignDriver(req.params.id, req.user.id, { type: 'driver', id: req.user.id });
    // mark en_route optionally via body
    if (req.body && req.body.start_route) {
      const r = updateStatus(updated.id, 'en_route', { type: 'driver', id: req.user.id });
      return res.json({ order: r });
    }
    res.json({ order: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/driver/orders/:id/status', requireAuth('driver'), (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your order' });
  }
  const { status } = req.body || {};
  const allowed = ['en_route', 'picked_up', 'verifying'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Driver may set status to: ${allowed.join(', ')}` });
  }
  try {
    const updated = updateStatus(order.id, status, { type: 'driver', id: req.user.id });
    res.json({ order: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/driver/orders/:id/verify', requireAuth('driver'), (req, res) => {
  try {
    const order = verifyDevice(req.params.id, req.user.id, req.body || {});
    res.json({
      order,
      message: order.verification_match
        ? 'Device matches specs — eligible for same-day payment'
        : 'Mismatch recorded — partner review required before payment',
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/driver/orders/:id', requireAuth('driver'), (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.driver_id !== req.user.id && order.status !== 'pending') {
    return res.status(403).json({ error: 'Not your order' });
  }
  res.json({ order, events: getEvents(order.id) });
});

// ── Shared lookup (drivers list for assign) ────────────────────────

router.get('/partner/drivers', requirePartner, (req, res) => {
  const db = getDb();
  const drivers = db
    .prepare(
      `SELECT id, name, phone, vehicle, zones, rating, status, driver_code, trained
       FROM drivers WHERE trained = 1 ORDER BY rating DESC`
    )
    .all()
    .map((d) => ({ ...d, zones: JSON.parse(d.zones || '[]'), trained: !!d.trained }));
  res.json({ drivers });
});

module.exports = router;
