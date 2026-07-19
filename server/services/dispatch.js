/**
 * Driver-platform integrations (SaaS connectors).
 * PurCheaper is the control plane; Roadie / Shipt / others supply capacity.
 * Partners configure which provider(s) to use; liability stays with partner + platform TOS.
 */
const { v4: uuid } = require('uuid');
const { getDb } = require('../db');

const PROVIDERS = {
  roadie: {
    id: 'roadie',
    name: 'Roadie',
    category: 'gig_delivery',
    status: 'available',
    description: 'Local gig delivery network — pickup and drop to parcel point or facility.',
    docs_url: 'https://www.roadie.com/',
    supports: ['create_job', 'cancel_job', 'webhooks', 'tracking_ref'],
  },
  shipt: {
    id: 'shipt',
    name: 'Shipt',
    category: 'gig_delivery',
    status: 'available',
    description: 'On-demand shopper/delivery network usable for local handoffs where coverage exists.',
    docs_url: 'https://www.shipt.com/',
    supports: ['create_job', 'webhooks'],
  },
  uber_direct: {
    id: 'uber_direct',
    name: 'Uber Direct',
    category: 'gig_delivery',
    status: 'planned',
    description: 'Uber delivery API for local courier-style trips.',
    docs_url: 'https://developer.uber.com/',
    supports: ['create_job', 'webhooks'],
  },
  doordash_drive: {
    id: 'doordash_drive',
    name: 'DoorDash Drive',
    category: 'gig_delivery',
    status: 'planned',
    description: 'DoorDash Drive white-label delivery API.',
    docs_url: 'https://developer.doordash.com/',
    supports: ['create_job', 'webhooks'],
  },
  manual: {
    id: 'manual',
    name: 'Manual / own fleet',
    category: 'internal',
    status: 'available',
    description: 'Your W-2 or contractor drivers using the PurCheaper driver portal only.',
    docs_url: null,
    supports: ['create_job'],
  },
  custom_webhook: {
    id: 'custom_webhook',
    name: 'Custom webhook',
    category: 'custom',
    status: 'available',
    description: 'POST job payloads to your own dispatcher or any platform with a webhook intake.',
    docs_url: null,
    supports: ['create_job', 'webhooks'],
  },
};

function store() {
  const db = getDb();
  const data = db._data();
  if (!data.partner_integrations) data.partner_integrations = [];
  if (!data.dispatch_jobs) data.dispatch_jobs = [];
  return { db, data };
}

function save(db, data) {
  if (typeof db._replace === 'function') db._replace(data);
}

function listProviders() {
  return Object.values(PROVIDERS);
}

function listPartnerIntegrations(partnerId) {
  const { data } = store();
  const connected = data.partner_integrations.filter((i) => i.partner_id === partnerId);
  return listProviders().map((p) => {
    const conn = connected.find((c) => c.provider === p.id);
    return {
      ...p,
      connected: !!conn && conn.enabled !== false,
      connection: conn
        ? {
            id: conn.id,
            enabled: conn.enabled !== false,
            external_account: conn.external_account || null,
            default: !!conn.is_default,
            connected_at: conn.connected_at,
            // never expose raw secrets in list
            has_credentials: !!(conn.api_key || conn.webhook_url),
          }
        : null,
    };
  });
}

function connectProvider(partnerId, providerId, body = {}) {
  if (!PROVIDERS[providerId]) {
    const err = new Error('Unknown provider');
    err.status = 400;
    throw err;
  }
  const { db, data } = store();
  let row = data.partner_integrations.find((i) => i.partner_id === partnerId && i.provider === providerId);
  if (!row) {
    row = {
      id: uuid(),
      partner_id: partnerId,
      provider: providerId,
      enabled: true,
      is_default: false,
      connected_at: new Date().toISOString(),
    };
    data.partner_integrations.push(row);
  }
  row.enabled = body.enabled !== false;
  row.api_key = body.api_key != null ? body.api_key : row.api_key;
  row.webhook_url = body.webhook_url != null ? body.webhook_url : row.webhook_url;
  row.external_account = body.external_account != null ? body.external_account : row.external_account;
  row.metadata = body.metadata || row.metadata || {};
  row.updated_at = new Date().toISOString();
  if (body.is_default) {
    data.partner_integrations.forEach((i) => {
      if (i.partner_id === partnerId) i.is_default = i.id === row.id;
    });
  }
  // If first connection, make default
  const anyDefault = data.partner_integrations.some((i) => i.partner_id === partnerId && i.is_default);
  if (!anyDefault) row.is_default = true;
  save(db, data);
  return listPartnerIntegrations(partnerId).find((p) => p.id === providerId);
}

