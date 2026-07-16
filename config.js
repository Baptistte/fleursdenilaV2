/* URL de l'API Fleurs de Nila — bascule automatique selon l'environnement.
   En local (Live Server, start.sh…) : API sur localhost:3000.
   En ligne (Netlify) : API hébergée sur Railway. */
window.API_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:3000'
  : 'https://fleursdenilav2-production.up.railway.app';
