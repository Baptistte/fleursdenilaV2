const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db/database');
const requireAdmin = require('../middleware/requireAdmin');
const { purgeExpiredHolds, takenCount, defaultCapacity } = require('../services/slotAvailability');
const { TEMPLATES, renderTemplate, sendEmail, sendOrderEmails, sampleData } = require('../services/mailer');

router.use(requireAdmin);

// ── Upload d'images produits ───────────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      // Nom sûr : timestamp + nom d'origine slugifié (pas d'accents ni caractères spéciaux)
      const ext = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' }[file.mimetype];
      const base = path.basename(file.originalname, path.extname(file.originalname))
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .toLowerCase().slice(0, 40) || 'image';
      cb(null, `${Date.now()}-${base}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 Mo
  fileFilter: (req, file, cb) => {
    if (['image/webp', 'image/jpeg', 'image/png'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format non accepté (webp, jpeg ou png uniquement)'));
  }
});

// POST /api/admin/upload — reçoit un fichier image, retourne son URL publique
router.post('/upload', (req, res) => {
  upload.single('image')(req, res, err => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde (5 Mo maximum)' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    // URL absolue : fonctionne depuis le front Netlify comme depuis l'admin en local
    const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.status(201).json({ url });
  });
});

// POST /api/admin/seed-demo — insère les données de démo sur une base VIDE
// (refusé si des produits existent déjà : aucun risque d'écraser du vrai contenu)
router.post('/seed-demo', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (n > 0) return res.status(409).json({ error: 'Des produits existent déjà — seed refusé.' });
  const { seedDemo } = require('../db/seed');
  const result = seedDemo();
  res.status(201).json({ ok: true, ...result });
});

// GET /api/admin/stats — KPIs du tableau de bord
router.get('/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = today.slice(0, 7) + '-01';

  const totalProducts   = db.prepare("SELECT COUNT(*) as n FROM products").get().n;
  const activeProducts  = db.prepare("SELECT COUNT(*) as n FROM products WHERE active = 1").get().n;
  const lowStock        = db.prepare("SELECT COUNT(*) as n FROM products WHERE stock <= 2 AND active = 1").get().n;
  const outOfStock      = db.prepare("SELECT COUNT(*) as n FROM products WHERE stock = 0").get().n;

  const ordersTotal     = db.prepare("SELECT COUNT(*) as n FROM orders WHERE status = 'paid'").get().n;
  const ordersToValidate = db.prepare("SELECT COUNT(*) as n FROM orders WHERE status = 'paid' AND validated = 0").get().n;
  const ordersToday     = db.prepare("SELECT COUNT(*) as n FROM orders WHERE status = 'paid' AND date(created_at) = ?").get(today).n;
  const ordersMonth     = db.prepare("SELECT COUNT(*) as n FROM orders WHERE status = 'paid' AND created_at >= ?").get(firstDayOfMonth).n;

  const revenueTotal    = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status = 'paid'").get().s;
  const revenueMonth    = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status = 'paid' AND created_at >= ?").get(firstDayOfMonth).s;
  const revenueToday    = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status = 'paid' AND date(created_at) = ?").get(today).s;

  res.json({
    products: { total: totalProducts, active: activeProducts, lowStock, outOfStock },
    orders:   { total: ordersTotal, today: ordersToday, month: ordersMonth, toValidate: ordersToValidate },
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

// GET /api/admin/home-products — IDs des produits mis en avant sur l'accueil
router.get('/home-products', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'home_products'").get();
  let ids = [];
  try { ids = JSON.parse(row?.value || '[]'); } catch { ids = []; }
  res.json({ ids });
});

// PUT /api/admin/home-products — définir les produits mis en avant (max 3)
router.put('/home-products', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids doit être un tableau' });

  // Nettoyage : entiers valides, uniques, max 3
  const clean = [...new Set(ids.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 3);

  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('home_products', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(clean));

  res.json({ ok: true, ids: clean });
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

// Normalise un numéro FR pour regrouper les commandes d'un même client :
// « +33 6 12 34 56 78 », « 06.12.34.56.78 » et « 0612345678 » → « 0612345678 »
function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('33') && digits.length === 11) digits = '0' + digits.slice(2);
  return digits.length === 10 ? digits : (digits || null);
}

// GET /api/admin/customers — fiche client par numéro de téléphone
// Agrège toutes les commandes ; chaque client embarque son historique.
router.get('/customers', (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, s.date AS slot_date, s.start_time, s.end_time
    FROM orders o LEFT JOIN slots s ON o.slot_id = s.id
    WHERE o.customer_phone IS NOT NULL AND o.customer_phone != ''
    ORDER BY o.created_at DESC
  `).all();

  const map = new Map();
  for (const o of orders) {
    const key = normalizePhone(o.customer_phone);
    if (!key) continue;
    let c = map.get(key);
    if (!c) {
      c = {
        phone: key,
        phoneDisplay: o.customer_phone,
        name: o.customer_name,          // nom de la commande la plus récente
        email: o.customer_email || '',
        ordersCount: 0,
        paidCount: 0,
        totalSpent: 0,                  // somme des commandes payées uniquement
        lastOrderAt: o.created_at,
        orders: []
      };
      map.set(key, c);
    }
    if (!c.email && o.customer_email) c.email = o.customer_email;
    c.ordersCount++;
    if (o.status === 'paid') { c.paidCount++; c.totalSpent += o.total; }
    let items = [];
    try { items = JSON.parse(o.items); } catch { items = []; }
    c.orders.push({
      id: o.id,
      total: o.total,
      status: o.status,
      validated: o.validated,
      delivery_type: o.delivery_type,
      created_at: o.created_at,
      slot: o.slot_date ? `${o.slot_date} ${o.start_time || ''}` : null,
      items
    });
  }

  const customers = [...map.values()];
  customers.forEach(c => { c.totalSpent = Math.round(c.totalSpent * 100) / 100; });
  customers.sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
  res.json(customers);
});

