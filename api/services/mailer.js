/* Emails transactionnels Fleurs de Nila.
   - Templates HTML aux couleurs de la marque (inline styles : contrainte des clients mail).
   - Envoi via Resend si RESEND_API_KEY est configurée, sinon mode « simulé » :
     le message est rendu et journalisé, rien ne part.
   - Chaque envoi (réel, simulé ou échoué) est tracé dans la table `messages`
     pour les statistiques du panneau admin. */
const db = require('../db/database');

const BRAND = {
  name: 'Fleurs de Nila',
  tagline: 'Fleuriste artisan — Nîmes',
  phone: '04 34 39 04 29',
  navy: '#1a365d',
  navy2: '#2d5282',
  cream: '#fafafa',
  siteUrl: process.env.FRONTEND_URL || 'https://fleursdeniladeveloppement.netlify.app',
};

const euros = n => Number(n).toFixed(2).replace('.', ',') + ' €';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function frDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── Gabarit commun ─────────────────────────────────────────────────── */
function layout(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:Georgia,'Times New Roman',serif;color:${BRAND.navy};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${BRAND.navy};">
        <tr><td style="padding:28px 36px 20px;border-bottom:1px solid ${BRAND.navy};text-align:center;">
          <div style="font-size:26px;letter-spacing:.03em;">${BRAND.name}</div>
          <div style="font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#8a97a8;margin-top:4px;">${BRAND.tagline}</div>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 36px 24px;border-top:1px solid #e8edf3;font-size:11.5px;color:#8a97a8;text-align:center;line-height:1.7;">
          ${BRAND.name} · Nîmes · <a href="tel:0434390429" style="color:#8a97a8;">${BRAND.phone}</a><br>
          <a href="${BRAND.siteUrl}/boutique/index.html" style="color:${BRAND.navy2};">Visiter la boutique</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const H = (txt) => `<div style="font-size:21px;margin:0 0 14px;">${txt}</div>`;
const P = (txt) => `<p style="font-size:14px;line-height:1.7;margin:0 0 14px;color:#3d4f66;">${txt}</p>`;
const BTN = (label, href) => `<div style="text-align:center;margin:24px 0 8px;">
  <a href="${href}" style="display:inline-block;background:${BRAND.navy};color:#ffffff;text-decoration:none;padding:13px 30px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">${label}</a>
</div>`;

/* Récapitulatif de commande (articles + livraison + total + créneau) */
function orderRecap(d) {
  const items = (d.items || []).map(i => `
    <tr>
      <td style="padding:7px 0;font-size:13.5px;border-bottom:1px solid #f0f3f7;">${esc(i.name)} ×${i.qty}
        ${i.options && Object.keys(i.options).length ? `<div style="font-size:11.5px;color:#8a97a8;">${Object.entries(i.options).map(([k, v]) => `${esc(k)} : ${esc(v)}`).join(' · ')}</div>` : ''}
      </td>
      <td align="right" style="padding:7px 0;font-size:13.5px;border-bottom:1px solid #f0f3f7;white-space:nowrap;">${euros(i.price * i.qty)}</td>
    </tr>`).join('');

  const itemsSum = (d.items || []).reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryFee = Math.max(0, Math.round((d.total - itemsSum) * 100) / 100);
  const modeLabel = d.delivery_type === 'delivery' ? 'Livraison à domicile' : 'Retrait en boutique';
  const where = d.delivery_type === 'delivery'
    ? (d.address ? `${esc(d.address.street)}${d.address.extra ? ' — ' + esc(d.address.extra) : ''}, ${esc(d.address.zip)} ${esc(d.address.city)}` : '')
    : `${BRAND.name}, Nîmes`;

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">
    ${items}
    ${deliveryFee > 0 ? `<tr><td style="padding:7px 0;font-size:13.5px;color:#8a97a8;">Livraison</td><td align="right" style="padding:7px 0;font-size:13.5px;">${euros(deliveryFee)}</td></tr>` : ''}
    <tr>
      <td style="padding:12px 0 0;font-size:14px;font-weight:bold;border-top:2px solid ${BRAND.navy};">Total</td>
      <td align="right" style="padding:12px 0 0;font-size:17px;font-weight:bold;border-top:2px solid ${BRAND.navy};">${euros(d.total)}</td>
    </tr>
  </table>
  <div style="margin:20px 0 0;padding:14px 16px;background:${BRAND.cream};border:1px solid #e8edf3;font-size:13px;line-height:1.7;color:#3d4f66;">
    <strong style="color:${BRAND.navy};">${modeLabel}</strong><br>
    ${d.slot_date ? `${frDate(d.slot_date)}${d.start_time ? `, entre ${d.start_time} et ${d.end_time}` : ''}<br>` : ''}
    ${where}
  </div>`;
}

/* ── Les templates ──────────────────────────────────────────────────── */
const TEMPLATES = {
  order_paid: {
    label: 'Confirmation de commande',
    description: 'Envoyé au client dès que son paiement est accepté.',
    auto: true,
    build: d => ({
      subject: `Votre commande n°${d.id} est bien reçue 🌸`,
      html: layout(
        H(`Merci ${esc(d.firstName)} !`) +
        P(`Votre commande <strong>n°${d.id}</strong> et votre paiement sont bien enregistrés. ` +
          `Votre créneau sera confirmé très prochainement par la fleuriste — nous vous préviendrons en cas d'imprévu.`) +
        orderRecap(d)
      )
    })
  },

  order_validated: {
    label: 'Créneau confirmé',
    description: 'Envoyé quand Manon valide la commande : le créneau est garanti.',
    auto: true,
    build: d => ({
      subject: `C'est confirmé — ${d.delivery_type === 'delivery' ? 'livraison' : 'retrait'} le ${frDate(d.slot_date)}`,
      html: layout(
        H(`Bonne nouvelle ${esc(d.firstName)} !`) +
        P(`Votre commande <strong>n°${d.id}</strong> est confirmée. ` +
          (d.delivery_type === 'delivery'
            ? `Vos fleurs seront livrées <strong>${frDate(d.slot_date).toLowerCase()}, entre ${d.start_time} et ${d.end_time}</strong>.`
            : `Votre commande vous attendra en boutique <strong>${frDate(d.slot_date).toLowerCase()}, entre ${d.start_time} et ${d.end_time}</strong>.`)) +
        P(`Un empêchement ? Appelez-nous au <a href="tel:0434390429" style="color:${BRAND.navy2};">${BRAND.phone}</a>.`)
      )
    })
  },

  order_refused: {
    label: 'Commande annulée',
    description: 'Envoyé si Manon doit refuser la commande (créneau intenable, produit indisponible…).',
    auto: true,
    build: d => ({
      subject: `Votre commande n°${d.id} a dû être annulée`,
      html: layout(
        H(`Nous sommes désolés ${esc(d.firstName)}`) +
        P(`Malgré toute notre attention, nous ne pouvons pas honorer votre commande <strong>n°${d.id}</strong> ` +
          `sur le créneau choisi. Elle a été annulée et <strong>votre paiement de ${euros(d.total)} sera intégralement remboursé</strong>.`) +
        P(`Nous serions ravis de composer pour vous à une autre date — appelez-nous au ` +
          `<a href="tel:0434390429" style="color:${BRAND.navy2};">${BRAND.phone}</a> ou repassez commande en ligne.`) +
        BTN('Repasser commande', `${BRAND.siteUrl}/boutique/index.html`)
      )
    })
  },

  thank_you: {
    label: 'Remerciement',
    description: 'À envoyer après la livraison : un merci et une invitation à laisser un avis.',
    auto: false,
    params: [{ key: 'firstName', label: 'Prénom du client' }],
    build: d => ({
      subject: `Merci ${d.firstName ? esc(d.firstName) + ' ' : ''}— vos fleurs vous plaisent ?`,
      html: layout(
        H(`Merci ${esc(d.firstName || '')} 🌸`) +
        P(`Nous espérons que vos fleurs illuminent votre intérieur ! Chaque bouquet est composé à la main, ` +
          `avec des fleurs choisies le matin même.`) +
        P(`Un petit mot sur votre expérience nous aiderait énormément — et guidera les prochains amoureux des fleurs.`) +
        BTN('Laisser un avis', 'https://g.page/r/fleurs-de-nila/review') +
        P(`<span style="font-size:12.5px;color:#8a97a8;">À très bientôt à la boutique — ${BRAND.name}, Nîmes.</span>`)
      )
    })
  },

  gift_code: {
    label: 'Code cadeau',
    description: 'Offrir un code de réduction à un client (geste commercial, parrainage, fidélité…).',
    auto: false,
    params: [
      { key: 'firstName', label: 'Prénom du client' },
      { key: 'code', label: 'Code cadeau' },
      { key: 'amountLabel', label: 'Valeur (ex. « 10 € » ou « −15 % »)' },
      { key: 'validUntil', label: 'Valable jusqu\'au (ex. 31/12/2026)' },
    ],
    build: d => ({
      subject: `Un cadeau vous attend chez ${BRAND.name} 🎁`,
      html: layout(
        H(`${d.firstName ? esc(d.firstName) + ', un' : 'Un'} petit cadeau pour vous`) +
        P(`Pour vous remercier de votre fidélité, voici un code à utiliser sur votre prochaine commande` +
          (d.amountLabel ? ` — <strong>${esc(d.amountLabel)}</strong> offerts` : '') + ` :`) +
        `<div style="text-align:center;margin:22px 0;">
          <div style="display:inline-block;border:2px dashed ${BRAND.navy};padding:14px 34px;font-size:22px;letter-spacing:.22em;font-family:Helvetica,Arial,sans-serif;font-weight:bold;">${esc(d.code || 'FLEURS10')}</div>
        </div>` +
        (d.validUntil ? P(`<span style="font-size:12.5px;color:#8a97a8;">Valable jusqu'au ${esc(d.validUntil)}. À mentionner par téléphone ou en boutique.</span>`) : '') +
        BTN('Découvrir la boutique', `${BRAND.siteUrl}/boutique/index.html`)
      )
    })
  },

  admin_new_order: {
    label: 'Alerte nouvelle commande (interne)',
    description: 'Envoyé à Manon à chaque nouvelle commande payée.',
    auto: true,
    internal: true,
    build: d => ({
      subject: `🌸 Nouvelle commande n°${d.id} — ${euros(d.total)} (${d.delivery_type === 'delivery' ? 'livraison' : 'retrait'})`,
      html: layout(
        H(`Nouvelle commande n°${d.id}`) +
        P(`<strong>${esc(d.customer_name)}</strong> · <a href="tel:${esc(d.customer_phone)}" style="color:${BRAND.navy2};">${esc(d.customer_phone)}</a>` +
          (d.customer_email ? ` · ${esc(d.customer_email)}` : '')) +
        orderRecap(d) +
        P(`<span style="font-size:12.5px;color:#8a97a8;">Pensez à valider (ou refuser) le créneau depuis l'espace de gestion.</span>`) +
        BTN('Ouvrir l\'espace de gestion', `${BRAND.siteUrl}/admin/login.html`)
      )
    })
  },
};

