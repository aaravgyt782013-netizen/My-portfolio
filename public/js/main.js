/* =====================================================================
   aarav.exe — "last bench" portfolio front-end
   Multi-page app: every page has its own URL (/about, /projects, …) but
   switches instantly without reloading. Everything comes from the content
   JSON managed in /admin.
   ===================================================================== */
(function () {
  'use strict';
  var I = window.Icons;
  var C = null;
  var pageCleanups = [];
  var observers = [];
  var currentId = null;
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var inFrame = window.self !== window.top;

  /* ============================== helpers ============================== */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(javascript|data|vbscript):/i.test(u.replace(/\s/g, ''))) return '#';
    return u;
  }
  /** Mini markup for headings: *highlight*, ~strike~, _underline_ */
  function md(text) {
    return esc(text)
      .replace(/\*([^*]+)\*/g, '<mark class="hl">$1</mark>')
      .replace(/~([^~]+)~/g, '<s class="strike">$1</s>')
      .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,!?])/g, '$1<u class="scrib">$2</u>');
  }
  function L(group, key) { var g = (C.labels || {})[group] || {}; return g[key] != null ? g[key] : key; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function paragraphs(text) { return String(text || '').split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }
  function initials(name) { return esc(String(name || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase()); }
  function animOn() { return C.theme.animations !== false && !reduced; }
  function rot(i, max) { return C.theme.stickyTilt === false ? 0 : (((i * 37) % 7) - 3) * (max || 1); } // deterministic "random" tilt
  function onCleanup(fn) { pageCleanups.push(fn); }

  /* ---------- pages & links ---------- */
  function pageList() { return (C.pages || []).filter(function (p) { return p.enabled && P[p.id] && (p.id === 'home' || C[p.id] || p.id === 'playground'); }); }
  function pageById(id) { return (C.pages || []).find(function (p) { return p.id === id; }); }
  function pathFor(id) { var p = pageById(id); if (!p || p.id === 'home') return '/'; return '/' + (p.slug || p.id); }
  function pageFromPath(pathname) {
    var slug = decodeURIComponent(pathname || '/').replace(/^\/+|\/+$/g, '').toLowerCase();
    var list = pageList();
    if (!slug || slug === 'index.html') return list.find(function (p) { return p.id === 'home'; }) || null;
    return list.find(function (p) { return p.id !== 'home' && String(p.slug || p.id).toLowerCase() === slug; }) || null;
  }
  function isInternal(u) { return /^\/(?!\/)/.test(u) && !/^\/(admin|api|uploads|assets|css|js)(\/|$)/.test(u) && !/\.[a-z0-9]{2,5}$/i.test(u); }
  /** Builds href/target attributes. "/contact" and legacy "#contact" become instant page links. */
  function href(u) {
    u = safeUrl(u);
    if (!u) return 'href="#"';
    if (u[0] === '#') {
      var id = u.slice(1);
      var pg = (C.pages || []).find(function (p) { return p.id === id || p.slug === id; });
      if (pg) return 'href="' + esc(pathFor(pg.id)) + '" data-link';
      return 'href="' + esc(u) + '"';
    }
    if (isInternal(u)) return 'href="' + esc(u) + '" data-link';
    if (/^https?:\/\//i.test(u)) return 'href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"';
    return 'href="' + esc(u) + '"';
  }
  function pageLink(id) { return 'href="' + esc(pathFor(id)) + '" data-link'; }
  function socialLinks(list) {
    return (list || []).filter(function (s) { return s.url; }).map(function (s) {
      return '<a ' + href(s.url) + ' aria-label="' + esc(s.label || s.platform) + '" title="' + esc(s.label || s.platform) + '">' + I.social(s.platform) + '</a>';
    }).join('');
  }
  function toast(msg) {
    var t = $('#toast');
    t.innerHTML = I.ui('circle-check') + esc(msg);
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg || L('general', 'copied')); }).catch(function () {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(msg || L('general', 'copied')); } catch (e) {} ta.remove();
    });
  }
  function img(src, alt, extra) { return src ? '<img src="' + esc(safeUrl(src)) + '" alt="' + esc(alt || '') + '" decoding="async" ' + (extra || 'loading="lazy"') + ' />' : ''; }

  /* ---------- hand-drawn doodles ---------- */
  var D = {
    star: '<svg class="dd" viewBox="0 0 24 24"><path d="M12 2.5l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z"/></svg>',
    arrow: '<svg class="dd" viewBox="0 0 80 50"><path d="M5 8C22 44 52 46 72 22"/><path d="M59 20l13 2-3 13"/></svg>',
    swirl: '<svg class="dd" viewBox="0 0 50 50"><path d="M25 25m-3 0a3 3 0 1 1 6 0a7 7 0 1 1-14 0a11 11 0 1 1 22 0a15 15 0 1 1-30 0"/></svg>',
    heart: '<svg class="dd" viewBox="0 0 24 24"><path d="M12 20s-7-4.5-9-9a4.7 4.7 0 0 1 9-3 4.7 4.7 0 0 1 9 3c-2 4.5-9 9-9 9z"/></svg>',
    crown: '<svg class="dd" viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>',
    bolt: '<svg class="dd" viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    plane: '<svg class="dd plane" viewBox="0 0 64 40"><path d="M3 18L61 3 44 36z" class="pf"/><path d="M61 3L24 25l-2 12 10-8"/></svg>',
    scribble: '<svg class="dd" viewBox="0 0 300 20" preserveAspectRatio="none"><path d="M3 14C60 4 120 18 180 9s90-3 117 3"/></svg>',
    circle: '<svg class="dd" viewBox="0 0 120 60" preserveAspectRatio="none"><path d="M62 6C22 4 4 20 6 33s34 25 69 22 43-15 39-31S80 2 40 9"/></svg>',
    spark: '<svg class="dd" viewBox="0 0 24 24"><path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/></svg>',
    sign: '<svg class="dd" viewBox="0 0 120 40"><path d="M5 30c10-25 18-25 16-5s8-20 16-14-4 18 6 12 10-16 18-10 0 14 10 10 16-14 24-10 6 8 20 4"/></svg>'
  };
  function decor(set) {
    if (!C.theme.doodles) return '';
    return '<div class="decor" aria-hidden="true">' + set.map(function (d, i) { return '<span class="dc dc' + i + '">' + D[d] + '</span>'; }).join('') + '</div>';
  }

  /* ============================== theme ============================== */
  function applyTheme(t) {
    var el = $('#theme-vars');
    if (!el) { el = document.createElement('style'); el.id = 'theme-vars'; document.head.appendChild(el); }
    var css = window.__pfThemeCSS ? window.__pfThemeCSS(t) : '';
    if (t.customCursor && fine) {
      var p = /^#[0-9a-f]{3,8}$/i.test(t.primary || '') ? t.primary : '#ffd60a';
      var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 24 24' stroke='%23141414' stroke-width='1.2' stroke-linejoin='round'><path d='M3.2 20.8l1.4-4.9L16.3 4.2a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.1 19.4z' fill='" + p.replace('#', '%23') + "'/><path d='M3.2 20.8l1.4-4.9 3.5 3.5z' fill='%23f4d8b0'/><path d='M14.8 5.7l3.5 3.5' fill='none'/></svg>";
      css += 'body.has-cursor,body.has-cursor .doodle-wrap canvas{cursor:url("data:image/svg+xml,' + svg.replace(/"/g, "'").replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E') + '") 3 27,auto}';
    }
    el.textContent = css;
    var link = $('#font-link');
    var fh = window.__pfFontsHref ? window.__pfFontsHref(t) : '';
    if (link && fh && link.getAttribute('href') !== fh) link.setAttribute('href', fh);

    var custom = $('#custom-css');
    if (!custom) { custom = document.createElement('style'); custom.id = 'custom-css'; document.head.appendChild(custom); }
    custom.textContent = (C.site && C.site.customCss) || '';

    var b = document.body.classList;
    b.toggle('no-anim', !animOn());
    b.toggle('no-grain', !t.grain);
    b.toggle('no-progress', !t.scrollProgress);
    b.toggle('no-doodles', !t.doodles);
    b.toggle('has-cursor', !!t.customCursor && fine);
    ['grid', 'ruled', 'dots', 'plain'].forEach(function (k) { b.toggle('bg-' + k, (t.bgPattern || 'grid') === k); b.toggle('lbg-' + k, (t.lightBgPattern || 'ruled') === k); });

    var saved = null;
    try { saved = localStorage.getItem('pf-theme'); } catch (e) {}
    document.documentElement.dataset.theme = (t.allowVisitorToggle && saved) ? saved : (t.mode === 'light' ? 'light' : 'dark');
    $('#theme-toggle').hidden = !t.allowVisitorToggle;
    updateThemeIcon();
  }
  function updateThemeIcon() { $('#theme-toggle').innerHTML = I.ui(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun'); }
  function toggleTheme() {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    var go = function () { document.documentElement.dataset.theme = next; updateThemeIcon(); };
    if (document.startViewTransition && animOn()) document.startViewTransition(go); else go();
    try { localStorage.setItem('pf-theme', next); } catch (e) {}
  }

  /* ============================== shared blocks ============================== */
  function pageHead(id, o) {
    var list = pageList().filter(function (p) { return p.id !== 'home'; });
    var idx = list.findIndex(function (p) { return p.id === id; }) + 1;
    var pg = pageById(id) || {};
    return '<header class="page-head">' + decor(['star', 'swirl', 'spark']) +
      '<div class="ph-meta"><span class="ph-num">' + esc(L('general', 'pageWord')) + ' ' + pad(idx) + '</span><span class="ph-rule"></span><span>' + esc(pg.emoji || '') + ' ' + esc(pg.label || id) + '</span></div>' +
      '<h1 class="page-title">' + md(o.heading) + '</h1>' +
      (o.subheading ? '<p class="page-sub">' + md(o.subheading) + '</p>' : '') +
      (o.note ? '<span class="page-note hand">' + D.arrow + esc(o.note) + '</span>' : '') +
    '</header>';
  }
  function nextPage(id) {
    var list = pageList();
    if (list.length < 2) return '';
    var i = list.findIndex(function (p) { return p.id === id; });
    var n = list[(i + 1) % list.length];
    return '<div class="container"><a class="next-page reveal" ' + pageLink(n.id) + '>' +
      '<span class="np-k mono">' + esc(L('general', 'nextPage')) + ' →</span>' +
      '<span class="np-t">' + esc(n.emoji || '') + ' ' + esc(n.label) + '</span>' +
      (n.blurb ? '<span class="np-b hand">' + esc(n.blurb) + '</span>' : '') +
      '<span class="np-arrow">' + I.ui('arrow-right') + '</span></a></div>';
  }
  function blockHead(h, sub) { return '<div class="block-head reveal"><h2>' + md(h) + '</h2>' + (sub ? '<p>' + md(sub) + '</p>' : '') + '</div>'; }
  function tags(list) { return (list || []).length ? '<div class="tags">' + list.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' : ''; }

  /* ============================== pages ============================== */
  var P = {}, M = {};

  /* ---------- HOME ---------- */
  P.home = function () {
    var h = C.hero || {}, hm = C.home || {};
    var roles = (h.roles || []).filter(Boolean);
    var stats = (h.stats || []).filter(function (s) { return s.value !== ''; });
    var hero = '<section class="hero">' + decor(['star', 'bolt', 'swirl', 'heart', 'spark', 'crown']) +
      '<div class="container hero-grid">' +
        '<div class="hero-text">' +
          '<div class="hero-badges">' + (h.badge ? '<span class="sticker">' + esc(h.badge) + '</span>' : '') +
            (h.availableBadge ? '<span class="avail"><i></i>' + esc(h.availableText) + '</span>' : '') + '</div>' +
          (h.greeting ? '<p class="greeting hand">' + esc(h.greeting) + '</p>' : '') +
          '<h1 class="hero-name"><span class="hn">' + esc(h.name) + '</span><span class="dot">.</span><span class="hn-line">' + D.scribble + '</span></h1>' +
          (roles.length ? '<div class="roles">' + (h.rolePrefix ? '<span class="muted">' + esc(h.rolePrefix) + ' </span>' : '') + '<span class="role" id="role">' + esc(roles[0]) + '</span></div>' : '') +
          (h.tagline ? '<p class="tagline">' + md(h.tagline) + '</p>' : '') +
          '<div class="ctas">' +
            (h.primaryButtonText ? '<a class="btn btn-primary magnetic" ' + href(h.primaryButtonLink) + '>' + esc(h.primaryButtonText) + I.ui('arrow-right') + '</a>' : '') +
            (h.secondaryButtonText ? '<a class="btn btn-ghost magnetic" ' + href(h.secondaryButtonLink) + '>' + I.ui('plane') + esc(h.secondaryButtonText) + '</a>' : '') +
          '</div>' +
          '<div class="hero-foot">' +
            (stats.length ? '<div class="hero-stats">' + stats.map(function (s) { return '<div><strong class="countup" data-v="' + esc(s.value) + '">' + esc(s.value) + '</strong><span class="hand">' + esc(s.label) + '</span></div>'; }).join('') + '</div>' : '') +
            (h.showSocials ? '<div class="socials">' + socialLinks(C.socials) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="hero-art" id="hero-art">' +
          '<div class="layer" data-depth="10"><figure class="polaroid hero-pola"><span class="tape"></span>' +
            (h.avatar ? img(h.avatar, h.name, 'fetchpriority="high"') : '<div class="ph-empty">' + initials(h.name) + '</div>') +
            (h.photoCaption ? '<figcaption class="hand">' + esc(h.photoCaption) + '</figcaption>' : '') + '</figure></div>' +
          (h.photoArrowText ? '<div class="layer arrow-note hand" data-depth="22"><span>' + esc(h.photoArrowText) + '</span>' + D.arrow + '</div>' : '') +
          (h.stickyNote ? '<div class="layer hero-sticky-l" data-depth="30"><div class="sticky-note c1 hand">' + esc(h.stickyNote).replace(/\n/g, '<br>') + '</div></div>' : '') +
          (C.theme.doodles ? '<span class="layer art-star" data-depth="40">' + D.star + '</span><span class="layer art-crown" data-depth="16">' + D.crown + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<button class="scroll-hint" type="button" id="scroll-hint">' + esc(L('general', 'scroll')) + '<i></i></button>' +
    '</section>';

    var out = hero;
    if (hm.marquee !== false) out += renderTapes();

    var others = pageList().filter(function (p) { return p.id !== 'home'; });
    if (hm.exploreEnabled && others.length) {
      out += '<section class="block" id="explore"><div class="container">' + blockHead(hm.exploreHeading, hm.exploreSub) +
        '<div class="explore">' + others.map(function (p, i) {
          return '<a class="ex-card c' + (i % 4 + 1) + ' reveal" ' + pageLink(p.id) + ' style="--r:' + rot(i, .7) + 'deg">' +
            '<span class="tape"></span><span class="ex-num mono">p.' + pad(i + 1) + '</span>' +
            '<span class="ex-emoji">' + esc(p.emoji || '📄') + '</span><h3>' + esc(p.label) + '</h3>' +
            (p.blurb ? '<p class="hand">' + esc(p.blurb) + '</p>' : '') + '<span class="ex-go">' + I.ui('arrow-up-right') + '</span></a>';
        }).join('') + '</div></div></section>';
    }
    if (hm.terminalEnabled) {
      out += '<section class="block"><div class="container term-block">' + blockHead(hm.terminalHeading, hm.terminalSub) + terminalHTML() + '</div></section>';
    }
    var items = (C.projects && C.projects.items) || [];
    var feat = items.find(function (p) { return p.featured; }) || items[0];
    if (hm.featuredEnabled && feat && pageById('projects') && pageById('projects').enabled) {
      out += '<section class="block"><div class="container">' + blockHead(hm.featuredHeading, hm.featuredSub) +
        '<article class="feature reveal"><div class="f-media"><span class="tape"></span>' + img(feat.image, feat.title) + '</div>' +
        '<div class="f-body"><span class="stamp">' + esc(L('home', 'featuredStamp')) + '</span>' +
          '<span class="mono f-year">' + esc(feat.year || '') + (feat.grade ? ' · ' + esc(L('home', 'gradeWord')) + ' ' + esc(feat.grade) : '') + '</span>' +
          '<h3>' + esc(feat.title) + '</h3><p>' + esc(feat.description) + '</p>' + tags(feat.tags) +
          '<div class="f-links">' + (feat.liveUrl ? '<a class="btn btn-primary btn-sm" ' + href(feat.liveUrl) + '>' + I.ui('external-link') + esc(L('projects', 'liveDemo')) + '</a>' : '') +
            '<a class="btn btn-ghost btn-sm" ' + pageLink('projects') + '>' + esc(L('home', 'viewAllProjects')) + I.ui('arrow-right') + '</a></div>' +
        '</div></article></div></section>';
    }
    if (hm.ctaEnabled) {
      out += '<section class="block"><div class="container"><div class="cta-note reveal"><span class="pin"></span>' +
        '<h2>' + md(hm.ctaHeading) + '</h2>' + (hm.ctaText ? '<p class="hand">' + esc(hm.ctaText) + '</p>' : '') +
        (hm.ctaButton ? '<a class="btn btn-primary magnetic" ' + href(hm.ctaLink) + '>' + I.ui('send') + esc(hm.ctaButton) + '</a>' : '') +
        '<span class="cta-plane">' + D.plane + '</span></div></div></section>';
    }
    return out;
  };
  M.home = function () { startRoles(); startParallax(); startTerminal(); var sh = $('#scroll-hint'); if (sh) sh.onclick = function () { var n = $('.tapes') || $('#explore'); if (n) n.scrollIntoView({ behavior: 'smooth' }); }; };

  function renderTapes() {
    var m = C.marquee;
    if (!m || !m.enabled || !(m.items || []).length) return '';
    var item = function (x) { return '<span class="tp-item">' + (x.icon && I.has(x.icon) ? I.brand(x.icon) : I.ui('code')) + esc(x.name) + '</span><span class="tp-sep">✦</span>'; };
    var row = m.items.map(item).join('');
    var half = Math.ceil(m.items.length / 2);
    var row2 = m.items.slice(half).concat(m.items.slice(0, half)).map(item).join('');
    return '<div class="tapes" aria-label="Tech stack"><div class="tape-band b1"><div class="tp-track">' + row + row + '</div></div>' +
      '<div class="tape-band b2"><div class="tp-track rev">' + row2 + row2 + '</div></div></div>';
  }

  /* ---------- ABOUT ---------- */
  P.about = function () {
    var a = C.about || {}, id = a.idCard || {};
    var interests = a.interests || [], now = a.currently || [], stats = a.stats || [];
    var card = id.enabled ? '<div class="idcard-wrap reveal"><button class="idcard" id="idcard" type="button" aria-label="Flip ID card">' +
      '<div class="id-face id-front"><div class="id-top"><span class="id-logo">' + I.ui('graduation-cap') + '</span><div><b>' + esc(id.school) + '</b><small>' + esc(id.title) + '</small></div></div>' +
        '<div class="id-body">' + (a.photo ? img(a.photo, (C.hero || {}).name, 'loading="eager" class="id-photo"') : '<div class="id-photo ph-empty">' + initials((C.hero || {}).name) + '</div>') +
        '<dl>' + (id.rows || []).map(function (r) { return '<div><dt>' + esc(r.label) + '</dt><dd>' + esc(r.value) + '</dd></div>'; }).join('') + '</dl></div>' +
        '<div class="id-foot"><span class="barcode"></span><span class="id-sign hand">' + esc(id.signature) + '</span></div></div>' +
      '<div class="id-face id-back"><div class="id-top"><span class="id-logo">' + I.ui('graduation-cap') + '</span><div><b>' + esc(id.school) + '</b><small>' + esc(id.title) + '</small></div></div>' +
        '<div class="id-back-body"><h4>' + esc(id.backTitle) + '</h4><p>' + esc(id.backText) + '</p>' + (a.quote ? '<blockquote class="hand">“' + esc(a.quote) + '”</blockquote>' : '') + '</div>' +
        '<div class="id-foot"><span class="qr"></span><span class="mono">' + esc(a.location || '') + '</span></div></div>' +
      '</button><p class="flip-hint hand">' + esc(L('about', 'flipHint')) + '</p></div>' : '';
    return '<section class="page"><div class="container">' + pageHead('about', a) +
      '<div class="about-grid' + (id.enabled ? '' : ' no-id') + '">' + card +
        '<div class="notebook bio reveal"><div class="nb-holes"></div>' +
          (a.bioTitle ? '<h2 class="nb-title hand">' + esc(a.bioTitle) + '</h2>' : '') +
          '<div class="nb-body">' + paragraphs(a.bio) + '</div>' +
          '<div class="nb-actions">' + (a.resumeLink ? '<a class="btn btn-primary btn-sm" ' + href(a.resumeLink) + ' download>' + I.ui('download') + esc(a.resumeText || 'CV') + '</a>' : '') +
            (pageById('contact') && pageById('contact').enabled ? '<a class="btn btn-dark btn-sm" ' + pageLink('contact') + '>' + I.ui('send') + esc(L('general', 'getInTouch')) + '</a>' : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="about-row">' +
        '<div class="card clock-card reveal"><div class="card-label">' + I.ui('clock') + esc(L('about', 'clockTitle')) + '</div>' + clockSVG() +
          '<div class="clock-digital mono" id="clock-digital">--:--</div><div class="muted small">' + I.ui('map-pin') + esc(a.location || '') + '</div></div>' +
        (now.length ? '<div class="card now-card reveal"><div class="card-label">' + I.ui('activity') + esc(L('about', 'currentlyTitle')) + '</div><ul class="now-list">' +
          now.map(function (n) { return '<li><span class="mono">' + esc(n.label) + '</span><b>' + esc(n.value) + '</b></li>'; }).join('') + '</ul></div>' : '') +
        (a.quote ? '<div class="card quote-card reveal"><div class="card-label">' + I.ui('quote') + esc(L('about', 'quoteTitle')) + '</div><blockquote>' + md(a.quote) + '</blockquote>' + (C.theme.doodles ? '<span class="q-heart">' + D.heart + '</span>' : '') + '</div>' : '') +
      '</div>' +
      (interests.length ? '<div class="sub-head reveal"><h2>' + esc(L('about', 'interestsTitle')) + '</h2><span class="hand muted">' + esc(L('about', 'interestsHint')) + '</span></div>' +
        '<div class="sticky-board" id="sticky-board">' + interests.map(function (x, i) {
          return '<div class="sticky-note drag c' + (i % 4 + 1) + ' reveal" style="--r:' + rot(i + 1, 1.2) + 'deg"><span class="pin"></span><div class="sn-emoji">' + esc(x.emoji) + '</div><strong>' + esc(x.title) + '</strong><p class="hand">' + esc(x.text) + '</p></div>';
        }).join('') + '</div>' : '') +
      (stats.length ? '<div class="stat-row reveal">' + stats.map(function (s) { return '<div class="stat"><strong class="countup" data-v="' + esc(s.value) + '">' + esc(s.value) + '</strong><span class="hand">' + esc(s.label) + '</span></div>'; }).join('') + '</div>' : '') +
    '</div></section>';
  };
  M.about = function () {
    var c = $('#idcard');
    if (c) c.addEventListener('click', function () { c.classList.toggle('flipped'); });
    startDraggables();
  };
  function clockSVG() {
    var ticks = '';
    for (var i = 0; i < 12; i++) ticks += '<line x1="50" y1="' + (i % 3 ? 9 : 7) + '" x2="50" y2="' + (i % 3 ? 13 : 16) + '" transform="rotate(' + i * 30 + ' 50 50)"/>';
    return '<svg class="wall-clock" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="wc-face"/><g class="wc-ticks">' + ticks + '</g>' +
      '<line id="wc-h" x1="50" y1="50" x2="50" y2="28" class="wc-h"/><line id="wc-m" x1="50" y1="50" x2="50" y2="18" class="wc-m"/><line id="wc-s" x1="50" y1="58" x2="50" y2="14" class="wc-s"/><circle cx="50" cy="50" r="3" class="wc-c"/></svg>';
  }

  /* ---------- SERVICES ---------- */
  P.services = function () {
    var s = C.services || {}, items = s.items || [];
    return '<section class="page"><div class="container">' + pageHead('services', s) +
      '<div class="index-grid">' + items.map(function (it, i) {
        return '<article class="index-card reveal" style="--r:' + rot(i, .4) + 'deg"><span class="ic-num mono">#' + pad(i + 1) + '</span>' +
          '<span class="ic-icon">' + I.ui(it.icon || 'sparkles') + '</span><h3>' + esc(it.title) + '</h3><p>' + esc(it.description) + '</p></article>';
      }).join('') + '</div></div></section>';
  };

  /* ---------- SKILLS (report card) ---------- */
  function gradeFor(level) {
    var g = ((C.skills && C.skills.grades) || []).slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < g.length; i++) if (level >= Number(g[i].min)) return g[i].grade;
    return '';
  }
  P.skills = function () {
    var s = C.skills || {};
    var groups = {}, order = [];
    (s.items || []).forEach(function (k) { var cat = k.category || 'Subjects'; if (!groups[cat]) { groups[cat] = []; order.push(cat); } groups[cat].push(k); });
    return '<section class="page"><div class="container">' + pageHead('skills', s) +
      '<div class="report reveal">' +
        '<div class="rp-head"><div class="rp-school"><span class="rp-logo">' + I.ui('graduation-cap') + '</span><div><b>' + esc(s.school) + '</b><small>' + esc(s.reportTitle) + ' · ' + esc(s.term) + '</small></div></div>' +
          '<div class="rp-student"><span>' + esc(L('skills', 'student')) + ': <b class="hand">' + esc(s.student) + '</b></span><span>' + esc(L('skills', 'rollNo')) + ': <b class="hand">' + esc(s.rollNo) + '</b></span></div></div>' +
        order.map(function (cat) {
          return '<h3 class="rp-cat">' + esc(cat) + '</h3><table class="rp-table"><thead><tr><th>' + esc(L('skills', 'subject')) + '</th><th>' + esc(L('skills', 'marks')) + '</th><th>' + esc(L('skills', 'grade')) + '</th><th class="rm">' + esc(L('skills', 'remark')) + '</th></tr></thead><tbody>' +
            groups[cat].map(function (k) {
              var lvl = Math.max(0, Math.min(100, Number(k.level) || 0));
              return '<tr><td class="subj">' + esc(k.name) + (k.remark ? '<span class="hand remark-m">' + esc(k.remark) + '</span>' : '') + '</td>' +
                '<td><div class="marks"><span class="mono"><b class="countup" data-v="' + lvl + '">' + lvl + '</b><small>' + esc(L('skills', 'outOf')) + '</small></span><i class="mbar"><b style="--w:' + lvl + '%"></b></i></div></td>' +
                '<td><span class="grade hand">' + esc(gradeFor(lvl)) + '</span></td><td class="rm hand remark">' + esc(k.remark || '') + '</td></tr>';
            }).join('') + '</tbody></table>';
        }).join('') +
        '<div class="rp-foot"><div class="rp-overall"><small class="mono">' + esc(L('skills', 'overall')) + '</small><p class="hand">' + esc(s.overallRemark) + '</p></div>' +
          (s.resultStamp ? '<div class="rp-stamp">' + esc(s.resultStamp) + '</div>' : '') +
          '<div class="rp-signs"><div>' + D.sign + '<span>' + esc(s.teacherSign) + '</span></div><div>' + D.sign + '<span>' + esc(s.principalSign) + '</span></div></div></div>' +
      '</div></div></section>';
  };

  /* ---------- PROJECTS ---------- */
  P.projects = function () {
    var p = C.projects || {}, items = p.items || [];
    var all = [];
    items.forEach(function (it) { (it.tags || []).forEach(function (t) { if (t && all.indexOf(t) === -1) all.push(t); }); });
    return '<section class="page"><div class="container">' + pageHead('projects', p) +
      '<div class="proj-tools reveal">' +
        (all.length > 1 ? '<div class="filters" id="pfilters"><button class="filter active" data-f="*">' + esc(L('projects', 'all')) + '</button>' + all.map(function (t) { return '<button class="filter" data-f="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '<span></span>') +
        (p.searchEnabled ? '<label class="search-box">' + I.ui('search') + '<input id="psearch" type="search" placeholder="' + esc(L('projects', 'searchPlaceholder')) + '" /></label>' : '') +
      '</div>' +
      '<div class="assign-grid" id="pgrid">' + items.map(function (it, i) {
        var text = [it.title, it.description, (it.tags || []).join(' '), it.year].join(' ').toLowerCase();
        return '<article class="assign tilt reveal' + (it.featured ? ' featured' : '') + '" data-tags="' + esc(JSON.stringify(it.tags || [])) + '" data-text="' + esc(text) + '">' +
          '<div class="as-media"><span class="clip">' + I.ui('paperclip') + '</span>' + (it.image ? img(it.image, it.title) : '<div class="ph-empty">' + initials(it.title) + '</div>') +
            (it.grade ? '<span class="grade-stamp hand">' + esc(it.grade) + '</span>' : '') +
            (it.featured ? '<span class="fav">' + I.ui('star') + esc(L('projects', 'featured')) + '</span>' : '') + '</div>' +
          '<div class="as-body"><div class="as-meta mono"><span>#' + pad(i + 1) + '</span><span>' + esc(it.year || '') + '</span></div>' +
            '<h3>' + esc(it.title) + '</h3><p>' + esc(it.description) + '</p>' + tags(it.tags) +
            '<div class="as-links">' + (it.details ? '<button class="btn btn-ghost btn-sm" data-details="' + i + '">' + I.ui('book-open') + esc(L('projects', 'details')) + '</button>' : '') +
              (it.liveUrl ? '<a class="btn btn-primary btn-sm" ' + href(it.liveUrl) + '>' + I.ui('external-link') + esc(L('projects', 'liveDemo')) + '</a>' : '') +
              (it.codeUrl ? '<a class="btn btn-ghost btn-sm" ' + href(it.codeUrl) + '>' + I.brand('github') + esc(L('projects', 'source')) + '</a>' : '') + '</div>' +
          '</div></article>';
      }).join('') + '</div>' +
      '<p class="empty-note hand" id="pempty" hidden>' + esc(L('projects', 'noResults')) + '</p>' +
    '</div></section>';
  };
  M.projects = function () {
    var f = '*', q = '';
    function apply() {
      var shown = 0;
      $$('#pgrid .assign').forEach(function (el) {
        var ok = (f === '*' || JSON.parse(el.dataset.tags || '[]').indexOf(f) !== -1) && (!q || el.dataset.text.indexOf(q) !== -1);
        el.style.display = ok ? '' : 'none';
        if (ok) { shown++; el.classList.add('visible'); }
      });
      $('#pempty').hidden = shown > 0;
    }
    var fl = $('#pfilters');
    if (fl) fl.addEventListener('click', function (e) {
      var b = e.target.closest('.filter'); if (!b) return;
      $$('.filter', fl).forEach(function (x) { x.classList.toggle('active', x === b); });
      f = b.dataset.f; apply();
    });
    var s = $('#psearch');
    if (s) s.addEventListener('input', function () { q = s.value.trim().toLowerCase(); apply(); });
    $$('[data-details]').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = C.projects.items[Number(b.dataset.details)];
        openModal('<button class="icon-btn modal-x" data-close aria-label="' + esc(L('general', 'close')) + '">' + I.ui('x') + '</button>' +
          (it.image ? '<div class="m-media">' + img(it.image, it.title, 'loading="eager"') + '</div>' : '') +
          '<div class="m-body"><div class="as-meta mono"><span>' + esc(it.year || '') + '</span>' + (it.grade ? '<span class="grade hand">' + esc(it.grade) + '</span>' : '') + '</div>' +
          '<h3>' + esc(it.title) + '</h3>' + paragraphs(it.details || it.description) + tags(it.tags) +
          '<div class="as-links">' + (it.liveUrl ? '<a class="btn btn-primary btn-sm" ' + href(it.liveUrl) + '>' + I.ui('external-link') + esc(L('projects', 'liveDemo')) + '</a>' : '') +
          (it.codeUrl ? '<a class="btn btn-ghost btn-sm" ' + href(it.codeUrl) + '>' + I.brand('github') + esc(L('projects', 'source')) + '</a>' : '') + '</div></div>');
      });
    });
  };

  /* ---------- STORE (canteen) ---------- */
  P.products = function () {
    var p = C.products || {}, items = p.items || [];
    return '<section class="page"><div class="container">' + pageHead('products', p) +
      '<div class="menu-grid">' + items.map(function (it, i) {
        var feats = (it.features || []).filter(Boolean);
        return '<article class="menu-card reveal">' +
          '<div class="mc-media">' + (it.image ? img(it.image, it.name) : '<div class="ph-empty">' + I.ui('shopping-bag') + '</div>') +
            (it.badge ? '<span class="ribbon">' + esc(it.badge) + '</span>' : '') +
            (it.price ? '<span class="price-tag hand" style="--r:' + (rot(i, 2) + 6) + 'deg">' + esc(it.price) + '</span>' : '') + '</div>' +
          '<div class="mc-body"><h3>' + esc(it.name) + '</h3><p>' + esc(it.description) + '</p>' +
            (feats.length ? '<ul class="ticks">' + feats.map(function (f) { return '<li>' + I.ui('check') + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
            (it.link ? '<a class="btn btn-primary btn-sm magnetic" ' + href(it.link) + '>' + esc(it.buttonText || 'Buy') + I.ui('arrow-right') + '</a>' : '') +
          '</div></article>';
      }).join('') + '</div></div></section>';
  };

  /* ---------- JOURNEY (timetable) ---------- */
  P.experience = function () {
    var e = C.experience || {}, items = e.items || [];
    return '<section class="page"><div class="container">' + pageHead('experience', e) +
      '<div class="timeline" id="timeline"><span class="tl-line"><i id="tl-progress"></i></span>' + items.map(function (it, i) {
        return '<div class="tl-item reveal"><span class="tl-dot"></span>' +
          '<div class="tl-card"><span class="tl-period sticky-tag c' + (i % 4 + 1) + '">' + esc(it.period) + '</span>' +
          '<h3>' + esc(it.role) + '</h3>' + (it.company ? '<span class="tl-co hand">@ ' + esc(it.company) + '</span>' : '') +
          (it.description ? '<p>' + esc(it.description) + '</p>' : '') + '</div></div>';
      }).join('') + '</div></div></section>';
  };
  M.experience = function () {
    function upd() { var tl = $('#timeline'), tp = $('#tl-progress'); if (!tl || !tp) return; var r = tl.getBoundingClientRect(); tp.style.height = Math.min(1, Math.max(0, (innerHeight * .6 - r.top) / r.height)) * 100 + '%'; }
    window.addEventListener('scroll', upd, { passive: true }); upd();
    onCleanup(function () { window.removeEventListener('scroll', upd); });
  };

  /* ---------- GALLERY (polaroid wall) ---------- */
  function galleryItems() { return ((C.gallery && C.gallery.items) || []).filter(function (x) { return x.image; }); }
  P.gallery = function () {
    var g = C.gallery || {}, items = galleryItems();
    return '<section class="page"><div class="container">' + pageHead('gallery', g) +
      (items.length ? '<div class="pola-wall">' + items.map(function (it, i) {
        return '<button class="polaroid g-item reveal" type="button" data-i="' + i + '" style="--r:' + rot(i + 2, 1.3) + 'deg" aria-label="' + esc(it.caption || 'Open image') + '">' +
          '<span class="tape"></span>' + img(it.image, it.caption) + (it.caption ? '<span class="hand cap">' + esc(it.caption) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '') +
      (g.instagramUrl ? '<div class="center reveal"><a class="btn btn-ghost magnetic" ' + href(g.instagramUrl) + '>' + I.brand('instagram') + esc(L('gallery', 'follow')) + ' ' + esc(g.instagramHandle || '') + '</a></div>' : '') +
    '</div></section>';
  };
  M.gallery = function () {
    $$('.g-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = galleryItems()[Number(b.dataset.i)];
        if (!it) return;
        if (it.link) { window.open(it.link, '_blank', 'noopener'); return; }
        openLightbox(Number(b.dataset.i));
      });
    });
  };

  /* ---------- PLAYGROUND ---------- */
  P.playground = function () {
    var g = C.playground || {};
    var colors = (g.doodleColors || []).filter(function (c) { return /^#[0-9a-f]{3,8}$/i.test(c); });
    var ex = (g.excuses || []).filter(Boolean);
    return '<section class="page"><div class="container">' + pageHead('playground', g) +
      '<div class="play-grid">' +
      (g.doodleEnabled ? '<article class="play-card wide reveal"><div class="pc-head"><h3>' + I.ui('brush') + esc(g.doodleTitle) + '</h3><p class="muted">' + esc(g.doodleText) + '</p></div>' +
        '<div class="doodle-wrap" id="doodle-wrap"><canvas id="doodle"></canvas><span class="doodle-hint hand" id="doodle-hint">' + esc(L('playground', 'drawHere')) + '</span></div>' +
        '<div class="doodle-tools" id="doodle-tools">' +
          colors.map(function (c, i) { return '<button class="swatch' + (i === 0 ? ' active' : '') + '" data-c="' + esc(c) + '" style="--c:' + esc(c) + '" aria-label="' + esc(L('playground', 'pen')) + ' ' + esc(c) + '"></button>'; }).join('') +
          '<button class="tool" data-tool="eraser" title="' + esc(L('playground', 'eraser')) + '">' + I.ui('eraser') + '<span>' + esc(L('playground', 'eraser')) + '</span></button>' +
          '<label class="tool size">' + esc(L('playground', 'size')) + '<input type="range" id="doodle-size" min="2" max="24" value="5" /></label>' +
          '<span class="grow"></span>' +
          '<button class="tool" data-tool="clear">' + I.ui('trash-2') + '<span>' + esc(L('playground', 'clear')) + '</span></button>' +
          '<button class="tool primary" data-tool="save">' + I.ui('download') + '<span>' + esc(L('playground', 'save')) + '</span></button>' +
        '</div></article>' : '') +
      (g.tossEnabled ? '<article class="play-card reveal"><div class="pc-head"><h3>' + I.ui('target') + esc(g.tossTitle) + '</h3><p class="muted">' + esc(g.tossText) + '</p></div>' +
        '<div class="toss-wrap"><canvas id="toss"></canvas>' +
          '<div class="toss-hud mono"><span>' + esc(L('playground', 'score')) + ' <b id="toss-score">0</b></span><span>' + esc(L('playground', 'best')) + ' <b id="toss-best">0</b></span><span id="toss-wind"></span></div>' +
          '<div class="toss-msg hand" id="toss-msg">' + esc(L('playground', 'tossHint')) + '</div></div></article>' : '') +
      (g.excuseEnabled && ex.length ? '<article class="play-card excuse-card reveal"><div class="pc-head"><h3>' + I.ui('dice-5') + esc(g.excuseTitle) + '</h3><p class="muted">' + esc(g.excuseText) + '</p></div>' +
        '<div class="excuse-stage"><div class="sticky-note c2 excuse hand" id="excuse"><span class="pin"></span><span id="excuse-text">' + esc(ex[0]) + '</span></div></div>' +
        '<button class="btn btn-primary magnetic" id="excuse-btn" type="button">' + I.ui('shuffle') + esc(g.excuseButton) + '</button></article>' : '') +
      '</div></div></section>';
  };
  M.playground = function () { startDoodle(); startToss(); startExcuses(); };

  /* ---------- REVIEWS ---------- */
  P.testimonials = function () {
    var t = C.testimonials || {}, items = t.items || [];
    return '<section class="page"><div class="container">' + pageHead('testimonials', t) +
      '<div class="notes-grid">' + items.map(function (it, i) {
        return '<figure class="sticky-note c' + (i % 4 + 1) + ' review reveal" style="--r:' + rot(i, 1) + 'deg"><span class="pin"></span><blockquote class="hand">“' + esc(it.quote) + '”</blockquote>' +
          '<figcaption>' + (it.avatar ? img(it.avatar, '') : '<span class="av">' + initials(it.name) + '</span>') + '<div><strong>' + esc(it.name) + '</strong><span>' + esc(it.role) + '</span></div></figcaption></figure>';
      }).join('') + '</div></div></section>';
  };

  /* ---------- CONTACT ---------- */
  P.contact = function () {
    var c = C.contact || {};
    var info = [];
    if (c.phone) info.push(['phone', L('contact', 'phoneLabel'), c.phone, 'tel:' + c.phone.replace(/[^\d+]/g, '')]);
    if (c.whatsapp) info.push(['whatsapp', L('contact', 'whatsappLabel'), '+' + c.whatsapp.replace(/\D/g, ''), 'https://wa.me/' + c.whatsapp.replace(/\D/g, '')]);
    if (c.location) info.push(['map-pin', L('contact', 'locationLabel'), c.location, '']);
    return '<section class="page"><div class="container">' + pageHead('contact', c) +
      '<div class="contact-grid' + (c.formEnabled ? '' : ' single') + '">' +
        '<div class="contact-side">' +
          (c.email ? '<div class="info-card email-card reveal"><span class="ii">' + I.ui('mail') + '</span><div class="ic-txt"><small class="mono">' + esc(L('contact', 'emailLabel')) + '</small><a href="mailto:' + esc(c.email) + '">' + esc(c.email).replace('@', '<wbr>@') + '</a></div>' +
            '<button class="icon-btn" id="copy-email" type="button" aria-label="Copy email">' + I.ui('copy') + '</button></div>' : '') +
          (c.instagramEnabled && c.instagramUrl ? '<a class="insta-card reveal" ' + href(c.instagramUrl) + '><span class="ig-ic">' + I.brand('instagram') + '</span>' +
            '<div class="ic-txt"><b>' + esc(c.instagramHandle) + '</b><p>' + esc(c.instagramText) + '</p></div><span class="ig-btn">' + esc(c.instagramButton) + I.ui('arrow-up-right') + '</span></a>' : '') +
          info.map(function (x) {
            var icon = x[0] === 'whatsapp' ? I.brand('whatsapp') : I.ui(x[0]);
            var inner = '<span class="ii">' + icon + '</span><div class="ic-txt"><small class="mono">' + esc(x[1]) + '</small><b>' + esc(x[2]) + '</b></div>' + (x[3] ? '<span class="go">' + I.ui('arrow-up-right') + '</span>' : '');
            return x[3] ? '<a class="info-card reveal" ' + href(x[3]) + '>' + inner + '</a>' : '<div class="info-card reveal">' + inner + '</div>';
          }).join('') +
          ((C.socials || []).length ? '<div class="info-card col reveal"><small class="mono">' + esc(L('contact', 'socialsLabel')) + '</small><div class="socials">' + socialLinks(C.socials) + '</div></div>' : '') +
        '</div>' +
        (c.formEnabled ? '<div class="note-wrap reveal" id="note-wrap">' +
          '<form class="notebook note-form" id="contact-form" novalidate><div class="nb-holes"></div>' +
            '<h2 class="nb-title hand">' + esc(c.formTitle) + '</h2>' +
            '<div class="nf-row"><label class="nf"><span>' + esc(L('contact', 'name')) + '</span><input name="name" required maxlength="100" placeholder="' + esc(L('contact', 'namePlaceholder')) + '" autocomplete="name" /></label>' +
            '<label class="nf"><span>' + esc(L('contact', 'email')) + '</span><input name="email" type="email" required maxlength="200" placeholder="' + esc(L('contact', 'emailPlaceholder')) + '" autocomplete="email" /></label></div>' +
            '<label class="nf"><span>' + esc(L('contact', 'subject')) + '</span><input name="subject" maxlength="200" placeholder="' + esc(L('contact', 'subjectPlaceholder')) + '" /></label>' +
            '<label class="nf"><span>' + esc(L('contact', 'message')) + '</span><textarea name="message" rows="5" required maxlength="5000" placeholder="' + esc(L('contact', 'messagePlaceholder')) + '"></textarea></label>' +
            '<div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off" /></div>' +
            '<div class="nf-foot"><button class="btn btn-primary magnetic" type="submit">' + I.ui('send') + esc(L('contact', 'send')) + '</button><span class="form-status" id="form-status" role="status"></span></div>' +
          '</form>' +
          '<div class="note-sent" id="note-sent" hidden><span class="ns-plane">' + D.plane + '</span><p class="hand" id="note-sent-text"></p><button class="btn btn-ghost btn-sm" id="note-again" type="button">' + I.ui('notebook-pen') + esc(L('contact', 'writeAnother')) + '</button></div>' +
        '</div>' : '') +
      '</div></div></section>';
  };
  M.contact = function () {
    var ce = $('#copy-email');
    if (ce) ce.addEventListener('click', function () { copy(C.contact.email, L('general', 'emailCopied')); });
    var form = $('#contact-form');
    if (!form) return;
    var sent = $('#note-sent');
    $('#note-again').addEventListener('click', function () { sent.hidden = true; form.classList.remove('folding'); form.hidden = false; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = $('#form-status'), btn = form.querySelector('button[type=submit]');
      var data = Object.fromEntries(new FormData(form).entries());
      if (!data.name || !data.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { status.className = 'form-status err'; status.textContent = L('contact', 'error'); return; }
      btn.disabled = true; status.className = 'form-status'; status.textContent = L('contact', 'sending');
      fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'Something went wrong.');
          status.textContent = '';
          $('#note-sent-text').textContent = res.j.message || C.contact.successMessage;
          var finish = function () { form.hidden = true; form.reset(); sent.hidden = false; };
          if (animOn()) { form.classList.add('folding'); setTimeout(finish, 900); } else finish();
        })
        .catch(function (err) { status.className = 'form-status err'; status.textContent = err.message; })
        .finally(function () { btn.disabled = false; });
    });
  };

  /* ---------- 404 (detention slip) ---------- */
  P.notFound = function () {
    var n = C.notFound || {};
    return '<section class="page nf-page"><div class="container"><div class="slip reveal">' +
      '<div class="slip-head"><b>' + esc(n.slipTitle) + '</b><span class="mono">No. ' + Math.floor(1000 + Math.random() * 8999) + '</span></div>' +
      '<h1>' + md(n.heading) + '</h1>' +
      '<dl><div><dt>' + esc(n.nameLabel) + '</dt><dd class="hand">' + esc(n.nameValue) + '</dd></div><div><dt>' + esc(n.offenseLabel) + '</dt><dd class="hand">' + esc(n.offense) + '</dd></div><div><dt>' + esc(n.punishmentLabel) + '</dt><dd class="hand">' + esc(n.punishment) + '</dd></div></dl>' +
      '<div class="slip-foot"><a class="btn btn-primary" href="/" data-link>' + I.ui('house') + esc(n.button) + '</a><span class="sig">' + D.sign + '<small>' + esc(n.sign) + '</small></span></div>' +
    '</div></div></section>';
  };

  /* ============================== chrome ============================== */
  function renderChrome() {
    var s = C.site || {};
    if (s.favicon) $('#favicon').href = s.favicon;
    var logo = s.logoImage ? '<img src="' + esc(safeUrl(s.logoImage)) + '" alt="' + esc(s.logoText || 'Logo') + '" />'
      : '<span class="lg-txt">' + esc(s.logoText) + '</span><span class="lg-ext">' + esc(s.logoSuffix || '') + '</span>';
    $('#logo').innerHTML = logo;
    var list = pageList();
    $('#nav-links').innerHTML = list.filter(function (p) { return p.inNav !== false; }).map(function (p) { return '<a ' + pageLink(p.id) + ' data-id="' + p.id + '">' + esc(p.label) + '<span class="nl-line">' + D.scribble + '</span></a>'; }).join('');
    $('#mobile-menu').innerHTML = '<div class="mm-inner">' + list.map(function (p, i) { return '<a ' + pageLink(p.id) + ' data-id="' + p.id + '" style="--d:' + i * 35 + 'ms"><span class="mono">' + pad(i) + '</span>' + esc(p.label) + '<em>' + esc(p.emoji || '') + '</em></a>'; }).join('') +
      '<div class="mm-actions">' +
        ((C.teacher || {}).enabled !== false ? '<button type="button" class="btn btn-ghost btn-sm" data-mm="teacher">' + I.ui('glasses') + esc(L('general', 'teacherButton')) + '</button>' : '') +
        ((C.theme || {}).allowVisitorToggle !== false ? '<button type="button" class="btn btn-ghost btn-sm" data-mm="theme">' + I.ui('moon') + esc(L('general', 'themeButton')) + '</button>' : '') +
      '</div>' +
      '<div class="mm-socials socials">' + socialLinks(C.socials) + '</div></div>';
    $('#cmdk-btn').hidden = !s.commandPalette;
    $('#cmdk-btn').innerHTML = I.ui('search') + '<span class="kb-label">' + esc(L('general', 'searchButton')) + '</span><kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl') + ' K</kbd>';
    var tb = $('#teacher-btn');
    tb.hidden = !(C.teacher && C.teacher.enabled);
    tb.innerHTML = I.ui('glasses'); tb.title = L('general', 'teacherButton'); tb.setAttribute('aria-label', L('general', 'teacherButton'));
    $('#theme-toggle').title = L('general', 'themeButton'); $('#theme-toggle').setAttribute('aria-label', L('general', 'themeButton'));
    $('#to-top').innerHTML = '<svg class="ring" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" stroke-dasharray="150.8" stroke-dashoffset="150.8" id="top-ring"/></svg>' + I.ui('arrow-up');
    $('#to-top').setAttribute('aria-label', L('general', 'backToTop'));
    $('#boot-skip').textContent = L('general', 'skipBoot');
    $('#cmdk-input').placeholder = L('cmdk', 'placeholder');
    $('#cmdk-foot').innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> ' + esc(L('cmdk', 'navigate')) + '</span><span><kbd>↵</kbd> ' + esc(L('cmdk', 'select')) + '</span><span class="mono">' + esc((s.logoText || '') + (s.logoSuffix || '')) + '</span>';
    renderFooter(list);
  }

  function renderFooter(list) {
    var s = C.site || {}, c = C.contact || {};
    var logo = s.logoImage ? '<img src="' + esc(safeUrl(s.logoImage)) + '" alt="" />' : '<span class="lg-txt">' + esc(s.logoText) + '</span><span class="lg-ext">' + esc(s.logoSuffix || '') + '</span>';
    var soc = (C.socials || []).filter(function (x) { return x.url; }).map(function (x) { return '<a ' + href(x.url) + '>' + I.social(x.platform) + esc(x.label || x.platform) + '</a>'; }).join('');
    var con = (c.email ? '<a href="mailto:' + esc(c.email) + '">' + I.ui('mail') + esc(c.email) + '</a>' : '') +
      (c.instagramEnabled && c.instagramUrl ? '<a ' + href(c.instagramUrl) + '>' + I.brand('instagram') + esc(c.instagramHandle) + '</a>' : '') +
      (c.location ? '<span>' + I.ui('map-pin') + esc(c.location) + '</span>' : '') +
      (s.commandPalette ? '<a href="#" data-cmdk>' + I.ui('command') + esc(L('footer', 'commandMenu')) + '</a>' : '');
    var copyText = String(s.copyright || '').replace('{year}', new Date().getFullYear()).replace('{name}', (C.hero && C.hero.name) || '');
    $('#footer').innerHTML = '<div class="container">' +
      '<div class="footer-top"><div class="footer-brand"><a href="/" data-link class="logo">' + logo + '</a><p class="muted">' + esc(s.footerText) + '</p></div>' +
        '<div class="footer-cols"><div><h4>' + esc(L('footer', 'pages')) + '</h4>' + list.map(function (p) { return '<a ' + pageLink(p.id) + '>' + esc(p.label) + '</a>'; }).join('') + '</div>' +
        '<div><h4>' + esc(L('footer', 'connect')) + '</h4>' + soc + '</div><div><h4>' + esc(L('footer', 'contact')) + '</h4>' + con + '</div></div></div>' +
      (s.footerBigText ? '<div class="footer-big" aria-hidden="true"><span>' + esc(s.footerBigText) + '</span>' + D.scribble + '</div>' : '') +
      '<div class="footer-bottom"><span>' + esc(copyText) + '</span>' + (s.footerNote ? '<span class="hand">' + esc(s.footerNote) + '</span>' : '') +
        '<span class="footer-right"><span id="footer-time" class="mono"></span>' + (s.showAdminLink ? '<a href="/admin" class="admin-link">Admin</a>' : '') + '</span></div>' +
    '</div>';
  }

  /* ============================== router ============================== */
  function titleFor(pg) {
    var s = C.site || {};
    if (!pg) return ((C.notFound || {}).slipTitle || '404') + ' — ' + (s.title || '');
    if (pg.seoTitle) return pg.seoTitle;
    return pg.id === 'home' ? (s.title || '') : pg.label + ' — ' + (s.title || '');
  }
  function renderPage(keepScroll) {
    pageCleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
    pageCleanups = [];
    observers.forEach(function (o) { o.disconnect(); });
    observers = [];
    var pg = pageFromPath(location.pathname);
    currentId = pg ? pg.id : '404';
    var main = $('#main');
    main.innerHTML = (pg ? P[pg.id]() + (pg.id !== 'home' ? nextPage(pg.id) : '') : P.notFound());
    main.dataset.page = currentId;
    document.body.dataset.page = currentId;
    if (!teacherOn) document.title = titleFor(pg);
    $$('#nav-links a, #mobile-menu a').forEach(function (a) { a.classList.toggle('active', a.dataset.id === currentId); });
    if (pg && M[pg.id]) M[pg.id]();
    observe();
    if (!keepScroll) window.scrollTo(0, 0);
  }
  function navigate(path, opts) {
    opts = opts || {};
    var url = new URL(path, location.href);
    if (url.pathname === location.pathname && !opts.force) { window.scrollTo({ top: 0, behavior: animOn() ? 'smooth' : 'auto' }); setMenu(false); return; }
    if (opts.replace) history.replaceState({}, '', url.pathname); else history.pushState({}, '', url.pathname);
    setMenu(false);
    transition(function () { renderPage(); });
  }
  function transition(fn) {
    if (document.startViewTransition && animOn() && C.theme.pageTransitions !== false) { document.startViewTransition(fn); return; }
    fn();
    if (animOn() && C.theme.pageTransitions !== false) { var m = $('#main'); m.classList.remove('page-in'); void m.offsetWidth; m.classList.add('page-in'); }
  }

  /* ============================== features ============================== */
  /* ---------- roles with red-pen strike ---------- */
  function startRoles() {
    var el = $('#role');
    var roles = ((C.hero && C.hero.roles) || []).filter(Boolean);
    if (!el || roles.length < 2 || !animOn()) return;
    var i = 0, t1, t2, t3;
    function cycle() {
      t1 = setTimeout(function () {
        el.classList.add('struck');
        t2 = setTimeout(function () {
          el.classList.add('out');
          t3 = setTimeout(function () { i = (i + 1) % roles.length; el.textContent = roles[i]; el.classList.remove('struck', 'out'); cycle(); }, 260);
        }, 650);
      }, 2200);
    }
    cycle();
    onCleanup(function () { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); });
  }

  /* ---------- hero parallax ---------- */
  function startParallax() {
    var art = $('#hero-art');
    if (!art || !fine || !animOn()) return;
    var layers = $$('.layer', art), raf = 0, tx = 0, ty = 0;
    function move(e) {
      tx = (e.clientX / innerWidth - .5); ty = (e.clientY / innerHeight - .5);
      if (!raf) raf = requestAnimationFrame(function () {
        raf = 0;
        layers.forEach(function (l) { var d = Number(l.dataset.depth) || 10; l.style.transform = 'translate3d(' + (-tx * d) + 'px,' + (-ty * d) + 'px,0)'; });
      });
    }
    window.addEventListener('pointermove', move, { passive: true });
    onCleanup(function () { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); });
  }

  /* ---------- draggable sticky notes ---------- */
  function startDraggables() {
    if (!fine) return;
    var z = 5;
    $$('.sticky-note.drag').forEach(function (n) {
      var sx, sy, ox = 0, oy = 0, dragging = false;
      n.addEventListener('pointerdown', function (e) {
        dragging = true; n.setPointerCapture(e.pointerId); sx = e.clientX - ox; sy = e.clientY - oy;
        n.style.zIndex = ++z; n.classList.add('dragging');
      });
      n.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        ox = e.clientX - sx; oy = e.clientY - sy;
        n.style.translate = ox + 'px ' + oy + 'px';
      });
      var end = function () { dragging = false; n.classList.remove('dragging'); };
      n.addEventListener('pointerup', end); n.addEventListener('pointercancel', end);
    });
  }

  /* ---------- interactive terminal ---------- */
  function promptHTML() { return '<b>' + esc(String(C.site.logoText || 'user').toLowerCase()) + '</b>@lastbench:~$'; }
  function terminalHTML() {
    var t = C.terminal || {};
    return '<div class="terminal reveal" id="terminal"><div class="term-bar"><i></i><i></i><i></i><span>' + esc(t.title || 'terminal') + '</span></div>' +
      '<div class="term-body" id="term-body"><div id="term-out"></div>' +
      '<div class="term-input-row" id="term-input-row" hidden><span class="term-prompt">' + promptHTML() + '</span><input id="term-input" type="text" aria-label="Terminal input" autocomplete="off" autocapitalize="off" spellcheck="false" /></div>' +
      '<div class="term-hint" id="term-hint" hidden>' + esc(L('terminal', 'hint')) + '</div></div></div>';
  }
  function startTerminal() {
    var out = $('#term-out');
    if (!out) return;
    var body = $('#term-body'), row = $('#term-input-row'), input = $('#term-input'), hint = $('#term-hint');
    var t = C.terminal || {}, timers = [], history = [], hIdx = 0;
    function line(html, cls) { var d = document.createElement('div'); d.className = 'term-line ' + (cls || ''); d.innerHTML = html; out.appendChild(d); body.scrollTop = body.scrollHeight; return d; }
    function promptLine(cmd) { return line('<span class="term-prompt">' + promptHTML() + '</span> <span class="term-cmd">' + esc(cmd) + '</span>'); }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    onCleanup(function () { timers.forEach(clearTimeout); });
    var custom = {};
    (t.commands || []).forEach(function (c) { if (c.command) custom[c.command.trim().toLowerCase()] = c.output || ''; });
    var pagesTxt = function () { return pageList().map(function (p) { return (p.slug || 'home') + '/'; }).join('  '); };
    var builtins = {
      help: function () {
        var cmds = ['whoami', 'about', 'skills', 'projects', 'socials', 'contact', 'ls', 'excuse', 'teacher', 'theme', 'date', 'clear'].concat(Object.keys(custom));
        var rows = [];
        for (var i = 0; i < cmds.length; i += 3) rows.push('  ' + cmds.slice(i, i + 3).map(function (c) { return (c + '             ').slice(0, 13); }).join(''));
        return 'available commands:\n' + rows.join('\n') + '\n  cd <page>    → go to a page (e.g. cd projects)\n  open <name>  → open a social link';
      },
      whoami: function () { return (C.hero.name || '') + ' — ' + (C.hero.roles || []).slice(0, 3).join(' · '); },
      about: function () { return (C.about && C.about.bio || '').split(/\n{2,}/)[0]; },
      skills: function () { return ((C.skills && C.skills.items) || []).map(function (s) { return s.name + ' (' + gradeFor(s.level) + ')'; }).join(' · '); },
      projects: function () { return ((C.projects && C.projects.items) || []).map(function (p, i) { return '  [' + (i + 1) + '] ' + p.title + (p.year ? ' (' + p.year + ')' : ''); }).join('\n') + '\n→ type "cd projects" to see them'; },
      socials: function () { return { html: (C.socials || []).filter(function (s) { return s.url; }).map(function (s) { return '  ' + esc(s.label || s.platform) + ': <a ' + href(s.url) + '>' + esc(s.url.replace(/^https?:\/\/(www\.)?|^mailto:/, '')) + '</a>'; }).join('\n') }; },
      contact: function () { var c = C.contact || {}; return { html: 'email: <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' + (c.instagramHandle ? '\ninstagram: <a ' + href(c.instagramUrl) + '>' + esc(c.instagramHandle) + '</a>' : '') + (c.location ? '\nlocation: ' + esc(c.location) : '') }; },
      ls: function () { return pagesTxt() + '  secrets.txt'; },
      'cat secrets.txt': function () { return 'nice try 😏  silent moves only.'; },
      excuse: function () { var e = ((C.playground || {}).excuses || []).filter(Boolean); return e.length ? e[Math.floor(Math.random() * e.length)] : 'no excuses. just ship.'; },
      teacher: function () { setTimeout(toggleTeacher, 300); return 'shhh… 🤫'; },
      theme: function () { toggleTheme(); return 'switched to ' + document.documentElement.dataset.theme + ' mode'; },
      date: function () { return new Date().toString(); },
      sudo: function () { return 'permission denied: you are not the principal 🕷️'; },
      exit: function () { return 'there is no exit. only ship. 🚀'; },
      clear: function () { out.innerHTML = ''; return null; }
    };
    function goPage(target) {
      var pg = (C.pages || []).find(function (p) { return p.enabled && (p.id === target || (p.slug || '') === target || p.label.toLowerCase() === target); });
      if (target === '~' || target === '/' || target === 'home') pg = pageById('home');
      if (pg) { setTimeout(function () { navigate(pathFor(pg.id)); }, 350); return 'cd → ' + (pg.slug || 'home') + '/'; }
      return null;
    }
    function run(raw) {
      var cmd = raw.trim();
      promptLine(cmd);
      if (!cmd) return;
      history.push(cmd); hIdx = history.length;
      var key = cmd.toLowerCase(), res;
      if (custom[key] != null) res = custom[key];
      else if (builtins[key]) res = builtins[key]();
      else if (key.indexOf('sudo') === 0) res = builtins.sudo();
      else if (key.indexOf('cd ') === 0) res = goPage(key.slice(3).trim().replace(/\/$/, '')) || 'cd: no such page: ' + key.slice(3);
      else if (key.indexOf('open ') === 0) {
        var target = key.slice(5).trim();
        var soc = (C.socials || []).find(function (s) { return (s.platform || '').toLowerCase() === target || (s.label || '').toLowerCase() === target; });
        if (soc) { window.open(soc.url, '_blank', 'noopener'); res = 'opening ' + target + '…'; }
        else res = goPage(target) || 'open: ' + target + ': not found';
      } else res = L('terminal', 'notFound').replace('{cmd}', cmd);
      if (res == null) return;
      if (typeof res === 'object') line(res.html, 'term-out'); else line(esc(res), 'term-out');
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { run(input.value); input.value = ''; hint.hidden = true; }
      else if (e.key === 'ArrowUp') { if (hIdx > 0) { hIdx--; input.value = history[hIdx]; } e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (hIdx < history.length - 1) { hIdx++; input.value = history[hIdx]; } else { hIdx = history.length; input.value = ''; } e.preventDefault(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        var m = Object.keys(builtins).concat(Object.keys(custom)).filter(function (c) { return c.indexOf(input.value.toLowerCase()) === 0; });
        if (m.length === 1) input.value = m[0];
      }
      e.stopPropagation();
    });
    body.addEventListener('click', function () { if (!row.hidden && !window.getSelection().toString()) input.focus({ preventScroll: true }); });
    var intro = (t.intro || []).filter(function (x) { return x.command; });
    function finish() { row.hidden = false; hint.hidden = false; body.scrollTop = body.scrollHeight; }
    if (!animOn()) { intro.forEach(function (x) { promptLine(x.command); line(esc(x.output), 'term-out hl'); }); finish(); return; }
    // start typing when the terminal scrolls into view
    var started = false;
    var io = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting || started) return;
      started = true; io.disconnect();
      var tm = 300;
      intro.forEach(function (x) {
        later(function () {
          var l = promptLine(''), span = l.querySelector('.term-cmd'), i = 0;
          (function type() { span.textContent = x.command.slice(0, ++i); if (i < x.command.length) later(type, 40 + Math.random() * 35); })();
        }, tm);
        tm += x.command.length * 58 + 220;
        later(function () { line(esc(x.output), 'term-out hl'); }, tm);
        tm += 380;
      });
      later(finish, tm);
    }, { threshold: .3 });
    io.observe($('#terminal'));
    onCleanup(function () { io.disconnect(); });
  }

  /* ---------- doodle board ---------- */
  function startDoodle() {
    var cv = $('#doodle');
    if (!cv) return;
    var wrap = $('#doodle-wrap'), ctx = cv.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var BG = '#1d2a23', color = ($('.swatch.active') || {}).dataset ? $('.swatch.active').dataset.c : '#ffffff', size = 5, eraser = false, drawing = false, last = null, drawn = false;
    function fill() { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = BG; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore(); }
    function resize() {
      var r = wrap.getBoundingClientRect();
      var tmp = document.createElement('canvas'); tmp.width = cv.width; tmp.height = cv.height; if (cv.width) tmp.getContext('2d').drawImage(cv, 0, 0);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); fill();
      if (tmp.width) ctx.drawImage(tmp, 0, 0, tmp.width / dpr, tmp.height / dpr);
    }
    resize();
    var ro = new ResizeObserver(function () { resize(); }); ro.observe(wrap);
    onCleanup(function () { ro.disconnect(); });
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    cv.addEventListener('pointerdown', function (e) {
      drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId);
      if (!drawn) { drawn = true; $('#doodle-hint').classList.add('gone'); }
      dot(last);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      var p = pos(e);
      ctx.strokeStyle = eraser ? BG : color; ctx.lineWidth = eraser ? size * 4 : size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = eraser ? 1 : .92;
      ctx.beginPath(); ctx.moveTo(last.x, last.y);
      var mx = (last.x + p.x) / 2, my = (last.y + p.y) / 2;
      ctx.quadraticCurveTo(last.x, last.y, mx, my); ctx.lineTo(p.x, p.y); ctx.stroke();
      // chalky speckles
      if (!eraser && Math.random() > .55) { ctx.globalAlpha = .35; ctx.fillStyle = color; ctx.fillRect(p.x + (Math.random() - .5) * size * 1.6, p.y + (Math.random() - .5) * size * 1.6, 1.2, 1.2); }
      ctx.globalAlpha = 1; last = p;
    });
    function dot(p) { ctx.fillStyle = eraser ? BG : color; ctx.beginPath(); ctx.arc(p.x, p.y, (eraser ? size * 4 : size) / 2, 0, 7); ctx.fill(); }
    var stop = function () { drawing = false; };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
    $('#doodle-tools').addEventListener('click', function (e) {
      var sw = e.target.closest('.swatch'), tool = e.target.closest('[data-tool]');
      if (sw) { color = sw.dataset.c; eraser = false; $$('.swatch, [data-tool=eraser]').forEach(function (x) { x.classList.toggle('active', x === sw); }); }
      if (!tool) return;
      var t = tool.dataset.tool;
      if (t === 'eraser') { eraser = true; $$('.swatch, [data-tool=eraser]').forEach(function (x) { x.classList.toggle('active', x === tool); }); }
      if (t === 'clear') fill();
      if (t === 'save') { var a = document.createElement('a'); a.download = 'last-bench-doodle.png'; a.href = cv.toDataURL('image/png'); a.click(); }
    });
    $('#doodle-size').addEventListener('input', function (e) { size = Number(e.target.value); });
  }

  /* ---------- paper toss mini-game ---------- */
  function startToss() {
    var cv = $('#toss');
    if (!cv) return;
    var g = C.playground || {}, ctx = cv.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, ball, bin, wind = 0, state = 'ready', drag = null, raf = 0, score = 0, best = 0, msgT;
    try { best = Number(localStorage.getItem('pf-toss-best')) || 0; } catch (e) {}
    $('#toss-best').textContent = best;
    var cs = getComputedStyle(document.documentElement);
    function col(v, fb) { return (cs.getPropertyValue(v) || '').trim() || fb; }
    function size() { var r = cv.parentElement.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function reset(newBin) {
      ball = { x: Math.max(40, W * .14), y: H - 46, vx: 0, vy: 0, r: 13, rot: 0 };
      if (newBin || !bin) bin = { x: W * (.55 + Math.random() * .3), w: 64, h: 78 };
      wind = Math.round((Math.random() - .5) * 8) / 100;
      var wEl = $('#toss-wind'); if (wEl) wEl.textContent = L('playground', 'fan') + ' ' + (wind === 0 ? '·' : (wind > 0 ? '→ ' : '← ') + Math.abs(Math.round(wind * 100)));
      state = 'ready'; draw();
    }
    function msg(t) { var m = $('#toss-msg'); if (!m) return; m.textContent = t; m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); }
    function pick(list) { list = (list || []).filter(Boolean); return list[Math.floor(Math.random() * list.length)] || ''; }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var text = col('--text', '#eee'), muted = col('--muted', '#999'), primary = col('--primary', '#ffd60a'), sec = col('--secondary', '#ff5a5f');
      // floor
      ctx.strokeStyle = muted; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, H - 18); ctx.lineTo(W, H - 18); ctx.stroke(); ctx.setLineDash([]);
      // fan / wind arrows
      if (wind !== 0) {
        ctx.strokeStyle = muted; ctx.lineWidth = 1.5; ctx.globalAlpha = .5;
        for (var i = 0; i < 3; i++) { var y = 30 + i * 18, x0 = W / 2 - 40, x1 = W / 2 + 40, dir = wind > 0 ? 1 : -1; ctx.beginPath(); ctx.moveTo(dir > 0 ? x0 : x1, y); ctx.lineTo(dir > 0 ? x1 : x0, y); ctx.lineTo((dir > 0 ? x1 : x0) - dir * 8, y - 5); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      // bin
      var bx = bin.x, by = H - 18 - bin.h;
      ctx.fillStyle = sec; ctx.globalAlpha = .18; ctx.beginPath(); ctx.moveTo(bx - 6, by); ctx.lineTo(bx + bin.w + 6, by); ctx.lineTo(bx + bin.w - 4, H - 18); ctx.lineTo(bx + 4, H - 18); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = text; ctx.lineWidth = 2.2; ctx.stroke();
      for (var k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(bx + k * bin.w / 4, by + 8); ctx.lineTo(bx + k * bin.w / 4 + (k - 2) * 1.5, H - 24); ctx.globalAlpha = .4; ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.lineWidth = 4; ctx.strokeStyle = primary; ctx.beginPath(); ctx.moveTo(bx - 8, by); ctx.lineTo(bx + bin.w + 8, by); ctx.stroke();
      // aim
      if (drag) {
        var vx = (ball.x - drag.x) * .16, vy = (ball.y - drag.y) * .16, px = ball.x, py = ball.y;
        ctx.fillStyle = primary;
        for (var s = 0; s < 14; s++) { px += vx * 2; py += vy * 2; vy += .36 * 2 * 2 / 2; ctx.globalAlpha = 1 - s / 14; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      // paper ball
      ctx.save(); ctx.translate(ball.x, ball.y); ctx.rotate(ball.rot);
      ctx.fillStyle = '#f4f1e6'; ctx.strokeStyle = '#8c8a80'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var a = 0; a < 10; a++) { var rr = ball.r * (a % 2 ? .82 : 1.05), an = a / 10 * Math.PI * 2; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(2, 1); ctx.lineTo(5, -5); ctx.moveTo(-3, 6); ctx.lineTo(3, 3); ctx.stroke();
      ctx.restore();
    }
    function step() {
      var bx = bin.x, by = H - 18 - bin.h;
      var prevY = ball.y;
      ball.vy += .36; ball.vx += wind; ball.x += ball.vx; ball.y += ball.vy; ball.rot += ball.vx * .05;
      // rim bounce
      [[bx - 8, by], [bx + bin.w + 8, by]].forEach(function (p) {
        var dx = ball.x - p[0], dy = ball.y - p[1], d = Math.sqrt(dx * dx + dy * dy);
        if (d < ball.r + 2) { var nx = dx / d, ny = dy / d, dot = ball.vx * nx + ball.vy * ny; ball.vx -= 1.7 * dot * nx; ball.vy -= 1.7 * dot * ny; ball.x = p[0] + nx * (ball.r + 2.5); ball.y = p[1] + ny * (ball.r + 2.5); }
      });
      if (prevY < by && ball.y >= by && ball.vy > 0 && ball.x > bx - 2 && ball.x < bx + bin.w + 2) return end(true);
      if (ball.y > H - 18 - ball.r || ball.x < -40 || ball.x > W + 40) return end(false);
      draw(); raf = requestAnimationFrame(step);
    }
    function end(hit) {
      state = 'done'; draw();
      if (hit) { score++; if (score > best) { best = score; try { localStorage.setItem('pf-toss-best', best); } catch (e) {} } msg(pick(g.tossHit)); }
      else { score = 0; msg(pick(g.tossMiss)); }
      $('#toss-score').textContent = score; $('#toss-best').textContent = best;
      clearTimeout(msgT); msgT = setTimeout(function () { reset(hit); }, 900);
    }
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    cv.addEventListener('pointerdown', function (e) {
      if (state !== 'ready') return;
      var p = pos(e);
      if (Math.hypot(p.x - ball.x, p.y - ball.y) > 60) return;
      drag = p; cv.setPointerCapture(e.pointerId); draw();
    });
    cv.addEventListener('pointermove', function (e) { if (drag) { drag = pos(e); draw(); } });
    function release() {
      if (!drag) return;
      ball.vx = Math.max(-16, Math.min(16, (ball.x - drag.x) * .16)); ball.vy = Math.max(-18, Math.min(18, (ball.y - drag.y) * .16));
      drag = null;
      if (Math.abs(ball.vx) + Math.abs(ball.vy) < 1.5) { draw(); return; }
      state = 'flying'; raf = requestAnimationFrame(step);
    }
    cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', function () { drag = null; draw(); });
    size(); reset(true);
    var ro = new ResizeObserver(function () { size(); if (state !== 'flying') reset(true); }); ro.observe(cv.parentElement);
    onCleanup(function () { ro.disconnect(); cancelAnimationFrame(raf); clearTimeout(msgT); });
  }

  /* ---------- excuse generator ---------- */
  function startExcuses() {
    var btn = $('#excuse-btn');
    if (!btn) return;
    var list = ((C.playground || {}).excuses || []).filter(Boolean), last = 0;
    btn.addEventListener('click', function () {
      var i = last;
      while (list.length > 1 && i === last) i = Math.floor(Math.random() * list.length);
      last = i;
      var n = $('#excuse');
      n.classList.remove('flip'); void n.offsetWidth; n.classList.add('flip');
      setTimeout(function () { $('#excuse-text').textContent = list[i]; }, animOn() ? 180 : 0);
    });
  }

  /* ---------- count-up numbers ---------- */
  function countUp(el) {
    var raw = el.dataset.v || '';
    var m = raw.match(/^(\D*)([\d,.]+)(.*)$/);
    if (!m || !animOn()) { el.textContent = raw; return; }
    var target = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, start = performance.now(), dur = 1300;
    (function stepFn(now) {
      var k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 4), val = (target * e).toFixed(dec);
      if (m[2].indexOf(',') > -1) val = Number(val).toLocaleString('en-IN');
      el.textContent = m[1] + val + m[3];
      if (k < 1) requestAnimationFrame(stepFn);
    })(start);
  }

  /* ---------- reveal on scroll ---------- */
  function observe() {
    var els = $$('#main .reveal');
    if (!('IntersectionObserver' in window) || !animOn()) {
      els.forEach(function (e) { e.classList.add('visible'); });
      $$('#main .countup').forEach(function (e) { e.textContent = e.dataset.v; });
      return;
    }
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('visible');
        $$('.countup', en.target).forEach(countUp);
        ro.unobserve(en.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (e) {
      var sib = e.parentElement ? Array.prototype.indexOf.call(e.parentElement.children, e) : 0;
      e.style.transitionDelay = Math.min(sib, 6) * 60 + 'ms';
      ro.observe(e);
    });
    observers.push(ro);
    // hero stats are not .reveal — count them right away
    $$('.hero .countup').forEach(countUp);
  }

  /* ---------- clocks (about page wall clock + footer) ---------- */
  function startClock() {
    var tz = (C.about && C.about.timezone) || 'Asia/Kolkata';
    var fmt;
    try { fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch (e) { fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
    function tick() {
      var parts = {}; fmt.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      var h = Number(parts.hour) % 24, m = Number(parts.minute), s = Number(parts.second);
      var ft = $('#footer-time');
      if (ft) ft.textContent = (C.about && C.about.location ? C.about.location.split(',')[0] + ' · ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
      var d = $('#clock-digital'); if (d) d.textContent = pad(h) + ':' + pad(m);
      var hh = $('#wc-h'); if (hh) { hh.setAttribute('transform', 'rotate(' + ((h % 12) * 30 + m / 2) + ' 50 50)'); $('#wc-m').setAttribute('transform', 'rotate(' + (m * 6 + s / 10) + ' 50 50)'); $('#wc-s').setAttribute('transform', 'rotate(' + s * 6 + ' 50 50)'); }
    }
    tick();
    clearInterval(startClock._iv);
    startClock._iv = setInterval(tick, 1000);
  }

  /* ---------- lightbox & modal ---------- */
  var lbIndex = 0;
  function openLightbox(i) {
    var items = galleryItems();
    if (!items.length) return;
    lbIndex = (i + items.length) % items.length;
    var it = items[lbIndex], im = $('#lb-img');
    im.style.animation = 'none'; void im.offsetWidth; im.style.animation = '';
    im.src = it.image; im.alt = it.caption || '';
    $('#lb-caption').textContent = it.caption || '';
    $('#lightbox').hidden = false;
  }
  function openModal(html) { $('#modal-card').innerHTML = html; $('#modal').hidden = false; document.body.classList.add('locked'); }
  function closeModal() { $('#modal').hidden = true; document.body.classList.remove('locked'); }

  /* ---------- teacher mode (boss key) ---------- */
  var teacherOn = false, savedTitle = '';
  function toggleTeacher() {
    var t = C.teacher || {};
    if (!t.enabled) return;
    var el = $('#teacher');
    teacherOn = !teacherOn;
    if (teacherOn) {
      savedTitle = document.title;
      el.innerHTML = '<div class="t-doc"><div class="t-sub">' + esc(t.subject) + '</div><h1>' + esc(t.title) + '</h1>' + paragraphs(t.notes) + '<p class="t-foot">' + esc(t.footer) + '</p></div>';
      el.hidden = false; document.body.classList.add('locked');
      document.title = t.tabTitle || t.title || '';
      closeCmdk(); setMenu(false);
    } else {
      el.hidden = true; document.body.classList.remove('locked');
      document.title = savedTitle || document.title;
    }
  }

  /* ---------- chalk trail ---------- */
  function startChalkTrail() {
    var cv = $('#chalk-trail');
    if (!fine || !cv) return;
    var ctx = cv.getContext('2d'), pts = [], raf = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size(); window.addEventListener('resize', size);
    function frame() {
      raf = 0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      var now = performance.now();
      pts = pts.filter(function (p) { return now - p.t < 420; });
      if (pts.length > 1) {
        var light = document.documentElement.dataset.theme === 'light';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (var i = 1; i < pts.length; i++) {
          var a = 1 - (now - pts[i].t) / 420;
          ctx.strokeStyle = light ? 'rgba(40,40,50,' + a * .35 + ')' : 'rgba(242,239,230,' + a * .4 + ')';
          ctx.lineWidth = 2.6 * a + .4;
          ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
        }
      }
      if (pts.length) raf = requestAnimationFrame(frame);
    }
    window.addEventListener('pointermove', function (e) {
      if (!C || !C.theme.chalkTrail || !animOn() || e.pointerType !== 'mouse' || teacherOn) return;
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (pts.length > 40) pts.shift();
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
  }

  /* ---------- command palette ---------- */
  var cmdItems = [], cmdSel = 0;
  function buildCommands() {
    var list = [];
    pageList().forEach(function (p) {
      list.push({ group: L('cmdk', 'pages'), label: (p.emoji ? p.emoji + '  ' : '') + p.label, icon: 'arrow-right', hint: pathFor(p.id), run: function () { navigate(pathFor(p.id)); } });
    });
    var c = C.contact || {}, A = L('cmdk', 'actions');
    if (c.email) {
      list.push({ group: A, label: L('cmdk', 'copyEmail'), icon: 'copy', hint: c.email, run: function () { copy(c.email, L('general', 'emailCopied')); } });
      list.push({ group: A, label: L('cmdk', 'sendEmail'), icon: 'mail', run: function () { location.href = 'mailto:' + c.email; } });
    }
    if (C.theme.allowVisitorToggle) list.push({ group: A, label: L('cmdk', 'toggleTheme'), icon: 'moon-star', run: toggleTheme });
    if (C.teacher && C.teacher.enabled) list.push({ group: A, label: L('cmdk', 'teacherMode'), icon: 'glasses', hint: (C.teacher.hotkey || 't').toUpperCase(), run: toggleTeacher });
    if (C.about && C.about.resumeLink) list.push({ group: A, label: L('cmdk', 'downloadCv'), icon: 'download', run: function () { window.open(C.about.resumeLink, '_blank', 'noopener'); } });
    if (C.home && C.home.terminalEnabled) list.push({ group: A, label: L('cmdk', 'openTerminal'), icon: 'terminal', run: function () {
      var goT = function () { var t = $('#terminal'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { var i = $('#term-input'); if (i && !$('#term-input-row').hidden) i.focus({ preventScroll: true }); }, 700); } };
      if (currentId !== 'home') { navigate('/'); setTimeout(goT, 450); } else goT();
    } });
    (C.socials || []).filter(function (s) { return s.url; }).forEach(function (s) {
      list.push({ group: L('cmdk', 'socials'), label: s.label || s.platform, svg: I.social(s.platform), hint: 'open ↗', run: function () { window.open(s.url, '_blank', 'noopener'); } });
    });
    return list;
  }
  function openCmdk() {
    if (!C.site.commandPalette || teacherOn) return;
    cmdItems = buildCommands(); cmdSel = 0;
    $('#cmdk').hidden = false;
    var inp = $('#cmdk-input'); inp.value = ''; drawCmdk(); setTimeout(function () { inp.focus(); }, 10);
  }
  function closeCmdk() { $('#cmdk').hidden = true; }
  function filteredCmds() { var q = $('#cmdk-input').value.trim().toLowerCase(); return cmdItems.filter(function (c) { return !q || (c.label + ' ' + c.group + ' ' + (c.hint || '')).toLowerCase().indexOf(q) > -1; }); }
  function drawCmdk() {
    var list = filteredCmds(), box = $('#cmdk-list'), html = '', lastGroup = '';
    if (cmdSel >= list.length) cmdSel = 0;
    if (!list.length) { box.innerHTML = '<div class="cmdk-empty">' + esc(L('cmdk', 'empty')) + '</div>'; return; }
    list.forEach(function (c, i) {
      if (c.group !== lastGroup) { html += '<div class="cmdk-group">' + esc(c.group) + '</div>'; lastGroup = c.group; }
      html += '<button class="cmdk-item' + (i === cmdSel ? ' sel' : '') + '" data-i="' + i + '" role="option">' + (c.svg || I.ui(c.icon)) + '<span>' + esc(c.label) + '</span>' + (c.hint ? '<span class="hint">' + esc(c.hint) + '</span>' : '') + '</button>';
    });
    box.innerHTML = html;
    var sel = box.querySelector('.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function runCmd(i) { var c = filteredCmds()[i]; if (!c) return; closeCmdk(); setTimeout(c.run, 50); }

  /* ---------- boot screen ---------- */
  function boot() {
    var root = document.documentElement;
    if (!root.classList.contains('is-booting')) return;
    var lines = ((C.site && C.site.preloaderLines) || []).filter(Boolean);
    var box = $('#boot-lines'), bar = $('#boot-bar'), i = 0, done = false;
    function end() {
      if (done) return; done = true;
      bar.style.width = '100%';
      try { sessionStorage.setItem('pf-booted', '1'); } catch (e) {}
      setTimeout(function () { $('#boot').classList.add('done'); root.classList.remove('is-booting'); }, 200);
    }
    $('#boot-skip').addEventListener('click', end);
    (function next() {
      if (done) return;
      if (i >= lines.length) { setTimeout(end, 250); return; }
      var d = document.createElement('div'); d.textContent = lines[i]; box.appendChild(d);
      i++; bar.style.width = Math.round(i / lines.length * 100) + '%';
      setTimeout(next, 200 + Math.random() * 120);
    })();
    setTimeout(end, 4000);
  }

  /* ---------- mobile menu ---------- */
  function setMenu(open) {
    var mm = $('#mobile-menu'), btn = $('#menu-btn');
    if (!mm) return;
    mm.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    document.body.classList.toggle('locked', open);
    btn.setAttribute('aria-expanded', open);
    btn.innerHTML = I.ui(open ? 'x' : 'menu');
  }

  /* ============================== global bindings ============================== */
  function bindStatic() {
    var nav = $('#nav'), toTop = $('#to-top'), prog = $('#scroll-progress');
    var lastY = 0, ticking = false;
    function onScroll() {
      var y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight, k = max > 0 ? y / max : 0;
      nav.classList.toggle('scrolled', y > 20);
      nav.classList.toggle('hide', y > 400 && y > lastY + 4);
      if (y < lastY - 4 || y < 400) nav.classList.remove('hide');
      lastY = y;
      prog.style.transform = 'scaleX(' + k + ')';
      toTop.classList.toggle('show', y > 700);
      var ring = $('#top-ring'); if (ring) ring.style.strokeDashoffset = 150.8 * (1 - k);
      ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
    toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: animOn() ? 'smooth' : 'auto' }); });

    // instant page links
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-link]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
      e.preventDefault();
      navigate(a.getAttribute('href'));
    });
    window.addEventListener('popstate', function () { transition(function () { renderPage(); }); });

    $('#menu-btn').innerHTML = I.ui('menu');
    $('#menu-btn').addEventListener('click', function () { setMenu($('#mobile-menu').hidden); });
    $('#mobile-menu').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mm]'); if (!b) return;
      setMenu(false);
      if (b.dataset.mm === 'teacher') setTimeout(toggleTeacher, 120); else toggleTheme();
    });
    $('#theme-toggle').addEventListener('click', toggleTheme);
    $('#teacher-btn').addEventListener('click', toggleTeacher);
    $('#teacher').addEventListener('click', function () { if (teacherOn) toggleTeacher(); });

    // lightbox
    $('#lb-close').innerHTML = I.ui('x'); $('#lb-prev').innerHTML = I.ui('chevron-left'); $('#lb-next').innerHTML = I.ui('chevron-right');
    var lb = $('#lightbox');
    $('#lb-close').addEventListener('click', function () { lb.hidden = true; });
    $('#lb-prev').addEventListener('click', function () { openLightbox(lbIndex - 1); });
    $('#lb-next').addEventListener('click', function () { openLightbox(lbIndex + 1); });
    // swipe left / right (and down to close) on touch screens
    var sw = null;
    lb.addEventListener('touchstart', function (e) { if (e.touches.length === 1) sw = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (!sw) return;
      var t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y; sw = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) openLightbox(lbIndex + (dx < 0 ? 1 : -1));
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.3) lb.hidden = true;
    }, { passive: true });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.tagName === 'FIGURE') lb.hidden = true; });
    $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); else if (e.target.closest('a[data-link]')) closeModal(); });

    // command palette
    $('#cmdk-ic').innerHTML = I.ui('search');
    $('#cmdk-btn').addEventListener('click', openCmdk);
    document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-cmdk]'); if (a) { e.preventDefault(); openCmdk(); } });
    $('#cmdk').addEventListener('click', function (e) { if (e.target.id === 'cmdk') closeCmdk(); var it = e.target.closest('.cmdk-item'); if (it) runCmd(Number(it.dataset.i)); });
    $('#cmdk-input').addEventListener('input', function () { cmdSel = 0; drawCmdk(); });
    $('#cmdk-input').addEventListener('keydown', function (e) {
      var n = filteredCmds().length;
      if (e.key === 'ArrowDown') { cmdSel = (cmdSel + 1) % Math.max(n, 1); drawCmdk(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cmdSel = (cmdSel - 1 + n) % Math.max(n, 1); drawCmdk(); e.preventDefault(); }
      else if (e.key === 'Enter') { runCmd(cmdSel); e.preventDefault(); }
    });

    document.addEventListener('keydown', function (e) {
      var typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName);
      var hot = ((C && C.teacher && C.teacher.hotkey) || 't').toLowerCase();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#cmdk').hidden ? openCmdk() : closeCmdk(); }
      else if (e.key === 'Escape') { if (teacherOn) toggleTeacher(); closeCmdk(); lb.hidden = true; closeModal(); setMenu(false); }
      else if (typing) return;
      else if (e.key === '/' && $('#cmdk').hidden) { e.preventDefault(); openCmdk(); }
      else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === hot && $('#cmdk').hidden) toggleTeacher();
      else if (!lb.hidden && e.key === 'ArrowRight') openLightbox(lbIndex + 1);
      else if (!lb.hidden && e.key === 'ArrowLeft') openLightbox(lbIndex - 1);
    });

    // tilt + magnetic buttons (desktop only)
    if (fine) {
      document.addEventListener('pointermove', function (e) {
        if (!C || !animOn() || !e.target.closest) return;
        var tilt = C.theme.tiltCards && e.target.closest('.tilt');
        if (tilt) {
          var r = tilt.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
          tilt.style.transform = 'perspective(1000px) rotateX(' + (-py * 5) + 'deg) rotateY(' + (px * 6) + 'deg) translateY(-4px)';
          tilt._t = true;
        }
        var mag = C.theme.magneticButtons && e.target.closest('.magnetic');
        if (mag) {
          var b = mag.getBoundingClientRect();
          mag.style.transform = 'translate(' + ((e.clientX - b.left - b.width / 2) * .2) + 'px,' + ((e.clientY - b.top - b.height / 2) * .3) + 'px)';
          mag._m = true;
        }
      }, { passive: true });
      document.addEventListener('pointerout', function (e) {
        if (!e.target.closest) return;
        var t = e.target.closest('.tilt');
        if (t && t._t && !t.contains(e.relatedTarget)) { t.style.transform = ''; t._t = false; }
        var m = e.target.closest('.magnetic');
        if (m && m._m && !m.contains(e.relatedTarget)) { m.style.transform = ''; m._m = false; }
      });
    }

    // live preview from the admin panel (same origin only)
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'pf-preview') return;
      var y = window.scrollY;
      C = e.data.content;
      applyTheme(C.theme || {});
      renderChrome();
      var want = e.data.page && pageById(e.data.page) ? pathFor(e.data.page) : null;
      var changing = want && want !== location.pathname;
      if (changing) history.replaceState({}, '', want);
      renderPage(true);
      $$('.reveal').forEach(function (el) { el.classList.add('visible'); });
      $$('.countup').forEach(function (el) { el.textContent = el.dataset.v; });
      window.scrollTo(0, changing ? 0 : y);
    });
  }

  /* ============================== start ============================== */
  function start(content) {
    C = content;
    applyTheme(C.theme || {});
    renderChrome();
    renderPage(true);
    startClock();
    startChalkTrail();
    boot();
  }
  bindStatic();
  if (window.__CONTENT__) start(window.__CONTENT__);
  else fetch('/api/content').then(function (r) { return r.json(); }).then(start);
})();
