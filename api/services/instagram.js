/* Flux Instagram (API Instagram avec connexion Instagram — graph.instagram.com).
   Le jeton d'accès longue durée (60 jours) est fourni par INSTAGRAM_ACCESS_TOKEN, puis
   renouvelé automatiquement : le jeton renouvelé est conservé en base (table settings),
   qui prend le dessus sur la variable d'environnement. Le jeton n'est jamais exposé au
   navigateur ni écrit dans les logs. Le flux est mis en cache (le front n'appelle jamais
   Instagram directement) et, en cas de panne, le dernier flux connu continue d'être servi. */
const db = require('../db/database');

const GRAPH = process.env.INSTAGRAM_GRAPH_URL || 'https://graph.instagram.com';
const LIMIT = 8;
const CACHE_MS = 30 * 60 * 1000;                 // flux : 30 min
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;   // jeton renouvelé au bout de 30 jours (validité : 60)
const MIN_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;        // Instagram refuse de renouveler un jeton de moins de 24 h

const K_TOKEN = 'instagram_token';
const K_STAMP = 'instagram_token_refreshed_at';

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || null;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

function getToken() {
  return getSetting(K_TOKEN) || process.env.INSTAGRAM_ACCESS_TOKEN || null;
}

let cache = { at: 0, items: [] };
let lastError = null;

async function getJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Publications utilisables : photos, albums (1re image) et vidéos (vignette)
function normalize(data) {
  return (data.data || []).map(m => {
    const image = m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url;
    return {
      id: String(m.id),
      image,
      link: m.permalink,
      caption: (m.caption || '').replace(/\s+/g, ' ').trim().slice(0, 140),
      type: m.media_type,
      date: m.timestamp,
    };
  }).filter(i => /^https:\/\//.test(i.image || '') && /^https:\/\/www\.instagram\.com\//.test(i.link || '')).slice(0, LIMIT);
}

async function getFeed() {
  const token = getToken();
  if (!token) return { configured: false, items: [] };

  if (Date.now() - cache.at < CACHE_MS && cache.items.length) return { configured: true, items: cache.items };

  try {
    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
    const data = await getJson(`${GRAPH}/me/media?fields=${fields}&limit=${LIMIT * 2}&access_token=${encodeURIComponent(token)}`);
    cache = { at: Date.now(), items: normalize(data) };
    lastError = null;
  } catch (e) {
    lastError = e.message;
    console.warn('Instagram : flux indisponible —', e.message);   // jamais le jeton
    cache.at = Date.now() - CACHE_MS + 5 * 60 * 1000;   // nouvel essai dans 5 min, flux précédent conservé
  }
  return { configured: true, items: cache.items };
}

// Renouvellement du jeton longue durée (à appeler régulièrement)
async function refreshTokenIfNeeded() {
  const token = getToken();
  if (!token) return;
  const stamp = parseInt(getSetting(K_STAMP), 10);
  if (!stamp) { setSetting(K_STAMP, Date.now()); return; }   // première utilisation : on part de maintenant
  const age = Date.now() - stamp;
  if (age < REFRESH_AFTER_MS || age < MIN_TOKEN_AGE_MS) return;
  try {
    const data = await getJson(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    if (data.access_token) {
      setSetting(K_TOKEN, data.access_token);
      setSetting(K_STAMP, Date.now());
      console.log('Instagram : jeton renouvelé.');
    }
  } catch (e) {
    lastError = `renouvellement du jeton : ${e.message}`;
    console.error('Instagram : renouvellement du jeton impossible —', e.message);
  }
}

function status() {
  const stamp = parseInt(getSetting(K_STAMP), 10) || null;
  return { configured: !!getToken(), tokenRefreshedAt: stamp ? new Date(stamp).toISOString() : null, lastError, cached: cache.items.length };
}

module.exports = { getFeed, refreshTokenIfNeeded, status };
