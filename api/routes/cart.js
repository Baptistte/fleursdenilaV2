const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const { purgeExpiredHolds, takenCount } = require('../services/slotAvailability');

const RESERVATION_MINUTES = 10;

// POST /api/cart/reserve-slot — réservation temporaire d'une place sur un créneau (10 min)
// Body : { slotId, previousSlotId?, previousToken? } — libère l'ancienne réservation du client.
// Retourne { slotId, token, reservedUntil } ; le token prouve la propriété de la réservation.
router.post('/reserve-slot', (req, res) => {
  const { slotId, previousToken } = req.body;
  if (!slotId) return res.status(400).json({ error: 'slotId requis' });

  purgeExpiredHolds();

  // Libère l'ancienne réservation du client (changement de créneau ou de date)
  if (previousToken) {
    db.prepare('DELETE FROM slot_holds WHERE token = ?').run(previousToken);
  }

  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  if (!slot) return res.status(404).json({ error: 'Créneau introuvable' });

  if (takenCount(slotId) >= slot.capacity) {
    return res.status(409).json({ error: 'Créneau complet' });
  }

  const token = crypto.randomUUID();
  const reservedUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000).toISOString();
  db.prepare('INSERT INTO slot_holds (slot_id, token, expires_at) VALUES (?, ?, ?)')
    .run(slotId, token, reservedUntil);

  res.json({ slotId, token, reservedUntil });
});

// DELETE /api/cart/release-slot — libération manuelle (abandon du panier)
// Accepte aussi POST pour sendBeacon (pagehide). Body : { slotId, token }
function releaseSlot(req, res) {
  let body = req.body;
  // sendBeacon envoie un Blob text/plain : le body arrive brut
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { token } = body || {};
  if (!token) return res.status(400).json({ error: 'token requis' });
  db.prepare('DELETE FROM slot_holds WHERE token = ?').run(token);
  res.json({ ok: true });
}
router.delete('/release-slot', releaseSlot);
router.post('/release-slot', express.text({ type: '*/*' }), releaseSlot);

module.exports = router;
