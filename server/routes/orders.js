const express = require('express');
const { requirePartner, requireAuth } = require('../middleware/auth');
const {
  createOrder,
  getOrderById,
  listOrders,
  getEvents,
  assignDriver,
  updateStatus,
  updateTracking,
  verifyDevice,
  processPayment,
  partnerStats,
  partnerEconomics,
  STATUSES,
} = require('../services/orders');
const { ACTOR_STATUSES } = require('../services/status');
const checklists = require('../services/checklists');
const dispatch = require('../services/dispatch');
const { getDb } = require('../db');
const { PLANS, COGS } = require('../config/pricing');

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
  res.json({
    model: 'saas_subscription',
    plans: PLANS,
    platform_cogs: COGS,
    note: 'Pure SaaS — partners own drivers, liability, and door grading checklists.',
  });
});

router.get('/partner/statuses', requirePartner, (_req, res) => {
  res.json({
    all: STATUSES,
    partner_can_set: ACTOR_STATUSES.partner,
    driver_can_set: ACTOR_STATUSES.driver,
  });
});

// Checklists (partner-owned grading)
router.get('/partner/checklists', requirePartner, (req, res) => {
  res.json({ checklists: checklists.listTemplates(req.user.id) });
});

router.post('/partner/checklists', requirePartner, (req, res) => {
  try {
    const tpl = checklists.createTemplate(req.user.id, req.body || {});
    res.status(201).json({ checklist: tpl });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/partner/checklists/:id', requirePartner, (req, res) => {
  try {
    const tpl = checklists.updateTemplate(req.user.id, req.params.id, req.body || {});
    res.json({ checklist: tpl });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
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
  res.json({
    order,
    events,
    actions: {
      can_set_status: ACTOR_STATUSES.partner,
      can_update_tracking: true,
      can_pay: order.status === 'verified' && !order.paid,
    },
  });
});

/** Partner status update (ops / buyback backend / support) */
router.post('/partner/orders/:id/status', requirePartner, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order || order.partner_id !== req.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  const { status, notes, cancel_reason } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status required' });
  try {
    const updated = updateStatus(
      order.id,
      status,
      { type: 'partner', id: req.user.id },
      { notes, cancel_reason }
    );
    res.json({ order: updated, message: `Status set to ${status}` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * Partner tracking integration — push buyback label / carrier tracking number.
 * Body: { tracking_number, tracking_carrier, tracking_url?, mark_shipped? }
 */
router.post('/partner/orders/:id/tracking', requirePartner, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order || order.partner_id !== req.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  try {
    const updated = updateTracking(order.id, { type: 'partner', id: req.user.id }, req.body || {});
    res.json({ order: updated, message: 'Tracking updated' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
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
  if (['delivered', 'cancelled'].includes(order.status)) {
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
    assigned: mine.orders.filter((o) => !['paid', 'cancelled', 'delivered'].includes(o.status)),
    available: open.orders,
  });
});

router.post('/driver/orders/:id/claim', requireAuth('driver'), (req, res) => {
  try {
    const updated = assignDriver(req.params.id, req.user.id, { type: 'driver', id: req.user.id });
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
  const { status, notes } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status required' });
  try {
    const updated = updateStatus(order.id, status, { type: 'driver', id: req.user.id }, { notes });
    res.json({ order: updated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Driver can attach last-mile / parcel tracking after drop */
router.post('/driver/orders/:id/tracking', requireAuth('driver'), (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your order' });
  }
  try {
    const updated = updateTracking(order.id, { type: 'driver', id: req.user.id }, req.body || {});
    res.json({ order: updated, message: 'Tracking updated' });
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
        ? 'Checklist passed — partner may release same-day payment'
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
  res.json({
    order,
    events: getEvents(order.id),
    actions: { can_set_status: ACTOR_STATUSES.driver, can_update_tracking: true },
  });
});

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

// ── Driver platform integrations (Roadie, Shipt, …) ────────────────

router.get('/partner/integrations', requirePartner, (req, res) => {
  res.json({
    model: 'saas_connectors',
    note: 'PurCheaper integrates with gig platforms; you choose the provider. Liability follows partner + platform terms.',
    integrations: dispatch.listPartnerIntegrations(req.user.id),
  });
});

router.post('/partner/integrations/:provider/connect', requirePartner, (req, res) => {
  try {
    const integration = dispatch.connectProvider(req.user.id, req.params.provider, req.body || {});
    res.json({ integration, message: `${integration.name} connected` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Send order to Roadie / Shipt / manual / custom webhook (MVP mock job id) */
router.post('/partner/orders/:id/dispatch', requirePartner, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order || order.partner_id !== req.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  try {
    const result = dispatch.dispatchOrder(order, req.user.id, req.body || {});
    // log via status service path — soft event
    const db = getDb();
    const { v4: uuid } = require('uuid');
    db.prepare(
      `INSERT INTO order_events (id, order_id, actor_type, actor_id, event, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      order.id,
      'partner',
      req.user.id,
      'dispatched',
      JSON.stringify({
        provider: result.provider.id,
        external_id: result.job.external_id,
        mock: result.job.mock,
      })
    );
    const updated = getOrderById(order.id);
    res.status(201).json({
      order: updated,
      dispatch: result.job,
      provider: result.provider,
      message: result.message,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/partner/orders/:id/dispatch', requirePartner, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order || order.partner_id !== req.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({
    order_id: order.id,
    dispatch_provider: order.dispatch_provider || null,
    dispatch_external_id: order.dispatch_external_id || null,
    dispatch_status: order.dispatch_status || null,
    jobs: dispatch.listJobsForOrder(order.id),
  });
});

/** Public webhook intake for platform callbacks (auth in production via secrets) */
router.post('/integrations/webhooks/:provider', (req, res) => {
  try {
    const result = dispatch.handleProviderWebhook(req.params.provider, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
