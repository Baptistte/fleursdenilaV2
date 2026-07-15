const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { feeForZip } = require('../deliveryZones');

const FREE_DELIVERY_THRESHOLD = 60;

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
  const { customer_name, customer_email, customer_phone, cart, slot_id, slot_token, delivery_type, delivery_address } = req.body;

  if (!customer_name || !customer_phone || !Array.isArray(cart) || !cart.length || !slot_id || !delivery_type) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  if (!/^(\+33\s?|0)[1-9]([\s.\-]?\d{2}){4}$/.test(customer_phone)) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
  }
  if (customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }

  // Créneaux exclusifs : la réservation temporaire (10 min) du client doit être encore valide
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot_id);
  if (!slot) {
    return res.status(409).json({ error: 'Créneau introuvable. Veuillez en choisir un autre.' });
  }
  if (slot.order_id) {
    return res.status(409).json({ error: 'Ce créneau vient d\'être pris. Veuillez en choisir un autre.' });
  }
  const nowIso = new Date().toISOString();
  const holdValid = slot_token && slot.reservation_token === slot_token
    && slot.reserved_until && slot.reserved_until > nowIso;
  if (!holdValid) {
    return res.status(409).json({ error: 'Votre réservation de créneau a expiré. Veuillez en choisir un autre.' });
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  // Tarif de livraison basé sur le code postal (zone). Livraison offerte dès 60 €.
  let deliveryCost = 0;
  if (delivery_type === 'delivery') {
    const zip = delivery_address && delivery_address.zip;
    const zoneFee = feeForZip(zip);
    if (zoneFee === null) {
      return res.status(400).json({ error: 'Nous ne livrons pas à ce code postal. Merci de contacter la boutique.' });
    }
    deliveryCost = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : zoneFee;
  }
  const total = Math.round((subtotal + deliveryCost) * 100) / 100;

  const checkoutRef = `FDN-${Date.now()}`;

  // ── Mode simulation (SumUp non configuré) ──────────────────────────────
  const isSim = !process.env.SUMUP_CLIENT_ID || !process.env.SUMUP_CLIENT_SECRET;
  if (isSim) {
    const createOrder = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO orders
          (sumup_checkout_id, customer_name, customer_email, customer_phone,
           customer_address, slot_id, items, total, delivery_type, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid')
      `).run(
        checkoutRef,
        customer_name,
        customer_email || '',
        customer_phone,
        delivery_address ? JSON.stringify(delivery_address) : null,
        slot_id,
        JSON.stringify(cart),
        total,
        delivery_type
      );
      // Verrouillage définitif du créneau + décrément des stocks (pas de webhook en simulation)
      db.prepare('UPDATE slots SET order_id = ?, reserved_until = NULL, reservation_token = NULL WHERE id = ?')
        .run(result.lastInsertRowid, slot_id);
      const updateStock = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
      for (const item of cart) updateStock.run(item.qty, item.id);
      return result.lastInsertRowid;
    });
    return res.json({
      simulation: true,
      orderId: createOrder()
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
      customer_email || '',
      customer_phone,
      delivery_address ? JSON.stringify(delivery_address) : null,
      slot_id,
      JSON.stringify(cart),
      total,
      delivery_type
    );

    // Prolonge la réservation le temps du paiement SumUp (15 min de plus)
    const extendedHold = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare('UPDATE slots SET reserved_until = ? WHERE id = ?').run(extendedHold, slot_id);

    res.json({ checkoutUrl: `https://pay.sumup.com/b2c/${checkout.id}` });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la création du paiement.' });
  }
});

module.exports = router;
