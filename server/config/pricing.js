/**
 * PurCheaper — pure SaaS subscription pricing (MVP).
 * Partners run their own logistics/liability; they pay for the software platform.
 * No per-pickup fees as the primary model.
 */
const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthly: 99,
    annual: 990,
    included_orders: 200,
    overage_per_order: 0.25,
    seats: 3,
    api: true,
    custom_checklists: 2,
    webhooks: false,
    tracking: true,
    dual_status: true,
    same_day_pay_tools: true,
    support: 'Email (business hours MT)',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthly: 249,
    annual: 2490,
    included_orders: 1500,
    overage_per_order: 0.15,
    seats: 15,
    api: true,
    custom_checklists: 25,
    webhooks: true,
    tracking: true,
    dual_status: true,
    same_day_pay_tools: true,
    support: 'Priority email + Slack',
  },
  network: {
    id: 'network',
    name: 'Network',
    monthly: 699,
    annual: 6990,
    included_orders: 10000,
    overage_per_order: 0.08,
    seats: 100,
    api: true,
    custom_checklists: null,
    webhooks: true,
    tracking: true,
    dual_status: true,
    same_day_pay_tools: true,
    sso: true,
    support: 'Dedicated success',
  },
  pilot: {
    id: 'pilot',
    name: 'Pilot (Growth)',
    monthly: 0,
    annual: 0,
    included_orders: 500,
    overage_per_order: 0,
    seats: 10,
    api: true,
    custom_checklists: 10,
    webhooks: true,
    tracking: true,
    dual_status: true,
    same_day_pay_tools: true,
    support: 'Pilot success',
  },
};

/** Platform COGS is software hosting — not driver labor (partners own logistics). */
const PLATFORM_COGS = {
  hosting_per_partner_mo: Number(process.env.SAAS_HOSTING_COGS || 8),
  support_per_partner_mo: Number(process.env.SAAS_SUPPORT_COGS || 15),
};

function resolvePlan(planId) {
  const key = String(planId || 'growth').toLowerCase();
  return PLANS[key] || PLANS.growth;
}

/**
 * SaaS invoice for a period: subscription + optional overage.
 *
 * @param {object}  opts
 * @param {string}  opts.planId
 * @param {number}  opts.completedPickups    - billable pickups in period
 * @param {number}  [opts.sameDayPays=0]     - count of same-day ACH payments released
 *                                             (informational; no extra fee at MVP tier)
 * @param {boolean} [opts.includeMonthly]    - include the monthly platform fee (default true)
 */
function estimateInvoice({ planId, completedPickups, sameDayPays = 0, includeMonthly = true }) {
  const plan = resolvePlan(planId);
  const orders = Math.max(0, Number(completedPickups) || 0);
  const pays = Math.max(0, Number(sameDayPays) || 0);
  const included = plan.included_orders == null ? orders : plan.included_orders;
  const overageUnits = Math.max(0, orders - included);
  const overage = overageUnits * (plan.overage_per_order || 0);
  const platform = includeMonthly ? plan.monthly : 0;
  const total = platform + overage;
  return {
    plan,
    model: 'saas_subscription',
    orders_in_period: orders,
    same_day_pays: pays,
    included_orders: plan.included_orders,
    overage_orders: overageUnits,
    platform_fee: platform,
    overage_fees: overage,
    pickup_fees: 0,
    same_day_fees: 0,
    total,
    blended_per_order: orders > 0 ? total / orders : null,
  };
}

function estimateOperatorMargin(invoice) {
  const cogsTotal =
    PLATFORM_COGS.hosting_per_partner_mo + PLATFORM_COGS.support_per_partner_mo;
  const revenue = invoice.total;
  const contribution = revenue - cogsTotal;
  return {
    model: 'saas',
    cogs: PLATFORM_COGS,
    cogs_per_pickup: null,
    cogs_total: cogsTotal,
    revenue,
    contribution,
    contribution_per_pickup: null,
    margin_pct: revenue > 0 ? (contribution / revenue) * 100 : null,
    note: 'SaaS margin: subscription (+ overage) minus platform hosting/support allocation. Drivers & liability are partner-owned.',
  };
}

// Back-compat aliases used by older routes
const COGS = PLATFORM_COGS;
function cogsPerPickup() {
  return 0;
}

module.exports = {
  PLANS,
  COGS,
  PLATFORM_COGS,
  cogsPerPickup,
  resolvePlan,
  estimateInvoice,
  estimateOperatorMargin,
};
