/* Réglages de livraison lus en base (table settings) : seuils de livraison offerte
   par zone, modifiables depuis l'admin. Valeurs par défaut = demande de Manon.
   L'ancien réglage unique `free_delivery_threshold` (60 €) n'est plus utilisé. */
const db = require('../db/database');
const { DEFAULT_THRESHOLDS, ZONE_FEES } = require('../deliveryZones');

const KEYS = {
  nimes: 'free_delivery_threshold_nimes',
  outside: 'free_delivery_threshold_outside',
};

function readNumber(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  const v = parseFloat(row?.value);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function getThresholds() {
  return {
    nimes: readNumber(KEYS.nimes, DEFAULT_THRESHOLDS.nimes),
    outside: readNumber(KEYS.outside, DEFAULT_THRESHOLDS.outside),
  };
}

function setThreshold(zoneGroup, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(KEYS[zoneGroup], String(value));
}

// Configuration publique exposée au front (GET /api/config)
function publicConfig() {
  const thresholds = getThresholds();
  return {
    deliveryFees: ZONE_FEES,
    freeDeliveryThresholdNimes: thresholds.nimes,
    freeDeliveryThresholdOutside: thresholds.outside,
  };
}

module.exports = { getThresholds, setThreshold, publicConfig };
