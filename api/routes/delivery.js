const express = require('express');
const router = express.Router();
const { quoteDelivery, thresholdForZone } = require('../deliveryZones');
const { getThresholds } = require('../services/deliveryConfig');

// Limiteur très simple (par IP, fenêtre glissante d'une minute) : la route appelle un
// service d'adresse externe, on évite qu'elle serve de relais.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 40;
const hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return recent.length > MAX_PER_WINDOW;
}

// POST /api/delivery/quote — tarif de livraison d'une adresse (la zone est déduite de
// l'adresse, jamais fournie par le client). Body : { street, zip, city }
router.post('/quote', async (req, res) => {
  if (tooMany(req.ip)) {
    return res.status(429).json({ error: 'Trop de vérifications, réessayez dans une minute.' });
  }
  const { street, zip, city } = req.body || {};
  const quote = await quoteDelivery({ street, zip, city });
  if (!quote.ok) return res.status(quote.status).json({ error: quote.error });

  res.json({
    zone: quote.zone,
    zoneLabel: quote.label,
    fee: quote.fee,
    freeThreshold: thresholdForZone(quote.zone, getThresholds()),
    verified: quote.verified,
    matched: quote.matched,
  });
});

module.exports = router;
