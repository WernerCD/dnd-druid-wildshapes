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
    feats: [],
    trackerOpen: false,
    trackerMin: false,
    q: '',
    moves: [],
    size: [], /* sizes ticked; empty = any */
    showAll: store.get('ws.showAll', false),
    swarms: store.get('ws.swarms', false),
    favOnly: false,
    sort: store.get('ws.sort', 'cr-desc'),
    detail: store.get('ws.detail', 'basic'),
    merge: store.get('ws.merge', false),
    srcSel: store.get('ws.srcSel', null), /* books switched on; null = the core books */
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
  (function () { var t = store.get('ws.trk', null); if (t) { state.trackerOpen = !!t.open; state.trackerMin = !!t.min; } })();

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
  /* books: shared order and defaults (sources.js, STYLE.md 6f): core rules first and on by default,
     then official supplements, settings and adventures, partner books, all listed but off */
  var CORE = ['SRD 5.1', 'SRD 5.2', 'Monster Manual (2014)', 'Monster Manual (2025)']; /* used until the data loads */
  function coreSel() {
    var keys = DATA ? allBooks() : CORE, o = {};
    (window.DndSources ? DndSources.defaults(keys) : CORE).forEach(function (k) { o[k] = true; });
    return o;
  }
  function isCore(k) { return window.DndSources ? DndSources.isCore(k) : CORE.indexOf(k) >= 0; }
  function sortBooks(keys) { return window.DndSources ? DndSources.sort(keys) : keys.slice().sort(); }
  if (!state.srcSel || typeof state.srcSel !== 'object') state.srcSel = coreSel();
  function srcOn(k) { return !!state.srcSel[k]; }
  function allBooks() {
    var o = {};
    DATA.beasts.forEach(function (e) { for (var ed in e.editions) o[srcKey(e.editions[ed].source)] = 1; });
    (DATA.others || []).forEach(function (x) { o[x.sourceName || x.source] = 1; });
    return Object.keys(o);
  }
  var FILTER_DEFAULTS = { q: '', moves: [], feats: [], size: [], favOnly: false, showHidden: false };

  /* feature filters: tested against senses and trait names */
  function hasTrait(b, re) { return (b.traits || []).some(function (t) { return re.test(t.name); }); }
  function hasSense(b, re) { return (b.senses || []).some(function (x) { return re.test(x); }); }
  var FEATS = [
    ['darkvision', 'Darkvision', function (b) { return hasSense(b, /darkvision/i); }],
    ['blindsight', 'Blindsight', function (b) { return hasSense(b, /blindsight|tremorsense/i); }],
    ['pack', 'Pack Tactics', function (b) { return hasTrait(b, /pack tactics/i); }],
    ['water', 'Breathes water', function (b) { return hasTrait(b, /water breathing|amphibious/i); }],
    ['charge', 'Charge / pounce', function (b) { return hasTrait(b, /charge|pounce/i); }],
    ['keen', 'Keen senses', function (b) { return hasTrait(b, /^keen /i); }],
    ['spider', 'Spider Climb', function (b) { return hasTrait(b, /spider climb/i); }],
    ['multi', 'Multiattack', function (b) { return !!b.multiattack; }]
  ];
  var FEAT_TEST = {}; FEATS.forEach(function (f) { FEAT_TEST[f[0]] = f[2]; });

  /* rough damage per round: every attack hits, every save fails.
     Either/or damage takes the best plain option; charge/pounce riders are kept apart (dprCharge). */
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  var CHG = /\bmoved\b|moves at least|straight toward|\bcharge\b|\bpounce\b/i;
  function diceAvg(expr) {
    var m = String(expr).replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/);
    return m ? Math.floor(+m[1] * (+m[2] + 1) / 2 + (m[3] ? +m[3] : 0)) : 0;
  }
  /* -> { base, bonus, extra }: plain damage of one hit, the extra on a charge, and an extra attack word a charge allows */
  function attackDmg(desc) {
    var out = { base: 0, bonus: 0, extra: null };
    String(desc || '').split(/\.\s+(?=[A-Z])/).forEach(function (sen) {
      var re = /(\d+)(?: \((\d+d\d+(?:\s*[+-]\s*\d+)?)\))? [a-z]+ damage|(\d+d\d+(?:\s*[+-]\s*\d+)?) [a-z]+ damage/gi, m, ms = [];
      while ((m = re.exec(sen))) ms.push({ v: m[3] ? diceAvg(m[3]) : +m[1], i: m.index, end: re.lastIndex });
      if (CHG.test(sen)) {
        var w = sen.match(/make (?:one|another) (\w+) attack|another attack with its (\w+)/i);
        if (w) out.extra = w[1] || w[2];
        if (!ms.length) return;
        if (/\bextra\b/i.test(sen) || !/\bor\b/i.test(sen)) { out.bonus += ms.reduce(function (t, x) { return t + x.v; }, 0); return; }
      }
      if (!ms.length) return;
      var alts = [[ms[0]]];
      for (var k = 1; k < ms.length; k++) {
        var gap = sen.slice(ms[k - 1].end, ms[k].i);
        if (/\bor\b/i.test(gap) && !/\bplus\b/i.test(gap)) alts.push([ms[k]]); else alts[alts.length - 1].push(ms[k]);
      }
      var plain = 0, charged = 0;
      alts.forEach(function (g, gi) {
        var v = g.reduce(function (t, x) { return t + x.v; }, 0);
        var tail = sen.slice(g[g.length - 1].end, gi + 1 < alts.length ? alts[gi + 1][0].i : sen.length);
        if (CHG.test(tail)) charged = Math.max(charged, v); else plain = Math.max(plain, v);
      });
      out.base += plain; out.bonus += Math.max(0, charged - plain);
    });
    return out;
  }
  function dmgInfo(b) {
    if (b._dmg) return b._dmg;
    var acts = (b.actions || []).filter(function (a) { return !/^multiattack$/i.test(a.name); });
    var dmg = {}, bonus = 0;
    acts.forEach(function (a) { dmg[a.name.toLowerCase()] = attackDmg(a.desc); });
    function find(word) {
      word = String(word).toLowerCase().replace(/s$/, '');
      for (var k in dmg) if (k.replace(/s$/, '') === word || k.indexOf(word) === 0) return dmg[k].base;
      return 0;
    }
    var best = 0; for (var k in dmg) best = Math.max(best, dmg[k].base);
    var ma = (b.actions || []).filter(function (a) { return /^multiattack$/i.test(a.name); })[0], tot = 0;
    if (ma) {
      var d = ma.desc, m, re;
      re = /\b(one|two|three|four|five) (?:with its )?(\w+)(?: attacks?)?/gi;
      var parts = d.indexOf(':') >= 0 ? d.split(':')[1] : d;
      while ((m = re.exec(parts))) {
        if (/^attacks?$/i.test(m[2])) continue;
        tot += (NUMW[m[1].toLowerCase()] || 1) * find(m[2]);
      }
      if (!tot && d.indexOf(':') >= 0) parts.split(/,|\band\b/).forEach(function (w) { w = w.replace(/[^a-z ]/gi, '').trim().split(' ').pop(); if (w) tot += find(w); });
      if (/uses (\w+)/i.test(d)) tot += find(d.match(/uses (\w+)/i)[1]);
      if (!tot) { var c = d.match(/makes (one|two|three|four|five)/i); tot = (c ? NUMW[c[1].toLowerCase()] : 1) * best; }
    }
    /* a charge or pounce lands once a turn: the best rider from an attack or a trait */
    for (var a in dmg) bonus = Math.max(bonus, dmg[a].bonus + (dmg[a].extra ? find(dmg[a].extra) : 0));
    (b.traits || []).forEach(function (t) {
      if (!CHG.test(t.name + ' ' + t.desc)) return;
      var x = attackDmg(t.desc), w = String(t.desc).match(/make (?:one|another) (\w+) attack|another attack with its (\w+)/i);
      if (w) x.extra = w[1] || w[2]; /* the bonus attack is often in the trait's second sentence */
      bonus = Math.max(bonus, x.bonus + x.base + (x.extra ? find(x.extra) : 0));
    });
    var base = Math.max(tot, best);
    b._dmg = { base: base, charge: bonus ? base + bonus : 0 };
    return b._dmg;
  }
  function dpr(b) { return dmgInfo(b).base; }
  function dprCharge(b) { return dmgInfo(b).charge; }

  var SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
  var MOVES = [['fly', 'Fly'], ['swim', 'Swim'], ['climb', 'Climb'], ['burrow', 'Burrow']];
  function sizeOK(z, extra) { return extra ? z === extra : !state.size.length || state.size.indexOf(z) >= 0; }
  /* everything in the link: ?ed=&circle=&lvl=&wis=&q=&mv=&ft=&sz=&src=&view=&sort=&all=1&locked=1&swarms=1 */
  (function () {
    var p = params, v;
    if ((v = p.get('q'))) state.q = v.slice(0, 80);
    if ((v = p.get('mv'))) state.moves = v.split(',').filter(function (m) { return ['fly', 'swim', 'climb', 'burrow'].indexOf(m) >= 0; });
    if ((v = p.get('ft'))) state.feats = v.split(',').filter(function (f) { return FEAT_TEST[f]; });
    if ((v = p.get('sz'))) state.size = v.split(',').filter(function (z) { return SIZES.indexOf(z) >= 0; });
    if ((v = p.get('src'))) { state.srcSel = {}; v.split('|').forEach(function (k) { if (k) state.srcSel[k] = true; }); }
    if ((v = p.get('view'))) state.detail = v;
    if ((v = p.get('sort'))) state.sort = v;
    if (p.get('all') === '1') state.merge = true;
    if (p.has('wis') && !isNaN(+p.get('wis'))) state.wis = +p.get('wis');
    if (p.get('locked') === '1') state.showAll = true;
    if (p.get('swarms') === '1') state.swarms = true;
    clampState();
  })();
  function sameSet(a, b) { var ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(function (k) { return b[k]; }); }
  function writeURL() {
    var u = new URL(location.href), sp = u.searchParams;
    sp.set('ed', state.ed); sp.set('circle', state.circle); sp.set('lvl', state.level); sp.set('wis', state.wis);
    function opt(k, val) { if (val) sp.set(k, val); else sp.delete(k); }
    opt('q', state.q.trim());
    opt('mv', state.moves.join(','));
    opt('ft', state.feats.join(','));
    opt('sz', state.size.join(','));
    opt('src', sameSet(state.srcSel, coreSel()) ? '' : Object.keys(state.srcSel).sort().join('|'));
    opt('view', state.detail === 'basic' ? '' : state.detail);
    opt('sort', state.sort === 'cr-desc' ? '' : state.sort);
    opt('all', state.merge ? '1' : '');
    opt('locked', state.showAll ? '1' : '');
    opt('swarms', state.swarms ? '1' : '');
    if (u.href !== location.href) history.replaceState(null, '', u);
  }

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
    var keys = sortBooks(Object.keys(seen));
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
      stat(r.uses, 'Uses') + stat(usesText(r), 'Uses left', usesLeft(r) <= 0) + stat(r.duration, 'Duration') + stat(r.hp, 'Hit points') +
      (r.moonAC ? stat(r.moonAC, 'Min AC (13 + Wis)') : '') +
      (r.elementals ? stat('Yes', 'Elementals') : '') +
      '</div><ul>' + r.extras.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      r.notes.map(function (n) { return '<div class="notice">' + esc(n) + '</div>'; }).join('') +
      '<div class="rules-actions"><button type="button" class="btn" data-trk="open">Combat tracker</button>' +
      '<button type="button" class="btn" data-trk="short">Short rest</button><button type="button" class="btn" data-trk="long">Long rest</button>' +
      '<button type="button" class="btn" id="printForms" title="Print your starred forms with their stats">Print my forms</button></div>';
    $('#rules').innerHTML = h;
  }

  /* ---------- combat tracker (per profile) ----------
     prof().wsUsed: Wild Shape uses spent since the last rest.
     prof().combat: the current form { id, ed, name, hp, maxHp | temp, maxTemp, round, rounds, log[], done } */
  function usesMax(r) {
    if (r.ed === '2014') return r.lvl >= 20 ? Infinity : 2;
    return r.lvl >= 17 ? 4 : r.lvl >= 6 ? 3 : 2;
  }
  function usesLeft(r) { return usesMax(r) - (prof().wsUsed || 0); }
  function usesText(r) { var m = usesMax(r); return m === Infinity ? 'Unlimited' : Math.max(0, usesLeft(r)) + ' / ' + m; }
  function curRules() { return rules(state.ed, state.circle, state.level, state.wis); }
  function clog(msg) {
    var c = prof().combat; if (!c) return;
    c.log.unshift({ t: 'R' + c.round, m: msg });
    if (c.log.length > 40) c.log.length = 40;
  }
  function rollDice(expr, crit) {
    var m = String(expr).replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!m) return null;
    var n = +m[1] * (crit ? 2 : 1), sides = +m[2], mod = m[3] ? +m[3] : 0, rolls = [];
    for (var i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * sides));
    var tot = rolls.reduce(function (a, b) { return a + b; }, 0) + mod;
    return { total: Math.max(0, tot), text: n + 'd' + sides + (mod ? (mod > 0 ? '+' : '') + mod : '') + ': ' + rolls.join('+') + (mod ? (mod > 0 ? ' +' : ' ') + mod : '') };
  }
  function attackParts(a) {
    var d = a.desc || '', hit = d.match(/Attack(?: Roll)?:\s*([+-]\d+)/i), dmg = [], re = /(?:\d+ \()?(\d+d\d+(?:\s*[+-]\s*\d+)?)\)? (\w+) damage/gi, m;
    while ((m = re.exec(d)) && dmg.length < 3) dmg.push({ dice: m[1], type: m[2].toLowerCase() });
    var sv = d.match(/(\w+) Saving Throw: DC (\d+)/) || null, dc = sv ? 'DC ' + sv[2] + ' ' + sv[1] : '';
    if (!sv) { sv = d.match(/DC (\d+) (\w+) saving throw/i); if (sv) dc = 'DC ' + sv[1] + ' ' + sv[2]; }
    return { name: a.name, bonus: hit ? +hit[1] : null, dmg: dmg, dc: dc };
  }
  function formBlock(c) { var e = DATA.beasts.find(function (x) { return x.id === c.id; }); return e ? e.editions[c.ed] : null; }
  function startForm(id, ed) {
    var e = DATA.beasts.find(function (x) { return x.id === id; }); if (!e) return;
    var b = e.editions[ed], r = rules(ed, state.circle, state.level, state.wis), cost = e.elemental ? 2 : 1, p = prof();
    if (usesLeft(r) < cost && !confirm('You have no Wild Shape uses left' + (cost > 1 ? ' (an elemental costs two)' : '') + '. Transform anyway?')) return;
    if (p.combat && !p.combat.done && !confirm('You are already a ' + p.combat.name + '. Switch to ' + b.name + '?')) return;
    p.wsUsed = (p.wsUsed || 0) + (usesMax(r) === Infinity ? 0 : cost);
    p.combat = { id: id, ed: ed, name: b.name, round: 1, rounds: Math.floor(state.level / 2) * 600, log: [], done: false };
    if (ed === '2014') { p.combat.hp = p.combat.maxHp = b.hp || 0; }
    else { p.combat.temp = p.combat.maxTemp = r.tempHP; }
    clog('Became a ' + b.name + (ed === '2014' ? ' (' + b.hp + ' HP)' : ' (+' + r.tempHP + ' temp HP)') + (cost > 1 ? '; used two uses' : '') + '.');
    state.trackerOpen = true; save();
    if ($('#detail').open) $('#detail').close();
    render();
  }
  function trkAction(a) {
    var p = prof(), c = p.combat, r = curRules(), n = parseInt(($('#trkAmt') || {}).value, 10);
    if (a === 'open') { state.trackerOpen = true; return renderTracker(); }
    if (a === 'close') { state.trackerOpen = false; return renderTracker(); }
    if (a === 'min') { state.trackerMin = !state.trackerMin; return renderTracker(); }
    if (a === 'short' || a === 'long') {
      var before = p.wsUsed || 0;
      p.wsUsed = a === 'long' || r.ed === '2014' ? 0 : Math.max(0, before - 1);
      if (c && !c.done) clog((a === 'long' ? 'Long' : 'Short') + ' rest: ' + (before - p.wsUsed) + ' use(s) back.');
      save(); renderRules(r); return renderTracker();
    }
    if (!c || c.done) return;
    if (a === 'round') { if (c.round < c.rounds) c.round++; if (c.round >= c.rounds) clog('Duration is up: you revert.'); }
    if (a === 'dmg' || a === 'heal') {
      if (!(n > 0)) { $('#trkAmt').focus(); return; }
      if (a === 'dmg') {
        if (c.ed === '2014') {
          c.hp -= n;
          if (c.hp <= 0) { var carry = -c.hp; c.hp = 0; c.done = true; clog('Took ' + n + ': dropped to 0 and reverted. ' + carry + ' damage carries over to your normal HP.'); }
          else clog('Took ' + n + ' damage (' + c.hp + '/' + c.maxHp + ' left).');
        } else {
          var over = n - c.temp; c.temp = Math.max(0, c.temp - n);
          clog('Took ' + n + ' damage' + (over > 0 ? ': temp HP gone, ' + over + ' comes off your own HP.' : ' (' + c.temp + ' temp HP left).'));
        }
      } else {
        if (c.ed === '2014') { var was = c.hp; c.hp = Math.min(c.maxHp, c.hp + n); clog('Healed ' + (c.hp - was) + ' (' + c.hp + '/' + c.maxHp + ').'); }
        else clog('Healing goes to your own HP; Wild Shape temp HP can\'t be healed.');
      }
      $('#trkAmt').value = '';
    }
    if (a === 'revert') { c.done = true; clog('Reverted to druid form.'); }
    save(); renderTracker();
  }
  function rollAttack(i, kind) {
    var c = prof().combat; if (!c || c.done) return;
    var b = formBlock(c); if (!b) return;
    var acts = (b.actions || []).concat(b.bonusActions || []).filter(function (a) { return !/^multiattack$/i.test(a.name); });
    var at = attackParts(acts[i]); if (!at) return;
    var msg = at.name + ': ', crit = false;
    if (kind === 'hit' && at.bonus != null) {
      var d20 = 1 + Math.floor(Math.random() * 20); crit = d20 === 20;
      msg += (d20 + at.bonus) + ' to hit (d20 ' + d20 + (at.bonus >= 0 ? ' +' : ' ') + at.bonus + ')' + (crit ? ' CRITICAL' : d20 === 1 ? ' (natural 1)' : '');
      if (d20 === 1) { clog(msg); save(); return renderTracker(); }
      msg += '; ';
    } else if (at.dc) msg += at.dc + ' save; ';
    var parts = at.dmg.map(function (x) { var rr = rollDice(x.dice, crit); return rr ? { n: rr.total, t: x.type, s: rr.text } : null; }).filter(Boolean);
    msg += parts.length ? parts.map(function (x) { return x.n + ' ' + x.t + ' (' + x.s + ')'; }).join(' + ') + (parts.length > 1 ? ' = ' + parts.reduce(function (a, x) { return a + x.n; }, 0) : '') : 'no damage roll';
    clog(msg); save(); renderTracker();
  }
  /* print the starred forms with the Stats view, then put the view back */
  function printForms() {
    if (!favCount()) return alert('Star some forms first (the star on each card), then print them.');
    var prev = { favOnly: state.favOnly, detail: state.detail };
    state.favOnly = true; if (state.detail === 'basic') state.detail = 'stats';
    render();
    var done = false;
    function restore() { if (done) return; done = true; state.favOnly = prev.favOnly; state.detail = prev.detail; render(); }
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
    setTimeout(restore, 1000);
  }
  function renderTracker() {
    var el = $('#tracker'), p = prof(), c = p.combat, r = curRules();
    document.body.classList.toggle('has-tracker', !!state.trackerOpen);
    el.hidden = !state.trackerOpen;
    if (!state.trackerOpen) return;
    var live = c && !c.done, b = live ? formBlock(c) : null;
    var head = '<div class="trk-head"><b>' + (live ? esc(c.name) : 'Druid form') + '</b>' +
      (live ? (c.ed === '2014' ? '<span class="trk-pill' + (c.hp <= c.maxHp / 4 ? ' low' : '') + '">' + c.hp + ' / ' + c.maxHp + ' HP</span>' :
        '<span class="trk-pill' + (c.temp === 0 ? ' low' : '') + '">' + c.temp + ' / ' + c.maxTemp + ' temp HP</span>') +
        '<span class="trk-pill">Round ' + c.round + '</span>' : '') +
      '<span class="trk-pill">Uses ' + usesText(r) + '</span>' +
      '<span class="trk-sp"></span><button type="button" class="icon-btn sm" data-trk="min" aria-label="' + (state.trackerMin ? 'Expand' : 'Collapse') + ' tracker" title="' + (state.trackerMin ? 'Expand' : 'Collapse') + '">' + (state.trackerMin ? '&#9650;' : '&#9660;') + '</button>' +
      '<button type="button" class="icon-btn sm" data-trk="close" aria-label="Close tracker" title="Close (your uses are kept)">&times;</button></div>';
    var body = '';
    if (!state.trackerMin) {
      if (live && b) {
        var r2 = rules(c.ed, state.circle, state.level, state.wis), acv = r2.moonAC ? Math.max(b.ac, r2.moonAC) : b.ac;
        body += '<div class="trk-row"><span>AC <b>' + acv + '</b></span><span>' + moves(b.speed) + '</span>' +
          '<span class="muted small">' + c.ed + ' rules &middot; ' + Math.floor(state.level / 2) + ' hr (' + c.rounds + ' rounds)</span></div>';
        body += '<div class="trk-row trk-hp"><input type="number" id="trkAmt" min="1" max="999" inputmode="numeric" placeholder="Amount" aria-label="Damage or healing amount">' +
          '<button type="button" class="btn" data-trk="dmg">Damage</button><button type="button" class="btn" data-trk="heal">Heal</button>' +
          '<button type="button" class="btn" data-trk="round">Next round</button><button type="button" class="btn" data-trk="revert">Revert</button></div>';
        var acts = (b.actions || []).concat(b.bonusActions || []).filter(function (a) { return !/^multiattack$/i.test(a.name); });
        var ma = (b.actions || []).filter(function (a) { return /^multiattack$/i.test(a.name); })[0];
        if (ma) body += '<p class="small trk-ma"><b>Multiattack:</b> ' + esc(ma.desc.replace(/^The [\w ]+? makes /, 'Makes ')) + '</p>';
        body += '<div class="trk-atk">' + acts.map(function (a, i) {
          var at = attackParts(a);
          if (at.bonus == null && !at.dmg.length) return '';
          return '<div class="trk-a"><b>' + esc(a.name) + '</b>' +
            (at.bonus != null ? '<button type="button" class="btn sm" data-trkroll="' + i + '" data-kind="hit">Attack ' + sgn(at.bonus) + '</button>' : '<span class="small muted">' + esc(at.dc) + '</span>') +
            (at.dmg.length ? '<button type="button" class="btn sm" data-trkroll="' + i + '" data-kind="dmg">Damage</button>' : '') + '</div>';
        }).join('') + '</div>';
      } else {
        body += '<p class="small muted trk-empty">' + (c && c.done ? 'You are back in druid form. ' : '') + 'Open a beast and press <b>Transform</b> to start. Rests restore uses (2014: a short rest restores all; 2024: a short rest restores one, a long rest all).</p>' +
          '<div class="trk-row"><button type="button" class="btn" data-trk="short">Short rest</button><button type="button" class="btn" data-trk="long">Long rest</button></div>';
      }
      if (c && c.log.length) body += '<ol class="trk-log">' + c.log.map(function (x) { return '<li><span class="muted">' + esc(x.t) + '</span> ' + esc(x.m) + '</li>'; }).join('') + '</ol>';
    }
    el.innerHTML = head + body;
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

  /* re-rendering a list replaces its inputs; remember which one had focus and focus its twin again */
  function focusKey() {
    var a = document.activeElement;
    if (!a || a === document.body) return null;
    var host = a.parentElement && a.parentElement.closest('[id]');
    for (var k in a.dataset) {
      return { id: a.id, sel: (host ? '#' + host.id + ' ' : '') + '[data-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }) + '="' + (window.CSS && CSS.escape ? CSS.escape(a.dataset[k]) : a.dataset[k]) + '"]' };
    }
    return a.id ? { id: a.id } : null;
  }
  function restoreFocus(f) {
    if (!f || (document.activeElement && document.activeElement !== document.body)) return;
    var el = f.sel ? document.querySelector(f.sel) : document.getElementById(f.id);
    if (el) el.focus({ preventScroll: true });
  }
  function render() {
    if (!DATA) return;
    var foc = focusKey();
    var r = rules(state.ed, state.circle, state.level, state.wis);
    renderRules(r);
    $('#wisCtl').hidden = !(state.ed === '2024' && state.circle === 'moon');
    var q = state.q.trim().toLowerCase();
    var cands = [];
    DATA.beasts.forEach(function (e) {
      var b = block(e);
      if (!b) return;
      if (e.elemental && state.ed !== '2014') return;
      if (e.swarm && !state.swarms) return;
      var el = eligibility(e, b, r);
      if (!el.ok && !state.showAll) return;
      if (!srcOn(srcKey(b.source))) return;
      if (state.hidden[e.id] && !state.showHidden) return;
      if (state.favOnly && !state.favs[favKey(e.id)]) return;
      if (q && haystack(e, b).indexOf(q) < 0 && (state.notes[e.id] || '').toLowerCase().indexOf(q) < 0) return;
      cands.push({ e: e, b: b, el: el });
    });
    if (state.merge) otherRows(r, q).forEach(function (x) { cands.push(x); });
    function movesOK(sp, extra) {
      for (var i = 0; i < state.moves.length; i++) if (!sp[state.moves[i]]) return false;
      return !extra || !!sp[extra];
    }
    function featsOK(x, extra) {
      var want = extra ? state.feats.concat([extra]) : state.feats;
      if (!want.length) return true;
      if (x.o) return false; /* other-book beasts have no trait data */
      for (var i = 0; i < want.length; i++) if (!FEAT_TEST[want[i]](x.b)) return false;
      return true;
    }
    var rows = cands.filter(function (x) { return sizeOK(x.b.size) && movesOK(x.b.speed) && featsOK(x); });
    /* counts follow every other filter, so a chip's number is what you get */
    function pickList(list, sumSel, pickSel, label, items, joinAll) {
      $(list).innerHTML = items.map(function (it) {
        return '<label class="srcrow' + (it.n || it.on ? '' : ' zero') + '"><input type="checkbox" data-' + it.attr + '="' + it.key + '"' + (it.on ? ' checked' : '') + '><span>' + it.name + '</span><span class="n">' + it.n + '</span></label>';
      }).join('');
      var on = items.filter(function (it) { return it.on; }).map(function (it) { return it.name; });
      $(sumSel).textContent = on.length ? label + ': ' + (on.length > 2 ? on.length + ' picked' : on.join(joinAll ? ', ' : ' or ')) : label;
      $(pickSel).classList.toggle('filtered', on.length > 0);
    }
    pickList('#moveList', '#moveSum', '#movePick', 'Movement', MOVES.map(function (m) {
      return { attr: 'move', key: m[0], name: m[1], on: state.moves.indexOf(m[0]) >= 0,
        n: cands.filter(function (x) { return sizeOK(x.b.size) && movesOK(x.b.speed, m[0]) && featsOK(x); }).length };
    }), true);
    pickList('#sizeList', '#sizeSum', '#sizePick', 'Size', SIZES.map(function (z) {
      return { attr: 'size', key: z, name: z, on: state.size.indexOf(z) >= 0,
        n: cands.filter(function (x) { return sizeOK(x.b.size, z) && movesOK(x.b.speed) && featsOK(x); }).length };
    }), false);
    $('#featList').innerHTML = FEATS.map(function (f) {
      var n = cands.filter(function (x) { return sizeOK(x.b.size) && movesOK(x.b.speed) && featsOK(x, f[0]); }).length;
      var on = state.feats.indexOf(f[0]) >= 0;
      return '<label class="srcrow' + (n || on ? '' : ' zero') + '"><input type="checkbox" data-feat="' + f[0] + '"' + (on ? ' checked' : '') + '><span>' + f[1] + '</span><span class="n">' + n + '</span></label>';
    }).join('');
    var fNames = FEATS.filter(function (f) { return state.feats.indexOf(f[0]) >= 0; }).map(function (f) { return f[1]; });
    $('#featSum').textContent = fNames.length ? 'Features: ' + (fNames.length > 2 ? fNames.length + ' picked' : fNames.join(', ')) : 'Features';
    $('#featPick').classList.toggle('filtered', fNames.length > 0);
    var s = state.sort;
    /* when searching, beasts whose name matches come before ones that only mention it */
    function nameHit(x) { return q && (x.b.name.toLowerCase().indexOf(q) >= 0 || (x.e && x.e.name.toLowerCase().indexOf(q) >= 0)) ? 0 : 1; }
    rows.sort(function (x, y) {
      var a = x.b, c = y.b, d = 0;
      var nh = nameHit(x) - nameHit(y);
      if (nh) return nh;
      if (s === 'cr-desc') d = c.cr - a.cr; else if (s === 'cr-asc') d = a.cr - c.cr;
      else if (s === 'hp') d = (c.hp == null ? -1 : c.hp) - (a.hp == null ? -1 : a.hp);
      else if (s === 'ac') d = (c.ac == null ? -1 : shownAC(c, r)) - (a.ac == null ? -1 : shownAC(a, r));
      else if (s === 'speed') d = maxSpeed(c.speed) - maxSpeed(a.speed);
      else if (s === 'dpr') d = (y.o ? -1 : dpr(c)) - (x.o ? -1 : dpr(a));
      if (x.el.ok !== y.el.ok) return x.el.ok ? -1 : 1;
      return d || a.name.localeCompare(c.name);
    });
    var okN = rows.filter(function (x) { return x.el.ok; }).length;
    $('#count').textContent = okN + ' beast' + (okN === 1 ? '' : 's') + ' available' + (rows.length > okN ? ' (' + (rows.length - okN) + ' locked shown)' : '');
    var list = $('#list');
    list.className = 'list detail-' + state.detail;
    list.innerHTML = rows.map(function (x) { return x.o ? otherCard(x.o, x.el) : card(x.e, x.b, x.el, r); }).join('');
    $('#empty').hidden = rows.length > 0;
    renderCRChart(rows, r);
    if (state.merge) $('#othersSec').hidden = true; else renderOthers(r, q);
    renderSources();
    renderTracker();
    syncControls();
    writeURL();
    publishSheet();
    restoreFocus(foc);
  }

  /* bar chart: how many of the beasts that pass the filters you can become at each CR up to your maximum */
  var crPlot = null, CR_STEPS = [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  function renderCRChart(rows, r) {
    var sec = $('#crSec');
    if (!window.DndPlot || !sec) { if (sec) sec.hidden = true; return; }
    if (!sec.open) return; /* drawn when opened */
    var steps = CR_STEPS.filter(function (c) { return c <= r.maxCR; });
    var ok = rows.filter(function (x) { return x.el.ok; });
    var vals = steps.map(function (c) { return ok.filter(function (x) { return x.b.cr === c; }).length; });
    var filtered = state.q.trim() || state.moves.length || state.feats.length || state.size.length || state.favOnly;
    $('#crNote').textContent = ok.length + ' beast' + (ok.length === 1 ? '' : 's') + ' at druid level ' + state.level +
      (state.circle === 'moon' ? ', Circle of the Moon' : '') + ' (' + state.ed + ' rules), max CR ' + crText(r.maxCR) +
      (filtered ? ', counting only the beasts that match your filters.' : '.');
    var opts = { labels: steps.map(crText), values: vals, name: 'Beasts', xLabel: 'Challenge rating', yLabel: 'Beasts',
      title: 'Beasts you can become at each challenge rating' };
    if (crPlot) crPlot.update(opts); else crPlot = DndPlot.bars($('#crChart'), opts);
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
    return '<article class="card' + (el.ok ? '' : ' locked') + (state.hidden[e.id] ? ' is-hidden' : '') + '"' + hueAttr(b.source) + ' data-spot data-id="' + e.id + '">' +
      hideBtn(e.id, b.name) +
      '<button type="button" class="fav" data-fav="' + e.id + '" aria-pressed="' + fav + '" aria-label="Star ' + esc(b.name) + ' as a known form" title="Known form">' +
      '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg></button>' +
      '<div class="card-top"><div><h3><button type="button" class="card-open" data-open="' + e.id + '" aria-label="' + esc(b.name) + ': details">' + esc(b.name) + '</button></h3>' + alt + '</div><span class="cr">CR ' + b.crText + '</span></div>' +
      '<div class="meta">' + esc(b.size) + (b.multiattack ? ' &middot; Multiattack' : '') + (b.full ? '' : ' &middot; summary') + '</div>' +
      '<div class="nums"><div><span>AC</span><b>' + acv + '</b>' + (acv !== b.ac ? '<span class="small"> (' + b.ac + ')</span>' : '') + '</div><div><span>HP</span><b>' + (b.hp == null ? '?' : b.hp) + '</b></div>' +
      (b.pp ? '<div><span>PP</span><b>' + b.pp + '</b></div>' : '') +
      (dpr(b) ? '<div title="Average damage per round if every attack hits (and every save fails)' + (dprCharge(b) ? '; ' + dprCharge(b) + ' on a turn it charges or pounces' : '') + '"><span>DPR</span><b>' + dpr(b) + '</b>' + (dprCharge(b) ? '<span class="small"> (' + dprCharge(b) + ')</span>' : '') + '</div>' : '') + '</div>' +
      '<div class="moves">' + moves(b.speed) + '</div>' +
      '<div class="src">' + srcTag(b.source) + '</div>' +
      (el.ok ? '' : '<div class="why">' + esc(el.why.join(' · ')) + '</div>') +
      noteHTML(e.id) +
      (state.detail === 'stats' ? cardStats(b) : state.detail === 'full' ? sbBody(b, r, true) : '') +
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
    return '<li data-roll-entry><b>' + esc(a.name) + '</b> ' + esc(bits.join(', ')) + (dmg.length ? ' &rarr; ' + esc(dmg.join(' + ')) : '') + '</li>';
  }
  function cardStats(b) {
    var h = '<div class="cstats" data-dice data-roll-ctx="' + esc(b.name) + '">' + abilRow(b);
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
      if (state.favOnly && !state.favs[favKey(o.id)]) return false;
      if (state.hidden[o.id] && !state.showHidden) return false;
      return true;
    }).map(function (o) {
      var why = [];
      if (o.cr > r.maxCR) why.push('CR ' + o.crText + ' (max ' + crText(r.maxCR) + ')');
      if (r.noFly && o.speed.fly) why.push('Fly speed needs level 8');
      if (r.noSwim && o.speed.swim) why.push('Swim speed needs level 4');
      return { o: o, b: { name: o.name, cr: o.cr, hp: null, ac: null, size: o.size, speed: o.speed }, el: { ok: !why.length, why: why } };
    }).filter(function (x) { return x.el.ok || state.showAll; });
  }
  function otherCard(o, el) {
    var fav = !!state.favs[favKey(o.id)], book = o.sourceName || o.source;
    return '<article class="card book' + (el.ok ? '' : ' locked') + (state.hidden[o.id] ? ' is-hidden' : '') + '"' + hueAttr(book) + ' data-spot>' + hideBtn(o.id, o.name) +
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
    var c = sourceCounts(), keys = sortBooks(Object.keys(c));
    var on = keys.filter(srcOn).length, q = state.srcQ.trim().toLowerCase();
    $('#srcSum').textContent = 'Sources' + (on === keys.length ? '' : ' (' + on + ' of ' + keys.length + ')');
    $('#srcPick').classList.toggle('filtered', on !== keys.length);
    var lastGroup = null;
    $('#srcList').innerHTML = keys.filter(function (k) { return !q || k.toLowerCase().indexOf(q) >= 0; }).map(function (k) {
      var g = window.DndSources ? DndSources.info(k).groupName : null, head = '';
      if (g && g !== lastGroup) { head = '<div class="src-group">' + esc(g) + '</div>'; lastGroup = g; }
      return head + '<label class="srcrow' + (isCore(k) ? ' core' : '') + '"' + hueAttr(k) + '><input type="checkbox" data-src="' + esc(k) + '"' + (srcOn(k) ? ' checked' : '') + '> <i class="dot" aria-hidden="true"></i><span>' + esc(k) + '</span><span class="n">' + c[k] + '</span></label>';
    }).join('') || '<p class="small muted">No book matches.</p>';
  }
  function setSources(keys, on) {
    var sel = Object.assign({}, state.srcSel);
    keys.forEach(function (k) { if (on) sel[k] = true; else delete sel[k]; });
    update({ srcSel: sel });
  }
  function visibleSrcKeys() {
    return Array.prototype.map.call(document.querySelectorAll('#srcList [data-src]'), function (i) { return i.dataset.src; });
  }

  function renderOthers(r, q) {
    var list = (DATA.others || []).filter(function (o) {
      if (o.edition !== state.ed) return false;
      if (!srcOn(o.sourceName || o.source)) return false;
      if (q && (o.name + ' ' + o.sourceName).toLowerCase().indexOf(q) < 0) return false;
      if (!sizeOK(o.size)) return false;
      for (var i = 0; i < state.moves.length; i++) if (!o.speed[state.moves[i]]) return false;
      if (state.feats.length) return false; /* no trait data for these books */
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
      '<p class="sb-sub" data-links>' + esc(b.size) + ' <span class="dsb-ctype" data-ctype="' + esc(b.type) + '">' + esc(b.type) + '</span>' + (b.swarm ? ' (swarm)' : '') + ', CR ' + b.crText + ' ' + bookLink(b.source) + '</p></div>';
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
      '<div class="mn-actions"><button type="button" class="btn primary" data-transform="' + e.id + '" data-ted="' + dlgEd + '">Transform' + (e.elemental ? ' (2 uses)' : '') + '</button>' +
      '<button type="button" class="btn" data-fav="' + e.id + '" aria-pressed="' + isFav + '">' + (isFav ? '&#9733; Known form' : '&#9734; Mark as known form') + '</button>' +
      '<button type="button" class="btn" data-hide="' + e.id + '" aria-pressed="' + isHid + '">' + (isHid ? 'Show in list again' : 'Hide from list') + '</button></div></div>';
    h += sbBody(b, r);
    if (b.note) h += '<p class="small">' + esc(b.note) + '</p>';
    h += '<div class="wsnote">' + (el.ok ? '<b>Available</b> to a ' + (r.moonActive ? 'Moon' : 'standard') + ' druid at level ' + state.level + ' (' + dlgEd + ' rules).' :
      '<b>Not yet available</b> at level ' + state.level + ': ' + esc(el.why.join('; ')) + '.') +
      ' Faded scores (Int/Wis/Cha) are replaced by your own.</div>';
    $('#dBody').innerHTML = h;
    var d = $('#detail');
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); if (window.DndUI) DndUI.enter(d.querySelector('.dlg')); }
    d.querySelector('.dlg').scrollTop = 0;
  }
  /* full stat block: the shared renderer (STYLE.md 6i), with Wild Shape's own notes in its hooks */
  function sbBody(b, r, mini) {
    var acx = r.moonAC && b.type === 'Beast' ? ' <span class="small">&rarr; ' + Math.max(b.ac, r.moonAC) + ' with Circle Forms</span>' : '';
    var hpx = dpr(b) ? ' &nbsp; <b>Damage per round</b> ~' + dpr(b) + (dprCharge(b) ? ', ~' + dprCharge(b) + ' with a charge or pounce' : '') + ' <span class="small muted">(all attacks hit)</span>' : '';
    return DndStatblock.html(b, { ed: b.edition || state.ed, mini: !!mini, after: { ac: acx, hp: hpx } });
  }

  /* ---------- controls ---------- */
  function syncControls() {
    document.querySelectorAll('[data-ed]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.ed === state.ed); });
    document.querySelectorAll('[data-circle]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.circle === state.circle); });
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
    store.set('ws.sort', state.sort); store.set('ws.detail', state.detail); store.set('ws.merge', state.merge); store.set('ws.srcSel', state.srcSel);
    var p = prof();
    p.favs = state.favs; p.hidden = state.hidden; p.notes = state.notes;
    p.settings = { ed: state.ed, circle: state.circle, level: state.level, wis: state.wis };
    writeProfiles();
    store.set('ws.trk', { open: state.trackerOpen, min: state.trackerMin });
  }
  /* read-only summary for the hub's Character Sheet and Party pages (STYLE.md 6e): the linked druid
     character's starred forms for the current edition, with final AC (Moon AC floor applied) */
  function spdText(sp) {
    return ['walk', 'climb', 'swim', 'fly', 'burrow'].filter(function (k) { return sp && sp[k]; }).map(function (k) {
      return (k === 'walk' ? '' : k + ' ') + sp[k] + (k === 'fly' && sp.hover ? ' (hover)' : '');
    }).join(', ');
  }
  function publishSheet() {
    if (!window.DndChar || !DndChar.setSheet || !DATA || applying) return;
    var ch = linkedChar(PROFILES.active);
    if (!ch || !DndChar.levelIn(ch, 'druid')) return;
    var r = rules(state.ed, state.circle, state.level, state.wis), forms = [];
    DATA.beasts.forEach(function (e) {
      var b = e.editions[state.ed];
      if (!b || !state.favs[favKey(e.id)]) return;
      forms.push({ n: b.name, cr: b.crText, ac: shownAC(b, r), hp: b.hp, spd: spdText(b.speed) });
    });
    (DATA.others || []).forEach(function (o) {
      if (state.favs[favKey(o.id)]) forms.push({ n: o.name, cr: o.crText, spd: spdText(o.speed) });
    });
    forms.sort(function (x, y) { return crNum(y.cr) - crNum(x.cr) || x.n.localeCompare(y.n); });
    var sum = { v: 1, ed: state.ed, uses: r.uses, maxcr: crText(r.maxCR), forms: forms };
    while (JSON.stringify(sum).length > 5900 && sum.forms.length) sum.forms.pop();
    DndChar.setSheet(ch.id, REPO, sum);
  }
  function crNum(t) { var m = String(t).split('/'); return m.length > 1 ? m[0] / m[1] : +t || 0; }
  function copyLink(btn) {
    writeURL();
    var done = function () { btn.textContent = 'Link copied'; if (window.DndUI) DndUI.pop(btn); setTimeout(function () { btn.textContent = 'Copy link'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, function () { prompt('Copy this link:', location.href); });
    else prompt('Copy this link:', location.href);
  }
  function update(patch) { for (var k in patch) state[k] = patch[k]; save(); render(); }
  (function () {
    var sec = $('#crSec'); if (!sec) return;
    if (store.get('ws.crchart') === 'closed') sec.open = false;
    sec.addEventListener('toggle', function () { store.set('ws.crchart', sec.open ? 'open' : 'closed'); if (sec.open) render(); });
  })();

  document.addEventListener('click', function (ev) {
    if (ev.target.closest('.dd-roll, a')) return;   // dice (dice.js) and links (links.js) inside cards act on their own
    var t = ev.target.closest('button, .card');
    if (!t) return;
    if (t.dataset.ed) { manualRules(); return update({ ed: t.dataset.ed }); }
    if (t.dataset.circle) { manualRules(); return update({ circle: t.dataset.circle }); }
    if (t.dataset.detail) return update({ detail: t.dataset.detail });
    if (t.dataset.trk) return trkAction(t.dataset.trk);
    if (t.id === 'printForms') return printForms();
    if (t.dataset.trkroll) return rollAttack(+t.dataset.trkroll, t.dataset.kind);
    if (t.dataset.transform) return startForm(t.dataset.transform, t.dataset.ted);
    if (t.dataset.feat) {
      var fs = state.feats.slice(), fi = fs.indexOf(t.dataset.feat);
      if (fi >= 0) fs.splice(fi, 1); else fs.push(t.dataset.feat);
      return update({ feats: fs });
    }
    if (t.id === 'srcAll') return setSources(allBooks(), true);
    if (t.id === 'srcNone') return setSources(allBooks(), false);
    if (t.id === 'srcCore') return update({ srcSel: coreSel() });
    if (t.id === 'resetBtn') { $('#search').value = ''; return update(Object.assign({}, FILTER_DEFAULTS, { moves: [], feats: [], size: [], srcSel: coreSel(), showAll: false, swarms: false, merge: false, sort: 'cr-desc', detail: 'basic' })); }
    if (t.id === 'copyLink') return copyLink(t);
    if (t.id === 'srcShown') { var vis = visibleSrcKeys(); setSources(Object.keys(sourceCounts()), false); return setSources(vis, true); }
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
    if (t.dataset.open) return openDetail(t.dataset.open);
    if (t.dataset.pact) { $('#pMenu').open = false; return profileAction(t.dataset.pact); }
    if (t.dataset.edTab) return openDetail(dlgId, t.dataset.edTab);
    if (t.id === 'closeDlg') return $('#detail').close();
    if (t.classList.contains('card') && !t.classList.contains('book')) return openDetail(t.dataset.id);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.id === 'trkAmt') { ev.preventDefault(); return trkAction('dmg'); }
    /* Escape closes an open menu and puts focus back on its button */
    if (ev.key === 'Escape') {
      var open = document.querySelector('details.srcpick[open], #pMenu[open]');
      if (open) { ev.preventDefault(); open.open = false; open.querySelector('summary').focus(); }
    }
  });
  $('#detail').addEventListener('click', function (ev) { if (ev.target === this) this.close(); });
  /* dice.js puts its roll tray on <body>, under the modal stat block dialog's top layer; while the dialog is
     open, keep the tray inside it so rolls made there can be seen (until shared dice.js handles dialogs) */
  document.addEventListener('click', function (ev) {
    var d = $('#detail');
    if (!d.open || !ev.target.closest('#detail .dd-roll')) return;
    setTimeout(function () { var tr = document.querySelector('.dd-tray'); if (tr && tr.parentNode !== d) d.appendChild(tr); }, 0);
  }, true);
  $('#detail').addEventListener('close', function () {
    var tr = document.querySelector('#detail .dd-tray'); if (tr) document.body.appendChild(tr);
    if (/^#beast=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    render();
  });
  /* deep link #beast=<id>[&ed=2014] opens that beast's stat block (the hub search links here, STYLE.md 6j) */
  function openFromHash() {
    var m = /^#beast=([\w-]+)(?:&ed=(2014|2024))?/.exec(location.hash);
    if (m && DATA && DATA.beasts.some(function (x) { return x.id === m[1]; })) openDetail(m[1], m[2]);
  }
  window.addEventListener('hashchange', openFromHash);
  document.addEventListener('input', function (ev) {
    var id = ev.target.dataset && ev.target.dataset.note;
    if (!id) return;
    var n = Object.assign({}, state.notes), v = ev.target.value;
    if (v.trim()) n[id] = v; else delete n[id];
    state.notes = n; save();
  });
  $('#showHidden').addEventListener('change', function () { update({ showHidden: this.checked }); });
  $('#profile').addEventListener('change', function () { if (!linkedChar(PROFILES.active)) PROFILES.lastFree = PROFILES.active; switchProfile(this.value); });
  $('#importFile').addEventListener('change', function () { if (this.files[0]) importData(this.files[0]); this.value = ''; });
  document.addEventListener('click', function (ev) { var p = $('#pMenu'); if (p.open && !p.contains(ev.target)) p.open = false; });

  /* ---------- profiles, export / import ---------- */
  /* ---------- profiles across tabs ----------
     Another tab can change ws.profiles. Writes merge: this tab owns only its active profile,
     everything else is taken from storage; structural changes (new, rename, delete, import) re-read first. */
  function syncProfiles() {
    var f = store.get('ws.profiles', null);
    if (!f || !f.list || typeof f.list !== 'object') return;
    var mine = PROFILES.list[PROFILES.active];
    PROFILES.list = f.list; PROFILES.lastFree = f.lastFree;
    if (mine && !PROFILES.list[PROFILES.active]) PROFILES.list[PROFILES.active] = mine;
  }
  function writeProfiles() {
    var f = store.get('ws.profiles', null);
    if (f && f.list && typeof f.list === 'object') for (var n in f.list) if (n !== PROFILES.active) PROFILES.list[n] = f.list[n];
    store.set('ws.profiles', PROFILES);
  }
  function writeAllProfiles() { store.set('ws.profiles', PROFILES); }
  window.addEventListener('storage', function (ev) {
    if (ev.key !== 'ws.profiles') return;
    var mine = PROFILES.active, keep = PROFILES.list[mine];
    var f = store.get('ws.profiles', null);
    if (!f || !f.list) return;
    PROFILES.list = f.list; PROFILES.lastFree = f.lastFree;
    if (!PROFILES.list[mine]) PROFILES.list[mine] = keep; /* deleted in the other tab: keep this tab's copy */
    PROFILES.active = mine;
    var p = prof(); state.favs = p.favs; state.hidden = p.hidden; state.notes = p.notes;
    renderProfiles(); renderCharNote();
    if (DATA && !$('#detail').open) render();
  });

  /* ---------- shared characters (dnd.characters, see character.js) ----------
     A character with druid levels has its own profile (links[REPO].profile), so stars, hidden beasts
     and notes are per character, and it sets edition, druid level, circle and WIS while the profile
     follows it (profile.follow). Changing those by hand stops following until the user ticks it again.
     Changes elsewhere only matter when those fields change (profile.applied); nothing is written back. */
  var REPO = 'dnd-druid-wildshapes', applying = false, lastSeen = null, URL_WINS = false, UNKNOWN_CHAR = false;
  (function () {
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      var u = new URL(nav ? nav.name : location.href);
      /* a link someone opened keeps its own rules; a reload or back/forward takes the character's current ones */
      URL_WINS = (!nav || nav.type === 'navigate') && (u.searchParams.has('ed') || u.searchParams.has('lvl') || u.searchParams.has('circle'));
      var want = u.searchParams.get('char');
      UNKNOWN_CHAR = !!(want && window.DndChar && !DndChar.get(want));
    } catch (e) { /* old browser */ }
  })();
  function charProfile(ch) { var l = ch && ch.links && ch.links[REPO]; return l && typeof l === 'object' ? l.profile : null; }
  function linkedChar(name) {
    if (!window.DndChar) return null;
    var a = DndChar.active();
    if (a && charProfile(a) === name) return a;
    return DndChar.all().filter(function (c) { return charProfile(c) === name; })[0] || null;
  }
  function charRules(ch) {
    var dl = ch ? DndChar.levelIn(ch, 'druid') : 0;
    if (!dl) return null;
    var moon = DndChar.sameSub(DndChar.classOf(ch, 'druid'), { sub: 'moon', subName: 'Circle of the Moon' });
    return { ed: ch.ed, level: Math.max(2, dl), circle: moon ? 'moon' : 'standard', wis: Math.max(-1, Math.min(7, DndChar.mod(ch, 'wis'))), dl: dl };
  }
  function rulesKey(cr) { return cr ? [cr.ed, cr.level, cr.circle, cr.wis].join('|') : ''; }
  function following() {
    var ch = window.DndChar && DndChar.active();
    return !!(ch && charRules(ch) && charProfile(ch) === PROFILES.active && prof().follow !== false);
  }
  /* the profile tied to ch, made (or an unlinked one of the same name adopted) on first use */
  function profileFor(ch) {
    var name = charProfile(ch);
    if (name && PROFILES.list[name]) return name;
    syncProfiles();
    name = ch.name.slice(0, 40) || 'Character';
    var other = PROFILES.list[name] && linkedChar(name);
    if (other && other.id !== ch.id) { var base = name.slice(0, 36); for (var i = 2; PROFILES.list[base + ' ' + i]; i++); name = base + ' ' + i; }
    if (!PROFILES.list[name]) PROFILES.list[name] = { favs: {}, hidden: {}, notes: {}, follow: true };
    writeAllProfiles();
    DndChar.setLink(ch.id, REPO, { profile: name });
    return name;
  }
  /* a profile with no character: the last one used, else any, else a new "My druid" */
  function freeProfile() {
    if (PROFILES.lastFree && PROFILES.list[PROFILES.lastFree] && !linkedChar(PROFILES.lastFree)) return PROFILES.lastFree;
    var free = Object.keys(PROFILES.list).sort().filter(function (n) { return !linkedChar(n); })[0];
    if (free) return free;
    var n = 'My druid'; for (var i = 2; PROFILES.list[n]; i++) n = 'My druid ' + i;
    PROFILES.list[n] = { favs: {}, hidden: {}, notes: {} }; writeAllProfiles();
    return n;
  }
  function setRules(cr) {
    state.ed = cr.ed; state.level = cr.level; state.circle = cr.circle; state.wis = cr.wis;
    clampState(); prof().applied = rulesKey(cr); save(); syncControls();
  }
  function applyChar(ch, first, force) {
    if (applying || !window.DndChar) return;
    var cr = charRules(ch), seen = ch ? ch.id + '#' + rulesKey(cr) : '';
    if (!first && !force && seen === lastSeen) { renderCharNote(); renderSaveChar(); return; } /* only `updated` or a link changed */
    lastSeen = seen;
    applying = true;
    try {
      if (!ch || !cr) {
        /* None (or a character without druid levels): leave a character's profile for a plain one */
        if (!ch && linkedChar(PROFILES.active)) switchProfile(freeProfile(), true, first);
      } else {
        var name = profileFor(ch);
        if (name !== PROFILES.active) {
          if (!linkedChar(PROFILES.active)) PROFILES.lastFree = PROFILES.active;
          switchProfile(name, true, first);
        }
        var p = prof();
        if (p.follow === undefined) p.follow = true;
        if (p.follow !== false && !(first && URL_WINS)) setRules(cr);
        else if (p.applied == null) { p.applied = rulesKey(cr); save(); }
      }
    } finally { applying = false; }
    renderCharNote(); renderSaveChar();
    if (!first && DATA) render();
  }
  /* the user set edition, circle, level or WIS by hand: that wins over the character */
  function manualRules() { if (following()) { prof().follow = false; save(); renderCharNote(); } }
  function followAgain() {
    var ch = DndChar.active(); if (!ch) return;
    var name = profileFor(ch);
    if (name !== PROFILES.active) switchProfile(name, true);
    prof().follow = true; prof().applied = null;
    applyChar(ch, false, true);
  }
  function renderCharNote() {
    var note = $('#charNote');
    if (!window.DndChar) { note.hidden = true; return; }
    var ch = DndChar.active(), h = UNKNOWN_CHAR ? 'That character isn\'t in this browser. ' : '';
    if (ch) {
      var cr = charRules(ch);
      if (!cr) h += '<b>' + esc(ch.name) + '</b> (' + esc(DndChar.short(ch) || 'no classes') + ') has no druid levels, so your own settings are used.';
      else if (charProfile(ch) !== PROFILES.active) h += 'This profile isn\'t tied to <b>' + esc(ch.name) + '</b>. <button type="button" class="linkbtn" data-follow>Use ' + esc(ch.name) + '</button>';
      else {
        var p = prof(), fol = p.follow !== false, changed = rulesKey(cr) !== p.applied;
        h += '<label class="follow"><input type="checkbox" id="followChar"' + (fol ? ' checked' : '') + '> Follow <b>' + esc(ch.name) + '</b></label> ' +
          '<span>(' + esc(DndChar.summary(ch)) + (cr.circle === 'moon' ? ', Circle of the Moon' : '') + ', WIS ' + sgn(cr.wis) + ')</span>. ';
        if (!fol) h += changed ? 'The character has changed since you set things by hand. <button type="button" class="linkbtn" data-follow>Apply it</button> ' : 'You set the rules by hand. ';
        else if (rulesKey(cr) !== rulesKey(state)) h += 'This link set its own rules. <button type="button" class="linkbtn" data-follow>Use the character\'s</button> ';
        else if (cr.dl < 2) h += 'Wild Shape starts at druid level 2, so level 2 is shown. ';
        h += 'Edit the character in the <a href="' + DndChar.url('dnd-multiclass-planner', ch.id) + '">Multiclass Planner</a>.';
      }
    }
    note.innerHTML = h; note.hidden = !h;
  }
  function saveAsCharacter() {
    if (!window.DndChar) return;
    if (linkedChar(PROFILES.active)) return alert('This profile is already a character: ' + linkedChar(PROFILES.active).name + '.');
    if (!confirm('Save "' + PROFILES.active + '" as a shared character (Druid ' + state.level + (state.circle === 'moon' ? ', Circle of the Moon' : '') + ', ' + state.ed + ' rules)? Every D&D Toolbox site can then use it. Ability scores other than WIS start at 10; set them in the Multiclass Planner.')) return;
    save();
    prof().follow = true;
    var ch = DndChar.save({ name: PROFILES.active, ed: state.ed,
      classes: [{ cls: 'druid', lvl: state.level, sub: state.circle === 'moon' ? 'moon' : null, subName: state.circle === 'moon' ? 'Circle of the Moon' : null }],
      ab: [10, 10, 10, 10, Math.max(1, Math.min(30, 10 + 2 * state.wis)), 10],
      links: (function () { var l = {}; l[REPO] = { profile: PROFILES.active }; return l; })() }, REPO);
    DndChar.setActive(ch.id);
  }
  function renderSaveChar() { var b = $('#saveCharBtn'); if (b) b.hidden = !window.DndChar || !!linkedChar(PROFILES.active); }

  function renderProfiles() {
    renderSaveChar();
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
  /* fromChar: called by the character code, which renders afterwards; noSave: the current state isn't the old profile's (first load) */
  function switchProfile(name, fromChar, noSave) {
    if (!noSave) save();
    if (!PROFILES.list[name]) return;
    PROFILES.active = name;
    loadProfile(); save(); renderProfiles();
    if (!fromChar) { renderCharNote(); render(); }
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
      save(); syncProfiles();
      PROFILES.list[n] = { favs: {}, hidden: {}, notes: {}, settings: { ed: state.ed, circle: state.circle, level: state.level, wis: state.wis } };
      writeAllProfiles();
      return switchProfile(n);
    }
    if (a === 'rename') {
      var old = PROFILES.active, nn = askName('Rename "' + old + '" to:', old);
      if (!nn) return;
      save(); syncProfiles();
      PROFILES.list[nn] = PROFILES.list[old]; delete PROFILES.list[old];
      PROFILES.active = nn; writeAllProfiles();
      if (window.DndChar) DndChar.all().forEach(function (c) { if (charProfile(c) === old) DndChar.setLink(c.id, REPO, { profile: nn }); });
      renderProfiles(); return render();
    }
    if (a === 'delete') {
      var names = Object.keys(PROFILES.list);
      if (names.length < 2) return alert('This is your only profile. Create another one before deleting it.');
      if (!confirm('Delete the profile "' + PROFILES.active + '" with its starred forms, hidden beasts and notes? Export a backup first if you might want it back.')) return;
      syncProfiles();
      delete PROFILES.list[PROFILES.active];
      PROFILES.active = Object.keys(PROFILES.list)[0];
      writeAllProfiles();
      loadProfile(); save(); renderProfiles(); renderCharNote(); return render();
    }
    if (a === 'savechar') return saveAsCharacter();
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
      var map = {}, names = [];
      Object.keys(d.profiles).forEach(function (n) {
        var t = String(n).trim().slice(0, 40); if (!t) return;
        for (var i = 2; map[t]; i++) t = String(n).trim().slice(0, 36) + ' ' + i; /* two names that shorten alike */
        map[t] = n; names.push(t);
      });
      if (!names.length) return alert('The backup has no profiles in it.');
      syncProfiles();
      var clash = names.filter(function (n) { return PROFILES.list[n]; });
      if (clash.length && !confirm('The backup has ' + names.length + ' profile(s). These already exist here and will be replaced by the backup copy:\n\n' + clash.join(', ') + '\n\nYour other profiles are kept. Continue?')) return;
      save();
      names.forEach(function (n) {
        var p = d.profiles[map[n]] || {};
        PROFILES.list[n] = { favs: cleanFlags(p.favs), hidden: cleanFlags(p.hidden), notes: cleanNotes(p.notes), settings: cleanSettings(p.settings) };
      });
      var act = names.filter(function (n) { return map[n] === d.active; })[0];
      PROFILES.active = act || names[0];
      writeAllProfiles();
      loadProfile(); save(); renderProfiles(); renderCharNote(); render();
      alert('Restored ' + names.length + ' profile(s) from the backup.');
    };
    rd.readAsText(file);
  }
  renderProfiles();
  if (window.DndChar) {
    applyChar(DndChar.active(), true);
    DndChar.onChange(function (ch) { applyChar(ch, false); });
  }
  $('#charNote').addEventListener('change', function (ev) {
    if (ev.target.id !== 'followChar') return;
    if (ev.target.checked) followAgain(); else { prof().follow = false; save(); renderCharNote(); }
  });
  $('#charNote').addEventListener('click', function (ev) { if (ev.target.closest('[data-follow]')) followAgain(); });
  $('#level').addEventListener('input', function () { manualRules(); update({ level: +this.value }); });
  $('#wis').addEventListener('input', function () { var v = parseInt(this.value, 10); if (!isNaN(v)) { manualRules(); update({ wis: Math.max(-1, Math.min(7, v)) }); } });
  $('#search').value = state.q;
  $('#search').addEventListener('input', function () { update({ q: this.value }); });
  function tickList(list, key, attr) {
    $(list).addEventListener('change', function (ev) {
      var v = ev.target.dataset[attr]; if (!v) return;
      var arr = state[key].filter(function (x) { return x !== v; });
      if (ev.target.checked) arr.push(v);
      var p = {}; p[key] = arr; update(p);
    });
  }
  tickList('#moveList', 'moves', 'move'); tickList('#sizeList', 'size', 'size');
  $('#moveNone').addEventListener('click', function () { update({ moves: [] }); });
  $('#sizeNone').addEventListener('click', function () { update({ size: [] }); });
  $('#sort').addEventListener('change', function () { update({ sort: this.value }); });
  $('#showAll').addEventListener('change', function () { update({ showAll: this.checked }); });
  $('#swarms').addEventListener('change', function () { update({ swarms: this.checked }); });
  $('#merge').addEventListener('change', function () { update({ merge: this.checked }); });
  $('#srcQ').addEventListener('input', function () { state.srcQ = this.value; renderSources(); });
  $('#srcList').addEventListener('change', function (ev) { var k = ev.target.dataset.src; if (k) setSources([k], ev.target.checked); });
  document.addEventListener('click', function (ev) { var p = $('#srcPick'); if (p.open && !p.contains(ev.target)) p.open = false; });
  $('#favOnly').addEventListener('change', function () { update({ favOnly: this.checked }); });
  $('#featList').addEventListener('change', function (ev) {
    var f = ev.target.dataset.feat; if (!f) return;
    var fs = state.feats.filter(function (x) { return x !== f; });
    if (ev.target.checked) fs.push(f);
    update({ feats: fs });
  });
  $('#featNone').addEventListener('click', function () { update({ feats: [] }); });
  document.addEventListener('click', function (ev) {
    ['#featPick', '#movePick', '#sizePick'].forEach(function (id) { var p = $(id); if (p.open && !p.contains(ev.target)) p.open = false; });
  });
  /* only one filter menu open at a time */
  document.querySelectorAll('details.srcpick').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      document.querySelectorAll('details.srcpick').forEach(function (o) { if (o !== d) o.open = false; });
      var pop = d.querySelector('.srcpop'); pop.style.left = '0px';
      var r = pop.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 16);
      if (over > 0) pop.style.left = -Math.min(over, r.left - 16) + 'px';
    });
  });


  fetch('data/beasts.json?v=dev').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d;
    $('#generated').textContent = 'Data built ' + d.generated + ' · ' + d.beasts.length + ' creatures with stat blocks, ' + (d.others || []).length + ' more from other books.';
    renderSourceLinks();
    render();
    openFromHash();
  }).catch(function (err) {
    $('#list').innerHTML = '<p class="empty">Could not load the beast data (' + esc(err.message) + ').</p>';
  });
  syncControls();
})();
