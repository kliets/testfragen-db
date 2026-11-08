/* Darstellung von Aufgaben und Prüfungsbögen (Vorschau, Druck und Editor nutzen dieselbe Funktion). */
const R = (() => {
  const SUBJECTS = ['Mathematik', 'Physik', 'Informatik'];
  const GRADES = ['5', '6', '7', '8', '9', '10', 'E', 'Q1', 'Q2'];
  const TYPES = { frei: 'Freie Aufgabe', mc: 'Multiple Choice', wf: 'Wahr/Falsch', luecke: 'Lückentext', teil: 'Mit Teilaufgaben' };
  const AFB = { 1: 'I', 2: 'II', 3: 'III' };
  const AFB_SOLL = { 1: 30, 2: 50, 3: 20 };

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const fmt = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
  const gradeLabel = g => !g ? '' : (/^\d+$/.test(g) ? 'Klasse ' + g : g === 'E' ? 'Einführungsphase' : g);

  const FONTS = {
    sans:    { label: 'Arial (serifenlos)',      css: 'Arial, "Liberation Sans", Helvetica, sans-serif', odt: 'Arial', gen: 'swiss' },
    serif:   { label: 'Times New Roman (Serifen)', css: '"Times New Roman", "Liberation Serif", Times, serif', odt: 'Times New Roman', gen: 'roman' },
    verdana: { label: 'Verdana (breit, gut lesbar)', css: 'Verdana, "DejaVu Sans", Geneva, sans-serif', odt: 'Verdana', gen: 'swiss' },
    calibri: { label: 'Calibri', css: 'Calibri, Carlito, "Liberation Sans", Arial, sans-serif', odt: 'Calibri', gen: 'swiss' },
    georgia: { label: 'Georgia (Serifen, lesefreundlich)', css: 'Georgia, "DejaVu Serif", "Times New Roman", serif', odt: 'Georgia', gen: 'roman' }
  };
  const fontOf = e => FONTS[e && e.font] || FONTS.sans;
  const fsizeOf = e => [10, 11, 12, 13, 14].includes(+(e && e.fsize)) ? +e.fsize : 11;
  const ACCENTS = { schwarz: ['Schwarz', '#000000'], blau: ['Dunkelblau', '#1f3a8a'], petrol: ['Petrol', '#0b6e75'], gruen: ['Dunkelgrün', '#1a6b2a'], bordeaux: ['Bordeaux', '#8b1e3f'], anthrazit: ['Anthrazit', '#374151'] };
  const accentOf = e => (ACCENTS[e && e.accent] || ACCENTS.schwarz)[1];
  const fontStyle = e => `font-family:${fontOf(e).css};font-size:${fsizeOf(e)}pt;--acc:${accentOf(e)}`;
  const imgs = q => (q && Array.isArray(q.images) && q.images.length) ? q.images.filter(i => i && i.src) : (q && q.image ? [{ src: q.image, w: +q.imgw || 60 }] : []);

  function tex(t, display) {
    try { return katex.renderToString(t, { displayMode: display, throwOnError: false }); }
    catch (e) { return esc(t); }
  }

  /* ================= Layout-Sprache =================
     Inline : **fett**  *kursiv*  __unterstrichen__  ~~durchgestrichen~~  `code`  $Formel$  $$Formel$$  [[Lücke]]
              {c:rot|Text}  {bg:gelb|Text}  {s:groß|Text}  {s:hoch|2}  {s:tief|2}  {img:ID}
     Absatz : # Überschrift  ## …  - Liste  1. Liste  --- Linie  | Tabelle |  ```Code```
     Kasten : :::merke Titel … :::   (merke, definition, beispiel, achtung, tipp, info, rahmen)
     Ausr.  : :::mitte … :::   :::rechts … :::   :::blocksatz … :::
     Umbruch: :::seite                                                           */
  const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').trim();
  const COLORS = { schwarz: '#000000', rot: '#c00000', orange: '#d9730d', gruen: '#1a7a2e', blau: '#1f4fd8', lila: '#7a2fb5', grau: '#666666', braun: '#7a4a1c' };
  const COLOR_LABEL = { schwarz: 'Schwarz', rot: 'Rot', orange: 'Orange', gruen: 'Grün', blau: 'Blau', lila: 'Lila', grau: 'Grau', braun: 'Braun' };
  const MARKS = { gelb: '#fff176', gruen: '#c8f0c8', blau: '#cde4ff', rosa: '#ffd6e0', orange: '#ffe0b2', grau: '#e3e3e3' };
  const MARK_LABEL = { gelb: 'Gelb', gruen: 'Grün', blau: 'Blau', rosa: 'Rosa', orange: 'Orange', grau: 'Grau' };
  const SIZES = { klein: 0.82, gross: 1.3, riesig: 1.7 };
  const BOXES = {
    merke:      { label: 'Merke',      bar: '#1f4fd8', bg: '#eaf1ff' },
    definition: { label: 'Definition', bar: '#0b7a75', bg: '#e3f5f3' },
    beispiel:   { label: 'Beispiel',   bar: '#7a2fb5', bg: '#f3eafa' },
    achtung:    { label: 'Achtung',    bar: '#c00000', bg: '#fdecec' },
    tipp:       { label: 'Tipp',       bar: '#d9730d', bg: '#fff1de' },
    info:       { label: 'Info',       bar: '#4b5563', bg: '#f0f1f3' },
    rahmen:     { label: '',           bar: '#222222', bg: '#ffffff', frame: true }
  };
  const BOX_ALIAS = { merksatz: 'merke', satz: 'merke', regel: 'merke', hinweis: 'info', warnung: 'achtung', wichtig: 'achtung', kasten: 'rahmen' };
  const ALIGN_KIND = { mitte: 'center', zentriert: 'center', links: 'left', rechts: 'right', blocksatz: 'justify' };
  const colorOf = v => { const k = String(v || '').trim(); return /^#[0-9a-f]{6}$/i.test(k) ? k.toLowerCase() : (COLORS[norm(k)] || null); };
  const markOf = v => { const k = String(v || '').trim(); return /^#[0-9a-f]{6}$/i.test(k) ? k.toLowerCase() : (MARKS[norm(k)] || null); };
  const sizeOf = v => { const k = norm(v); return SIZES[k] ? { f: SIZES[k] } : (k === 'hoch' ? { pos: 'sup' } : k === 'tief' ? { pos: 'sub' } : null); };

  /* ---- Inline-Parser → Knotenbaum ---- */
  const RX = {
    code: /`([^`\n]+)`/y, math2: /\$\$([\s\S]+?)\$\$/y, math1: /\$([^$\n]+?)\$/y, gap: /\[\[(.+?)\]\]/y,
    img: /\{img:([\w-]+)\}/y, grp: /\{(c|bg|s):([^|{}\n]{1,20})\|/y
  };
  const MARKERS = [['**', 'b'], ['__', 'u'], ['~~', 'st'], ['*', 'i']];
  function parseInline(src) {
    const s = String(src ?? ''), n = s.length, failed = new Set();
    let i = 0, depth = 0, budget = 300000, noFmt = false;
    const isSp = ch => ch === undefined || /\s/.test(ch);
    const at = (rx, p) => { rx.lastIndex = p; return rx.exec(s); };
    function run(stop) { depth++; try { return runInner(stop); } finally { depth--; } }
    function runInner(stop) {
      const out = []; let buf = '';
      const flush = () => { if (buf) { out.push({ t: 'x', v: buf }); buf = ''; } };
      while (i < n) {
        if (--budget < 0) noFmt = true;
        const c = s[i];
        if (c === '\\' && s[i + 1] && '*_~{}|#'.includes(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
        if (c === '\n') { flush(); out.push({ t: 'br' }); i++; continue; }
        if (stop === '}' && c === '}') { flush(); i++; return { nodes: out, closed: true }; }
        if (stop && stop !== '}' && s.startsWith(stop, i) && (out.length || buf) && !isSp(s[i - 1]) && !(stop === '*' && s[i + 1] === '*' && s[i + 2] !== '*')) {
          flush(); i += stop.length; return { nodes: out, closed: true };
        }
        let m;
        if (c === '`' && (m = at(RX.code, i))) { flush(); out.push({ t: 'code', v: m[1] }); i += m[0].length; continue; }
        if (c === '$') {
          if (s[i + 1] === '$' && (m = at(RX.math2, i))) { flush(); out.push({ t: 'math', d: true, v: m[1] }); i += m[0].length; continue; }
          if ((m = at(RX.math1, i))) { flush(); out.push({ t: 'math', d: false, v: m[1] }); i += m[0].length; continue; }
        }
        if (c === '[' && s[i + 1] === '[' && (m = at(RX.gap, i))) { flush(); out.push({ t: 'gap', v: m[1] }); i += m[0].length; continue; }
        if (c === '{') {
          if ((m = at(RX.img, i))) { flush(); out.push({ t: 'img', id: m[1] }); i += m[0].length; continue; }
          if ((m = at(RX.grp, i))) {
            const key = 'g' + i;
            if (!failed.has(key) && depth <= 24 && !noFmt) {
              const save = i; i += m[0].length;
              const r = run('}');
              if (r.closed) { flush(); out.push({ t: m[1] === 's' ? 'sz' : m[1], v: m[2].trim(), c: r.nodes }); continue; }
              failed.add(key); i = save;
            }
            buf += m[0]; i += m[0].length; continue;
          }
        }
        let opened = false;
        for (const [mk, key] of MARKERS) {
          if (!s.startsWith(mk, i)) continue;
          const nxt = s[i + mk.length];
          if (isSp(nxt) || (mk === '*' && nxt === '*')) break;
          const fk = key + i;
          if (failed.has(fk) || depth > 24 || noFmt) break;
          const save = i; i += mk.length;
          const r = run(mk);
          if (r.closed) { flush(); out.push({ t: key, c: r.nodes }); opened = true; break; }
          failed.add(fk); i = save;
          break;
        }
        if (opened) continue;
        const mk2 = MARKERS.find(([mk]) => s.startsWith(mk, i));
        if (mk2 && !(stop === mk2[0])) { buf += mk2[0]; i += mk2[0].length; continue; }
        buf += c; i++;
      }
      flush();
      return { nodes: out, closed: false };
    }
    const tidy = ns => ns.filter((nd, k) => !(nd.t === 'br' && ((ns[k - 1] && ns[k - 1].t === 'math' && ns[k - 1].d) || (ns[k + 1] && ns[k + 1].t === 'math' && ns[k + 1].d))));
    return tidy(run(null).nodes);
  }

  /* ---- Block-Parser → Knotenbaum ---- */
  function splitCells(line) {
    let t = line.trim(); if (t[0] === '|') t = t.slice(1);
    const cells = []; let cur = '', math = false, code = false;
    for (let k = 0; k < t.length; k++) {
      const ch = t[k];
      if (ch === '\\' && t[k + 1] === '|') { cur += '|'; k++; continue; }
      if (ch === '$') math = !math;
      if (ch === '`') code = !code;
      if (ch === '|' && !math && !code) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    if (/\|\s*$/.test(line.trim()) && cells.length && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map(c => c.trim().replace(/<br\s*\/?>/gi, '\n'));
  }
  const isSepRow = cells => cells.length > 0 && cells.every(c => /^:?-{1,}:?$/.test(c.replace(/\s/g, '')));
  const RX_LI = /^(\s*)([-•–]|\d{1,2}[.)]|[a-z]\))\s+(\S.*)$/;
  const RX_H = /^\s*(#{1,3})\s+(\S.*)$/;
  const RX_HR = /^\s*(-{3,}|_{3,})\s*$/;
  const RX_DIR = /^\s*:::\s*([A-Za-zäöüÄÖÜß]+)\s*(.*)$/;
  const isBlockStart = l => /^\s*(```|\|)/.test(l) || RX_DIR.test(l) || RX_H.test(l) || RX_HR.test(l) || RX_LI.test(l);

  function prelines(src) {
    const L = String(src ?? '').replace(/\r/g, '').split('\n'), out = []; let fence = false;
    for (let k = 0; k < L.length; k++) {
      let ln = L[k];
      if (/^\s*```/.test(ln)) { if (((ln.match(/```/g) || []).length) % 2 === 1) fence = !fence; out.push(ln); continue; }
      if (fence) { out.push(ln); continue; }
      while (((ln.match(/\$\$/g) || []).length) % 2 === 1 && k + 1 < L.length) ln += '\n' + L[++k];
      out.push(ln);
    }
    return out;
  }

  function parseBlocks(lines) {
    const out = []; let i = 0, blank = 0;
    const push = b => { if (blank && out.length) out.push({ t: 'sp', n: blank }); blank = 0; out.push(b); };
    while (i < lines.length) {
      const ln = lines[i];
      if (!ln.trim()) { blank++; i++; continue; }
      let m;
      if (/^\s*```/.test(ln)) {
        const head = ln.trim().slice(3); let code = '';
        if (head.includes('```')) { code = head.slice(0, head.indexOf('```')); i++; }
        else {
          const lang = /^\w+$/.test(head) ? head : '';
          const buf = []; if (head && !lang) buf.push(head);
          i++;
          while (i < lines.length && !lines[i].includes('```')) buf.push(lines[i++]);
          if (i < lines.length) { const pre = lines[i].slice(0, lines[i].indexOf('```')); if (pre.trim()) buf.push(pre); i++; }
          code = buf.join('\n');
        }
        push({ t: 'code', v: code.replace(/\n$/, '') }); continue;
      }
      if ((m = RX_DIR.exec(ln))) {
        const kind = norm(m[1]), title = m[2].trim();
        if (['seite', 'umbruch', 'seitenumbruch', 'pagebreak'].includes(kind)) { push({ t: 'pb' }); i++; continue; }
        let depth = 1, j = i + 1; const inner = [];
        while (j < lines.length) {
          const l2 = lines[j];
          if (/^\s*:::\s*$/.test(l2)) { depth--; if (!depth) break; }
          else if (RX_DIR.test(l2) && !/^\s*:::\s*(seite|umbruch|seitenumbruch|pagebreak)\b/i.test(l2)) depth++;
          inner.push(l2); j++;
        }
        i = j + 1;
        const bk = BOXES[kind] ? kind : BOX_ALIAS[kind];
        const c = parseBlocks(inner);
        if (bk) push({ t: 'box', k: bk, title, c });
        else push({ t: 'al', a: ALIGN_KIND[kind] || 'left', c });
        continue;
      }
      if (/^\s*\|/.test(ln)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitCells(lines[i++]));
        let head = null, body = rows, align = [];
        if (rows.length > 1 && isSepRow(rows[1])) {
          head = rows[0]; body = rows.slice(2);
          align = rows[1].map(c => { c = c.replace(/\s/g, ''); return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'; });
        }
        const nc = Math.max(1, ...rows.map(r => r.length));
        const fix = r => { r = r.slice(); while (r.length < nc) r.push(''); return r; };
        push({ t: 'table', head: head && fix(head), rows: body.filter(r => !isSepRow(r)).map(fix), align: Array.from({ length: nc }, (_, k) => align[k] || 'left'), nc });
        continue;
      }
      if (RX_HR.test(ln)) { push({ t: 'hr' }); i++; continue; }
      if ((m = RX_H.exec(ln))) { push({ t: 'h', lvl: m[1].length, c: parseInline(m[2]) }); i++; continue; }
      if ((m = RX_LI.exec(ln))) {
        const ind = m[1].replace(/\t/g, '  ').length, lvl = Math.min(2, Math.floor(ind / 2));
        const mk = /^[-•–]$/.test(m[2]) ? (lvl ? '–' : '•') : m[2];
        push({ t: 'li', lvl, m: mk, c: parseInline(m[3]) }); i++; continue;
      }
      const buf = [ln.replace(/\s+$/, '')]; i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++].replace(/\s+$/, ''));
      push({ t: 'p', c: parseInline(buf.join('\n')) });
    }
    return out;
  }
  const parse = src => parseBlocks(prelines(src));

  /* ---- Knotenbaum → HTML ---- */
  function inlHtml(nodes, o) {
    return nodes.map(nd => {
      switch (nd.t) {
        case 'x': return esc(nd.v);
        case 'br': return '<br>';
        case 'b': return '<b>' + inlHtml(nd.c, o) + '</b>';
        case 'i': return '<i>' + inlHtml(nd.c, o) + '</i>';
        case 'u': return '<u>' + inlHtml(nd.c, o) + '</u>';
        case 'st': return '<s>' + inlHtml(nd.c, o) + '</s>';
        case 'sz': { const z = sizeOf(nd.v); if (!z) return inlHtml(nd.c, o); return z.pos ? `<${z.pos}>${inlHtml(nd.c, o)}</${z.pos}>` : `<span style="font-size:${z.f}em">${inlHtml(nd.c, o)}</span>`; }
        case 'c': { const col = colorOf(nd.v); return col ? `<span style="color:${col}">${inlHtml(nd.c, o)}</span>` : inlHtml(nd.c, o); }
        case 'bg': { const col = markOf(nd.v); return col ? `<span class="hl" style="background:${col}">${inlHtml(nd.c, o)}</span>` : inlHtml(nd.c, o); }
        case 'code': return '<code>' + esc(nd.v) + '</code>';
        case 'math': return tex(nd.v, nd.d);
        case 'gap': return o.gaps === 'fill' ? `<span class="gap fill">${esc(nd.v)}</span>` : '<span class="gap"></span>';
        case 'img': {
          const i = o.imgs && o.imgs[nd.id]; if (!i) return '';
          if (i.inline) return `<img class="inl" alt="" src="${esc(i.src)}" style="height:${+i.hcm || 0.6}cm">`;
          return `<div class="fig" style="text-align:${esc(i.align || 'left')}"><img class="q-img" alt="" src="${esc(i.src)}" style="width:${+i.w || 60}%">${i.cap ? `<div class="cap">${esc(i.cap)}</div>` : ''}</div>`;
        }
      }
      return '';
    }).join('');
  }

  const AL = a => a && a !== 'left' ? ` style="text-align:${a}"` : '';
  function blocksHtml(blocks, o, al, flat) {
    return blocks.map(b => {
      const a = al && al !== 'left' ? al : '';
      switch (b.t) {
        case 'p': return flat ? inlHtml(b.c, o) + ' ' : `<div class="pp"${AL(a)}>${inlHtml(b.c, o)}</div>`;
        case 'h': return flat ? `<b>${inlHtml(b.c, o)}</b> ` : `<div class="hd hd${b.lvl}"${AL(a)}>${inlHtml(b.c, o)}</div>`;
        case 'li': return flat ? '• ' + inlHtml(b.c, o) + ' ' : `<div class="li" style="margin-left:${(b.lvl * 0.6).toFixed(1)}cm${a ? ';text-align:' + a : ''}"><span class="m">${esc(b.m)}</span><span class="t">${inlHtml(b.c, o)}</span></div>`;
        case 'sp': return flat ? ' ' : `<div class="vsp" style="height:${(0.5 + (b.n - 1) * 1.3).toFixed(2)}em"></div>`;
        case 'hr': return flat ? '' : '<hr class="rule">';
        case 'pb': return flat ? '' : '<div class="pgbrk"></div>';
        case 'code': return flat ? '<code>' + esc(b.v) + '</code> ' : '<pre class="code"><code>' + esc(b.v) + '</code></pre>';
        case 'al': return blocksHtml(b.c, o, b.a, flat);
        case 'box': {
          if (flat) return blocksHtml(b.c, o, a, true);
          const K = BOXES[b.k], t = b.title === '-' ? '' : (b.title ? inlHtml(parseInline(b.title), o) : esc(K.label));
          return `<div class="bx bx-${b.k}${K.frame ? ' bx-frame' : ''}" style="--bar:${K.bar};--bg:${K.bg}">${t ? `<div class="bx-t">${t}</div>` : ''}<div class="bx-b">${blocksHtml(b.c, o, a)}</div></div>`;
        }
        case 'table': {
          const cell = (c, k, tag) => `<${tag}${b.align[k] !== 'left' ? ` style="text-align:${b.align[k]}"` : ''}>${c.trim() ? inlHtml(parseInline(c), o) : '&nbsp;'}</${tag}>`;
          if (flat) return (b.head ? b.head : []).concat(...b.rows).filter(x => x.trim()).map(x => inlHtml(parseInline(x), o)).join(' · ') + ' ';
          return `<table class="tab">${b.head ? `<thead><tr>${b.head.map((c, k) => cell(c, k, 'th')).join('')}</tr></thead>` : ''}<tbody>${b.rows.map(r => `<tr>${r.map((c, k) => cell(c, k, 'td')).join('')}</tr>`).join('')}</tbody></table>`;
        }
      }
      return '';
    }).join('');
  }

  /* Rendert Text mit der Layout-Sprache zu HTML. o.imgs = Bilder, o.gaps = 'fill' | 'blank', o.flat = nur Fließtext (Kartenvorschau) */
  function md(src, o = {}) { return blocksHtml(parse(src), o, '', !!o.flat); }


  const qPoints = q => q.type === 'teil' ? (q.parts || []).reduce((a, p) => a + num(p.points), 0) : num(q.points);
  const qAfbPoints = q => q.type === 'teil'
    ? (q.parts || []).map(p => ({ afb: +(p.afb || q.afb || 0), pts: num(p.points) }))
    : [{ afb: +(q.afb || 0), pts: num(q.points) }];

  function afbStats(items) {
    const sum = { 1: 0, 2: 0, 3: 0 }; let total = 0;
    (items || []).forEach(q => qAfbPoints(q).forEach(x => { total += x.pts; if (sum[x.afb] !== undefined) sum[x.afb] += x.pts; }));
    return { sum, total, pct: k => total ? Math.round(sum[k] / total * 100) : 0 };
  }

  function newQuestion(subject) {
    return {
      type: 'frei', subject: subject || 'Mathematik', grade: '', topic: '', tags: [],
      text: '', points: 2, afb: 1, solution: '', lines: 0,
      options: [{ t: '', ok: false }, { t: '', ok: false }], wahr: true,
      parts: [{ text: '', points: 2, afb: 1, solution: '' }],
      image: '', imgw: 60, images: []
    };
  }
  const newBlock = () => ({ type: 'block', style: 'text', text: '', images: [], points: 0, afb: 0 });

  const pts = (n, o) => o && o.noPts ? '' : `<span class="q-pts">${fmt(n)} BE</span>`;
  const ANSWERS = { lines: 'Linien', grid: 'Karokästchen', coord: 'Koordinatensystem', blank: 'Leerer Platz' };
  const _ai = {};
  function areaImg(kind, h) {
    const k = kind + h; if (_ai[k] !== undefined) return _ai[k];
    if (typeof document === 'undefined') return '';
    const ppc = 40, W = 17 * ppc, H = Math.round(h * ppc), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#a9b8cc'; g.lineWidth = 1;
    for (let x = 0; x <= W; x += ppc / 2) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, H); g.stroke(); }
    for (let y = 0; y <= H; y += ppc / 2) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(W, y + .5); g.stroke(); }
    if (kind === 'coord') {
      const cx = Math.round(W / 2 / ppc) * ppc, cy = Math.round(H / 2 / ppc) * ppc;
      g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(4, cy); g.lineTo(W - 4, cy); g.moveTo(cx, H - 4); g.lineTo(cx, 4); g.stroke();
      g.beginPath(); g.moveTo(W - 4, cy); g.lineTo(W - 16, cy - 6); g.lineTo(W - 16, cy + 6); g.fill();
      g.beginPath(); g.moveTo(cx, 4); g.lineTo(cx - 6, 16); g.lineTo(cx + 6, 16); g.fill();
      g.lineWidth = 1.5; for (let x = cx % ppc; x < W; x += ppc) { g.beginPath(); g.moveTo(x, cy - 5); g.lineTo(x, cy + 5); g.stroke(); }
      for (let y = cy % ppc; y < H; y += ppc) { g.beginPath(); g.moveTo(cx - 5, y); g.lineTo(cx + 5, y); g.stroke(); }
      g.font = 'italic 18px serif'; g.fillText('x', W - 14, cy + 22); g.fillText('y', cx + 10, 18);
    }
    g.strokeStyle = '#6b7a90'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
    return _ai[k] = c.toDataURL('image/png');
  }
  const answerKind = q => ANSWERS[q.answer] ? q.answer : 'lines';
  const answerH = q => Math.max(2, Math.min(24, +q.ah || 6));
  const answer = q => {
    const k = answerKind(q);
    if (k === 'lines') return lines(+q.lines || 0);
    if (k === 'blank') return `<div class="blankarea" style="height:${answerH(q)}cm"></div>`;
    return `<img class="ans" alt="" src="${areaImg(k, answerH(q))}" style="width:100%;height:${answerH(q)}cm">`;
  };
  const lines = n => n > 0 ? `<div class="lines" style="height:${(n * 0.8).toFixed(1)}cm"></div>` : '';
  const sol = (t, label, im) => t && String(t).trim() ? `<div class="sol"><b>${label || 'Lösung'}:</b> ${md(t, { gaps: 'fill', imgs: im })}</div>` : '';

  const imgHtml = q => imgs(q).filter(i => !i.inline && !i.placed).map(i => `<div class="fig" style="text-align:${esc(i.align || 'left')}"><img class="q-img" alt="" src="${esc(i.src)}" style="width:${+i.w || 60}%">${i.cap ? `<div class="cap">${esc(i.cap)}</div>` : ''}</div>`).join('');

  function renderQ(q, n, o = {}) {
    const IMG = {}; imgs(q).forEach(i => { if (i.id) IMG[i.id] = i; });
    if (q.type === 'block') return `<section class="blk blk-${esc(q.style || 'text')}">${q.text && q.text.trim() ? `<div class="q-text">${md(q.text, { imgs: IMG })}</div>` : ''}${imgHtml(q)}</section>`;
    const S = !!o.solutions;
    const gaps = S ? 'fill' : 'blank';
    let body = '';
    if (q.type === 'mc') {
      body = '<ul class="mc">' + (q.options || []).map((op, i) =>
        `<li class="${S && op.ok ? 'ok' : ''}"><span class="box">${S && op.ok ? '☒' : '☐'}</span> ${String.fromCharCode(65 + i)}) ${md(op.t, { imgs: IMG })}</li>`).join('') + '</ul>';
    } else if (q.type === 'wf') {
      body = `<div class="wf"><span class="box">${S && q.wahr ? '☒' : '☐'}</span> wahr &nbsp;&nbsp; <span class="box">${S && !q.wahr ? '☒' : '☐'}</span> falsch</div>`;
    } else if (q.type === 'teil') {
      body = '<ol class="parts">' + (q.parts || []).map(p =>
        `<li><div class="part-text"><div class="part-main">${md(p.text, { gaps, imgs: IMG })}</div>${pts(num(p.points), o)}</div>${S ? sol(p.solution, '', IMG) : answer(q)}</li>`).join('') + '</ol>';
    } else if (q.type === 'frei') {
      body = S ? '' : answer(q);
    }
    const img = imgHtml(q);
    const solution = S && q.type !== 'teil' ? sol(q.solution, '', IMG) : (S && q.type === 'teil' ? sol(q.solution, 'Hinweis', IMG) : '');
    return `<section class="q"><div class="q-head"><span class="q-num">${esc(o.label || 'Aufgabe')} ${n}</span>${pts(qPoints(q), o)}</div>
      <div class="q-text">${md(q.text, { gaps, imgs: IMG })}</div>${img}${body}${solution}</section>`;
  }

  const GRADES_KEY = {
    sek1: { label: 'Sekundarstufe I (Noten 1–6)', col: 'Note', rows: [['1 (sehr gut)', 87], ['2 (gut)', 73], ['3 (befriedigend)', 59], ['4 (ausreichend)', 45], ['5 (mangelhaft)', 18], ['6 (ungenügend)', 0]] },
    sek2: { label: 'Oberstufe (15–0 Punkte)', col: 'Punkte', rows: [[15, 95], [14, 90], [13, 85], [12, 80], [11, 75], [10, 70], [9, 65], [8, 60], [7, 55], [6, 50], [5, 45], [4, 40], [3, 33], [2, 27], [1, 20], [0, 0]] }
  };
  // Markdown für Punkteübersicht (immer) und Notenschlüssel (nur Lösungsblatt)
  function endMatter(exam, solutions) {
    const tasks = (exam.items || []).filter(q => q.type !== 'block');
    const total = tasks.reduce((a, q) => a + qPoints(q), 0), out = [];
    if (exam.scoreTable && tasks.length) {
      const lab = exam.taskLabel || 'Aufgabe';
      out.push(`:::rahmen Punkteübersicht\n| ${lab} | ${tasks.map((_, i) => i + 1).join(' | ')} | Summe |\n|---|${tasks.map(() => ':-:').join('|')}|:-:|\n| erreichbar | ${tasks.map(q => fmt(qPoints(q))).join(' | ')} | ${fmt(total)} |\n| erreicht | ${tasks.map(() => '').join(' | ')} | |\n\nNote: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\nDatum / Unterschrift: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\n:::`);
    }
    const K = GRADES_KEY[exam.gradeKey];
    if (K && solutions && total > 0) {
      const rows = K.rows.map(([n, pct], k) => {
        const lo = pct === 0 ? 0 : Math.ceil(pct / 100 * total * 2 - 1e-9) / 2;
        const hi = k === 0 ? total : (Math.ceil(K.rows[k - 1][1] / 100 * total * 2 - 1e-9) / 2 - 0.5);
        return `| ${n} | ${fmt(lo)} – ${fmt(Math.max(lo, hi))} | ${pct === 0 ? 'bis ' + (K.rows[k - 1][1] - 1) : 'ab ' + pct} % |`;
      });
      out.push(`:::info Notenschlüssel\n${K.label}, ${fmt(total)} BE gesamt\n\n| ${K.col} | Punkte (BE) | Anteil |\n|---|:-:|:-:|\n${rows.join('\n')}\n:::`);
    }
    return out.join('\n\n');
  }

  function header(exam) {
    const meta = [exam.subject, gradeLabel(exam.grade), exam.date ? new Date(exam.date + 'T12:00').toLocaleDateString('de-DE') : '', exam.duration ? exam.duration + ' Minuten' : ''].filter(Boolean).join(' · ');
    const total = (exam.items || []).reduce((a, q) => a + qPoints(q), 0);
    const ta = exam.titleAlign === 'center' ? ' style="text-align:center"' : '';
    return `<header class="p-head${exam.noTotal ? ' no-total' : ''}"${ta}>
      ${exam.school ? `<div class="p-school">${esc(exam.school)}</div>` : ''}
      <h1>${esc(exam.title || 'Ohne Titel')}</h1>
      ${meta ? `<div class="p-meta">${esc(meta)}</div>` : ''}
      ${exam.noName ? '' : '<div class="p-name"><span>Name:</span><span>Klasse:</span><span>Datum:</span></div>'}
      ${exam.hints ? `<div class="p-hints">${md(exam.hints)}</div>` : ''}
      ${exam.noTotal ? '<div class="p-rule"></div>' : `<div class="p-total">Gesamtpunktzahl: <b>${fmt(total)} BE</b></div>`}
    </header>`;
  }

  function paper(exam, o = {}) {
    const items = exam.items || [];
    let cnt = 0;
    const inner = items.map((q, i) => {
      const html = renderQ(q, q.type === 'block' ? 0 : ++cnt, { solutions: o.solutions, label: exam.taskLabel, noPts: exam.noPts });
      if (!o.edit) return html;
      return `<div class="item" data-uid="${q.uid}">
        <div class="item-tools">
          <span class="grip" draggable="true" data-uid="${q.uid}" title="Ziehen zum Sortieren">⠿</span>
          <button type="button" data-a="i-up" data-uid="${q.uid}" title="Nach oben">↑</button>
          <button type="button" data-a="i-down" data-uid="${q.uid}" title="Nach unten">↓</button>
          <button type="button" data-a="i-edit" data-uid="${q.uid}">Bearbeiten</button>
          ${q.type === 'block' ? '' : `<button type="button" data-a="i-bank" data-uid="${q.uid}" title="Als eigene Aufgabe in die Aufgabenbank übernehmen">In Bank</button>`}
          <button type="button" data-a="i-del" data-uid="${q.uid}" class="danger" title="Aus der Prüfung entfernen">✕</button>
        </div>${html}</div>`;
    }).join('');
    const empty = o.edit && !items.length ? '<div class="empty-drop">Ziehe Aufgaben aus der Aufgabenbank hierher oder klicke dort auf „+“.</div>' : '';
    const em = endMatter(exam, o.solutions);
    return header(exam) + `<div id="paper-items" class="p-items">${inner}${empty}</div>${em ? `<div class="endm">${md(em, {})}</div>` : ''}`;
  }

  return { SUBJECTS, GRADES, TYPES, AFB, AFB_SOLL, esc, num, fmt, md, tex, gradeLabel, qPoints, qAfbPoints, afbStats, newQuestion, newBlock, renderQ, paper, header, FONTS, fontOf, fsizeOf, fontStyle, imgs, parse, parseInline, BOXES, COLORS, COLOR_LABEL, MARKS, MARK_LABEL, SIZES, colorOf, markOf, sizeOf, ACCENTS, accentOf, splitCells, isSepRow, ANSWERS, areaImg, answerKind, answerH, endMatter, GRADES_KEY };
})();
