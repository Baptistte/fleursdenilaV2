const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/categories — catégories actives, dans l'ordre d'affichage,
// avec le nombre de produits actifs et en stock qu'elles contiennent.
router.get('/', (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, COUNT(p.id) AS product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.active = 1 AND p.stock > 0
    WHERE c.active = 1
    GROUP BY c.id
    ORDER BY c.position ASC, c.id ASC
  `).all();
  res.json(categories);
});

module.exports = router;
