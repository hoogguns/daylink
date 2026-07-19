(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  let selectedId = null;
  let driversCache = [];

  function showLogin() {
    $('#login-view').classList.remove('hidden');
    $('#app-view').classList.add('hidden');
  }

  function showApp() {
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    const user = API.getUser('partner');
    if (user) {
      $('#side-company').textContent = user.company_name || user.company || 'Partner';
      $('#side-plan').textContent = (user.plan || 'pilot') + ' plan';
      $('#side-email').textContent = user.email || '';
      if (user.api_key) $('#api-key').value = user.api_key;
    }
  }

  async function bootstrap() {
    if (!API.getToken('partner')) {
      showLogin();
      return;
    }
    try {
      const me = await API.request('/api/auth/partner/me');
      API.setSession('partner', API.getToken('partner'), me.partner);
      showApp();
      await refreshAll();
    } catch {
      API.clearSession('partner');
      showLogin();
    }
  }

  async function refreshAll() {
    await Promise.all([loadStats(), loadEconomicsLive(), loadOrders(), loadDrivers()]);
    if (selectedId) await showDetail(selectedId);
  }

  async function loadStats() {
    const s = await API.partnerStats();
    $('#s-open').textContent = s.open_orders;
    $('#s-total').textContent = s.total_orders;
    $('#s-volume').textContent = money(s.total_volume);
    $('#s-paid').textContent = s.paid_today.count;
    $('#s-paid-vol').textContent = money(s.paid_today.volume) + ' volume';
    $('#s-cycle').textContent = s.avg_cycle_hours != null ? s.avg_cycle_hours + 'h' : '—';
  }

  function money2(n) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);
  }

  async function loadEconomicsLive() {
    try {
      const e = await API.partnerEconomics();
      const inv = e.partner_invoice;
      const prof = e.daylink_profit;
      const act = e.activity;

      if ($('#profit-period')) $('#profit-period').textContent = e.period_label || e.period;
      if ($('#m-invoice')) {
        $('#m-invoice').textContent = money2(inv.total);
        $('#m-invoice-sub').textContent = `${inv.plan.name} · ${act.completed_pickups} pickups · platform ${money2(inv.platform_fee)}`;
      }
      if ($('#m-profit')) {
        $('#m-profit').textContent = money2(prof.contribution);
        $('#m-profit').style.color = prof.contribution >= 0 ? 'var(--good)' : 'var(--bad)';
        $('#m-profit-sub').textContent = `COGS ${money2(prof.cogs_total)} (${money2(prof.cogs_per_pickup)}/job)`;
      }
      if ($('#m-pickups')) {
        $('#m-pickups').textContent = String(act.completed_pickups);
        $('#m-pickups-sub').textContent = `${act.orders_created} created · ${act.paid} paid · ${act.mismatch} mismatch`;
      }
      if ($('#m-unit')) {
        const u = prof.contribution_per_pickup;
        $('#m-unit').textContent = u == null ? '—' : money2(u);
        $('#m-unit-sub').textContent =
          prof.margin_pct == null ? 'No billable pickups yet' : `${prof.margin_pct.toFixed(0)}% contribution margin`;
        if (u != null) $('#m-unit').style.color = u >= 0 ? 'var(--good)' : 'var(--bad)';
      }

      // Economics tab live block
      if ($('#e-live-invoice')) {
        $('#e-live-invoice').textContent = money2(inv.total);
        $('#e-live-invoice-sub').textContent = `What this partner pays DayLink (${inv.plan.name})`;
        $('#e-live-profit').textContent = money2(prof.contribution);
        $('#e-live-profit').style.color = prof.contribution >= 0 ? 'var(--good)' : 'var(--bad)';
        $('#e-live-profit-sub').textContent = 'Your platform profit on their volume (est.)';
        $('#e-live-breakdown').innerHTML = [
          row('Period', e.period_label || e.period),
          row('Plan', inv.plan.name),
          row('Completed pickups', String(act.completed_pickups)),
          row('Same-day / paid', String(act.paid)),
          row('Platform fee', money2(inv.platform_fee)),
          row('Pickup fees', money2(inv.pickup_fees), `${act.completed_pickups} × ${money2(inv.plan.perPickup)}`),
          row('Same-day fees', money2(inv.same_day_fees)),
          row('Partner invoice total', money2(inv.total)),
          row('Est. COGS (driver+kit+risk+ops)', money2(prof.cogs_total), money2(prof.cogs_per_pickup) + ' each'),
          row('DayLink contribution', money2(prof.contribution)),
        ].join('');
      }
      return e;
    } catch (err) {
      console.warn('economics', err);
      return null;
    }
  }

  async function loadOrders() {
    const status = $('#status-filter').value;
    const q = $('#q').value.trim();
    const params = {};
    if (status) params.status = status;
    if (q) params.q = q;
    const { orders, total } = await API.partnerOrders(params);
    $('#order-count').textContent = total + ' order' + (total === 1 ? '' : 's');
    const body = $('#orders-body');
    body.innerHTML = '';
    if (!orders.length) {
      $('#orders-empty').classList.remove('hidden');
      return;
    }
    $('#orders-empty').classList.add('hidden');
    for (const o of orders) {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      if (o.id === selectedId) tr.style.background = 'var(--brand-soft)';
      tr.innerHTML = `
        <td>
          <div class="mono">${o.external_ref || o.id.slice(0, 8)}</div>
          <strong>${escapeHtml(o.device_brand)} ${escapeHtml(o.device_model)}</strong>
          <div class="muted">${escapeHtml(o.device_storage || '')} · ${escapeHtml(o.device_condition)}</div>
        </td>
        <td>
          ${escapeHtml(o.seller_name)}
          <div class="muted">${escapeHtml(o.pickup_city)}</div>
        </td>
        <td class="amount">${money(o.quoted_amount)}</td>
        <td>${statusChip(o.status)}</td>
        <td class="muted">${escapeHtml(o.driver_name || '—')}</td>
        <td><button class="btn btn-ghost btn-sm" type="button" data-open="${o.id}">View</button></td>
      `;
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        showDetail(o.id);
      });
      tr.querySelector('[data-open]').addEventListener('click', () => showDetail(o.id));
      body.appendChild(tr);
    }
  }

  async function showDetail(id) {
    selectedId = id;
    const { order, events } = await API.partnerOrder(id);
    $('#detail-status').innerHTML = statusChip(order.status);
    const specs = order.expected_specs || {};
    const verified = order.verified_specs || {};
    const actions = [];
    if (order.status === 'verified' && !order.paid) {
      actions.push(`<button class="btn btn-accent btn-sm" type="button" id="act-pay">Release same-day pay</button>`);
    }
    if (['pending', 'assigned'].includes(order.status)) {
      actions.push(`<button class="btn btn-soft btn-sm" type="button" id="act-assign">Assign driver</button>`);
    }
    if (!['paid', 'cancelled'].includes(order.status)) {
      actions.push(`<button class="btn btn-ghost btn-sm" type="button" id="act-cancel">Cancel</button>`);
    }

    $('#detail-body').innerHTML = `
      <div class="stack">
        <div class="row between">
          <div>
            <strong>${escapeHtml(order.device_brand)} ${escapeHtml(order.device_model)}</strong>
            <div class="text-sm text-muted mono">${escapeHtml(order.external_ref || order.id)}</div>
          </div>
          <div class="amount">${money(order.quoted_amount)}</div>
        </div>
        <div class="text-sm">
          <div><strong>Seller:</strong> ${escapeHtml(order.seller_name)} · ${escapeHtml(order.seller_phone)}</div>
          <div><strong>Pickup:</strong> ${escapeHtml(order.pickup_address)}, ${escapeHtml(order.pickup_city)} ${escapeHtml(order.pickup_zip)}</div>
          <div><strong>Driver:</strong> ${escapeHtml(order.driver_name || 'Unassigned')} ${order.driver_code ? '(' + escapeHtml(order.driver_code) + ')' : ''}</div>
          <div><strong>IMEI:</strong> <span class="mono">${escapeHtml(order.imei || '—')}</span></div>
          <div><strong>Packed:</strong> ${order.packed ? 'Yes' : 'No'} · <strong>Paid:</strong> ${order.paid ? 'Yes @ ' + fmtWhen(order.paid_at) : 'No'}</div>
        </div>
        <div>
          <div class="text-sm"><strong>Expected specs</strong></div>
          <pre class="mono text-sm" style="margin:.25rem 0 0;white-space:pre-wrap;background:var(--canvas);padding:.5rem;border-radius:6px">${escapeHtml(JSON.stringify(specs, null, 2))}</pre>
        </div>
        ${
          order.verified_specs
            ? `<div>
                <div class="text-sm"><strong>Verification</strong> ${
                  order.verification_match ? statusChip('verified') : statusChip('mismatch')
                }</div>
                <pre class="mono text-sm" style="margin:.25rem 0 0;white-space:pre-wrap;background:var(--canvas);padding:.5rem;border-radius:6px">${escapeHtml(JSON.stringify(verified, null, 2))}</pre>
                ${order.verification_notes ? `<p class="text-sm mt-1">${escapeHtml(order.verification_notes)}</p>` : ''}
              </div>`
            : ''
        }
        <div class="row">${actions.join('')}</div>
        <div>
          <div class="text-sm mb-1"><strong>Event log</strong></div>
          <div class="timeline">
            ${(events || [])
              .map(
                (ev) => `
              <div class="ev">
                <div class="dot"></div>
                <div>
                  <strong>${escapeHtml(ev.event)}</strong>
                  <span>${fmtWhen(ev.created_at)} · ${escapeHtml(ev.actor_type || 'system')}</span>
                </div>
              </div>`
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    const payBtn = $('#act-pay');
    if (payBtn) {
      payBtn.addEventListener('click', async () => {
        if (!confirm('Release same-day payment to seller?')) return;
        try {
          await API.payOrder(order.id);
          await refreshAll();
        } catch (err) {
          alert(err.message);
        }
      });
    }
    const cancelBtn = $('#act-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        const reason = prompt('Cancel reason?', 'Cancelled by partner') || 'Cancelled by partner';
        try {
          await API.cancelOrder(order.id, reason);
          await refreshAll();
        } catch (err) {
          alert(err.message);
        }
      });
    }
    const assignBtn = $('#act-assign');
    if (assignBtn) {
      assignBtn.addEventListener('click', () => openAssign(order.id));
    }

    // re-highlight table
    loadOrders().catch(() => {});
  }

  async function loadDrivers() {
    const { drivers } = await API.partnerDrivers();
    driversCache = drivers;
    const body = $('#drivers-body');
    body.innerHTML = drivers
      .map(
        (d) => `
      <tr>
        <td><strong>${escapeHtml(d.name)}</strong><div class="muted">${escapeHtml(d.phone || '')}</div></td>
        <td>${(d.zones || []).map((z) => `<span class="chip">${escapeHtml(z)}</span>`).join(' ')}</td>
        <td>${escapeHtml(d.vehicle || '—')}</td>
        <td class="mono">${escapeHtml(d.driver_code || '—')}</td>
        <td>${d.rating}</td>
        <td>${statusChip(d.status)}</td>
      </tr>`
      )
      .join('');
  }

  function openAssign(orderId) {
    $('#assign-order-id').value = orderId;
    const sel = $('#assign-driver');
    sel.innerHTML = driversCache
      .map((d) => `<option value="${d.id}">${escapeHtml(d.name)} · ${escapeHtml(d.status)} · ${(d.zones || []).join(', ')}</option>`)
      .join('');
    $('#assign-modal').classList.add('open');
  }

  const PLANS = {
    starter: {
      name: 'Starter',
      monthly: 0,
      perPickup: 29,
      sameDayFee: 4,
      sameDayIncluded: false,
      cap: 50,
    },
    growth: {
      name: 'Growth',
      monthly: 149,
      perPickup: 24,
      sameDayFee: 0,
      sameDayIncluded: true,
      cap: 300,
    },
    network: {
      name: 'Network',
      monthly: 499,
      perPickup: 20,
      sameDayFee: 0,
      sameDayIncluded: true,
      cap: null,
    },
  };

  function num(id, fallback = 0) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = Number(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  function row(label, value, note = '') {
    return `<tr>
      <td><strong>${label}</strong>${note ? `<div class="muted">${note}</div>` : ''}</td>
      <td class="amount" style="text-align:right;white-space:nowrap">${value}</td>
    </tr>`;
  }

  function runEconomics() {
    if (!$('#econ-form')) return;
    const planKey = ($('#econ-plan') && $('#econ-plan').value) || 'growth';
    const plan = PLANS[planKey] || PLANS.growth;
    let pickups = Math.max(0, num('econ-pickups', 0));
    if (plan.cap != null && pickups > plan.cap) {
      // still calculate but note overage mentally — charge as-is for pilot
    }
    const sameDayPct = Math.min(100, Math.max(0, num('econ-same-day', 0))) / 100;
    const avgQuote = Math.max(0, num('econ-quote', 0));
    const marginPct = Math.min(100, Math.max(0, num('econ-margin', 0))) / 100;
    const baseline = Math.max(0, num('econ-baseline', 0));
    const liftPct = Math.min(100, Math.max(0, num('econ-lift', 0))) / 100;
    const mismatchPct = Math.min(100, Math.max(0, num('econ-mismatch', 0))) / 100;

    const sameDayCount = pickups * sameDayPct;
    const sameDayFees = plan.sameDayIncluded ? 0 : sameDayCount * plan.sameDayFee;
    const pickupFees = pickups * plan.perPickup;
    const monthlyFees = plan.monthly + pickupFees + sameDayFees;
    const cpp = pickups > 0 ? monthlyFees / pickups : plan.perPickup;

    // Incremental closes from offering same-day (lift applied to baseline volume)
    const extraCloses = baseline * liftPct;
    // Only paid matches contribute device GP; mismatches still incur pickup fee
    const paidFraction = 1 - mismatchPct;
    const incrementalGp = extraCloses * avgQuote * marginPct * paidFraction;
    const net = incrementalGp - monthlyFees;

    $('#econ-cost').textContent = money(monthlyFees);
    $('#econ-cost-sub').textContent = `${plan.name}: ${money(plan.monthly)} platform + pickups`;
    $('#econ-cpp').textContent = money(Math.round(cpp));
    $('#econ-extra').textContent = extraCloses.toFixed(1);
    $('#econ-net').textContent = money(Math.round(net));
    $('#econ-net-sub').textContent = net >= 0 ? 'Positive ROI at these assumptions' : 'Fees exceed modeled lift — adjust inputs';
    $('#econ-net').style.color = net >= 0 ? 'var(--good)' : 'var(--bad)';

    $('#econ-roi-body').innerHTML = [
      row('Plan', plan.name),
      row('Platform fee / mo', money(plan.monthly)),
      row('Pickup fees / mo', money(pickupFees), `${pickups} × ${money(plan.perPickup)}`),
      row('Same-day pay fees / mo', money(Math.round(sameDayFees)), plan.sameDayIncluded ? 'Included on Growth/Network' : `${Math.round(sameDayCount)} × ${money(plan.sameDayFee)}`),
      row('Total DayLink cost / mo', money(Math.round(monthlyFees))),
      row('Blended cost / pickup', money(Math.round(cpp))),
      row('Baseline monthly closes', String(baseline)),
      row('Conversion lift', `${(liftPct * 100).toFixed(1)}%` ),
      row('Incremental closes', extraCloses.toFixed(1)),
      row('Avg quote × margin', `${money(avgQuote)} × ${(marginPct * 100).toFixed(0)}%`),
      row('Mismatch / non-pay rate', `${(mismatchPct * 100).toFixed(1)}%`, 'Applied to incremental GP only'),
      row('Incremental gross profit', money(Math.round(incrementalGp))),
      row('Net after DayLink', money(Math.round(net))),
    ].join('');

    const sameDayLine = plan.sameDayIncluded
      ? row('Same-day pay rail', 'Included', 'When status = verified → paid')
      : row('Same-day pay rail', money(plan.sameDayFee), 'Only if you release pay');

    $('#econ-unit-body').innerHTML = [
      row('Completed pickup fee', money(plan.perPickup)),
      sameDayLine,
      row('Typical all-in (w/ same-day)', money(plan.perPickup + (plan.sameDayIncluded ? 0 : plan.sameDayFee))),
      row('As % of $' + avgQuote + ' quote', `${avgQuote ? (((plan.perPickup + (plan.sameDayIncluded ? 0 : plan.sameDayFee)) / avgQuote) * 100).toFixed(1) : '0'}%`),
      row('vs own courier desk', 'Usually lower', 'Recruiting, insurance, training, no-shows'),
    ].join('');

    const capNote =
      plan.cap != null && pickups > plan.cap
        ? ` Note: ${plan.name} pilot cap is ${plan.cap}/mo — talk to us about Growth/Network.`
        : '';
    if (net >= 0) {
      $('#econ-verdict').textContent =
        `At these assumptions, same-day via DayLink adds ~${money(Math.round(net))}/mo after fees (${money(Math.round(cpp))} blended per pickup).${capNote}`;
      $('#econ-verdict').style.color = 'var(--good)';
    } else {
      $('#econ-verdict').textContent =
        `Under these assumptions fees exceed incremental gross profit by ${money(Math.round(-net))}/mo. Raise lift, volume, or margin — or lower pickups until product-market fit is clear.${capNote}`;
      $('#econ-verdict').style.color = 'var(--bad)';
    }
  }

  function setView(name) {
    $$('.side-nav a[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
    $('#view-orders').classList.toggle('hidden', name !== 'orders');
    $('#view-create').classList.toggle('hidden', name !== 'create');
    $('#view-drivers').classList.toggle('hidden', name !== 'drivers');
    $('#view-api').classList.toggle('hidden', name !== 'api');
    if ($('#view-economics')) $('#view-economics').classList.toggle('hidden', name !== 'economics');
    const titles = {
      orders: 'Purchased devices',
      create: 'New pickup',
      drivers: 'Driver network',
      api: 'API access',
      economics: 'Pricing & unit economics',
    };
    $('#view-title').textContent = titles[name] || 'Dashboard';
    if (name === 'drivers') loadDrivers();
    if (name === 'api') {
      const u = API.getUser('partner');
      if (u && u.api_key) $('#api-key').value = u.api_key;
    }
    if (name === 'economics') {
      runEconomics();
      loadEconomicsLive();
    }
    // Profit strip visible on main ops views
    if ($('#profit-panel')) {
      $('#profit-panel').classList.toggle('hidden', name === 'create' || name === 'api');
    }
    if ($('#stats-row')) {
      $('#stats-row').classList.toggle('hidden', name === 'economics' || name === 'create' || name === 'api');
    }
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // events
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const alert = $('#login-alert');
    try {
      const res = await API.partnerLogin(fd.get('email'), fd.get('password'));
      API.setSession('partner', res.token, res.partner);
      showApp();
      await refreshAll();
    } catch (err) {
      alert.className = 'alert alert-error';
      alert.textContent = err.message;
      alert.classList.remove('hidden');
    }
  });

  $('#btn-logout').addEventListener('click', () => {
    API.clearSession('partner');
    showLogin();
  });

  $$('.side-nav a[data-view]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setView(a.dataset.view);
    });
  });

  $('#btn-new-pickup').addEventListener('click', () => setView('create'));
  $('#btn-refresh').addEventListener('click', () => refreshAll());
  $('#btn-filter').addEventListener('click', () => loadOrders());
  $('#q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadOrders();
  });

  $('#create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.quoted_amount = Number(body.quoted_amount);
    body.expected_specs = {
      brand: body.device_brand,
      model: body.device_model,
      storage: body.device_storage,
      color: body.device_color,
      condition: body.device_condition,
      powers_on: true,
      screen_cracks: body.device_condition === 'Poor',
      account_locked: false,
    };
    const alert = $('#create-alert');
    try {
      const { order } = await API.createOrder(body);
      alert.className = 'alert alert-ok';
      alert.textContent = 'Order created: ' + (order.external_ref || order.id);
      alert.classList.remove('hidden');
      e.target.reset();
      setView('orders');
      selectedId = order.id;
      await refreshAll();
    } catch (err) {
      alert.className = 'alert alert-error';
      alert.textContent = err.message;
      alert.classList.remove('hidden');
    }
  });

  $('#btn-copy-key').addEventListener('click', async () => {
    const v = $('#api-key').value;
    if (!v) return;
    await navigator.clipboard.writeText(v);
    $('#btn-copy-key').textContent = 'Copied';
    setTimeout(() => ($('#btn-copy-key').textContent = 'Copy key'), 1200);
  });

  $$('#assign-modal [data-close]').forEach((b) =>
    b.addEventListener('click', () => $('#assign-modal').classList.remove('open'))
  );
  $('#btn-assign-confirm').addEventListener('click', async () => {
    const orderId = $('#assign-order-id').value;
    const driverId = $('#assign-driver').value;
    try {
      await API.assignOrder(orderId, driverId);
      $('#assign-modal').classList.remove('open');
      await refreshAll();
    } catch (err) {
      alert(err.message);
    }
  });

  // Economics calculator live updates
  if ($('#econ-form')) {
    $('#econ-form').addEventListener('input', runEconomics);
    $('#econ-form').addEventListener('change', runEconomics);
  }
  if ($('#btn-econ-refresh')) {
    $('#btn-econ-refresh').addEventListener('click', () => loadEconomicsLive());
  }
  // Deep-link helper from profit panel
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href="#economics"]');
    if (a) {
      e.preventDefault();
      setView('economics');
      location.hash = 'economics';
    }
  });

  // Deep link: /dashboard#economics
  function routeHash() {
    const h = (location.hash || '').replace(/^#/, '');
    if (h === 'economics' && API.getToken('partner')) setView('economics');
  }
  window.addEventListener('hashchange', routeHash);

  bootstrap().then(() => routeHash());
})();
