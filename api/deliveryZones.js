/* Zones et tarifs de livraison Fleurs de Nila (copie backend de boutique/delivery-zones.js :
   toute modification de la grille doit être reportée dans les deux fichiers).
   Sert à recalculer le tarif de livraison de façon autoritaire côté serveur.

   Grille (demande de Manon) :
     - Nîmes Écusson          : 5 €
     - Nîmes hors Écusson     : 9 €
     - Hors Nîmes (communes desservies) : 15 €
   Livraison offerte dès un montant d'achat qui dépend de la zone (réglable en admin,
   50 € pour Nîmes, 80 € hors Nîmes par défaut).

   Pour empêcher de choisir une zone plus avantageuse, la zone « Écusson » n'est jamais
   déclarée par le client : elle est déduite de l'adresse saisie, géocodée via la Base
   Adresse Nationale (API gratuite, sans clé), puis comparée au contour de l'Écusson. */

const ZONE_FEES = { ecusson: 5, nimes: 9, outside: 15 };
const ZONE_LABELS = {
  ecusson: 'Nîmes — Écusson',
  nimes: 'Nîmes — hors Écusson',
  outside: 'Hors Nîmes',
};
const DEFAULT_THRESHOLDS = { nimes: 50, outside: 80 };

// Communes desservies par la livraison à domicile
const COMMUNES = [
  { commune: 'Nîmes',        zip: '30000' },
  { commune: 'Nîmes',        zip: '30900' },
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

const NIMES_INSEE = '30189';

// Contour approximatif de l'Écusson (centre historique de Nîmes, délimité par les grands
// boulevards : Gambetta, Amiral Courbet, Victor Hugo, Alphonse Daudet, Arènes), avec une
// marge d'environ 40 m. Sommets [latitude, longitude], dans le sens horaire.
// À valider avec Manon sur quelques adresses limites (cf. api/scripts/test-ecusson.js).
const ECUSSON_POLYGON = [
  [43.8412, 4.3550],
  [43.8412, 4.3630],
  [43.8385, 4.3636],
  [43.8355, 4.3630],
  [43.8340, 4.3625],
  [43.8338, 4.3590],
  [43.8340, 4.3575],
  [43.8362, 4.3553],
  [43.8383, 4.3546],
  [43.8400, 4.3550],
];

// Point dans polygone (lancer de rayon)
function isInEcusson(lat, lon) {
  let inside = false;
  const p = ECUSSON_POLYGON;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [yi, xi] = p[i];
    const [yj, xj] = p[j];
    const crosses = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function communeForZip(zip) {
  return COMMUNES.find(c => c.zip === String(zip || '').trim()) || null;
}

function isNimesZip(zip) {
  const c = communeForZip(zip);
  return !!c && c.commune === 'Nîmes';
}

// Seuil de livraison offerte applicable à une zone
function thresholdForZone(zone, thresholds = DEFAULT_THRESHOLDS) {
  return zone === 'outside' ? thresholds.outside : thresholds.nimes;
}

// ── Géocodage (Base Adresse Nationale) avec cache mémoire ──────────────
const GEOCODERS = [
  'https://data.geopf.fr/geocodage/search/',
  'https://api-adresse.data.gouv.fr/search/',
];
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();   // clé normalisée → { at, value }
const MIN_SCORE = 0.6;     // en dessous : adresse non reconnue

function normalizeQuery(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function fetchGeocode(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
  return res.json();
}

// Retourne { lat, lon, label, type, score } | null (adresse inconnue) ; lève si le service est indisponible
async function geocodeNimes(street, zip) {
  const key = `${normalizeQuery(street)}|${zip}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const q = `${street} ${zip} Nîmes`;
  const params = new URLSearchParams({ q, limit: '1', citycode: NIMES_INSEE });
  let data = null;
  let lastErr = null;
  for (const base of GEOCODERS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      data = await fetchGeocode(`${base}?${params}`, ctrl.signal);
      break;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (!data) throw lastErr || new Error('geocode indisponible');

  const f = data.features && data.features[0];
  let value = null;
  if (f && f.geometry && Array.isArray(f.geometry.coordinates)) {
    const p = f.properties || {};
    const ok = p.score >= MIN_SCORE && ['housenumber', 'street', 'locality'].includes(p.type);
    if (ok) {
      value = {
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        label: p.label,
        type: p.type,
        score: p.score,
      };
    }
  }
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);   // borne la mémoire
  return value;
}

/* Tarif de livraison pour une adresse { street, zip, city }.
   Retourne :
     { ok: true, zone, fee, label, verified, matched }
     { ok: false, status, error }
   `verified: false` signale un repli (service d'adresse indisponible) : la zone « hors
   Écusson » est alors appliquée, jamais la plus avantageuse. */
async function quoteDelivery(address) {
  const zip = String(address?.zip || '').trim();
  const street = String(address?.street || '').trim().slice(0, 150);
  const commune = communeForZip(zip);

  if (!commune) {
    return { ok: false, status: 400, error: 'Nous ne livrons pas à ce code postal. Merci de contacter la boutique.' };
  }

  // Communes hors Nîmes : tarif unique, aucune vérification d'adresse nécessaire
  if (commune.commune !== 'Nîmes') {
    return { ok: true, zone: 'outside', fee: ZONE_FEES.outside, label: ZONE_LABELS.outside, verified: true, matched: null };
  }

  if (street.length < 3) {
    return { ok: false, status: 400, error: 'Veuillez indiquer le numéro et la rue de livraison.' };
  }

  let geo;
  try {
    geo = await geocodeNimes(street, zip);
  } catch (e) {
    console.warn('Géocodage indisponible, repli sur « Nîmes hors Écusson » :', e.message);
    return { ok: true, zone: 'nimes', fee: ZONE_FEES.nimes, label: ZONE_LABELS.nimes, verified: false, matched: null };
  }

  if (!geo) {
    return {
      ok: false, status: 422,
      error: 'Adresse non reconnue à Nîmes. Vérifiez le numéro, le nom de la rue et le code postal, ou appelez la boutique.',
    };
  }

  const zone = isInEcusson(geo.lat, geo.lon) ? 'ecusson' : 'nimes';
  return { ok: true, zone, fee: ZONE_FEES[zone], label: ZONE_LABELS[zone], verified: true, matched: geo.label };
}

module.exports = {
  ZONE_FEES, ZONE_LABELS, DEFAULT_THRESHOLDS, COMMUNES,
  communeForZip, isNimesZip, isInEcusson, thresholdForZone, quoteDelivery,
};