function getDefaultProvider(partnerId) {
  const { data } = store();
  const conn =
    data.partner_integrations.find((i) => i.partner_id === partnerId && i.is_default && i.enabled !== false) ||
    data.partner_integrations.find((i) => i.partner_id === partnerId && i.enabled !== false);
  return conn ? conn.provider : 'manual';
}

/**
 * Create a dispatch job on the selected platform (MVP: simulated job IDs + event).
 * Production: swap adapters to real Roadie/Shipt/Uber APIs using stored credentials.
 */
function dispatchOrder(order, partnerId, opts = {}) {
  const providerId = opts.provider || getDefaultProvider(partnerId) || 'manual';
  const provider = PROVIDERS[providerId];
  if (!provider) {
    const err = new Error('Unknown dispatch provider');
    err.status = 400;
    throw err;
  }
  if (provider.status === 'planned' && !opts.force) {
    const err = new Error(`${provider.name} connector is planned — enable when API keys are live, or use Roadie/Shipt/manual today`);
    err.status = 400;
    throw err;
  }

  const { db, data } = store();
  const conn = data.partner_integrations.find((i) => i.partner_id === partnerId && i.provider === providerId);

  // Adapter stub — replace with real HTTP calls per provider
  const externalId =
    opts.external_id ||
    `${providerId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const job = {
    id: uuid(),
    order_id: order.id,
    partner_id: partnerId,
    provider: providerId,
    external_id: externalId,
    status: 'submitted',
    payload_summary: {
      pickup: `${order.pickup_address}, ${order.pickup_city} ${order.pickup_zip}`,
      device: `${order.device_brand} ${order.device_model}`,
      external_ref: order.external_ref,
    },
    created_at: new Date().toISOString(),
    mock: true,
    note:
      providerId === 'manual'
        ? 'Assigned for claim in PurCheaper driver portal'
        : `Mock ${provider.name} job created — wire live API credentials for production dispatch`,
  };
  data.dispatch_jobs.push(job);

  // Stamp order
  const row = data.orders.find((o) => o.id === order.id);
  if (row) {
    row.dispatch_provider = providerId;
    row.dispatch_external_id = externalId;
    row.dispatch_status = 'submitted';
    row.updated_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  }
  save(db, data);

  return {
    job,
    provider,
    connected: !!(conn && conn.enabled !== false),
    message: job.note,
  };
}

function listJobsForOrder(orderId) {
  const { data } = store();
  return data.dispatch_jobs.filter((j) => j.order_id === orderId);
}

/**
 * Inbound webhook from Roadie/Shipt/etc. (MVP accepts status updates by external id).
 */
function handleProviderWebhook(providerId, body = {}) {
  if (!PROVIDERS[providerId]) {
    const err = new Error('Unknown provider');
    err.status = 400;
    throw err;
  }
  const { db, data } = store();
  const externalId = body.external_id || body.job_id || body.id;
  const status = body.status || body.state || 'updated';
  const job = data.dispatch_jobs.find((j) => j.provider === providerId && j.external_id === externalId);
  if (job) {
    job.status = status;
    job.last_webhook_at = new Date().toISOString();
    job.last_webhook = body;
  }
  const order = data.orders.find((o) => o.dispatch_external_id === externalId || (job && o.id === job.order_id));
  if (order) {
    order.dispatch_status = status;
    // Map common gig statuses → our order machine (soft)
    const map = {
      driver_assigned: 'assigned',
      assigned: 'assigned',
      en_route: 'en_route',
      picked_up: 'picked_up',
      delivered: 'delivered',
      completed: 'delivered',
      cancelled: 'cancelled',
    };
    const mapped = map[String(status).toLowerCase()];
    if (mapped) order.status = mapped;
    order.updated_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  }
  save(db, data);
  return { ok: true, provider: providerId, external_id: externalId, order_id: order && order.id, job_id: job && job.id };
}

module.exports = {
  PROVIDERS,
  listProviders,
  listPartnerIntegrations,
  connectProvider,
  getDefaultProvider,
  dispatchOrder,
  listJobsForOrder,
  handleProviderWebhook,
};
