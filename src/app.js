require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Serialize BigInt as number in all JSON responses ────────────────────────
app.set('json replacer', (key, value) =>
  typeof value === 'bigint' ? Number(value) : value,
);

// ── Middleware ───────────────────────────────────────────────────────────────
const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('CORS origin denied'));
    },
    credentials: true,
  }),
);
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '1200', 10),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth.routes'));
app.use('/api/faculty',       require('./routes/faculty.routes'));
app.use('/api/subjects',      require('./routes/subject.routes'));
app.use('/api/timetable',     require('./routes/timetable.routes'));
app.use('/api/holidays',      require('./routes/holiday.routes'));
app.use('/api/constraints',   require('./routes/constraint.routes'));
app.use('/api/admin',         require('./routes/admin.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/copo',          require('./routes/copo.routes'));
app.use('/api/rooms',         require('./routes/room.routes'));
app.use('/api/timeslots',     require('./routes/timeslot.routes'));

// Profile endpoint (auth required, user-type-aware)
const authMw  = require('./middleware/auth.middleware');
const authCtrl = require('./controllers/auth.controller');
app.get('/api/profile', authMw, authCtrl.getProfile);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ success: false, message: 'Route not found' }),
);

// ── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅  TT App backend running on http://localhost:${PORT}/api`),
);

module.exports = app;
