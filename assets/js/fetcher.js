// Terraria Fetcher - client-side search over a pre-built static dataset.
// Expected data/items.json shape (array of):
// {
//   id: number,
//   name: string,
//   type: string,            // "Weapon", "Armor", "Accessory", "Material", ...
//   tooltip: string,
//   sellValue: number,
//   rarity: string,
//   icon: string,             // relative path or URL to sprite, optional
//   recipes: [                // recipes that PRODUCE this item
//     { station: string, ingredients: [{ name: string, qty: number }] }
//   ],
//   sources: [                // drop acquisition, when no recipe exists
//     { from: string, rate: string, quantity: string, modes: string[] }
//   ],
//   shops: [                  // NPC shop acquisition
//     { npc: string, price: string|null }
//   ]
// }

(function () {
  const input = document.getElementById('searchInput');
  const results = document.getElementById('results');
  const meta = document.getElementById('meta');

  let items = [];
  let index = [];

  function normalize(str) {
    return (str || '').toLowerCase();
  }

  function buildIndex(data) {
    return data.map((item, i) => ({
      i,
      n: normalize(item.name),
    }));
  }

  function score(query, name) {
    if (name === query) return 1000;
    if (name.startsWith(query)) return 500 - name.length;
    const idx = name.indexOf(query);
    if (idx !== -1) return 200 - idx;
    return -1;
  }

  function search(query) {
    const q = normalize(query.trim());
    if (!q) return [];
    const scored = [];
    for (const entry of index) {
      const s = score(q, entry.n);
      if (s > 0) scored.push({ s, item: items[entry.i] });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 60).map(x => x.item);
  }

  function renderIngredients(ingredients) {
    if (!ingredients || !ingredients.length) return '';
    return '<ul class="ingredients">' +
      ingredients.map(ing => `<li>${ing.qty > 1 ? ing.qty + '× ' : ''}${escapeHtml(ing.name)}</li>`).join('') +
      '</ul>';
  }

  function mergeSources(sources) {
    // Collapse duplicate rows that only differ by game-mode flag (Normal /
    // Expert / Master) into one line with a combined mode list.
    const byKey = new Map();
    for (const s of sources) {
      const key = `${s.from}|${s.rate}|${s.quantity}`;
      if (!byKey.has(key)) {
        byKey.set(key, { from: s.from, rate: s.rate, quantity: s.quantity, modes: new Set() });
      }
      const entry = byKey.get(key);
      (s.modes || []).forEach(m => entry.modes.add(m));
    }
    return Array.from(byKey.values()).map(e => ({ ...e, modes: Array.from(e.modes) }));
  }

  function renderSources(sources) {
    if (!sources || !sources.length) return '';
    const merged = mergeSources(sources);
    const rows = merged.map(s => {
      const parts = [`Dropped by <strong>${escapeHtml(s.from)}</strong>`];
      if (s.rate) parts.push(`(${escapeHtml(s.rate)} chance)`);
      if (s.quantity && s.quantity !== '1') parts.push(`×${escapeHtml(s.quantity)}`);
      if (s.modes.length && s.modes.length < 3) parts.push(`<span class="tag" style="margin-left:4px;">${escapeHtml(s.modes.join(' / '))}</span>`);
      return `<li>${parts.join(' ')}</li>`;
    }).join('');
    return `<div class="recipe-detail"><span class="badge-station" style="background:var(--ranged);">Obtained from</span><ul class="ingredients">${rows}</ul></div>`;
  }

  function renderShops(shops) {
    if (!shops || !shops.length) return '';
    const rows = shops.map(s => {
      const parts = [`Sold by <strong>${escapeHtml(s.npc)}</strong>`];
      if (s.price) parts.push(`for ${escapeHtml(s.price)}`);
      return `<li>${parts.join(' ')}</li>`;
    }).join('');
    return `<div class="recipe-detail"><span class="badge-station" style="background:var(--rarity-yellow);">Sold by</span><ul class="ingredients">${rows}</ul></div>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function wikiIconUrl(name) {
    const file = name.trim().replace(/ /g, '_');
    return `https://terraria.wiki.gg/images/${encodeURIComponent(file)}.png`;
  }

  function renderResults(list) {
    if (!list.length) {
      results.innerHTML = '<div class="empty">No items found.</div>';
      return;
    }
    results.innerHTML = list.map(item => {
      const acquisitionParts = [];
      if (item.recipes && item.recipes.length) {
        acquisitionParts.push(item.recipes.map(r => `
            <div class="recipe-detail">
              ${r.station ? `<span class="badge-station">${escapeHtml(r.station)}</span>` : ''}
              ${renderIngredients(r.ingredients)}
            </div>`).join(''));
      }
      if (item.sources && item.sources.length) {
        acquisitionParts.push(renderSources(item.sources));
      }
      if (item.shops && item.shops.length) {
        acquisitionParts.push(renderShops(item.shops));
      }
      const acquisitionHtml = acquisitionParts.length
        ? acquisitionParts.join('')
        : '<div class="recipe-detail">No known crafting recipe, drop, or shop source on record (may be a starter item, found in the world, or from a rotating vendor like the Traveling Merchant).</div>';

      return `
        <div class="result-item">
          <div class="row">
            <div class="name-wrap">
              <span class="icon-slot"><img src="${wikiIconUrl(item.name)}" alt="" loading="lazy" onerror="this.parentElement.style.visibility='hidden'"></span>
              <span class="name">${escapeHtml(item.name)}</span>
            </div>
            <span class="tag">${escapeHtml(item.type || '')}</span>
          </div>
          ${item.tooltip ? `<div class="recipe-detail" style="border-top:none;padding-top:0;">${escapeHtml(item.tooltip)}</div>` : ''}
          ${acquisitionHtml}
        </div>`;
    }).join('');
  }

  input.addEventListener('input', () => {
    const q = input.value;
    if (!q.trim()) {
      results.innerHTML = '';
      meta.textContent = `${items.length.toLocaleString()} items loaded. Start typing to search.`;
      return;
    }
    const matches = search(q);
    meta.textContent = `${matches.length} match${matches.length === 1 ? '' : 'es'}`;
    renderResults(matches);
  });

  fetch('data/items.json')
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      items = data;
      index = buildIndex(items);
      meta.textContent = `${items.length.toLocaleString()} items loaded. Start typing to search.`;
    })
    .catch(err => {
      meta.textContent = 'Item database not found yet — it is generated by the "Fetch Terraria Data" GitHub Action. Run it from the Actions tab, then reload.';
      console.error(err);
    });
})();
