const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const { resolvePlan, estimateInvoice, estimateOperatorMargin, PLANS, COGS } = require('../config/pricing');

const STATUSES = [
  'pending',
  'assigned',
  'en_route',
  'picked_up',
  'verifying',
  'verified',
  'paid',
  'mismatch',
  'cancelled',
];

function logEvent(db, orderId, event, detail, actorType = 'system', actorId = null) {
  db.prepare(
    `INSERT INTO order_events (id, order_id, actor_type, actor_id, event, detail)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uuid(), orderId, actorType, actorId, event, detail ? JSON.stringify(detail) : null);
}

function touch(db, orderId) {
  db.prepare(`UPDATE orders SET updated_at = datetime('now') WHERE id = ?`).run(orderId);
}

function parseOrder(row) {
  if (!row) return null;
  return {
    ...row,
    expected_specs: safeJson(row.expected_specs),
    verified_specs: safeJson(row.verified_specs),
    packed: !!row.packed,
    paid: !!row.paid,
    verification_match: row.verification_match === null ? null : !!row.verification_match,
  };
}

function safeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function createOrder(partnerId, data) {
  const db = getDb();
  const id = uuid();
  const expected =
    typeof data.expected_specs === 'string'
      ? data.expected_specs
      : JSON.stringify(
          data.expected_specs || {
            brand: data.device_brand,
            model: data.device_model,
            storage: data.device_storage,
            color: data.device_color,
            condition: data.device_condition,
            powers_on: true,
            screen_cracks: false,
            account_locked: false,
          }
        );

  db.prepare(
    `INSERT INTO orders (
      id, partner_id, external_ref, status,
      seller_name, seller_phone, seller_email,
      pickup_address, pickup_city, pickup_zip, pickup_lat, pickup_lng,
      device_brand, device_model, device_storage, device_color, device_condition,
      imei, serial_number, quoted_amount, currency, expected_specs,
      window_start, window_end
    ) VALUES (
      ?, ?, ?, 'pending',
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?
    )`
  ).run(
    id,
    partnerId,
    data.external_ref || null,
    data.seller_name,
    data.seller_phone,
    data.seller_email || null,
    data.pickup_address,
    data.pickup_city,
    data.pickup_zip,
    data.pickup_lat || null,
    data.pickup_lng || null,
    data.device_brand,
    data.device_model,
    data.device_storage || null,
    data.device_color || null,
    data.device_condition,
    data.imei || null,
    data.serial_number || null,
    data.quoted_amount,
    data.currency || 'USD',
    expected,
    data.window_start || null,
    data.window_end || null
  );

  logEvent(db, id, 'created', { external_ref: data.external_ref, quoted_amount: data.quoted_amount }, 'partner', partnerId);
  return getOrderById(id);
}

function getOrderById(id) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT o.*,
              p.company_name AS partner_name,
              d.name AS driver_name,
              d.phone AS driver_phone,
              d.driver_code AS driver_code
       FROM orders o
       LEFT JOIN partners p ON p.id = o.partner_id
       LEFT JOIN drivers d ON d.id = o.driver_id
       WHERE o.id = ?`
    )
    .get(id);
  return parseOrder(row);
}

