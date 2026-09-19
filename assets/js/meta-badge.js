// Injects a small "Data for Terraria <version> - fetched <date>" badge into
// the page's <footer>, so users can tell at a glance how fresh/current the
// dataset is instead of silently trusting build guides that may predate a
// patch. Works from both the site root and one level down (builds/, checklist/).
(function () {
  // Pages live at the site root and one level down (builds/, checklist/), and the
  // GitHub Pages project path adds a segment, so resolve by trying each candidate
  // rather than computing depth.
  var META_PATHS = ['data/meta.json', '../data/meta.json'];

  function formatDate(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  function renderBadge(meta) {
    var footer = document.querySelector('footer');
    if (!footer) return;

    var parts = [];
    if (meta.gameVersion) parts.push('Data for Terraria ' + meta.gameVersion);
    var date = formatDate(meta.fetchedAt);
    if (date) parts.push('fetched ' + date);
    if (!parts.length) return;

    var badge = document.createElement('div');
    badge.className = 'meta-badge';
    badge.textContent = parts.join(' · ');

    var STALE_MONTHS = 6;
    if (date) {
      var monthsOld = (Date.now() - new Date(meta.fetchedAt).getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsOld > STALE_MONTHS) {
        badge.classList.add('meta-badge-stale');
        badge.title = 'This dataset is over ' + STALE_MONTHS + ' months old and may not reflect the latest Terraria patch.';
        badge.textContent += ' (may be outdated)';
      }
    }

    footer.appendChild(badge);
  }

  function tryFetch(paths) {
    if (!paths.length) return;
    fetch(paths[0]).then(function (res) {
      if (!res.ok) throw new Error('not ok');
      return res.json();
    }).then(renderBadge).catch(function () {
      tryFetch(paths.slice(1));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    tryFetch(META_PATHS);
  });
})();
