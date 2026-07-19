require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const path = require('path');
const { openDb, DB_PATH, EMPTY, save, ensureDir } = require('./db');

const reset = process.argv.includes('--reset');
if (reset) {
  ensureDir(DB_PATH);
  save(EMPTY());
  console.log('Reset database to empty store.');
}

const db = openDb();

// Guard: skip only when BOTH partners AND orders are already populated
const partnerCount = db.prepare('SELECT COUNT(*) AS c FROM partners').get().c;
const orderCount   = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
if (partnerCount > 0 && orderCount > 0 && !reset) {
  console.log('Database already seeded (' + orderCount + ' orders). Use --reset to wipe and reseed.');
  process.exit(0);
}

const hash = (pw) => bcrypt.hashSync(pw, 10);

// ── Partners ────────────────────────────────────────────────────────────────
const partners = [
  {
    id: uuid(),
    company_name: 'Wasatch Device Buyback',
    contact_name: 'Alex Rivera',
    email: 'partner@wasatchbuyback.demo',
    password_hash: hash('demo1234'),
    phone: '801-555-0101',
    website: 'https://wasatchbuyback.demo',
    api_key: 'dl_live_' + uuid().replace(/-/g, '').slice(0, 24),
    plan: 'growth',
  },
  {
    id: uuid(),
    company_name: 'PhoneCash Provo',
    contact_name: 'Jordan Lee',
    email: 'ops@phonecash.demo',
    password_hash: hash('demo1234'),
    phone: '801-555-0142',
    website: 'https://phonecash.demo',
    api_key: 'dl_live_' + uuid().replace(/-/g, '').slice(0, 24),
    plan: 'pilot',
  },
];

// ── Drivers ──────────────────────────────────────────────────────────────────
const drivers = [
  {
    id: uuid(),
    name: 'Sam Ortiz',
    email: 'sam.driver@purcheaper.demo',
    phone: '801-555-0201',
    password_hash: hash('driver1234'),
    vehicle: 'Honda Civic 2019',
    zones: JSON.stringify(['Salt Lake City', 'Murray', 'West Valley']),
    rating: 4.97,
    status: 'available',
    driver_code: 'DL-88421',
    trained: 1,
  },
  {
    id: uuid(),
    name: 'Mia Chen',
    email: 'mia.driver@purcheaper.demo',
    phone: '801-555-0202',
    password_hash: hash('driver1234'),
    vehicle: 'Toyota Corolla 2021',
    zones: JSON.stringify(['Provo', 'Orem', 'Lehi']),
    rating: 4.92,
    status: 'available',
    driver_code: 'DL-77103',
    trained: 1,
  },
  {
    id: uuid(),
    name: 'Chris Nguyen',
    email: 'chris.driver@purcheaper.demo',
    phone: '801-555-0203',
    password_hash: hash('driver1234'),
    vehicle: 'Ford Escape 2020',
    zones: JSON.stringify(['Ogden', 'Layton', 'Bountiful']),
    rating: 4.88,
    status: 'busy',
    driver_code: 'DL-55219',
    trained: 1,
  },
];

// ── Insert statements ────────────────────────────────────────────────────────
const insertPartner = db.prepare(`
  INSERT OR IGNORE INTO partners
    (id, company_name, contact_name, email, password_hash, phone, website, api_key, plan)
  VALUES
    (@id, @company_name, @contact_name, @email, @password_hash, @phone, @website, @api_key, @plan)
`);

const insertDriver = db.prepare(`
  INSERT OR IGNORE INTO drivers
    (id, name, email, phone, password_hash, vehicle, zones, rating, status, driver_code, trained)
  VALUES
    (@id, @name, @email, @phone, @password_hash, @vehicle, @zones, @rating, @status, @driver_code, @trained)
`);

