// Site-wide search across items, build guides, and the progression checklist.
// The item fetcher already searches items; this exists so a query like
// "Muramasa" or "Skeletron" also surfaces the build guides and checklist
// entries that mention it, from any page, without knowing where to look first.
(function () {
  var box = document.getElementById('globalSearch');
  if (!box) return;

  var input = box.querySelector('.gs-input');
  var panel = box.querySelector('.gs-results');

  // Pages live at the root and one level down; resolve data by trying both.
  var PREFIXES = ['', '../'];
  var prefix = null;
  var entries = [];
  var loaded = false;
  var loading = false;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fetchJson(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function resolvePrefix(i) {
    if (prefix !== null) return Promise.resolve(prefix);
    i = i || 0;
    if (i >= PREFIXES.length) return Promise.reject(new Error('no data path'));
    var p = PREFIXES[i];
    return fetchJson(p + 'data/meta.json').then(function () {
      prefix = p;
      return p;
    }, function () {
      return resolvePrefix(i + 1);
    });
  }

  function addEntry(list, label, sublabel, kind, href) {
    list.push({ label: label, sublabel: sublabel || '', kind: kind, href: href, n: label.toLowerCase() });
  }

  function indexItems(list, data, p) {
    for (var i = 0; i < data.length; i++) {
      var it = data[i];
      addEntry(list, it.name, it.type || '', 'Item', p + 'fetcher.html?q=' + encodeURIComponent(it.name));
    }
  }

  var VARIANT_LABELS = { accessible: 'Accessible', bis: 'Best-in-Slot' };

  function indexBuilds(list, data, p) {
    for (var i = 0; i < data.length; i++) {
      var b = data[i];
      var href = p + 'builds/index.html#' + b.id;
      // Accessible and BiS variants share a title, so qualify it — otherwise
      // gear appearing in both renders as two identical-looking rows.
      var variant = VARIANT_LABELS[b.variant] || b.variant;
      var where = variant ? b.title + ' (' + variant + ')' : b.title;
      addEntry(list, where, b.summary, 'Build', href);
      ['weapons', 'armor', 'accessories'].forEach(function (key) {
        (b[key] || []).forEach(function (g) {
          var name = g && g.icon ? g.icon : null;
          if (name) addEntry(list, name, 'in ' + where, 'Build', href);
        });
      });
    }
  }

  function indexChecklist(list, data, p) {
    for (var i = 0; i < data.length; i++) {
      var s = data[i];
      var href = p + 'checklist/index.html#' + s.id;
      (s.bosses || []).forEach(function (b) {
        addEntry(list, b.name, s.title, 'Checklist', href);
      });
      (s.npcs || []).forEach(function (n) {
        addEntry(list, n, s.title + ' — NPC', 'Checklist', href);
      });
    }
  }

  function load() {
    if (loaded || loading) return Promise.resolve();
    loading = true;
    return resolvePrefix().then(function (p) {
      return Promise.all([
        fetchJson(p + 'data/items.json').catch(function () { return []; }),
        fetchJson(p + 'builds/builds.json').catch(function () { return []; }),
        fetchJson(p + 'checklist/checklist.json').catch(function () { return []; })
      ]).then(function (res) {
        var list = [];
        indexItems(list, res[0], p);
        indexBuilds(list, res[1], p);
        indexChecklist(list, res[2], p);
        entries = list;
        loaded = true;
        loading = false;
      });
    }).catch(function () {
      loading = false;
    });
  }

  function score(q, name) {
    if (name === q) return 1000;
    if (name.indexOf(q) === 0) return 500 - name.length;
    var idx = name.indexOf(q);
    if (idx !== -1) return 200 - idx;
    return -1;
  }

  // Builds and checklist entries rank above raw item rows at equal relevance,
  // since the curated pages are what the item fetcher alone cannot surface.
  var KIND_BONUS = { Build: 60, Checklist: 40, Item: 0 };

  function search(q) {
    var query = q.trim().toLowerCase();
    if (!query) return [];
    var scored = [];
    var seen = {};
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var s = score(query, e.n);
      if (s <= 0) continue;
      var key = e.kind + '|' + e.label + '|' + e.href;
      if (seen[key]) continue;
      seen[key] = 1;
      scored.push({ s: s + (KIND_BONUS[e.kind] || 0), e: e });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, 12).map(function (x) { return x.e; });
  }

  function render(matches) {
    if (!matches.length) {
      panel.innerHTML = '<div class="gs-empty">No matches.</div>';
      panel.hidden = false;
      return;
    }
    panel.innerHTML = matches.map(function (m) {
      return '<a class="gs-result" href="' + m.href + '">' +
        '<span class="gs-kind gs-kind-' + m.kind.toLowerCase() + '">' + m.kind + '</span>' +
        '<span class="gs-label">' + escapeHtml(m.label) + '</span>' +
        (m.sublabel ? '<span class="gs-sub">' + escapeHtml(m.sublabel) + '</span>' : '') +
        '</a>';
    }).join('');
    panel.hidden = false;
  }

  function onInput() {
    var q = input.value;
    if (!q.trim()) { panel.hidden = true; panel.innerHTML = ''; return; }
    load().then(function () {
      if (input.value !== q) return;
      render(search(q));
    });
  }

  input.addEventListener('focus', load);
  input.addEventListener('input', onInput);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { panel.hidden = true; input.blur(); }
  });

  // Same-page anchor results don't reload, so close the panel explicitly.
  panel.addEventListener('click', function (e) {
    if (e.target.closest('.gs-result')) panel.hidden = true;
  });

  document.addEventListener('click', function (e) {
    if (!box.contains(e.target)) panel.hidden = true;
  });
})();
