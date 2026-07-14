const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireAdmin = require('../middleware/requireAdmin');

router.use(requireAdmin);

// GET /api/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Paramètres from et to requis' });
  const tasks = db.prepare(
    'SELECT * FROM calendar_tasks WHERE date >= ? AND date <= ? ORDER BY date, start_time'
  ).all(from, to);
  res.json(tasks);
});

// POST /api/tasks
router.post('/', (req, res) => {
  const { title, date, start_time, end_time, color, notes } = req.body;
  if (!title || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }
  const result = db.prepare(
    'INSERT INTO calendar_tasks (title, date, start_time, end_time, color, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(title, date, start_time, end_time, color || '#3b82f6', notes || null);
  res.json(db.prepare('SELECT * FROM calendar_tasks WHERE id = ?').get(result.lastInsertRowid));
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM calendar_tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