const insertOrder = db.prepare(`
  INSERT OR IGNORE INTO orders (
    id, partner_id, driver_id, external_ref, status,
    seller_name, seller_phone, seller_email,
    pickup_address, pickup_city, pickup_zip,
    pickup_lat, pickup_lng,
    device_brand, device_model, device_storage, device_color, device_condition,
    imei, quoted_amount, expected_specs,
    window_start, window_end,
    packed, paid, paid_at, payment_method
  ) VALUES (
    @id, @partner_id, @driver_id, @external_ref, @status,
    @seller_name, @seller_phone, @seller_email,
    @pickup_address, @pickup_city, @pickup_zip,
    @pickup_lat, @pickup_lng,
    @device_brand, @device_model, @device_storage, @device_color, @device_condition,
    @imei, @quoted_amount, @expected_specs,
    @window_start, @window_end,
    @packed, @paid, @paid_at, @payment_method
  )
`);

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO order_events
    (id, order_id, actor_type, actor_id, event, detail)
  VALUES
    (@id, @order_id, @actor_type, @actor_id, @event, @detail)
`);

// ── Time helpers ─────────────────────────────────────────────────────────────
const now = new Date();
const hoursFromNow = (h) => new Date(now.getTime() + h * 3600000).toISOString();
const hoursAgo     = (h) => new Date(now.getTime() - h * 3600000).toISOString();

// ── Demo orders — one per key lifecycle state ────────────────────────────────
const sampleOrders = [
  // 1. PENDING — unclaimed, open board, driver should see this
  {
    partner_id: partners[0].id,
    driver_id: null,
    external_ref: 'WDB-10490',
    status: 'pending',
    seller_name: 'Avery Quinn',
    seller_phone: '801-555-1104',
    seller_email: 'avery@email.demo',
    pickup_address: '2200 Washington Blvd',
    pickup_city: 'Ogden',
    pickup_zip: '84401',
    pickup_lat: 41.223,
    pickup_lng: -111.9738,
    device_brand: 'Google',
    device_model: 'Pixel 8',
    device_storage: '128GB',
    device_color: 'Hazel',
    device_condition: 'Good',
    imei: '351756111234568',
    quoted_amount: 280,
    expected_specs: JSON.stringify({ brand:'Google', model:'Pixel 8', storage:'128GB', color:'Hazel', condition:'Good', powers_on:true, screen_cracks:false, frp_locked:false }),
    window_start: hoursFromNow(1),
    window_end: hoursFromNow(4),
    packed: 0, paid: 0, paid_at: null, payment_method: null,
  },
  // 2. PENDING — second open order, different city
  {
    partner_id: partners[1].id,
    driver_id: null,
    external_ref: 'PCP-8830',
    status: 'pending',
    seller_name: 'Morgan Ellis',
    seller_phone: '801-555-1107',
    seller_email: 'morgan@email.demo',
    pickup_address: '750 N 500 W',
    pickup_city: 'Provo',
    pickup_zip: '84604',
    pickup_lat: 40.2511,
    pickup_lng: -111.6553,
    device_brand: 'Apple',
    device_model: 'iPhone 15',
    device_storage: '256GB',
    device_color: 'Pink',
    device_condition: 'Excellent',
    imei: '353001234567891',
    quoted_amount: 510,
    expected_specs: JSON.stringify({ brand:'Apple', model:'iPhone 15', storage:'256GB', color:'Pink', condition:'Excellent', powers_on:true, screen_cracks:false, icloud_locked:false }),
    window_start: hoursFromNow(0.5),
    window_end: hoursFromNow(3),
    packed: 0, paid: 0, paid_at: null, payment_method: null,
  },
  // 3. EN_ROUTE — Sam is heading to the door right now
  {
    partner_id: partners[0].id,
    driver_id: drivers[0].id,
    external_ref: 'WDB-10482',
    status: 'en_route',
    seller_name: 'Taylor Brooks',
    seller_phone: '801-555-1101',
    seller_email: 'taylor@email.demo',
    pickup_address: '1420 E 2100 S',
    pickup_city: 'Salt Lake City',
    pickup_zip: '84106',
    pickup_lat: 40.7256,
    pickup_lng: -111.8512,
    device_brand: 'Apple',
    device_model: 'iPhone 14 Pro',
    device_storage: '256GB',
    device_color: 'Deep Purple',
    device_condition: 'Good',
    imei: '356938035643809',
    quoted_amount: 420,
    expected_specs: JSON.stringify({ brand:'Apple', model:'iPhone 14 Pro', storage:'256GB', color:'Deep Purple', condition:'Good', powers_on:true, screen_cracks:false, icloud_locked:false, carrier_locked:false }),
    window_start: hoursFromNow(0.5),
    window_end: hoursFromNow(2),
    packed: 0, paid: 0, paid_at: null, payment_method: null,
  },
  // 4. PICKED_UP — device in hand, not yet verified
  {
    partner_id: partners[1].id,
    driver_id: drivers[1].id,
    external_ref: 'PCP-8821',
    status: 'picked_up',
    seller_name: 'Jamie Soto',
    seller_phone: '801-555-1105',
    seller_email: 'jamie@email.demo',
    pickup_address: '1230 E Main St',
    pickup_city: 'Lehi',
    pickup_zip: '84043',
    pickup_lat: 40.3916,
    pickup_lng: -111.8508,
    device_brand: 'Apple',
    device_model: 'iPad Air (5th gen)',
    device_storage: '64GB',
    device_color: 'Blue',
    device_condition: 'Good',
    imei: null,
    quoted_amount: 275,
    expected_specs: JSON.stringify({ brand:'Apple', model:'iPad Air (5th gen)', storage:'64GB', color:'Blue', condition:'Good', powers_on:true, screen_cracks:false, icloud_locked:false }),
    window_start: hoursAgo(1),
    window_end: hoursFromNow(1),
    packed: 0, paid: 0, paid_at: null, payment_method: null,
  },
  // 5. VERIFIED + packed — awaiting partner payment release
  {
    partner_id: partners[0].id,
    driver_id: drivers[1].id,
    external_ref: 'WDB-10477',
    status: 'verified',
    seller_name: 'Riley Patel',
    seller_phone: '801-555-1102',
    seller_email: 'riley@email.demo',
    pickup_address: '890 N University Ave',
    pickup_city: 'Provo',
    pickup_zip: '84604',
    pickup_lat: 40.2518,
    pickup_lng: -111.6493,
    device_brand: 'Samsung',
    device_model: 'Galaxy S23',
    device_storage: '128GB',
    device_color: 'Phantom Black',
    device_condition: 'Excellent',
    imei: '359072061234567',
    quoted_amount: 310,
    expected_specs: JSON.stringify({ brand:'Samsung', model:'Galaxy S23', storage:'128GB', color:'Phantom Black', condition:'Excellent', powers_on:true, screen_cracks:false, google_locked:false, carrier_locked:false }),
    window_start: hoursAgo(3),
    window_end: hoursAgo(1),
    packed: 1, paid: 0, paid_at: null, payment_method: null,
  },
  // 6. MISMATCH — iCloud lock found, partner must review before pay
  {
    partner_id: partners[0].id,
    driver_id: drivers[2].id,
    external_ref: 'WDB-10455',
    status: 'mismatch',
    seller_name: 'Drew Hale',
    seller_phone: '801-555-1106',
    seller_email: 'drew@email.demo',
    pickup_address: '450 N 300 W',
    pickup_city: 'Bountiful',
    pickup_zip: '84010',
    pickup_lat: 40.8894,
    pickup_lng: -111.8808,
    device_brand: 'Apple',
    device_model: 'iPhone 12',
    device_storage: '64GB',
    device_color: 'Black',
    device_condition: 'Good',
    imei: '353285101111222',
    quoted_amount: 190,
    expected_specs: JSON.stringify({ brand:'Apple', model:'iPhone 12', storage:'64GB', color:'Black', condition:'Good', powers_on:true, screen_cracks:false, icloud_locked:false }),
    window_start: hoursAgo(5),
    window_end: hoursAgo(3),
    packed: 1, paid: 0, paid_at: null, payment_method: null,
  },
  // 7. PAID — completed transaction, full chain of custody
  {
    partner_id: partners[0].id,
    driver_id: drivers[0].id,
    external_ref: 'WDB-10461',
    status: 'paid',
    seller_name: 'Casey Morgan',
    seller_phone: '801-555-1103',
    seller_email: 'casey@email.demo',
    pickup_address: '55 W 100 S',
    pickup_city: 'Salt Lake City',
    pickup_zip: '84101',
    pickup_lat: 40.767,
    pickup_lng: -111.891,
    device_brand: 'Apple',
    device_model: 'iPhone 13',
    device_storage: '128GB',
    device_color: 'Midnight',
    device_condition: 'Fair',
    imei: '353918101234560',
    quoted_amount: 245,
    expected_specs: JSON.stringify({ brand:'Apple', model:'iPhone 13', storage:'128GB', color:'Midnight', condition:'Fair', powers_on:true, screen_cracks:true, icloud_locked:false }),
    window_start: hoursAgo(8),
    window_end: hoursAgo(6),
    packed: 1, paid: 1, paid_at: hoursAgo(5.5), payment_method: 'ach_same_day',
  },
];

// ── Run seed in a transaction ─────────────────────────────────────────────────
const seed = db.transaction(() => {
  // Upsert partners + drivers (INSERT OR IGNORE keeps existing rows)
  for (const p of partners) insertPartner.run(p);
  for (const d of drivers)  insertDriver.run(d);

  // Re-resolve partner/driver IDs from DB in case rows already existed
  const p0 = db.prepare("SELECT id FROM partners WHERE email = ?").get('partner@wasatchbuyback.demo');
  const p1 = db.prepare("SELECT id FROM partners WHERE email = ?").get('ops@phonecash.demo');
  const d0 = db.prepare("SELECT id FROM drivers  WHERE email = ?").get('sam.driver@purcheaper.demo');
  const d1 = db.prepare("SELECT id FROM drivers  WHERE email = ?").get('mia.driver@purcheaper.demo');
  const d2 = db.prepare("SELECT id FROM drivers  WHERE email = ?").get('chris.driver@purcheaper.demo');

  for (const raw of sampleOrders) {
    // Remap IDs to whatever is actually in the DB
    const resolved = {
      ...raw,
      partner_id: raw.partner_id === partners[0].id ? p0.id : p1.id,
      driver_id: raw.driver_id === drivers[0].id ? d0.id
                : raw.driver_id === drivers[1].id ? d1.id
                : raw.driver_id === drivers[2].id ? d2.id
                : null,
    };
    const id = uuid();
    insertOrder.run({ id, ...resolved });

    insertEvent.run({ id: uuid(), order_id: id, actor_type: 'system', actor_id: null, event: 'created',
      detail: JSON.stringify({ source: 'seed', external_ref: raw.external_ref }) });

    if (resolved.driver_id) {
      insertEvent.run({ id: uuid(), order_id: id, actor_type: 'system', actor_id: null, event: 'assigned',
        detail: JSON.stringify({ driver_id: resolved.driver_id }) });
    }

    if (['en_route','picked_up','verified','paid','mismatch'].includes(raw.status)) {
      insertEvent.run({ id: uuid(), order_id: id, actor_type: 'driver', actor_id: resolved.driver_id, event: 'status_change',
        detail: JSON.stringify({ status: raw.status }) });
    }

    if (raw.status === 'mismatch') {
      insertEvent.run({ id: uuid(), order_id: id, actor_type: 'driver', actor_id: resolved.driver_id, event: 'mismatch_flagged',
        detail: JSON.stringify({ reason: 'iCloud activation lock present; expected unlocked', field: 'icloud_locked' }) });
    }

    if (raw.status === 'paid') {
      insertEvent.run({ id: uuid(), order_id: id, actor_type: 'partner', actor_id: resolved.partner_id, event: 'payment_released',
        detail: JSON.stringify({ amount: raw.quoted_amount, method: raw.payment_method, paid_at: raw.paid_at }) });
    }
  }
});

seed();

const finalCount = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
console.log('');
console.log('PurCheaper seed complete — ' + finalCount + ' orders in DB.');
console.log('');
console.log('  State breakdown:');
console.log('    pending   ×2  (open board — drivers can claim)');
console.log('    en_route  ×1  (Sam en route to SLC pickup)');
console.log('    picked_up ×1  (Mia has device, pre-verify)');
console.log('    verified  ×1  (specs match, awaiting pay release)');
console.log('    mismatch  ×1  (iCloud lock — partner review needed)');
console.log('    paid      ×1  (completed, ACH same-day)');
console.log('');
console.log('  Partner login:  partner@wasatchbuyback.demo / demo1234');
console.log('  Driver login:   sam.driver@purcheaper.demo  / driver1234');
console.log('  DB:', path.resolve(DB_PATH));
console.log('');
