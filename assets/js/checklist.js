(function () {
  const stageTabs = document.getElementById('stageTabs');
  const progressEl = document.getElementById('stageProgress');
  const container = document.getElementById('checklistContainer');
  const resetBtn = document.getElementById('resetBtn');

  const STORAGE_PREFIX = 'terraria-fetcher:checklist:';

  let stages = [];
  let activeStage = null;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function storageKey(stageId) {
    return STORAGE_PREFIX + stageId;
  }

  function loadChecked(stageId) {
    try {
      const raw = localStorage.getItem(storageKey(stageId));
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveChecked(stageId, checkedMap) {
    try {
      localStorage.setItem(storageKey(stageId), JSON.stringify(checkedMap));
    } catch (e) {
      // localStorage unavailable (private mode etc.) - fail silently
    }
  }

  function itemKey(section, index) {
    return `${section}:${index}`;
  }

  function countTotalAndChecked(stage, checkedMap) {
    let total = 0, checked = 0;
    const sections = { bosses: stage.bosses, npcs: stage.npcs, money: stage.money, optional: stage.optional };
    for (const [sectionName, list] of Object.entries(sections)) {
      (list || []).forEach((_, i) => {
        total++;
        if (checkedMap[itemKey(sectionName, i)]) checked++;
      });
    }
    return { total, checked };
  }

  function renderTabs() {
    stageTabs.innerHTML = stages.map(s =>
      `<button class="filter-btn stage-tab ${s.id === activeStage ? 'active' : ''}" data-stage="${s.id}">${escapeHtml(s.title)}</button>`
    ).join('');

    stageTabs.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        activeStage = btn.dataset.stage;
        renderTabs();
        renderStage();
      });
    });
  }

  function renderProgress(stage, checkedMap) {
    const { total, checked } = countTotalAndChecked(stage, checkedMap);
    const pct = total ? Math.round((checked / total) * 100) : 0;
    progressEl.innerHTML = `
      <div class="progress-label">${checked} / ${total} complete (${pct}%)</div>
      <div class="hp-bar" style="height:14px;"><span style="width:${pct}%; background: linear-gradient(180deg, var(--summoner), var(--mana-dark));"></span></div>
    `;
  }

  function wikiIconUrl(name) {
    const cleanName = name.split('(')[0].split('/')[0].split(',')[0].trim();
    const file = cleanName.replace(/ /g, '_');
    return `https://terraria.wiki.gg/images/${encodeURIComponent(file)}.png`;
  }

  function renderSection(title, items, sectionName, checkedMap, withNotes, withIcons) {
    if (!items || !items.length) {
      return `<div class="checklist-section"><h4>${title}</h4><p class="empty-inline">Nothing tracked here for this stage.</p></div>`;
    }
    const rows = items.map((item, i) => {
      const label = withNotes ? item.name : item;
      const note = withNotes ? item.note : null;
      const key = itemKey(sectionName, i);
      const checked = !!checkedMap[key];
      const icon = withIcons
        ? `<span class="icon-slot checklist-icon"><img src="${wikiIconUrl(label)}" alt="" loading="lazy" onerror="this.parentElement.style.visibility='hidden'"></span>`
        : '';
      return `
        <label class="checklist-item ${checked ? 'checked' : ''}">
          <input type="checkbox" data-key="${key}" ${checked ? 'checked' : ''}>
          ${icon}
          <span class="checklist-text">
            <span class="checklist-name">${escapeHtml(label)}</span>
            ${note ? `<span class="checklist-note">${escapeHtml(note)}</span>` : ''}
          </span>
        </label>`;
    }).join('');
    return `<div class="checklist-section"><h4>${title}</h4>${rows}</div>`;
  }

  function renderStage() {
    const stage = stages.find(s => s.id === activeStage);
    if (!stage) {
      container.innerHTML = '<div class="empty">Stage not found.</div>';
      return;
    }
    const checkedMap = loadChecked(stage.id);
    renderProgress(stage, checkedMap);

    container.innerHTML = `
      <section class="build-section checklist-stage">
        <h2>${escapeHtml(stage.title)}</h2>
        <p>${escapeHtml(stage.summary)}</p>
        <div class="checklist-grid">
          ${renderSection('🐉 Bosses', stage.bosses, 'bosses', checkedMap, true, true)}
          ${renderSection('🧑‍🤝‍🧑 NPCs to unlock', stage.npcs, 'npcs', checkedMap, false, true)}
          ${renderSection('💰 Money &amp; Economy', stage.money, 'money', checkedMap, false, false)}
          ${renderSection('⭐ Optional', stage.optional, 'optional', checkedMap, false, false)}
        </div>
      </section>
    `;

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const map = loadChecked(stage.id);
        map[cb.dataset.key] = cb.checked;
        saveChecked(stage.id, map);
        cb.closest('.checklist-item').classList.toggle('checked', cb.checked);
        renderProgress(stage, map);
      });
    });
  }

  resetBtn.addEventListener('click', () => {
    if (!activeStage) return;
    if (!confirm('Reset all checked progress for this stage?')) return;
    localStorage.removeItem(storageKey(activeStage));
    renderStage();
  });

  fetch('checklist.json')
    .then(r => r.json())
    .then(data => {
      stages = data;
      activeStage = stages[0] && stages[0].id;
      if (location.hash) {
        const fromHash = stages.find(s => s.id === location.hash.slice(1));
        if (fromHash) activeStage = fromHash.id;
      }
      renderTabs();
      renderStage();
    })
    .catch(err => {
      container.innerHTML = '<div class="empty">Could not load checklist.json.</div>';
      console.error(err);
    });
})();
