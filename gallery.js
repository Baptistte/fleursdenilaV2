/* Galeries photo : « voir tout » et visionneuse plein écran (filtres par thème optionnels).
   - Un book : <div data-book> contenant des boutons [data-filter="groupe|all"], des vignettes
     <a class="book-item" data-gallery="nom" data-group="groupe" data-caption="…" href="grande-image">
     et éventuellement un bouton [data-more].
   - Toute vignette <a data-gallery="nom"> ouvre la visionneuse (flèches, clavier, balayage tactile). */
(function () {
  const ACTIVE = ['bg-primary', 'text-white'];
  const INACTIVE = ['bg-white', 'text-primary'];

  // ── Filtres + « voir tout » ──
  document.querySelectorAll('[data-book]').forEach(book => {
    const items = [...book.querySelectorAll('.book-item')];
    const more = book.querySelector('[data-more]');
    const limit = parseInt(book.dataset.limit, 10) || 0;
    let filter = 'all';
    let expanded = false;

    function apply() {
      let shown = 0, matching = 0;
      items.forEach(it => {
        const ok = filter === 'all' || it.dataset.group === filter;
        if (ok) matching++;
        const visible = ok && (!limit || expanded || filter !== 'all' || shown < limit);
        if (visible && ok) shown++;
        it.classList.toggle('hidden', !visible);
      });
      if (more) {
        const hiddenCount = matching - shown;
        more.classList.toggle('hidden', hiddenCount <= 0 || !limit);
        more.textContent = `Voir toutes les photos (${matching})`;
      }
      book.querySelectorAll('[data-filter]').forEach(b => {
        const on = b.dataset.filter === filter;
        ACTIVE.forEach(c => b.classList.toggle(c, on));
        INACTIVE.forEach(c => b.classList.toggle(c, !on));
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    book.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter; apply(); }));
    if (more) more.addEventListener('click', () => { expanded = true; apply(); });
    apply();
  });

  // ── Visionneuse ──
  let box, imgEl, capEl, countEl, list = [], idx = 0, lastFocus = null, touchX = null;

  function build() {
    box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Galerie photo');
    box.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(10,18,30,.94);display:none;align-items:center;justify-content:center;flex-direction:column;padding:56px 16px 72px;';
    const btn = (label, txt, css) => `<button type="button" aria-label="${label}" style="position:absolute;background:none;border:0;color:#fff;cursor:pointer;font-size:34px;line-height:1;padding:14px;${css}">${txt}</button>`;
    box.innerHTML =
      btn('Fermer', '×', 'top:6px;right:8px;font-size:40px;') + btn('Photo précédente', '‹', 'left:4px;top:50%;transform:translateY(-50%);') +
      btn('Photo suivante', '›', 'right:4px;top:50%;transform:translateY(-50%);') +
      '<img alt="" style="max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 10px 40px rgba(0,0,0,.4)">' +
      '<div style="position:absolute;left:0;right:0;bottom:18px;text-align:center;color:#fff;font-size:13px;letter-spacing:.04em;padding:0 56px"><span data-cap></span> <span data-count style="opacity:.6;margin-left:8px"></span></div>';
    imgEl = box.querySelector('img'); capEl = box.querySelector('[data-cap]'); countEl = box.querySelector('[data-count]');
    const [close, prev, next] = box.querySelectorAll('button');
    close.addEventListener('click', hide); prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
    box.addEventListener('click', e => { if (e.target === box) hide(); });
    box.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX; touchX = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });
    document.body.appendChild(box);
  }

  function show() {
    const it = list[idx];
    imgEl.src = it.href;
    imgEl.alt = it.dataset.caption || '';
    capEl.textContent = it.dataset.caption || '';
    countEl.textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : '';
    [list[(idx + 1) % list.length], list[(idx - 1 + list.length) % list.length]].forEach(n => { const p = new Image(); p.src = n.href; });
  }
  function step(d) { idx = (idx + d + list.length) % list.length; show(); }
  function hide() {
    box.style.display = 'none';
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-gallery]');
    if (!a) return;
    e.preventDefault();
    if (!box) build();
    // uniquement les vignettes visibles du même book (filtre actif)
    list = [...document.querySelectorAll(`a[data-gallery="${a.dataset.gallery}"]`)].filter(x => x.offsetParent !== null);
    idx = Math.max(0, list.indexOf(a));
    lastFocus = a;
    box.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    box.querySelector('button').focus();
    show();
  });

  document.addEventListener('keydown', e => {
    if (!box || box.style.display === 'none') return;
    if (e.key === 'Escape') hide();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });
})();
