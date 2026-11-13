/* Wild Shape Beast List -- vanilla JS, no build step. */
(function () {
  'use strict';

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  /* Profiles: one per druid/character. Each keeps its own starred forms,
     hidden beasts, notes and settings. Stored in this browser only. */
  var PROFILES = store.get('ws.profiles', null);
  if (!PROFILES || !PROFILES.list || typeof PROFILES.list !== 'object' || !Object.keys(PROFILES.list).length) {
    PROFILES = { active: 'My druid', list: { 'My druid': { favs: store.get('ws.favs', {}), hidden: {}, notes: {} } } };
  }
  function prof() {
    if (!PROFILES.list[PROFILES.active]) PROFILES.active = Object.keys(PROFILES.list)[0];
    var p = PROFILES.list[PROFILES.active];
    p.favs = p.favs || {}; p.hidden = p.hidden || {}; p.notes = p.notes || {};
    return p;
  }
  var pset = prof().settings || {};

  var params = new URLSearchParams(location.search);
  var state = {
    ed: params.get('ed') || pset.ed || store.get('ws.ed', '2024'),
    circle: params.get('circle') || pset.circle || store.get('ws.circle', 'standard'),
    level: +(params.get('lvl') || pset.level || store.get('ws.level', 2)),
    wis: +(pset.wis != null ? pset.wis : store.get('ws.wis', 3)),
    showHidden: false,
    q: '',
    moves: [],
    size: '',
    showAll: store.get('ws.showAll', false),
    swarms: store.get('ws.swarms', false),
    favOnly: false,
    sort: store.get('ws.sort', 'cr-desc'),
    detail: store.get('ws.detail', 'basic'),
    merge: store.get('ws.merge', false),
    srcOff: store.get('ws.srcOff', {}),
    srcQ: '',
    favs: prof().favs,
    hidden: prof().hidden,
    notes: prof().notes
  };
  function clampState() {
    if (['2014', '2024'].indexOf(state.ed) < 0) state.ed = '2024';
    if (['standard', 'moon'].indexOf(state.circle) < 0) state.circle = 'standard';
    if (['basic', 'stats', 'full'].indexOf(state.detail) < 0) state.detail = 'basic';
    state.level = Math.min(20, Math.max(2, +state.level || 2));
    state.wis = isNaN(+state.wis) ? 3 : Math.max(-1, Math.min(7, +state.wis));
  }
  clampState();

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

  /* source key: "Monster Manual (2014) p.79" -> "Monster Manual (2014)" */
  function srcKey(x) { return String(x || '').replace(/\s+p\.\s*\d+$/, ''); }
  function srcOn(k) { return !state.srcOff[k]; }

  /* one hue per book; CSS turns it into a light- or dark-mode colour */
  var BOOK_HUE = {
    'SRD 5.1': 145, 'SRD 5.2': 165,
    'Monster Manual (2014)': 0, 'Monster Manual (2025)': 0,
    "Fizban's Treasury of Dragons": 18, 'Bigby Presents: Glory of the Giants': 34,
    'Tomb of Annihilation': 48, 'Tales from the Yawning Portal': 62, "Storm King's Thunder": 78,
    "Explorer's Guide to Wildemount": 100, 'Ghosts of Saltmarsh': 186, 'Icewind Dale: Rime of the Frostmaiden': 200,
    'Eberron: Rising from the Last War': 216, 'Out of the Abyss': 234, 'Strixhaven: A Curriculum of Chaos': 250,
    'Mordenkainen Presents: Monsters of the Multiverse': 268, "Volo's Guide to Monsters": 284,
    'The Wild Beyond the Witchlight': 304, "Boo's Astral Menagerie": 324
  };
  /* where each book can be found (official pages; all links checked 2026-11-13) */
  var SRD_URL = 'https://dnd.wizards.com/resources/systems-reference-document';
  var BOOK_URL = {
    'SRD 5.1': SRD_URL, 'SRD 5.2': SRD_URL,
    'Monster Manual (2014)': 'https://www.dndbeyond.com/sources/dnd/mm-2014', 'Monster Manual (2025)': 'https://www.dndbeyond.com/sources/dnd/mm-2024',
    "Fizban's Treasury of Dragons": 'https://www.dndbeyond.com/sources/dnd/ftod', 'Bigby Presents: Glory of the Giants': 'https://www.dndbeyond.com/sources/dnd/gotg',
    'Tomb of Annihilation': 'https://www.dndbeyond.com/sources/dnd/toa', 'Tales from the Yawning Portal': 'https://www.dndbeyond.com/sources/dnd/tftyp',
    "Storm King's Thunder": 'https://www.dndbeyond.com/sources/dnd/skt', "Explorer's Guide to Wildemount": 'https://www.dndbeyond.com/sources/dnd/egtw',
    'Ghosts of Saltmarsh': 'https://www.dndbeyond.com/sources/dnd/gos', 'Icewind Dale: Rime of the Frostmaiden': 'https://www.dndbeyond.com/sources/dnd/idrotf',
    'Eberron: Rising from the Last War': 'https://www.dndbeyond.com/sources/dnd/erftlw', 'Out of the Abyss': 'https://www.dndbeyond.com/sources/dnd/oota',
    'Strixhaven: A Curriculum of Chaos': 'https://www.dndbeyond.com/sources/dnd/sacoc', 'Mordenkainen Presents: Monsters of the Multiverse': 'https://www.dndbeyond.com/sources/dnd/motm',
    "Volo's Guide to Monsters": 'https://www.dndbeyond.com/sources/dnd/vgtm', 'The Wild Beyond the Witchlight': 'https://www.dndbeyond.com/sources/dnd/twbtw',
    "Boo's Astral Menagerie": 'https://www.dndbeyond.com/sources/dnd/sais'
  };
  function bookLink(label) {
    var u = BOOK_URL[srcKey(label)];
    return u ? '<a class="srctag" href="' + u + '" target="_blank" rel="noopener"' + hueAttr(label) + '>' + esc(label) + '</a>' : srcTag(label);
  }
  function renderSourceLinks() {
    var seen = {};
    DATA.beasts.forEach(function (e) { for (var ed in e.editions) seen[srcKey(e.editions[ed].source)] = 1; });
    (DATA.others || []).forEach(function (o) { seen[o.sourceName || o.source] = 1; });
    var keys = Object.keys(seen).sort(function (a, b) { return (/^SRD/.test(a) ? 0 : 1) - (/^SRD/.test(b) ? 0 : 1) || a.localeCompare(b); });
    $('#srcLinks').innerHTML = keys.map(function (k) {
      var u = BOOK_URL[k];
      var note = k === "Boo's Astral Menagerie" ? ' (in the Spelljammer: Adventures in Space set)' : /^SRD/.test(k) ? ' (free, CC-BY-4.0)' : '';
      return '<li><i class="dot"' + hueAttr(k) + '></i>' + (u ? '<a href="' + u + '" target="_blank" rel="noopener">' + esc(k) + '</a>' : esc(k)) + esc(note) + '</li>';
    }).join('');
  }
  function srcHue(k) {
    if (BOOK_HUE[k] != null) return BOOK_HUE[k];
    var h = 0; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 360;
    return h;
  }
  function hueAttr(k) { return ' style="--h:' + srcHue(srcKey(k)) + '"'; }
  function srcTag(label, key) { return '<span class="srctag"' + hueAttr(key || label) + '>' + esc(label) + '</span>'; }

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
      if (!srcOn(srcKey(b.source))) return;
      if (state.hidden[e.id] && !state.showHidden) return;
      if (state.favOnly && !state.favs[favKey(e.id)]) return;
      if (q && haystack(e, b).indexOf(q) < 0 && (state.notes[e.id] || '').toLowerCase().indexOf(q) < 0) return;
      rows.push({ e: e, b: b, el: el });
    });
    if (state.merge) otherRows(r, q).forEach(function (x) { rows.push(x); });
    var s = state.sort;
    rows.sort(function (x, y) {
      var a = x.b, c = y.b, d = 0;
      if (s === 'cr-desc') d = c.cr - a.cr; else if (s === 'cr-asc') d = a.cr - c.cr;
      else if (s === 'hp') d = (c.hp == null ? -1 : c.hp) - (a.hp == null ? -1 : a.hp);
      else if (s === 'ac') d = (c.ac == null ? -1 : shownAC(c, r)) - (a.ac == null ? -1 : shownAC(a, r));
      else if (s === 'speed') d = maxSpeed(c.speed) - maxSpeed(a.speed);
      if (x.el.ok !== y.el.ok) return x.el.ok ? -1 : 1;
      return d || a.name.localeCompare(c.name);
    });
    var okN = rows.filter(function (x) { return x.el.ok; }).length;
    $('#count').textContent = okN + ' beast' + (okN === 1 ? '' : 's') + ' available' + (rows.length > okN ? ' (' + (rows.length - okN) + ' locked shown)' : '');
    var list = $('#list');
    list.className = 'list detail-' + state.detail;
    list.innerHTML = rows.map(function (x) { return x.o ? otherCard(x.o, x.el) : card(x.e, x.b, x.el, r); }).join('');
    $('#empty').hidden = rows.length > 0;
    if (state.merge) $('#othersSec').hidden = true; else renderOthers(r, q);
    renderSources();
    syncControls();
    var u = new URL(location.href);
    u.searchParams.set('ed', state.ed); u.searchParams.set('circle', state.circle); u.searchParams.set('lvl', state.level);
    history.replaceState(null, '', u);
  }

  function hideBtn(id, name) {
    var hid = !!state.hidden[id];
    return '<button type="button" class="hide" data-hide="' + id + '" aria-pressed="' + hid + '" aria-label="' + (hid ? 'Show ' : 'Hide ') + esc(name) + '" title="' + (hid ? 'Hidden: click to show it again' : 'Hide this beast') + '">' +
      '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' + (hid ? '<path d="M3 3l18 18"/>' : '') + '</svg></button>';
  }
  function noteHTML(id) {
    var n = state.notes[id];
    return n ? '<p class="cnote"><b>Note:</b> ' + esc(n) + '</p>' : '';
  }
  function card(e, b, el, r) {
    var fav = !!state.favs[favKey(e.id)];
    var alt = b.name !== e.name ? '<div class="alt">' + esc(e.name) + ' in 2014</div>' : '';
    var acv = shownAC(b, r);
    return '<article class="card' + (el.ok ? '' : ' locked') + (state.hidden[e.id] ? ' is-hidden' : '') + '"' + hueAttr(b.source) + ' data-id="' + e.id + '" tabindex="0" role="button" aria-label="' + esc(b.name) + ' details">' +
      hideBtn(e.id, b.name) +
      '<button type="button" class="fav" data-fav="' + e.id + '" aria-pressed="' + fav + '" aria-label="Star ' + esc(b.name) + ' as a known form" title="Known form">' +
      '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg></button>' +
      '<div class="card-top"><div><h3>' + esc(b.name) + '</h3>' + alt + '</div><span class="cr">CR ' + b.crText + '</span></div>' +
      '<div class="meta">' + esc(b.size) + (b.multiattack ? ' &middot; Multiattack' : '') + (b.full ? '' : ' &middot; summary') + '</div>' +
      '<div class="nums"><div><span>AC</span><b>' + acv + '</b>' + (acv !== b.ac ? '<span class="small"> (' + b.ac + ')</span>' : '') + '</div><div><span>HP</span><b>' + (b.hp == null ? '?' : b.hp) + '</b></div>' +
      (b.pp ? '<div><span>PP</span><b>' + b.pp + '</b></div>' : '') + '</div>' +
      '<div class="moves">' + moves(b.speed) + '</div>' +
      '<div class="src">' + srcTag(b.source) + '</div>' +
      (el.ok ? '' : '<div class="why">' + esc(el.why.join(' · ')) + '</div>') +
      noteHTML(e.id) +
      (state.detail === 'stats' ? cardStats(b) : state.detail === 'full' ? '<div class="statblock mini">' + sbBody(b, r) + '</div>' : '') +
      '</article>';
  }

  /* "Stats" card level: ability scores, trait names, one line per attack */
  function abilRow(b) {
    var ab = b.abilities || {}, keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'].filter(function (k) { return ab[k] != null; });
    if (!keys.length) return '';
    return '<div class="abil' + (keys.length === 3 ? ' three' : '') + '">' + keys.map(function (k) {
      return '<div class="' + (['int', 'wis', 'cha'].indexOf(k) >= 0 ? 'mental' : '') + '"><b>' + k.toUpperCase() + '</b>' + ab[k] + ' (' + sgn(abMod(ab[k])) + ')</div>';
    }).join('') + '</div>';
  }
  function attackLine(a) {
    var d = a.desc || '', bits = [];
    var hit = d.match(/Attack(?: Roll)?:\s*([+-]\d+)/i);
    if (hit) bits.push(hit[1] + ' to hit');
    var rr = d.match(/\b(reach \d+ ft|range [\d\/]+ ft)/i);
    if (rr) bits.push(rr[1]);
    var sv = d.match(/(\w+) Saving Throw: DC (\d+)/);
    if (sv) bits.push('DC ' + sv[2] + ' ' + sv[1].slice(0, 3));
    else { sv = d.match(/DC (\d+) (\w+) saving throw/i); if (sv) bits.push('DC ' + sv[1] + ' ' + sv[2].slice(0, 3)); }
    var dmg = [], re = /(?:(\d+) \()?(\d+d\d+(?:\s*[+-]\s*\d+)?)\)? (\w+) damage/gi, m;
    while ((m = re.exec(d)) && dmg.length < 3) dmg.push((m[1] ? m[1] + ' (' + m[2].replace(/\s+/g, '') + ')' : m[2].replace(/\s+/g, '')) + ' ' + m[3].toLowerCase());
    if (/^multiattack$/i.test(a.name)) return '<li><b>Multiattack.</b> ' + esc(d.replace(/^The [\w ]+? makes /, 'Makes ')) + '</li>';
    if (!dmg.length && !hit && !sv) return '<li><b>' + esc(a.name) + '</b></li>';
    return '<li><b>' + esc(a.name) + '</b> ' + esc(bits.join(', ')) + (dmg.length ? ' &rarr; ' + esc(dmg.join(' + ')) : '') + '</li>';
  }
  function cardStats(b) {
    var h = '<div class="cstats">' + abilRow(b);
    if (b.traits && b.traits.length) h += '<p class="ctraits"><b>Traits:</b> ' + esc(b.traits.map(function (t) { return t.name; }).join(', ')) + '</p>';
    var acts = (b.actions || []).concat(b.bonusActions || []);
    if (acts.length) h += '<ul class="attacks">' + acts.map(attackLine).join('') + '</ul>';
    return h + '</div>';
  }

  /* beasts from other books, as rows for the merged list */
  function otherRows(r, q) {
    return (DATA.others || []).filter(function (o) {
      if (o.edition !== state.ed) return false;
      if (!srcOn(o.sourceName || o.source)) return false;
      if (q && (o.name + ' ' + o.sourceName).toLowerCase().indexOf(q) < 0) return false;
      if (state.size && o.size !== state.size) return false;
      for (var i = 0; i < state.moves.length; i++) if (!o.speed[state.moves[i]]) return false;
      if (state.favOnly && !state.favs[favKey(o.id)]) return false;
      if (state.hidden[o.id] && !state.showHidden) return false;
      return true;
    }).map(function (o) {
      var why = [];
      if (o.cr > r.maxCR) why.push('CR ' + o.crText + ' (max ' + crText(r.maxCR) + ')');
      if (r.noFly && o.speed.fly) why.push('Fly speed needs level 8');
      if (r.noSwim && o.speed.swim) why.push('Swim speed needs level 4');
      return { o: o, b: { name: o.name, cr: o.cr, hp: null, ac: null, speed: o.speed }, el: { ok: !why.length, why: why } };
    }).filter(function (x) { return x.el.ok || state.showAll; });
  }
  function otherCard(o, el) {
    var fav = !!state.favs[favKey(o.id)], book = o.sourceName || o.source;
    return '<article class="card book' + (el.ok ? '' : ' locked') + (state.hidden[o.id] ? ' is-hidden' : '') + '"' + hueAttr(book) + '>' + hideBtn(o.id, o.name) +
      '<button type="button" class="fav" data-fav="' + o.id + '" aria-pressed="' + fav + '" aria-label="Star ' + esc(o.name) + ' as a known form" title="Known form">' +
      '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg></button>' +
      '<div class="card-top"><div><h3>' + esc(o.name) + '</h3></div><span class="cr">CR ' + esc(o.crText) + '</span></div>' +
      '<div class="meta">' + esc(o.size || '') + ' &middot; basics only</div>' +
      '<div class="moves">' + moves(o.speed) + '</div>' +
      '<div class="src">' + srcTag(book) + '</div>' +
      (el.ok ? '' : '<div class="why">' + esc(el.why.join(' · ')) + '</div>') +
      (state.detail !== 'basic' ? '<p class="small muted nostats">Full stats are in ' + esc(book) + '.</p>' : '') +
      '</article>';
  }

  /* source picker: every source in the current edition, with counts */
  function sourceCounts() {
    var c = {};
    DATA.beasts.forEach(function (e) {
      var b = e.editions[state.ed];
      if (!b || (e.elemental && state.ed !== '2014')) return;
      var k = srcKey(b.source); c[k] = (c[k] || 0) + 1;
    });
    (DATA.others || []).forEach(function (o) {
      if (o.edition !== state.ed) return;
      var k = o.sourceName || o.source; c[k] = (c[k] || 0) + 1;
    });
    return c;
  }
  function renderSources() {
    var c = sourceCounts(), keys = Object.keys(c).sort(function (a, b) {
      var sa = /^SRD/.test(a) ? 0 : 1, sb = /^SRD/.test(b) ? 0 : 1;
      return sa - sb || a.localeCompare(b);
    });
    var on = keys.filter(srcOn).length, q = state.srcQ.trim().toLowerCase();
    $('#srcSum').textContent = 'Sources' + (on === keys.length ? '' : ' (' + on + ' of ' + keys.length + ')');
    $('#srcPick').classList.toggle('filtered', on !== keys.length);
    $('#srcList').innerHTML = keys.filter(function (k) { return !q || k.toLowerCase().indexOf(q) >= 0; }).map(function (k) {
      return '<label class="srcrow"' + hueAttr(k) + '><input type="checkbox" data-src="' + esc(k) + '"' + (srcOn(k) ? ' checked' : '') + '> <i class="dot" aria-hidden="true"></i><span>' + esc(k) + '</span><span class="n">' + c[k] + '</span></label>';
    }).join('') || '<p class="small muted">No book matches.</p>';
  }
  function setSources(keys, on) {
    var off = Object.assign({}, state.srcOff);
    keys.forEach(function (k) { if (on) delete off[k]; else off[k] = true; });
    update({ srcOff: off });
  }
  function visibleSrcKeys() {
    return Array.prototype.map.call(document.querySelectorAll('#srcList [data-src]'), function (i) { return i.dataset.src; });
  }

  function renderOthers(r, q) {
    var list = (DATA.others || []).filter(function (o) {
      if (o.edition !== state.ed) return false;
      if (!srcOn(o.sourceName || o.source)) return false;
      if (q && (o.name + ' ' + o.sourceName).toLowerCase().indexOf(q) < 0) return false;
      if (state.size && o.size !== state.size) return false;
      for (var i = 0; i < state.moves.length; i++) if (!o.speed[state.moves[i]]) return false;
      if (state.favOnly && !state.favs[favKey(o.id)]) return false;
      if (state.hidden[o.id] && !state.showHidden) return false;
      return true;
    }).map(function (o) {
      var ok = o.cr <= r.maxCR && !(r.noFly && o.speed.fly) && !(r.noSwim && o.speed.swim);
      return { o: o, ok: ok };
    }).filter(function (x) { return x.ok || state.showAll; });
    $('#othersSec').hidden = !list.length;
    $('#others').innerHTML = list.map(function (x) {
      var o = x.o;
      return '<div class="other' + (x.ok ? '' : ' locked') + '"' + hueAttr(o.sourceName || o.source) + '><b>' + esc(o.name) + '</b> <span class="cr">CR ' + esc(o.crText) + '</span>' +
        '<div class="meta">' + esc(o.size || '') + '</div><div class="moves">' + moves(o.speed) + '</div>' +
        '<div class="src">' + srcTag(o.sourceName || o.source) + (o.verified ? '' : ' &middot; unverified') + '</div></div>';
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
      '<p class="sb-sub">' + esc(b.size + ' ' + b.type + (b.swarm ? ' (swarm)' : '')) + ', CR ' + b.crText + ' ' + bookLink(b.source) + '</p></div>';
    if (eds.length > 1) {
      h += '<div class="ed-tabs" role="tablist">' + eds.map(function (x) {
        return '<button type="button" role="tab" data-ed-tab="' + x + '" aria-selected="' + (x === dlgEd) + '">' + x + ' rules' + (e.names[x] !== b.name ? '' : '') + '</button>';
      }).join('') + '</div>';
    }
    if (e.desc) h += '<p class="desc">' + esc(e.desc) + '</p>';
    if (e.tip) h += '<div class="tip"><b>Wild Shape tip:</b> ' + esc(e.tip) + '</div>';
    var isFav = !!state.favs[favKey(e.id)], isHid = !!state.hidden[e.id];
    h += '<div class="mynotes"><label for="noteBox">My notes <span class="muted small">(' + esc(PROFILES.active) + ', saved in this browser)</span></label>' +
      '<textarea id="noteBox" data-note="' + e.id + '" rows="3" maxlength="5000" placeholder="Tactics, when you used it, DM rulings...">' + esc(state.notes[e.id] || '') + '</textarea>' +
      '<div class="mn-actions"><button type="button" class="btn" data-fav="' + e.id + '" aria-pressed="' + isFav + '">' + (isFav ? '&#9733; Known form' : '&#9734; Mark as known form') + '</button>' +
      '<button type="button" class="btn" data-hide="' + e.id + '" aria-pressed="' + isHid + '">' + (isHid ? 'Show in list again' : 'Hide from list') + '</button></div></div>';
    h += '<div class="statblock">' + sbBody(b, r) + '</div>';
    if (b.note) h += '<p class="small">' + esc(b.note) + '</p>';
    h += '<div class="wsnote">' + (el.ok ? '<b>Available</b> to a ' + (r.moonActive ? 'Moon' : 'standard') + ' druid at level ' + state.level + ' (' + dlgEd + ' rules).' :
      '<b>Not yet available</b> at level ' + state.level + ': ' + esc(el.why.join('; ')) + '.') +
      ' Faded scores (Int/Wis/Cha) are replaced by your own.</div>';
    $('#dBody').innerHTML = h;
    var d = $('#detail');
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    d.querySelector('.dlg').scrollTop = 0;
  }
  function sbBody(b, r) {
    var h = '';
    h += '<p><b>Armor Class</b> ' + b.ac + (b.acNote ? ' (' + esc(b.acNote) + ')' : '') +
      (r.moonAC && b.type === 'Beast' ? ' <span class="small">&rarr; ' + Math.max(b.ac, r.moonAC) + ' with Circle Forms</span>' : '') +
      (b.init != null ? ' &nbsp; <b>Initiative</b> ' + sgn(b.init) : '') + '</p>';
    h += '<p><b>Hit Points</b> ' + (b.hp == null ? '?' : b.hp) + (b.hd ? ' (' + esc(b.hd) + ')' : '') + '</p>';
    h += '<p><b>Speed</b> ' + ['walk', 'climb', 'swim', 'fly', 'burrow'].filter(function (k) { return b.speed[k]; }).map(function (k) {
      return (k === 'walk' ? '' : k + ' ') + b.speed[k] + ' ft.' + (k === 'fly' && b.speed.hover ? ' (hover)' : '');
    }).join(', ') + '</p><hr>';
    h += abilRow(b) + '<hr>';
    var sk = Object.keys(b.skills || {});
    if (sk.length) h += '<p><b>Skills</b> ' + sk.map(function (k) { return k.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + sgn(b.skills[k]); }).join(', ') + '</p>';
    if (b.vuln) h += '<p><b>Vulnerabilities</b> ' + esc(b.vuln) + '</p>';
    if (b.resist) h += '<p><b>Resistances</b> ' + esc(b.resist) + '</p>';
    if (b.immune) h += '<p><b>Immunities</b> ' + esc(b.immune) + '</p>';
    if (b.condImmune) h += '<p><b>Condition Immunities</b> ' + esc(b.condImmune) + '</p>';
    h += '<p><b>Senses</b> ' + esc((b.senses || []).concat(b.pp ? ['Passive Perception ' + b.pp] : []).join(', ') || '--') + '</p>';
    h += section('Traits', b.traits) + section('Actions', b.actions) + section('Bonus Actions', b.bonusActions) + section('Reactions', b.reactions);
    return h;
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
    $('#showHidden').checked = state.showHidden;
    var nh = Object.keys(state.hidden).length;
    $('#showHiddenLbl').textContent = 'Show hidden' + (nh ? ' (' + nh + ')' : '');
    $('#favOnly').checked = state.favOnly; $('#sort').value = state.sort; $('#merge').checked = state.merge;
    document.querySelectorAll('[data-detail]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.detail === state.detail); });
  }
  function save() {
    store.set('ws.ed', state.ed); store.set('ws.circle', state.circle); store.set('ws.level', state.level);
    store.set('ws.wis', state.wis); store.set('ws.showAll', state.showAll); store.set('ws.swarms', state.swarms);
    store.set('ws.sort', state.sort); store.set('ws.detail', state.detail); store.set('ws.merge', state.merge); store.set('ws.srcOff', state.srcOff);
    var p = prof();
    p.favs = state.favs; p.hidden = state.hidden; p.notes = state.notes;
    p.settings = { ed: state.ed, circle: state.circle, level: state.level, wis: state.wis };
    store.set('ws.profiles', PROFILES);
  }
  function update(patch) { for (var k in patch) state[k] = patch[k]; save(); render(); }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, .card');
    if (!t) return;
    if (t.dataset.ed) return update({ ed: t.dataset.ed });
    if (t.dataset.circle) return update({ circle: t.dataset.circle });
    if (t.dataset.detail) return update({ detail: t.dataset.detail });
    if (t.id === 'srcAll') return setSources(Object.keys(sourceCounts()), true);
    if (t.id === 'srcNone') return setSources(Object.keys(sourceCounts()), false);
    if (t.id === 'srcShown') { var vis = visibleSrcKeys(); setSources(Object.keys(sourceCounts()), false); return setSources(vis, true); }
    if (t.dataset.move) {
      var m = state.moves.slice(), i = m.indexOf(t.dataset.move);
      if (i >= 0) m.splice(i, 1); else m.push(t.dataset.move);
      return update({ moves: m });
    }
    if (t.dataset.fav) {
      ev.stopPropagation();
      var f = Object.assign({}, state.favs), k = favKey(t.dataset.fav);
      if (f[k]) delete f[k]; else f[k] = true;
      update({ favs: f });
      if ($('#detail').open && dlgId === t.dataset.fav) openDetail(dlgId, dlgEd);
      return;
    }
    if (t.dataset.hide) {
      ev.stopPropagation();
      var hd = Object.assign({}, state.hidden), id = t.dataset.hide;
      if (hd[id]) delete hd[id]; else hd[id] = true;
      update({ hidden: hd });
      if ($('#detail').open && dlgId === id) openDetail(dlgId, dlgEd);
      return;
    }
    if (t.dataset.pact) { $('#pMenu').open = false; return profileAction(t.dataset.pact); }
    if (t.dataset.edTab) return openDetail(dlgId, t.dataset.edTab);
    if (t.id === 'closeDlg') return $('#detail').close();
    if (t.id === 'themeBtn') return toggleTheme();
    if (t.classList.contains('card') && !t.classList.contains('book')) return openDetail(t.dataset.id);
  });
  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('card')) { ev.preventDefault(); openDetail(ev.target.dataset.id); }
  });
  $('#detail').addEventListener('click', function (ev) { if (ev.target === this) this.close(); });
  $('#detail').addEventListener('close', function () { render(); });
  document.addEventListener('input', function (ev) {
    var id = ev.target.dataset && ev.target.dataset.note;
    if (!id) return;
    var n = Object.assign({}, state.notes), v = ev.target.value;
    if (v.trim()) n[id] = v; else delete n[id];
    state.notes = n; save();
  });
  $('#showHidden').addEventListener('change', function () { update({ showHidden: this.checked }); });
  $('#profile').addEventListener('change', function () { switchProfile(this.value); });
  $('#importFile').addEventListener('change', function () { if (this.files[0]) importData(this.files[0]); this.value = ''; });
  document.addEventListener('click', function (ev) { var p = $('#pMenu'); if (p.open && !p.contains(ev.target)) p.open = false; });

  /* ---------- profiles, export / import ---------- */
  function renderProfiles() {
    $('#profile').innerHTML = Object.keys(PROFILES.list).sort().map(function (n) {
      return '<option' + (n === PROFILES.active ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  }
  function loadProfile() {
    var p = prof(), st = p.settings || {};
    state.favs = p.favs; state.hidden = p.hidden; state.notes = p.notes;
    if (st.ed) state.ed = st.ed; if (st.circle) state.circle = st.circle;
    if (st.level) state.level = st.level; if (st.wis != null) state.wis = st.wis;
    clampState();
  }
  function switchProfile(name) {
    save();
    if (!PROFILES.list[name]) return;
    PROFILES.active = name;
    loadProfile(); save(); renderProfiles(); render();
  }
  function askName(msg, def) {
    var n = prompt(msg, def || '');
    if (n == null) return null;
    n = n.trim().slice(0, 40);
    if (!n) return null;
    if (PROFILES.list[n]) { alert('There is already a profile called "' + n + '".'); return null; }
    return n;
  }
  function profileAction(a) {
    if (a === 'new') {
      var n = askName('Name for the new profile (for example the character\'s name):');
      if (!n) return;
      save();
      PROFILES.list[n] = { favs: {}, hidden: {}, notes: {}, settings: { ed: state.ed, circle: state.circle, level: state.level, wis: state.wis } };
      return switchProfile(n);
    }
    if (a === 'rename') {
      var old = PROFILES.active, nn = askName('Rename "' + old + '" to:', old);
      if (!nn) return;
      save();
      PROFILES.list[nn] = PROFILES.list[old]; delete PROFILES.list[old];
      PROFILES.active = nn; save(); renderProfiles(); return render();
    }
    if (a === 'delete') {
      var names = Object.keys(PROFILES.list);
      if (names.length < 2) return alert('This is your only profile. Create another one before deleting it.');
      if (!confirm('Delete the profile "' + PROFILES.active + '" with its starred forms, hidden beasts and notes? Export a backup first if you might want it back.')) return;
      delete PROFILES.list[PROFILES.active];
      PROFILES.active = Object.keys(PROFILES.list)[0];
      loadProfile(); save(); renderProfiles(); return render();
    }
    if (a === 'export') return exportData();
    if (a === 'import') return $('#importFile').click();
  }
  function exportData() {
    save();
    var data = { app: 'druid-wildshape', version: 1, exported: new Date().toISOString(), active: PROFILES.active, profiles: PROFILES.list };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wildshape-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function cleanFlags(o) {
    var r = {};
    if (o && typeof o === 'object') for (var k in o) if (o[k] === true && typeof k === 'string' && k.length < 120) r[k] = true;
    return r;
  }
  function cleanNotes(o) {
    var r = {};
    if (o && typeof o === 'object') for (var k in o) if (typeof o[k] === 'string' && o[k].trim() && k.length < 120) r[k] = o[k].slice(0, 5000);
    return r;
  }
  function cleanSettings(st) {
    if (!st || typeof st !== 'object') return undefined;
    return { ed: String(st.ed || ''), circle: String(st.circle || ''), level: +st.level || 2, wis: isNaN(+st.wis) ? 3 : +st.wis };
  }
  function importData(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var d;
      try { d = JSON.parse(rd.result); } catch (e) { return alert('That file is not a Wild Shape backup (it is not valid JSON).'); }
      if (!d || d.app !== 'druid-wildshape' || !d.profiles || typeof d.profiles !== 'object') return alert('That file is not a Wild Shape backup.');
      var names = Object.keys(d.profiles).filter(function (n) { return n && n.length <= 40; });
      if (!names.length) return alert('The backup has no profiles in it.');
      var clash = names.filter(function (n) { return PROFILES.list[n]; });
      if (clash.length && !confirm('The backup has ' + names.length + ' profile(s). These already exist here and will be replaced by the backup copy:\n\n' + clash.join(', ') + '\n\nYour other profiles are kept. Continue?')) return;
      save();
      names.forEach(function (n) {
        var p = d.profiles[n] || {};
        PROFILES.list[n] = { favs: cleanFlags(p.favs), hidden: cleanFlags(p.hidden), notes: cleanNotes(p.notes), settings: cleanSettings(p.settings) };
      });
      PROFILES.active = d.active && PROFILES.list[d.active] ? d.active : names[0];
      loadProfile(); save(); renderProfiles(); render();
      alert('Restored ' + names.length + ' profile(s) from the backup.');
    };
    rd.readAsText(file);
  }
  renderProfiles();
  $('#level').addEventListener('input', function () { update({ level: +this.value }); });
  $('#wis').addEventListener('input', function () { var v = parseInt(this.value, 10); if (!isNaN(v)) update({ wis: Math.max(-1, Math.min(7, v)) }); });
  $('#search').addEventListener('input', function () { update({ q: this.value }); });
  $('#size').addEventListener('change', function () { update({ size: this.value }); });
  $('#sort').addEventListener('change', function () { update({ sort: this.value }); });
  $('#showAll').addEventListener('change', function () { update({ showAll: this.checked }); });
  $('#swarms').addEventListener('change', function () { update({ swarms: this.checked }); });
  $('#merge').addEventListener('change', function () { update({ merge: this.checked }); });
  $('#srcQ').addEventListener('input', function () { state.srcQ = this.value; renderSources(); });
  $('#srcList').addEventListener('change', function (ev) { var k = ev.target.dataset.src; if (k) setSources([k], ev.target.checked); });
  document.addEventListener('click', function (ev) { var p = $('#srcPick'); if (p.open && !p.contains(ev.target)) p.open = false; });
  $('#favOnly').addEventListener('change', function () { update({ favOnly: this.checked }); });

  function toggleTheme() {
    var cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; store.set('ws.theme', next);
  }
  var th = store.get('ws.theme', null);
  if (th) document.documentElement.dataset.theme = th;

  fetch('data/beasts.json?v=dev').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d;
    $('#generated').textContent = 'Data built ' + d.generated + ' · ' + d.beasts.length + ' creatures with stat blocks, ' + (d.others || []).length + ' more from other books.';
    renderSourceLinks();
    render();
  }).catch(function (err) {
    $('#list').innerHTML = '<p class="empty">Could not load the beast data (' + esc(err.message) + ').</p>';
  });
  syncControls();
})();
