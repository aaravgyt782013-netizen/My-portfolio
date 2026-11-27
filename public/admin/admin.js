/* Admin panel — schema-driven editor for every part of the portfolio. */
(function () {
  'use strict';
  var I = window.Icons;
  var TOKEN_KEY = 'pf-admin-token';
  var token = localStorage.getItem(TOKEN_KEY);
  var state = null;        // content being edited
  var savedJSON = '';      // last saved snapshot
  var current = 'dashboard';
  var messages = [];
  var previewTimer = null;
  var previewPage = 'home';  // page shown in the live preview

  /* ======================= helpers ======================= */
  function $(s, r) { return (r || document).querySelector(s); }
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(children) ? children : children != null ? [children] : []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function getPath(obj, path) { return path ? path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj) : obj; }
  function toast(msg, type) {
    var t = h('div', { class: 'toast ' + (type || 'ok'), html: I.ui(type === 'err' ? 'triangle-alert' : 'circle-check') + '<span>' + esc(msg) + '</span>' });
    $('#toasts').appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(function () { t.remove(); }, 300); }, 3200);
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body }).then(function (r) {
      if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); location.replace('/admin/login'); throw new Error('Session expired'); }
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; });
    });
  }
  function fmtBytes(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function fmtDate(d) { try { return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return d; } }

  /* ======================= dirty / save / preview ======================= */
  function isDirty() { return JSON.stringify(state) !== savedJSON; }
  function changed() {
    var d = isDirty();
    $('#dirty').hidden = !d;
    $('#save-btn').disabled = !d;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(pushPreview, 200);
  }
  function pushPreview() {
    var f = $('#preview-frame');
    if (!$('#preview-pane').hidden && f.contentWindow) f.contentWindow.postMessage({ type: 'pf-preview', content: state, page: previewPage }, location.origin);
  }
  function save() {
    if (!isDirty()) return;
    var btn = $('#save-btn');
    btn.disabled = true;
    api('/api/admin/content', { method: 'PUT', json: state })
      .then(function () { savedJSON = JSON.stringify(state); changed(); toast('Changes saved & live on your website'); })
      .catch(function (e) { toast(e.message, 'err'); btn.disabled = false; });
  }

  /* ======================= upload helpers ======================= */
  function uploadFiles(files) {
    var fd = new FormData();
    Array.prototype.forEach.call(files, function (f) { fd.append('files', f); });
    return api('/api/admin/upload', { method: 'POST', body: fd }).then(function (j) { return j.files; });
  }
  function pickFile(accept, multiple) {
    return new Promise(function (resolve) {
      var inp = $('#hidden-file');
      inp.value = '';
      inp.accept = accept || 'image/*';
      inp.multiple = !!multiple;
      inp.onchange = function () { resolve(inp.files); };
      inp.click();
    });
  }
  function openMediaPicker(onPick) {
    var modal = $('#media-modal');
    var body = $('#media-modal-body');
    body.innerHTML = '<div class="loading">Loading media…</div>';
    modal.hidden = false;
    api('/api/admin/uploads').then(function (j) {
      body.innerHTML = '';
      var dz = dropzone(function (files) { onPick(files[0].url); modal.hidden = true; });
      body.appendChild(dz);
      var all = j.files.concat(j.assets).filter(function (f) { return /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(f.name); });
      if (!all.length) body.appendChild(h('p', { class: 'l-empty', text: 'No images yet — upload one above.' }));
      var grid = h('div', { class: 'media-grid' });
      all.forEach(function (f) {
        grid.appendChild(h('div', { class: 'media-item pick', onclick: function () { onPick(f.url); modal.hidden = true; } }, [
          h('div', { class: 'mi-img', style: "background-image:url('" + f.url + "')" }),
          h('div', { class: 'mi-foot' }, h('span', { text: f.name }))
        ]));
      });
      body.appendChild(grid);
    }).catch(function (e) { body.innerHTML = '<p class="l-empty">' + esc(e.message) + '</p>'; });
  }
  function dropzone(onDone, accept) {
    var dz = h('div', { class: 'dropzone', tabindex: '0', role: 'button', html: I.ui('upload') + '<div><b>Click to upload</b> or drag & drop images here</div><small>JPG, PNG, WEBP, GIF, SVG · PDF for resumes</small>' });
    function go(files) {
      if (!files || !files.length) return;
      dz.classList.add('uploading');
      uploadFiles(files).then(function (up) { toast(up.length + ' file(s) uploaded'); onDone(up); })
        .catch(function (e) { toast(e.message, 'err'); })
        .finally(function () { dz.classList.remove('uploading'); });
    }
    dz.onclick = function () { pickFile(accept || 'image/*,application/pdf', true).then(go); };
    dz.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dz.click(); } };
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = function () { dz.classList.remove('over'); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove('over'); go(e.dataTransfer.files); };
    return dz;
  }

  /* ======================= field renderers ======================= */
  // Each field: { key, label, type, help, full, options, ... }
  var FIELD = {};

  function fieldWrap(f, control) {
    return h('div', { class: 'field' + (f.full || ['textarea', 'list', 'image', 'file', 'tags'].indexOf(f.type) > -1 ? ' full' : '') }, [
      f.type === 'toggle' ? null : h('label', { text: f.label }),
      control,
      f.help ? h('div', { class: 'help', html: f.help }) : null
    ]);
  }

  FIELD.text = function (f, obj) {
    var inp = h('input', { type: f.inputType || 'text', value: obj[f.key] == null ? '' : obj[f.key], placeholder: f.placeholder || '' });
    inp.oninput = function () { obj[f.key] = inp.value; changed(); if (f.onInput) f.onInput(inp.value); };
    return fieldWrap(f, inp);
  };
  FIELD.url = function (f, obj) { return FIELD.text(Object.assign({ placeholder: 'https://…' }, f), obj); };
  FIELD.textarea = function (f, obj) {
    var ta = h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' });
    ta.value = obj[f.key] || '';
    ta.oninput = function () { obj[f.key] = ta.value; changed(); };
    return fieldWrap(f, ta);
  };
  FIELD.number = function (f, obj) {
    var inp = h('input', { type: 'number', value: obj[f.key], min: f.min, max: f.max, step: f.step || 1 });
    inp.oninput = function () { obj[f.key] = inp.value === '' ? '' : Number(inp.value); changed(); };
    return fieldWrap(f, inp);
  };
  FIELD.range = function (f, obj) {
    var out = h('output', { text: (obj[f.key] || 0) + (f.unit || '') });
    var inp = h('input', { type: 'range', min: f.min || 0, max: f.max || 100, step: f.step || 1, value: obj[f.key] || 0 });
    inp.oninput = function () { obj[f.key] = Number(inp.value); out.textContent = inp.value + (f.unit || ''); changed(); };
    return fieldWrap(f, h('div', { class: 'range-row' }, [inp, out]));
  };
  FIELD.color = function (f, obj) {
    var val = obj[f.key] || '#000000';
    var picker = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(val) ? val : '#000000' });
    var txt = h('input', { type: 'text', value: val, maxlength: 9 });
    picker.oninput = function () { txt.value = picker.value; obj[f.key] = picker.value; changed(); };
    txt.oninput = function () {
      if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(txt.value)) {
        obj[f.key] = txt.value; if (txt.value.length === 7) picker.value = txt.value; changed();
      }
    };
    return fieldWrap(f, h('div', { class: 'color-row' }, [picker, txt]));
  };
  FIELD.toggle = function (f, obj) {
    var inp = h('input', { type: 'checkbox' });
    inp.checked = !!obj[f.key];
    inp.onchange = function () { obj[f.key] = inp.checked; changed(); if (f.onChange) f.onChange(inp.checked); };
    return fieldWrap(f, h('label', { class: 'toggle' }, [inp, h('span', { class: 'sw' }), h('span', { class: 'tl', text: f.label })]));
  };
  FIELD.select = function (f, obj) {
    var opts = typeof f.options === 'function' ? f.options() : f.options;
    var sel = h('select', null, opts.map(function (o) {
      var v = typeof o === 'string' ? o : o.value;
      var l = typeof o === 'string' ? o : o.label;
      var op = h('option', { value: v, text: l });
      if (String(obj[f.key]) === String(v)) op.selected = true;
      return op;
    }));
    if (f.allowCustom && opts.every(function (o) { return (o.value || o) !== obj[f.key]; }) && obj[f.key]) {
      sel.insertBefore(h('option', { value: obj[f.key], text: obj[f.key], selected: true }), sel.firstChild);
    }
    sel.onchange = function () { obj[f.key] = sel.value; changed(); if (f.onChange) f.onChange(sel.value); };
    return fieldWrap(f, sel);
  };
  FIELD.tags = function (f, obj) {
    if (!Array.isArray(obj[f.key])) obj[f.key] = [];
    var arr = obj[f.key];
    var box = h('div', { class: 'tags-input' });
    var inp = h('input', { type: 'text', placeholder: f.placeholder || 'Type and press Enter…' });
    function draw() {
      box.innerHTML = '';
      arr.forEach(function (t, i) {
        box.appendChild(h('span', { class: 'chip' }, [t, h('button', { type: 'button', 'aria-label': 'Remove ' + t, html: I.ui('x'), onclick: function () { arr.splice(i, 1); changed(); draw(); inp.focus(); } })]));
      });
      box.appendChild(inp);
    }
    function add() {
      inp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (v) { arr.push(v); });
      inp.value = ''; changed(); draw(); inp.focus();
    }
    inp.onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
      else if (e.key === 'Backspace' && !inp.value && arr.length) { arr.pop(); changed(); draw(); inp.focus(); }
    };
    inp.onblur = function () { if (inp.value.trim()) add(); };
    box.onclick = function (e) { if (e.target === box) inp.focus(); };
    draw();
    return fieldWrap(f, box);
  };
  FIELD.image = function (f, obj, isFile) {
    var thumb = h('div', { class: 'img-thumb' + (isFile ? ' file' : ''), title: 'Choose from library' });
    var inp = h('input', { type: 'text', value: obj[f.key] || '', placeholder: isFile ? '/uploads/resume.pdf or https://…' : '/uploads/photo.jpg or https://…' });
    function draw() {
      var v = obj[f.key];
      if (isFile) { thumb.innerHTML = v ? I.ui('file-down') : I.ui('upload'); thumb.title = v || ''; }
      else { thumb.style.backgroundImage = v ? "url('" + v.replace(/'/g, '%27') + "')" : ''; thumb.innerHTML = v ? '' : I.ui('image'); }
      inp.value = v || '';
    }
    function set(v) { obj[f.key] = v; draw(); changed(); }
    inp.oninput = function () { obj[f.key] = inp.value; draw(); changed(); };
    if (!isFile) thumb.onclick = function () { openMediaPicker(set); };
    var upBtn = h('button', { type: 'button', class: 'a-btn sm', html: I.ui('upload') + 'Upload' });
    upBtn.onclick = function () {
      pickFile(isFile ? 'application/pdf,image/*' : 'image/*').then(function (files) {
        if (!files.length) return;
        upBtn.classList.add('uploading');
        uploadFiles(files).then(function (up) { set(up[0].url); toast('Uploaded'); })
          .catch(function (e) { toast(e.message, 'err'); })
          .finally(function () { upBtn.classList.remove('uploading'); });
      });
    };
    var btns = [upBtn];
    if (!isFile) btns.push(h('button', { type: 'button', class: 'a-btn sm', html: I.ui('folder') + 'Library', onclick: function () { openMediaPicker(set); } }));
    btns.push(h('button', { type: 'button', class: 'a-btn sm danger', html: I.ui('trash-2') + 'Remove', onclick: function () { set(''); } }));
    draw();
    return fieldWrap(f, h('div', { class: 'img-field' }, [thumb, h('div', { class: 'img-controls' }, [inp, h('div', { class: 'img-btns' }, btns)])]));
  };
  FIELD.file = function (f, obj) { return FIELD.image(f, obj, true); };

  FIELD.list = function (f, obj) {
    if (!Array.isArray(obj[f.key])) obj[f.key] = [];
    var arr = obj[f.key];
    var wrap = h('div');
    var openSet = new Set();
    function title(it, i) {
      var t = f.titleKey ? it[f.titleKey] : '';
      return (t && String(t).trim()) || (f.itemLabel || 'Item') + ' ' + (i + 1);
    }
    function draw() {
      wrap.innerHTML = '';
      var list = h('div', { class: 'list' });
      if (!arr.length) list.appendChild(h('div', { class: 'l-empty', text: 'Nothing here yet. Click “Add ' + (f.itemLabel || 'item').toLowerCase() + '” below.' }));
      arr.forEach(function (it, i) {
        var item = h('div', { class: 'l-item' + (openSet.has(it) ? ' open' : '') });
        var titleEl = h('span', { class: 'l-title', text: title(it, i) });
        if (f.subKey && it[f.subKey]) titleEl.appendChild(h('small', { text: f.subKey === 'level' ? it[f.subKey] + '%' : String(it[f.subKey]) }));
        var actions = h('div', { class: 'l-actions' }, [
          h('button', { type: 'button', class: 'a-icon-btn', title: 'Move up', html: I.ui('chevron-up'), disabled: i === 0, onclick: function (e) { e.stopPropagation(); arr.splice(i - 1, 0, arr.splice(i, 1)[0]); changed(); draw(); } }),
          h('button', { type: 'button', class: 'a-icon-btn', title: 'Move down', html: I.ui('chevron-down'), disabled: i === arr.length - 1, onclick: function (e) { e.stopPropagation(); arr.splice(i + 1, 0, arr.splice(i, 1)[0]); changed(); draw(); } }),
          h('button', { type: 'button', class: 'a-icon-btn', title: 'Duplicate', html: I.ui('copy'), onclick: function (e) { e.stopPropagation(); var c = clone(it); arr.splice(i + 1, 0, c); openSet.add(c); changed(); draw(); } }),
          h('button', { type: 'button', class: 'a-icon-btn danger', title: 'Delete', html: I.ui('trash-2'), onclick: function (e) { e.stopPropagation(); if (confirm('Delete “' + title(it, i) + '”?')) { arr.splice(i, 1); changed(); draw(); } } })
        ]);
        var headEls = [];
        if (f.thumbKey) headEls.push(h('span', { class: 'l-thumb', style: it[f.thumbKey] ? "background-image:url('" + String(it[f.thumbKey]).replace(/'/g, '%27') + "')" : '' }));
        if (f.iconKey) headEls.push(h('span', { class: 'l-thumb', style: 'display:grid;place-items:center', html: f.iconType === 'ui' ? I.ui(it[f.iconKey]) : I.social(it[f.iconKey]) }));
        headEls.push(titleEl, actions, h('span', { class: 'chev', html: I.ui('chevron-down') }));
        var head = h('div', { class: 'l-head' }, headEls);
        head.onclick = function () { item.classList.toggle('open'); if (item.classList.contains('open')) openSet.add(it); else openSet.delete(it); };
        var body = h('div', { class: 'l-body' });
        var fieldsEl = renderFields(f.fields.map(function (sf) {
          if (sf.key === f.titleKey || sf.key === f.subKey) {
            return Object.assign({}, sf, { onInput: function () { titleEl.firstChild.textContent = title(it, i); } });
          }
          return sf;
        }), it);
        body.appendChild(fieldsEl);
        item.appendChild(head);
        item.appendChild(body);
        list.appendChild(item);
      });
      wrap.appendChild(list);
      var addBtn = h('button', { type: 'button', class: 'a-btn', html: I.ui('plus') + 'Add ' + (f.itemLabel || 'item').toLowerCase() });
      addBtn.onclick = function () { var n = clone(f.newItem || {}); arr.push(n); openSet.add(n); changed(); draw(); };
      wrap.appendChild(h('div', { class: 'list-foot' }, addBtn));
    }
    draw();
    return h('div', { class: 'field full' }, [f.label ? h('label', { text: f.label }) : null, wrap]);
  };

  function renderFields(fields, obj) {
    var grid = h('div', { class: 'fields' });
    fields.forEach(function (f) {
      var r = FIELD[f.type || 'text'];
      if (r) grid.appendChild(r(f, obj));
    });
    return grid;
  }

  /* ======================= schema ======================= */
  var FONTS = ['Permanent Marker', 'Rock Salt', 'Gochi Hand', 'Kalam', 'Patrick Hand', 'Bangers', 'Bebas Neue', 'Space Grotesk', 'Inter', 'Poppins', 'Outfit', 'Sora', 'Manrope', 'DM Sans', 'Plus Jakarta Sans', 'Montserrat', 'Rubik', 'Nunito', 'Lexend', 'Urbanist', 'Syne', 'Playfair Display'];
  var HAND_FONTS = ['Caveat', 'Kalam', 'Patrick Hand', 'Gochi Hand', 'Shadows Into Light', 'Indie Flower', 'Gloria Hallelujah', 'Rock Salt', 'Homemade Apple'];
  var MONO_FONTS = ['JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Space Mono', 'Roboto Mono', 'Source Code Pro', 'DM Mono'];
  var PATTERNS = [{ value: 'grid', label: '▦ Graph paper grid' }, { value: 'ruled', label: '☰ Ruled notebook lines' }, { value: 'dots', label: '⠿ Dotted' }, { value: 'plain', label: 'Plain' }];
  var PRESETS = [
    { name: 'Chalkboard', primary: '#ffd60a', secondary: '#ff5a5f', accent: '#5ec8ff', background: '#121513', surface: '#1b1f1c', text: '#f2efe6', muted: '#9ca39d', sticky1: '#ffe873', sticky2: '#ffb3c7', sticky3: '#a8dcff', sticky4: '#b8f0a0' },
    { name: 'Green Board', primary: '#f7f3e3', secondary: '#ffb347', accent: '#9be7ff', background: '#1f3a2c', surface: '#284a38', text: '#f4f1e4', muted: '#a9c2b2', sticky1: '#fff3a0', sticky2: '#ffc6d9', sticky3: '#bfe6ff', sticky4: '#d4f7b0' },
    { name: 'Highlighter', primary: '#c6ff3d', secondary: '#ff4fd8', accent: '#3dfcff', background: '#0e0e10', surface: '#18181c', text: '#f5f5f5', muted: '#a0a0a8', sticky1: '#f4ff8a', sticky2: '#ffb0ee', sticky3: '#9ffcff', sticky4: '#c6ff9a' },
    { name: 'Spider-Verse', primary: '#ff2d3d', secondary: '#2f6bff', accent: '#ffd400', background: '#0b0b14', surface: '#151527', text: '#f5f6ff', muted: '#9497b8', sticky1: '#ffe873', sticky2: '#ff9aa6', sticky3: '#9ab8ff', sticky4: '#b8f0a0' },
    { name: 'CR7 Red', primary: '#e11d48', secondary: '#16a34a', accent: '#facc15', background: '#120a0c', surface: '#1e1215', text: '#fff1f2', muted: '#c09ca3', sticky1: '#ffe48a', sticky2: '#ffb3c0', sticky3: '#b0d8ff', sticky4: '#a6efb9' },
    { name: 'Blue Ink', primary: '#5b8cff', secondary: '#ff7a59', accent: '#ffd166', background: '#0d1220', surface: '#151c2f', text: '#eaf0ff', muted: '#93a0bf', sticky1: '#ffe873', sticky2: '#ffc2b3', sticky3: '#b3cdff', sticky4: '#c4f0b0' },
    { name: 'Pencil Mono', primary: '#e8e8e8', secondary: '#bdbdbd', accent: '#ffffff', background: '#111111', surface: '#1b1b1b', text: '#f2f2f2', muted: '#9a9a9a', sticky1: '#efefef', sticky2: '#dcdcdc', sticky3: '#cfcfcf', sticky4: '#e6e6e6' }
  ];
  var iconOptions = function () { return I.uiNames.map(function (n) { return { value: n, label: n }; }); };
  var brandOptions = function () { return [{ value: '', label: '(no logo)' }].concat(I.brandNames.map(function (n) { return { value: n, label: n }; })); };
  var platformOptions = function () { return ['email', 'website', 'phone'].concat(I.brandNames).map(function (n) { return { value: n, label: n }; }); };
  var MD = 'Tip: wrap words in <code class="k">*stars*</code> for a highlighter mark, <code class="k">~tildes~</code> to strike through, <code class="k">_underscores_</code> to underline.';
  var pageHead = function (extra) {
    return [{ key: 'heading', label: 'Page heading', full: true, help: MD }, { key: 'subheading', label: 'Subheading', type: 'textarea', rows: 2 }, { key: 'note', label: 'Handwritten side note', help: 'The little scribble under the heading.' }].concat(extra || []);
  };
  function labelPanel(group, title) { return { title: title || 'Small texts & buttons', labels: group }; }

  var TABS = [
    { group: 'General' },
    { id: 'dashboard', label: 'Dashboard', icon: 'house', render: renderDashboard },
    { id: 'pages', label: 'Pages & Menu', icon: 'layout-grid', render: renderPages },
    { id: 'site', label: 'Site, SEO & Footer', icon: 'settings', intro: 'Logo, browser tab, search engines, footer, boot screen and custom code.', panels: [
      { title: 'Branding', path: 'site', fields: [
        { key: 'logoText', label: 'Logo text', help: 'Also used as the terminal username.' },
        { key: 'logoSuffix', label: 'Logo suffix', help: 'Coloured part after the name, e.g. <code class="k">.exe</code>' },
        { key: 'logoImage', label: 'Logo image (optional — replaces the text)', type: 'image' },
        { key: 'favicon', label: 'Favicon (browser tab icon)', type: 'image' }
      ] },
      { title: 'SEO & sharing', path: 'site', fields: [
        { key: 'title', label: 'Site title', full: true, help: 'Each page title becomes “Page — Site title”. Override per page in Pages & Menu.' },
        { key: 'description', label: 'Meta description', type: 'textarea', rows: 2 },
        { key: 'keywords', label: 'Keywords (comma separated)', full: true },
        { key: 'ogImage', label: 'Social share image', type: 'image', help: 'Shown when your link is shared on WhatsApp, Instagram, X, etc.' }
      ] },
      { title: 'Footer', path: 'site', fields: [
        { key: 'footerText', label: 'Footer text', full: true },
        { key: 'footerBigText', label: 'Giant footer text' },
        { key: 'footerNote', label: 'Handwritten footer note' },
        { key: 'copyright', label: 'Copyright line', full: true, help: '<code class="k">{year}</code> and <code class="k">{name}</code> are filled in automatically.' },
        { key: 'showAdminLink', label: 'Show “Admin” link in footer', type: 'toggle' }
      ] },
      { title: 'Boot screen & command menu', path: 'site', fields: [
        { key: 'preloader', label: 'Show “attendance” boot screen (once per visit)', type: 'toggle' },
        { key: 'commandPalette', label: 'Enable command menu (Ctrl/⌘ + K)', type: 'toggle' },
        { key: 'preloaderLines', label: 'Boot screen lines', type: 'tags', placeholder: 'Add a line and press Enter' }
      ] },
      { title: 'Advanced: custom code', path: 'site', fields: [
        { key: 'customCss', label: 'Custom CSS', type: 'textarea', rows: 5, placeholder: '.hero-name { letter-spacing: 2px; }', help: 'Added after the main stylesheet — override anything.' },
        { key: 'customHead', label: 'Custom <head> HTML', type: 'textarea', rows: 4, placeholder: '<!-- analytics, verification meta tags… -->', help: 'For Google Analytics, Search Console verification, etc. Applied on next page load.' }
      ] },
      labelPanel('footer', 'Footer column titles'),
      labelPanel('general', 'Global small texts')
    ] },
    { id: 'theme', label: 'Colors & Theme', icon: 'palette', intro: 'Every color, font, pattern and effect. Dark mode = chalkboard, light mode = notebook.', panels: [
      { title: 'Quick presets', render: renderPresets },
      { title: 'Brand colors', path: 'theme', fields: [
        { key: 'primary', label: 'Primary (highlighter)', type: 'color' },
        { key: 'secondary', label: 'Secondary (red pen)', type: 'color' },
        { key: 'accent', label: 'Accent', type: 'color' }
      ] },
      { title: 'Chalkboard (dark mode)', path: 'theme', fields: [
        { key: 'background', label: 'Background', type: 'color' },
        { key: 'surface', label: 'Cards / surface', type: 'color' },
        { key: 'text', label: 'Text', type: 'color' },
        { key: 'muted', label: 'Muted text', type: 'color' },
        { key: 'bgPattern', label: 'Background pattern', type: 'select', options: PATTERNS }
      ] },
      { title: 'Notebook (light mode)', path: 'theme', fields: [
        { key: 'lightBackground', label: 'Background', type: 'color' },
        { key: 'lightSurface', label: 'Cards / surface', type: 'color' },
        { key: 'lightText', label: 'Text', type: 'color' },
        { key: 'lightMuted', label: 'Muted text', type: 'color' },
        { key: 'lightBgPattern', label: 'Background pattern', type: 'select', options: PATTERNS }
      ] },
      { title: 'Paper & sticky notes', path: 'theme', fields: [
        { key: 'paper', label: 'Paper (report card, notes)', type: 'color' },
        { key: 'paperText', label: 'Text on paper', type: 'color' },
        { key: 'sticky1', label: 'Sticky note 1', type: 'color' },
        { key: 'sticky2', label: 'Sticky note 2', type: 'color' },
        { key: 'sticky3', label: 'Sticky note 3', type: 'color' },
        { key: 'sticky4', label: 'Sticky note 4', type: 'color' }
      ] },
      { title: 'Typography & layout', path: 'theme', fields: [
        { key: 'fontHeading', label: 'Heading font', type: 'select', options: FONTS, allowCustom: true, help: 'Any Google Font name works.' },
        { key: 'fontBody', label: 'Body font', type: 'select', options: FONTS, allowCustom: true },
        { key: 'fontHand', label: 'Handwriting font', type: 'select', options: HAND_FONTS, allowCustom: true },
        { key: 'fontMono', label: 'Code / mono font', type: 'select', options: MONO_FONTS, allowCustom: true },
        { key: 'baseFontSize', label: 'Base text size', type: 'range', min: 13, max: 20, unit: 'px' },
        { key: 'radius', label: 'Corner roundness', type: 'range', min: 0, max: 32, unit: 'px' },
        { key: 'containerWidth', label: 'Max content width', type: 'range', min: 900, max: 1500, step: 10, unit: 'px', full: true }
      ] },
      { title: 'Mode', path: 'theme', fields: [
        { key: 'mode', label: 'Default mode', type: 'select', options: [{ value: 'dark', label: '🖤 Chalkboard (dark)' }, { value: 'light', label: '📒 Notebook (light)' }] },
        { key: 'allowVisitorToggle', label: 'Let visitors switch chalkboard / notebook', type: 'toggle' }
      ] },
      { title: 'Effects & interactions', path: 'theme', fields: [
        { key: 'animations', label: 'Animations (reveal, typing, counters)', type: 'toggle' },
        { key: 'pageTransitions', label: 'Page-flip transitions between pages', type: 'toggle' },
        { key: 'customCursor', label: 'Pencil cursor (desktop)', type: 'toggle' },
        { key: 'chalkTrail', label: 'Chalk dust trail behind the mouse', type: 'toggle' },
        { key: 'doodles', label: 'Hand-drawn doodles (stars, swirls…)', type: 'toggle' },
        { key: 'stickyTilt', label: 'Slightly tilted sticky notes & cards', type: 'toggle' },
        { key: 'tiltCards', label: '3D tilt on cards', type: 'toggle' },
        { key: 'magneticButtons', label: 'Magnetic buttons', type: 'toggle' },
        { key: 'grain', label: 'Paper grain texture', type: 'toggle' },
        { key: 'scrollProgress', label: 'Scroll progress bar', type: 'toggle' }
      ] }
    ] },
    { group: 'Pages' },
    { id: 'home', page: 'home', label: 'Home', icon: 'sparkles', intro: 'Your landing page: intro, tape strips, notebook index, class computer, featured project and the note CTA.', panels: [
      { title: 'Intro', path: 'hero', fields: [
        { key: 'badge', label: 'Sticker badge (top)' },
        { key: 'greeting', label: 'Greeting (handwritten)' },
        { key: 'name', label: 'Your name (giant marker text)' },
        { key: 'rolePrefix', label: 'Text before roles (optional)' },
        { key: 'roles', label: 'Roles (typing animation)', type: 'tags', placeholder: 'e.g. game builder — press Enter' },
        { key: 'tagline', label: 'Tagline', type: 'textarea', rows: 3, help: MD },
        { key: 'availableBadge', label: 'Show availability badge', type: 'toggle' },
        { key: 'availableText', label: 'Availability text' },
        { key: 'showSocials', label: 'Show social icons', type: 'toggle' }
      ] },
      { title: 'Polaroid photo', path: 'hero', fields: [
        { key: 'avatar', label: 'Profile photo', type: 'image' },
        { key: 'photoCaption', label: 'Caption under photo' },
        { key: 'photoArrowText', label: 'Arrow note (“that’s me!”)' },
        { key: 'stickyNote', label: 'Sticky note text', type: 'textarea', rows: 2 }
      ] },
      { title: 'Buttons', path: 'hero', fields: [
        { key: 'primaryButtonText', label: 'Main button text' },
        { key: 'primaryButtonLink', label: 'Main button link', help: 'A page like <code class="k">/projects</code>, or a full URL.' },
        { key: 'secondaryButtonText', label: 'Second button text' },
        { key: 'secondaryButtonLink', label: 'Second button link' }
      ] },
      { title: 'Stats', path: 'hero', fields: [
        { key: 'stats', type: 'list', itemLabel: 'Stat', titleKey: 'label', subKey: 'value', newItem: { value: '10+', label: 'New stat' }, fields: [
          { key: 'value', label: 'Value', help: 'Numbers count up (e.g. 25+, 100%)' }, { key: 'label', label: 'Label' }] }
      ] },
      { title: 'Tape strips (tech marquee)', path: 'marquee', fields: [
        { key: 'enabled', label: 'Show tape strips', type: 'toggle', full: true },
        { key: 'items', type: 'list', itemLabel: 'Tech', titleKey: 'name', iconKey: 'icon', newItem: { name: 'New tech', icon: '' }, fields: [
          { key: 'name', label: 'Name' }, { key: 'icon', label: 'Logo', type: 'select', options: brandOptions }] }
      ] },
      { title: 'Home blocks', path: 'home', fields: [
        { key: 'exploreEnabled', label: 'Show “Pick a page” sticky-note index', type: 'toggle' },
        { key: 'exploreHeading', label: 'Index heading', help: MD },
        { key: 'exploreSub', label: 'Index subheading', full: true },
        { key: 'terminalEnabled', label: 'Show class computer (terminal)', type: 'toggle' },
        { key: 'terminalHeading', label: 'Terminal heading' },
        { key: 'terminalSub', label: 'Terminal subheading', full: true },
        { key: 'featuredEnabled', label: 'Show featured project', type: 'toggle', help: 'Uses the first project marked “Teacher’s fav”.' },
        { key: 'featuredHeading', label: 'Featured heading' },
        { key: 'featuredSub', label: 'Featured subheading', full: true },
        { key: 'ctaEnabled', label: 'Show “Pass me a note” block', type: 'toggle' },
        { key: 'ctaHeading', label: 'CTA heading', help: MD },
        { key: 'ctaText', label: 'CTA text', full: true },
        { key: 'ctaButton', label: 'CTA button' },
        { key: 'ctaLink', label: 'CTA link' }
      ] },
      labelPanel('home')
    ] },
    { id: 'terminal', page: 'home', label: 'Class Computer', icon: 'terminal', intro: 'The interactive terminal on the home page. Built-in commands: help, whoami, about, skills, projects, socials, contact, ls, excuse, teacher, theme, date, clear, cd <page>, open <social>.', panels: [
      { title: 'Window', path: 'terminal', fields: [{ key: 'title', label: 'Window title', full: true }] },
      { title: 'Intro (auto-typed)', path: 'terminal', fields: [
        { key: 'intro', type: 'list', itemLabel: 'Line', titleKey: 'command', subKey: 'output', newItem: { command: 'echo hi', output: 'hi' }, fields: [
          { key: 'command', label: 'Command' }, { key: 'output', label: 'Output' }] }
      ] },
      { title: 'Custom commands (visitors can type these)', path: 'terminal', fields: [
        { key: 'commands', type: 'list', itemLabel: 'Command', titleKey: 'command', subKey: 'output', newItem: { command: 'secret', output: '🤫' }, fields: [
          { key: 'command', label: 'Command' }, { key: 'output', label: 'Reply', type: 'textarea', rows: 2 }] }
      ] },
      labelPanel('terminal')
    ] },
    { id: 'about', page: 'about', label: 'About', icon: 'user', panels: [
      { title: 'Page header', path: 'about', fields: pageHead() },
      { title: 'About me (notebook page)', path: 'about', fields: [
        { key: 'bioTitle', label: 'Notebook title' },
        { key: 'bio', label: 'Bio', type: 'textarea', rows: 7, help: 'Leave an empty line between paragraphs.' },
        { key: 'photo', label: 'Photo (on the ID card)', type: 'image' },
        { key: 'location', label: 'Location' },
        { key: 'timezone', label: 'Time zone (classroom clock)', type: 'select', allowCustom: true, options: ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney'] },
        { key: 'quote', label: 'Motto card', full: true, help: MD },
        { key: 'resumeText', label: 'Resume button text' },
        { key: 'resumeLink', label: 'Resume / CV file', type: 'file', help: 'Upload a PDF or paste a link. Hidden when empty.' }
      ] },
      { title: 'Student ID card', path: 'about.idCard', fields: [
        { key: 'enabled', label: 'Show ID card', type: 'toggle', full: true },
        { key: 'school', label: 'School name' },
        { key: 'title', label: 'Card title' },
        { key: 'signature', label: 'Signature' },
        { key: 'backTitle', label: 'Back side title', full: true },
        { key: 'backText', label: 'Back side text', type: 'textarea', rows: 2 },
        { key: 'rows', type: 'list', label: 'Card rows', itemLabel: 'Row', titleKey: 'label', subKey: 'value', newItem: { label: 'Field', value: '' }, fields: [
          { key: 'label', label: 'Label' }, { key: 'value', label: 'Value' }] }
      ] },
      { title: 'Currently', path: 'about', fields: [
        { key: 'currently', type: 'list', itemLabel: 'Row', titleKey: 'label', subKey: 'value', newItem: { label: 'Reading', value: '' }, fields: [
          { key: 'label', label: 'Label' }, { key: 'value', label: 'Value' }] }
      ] },
      { title: 'What drives me (draggable stickies)', path: 'about', fields: [
        { key: 'interests', type: 'list', itemLabel: 'Sticky', titleKey: 'title', subKey: 'emoji', newItem: { emoji: '✨', title: 'New interest', text: '' }, fields: [
          { key: 'emoji', label: 'Emoji' }, { key: 'title', label: 'Title' }, { key: 'text', label: 'Text', type: 'textarea', rows: 2 }] }
      ] },
      { title: 'Stats', path: 'about', fields: [
        { key: 'stats', type: 'list', itemLabel: 'Stat', titleKey: 'label', subKey: 'value', newItem: { value: '10+', label: 'New stat' }, fields: [
          { key: 'value', label: 'Value' }, { key: 'label', label: 'Label' }] }
      ] },
      labelPanel('about')
    ] },
    { id: 'services', page: 'services', label: 'Services', icon: 'zap', panels: [
      { title: 'Page header', path: 'services', fields: pageHead() },
      { title: 'Services (index cards)', path: 'services', fields: [
        { key: 'items', type: 'list', itemLabel: 'Service', titleKey: 'title', iconKey: 'icon', iconType: 'ui', newItem: { icon: 'sparkles', title: 'New service', description: '' }, fields: [
          { key: 'title', label: 'Title' },
          { key: 'icon', label: 'Icon', type: 'select', options: iconOptions },
          { key: 'description', label: 'Description', type: 'textarea', rows: 2 }] }
      ] }
    ] },
    { id: 'skills', page: 'skills', label: 'Skills (Report card)', icon: 'code', panels: [
      { title: 'Page header', path: 'skills', fields: pageHead() },
      { title: 'Report card', path: 'skills', fields: [
        { key: 'school', label: 'School name' },
        { key: 'reportTitle', label: 'Report title' },
        { key: 'term', label: 'Session / term' },
        { key: 'student', label: 'Student name' },
        { key: 'rollNo', label: 'Roll no.' },
        { key: 'resultStamp', label: 'Result stamp' },
        { key: 'overallRemark', label: 'Overall remark', type: 'textarea', rows: 2 },
        { key: 'teacherSign', label: 'Teacher signature label' },
        { key: 'principalSign', label: 'Principal signature label' }
      ] },
      { title: 'Subjects (skills)', path: 'skills', hint: 'Grouped by category. The grade is calculated from the marks using the grading scale below.', fields: [
        { key: 'items', type: 'list', itemLabel: 'Subject', titleKey: 'name', subKey: 'level', newItem: { name: 'New skill', level: 70, category: 'Frontend', remark: '' }, fields: [
          { key: 'name', label: 'Subject / skill' },
          { key: 'category', label: 'Category', help: 'e.g. Frontend, Backend, Tools & more' },
          { key: 'level', label: 'Marks (out of 100)', type: 'range', min: 0, max: 100, unit: '', full: true },
          { key: 'remark', label: 'Teacher’s remark', full: true }] }
      ] },
      { title: 'Grading scale', path: 'skills', fields: [
        { key: 'grades', type: 'list', itemLabel: 'Grade', titleKey: 'grade', subKey: 'min', newItem: { min: 0, grade: 'C' }, fields: [
          { key: 'grade', label: 'Grade' }, { key: 'min', label: 'Minimum marks', type: 'number', min: 0, max: 100 }] }
      ] },
      labelPanel('skills')
    ] },
    { id: 'projects', page: 'projects', label: 'Projects', icon: 'folder', panels: [
      { title: 'Page header', path: 'projects', fields: pageHead([{ key: 'searchEnabled', label: 'Show search box & tag filters', type: 'toggle' }]) },
      { title: 'Assignments (projects)', path: 'projects', fields: [
        { key: 'items', type: 'list', itemLabel: 'Project', titleKey: 'title', thumbKey: 'image', newItem: { title: 'New project', description: '', details: '', image: '', tags: [], year: '2026', grade: 'A', liveUrl: '', codeUrl: '', featured: false }, fields: [
          { key: 'title', label: 'Title' },
          { key: 'year', label: 'Year' },
          { key: 'grade', label: 'Grade stamp', help: 'e.g. A+, A, B+' },
          { key: 'featured', label: 'Teacher’s fav (big card + home page)', type: 'toggle' },
          { key: 'description', label: 'Short description', type: 'textarea', rows: 2 },
          { key: 'details', label: 'Details (opens in a popup)', type: 'textarea', rows: 4, help: 'Leave empty to hide the Details button.' },
          { key: 'image', label: 'Cover image', type: 'image' },
          { key: 'tags', label: 'Tech / tags', type: 'tags' },
          { key: 'liveUrl', label: 'Live demo link', type: 'url' },
          { key: 'codeUrl', label: 'Source code link', type: 'url' }] }
      ] },
      labelPanel('projects')
    ] },
    { id: 'products', page: 'products', label: 'Store (Canteen)', icon: 'shopping-bag', panels: [
      { title: 'Page header', path: 'products', fields: pageHead() },
      { title: 'Products & services', path: 'products', fields: [
        { key: 'items', type: 'list', itemLabel: 'Product', titleKey: 'name', subKey: 'price', thumbKey: 'image', newItem: { name: 'New product', description: '', image: '', price: '₹0', badge: '', features: [], buttonText: 'Buy now', link: '' }, fields: [
          { key: 'name', label: 'Name' },
          { key: 'price', label: 'Price tag', help: 'Any text: ₹499, $9, Free, From ₹999…' },
          { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
          { key: 'image', label: 'Image', type: 'image' },
          { key: 'badge', label: 'Ribbon (optional)', help: 'e.g. New, Bestseller, Sale' },
          { key: 'features', label: 'Features (bullet list)', type: 'tags' },
          { key: 'buttonText', label: 'Button text' },
          { key: 'link', label: 'Buy / order link', type: 'url', full: true, help: 'Gumroad, Razorpay, Instamojo, WhatsApp link, or <code class="k">/contact</code>' }] }
      ] },
      labelPanel('products')
    ] },
    { id: 'experience', page: 'experience', label: 'Journey (Timetable)', icon: 'briefcase', panels: [
      { title: 'Page header', path: 'experience', fields: pageHead() },
      { title: 'Timeline', path: 'experience', fields: [
        { key: 'items', type: 'list', itemLabel: 'Period', titleKey: 'role', subKey: 'period', newItem: { period: '2026', role: 'New milestone', company: '', description: '' }, fields: [
          { key: 'role', label: 'Title / role' }, { key: 'company', label: 'Company / place' },
          { key: 'period', label: 'Period' }, { key: 'description', label: 'Description', type: 'textarea', rows: 3 }] }
      ] }
    ] },
    { id: 'gallery', page: 'gallery', label: 'Gallery (Polaroids)', icon: 'image', panels: [
      { title: 'Page header & Instagram', path: 'gallery', fields: pageHead([
        { key: 'instagramHandle', label: 'Instagram handle', placeholder: '@yourname' },
        { key: 'instagramUrl', label: 'Instagram profile link', type: 'url' }]) },
      { title: 'Photos', path: 'gallery', render: renderBulkGallery, fields: [
        { key: 'items', type: 'list', itemLabel: 'Photo', titleKey: 'caption', thumbKey: 'image', newItem: { image: '', caption: '', link: '' }, fields: [
          { key: 'image', label: 'Image', type: 'image' },
          { key: 'caption', label: 'Handwritten caption' },
          { key: 'link', label: 'Link (optional)', type: 'url', help: 'e.g. the Instagram post. If empty, the photo opens in a lightbox.' }] }
      ] },
      labelPanel('gallery')
    ] },
    { id: 'playground', page: 'playground', label: 'Playground (Arcade)', icon: 'gamepad-2', panels: [
      { title: 'Page header', path: 'playground', fields: pageHead() },
      { title: 'Doodle on my desk', path: 'playground', fields: [
        { key: 'doodleEnabled', label: 'Show doodle board', type: 'toggle', full: true },
        { key: 'doodleTitle', label: 'Title' }, { key: 'doodleText', label: 'Text' },
        { key: 'doodleColors', label: 'Chalk colors', type: 'tags', placeholder: '#ffd60a — press Enter' }
      ] },
      { title: 'Paper toss game', path: 'playground', fields: [
        { key: 'tossEnabled', label: 'Show paper toss', type: 'toggle', full: true },
        { key: 'tossTitle', label: 'Title' }, { key: 'tossText', label: 'Text' },
        { key: 'tossHit', label: 'Messages on a hit', type: 'tags' },
        { key: 'tossMiss', label: 'Messages on a miss', type: 'tags' }
      ] },
      { title: 'Homework excuse generator', path: 'playground', fields: [
        { key: 'excuseEnabled', label: 'Show excuse generator', type: 'toggle', full: true },
        { key: 'excuseTitle', label: 'Title' }, { key: 'excuseText', label: 'Text' },
        { key: 'excuseButton', label: 'Button text' },
        { key: 'excuses', label: 'Excuses', type: 'tags', placeholder: 'Type an excuse and press Enter' }
      ] },
      labelPanel('playground')
    ] },
    { id: 'testimonials', page: 'testimonials', label: 'Reviews', icon: 'quote', intro: 'Turn this page on in Pages & Menu when you have reviews to show.', panels: [
      { title: 'Page header', path: 'testimonials', fields: pageHead() },
      { title: 'Reviews', path: 'testimonials', fields: [
        { key: 'items', type: 'list', itemLabel: 'Review', titleKey: 'name', subKey: 'role', thumbKey: 'avatar', newItem: { name: 'Name', role: '', quote: '', avatar: '' }, fields: [
          { key: 'name', label: 'Name' }, { key: 'role', label: 'Role' },
          { key: 'quote', label: 'Quote', type: 'textarea', rows: 3 }, { key: 'avatar', label: 'Photo (optional)', type: 'image' }] }
      ] }
    ] },
    { id: 'contact', page: 'contact', label: 'Contact', icon: 'mail', panels: [
      { title: 'Page header', path: 'contact', fields: pageHead() },
      { title: 'Contact details', path: 'contact', fields: [
        { key: 'email', label: 'Email', inputType: 'email' },
        { key: 'location', label: 'Location' },
        { key: 'phone', label: 'Phone (optional)' },
        { key: 'whatsapp', label: 'WhatsApp number (optional)', help: 'With country code, e.g. 919876543210' }
      ] },
      { title: 'Instagram card', path: 'contact', fields: [
        { key: 'instagramEnabled', label: 'Show Instagram card', type: 'toggle', full: true },
        { key: 'instagramHandle', label: 'Handle', placeholder: '@yourname' },
        { key: 'instagramUrl', label: 'Profile link', type: 'url' },
        { key: 'instagramText', label: 'Text', full: true },
        { key: 'instagramButton', label: 'Button text' }
      ] },
      { title: 'Note form', path: 'contact', fields: [
        { key: 'formEnabled', label: 'Enable the contact form', type: 'toggle', full: true },
        { key: 'formTitle', label: 'Form title' },
        { key: 'successMessage', label: 'Success message', type: 'textarea', rows: 2 }
      ] },
      labelPanel('contact', 'Form labels & placeholders')
    ] },
    { id: 'notFound', page: null, label: '404 Detention Slip', icon: 'triangle-alert', intro: 'Shown when someone opens a page that does not exist.', panels: [
      { title: 'Detention slip', path: 'notFound', fields: [
        { key: 'slipTitle', label: 'Slip title' },
        { key: 'heading', label: 'Heading', help: MD },
        { key: 'nameLabel', label: 'Name label' }, { key: 'nameValue', label: 'Name value' },
        { key: 'offenseLabel', label: 'Offense label' }, { key: 'offense', label: 'Offense' },
        { key: 'punishmentLabel', label: 'Punishment label' }, { key: 'punishment', label: 'Punishment', type: 'textarea', rows: 2 },
        { key: 'button', label: 'Button text' }, { key: 'sign', label: 'Signature' }
      ] }
    ] },
    { group: 'Everywhere' },
    { id: 'socials', label: 'Social Links', icon: 'share-2', intro: 'Shown on the home page, contact page, footer, terminal and command menu.', panels: [
      { title: 'Your links', path: '', fields: [
        { key: 'socials', type: 'list', itemLabel: 'Link', titleKey: 'label', subKey: 'url', iconKey: 'platform', newItem: { platform: 'instagram', label: 'Instagram', url: '' }, fields: [
          { key: 'platform', label: 'Platform / icon', type: 'select', options: platformOptions },
          { key: 'label', label: 'Label' },
          { key: 'url', label: 'URL', type: 'url', full: true, help: 'For email use <code class="k">mailto:you@mail.com</code>' }] }
      ] }
    ] },
    { id: 'teacher', label: 'Teacher Mode', icon: 'eye-off', intro: 'The boss key: visitors press a key (default T) and the whole site instantly turns into boring class notes.', panels: [
      { title: 'Fake class notes', path: 'teacher', fields: [
        { key: 'enabled', label: 'Enable teacher mode', type: 'toggle' },
        { key: 'hotkey', label: 'Hotkey (single letter)' },
        { key: 'tabTitle', label: 'Fake browser tab title', full: true },
        { key: 'subject', label: 'Subject line' },
        { key: 'title', label: 'Notes title' },
        { key: 'notes', label: 'Notes', type: 'textarea', rows: 8, help: 'Empty line = new paragraph.' },
        { key: 'footer', label: 'Footer hint', full: true }
      ] }
    ] },
    { id: 'labels', label: 'All Small Texts', icon: 'type', intro: 'Every tiny word on the site — buttons, hints, menu items, placeholders. Grouped by where they appear.', render: renderAllLabels },
    { group: 'Manage' },
    { id: 'messages', label: 'Messages', icon: 'inbox', render: renderMessages },
    { id: 'media', label: 'Media Library', icon: 'gallery-horizontal', render: renderMedia },
    { id: 'backup', label: 'Backup & Reset', icon: 'refresh-cw', render: renderBackup }
  ];

  /* ======================= navigation ======================= */
  function buildNav() {
    var nav = $('#side-nav');
    nav.innerHTML = '';
    TABS.forEach(function (t) {
      if (t.group) { nav.appendChild(h('div', { class: 'side-group', text: t.group })); return; }
      var off = t.page && state && state.pages && !(state.pages.find(function (p) { return p.id === t.page; }) || {}).enabled;
      var b = h('button', { 'data-tab': t.id, class: (t.id === current ? 'active' : '') + (off ? ' off' : ''), title: off ? 'This page is turned off' : '', html: I.ui(t.icon) + '<span>' + esc(t.label) + '</span>' });
      if (t.id === 'messages') { var unread = messages.filter(function (m) { return !m.read; }).length; if (unread) b.appendChild(h('span', { class: 'count', text: String(unread) })); }
      b.onclick = function () { go(t.id); $('#sidebar').classList.remove('open'); };
      nav.appendChild(b);
    });
  }
  function currentPage() { var t = TABS.find(function (x) { return x.id === current; }); return t && t.page !== undefined ? t.page : (t && t.id === 'notFound' ? null : undefined); }
  function go(id) {
    current = id;
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    buildNav();
    var tab = TABS.find(function (t) { return t.id === id; }) || TABS[1];
    $('#page-title').textContent = tab.label;
    var ed = $('#editor');
    ed.innerHTML = '';
    ed.scrollTop = 0;
    var inner = h('div', { class: 'editor-inner' });
    if (tab.intro) inner.appendChild(h('p', { class: 'page-intro', text: tab.intro }));
    if (tab.page) {
      var pg = state.pages.find(function (p) { return p.id === tab.page; });
      if (pg && !pg.enabled) inner.appendChild(h('div', { class: 'warn-bar', html: I.ui('eye-off') + '<span>This page is currently <b>turned off</b> — visitors can’t see it.</span>' }, h('button', { class: 'a-btn sm primary', text: 'Turn it on', onclick: function () { pg.enabled = true; changed(); go(id); } })));
    }
    if (tab.render) tab.render(inner);
    (tab.panels || []).forEach(function (p) {
      var panel = h('div', { class: 'panel' }, [h('h3', { text: p.title })]);
      if (p.hint) panel.appendChild(h('p', { class: 'hint', text: p.hint }));
      if (p.render) p.render(panel);
      if (p.fields) {
        var target = getPath(state, p.path);
        if (target == null && p.path) { target = {}; setPath(state, p.path, target); }
        panel.appendChild(renderFields(p.fields, target));
      }
      if (p.labels) panel.appendChild(labelFields(p.labels));
      inner.appendChild(panel);
    });
    ed.appendChild(inner);
    var pv = currentPage();
    if (pv !== undefined) previewPage = pv || 'notFound';
    pushPreview();
  }
  function setPath(obj, path, val) { var ks = path.split('.'), last = ks.pop(); ks.reduce(function (o, k) { if (o[k] == null) o[k] = {}; return o[k]; }, obj)[last] = val; }
  function humanize(k) { return k.replace(/([A-Z])/g, ' $1').replace(/^./, function (c) { return c.toUpperCase(); }); }
  function labelFields(group) {
    if (!state.labels) state.labels = {};
    if (!state.labels[group]) state.labels[group] = {};
    var obj = state.labels[group];
    return renderFields(Object.keys(obj).map(function (k) { return { key: k, label: humanize(k) }; }), obj);
  }

  /* ======================= custom pages ======================= */
  function renderDashboard(el) {
    var c = state;
    var unread = messages.filter(function (m) { return !m.read; }).length;
    el.appendChild(h('div', { class: 'welcome' }, [
      c.hero.avatar ? h('img', { src: c.hero.avatar, alt: '' }) : null,
      h('div', null, [h('h2', { text: 'Hey ' + (c.hero.name || 'there') + ' 👋' }), h('p', { text: 'Every word, link, color, photo and page on your website is editable from here — dot to dot. Changes show in the live preview instantly; hit Save (Ctrl+S) to publish.' })])
    ]));
    var on = c.pages.filter(function (p) { return p.enabled; }).length;
    var cards = [
      ['layout-grid', on + '/' + c.pages.length, 'Pages live', 'pages'],
      ['folder', (c.projects.items || []).length, 'Projects', 'projects'],
      ['shopping-bag', (c.products.items || []).length, 'Products', 'products'],
      ['code', (c.skills.items || []).length, 'Skills', 'skills'],
      ['image', (c.gallery.items || []).length, 'Gallery photos', 'gallery'],
      ['inbox', messages.length, unread ? unread + ' unread' : 'Messages', 'messages'],
      ['share-2', (c.socials || []).length, 'Social links', 'socials']
    ];
    el.appendChild(h('div', { class: 'stat-grid' }, cards.map(function (x) {
      return h('div', { class: 'stat-card', onclick: function () { go(x[3]); } }, [h('span', { class: 's-ic', html: I.ui(x[0]) }), h('div', null, [h('strong', { text: String(x[1]) }), h('span', { text: x[2] })])]);
    })));
    el.appendChild(h('div', { class: 'panel' }, [h('h3', { text: 'Quick actions' }), h('div', { class: 'quick' }, [
      h('button', { class: 'a-btn', html: I.ui('palette') + 'Change colors', onclick: function () { go('theme'); } }),
      h('button', { class: 'a-btn', html: I.ui('layout-grid') + 'Pages & menu', onclick: function () { go('pages'); } }),
      h('button', { class: 'a-btn', html: I.ui('plus') + 'Add a project', onclick: function () { go('projects'); } }),
      h('button', { class: 'a-btn', html: I.ui('upload') + 'Upload photos', onclick: function () { go('media'); } }),
      h('button', { class: 'a-btn', html: I.ui('type') + 'Edit small texts', onclick: function () { go('labels'); } }),
      h('button', { class: 'a-btn', html: I.ui('eye') + 'Live preview', onclick: togglePreview })
    ])]));
    el.appendChild(h('div', { class: 'panel', html: '<h3>' + I.ui('lock') + 'Login credentials</h3><p class="hint" style="margin:0">Your admin email and password come from the <code class="k">ADMIN_EMAIL</code> and <code class="k">ADMIN_PASSWORD</code> environment variables (on Render: Environment tab, locally: the <code class="k">.env</code> file). Change them there and restart.</p>' }));
  }

  function renderPresets(panel) {
    panel.appendChild(h('p', { class: 'hint', text: 'One click to restyle the whole site. Fine-tune every color below.' }));
    panel.appendChild(h('div', { class: 'presets' }, PRESETS.map(function (p) {
      return h('button', { type: 'button', class: 'preset', onclick: function () {
        Object.keys(p).forEach(function (k) { if (k !== 'name') state.theme[k] = p[k]; });
        changed(); go('theme'); toast('Applied “' + p.name + '” — remember to save');
      } }, [h('span', { class: 'sw3', html: '<i style="background:' + p.primary + '"></i><i style="background:' + p.secondary + '"></i><i style="background:' + p.background + '"></i>' }), p.name]);
    })));
  }

  function renderBulkGallery(panel) {
    var dz = dropzone(function (files) {
      files.forEach(function (f) { if (!/\.pdf$/i.test(f.name)) state.gallery.items.push({ image: f.url, caption: '', link: '' }); });
      changed(); go('gallery');
    }, 'image/*');
    dz.querySelector('div').innerHTML = '<b>Bulk add photos</b> — click or drop several images to add them to the wall';
    panel.appendChild(dz);
  }

  function renderAllLabels(el) {
    var names = { general: 'Global', home: 'Home page', about: 'About page', skills: 'Skills / report card', projects: 'Projects page', products: 'Store page', gallery: 'Gallery page', playground: 'Playground page', contact: 'Contact page & form', footer: 'Footer', cmdk: 'Command menu (Ctrl+K)', terminal: 'Terminal' };
    Object.keys(state.labels || {}).forEach(function (g) {
      var panel = h('div', { class: 'panel' }, [h('h3', { text: names[g] || humanize(g) })]);
      panel.appendChild(labelFields(g));
      el.appendChild(panel);
    });
  }

  function renderPages(el) {
    el.appendChild(h('p', { class: 'page-intro', html: 'Every page lives at its own address. Turn pages on/off, choose which appear in the top menu, rename them, change their URL and reorder them. Drag-free: use the arrows.' }));
    var panel = h('div', { class: 'panel' });
    var arr = state.pages;
    var openSet = new Set();
    function draw() {
      panel.innerHTML = '';
      arr.forEach(function (p, i) {
        var row = h('div', { class: 'page-row' + (p.enabled ? '' : ' off') + (openSet.has(p.id) ? ' open' : '') });
        var tog = h('input', { type: 'checkbox', 'aria-label': 'Page on/off' }); tog.checked = !!p.enabled;
        tog.onchange = function () { p.enabled = tog.checked; row.classList.toggle('off', !p.enabled); changed(); buildNav(); };
        if (p.id === 'home') tog.disabled = true;
        var lbl = h('input', { type: 'text', value: p.label, 'aria-label': 'Menu label' });
        lbl.oninput = function () { p.label = lbl.value; changed(); };
        var navTog = h('input', { type: 'checkbox' }); navTog.checked = p.inNav !== false;
        navTog.onchange = function () { p.inNav = navTog.checked; changed(); };
        var top = h('div', { class: 'pr-top' }, [
          h('label', { class: 'toggle', title: p.id === 'home' ? 'Home is always on' : 'Page on / off' }, [tog, h('span', { class: 'sw' })]),
          h('span', { class: 'pr-emoji', text: p.emoji || '📄' }),
          lbl,
          h('code', { class: 'pr-slug', text: '/' + (p.slug || '') }),
          h('label', { class: 'pr-nav', title: 'Show in top menu' }, [navTog, h('span', { text: 'in menu' })]),
          h('button', { class: 'a-icon-btn', title: 'Move up', html: I.ui('chevron-up'), disabled: i === 0, onclick: function () { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); changed(); draw(); } }),
          h('button', { class: 'a-icon-btn', title: 'Move down', html: I.ui('chevron-down'), disabled: i === arr.length - 1, onclick: function () { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); changed(); draw(); } }),
          h('button', { class: 'a-icon-btn', title: 'More settings', html: I.ui('settings'), onclick: function () { if (openSet.has(p.id)) openSet.delete(p.id); else openSet.add(p.id); draw(); } }),
          TABS.some(function (t) { return t.id === p.id; }) ? h('button', { class: 'a-btn sm', html: I.ui('pencil') + 'Edit', onclick: function () { go(p.id); } }) : null
        ]);
        row.appendChild(top);
        if (openSet.has(p.id)) {
          var fields = [
            { key: 'emoji', label: 'Emoji' },
            { key: 'blurb', label: 'Short blurb (shown on the home index & next-page card)', full: true },
            { key: 'seoTitle', label: 'Browser tab title (optional)', full: true, help: 'Defaults to “' + esc(p.label) + ' — site title”.' }
          ];
          if (p.id !== 'home') fields.splice(1, 0, { key: 'slug', label: 'URL', help: 'Letters, numbers and dashes only. Your page will live at <code class="k">/' + esc(p.slug || '') + '</code>', onInput: function (v) { var clean = v.toLowerCase().replace(/[^a-z0-9-]/g, ''); if (clean !== v) p.slug = clean; } });
          var body = h('div', { class: 'pr-body' }, renderFields(fields, p));
          row.appendChild(body);
        }
        panel.appendChild(row);
      });
    }
    draw();
    el.appendChild(panel);
  }

  function loadMessages() {
    return api('/api/admin/messages').then(function (m) { messages = m; buildNav(); return m; }).catch(function () { return []; });
  }
  function renderMessages(el) {
    el.appendChild(h('p', { class: 'page-intro', text: 'Messages sent through the contact form on your website.' }));
    var box = h('div', null, h('div', { class: 'loading', text: 'Loading…' }));
    el.appendChild(box);
    loadMessages().then(function () {
      box.innerHTML = '';
      if (!messages.length) { box.appendChild(h('div', { class: 'l-empty', text: 'No messages yet. They will show up here when someone uses your contact form.' })); return; }
      messages.forEach(function (m) {
        var item = h('div', { class: 'msg' + (m.read ? '' : ' unread') });
        var head = h('div', { class: 'msg-head' }, [
          h('span', { class: 'msg-av', text: (m.name || '?')[0].toUpperCase() }),
          h('div', { class: 'msg-meta' }, [h('strong', { text: m.name + ' · ' + m.email }), h('span', { text: m.subject || m.message.slice(0, 90) })]),
          h('span', { class: 'msg-date', text: fmtDate(m.createdAt) })
        ]);
        function setRead(v) {
          return api('/api/admin/messages/' + m.id, { method: 'PATCH', json: { read: v } }).then(function () { m.read = v; item.classList.toggle('unread', !v); readBtn.innerHTML = I.ui(v ? 'mail' : 'mail-open') + (v ? 'Mark unread' : 'Mark read'); buildNav(); });
        }
        head.onclick = function () { item.classList.toggle('open'); if (item.classList.contains('open') && !m.read) setRead(true); };
        var readBtn = h('button', { class: 'a-btn sm', html: I.ui(m.read ? 'mail' : 'mail-open') + (m.read ? 'Mark unread' : 'Mark read'), onclick: function () { setRead(!m.read); } });
        var body = h('div', { class: 'msg-body' }, [
          m.subject ? h('div', { style: 'font-weight:600;margin-bottom:.5rem', text: m.subject }) : null,
          h('p', { text: m.message }),
          h('div', { class: 'msg-actions' }, [
            h('a', { class: 'a-btn sm primary', href: 'mailto:' + encodeURIComponent(m.email) + '?subject=' + encodeURIComponent('Re: ' + (m.subject || 'Your message')), html: I.ui('send') + 'Reply by email' }),
            readBtn,
            h('button', { class: 'a-btn sm danger', html: I.ui('trash-2') + 'Delete', onclick: function () {
              if (!confirm('Delete this message?')) return;
              api('/api/admin/messages/' + m.id, { method: 'DELETE' }).then(function () { messages = messages.filter(function (x) { return x.id !== m.id; }); item.remove(); buildNav(); toast('Message deleted'); });
            } })
          ])
        ]);
        item.appendChild(head); item.appendChild(body);
        box.appendChild(item);
      });
    });
  }

  function renderMedia(el) {
    el.appendChild(h('p', { class: 'page-intro', text: 'Upload photos and files, then use them anywhere on your site. Click a URL to copy it.' }));
    el.appendChild(dropzone(function () { go('media'); }));
    var box = h('div', null, h('div', { class: 'loading', text: 'Loading…' }));
    el.appendChild(box);
    api('/api/admin/uploads').then(function (j) {
      box.innerHTML = '';
      function grid(files, deletable) {
        return h('div', { class: 'media-grid' }, files.map(function (f) {
          var isImg = /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(f.name);
          var foot = [h('span', { text: f.name, title: f.name + (f.size ? ' · ' + fmtBytes(f.size) : '') }),
            h('button', { class: 'a-icon-btn', title: 'Copy URL', html: I.ui('copy'), onclick: function () { navigator.clipboard.writeText(f.url).then(function () { toast('Copied ' + f.url); }); } })];
          if (deletable) foot.push(h('button', { class: 'a-icon-btn danger', title: 'Delete', html: I.ui('trash-2'), onclick: function () {
            if (!confirm('Delete ' + f.name + '? Anything using it will show a broken image.')) return;
            api('/api/admin/uploads/' + encodeURIComponent(f.name), { method: 'DELETE' }).then(function () { toast('Deleted'); go('media'); }).catch(function (e) { toast(e.message, 'err'); });
          } }));
          return h('div', { class: 'media-item' }, [
            h('a', { class: 'mi-img', href: f.url, target: '_blank', style: isImg ? "background-image:url('" + f.url + "')" : '', html: isImg ? '' : I.ui('file-down') + '&nbsp;' + esc(f.name.split('.').pop().toUpperCase()) }),
            h('div', { class: 'mi-foot' }, foot)
          ]);
        }));
      }
      box.appendChild(h('div', { class: 'media-section-title', text: 'Your uploads (' + j.files.length + ')' }));
      box.appendChild(j.files.length ? grid(j.files, true) : h('div', { class: 'l-empty', text: 'No uploads yet.' }));
      box.appendChild(h('div', { class: 'media-section-title', text: 'Built-in images' }));
      box.appendChild(grid(j.assets, false));
    }).catch(function (e) { box.innerHTML = '<p class="l-empty">' + esc(e.message) + '</p>'; });
  }

  function renderBackup(el) {
    el.appendChild(h('div', { class: 'panel' }, [
      h('h3', { text: 'Export' }),
      h('p', { class: 'hint', text: 'Download all your website content as a JSON file (uploaded images are not included).' }),
      h('button', { class: 'a-btn', html: I.ui('file-down') + 'Download backup', onclick: function () {
        var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        var a = h('a', { href: URL.createObjectURL(blob), download: 'portfolio-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
        document.body.appendChild(a); a.click(); a.remove();
      } })
    ]));
    el.appendChild(h('div', { class: 'panel' }, [
      h('h3', { text: 'Import' }),
      h('p', { class: 'hint', text: 'Load a backup file. Review it in the preview, then click Save to publish.' }),
      h('button', { class: 'a-btn', html: I.ui('file-up') + 'Import backup', onclick: function () {
        pickFile('application/json,.json').then(function (files) {
          if (!files.length) return;
          files[0].text().then(function (txt) {
            try {
              var data = JSON.parse(txt);
              if (!data.site || !data.theme || !Array.isArray(data.pages)) throw new Error('This does not look like a portfolio backup.');
              state = data; changed(); buildNav(); toast('Backup loaded — click Save to publish');
            } catch (e) { toast(e.message, 'err'); }
          });
        });
      } })
    ]));
    el.appendChild(h('div', { class: 'panel' }, [
      h('h3', { text: 'Reset to defaults' }),
      h('p', { class: 'hint', text: 'Replace all content with the original demo content. Messages and uploads are kept. This cannot be undone (download a backup first!).' }),
      h('button', { class: 'a-btn danger', html: I.ui('refresh-cw') + 'Reset everything', onclick: function () {
        if (!confirm('Reset ALL website content to defaults? This cannot be undone.')) return;
        api('/api/admin/reset', { method: 'POST' }).then(function (j) { state = j.content; savedJSON = JSON.stringify(state); changed(); toast('Content reset to defaults'); go('backup'); })
          .catch(function (e) { toast(e.message, 'err'); });
      } })
    ]));
  }

  /* ======================= preview ======================= */
  function togglePreview() {
    var pane = $('#preview-pane');
    pane.hidden = !pane.hidden;
    var f = $('#preview-frame');
    if (!pane.hidden && f.getAttribute('src') === 'about:blank') f.src = '/';
    else if (!pane.hidden) pushPreview();
    $('#preview-btn').classList.toggle('primary', !pane.hidden);
  }

  /* ======================= init ======================= */
  function initChrome() {
    $('#brand-ic').innerHTML = I.ui('sparkles');
    $('#logout-btn').innerHTML = I.ui('log-out') + 'Log out';
    $('#side-toggle').innerHTML = I.ui('menu');
    $('#preview-btn').innerHTML = I.ui('eye') + '<span class="lbl">Preview</span>';
    $('#view-btn').innerHTML = I.ui('external-link') + '<span class="lbl">View site</span>';
    $('#save-btn').innerHTML = I.ui('save') + '<span class="lbl">Save</span>';
    $('#media-close').innerHTML = I.ui('x');
    $('#pv-desktop').innerHTML = I.ui('globe');
    $('#pv-mobile').innerHTML = I.ui('phone');

    $('#save-btn').onclick = save;
    $('#preview-btn').onclick = togglePreview;
    $('#side-toggle').onclick = function () { $('#sidebar').classList.toggle('open'); };
    $('#side-overlay').onclick = function () { $('#sidebar').classList.remove('open'); };
    $('#logout-btn').onclick = function () {
      if (isDirty() && !confirm('You have unsaved changes. Log out anyway?')) return;
      savedJSON = JSON.stringify(state);
      localStorage.removeItem(TOKEN_KEY); location.replace('/admin/login');
    };
    $('#media-close').onclick = function () { $('#media-modal').hidden = true; };
    $('#media-modal').onclick = function (e) { if (e.target.id === 'media-modal') $('#media-modal').hidden = true; };
    $('#preview-frame').addEventListener('load', function () { setTimeout(pushPreview, 50); });
    document.querySelectorAll('.pv-devices button').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.pv-devices button').forEach(function (x) { x.classList.toggle('active', x === b); });
        $('#preview-frame').style.width = b.dataset.w;
      };
    });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if (e.key === 'Escape') $('#media-modal').hidden = true;
    });
    window.addEventListener('beforeunload', function (e) { if (state && isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  }

  initChrome();
  Promise.all([api('/api/auth/me'), fetch('/api/content', { cache: 'no-store' }).then(function (r) { return r.json(); })])
    .then(function (res) {
      $('#who').innerHTML = 'Signed in as <b>' + esc(res[0].email) + '</b>';
      state = res[1];
      savedJSON = JSON.stringify(state);
      var initial = location.hash.slice(1);
      current = TABS.some(function (t) { return t.id === initial; }) ? initial : 'dashboard';
      go(current);
      loadMessages().then(function () { if (current === 'dashboard') go('dashboard'); });
    })
    .catch(function (e) { $('#editor').innerHTML = '<div class="loading">' + esc(e.message) + '</div>'; });
})();
