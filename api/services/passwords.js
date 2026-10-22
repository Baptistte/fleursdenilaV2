/* Hachage des mots de passe admin : scrypt salé (format « scrypt$sel$hash »).
   Les anciens hachages SHA-256 non salés restent acceptés à la connexion, puis sont
   remplacés automatiquement par un hachage scrypt (cf. routes/auth.js). */
const crypto = require('crypto');

const KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

function isLegacy(stored) {
  return !String(stored).startsWith('scrypt$');
}

function verifyPassword(password, stored) {
  stored = String(stored || '');
  if (isLegacy(stored)) {
    const legacy = crypto.createHash('sha256').update(String(password)).digest('hex');
    return safeEqualHex(legacy, stored);
  }
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return safeEqualHex(candidate, hash);
}

module.exports = { hashPassword, verifyPassword, isLegacy };
