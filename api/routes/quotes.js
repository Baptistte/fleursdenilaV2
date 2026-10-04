const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { sendEmail } = require('../services/mailer');

const CATEGORY_LABELS = {
  mariage: 'Mariage',
  professionnel: 'Professionnel',
  reception: 'Réception',
  deuil: 'Deuil',
};

// POST /api/quotes — demande de devis depuis la page « Nos prestations »
// (public, pas d'authentification : simple formulaire de contact).
router.post('/', (req, res) => {
  const { category, name, phone, email, eventDate, message } = req.body || {};

  if (!CATEGORY_LABELS[category]) {
    return res.status(400).json({ error: 'Catégorie invalide.' });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Le nom est requis.' });
  }
  if (!phone && !email) {
    return res.status(400).json({ error: 'Indiquez au moins un téléphone ou un email pour vous recontacter.' });
  }
  if (phone && !/^(\+33\s?|0)[1-9]([\s.\-]?\d{2}){4}$/.test(phone)) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }

  const clean = {
    category,
    name: String(name).trim().slice(0, 200),
    phone: phone ? String(phone).trim().slice(0, 30) : null,
    email: email ? String(email).trim().slice(0, 200) : null,
    eventDate: eventDate ? String(eventDate).trim().slice(0, 100) : null,
    message: message ? String(message).trim().slice(0, 1000) : null,
  };

  const result = db.prepare(`
    INSERT INTO quote_requests (category, name, phone, email, event_date, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(clean.category, clean.name, clean.phone, clean.email, clean.eventDate, clean.message);

  // Emails fire-and-forget : ne bloquent jamais la réponse au client.
  setImmediate(async () => {
    try {
      const categoryLabel = CATEGORY_LABELS[clean.category];
      const firstName = clean.name.split(' ')[0];
      const data = { ...clean, categoryLabel, firstName };
      if (clean.email) {
        await sendEmail({ template: 'quote_request_client', to: clean.email, data });
      }
      if (process.env.ADMIN_NOTIF_EMAIL) {
        await sendEmail({ template: 'quote_request_admin', to: process.env.ADMIN_NOTIF_EMAIL, data });
      }
    } catch (e) {
      console.error('Erreur email demande de devis :', e.message);
    }
  });

  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

module.exports = router;
