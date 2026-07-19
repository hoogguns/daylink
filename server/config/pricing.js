/**
 * Wasatch pilot pricing + estimated DayLink COGS.
 * Partner fee = DayLink revenue. COGS = driver + supplies + risk reserve.
 */
const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthly: 0,
    perPickup: 29,
    sameDayFee: 4,
    sameDayIncluded: false,
    cap: 50,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthly: 149,
    perPickup: 24,
    sameDayFee: 0,
    sameDayIncluded: true,
    cap: 300,
  },
  network: {
    id: 'network',
    name: 'Network',
    monthly: 499,
    perPickup: 20,
    sameDayFee: 0,
    sameDayIncluded: true,
    cap: null,
  },
  pilot: {
    id: 'pilot',
    name: 'Pilot (Growth rates)',
    monthly: 149,
    perPickup: 24,
    sameDayFee: 0,
    sameDayIncluded: true,
    cap: 300,
  },
};

/** Estimated fully loaded cost to DayLink per completed pickup (Wasatch, nearby parcel drop). */
const COGS = {
  driver: Number(process.env.COGS_DRIVER || 20),
  supplies: Number(process.env.COGS_SUPPLIES || 2.5),
  risk: Number(process.env.COGS_RISK || 1.5),
  ops: Number(process.env.COGS_OPS || 3),
};

function cogsPerPickup() {
  return COGS.driver + COGS.supplies + COGS.risk + COGS.ops;
}

function resolvePlan(planId) {
  const key = String(planId || 'growth').toLowerCase();
  return PLANS[key] || PLANS.growth;
}

/**
 * @param {object} opts
 * @param {string} opts.planId
 * @param {number} opts.completedPickups - device collected (picked_up+ or terminal success/mismatch)
 * @param {number} opts.sameDayPays - paid same-day count
 * @param {boolean} [opts.includeMonthly=true]
 */
function estimateInvoice({ planId, completedPickups, sameDayPays, includeMonthly = true }) {
  const plan = resolvePlan(planId);
  const pickups = Math.max(0, Number(completedPickups) || 0);
  const pays = Math.max(0, Number(sameDayPays) || 0);
  const pickupFees = pickups * plan.perPickup;
  const sameDayFees = plan.sameDayIncluded ? 0 : pays * plan.sameDayFee;
  const monthly = includeMonthly ? plan.monthly : 0;
  const total = monthly + pickupFees + sameDayFees;
  return {
    plan,
    pickups,
    same_day_pays: pays,
    platform_fee: monthly,
    pickup_fees: pickupFees,
    same_day_fees: sameDayFees,
    total,
    blended_per_pickup: pickups > 0 ? total / pickups : plan.perPickup,
  };
}

function estimateOperatorMargin(invoice) {
  const cogsUnit = cogsPerPickup();
  const cogsTotal = invoice.pickups * cogsUnit;
  const revenue = invoice.total;
  const contribution = revenue - cogsTotal;
  return {
    cogs: COGS,
    cogs_per_pickup: cogsUnit,
    cogs_total: cogsTotal,
    revenue,
    contribution,
    contribution_per_pickup: invoice.pickups > 0 ? contribution / invoice.pickups : null,
    margin_pct: revenue > 0 ? (contribution / revenue) * 100 : null,
  };
}

module.exports = {
  PLANS,
  COGS,
  cogsPerPickup,
  resolvePlan,
  estimateInvoice,
  estimateOperatorMargin,
};
