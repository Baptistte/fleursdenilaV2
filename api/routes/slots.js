const express = require('express');
const router = express.Router();
const db = require('../db/database');

const DEFAULT_TIMES = [
  ['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00'],
  ['14:00', '15:00'], ['15:00', '16:00'], ['16:00', '17:00']
];

// GET /api/slots?date=YYYY-MM-DD — créneaux pour une date (non exclusifs)
// Crée automatiquement les créneaux si la date n'en a pas encore
router.get('/', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Paramètre date requis' });

  const existing = db.prepare('SELECT COUNT(*) as n FROM slots WHERE date = ?').get(date);
  if (existing.n === 0) {
    const insert = db.prepare('INSERT INTO slots (date, start_time, end_time) VALUES (?, ?, ?)');
    for (const [start, end] of DEFAULT_TIMES) {
      insert.run(date, start, end);
    }
  }

  const slots = db.prepare(
    'SELECT id, date, start_time, end_time FROM slots WHERE date = ? ORDER BY start_time ASC'
  ).all(date);

  res.json(slots);
});

module.exports = router;
