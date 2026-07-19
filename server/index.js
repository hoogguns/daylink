require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { getDb } = require('./db');

// ensure DB + schema; auto-seed empty store for launch demos
getDb();
try {
  const count = getDb().prepare('SELECT COUNT(*) AS c FROM partners').get().c;
  if (count === 0) {
    console.log('  Empty database — running seed…');
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], {
      stdio: 'inherit',
      env: process.env,
    });
  }
} catch (err) {
  console.warn('  Seed check skipped:', err.message);
}

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const publicRoutes = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3847;
const publicDir = path.join(__dirname, '..', 'public');
const isProd = process.env.NODE_ENV === 'production';

// Security-ish headers (no extra deps)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors(
    corsOrigin
      ? { origin: corsOrigin.split(',').map((s) => s.trim()) }
      : undefined
  )
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(isProd ? 'combined' : 'dev'));

// API
app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', orderRoutes);

// Static marketing + apps
app.use(
  express.static(publicDir, {
    maxAge: isProd ? '1h' : 0,
    etag: true,
  })
);

function sendApp(file) {
  return (_req, res) => res.sendFile(path.join(publicDir, file));
}

app.get('/dashboard', sendApp('dashboard.html'));
app.get('/dashboard/{*rest}', sendApp('dashboard.html'));
app.get('/drivers', sendApp('drivers.html'));
app.get('/drivers/{*rest}', sendApp('drivers.html'));
app.get('/partners', sendApp('partners.html'));
app.get('/partners/{*rest}', sendApp('partners.html'));
app.get('/privacy', sendApp('privacy.html'));
app.get('/terms', sendApp('terms.html'));
app.get('/launch', sendApp('launch.html'));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  next();
});

// HTML 404
app.use((req, res) => {
  const notFound = path.join(publicDir, '404.html');
  if (fs.existsSync(notFound)) {
    res.status(404).sendFile(notFound);
  } else {
    res.status(404).type('text').send('Not found');
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
});

app.listen(PORT, () => {
  console.log('');
  console.log('  DayLink — same-day device buyback logistics');
  console.log(`  Market:  Ogden → Salt Lake City → Provo`);
  console.log(`  Mode:    ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Partner: http://localhost:${PORT}/dashboard`);
  console.log(`  Driver:  http://localhost:${PORT}/drivers`);
  console.log(`  Launch:  http://localhost:${PORT}/launch`);
  console.log('');
});
