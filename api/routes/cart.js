const express = require('express');
const router = express.Router();
const db = require('../db/database');

const RESERVATION_MINUTES = 10;

// POST /api/cart/reserve-slot — réservation temporaire d'un créneau (10 min)
router.post('/reserve-slot', (req, res) => {
  const { slotId } = req.body;
  if (!slotId) return res.status(400).json({ error: 'slotId requis' });

  const now = new Date();
  const reservedUntil = new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000).toISOString();

  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  if (!slot) return res.status(404).json({ error: 'Créneau introuvable' });

  if (slot.order_id) return res.status(409).json({ error: 'Créneau déjà pris' });
  if (slot.reserved_until && slot.reserved_until > now.toISOString()) {
    return res.status(409).json({ error: 'Créneau temporairement réservé' });
  }

  db.prepare('UPDATE slots SET reserved_until = ? WHERE id = ?').run(reservedUntil, slotId);

  res.json({ slotId, reservedUntil });
});

// DELETE /api/cart/release-slot — libération manuelle (abandon du panier)
// Accepte aussi POST pour sendBeacon (beforeunload)
function releaseSlot(req, res) {
  const { slotId } = req.body;
  if (!slotId) return res.status(400).json({ error: 'slotId requis' });
  db.prepare('UPDATE slots SET reserved_until = NULL WHERE id = ? AND order_id IS NULL').run(slotId);
  res.json({ ok: true });
}
router.delete('/release-slot', releaseSlot);
router.post('/release-slot', releaseSlot);

module.exports = router;
