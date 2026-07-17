const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Événements acceptés (liste blanche : l'endpoint est public)
const ALLOWED_EVENTS = ['payment_page_reached'];

// POST /api/track — enregistre un événement du tunnel de commande.
// Données anonymes (pas d'info client), à but d'amélioration continue.
router.post('/', (req, res) => {
  const { event, slotId, mode, cartTotal, itemsCount } = req.body || {};

  if (!ALLOWED_EVENTS.includes(event)) {
    return res.status(400).json({ error: 'Événement inconnu' });
  }

  db.prepare(`
    INSERT INTO checkout_events (event, slot_id, mode, cart_total, items_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    event,
    Number.isInteger(parseInt(slotId)) ? parseInt(slotId) : null,
    ['delivery', 'pickup'].includes(mode) ? mode : null,
    Number.isFinite(parseFloat(cartTotal)) ? Math.min(parseFloat(cartTotal), 100000) : null,
    Number.isInteger(parseInt(itemsCount)) ? Math.min(parseInt(itemsCount), 1000) : null
  );

  res.status(201).json({ ok: true });
});

module.exports = router;
