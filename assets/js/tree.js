// Interactive Crafting Tree - an actual visual node/branch diagram.
// Root sits at the top; clicking a node's "obtain" button expands its own
// recipe as connected child nodes below it, drawn with SVG lines so you can
// see the whole crafting graph branch out visually, not just an indented list.
(function () {
  const input = document.getElementById('treeSearchInput');
  const meta = document.getElementById('treeMeta');
  const suggestions = document.getElementById('treeSuggestions');
  const treeRoot = document.getElementById('treeRoot');

  const NODE_W = 150;
  const NODE_H = 78;
  const H_GAP = 24;   // horizontal gap between sibling nodes
  const V_GAP = 70;   // vertical gap between levels

  let items = [];
  let itemsByName = new Map();
  let currentRootName = null;
  // Which nodes are expanded, keyed by path string (same item can appear
  // twice in a tree with independent expand states).
  const expanded = new Set();
  // Back/forward history of root items, so re-rooting via the Magic Mirror
  // button can be undone instead of being a one-way trip.
  const rootHistory = [];
  let rootFuture = [];

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

  function setRoot(name, opts) {
    opts = opts || {};
    if (!itemsByName.has(name)) return;
    if (currentRootName && currentRootName !== name && !opts.skipHistory) {
      rootHistory.push(currentRootName);
      rootFuture = []; // navigating fresh invalidates any redo history
    }
    currentRootName = name;
    expanded.clear();
    expanded.add('0');
    input.value = name;
    suggestions.innerHTML = '';
    renderTree();
  }

  function goBack() {
    if (!rootHistory.length) return;
    const prev = rootHistory.pop();
    rootFuture.push(currentRootName);
    setRoot(prev, { skipHistory: true });
  }

  function goForward() {
    if (!rootFuture.length) return;
    const next = rootFuture.pop();
    rootHistory.push(currentRootName);
    setRoot(next, { skipHistory: true });
  }

  // --- Tree data model -------------------------------------------------
  // Build a plain node tree { name, qty, path, station, hasRecipe, isOpen,
  // acquireLabel, children: [] } that we then lay out with x/y coordinates.

  function acquireSummary(item) {
    if (!item) return 'Unknown item';
    if (item.recipes && item.recipes.length) return null; // handled via expand
    if (item.sources && item.sources.length) {
      const s = item.sources[0];
      return `Drops from ${s.from}${item.sources.length > 1 ? ` (+${item.sources.length - 1} more)` : ''}`;
    }
    if (item.shops && item.shops.length) {
      const s = item.shops[0];
      return `Sold by ${s.npc}`;
    }
    return 'No known source on record';
  }

  function buildNode(name, qty, path, station, seen) {
    const item = itemsByName.get(name);
    const hasRecipe = !!(item && item.recipes && item.recipes.length && !seen.has(name));
    const isOpen = expanded.has(path);
    const node = {
      name, qty, path, station,
      hasRecipe,
      isOpen,
      acquireLabel: acquireSummary(item),
      recipeStation: hasRecipe ? item.recipes[0].station : null,
      children: []
    };
    if (hasRecipe && isOpen) {
      const recipe = item.recipes[0];
      const nextSeen = new Set(seen);
      nextSeen.add(name);
      const timesToCraft = Math.ceil(qty / (recipe.amount || 1));
      node.children = recipe.ingredients.map((ing, idx) =>
        buildNode(ing.name, (ing.qty || 1) * timesToCraft, `${path}.${idx}`, null, nextSeen));
    }
    return node;
  }

  // --- Layout: classic tidy-tree via subtree width accumulation --------

  function layout(node, depth, xCursor) {
    node.depth = depth;
    if (!node.children.length) {
      node.x = xCursor.value;
      node.width = NODE_W;
      xCursor.value += NODE_W + H_GAP;
      return node.width;
    }
    let childrenWidth = 0;
    for (const child of node.children) {
      childrenWidth += layout(child, depth + 1, xCursor);
    }
    childrenWidth -= H_GAP; // last sibling's trailing gap doesn't count
    const firstChild = node.children[0];
    const lastChild = node.children[node.children.length - 1];
    const center = (firstChild.x + lastChild.x + NODE_W) / 2;
    node.x = center - NODE_W / 2;
    node.width = Math.max(NODE_W, childrenWidth);
    return node.width;
  }

  function collectBounds(node, bounds) {
    bounds.maxX = Math.max(bounds.maxX, node.x + NODE_W);
    bounds.minX = Math.min(bounds.minX, node.x);
    bounds.maxDepth = Math.max(bounds.maxDepth, node.depth);
    node.children.forEach(c => collectBounds(c, bounds));
  }

  // --- Rendering ---------------------------------------------------------

  function nodeHtml(node) {
    const y = node.depth * (NODE_H + V_GAP);
    const qtyLabel = node.qty > 1 ? `${node.qty}× ` : '';
    const canExpand = node.hasRecipe;
    const stationTag = node.recipeStation && node.recipeStation !== 'By Hand' ? escapeHtml(node.recipeStation) : (canExpand ? 'By Hand' : '');

    let sub;
    if (canExpand) {
      sub = node.isOpen
        ? `<span class="tnode-sub tnode-station">${stationTag}</span>`
        : `<span class="tnode-sub tnode-hint">click to craft &darr;</span>`;
    } else {
      sub = `<span class="tnode-sub tnode-source">${escapeHtml(node.acquireLabel || '')}</span>`;
    }

    return `
      <div class="tnode ${canExpand ? 'expandable' : 'leaf'} ${node.isOpen ? 'open' : ''}"
           style="left:${node.x}px; top:${y}px; width:${NODE_W}px; height:${NODE_H}px;"
           data-path="${node.path}" data-name="${escapeHtml(node.name)}">
        <div class="tnode-icon"><img src="${wikiIconUrl(node.name)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></div>
        <div class="tnode-body">
          <div class="tnode-name">${qtyLabel}${escapeHtml(node.name)}</div>
          ${sub}
        </div>
        <button class="tnode-root-btn" data-reroot="${escapeHtml(node.name)}" title="View as root"><img class="inline-icon sm" src="https://terraria.wiki.gg/images/Magic_Mirror.png" alt="" loading="lazy" onerror="this.style.display='none'"></button>
      </div>`;
  }

  function connectorSvg(node, svgParts) {
    if (node.children.length) {
      const parentY = node.depth * (NODE_H + V_GAP) + NODE_H;
      const parentX = node.x + NODE_W / 2;
      for (const child of node.children) {
        const childY = child.depth * (NODE_H + V_GAP);
        const childX = child.x + NODE_W / 2;
        const midY = (parentY + childY) / 2;
        svgParts.push(`<path d="M ${parentX} ${parentY} C ${parentX} ${midY}, ${childX} ${midY}, ${childX} ${childY}" class="tree-edge" />`);
      }
      node.children.forEach(c => connectorSvg(c, svgParts));
    }
  }

  function flattenNodes(node, out) {
    out.push(node);
    node.children.forEach(c => flattenNodes(c, out));
  }

  function renderTree() {
    if (!currentRootName) { treeRoot.innerHTML = ''; return; }
    const item = itemsByName.get(currentRootName);
    if (!item) { treeRoot.innerHTML = '<div class="empty">Item not found.</div>'; return; }

    const initialQty = (item.recipes && item.recipes.length) ? (item.recipes[0].amount || 1) : 1;
    const tree = buildNode(item.name, initialQty, '0', null, new Set());
    layout(tree, 0, { value: 0 });

    const bounds = { minX: 0, maxX: NODE_W, maxDepth: 0 };
    collectBounds(tree, bounds);

    // Shift everything so minX = 0
    const shiftX = -bounds.minX;
    const allNodes = [];
    flattenNodes(tree, allNodes);
    allNodes.forEach(n => { n.x += shiftX; });

    const totalWidth = bounds.maxX - bounds.minX + 40;
    const totalHeight = (bounds.maxDepth + 1) * (NODE_H + V_GAP);

    const svgParts = [];
    connectorSvg(tree, svgParts);

    treeRoot.innerHTML = `
      <div class="result-item">
        <div class="row">
          <div class="name-wrap">
            <span class="icon-slot"><img src="${wikiIconUrl(item.name)}" alt="" loading="lazy" onerror="this.parentElement.style.visibility='hidden'"></span>
            <span class="name">${escapeHtml(item.name)}</span>
          </div>
          <span class="tag">${allNodes.length} node${allNodes.length === 1 ? '' : 's'} shown</span>
        </div>
        <div class="tree-controls">
          <button id="backRootBtn" class="filter-btn" ${rootHistory.length ? '' : 'disabled'} title="Go back to the previous root item">&larr; Back</button>
          <button id="forwardRootBtn" class="filter-btn" ${rootFuture.length ? '' : 'disabled'} title="Redo the re-root you just undid">Forward &rarr;</button>
          <button id="expandAllBtn" class="filter-btn">Expand all</button>
          <button id="collapseAllBtn" class="filter-btn">Collapse all</button>
          <span class="tree-hint">Click a node to reveal how it's obtained. Click <img class="inline-icon sm" src="https://terraria.wiki.gg/images/Magic_Mirror.png" alt="" loading="lazy" onerror="this.style.display='none'"> to re-center the tree on that item (use Back to undo).</span>
        </div>
        <div class="tree-canvas-scroll">
          <div class="tree-canvas" style="width:${totalWidth}px; height:${totalHeight}px;">
            <svg class="tree-svg" width="${totalWidth}" height="${totalHeight}">${svgParts.join('')}</svg>
            ${allNodes.map(nodeHtml).join('')}
          </div>
        </div>
      </div>`;

    wireTreeEvents(tree);
  }

  function collectAllPathsForRoot(name) {
    // Walk the *possible* tree (ignoring current expand state) to gather every path.
    function walk(nm, path, seen, out) {
      out.add(path);
      const it = itemsByName.get(nm);
      if (!it || !it.recipes || !it.recipes.length || seen.has(nm)) return;
      const nextSeen = new Set(seen);
      nextSeen.add(nm);
      it.recipes[0].ingredients.forEach((ing, idx) => walk(ing.name, `${path}.${idx}`, nextSeen, out));
    }
    const out = new Set();
    walk(name, '0', new Set(), out);
    return out;
  }

  function wireTreeEvents() {
    treeRoot.querySelectorAll('.tnode.expandable').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tnode-root-btn')) return;
        const path = el.dataset.path;
        if (expanded.has(path)) expanded.delete(path); else expanded.add(path);
        renderTree();
      });
    });
    treeRoot.querySelectorAll('.tnode-root-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setRoot(btn.dataset.reroot);
      });
    });
    const backBtn = document.getElementById('backRootBtn');
    const forwardBtn = document.getElementById('forwardRootBtn');
    if (backBtn) backBtn.addEventListener('click', goBack);
    if (forwardBtn) forwardBtn.addEventListener('click', goForward);
    const expandAllBtn = document.getElementById('expandAllBtn');
    const collapseAllBtn = document.getElementById('collapseAllBtn');
    if (expandAllBtn) expandAllBtn.addEventListener('click', () => {
      const all = collectAllPathsForRoot(currentRootName);
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
      for (const it of items) itemsByName.set(it.name, it);
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
