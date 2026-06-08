require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(compression());
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : process.env.NODE_ENV === 'production'
    ? [
        'https://consignment.youthnic.shop',
        'https://consignment-packing-app.web.app',
        'https://consignment-packing-app.firebaseapp.com'
      ]
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

// CORS applied ONLY to /api/* routes — NOT to static frontend files.
// Vite adds crossorigin="" to script tags which sends an Origin header.
// If CORS middleware rejected it, the browser would refuse to run the JS → blank page.
const corsMiddleware = cors({
  origin: (origin, cb) => {
    // Allow: no origin (server-to-server), same-origin, or explicit allowlist
    if (!origin) return cb(null, true);
    // Allow any *.run.app URL (Cloud Run preview URLs)
    if (origin.endsWith('.run.app')) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cloud Run runs behind a proxy — trust it so rate-limit sees real client IPs
app.set('trust proxy', 1);

// Apply CORS only to API routes — static files (JS/CSS bundles) must NOT go through CORS
app.use('/api', corsMiddleware);

// ── Rate limiting (brute-force / abuse protection) ──
const rateLimit = require('express-rate-limit');
// Strict limiter for auth (login) — 10 attempts / 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});
// General API limiter — 300 requests / minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api', apiLimiter);

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/consignments', require('./routes/consignments'));

app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/productivity', require('./routes/productivity'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/packing', require('./routes/packing'));
app.use('/api/marketplaces', require('./routes/marketplaces'));
app.use('/api/users', require('./routes/users'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/docket-companies', require('./routes/docketCompanies'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/email',   require('./routes/email'));
app.use('/api/sku-catalog', require('./routes/skuCatalog'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  
  // Catch-all for React Router
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
