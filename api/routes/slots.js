const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { purgeExpiredHolds, takenCount, defaultCapacity } = require('../services/slotAvailability');

const DEFAULT_TIMES = [
  ['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00'],
  ['14:00', '15:00'], ['15:00', '16:00'], ['16:00', '17:00']
];

// GET /api/slots?date=YYYY-MM-DD — créneaux pour une date, avec capacité.
// Un créneau reste disponible tant que (commandes + réservations actives) < capacité.
// Crée automatiquement les créneaux si la date n'en a pas encore.
router.get('/', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Paramètre date requis' });

  // Jour bloqué par l'admin : aucun créneau, et surtout pas d'auto-création
  const blocked = db.prepare('SELECT 1 FROM blocked_dates WHERE date = ?').get(date);
  if (blocked) return res.json([]);

  const existing = db.prepare('SELECT COUNT(*) as n FROM slots WHERE date = ?').get(date);
  if (existing.n === 0) {
    const cap = defaultCapacity();
    const insert = db.prepare('INSERT INTO slots (date, start_time, end_time, capacity) VALUES (?, ?, ?, ?)');
    for (const [start, end] of DEFAULT_TIMES) {
      insert.run(date, start, end, cap);
    }
  }

  purgeExpiredHolds();
  const slots = db.prepare(
    'SELECT id, date, start_time, end_time, capacity FROM slots WHERE date = ? ORDER BY start_time ASC'
  ).all(date);

  res.json(slots.map(s => ({
    id: s.id,
    date: s.date,
    start_time: s.start_time,
    end_time: s.end_time,
    available: takenCount(s.id) < s.capacity
  })));
});

module.exports = router;
