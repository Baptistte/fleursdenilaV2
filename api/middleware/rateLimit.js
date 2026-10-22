/* Limiteur de débit en mémoire (fenêtre glissante, par IP) pour les routes publiques.
   Usage : router.post('/', rateLimit({ windowMs: 60000, max: 10 }), handler) */
module.exports = function rateLimit({ windowMs = 60 * 1000, max = 30, message = 'Trop de requêtes, réessayez dans un instant.' } = {}) {
  const hits = new Map();
  return function (req, res, next) {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter(t => now - t < windowMs);
    recent.push(now);
    hits.set(req.ip, recent);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    if (recent.length > max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
};
