/* URL de l'API Fleurs de Nila — bascule automatique selon l'environnement.
   En local (Live Server, start.sh…) : API sur localhost:3000.
   En ligne (Netlify) : API hébergée sur Railway.
   ⚠️ Après « Generate Domain » sur Railway, remplacer l'URL ci-dessous. */
window.API_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:3000'
  : 'https://A-REMPLACER-URL-RAILWAY.up.railway.app';