function listOrders({ partnerId, driverId, status, q, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (partnerId) {
    where.push('o.partner_id = ?');
    params.push(partnerId);
  }
  if (driverId) {
    where.push('o.driver_id = ?');
    params.push(driverId);
  }
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (q) {
    where.push(
      `(o.seller_name LIKE ? OR o.device_model LIKE ? OR o.external_ref LIKE ? OR o.pickup_city LIKE ? OR o.imei LIKE ?)`
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT o.*,
              p.company_name AS partner_name,
              d.name AS driver_name
       FROM orders o
       LEFT JOIN partners p ON p.id = o.partner_id
       LEFT JOIN drivers d ON d.id = o.driver_id
       ${clause}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM orders o ${clause}`)
    .get(...params).c;

  return { orders: rows.map(parseOrder), total, limit, offset };
}

function getEvents(orderId) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC`)
    .all(orderId)
    .map((e) => ({ ...e, detail: safeJson(e.detail) }));
}

function assignDriver(orderId, driverId, actor = {}) {
  const db = getDb();
  const order = getOrderById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (!['pending', 'assigned'].includes(order.status)) {
    throw Object.assign(new Error('Order cannot be assigned in current status'), { status: 400 });
  }
  db.prepare(`UPDATE orders SET driver_id = ?, status = 'assigned' WHERE id = ?`).run(driverId, orderId);
  touch(db, orderId);
  logEvent(db, orderId, 'assigned', { driver_id: driverId }, actor.type || 'system', actor.id || null);
  return getOrderById(orderId);
}

function updateStatus(orderId, status, actor = {}, extra = {}) {
  if (!STATUSES.includes(status)) {
    throw Object.assign(new Error(`Invalid status: ${status}`), { status: 400 });
  }
  const db = getDb();
  const order = getOrderById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

  const sets = ['status = ?'];
  const vals = [status];
  if (extra.packed != null) {
    sets.push('packed = ?', "packed_at = datetime('now')");
    vals.push(extra.packed ? 1 : 0);
  }
  if (extra.cancel_reason) {
    sets.push('cancel_reason = ?');
    vals.push(extra.cancel_reason);
  }
  vals.push(orderId);
  db.prepare(`UPDATE orders SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
  logEvent(db, orderId, 'status_change', { status, ...extra }, actor.type || 'system', actor.id || null);
  return getOrderById(orderId);
}

/**
 * Driver verifies device against expected_specs.
 * Match => verified (eligible for same-day pay).
 * Mismatch => mismatch (partner reviews before pay).
 */
function verifyDevice(orderId, driverId, payload) {
  const db = getDb();
  const order = getOrderById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.driver_id !== driverId) {
    throw Object.assign(new Error('Not assigned to this driver'), { status: 403 });
  }
  if (!['picked_up', 'verifying', 'en_route'].includes(order.status) && order.status !== 'assigned') {
    // allow from picked_up primarily; also verifying retry
    if (!['picked_up', 'verifying'].includes(order.status)) {
      throw Object.assign(new Error('Device must be picked up before verification'), { status: 400 });
    }
  }

  const expected = order.expected_specs || {};
  const observed = payload.observed_specs || {};
  const checklist = payload.checklist || {};

  const mismatches = [];
  const keys = new Set([...Object.keys(expected), ...Object.keys(observed)]);
  for (const key of keys) {
    if (expected[key] === undefined || observed[key] === undefined) continue;
    const a = String(expected[key]).toLowerCase().trim();
    const b = String(observed[key]).toLowerCase().trim();
    if (a !== b) mismatches.push({ field: key, expected: expected[key], observed: observed[key] });
  }

  // hard fail locks
  if (checklist.account_locked === true || checklist.icloud_locked === true || checklist.frp_locked === true) {
    mismatches.push({ field: 'account_lock', expected: false, observed: true });
  }
  if (checklist.powers_on === false) {
    mismatches.push({ field: 'powers_on', expected: true, observed: false });
  }

  const match = mismatches.length === 0 && checklist.meets_condition !== false;
  const status = match ? 'verified' : 'mismatch';
  const packed = payload.packed !== false ? 1 : 0;

  db.prepare(
    `UPDATE orders SET
      status = ?,
      verified_specs = ?,
      verification_notes = ?,
      verification_match = ?,
      packed = ?,
      packed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE packed_at END,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    status,
    JSON.stringify({ ...observed, checklist, mismatches }),
    payload.notes || null,
    match ? 1 : 0,
    packed,
    packed,
    orderId
  );

  logEvent(
    db,
    orderId,
    match ? 'verified' : 'mismatch',
    { match, mismatches, packed: !!packed },
    'driver',
    driverId
  );

  return getOrderById(orderId);
}

function processPayment(orderId, partnerId, { method = 'ach_same_day', payment_ref } = {}) {
  const db = getDb();
  const order = getOrderById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.partner_id !== partnerId) {
    throw Object.assign(new Error('Order does not belong to partner'), { status: 403 });
  }
  if (order.status !== 'verified') {
    throw Object.assign(new Error('Only verified orders can be paid same-day'), { status: 400 });
  }
  if (order.paid) {
    throw Object.assign(new Error('Order already paid'), { status: 400 });
  }

  const ref = payment_ref || `PAY-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(
    `UPDATE orders SET
      status = 'paid', paid = 1, paid_at = datetime('now'),
      payment_method = ?, payment_ref = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(method, ref, orderId);

  logEvent(db, orderId, 'paid', { method, payment_ref: ref, amount: order.quoted_amount }, 'partner', partnerId);
  return getOrderById(orderId);
}

function partnerStats(partnerId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(quoted_amount),0) AS volume
       FROM orders WHERE partner_id = ? GROUP BY status`
    )
    .all(partnerId);

  const paidToday = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(quoted_amount),0) AS volume
       FROM orders
       WHERE partner_id = ? AND paid = 1 AND date(paid_at) = date('now')`
    )
    .get(partnerId);

  const open = db
    .prepare(
      `SELECT COUNT(*) AS count FROM orders
       WHERE partner_id = ? AND status NOT IN ('paid','cancelled','mismatch')`
    )
    .get(partnerId);

  const avgVerifyHours = db
    .prepare(
      `SELECT AVG(
         (julianday(COALESCE(paid_at, updated_at)) - julianday(created_at)) * 24
       ) AS hours
       FROM orders WHERE partner_id = ? AND status IN ('verified','paid')`
    )
    .get(partnerId);

  const byStatus = Object.fromEntries(rows.map((r) => [r.status, { count: r.count, volume: r.volume }]));
  const totalOrders = rows.reduce((s, r) => s + r.count, 0);
  const totalVolume = rows.reduce((s, r) => s + r.volume, 0);

  return {
    total_orders: totalOrders,
    total_volume: totalVolume,
    open_orders: open.count,
    paid_today: paidToday,
    avg_cycle_hours: avgVerifyHours.hours ? Math.round(avgVerifyHours.hours * 10) / 10 : null,
    by_status: byStatus,
  };
}

