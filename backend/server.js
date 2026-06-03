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
        'https://consignment.youthnic.shop',     // Primary custom domain
        'https://consignment-packing-app.web.app',
        'https://consignment-packing-app.firebaseapp.com'
      ]
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

// In production on Cloud Run, frontend is served from the SAME origin as the API,
// so CORS is only needed for external cross-origin requests (Firebase SDK, etc.).
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (origin === undefined) and any allowed origin
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