/* ── Rendu & envoi ──────────────────────────────────────────────────── */
function renderTemplate(name, data) {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`Template inconnu : ${name}`);
  return t.build(data);
}

async function sendEmail({ template, to, data = {}, orderId = null }) {
  const { subject, html } = renderTemplate(template, data);
  let status = 'simulated', error = null;

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM || 'Fleurs de Nila <onboarding@resend.dev>',
          to,
          subject,
          html
        })
      });
      if (res.ok) status = 'sent';
      else { status = 'failed'; error = (await res.text()).slice(0, 300); }
    } catch (e) {
      status = 'failed';
      error = String(e.message).slice(0, 300);
    }
  }

  db.prepare(`
    INSERT INTO messages (channel, template, recipient, subject, order_id, status, error)
    VALUES ('email', ?, ?, ?, ?, ?, ?)
  `).run(template, to, subject, orderId, status, error);

  return { status, error };
}

/* Données d'une commande pour les emails (créneau joint, JSON parsés) */
function orderEmailData(orderId) {
  const o = db.prepare(`
    SELECT o.*, s.date AS slot_date, s.start_time, s.end_time
    FROM orders o LEFT JOIN slots s ON o.slot_id = s.id
    WHERE o.id = ?
  `).get(orderId);
  if (!o) return null;
  try { o.items = JSON.parse(o.items); } catch { o.items = []; }
  try { o.address = o.customer_address ? JSON.parse(o.customer_address) : null; } catch { o.address = null; }
  o.firstName = (o.customer_name || '').split(' ')[0];
  return o;
}

