const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/products — liste des produits actifs avec stock > 0
router.get('/', (req, res) => {
  const products = db.prepare(`
    SELECT * FROM products WHERE active = 1 AND stock > 0 ORDER BY id ASC
  `).all();
  products.forEach(p => {
    p.images = JSON.parse(p.images);
    p.options = JSON.parse(p.options);
  });
  res.json(products);
});

// GET /api/products/featured — les produits mis en avant sur la page d'accueil
router.get('/featured', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'home_products'").get();
  let ids = [];
  try { ids = JSON.parse(row?.value || '[]'); } catch { ids = []; }
  if (!ids.length) return res.json([]);

  // Récupère les produits sélectionnés, actifs, en conservant l'ordre choisi
  const products = ids
    .map(id => db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id))
    .filter(Boolean);
  products.forEach(p => {
    p.images = JSON.parse(p.images);
    p.options = JSON.parse(p.options);
  });
  res.json(products);
});

// GET /api/products/:id — détail d'un produit
router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  product.images = JSON.parse(product.images);
  product.options = JSON.parse(product.options);
  res.json(product);
});

module.exports = router;
