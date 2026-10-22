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
// Le webhook SumUp a besoin du corps brut (signature HMAC) : il n'est pas parsé ici
app.use((req, res, next) => (req.path.startsWith('/api/webhook') ? next() : express.json({ limit: '100kb' })(req, res, next)));

// En-têtes de sécurité (API uniquement : JSON et images, aucune page HTML)
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin',   // images /uploads affichées par le front (autre domaine)
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; frame-ancestors 'none'",
  });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// Images uploadées depuis l'admin (sur le volume persistant en prod : UPLOADS_DIR=/data/uploads)
const fs = require('fs');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', immutable: true }));

// Secret de session : jamais de valeur par défaut connue. En production sans SESSION_SECRET,
// un secret aléatoire est généré au démarrage (sessions perdues à chaque redémarrage) et
// l'anomalie est signalée dans les logs — à corriger en définissant la variable.
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === 'production') console.error('SESSION_SECRET manquant en production : secret aléatoire temporaire utilisé. Définissez la variable.');
  sessionSecret = process.env.NODE_ENV === 'production' ? require('crypto').randomBytes(32).toString('hex') : 'dev-secret-change-in-prod';
}

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'db') }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }
}));

// Cron — purge les réservations temporaires expirées toutes les minutes
const db = require('./db/database');
const { purgeExpiredHolds } = require('./services/slotAvailability');
setInterval(purgeExpiredHolds, 60 * 1000);

// Limiteurs de débit des routes publiques sensibles (par IP)
const rateLimit = require('./middleware/rateLimit');
app.use('/api/quotes', rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: 'Trop de demandes, réessayez plus tard.' }));
app.use('/api/checkout', rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }));
app.use('/api/cart', rateLimit({ windowMs: 60 * 1000, max: 40 }));
app.use('/api/track', rateLimit({ windowMs: 60 * 1000, max: 30 }));
app.use('/api/instagram', rateLimit({ windowMs: 60 * 1000, max: 60 }));

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/checkout', require('./routes/checkout'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/track', require('./routes/track'));
app.use('/api/instagram', require('./routes/instagram'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Configuration publique de la boutique (lue par le front à chaque page) :
// tarifs de livraison par zone et seuils de livraison offerte
app.get('/api/config', (req, res) => {
  res.json(require('./services/deliveryConfig').publicConfig());
});

// Renouvellement du jeton Instagram (vérifié au démarrage puis chaque jour)
const instagram = require('./services/instagram');
instagram.refreshTokenIfNeeded();
setInterval(instagram.refreshTokenIfNeeded, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`API Fleurs de Nila démarrée sur http://localhost:${PORT}`);
});
