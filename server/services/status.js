/**
 * Dual-actor status machine: partners and drivers can both advance orders.
 * Partners own logistics liability; PurCheaper provides the control plane.
 */

const STATUSES = [
  'pending',
  'assigned',
  'en_route',
  'picked_up',
  'verifying',
  'verified',
  'mismatch',
  'paid',
  'shipped',
  'in_transit',
  'delivered',
  'cancelled',
];

/** Who may set each status */
const ACTOR_STATUSES = {
  partner: [
    'pending',
    'assigned',
    'en_route',
    'picked_up',
    'verifying',
    'verified',
    'mismatch',
    'paid',
    'shipped',
    'in_transit',
    'delivered',
    'cancelled',
  ],
  driver: ['assigned', 'en_route', 'picked_up', 'verifying', 'verified', 'mismatch', 'shipped'],
  system: STATUSES,
};

/**
 * Soft graph — allow forward moves and partner overrides for ops reality.
 * Cancel allowed from most open states.
 */
const ALLOWED_FROM = {
  pending: ['assigned', 'en_route', 'cancelled'],
  assigned: ['en_route', 'picked_up', 'pending', 'cancelled'],
  en_route: ['picked_up', 'assigned', 'cancelled'],
  picked_up: ['verifying', 'verified', 'mismatch', 'shipped', 'cancelled'],
  verifying: ['verified', 'mismatch', 'picked_up'],
  verified: ['paid', 'shipped', 'mismatch'],
  mismatch: ['verifying', 'verified', 'cancelled', 'shipped'],
  paid: ['shipped', 'in_transit', 'delivered'],
  shipped: ['in_transit', 'delivered'],
  in_transit: ['delivered', 'shipped'],
  delivered: [],
  cancelled: [],
};

function canTransition(from, to, actorType) {
  if (!STATUSES.includes(to)) {
    return { ok: false, reason: `Unknown status: ${to}` };
  }
  const allowedForActor = ACTOR_STATUSES[actorType] || [];
  if (!allowedForActor.includes(to)) {
    return { ok: false, reason: `${actorType} cannot set status "${to}"` };
  }
  if (from === to) return { ok: true };
  if (to === 'cancelled' && !['delivered', 'paid', 'cancelled'].includes(from)) {
    if (actorType === 'partner') return { ok: true };
  }
  const next = ALLOWED_FROM[from] || [];
  // Partners get broader override for SaaS ops flexibility
  if (actorType === 'partner') {
    if (next.includes(to) || from === to) return { ok: true };
    // partner may set any non-terminal target except jumping into delivered without ship path when empty
    if (!['delivered'].includes(to) || ['shipped', 'in_transit', 'paid', 'verified'].includes(from)) {
      return { ok: true, soft: true };
    }
  }
  if (next.includes(to)) return { ok: true };
  return {
    ok: false,
    reason: `Cannot move from "${from}" to "${to}" as ${actorType}`,
  };
}

function trackingUrl(carrier, number) {
  if (!number) return null;
  const n = encodeURIComponent(String(number).trim());
  const c = String(carrier || '').toLowerCase();
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${n}`;
  if (c.includes('fedex') || c.includes('fdx')) return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
  if (c.includes('dhl')) return `https://www.dhl.com/en/express/tracking.html?AWB=${n}`;
  return null;
}

module.exports = {
  STATUSES,
  ACTOR_STATUSES,
  ALLOWED_FROM,
  canTransition,
  trackingUrl,
};
