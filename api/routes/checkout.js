const express = require('express');
const router = express.Router();
const db = require('../db/database');

async function getSumUpToken() {
  const res = await fetch('https://api.sumup.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SUMUP_CLIENT_ID,
      client_secret: process.env.SUMUP_CLIENT_SECRET
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SumUp token error: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

router.post('/', async (req, res) => {
  const { customer_name, customer_email, customer_phone, cart, slot_id, delivery_type, delivery_address } = req.body;

  if (!customer_name || !customer_email || !Array.isArray(cart) || !cart.length || !slot_id || !delivery_type) {
    return res.status(400).json({ error: 'Données manquantes' });
  }

  // Vérifier que le créneau existe (les créneaux sont non exclusifs : plusieurs commandes possible sur le même)
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot_id);
  if (!slot) {
    return res.status(409).json({ error: 'Créneau introuvable. Veuillez en choisir un autre.' });
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const deliveryCost = (delivery_type === 'delivery' && subtotal < 60) ? 5 : 0;
  const total = Math.round((subtotal + deliveryCost) * 100) / 100;

  const checkoutRef = `FDN-${Date.now()}`;

  // ── Mode simulation (SumUp non configuré) ──────────────────────────────
  const isSim = !process.env.SUMUP_CLIENT_ID || !process.env.SUMUP_CLIENT_SECRET;
  if (isSim) {
    const result = db.prepare(`
      INSERT INTO orders
        (sumup_checkout_id, customer_name, customer_email, customer_phone,
         customer_address, slot_id, items, total, delivery_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid')
    `).run(
      checkoutRef,
      customer_name,
      customer_email,
      customer_phone || null,
      delivery_address ? JSON.stringify(delivery_address) : null,
      slot_id,
      JSON.stringify(cart),
      total,
      delivery_type
    );
    return res.json({
      simulation: true,
      orderId: result.lastInsertRowid
    });
  }

  // ── Mode production (SumUp configuré) ────────────────────────────────
  try {
    const token = await getSumUpToken();

    const checkoutRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        checkout_reference: checkoutRef,
        amount: total,
        currency: 'EUR',
        merchant_code: process.env.SUMUP_MERCHANT_CODE,
        description: `Commande Fleurs de Nila — ${cart.map(i => i.name).join(', ')}`,
        redirect_url: `${process.env.FRONTEND_URL}/boutique/confirmation.html`
      })
    });

    if (!checkoutRes.ok) {
      const err = await checkoutRes.json().catch(() => ({}));
      console.error('SumUp checkout error:', err);
      return res.status(502).json({ error: 'Erreur lors de la création du paiement SumUp.' });
    }

    const checkout = await checkoutRes.json();

    db.prepare(`
      INSERT INTO orders
        (sumup_checkout_id, customer_name, customer_email, customer_phone,
         customer_address, slot_id, items, total, delivery_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      checkout.id,
      customer_name,
      customer_email,
      customer_phone || null,
      delivery_address ? JSON.stringify(delivery_address) : null,
      slot_id,
      JSON.stringify(cart),
      total,
      delivery_type
    );

    res.json({ checkoutUrl: `https://pay.sumup.com/b2c/${checkout.id}` });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la création du paiement.' });
  }
});

module.exports = router;
