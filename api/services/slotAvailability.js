/* Disponibilité des créneaux à capacité.
   Un créneau accepte `capacity` commandes. Une place est occupée par :
   - une commande payée,
   - une commande en attente de paiement récente (< 30 min, le temps du paiement SumUp),
   - une réservation temporaire active (slot_holds, 10 min). */
const db = require('../db/database');

// Nettoie les réservations temporaires expirées
function purgeExpiredHolds() {
  db.prepare('DELETE FROM slot_holds WHERE expires_at < ?').run(new Date().toISOString());
}

// Nombre de places occupées sur un créneau (commandes + réservations actives)
function takenCount(slotId) {
  const orders = db.prepare(`
    SELECT COUNT(*) AS n FROM orders
    WHERE slot_id = ?
      AND (status = 'paid' OR (status = 'pending' AND created_at > datetime('now', '-30 minutes')))
  `).get(slotId).n;
  const holds = db.prepare(
    'SELECT COUNT(*) AS n FROM slot_holds WHERE slot_id = ? AND expires_at > ?'
  ).get(slotId, new Date().toISOString()).n;
  return orders + holds;
}

// Capacité par défaut des nouveaux créneaux (réglable dans l'admin)
function defaultCapacity() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'default_slot_capacity'").get();
  const v = parseInt(row?.value);
  return Number.isInteger(v) && v >= 1 ? v : 3;
}

module.exports = { purgeExpiredHolds, takenCount, defaultCapacity };
