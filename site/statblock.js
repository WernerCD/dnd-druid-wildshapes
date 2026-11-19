/* dnd-shared statblock.js v1.0 (canonical copy: WernerCD/dnd shared/statblock.js). Copy unchanged to site/statblock.js.
 * One stat block look for every D&D Toolbox page that shows a creature (STYLE.md 6i): Monster Lookup, the
 * encounter builder, Wild Shape. Styles are the .dsb rules in the dnd-shared CSS block (v1.10+).
 *
 *   DndStatblock.html(m, opts)  -> '<div class="dsb">...</div>'
 *     m: a creature record as the toolbox data files store it. Either shape works:
 *        ab: [str,dex,con,int,wis,cha]  or  abilities: {str: ..}; bonus or bonusActions; hover on m or m.speed.
 *        Missing fields are left out (facts-only entries with no text show just their numbers).
 *     opts.ed      '2014' | '2024' (default m.edition or '2024'): line labels and saves in the ability grid
 *     opts.head    true -> name and type line on top (h3, or opts.headTag)
 *     opts.mini    true -> smaller type, for cards
 *     opts.after   { ac: html, hp: html, speed: html, cr: html } -> extra HTML appended to that line (already escaped)
 *     opts.extra   html appended at the end, inside the block
 *     opts.source  text for the small credit line at the bottom (e.g. "SRD 5.2, CC BY 4.0"), escaped here
 *   DndStatblock.typeLine(m), .speedText(m), .md(text), .mod(score), .sgn(n)
 */
