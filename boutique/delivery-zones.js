/* Zones et tarifs de livraison Fleurs de Nila (copie front de api/deliveryZones.js :
   toute modification de la grille doit être reportée dans les deux fichiers).
   Utilisé par livraison.html, commande.html, panier.html, produit.html, index.html et le volet panier.

   Grille : Nîmes Écusson 5 € · Nîmes hors Écusson 9 € · Hors Nîmes 15 €.
   Livraison offerte dès un seuil propre à la zone (réglable en admin, chargé depuis /api/config).
   La zone Écusson/hors Écusson est déterminée par le serveur d'après l'adresse (POST /api/delivery/quote). */
(function () {
  const FEES = { ecusson: 5, nimes: 9, outside: 15 };
  const LABELS = {
    ecusson: 'Nîmes — Écusson',
    nimes: 'Nîmes — hors Écusson',
    outside: 'Hors Nîmes',
  };
  // Valeurs par défaut, remplacées par le réglage admin via /api/config
  const THRESHOLDS = { nimes: 50, outside: 80 };

  // Communes desservies (la zone Nîmes se précise ensuite d'après l'adresse)
  const COMMUNES = [
    { commune: 'Nîmes',        zip: '30000', nimes: true },
    { commune: 'Nîmes',        zip: '30900', nimes: true },
    { commune: 'Caissargues',  zip: '30132' },
    { commune: 'Bouillargues', zip: '30230' },
    { commune: 'Milhaud',      zip: '30540' },
    { commune: 'Garons',       zip: '30128' },
    { commune: 'Marguerittes', zip: '30320' },
    { commune: 'Manduel',      zip: '30129' },
    { commune: 'Caveirac',     zip: '30820' },
    { commune: 'Redessan',     zip: '30129' },
    { commune: 'Bernis',       zip: '30620' },
    { commune: 'Générac',      zip: '30510' },
    { commune: 'Saint-Gilles', zip: '30800' },
    { commune: 'Vauvert',      zip: '30600' },
  ];

  const fmt = n => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')) + ' €';

  function thresholdFor(zone) {
    return zone === 'outside' ? THRESHOLDS.outside : THRESHOLDS.nimes;
  }

  // Frais appliqués à un sous-total (0 si le seuil de la zone est atteint)
  function feeFor(zone, subtotal) {
    return subtotal >= thresholdFor(zone) ? 0 : FEES[zone];
  }

  // ── Configuration (seuils réglables en admin) ──
  const listeners = [];
  let configPromise = null;
  function loadConfig() {
    if (!configPromise) {
      configPromise = fetch(`${window.API_URL}/api/config`)
        .then(r => r.json())
        .then(c => {
          if (Number.isFinite(c.freeDeliveryThresholdNimes)) THRESHOLDS.nimes = c.freeDeliveryThresholdNimes;
          if (Number.isFinite(c.freeDeliveryThresholdOutside)) THRESHOLDS.outside = c.freeDeliveryThresholdOutside;
          listeners.forEach(fn => { try { fn(); } catch { /* écouteur défaillant ignoré */ } });
        })
        .catch(() => { /* valeurs par défaut conservées */ });
    }
    return configPromise;
  }
  function onConfig(fn) { listeners.push(fn); }

  // ── Bandeau « frais de port » ──
  // Tableau compact : 3 zones + seuils de livraison offerte, visible dès la boutique.
  function infoHtml() {
    const cell = (label, fee) => `
      <span style="display:inline-flex;align-items:baseline;gap:6px;white-space:nowrap">
        <span style="color:#6b5f55">${label}</span>
        <strong style="color:#1a365d;font-weight:600">${fmt(fee)}</strong>
      </span>`;
    return `
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;font-size:12.5px;line-height:1.5">
        <span style="font-weight:600;color:#1a365d;letter-spacing:.04em">🚚 Frais de livraison</span>
        ${cell('Nîmes Écusson', FEES.ecusson)}
        ${cell('Nîmes hors Écusson', FEES.nimes)}
        ${cell('Hors Nîmes', FEES.outside)}
      </div>
      <div style="margin-top:4px;font-size:12px;color:#2d6a4f">
        Livraison offerte dès <strong>${fmt(THRESHOLDS.nimes)}</strong> d'achat à Nîmes,
        dès <strong>${fmt(THRESHOLDS.outside)}</strong> hors Nîmes · Retrait en boutique gratuit
      </div>`;
  }

  // Remplit les éléments portant l'attribut data-delivery-info (et les met à jour au chargement de la config)
  function mountInfo(root) {
    const els = (root || document).querySelectorAll('[data-delivery-info]');
    const render = () => els.forEach(el => { el.innerHTML = infoHtml(); });
    render();
    onConfig(render);
    loadConfig();
  }

  // Compatibilité avec l'ancienne API (liste de zones avec code postal)
  function findByZip(zip) {
    const z = String(zip || '').trim();
    return COMMUNES.filter(c => c.zip === z);
  }

  window.DELIVERY = {
    FEES, LABELS, THRESHOLDS, COMMUNES,
    fmt, thresholdFor, feeFor, loadConfig, onConfig, infoHtml, mountInfo,
  };
  window.DELIVERY_ZONES = COMMUNES;
  window.findDeliveryZones = findByZip;
  window.DELIVERY_PHONE = '04 34 39 04 29';
  window.DELIVERY_PHONE_TEL = '0434390429';

  document.addEventListener('DOMContentLoaded', () => mountInfo());
})();