// PATCH /api/admin/orders/:id/validate — valider ou refuser le créneau d'une commande payée
// Body : { action: 'accept' | 'refuse' }
// Refus : commande annulée, créneau libéré, stocks restitués (le remboursement SumUp reste manuel).
router.patch('/orders/:id/validate', (req, res) => {
  const { action } = req.body;
  if (!['accept', 'refuse'].includes(action)) {
    return res.status(400).json({ error: "action invalide ('accept' | 'refuse')" });
  }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.status !== 'paid') return res.status(400).json({ error: 'Seule une commande payée peut être validée ou refusée' });

  if (action === 'accept') {
    db.prepare('UPDATE orders SET validated = 1 WHERE id = ?').run(order.id);
    sendOrderEmails('order_validated', order.id);
    return res.json({ ok: true, validated: true });
  }

  // Refus : tout se fait en une transaction
  const refuse = db.transaction(() => {
    // L'annulation libère automatiquement la place (comptage des commandes actives)
    db.prepare("UPDATE orders SET status = 'cancelled', validated = 0 WHERE id = ?").run(order.id);
    let items = [];
    try { items = JSON.parse(order.items); } catch { items = []; }
    const restock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    for (const item of items) restock.run(item.qty, item.id);
  });
  refuse();
  sendOrderEmails('order_refused', order.id);

  res.json({ ok: true, refused: true });
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
// Avec ?date= : { blocked, slots } — chaque créneau expose sa capacité et son remplissage
router.get('/slots', (req, res) => {
  const { date } = req.query;
  if (date) {
    const blocked = !!db.prepare('SELECT 1 FROM blocked_dates WHERE date = ?').get(date);
    purgeExpiredHolds();
    const slots = db.prepare('SELECT * FROM slots WHERE date = ? ORDER BY start_time ASC').all(date)
      .map(s => ({ ...s, booked: takenCount(s.id) }));
    return res.json({ blocked, slots });
  }
  res.json(db.prepare('SELECT * FROM slots ORDER BY date ASC, start_time ASC').all());
});

// POST /api/admin/slots — créer un créneau (débloque le jour : action explicite de l'admin)
// Unicité garantie : impossible de créer deux fois le même horaire le même jour.
router.post('/slots', (req, res) => {
  const { date, start_time, end_time, capacity } = req.body;
  if (!date || !start_time || !end_time) return res.status(400).json({ error: 'date, start_time et end_time requis' });
  const cap = parseInt(capacity);
  if (capacity != null && (!Number.isInteger(cap) || cap < 1 || cap > 100)) {
    return res.status(400).json({ error: 'Capacité invalide (entre 1 et 100)' });
  }

  const exists = db.prepare('SELECT 1 FROM slots WHERE date = ? AND start_time = ? AND end_time = ?')
    .get(date, start_time, end_time);
  if (exists) return res.status(409).json({ error: `Le créneau ${start_time}–${end_time} existe déjà ce jour-là. Modifiez plutôt sa capacité.` });

  db.prepare('DELETE FROM blocked_dates WHERE date = ?').run(date);
  const result = db.prepare(
    'INSERT INTO slots (date, start_time, end_time, capacity) VALUES (?, ?, ?, ?)'
  ).run(date, start_time, end_time, Number.isInteger(cap) ? cap : defaultCapacity());

  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/admin/slots/:id — modifier la capacité d'un créneau
router.patch('/slots/:id', (req, res) => {
  const cap = parseInt(req.body.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 100) {
    return res.status(400).json({ error: 'Capacité invalide (entre 1 et 100)' });
  }
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Créneau introuvable' });
  db.prepare('UPDATE slots SET capacity = ? WHERE id = ?').run(cap, req.params.id);
  res.json({ ok: true, capacity: cap, booked: takenCount(slot.id) });
});

// POST /api/admin/slots/recurring — créer des créneaux récurrents
// Body : { weekdays: [0-6, dimanche=0], start_time, end_time, from: 'YYYY-MM-DD', until: 'YYYY-MM-DD' }
// Crée un créneau start_time–end_time pour chaque jour de la période dont le jour de semaine correspond.
// Les doublons exacts (même date + mêmes horaires) sont ignorés.
router.post('/slots/recurring', (req, res) => {
  const { weekdays, start_time, end_time, from, until } = req.body;
  if (!Array.isArray(weekdays) || !weekdays.length || !start_time || !end_time || !from || !until) {
    return res.status(400).json({ error: 'weekdays, start_time, end_time, from et until requis' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || from > until) {
    return res.status(400).json({ error: 'Période invalide' });
  }
  // Garde-fou : 1 an maximum
  const MAX_DAYS = 366;
  const days = Math.round((new Date(until) - new Date(from)) / 86400000) + 1;
  if (days > MAX_DAYS) return res.status(400).json({ error: 'Période limitée à 1 an' });

  const cap = parseInt(req.body.capacity);
  if (req.body.capacity != null && (!Number.isInteger(cap) || cap < 1 || cap > 100)) {
    return res.status(400).json({ error: 'Capacité invalide (entre 1 et 100)' });
  }
  const slotCapacity = Number.isInteger(cap) ? cap : defaultCapacity();

  const wanted = new Set(weekdays.map(Number));
  const exists = db.prepare('SELECT 1 FROM slots WHERE date = ? AND start_time = ? AND end_time = ?');
  const isBlocked = db.prepare('SELECT 1 FROM blocked_dates WHERE date = ?');
  const insert = db.prepare('INSERT INTO slots (date, start_time, end_time, capacity) VALUES (?, ?, ?, ?)');

  let created = 0, skipped = 0;
  const run = db.transaction(() => {
    const d = new Date(from + 'T00:00:00Z');
    for (let i = 0; i < days; i++) {
      if (wanted.has(d.getUTCDay())) {
        const iso = d.toISOString().split('T')[0];
        // Les jours bloqués par l'admin sont ignorés (comme les doublons)
        if (exists.get(iso, start_time, end_time) || isBlocked.get(iso)) skipped++;
        else { insert.run(iso, start_time, end_time, slotCapacity); created++; }
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
  });
  run();

  res.status(201).json({ ok: true, created, skipped });
});

// DELETE /api/admin/slots/:id
router.delete('/slots/:id', (req, res) => {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Créneau introuvable' });
  db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/admin/slots?date=YYYY-MM-DD — bloquer un jour entier :
// supprime ses créneaux ET marque la date bloquée (sinon l'auto-création les recrée)
router.delete('/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Paramètre date requis' });
  const block = db.transaction(() => {
    const info = db.prepare('DELETE FROM slots WHERE date = ?').run(date);
    db.prepare('INSERT OR IGNORE INTO blocked_dates (date) VALUES (?)').run(date);
    return info.changes;
  });
  res.json({ ok: true, deleted: block() });
});

// DELETE /api/admin/blocked-days/:date — débloquer un jour
// (les créneaux par défaut seront recréés à la prochaine consultation client,
//  ou l'admin peut en créer manuellement)
router.delete('/blocked-days/:date', (req, res) => {
  db.prepare('DELETE FROM blocked_dates WHERE date = ?').run(req.params.date);
  res.json({ ok: true });
});

// ── Panneau Messages (emails / SMS) ────────────────────────────────────

// GET /api/admin/messages — journal + statistiques
router.get('/messages', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const messages = db.prepare(`
    SELECT * FROM messages ORDER BY id DESC LIMIT ?
  `).all(limit);

  const stats = {
    total:     db.prepare('SELECT COUNT(*) n FROM messages').get().n,
    sent:      db.prepare("SELECT COUNT(*) n FROM messages WHERE status = 'sent'").get().n,
    simulated: db.prepare("SELECT COUNT(*) n FROM messages WHERE status = 'simulated'").get().n,
    failed:    db.prepare("SELECT COUNT(*) n FROM messages WHERE status = 'failed'").get().n,
    last30d:   db.prepare("SELECT COUNT(*) n FROM messages WHERE created_at > datetime('now', '-30 days')").get().n,
    byTemplate: db.prepare('SELECT template, COUNT(*) n FROM messages GROUP BY template ORDER BY n DESC').all(),
  };

  res.json({ stats, messages, mailerConfigured: !!process.env.RESEND_API_KEY });
});

// GET /api/admin/messages/templates — catalogue des templates
router.get('/messages/templates', (req, res) => {
  res.json(Object.entries(TEMPLATES).map(([name, t]) => ({
    name,
    label: t.label,
    description: t.description,
    auto: !!t.auto,
    internal: !!t.internal,
    params: t.params || []
  })));
});

// GET /api/admin/messages/preview/:template — aperçu HTML avec données factices
router.get('/messages/preview/:template', (req, res) => {
  if (!TEMPLATES[req.params.template]) return res.status(404).json({ error: 'Template inconnu' });
  const { html } = renderTemplate(req.params.template, sampleData(req.params.template));
  res.type('html').send(html);
});

// POST /api/admin/messages/send — envoi manuel (remerciement, code cadeau…)
router.post('/messages/send', async (req, res) => {
  const { template, to, params = {} } = req.body;
  const t = TEMPLATES[template];
  if (!t) return res.status(400).json({ error: 'Template inconnu' });
  if (t.internal) return res.status(400).json({ error: 'Template interne, non envoyable manuellement' });
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }

  // Les templates automatiques liés à une commande exigent un orderId pour être renvoyés
  let data = { ...params };   // manuels : uniquement les champs saisis (les templates gèrent les absents)
  if (t.auto) {
    const orderId = parseInt(params.orderId);
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'orderId requis pour renvoyer ce template' });
    const { orderEmailData } = require('../services/mailer');
    const d = orderEmailData(orderId);
    if (!d) return res.status(404).json({ error: 'Commande introuvable' });
    data = d;
  }

  const result = await sendEmail({ template, to, data, orderId: t.auto ? parseInt(params.orderId) : null });
  if (result.status === 'failed') return res.status(502).json({ error: `Échec de l'envoi : ${result.error}` });
  res.status(201).json({ ok: true, status: result.status });
});

// GET /api/admin/settings — réglages de la boutique
router.get('/settings', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'free_delivery_threshold'").get();
  const v = parseFloat(row?.value);
  res.json({
    freeDeliveryThreshold: Number.isFinite(v) && v >= 0 ? v : 60,
    defaultSlotCapacity: defaultCapacity()
  });
});

// PUT /api/admin/settings — mettre à jour les réglages
router.put('/settings', (req, res) => {
  const { freeDeliveryThreshold, defaultSlotCapacity } = req.body;
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  if (freeDeliveryThreshold != null) {
    const v = parseFloat(freeDeliveryThreshold);
    if (!Number.isFinite(v) || v < 0 || v > 10000) {
      return res.status(400).json({ error: 'Seuil invalide (entre 0 et 10 000 €)' });
    }
    upsert.run('free_delivery_threshold', String(v));
  }
  if (defaultSlotCapacity != null) {
    const c = parseInt(defaultSlotCapacity);
    if (!Number.isInteger(c) || c < 1 || c > 100) {
      return res.status(400).json({ error: 'Capacité par défaut invalide (entre 1 et 100)' });
    }
    upsert.run('default_slot_capacity', String(c));
  }
  res.json({ ok: true });
});

module.exports = router;
