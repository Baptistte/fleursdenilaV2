/* Volet panier — chargé dans toutes les pages boutique */
(function () {
  let DELIVERY_THRESHOLD = 60;   // valeur par défaut, remplacée par le réglage admin via /api/config

  fetch(`${window.API_URL}/api/config`).then(r => r.json()).then(c => {
    if (Number.isFinite(c.freeDeliveryThreshold)) {
      DELIVERY_THRESHOLD = c.freeDeliveryThreshold;
      if (typeof renderDrawer === 'function') renderDrawer();
    }
  }).catch(() => {});

  /* ── Injection HTML ── */
  const style = document.createElement('style');
  style.textContent = `
    #cart-overlay {
      position: fixed; inset: 0; z-index: 900;
      background: rgba(20,18,14,0.45);
      opacity: 0; pointer-events: none;
      transition: opacity 0.3s ease;
      backdrop-filter: blur(2px);
    }
    #cart-overlay.open { opacity: 1; pointer-events: all; }

    #cart-panel {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: 420px; max-width: 100vw;
      background: #fff;
      z-index: 901;
      display: flex; flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
      box-shadow: -12px 0 48px rgba(0,0,0,0.12);
    }
    #cart-panel.open { transform: translateX(0); }

    #cart-panel-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 22px 24px;
      border-bottom: 1px solid #e8e0d4;
      flex-shrink: 0;
    }
    #cart-panel-head h2 {
      font-size: 13px; font-weight: 600;
      letter-spacing: 0.12em; text-transform: uppercase; color: #1a1410;
    }
    #cart-close-btn {
      background: none; border: none; cursor: pointer; padding: 6px;
      color: #9b8f80; transition: color 0.15s; line-height: 0;
    }
    #cart-close-btn:hover { color: #1a1410; }

    #cart-items {
      flex: 1; overflow-y: auto;
      padding: 0;
    }

    #cart-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; padding: 48px 24px; text-align: center;
      color: #9b8f80;
    }
    #cart-empty svg { margin-bottom: 16px; opacity: 0.35; }
    #cart-empty p { font-size: 14px; margin-bottom: 20px; }
    #cart-empty a {
      font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;
      color: #1a1410; border-bottom: 1px solid #1a1410; padding-bottom: 2px;
    }

    .cart-item {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 18px 24px;
      border-bottom: 1px solid #f5f0e8;
    }
    .cart-item-img {
      width: 72px; height: 72px; object-fit: cover; flex-shrink: 0;
      border: 1px solid #ede8df;
    }
    .cart-item-img-placeholder {
      width: 72px; height: 72px; background: #f5f0e8; flex-shrink: 0;
      border: 1px solid #ede8df; display: flex; align-items: center; justify-content: center;
      color: #c9bfb3;
    }
    .cart-item-info { flex: 1; min-width: 0; }
    .cart-item-name { font-size: 14px; font-weight: 500; color: #1a1410; margin-bottom: 3px; }
    .cart-item-opts { font-size: 11px; color: #9b8f80; margin-bottom: 8px; line-height: 1.5; }
    .cart-item-price { font-size: 14px; font-weight: 600; color: #1a1410; }

    .qty-control {
      display: flex; align-items: center; gap: 0; border: 1px solid #e8e0d4;
      margin-top: 10px; width: fit-content;
    }
    .qty-btn {
      background: none; border: none; cursor: pointer;
      width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
      color: #6b5f55; font-size: 16px; transition: background 0.12s;
      line-height: 1;
    }
    .qty-btn:hover { background: #f5f0e8; }
    .qty-val {
      width: 32px; text-align: center; font-size: 13px; font-weight: 500; color: #1a1410;
      border-left: 1px solid #e8e0d4; border-right: 1px solid #e8e0d4;
      height: 30px; line-height: 30px;
    }
    .cart-item-remove {
      background: none; border: none; cursor: pointer; padding: 4px;
      color: #c9bfb3; transition: color 0.15s; font-size: 18px; line-height: 1;
      margin-top: -2px;
    }
    .cart-item-remove:hover { color: #dc2626; }

    #cart-footer {
      flex-shrink: 0;
      padding: 20px 24px;
      border-top: 1px solid #e8e0d4;
      background: #faf8f5;
    }

    /* Barre progression livraison offerte */
    #delivery-bar-wrap { margin-bottom: 16px; }
    #delivery-bar-text { font-size: 12px; color: #6b5f55; margin-bottom: 6px; }
    #delivery-bar-track {
      height: 4px; background: #e8e0d4; border-radius: 2px; overflow: hidden;
    }
    #delivery-bar-fill {
      height: 100%; background: #1a1410; border-radius: 2px;
      transition: width 0.4s ease;
    }

    #cart-totals { margin-bottom: 16px; }
    .cart-total-row {
      display: flex; justify-content: space-between;
      font-size: 13px; color: #6b5f55; margin-bottom: 6px;
    }
    .cart-total-row.main {
      font-size: 15px; font-weight: 600; color: #1a1410;
      border-top: 1px solid #e8e0d4; padding-top: 10px; margin-top: 4px;
    }

    #btn-checkout {
      display: block; width: 100%;
      background: #1a1410; color: #fff;
      border: none; cursor: pointer;
      padding: 15px;
      font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
      text-align: center; text-decoration: none;
      transition: background 0.2s;
    }
    #btn-checkout:hover { background: #3d3530; }
    #btn-checkout:disabled { opacity: 0.4; cursor: not-allowed; }
    #btn-view-cart {
      display: block; text-align: center; margin-top: 10px;
      font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
      color: #9b8f80; text-decoration: none;
      transition: color 0.15s;
    }
    #btn-view-cart:hover { color: #1a1410; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'cart-overlay';
  document.body.appendChild(overlay);

  const panel = document.createElement('div');
  panel.id = 'cart-panel';
  panel.innerHTML = `
    <div id="cart-panel-head">
      <h2>Mon panier <span id="cart-panel-count" style="font-weight:400;color:#9b8f80"></span></h2>
      <button id="cart-close-btn" aria-label="Fermer le panier">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div id="cart-items"></div>
    <div id="cart-footer" style="display:none">
      <div id="delivery-bar-wrap">
        <div id="delivery-bar-text"></div>
        <div id="delivery-bar-track"><div id="delivery-bar-fill" style="width:0%"></div></div>
      </div>
      <div id="cart-totals"></div>
      <a href="livraison.html" id="btn-checkout">Passer la commande</a>
      <a href="panier.html" id="btn-view-cart">Voir le panier détaillé</a>
    </div>`;
  document.body.appendChild(panel);

  /* ── Helpers ── */
  function getCart() { return JSON.parse(localStorage.getItem('cart') || '[]'); }
  function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    renderDrawer();
    updateAllBadges();
    // Prévenir la page hôte (récap « Votre commande », page panier…) que le panier a changé
    window.dispatchEvent(new CustomEvent('cart:updated'));
  }

  function updateAllBadges() {
    const cart = getCart();
    const count = cart.reduce((s, i) => s + i.qty, 0);
    document.querySelectorAll('#cart-count, #cart-count-mobile').forEach(el => {
      if (!el) return;
      el.textContent = count;
      el.classList.toggle('hidden', count === 0);
    });
  }

  /* ── Rendu ── */
  function renderDrawer() {
    const cart = getCart();
    const itemsEl = document.getElementById('cart-items');
    const footerEl = document.getElementById('cart-footer');
    const countEl  = document.getElementById('cart-panel-count');

    const totalQty = cart.reduce((s, i) => s + i.qty, 0);
    countEl.textContent = totalQty ? `(${totalQty})` : '';

    if (!cart.length) {
      itemsEl.innerHTML = `
        <div id="cart-empty">
          <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
          </svg>
          <p>Votre panier est vide</p>
          <a href="index.html">Découvrir la boutique</a>
        </div>`;
      footerEl.style.display = 'none';
      return;
    }

    itemsEl.innerHTML = cart.map((item, idx) => {
      const opts = item.options ? Object.entries(item.options).map(([k, v]) => `${k} : ${v}`).join(' · ') : '';
      const imgHtml = item.image
        ? `<img src="${item.image}" alt="${item.name}" class="cart-item-img">`
        : `<div class="cart-item-img-placeholder"><svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01"/></svg></div>`;
      return `
        <div class="cart-item" data-idx="${idx}">
          ${imgHtml}
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            ${opts ? `<div class="cart-item-opts">${opts}</div>` : ''}
            ${item.message ? `<div class="cart-item-opts" style="font-style:italic">"${item.message}"</div>` : ''}
            <div class="cart-item-price">${(item.price * item.qty).toFixed(2)} €</div>
            <div class="qty-control">
              <button class="qty-btn" data-action="dec" data-idx="${idx}">−</button>
              <div class="qty-val">${item.qty}</div>
              <button class="qty-btn" data-action="inc" data-idx="${idx}">+</button>
            </div>
          </div>
          <button class="cart-item-remove" data-remove="${idx}" title="Retirer">×</button>
        </div>`;
    }).join('');

    // Totaux — les frais réels dépendent de la commune (calculés à l'étape livraison)
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const remaining = Math.max(0, DELIVERY_THRESHOLD - sub);
    const pct = Math.min(100, (sub / DELIVERY_THRESHOLD) * 100);

    document.getElementById('delivery-bar-fill').style.width = pct + '%';
    document.getElementById('delivery-bar-text').innerHTML = remaining > 0
      ? `Plus que <strong>${remaining.toFixed(2)} €</strong> pour la livraison offerte`
      : `<span style="color:#2d6a4f;font-weight:500">✓ Livraison offerte</span>`;

    document.getElementById('cart-totals').innerHTML = `
      <div class="cart-total-row"><span>Sous-total</span><span>${sub.toFixed(2)} €</span></div>
      ${remaining > 0 ? `<div class="cart-total-row" style="font-size:11px;color:#9b8f80"><span>Livraison selon la commune</span><span>à l'étape suivante</span></div>` : ''}
      <div class="cart-total-row main"><span>Total${remaining > 0 ? ' (hors livraison)' : ''}</span><span>${sub.toFixed(2)} €</span></div>`;

    footerEl.style.display = 'block';

    /* Événements dynamiques */
    itemsEl.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cart2 = getCart();
        const idx2 = parseInt(btn.dataset.idx);
        if (btn.dataset.action === 'inc') cart2[idx2].qty++;
        else if (cart2[idx2].qty > 1) cart2[idx2].qty--;
        else { cart2.splice(idx2, 1); }
        saveCart(cart2);
      });
    });
    itemsEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cart2 = getCart();
        cart2.splice(parseInt(btn.dataset.remove), 1);
        saveCart(cart2);
      });
    });
  }

  /* ── Ouvrir / Fermer ── */
  function openCart() {
    renderDrawer();
    overlay.classList.add('open');
    panel.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    overlay.classList.remove('open');
    panel.classList.remove('open');
    document.body.style.overflow = '';
  }

  overlay.addEventListener('click', closeCart);
  document.getElementById('cart-close-btn').addEventListener('click', closeCart);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

  // Navigation explicite vers le panier détaillé (jamais interceptée par openCart)
  document.getElementById('btn-view-cart').addEventListener('click', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeCart();
    window.location.href = 'panier.html';
  });

  /* ── Intercepter les liens panier ── */
  function interceptCartLinks() {
    document.querySelectorAll('a[href="panier.html"]:not(#btn-view-cart), a[aria-label="Panier"]').forEach(a => {
      // Ne pas intercepter sur panier.html lui-même
      if (window.location.pathname.includes('panier.html')) return;
      a.addEventListener('click', e => {
        e.preventDefault();
        openCart();
      });
    });
  }

  /* ── Export global ── */
  window.openCart = openCart;
  window.closeCart = closeCart;

  /* ── Init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { updateAllBadges(); interceptCartLinks(); });
  } else {
    updateAllBadges();
    interceptCartLinks();
  }

  /* Ré-intercepter après que le DOM des pages JS soit injecté (boutique/index.html charge les produits en async) */
  window.addEventListener('load', interceptCartLinks);

  /* Panier modifié depuis un autre onglet : resynchroniser volet, badges et page hôte */
  window.addEventListener('storage', e => {
    if (e.key !== 'cart') return;
    renderDrawer();
    updateAllBadges();
    window.dispatchEvent(new CustomEvent('cart:updated'));
  });

})();
