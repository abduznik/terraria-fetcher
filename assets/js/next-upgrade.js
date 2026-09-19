// "What's my next upgrade?" - turns the curated build data into a decision.
// The build guides already list everything for a stage; the complaint they
// don't answer is "I have some of this already, what do I actually chase
// next". This filters a stage's loadout down to what the player is missing.
(function () {
  var root = document.getElementById('nextUpgrade');
  if (!root) return;

  var classSel = document.getElementById('nuClass');
  var stageSel = document.getElementById('nuStage');
  var variantSel = document.getElementById('nuVariant');
  var ownedEl = document.getElementById('nuOwned');
  var resultEl = document.getElementById('nuResult');

  var classLabels = {
    melee: 'Melee', ranged: 'Ranged', mage: 'Mage',
    summoner: 'Summoner', rogue: 'Rogue'
  };
  var stageLabels = {
    prehardmode: 'Pre-Hardmode',
    'hardmode-early': 'Early Hardmode',
    'post-mech-plantera': 'Post-Mech → Plantera',
    'post-plantera-golem': 'Post-Plantera → Golem',
    'post-golem': 'Post-Golem → Moon Lord',
    'post-moonlord': 'Post-Moon Lord'
  };
  var stageOrder = ['prehardmode', 'hardmode-early', 'post-mech-plantera',
    'post-plantera-golem', 'post-golem', 'post-moonlord'];
  var variantLabels = { accessible: 'Easiest to get', bis: 'Best-in-slot' };

  // Weapon first: it moves the needle most when you're stuck on a boss.
  var SLOT_ORDER = ['weapons', 'armor', 'accessories'];
  var SLOT_LABELS = { weapons: 'Weapon', armor: 'Armor', accessories: 'Accessory' };

  var builds = [];
  var owned = {};

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function wikiIconUrl(name) {
    return 'https://terraria.wiki.gg/images/' + encodeURIComponent(name.trim().replace(/ /g, '_')) + '.png';
  }

  function fillSelect(sel, values, labels) {
    sel.innerHTML = values.map(function (v) {
      return '<option value="' + escapeHtml(v) + '">' + escapeHtml(labels[v] || v) + '</option>';
    }).join('');
  }

  function currentBuild() {
    var c = classSel.value, s = stageSel.value, v = variantSel.value;
    var matches = builds.filter(function (b) {
      return b.class === c && b.stage === s && (!b.variant || b.variant === v);
    });
    return matches[0] || null;
  }

  // Gear is keyed by name so a piece stays ticked when switching variants -
  // the accessible and BiS lists overlap heavily.
  function gearKey(name) { return name.toLowerCase(); }

  function allGear(build) {
    var out = [];
    SLOT_ORDER.forEach(function (slot) {
      (build[slot] || []).forEach(function (g) {
        if (g && g.icon) out.push({ slot: slot, name: g.icon, label: g.label || g.icon });
      });
    });
    return out;
  }

  function renderOwned(build) {
    var gear = allGear(build);
    if (!gear.length) { ownedEl.hidden = true; ownedEl.innerHTML = ''; return; }
    ownedEl.hidden = false;
    ownedEl.innerHTML = '<div class="nu-owned-title">Already have:</div>' +
      '<div class="nu-owned-list">' + gear.map(function (g) {
        var k = gearKey(g.name);
        return '<label class="nu-chip' + (owned[k] ? ' nu-chip-on' : '') + '">' +
          '<input type="checkbox" data-gear="' + escapeHtml(k) + '"' + (owned[k] ? ' checked' : '') + '>' +
          '<span>' + escapeHtml(g.name) + '</span></label>';
      }).join('') + '</div>';

    ownedEl.querySelectorAll('input[data-gear]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        owned[cb.getAttribute('data-gear')] = cb.checked;
        render();
      });
    });
  }

  function renderResult(build) {
    var missing = allGear(build).filter(function (g) { return !owned[gearKey(g.name)]; });

    if (!missing.length) {
      var next = stageOrder[stageOrder.indexOf(build.stage) + 1];
      resultEl.innerHTML = '<div class="nu-done">You have everything listed for this stage. ' +
        (next
          ? 'Next up: <button type="button" class="nu-advance" data-stage="' + escapeHtml(next) + '">' + escapeHtml(stageLabels[next]) + '</button>'
          : 'That’s the end of the curated progression.') +
        '</div>';
      var adv = resultEl.querySelector('.nu-advance');
      if (adv) {
        adv.addEventListener('click', function () {
          stageSel.value = adv.getAttribute('data-stage');
          render();
        });
      }
      return;
    }

    // One pick per slot keeps this a decision rather than another full list.
    var picks = [];
    SLOT_ORDER.forEach(function (slot) {
      var first = missing.filter(function (g) { return g.slot === slot; })[0];
      if (first) picks.push(first);
    });

    var rest = missing.length - picks.length;
    resultEl.innerHTML =
      '<ol class="nu-picks">' + picks.map(function (g) {
        return '<li class="nu-pick">' +
          '<span class="nu-slot">' + escapeHtml(SLOT_LABELS[g.slot]) + '</span>' +
          '<a class="nu-pick-link" href="../fetcher.html?q=' + encodeURIComponent(g.name) + '">' +
            '<span class="icon-slot nu-icon"><img src="' + wikiIconUrl(g.name) + '" alt="" loading="lazy" onerror="this.parentElement.style.visibility=\'hidden\'"></span>' +
            '<span class="nu-pick-text">' + escapeHtml(g.label) + '</span>' +
          '</a></li>';
      }).join('') + '</ol>' +
      '<div class="nu-more">' +
        (rest > 0 ? rest + ' more item' + (rest === 1 ? '' : 's') + ' in this loadout — ' : '') +
        '<a href="#' + escapeHtml(build.id) + '">see the full ' + escapeHtml(build.title) + ' build</a>' +
      '</div>';
  }

  function render() {
    var build = currentBuild();
    if (!build) {
      ownedEl.hidden = true;
      resultEl.innerHTML = '<div class="nu-empty">No curated build for that combination yet.</div>';
      return;
    }
    renderOwned(build);
    renderResult(build);
  }

  fetch('builds.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      builds = data;

      var classes = Object.keys(classLabels).filter(function (c) {
        return builds.some(function (b) { return b.class === c; });
      });
      var stages = stageOrder.filter(function (s) {
        return builds.some(function (b) { return b.stage === s; });
      });
      var variants = Object.keys(variantLabels).filter(function (v) {
        return builds.some(function (b) { return b.variant === v; });
      });

      fillSelect(classSel, classes, classLabels);
      fillSelect(stageSel, stages, stageLabels);
      fillSelect(variantSel, variants, variantLabels);
      if (variants.indexOf('accessible') !== -1) variantSel.value = 'accessible';

      [classSel, stageSel, variantSel].forEach(function (sel) {
        sel.addEventListener('change', render);
      });
      render();
    })
    .catch(function () {
      resultEl.innerHTML = '<div class="nu-empty">Could not load builds.json.</div>';
    });
})();
