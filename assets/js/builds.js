(function () {
  const classLabels = {
    melee: 'Melee',
    ranged: 'Ranged',
    mage: 'Mage',
    summoner: 'Summoner',
    rogue: 'Rogue'
  };
  const stageLabels = {
    prehardmode: 'Pre-Hardmode',
    'hardmode-early': 'Early Hardmode',
    'post-mech-plantera': 'Post-Mech → Plantera',
    'post-plantera-golem': 'Post-Plantera → Golem',
    'post-golem': 'Post-Golem → Moon Lord',
    'post-moonlord': 'Post-Moon Lord'
  };

  const stageOrder = ['prehardmode', 'hardmode-early', 'post-mech-plantera', 'post-plantera-golem', 'post-golem', 'post-moonlord'];

  const classFilterEl = document.getElementById('classFilter');
  const stageFilterEl = document.getElementById('stageFilter');
  const container = document.getElementById('buildsContainer');

  let builds = [];
  let activeClass = 'all';
  let activeStage = 'all';

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderFilters() {
    const classes = ['all', ...Object.keys(classLabels).filter(c => builds.some(b => b.class === c))];
    classFilterEl.innerHTML = classes.map(c =>
      `<button class="filter-btn ${c === activeClass ? 'active' : ''}" data-class="${c}">${c === 'all' ? 'All Classes' : classLabels[c]}</button>`
    ).join('');

    const stagesPresent = stageOrder.filter(s => builds.some(b => b.stage === s));
    const stages = ['all', ...stagesPresent];
    stageFilterEl.innerHTML = stages.map(s =>
      `<button class="filter-btn ${s === activeStage ? 'active' : ''}" data-stage="${s}">${s === 'all' ? 'All Stages' : stageLabels[s] || s}</button>`
    ).join('');

    classFilterEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        activeClass = btn.dataset.class;
        renderFilters();
        renderBuilds();
      });
    });
    stageFilterEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        activeStage = btn.dataset.stage;
        renderFilters();
        renderBuilds();
      });
    });
  }

  function wikiIconUrl(name) {
    const file = name.trim().replace(/ /g, '_');
    return `https://terraria.wiki.gg/images/${encodeURIComponent(file)}.png`;
  }

  function renderList(items) {
    if (!items || !items.length) return '';
    return '<ul class="gear-list">' + items.map(item => {
      const icon = item && item.icon;
      const label = item && item.label !== undefined ? item.label : item;
      return `
        <li class="gear-item">
          ${icon ? `<span class="icon-slot gear-icon"><img src="${wikiIconUrl(icon)}" alt="" loading="lazy" onerror="this.parentElement.style.visibility='hidden'"></span>` : ''}
          <span>${escapeHtml(label)}</span>
        </li>`;
    }).join('') + '</ul>';
  }

  function renderBuilds() {
    const filtered = builds.filter(b =>
      (activeClass === 'all' || b.class === activeClass) &&
      (activeStage === 'all' || b.stage === activeStage)
    );

    if (!filtered.length) {
      container.innerHTML = '<div class="empty">No builds match this filter yet.</div>';
      return;
    }

    container.innerHTML = filtered.map(b => `
      <section class="build-section" id="${b.id}">
        <h2>
          ${escapeHtml(b.title)}
          <span class="class-chip ${b.class}">${classLabels[b.class] || b.class}</span>
          <span class="stage-chip">${stageLabels[b.stage] || b.stage}</span>
        </h2>
        <p>${escapeHtml(b.summary)}</p>
        <div class="gear-grid">
          <div class="gear-col">
            <h4>Weapons</h4>
            ${renderList(b.weapons)}
          </div>
          <div class="gear-col">
            <h4>Armor</h4>
            ${renderList(b.armor)}
          </div>
          <div class="gear-col">
            <h4>Accessories</h4>
            ${renderList(b.accessories)}
          </div>
        </div>
        ${b.notes ? `<div class="notes">${escapeHtml(b.notes)}</div>` : ''}
      </section>
    `).join('');
  }

  fetch('builds.json')
    .then(r => r.json())
    .then(data => {
      builds = data;
      renderFilters();
      renderBuilds();

      if (location.hash) {
        const el = document.getElementById(location.hash.slice(1));
        if (el) el.scrollIntoView();
      }
    })
    .catch(err => {
      container.innerHTML = '<div class="empty">Could not load builds.json.</div>';
      console.error(err);
    });
})();
