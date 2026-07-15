const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');

const RESERVATION_MINUTES = 10;

// POST /api/cart/reserve-slot — réservation temporaire d'un créneau (10 min)
// Body : { slotId, previousSlotId?, previousToken? } — libère l'ancien créneau du client si fourni.
// Retourne { slotId, token, reservedUntil } ; le token prouve la propriété de la réservation.
router.post('/reserve-slot', (req, res) => {
  const { slotId, previousSlotId, previousToken } = req.body;
  if (!slotId) return res.status(400).json({ error: 'slotId requis' });

  const now = new Date();
  const nowIso = now.toISOString();
  const reservedUntil = new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000).toISOString();

  // Libère l'ancien créneau du client (changement de créneau ou de date)
  if (previousSlotId && previousToken && previousSlotId !== slotId) {
    db.prepare(
      'UPDATE slots SET reserved_until = NULL, reservation_token = NULL WHERE id = ? AND reservation_token = ? AND order_id IS NULL'
    ).run(previousSlotId, previousToken);
  }

  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  if (!slot) return res.status(404).json({ error: 'Créneau introuvable' });

  if (slot.order_id) return res.status(409).json({ error: 'Créneau déjà pris' });

  const isHeldByOther = slot.reserved_until && slot.reserved_until > nowIso
    && slot.reservation_token !== previousToken;
  if (isHeldByOther) {
    return res.status(409).json({ error: 'Créneau temporairement réservé par un autre client' });
  }

  const token = crypto.randomUUID();
  db.prepare('UPDATE slots SET reserved_until = ?, reservation_token = ? WHERE id = ?')
    .run(reservedUntil, token, slotId);

  res.json({ slotId, token, reservedUntil });
});

// DELETE /api/cart/release-slot — libération manuelle (abandon du panier)
// Accepte aussi POST pour sendBeacon (pagehide). Body : { slotId, token }
function releaseSlot(req, res) {
  let body = req.body;
  // sendBeacon envoie un Blob text/plain : le body arrive brut
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { slotId, token } = body || {};
  if (!slotId || !token) return res.status(400).json({ error: 'slotId et token requis' });
  db.prepare(
    'UPDATE slots SET reserved_until = NULL, reservation_token = NULL WHERE id = ? AND reservation_token = ? AND order_id IS NULL'
  ).run(slotId, token);
  res.json({ ok: true });
}
router.delete('/release-slot', releaseSlot);
router.post('/release-slot', express.text({ type: '*/*' }), releaseSlot);

module.exports = router;
