/* =====================================================================
   aarav.exe — portfolio front-end
   Everything is rendered from the content JSON managed in /admin.
   ===================================================================== */
(function () {
  'use strict';
  var I = window.Icons;
  var C = null;
  var cleanups = [];
  var observers = [];
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var inFrame = window.self !== window.top;

  /* ============================== helpers ============================== */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function url(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(javascript|data|vbscript):/i.test(u.replace(/\s/g, ''))) return '#';
    return esc(u);
  }
  function isExternal(u) { return /^https?:\/\//i.test(u || ''); }
  function linkAttrs(u) { return 'href="' + url(u) + '"' + (isExternal(u) ? ' target="_blank" rel="noopener noreferrer"' : ''); }
  function paragraphs(text) {
    return String(text || '').split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function initials(name) { return esc(String(name || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase()); }
  function hexOk(v, fb) { return /^#([0-9a-f]{3,8})$/i.test(v || '') ? v : fb; }
  function fontName(f, fb) { return String(f || fb).replace(/[^\w\s-]/g, ''); }
  function animOn() { return C.theme.animations !== false && !reduced; }
  function split(text) {
    // wraps each word so headings can slide up word-by-word
    return String(text || '').split(/\s+/).filter(Boolean).map(function (w, i) {
      return '<span class="split-line" style="display:inline-block"><span style="transition-delay:' + (i * 60) + 'ms">' + esc(w) + '</span></span>';
    }).join(' ');
  }
  function sectionLabel(id) { var s = (C.sections || []).find(function (x) { return x.id === id; }); return s ? s.label : id; }
  function sectionIndex(id) {
    var list = (C.sections || []).filter(function (x) { return x.enabled && x.id !== 'hero' && R[x.id]; });
    var i = list.findIndex(function (x) { return x.id === id; });
    return String(i + 1).padStart(2, '0');
  }
  function head(id, sec) {
    return '<div class="section-head reveal">' +
      '<span class="eyebrow">' + sectionIndex(id) + ' — ' + esc(sectionLabel(id)) + '</span>' +
      '<h2>' + split(sec.heading) + '</h2>' +
      (sec.subheading ? '<p>' + esc(sec.subheading) + '</p>' : '') + '</div>';
  }
  function socialLinks(list) {
    return (list || []).filter(function (s) { return s.url; }).map(function (s) {
      return '<a ' + linkAttrs(s.url) + ' aria-label="' + esc(s.label || s.platform) + '" title="' + esc(s.label || s.platform) + '">' + I.social(s.platform) + '</a>';
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
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg || 'Copied!'); }).catch(function () {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(msg || 'Copied!'); } catch (e) {} ta.remove();
    });
  }
  function onCleanup(fn) { cleanups.push(fn); }

  /* ============================== theme ============================== */
  function applyTheme(t) {
    var css = ':root,[data-theme="dark"]{' +
      '--primary:' + hexOk(t.primary, '#ff2d55') + ';--secondary:' + hexOk(t.secondary, '#8b5cf6') + ';--accent:' + hexOk(t.accent, '#ff7a45') + ';' +
      '--bg:' + hexOk(t.background, '#050507') + ';--surface:' + hexOk(t.surface, '#0e0e13') + ';--text:' + hexOk(t.text, '#f4f4f6') + ';--muted:' + hexOk(t.muted, '#8d8d9b') + ';}' +
      '[data-theme="light"]{--bg:' + hexOk(t.lightBackground, '#f6f5f8') + ';--surface:' + hexOk(t.lightSurface, '#ffffff') + ';--text:' + hexOk(t.lightText, '#121218') + ';--muted:' + hexOk(t.lightMuted, '#5f5f6e') + ';}' +
      ':root{--radius:' + (Number(t.radius) >= 0 ? Number(t.radius) : 20) + 'px;' +
      "--font-heading:'" + fontName(t.fontHeading, 'Space Grotesk') + "',system-ui,sans-serif;" +
      "--font-body:'" + fontName(t.fontBody, 'Inter') + "',system-ui,sans-serif;" +
      "--font-mono:'" + fontName(t.fontMono, 'JetBrains Mono') + "',ui-monospace,monospace;}";
    var el = $('#theme-vars');
    if (!el) { el = document.createElement('style'); el.id = 'theme-vars'; document.head.appendChild(el); }
    el.textContent = css;

    var fams = [t.fontHeading || 'Space Grotesk', t.fontBody || 'Inter', t.fontMono || 'JetBrains Mono'].filter(function (v, i, a) { return a.indexOf(v) === i; });
    var href = 'https://fonts.googleapis.com/css2?' + fams.map(function (f) { return 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;500;600;700'; }).join('&') + '&display=swap';
    var link = $('#font-link');
    if (link && link.getAttribute('href') !== href) link.setAttribute('href', href);

    var b = document.body.classList;
    b.toggle('anim', t.animations !== false);
    b.toggle('no-anim', t.animations === false);
    b.toggle('no-glow', !t.cursorGlow);
    b.toggle('no-grid', !t.backgroundGrid);
    b.toggle('no-grain', !t.grain);
    b.toggle('no-progress', !t.scrollProgress);
    b.toggle('has-cursor', !!t.customCursor && fine);

    var saved = null;
    try { saved = localStorage.getItem('pf-theme'); } catch (e) {}
    document.documentElement.dataset.theme = (t.allowVisitorToggle && saved) ? saved : (t.mode === 'light' ? 'light' : 'dark');
    $('#theme-toggle').hidden = !t.allowVisitorToggle;
    updateThemeIcon();
  }
  function updateThemeIcon() { $('#theme-toggle').innerHTML = I.ui(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun'); }
  function toggleTheme() {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pf-theme', next); } catch (e) {}
    updateThemeIcon();
  }

  /* ============================== sections ============================== */
  var R = {};

  R.hero = function (h) {
    var roles = (h.roles || []).filter(Boolean);
    var bg = h.backgroundImage ? ' has-bg" style="background-image:url(\'' + url(h.backgroundImage) + '\')' : '';
    var name = esc(h.name || '');
    var stats = (h.stats || []).filter(function (s) { return s.value; });
    var visual = h.visual === 'photo'
      ? '<div class="hero-photo reveal">' + (h.avatar ? '<img src="' + url(h.avatar) + '" alt="' + name + '" />' : '<div class="placeholder-media" style="border-radius:inherit">' + initials(h.name) + '</div>') +
          (roles[0] ? '<div class="float-chip chip-1">' + I.ui('code') + esc(roles[0]) + '</div>' : '') +
          (roles[1] ? '<div class="float-chip chip-2">' + I.ui('sparkles') + esc(roles[1]) + '</div>' : '') + '</div>'
      : h.visual === 'none' ? ''
      : '<div class="terminal reveal" id="terminal">' +
          '<div class="term-bar"><i></i><i></i><i></i><span>' + esc(h.terminalTitle || 'terminal') + '</span></div>' +
          '<div class="term-body" id="term-body"><div id="term-out"></div>' +
            '<div class="term-input-row" id="term-input-row" hidden><span class="term-prompt">' + promptHTML() + '</span><input id="term-input" type="text" aria-label="Terminal input" autocomplete="off" autocapitalize="off" spellcheck="false" /></div>' +
            '<div class="term-hint" id="term-hint" hidden>type <b>help</b> and press enter ↵</div>' +
          '</div></div>';
    return '<section id="hero" class="hero' + bg + '">' +
      (C.theme.heroEffect && C.theme.heroEffect !== 'none' ? '<canvas id="hero-canvas" aria-hidden="true"></canvas>' : '') +
      '<div class="container">' +
        '<div class="hero-text">' +
          (h.availableBadge ? '<div class="badge-available reveal"><span class="pulse"></span>' + esc(h.availableText) + '</div>' : '') +
          '<p class="greeting reveal"><b>&gt;</b> ' + esc(h.greeting) + '</p>' +
          '<h1 class="reveal"><span class="glitch" id="hero-name" data-text="' + name + '">' + name + '</span><span class="dot">.</span></h1>' +
          (roles.length ? '<div class="role reveal"><span class="typed" id="typed">' + esc(roles[0]) + '</span><span class="caret"></span></div>' : '') +
          '<p class="tagline reveal">' + esc(h.tagline) + '</p>' +
          '<div class="ctas reveal">' +
            (h.primaryButtonText ? '<a class="btn btn-primary magnetic" ' + linkAttrs(h.primaryButtonLink) + '>' + esc(h.primaryButtonText) + I.ui('arrow-right', 'icon icon-arrow') + '</a>' : '') +
            (h.secondaryButtonText ? '<a class="btn btn-ghost magnetic" ' + linkAttrs(h.secondaryButtonLink) + '>' + esc(h.secondaryButtonText) + '</a>' : '') +
          '</div>' +
          '<div class="hero-bottom reveal">' +
            (stats.length ? '<div class="hero-stats">' + stats.map(function (s) { return '<div><strong class="countup" data-v="' + esc(s.value) + '">' + esc(s.value) + '</strong><span>' + esc(s.label) + '</span></div>'; }).join('') + '</div>' : '') +
            (stats.length && h.showSocials ? '<span class="hero-sep"></span>' : '') +
            (h.showSocials ? '<div class="socials">' + socialLinks(C.socials) + '</div>' : '') +
          '</div>' +
        '</div>' +
        (visual ? '<div class="hero-visual">' + visual + '</div>' : '') +
      '</div>' +
      '<a href="#' + nextSectionId('hero') + '" class="scroll-hint" aria-label="Scroll down">scroll<i></i></a>' +
    '</section>' + renderMarquee();
  };
  function promptHTML() { return '<b>' + esc(String(C.site.logoText || 'user').toLowerCase()) + '</b>@exe:~$'; }
  function nextSectionId(id) {
    var list = (C.sections || []).filter(function (x) { return x.enabled && R[x.id]; });
    var i = list.findIndex(function (x) { return x.id === id; });
    return list[i + 1] ? list[i + 1].id : id;
  }

  function renderMarquee() {
    var m = C.marquee;
    if (!m || !m.enabled || !(m.items || []).length) return '';
    var item = function (x) { return '<span class="mq-item">' + (x.icon && I.has(x.icon) ? I.brand(x.icon) : I.ui('code')) + esc(x.name) + '</span>'; };
    var row = m.items.map(item).join('');
    var half = Math.ceil(m.items.length / 2);
    var row2 = m.items.slice(half).concat(m.items.slice(0, half)).map(item).join('');
    return '<div class="marquee" aria-label="Tech stack">' +
      '<div class="marquee-track">' + row + row + '</div>' +
      '<div class="marquee-track rev">' + row2 + row2 + '</div></div>';
  }

  R.about = function (a) {
    var interests = (a.interests || []);
    var now = (a.currently || []);
    var stats = (a.stats || []);
    return '<section id="about"><div class="container">' + head('about', a) +
      '<div class="bento">' +
        (a.photo ? '<div class="card b-photo reveal"><img src="' + url(a.photo) + '" alt="' + esc(C.hero.name) + '" loading="lazy" /><div class="ph-tag">' + I.ui('map-pin') + esc(a.location || '') + '</div></div>' : '') +
        '<div class="card spot b-bio reveal"' + (a.photo ? '' : ' style="grid-column:span 3"') + '>' +
          '<div class="b-label">' + I.ui('user-round') + 'about me</div>' +
          '<div class="bio">' + paragraphs(a.bio) + '</div>' +
          '<div style="display:flex;gap:.7rem;flex-wrap:wrap;margin-top:auto">' +
            (a.resumeLink ? '<a class="btn btn-primary btn-sm magnetic" ' + linkAttrs(a.resumeLink) + ' download>' + I.ui('download') + esc(a.resumeText || 'Download CV') + '</a>' : '') +
            '<a class="btn btn-ghost btn-sm magnetic" href="#contact">' + I.ui('send') + 'Get in touch</a>' +
          '</div>' +
        '</div>' +
        '<div class="card spot b-loc reveal"><div class="b-label">' + I.ui('clock') + 'local time</div><div class="time" id="local-time">--:--</div><div class="place">' + esc(a.location || '') + '</div><span class="globe"></span></div>' +
        (a.quote ? '<div class="card b-quote reveal">' + I.ui('quote') + '<blockquote>' + esc(a.quote) + '</blockquote></div>' : '') +
        (now.length ? '<div class="card spot b-now reveal"><div class="b-label">' + I.ui('activity') + 'currently</div><div class="now-list">' +
          now.map(function (n) { return '<div class="now-row"><span>' + esc(n.label) + '</span><div>' + esc(n.value) + '</div></div>'; }).join('') + '</div></div>' : '') +
        (interests.length ? '<div class="card spot b-interests reveal"><div class="b-label">' + I.ui('heart') + 'what drives me</div><div class="interest-grid">' +
          interests.map(function (x) { return '<div class="interest"><div class="em">' + esc(x.emoji) + '</div><strong>' + esc(x.title) + '</strong><p>' + esc(x.text) + '</p></div>'; }).join('') + '</div></div>' : '') +
        (stats.length ? '<div class="card b-stats reveal">' + stats.map(function (s) {
          return '<div class="stat"><strong class="grad-text countup" data-v="' + esc(s.value) + '">' + esc(s.value) + '</strong><span>' + esc(s.label) + '</span></div>';
        }).join('') + '</div>' : '') +
      '</div></div></section>';
  };

  R.services = function (s) {
    var items = s.items || [];
    return '<section id="services"><div class="container">' + head('services', s) +
      (items.length ? '<div class="services-grid">' + items.map(function (it, i) {
        return '<article class="card spot service reveal"><div class="s-top"><span class="s-ic">' + I.ui(it.icon || 'sparkles') + '</span><span class="s-num">/' + String(i + 1).padStart(2, '0') + '</span></div>' +
          '<h3>' + esc(it.title) + '</h3><p>' + esc(it.description) + '</p></article>';
      }).join('') + '</div>' : '<p class="empty-note">No services yet.</p>') +
    '</div></section>';
  };

  R.skills = function (s) {
    var groups = {}, order = [];
    (s.items || []).forEach(function (k) {
      var cat = k.category || 'Skills';
      if (!groups[cat]) { groups[cat] = []; order.push(cat); }
      groups[cat].push(k);
    });
    var icons = ['layers', 'server', 'terminal', 'sparkles', 'package', 'globe'];
    return '<section id="skills"><div class="container">' + head('skills', s) +
      (order.length ? '<div class="skill-groups">' + order.map(function (cat, i) {
        return '<div class="card spot skill-group reveal"><h3>' + I.ui(icons[i % icons.length]) + esc(cat) + '<small>' + groups[cat].length + ' skills</small></h3>' +
          groups[cat].map(function (k) {
            var lvl = Math.max(0, Math.min(100, Number(k.level) || 0));
            return '<div class="skill"><div class="skill-top"><span>' + esc(k.name) + '</span><span>' + lvl + '%</span></div><div class="bar"><i style="--w:' + lvl + '%"></i></div></div>';
          }).join('') + '</div>';
      }).join('') + '</div>' : '<p class="empty-note">No skills added yet.</p>') +
    '</div></section>';
  };

  R.projects = function (p) {
    var items = p.items || [];
    var tags = [];
    items.forEach(function (it) { (it.tags || []).forEach(function (t) { if (t && tags.indexOf(t) === -1) tags.push(t); }); });
    return '<section id="projects"><div class="container">' + head('projects', p) +
      (tags.length > 1 ? '<div class="filters reveal" id="project-filters"><button class="filter active" data-f="*">All work</button>' +
        tags.map(function (t) { return '<button class="filter" data-f="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '') +
      (items.length ? '<div class="projects-grid" id="projects-grid">' + items.map(function (it, i) {
        var main = it.liveUrl || it.codeUrl;
        return '<article class="card spot project tilt reveal' + (it.featured ? ' featured' : '') + '" data-tags="' + esc(JSON.stringify(it.tags || [])) + '">' +
          '<div class="project-media">' + (it.image ? '<img src="' + url(it.image) + '" alt="' + esc(it.title) + '" loading="lazy" />' : '<div class="placeholder-media">' + initials(it.title) + '</div>') +
            (it.featured ? '<span class="feat-badge">' + I.ui('star') + 'Featured</span>' : '') +
            (main ? '<a class="project-open" ' + linkAttrs(main) + ' aria-label="Open ' + esc(it.title) + '">' + I.ui('arrow-up-right') + '</a>' : '') + '</div>' +
          '<div class="project-body"><div class="project-meta"><span>' + String(i + 1).padStart(2, '0') + ' / ' + String(items.length).padStart(2, '0') + '</span><span>' + esc(it.year || '') + '</span></div>' +
            '<h3>' + esc(it.title) + '</h3><p>' + esc(it.description) + '</p>' +
            '<div class="tags">' + (it.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
            '<div class="project-links">' +
              (it.liveUrl ? '<a class="btn btn-primary btn-sm" ' + linkAttrs(it.liveUrl) + '>' + I.ui('external-link') + 'Live demo</a>' : '') +
              (it.codeUrl ? '<a class="btn btn-ghost btn-sm" ' + linkAttrs(it.codeUrl) + '>' + I.brand('github') + 'Source</a>' : '') +
            '</div></div></article>';
      }).join('') + '</div>' : '<p class="empty-note">Projects coming soon.</p>') +
    '</div></section>';
  };

  R.products = function (p) {
    var items = p.items || [];
    return '<section id="products"><div class="container">' + head('products', p) +
      (items.length ? '<div class="products-grid">' + items.map(function (it) {
        var feats = (it.features || []).filter(Boolean);
        return '<article class="card spot product reveal">' +
          '<div class="product-media">' + (it.image ? '<img src="' + url(it.image) + '" alt="' + esc(it.name) + '" loading="lazy" />' : '<div class="placeholder-media">' + I.ui('shopping-bag') + '</div>') +
            (it.badge ? '<span class="product-badge">' + esc(it.badge) + '</span>' : '') + '</div>' +
          '<div class="product-body"><h3>' + esc(it.name) + '</h3><p>' + esc(it.description) + '</p>' +
            (feats.length ? '<ul class="features">' + feats.map(function (f) { return '<li>' + I.ui('check') + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
            '<div class="product-foot"><span class="price">' + esc(it.price) + '</span>' +
              (it.link ? '<a class="btn btn-primary btn-sm" ' + linkAttrs(it.link) + '>' + esc(it.buttonText || 'Buy') + I.ui('arrow-right', 'icon icon-arrow') + '</a>' : '') +
            '</div></div></article>';
      }).join('') + '</div>' : '<p class="empty-note">Products coming soon.</p>') +
    '</div></section>';
  };

  R.experience = function (e) {
    var items = e.items || [];
    return '<section id="experience"><div class="container">' + head('experience', e) +
      '<div class="timeline" id="timeline"><span class="t-progress" id="t-progress"></span>' + items.map(function (it) {
        return '<div class="t-item reveal"><span class="t-dot"></span><div class="card spot t-card">' +
          '<span class="t-period">' + esc(it.period) + '</span><h3>' + esc(it.role) + '</h3>' +
          (it.company ? '<span class="t-company">' + esc(it.company) + '</span>' : '') +
          (it.description ? '<p>' + esc(it.description) + '</p>' : '') + '</div></div>';
      }).join('') + '</div></div></section>';
  };

  R.gallery = function (g) {
    var items = (g.items || []).filter(function (x) { return x.image; });
    return '<section id="gallery"><div class="container">' + head('gallery', g) +
      (items.length ? '<div class="gallery-grid">' + items.map(function (it, i) {
        return '<button class="g-item reveal" data-i="' + i + '" aria-label="' + esc(it.caption || 'Open image') + '"><img src="' + url(it.image) + '" alt="' + esc(it.caption || 'Gallery image') + '" loading="lazy" />' +
          '<span class="g-zoom">' + I.ui(it.link ? 'arrow-up-right' : 'zoom-in') + '</span>' +
          (it.caption ? '<span class="g-cap">' + esc(it.caption) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '<p class="empty-note">No photos yet.</p>') +
      (g.instagramUrl ? '<div class="insta-cta reveal"><a class="btn btn-ghost magnetic" ' + linkAttrs(g.instagramUrl) + '>' + I.brand('instagram') + 'Follow ' + esc(g.instagramHandle || 'on Instagram') + '</a></div>' : '') +
    '</div></section>';
  };

  R.testimonials = function (t) {
    var items = t.items || [];
    if (!items.length) return '';
    return '<section id="testimonials"><div class="container">' + head('testimonials', t) +
      '<div class="testi-grid">' + items.map(function (it) {
        return '<figure class="card spot testi reveal">' + I.ui('quote') + '<blockquote>' + esc(it.quote) + '</blockquote>' +
          '<figcaption class="testi-who">' + (it.avatar ? '<img src="' + url(it.avatar) + '" alt="" loading="lazy" />' : '<span class="ph">' + initials(it.name) + '</span>') +
          '<div><strong>' + esc(it.name) + '</strong><span>' + esc(it.role) + '</span></div></figcaption></figure>';
      }).join('') + '</div></div></section>';
  };

  R.contact = function (c) {
    var info = [];
    if (c.email) info.push(['mail', 'Email', c.email, 'mailto:' + c.email]);
    if (c.phone) info.push(['phone', 'Phone', c.phone, 'tel:' + c.phone.replace(/[^\d+]/g, '')]);
    if (c.whatsapp) info.push([null, 'WhatsApp', '+' + c.whatsapp.replace(/\D/g, ''), 'https://wa.me/' + c.whatsapp.replace(/\D/g, '')]);
    if (c.location) info.push(['map-pin', 'Based in', c.location, '']);
    return '<section id="contact"><div class="container">' +
      '<div class="contact-hero reveal"><span class="eyebrow">' + sectionIndex('contact') + ' — ' + esc(sectionLabel('contact')) + '</span>' +
        '<h2>' + split(c.heading) + '</h2>' + (c.subheading ? '<p>' + esc(c.subheading) + '</p>' : '') +
        (c.email ? '<div><div class="email-big"><a href="mailto:' + url(c.email) + '">' + esc(c.email) + '</a><button type="button" id="copy-email" aria-label="Copy email">' + I.ui('copy') + '</button></div></div>' : '') +
      '</div>' +
      '<div class="contact-grid"' + (c.formEnabled ? '' : ' style="grid-template-columns:1fr;max-width:640px;margin:auto"') + '>' +
        '<div class="contact-info">' + info.map(function (x) {
          var icon = x[0] ? I.ui(x[0]) : I.brand('whatsapp');
          var inner = '<span class="info-icon">' + icon + '</span><div><small>' + x[1] + '</small><strong>' + esc(x[2]) + '</strong></div>' + (x[3] ? '<span class="go">' + I.ui('arrow-right') + '</span>' : '');
          return x[3] ? '<a class="card spot info-item reveal" ' + linkAttrs(x[3]) + '>' + inner + '</a>' : '<div class="card spot info-item reveal">' + inner + '</div>';
        }).join('') +
        ((C.socials || []).length ? '<div class="card info-item reveal" style="flex-direction:column;align-items:flex-start;gap:.9rem"><small style="font-family:var(--font-mono);font-size:.76rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Find me on</small><div class="socials">' + socialLinks(C.socials) + '</div></div>' : '') +
        '</div>' +
        (c.formEnabled ? '<form class="card spot contact-form reveal" id="contact-form" novalidate>' +
          '<h3 class="full">Send a message</h3>' +
          '<div class="field"><label for="cf-name">Name</label><input id="cf-name" name="name" required maxlength="100" placeholder="Your name" autocomplete="name" /></div>' +
          '<div class="field"><label for="cf-email">Email</label><input id="cf-email" name="email" type="email" required maxlength="200" placeholder="you@email.com" autocomplete="email" /></div>' +
          '<div class="field full"><label for="cf-subject">Subject</label><input id="cf-subject" name="subject" maxlength="200" placeholder="Website, bot, collab, or just hi 👋" /></div>' +
          '<div class="field full"><label for="cf-msg">Message</label><textarea id="cf-msg" name="message" rows="6" required maxlength="5000" placeholder="Tell me about your idea…"></textarea></div>' +
          '<div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off" /></div>' +
          '<div class="full" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap"><button class="btn btn-primary magnetic" type="submit">Send message' + I.ui('send') + '</button><span class="form-status" id="form-status" role="status"></span></div>' +
        '</form>' : '') +
      '</div></div></section>';
  };

  /* ============================== render ============================== */
  function render(content) {
    cleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
    cleanups = [];
    observers.forEach(function (o) { o.disconnect(); });
    observers = [];

    C = content;
    var s = C.site || {};
    applyTheme(C.theme || {});
    document.title = s.title || '';
    if (s.favicon) $('#favicon').href = s.favicon;

    var logo = s.logoImage
      ? '<img src="' + url(s.logoImage) + '" alt="' + esc(s.logoText || 'Logo') + '" />'
      : '<span class="lg-mark">' + esc(String(s.logoText || 'A').charAt(0).toUpperCase()) + '</span>' + esc(s.logoText) + '<span class="lg-ext">' + esc(s.logoSuffix || '') + '</span>';
    $('#logo').innerHTML = logo;
    $('#footer-logo').innerHTML = logo;
    $('#footer-text').textContent = s.footerText || '';
    $('#footer-big').textContent = s.footerBigText || '';
    $('#copyright').textContent = '© ' + new Date().getFullYear() + ' ' + ((C.hero && C.hero.name) || '') + ' — All rights reserved.';
    $('#admin-link').hidden = !s.showAdminLink;
    $('#cmdk-btn').hidden = !s.commandPalette;
    $('#cmdk-btn').innerHTML = I.ui('search') + '<span class="kb-label">Search</span><kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl') + ' K</kbd>';

    var enabled = (C.sections || []).filter(function (x) { return x.enabled && R[x.id] && C[x.id]; });
    $('#nav-links').innerHTML = enabled.map(function (x) { return '<a href="#' + x.id + '" data-id="' + x.id + '">' + esc(x.label) + '</a>'; }).join('');
    $('#main').innerHTML = enabled.map(function (x) { return R[x.id](C[x.id]); }).join('');
    renderFooterCols(enabled);

    startTyping();
    startTerminal();
    startCanvas();
    startClock();
    startGlitch();
    bindDynamic();
    observe();
  }

  function renderFooterCols(enabled) {
    var c = C.contact || {};
    var nav = enabled.map(function (x) { return '<a href="#' + x.id + '">' + esc(x.label) + '</a>'; }).join('');
    var soc = (C.socials || []).filter(function (x) { return x.url; }).map(function (x) { return '<a ' + linkAttrs(x.url) + '>' + I.social(x.platform) + esc(x.label || x.platform) + '</a>'; }).join('');
    var con = (c.email ? '<a href="mailto:' + url(c.email) + '">' + I.ui('mail') + esc(c.email) + '</a>' : '') +
      (c.location ? '<a href="#contact">' + I.ui('map-pin') + esc(c.location) + '</a>' : '') +
      (C.site.commandPalette ? '<a href="#" data-cmdk>' + I.ui('command') + 'Command menu</a>' : '');
    $('#footer-cols').innerHTML = '<div><h4>Navigate</h4>' + nav + '</div><div><h4>Connect</h4>' + soc + '</div><div><h4>Contact</h4>' + con + '</div>';
  }

  /* ---------- typing roles ---------- */
  function startTyping() {
    var el = $('#typed');
    var roles = ((C.hero && C.hero.roles) || []).filter(Boolean);
    if (!el || roles.length < 2 || !animOn()) return;
    var r = 0, i = roles[0].length, deleting = true, timer;
    (function tick() {
      var word = roles[r];
      el.textContent = word.slice(0, i);
      if (!deleting && i === word.length) { deleting = true; timer = setTimeout(tick, 2000); return; }
      if (deleting && i === 0) { deleting = false; r = (r + 1) % roles.length; }
      i += deleting ? -1 : 1;
      timer = setTimeout(tick, deleting ? 35 : 75);
    })();
    onCleanup(function () { clearTimeout(timer); });
  }

  /* ---------- periodic glitch on the name ---------- */
  function startGlitch() {
    var el = $('#hero-name');
    if (!el || !animOn()) return;
    var iv = setInterval(function () { el.classList.add('glitching'); setTimeout(function () { el.classList.remove('glitching'); }, 500); }, 4500);
    onCleanup(function () { clearInterval(iv); });
  }

  /* ---------- local time ---------- */
  function startClock() {
    var tz = (C.about && C.about.timezone) || 'Asia/Kolkata';
    function fmt(opts) { try { return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: tz }, opts)).format(new Date()); } catch (e) { return new Date().toLocaleTimeString(); } }
    function tick() {
      var t = $('#local-time');
      if (t) t.textContent = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
      var ft = $('#footer-time');
      if (ft) ft.textContent = (C.about && C.about.location ? C.about.location.split(',')[0] + ' · ' : '') + fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
    tick();
    var iv = setInterval(tick, 1000);
    onCleanup(function () { clearInterval(iv); });
  }

  /* ---------- interactive terminal ---------- */
  function startTerminal() {
    var out = $('#term-out');
    if (!out) return;
    var body = $('#term-body'), row = $('#term-input-row'), input = $('#term-input'), hint = $('#term-hint');
    var h = C.hero, timers = [], history = [], hIdx = 0;
    function line(html, cls) { var d = document.createElement('div'); d.className = 'term-line ' + (cls || ''); d.innerHTML = html; out.appendChild(d); body.scrollTop = body.scrollHeight; return d; }
    function promptLine(cmd) { return line('<span class="term-prompt">' + promptHTML() + '</span> <span class="term-cmd">' + esc(cmd) + '</span>'); }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    onCleanup(function () { timers.forEach(clearTimeout); });

    var custom = {};
    (h.terminalCommands || []).forEach(function (c) { if (c.command) custom[c.command.trim().toLowerCase()] = c.output || ''; });
    var builtins = {
      help: function () {
        var cmds = ['whoami', 'about', 'skills', 'projects', 'socials', 'contact', 'theme', 'date', 'clear'].concat(Object.keys(custom));
        var rows = [];
        for (var i = 0; i < cmds.length; i += 3) rows.push('  ' + cmds.slice(i, i + 3).map(function (c) { return (c + '            ').slice(0, 12); }).join(''));
        return 'available commands:\n' + rows.join('\n') + '\n  open <name>  → open a social / jump to a section';
      },
      whoami: function () { return (h.name || '') + ' — ' + (h.roles || []).slice(0, 3).join(' · '); },
      about: function () { return (C.about && C.about.bio || '').split(/\n{2,}/)[0]; },
      skills: function () { return ((C.skills && C.skills.items) || []).map(function (s) { return s.name; }).join(' · '); },
      projects: function () { return ((C.projects && C.projects.items) || []).map(function (p, i) { return '  [' + (i + 1) + '] ' + p.title + (p.year ? ' (' + p.year + ')' : ''); }).join('\n') + '\n→ scroll to #projects to see them'; },
      socials: function () { return { html: (C.socials || []).filter(function (s) { return s.url; }).map(function (s) { return '  ' + esc(s.label || s.platform) + ': <a ' + linkAttrs(s.url) + '>' + esc(s.url.replace(/^https?:\/\/(www\.)?|^mailto:/, '')) + '</a>'; }).join('\n') }; },
      contact: function () { var c = C.contact || {}; return { html: 'email: <a href="mailto:' + url(c.email) + '">' + esc(c.email) + '</a>' + (c.location ? '\nlocation: ' + esc(c.location) : '') }; },
      theme: function () { toggleTheme(); return 'switched to ' + document.documentElement.dataset.theme + ' mode'; },
      date: function () { return new Date().toString(); },
      ls: function () { return 'dreams/  reality/  projects/  secrets.txt'; },
      'cat secrets.txt': function () { return 'nice try 😏  silent moves only.'; },
      sudo: function () { return 'permission denied: nice try though 🕷️'; },
      exit: function () { return 'there is no exit. only ship. 🚀'; },
      clear: function () { out.innerHTML = ''; return null; }
    };
    function run(raw) {
      var cmd = raw.trim();
      promptLine(cmd);
      if (!cmd) return;
      history.push(cmd); hIdx = history.length;
      var key = cmd.toLowerCase();
      var res;
      if (custom[key] != null) res = custom[key];
      else if (builtins[key]) res = builtins[key]();
      else if (key.indexOf('sudo') === 0) res = builtins.sudo();
      else if (key.indexOf('open ') === 0) {
        var target = key.slice(5).trim();
        var soc = (C.socials || []).find(function (s) { return (s.platform || '').toLowerCase() === target || (s.label || '').toLowerCase() === target; });
        if (soc) { window.open(soc.url, '_blank', 'noopener'); res = 'opening ' + target + '…'; }
        else if ($('#' + target)) { $('#' + target).scrollIntoView({ behavior: 'smooth' }); res = 'jumping to #' + target; }
        else res = 'open: ' + target + ': not found';
      } else res = 'command not found: ' + cmd + '. type "help"';
      if (res == null) return;
      if (typeof res === 'object') line(res.html, 'term-out');
      else line(esc(res), 'term-out');
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { run(input.value); input.value = ''; hint.hidden = true; }
      else if (e.key === 'ArrowUp') { if (hIdx > 0) { hIdx--; input.value = history[hIdx]; } e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (hIdx < history.length - 1) { hIdx++; input.value = history[hIdx]; } else { hIdx = history.length; input.value = ''; } e.preventDefault(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        var all = Object.keys(builtins).concat(Object.keys(custom));
        var m = all.filter(function (c) { return c.indexOf(input.value.toLowerCase()) === 0; });
        if (m.length === 1) input.value = m[0];
      }
    });
    body.addEventListener('click', function () { if (!row.hidden && !window.getSelection().toString()) input.focus({ preventScroll: true }); });

    // intro sequence
    var intro = (h.terminalIntro || []).filter(function (x) { return x.command; });
    function finish() { row.hidden = false; hint.hidden = false; body.scrollTop = body.scrollHeight; }
    if (!animOn()) { intro.forEach(function (x) { promptLine(x.command); line(esc(x.output), 'term-out hl'); }); finish(); return; }
    var bootDelay = document.documentElement.classList.contains('is-booting') ? 2300 : 700;
    var t = bootDelay;
    intro.forEach(function (x) {
      later(function () {
        var l = promptLine('');
        var span = l.querySelector('.term-cmd');
        var i = 0;
        (function type() { span.textContent = x.command.slice(0, ++i); if (i < x.command.length) later(type, 45 + Math.random() * 40); })();
      }, t);
      t += x.command.length * 65 + 250;
      later(function () { line(esc(x.output), 'term-out hl'); }, t);
      t += 450;
    });
    later(finish, t);
  }

  /* ---------- hero canvas: spider-web / particles ---------- */
  function startCanvas() {
    var cv = $('#hero-canvas');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var mode = C.theme.heroEffect;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, pts = [], mouse = { x: -9999, y: -9999 }, raf, visible = true;
    var col = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#ff2d55';
    var col2 = getComputedStyle(document.documentElement).getPropertyValue('--secondary').trim() || '#8b5cf6';
    function rgb(hex) { hex = hex.replace('#', ''); if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join(''); var n = parseInt(hex.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    var c1 = rgb(col), c2 = rgb(col2);
    function size() {
      var r = cv.getBoundingClientRect(); W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(110, (W * H) / (mode === 'particles' ? 9000 : 14000)));
      pts = [];
      for (var i = 0; i < n; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35 - (mode === 'particles' ? .25 : 0), r: Math.random() * 1.6 + .4, c: Math.random() > .5 ? c1 : c2 });
    }
    function frame() {
      ctx.clearRect(0, 0, W, H);
      var light = document.documentElement.dataset.theme === 'light';
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (mode === 'particles') { if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } }
        else { if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
        // subtle pull toward the cursor
        var dxm = mouse.x - p.x, dym = mouse.y - p.y, dm = Math.sqrt(dxm * dxm + dym * dym);
        if (dm < 180 && mode === 'web') { p.x += dxm * .006; p.y += dym * .006; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fillStyle = 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',' + (light ? .55 : .8) + ')'; ctx.fill();
        if (mode !== 'web') continue;
        for (var j = i + 1; j < pts.length; j++) {
          var q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d = dx * dx + dy * dy;
          if (d < 15000) {
            ctx.strokeStyle = 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',' + ((1 - d / 15000) * (light ? .18 : .22)) + ')';
            ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
        if (dm < 200) {
          ctx.strokeStyle = 'rgba(' + c1[0] + ',' + c1[1] + ',' + c1[2] + ',' + ((1 - dm / 200) * .55) + ')';
          ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
      if (visible && animOn()) raf = requestAnimationFrame(frame);
    }
    function onMove(e) { var r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; }
    function onLeave() { mouse.x = mouse.y = -9999; }
    size(); frame();
    var ro = new ResizeObserver(function () { size(); });
    ro.observe(cv);
    var hero = $('#hero');
    hero.addEventListener('pointermove', onMove);
    hero.addEventListener('pointerleave', onLeave);
    var io = new IntersectionObserver(function (en) { var v = en[0].isIntersecting; if (v && !visible) { visible = true; cancelAnimationFrame(raf); frame(); } visible = v; });
    io.observe(hero);
    onCleanup(function () { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); });
  }

  /* ---------- count-up numbers ---------- */
  function countUp(el) {
    var raw = el.dataset.v || '';
    var m = raw.match(/^(\D*)([\d,.]+)(.*)$/);
    if (!m || !animOn()) { el.textContent = raw; return; }
    var target = parseFloat(m[2].replace(/,/g, ''));
    var dec = (m[2].split('.')[1] || '').length;
    var start = performance.now(), dur = 1600;
    (function step(now) {
      var k = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - k, 4);
      var val = (target * e).toFixed(dec);
      if (m[2].indexOf(',') > -1) val = Number(val).toLocaleString('en-IN');
      el.textContent = m[1] + val + m[3];
      if (k < 1) requestAnimationFrame(step);
    })(start);
  }

  /* ---------- observers ---------- */
  function observe() {
    var els = $$('.reveal');
    if (!('IntersectionObserver' in window) || !animOn()) {
      els.forEach(function (e) { e.classList.add('visible'); });
      $$('.countup').forEach(function (e) { e.textContent = e.dataset.v; });
    } else {
      var ro = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add('visible');
          $$('.countup', en.target).forEach(countUp);
          ro.unobserve(en.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
      els.forEach(function (e) {
        var sib = e.parentElement ? Array.prototype.indexOf.call(e.parentElement.children, e) : 0;
        e.style.transitionDelay = Math.min(sib, 6) * 80 + 'ms';
        ro.observe(e);
      });
      observers.push(ro);
    }
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) $$('.nav-links a').forEach(function (a) { a.classList.toggle('active', a.dataset.id === en.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section').forEach(function (s) { spy.observe(s); });
    observers.push(spy);
  }

  /* ---------- per-render bindings ---------- */
  function bindDynamic() {
    var filters = $('#project-filters');
    if (filters) filters.addEventListener('click', function (e) {
      var b = e.target.closest('.filter');
      if (!b) return;
      $$('.filter', filters).forEach(function (x) { x.classList.toggle('active', x === b); });
      var f = b.dataset.f;
      $$('#projects-grid .project').forEach(function (p) {
        var show = f === '*' || JSON.parse(p.dataset.tags || '[]').indexOf(f) !== -1;
        p.style.display = show ? '' : 'none';
      });
    });
    $$('.g-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var items = galleryItems();
        var it = items[Number(b.dataset.i)];
        if (!it) return;
        if (it.link) { window.open(it.link, '_blank', 'noopener'); return; }
        openLightbox(Number(b.dataset.i));
      });
    });
    var ce = $('#copy-email');
    if (ce) ce.addEventListener('click', function () { copy(C.contact.email, 'Email copied to clipboard'); });

    var form = $('#contact-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = $('#form-status');
      var btn = form.querySelector('button[type=submit]');
      var data = Object.fromEntries(new FormData(form).entries());
      if (!data.name || !data.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        status.className = 'form-status err'; status.textContent = 'Please fill in your name, a valid email and a message.'; return;
      }
      btn.disabled = true; status.className = 'form-status'; status.textContent = 'Sending…';
      fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'Something went wrong.');
          status.className = 'form-status ok'; status.textContent = res.j.message || 'Message sent!'; form.reset();
        })
        .catch(function (err) { status.className = 'form-status err'; status.textContent = err.message; })
        .finally(function () { btn.disabled = false; });
    });
  }

  /* ---------- lightbox ---------- */
  var lbIndex = 0;
  function galleryItems() { return ((C.gallery && C.gallery.items) || []).filter(function (x) { return x.image; }); }
  function openLightbox(i) {
    var items = galleryItems();
    if (!items.length) return;
    lbIndex = (i + items.length) % items.length;
    var it = items[lbIndex];
    var img = $('#lb-img');
    img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    img.src = it.image; img.alt = it.caption || '';
    $('#lb-caption').textContent = it.caption || '';
    $('#lightbox').hidden = false;
  }

  /* ---------- command palette ---------- */
  var cmdItems = [], cmdSel = 0;
  function buildCommands() {
    var list = [];
    (C.sections || []).filter(function (x) { return x.enabled && R[x.id]; }).forEach(function (x) {
      list.push({ group: 'Navigate', label: x.label, icon: 'arrow-right', hint: '#' + x.id, run: function () { var el = $('#' + x.id); if (el) el.scrollIntoView({ behavior: 'smooth' }); } });
    });
    var c = C.contact || {};
    if (c.email) {
      list.push({ group: 'Actions', label: 'Copy email address', icon: 'copy', hint: c.email, run: function () { copy(c.email, 'Email copied to clipboard'); } });
      list.push({ group: 'Actions', label: 'Send me an email', icon: 'mail', run: function () { location.href = 'mailto:' + c.email; } });
    }
    if (C.theme.allowVisitorToggle) list.push({ group: 'Actions', label: 'Toggle light / dark mode', icon: 'moon-star', run: toggleTheme });
    if (C.about && C.about.resumeLink) list.push({ group: 'Actions', label: 'Download CV', icon: 'download', run: function () { window.open(C.about.resumeLink, '_blank', 'noopener'); } });
    list.push({ group: 'Actions', label: 'Open terminal', icon: 'terminal', run: function () { var t = $('#terminal'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { var i = $('#term-input'); if (i && !$('#term-input-row').hidden) i.focus({ preventScroll: true }); }, 600); } } });
    (C.socials || []).filter(function (s) { return s.url; }).forEach(function (s) {
      list.push({ group: 'Socials', label: s.label || s.platform, svg: I.social(s.platform), hint: 'open ↗', run: function () { window.open(s.url, '_blank', 'noopener'); } });
    });
    return list;
  }
  function openCmdk() {
    if (!C.site.commandPalette) return;
    cmdItems = buildCommands();
    $('#cmdk').hidden = false;
    var inp = $('#cmdk-input');
    inp.value = ''; drawCmdk(); setTimeout(function () { inp.focus(); }, 10);
  }
  function closeCmdk() { $('#cmdk').hidden = true; }
  function filteredCmds() {
    var q = $('#cmdk-input').value.trim().toLowerCase();
    return cmdItems.filter(function (c) { return !q || (c.label + ' ' + c.group + ' ' + (c.hint || '')).toLowerCase().indexOf(q) > -1; });
  }
  function drawCmdk() {
    var list = filteredCmds(), box = $('#cmdk-list'), html = '', lastGroup = '';
    if (cmdSel >= list.length) cmdSel = 0;
    if (!list.length) { box.innerHTML = '<div class="cmdk-empty">No results. Try "projects" or "email".</div>'; return; }
    list.forEach(function (c, i) {
      if (c.group !== lastGroup) { html += '<div class="cmdk-group">' + esc(c.group) + '</div>'; lastGroup = c.group; }
      html += '<button class="cmdk-item' + (i === cmdSel ? ' sel' : '') + '" data-i="' + i + '" role="option">' + (c.svg || I.ui(c.icon)) + '<span>' + esc(c.label) + '</span>' + (c.hint ? '<span class="hint">' + esc(c.hint) + '</span>' : '') + '</button>';
    });
    box.innerHTML = html;
    var sel = box.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function runCmd(i) { var c = filteredCmds()[i]; if (!c) return; closeCmdk(); setTimeout(c.run, 60); }

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
      setTimeout(function () { $('#boot').classList.add('done'); root.classList.remove('is-booting'); }, 250);
    }
    $('#boot-skip').addEventListener('click', end);
    (function next() {
      if (done) return;
      if (i >= lines.length) { setTimeout(end, 300); return; }
      var d = document.createElement('div'); d.textContent = lines[i]; box.appendChild(d);
      i++; bar.style.width = Math.round(i / lines.length * 100) + '%';
      setTimeout(next, 260 + Math.random() * 140);
    })();
    setTimeout(end, 6000); // safety net
  }

  /* ============================== global UI ============================== */
  function bindStatic() {
    var nav = $('#nav'), toTop = $('#to-top'), prog = $('#scroll-progress');
    toTop.innerHTML = '<svg class="ring" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" stroke-dasharray="150.8" stroke-dashoffset="150.8" id="top-ring"/></svg>' + I.ui('arrow-up');
    var lastY = 0, ticking = false;
    function onScroll() {
      var y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight, k = max > 0 ? y / max : 0;
      nav.classList.toggle('scrolled', y > 30);
      nav.classList.toggle('hide', y > 500 && y > lastY + 4 && !$('#nav-links').classList.contains('open'));
      if (y < lastY - 4 || y < 500) nav.classList.remove('hide');
      lastY = y;
      prog.style.transform = 'scaleX(' + k + ')';
      toTop.classList.toggle('show', y > 800);
      var ring = $('#top-ring'); if (ring) ring.style.strokeDashoffset = 150.8 * (1 - k);
      var tl = $('#timeline'), tp = $('#t-progress');
      if (tl && tp) { var r = tl.getBoundingClientRect(); var p = Math.min(1, Math.max(0, (innerHeight * .6 - r.top) / r.height)); tp.style.height = (p * 100) + '%'; }
      ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
    toTop.addEventListener('click', function () { window.scrollTo({ top: 0 }); });

    var menuBtn = $('#menu-btn'), links = $('#nav-links');
    menuBtn.innerHTML = I.ui('menu');
    function setMenu(open) { links.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open); menuBtn.innerHTML = I.ui(open ? 'x' : 'menu'); }
    menuBtn.addEventListener('click', function () { setMenu(!links.classList.contains('open')); });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });

    $('#theme-toggle').addEventListener('click', toggleTheme);

    // lightbox
    $('#lb-close').innerHTML = I.ui('x'); $('#lb-prev').innerHTML = I.ui('arrow-right'); $('#lb-next').innerHTML = I.ui('arrow-right');
    $('#lb-prev').firstChild.style.transform = 'rotate(180deg)';
    var lb = $('#lightbox');
    $('#lb-close').addEventListener('click', function () { lb.hidden = true; });
    $('#lb-prev').addEventListener('click', function () { openLightbox(lbIndex - 1); });
    $('#lb-next').addEventListener('click', function () { openLightbox(lbIndex + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.tagName === 'FIGURE') lb.hidden = true; });

    // command palette
    $('#cmdk-ic').innerHTML = I.ui('search');
    $('#cmdk-btn').addEventListener('click', openCmdk);
    document.addEventListener('click', function (e) { var a = e.target.closest('[data-cmdk]'); if (a) { e.preventDefault(); openCmdk(); } });
    $('#cmdk').addEventListener('click', function (e) { if (e.target.id === 'cmdk') closeCmdk(); var it = e.target.closest('.cmdk-item'); if (it) runCmd(Number(it.dataset.i)); });
    $('#cmdk-input').addEventListener('input', function () { cmdSel = 0; drawCmdk(); });
    $('#cmdk-input').addEventListener('keydown', function (e) {
      var n = filteredCmds().length;
      if (e.key === 'ArrowDown') { cmdSel = (cmdSel + 1) % Math.max(n, 1); drawCmdk(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cmdSel = (cmdSel - 1 + n) % Math.max(n, 1); drawCmdk(); e.preventDefault(); }
      else if (e.key === 'Enter') { runCmd(cmdSel); e.preventDefault(); }
    });

    document.addEventListener('keydown', function (e) {
      var typing = /INPUT|TEXTAREA/.test((document.activeElement || {}).tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#cmdk').hidden ? openCmdk() : closeCmdk(); }
      else if (e.key === '/' && !typing && $('#cmdk').hidden) { e.preventDefault(); openCmdk(); }
      else if (e.key === 'Escape') { closeCmdk(); lb.hidden = true; setMenu(false); }
      else if (!lb.hidden && e.key === 'ArrowRight') openLightbox(lbIndex + 1);
      else if (!lb.hidden && e.key === 'ArrowLeft') openLightbox(lbIndex - 1);
    });

    // pointer effects: glow, custom cursor, spotlight, tilt, magnetic
    var glow = $('.cursor-glow'), dot = $('.cursor-dot'), ring = $('.cursor-ring');
    var mx = -100, my = -100, rx = -100, ry = -100;
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      glow.style.transform = 'translate3d(' + (mx - 260) + 'px,' + (my - 260) + 'px,0)';
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      document.body.classList.remove('cursor-hidden');
      var spot = e.target.closest && e.target.closest('.spot');
      if (spot) { var r = spot.getBoundingClientRect(); spot.style.setProperty('--mx', (mx - r.left) + 'px'); spot.style.setProperty('--my', (my - r.top) + 'px'); }
    }, { passive: true });
    document.addEventListener('mouseleave', function () { document.body.classList.add('cursor-hidden'); });
    (function loop() { rx += (mx - rx) * .18; ry += (my - ry) * .18; ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)'; requestAnimationFrame(loop); })();
    document.addEventListener('pointerover', function (e) { if (e.target.closest && e.target.closest('a, button, .g-item, input, textarea')) document.body.classList.add('cursor-hover'); });
    document.addEventListener('pointerout', function (e) { if (e.target.closest && e.target.closest('a, button, .g-item, input, textarea')) document.body.classList.remove('cursor-hover'); });

    if (fine) {
      document.addEventListener('pointermove', function (e) {
        if (!C || !animOn()) return;
        var tilt = C.theme.tiltCards && e.target.closest('.tilt');
        if (tilt) {
          var r = tilt.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
          tilt.style.transform = 'perspective(1100px) rotateX(' + (-py * 5) + 'deg) rotateY(' + (px * 6) + 'deg) translateY(-4px)';
          tilt._t = true;
        }
        var mag = C.theme.magneticButtons && e.target.closest('.magnetic');
        if (mag) {
          var b = mag.getBoundingClientRect();
          mag.style.transform = 'translate(' + ((e.clientX - b.left - b.width / 2) * .25) + 'px,' + ((e.clientY - b.top - b.height / 2) * .35) + 'px)';
          mag._m = true;
        }
      }, { passive: true });
      document.addEventListener('pointerout', function (e) {
        var t = e.target.closest && e.target.closest('.tilt');
        if (t && t._t && !t.contains(e.relatedTarget)) { t.style.transform = ''; t._t = false; }
        var m = e.target.closest && e.target.closest('.magnetic');
        if (m && m._m && !m.contains(e.relatedTarget)) { m.style.transform = ''; m._m = false; }
      });
    }

    // live preview from the admin panel (same origin only)
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'pf-preview') return;
      var y = window.scrollY;
      render(e.data.content);
      $$('.reveal').forEach(function (el) { el.classList.add('visible'); });
      $$('.countup').forEach(function (el) { el.textContent = el.dataset.v; });
      window.scrollTo(0, y);
    });
  }

  bindStatic();
  function start(content) { render(content); boot(); }
  if (window.__CONTENT__) start(window.__CONTENT__);
  else fetch('/api/content').then(function (r) { return r.json(); }).then(start);
})();
