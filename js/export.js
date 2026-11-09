/* Export: PDF (über den Druckdialog des Browsers) und ODT (im Browser erzeugt, inkl. Formeln und Bilder). */
const Export = (() => {
  const esc = R.esc;
  const safeName = s => (s || 'Pruefung').replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Pruefung';
  const abs = p => new URL(p, document.baseURI).href;

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  /* ---------- PDF ---------- */
  async function pdf(exam, solutions) {
    const old = document.getElementById('print-frame'); if (old) old.remove();
    const f = document.createElement('iframe');
    f.id = 'print-frame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(exam.title || 'Prüfung')}${solutions ? ' – Lösungen' : ''}</title>
      <link rel="stylesheet" href="${abs('vendor/katex.min.css')}"><link rel="stylesheet" href="${abs('css/paper.css?v=9')}">${exam.pageNum ? '<style>@page{@bottom-center{content:"Seite " counter(page) " von " counter(pages);font:9pt Arial,sans-serif;color:#555}}</style>' : ''}</head>
      <body><div class="paper" style="${esc(R.fontStyle(exam))}">${R.paper(exam, { solutions })}</div></body></html>`);
    doc.close();
    await new Promise(r => { f.onload = r; setTimeout(r, 1500); });
    try { await doc.fonts.ready; } catch (e) { /* ältere Browser */ }
    await Promise.all([...doc.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
    f.contentWindow.focus();
    f.contentWindow.print();
  }

  /* ---------- ODT ---------- */
  const X = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:math="http://www.w3.org/1998/Math/MathML" xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"';

  // Text mit Leerzeichen-Folgen und Zeilenumbrüchen in ODF-Text umwandeln
  function plain(t) {
    return X(t).replace(/ {2,}/g, m => ' <text:s text:c="' + (m.length - 1) + '"/>').replace(/\t/g, '<text:tab/>');
  }

  // Formel: KaTeX erzeugt MathML, das LibreOffice als Formelobjekt importiert
  function mathml(t, display) {
    try {
      const h = katex.renderToString(t, { output: 'mathml', displayMode: display, throwOnError: false });
      const m = h.match(/<math[\s\S]*<\/math>/);
      if (!m) return null;
      return m[0].replace(/<annotation[\s\S]*?<\/annotation>/g, '').replace(/<semantics>([\s\S]*?)<\/semantics>/, '$1')
        .replace(/&nbsp;/g, '&#160;');
    } catch (e) { return null; }
  }


  /* Einfache Umwandlung von LaTeX in Unicode-Text (für die Option „Formeln als Text“) */
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
  const SYM = { cdot: '·', times: '×', div: ':', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', infty: '∞', to: '→', rightarrow: '→', Rightarrow: '⇒', leftrightarrow: '↔', Leftrightarrow: '⇔', mid: '|', in: '∈', notin: '∉', cup: '∪', cap: '∩', subset: '⊂', emptyset: '∅', sum: 'Σ', int: '∫', partial: '∂', nabla: '∇', circ: '°', degree: '°', ldots: '…', dots: '…', cdots: '⋯', quad: '  ', qquad: '    ', perp: '⊥', parallel: '∥', angle: '∠', triangle: '△', hbar: 'ħ', ell: 'ℓ' };
  const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ', i: 'ⁱ', '(': '⁽', ')': '⁾' };
  const SUBS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '(': '₍', ')': '₎', n: 'ₙ', i: 'ᵢ', x: 'ₓ', a: 'ₐ', e: 'ₑ', o: 'ₒ' };
  function texToText(t) {
    let s = String(t).replace(/\\(left|right|displaystyle|big|Big)\b/g, '').replace(/\\[,;:! ]/g, ' ');
    const wrap = a => (/^[\w.,]+$/.test(a.trim()) ? a.trim() : '(' + a.trim() + ')');
    for (let i = 0; i < 6; i++) {
      s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (m, a, b) => wrap(a) + '/' + wrap(b));
      s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, (m, n, a) => n + '√(' + a + ')');
      s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (m, a) => '√' + wrap(a));
      s = s.replace(/\\(?:mathrm|text|mathbf|mathit|operatorname|vec|overrightarrow|overline)\s*\{([^{}]*)\}/g, '$1');
    }
    const script = (map, mark) => (m, a, b) => {
      const body = a !== undefined ? a : b;
      return [...body].every(c => map[c]) ? [...body].map(c => map[c]).join('') : mark + '(' + body + ')';
    };
    s = s.replace(/\^\{([^{}]*)\}|\^(\\?\w|.)/g, script(SUPS, '^'));
    s = s.replace(/_\{([^{}]*)\}|_(\\?\w|.)/g, script(SUBS, '_'));
    s = s.replace(/\\([a-zA-Z]+)/g, (m, n) => GREEK[n] || SYM[n] || n);
    return s.replace(/[{}]/g, '').replace(/\\\\/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  const A = s => Object.fromEntries([...String(s || '').matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const AS = o => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');
  const alOv = (al, p) => { const q = Object.assign({}, p || {}); if (al && al !== 'left') q['fo:text-align'] = al === 'right' ? 'end' : al; return Object.keys(q).length ? { p: q } : null; };

  // Absatzvorlagen (Name → Absatz- und Texteigenschaften)
  const paraBases = (acc, fs) => ({
    Pschool: { p: 'fo:margin-bottom="0.1cm"', t: 'fo:font-size="9.5pt" fo:color="#444444"' },
    Ptitle: { p: 'fo:margin-bottom="0.1cm"', t: `fo:font-size="18pt" fo:font-weight="bold" fo:color="${acc}"` },
    Pmeta: { p: '', t: 'fo:font-size="10pt" fo:color="#333333"' },
    Pname: { p: 'fo:margin-top="0.5cm" fo:margin-bottom="0.4cm"', t: 'fo:font-size="10pt"' },
    Phint: { p: 'fo:margin-bottom="0.3cm" fo:padding-left="0.3cm" fo:border-left="1.5pt solid #999999"', t: 'fo:font-size="10pt"' },
    Ptotal: { p: `fo:text-align="end" fo:margin-bottom="0.4cm" fo:padding-bottom="0.15cm" fo:border-bottom="1.5pt solid ${acc}"`, t: 'fo:font-size="10pt"' },
    Prule: { p: `fo:margin-bottom="0.4cm" fo:border-bottom="1.5pt solid ${acc}"`, t: 'fo:font-size="2pt"' },
    Ptask: { p: 'fo:margin-top="0.55cm" fo:margin-bottom="0.15cm" fo:keep-with-next="always"', t: `fo:font-size="12pt" fo:font-weight="bold" fo:color="${acc}"` },
    Pbody: { p: 'fo:margin-bottom="0.12cm"', t: '' },
    Plist: { p: 'fo:margin-left="0.5cm" fo:margin-bottom="0.08cm"', t: '' },
    Ppart: { p: 'fo:margin-left="0.8cm" fo:text-indent="-0.8cm" fo:margin-top="0.12cm" fo:margin-bottom="0.1cm"', t: '' },
    Ppart2: { p: 'fo:margin-left="0.8cm" fo:margin-bottom="0.1cm"', t: '' },
    Pline: { p: 'fo:margin-left="0.8cm" fo:margin-bottom="0cm" fo:padding-top="0.4cm" fo:border-bottom="0.5pt solid #aaaaaa"', t: '' },
    Pimg: { p: 'fo:margin-top="0.1cm" fo:margin-bottom="0.15cm"', t: '' },
    Pcap: { p: 'fo:margin-top="-0.05cm" fo:margin-bottom="0.15cm"', t: 'fo:font-size="9pt" fo:font-style="italic" fo:color="#444444"' },
    Psol: { p: 'fo:margin-left="0.8cm" fo:margin-bottom="0.15cm" fo:padding-left="0.2cm" fo:border-left="2pt solid #1a6b2a" fo:background-color="#eef7ee"', t: 'fo:font-size="10pt" fo:color="#123c1a"' },
    Phd1: { p: 'fo:margin-top="0.25cm" fo:margin-bottom="0.1cm" fo:keep-with-next="always"', t: `fo:font-size="${(fs * 1.3).toFixed(1)}pt" fo:font-weight="bold" fo:color="${acc}"` },
    Phd2: { p: 'fo:margin-top="0.2cm" fo:margin-bottom="0.08cm" fo:keep-with-next="always"', t: `fo:font-size="${(fs * 1.15).toFixed(1)}pt" fo:font-weight="bold"` },
    Phd3: { p: 'fo:margin-top="0.15cm" fo:margin-bottom="0.06cm" fo:keep-with-next="always"', t: 'fo:font-weight="bold" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' },
    Pgap: { p: 'fo:margin-top="0cm" fo:margin-bottom="0.1cm"', t: 'fo:font-size="4pt"' },
    Pempty: { p: 'fo:margin-bottom="0cm"', t: '' },
    Phr: { p: 'fo:margin-top="0.08cm" fo:margin-bottom="0.15cm" fo:border-bottom="0.75pt solid #777777"', t: 'fo:font-size="2pt"' },
    Ppb: { p: 'fo:break-before="page" fo:margin-top="0cm" fo:margin-bottom="0cm"', t: 'fo:font-size="1pt"' },
    Pcode: { p: 'fo:margin-top="0.1cm" fo:margin-bottom="0.15cm" fo:padding="0.12cm" fo:background-color="#f3f3f3" fo:border="0.5pt solid #dddddd"', t: 'style:font-name="Liberation Mono" fo:font-size="9.5pt"' },
    Pcell: { p: 'fo:margin-bottom="0cm"', t: '' },
    Pcellh: { p: 'fo:margin-bottom="0cm"', t: 'fo:font-weight="bold"' },
    Pboxt: { p: 'fo:margin-bottom="0.06cm" fo:keep-with-next="always"', t: 'fo:font-weight="bold" fo:font-size="9.5pt" fo:text-transform="uppercase"' }
  });

  function build(exam, solutions, opts = {}) {
    const objs = [];       // MathML-Objekte
    const frames = [];     // noch aufzulösende Bilder
    const fs = R.fsizeOf(exam), acc = R.accentOf(exam);
    const PB = paraBases(acc, fs);
    const dyn = [], reg = new Map(); let uid = 0, tabN = 0;
    const mk = (pref, key, xml) => { if (!reg.has(key)) { const name = pref + (++uid); reg.set(key, name); dyn.push(xml(name)); } return reg.get(key); };
    const pst = (base, ov) => {
      if (!ov || (!ov.p && !ov.t)) return base;
      return mk('PX', 'p' + base + JSON.stringify(ov), name => {
        const b = PB[base] || { p: '', t: '' }, p = Object.assign(A(b.p), ov.p || {}), t = Object.assign(A(b.t), ov.t || {});
        return `<style:style style:name="${name}" style:family="paragraph">${Object.keys(p).length ? `<style:paragraph-properties ${AS(p)}/>` : ''}${Object.keys(t).length ? `<style:text-properties ${AS(t)}/>` : ''}</style:style>`;
      });
    };
    const tst = props => mk('TX', 't' + JSON.stringify(props), name => `<style:style style:name="${name}" style:family="text"><style:text-properties ${AS(props)}/></style:style>`);
    const cur = { imgs: [] };

    const formula = (tex, display) => {
      if (opts.mathText) return '<text:span text:style-name="Ti">' + plain(texToText(tex)) + '</text:span>';
      const ml = mathml(tex, display);
      if (!ml) return '<text:span text:style-name="Tcode">' + plain(tex) + '</text:span>';
      objs.push(ml);
      const n = objs.length;
      const len = tex.replace(/\\[a-zA-Z]+/g, 'x').replace(/[{}^_ ]/g, '').length;
      const w = Math.max(0.5, Math.min(14, len * 0.2 + 0.25)).toFixed(2);
      const h = (/\\frac|\\sum|\\int|\\binom|\\sqrt|\\begin/.test(tex) ? 1.15 : 0.62).toFixed(2);
      return `<draw:frame draw:style-name="fr1" draw:name="Formel${n}" text:anchor-type="as-char" svg:width="${w}cm" svg:height="${h}cm"><draw:object xlink:href="./Object ${n}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
    };

    const span = (st, inner) => `<text:span text:style-name="${st}">${inner}</text:span>`;
    const frameFor = im => { const id = 'IMG' + frames.length; frames.push({ id, src: im.src, hcm: im.inline ? (im.hcm || 0.6) : 0, w: im.w }); return id; };
    const spans = (nodes, cx) => nodes.map(nd => {
      switch (nd.t) {
        case 'x': return plain(nd.v);
        case 'br': return '<text:line-break/>';
        case 'b': return span('Tb', spans(nd.c, cx));
        case 'i': return span('Ti', spans(nd.c, cx));
        case 'u': return span('Tu', spans(nd.c, cx));
        case 'st': return span('Tst', spans(nd.c, cx));
        case 'c': { const col = R.colorOf(nd.v); return col ? span(tst({ 'fo:color': col }), spans(nd.c, cx)) : spans(nd.c, cx); }
        case 'bg': { const col = R.markOf(nd.v); return col ? span(tst({ 'fo:background-color': col }), spans(nd.c, cx)) : spans(nd.c, cx); }
        case 'sz': {
          const z = R.sizeOf(nd.v); if (!z) return spans(nd.c, cx);
          return span(tst(z.pos ? { 'style:text-position': z.pos === 'sup' ? 'super 58%' : 'sub 58%' } : { 'fo:font-size': (fs * z.f).toFixed(1) + 'pt' }), spans(nd.c, cx));
        }
        case 'code': return span('Tcode', plain(nd.v));
        case 'math': return nd.d ? '<text:line-break/>' + formula(nd.v, true) + '<text:line-break/>' : formula(nd.v, false);
        case 'gap': return cx.gaps === 'fill' ? span('Tfill', plain(nd.v)) : span('Tgap', plain(' '.repeat(16)));
        case 'img': {
          const im = (cur.imgs || []).find(i => i.id === nd.id); if (!im) return '';
          const id = frameFor(im);
          return im.inline ? '@@' + id + '@@' : '<text:line-break/>@@' + id + '@@<text:line-break/>';
        }
      }
      return '';
    }).join('');

    const P = (style, inner) => `<text:p text:style-name="${style}">${inner}</text:p>`;
    const be = n => R.fmt(n) + ' BE';
    const isText = b => b && (b.t === 'p' || b.t === 'li' || b.t === 'h');

    /* Tabelle */
    function tableXml(b, cx) {
      const W = (cx.w ?? 17) - (cx.ml || 0);
      const strip = t => (t || '').replace(/\{(?:c|bg|s):[^|}]*\|/g, '').replace(/[*_~`{}$\\]/g, '');
      const lens = Array.from({ length: b.nc }, (_, k) => Math.max(0, ...[b.head, ...b.rows].filter(Boolean).map(r => strip(r[k]).length)));
      const wt = lens.map(l => lens.some(x => x > 0) ? Math.min(40, Math.max(5, l)) : 1), tot = wt.reduce((a, c) => a + c, 0);
      let ws = wt.map(w => Math.max(1.4, W * w / tot)); const sum = ws.reduce((a, c) => a + c, 0); ws = ws.map(w => w * W / sum);
      const ts = mk('TB', 'tb' + W.toFixed(2) + '|' + (cx.ml || 0), name => `<style:style style:name="${name}" style:family="table"><style:table-properties style:width="${W.toFixed(2)}cm" table:align="${cx.ml ? 'margins' : 'left'}" ${cx.ml ? `fo:margin-left="${cx.ml}cm" ` : ''}fo:margin-top="0.12cm" fo:margin-bottom="0.22cm"/></style:style>`);
      const cols = ws.map(w => `<table:table-column table:style-name="${mk('TC', 'col' + w.toFixed(2), name => `<style:style style:name="${name}" style:family="table-column"><style:table-column-properties style:column-width="${w.toFixed(2)}cm"/></style:style>`)}"/>`).join('');
      const cell = (txt, k, head) => `<table:table-cell table:style-name="${head ? 'Tch' : 'Tcd'}" office:value-type="string">${P(pst(head ? 'Pcellh' : 'Pcell', alOv(b.align[k])), spans(R.parseInline(txt), cx))}</table:table-cell>`;
      const row = (r, head) => `<table:table-row table:style-name="Trow">${r.map((c, k) => cell(c, k, head)).join('')}</table:table-row>`;
      return `<table:table table:name="Tab${++tabN}" table:style-name="${ts}">${cols}${b.head ? `<table:table-header-rows>${row(b.head, true)}</table:table-header-rows>` : ''}${b.rows.map(r => row(r, false)).join('')}</table:table>`;
    }

    /* Kasten = einzellige Tabelle mit Farbe und Rahmen */
    function boxXml(b, cx) {
      const K = R.BOXES[b.k], W = (cx.w ?? 17) - (cx.ml || 0);
      const cs = mk('TCB', 'bx' + b.k, name => `<style:style style:name="${name}" style:family="table-cell"><style:table-cell-properties fo:padding-top="0.14cm" fo:padding-bottom="0.16cm" fo:padding-left="0.3cm" fo:padding-right="0.3cm" fo:background-color="${K.bg}" fo:border-top="${K.frame ? '1.2pt' : '0.75pt'} solid ${K.bar}" fo:border-bottom="${K.frame ? '1.2pt' : '0.75pt'} solid ${K.bar}" fo:border-right="${K.frame ? '1.2pt' : '0.75pt'} solid ${K.bar}" fo:border-left="${K.frame ? '1.2pt' : '3.5pt'} solid ${K.bar}"/></style:style>`);
      const ts = mk('TB', 'tb' + W.toFixed(2) + '|' + (cx.ml || 0) + 'k', name => `<style:style style:name="${name}" style:family="table"><style:table-properties style:width="${W.toFixed(2)}cm" table:align="${cx.ml ? 'margins' : 'left'}" ${cx.ml ? `fo:margin-left="${cx.ml}cm" ` : ''}fo:margin-top="0.12cm" fo:margin-bottom="0.22cm"/></style:style>`);
      const colS = mk('TC', 'col' + W.toFixed(2), name => `<style:style style:name="${name}" style:family="table-column"><style:table-column-properties style:column-width="${W.toFixed(2)}cm"/></style:style>`);
      const title = b.title === '-' ? '' : (b.title ? spans(R.parseInline(b.title), cx) : plain(K.label));
      const inner = blocks(b.c, Object.assign({}, cx, { w: W - 0.7, ml: 0, al: '' }));
      const tp = title ? [P(pst('Pboxt', { t: { 'fo:color': K.frame ? '#000000' : K.bar } }), title)] : [];
      return `<table:table table:name="Box${++tabN}" table:style-name="${ts}"><table:table-column table:style-name="${colS}"/><table:table-row table:style-name="Trow Box"><table:table-cell table:style-name="${cs}" office:value-type="string">${tp.concat(inner.length ? inner : [P('Pcell', '')]).join('')}</table:table-cell></table:table-row></table:table>`;
    }

    /* Blöcke → ODF. pre/post werden in den ersten/letzten Textabsatz eingesetzt (z. B. „a)“ und Punkte) */
    function blocks(bl, cx, pre = '', post = '') {
      const base = cx.base || 'Pbody';
      if (!bl.length) return (pre || post) ? [P(pst(cx.firstBase || base), pre + post)] : [];
      const out = [], last = bl.length - 1;
      if (pre && !isText(bl[0])) out.push(P(pst(cx.firstBase || base), pre));
      bl.forEach((b, k) => {
        const pr = k === 0 && isText(b) ? pre : '', po = k === last && isText(b) ? post : '';
        const bs = k === 0 && cx.firstBase ? cx.firstBase : base;
        switch (b.t) {
          case 'p': {
            const only = b.c.filter(n => !(n.t === 'x' && !n.v.trim()));
            const im = only.length === 1 && only[0].t === 'img' ? (cur.imgs || []).find(i => i.id === only[0].id) : null;
            if (im && !im.inline) {
              out.push(P(pst('Pimg', alOv(im.align || cx.al)), pr + '@@' + frameFor(im) + '@@' + po));
              if (im.cap) out.push(P(pst('Pcap', alOv(im.align || cx.al)), plain(im.cap)));
              break;
            }
            out.push(P(pst(bs, alOv(cx.al)), pr + spans(b.c, cx) + po)); break;
          }
          case 'h': out.push(P(pst('Phd' + b.lvl, alOv(cx.al)), pr + spans(b.c, cx) + po)); break;
          case 'li': {
            const ml = ((cx.ml || 0) + 0.3 + b.lvl * 0.6 + 0.6).toFixed(2);
            out.push(P(pst(base === 'Ppart' ? 'Ppart2' : base, alOv(cx.al, { 'fo:margin-left': ml + 'cm', 'fo:text-indent': '-0.6cm', 'fo:margin-bottom': '0.05cm' })), pr + plain(b.m) + '<text:tab/>' + spans(b.c, cx) + po)); break;
          }
          case 'sp': out.push(P('Pgap', '')); for (let q = 1; q < b.n; q++) out.push(P('Pempty', '')); break;
          case 'hr': out.push(P('Phr', '')); break;
          case 'pb': out.push(P('Ppb', '')); break;
          case 'code': out.push(P('Pcode', b.v.split('\n').map(plain).join('<text:line-break/>'))); break;
          case 'al': out.push(...blocks(b.c, Object.assign({}, cx, { al: b.a, firstBase: null }))); break;
          case 'box': out.push(boxXml(b, cx)); break;
          case 'table': out.push(tableXml(b, cx)); break;
        }
      });
      if (post && !isText(bl[last])) out.push(P(pst(base), post));
      return out;
    };
    const rich = (text, cx, pre, post) => blocks(R.parse(text), cx, pre, post);

    const body = [];
    const gaps = solutions ? 'fill' : 'blank';
    const label = exam.taskLabel || 'Aufgabe';

    // Kopf
    if (exam.school) body.push(P('Pschool', plain(exam.school)));
    body.push(P(pst('Ptitle', exam.titleAlign === 'center' ? { p: { 'fo:text-align': 'center' } } : null), plain(exam.title || 'Ohne Titel')));
    const meta = [exam.subject, R.gradeLabel(exam.grade), exam.date ? new Date(exam.date + 'T12:00').toLocaleDateString('de-DE') : '', exam.duration ? exam.duration + ' Minuten' : ''].filter(Boolean).join(' · ');
    if (meta) body.push(P(pst('Pmeta', exam.titleAlign === 'center' ? { p: { 'fo:text-align': 'center' } } : null), plain(meta)));
    if (!exam.noName) body.push(P('Pname', 'Name: ' + '_'.repeat(28) + ' &#160; Klasse: ' + '_'.repeat(10) + ' &#160; Datum: ' + '_'.repeat(12)));
    if (exam.hints) body.push(...rich(exam.hints, { base: 'Phint', gaps: 'blank', w: 17 }));
    const total = (exam.items || []).reduce((a, q) => a + R.qPoints(q), 0);
    body.push(exam.noTotal ? P('Prule', '') : P('Ptotal', 'Gesamtpunktzahl: ' + span('Tb', be(total))));

    const imgPara = q => {
      R.imgs(q).filter(im => !im.inline && !im.placed).forEach(im => {
        body.push(P(pst('Pimg', alOv(im.align)), '@@' + frameFor(im) + '@@'));
        if (im.cap) body.push(P(pst('Pcap', alOv(im.align)), plain(im.cap)));
      });
    };
    const answerOdt = (q, ml) => {
      const k = R.answerKind(q);
      if (k === 'lines') { for (let l = 0; l < (+q.lines || 0); l++) body.push('<text:p text:style-name="Pline"/>'); return; }
      const h = R.answerH(q);
      if (k === 'blank') { body.push(P(pst('Pimg', { p: { 'fo:padding-top': h + 'cm' } }), '')); return; }
      const w = Math.round((17 - (ml || 0)) / 17 * 100);
      body.push(P(pst('Pimg', ml ? { p: { 'fo:margin-left': ml + 'cm' } } : null), '@@' + frameFor({ src: R.areaImg(k, h), w }) + '@@'));
    };
    const ptsTag = n => exam.noPts ? '' : ` <text:span text:style-name="Tpts">(${be(n)})</text:span>`;

    let cnt = 0;
    (exam.items || []).forEach(q => {
      cur.imgs = R.imgs(q);
      if (q.type === 'block') {
        const cx = { base: q.style === 'heading' ? 'Ptask' : 'Pbody', gaps, w: 17 };
        if (q.text && q.text.trim()) {
          if (q.style === 'box') body.push(boxXml({ t: 'box', k: 'info', title: '-', c: R.parse(q.text) }, cx));
          else body.push(...rich(q.text, cx));
        }
        imgPara(q); return;
      }
      body.push(P('Ptask', `${plain(label)} ${++cnt}${ptsTag(R.qPoints(q))}`));
      if (q.text && q.text.trim()) body.push(...rich(q.text, { base: 'Pbody', gaps, w: 17 }));
      imgPara(q);
      if (q.type === 'mc') {
        (q.options || []).forEach((o, k) => body.push(P('Plist', (solutions && o.ok ? '☒' : '☐') + ' ' + String.fromCharCode(65 + k) + ') ' + spans(R.parseInline(o.t), { gaps }))));
      } else if (q.type === 'wf') {
        body.push(P('Plist', (solutions && q.wahr ? '☒' : '☐') + ' wahr &#160;&#160;&#160; ' + (solutions && !q.wahr ? '☒' : '☐') + ' falsch'));
      } else if (q.type === 'teil') {
        (q.parts || []).forEach((p, k) => {
          body.push(...rich(p.text || '', { base: 'Ppart2', firstBase: 'Ppart', ml: 0.8, gaps, w: 17 }, span('Tb', String.fromCharCode(97 + k) + ')') + ' ', ptsTag(R.num(p.points))));
          if (solutions) { if (p.solution && p.solution.trim()) body.push(...rich(p.solution, { base: 'Psol', ml: 0.8, gaps: 'fill', w: 17 }, span('Tb', 'Lösung:') + ' ')); }
          else answerOdt(q, 0.8);
        });
      }
      if (q.type === 'frei' && !solutions) answerOdt(q, 0);
      if (solutions && q.type !== 'teil' && q.solution && q.solution.trim()) body.push(...rich(q.solution, { base: 'Psol', ml: 0.8, gaps: 'fill', w: 17 }, span('Tb', 'Lösung:') + ' '));
    });

    const em = R.endMatter(exam, solutions);
    if (em) { cur.imgs = []; body.push(...rich(em, { base: 'Pbody', gaps: 'blank', w: 17 })); }
    return { body, objs, frames, dyn, PB };
  }

  const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const dataToBytes = url => { const b = atob(url.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

  async function odt(exam, solutions, opts = {}) {
    const { body, objs, frames, dyn, PB } = build(exam, solutions, opts);
    const fnt = R.fontOf(exam);
    const zip = new JSZip();
    const pics = [];
    let xml = body.join('\n');

    for (const f of frames) {
      const img = await loadImg(f.src);
      const ext = /^data:image\/png/.test(f.src) ? 'png' : 'jpg';
      let repl = '';
      if (img) {
        let w = 17 * ((+f.w || 60) / 100), h = w * img.height / img.width;
        if (f.hcm) { h = f.hcm; w = h * img.width / img.height; }
        const name = `Pictures/${f.id}.${ext}`;
        pics.push({ name, ext, bytes: dataToBytes(f.src) });
        repl = `<draw:frame draw:style-name="${f.hcm ? 'fr1' : 'fr2'}" draw:name="${f.id}" text:anchor-type="as-char" svg:width="${w.toFixed(2)}cm" svg:height="${h.toFixed(2)}cm"><draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
      }
      xml = xml.replace(`@@${f.id}@@`, repl);
    }

    const baseStyles = Object.entries(PB).map(([n, b]) => `<style:style style:name="${n}" style:family="paragraph">${b.p ? `<style:paragraph-properties ${b.p}/>` : ''}${b.t ? `<style:text-properties ${b.t}/>` : ''}</style:style>`).join('\n ');

    const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.2">
<office:font-face-decls>
 <style:font-face style:name="${X(fnt.odt)}" svg:font-family="'${X(fnt.odt)}'" style:font-family-generic="${fnt.gen}"/>
 <style:font-face style:name="Liberation Mono" svg:font-family="'Liberation Mono'" style:font-family-generic="modern"/>
</office:font-face-decls>
<office:automatic-styles>
 ${baseStyles}
 <style:style style:name="Tb" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
 <style:style style:name="Ti" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
 <style:style style:name="Tst" style:family="text"><style:text-properties style:text-line-through-style="solid" style:text-line-through-type="single"/></style:style>
 <style:style style:name="Tpts" style:family="text"><style:text-properties fo:font-weight="normal" fo:font-size="10pt" fo:color="#333333"/></style:style>
 <style:style style:name="Tcode" style:family="text"><style:text-properties style:font-name="Liberation Mono" fo:font-size="9.5pt" fo:background-color="#f0f0f0"/></style:style>
 <style:style style:name="Tu" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
 <style:style style:name="Tgap" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
 <style:style style:name="Tfill" style:family="text"><style:text-properties fo:font-weight="bold" fo:color="#1a6b2a" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
 <style:style style:name="Tcd" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #333333"/></style:style>
 <style:style style:name="Tch" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #333333" fo:background-color="#e8edf4"/></style:style>
 <style:style style:name="Trow" style:family="table-row"><style:table-row-properties style:min-row-height="0.85cm" fo:keep-together="always"/></style:style>
 <style:style style:name="fr1" style:family="graphic"><style:graphic-properties style:vertical-pos="middle" style:vertical-rel="text" style:wrap="none" fo:padding="0cm" fo:border="none"/></style:style>
 <style:style style:name="fr2" style:family="graphic"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" style:wrap="none" fo:padding="0cm" fo:border="none"/></style:style>
 ${dyn.join('\n ')}
</office:automatic-styles>
<office:body><office:text>
${xml.replace(/table:style-name="Trow Box"/g, 'table:style-name="Trow"')}
</office:text></office:body></office:document-content>`;

    const footer = exam.pageNum ? `<style:footer><text:p text:style-name="Pfoot">Seite <text:page-number text:select-page="current">1</text:page-number> von <text:page-count>1</text:page-count></text:p></style:footer>` : '';
    const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.2">
<office:font-face-decls><style:font-face style:name="${X(fnt.odt)}" svg:font-family="'${X(fnt.odt)}'" style:font-family-generic="${fnt.gen}"/></office:font-face-decls>
<office:styles>
 <style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="130%"/><style:text-properties style:font-name="${X(fnt.odt)}" fo:font-size="${R.fsizeOf(exam)}pt" fo:language="de" fo:country="DE"/></style:default-style>
 <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
 <style:style style:name="Pfoot" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt" fo:color="#555555"/></style:style>
</office:styles>
<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="1.8cm" fo:margin-bottom="1.8cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">${footer}</style:master-page></office:master-styles>
</office:document-styles>`;

    const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS} office:version="1.2"><office:meta><dc:title>${X(exam.title)}</dc:title><meta:generator>Prüfungsbank</meta:generator><meta:creation-date>${new Date().toISOString()}</meta:creation-date></office:meta></office:document-meta>`;

    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest ${NS} manifest:version="1.2">
 <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
 ${pics.map(p => `<manifest:file-entry manifest:full-path="${p.name}" manifest:media-type="image/${p.ext === 'png' ? 'png' : 'jpeg'}"/>`).join('\n ')}
 ${objs.map((_, i) => `<manifest:file-entry manifest:full-path="Object ${i + 1}/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.formula"/>\n <manifest:file-entry manifest:full-path="Object ${i + 1}/content.xml" manifest:media-type="text/xml"/>`).join('\n ')}
</manifest:manifest>`;

    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
    zip.file('META-INF/manifest.xml', manifest);
    zip.file('content.xml', content);
    zip.file('styles.xml', styles);
    zip.file('meta.xml', meta);
    pics.forEach(p => zip.file(p.name, p.bytes));
    objs.forEach((ml, i) => zip.file(`Object ${i + 1}/content.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n` + ml));

    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text', compression: 'DEFLATE' });
    const name = safeName(exam.title) + (solutions ? '_Loesungen' : '') + '.odt';
    download(blob, name);
    return { blob, name };
  }

  return { pdf, odt, download, texToText };
})();
