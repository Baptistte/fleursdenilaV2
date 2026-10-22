const express = require('express');
const router = express.Router();
const { getFeed } = require('../services/instagram');

// GET /api/instagram — dernières publications du compte (public, mis en cache côté serveur)
router.get('/', async (req, res) => {
  const feed = await getFeed();
  res.set('Cache-Control', 'public, max-age=600');
  res.json(feed);
});

module.exports = router;