/* Envoi lié à une commande : au client (si email) + copie interne éventuelle.
   Fire-and-forget : ne bloque jamais le parcours d'achat. */
function sendOrderEmails(template, orderId, { notifyAdmin = false } = {}) {
  setImmediate(async () => {
    try {
      const d = orderEmailData(orderId);
      if (!d) return;
      if (d.customer_email) await sendEmail({ template, to: d.customer_email, data: d, orderId });
      if (notifyAdmin && process.env.ADMIN_NOTIF_EMAIL) {
        await sendEmail({ template: 'admin_new_order', to: process.env.ADMIN_NOTIF_EMAIL, data: d, orderId });
      }
    } catch (e) {
      console.error(`Email ${template} (commande ${orderId}) :`, e.message);
    }
  });
}

/* Jeu de données factice pour les aperçus du panneau admin */
function sampleData(template) {
  const base = {
    id: 42, firstName: 'Marie', customer_name: 'Marie Dupont',
    customer_phone: '06 12 34 56 78', customer_email: 'marie@exemple.fr',
    total: 61, delivery_type: 'delivery',
    slot_date: '2026-08-14', start_time: '09:00', end_time: '10:00',
    address: { street: '12 rue de la République', extra: 'Bât. B', zip: '30000', city: 'Nîmes' },
    items: [
      { name: 'Bouquet Soleil', qty: 1, price: 40, options: { Taille: 'L' } },
      { name: 'Rose éternelle', qty: 1, price: 11, options: {} },
    ],
  };
  if (template === 'gift_code') return { ...base, code: 'MERCI-NILA10', amountLabel: '10 €', validUntil: '31/12/2026' };
  return base;
}

module.exports = { TEMPLATES, renderTemplate, sendEmail, sendOrderEmails, orderEmailData, sampleData };
