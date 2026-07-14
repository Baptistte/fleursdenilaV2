const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireAdmin = require('../middleware/requireAdmin');

router.use(requireAdmin);

// GET /api/admin/stats — KPIs du tableau de bord
router.get('/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = today.slice(0, 7) + '-01';

  const totalProducts   = db.prepare("SELECT COUNT(*) as n FROM products").get().n;
  const activeProducts  = db.prepare("SELECT COUNT(*) as n FROM products WHERE active = 1").get().n;
  const lowStock        = db.prepare("SELECT COUNT(*) as n FROM products WHERE stock <= 2 AND active = 1").get().n;
  const outOfStock      = db.prepare("SELECT COUNT(*) as n FROM products WHERE stock = 0").get().n;

  const ordersTotal     = db.prepare("SELECT COUNT(*) as n FROM orders WHERE status = 'paid'").get().n;
  const ordersToday     = db.prepare("SELECT COUNT(*) as n FROM orders WHERE status = 'paid' AND date(created_at) = ?").get(today).n;
  const ordersMonth     = db.prepare("SELECT COUNT(*) as n FROM orders WHERE status = 'paid' AND created_at >= ?").get(firstDayOfMonth).n;

  const revenueTotal    = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status = 'paid'").get().s;
  const revenueMonth    = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status = 'paid' AND created_at >= ?").get(firstDayOfMonth).s;
  const revenueToday    = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status = 'paid' AND date(created_at) = ?").get(today).s;

  res.json({
    products: { total: totalProducts, active: activeProducts, lowStock, outOfStock },
    orders:   { total: ordersTotal, today: ordersToday, month: ordersMonth },
    revenue:  { total: revenueTotal, month: revenueMonth, today: revenueToday }
  });
});

// GET /api/admin/orders — toutes les commandes
router.get('/orders', (req, res) => {
  const { status, date, limit = 50 } = req.query;
  const wheres = [];
  const params = [];
  if (status) { wheres.push('o.status = ?'); params.push(status); }
  if (date)   { wheres.push('s.date = ?');   params.push(date); }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const order = date ? 'ORDER BY s.start_time ASC' : 'ORDER BY o.created_at DESC';
  const query = `SELECT o.*, s.date, s.start_time, s.end_time FROM orders o LEFT JOIN slots s ON o.slot_id = s.id ${where} ${order} LIMIT ?`;
  params.push(parseInt(limit));
  const rows = db.prepare(query).all(...params);
  rows.forEach(o => { try { o.items = JSON.parse(o.items); } catch { o.items = []; } });
  res.json(rows);
});

// GET /api/admin/products — tous les produits (actifs et inactifs)
router.get('/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id ASC').all();
  products.forEach(p => {
    p.images = JSON.parse(p.images);
    p.options = JSON.parse(p.options);
  });
  res.json(products);
});

// POST /api/admin/products — créer un produit
router.post('/products', (req, res) => {
  const { name, description, price, images = [], options = [], stock, active = 1 } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'name et price requis' });

  const result = db.prepare(`
    INSERT INTO products (name, description, price, images, options, stock, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, description, price, JSON.stringify(images), JSON.stringify(options), stock ?? 0, active);

  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/admin/products/:id — modifier un produit
router.put('/products/:id', (req, res) => {
  const { name, description, price, images, options, stock, active } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  db.prepare(`
    UPDATE products SET
      name = ?, description = ?, price = ?, images = ?, options = ?, stock = ?, active = ?
    WHERE id = ?
  `).run(
    name ?? product.name,
    description ?? product.description,
    price ?? product.price,
    images ? JSON.stringify(images) : product.images,
    options ? JSON.stringify(options) : product.options,
    stock ?? product.stock,
    active ?? product.active,
    req.params.id
  );

  res.json({ ok: true });
});

// DELETE /api/admin/products/:id — supprimer un produit
router.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// PATCH /api/admin/orders/:id/status — changer le statut d'une commande
router.patch('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['paid', 'pending', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide (paid | pending | cancelled)' });
  }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true, status });
});

// GET /api/admin/tournee?date=YYYY-MM-DD — commandes du jour triées par créneau
router.get('/tournee', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Paramètre date requis' });

  const orders = db.prepare(`
    SELECT o.*, s.start_time, s.end_time
    FROM orders o
    JOIN slots s ON o.slot_id = s.id
    WHERE s.date = ? AND o.status = 'paid'
    ORDER BY s.start_time ASC
  `).all(date);

  orders.forEach(o => { o.items = JSON.parse(o.items); });
  res.json(orders);
});

// GET /api/admin/slots — tous les créneaux
router.get('/slots', (req, res) => {
  const { date } = req.query;
  const query = date
    ? 'SELECT * FROM slots WHERE date = ? ORDER BY start_time ASC'
    : 'SELECT * FROM slots ORDER BY date ASC, start_time ASC';
  const slots = date
    ? db.prepare(query).all(date)
    : db.prepare(query).all();
  res.json(slots);
});

// POST /api/admin/slots — créer un créneau
router.post('/slots', (req, res) => {
  const { date, start_time, end_time } = req.body;
  if (!date || !start_time || !end_time) return res.status(400).json({ error: 'date, start_time et end_time requis' });

  const result = db.prepare(
    'INSERT INTO slots (date, start_time, end_time) VALUES (?, ?, ?)'
  ).run(date, start_time, end_time);

  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /api/admin/slots/:id
router.delete('/slots/:id', (req, res) => {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Créneau introuvable' });
  db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/admin/slots?date=YYYY-MM-DD — bloquer un jour entier (supprimer tous ses créneaux)
router.delete('/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Paramètre date requis' });
  const info = db.prepare('DELETE FROM slots WHERE date = ?').run(date);
  res.json({ ok: true, deleted: info.changes });
});

module.exports = router;
