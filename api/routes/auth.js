const express = require('express');
const router = express.Router();
const db = require('../db/database');
const crypto = require('crypto');

function hashPassword(p) {
  return crypto.createHash('sha256').update(p).digest('hex');
}

// Tokens en mémoire : Map<token, { adminId, expiresAt }>
const tokens = new Map();

// Nettoyage automatique des tokens expirés toutes les heures
setInterval(() => {
  const now = Date.now();
  for (const [t, v] of tokens) {
    if (v.expiresAt < now) tokens.delete(t);
  }
}, 60 * 60 * 1000);

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiants requis' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || admin.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
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
