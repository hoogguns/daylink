/* Shared API client */
const API = {
  base: '',

  tokenKey(role) {
    return role === 'driver' ? 'PurCheaper_driver_token' : 'PurCheaper_partner_token';
  },
  userKey(role) {
    return role === 'driver' ? 'PurCheaper_driver_user' : 'PurCheaper_partner_user';
  },

  getToken(role = 'partner') {
    return localStorage.getItem(this.tokenKey(role));
  },
  setSession(role, token, user) {
    localStorage.setItem(this.tokenKey(role), token);
    localStorage.setItem(this.userKey(role), JSON.stringify(user));
  },
  clearSession(role) {
    localStorage.removeItem(this.tokenKey(role));
    localStorage.removeItem(this.userKey(role));
  },
  getUser(role = 'partner') {
    try {
      return JSON.parse(localStorage.getItem(this.userKey(role)) || 'null');
    } catch {
      return null;
    }
  },

  async request(path, { method = 'GET', body, role = 'partner', auth = true, apiKey } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = this.getToken(role);
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (apiKey) headers['X-API-Key'] = apiKey;

    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || 'Unexpected response' };
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  // public
  health: () => API.request('/api/health', { auth: false }),
  coverage: () => API.request('/api/coverage', { auth: false }),
  stats: () => API.request('/api/stats', { auth: false }),
  howItWorks: () => API.request('/api/how-it-works', { auth: false }),
  lead: (body) => API.request('/api/leads', { method: 'POST', body, auth: false }),

  // auth
  partnerLogin: (email, password) =>
    API.request('/api/auth/partner/login', { method: 'POST', body: { email, password }, auth: false }),
  partnerRegister: (body) =>
    API.request('/api/auth/partner/register', { method: 'POST', body, auth: false }),
  driverLogin: (email, password) =>
    API.request('/api/auth/driver/login', { method: 'POST', body: { email, password }, auth: false }),

  // partner
  partnerStats: () => API.request('/api/partner/stats'),
  partnerOrders: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return API.request('/api/partner/orders' + (q ? `?${q}` : ''));
  },
  partnerOrder: (id) => API.request(`/api/partner/orders/${id}`),
  createOrder: (body) => API.request('/api/partner/orders', { method: 'POST', body }),
  payOrder: (id, body = {}) => API.request(`/api/partner/orders/${id}/pay`, { method: 'POST', body }),
  cancelOrder: (id, reason) =>
    API.request(`/api/partner/orders/${id}/cancel`, { method: 'POST', body: { reason } }),
  assignOrder: (id, driver_id) =>
    API.request(`/api/partner/orders/${id}/assign`, { method: 'POST', body: { driver_id } }),
  partnerStatus: (id, status, notes) =>
    API.request(`/api/partner/orders/${id}/status`, { method: 'POST', body: { status, notes } }),
  partnerTracking: (id, body) =>
    API.request(`/api/partner/orders/${id}/tracking`, { method: 'POST', body }),
  partnerChecklists: () => API.request('/api/partner/checklists'),
  partnerDrivers: () => API.request('/api/partner/drivers'),
  partnerEconomics: () => API.request('/api/partner/economics'),
  partnerStatuses: () => API.request('/api/partner/statuses'),
  publicPricing: () => API.request('/api/pricing', { auth: false }),

  // driver
  driverOrders: () => API.request('/api/driver/orders', { role: 'driver' }),
  claimOrder: (id, start_route = true) =>
    API.request(`/api/driver/orders/${id}/claim`, {
      method: 'POST',
      body: { start_route },
      role: 'driver',
    }),
  driverStatus: (id, status, notes) =>
    API.request(`/api/driver/orders/${id}/status`, {
      method: 'POST',
      body: { status, notes },
      role: 'driver',
    }),
  driverTracking: (id, body) =>
    API.request(`/api/driver/orders/${id}/tracking`, { method: 'POST', body, role: 'driver' }),
  verifyOrder: (id, body) =>
    API.request(`/api/driver/orders/${id}/verify`, { method: 'POST', body, role: 'driver' }),
  driverOrder: (id) => API.request(`/api/driver/orders/${id}`, { role: 'driver' }),
};

function money(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Number(n) || 0
  );
}

function statusChip(status) {
  const map = {
    pending: 'chip-warn',
    assigned: 'chip-info',
    en_route: 'chip-info',
    picked_up: 'chip-brand',
    verifying: 'chip-brand',
    verified: 'chip-good',
    paid: 'chip-good',
    mismatch: 'chip-bad',
    cancelled: '',
  };
  const label = String(status || '').replace(/_/g, ' ');
  return `<span class="chip ${map[status] || ''}">${label}</span>`;
}

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

window.API = API;
window.money = money;
window.statusChip = statusChip;
window.fmtWhen = fmtWhen;
