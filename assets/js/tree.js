// Interactive Crafting Tree - click-to-expand recipe tree, with the ability
// to re-root the whole view on any ingredient (great for huge trees like
// endgame swords/accessories where the static list view gets unwieldy).
(function () {
  const input = document.getElementById('treeSearchInput');
  const meta = document.getElementById('treeMeta');
  const suggestions = document.getElementById('treeSuggestions');
  const treeRoot = document.getElementById('treeRoot');

  let items = [];
  let itemsByName = new Map();
  let currentRootName = null;
  // Which nodes are expanded, keyed by a path string so the same item
  // appearing twice in a tree can have independent expand states.
  const expanded = new Set();

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
    return scored.slice(0, 12).map(x => x.item);
  }

  function renderSuggestions(matches) {
    if (!matches.length) { suggestions.innerHTML = ''; return; }
    suggestions.innerHTML = '<ul class="suggestion-list">' + matches.map(m => `
      <li class="suggestion-item" data-name="${escapeHtml(m.name)}">
        <span class="icon-slot" style="width:32px;height:32px;"><img src="${wikiIconUrl(m.name)}" alt="" loading="lazy" onerror="this.parentElement.style.visibility='hidden'"></span>
        <span>${escapeHtml(m.name)}</span>
        ${m.recipes && m.recipes.length ? '' : '<span class="tag" style="margin-left:auto;">no recipe</span>'}
      </li>`).join('') + '</ul>';

    suggestions.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', () => setRoot(el.dataset.name));
    });
  }

  function setRoot(name) {
    if (!itemsByName.has(name)) return;
    currentRootName = name;
    expanded.clear();
    expanded.add('0'); // auto-expand the root node
    input.value = name;
    suggestions.innerHTML = '';
    renderTree();
  }

  function countDescendants(name, seen) {
    const item = itemsByName.get(name);
    if (!item || !item.recipes || !item.recipes.length || seen.has(name)) return 0;
    const nextSeen = new Set(seen);
    nextSeen.add(name);
    const recipe = item.recipes[0];
    let count = recipe.ingredients.length;
    for (const ing of recipe.ingredients) {
      count += countDescendants(ing.name, nextSeen);
    }
    return count;
  }

  function renderNode(name, qty, path, station, seen) {
    const item = itemsByName.get(name);
    const hasRecipe = item && item.recipes && item.recipes.length && !seen.has(name);
    const isOpen = expanded.has(path);
    const qtyLabel = qty > 1 ? `${qty}× ` : '';
    const stationTag = station && station !== 'By Hand'
      ? `<span class="tag" style="margin-left:6px;">${escapeHtml(station)}</span>` : '';

    let childrenHtml = '';
    if (hasRecipe && isOpen) {
      const recipe = item.recipes[0];
      const nextSeen = new Set(seen);
      nextSeen.add(name);
      childrenHtml = '<ul class="tree-children">' + recipe.ingredients.map((ing, idx) => {
        const perCraft = ing.qty || 1;
        const timesToCraft = Math.ceil(qty / (recipe.amount || 1));
        return renderNode(ing.name, perCraft * timesToCraft, `${path}.${idx}`, null, nextSeen);
      }).join('') + '</ul>';
    }

    const toggleIcon = hasRecipe ? (isOpen ? '▾' : '▸') : '·';
    const descendantCount = hasRecipe ? countDescendants(name, seen) : 0;
    const sizeTag = descendantCount > 8
      ? `<span class="tag" style="margin-left:6px;background:var(--rarity-orange);">${descendantCount} ingredients</span>` : '';

    return `
      <li class="tree-node" data-path="${path}">
        <div class="tree-row ${hasRecipe ? 'expandable' : ''}" data-name="${escapeHtml(name)}" data-path="${path}">
          <span class="tree-toggle">${toggleIcon}</span>
          <span class="chain-icon-slot"><img src="${wikiIconUrl(name)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span>
          <span class="tree-label">${qtyLabel}${escapeHtml(name)}</span>
          ${stationTag}
          ${sizeTag}
          <button class="tree-reroot-btn" data-reroot="${escapeHtml(name)}" title="Make this the root item">⤴ view as root</button>
        </div>
        ${childrenHtml}
      </li>`;
  }

  function renderTree() {
    if (!currentRootName) { treeRoot.innerHTML = ''; return; }
    const item = itemsByName.get(currentRootName);
    if (!item) { treeRoot.innerHTML = '<div class="empty">Item not found.</div>'; return; }

    if (!item.recipes || !item.recipes.length) {
      treeRoot.innerHTML = `
        <div class="result-item">
          <div class="row">
            <div class="name-wrap">
              <span class="icon-slot"><img src="${wikiIconUrl(item.name)}" alt="" loading="lazy" onerror="this.parentElement.style.visibility='hidden'"></span>
              <span class="name">${escapeHtml(item.name)}</span>
            </div>
          </div>
          <div class="recipe-detail">This item has no known crafting recipe &mdash; it's a base material, drop, or shop item. Try another item, or check the <a href="bosses.html">Boss Drops</a> page to see what drops it.</div>
        </div>`;
      return;
    }

    const recipe = item.recipes[0];
    treeRoot.innerHTML = `
      <div class="result-item">
        <div class="row">
          <div class="name-wrap">
            <span class="icon-slot"><img src="${wikiIconUrl(item.name)}" alt="" loading="lazy" onerror="this.parentElement.style.visibility='hidden'"></span>
            <span class="name">${escapeHtml(item.name)}</span>
          </div>
          ${recipe.station ? `<span class="badge-station">${escapeHtml(recipe.station)}</span>` : ''}
        </div>
        <div class="tree-controls">
          <button id="expandAllBtn" class="filter-btn">Expand all</button>
          <button id="collapseAllBtn" class="filter-btn">Collapse all</button>
        </div>
        <ul class="chain-list chain-root tree-list">
          ${renderNode(item.name, recipe.amount || 1, '0', null, new Set())}
        </ul>
      </div>`;

    wireTreeEvents();
  }

  function collectAllPaths(name, path, seen, out) {
    out.add(path);
    const item = itemsByName.get(name);
    if (!item || !item.recipes || !item.recipes.length || seen.has(name)) return;
    const nextSeen = new Set(seen);
    nextSeen.add(name);
    const recipe = item.recipes[0];
    recipe.ingredients.forEach((ing, idx) => collectAllPaths(ing.name, `${path}.${idx}`, nextSeen, out));
  }

  function wireTreeEvents() {
    treeRoot.querySelectorAll('.tree-row.expandable .tree-toggle, .tree-row.expandable .tree-label, .tree-row.expandable .chain-icon-slot').forEach(el => {
      el.addEventListener('click', (e) => {
        const row = e.currentTarget.closest('.tree-row');
        const path = row.dataset.path;
        if (expanded.has(path)) expanded.delete(path); else expanded.add(path);
        renderTree();
      });
    });
    treeRoot.querySelectorAll('.tree-reroot-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setRoot(btn.dataset.reroot);
      });
    });
    const expandAllBtn = document.getElementById('expandAllBtn');
    const collapseAllBtn = document.getElementById('collapseAllBtn');
    if (expandAllBtn) expandAllBtn.addEventListener('click', () => {
      const all = new Set();
      collectAllPaths(currentRootName, '0', new Set(), all);
      all.forEach(p => expanded.add(p));
      renderTree();
    });
    if (collapseAllBtn) collapseAllBtn.addEventListener('click', () => {
      expanded.clear();
      expanded.add('0');
      renderTree();
    });
  }

  input.addEventListener('input', () => {
    const matches = findMatches(input.value);
    renderSuggestions(matches);
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
      for (const item of items) itemsByName.set(item.name, item);
      meta.textContent = `${items.length.toLocaleString()} items loaded. Search for an item to view its crafting tree.`;

      const params = new URLSearchParams(location.search);
      const initial = params.get('item');
      if (initial && itemsByName.has(initial)) setRoot(initial);
    })
    .catch(err => {
      meta.textContent = 'Item database not found yet — it is generated by the "Fetch Terraria Data" GitHub Action. Run it from the Actions tab, then reload.';
      console.error(err);
    });
})();
