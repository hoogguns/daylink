const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'purcheaper.json');

const EMPTY = () => ({
  partners: [],
  drivers: [],
  orders: [],
  order_events: [],
  leads: [],
  checklist_templates: [],
});

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir(DB_PATH);
  if (!fs.existsSync(DB_PATH)) {
    const data = EMPTY();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return data;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function save(data) {
  ensureDir(DB_PATH);
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function matchLike(value, pattern) {
  // pattern like %foo%
  const raw = String(pattern).replace(/^%/, '').replace(/%$/, '');
  return String(value ?? '')
    .toLowerCase()
    .includes(raw.toLowerCase());
}

/**
 * Tiny query facade so route/service code stays readable without SQLite.
 * Supports the SQL shapes actually used in this app.
 */
function createDb() {
  let data = load();

  function persist() {
    save(data);
  }

  const api = {
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();

      return {
        run(...params) {
          return execRun(s, params);
        },
        get(...params) {
          return execGet(s, params);
        },
        all(...params) {
          return execAll(s, params);
        },
      };
    },
    transaction(fn) {
      return (...args) => {
        // single-process JSON store: run fn then one write
        const result = fn(...args);
        persist();
        return result;
      };
    },
    exec() {
      // schema no-op for JSON store
    },
    pragma() {},
  };

  function bindNamed(sql, obj) {
    // not used if we always pass positional — seed uses named via .run(obj)
    return obj;
  }

  function execRun(sql, params) {
    // Named object form: INSERT ... VALUES (@id, @name, ...)
    if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
      return execRunNamed(sql, params[0]);
    }

    if (/^INSERT INTO partners/i.test(sql)) {
      const [id, company_name, contact_name, email, password_hash, phone, website, api_key, plan] = params;
      data.partners.push({
        id,
        company_name,
        contact_name,
        email,
        password_hash,
        phone,
        website,
        api_key,
        plan: plan || 'pilot',
        active: 1,
        created_at: nowIso(),
      });
      persist();
      return { changes: 1 };
    }

    if (/^INSERT INTO drivers/i.test(sql)) {
      // seed uses named; positional fallback unused
      persist();
      return { changes: 1 };
    }

    if (/^INSERT INTO orders \(/i.test(sql)) {
      const [
        id,
        partner_id,
        external_ref,
        seller_name,
        seller_phone,
        seller_email,
        pickup_address,
        pickup_city,
        pickup_zip,
        pickup_lat,
        pickup_lng,
        device_brand,
        device_model,
        device_storage,
        device_color,
        device_condition,
        imei,
        serial_number,
        quoted_amount,
        currency,
        expected_specs,
        window_start,
        window_end,
      ] = params;
      data.orders.push({
        id,
        partner_id,
        driver_id: null,
        external_ref,
        status: 'pending',
        seller_name,
        seller_phone,
        seller_email,
        pickup_address,
        pickup_city,
        pickup_zip,
        pickup_lat,
        pickup_lng,
        device_brand,
        device_model,
        device_storage,
        device_color,
        device_condition,
        imei,
        serial_number,
        quoted_amount,
        currency: currency || 'USD',
        expected_specs,
        verified_specs: null,
        verification_notes: null,
        verification_match: null,
        window_start,
        window_end,
        packed: 0,
        packed_at: null,
        paid: 0,
        paid_at: null,
        payment_method: null,
        payment_ref: null,
        cancel_reason: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      persist();
      return { changes: 1 };
    }

    if (/^INSERT INTO order_events/i.test(sql)) {
      const [id, order_id, actor_type, actor_id, event, detail] = params;
      data.order_events.push({
        id,
        order_id,
        actor_type,
        actor_id,
        event,
        detail,
        created_at: nowIso(),
      });
      persist();
      return { changes: 1 };
    }

    if (/^INSERT INTO leads/i.test(sql)) {
      const [id, type, name, email, company, phone, message] = params;
      data.leads.push({ id, type, name, email, company, phone, message, created_at: nowIso() });
      persist();
      return { changes: 1 };
    }

    if (/^UPDATE orders SET driver_id = \?, status = 'assigned'/i.test(sql)) {
      const [driver_id, id] = params;
      const o = data.orders.find((x) => x.id === id);
      if (o) {
        o.driver_id = driver_id;
        o.status = 'assigned';
        o.updated_at = nowIso();
        persist();
      }
      return { changes: o ? 1 : 0 };
    }

    if (/^UPDATE orders SET updated_at/i.test(sql)) {
      const [id] = params;
      const o = data.orders.find((x) => x.id === id);
      if (o) {
        o.updated_at = nowIso();
        persist();
      }
      return { changes: o ? 1 : 0 };
    }

    if (/^UPDATE orders SET status = \?, verified_specs/i.test(sql)) {
      const [status, verified_specs, verification_notes, verification_match, packed, packedFlag, id] = params;
      const o = data.orders.find((x) => x.id === id);
      if (o) {
        o.status = status;
        o.verified_specs = verified_specs;
        o.verification_notes = verification_notes;
        o.verification_match = verification_match;
        o.packed = packed;
        if (packedFlag === 1) o.packed_at = nowIso();
        o.updated_at = nowIso();
        persist();
      }
      return { changes: o ? 1 : 0 };
    }

    if (/^UPDATE orders SET\s+status = 'paid'/i.test(sql) || /status = 'paid', paid = 1/i.test(sql)) {
      const [method, ref, id] = params;
      const o = data.orders.find((x) => x.id === id);
      if (o) {
        o.status = 'paid';
        o.paid = 1;
        o.paid_at = nowIso();
        o.payment_method = method;
        o.payment_ref = ref;
        o.updated_at = nowIso();
        persist();
      }
      return { changes: o ? 1 : 0 };
    }

    // generic status update: UPDATE orders SET status = ?, ... WHERE id = ?
    if (/^UPDATE orders SET status = \?/i.test(sql)) {
      // parse optional extra fields from SQL loosely
      const status = params[0];
      let idx = 1;
      const oId = params[params.length - 1];
      const o = data.orders.find((x) => x.id === oId);
      if (!o) return { changes: 0 };
      o.status = status;
      if (/packed = \?/.test(sql)) {
        o.packed = params[idx++] ? 1 : 0;
        o.packed_at = nowIso();
      }
      if (/cancel_reason = \?/.test(sql)) {
        o.cancel_reason = params[idx++];
      }
      o.updated_at = nowIso();
      persist();
      return { changes: 1 };
    }

    throw new Error('Unsupported SQL run: ' + sql.slice(0, 120));
  }

  function execRunNamed(sql, obj) {
    if (/INSERT INTO partners/i.test(sql)) {
      data.partners.push({
        ...obj,
        active: obj.active != null ? obj.active : 1,
        created_at: obj.created_at || nowIso(),
      });
      // transaction may batch — still ok to persist; seed uses transaction wrapper
      return { changes: 1 };
    }
    if (/INSERT INTO drivers/i.test(sql)) {
      data.drivers.push({
        ...obj,
        created_at: obj.created_at || nowIso(),
      });
      return { changes: 1 };
    }
    if (/INSERT INTO orders/i.test(sql)) {
      data.orders.push({
        packed: 0,
        paid: 0,
        paid_at: null,
        payment_method: null,
        payment_ref: null,
        verified_specs: null,
        verification_notes: null,
        verification_match: null,
        cancel_reason: null,
        serial_number: null,
        currency: 'USD',
        created_at: nowIso(),
        updated_at: nowIso(),
        ...obj,
      });
      return { changes: 1 };
    }
    if (/INSERT INTO order_events/i.test(sql)) {
      data.order_events.push({
        ...obj,
        created_at: obj.created_at || nowIso(),
      });
      return { changes: 1 };
    }
    throw new Error('Unsupported named SQL: ' + sql.slice(0, 80));
  }

  function joinOrder(o) {
    const p = data.partners.find((x) => x.id === o.partner_id);
    const d = o.driver_id ? data.drivers.find((x) => x.id === o.driver_id) : null;
    return {
      ...o,
      partner_name: p ? p.company_name : null,
      driver_name: d ? d.name : null,
      driver_phone: d ? d.phone : null,
      driver_code: d ? d.driver_code : null,
    };
  }

  function execGet(sql, params) {
    if (/SELECT COUNT\(\*\) AS c FROM partners/i.test(sql)) {
      return { c: data.partners.length };
    }
    if (/SELECT \* FROM partners WHERE email = \?/i.test(sql)) {
      const want = String(params[0] || '').toLowerCase();
      return data.partners.find((p) => String(p.email || '').toLowerCase() === want) || undefined;
    }
    if (/SELECT id FROM partners WHERE email = \?/i.test(sql)) {
      const p = data.partners.find((x) => x.email === params[0]);
      return p ? { id: p.id } : undefined;
    }
    if (/SELECT id, company_name, contact_name, email, phone, website, plan, api_key, created_at\s+FROM partners WHERE id = \?/i.test(sql)) {
      const p = data.partners.find((x) => x.id === params[0]);
      if (!p) return undefined;
      const { id, company_name, contact_name, email, phone, website, plan, api_key, created_at } = p;
      return { id, company_name, contact_name, email, phone, website, plan, api_key, created_at };
    }
    if (/SELECT id, company_name, email, plan, api_key, created_at FROM partners WHERE id = \?/i.test(sql)) {
      const p = data.partners.find((x) => x.id === params[0]);
      if (!p) return undefined;
      return {
        id: p.id,
        company_name: p.company_name,
        email: p.email,
        plan: p.plan,
        api_key: p.api_key,
        created_at: p.created_at,
      };
    }
    if (/SELECT id, company_name, email, plan, active FROM partners WHERE api_key = \?/i.test(sql)) {
      const p = data.partners.find((x) => x.api_key === params[0]);
      if (!p) return undefined;
      return { id: p.id, company_name: p.company_name, email: p.email, plan: p.plan, active: p.active };
    }
    if (/SELECT \* FROM drivers WHERE email = \?/i.test(sql)) {
      const want = String(params[0] || '').toLowerCase();
      return data.drivers.find((d) => String(d.email || '').toLowerCase() === want) || undefined;
    }
    if (/SELECT id, name, email, phone, vehicle, zones, rating, status, driver_code, trained, created_at\s+FROM drivers WHERE id = \?/i.test(sql)) {
      const d = data.drivers.find((x) => x.id === params[0]);
      if (!d) return undefined;
      const { id, name, email, phone, vehicle, zones, rating, status, driver_code, trained, created_at } = d;
      return { id, name, email, phone, vehicle, zones, rating, status, driver_code, trained, created_at };
    }
    if (/FROM orders o[\s\S]*WHERE o\.id = \?/i.test(sql) || /WHERE o\.id = \?/i.test(sql)) {
      const o = data.orders.find((x) => x.id === params[0]);
      return o ? joinOrder(o) : undefined;
    }
    if (/SELECT COUNT\(\*\) AS c FROM orders o/i.test(sql)) {
      return { c: filterOrders(sql, params).length };
    }
    if (/SELECT COUNT\(\*\) AS count FROM orders\s+WHERE partner_id = \? AND status NOT IN/i.test(sql)) {
      const partnerId = params[0];
      const count = data.orders.filter(
        (o) => o.partner_id === partnerId && !['paid', 'cancelled', 'mismatch'].includes(o.status)
      ).length;
      return { count };
    }
    if (/SELECT COUNT\(\*\) AS count, COALESCE\(SUM\(quoted_amount\),0\) AS volume\s+FROM orders\s+WHERE partner_id = \? AND paid = 1/i.test(sql)) {
      const partnerId = params[0];
      const today = nowIso().slice(0, 10);
      const rows = data.orders.filter(
        (o) => o.partner_id === partnerId && o.paid === 1 && String(o.paid_at || '').startsWith(today)
      );
      return {
        count: rows.length,
        volume: rows.reduce((s, o) => s + Number(o.quoted_amount || 0), 0),
      };
    }
    if (/SELECT AVG\(/i.test(sql)) {
      const partnerId = params[0];
      const rows = data.orders.filter((o) => o.partner_id === partnerId && ['verified', 'paid'].includes(o.status));
      if (!rows.length) return { hours: null };
      const hours =
        rows.reduce((s, o) => {
          const a = new Date(o.created_at).getTime();
          const b = new Date(o.paid_at || o.updated_at).getTime();
          return s + (b - a) / 3600000;
        }, 0) / rows.length;
      return { hours };
    }
    if (/SELECT\s+\(SELECT COUNT\(\*\) FROM orders\) AS orders/i.test(sql)) {
      const today = nowIso().slice(0, 10);
      return {
        orders: data.orders.length,
        partners: data.partners.filter((p) => p.active !== 0).length,
        drivers: data.drivers.filter((d) => d.trained).length,
        paid_volume: data.orders.filter((o) => o.paid).reduce((s, o) => s + Number(o.quoted_amount || 0), 0),
        paid_today_count: data.orders.filter((o) => o.paid && String(o.paid_at || '').startsWith(today)).length,
      };
    }
    return undefined;
  }

  function filterOrders(sql, params) {
    // listOrders builds dynamic WHERE — parse from params order used in services
    // We'll re-implement all() carefully for list query
    return data.orders;
  }

  function execAll(sql, params) {
    if (/SELECT status, COUNT\(\*\) AS count, COALESCE\(SUM\(quoted_amount\),0\) AS volume\s+FROM orders WHERE partner_id = \? GROUP BY status/i.test(sql)) {
      const partnerId = params[0];
      const map = {};
      for (const o of data.orders.filter((x) => x.partner_id === partnerId)) {
        if (!map[o.status]) map[o.status] = { status: o.status, count: 0, volume: 0 };
        map[o.status].count += 1;
        map[o.status].volume += Number(o.quoted_amount || 0);
      }
      return Object.values(map);
    }

    if (/FROM drivers WHERE trained = 1/i.test(sql)) {
      return data.drivers
        .filter((d) => d.trained)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .map((d) => ({
          id: d.id,
          name: d.name,
          phone: d.phone,
          vehicle: d.vehicle,
          zones: d.zones,
          rating: d.rating,
          status: d.status,
          driver_code: d.driver_code,
          trained: d.trained,
        }));
    }

    if (/FROM order_events WHERE order_id = \?/i.test(sql)) {
      return data.order_events
        .filter((e) => e.order_id === params[0])
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    }

    // list orders with dynamic filters
    if (/FROM orders o/i.test(sql) && /ORDER BY o\.created_at DESC/i.test(sql)) {
      let rows = data.orders.map(joinOrder);
      // detect filters by counting ? before LIMIT
      // services pass: partnerId?, driverId?, status?, q*5?, limit, offset
      // Rebuild filter from SQL fragments
      const hasPartner = /o\.partner_id = \?/.test(sql);
      const hasDriver = /o\.driver_id = \?/.test(sql);
      const hasStatus = /o\.status = \?/.test(sql);
      const hasQ = /o\.seller_name LIKE \?/.test(sql);

      let i = 0;
      if (hasPartner) {
        const pid = params[i++];
        rows = rows.filter((o) => o.partner_id === pid);
      }
      if (hasDriver) {
        const did = params[i++];
        rows = rows.filter((o) => o.driver_id === did);
      }
      if (hasStatus) {
        const st = params[i++];
        rows = rows.filter((o) => o.status === st);
      }
      if (hasQ) {
        const like = params[i];
        i += 5;
        rows = rows.filter(
          (o) =>
            matchLike(o.seller_name, like) ||
            matchLike(o.device_model, like) ||
            matchLike(o.external_ref, like) ||
            matchLike(o.pickup_city, like) ||
            matchLike(o.imei, like)
        );
      }
      const limit = params[params.length - 2];
      const offset = params[params.length - 1];
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return rows.slice(offset, offset + limit);
    }

    // COUNT with same filters as list — handled in get with simpler path
    if (/SELECT COUNT\(\*\) AS c FROM orders o/i.test(sql)) {
      // use same filtering without limit — params without last 2
      return [];
    }

    return [];
  }

  // Fix COUNT for filtered lists used by listOrders
  const origGet = api.prepare;
  api.prepare = function prepare(sql) {
    const stmt = origGet.call(api, sql);
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/SELECT COUNT\(\*\) AS c FROM orders o/i.test(s)) {
      return {
        get(...params) {
          // mirror filter of list without limit/offset
          let rows = data.orders.slice();
          const hasPartner = /o\.partner_id = \?/.test(s);
          const hasDriver = /o\.driver_id = \?/.test(s);
          const hasStatus = /o\.status = \?/.test(s);
          const hasQ = /o\.seller_name LIKE \?/.test(s);
          let i = 0;
          if (hasPartner) {
            const pid = params[i++];
            rows = rows.filter((o) => o.partner_id === pid);
          }
          if (hasDriver) {
            const did = params[i++];
            rows = rows.filter((o) => o.driver_id === did);
          }
          if (hasStatus) {
            const st = params[i++];
            rows = rows.filter((o) => o.status === st);
          }
          if (hasQ) {
            const like = params[i];
            rows = rows.filter(
              (o) =>
                matchLike(o.seller_name, like) ||
                matchLike(o.device_model, like) ||
                matchLike(o.external_ref, like) ||
                matchLike(o.pickup_city, like) ||
                matchLike(o.imei, like)
            );
          }
          return { c: rows.length };
        },
        run: stmt.run,
        all: stmt.all,
      };
    }
    return stmt;
  };

  // expose for seed reset
  api._reload = () => {
    data = load();
  };
  api._data = () => data;
  api._replace = (next) => {
    data = next;
    persist();
  };

  return api;
}

let _db;
function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

function openDb() {
  _db = createDb();
  return _db;
}

module.exports = { getDb, openDb, DB_PATH, EMPTY, save, load, ensureDir };
