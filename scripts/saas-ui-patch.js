const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

// dashboard.html
let dh = fs.readFileSync(path.join(root, 'public/dashboard.html'), 'utf8');
const reps = [
  ['Your PurCheaper spend', 'Your SaaS bill'],
  ['Est. invoice (plan rates)', 'Subscription + overage'],
  ['PurCheaper profit (est.)', 'PurCheaper margin (est.)'],
  ['Invoice − COGS on your jobs', 'SaaS revenue − platform COGS'],
  ['Completed pickups', 'Orders on platform'],
  ['Billable this month', 'This month'],
  ['Margin / pickup', 'SaaS margin %'],
  ['Contribution after COGS', 'After platform COGS'],
  ['Completed PurCheaper pickups / month', 'Orders on platform / month'],
  ['value="80"', 'value="400"'],
  ['Platform + pickups + pay rail', 'Subscription + overage'],
  ['Cost per pickup', 'Software cost / order'],
  ['Blended all-in fee', 'Blended SaaS'],
  [
    '<option value="starter">Starter — $0/mo + $29/pickup (+$4 same-day)</option>\n                        <option value="growth" selected>Growth — $149/mo + $24/pickup (same-day included)</option>\n                        <option value="network">Network — $499/mo + $20/pickup (same-day included)</option>',
    '<option value="starter">Starter — $99/mo · 200 orders</option>\n                        <option value="growth" selected>Growth — $249/mo · 1,500 orders</option>\n                        <option value="network">Network — $699/mo · 10,000 orders</option>',
  ],
];
for (const [a, b] of reps) dh = dh.split(a).join(b);
fs.writeFileSync(path.join(root, 'public/dashboard.html'), dh);

// dashboard.js runEconomics
let js = fs.readFileSync(path.join(root, 'public/js/dashboard.js'), 'utf8');
const start = js.indexOf('  function runEconomics() {');
const end = js.indexOf('  function setView(name)');
if (start < 0 || end < 0) throw new Error('runEconomics markers missing');
const fn = `  function runEconomics() {
    if (!$('#econ-form')) return;
    const planKey = ($('#econ-plan') && $('#econ-plan').value) || 'growth';
    const plan = PLANS[planKey] || PLANS.growth;
    const orders = Math.max(0, num('econ-pickups', 0));
    const avgQuote = Math.max(0, num('econ-quote', 0));
    const marginPct = Math.min(100, Math.max(0, num('econ-margin', 0))) / 100;
    const baseline = Math.max(0, num('econ-baseline', 0));
    const liftPct = Math.min(100, Math.max(0, num('econ-lift', 0))) / 100;
    const mismatchPct = Math.min(100, Math.max(0, num('econ-mismatch', 0))) / 100;

    const overageUnits = Math.max(0, orders - plan.included);
    const overage = overageUnits * plan.overage;
    const saasFee = plan.monthly + overage;
    const cpp = orders > 0 ? saasFee / orders : plan.monthly;
    const extraCloses = baseline * liftPct;
    const paidFraction = 1 - mismatchPct;
    const incrementalGp = extraCloses * avgQuote * marginPct * paidFraction;
    const net = incrementalGp - saasFee;

    $('#econ-cost').textContent = money(saasFee);
    $('#econ-cost-sub').textContent = plan.name + ' SaaS ' + money(plan.monthly) + ' + overage ' + money(overage);
    $('#econ-cpp').textContent = money(Math.round(cpp));
    $('#econ-extra').textContent = extraCloses.toFixed(1);
    $('#econ-net').textContent = money(Math.round(net));
    $('#econ-net-sub').textContent = net >= 0 ? 'Positive ROI on SaaS' : 'SaaS exceeds modeled lift';
    $('#econ-net').style.color = net >= 0 ? 'var(--good)' : 'var(--bad)';

    $('#econ-roi-body').innerHTML = [
      row('Model', 'Pure SaaS subscription'),
      row('Plan', plan.name),
      row('Subscription / mo', money(plan.monthly)),
      row('Included orders', String(plan.included)),
      row('Orders this month', String(orders)),
      row('Overage', money(overage), overageUnits + ' × $' + plan.overage),
      row('Total SaaS cost / mo', money(Math.round(saasFee))),
      row('Your driver/logistics cost', 'You pay (not PurCheaper)'),
      row('Incremental GP from same-day tools', money(Math.round(incrementalGp))),
      row('Net after SaaS', money(Math.round(net))),
    ].join('');

    $('#econ-unit-body').innerHTML = [
      row('What PurCheaper sells', 'Software control plane'),
      row('Dual status + tracking API', 'Included'),
      row('Partner-owned door checklists', 'Included'),
      row('Per-package courier fee', '$0 — not our model'),
    ].join('');

    $('#econ-verdict').textContent =
      net >= 0
        ? 'SaaS can pay for itself if same-day tooling lifts closes ~' + (liftPct * 100).toFixed(0) + '% on baseline.'
        : 'At these lift assumptions the subscription costs more than incremental GP.';
    $('#econ-verdict').style.color = net >= 0 ? 'var(--good)' : 'var(--bad)';
  }

`;
js = js.slice(0, start) + fn + js.slice(end);
fs.writeFileSync(path.join(root, 'public/js/dashboard.js'), js);

