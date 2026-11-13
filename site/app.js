/* Wild Shape Beast List -- vanilla JS, no build step. */
(function () {
  'use strict';

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  var params = new URLSearchParams(location.search);
  var state = {
    ed: params.get('ed') || store.get('ws.ed', '2024'),
    circle: params.get('circle') || store.get('ws.circle', 'standard'),
    level: +(params.get('lvl') || store.get('ws.level', 2)),
    wis: +store.get('ws.wis', 3),
    q: '',
    moves: [],
    size: '',
    showAll: store.get('ws.showAll', false),
    swarms: store.get('ws.swarms', false),
    favOnly: false,
    sort: store.get('ws.sort', 'cr-desc'),
    favs: store.get('ws.favs', {})
  };
  if (['2014', '2024'].indexOf(state.ed) < 0) state.ed = '2024';
  if (['standard', 'moon'].indexOf(state.circle) < 0) state.circle = 'standard';
  state.level = Math.min(20, Math.max(2, state.level || 2));

  var DATA = null;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var crText = function (cr) { return cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr); };
  var sgn = function (n) { return (n >= 0 ? '+' : '') + n; };
  var abMod = function (s) { return Math.floor((s - 10) / 2); };

  /* ---------- rules engine ---------- */
  function rules(ed, circle, lvl, wis) {
    var r = { ed: ed, circle: circle, lvl: lvl, notes: [], extras: [] };
    var baseCR = lvl >= 8 ? 1 : lvl >= 4 ? 0.5 : 0.25;
    r.noFly = lvl < 8;
    r.duration = Math.floor(lvl / 2) + ' hr';
    r.elementals = false;
    if (ed === '2014') {
      r.noSwim = lvl < 4;
      r.moonActive = circle === 'moon';
      r.maxCR = baseCR;
      if (r.moonActive) r.maxCR = lvl >= 6 ? Math.max(1, Math.floor(lvl / 3)) : 1;
      r.elementals = r.moonActive && lvl >= 10;
      r.uses = lvl >= 20 ? 'Unlimited' : '2 / short rest';
      r.hp = "Beast's HP";
      r.knownForms = null;
      r.extras.push('You must have seen the beast before. Your Int, Wis and Cha stay yours; you take the beast\'s physical scores, HP, Hit Dice and senses.');
      r.extras.push('When the beast form drops to 0 HP you revert, and leftover damage carries over to your normal HP.');
      r.extras.push("You can't cast spells in beast form (until Beast Spells at level 18), but concentration continues.");
      if (r.moonActive) {
        r.extras.push('Combat Wild Shape: transform as a bonus action, and spend a spell slot in beast form to heal 1d8 per slot level.');
        if (lvl >= 6) r.extras.push('Primal Strike: your beast attacks count as magical.');
        if (lvl >= 10) r.extras.push('Elemental Wild Shape: spend two uses at once to become an air, earth, fire or water elemental.');
        if (lvl >= 14) r.extras.push('Thousand Forms: cast Alter Self at will.');
      } else {
        r.extras.push('Transforming takes an action.');
      }
      if (lvl >= 18) r.extras.push('Beast Spells: cast druid spells in beast form (no costly material components).');
    } else {
      r.noSwim = false;
      r.moonActive = circle === 'moon' && lvl >= 3;
      r.maxCR = baseCR;
      if (r.moonActive) r.maxCR = Math.max(baseCR, Math.floor(lvl / 3));
      r.uses = (lvl >= 17 ? 4 : lvl >= 6 ? 3 : 2) + ' / long rest';
      r.knownForms = lvl >= 8 ? 8 : lvl >= 4 ? 6 : 4;
      r.tempHP = r.moonActive ? 3 * lvl : lvl;
      r.hp = r.tempHP + ' temp HP';
      r.extras.push('Bonus action to transform. You regain one use on a short rest and all on a long rest.');
      r.extras.push("You keep your own HP and Hit Dice, Int/Wis/Cha, class features, languages and feats. You use the beast's Str/Dex/Con, AC, speeds, senses and actions.");
      r.extras.push('You can swap one known form for another Beast after a long rest. You can\'t cast spells, but concentration continues.');
      if (r.moonActive) {
        r.moonAC = 13 + wis;
        r.extras.push('Circle Forms: your AC is at least 13 + your Wis modifier (' + r.moonAC + '), and you gain ' + r.tempHP + ' temp HP. You can cast your Circle of the Moon spells in beast form.');
        if (lvl >= 6) r.extras.push('Improved Circle Forms: your attacks can deal Radiant damage, and you add your Wis modifier to Con saves.');
        if (lvl >= 10) r.extras.push('Moonlight Step: bonus-action teleport 30 ft, with advantage on your next attack.');
        if (lvl >= 14) r.extras.push('Lunar Form: once per turn, +2d10 Radiant damage on a hit; Moonlight Step can bring an ally.');
      }
      if (lvl >= 18) r.extras.push('Beast Spells: cast spells in Wild Shape (no costly material components).');
      if (lvl >= 20) r.extras.push('Archdruid: regain a use of Wild Shape when you roll initiative with none left.');
      if (circle === 'moon' && lvl < 3) r.notes.push('In the 2024 rules you join the Circle of the Moon at level 3. Until then you use the standard Wild Shape limits.');
    }
    return r;
  }

  function block(entry) { return entry.editions[state.ed]; }

  function eligibility(entry, b, r) {
    var why = [];
    if (!b) return { ok: false, why: ['Not in the ' + state.ed + ' rules'] };
    if (entry.elemental) {
      if (!r.elementals) why.push(state.ed === '2014' ? 'Moon druid level 10+' : 'Not in the 2024 rules');
      return { ok: !why.length, why: why };
    }
    if (b.type !== 'Beast') why.push('Not a Beast in the ' + state.ed + ' rules');
    if (b.cr > r.maxCR) why.push('CR ' + b.crText + ' (max ' + crText(r.maxCR) + ')');
    if (r.noFly && b.speed.fly) why.push('Fly speed needs level 8');
    if (r.noSwim && b.speed.swim) why.push('Swim speed needs level 4');
    return { ok: !why.length, why: why };
  }

  /* ---------- rendering ---------- */
  function renderRules(r) {
    var h = '<div class="rules-top"><h2>' + (r.moonActive ? 'Circle of the Moon' : 'Druid') + ', level ' + r.lvl + '</h2>' +
      '<span class="muted">' + r.ed + ' rules</span></div><div class="stats">' +
      stat(crText(r.maxCR), 'Max CR') +
      stat(r.noFly ? 'No' : 'Yes', 'Flying forms', r.noFly) +
      (r.ed === '2014' ? stat(r.noSwim ? 'No' : 'Yes', 'Swimming forms', r.noSwim) : '') +
      (r.knownForms ? stat(favCount() + ' / ' + r.knownForms, 'Known forms (starred)', favCount() > r.knownForms) : '') +
      stat(r.uses, 'Uses') + stat(r.duration, 'Duration') + stat(r.hp, 'Hit points') +
      (r.moonAC ? stat(r.moonAC, 'Min AC (13 + Wis)') : '') +
      (r.elementals ? stat('Yes', 'Elementals') : '') +
      '</div><ul>' + r.extras.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      r.notes.map(function (n) { return '<div class="notice">' + esc(n) + '</div>'; }).join('');
    $('#rules').innerHTML = h;
  }
  function stat(v, l, warn) { return '<div class="stat' + (warn ? ' warn' : '') + '"><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>'; }
  function favKey(id) { return state.ed + ':' + id; }
  function favCount() { var n = 0; for (var k in state.favs) if (state.favs[k] && k.indexOf(state.ed + ':') === 0) n++; return n; }

  function moves(sp) {
    return ['walk', 'climb', 'swim', 'fly', 'burrow'].filter(function (k) { return sp[k]; }).map(function (k) {
      return '<span class="mv ' + k + '">' + (k === 'walk' ? '' : k + ' ') + sp[k] + ' ft' + (k === 'fly' && sp.hover ? ' (hover)' : '') + '</span>';
    }).join('');
  }
  function maxSpeed(sp) { return Math.max(sp.walk || 0, sp.fly || 0, sp.swim || 0, sp.climb || 0, sp.burrow || 0); }

  function haystack(e, b) {
    if (!e._hay) e._hay = {};
    if (!e._hay[state.ed]) {
      e._hay[state.ed] = [e.name, b.name, e.desc, e.tip, b.size,
        (b.traits || []).map(function (t) { return t.name + ' ' + t.desc; }).join(' '),
        (b.actions || []).map(function (t) { return t.name + ' ' + t.desc; }).join(' ')].join(' ').toLowerCase();
    }
    return e._hay[state.ed];
  }

  function shownAC(b, r) { return r.moonAC ? Math.max(b.ac, r.moonAC) : b.ac; }

  function render() {
    if (!DATA) return;
    var r = rules(state.ed, state.circle, state.level, state.wis);
    renderRules(r);
    $('#wisCtl').hidden = !(state.ed === '2024' && state.circle === 'moon');
    var q = state.q.trim().toLowerCase();
    var rows = [];
    DATA.beasts.forEach(function (e) {
      var b = block(e);
      if (!b) return;
      if (e.elemental && state.ed !== '2014') return;
      if (e.swarm && !state.swarms) return;
      var el = eligibility(e, b, r);
      if (!el.ok && !state.showAll) return;
      if (state.size && b.size !== state.size) return;
      for (var i = 0; i < state.moves.length; i++) if (!b.speed[state.moves[i]]) return;
      if (state.favOnly && !state.favs[favKey(e.id)]) return;
      if (q && haystack(e, b).indexOf(q) < 0) return;
      rows.push({ e: e, b: b, el: el });
    });
    var s = state.sort;
    rows.sort(function (x, y) {
      var a = x.b, c = y.b, d = 0;
      if (s === 'cr-desc') d = c.cr - a.cr; else if (s === 'cr-asc') d = a.cr - c.cr;
      else if (s === 'hp') d = (c.hp || 0) - (a.hp || 0); else if (s === 'ac') d = shownAC(c, r) - shownAC(a, r);
      else if (s === 'speed') d = maxSpeed(c.speed) - maxSpeed(a.speed);
      if (x.el.ok !== y.el.ok) return x.el.ok ? -1 : 1;
      return d || a.name.localeCompare(c.name);
    });
    var okN = rows.filter(function (x) { return x.el.ok; }).length;
    $('#count').textContent = okN + ' beast' + (okN === 1 ? '' : 's') + ' available' + (rows.length > okN ? ' (' + (rows.length - okN) + ' locked shown)' : '');
    $('#list').innerHTML = rows.map(function (x) { return card(x.e, x.b, x.el, r); }).join('');
    $('#empty').hidden = rows.length > 0;
    renderOthers(r, q);
    syncControls();
    var u = new URL(location.href);
    u.searchParams.set('ed', state.ed); u.searchParams.set('circle', state.circle); u.searchParams.set('lvl', state.level);
    history.replaceState(null, '', u);
  }

  function card(e, b, el, r) {
    var fav = !!state.favs[favKey(e.id)];
    var alt = b.name !== e.name ? '<div class="alt">' + esc(e.name) + ' in 2014</div>' : '';
    var acv = shownAC(b, r);
    return '<article class="card' + (el.ok ? '' : ' locked') + '" data-id="' + e.id + '" tabindex="0" role="button" aria-label="' + esc(b.name) + ' details">' +
      '<button type="button" class="fav" data-fav="' + e.id + '" aria-pressed="' + fav + '" aria-label="Star ' + esc(b.name) + ' as a known form" title="Known form">' +
      '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg></button>' +
      '<div class="card-top"><div><h3>' + esc(b.name) + '</h3>' + alt + '</div><span class="cr">CR ' + b.crText + '</span></div>' +
      '<div class="meta">' + esc(b.size) + (b.multiattack ? ' &middot; Multiattack' : '') + (b.full ? '' : ' &middot; summary') + '</div>' +
      '<div class="nums"><div><span>AC</span><b>' + acv + '</b>' + (acv !== b.ac ? '<span class="small"> (' + b.ac + ')</span>' : '') + '</div><div><span>HP</span><b>' + (b.hp == null ? '?' : b.hp) + '</b></div>' +
      (b.pp ? '<div><span>PP</span><b>' + b.pp + '</b></div>' : '') + '</div>' +
      '<div class="moves">' + moves(b.speed) + '</div>' +
      (el.ok ? '' : '<div class="why">' + esc(el.why.join(' · ')) + '</div>') +
      '</article>';
  }

  function renderOthers(r, q) {
    var list = (DATA.others || []).filter(function (o) {
      if (o.edition !== state.ed) return false;
      if (q && (o.name + ' ' + o.sourceName).toLowerCase().indexOf(q) < 0) return false;
      if (state.size && o.size !== state.size) return false;
      for (var i = 0; i < state.moves.length; i++) if (!o.speed[state.moves[i]]) return false;
      return true;
    }).map(function (o) {
      var ok = o.cr <= r.maxCR && !(r.noFly && o.speed.fly) && !(r.noSwim && o.speed.swim);
      return { o: o, ok: ok };
    }).filter(function (x) { return x.ok || state.showAll; });
    $('#othersSec').hidden = !list.length;
    $('#others').innerHTML = list.map(function (x) {
      var o = x.o;
      return '<div class="other' + (x.ok ? '' : ' locked') + '"><b>' + esc(o.name) + '</b> <span class="cr">CR ' + esc(o.crText) + '</span>' +
        '<div class="meta">' + esc(o.size || '') + '</div><div class="moves">' + moves(o.speed) + '</div>' +
        '<div class="src">' + esc(o.sourceName || o.source) + (o.verified ? '' : ' &middot; unverified') + '</div></div>';
    }).join('');
  }

  /* ---------- detail dialog ---------- */
  var dlgEd = null, dlgId = null;
  function openDetail(id, ed) {
    var e = DATA.beasts.find(function (x) { return x.id === id; });
    if (!e) return;
    dlgId = id; dlgEd = ed || (e.editions[state.ed] ? state.ed : Object.keys(e.editions)[0]);
    var b = e.editions[dlgEd];
    var r = rules(dlgEd, state.circle, state.level, state.wis);
    var el = eligibility(e, b, r);
    var eds = Object.keys(e.editions).sort();
    var h = '<div class="sb-head"><h2 id="dTitle">' + esc(b.name) + '</h2>' +
      '<p class="sb-sub">' + esc(b.size + ' ' + b.type + (b.swarm ? ' (swarm)' : '')) + ', CR ' + b.crText + ' &middot; ' + esc(b.source) + '</p></div>';
    if (eds.length > 1) {
      h += '<div class="ed-tabs" role="tablist">' + eds.map(function (x) {
        return '<button type="button" role="tab" data-ed-tab="' + x + '" aria-selected="' + (x === dlgEd) + '">' + x + ' rules' + (e.names[x] !== b.name ? '' : '') + '</button>';
      }).join('') + '</div>';
    }
    if (e.desc) h += '<p class="desc">' + esc(e.desc) + '</p>';
    if (e.tip) h += '<div class="tip"><b>Wild Shape tip:</b> ' + esc(e.tip) + '</div>';
    h += '<div class="statblock">';
    h += '<p><b>Armor Class</b> ' + b.ac + (b.acNote ? ' (' + esc(b.acNote) + ')' : '') +
      (r.moonAC && b.type === 'Beast' ? ' <span class="small">&rarr; ' + Math.max(b.ac, r.moonAC) + ' with Circle Forms</span>' : '') +
      (b.init != null ? ' &nbsp; <b>Initiative</b> ' + sgn(b.init) : '') + '</p>';
    h += '<p><b>Hit Points</b> ' + (b.hp == null ? '?' : b.hp) + (b.hd ? ' (' + esc(b.hd) + ')' : '') + '</p>';
    h += '<p><b>Speed</b> ' + ['walk', 'climb', 'swim', 'fly', 'burrow'].filter(function (k) { return b.speed[k]; }).map(function (k) {
      return (k === 'walk' ? '' : k + ' ') + b.speed[k] + ' ft.' + (k === 'fly' && b.speed.hover ? ' (hover)' : '');
    }).join(', ') + '</p><hr>';
    var ab = b.abilities, keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'].filter(function (k) { return ab[k] != null; });
    h += '<div class="abil' + (keys.length === 3 ? ' three' : '') + '">' + keys.map(function (k) {
      return '<div class="' + (['int', 'wis', 'cha'].indexOf(k) >= 0 ? 'mental' : '') + '"><b>' + k.toUpperCase() + '</b>' + ab[k] + ' (' + sgn(abMod(ab[k])) + ')</div>';
    }).join('') + '</div><hr>';
    var sk = Object.keys(b.skills || {});
    if (sk.length) h += '<p><b>Skills</b> ' + sk.map(function (k) { return k.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + sgn(b.skills[k]); }).join(', ') + '</p>';
    if (b.vuln) h += '<p><b>Vulnerabilities</b> ' + esc(b.vuln) + '</p>';
    if (b.resist) h += '<p><b>Resistances</b> ' + esc(b.resist) + '</p>';
    if (b.immune) h += '<p><b>Immunities</b> ' + esc(b.immune) + '</p>';
    if (b.condImmune) h += '<p><b>Condition Immunities</b> ' + esc(b.condImmune) + '</p>';
    h += '<p><b>Senses</b> ' + esc((b.senses || []).concat(b.pp ? ['Passive Perception ' + b.pp] : []).join(', ') || '--') + '</p>';
    h += section('Traits', b.traits) + section('Actions', b.actions) + section('Bonus Actions', b.bonusActions) + section('Reactions', b.reactions);
    h += '</div>';
    if (b.note) h += '<p class="small">' + esc(b.note) + '</p>';
    h += '<div class="wsnote">' + (el.ok ? '<b>Available</b> to a ' + (r.moonActive ? 'Moon' : 'standard') + ' druid at level ' + state.level + ' (' + dlgEd + ' rules).' :
      '<b>Not yet available</b> at level ' + state.level + ': ' + esc(el.why.join('; ')) + '.') +
      ' Faded scores (Int/Wis/Cha) are replaced by your own.</div>';
    $('#dBody').innerHTML = h;
    var d = $('#detail');
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    d.querySelector('.dlg').scrollTop = 0;
  }
  function section(t, list) {
    if (!list || !list.length) return '';
    return '<div class="sb-sec">' + t + '</div>' + list.map(function (a) { return '<p class="blk"><b>' + esc(a.name) + '.</b> ' + esc(a.desc) + '</p>'; }).join('');
  }

  /* ---------- controls ---------- */
  function syncControls() {
    document.querySelectorAll('[data-ed]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.ed === state.ed); });
    document.querySelectorAll('[data-circle]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.circle === state.circle); });
    document.querySelectorAll('[data-move]').forEach(function (b) { b.setAttribute('aria-pressed', state.moves.indexOf(b.dataset.move) >= 0); });
    $('#level').value = state.level; $('#levelOut').textContent = state.level;
    $('#wis').value = state.wis; $('#showAll').checked = state.showAll; $('#swarms').checked = state.swarms;
    $('#favOnly').checked = state.favOnly; $('#sort').value = state.sort;
  }
  function save() {
    store.set('ws.ed', state.ed); store.set('ws.circle', state.circle); store.set('ws.level', state.level);
    store.set('ws.wis', state.wis); store.set('ws.showAll', state.showAll); store.set('ws.swarms', state.swarms);
    store.set('ws.sort', state.sort); store.set('ws.favs', state.favs);
  }
  function update(patch) { for (var k in patch) state[k] = patch[k]; save(); render(); }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, .card');
    if (!t) return;
    if (t.dataset.ed) return update({ ed: t.dataset.ed });
    if (t.dataset.circle) return update({ circle: t.dataset.circle });
    if (t.dataset.move) {
      var m = state.moves.slice(), i = m.indexOf(t.dataset.move);
      if (i >= 0) m.splice(i, 1); else m.push(t.dataset.move);
      return update({ moves: m });
    }
    if (t.dataset.fav) {
      ev.stopPropagation();
      var f = Object.assign({}, state.favs), k = favKey(t.dataset.fav);
      if (f[k]) delete f[k]; else f[k] = true;
      return update({ favs: f });
    }
    if (t.dataset.edTab) return openDetail(dlgId, t.dataset.edTab);
    if (t.id === 'closeDlg') return $('#detail').close();
    if (t.id === 'themeBtn') return toggleTheme();
    if (t.classList.contains('card')) return openDetail(t.dataset.id);
  });
  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('card')) { ev.preventDefault(); openDetail(ev.target.dataset.id); }
  });
  $('#detail').addEventListener('click', function (ev) { if (ev.target === this) this.close(); });
  $('#level').addEventListener('input', function () { update({ level: +this.value }); });
  $('#wis').addEventListener('input', function () { var v = parseInt(this.value, 10); if (!isNaN(v)) update({ wis: Math.max(-1, Math.min(7, v)) }); });
  $('#search').addEventListener('input', function () { update({ q: this.value }); });
  $('#size').addEventListener('change', function () { update({ size: this.value }); });
  $('#sort').addEventListener('change', function () { update({ sort: this.value }); });
  $('#showAll').addEventListener('change', function () { update({ showAll: this.checked }); });
  $('#swarms').addEventListener('change', function () { update({ swarms: this.checked }); });
  $('#favOnly').addEventListener('change', function () { update({ favOnly: this.checked }); });

  function toggleTheme() {
    var cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; store.set('ws.theme', next);
  }
  var th = store.get('ws.theme', null);
  if (th) document.documentElement.dataset.theme = th;

  fetch('data/beasts.json').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d;
    $('#generated').textContent = 'Data built ' + d.generated + ' · ' + d.beasts.length + ' creatures with stat blocks, ' + (d.others || []).length + ' more from other books.';
    render();
  }).catch(function (err) {
    $('#list').innerHTML = '<p class="empty">Could not load the beast data (' + esc(err.message) + ').</p>';
  });
  syncControls();
})();