(function () {
  var AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sgn(n) { return (n >= 0 ? '+' : '−') + Math.abs(n); }
  function mod(s) { return Math.floor((s - 10) / 2); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  function abil(m) {
    if (Array.isArray(m.ab)) return m.ab;
    var a = m.abilities || {};
    return AB.map(function (k) { return a[k]; });
  }
  function md(s) {   // the SRD text uses a little Markdown: bold, italics, bullet lists
    var lines = esc(s).split('\n'), out = [], inList = false;
    lines.forEach(function (ln) {
      var t = ln.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])[*_](\S[^*_]*?)[*_](?=[^*\w]|$)/g, '$1<i>$2</i>');
      if (/^\s*[-*] /.test(ln)) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + t.replace(/^\s*[-*] /, '') + '</li>'); return; }
      if (inList) { out.push('</ul>'); inList = false; }
      if (t.trim()) out.push(out.length && !/<\/ul>$/.test(out[out.length - 1]) ? '<br>' + t : t);
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }
  function typeLine(m) {
    return [m.size, m.type].filter(Boolean).join(' ') + (m.sub ? ' (' + m.sub + ')' : '') + (m.swarm ? ', swarm' : '') + (m.align ? ', ' + m.align : '');
  }
  function speedText(m) {
    var sp = m.speed || {}, hover = m.hover || sp.hover;
    var out = ['walk', 'burrow', 'climb', 'fly', 'swim'].filter(function (k) { return sp[k] || (k === 'walk' && !sp.fly && !sp.swim && !sp.burrow && !sp.climb); }).map(function (k) {
      return (k === 'walk' ? '' : k + ' ') + (sp[k] || 0) + ' ft.' + (k === 'fly' && hover ? ' (hover)' : '');
    });
    return out.join(', ');
  }
  function line(label, val, after) { return val || after ? '<p><b>' + label + '</b> ' + esc(val || '') + (after || '') + '</p>' : ''; }
  function section(t, rows, intro) {
    if (!rows || !rows.length) return '';
    return '<h4 class="dsb-sec">' + t + '</h4>' + (intro ? '<p class="dsb-blk">' + md(intro) + '</p>' : '') +
      rows.map(function (a) { return '<div class="dsb-blk"><b>' + esc(a.name) + '.</b> ' + md(a.desc || '') + '</div>'; }).join('');
  }

  function html(m, o) {
    o = o || {};
    var ed = String(o.ed || m.edition || '2024'), x = o.after || {}, a = abil(m), h = '';
    var t = esc(o.headTag || 'h3');
    if (o.head) h += '<div class="dsb-head"><' + t + ' class="dsb-name">' + esc(m.name) + '</' + t + '><p class="dsb-type">' + esc(typeLine(m)) + '</p></div>';
    var ac = m.ac != null ? m.ac + (m.acNote ? ' (' + m.acNote + ')' : '') : '';
    h += '<p><b>Armor Class</b> ' + esc(ac || '?') + (x.ac || '') + (ed === '2024' && m.init != null ? ' &nbsp; <b>Initiative</b> ' + sgn(m.init) + ' (' + (10 + m.init) + ')' : '') + '</p>';
    h += '<p><b>Hit Points</b> ' + esc(m.hp == null ? '?' : m.hp) + (m.hd ? ' (' + esc(m.hd) + ')' : '') + (x.hp || '') + '</p>';
    h += '<p><b>Speed</b> ' + esc(speedText(m)) + (x.speed || '') + '</p>';
    if (a.some(function (s) { return s != null; })) {
      h += '<div class="dsb-abil' + (ed === '2024' ? ' saves' : '') + '">' + AB.map(function (k, i) {
        var s = a[i], md_ = s == null ? null : mod(s), sv = m.saves && m.saves[k] != null ? m.saves[k] : md_;
        return '<div><b>' + k.toUpperCase() + '</b>' + (s == null ? '?' : s + ' <span class="dsb-mod">(' + sgn(md_) + ')</span>') +
          (ed === '2024' && sv != null ? '<span class="dsb-sv" title="Saving throw">Save ' + sgn(sv) + '</span>' : '') + '</div>';
      }).join('') + '</div>';
    }
    if (ed !== '2024') {
      h += line('Saving Throws', AB.filter(function (k) { return m.saves && m.saves[k] != null; }).map(function (k) { return cap(k) + ' ' + sgn(m.saves[k]); }).join(', '));
    }
    h += line('Skills', Object.keys(m.skills || {}).sort().map(function (k) { return k.split('_').map(cap).join(' ') + ' ' + sgn(m.skills[k]); }).join(', '));
    h += line(ed === '2024' ? 'Vulnerabilities' : 'Damage Vulnerabilities', m.vuln);
    h += line(ed === '2024' ? 'Resistances' : 'Damage Resistances', m.resist);
    if (ed === '2024') h += line('Immunities', [m.immune, m.condImmune].filter(Boolean).join('; '));
    else { h += line('Damage Immunities', m.immune); h += line('Condition Immunities', m.condImmune); }
    h += line('Senses', (m.senses || []).concat(m.pp != null ? ['passive Perception ' + m.pp] : []).join(', '));
    if (m.lang !== undefined) h += line('Languages', m.lang || '—');
    if (m.crText != null || m.cr != null) {
      var cr = m.crText != null ? m.crText : m.cr;
      h += ed === '2024'
        ? '<p><b>CR</b> ' + esc(cr) + (m.xp != null ? ' (XP ' + num(m.xp) + (m.xpLair ? ', or ' + num(m.xpLair) + ' in lair' : '') + (m.pb != null ? '; PB ' + sgn(m.pb) : '') + ')' : '') + (x.cr || '') + '</p>'
        : '<p><b>Challenge</b> ' + esc(cr) + (m.xp != null ? ' (' + num(m.xp) + ' XP)' : '') + (m.pb != null ? ' &nbsp; <b>Proficiency Bonus</b> ' + sgn(m.pb) : '') + (x.cr || '') + '</p>';
    }
    h += section('Traits', m.traits) + section('Actions', m.actions) + section('Bonus Actions', m.bonus || m.bonusActions) +
      section('Reactions', m.reactions) + section('Legendary Actions', m.legendary, m.legIntro);
    h += o.extra || '';
    if (o.source) h += '<p class="dsb-src">' + esc(o.source) + '</p>';
    return '<div class="dsb' + (o.mini ? ' mini' : '') + '">' + h + '</div>';
  }

  window.DndStatblock = { html: html, typeLine: typeLine, speedText: speedText, md: md, mod: mod, sgn: sgn };
})();
