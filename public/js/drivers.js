(() => {
  const $ = (sel, el = document) => el.querySelector(sel);

  let activeId = null;

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showLogin() {
    $('#login-view').classList.remove('hidden');
    $('#app-view').classList.add('hidden');
  }

  function showApp() {
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    const u = API.getUser('driver');
    if (u) {
      $('#d-name').textContent = u.name || 'Driver';
      $('#d-meta').textContent = `${u.driver_code || ''} · ★ ${u.rating || '—'} · ${(u.zones || []).join(', ')}`;
    }
  }

  async function bootstrap() {
    if (!API.getToken('driver')) return showLogin();
    try {
      const me = await API.request('/api/auth/driver/me', { role: 'driver' });
      API.setSession('driver', API.getToken('driver'), me.driver);
      showApp();
      await refresh();
    } catch {
      API.clearSession('driver');
      showLogin();
    }
  }

  async function refresh() {
    const data = await API.driverOrders();
    renderMine(data.assigned || []);
    renderOpen(data.available || []);
    if (activeId) {
      const still = (data.assigned || []).find((o) => o.id === activeId);
      if (still) await openJob(activeId);
    }
  }

  function renderMine(orders) {
    $('#mine-count').textContent = orders.length + ' active';
    const body = $('#mine-body');
    body.innerHTML = '';
    if (!orders.length) {
      $('#mine-empty').classList.remove('hidden');
      return;
    }
    $('#mine-empty').classList.add('hidden');
    for (const o of orders) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(o.device_brand)} ${escapeHtml(o.device_model)}</strong>
          <div class="muted">${escapeHtml(o.device_condition)}</div></td>
        <td>${escapeHtml(o.pickup_city)}
          <div class="muted text-sm">${escapeHtml(o.pickup_address)}</div></td>
        <td class="amount">${money(o.quoted_amount)}</td>
        <td>${statusChip(o.status)}</td>
        <td><button class="btn btn-soft btn-sm" type="button">Open</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => openJob(o.id));
      body.appendChild(tr);
    }
  }

  function renderOpen(orders) {
    const body = $('#open-body');
    body.innerHTML = '';
    if (!orders.length) {
      $('#open-empty').classList.remove('hidden');
      return;
    }
    $('#open-empty').classList.add('hidden');
    for (const o of orders) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(o.device_brand)} ${escapeHtml(o.device_model)}</strong></td>
        <td>${escapeHtml(o.pickup_city)}</td>
        <td class="text-sm">${fmtWhen(o.window_start)} – ${fmtWhen(o.window_end)}</td>
        <td class="amount">${money(o.quoted_amount)}</td>
        <td><button class="btn btn-primary btn-sm" type="button">Claim + route</button></td>
      `;
      tr.querySelector('button').addEventListener('click', async () => {
        try {
          const { order } = await API.claimOrder(o.id, true);
          activeId = order.id;
          setTab('mine');
          await refresh();
          await openJob(order.id);
        } catch (err) {
          alert(err.message);
        }
      });
      body.appendChild(tr);
    }
  }

  async function openJob(id) {
    activeId = id;
    setTab('mine');
    const { order } = await API.driverOrder(id);
    $('#job-status').innerHTML = statusChip(order.status);
    const expected = order.expected_specs || {};

    const statusBtns = [];
    const driverFlow = [
      ['assigned', 'en_route', 'Start route'],
      ['en_route', 'picked_up', 'Mark picked up'],
      ['picked_up', 'verifying', 'Start verifying'],
      ['verified', 'shipped', 'Mark parcel dropped'],
    ];
    for (const [from, to, label] of driverFlow) {
      if (order.status === from) {
        statusBtns.push(`<button class="btn btn-soft btn-sm" data-st="${to}" type="button">${label}</button>`);
      }
    }
    if (['picked_up', 'verifying'].includes(order.status)) {
      statusBtns.push(`<button class="btn btn-ghost btn-sm" data-st="verifying" type="button">Verifying</button>`);
    }

    const canVerify = ['picked_up', 'verifying'].includes(order.status);

    $('#job-body').innerHTML = `
      <div class="stack">
        <div>
          <strong>${escapeHtml(order.device_brand)} ${escapeHtml(order.device_model)}</strong>
          <div class="text-sm text-muted">${escapeHtml(order.device_storage || '')} · ${escapeHtml(order.device_color || '')} · ${escapeHtml(order.device_condition)}</div>
        </div>
        <div class="text-sm">
          <div><strong>Seller:</strong> ${escapeHtml(order.seller_name)} · ${escapeHtml(order.seller_phone)}</div>
          <div><strong>Address:</strong> ${escapeHtml(order.pickup_address)}, ${escapeHtml(order.pickup_city)} ${escapeHtml(order.pickup_zip)}</div>
          <div><strong>Partner:</strong> ${escapeHtml(order.partner_name || '—')}</div>
          <div><strong>Quote:</strong> ${money(order.quoted_amount)}</div>
        </div>
        <div>
          <div class="text-sm"><strong>Expected specs (partner)</strong></div>
          <pre class="mono text-sm" style="margin:.25rem 0 0;white-space:pre-wrap;background:var(--canvas);padding:.5rem;border-radius:6px">${escapeHtml(JSON.stringify(expected, null, 2))}</pre>
        </div>
        <div class="row">${statusBtns.join('')}</div>
        <div class="card" style="padding:.65rem;box-shadow:none">
          <div class="text-sm mb-1"><strong>Parcel tracking</strong></div>
          <div class="form-grid">
            <label class="field">Carrier
              <select id="d-trk-carrier">
                <option value="">Select…</option>
                <option>UPS</option><option>FedEx</option><option>USPS</option><option>DHL</option><option>Other</option>
              </select>
            </label>
            <label class="field">Tracking #
              <input id="d-trk-number" class="mono" value="${escapeHtml(order.tracking_number || '')}" />
            </label>
          </div>
          <button class="btn btn-ghost btn-sm mt-1" type="button" id="d-trk-save">Save tracking</button>
          ${order.tracking_url ? `<a class="text-sm" href="${escapeHtml(order.tracking_url)}" target="_blank" rel="noopener">Track package</a>` : ''}
        </div>
        ${
          order.door_checklist
            ? `<div><div class="text-sm"><strong>Partner door checklist</strong></div>
               <pre class="mono text-sm" style="margin:.25rem 0 0;white-space:pre-wrap;background:var(--canvas);padding:.5rem;border-radius:6px">${escapeHtml(JSON.stringify(order.door_checklist, null, 2))}</pre></div>`
            : ''
        }
        ${
          canVerify
            ? `<form id="verify-form" class="stack" style="border-top:1px solid var(--line);padding-top:.7rem">
                <strong class="text-sm">On-site verification (partner checklist)</strong>
                <div class="form-grid">
                  <label class="field">Observed brand<input name="brand" value="${escapeHtml(expected.brand || order.device_brand || '')}" required /></label>
                  <label class="field">Observed model<input name="model" value="${escapeHtml(expected.model || order.device_model || '')}" required /></label>
                  <label class="field">Storage<input name="storage" value="${escapeHtml(expected.storage || order.device_storage || '')}" /></label>
                  <label class="field">Condition
                    <select name="condition">
                      ${['Excellent', 'Good', 'Fair', 'Poor']
                        .map(
                          (c) =>
                            `<option ${c === (expected.condition || order.device_condition) ? 'selected' : ''}>${c}</option>`
                        )
                        .join('')}
                    </select>
                  </label>
                  <label class="field">Powers on?
                    <select name="powers_on"><option value="true" selected>Yes</option><option value="false">No</option></select>
                  </label>
                  <label class="field">Account / iCloud / FRP locked?
                    <select name="account_locked"><option value="false" selected>No</option><option value="true">Yes</option></select>
                  </label>
                  <label class="field">Screen cracks?
                    <select name="screen_cracks"><option value="false" selected>No</option><option value="true">Yes</option></select>
                  </label>
                  <label class="field">Packed to SOP?
                    <select name="packed"><option value="true" selected>Yes</option><option value="false">No</option></select>
                  </label>
                  <label class="field full">Notes
                    <textarea name="notes" placeholder="Anything the partner should know"></textarea>
                  </label>
                </div>
                <button class="btn btn-accent" type="submit">Submit verification</button>
              </form>`
            : order.verification_match != null
              ? `<div class="alert ${order.verification_match ? 'alert-ok' : 'alert-error'}">
                  ${order.verification_match ? 'Match recorded — partner can pay same day.' : 'Mismatch recorded — partner review required.'}
                </div>`
              : ''
        }
      </div>
    `;

    $('#job-body').querySelectorAll('[data-st]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await API.driverStatus(order.id, btn.dataset.st);
          await refresh();
          await openJob(order.id);
        } catch (err) {
          alert(err.message);
        }
      });
    });
    const trkSave = $('#d-trk-save');
    if (trkSave) {
      trkSave.addEventListener('click', async () => {
        try {
          await API.driverTracking(order.id, {
            tracking_carrier: $('#d-trk-carrier').value || null,
            tracking_number: $('#d-trk-number').value || null,
            mark_shipped: true,
          });
          await refresh();
          await openJob(order.id);
        } catch (err) {
          alert(err.message);
        }
      });
    }

    const form = $('#verify-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const observed_specs = {
          brand: fd.get('brand'),
          model: fd.get('model'),
          storage: fd.get('storage'),
          condition: fd.get('condition'),
        };
        const checklist = {
          powers_on: fd.get('powers_on') === 'true',
          account_locked: fd.get('account_locked') === 'true',
          icloud_locked: fd.get('account_locked') === 'true',
          screen_cracks: fd.get('screen_cracks') === 'true',
          meets_condition: true,
        };
        try {
          const res = await API.verifyOrder(order.id, {
            observed_specs,
            checklist,
            packed: fd.get('packed') === 'true',
            notes: fd.get('notes') || '',
          });
          alert(res.message);
          await refresh();
          await openJob(order.id);
        } catch (err) {
          alert(err.message);
        }
      });
    }
  }

  function setTab(name) {
    document.querySelectorAll('.side-nav a[data-tab]').forEach((a) => {
      a.classList.toggle('active', a.dataset.tab === name);
    });
    $('#tab-mine').classList.toggle('hidden', name !== 'mine');
    $('#tab-open').classList.toggle('hidden', name !== 'open');
    $('#tab-train').classList.toggle('hidden', name !== 'train');
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await API.driverLogin(fd.get('email'), fd.get('password'));
      API.setSession('driver', res.token, res.driver);
      showApp();
      await refresh();
    } catch (err) {
      const alert = $('#login-alert');
      alert.className = 'alert alert-error';
      alert.textContent = err.message;
      alert.classList.remove('hidden');
    }
  });

  $('#btn-logout').addEventListener('click', () => {
    API.clearSession('driver');
    showLogin();
  });
  $('#btn-refresh').addEventListener('click', () => refresh());
  document.querySelectorAll('.side-nav a[data-tab]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setTab(a.dataset.tab);
    });
  });

  bootstrap();
})();
