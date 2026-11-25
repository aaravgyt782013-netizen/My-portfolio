/* Portfolio front-end: renders everything from the content JSON managed in the admin panel. */
(function () {
  'use strict';
  var I = window.Icons;
  var C = null;
  var typedTimer = null;
  var revealObserver = null;
  var spyObserver = null;

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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
  function initials(name) {
    return esc(String(name || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase());
  }
  function head(sec, eyebrow) {
    return '<div class="section-head reveal">' +
      (eyebrow ? '<span class="eyebrow">' + esc(eyebrow) + '</span>' : '') +
      '<h2>' + esc(sec.heading) + '</h2>' +
      (sec.subheading ? '<p>' + esc(sec.subheading) + '</p>' : '') + '</div>';
  }
  function sectionLabel(id) {
    var s = (C.sections || []).find(function (x) { return x.id === id; });
    return s ? s.label : id;
  }
  function socialLinks(list) {
    return (list || []).filter(function (s) { return s.url; }).map(function (s) {
      return '<a ' + linkAttrs(s.url) + ' aria-label="' + esc(s.label || s.platform) + '" title="' + esc(s.label || s.platform) + '">' + I.social(s.platform) + '</a>';
    }).join('');
  }
  function hexOk(v, fb) { return /^#([0-9a-f]{3,8})$/i.test(v || '') ? v : fb; }

  /* ---------------- theme ---------------- */
  function applyTheme(t) {
    var css = ':root,[data-theme="dark"]{' +
      '--primary:' + hexOk(t.primary, '#8b5cf6') + ';--secondary:' + hexOk(t.secondary, '#22d3ee') + ';--accent:' + hexOk(t.accent, '#f472b6') + ';' +
      '--bg:' + hexOk(t.background, '#07060f') + ';--surface:' + hexOk(t.surface, '#12111f') + ';--text:' + hexOk(t.text, '#ece9ff') + ';--muted:' + hexOk(t.muted, '#9a96b8') + ';}' +
      '[data-theme="light"]{--bg:' + hexOk(t.lightBackground, '#f7f6fc') + ';--surface:' + hexOk(t.lightSurface, '#ffffff') + ';--text:' + hexOk(t.lightText, '#15122b') + ';--muted:' + hexOk(t.lightMuted, '#5d5a78') + ';}' +
      ':root{--radius:' + (Number(t.radius) >= 0 ? Number(t.radius) : 18) + 'px;' +
      "--font-heading:'" + String(t.fontHeading || 'Space Grotesk').replace(/[^\w\s-]/g, '') + "',system-ui,sans-serif;" +
      "--font-body:'" + String(t.fontBody || 'Inter').replace(/[^\w\s-]/g, '') + "',system-ui,sans-serif;}";
    var el = document.getElementById('theme-vars');
    if (!el) { el = document.createElement('style'); el.id = 'theme-vars'; document.head.appendChild(el); }
    el.textContent = css;

    var fams = [t.fontHeading || 'Space Grotesk', t.fontBody || 'Inter'].filter(function (v, i, a) { return a.indexOf(v) === i; });
    var href = 'https://fonts.googleapis.com/css2?' + fams.map(function (f) { return 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;500;600;700'; }).join('&') + '&display=swap';
    var link = document.getElementById('font-link');
    if (link && link.getAttribute('href') !== href) link.setAttribute('href', href);

    document.body.classList.toggle('anim', t.animations !== false);
    document.body.classList.toggle('no-anim', t.animations === false);
    document.body.classList.toggle('no-cursor', !t.cursorGlow);
    document.body.classList.toggle('no-grid', !t.backgroundGrid);

    var saved = null;
    try { saved = localStorage.getItem('pf-theme'); } catch (e) {}
    document.documentElement.dataset.theme = (t.allowVisitorToggle && saved) ? saved : (t.mode === 'light' ? 'light' : 'dark');
    var tb = document.getElementById('theme-toggle');
    tb.hidden = !t.allowVisitorToggle;
    updateThemeIcon();
  }
  function updateThemeIcon() {
    var dark = document.documentElement.dataset.theme !== 'light';
    document.getElementById('theme-toggle').innerHTML = I.ui(dark ? 'sun' : 'moon');
  }

  /* ---------------- sections ---------------- */
  var R = {};

  R.hero = function (h) {
    var roles = (h.roles || []).filter(Boolean);
    var bg = h.backgroundImage ? ' has-bg" style="background-image:url(\'' + url(h.backgroundImage) + '\')' : '';
    return '<section id="hero" class="hero' + bg + '"><div class="container">' +
      '<div class="hero-text">' +
        (h.availableBadge ? '<div class="badge-available reveal"><span class="pulse"></span>' + esc(h.availableText) + '</div>' : '') +
        '<p class="greeting reveal">' + esc(h.greeting) + '</p>' +
        '<h1 class="reveal"><span class="grad-text">' + esc(h.name) + '</span></h1>' +
        (roles.length ? '<div class="role reveal"><span class="typed" id="typed">' + esc(roles[0]) + '</span><span class="caret"></span></div>' : '') +
        '<p class="tagline reveal">' + esc(h.tagline) + '</p>' +
        '<div class="ctas reveal">' +
          (h.primaryButtonText ? '<a class="btn btn-primary" ' + linkAttrs(h.primaryButtonLink) + '>' + esc(h.primaryButtonText) + I.ui('arrow-right') + '</a>' : '') +
          (h.secondaryButtonText ? '<a class="btn btn-ghost" ' + linkAttrs(h.secondaryButtonLink) + '>' + esc(h.secondaryButtonText) + '</a>' : '') +
        '</div>' +
        (h.showSocials ? '<div class="socials reveal">' + socialLinks(C.socials) + '</div>' : '') +
      '</div>' +
      '<div class="avatar-wrap reveal"><div class="avatar-ring"></div>' +
        (h.avatar ? '<img class="avatar" src="' + url(h.avatar) + '" alt="' + esc(h.name) + '" />' : '<div class="avatar avatar-placeholder grad-text">' + initials(h.name) + '</div>') +
        (roles[0] ? '<div class="float-chip chip-1">' + I.ui('code') + esc(roles[0]) + '</div>' : '') +
        (roles[1] ? '<div class="float-chip chip-2">' + I.ui('sparkles') + esc(roles[1]) + '</div>' : '') +
      '</div>' +
    '</div><a href="#about" class="scroll-hint" aria-label="Scroll down"></a></section>';
  };

  R.about = function (a) {
    var meta = '';
    if (a.location) meta += '<span>' + I.ui('map-pin') + esc(a.location) + '</span>';
    if (C.contact && C.contact.email) meta += '<span>' + I.ui('mail') + esc(C.contact.email) + '</span>';
    return '<section id="about"><div class="container">' + head(a, sectionLabel('about')) +
      '<div class="about-grid">' +
        (a.photo ? '<div class="about-photo reveal"><img src="' + url(a.photo) + '" alt="' + esc(C.hero.name) + '" loading="lazy" /></div>' : '<div></div>') +
        '<div class="about-text reveal">' +
          '<div class="bio">' + paragraphs(a.bio) + '</div>' +
          (meta ? '<div class="about-meta">' + meta + '</div>' : '') +
          (a.resumeLink ? '<a class="btn btn-primary" ' + linkAttrs(a.resumeLink) + ' download>' + I.ui('download') + esc(a.resumeText || 'Download CV') + '</a>' : '') +
          ((a.stats || []).length ? '<div class="stats">' + a.stats.map(function (s) {
            return '<div class="card stat"><strong class="grad-text">' + esc(s.value) + '</strong><span>' + esc(s.label) + '</span></div>';
          }).join('') + '</div>' : '') +
        '</div>' +
      '</div></div></section>';
  };

  R.skills = function (s) {
    var groups = {};
    var order = [];
    (s.items || []).forEach(function (k) {
      var cat = k.category || 'Skills';
      if (!groups[cat]) { groups[cat] = []; order.push(cat); }
      groups[cat].push(k);
    });
    var icons = ['layers', 'code', 'settings', 'sparkles', 'package', 'globe'];
    return '<section id="skills"><div class="container">' + head(s, sectionLabel('skills')) +
      (order.length ? '<div class="skill-groups">' + order.map(function (cat, i) {
        return '<div class="card skill-group reveal"><h3>' + I.ui(icons[i % icons.length]) + esc(cat) + '</h3>' +
          groups[cat].map(function (k) {
            var lvl = Math.max(0, Math.min(100, Number(k.level) || 0));
            return '<div class="skill"><div class="skill-top"><span>' + esc(k.name) + '</span><span>' + lvl + '%</span></div>' +
              '<div class="bar"><i style="--w:' + lvl + '%"></i></div></div>';
          }).join('') + '</div>';
      }).join('') + '</div>' : '<p class="empty-note">No skills added yet.</p>') +
    '</div></section>';
  };

  R.projects = function (p) {
    var items = p.items || [];
    var tags = [];
    items.forEach(function (it) { (it.tags || []).forEach(function (t) { if (t && tags.indexOf(t) === -1) tags.push(t); }); });
    return '<section id="projects"><div class="container">' + head(p, sectionLabel('projects')) +
      (tags.length > 1 ? '<div class="filters reveal" id="project-filters"><button class="filter active" data-f="*">All</button>' +
        tags.map(function (t) { return '<button class="filter" data-f="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '') +
      (items.length ? '<div class="projects-grid" id="projects-grid">' + items.map(function (it) {
        return '<article class="card project reveal' + (it.featured ? ' featured' : '') + '" data-tags="' + esc(JSON.stringify(it.tags || [])) + '">' +
          '<div class="project-media">' + (it.image ? '<img src="' + url(it.image) + '" alt="' + esc(it.title) + '" loading="lazy" />' : '<div class="placeholder-media">' + initials(it.title) + '</div>') +
            (it.featured ? '<span class="feat-badge">' + I.ui('star') + 'Featured</span>' : '') + '</div>' +
          '<div class="project-body"><h3>' + esc(it.title) + '</h3><p>' + esc(it.description) + '</p>' +
            '<div class="tags">' + (it.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
            '<div class="project-links">' +
              (it.liveUrl ? '<a class="btn btn-primary btn-sm" ' + linkAttrs(it.liveUrl) + '>' + I.ui('external-link') + 'Live</a>' : '') +
              (it.codeUrl ? '<a class="btn btn-ghost btn-sm" ' + linkAttrs(it.codeUrl) + '>' + I.brand('github') + 'Code</a>' : '') +
            '</div></div></article>';
      }).join('') + '</div>' : '<p class="empty-note">Projects coming soon.</p>') +
    '</div></section>';
  };

  R.products = function (p) {
    var items = p.items || [];
    return '<section id="products"><div class="container">' + head(p, sectionLabel('products')) +
      (items.length ? '<div class="products-grid">' + items.map(function (it) {
        return '<article class="card product reveal">' +
          '<div class="product-media">' + (it.image ? '<img src="' + url(it.image) + '" alt="' + esc(it.name) + '" loading="lazy" />' : '<div class="placeholder-media">' + I.ui('shopping-bag') + '</div>') +
            (it.badge ? '<span class="product-badge">' + esc(it.badge) + '</span>' : '') + '</div>' +
          '<div class="product-body"><h3>' + esc(it.name) + '</h3><p>' + esc(it.description) + '</p>' +
            '<div class="product-foot"><span class="price grad-text">' + esc(it.price) + '</span>' +
              (it.link ? '<a class="btn btn-primary btn-sm" ' + linkAttrs(it.link) + '>' + I.ui('shopping-bag') + esc(it.buttonText || 'Buy') + '</a>' : '') +
            '</div></div></article>';
      }).join('') + '</div>' : '<p class="empty-note">Products coming soon.</p>') +
    '</div></section>';
  };

  R.experience = function (e) {
    var items = e.items || [];
    return '<section id="experience"><div class="container">' + head(e, sectionLabel('experience')) +
      '<div class="timeline">' + items.map(function (it) {
        return '<div class="t-item reveal"><span class="t-dot"></span><div class="card t-card">' +
          '<span class="t-period">' + esc(it.period) + '</span><h3>' + esc(it.role) + '</h3>' +
          (it.company ? '<span class="t-company">' + esc(it.company) + '</span>' : '') +
          (it.description ? '<p>' + esc(it.description) + '</p>' : '') + '</div></div>';
      }).join('') + '</div></div></section>';
  };

  R.gallery = function (g) {
    var items = (g.items || []).filter(function (x) { return x.image; });
    return '<section id="gallery"><div class="container">' + head(g, sectionLabel('gallery')) +
      (items.length ? '<div class="gallery-grid">' + items.map(function (it, i) {
        return '<button class="g-item reveal" data-i="' + i + '"><img src="' + url(it.image) + '" alt="' + esc(it.caption || 'Gallery image') + '" loading="lazy" />' +
          (it.caption ? '<span class="g-cap">' + esc(it.caption) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '<p class="empty-note">No photos yet.</p>') +
      (g.instagramUrl ? '<div class="insta-cta reveal"><a class="btn btn-ghost" ' + linkAttrs(g.instagramUrl) + '>' + I.brand('instagram') + 'Follow ' + esc(g.instagramHandle || 'on Instagram') + '</a></div>' : '') +
    '</div></section>';
  };

  R.testimonials = function (t) {
    var items = t.items || [];
    if (!items.length) return '';
    return '<section id="testimonials"><div class="container">' + head(t, sectionLabel('testimonials')) +
      '<div class="testi-grid">' + items.map(function (it) {
        return '<figure class="card testi reveal">' + I.ui('quote') + '<blockquote>' + esc(it.quote) + '</blockquote>' +
          '<figcaption class="testi-who">' + (it.avatar ? '<img src="' + url(it.avatar) + '" alt="" loading="lazy" />' : '<span class="ph">' + initials(it.name) + '</span>') +
          '<div><strong>' + esc(it.name) + '</strong><span>' + esc(it.role) + '</span></div></figcaption></figure>';
      }).join('') + '</div></div></section>';
  };

  R.contact = function (c) {
    var info = [];
    if (c.email) info.push(['mail', 'Email', c.email, 'mailto:' + c.email]);
    if (c.phone) info.push(['phone', 'Phone', c.phone, 'tel:' + c.phone.replace(/[^\d+]/g, '')]);
    if (c.whatsapp) info.push([null, 'WhatsApp', c.whatsapp, 'https://wa.me/' + c.whatsapp.replace(/\D/g, '')]);
    if (c.location) info.push(['map-pin', 'Location', c.location, '']);
    return '<section id="contact"><div class="container">' + head(c, sectionLabel('contact')) +
      '<div class="contact-grid"' + (c.formEnabled ? '' : ' style="grid-template-columns:1fr;max-width:640px;margin:auto"') + '>' +
        '<div class="contact-info">' + info.map(function (x) {
          var icon = x[0] ? I.ui(x[0]) : I.brand('whatsapp');
          var inner = '<span class="info-icon">' + icon + '</span><div><small>' + x[1] + '</small><strong>' + esc(x[2]) + '</strong></div>';
          return x[3] ? '<a class="card info-item reveal" ' + linkAttrs(x[3]) + '>' + inner + '</a>' : '<div class="card info-item reveal">' + inner + '</div>';
        }).join('') +
        ((C.socials || []).length ? '<div class="socials reveal" style="margin-top:.5rem">' + socialLinks(C.socials) + '</div>' : '') +
        '</div>' +
        (c.formEnabled ? '<form class="card contact-form reveal" id="contact-form" novalidate>' +
          '<div class="field"><label for="cf-name">Name</label><input id="cf-name" name="name" required maxlength="100" placeholder="Your name" autocomplete="name" /></div>' +
          '<div class="field"><label for="cf-email">Email</label><input id="cf-email" name="email" type="email" required maxlength="200" placeholder="you@email.com" autocomplete="email" /></div>' +
          '<div class="field full"><label for="cf-subject">Subject</label><input id="cf-subject" name="subject" maxlength="200" placeholder="What\'s it about?" /></div>' +
          '<div class="field full"><label for="cf-msg">Message</label><textarea id="cf-msg" name="message" rows="6" required maxlength="5000" placeholder="Tell me about your idea…"></textarea></div>' +
          '<div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off" /></div>' +
          '<div class="full" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap"><button class="btn btn-primary" type="submit">' + I.ui('send') + 'Send message</button><span class="form-status" id="form-status" role="status"></span></div>' +
        '</form>' : '') +
      '</div></div></section>';
  };

  /* ---------------- render ---------------- */
  function render(content) {
    C = content;
    var s = C.site || {};
    applyTheme(C.theme || {});
    document.title = s.title || '';
    var fav = document.getElementById('favicon');
    if (fav && s.favicon) fav.href = s.favicon;

    var logo = s.logoImage
      ? '<img src="' + url(s.logoImage) + '" alt="' + esc(s.logoText || 'Logo') + '" />'
      : '<span class="bracket">&lt;</span>' + esc(s.logoText) + '<span class="dot">/&gt;</span>';
    document.getElementById('logo').innerHTML = logo;
    document.getElementById('footer-logo').innerHTML = logo;
    document.getElementById('footer-text').textContent = s.footerText || '';
    document.getElementById('footer-socials').innerHTML = socialLinks(C.socials);
    document.getElementById('copyright').textContent = '© ' + new Date().getFullYear() + ' ' + ((C.hero && C.hero.name) || '') + '. All rights reserved.';
    document.getElementById('admin-link').hidden = !s.showAdminLink;

    var enabled = (C.sections || []).filter(function (x) { return x.enabled && R[x.id] && C[x.id]; });
    document.getElementById('nav-links').innerHTML = enabled.map(function (x) {
      return '<a href="#' + x.id + '" data-id="' + x.id + '">' + esc(x.label) + '</a>';
    }).join('');
    document.getElementById('main').innerHTML = enabled.map(function (x) { return R[x.id](C[x.id]); }).join('');

    startTyping();
    bindDynamic();
    observe();
  }

  function startTyping() {
    clearTimeout(typedTimer);
    var el = document.getElementById('typed');
    var roles = ((C.hero && C.hero.roles) || []).filter(Boolean);
    if (!el || roles.length < 2 || C.theme.animations === false) return;
    var r = 0, i = roles[0].length, deleting = true;
    (function tick() {
      var word = roles[r];
      el.textContent = word.slice(0, i);
      if (!deleting && i === word.length) { deleting = true; typedTimer = setTimeout(tick, 1800); return; }
      if (deleting && i === 0) { deleting = false; r = (r + 1) % roles.length; }
      i += deleting ? -1 : 1;
      typedTimer = setTimeout(tick, deleting ? 40 : 85);
    })();
  }

  function observe() {
    if (revealObserver) revealObserver.disconnect();
    if (spyObserver) spyObserver.disconnect();
    var els = document.querySelectorAll('.reveal, .skill-group');
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('visible'); }); return; }
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('visible'); revealObserver.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (e, idx) {
      e.style.transitionDelay = (idx % 4) * 70 + 'ms';
      revealObserver.observe(e);
    });
    spyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          document.querySelectorAll('.nav-links a').forEach(function (a) { a.classList.toggle('active', a.dataset.id === en.target.id); });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section').forEach(function (s) { spyObserver.observe(s); });
  }

  function bindDynamic() {
    // project filters
    var filters = document.getElementById('project-filters');
    if (filters) filters.addEventListener('click', function (e) {
      var b = e.target.closest('.filter');
      if (!b) return;
      filters.querySelectorAll('.filter').forEach(function (x) { x.classList.toggle('active', x === b); });
      var f = b.dataset.f;
      document.querySelectorAll('#projects-grid .project').forEach(function (p) {
        var tags = JSON.parse(p.dataset.tags || '[]');
        p.style.display = (f === '*' || tags.indexOf(f) !== -1) ? '' : 'none';
      });
    });
    // gallery lightbox
    document.querySelectorAll('.g-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var items = (C.gallery.items || []).filter(function (x) { return x.image; });
        var it = items[Number(b.dataset.i)];
        if (!it) return;
        if (it.link) { window.open(it.link, '_blank', 'noopener'); return; }
        document.getElementById('lb-img').src = it.image;
        document.getElementById('lb-img').alt = it.caption || '';
        document.getElementById('lb-caption').textContent = it.caption || '';
        document.getElementById('lightbox').hidden = false;
        document.getElementById('lb-close').focus();
      });
    });
    // contact form
    var form = document.getElementById('contact-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = document.getElementById('form-status');
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

  /* ---------------- static UI ---------------- */
  function bindStatic() {
    var nav = document.getElementById('nav');
    var toTop = document.getElementById('to-top');
    toTop.innerHTML = I.ui('arrow-up');
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 20);
      toTop.classList.toggle('show', window.scrollY > 700);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    toTop.addEventListener('click', function () { window.scrollTo({ top: 0 }); });

    var menuBtn = document.getElementById('menu-btn');
    var links = document.getElementById('nav-links');
    menuBtn.innerHTML = I.ui('menu');
    menuBtn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open);
      menuBtn.innerHTML = I.ui(open ? 'x' : 'menu');
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) { links.classList.remove('open'); menuBtn.innerHTML = I.ui('menu'); menuBtn.setAttribute('aria-expanded', false); }
    });

    document.getElementById('theme-toggle').addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('pf-theme', next); } catch (e) {}
      updateThemeIcon();
    });

    var lb = document.getElementById('lightbox');
    document.getElementById('lb-close').innerHTML = I.ui('x');
    var closeLb = function () { lb.hidden = true; };
    document.getElementById('lb-close').addEventListener('click', closeLb);
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLb(); });

    var glow = document.querySelector('.cursor-glow');
    window.addEventListener('pointermove', function (e) { glow.style.left = e.clientX + 'px'; glow.style.top = e.clientY + 'px'; }, { passive: true });

    // Live preview from the admin panel (same origin only)
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'pf-preview') return;
      var y = window.scrollY;
      render(e.data.content);
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('visible'); });
      window.scrollTo(0, y);
    });
  }

  bindStatic();
  if (window.__CONTENT__) render(window.__CONTENT__);
  else fetch('/api/content').then(function (r) { return r.json(); }).then(render);
})();