// partners pricing
let ph = fs.readFileSync(path.join(root, 'public/partners.html'), 'utf8');
const ps = ph.indexOf('<section class="section section-alt" id="pricing">');
const pe = ph.indexOf('<section class="section" id="signup">');
if (ps >= 0 && pe > ps) {
  const section = `  <section class="section section-alt" id="pricing">
    <div class="container">
      <div class="section-head">
        <div>
          <h2>SaaS pricing — operations software</h2>
          <p>Subscription only. You run drivers and own liability. PurCheaper is the system of record for status, tracking, checklists, and same-day pay gates.</p>
        </div>
        <span class="chip chip-brand">No per-package courier fee</span>
      </div>
      <div class="grid-3">
        <article class="card">
          <span class="chip">Starter</span>
          <h3 class="mt-1">$99<span class="text-sm text-muted">/mo</span></h3>
          <p class="text-sm text-muted">200 orders included · $0.25 overage</p>
          <ul class="list-tight">
            <li>Dashboard + dual status</li>
            <li>Tracking numbers</li>
            <li>2 door checklists</li>
            <li>API access</li>
          </ul>
          <a class="btn btn-ghost btn-sm mt-1" href="#signup">Start pilot</a>
        </article>
        <article class="card accent-border">
          <span class="chip chip-brand">Growth</span>
          <h3 class="mt-1">$249<span class="text-sm text-muted">/mo</span></h3>
          <p class="text-sm text-muted">1,500 orders · $0.15 overage</p>
          <ul class="list-tight">
            <li>Webhooks + priority support</li>
            <li>25 custom checklists</li>
            <li>Pay-gate tools</li>
            <li>API on purchase create</li>
          </ul>
          <a class="btn btn-primary btn-sm mt-1" href="#signup">Choose Growth</a>
        </article>
        <article class="card">
          <span class="chip chip-accent">Network</span>
          <h3 class="mt-1">$699<span class="text-sm text-muted">/mo</span></h3>
          <p class="text-sm text-muted">10,000 orders · $0.08 overage</p>
          <ul class="list-tight">
            <li>Multi-brand / multi-org</li>
            <li>Unlimited checklists</li>
            <li>Dedicated success</li>
          </ul>
          <a class="btn btn-soft btn-sm mt-1" href="#signup">Talk to us</a>
        </article>
      </div>
      <div class="card mt-1">
        <h3 class="mb-1">What you own vs what we own</h3>
        <div class="grid-2">
          <div>
            <strong class="text-sm">Partner (you)</strong>
            <ul class="list-tight">
              <li>Drivers / couriers / gig labor</li>
              <li>Device custody &amp; liability</li>
              <li>Carrier labels &amp; postage</li>
              <li>Door grading rules (your checklists)</li>
              <li>Seller payment funds</li>
            </ul>
          </div>
          <div>
            <strong class="text-sm">PurCheaper (SaaS)</strong>
            <ul class="list-tight">
              <li>Order lifecycle + event audit log</li>
              <li>Partner + driver status updates</li>
              <li>Tracking number integration</li>
              <li>Checklist templates &amp; API</li>
              <li>Same-day payment gate workflow</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>

`;
  ph = ph.slice(0, ps) + section + ph.slice(pe);
  fs.writeFileSync(path.join(root, 'public/partners.html'), ph);
}

// light homepage SaaS line
let idx = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
idx = idx.replace(
  'PurCheaper is the last-mile layer for online cell phone buyback stores.',
  'PurCheaper is the <strong>operations SaaS</strong> for online buyback stores — status, tracking, partner-owned door checklists, and same-day pay gates. You run the drivers; we run the software.'
);
fs.writeFileSync(path.join(root, 'public/index.html'), idx);

console.log('saas-ui-patch complete');
