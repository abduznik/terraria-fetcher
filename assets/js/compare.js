// Item Comparison - pick up to 4 items and view their stats side by side.
(function () {
  const input = document.getElementById('compareSearchInput');
  const suggestions = document.getElementById('compareSuggestions');
  const meta = document.getElementById('compareMeta');
  const table = document.getElementById('compareTable');

  const MAX_ITEMS = 4;
  let items = [];
  let selected = []; // array of item objects, preserves add order

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function wikiIconUrl(name) {
    const file = name.trim().replace(/ /g, '_');
    return `https://terraria.wiki.gg/images/${encodeURIComponent(file)}.png`;
  }

  function normalize(str) { return (str || '').toLowerCase(); }

  const RARITY_NAMES = {
    '-13': 'Quest', '-12': 'Quest', '-1': 'Gray',
    '0': 'White', '1': 'Blue', '2': 'Green', '3': 'Orange', '4': 'Light Red',
    '5': 'Pink', '6': 'Light Purple', '7': 'Lime', '8': 'Yellow', '9': 'Cyan',
    '10': 'Red', '11': 'Purple'
  };

  function rarityLabel(raw) {
    if (!raw) return '—';
    const match = String(raw).match(/-?\d+/);
    if (!match) return escapeHtml(String(raw).slice(0, 20));
    return RARITY_NAMES[match[0]] || `Tier ${match[0]}`;
  }

  function findMatches(query) {
    const q = normalize(query.trim());
    if (!q) return [];
    const scored = [];
    for (const item of items) {
      const n = normalize(item.name);
      let s = -1;
      if (n === q) s = 1000;
      else if (n.startsWith(q)) s = 500 - n.length;
      else if (n.indexOf(q) !== -1) s = 200 - n.indexOf(q);
      if (s > 0) scored.push({ s, item });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 10).map(x => x.item);
  }

  function renderSuggestions(matches) {
    if (!matches.length) { suggestions.innerHTML = ''; return; }
    suggestions.innerHTML = '<ul class="suggestion-list">' + matches.map(m => `
      <li class="suggestion-item" data-name="${escapeHtml(m.name)}">
        <span class="icon-slot" style="width:32px;height:32px;"><img src="${wikiIconUrl(m.name)}" alt="" loading="lazy" onerror="this.parentElement.style.visibility='hidden'"></span>
        <span>${escapeHtml(m.name)}</span>
        <span class="tag" style="margin-left:auto;">${escapeHtml(m.type || '')}</span>
      </li>`).join('') + '</ul>';

    suggestions.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', () => addItem(el.dataset.name));
    });
  }

  function addItem(name) {
    if (selected.length >= MAX_ITEMS) {
      meta.textContent = `You can compare up to ${MAX_ITEMS} items at once. Remove one first.`;
      return;
    }
    const item = items.find(i => i.name === name);
    if (!item || selected.some(i => i.name === name)) return;
    selected.push(item);
    input.value = '';
    suggestions.innerHTML = '';
    renderTable();
  }

  function removeItem(name) {
    selected = selected.filter(i => i.name !== name);
    renderTable();
  }

  function statRow(label, getter) {
    const values = selected.map(getter);
    const numeric = values.map(v => parseFloat(v));
    const allNumeric = numeric.every(v => !isNaN(v));
    const best = allNumeric ? Math.max(...numeric) : null;
    return `
      <tr>
        <th>${label}</th>
        ${values.map((v, idx) => {
          const isBest = allNumeric && numeric[idx] === best && best > 0 && selected.length > 1;
          return `<td class="${isBest ? 'compare-best' : ''}">${v === '' || v === undefined || v === null ? '—' : escapeHtml(String(v))}</td>`;
        }).join('')}
      </tr>`;
  }

  function renderTable() {
    if (!selected.length) {
      table.innerHTML = '';
      meta.textContent = `${items.length.toLocaleString()} items loaded. Search above to add items to compare.`;
      return;
    }
    meta.textContent = `Comparing ${selected.length} item${selected.length === 1 ? '' : 's'}. Highlighted cells mark the best value in each row.`;

    table.innerHTML = `
      <div class="result-item compare-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th></th>
              ${selected.map(item => `
                <th>
                  <span class="icon-slot"><img src="${wikiIconUrl(item.name)}" alt="" loading="lazy" onerror="this.parentElement.style.visibility='hidden'"></span>
                  <div class="compare-name">${escapeHtml(item.name)}</div>
                  <button class="tree-reroot-btn" data-remove="${escapeHtml(item.name)}">Remove</button>
                </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${statRow('Type', i => i.type)}
            ${statRow('Damage', i => i.damage)}
            ${statRow('Damage Type', i => i.damageType)}
            ${statRow('Defense', i => i.defense)}
            ${statRow('Rarity', i => rarityLabel(i.rarity))}
            ${statRow('Sell Value', i => i.sellValue)}
            ${statRow('Has Recipe?', i => (i.recipes && i.recipes.length) ? 'Yes' : 'No')}
          </tbody>
        </table>
      </div>`;

    table.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => removeItem(btn.dataset.remove));
    });
  }

  input.addEventListener('input', () => {
    renderSuggestions(findMatches(input.value));
  });

  document.addEventListener('click', (e) => {
    if (!suggestions.contains(e.target) && e.target !== input) suggestions.innerHTML = '';
  });

  fetch('data/items.json')
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      items = data;
      meta.textContent = `${items.length.toLocaleString()} items loaded. Search above to add items to compare.`;
    })
    .catch(err => {
      meta.textContent = 'Item database not found yet — it is generated by the "Fetch Terraria Data" GitHub Action. Run it from the Actions tab, then reload.';
      console.error(err);
    });
})();
