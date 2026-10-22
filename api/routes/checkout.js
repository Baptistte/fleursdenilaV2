const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { quoteDelivery, thresholdForZone } = require('../deliveryZones');
const { getThresholds } = require('../services/deliveryConfig');
const { sendOrderEmails } = require('../services/mailer');

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
  const { customer_name, customer_email, customer_phone, customer_note, cart, slot_id, slot_token, delivery_type, delivery_address } = req.body;
  // Commentaire libre du client au fleuriste, distinct du message par article joint au bouquet
  const note = typeof customer_note === 'string' ? customer_note.trim().slice(0, 500) : '';
  // Demande de facture : case cochée + coordonnées de facturation facultatives
  const invoiceRequested = req.body.invoice_requested ? 1 : 0;
  const invoiceInfo = invoiceRequested && typeof req.body.invoice_info === 'string'
    ? req.body.invoice_info.trim().slice(0, 500) : '';

  if (typeof customer_name !== 'string' || !customer_name.trim() || typeof customer_phone !== 'string'
      || !Array.isArray(cart) || !cart.length || !slot_id || !['delivery', 'pickup'].includes(delivery_type)) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  // Acceptation des CGV obligatoire (case à cocher bloquante côté front, revérifiée ici)
  if (req.body.cgv_accepted !== true) {
    return res.status(400).json({ error: 'Vous devez accepter les conditions générales de vente pour commander.' });
  }
  if (customer_name.length > 100 || customer_phone.length > 30 || (customer_email && String(customer_email).length > 200) || cart.length > 50) {
    return res.status(400).json({ error: 'Données trop longues.' });
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
      message: typeof item.message === 'string' ? item.message.slice(0, 500) : '',
      // Taux de TVA figé au moment de la vente (ne doit jamais changer
      // rétroactivement sur une facture déjà émise si le taux produit change).
      vat_rate: product.vat_rate
    });
  }

  const subtotal = pricedCart.reduce((sum, item) => sum + item.price * item.qty, 0);

  // Tarif de livraison : la zone (Écusson / Nîmes hors Écusson / hors Nîmes) est déduite
  // de l'adresse côté serveur — jamais du client. Livraison offerte au-delà du seuil de la zone.
  let deliveryCost = 0;
  let deliveryAddress = delivery_address || null;
  if (delivery_type === 'delivery') {
    const quote = await quoteDelivery(delivery_address);
    if (!quote.ok) return res.status(quote.status).json({ error: quote.error });
    const threshold = thresholdForZone(quote.zone, getThresholds());
    deliveryCost = subtotal >= threshold ? 0 : quote.fee;
    // La zone retenue est conservée avec l'adresse (visible dans la tournée)
    // (champs recopiés un à un : rien d'autre venant du navigateur n'est conservé)
    deliveryAddress = {
      street: String(delivery_address.street || '').trim().slice(0, 150),
      extra: delivery_address.extra ? String(delivery_address.extra).trim().slice(0, 150) : null,
      zip: String(delivery_address.zip || '').trim(),
      city: String(delivery_address.city || '').trim().slice(0, 80),
      zone: quote.zone,
      zoneLabel: quote.label,
    };
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
           customer_address, slot_id, items, total, delivery_type, status, customer_note,
           invoice_requested, invoice_info, cgv_accepted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)
      `).run(
        checkoutRef,
        customer_name,
        customer_email || '',
        customer_phone,
        deliveryAddress ? JSON.stringify(deliveryAddress) : null,
        slot_id,
        JSON.stringify(pricedCart),
        total,
        delivery_type,
        note,
        invoiceRequested,
        invoiceInfo,
        nowIso
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

    const inserted = db.prepare(`
      INSERT INTO orders
        (sumup_checkout_id, customer_name, customer_email, customer_phone,
         customer_address, slot_id, items, total, delivery_type, status, customer_note,
         invoice_requested, invoice_info, cgv_accepted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(
      checkout.id,
      customer_name,
      customer_email || '',
      customer_phone,
      deliveryAddress ? JSON.stringify(deliveryAddress) : null,
      slot_id,
      JSON.stringify(pricedCart),
      total,
      delivery_type,
      note,
      invoiceRequested,
      invoiceInfo,
      nowIso
    );

    // La commande pending occupe la place pendant 30 min (cf. slotAvailability) : hold consommé
    db.prepare('DELETE FROM slot_holds WHERE token = ?').run(slot_token);

    // orderId : numéro de commande, mémorisé par le front pour la page de confirmation
    // (le retour SumUp ne le transmet pas)
    res.json({ checkoutUrl: `https://pay.sumup.com/b2c/${checkout.id}`, orderId: Number(inserted.lastInsertRowid) });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la création du paiement.' });
  }
});

module.exports = router;
