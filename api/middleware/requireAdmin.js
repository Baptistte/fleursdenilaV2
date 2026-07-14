const { tokens, extractToken } = require('../routes/auth');

module.exports = function requireAdmin(req, res, next) {
  // Token Bearer (admin HTML depuis file://)
  const token = extractToken(req);
  if (token) {
    const entry = tokens.get(token);
    if (entry && entry.expiresAt > Date.now()) return next();
  }
  // Fallback session (accès depuis serveur http)
  if (req.session?.adminId) return next();
  res.status(401).json({ error: 'Non autorisé' });
};
