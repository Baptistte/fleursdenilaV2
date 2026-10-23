/* Consentement aux contenus tiers (page d'accueil).
   Seul le widget d'avis Google (Elfsight) dépose des traceurs : il n'est chargé qu'après
   acceptation. Le choix est mémorisé dans le navigateur (localStorage), modifiable via
   le lien « Gérer les cookies » du pied de page. Le panier et la session admin sont
   strictement nécessaires et ne demandent pas de consentement. */
(function () {
  const KEY = 'fdn_consent';
  const WIDGET_SRC = 'https://elfsightcdn.com/platform.js';
  const REVIEWS_URL = 'https://www.google.com/maps?cid=4398111084857870137';

  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = v => { try { localStorage.setItem(KEY, v); } catch { /* stockage indisponible */ } };

  function loadWidget() {
    if (document.querySelector(`script[src="${WIDGET_SRC}"]`)) return;
    const s = document.createElement('script');
    s.src = WIDGET_SRC;
    s.async = true;
    document.head.appendChild(s);
  }

  // Emplacement du widget : message + lien direct vers les avis tant que non accepté
  function setPlaceholder(show) {
    const box = document.querySelector('[class*="elfsight-app-"]');
    if (!box) return;
    let ph = document.getElementById('consent-placeholder');
    if (show && !ph) {
      ph = document.createElement('div');
      ph.id = 'consent-placeholder';
      ph.style.cssText = 'text-align:center;padding:28px 16px;font-size:14px;color:#6b5f55;line-height:1.7';
      ph.innerHTML = `Les avis Google s'affichent via un service tiers (Elfsight) qui dépose des cookies.<br>
        <button type="button" data-consent="accept" style="margin:10px 8px 0;padding:8px 18px;background:#1a365d;color:#fff;border:0;font-size:13px;cursor:pointer">Afficher les avis</button>
        <a href="${REVIEWS_URL}" target="_blank" rel="noopener noreferrer" style="margin:10px 8px 0;display:inline-block;color:#1a365d;text-decoration:underline;font-size:13px">Voir sur Google</a>`;
      box.parentNode.insertBefore(ph, box);
    }
    if (ph) ph.style.display = show ? '' : 'none';
    box.style.display = show ? 'none' : '';
  }

  // Le widget (chargement différé) ne s'initialise correctement que si son script est présent
  // dès le chargement de la page : si l'accord est déjà donné, on le charge immédiatement.
  const acceptedAtStart = read() === 'accepted';
  if (acceptedAtStart) loadWidget();

  function apply(choice) {
    if (choice === 'accepted') setPlaceholder(false);
    else setPlaceholder(true);
  }

  function closeBanner() {
    const b = document.getElementById('consent-banner');
    if (b) b.remove();
  }

  function decide(choice) {
    write(choice);
    closeBanner();
    // Accord donné maintenant : rechargement pour que le widget démarre comme à une visite normale
    if (choice === 'accepted' && !acceptedAtStart) { location.reload(); return; }
    apply(choice);
  }

  function showBanner() {
    if (document.getElementById('consent-banner')) return;
    const b = document.createElement('div');
    b.id = 'consent-banner';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Cookies');
    b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;background:#fff;border:1px solid #1a365d;box-shadow:0 8px 30px rgba(0,0,0,.15);padding:16px 18px;font-size:13px;line-height:1.55;color:#1a365d';
    b.innerHTML = `
      <p style="margin:0 0 12px">Nous utilisons un service tiers (Elfsight) pour afficher les avis Google, qui dépose des cookies.
        Aucun cookie publicitaire ni de mesure d'audience. <a href="politique-confidentialite.html" style="text-decoration:underline">En savoir plus</a></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" data-consent="accept" style="flex:1;min-width:120px;padding:9px 14px;background:#1a365d;color:#fff;border:1px solid #1a365d;font-size:13px;cursor:pointer">Accepter</button>
        <button type="button" data-consent="refuse" style="flex:1;min-width:120px;padding:9px 14px;background:#fff;color:#1a365d;border:1px solid #1a365d;font-size:13px;cursor:pointer">Refuser</button>
      </div>`;
    document.body.appendChild(b);
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-consent]');
    if (!t) return;
    const a = t.getAttribute('data-consent');
    if (a === 'accept') decide('accepted');
    else if (a === 'refuse') decide('refused');
    else if (a === 'manage') showBanner();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const choice = read();
    apply(choice);
    if (!choice) showBanner();
  });
})();
