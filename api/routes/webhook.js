const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');

// SumUp envoie du JSON brut — on a besoin du body raw pour vérifier la signature HMAC
router.post('/sumup', express.raw({ type: 'application/json' }), (req, res) => {
  const rawBody = req.body;
  const signature = req.headers['x-payload-signature'];
  const secret = process.env.SUMUP_WEBHOOK_SECRET;

  // Vérification HMAC si secret configuré
  if (secret && signature) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (signature !== expected) {
      console.warn('Webhook SumUp : signature invalide');
      return res.status(401).json({ error: 'Signature invalide' });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'JSON invalide' });
  }

  console.log('Webhook SumUp reçu:', event.type, event.payload?.status);

  // On ne traite que les paiements confirmés
  if (event.type !== 'checkout.status_changed' || event.payload?.status !== 'PAID') {
    return res.json({ received: true });
  }

  const checkoutId = event.payload.id;
  if (!checkoutId) return res.status(400).json({ error: 'Checkout ID manquant' });

  const order = db.prepare('SELECT * FROM orders WHERE sumup_checkout_id = ?').get(checkoutId);
  if (!order) {
    console.warn('Webhook SumUp : commande introuvable pour checkout', checkoutId);
    return res.status(404).json({ error: 'Commande introuvable' });
  }

  // Idempotence — ne pas retraiter un paiement déjà confirmé
  if (order.status === 'paid') {
    return res.json({ received: true });
  }

  // Transaction atomique : confirmer commande + décrémenter stocks
  // (la commande paid occupe sa place sur le créneau via le comptage de slotAvailability)
  const confirm = db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(order.id);

    const items = JSON.parse(order.items);
    const updateStock = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
    for (const item of items) {
      updateStock.run(item.qty, item.id);
    }
  });

  confirm();
  console.log(`Commande #${order.id} confirmée (paiement SumUp ${checkoutId})`);

  res.json({ received: true });
});

module.exports = router;
