#!/usr/bin/env node
/**
 * PurCheaper smoke test — run after deploy to verify core paths are alive.
 * Usage:  node scripts/smoke-test.js [base_url]
 * Exits 0 on pass, 1 on any failure.
 *
 * Env overrides:
 *   SMOKE_PARTNER_EMAIL / SMOKE_PARTNER_PASS
 *   SMOKE_DRIVER_EMAIL  / SMOKE_DRIVER_PASS
 *
 * Tests:
 *   1.  GET  /api/health
 *   2.  GET  /api/stats
 *   3.  GET  /api/coverage
 *   4.  GET  /api/integrations/providers        (public, no auth)
 *   5.  POST /api/auth/partner/login
 *   6.  GET  /api/partner/stats
 *   7.  GET  /api/partner/checklists
 *   8.  GET  /api/partner/checklists/:id        (first checklist)
 *   9.  GET  /api/partner/integrations
 *   10. POST /api/auth/driver/login
 *   11. GET  /api/driver/orders
 */

const http  = require('http');
const https = require('https');
const { URL } = require('url');

const BASE           = process.argv[2] || `http://127.0.0.1:${process.env.PORT || 3847}`;
const PARTNER_EMAIL  = process.env.SMOKE_PARTNER_EMAIL || 'partner@wasatchbuyback.demo';
const PARTNER_PASS   = process.env.SMOKE_PARTNER_PASS  || 'demo1234';
const DRIVER_EMAIL   = process.env.SMOKE_DRIVER_EMAIL  || 'sam.driver@purcheaper.demo';
const DRIVER_PASS    = process.env.SMOKE_DRIVER_PASS   || 'driver1234';

let passed = 0;
let failed = 0;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url     = new URL(path, BASE);
    const isHttps = url.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(token   ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
    };
    const req = lib.request(
      {
        hostname: url.hostname,
        port:     url.port || (isHttps ? 443 : 80),
        path:     url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  ✓  ${name}`);
    passed++;
  } else {
    console.error(`  ✗  ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function run() {
  console.log(`\nPurCheaper smoke test → ${BASE}\n`);

  // 1. Health
  const health = await request('GET', '/api/health');
  assert('GET /api/health → 200', health.status === 200);
  assert('health.status === ok', health.body && health.body.status === 'ok',
    JSON.stringify(health.body));

  // 2. Public stats
  const stats = await request('GET', '/api/stats');
  assert('GET /api/stats → 200', stats.status === 200);

  // 3. Coverage
  const coverage = await request('GET', '/api/coverage');
  assert('GET /api/coverage → 200', coverage.status === 200);

  // 4. Public provider list (no auth)
  const providers = await request('GET', '/api/integrations/providers');
  assert('GET /api/integrations/providers → 200', providers.status === 200);
  assert('providers list non-empty',
    Array.isArray(providers.body && providers.body.providers) && providers.body.providers.length > 0,
    JSON.stringify(providers.body));

  // 5. Partner login
  const pLogin = await request('POST', '/api/auth/partner/login', {
    email: PARTNER_EMAIL, password: PARTNER_PASS,
  });
  assert('POST /api/auth/partner/login → 200', pLogin.status === 200,
    `status=${pLogin.status} body=${JSON.stringify(pLogin.body)}`);
  const partnerToken = pLogin.body && pLogin.body.token;
  assert('partner JWT present', !!partnerToken);

  // 6. Partner stats
  const pStats = await request('GET', '/api/partner/stats', null, partnerToken);
  assert('GET /api/partner/stats → 200', pStats.status === 200, JSON.stringify(pStats.body));

  // 7. Checklists list
  const cl = await request('GET', '/api/partner/checklists', null, partnerToken);
  assert('GET /api/partner/checklists → 200', cl.status === 200, JSON.stringify(cl.body));
  assert('checklists array present',
    Array.isArray(cl.body && cl.body.checklists), JSON.stringify(cl.body));

  // 8. Fetch first checklist by id
  const firstId = cl.body && cl.body.checklists && cl.body.checklists[0] && cl.body.checklists[0].id;
  if (firstId) {
    const clById = await request('GET', `/api/partner/checklists/${firstId}`, null, partnerToken);
    assert('GET /api/partner/checklists/:id → 200', clById.status === 200, JSON.stringify(clById.body));
    assert('checklist.id matches', clById.body && clById.body.checklist && clById.body.checklist.id === firstId);
  } else {
    assert('GET /api/partner/checklists/:id (skipped — no id)', true);
    assert('checklist.id matches (skipped)', true);
  }

  // 9. Integrations list
  const intg = await request('GET', '/api/partner/integrations', null, partnerToken);
  assert('GET /api/partner/integrations → 200', intg.status === 200, JSON.stringify(intg.body));
  assert('integrations array present',
    Array.isArray(intg.body && intg.body.integrations), JSON.stringify(intg.body));

  // 10. Driver login
  const dLogin = await request('POST', '/api/auth/driver/login', {
    email: DRIVER_EMAIL, password: DRIVER_PASS,
  });
  assert('POST /api/auth/driver/login → 200', dLogin.status === 200,
    `status=${dLogin.status} body=${JSON.stringify(dLogin.body)}`);
  const driverToken = dLogin.body && dLogin.body.token;
  assert('driver JWT present', !!driverToken);

  // 11. Driver orders
  const dOrders = await request('GET', '/api/driver/orders', null, driverToken);
  assert('GET /api/driver/orders → 200', dOrders.status === 200, JSON.stringify(dOrders.body));

  // Summary
  const total = passed + failed;
  console.log(`\n${'─'.repeat(44)}`);
  console.log(`Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
  if (failed > 0) {
    console.error('Smoke test FAILED — investigate before promoting to production.');
    process.exit(1);
  }
  console.log('All checks passed. ✓');
  process.exit(0);
}

run().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});
