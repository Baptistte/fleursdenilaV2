const express = require('express');
const router = express.Router();
const db = require('../db/database');
const crypto = require('crypto');

const { hashPassword, verifyPassword, isLegacy } = require('../services/passwords');
const rateLimit = require('../middleware/rateLimit');

// Anti force brute : verrouillage progressif par identifiant ET par IP.
// 5 échecs → blocage 1 min, doublé à chaque nouvel échec (plafonné à 30 min).
// Un succès remet le compteur à zéro.
const failures = new Map();   // clé → { count, lockedUntil }
const MAX_FREE_ATTEMPTS = 5;
const MAX_LOCK_MS = 30 * 60 * 1000;

function lockRemaining(keys) {
  const now = Date.now();
  let wait = 0;
  for (const k of keys) {
    const f = failures.get(k);
    if (f && f.lockedUntil > now) wait = Math.max(wait, f.lockedUntil - now);
  }
  return wait;
}
function registerFailure(keys) {
  for (const k of keys) {
    const f = failures.get(k) || { count: 0, lockedUntil: 0 };
    f.count += 1;
    if (f.count >= MAX_FREE_ATTEMPTS) {
      f.lockedUntil = Date.now() + Math.min(60 * 1000 * 2 ** (f.count - MAX_FREE_ATTEMPTS), MAX_LOCK_MS);
    }
    failures.set(k, f);
  }
  if (failures.size > 5000) failures.delete(failures.keys().next().value);
}

// Tokens en mémoire : Map<token, { adminId, expiresAt }>
const tokens = new Map();

// Nettoyage automatique des tokens expirés toutes les heures
setInterval(() => {
  const now = Date.now();
  for (const [k, f] of failures) {
    if (f.lockedUntil < now - MAX_LOCK_MS) failures.delete(k);
  }
  for (const [t, v] of tokens) {
    if (v.expiresAt < now) tokens.delete(t);
  }
}, 60 * 60 * 1000);

// POST /api/auth/login
router.post('/login', rateLimit({ windowMs: 60 * 1000, max: 20, message: 'Trop de tentatives, réessayez dans une minute.' }), (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Identifiants requis' });
  }
  if (username.length > 100 || password.length > 200) {
    return res.status(400).json({ error: 'Identifiants invalides' });
  }

  const keys = [`ip:${req.ip}`, `user:${username.toLowerCase()}`];
  const wait = lockRemaining(keys);
  if (wait > 0) {
    res.set('Retry-After', String(Math.ceil(wait / 1000)));
    return res.status(429).json({ error: `Trop d'échecs. Réessayez dans ${Math.ceil(wait / 60000)} min.` });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  // Vérification faite même si le compte n'existe pas (temps de réponse comparable)
  const ok = admin
    ? verifyPassword(password, admin.password_hash)
    : (verifyPassword(password, 'scrypt$00$00'), false);
  if (!ok) {
    registerFailure(keys);
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  failures.delete(keys[0]);
  failures.delete(keys[1]);
  // Migration transparente d'un ancien hachage SHA-256 vers scrypt
  if (isLegacy(admin.password_hash)) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(password), admin.id);
  }

  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, { adminId: admin.id, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });

  res.json({ ok: true, token });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = extractToken(req);
  if (token) tokens.delete(token);
  req.session?.destroy?.();
  res.json({ ok: true });
});

function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

module.exports = router;
module.exports.tokens = tokens;
module.exports.extractToken = extractToken;
