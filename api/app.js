require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://fleursdeniladeveloppement.netlify.app',   // front de test (Netlify)
  'http://localhost:5500',
  'http://127.0.0.1:5500'
].filter(Boolean);

// Derrière le proxy Railway/Nginx : nécessaire pour les cookies "secure"
app.set('trust proxy', 1);
app.use(cors({
  origin: (origin, cb) => {
    // Accepter file:// (origin vaut la chaîne "null" ou undefined) et les origines autorisées
    if (!origin || origin === 'null' || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS non autorisé'));
  },
  credentials: true
}));
app.use(express.json());

// Images uploadées depuis l'admin (sur le volume persistant en prod : UPLOADS_DIR=/data/uploads)
const fs = require('fs');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', immutable: true }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'db') }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }
}));

// Cron — purge les réservations temporaires expirées toutes les minutes
const db = require('./db/database');
const { purgeExpiredHolds } = require('./services/slotAvailability');
setInterval(purgeExpiredHolds, 60 * 1000);

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/checkout', require('./routes/checkout'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Configuration publique de la boutique (lue par le front à chaque page)
app.get('/api/config', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'free_delivery_threshold'").get();
  const threshold = parseFloat(row?.value);
  res.json({ freeDeliveryThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : 60 });
});

app.listen(PORT, () => {
  console.log(`API Fleurs de Nila démarrée sur http://localhost:${PORT}`);
});
