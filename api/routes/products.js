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

// GET /api/products/:id — détail d'un produit
router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  product.images = JSON.parse(product.images);
  product.options = JSON.parse(product.options);
  res.json(product);
});

module.exports = router;
