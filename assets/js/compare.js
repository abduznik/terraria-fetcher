// Item Comparison - pick up to 4 items and view their stats side by side.
(function () {
  const input = document.getElementById('compareSearchInput');
  const suggestions = document.getElementById('compareSuggestions');
  const meta = document.getElementById('compareMeta');
  const table = document.getElementById('compareTable');

  const MAX_ITEMS = 4;
  let items = [];
  let selected = []; // array of item objects, preserves add order
  let calcModifier = 'None';
  let calcBuffs = [];

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

  // Terraria's real per-class prefix modifier tables (damage/speed/crit are
  // multiplicative or additive exactly as the game applies them; "no prefix"
  // options included so results are directly comparable to unmodified gear).
  const MODIFIERS = {
    melee: {
      'None': { dmg: 1, speed: 1, crit: 0 },
      'Legendary': { dmg: 1.15, speed: 1.10, crit: 6 },
      'Godly': { dmg: 1.15, speed: 1, crit: 3 },
      'Demonic': { dmg: 1.15, speed: 1, crit: 0 },
      'Zealous': { dmg: 1.10, speed: 1, crit: 4 },
      'Hasty': { dmg: 1, speed: 1.10, crit: 0 }
    },
    ranged: {
      'None': { dmg: 1, speed: 1, crit: 0 },
      'Unreal': { dmg: 1.15, speed: 1.10, crit: 5 },
      'Godly': { dmg: 1.15, speed: 1, crit: 3 },
      'Demonic': { dmg: 1.15, speed: 1, crit: 0 },
      'Deadly': { dmg: 1.10, speed: 1, crit: 3 },
      'Hasty': { dmg: 1, speed: 1.10, crit: 0 }
    },
    magic: {
      'None': { dmg: 1, speed: 1, crit: 0 },
      'Mythical': { dmg: 1.15, speed: 1.10, crit: 6 },
      'Godly': { dmg: 1.15, speed: 1, crit: 3 },
      'Demonic': { dmg: 1.15, speed: 1, crit: 0 },
      'Masterful': { dmg: 1.10, speed: 1, crit: 4 },
      'Hasty': { dmg: 1, speed: 1.10, crit: 0 }
    },
    summon: {
      'None': { dmg: 1, speed: 1, crit: 0 },
      'Ruthless': { dmg: 1.18, speed: 1, crit: 0 },
      'Legendary': { dmg: 1.15, speed: 1.10, crit: 6 }
    }
  };

  // Common buffs stack additively on damage% before the multiplicative
  // prefix is applied, matching how Terraria layers damage bonuses.
  const BUFFS = [
    { key: 'wellFed', label: 'Well Fed / Fed / Plenty (+5% dmg, +2% crit)', dmg: 0.05, crit: 2 },
    { key: 'rage', label: 'Rage Potion (+10% crit)', dmg: 0, crit: 10 },
    { key: 'wrath', label: 'Wrath Potion (+10% dmg)', dmg: 0.10, crit: 0 },
    { key: 'ammoBox', label: 'Ammo Box (+9% ranged velocity - excluded from DPS)', dmg: 0, crit: 0 }
  ];

  function classFromDamageType(damageType) {
    const t = (damageType || '').toLowerCase();
    if (t.indexOf('melee') !== -1 || t.indexOf('true melee') !== -1) return 'melee';
    if (t.indexOf('ranged') !== -1) return 'ranged';
    if (t.indexOf('magic') !== -1) return 'magic';
    if (t.indexOf('summon') !== -1) return 'summon';
    if (t.indexOf('rogue') !== -1 || t.indexOf('throwing') !== -1) return 'melee';
    return null;
  }

  function isWeapon(item) {
    return parseFloat(item.damage) > 0 && !!classFromDamageType(item.damageType);
  }

  // useTime is in ticks at 60 ticks/second.
  function baseDps(item) {
    const dmg = parseFloat(item.damage);
    const useTime = parseFloat(item.useTime);
    const crit = parseFloat(item.critChance) || 0;
    if (!dmg || !useTime) return null;
    const hitsPerSecond = 60 / useTime;
    const avgDamage = dmg * (1 + (crit / 100) * 0.5); // crits deal +50% damage
    return avgDamage * hitsPerSecond;
  }

  function modifiedDps(item, modifierName, buffKeys) {
    const dmg = parseFloat(item.damage);
    const useTime = parseFloat(item.useTime);
    if (!dmg || !useTime) return null;
    const cls = classFromDamageType(item.damageType);
    const table = MODIFIERS[cls] || MODIFIERS.melee;
    const mod = table[modifierName] || table['None'];

    let dmgMult = mod.dmg;
    let critBonus = (parseFloat(item.critChance) || 0) + mod.crit;
    let speedMult = mod.speed;

    (buffKeys || []).forEach(k => {
      const b = BUFFS.find(x => x.key === k);
      if (!b) return;
      dmgMult += b.dmg; // additive damage buffs stack onto the prefix multiplier
      critBonus += b.crit;
    });

    const effectiveUseTime = useTime / speedMult;
    const hitsPerSecond = 60 / effectiveUseTime;
    const avgDamage = (dmg * dmgMult) * (1 + (critBonus / 100) * 0.5);
    return avgDamage * hitsPerSecond;
  }

  function fmtDps(v) {
    return v === null ? '—' : v.toFixed(1);
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

    const weapons = selected.filter(isWeapon);
    const hasWeapons = weapons.length > 0;
    const classesPresent = Array.from(new Set(weapons.map(w => classFromDamageType(w.damageType))));
    // Only offer a class's modifiers when every weapon on the table shares
    // it - a Melee prefix on a Ranged weapon isn't a real Terraria option.
    const singleClass = classesPresent.length === 1 ? classesPresent[0] : null;
    const modifierOptions = singleClass ? Object.keys(MODIFIERS[singleClass]) : ['None'];
    if (modifierOptions.indexOf(calcModifier) === -1) calcModifier = 'None';

    table.innerHTML = `
      ${hasWeapons ? `
      <div class="calc-panel">
        <div class="calc-row">
          <label class="calc-field">
            <span>Modifier${!singleClass && classesPresent.length > 1 ? ' (mix classes to disable)' : ''}</span>
            <select id="calcModifier" ${!singleClass ? 'disabled' : ''}>
              ${modifierOptions.map(m => `<option value="${escapeHtml(m)}" ${m === calcModifier ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="calc-row calc-buffs">
          ${BUFFS.map(b => `
            <label class="calc-buff">
              <input type="checkbox" data-buff="${escapeHtml(b.key)}" ${calcBuffs.indexOf(b.key) !== -1 ? 'checked' : ''}>
              <span>${escapeHtml(b.label)}</span>
            </label>`).join('')}
        </div>
      </div>` : ''}
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
            ${statRow('Use Time', i => i.useTime ? `${i.useTime} (${(60 / parseFloat(i.useTime)).toFixed(2)}/s)` : '')}
            ${statRow('Crit Chance', i => i.critChance ? `${i.critChance}%` : '')}
            ${hasWeapons ? statRow('Base DPS', i => isWeapon(i) ? fmtDps(baseDps(i)) : '') : ''}
            ${hasWeapons ? statRow(`Modified DPS (${escapeHtml(calcModifier)})`, i => isWeapon(i) ? fmtDps(modifiedDps(i, calcModifier, calcBuffs)) : '') : ''}
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

    const modSel = document.getElementById('calcModifier');
    if (modSel) {
      modSel.addEventListener('change', () => {
        calcModifier = modSel.value;
        renderTable();
      });
    }
    table.querySelectorAll('[data-buff]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.buff;
        calcBuffs = cb.checked ? calcBuffs.concat([key]) : calcBuffs.filter(k => k !== key);
        renderTable();
      });
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
