const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { feeForZip } = require('../deliveryZones');
const { sendOrderEmails } = require('../services/mailer');

// Seuil de livraison offerte : réglable depuis l'admin (settings), 60 € par défaut
function freeDeliveryThreshold() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'free_delivery_threshold'").get();
  const v = parseFloat(row?.value);
  return Number.isFinite(v) && v >= 0 ? v : 60;
}

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

  // Créneaux à capacité : la réservation temporaire (10 min) du client doit être encore valide.
  // Le hold garantit la place ; il est consommé à la création de la commande
  // (la commande paid/pending occupe alors la place à sa place).
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot_id);
  if (!slot) {
    return res.status(409).json({ error: 'Créneau introuvable. Veuillez en choisir un autre.' });
  }
  const nowIso = new Date().toISOString();
  const hold = slot_token
    ? db.prepare('SELECT * FROM slot_holds WHERE slot_id = ? AND token = ?').get(slot_id, slot_token)
    : null;
  if (!hold || hold.expires_at <= nowIso) {
    return res.status(409).json({ error: 'Votre réservation de créneau a expiré. Veuillez en choisir un autre.' });
  }

  // ── Re-tarification autoritaire côté serveur ─────────────────────────
  // Les prix envoyés par le navigateur sont IGNORÉS : chaque article est
  // re-tarifé depuis la table products (prix de base + suppléments d'options),
  // et le stock est vérifié. Le panier stocké en commande reflète ces prix.
  const qtyByProduct = new Map();   // contrôle du stock, toutes lignes confondues
  const pricedCart = [];

  for (const item of cart) {
    const qty = parseInt(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      return res.status(400).json({ error: 'Quantité invalide.' });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.id);
    if (!product || !product.active) {
      return res.status(409).json({ error: `« ${item.name || 'Un article'} » n'est plus disponible. Retirez-le de votre panier.` });
    }

    let options = [];
    try { options = JSON.parse(product.options); } catch { options = []; }

    // Toutes les options du produit doivent être choisies, et chaque choix doit exister
    let unitPrice = product.price;
    const chosen = item.options || {};
    for (const opt of options) {
      const value = chosen[opt.type];
      const choice = value != null ? (opt.choices || []).find(c => String(c.value) === String(value)) : null;
      if (!choice) {
        return res.status(400).json({ error: `Option manquante ou invalide pour « ${product.name} » (${opt.label}).` });
      }
      unitPrice += choice.priceDelta || 0;
    }
    unitPrice = Math.round(unitPrice * 100) / 100;

    qtyByProduct.set(product.id, (qtyByProduct.get(product.id) || 0) + qty);
    if (qtyByProduct.get(product.id) > product.stock) {
      return res.status(409).json({
        error: product.stock > 0
          ? `Stock insuffisant pour « ${product.name} » : ${product.stock} disponible${product.stock > 1 ? 's' : ''}.`
          : `« ${product.name} » est épuisé.`
      });
    }

    pricedCart.push({
      id: product.id,
      name: product.name,
      price: unitPrice,
      qty,
      options: chosen,
      message: typeof item.message === 'string' ? item.message.slice(0, 500) : ''
    });
  }

  const subtotal = pricedCart.reduce((sum, item) => sum + item.price * item.qty, 0);

  // Tarif de livraison basé sur le code postal (zone). Livraison offerte dès 60 €.
  let deliveryCost = 0;
  if (delivery_type === 'delivery') {
    const zip = delivery_address && delivery_address.zip;
    const zoneFee = feeForZip(zip);
    if (zoneFee === null) {
      return res.status(400).json({ error: 'Nous ne livrons pas à ce code postal. Merci de contacter la boutique.' });
    }
    deliveryCost = subtotal >= freeDeliveryThreshold() ? 0 : zoneFee;
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
        JSON.stringify(pricedCart),
        total,
        delivery_type
      );
      // La commande occupe la place : le hold est consommé. Décrément des stocks (pas de webhook en simulation)
      db.prepare('DELETE FROM slot_holds WHERE token = ?').run(slot_token);
      const updateStock = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
      for (const item of pricedCart) updateStock.run(item.qty, item.id);
      return result.lastInsertRowid;
    });
    const orderId = createOrder();
    sendOrderEmails('order_paid', orderId, { notifyAdmin: true });
    return res.json({
      simulation: true,
      orderId
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
        description: `Commande Fleurs de Nila — ${pricedCart.map(i => i.name).join(', ')}`,
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
      JSON.stringify(pricedCart),
      total,
      delivery_type
    );

    // La commande pending occupe la place pendant 30 min (cf. slotAvailability) : hold consommé
    db.prepare('DELETE FROM slot_holds WHERE token = ?').run(slot_token);

    res.json({ checkoutUrl: `https://pay.sumup.com/b2c/${checkout.id}` });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la création du paiement.' });
  }
});

module.exports = router;