function marketplaceStats() {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM orders) AS orders,
         (SELECT COUNT(*) FROM partners WHERE active = 1) AS partners,
         (SELECT COUNT(*) FROM drivers WHERE trained = 1) AS drivers,
         (SELECT COALESCE(SUM(quoted_amount),0) FROM orders WHERE paid = 1) AS paid_volume,
         (SELECT COUNT(*) FROM orders WHERE paid = 1 AND date(paid_at) = date('now')) AS paid_today_count
      `
    )
    .get();
  return totals;
}

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function inMonth(iso, key) {
  if (!iso) return false;
  const s = String(iso).replace('T', ' ');
  return s.slice(0, 7) === key;
}

/**
 * Live billing + DayLink contribution for a partner account (current month).
 * Completed pickup = device reached picked_up / verifying / verified / paid / mismatch
 * (cancelled & pending/assigned/en_route not billable yet).
 */
function partnerEconomics(partnerId) {
  const db = getDb();
  const partner = db
    .prepare(
      `SELECT id, company_name, email, plan, api_key, created_at FROM partners WHERE id = ?`
    )
    .get(partnerId);
  if (!partner) {
    throw Object.assign(new Error('Partner not found'), { status: 404 });
  }

  const { orders } = listOrders({ partnerId, limit: 500, offset: 0 });
  const key = monthKey();
  const monthOrders = orders.filter((o) => inMonth(o.created_at, key));

  const billableStatuses = new Set(['picked_up', 'verifying', 'verified', 'paid', 'mismatch']);
  const completed = monthOrders.filter((o) => billableStatuses.has(o.status) || o.packed);
  const sameDayPays = monthOrders.filter((o) => o.paid && o.payment_method === 'ach_same_day');
  // also count any paid this month
  const paidThisMonth = monthOrders.filter((o) => o.paid);

  const planId = partner.plan || 'growth';
  const invoice = estimateInvoice({
    planId,
    completedPickups: completed.length,
    sameDayPays: Math.max(sameDayPays.length, paidThisMonth.length),
    includeMonthly: true,
  });
  const operator = estimateOperatorMargin(invoice);

  return {
    period: key,
    period_label: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    partner: {
      id: partner.id,
      company_name: partner.company_name,
      plan: partner.plan,
    },
    activity: {
      orders_created: monthOrders.length,
      completed_pickups: completed.length,
      paid: paidThisMonth.length,
      open: monthOrders.filter((o) => !['paid', 'cancelled', 'mismatch'].includes(o.status)).length,
      mismatch: monthOrders.filter((o) => o.status === 'mismatch').length,
      cancelled: monthOrders.filter((o) => o.status === 'cancelled').length,
      quoted_volume: monthOrders.reduce((s, o) => s + Number(o.quoted_amount || 0), 0),
    },
    partner_invoice: invoice,
    daylink_profit: {
      ...operator,
      note:
        'Estimated DayLink contribution on this partner’s volume: invoice revenue minus assumed Wasatch COGS (driver, supplies, risk, ops).',
    },
    rates: {
      plans: PLANS,
      cogs: COGS,
    },
  };
}

module.exports = {
  STATUSES,
  createOrder,
  getOrderById,
  listOrders,
  getEvents,
  assignDriver,
  updateStatus,
  verifyDevice,
  processPayment,
  partnerStats,
  marketplaceStats,
  partnerEconomics,
};
