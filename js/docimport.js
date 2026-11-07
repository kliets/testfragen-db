/* Dokument-Import: liest PDF, DOCX, ODT und Text im Browser und zerlegt den Inhalt nach festen Regeln in Aufgaben.
   Es wird nichts hochgeladen. Formeln aus Word (OMML) und LibreOffice (MathML) werden in LaTeX umgewandelt. */
window.DocImport = (() => {
  'use strict';
  const IM = '\u0007';                       // Platzhalter für Bilder im Text
  let CUR = { images: [] };                  // Bilder des gerade verarbeiteten Dokuments
  const parseXml = s => new DOMParser().parseFromString(s, 'application/xml');
  const isEl = n => n && n.nodeType === 1;
  const nm = n => n.localName;
  const kidEls = n => [...n.children];
  const first = (n, l) => kidEls(n).find(c => nm(c) === l);
  const attr = (n, l) => { if (!n) return null; for (const a of n.attributes) if (a.localName === l) return a.value; return null; };
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };

  /* ---------- Sonderzeichen → LaTeX ---------- */
  const TEXMAP = {
    α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ζ: '\\zeta', η: '\\eta', θ: '\\theta', ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', µ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho', σ: '\\sigma', τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', ϕ: '\\varphi', χ: '\\chi', ψ: '\\psi', ω: '\\omega',
    Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi', Σ: '\\Sigma', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
    '∞': '\\infty', '·': '\\cdot', '⋅': '\\cdot', '×': '\\times', '÷': '\\div', '±': '\\pm', '∓': '\\mp', '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx', '≡': '\\equiv', '∼': '\\sim',
    '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow', '⟹': '\\Rightarrow', '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊆': '\\subseteq', '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset',
    '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∂': '\\partial', '∇': '\\nabla', '°': '^\\circ', '√': '\\sqrt', '−': '-', '‐': '-', '–': '-', '∘': '\\circ', '∥': '\\parallel', '⊥': '\\perp', '∠': '\\angle', '△': '\\triangle', 'ℏ': '\\hbar', 'ℓ': '\\ell', '…': '\\ldots', '∀': '\\forall', '∃': '\\exists', '¬': '\\neg', '∧': '\\land', '∨': '\\lor', '′': "'", '%': '\\%', '#': '\\#', '&': '\\&'
  };
  const tc = s => [...String(s)].map(c => TEXMAP[c] ? TEXMAP[c] + ' ' : c).join('');
  const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'lg', 'lim', 'exp', 'min', 'max', 'det', 'gcd', 'sup', 'inf']);
  const tidyTex = s => s.replace(/\s+/g, ' ').replace(/\{\s*\}\^/g, '^').trim();

  /* ---------- MathML (LibreOffice) → LaTeX ---------- */
  function ml(n) {
    if (n.nodeType === 3) return tc(n.nodeValue.replace(/[⁡-⁤]/g, ''));
    if (!isEl(n)) return '';
    const k = kidEls(n), cc = () => k.map(ml).join('');
    switch (nm(n)) {
      case 'semantics': return k.length ? ml(k[0]) : '';
      case 'annotation': case 'annotation-xml': return '';
      case 'mi': { const t = n.textContent.trim(); if (FUNCS.has(t)) return '\\' + t + ' '; if (t.length > 1 && /^[A-Za-z]+$/.test(t)) return '\\mathrm{' + t + '}'; return tc(t); }
      case 'mn': return n.textContent.trim();
      case 'mo': { const t = n.textContent.replace(/[⁡-⁤]/g, '').trim(); if (t === '{' || t === '}') return '\\' + t; return tc(t); }
      case 'mtext': return '\\text{' + n.textContent.replace(/[{}\\]/g, ' ') + '}';
      case 'mspace': return '\\ ';
      case 'mfrac': return '\\frac{' + ml(k[0]) + '}{' + ml(k[1]) + '}';
      case 'msqrt': return '\\sqrt{' + cc() + '}';
      case 'mroot': return '\\sqrt[' + ml(k[1]) + ']{' + ml(k[0]) + '}';
      case 'msup': return '{' + ml(k[0]) + '}^{' + ml(k[1]) + '}';
      case 'msub': return '{' + ml(k[0]) + '}_{' + ml(k[1]) + '}';
      case 'msubsup': case 'munderover': return ml(k[0]) + '_{' + ml(k[1]) + '}^{' + ml(k[2]) + '}';
      case 'munder': { const b = ml(k[0]); return /^\\(lim|sum|prod|min|max|int)/.test(b.trim()) ? b + '_{' + ml(k[1]) + '}' : '\\underset{' + ml(k[1]) + '}{' + b + '}'; }
      case 'mover': {
        const t = k[1] ? k[1].textContent.trim() : '', b = ml(k[0]);
        if (/^[→⃗⇀]$/.test(t)) return '\\vec{' + b + '}';
        if (/^[¯‾―_]$/.test(t)) return '\\overline{' + b + '}';
        if (t === '^') return '\\hat{' + b + '}';
        if (/^[˙.]$/.test(t)) return '\\dot{' + b + '}';
        if (/^\\(sum|prod|int)/.test(b.trim())) return b + '^{' + ml(k[1]) + '}';
        return '\\overset{' + ml(k[1]) + '}{' + b + '}';
      }
      case 'mfenced': {
        const o = attr(n, 'open') ?? '(', c = attr(n, 'close') ?? ')', sep = (attr(n, 'separators') || ',')[0];
        const esc = x => (x === '{' || x === '}') ? '\\' + x : x;
        return esc(o) + k.map(ml).join(sep) + esc(c);
      }
      case 'mtable': return '\\begin{matrix}' + k.map(ml).join(' \\\\ ') + '\\end{matrix}';
      case 'mtr': case 'mlabeledtr': return k.map(ml).join(' & ');
      default: return cc();
    }
  }
  const mathmlToTex = root => tidyTex(ml(root));

  /* ---------- OMML (Word) → LaTeX ---------- */
  function om(n) {
    if (!isEl(n)) return '';
    const k = kidEls(n), cc = () => k.map(om).join(''), g = l => { const c = first(n, l); return c ? om(c) : ''; };
    switch (nm(n)) {
      case 'r': {
        let t = ''; for (const c of k) if (nm(c) === 't') t += c.textContent;
        t = t.replace(/[⁡-⁤]/g, '');
        if (FUNCS.has(t.trim())) return '\\' + t.trim() + ' ';
        const pr = first(n, 'rPr'), sty = pr && first(pr, 'sty'), plain = sty && attr(sty, 'val') === 'p';
        if (plain && t.trim().length > 1 && /^[A-Za-z]+$/.test(t.trim())) return '\\mathrm{' + t.trim() + '}';
        return tc(t);
      }
      case 'rPr': case 'ctrlPr': case 'oMathParaPr': case 'fPr': case 'dPr': case 'naryPr': case 'radPr': case 'accPr': case 'barPr': return '';
      case 'f': return '\\frac{' + g('num') + '}{' + g('den') + '}';
      case 'sSup': return '{' + g('e') + '}^{' + g('sup') + '}';
      case 'sSub': return '{' + g('e') + '}_{' + g('sub') + '}';
      case 'sSubSup': return '{' + g('e') + '}_{' + g('sub') + '}^{' + g('sup') + '}';
      case 'sPre': return '{}_{' + g('sub') + '}^{' + g('sup') + '}{' + g('e') + '}';
      case 'rad': { const d = g('deg').trim(); return d ? '\\sqrt[' + d + ']{' + g('e') + '}' : '\\sqrt{' + g('e') + '}'; }
      case 'd': {
        const pr = first(n, 'dPr'), b = pr && first(pr, 'begChr'), e = pr && first(pr, 'endChr'), s = pr && first(pr, 'sepChr');
        const open = b ? attr(b, 'val') : '(', close = e ? attr(e, 'val') : ')', sep = s ? attr(s, 'val') : '|';
        const x = c => (c === '{' || c === '}') ? '\\' + c : c;
        return x(open ?? '') + k.filter(c => nm(c) === 'e').map(om).join(sep) + x(close ?? '');
      }
      case 'nary': {
        const pr = first(n, 'naryPr'), ch = pr && first(pr, 'chr'), chr = ch ? attr(ch, 'val') : '∫';
        const sub = g('sub').trim(), sup = g('sup').trim();
        return tc(chr) + (sub ? '_{' + sub + '}' : '') + (sup ? '^{' + sup + '}' : '') + ' ' + g('e');
      }
      case 'func': return g('fName') + ' ' + g('e');
      case 'acc': {
        const pr = first(n, 'accPr'), ch = pr && first(pr, 'chr'), c = ch ? attr(ch, 'val') : '̂', e = g('e');
        if (c === '⃗' || c === '→') return '\\vec{' + e + '}';
        if (c === '̄' || c === '¯') return '\\overline{' + e + '}';
        if (c === '̇') return '\\dot{' + e + '}';
        return '\\hat{' + e + '}';
      }
      case 'bar': { const pr = first(n, 'barPr'), p = pr && first(pr, 'pos'); return (p && attr(p, 'val') === 'bot' ? '\\underline{' : '\\overline{') + g('e') + '}'; }
      case 'limLow': return g('e') + '_{' + g('lim') + '}';
      case 'limUpp': return g('e') + '^{' + g('lim') + '}';
      case 'm': return '\\begin{matrix}' + k.filter(c => nm(c) === 'mr').map(r => kidEls(r).filter(c => nm(c) === 'e').map(om).join(' & ')).join(' \\\\ ') + '\\end{matrix}';
      case 'eqArr': return k.filter(c => nm(c) === 'e').map(om).join(' \\\\ ');
      default: return cc();
    }
  }
  const ommlToTex = n => tidyTex(om(n));

  /* ---------- Hilfen ---------- */
  const roman = n => { const m = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; };
  const letter = n => { let s = ''; while (n > 0) { s = String.fromCharCode(97 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };
  function fmtNum(n, f) {
    switch (f) {
      case 'decimal': case '1': return String(n);
      case 'lowerLetter': case 'a': return letter(n);
      case 'upperLetter': case 'A': return letter(n).toUpperCase();
      case 'lowerRoman': case 'i': return roman(n);
      case 'upperRoman': case 'I': return roman(n).toUpperCase();
      case 'bullet': case '•': return '•';
      case 'none': return '';
      default: return String(n);
    }
  }
  const mimeOf = p => /\.png$/i.test(p) ? 'image/png' : /\.jpe?g$/i.test(p) ? 'image/jpeg' : /\.gif$/i.test(p) ? 'image/gif' : /\.webp$/i.test(p) ? 'image/webp' : /\.svg$/i.test(p) ? 'image/svg+xml' : '';

  /* ---------- DOCX ---------- */
  async function readDocx(buf) {
    const zip = await JSZip.loadAsync(buf);
    const docF = zip.file('word/document.xml'); if (!docF) throw new Error('Keine gültige DOCX-Datei.');
    const doc = parseXml(await docF.async('string'));
    const rels = {};
    const rf = zip.file('word/_rels/document.xml.rels');
    if (rf) for (const r of parseXml(await rf.async('string')).getElementsByTagNameNS('*', 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const numbering = { abs: {}, num: {} };
    const nf = zip.file('word/numbering.xml');
    if (nf) {
      const d = parseXml(await nf.async('string'));
      for (const a of d.getElementsByTagNameNS('*', 'abstractNum')) {
        const id = attr(a, 'abstractNumId'); numbering.abs[id] = {};
        for (const l of kidEls(a).filter(c => nm(c) === 'lvl')) {
          numbering.abs[id][+attr(l, 'ilvl')] = { fmt: attr(first(l, 'numFmt'), 'val') || 'decimal', txt: attr(first(l, 'lvlText'), 'val') ?? '%1.', start: first(l, 'start') ? +attr(first(l, 'start'), 'val') : 1 };
        }
      }
      for (const n of d.getElementsByTagNameNS('*', 'num')) { const a = first(n, 'abstractNumId'); if (a) numbering.num[attr(n, 'numId')] = attr(a, 'val'); }
    }
    const images = [], counters = {};
    const imgMarker = rid => {
      const t = rels[rid]; if (!t) return '';
      const path = t.startsWith('/') ? t.slice(1) : 'word/' + t.replace(/^\.\//, '');
      const f = zip.file(path); if (!f) return '';
      images.push({ name: path, mime: mimeOf(path), get: () => f.async('uint8array') });
      return IM + (images.length - 1) + IM;
    };
    const label = p => {
      const pr = first(p, 'pPr'), np = pr && first(pr, 'numPr'); if (!np) return '';
      const il = +(attr(first(np, 'ilvl'), 'val') || 0), nid = attr(first(np, 'numId'), 'val');
      if (!nid || nid === '0') return '';
      const lv = (numbering.abs[numbering.num[nid]] || {});
      const c = counters[nid] || (counters[nid] = []);
      const cur = lv[il] || { fmt: 'decimal', txt: '%1.', start: 1 };
      c[il] = c[il] === undefined ? cur.start : c[il] + 1; c.length = il + 1;
      return cur.txt.replace(/%(\d)/g, (m, d) => { const li = +d - 1, L = lv[li] || { fmt: 'decimal', start: 1 }; return fmtNum(c[li] === undefined ? L.start : c[li], L.fmt); }) || fmtNum(c[il], cur.fmt);
    };
    const inl = node => {
      let out = '';
      for (const c of kidEls(node)) {
        switch (nm(c)) {
          case 'r': {
            const rp = first(c, 'rPr'), va = rp && first(rp, 'vertAlign'), v = va && attr(va, 'val');
            let t = '';
            for (const x of kidEls(c)) {
              const l = nm(x);
              if (l === 't') t += x.textContent;
              else if (l === 'tab') t += ' ';
              else if (l === 'br' || l === 'cr') t += '\n';
              else if (l === 'noBreakHyphen') t += '-';
              else if (l === 'drawing' || l === 'pict') { for (const b of x.getElementsByTagNameNS('*', 'blip')) { const rid = attr(b, 'embed'); if (rid) t += imgMarker(rid); } for (const b of x.getElementsByTagNameNS('*', 'imagedata')) { const rid = attr(b, 'id'); if (rid) t += imgMarker(rid); } }
              else if (l === 'AlternateContent') { const ch = first(x, 'Choice') || x; for (const b of ch.getElementsByTagNameNS('*', 'blip')) { const rid = attr(b, 'embed'); if (rid) t += imgMarker(rid); } }
              else if (l === 'oMath' || l === 'oMathPara') t += '$' + ommlToTex(x) + '$';
            }
            if (t && v === 'superscript') t = '$^{' + t.replace(/\s/g, '') + '}$';
            else if (t && v === 'subscript') t = '$_{' + t.replace(/\s/g, '') + '}$';
            out += t; break;
          }
          case 'oMath': out += '$' + ommlToTex(c) + '$'; break;
          case 'oMathPara': for (const m of kidEls(c).filter(x => nm(x) === 'oMath')) out += '$$' + ommlToTex(m) + '$$'; break;
          case 'hyperlink': case 'ins': case 'smartTag': case 'sdt': case 'sdtContent': case 'fldSimple': case 'customXml': out += inl(c); break;
        }
      }
      return out;
    };
    const lines = [];
    const walk = parent => {
      for (const c of kidEls(parent)) {
        switch (nm(c)) {
          case 'p': { const lab = label(c), t = inl(c); const s = (lab ? lab + ' ' : '') + t; s.split('\n').forEach(x => lines.push(x)); break; }
          case 'tbl':
            for (const tr of c.getElementsByTagNameNS('*', 'tr')) {
              const cells = kidEls(tr).filter(x => nm(x) === 'tc').map(tcl => kidEls(tcl).filter(x => nm(x) === 'p').map(inl).join(' ').trim());
              lines.push(cells.join(' | '));
            }
            break;
          case 'sdt': { const sc = first(c, 'sdtContent'); if (sc) walk(sc); break; }
        }
      }
    };
    walk(doc.getElementsByTagNameNS('*', 'body')[0]);
    return { lines, images };
  }

  /* ---------- ODT ---------- */
  async function readOdt(buf) {
    const zip = await JSZip.loadAsync(buf);
    const cf = zip.file('content.xml'); if (!cf) throw new Error('Keine gültige ODT-Datei.');
    const content = parseXml(await cf.async('string'));
    const sf = zip.file('styles.xml');
    const styles = sf ? parseXml(await sf.async('string')) : null;
    const objects = {};
    for (const p of Object.keys(zip.files)) { const m = p.match(/^(Object [^/]+)\/content\.xml$/); if (m) objects[m[1]] = await zip.file(p).async('string'); }
    const lstyles = {}, tstyle = {};
    for (const d of [content, styles].filter(Boolean)) {
      for (const ls of d.getElementsByTagNameNS('*', 'list-style')) {
        const lv = {};
        for (const l of kidEls(ls)) {
          const lvl = +attr(l, 'level');
          if (nm(l) === 'list-level-style-number') lv[lvl] = { fmt: attr(l, 'num-format') ?? '1', pre: attr(l, 'num-prefix') || '', suf: attr(l, 'num-suffix') || '', start: +(attr(l, 'start-value') || 1) };
          else if (nm(l) === 'list-level-style-bullet') lv[lvl] = { fmt: 'bullet', pre: '', suf: '', start: 1 };
        }
        lstyles[attr(ls, 'name')] = lv;
      }
      for (const st of d.getElementsByTagNameNS('*', 'style')) {
        const tp = first(st, 'text-properties'); const pos = tp && attr(tp, 'text-position');
        if (pos) { const f = pos.trim().split(/\s+/)[0]; tstyle[attr(st, 'name')] = (f.startsWith('super') || parseFloat(f) > 0) ? 'sup' : (f.startsWith('sub') || parseFloat(f) < 0) ? 'sub' : ''; }
      }
    }
    const images = [];
    const imgMarker = href => {
      const p = String(href || '').replace(/^\.\//, ''); const f = zip.file(p); if (!f) return '';
      images.push({ name: p, mime: mimeOf(p), get: () => f.async('uint8array') });
      return IM + (images.length - 1) + IM;
    };
    const inl = node => {
      let out = '';
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { out += c.nodeValue; continue; }
        if (!isEl(c)) continue;
        switch (nm(c)) {
          case 's': out += ' '.repeat(+(attr(c, 'c') || 1)); break;
          case 'tab': out += ' '; break;
          case 'line-break': out += '\n'; break;
          case 'span': {
            const t = inl(c), v = tstyle[attr(c, 'style-name')];
            out += (t && v === 'sup') ? '$^{' + t.replace(/\s/g, '') + '}$' : (t && v === 'sub') ? '$_{' + t.replace(/\s/g, '') + '}$' : t; break;
          }
          case 'a': out += inl(c); break;
          case 'frame': {
            const o = c.getElementsByTagNameNS('*', 'object')[0];
            if (o) { const key = String(attr(o, 'href') || '').replace(/^\.\//, ''); const x = objects[key]; if (x) { const math = parseXml(x).documentElement; if (nm(math) === 'math') out += '$' + mathmlToTex(math) + '$'; } }
            else {
              const im = c.getElementsByTagNameNS('*', 'image')[0];
              if (im) out += imgMarker(attr(im, 'href'));
              const tb = c.getElementsByTagNameNS('*', 'text-box')[0];
              if (tb) out += kidEls(tb).map(inl).join(' ');
            }
            break;
          }
        }
      }
      return out;
    };
    const lines = [];
    const addPara = (s, pre) => { ((pre ? pre + ' ' : '') + s).split('\n').forEach(x => lines.push(x)); };
    const list = (node, level, inheritedStyle, counts) => {
      const sname = attr(node, 'style-name') || inheritedStyle, lv = lstyles[sname] || {};
      let n = (lv[level] ? lv[level].start : 1) - 1;
      for (const it of kidEls(node).filter(x => nm(x) === 'list-item' || nm(x) === 'list-header')) {
        n++;
        const L = lv[level] || { fmt: level === 1 ? '1' : 'a', pre: '', suf: level === 1 ? '.' : ')' };
        const lab = L.fmt === 'bullet' ? '•' : (L.pre + fmtNum(n, L.fmt) + L.suf);
        let firstP = true;
        for (const c of kidEls(it)) {
          if (nm(c) === 'p' || nm(c) === 'h') { addPara(inl(c), firstP ? lab : ''); firstP = false; }
          else if (nm(c) === 'list') list(c, level + 1, sname, counts);
        }
      }
    };
    const walk = parent => {
      for (const c of kidEls(parent)) {
        switch (nm(c)) {
          case 'p': case 'h': addPara(inl(c)); break;
          case 'list': list(c, 1, null, {}); break;
          case 'section': walk(c); break;
          case 'table':
            for (const tr of c.getElementsByTagNameNS('*', 'table-row')) {
              const cells = kidEls(tr).filter(x => nm(x) === 'table-cell').map(td => kidEls(td).filter(x => nm(x) === 'p' || nm(x) === 'h').map(inl).join(' ').trim());
              lines.push(cells.join(' | '));
            }
            break;
        }
      }
    };
    walk(content.getElementsByTagNameNS('*', 'text')[0]);
    return { lines, images };
  }

  /* ---------- PDF ---------- */
  let pdfMod = null;
  async function readPdf(buf) {
    if (!pdfMod) {
      pdfMod = await import(new URL('vendor/pdf.min.mjs?v=6', document.baseURI).href);
      pdfMod.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs?v=6', document.baseURI).href;
    }
    const pdf = await pdfMod.getDocument({ data: new Uint8Array(buf) }).promise;
    const pages = [], images = [];
    const SC = 2.5, PT2CM = 0.035278, G = 4;
    let gfxFail = false;
    const MATHCH = /[√∑∏∫∮∂∇⎛⎜⎝⎞⎟⎠⎡⎢⎣⎤⎥⎦-�]/;
    const POINTS = /\(\s*(?:max\.?\s*|je\s+)?\d+(?:[.,]\d+)?\s*(?:BE|VP|P|Pkt\.?|Pt\.?|Punkte?)\s*\)|^\s*\d+(?:[.,]\d+)?\s*(?:BE|VP|Punkte?)\s*$/i;
    const NOMATH = /^(sin|cos|tan|cot|log|ln|lim|exp|max|min|sec|arcsin|arccos|arctan)$/i;
    const LABEL = /^(\(?[a-hA-H]\)|\(?\d{1,2}[.)]|Aufgabe|Aufg\.?|Task)$/i;
    const HEADW = /^(Aufgabe|Aufg\.?|Übung|Task)\s*\d{1,2}\s*[.:]?$/i;
    const isProse = str => { if (HEADW.test(str.trim())) return true; const w = str.split(/\s+/).filter(Boolean); return w.every(x => LABEL.test(x) || (/^[A-Za-zÄÖÜäöüß]{2,}[,.:;!?]*$/.test(x) && !NOMATH.test(x.replace(/[,.:;!?]+$/, '')))); };

    // zusammenhängende Bereiche eines Rasters (8er-Nachbarschaft)
    const label = (grid, gw, gh) => {
      const lab = new Int32Array(gw * gh), boxes = [], st = [];
      for (let i = 0; i < grid.length; i++) {
        if (!grid[i] || lab[i]) continue;
        const id = boxes.length + 1; const bx = { x0: gw, y0: gh, x1: 0, y1: 0 }; boxes.push(bx);
        lab[i] = id; st.push(i);
        while (st.length) {
          const c = st.pop(), cx = c % gw, cy = (c / gw) | 0;
          if (cx < bx.x0) bx.x0 = cx; if (cx > bx.x1) bx.x1 = cx; if (cy < bx.y0) bx.y0 = cy; if (cy > bx.y1) bx.y1 = cy;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            const ni = ny * gw + nx; if (grid[ni] && !lab[ni]) { lab[ni] = id; st.push(ni); }
          }
        }
      }
      return { lab, boxes };
    };
    const dilate = (grid, gw, gh, r) => {
      const t = new Uint8Array(grid.length), o = new Uint8Array(grid.length);
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (grid[y * gw + x]) for (let k = Math.max(0, x - r); k <= Math.min(gw - 1, x + r); k++) t[y * gw + k] = 1;
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (t[y * gw + x]) for (let k = Math.max(0, y - r); k <= Math.min(gh - 1, y + r); k++) o[k * gw + x] = 1;
      return o;
    };
    const cropImage = (cv, r, pad = 3) => {
      const x0 = Math.max(0, Math.floor(r.x0 - pad)), y0 = Math.max(0, Math.floor(r.y0 - pad)), x1 = Math.min(cv.width, Math.ceil(r.x1 + pad)), y1 = Math.min(cv.height, Math.ceil(r.y1 + pad));
      const c = document.createElement('canvas'); c.width = Math.max(1, x1 - x0); c.height = Math.max(1, y1 - y0);
      c.getContext('2d').drawImage(cv, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
      return c;
    };
    const addImage = (canvas, extra) => {
      images.push(Object.assign({ name: 'pdf-' + images.length + '.png', mime: 'image/png', get: () => new Promise(res => canvas.toBlob(b => b.arrayBuffer().then(res), 'image/png')) }, extra));
      return images.length - 1;
    };

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: SC });
      const tcnt = await page.getTextContent();
      const pxr = it => { const [ax, ay] = vp.convertToViewportPoint(it.x, it.y + it.h * 0.9), [bx, by] = vp.convertToViewportPoint(it.x + it.w, it.y - it.h * 0.25); return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) }; };
      let items = tcnt.items.filter(i => i.str !== undefined && i.transform).map(i => { const o = { s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) || 10 }; o.r = pxr(o); return o; });
      const hs = items.filter(i => i.s.trim()).map(i => i.h).sort((a, b) => a - b);
      const med = hs[hs.length >> 1] || 10, medPx = med * SC;
      const extraLines = [];          // Bilder/Grafiken als eigene Zeilen
      const fracs = [];               // erkannte Brüche {num, den, bar}
      let smalls = [];                // kleine gezeichnete Teile (Formeln)
      let pageCanvas = null;

      // ---- Grafiken und Bruchstriche über das gerenderte Seitenbild ----
      try {
        const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: cx, viewport: vp, canvas: cv }).promise;
        const mk = document.createElement('canvas'); mk.width = cv.width; mk.height = cv.height;
        const mx = mk.getContext('2d', { willReadFrequently: true }); mx.drawImage(cv, 0, 0); mx.fillStyle = '#fff';
        items.forEach(it => { if (it.s.trim()) mx.fillRect(it.r.x0 - 2, it.r.y0 - 2, it.r.x1 - it.r.x0 + 4, it.r.y1 - it.r.y0 + 4); });
        const W = mk.width, H = mk.height, data = mx.getImageData(0, 0, W, H).data;
        const gw = Math.ceil(W / G), gh = Math.ceil(H / G), on = new Uint8Array(gw * gh);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (data[i] + data[i + 1] + data[i + 2] < 645) on[(y >> 2) * gw + (x >> 2)] = 1; }
        const orig = cx.getImageData(0, 0, W, H).data;
        const ink = bx => { let n = 0, tot = 0; for (let y = bx.y0 + 4; y < bx.y1 - 4; y++) for (let x = bx.x0 + 4; x < bx.x1 - 4; x++) { tot++; const i = (y * W + x) * 4; if (data[i] + data[i + 1] + data[i + 2] < 600) n++; } return tot ? n / tot : 0; };
        // Grafiken: Bereiche nach Verschmelzen nahe beieinander liegender Teile
        const dl = label(dilate(on, gw, gh, 4), gw, gh);
        const tight = dl.boxes.map(() => ({ x0: gw, y0: gh, x1: -1, y1: -1 }));
        for (let i = 0; i < on.length; i++) if (on[i]) { const t = tight[dl.lab[i] - 1]; if (!t) continue; const cx2 = i % gw, cy2 = (i / gw) | 0; if (cx2 < t.x0) t.x0 = cx2; if (cx2 > t.x1) t.x1 = cx2; if (cy2 < t.y0) t.y0 = cy2; if (cy2 > t.y1) t.y1 = cy2; }
        const blobs = [];
        smalls = [];
        tight.forEach(t => {
          if (t.x1 < 0) return;
          const r = { x0: t.x0 * G, y0: t.y0 * G, x1: (t.x1 + 1) * G, y1: (t.y1 + 1) * G }, w = r.x1 - r.x0, h = r.y1 - r.y0;
          if (w < 0.9 * medPx * 3 || h < 0.9 * medPx * 3) {                   // kein eigenes Bild: ggf. gezeichnete Formel mitten im Text
            if (h >= 0.5 * medPx && w >= 0.5 * medPx && h <= 4 * medPx) {
              const sq = Math.abs(w - h) <= 0.25 * Math.max(w, h) && w <= 1.7 * medPx;
              if (!(sq && ink(r) < 0.02)) smalls.push(r);                         // hohle Kästchen (☐) überspringen
            }
            return;
          }
          if (w > 0.92 * W && h > 0.92 * H) return;                            // Seitenrahmen
          if (ink(r) < 0.0015) return;                                         // leere Antwortkästen
          blobs.push(r);
        });
        blobs.forEach(r => {                                                  // kurze Beschriftungen (Achsenzahlen, x, y) gehören dazu
          for (let k = 0; k < 3; k++) items.forEach(it => {
            { const t = it.s.trim(); if (!t || !(/^[-−+]?\d+(?:[.,]\d+)?%?$/.test(t) || t.length <= 2)) return; }
            const m = 1.8 * medPx, ox = Math.max(r.x0 - it.r.x1, it.r.x0 - r.x1, 0), oy = Math.max(r.y0 - it.r.y1, it.r.y0 - r.y1, 0);
            if (ox <= m && oy <= m && (ox === 0 || oy === 0 || (ox <= 0.6 * m && oy <= 0.6 * m))) { r.x0 = Math.min(r.x0, it.r.x0); r.x1 = Math.max(r.x1, it.r.x1); r.y0 = Math.min(r.y0, it.r.y0); r.y1 = Math.max(r.y1, it.r.y1); }
          });
        });
        blobs.sort((a, b) => a.y0 - b.y0);
        // Texte innerhalb der Grafiken gehören zum Bildausschnitt
        const inside = (it, r) => { const cx3 = (it.r.x0 + it.r.x1) / 2, cy3 = (it.r.y0 + it.r.y1) / 2; return cx3 >= r.x0 - 4 && cx3 <= r.x1 + 4 && cy3 >= r.y0 - 4 && cy3 <= r.y1 + 4; };
        blobs.forEach(r => {
          items = items.filter(it => !inside(it, r));
          const idx = addImage(cropImage(cv, r, 4), { wpct: Math.max(15, Math.min(100, Math.round((r.x1 - r.x0) / SC / (page.view[2] - page.view[0]) / 0.8 * 100 / 5) * 5)) });
          const [, py] = vp.convertToPdfPoint(r.x0, r.y0), [px0] = vp.convertToPdfPoint(r.x0, r.y0), [px1] = vp.convertToPdfPoint(r.x1, r.y0);
          extraLines.push({ y: py, text: IM + idx + IM, x0: px0, x1: px1, img: true });
        });
        // Bruchstriche: kurze dünne Linien mit Text direkt darüber und darunter
        const dark = (x, y) => { const i = (y * W + x) * 4; return orig[i] + orig[i + 1] + orig[i + 2] < 600; };
        const runs = [];
        for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (dark(x, y)) { let e = x; while (e + 1 < W && dark(e + 1, y)) e++; if (e - x + 1 >= 6 && e - x + 1 <= 0.4 * W) runs.push({ y, x0: x, x1: e }); x = e + 1; } else x++; } }
        const bars = [];
        runs.forEach(r => { const b0 = bars.find(b => r.y - b.y1 <= 1 && Math.abs(b.x0 - r.x0) <= 3 && Math.abs(b.x1 - r.x1) <= 3); if (b0) b0.y1 = r.y; else bars.push({ x0: r.x0, x1: r.x1, y0: r.y, y1: r.y }); });
        bars.forEach(b => {
          const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
          if (bh > 5) return;
          const bx0 = b.x0, bx1 = b.x1 + 1, by = (b.y0 + b.y1 + 1) / 2;
          const near = it => { const c = (it.r.x0 + it.r.x1) / 2; return it.s.trim() && c >= bx0 - 0.4 * medPx && c <= bx1 + 0.4 * medPx; };
          const num = items.filter(it => near(it) && it.r.y1 <= by + 8 && by - it.r.y1 <= 1.0 * medPx && by - it.r.y0 <= 2.2 * medPx);
          const den = items.filter(it => near(it) && it.r.y0 >= by - 8 && it.r.y0 - by <= 1.0 * medPx && it.r.y1 - by <= 2.2 * medPx);
          if (!num.length || !den.length) return;
          const grp = [...num, ...den], gx0 = Math.min(...grp.map(i => i.r.x0)), gx1 = Math.max(...grp.map(i => i.r.x1));
          if (gx0 < bx0 - 0.6 * medPx || gx1 > bx1 + 0.6 * medPx) return;           // Text ragt über den Strich hinaus → Fließtext
          if (bw < 0.75 * (gx1 - gx0)) return;
          const prose = items.some(o => !grp.includes(o) && o.s.trim() && grp.some(g => Math.abs((o.r.y0 + o.r.y1) / 2 - (g.r.y0 + g.r.y1) / 2) < 0.4 * medPx && ((o.r.x0 >= gx1 && o.r.x0 - gx1 < 0.8 * medPx) || (o.r.x1 <= gx0 && gx0 - o.r.x1 < 0.8 * medPx))));
          if (prose && !grp.every(g => g.s.trim().length <= 6)) return;
          fracs.push({ num, den, bar: { x0: bx0, x1: bx1, y0: by - 2, y1: by + 2 }, by });
        });
        fracs.forEach(f => { items = items.filter(it => !f.num.includes(it) && !f.den.includes(it)); });
        // Operatoren mit Grenzen oben und unten (Summe, Integral, Produkt): übereinander stehende kleine Zeichen neben einem Operator
        {
          const sm = items.filter(t => t.s.trim() && t.h < 0.8 * med), taken = new Set();
          for (const u of sm) {
            if (taken.has(u)) continue;
            const d = sm.find(t => t !== u && !taken.has(t) && t.r.y1 > u.r.y1 + 0.5 * medPx && t.r.y1 - u.r.y1 <= 3 * medPx && Math.min(u.r.x1, t.r.x1) - Math.max(u.r.x0, t.r.x0) >= 0.4 * Math.min(u.r.x1 - u.r.x0, t.r.x1 - t.r.x0));
            if (!d) continue;
            const xL = Math.min(u.r.x0, d.r.x0) - 0.6 * medPx, xR = Math.max(u.r.x1, d.r.x1) + 0.6 * medPx;
            const grp = sm.filter(t => !taken.has(t) && (t.r.x0 + t.r.x1) / 2 >= xL && (t.r.x0 + t.r.x1) / 2 <= xR && t.r.y1 >= u.r.y1 - 0.5 * medPx && t.r.y1 <= d.r.y1 + 0.5 * medPx);
            const gx0 = Math.min(...grp.map(t => t.r.x0)), top = u.r.y0, bot = d.r.y1;
            const base = items.filter(t => t.s.trim() && t.h >= 0.85 * med && !grp.includes(t) && t.r.x0 <= gx0 + 0.5 * medPx && t.r.x1 >= gx0 - 1.2 * medPx && t.r.x1 - t.r.x0 <= 3 * medPx && (t.r.y0 + t.r.y1) / 2 >= top - 0.3 * medPx && (t.r.y0 + t.r.y1) / 2 <= bot).sort((a, b) => b.r.x1 - a.r.x1)[0];
            if (!base) continue;
            grp.forEach(t => taken.add(t));
            fracs.push({ num: grp, den: [], bar: base.r, by: (base.r.y0 + base.r.y1) / 2, base });
            items = items.filter(t => t !== base && !grp.includes(t));
          }
        }
        {
          const exp = (q, m) => ({ x0: q.x0 - m, y0: q.y0 - m, x1: q.x1 + m, y1: q.y1 + m });
          const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
          const covers = [];
          fracs.forEach(f => { const rs = [...f.num, ...f.den].map(i => i.r).concat([f.bar]); covers.push({ x0: Math.min(...rs.map(q => q.x0)), x1: Math.max(...rs.map(q => q.x1)), y0: Math.min(...rs.map(q => q.y0)), y1: Math.max(...rs.map(q => q.y1)) }); });
          items.forEach(i => { if (MATHCH.test(i.s)) covers.push(i.r); });
          smalls = smalls.filter(sm => !covers.some(c => hit(sm, exp(c, 0.8 * medPx))));
        }
        smalls = smalls.filter(r => !blobs.some(b => r.x0 >= b.x0 - 4 && r.x1 <= b.x1 + 4 && r.y0 >= b.y0 - 4 && r.y1 <= b.y1 + 4));
        pageCanvas = cv;
      } catch (e) { gfxFail = true; pageCanvas = null; }

      // ---- Zeilen bilden ----
      const mathItems = items.filter(i => MATHCH.test(i.s));      // Formelzeichen (√, ∑ …) liegen oft versetzt: erst später einer Zeile zuordnen
      if (pageCanvas) items = items.filter(i => !MATHCH.test(i.s));
      items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
      const rows = [];
      const addRow = it => {
        let r = rows.find(r => Math.abs(r.y - it.y) <= 0.55 * med);
        if (!r) { if (!it.s.trim()) return; r = { y: it.y, items: [], base: null, fr: [] }; rows.push(r); }
        r.items.push(it);
        if (it.s.trim() && it.h >= 0.85 * med && (r.base === null || it.y < r.base)) r.base = it.y;
      };
      for (const it of items) addRow(it);
      // Formelteile (Brüche, gezeichnete Formeln) der passenden Zeile zuordnen
      const rowFor = rect => {
        const span = r => r.items.length ? [Math.min(...r.items.map(i => i.r.y0)), Math.max(...r.items.map(i => i.r.y1))] : null;
        let best = null, bo = 0;
        for (const r of rows) { const sp = span(r); if (!sp) continue; const ov = Math.min(rect.y1, sp[1]) - Math.max(rect.y0, sp[0]); if (ov > bo) { bo = ov; best = r; } }
        if (best && bo >= 0.2 * Math.min(rect.y1 - rect.y0, medPx)) return best;
        const [, yPdf] = vp.convertToPdfPoint(0, (rect.y0 + rect.y1) / 2);
        const r = { y: yPdf - 0.3 * med, items: [], base: null, seeds: [] }; rows.push(r); return r;
      };
      rows.forEach(r => { r.seeds = []; });
      for (const f of fracs) {
        const rs = [...f.num, ...f.den].map(i => i.r).concat([f.bar]);
        const rc = { x0: Math.min(...rs.map(q => q.x0)), x1: Math.max(...rs.map(q => q.x1)), y0: Math.min(...rs.map(q => q.y0)), y1: Math.max(...rs.map(q => q.y1)) };
        rowFor(rc).seeds.push({ rect: rc });
      }
      for (const sm of smalls) rowFor(sm).seeds.push({ rect: sm });
      if (pageCanvas) for (const m of mathItems) rowFor(m.r).seeds.push({ rect: m.r, item: m });
      const rowText = (its, base) => {
        its = [...its].sort((a, b) => a.x - b.x);
        let s = '', prevEnd = null, mode = '';
        for (const it of its) {
          if (!it.s) continue;
          const small = it.h < 0.8 * med, role = small && it.y - base > 0.2 * med ? 'sup' : small && base - it.y > 0.12 * med ? 'sub' : '';
          const gap = prevEnd === null ? 0 : it.x - prevEnd;
          if (role) {
            const t = it.s.replace(/\s/g, ''); if (!t) continue;
            if (mode === role) s = s.replace(/\}\$$/, t + '}$'); else s += (role === 'sup' ? '$^{' : '$_{') + t + '}$';
            mode = role;
          } else {
            if (gap > 0.2 * med && !/\s$/.test(s) && !/^\s/.test(it.s)) s += ' ';
            s += it.s; mode = '';
          }
          prevEnd = it.x + it.w;
        }
        return s.replace(/\s+$/, '').replace(/^\s+/, '');
      };
      const lines = rows.sort((a, b) => b.y - a.y).map(r => {
        const base = r.base ?? r.y;
        r.items.sort((a, b) => a.x - b.x);
        const xs = r.items.filter(i => i.s.trim());
        const x0 = xs.length ? Math.min(...xs.map(i => i.x)) : 0, x1 = xs.length ? Math.max(...xs.map(i => i.x + i.w)) : 0;
        const seeds = [...r.seeds];
        xs.forEach(i => { if (MATHCH.test(i.s)) seeds.push({ rect: i.r, item: i }); });
        if (!seeds.length || !pageCanvas) return { y: r.y, text: rowText(r.items, base), x0, x1 };
        // Elemente der Zeile von links nach rechts
        const els = [...xs.map(it => ({ k: 't', it, rect: it.r, prose: (isProse(it.s) || POINTS.test(it.s)) && !MATHCH.test(it.s) })), ...seeds.map(sd => ({ k: 's', rect: sd.rect, it: sd.item }))]
          .filter((e, i, arr) => !(e.k === 't' && e.it && seeds.some(sd => sd.item === e.it)))     // Formelzeichen nur einmal
          .concat(seeds.filter(sd => sd.item).map(sd => ({ k: 's', rect: sd.item.r, it: sd.item })))
          .sort((a, b) => a.rect.x0 - b.rect.x0);
        const out = []; let seg = [], run = null;
        const flushSeg = () => { if (seg.length) { const t = rowText(seg, base); if (t) out.push(t); seg = []; } };
        const flushRun = () => {
          if (!run) return;
          if (!run.some(e => e.k === 's')) { run.forEach(e => seg.push(e.it)); run = null; return; }
          flushSeg();
          const rc = { x0: Math.min(...run.map(e => e.rect.x0)), x1: Math.max(...run.map(e => e.rect.x1)), y0: Math.min(...run.map(e => e.rect.y0)), y1: Math.max(...run.map(e => e.rect.y1)) };
          const idx = addImage(cropImage(pageCanvas, rc, 3), { inline: true, hcm: Math.round((rc.y1 - rc.y0 + 6) / SC * PT2CM * 100) / 100 });
          out.push(IM + idx + IM); run = null;
        };
        for (const e of els) {
          const mathLike = e.k === 's' || !e.prose;
          if (mathLike && run && e.rect.x0 - run[run.length - 1].rect.x1 <= 1.3 * medPx) { run.push(e); continue; }
          if (mathLike) { flushRun(); run = [e]; continue; }
          flushRun(); seg.push(e.it);
        }
        flushRun(); flushSeg();
        return { y: r.y, text: out.join(' '), x0, x1, hasImg: true };
      }).filter(l => l.text);
      const all = lines.concat(extraLines).sort((a, b) => b.y - a.y);
      pages.push({ lines: all, med });
    }
    if (gfxFail) images.failed = true;
    // Kopf- und Fußzeilen entfernen
    const norm = t => t.replace(/\d+/g, '#').toLowerCase();
    const cnt = {};
    pages.forEach(pg => { const cand = [...pg.lines.slice(0, 2), ...pg.lines.slice(-2)].filter(l => !l.img && !l.hasImg); new Set(cand.map(l => norm(l.text))).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }); });
    const lim = Math.max(2, Math.ceil(pages.length * 0.6));
    pages.forEach(pg => {
      const n = pg.lines.length;
      pg.lines = pg.lines.filter((l, i) => {
        if (l.img || l.hasImg) return true;
        const edge = i < 2 || i >= n - 2;
        if (edge && cnt[norm(l.text)] >= lim && pages.length > 1) return false;
        if (edge && /^(seite|page)\s*\d+(\s*(von|\/|of)\s*\d+)?$/i.test(l.text)) return false;
        if (i >= n - 1 && /^\d{1,3}$/.test(l.text)) return false;
        return true;
      });
    });
    // Zeilen zu Absätzen verbinden
    const gaps = []; pages.forEach(pg => { for (let i = 1; i < pg.lines.length; i++) gaps.push(pg.lines[i - 1].y - pg.lines[i].y); });
    gaps.sort((a, b) => a - b); const ls = gaps.length ? gaps[gaps.length >> 1] : 12;
    const W = Math.max(1, ...pages.flatMap(pg => pg.lines.map(l => l.x1 - l.x0)));
    const MARK = /^\s*(\(?[a-hA-H]\s*[.)]\s|\d{1,2}\s*[.)]\s|Aufgabe|Aufg\.|Übung|Task|Lösung|Musterlösung|Erwartungshorizont|[•·▪●\-–—]\s|[☐☒☑□■◻◯○✓✔✗✘]|\[\s?[xX]?\s?\]|\(\s?[xX]?\s?\))/i;
    const out = []; let cur = '', prev = null;
    pages.forEach((pg, pi) => {
      pg.lines.forEach((l, i) => {
        const newPar = !prev || l.img || prev.img || (/^\s*(Aufgabe|Aufg\.|Übung|Task)\s*\d{1,2}\b/i.test(prev.text) && prev.text.length <= 90) || (i === 0 && !(/[^.?!:)]$/.test(cur) && /^[a-zäöüß]/.test(l.text)))
          || (i > 0 && (prev.y - l.y) > 1.45 * ls) || MARK.test(l.text)
          || (prev && (prev.x1 - prev.x0) < 0.55 * W && /[.:?!)]$/.test(prev.text));
        if (newPar) { if (cur) out.push(cur); cur = l.text; }
        else if (/[A-Za-zÄÖÜäöüß]-$/.test(cur) && /^[a-zäöüß]/.test(l.text)) cur = cur.slice(0, -1) + l.text;
        else cur += ' ' + l.text;
        prev = l;
      });
    });
    if (cur) out.push(cur);
    return { lines: out, images };
  }

  async function readText(buf) { return { lines: new TextDecoder('utf-8').decode(buf).replace(/\r/g, '').split('\n'), images: [] }; }

  /* ---------- Zerlegung ---------- */
  const RX = {
    head: /^\s*(?:\*\*)?(?:Aufgabe|Aufg\.|Übung|Task|Problem)\s*(\d{1,2})\s*(?:\*\*)?\s*(?:[.:)–—-]\s*|\s+(?=\S)|$)(.*)$/i,
    numd: /^\s*(\d{1,2})\s*[.)]\s+(\S.*)$/,
    part: /^\s*\(?([a-h])(?:\)|\.(?=\s))\s*(.*)$/,
    optU: /^\s*\(?([A-F])(?:\)|\.(?=\s))\s*(.*)$/,
    box: /^\s*([☐☒☑□■◻◯○✓✔✗✘]|\[\s?[xX]?\s?\]|\(\s?[xX]?\s?\))\s*(.*)$/,
    sol: /^\s*(?:\*\*)?(Lösung(?:svorschlag|shinweise?)?|Musterlösung|Erwartungshorizont|Lösungsskizze)(?:\*\*)?\s*[:.]\s*(.*)$/i,
    solHead: /^\s*(?:\*\*)?(Lösungen?|Musterlösungen?|Lösungsvorschläge?|Erwartungshorizonte?|Lösungshinweise|Korrekturhinweise|Lösungsskizzen?)(?:\*\*)?\s*:?\s*$/i,
    ansLine: /^[\s_.…\-–—·]{6,}$/,
    ansInline: /(?:Antwort|Ergebnis|Lösung|Antwortsatz)\s*:?\s*[_.…\s]{3,}$/i,
    gap: /_{3,}|\.{6,}|…{2,}|…\s?…/g,
    checkedBox: /^[☒☑✓✔]|^\[\s?[xX]\s?\]|^\(\s?[xX]\s?\)/
  };
  const clean = s => String(s).replace(/[   ]/g, ' ').replace(/[​-‍﻿]/g, '').replace(/\t/g, ' ').replace(/\*/g, '∗').replace(/[ ]{2,}/g, ' ').trim();

  // Punkte am Ende eines Textes erkennen und entfernen
  function grabPoints(s, anywhere) {
    s = String(s); let m, je = false;
    const br = anywhere ? /[\(\[]\s*(?:max\.?\s*|je\s+)?(\d+(?:[.,]\d+)?)\s*(?:BE|VP|P|Pkt\.?|Pt\.?|Punkte?|Punkt)\s*[\)\]]/i : /[\(\[]\s*(?:max\.?\s*|je\s+)?(\d+(?:[.,]\d+)?)\s*(?:BE|VP|P|Pkt\.?|Pt\.?|Punkte?|Punkt)\s*[\)\]]\s*[.:]?\s*$/i;
    if ((m = s.match(br))) { je = /je\s/i.test(m[0]); return { text: (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+([.,:;?!])/g, '$1').trim(), pts: num(m[1]), je }; }
    if ((m = s.match(/[\s,–-]+(\d+(?:[.,]\d+)?)\s*(?:BE|VP|Punkte?|Pkt\.?)\s*[.)]?\s*$/i))) return { text: s.slice(0, m.index).trim(), pts: num(m[1]), je: false };
    if ((m = s.match(/\s\/\s*(\d+(?:[.,]\d+)?)\s*$/))) return { text: s.slice(0, m.index).trim(), pts: num(m[1]), je: false };
    return { text: s, pts: null, je: false };
  }

  const GREEK_WORDS = /\b(alpha|beta|gamma)\b/i;
  const SUBJ = {
    Informatik: /\b(python|java(?:script)?|algorithmus|algorithmen|schleife|variable[n]?|datenbank|sql|programm\w*|quellcode|code|funktion\s*\w*\(|print\s*\(|def\s+\w+|array|liste|boolean|compiler|binär\w*|bits?|bytes?|netzwerk|html|css|ip-adresse|verschlüsselung|if-?anweisung|klasse\s+\w+|objekt)\b/gi,
    Physik: /\b(kraft|kräfte|geschwindigkeit|beschleunigung|spannung|stromstärke|widerstand|energie|arbeit|leistung|impuls|newton|joule|watt|volt|ampere|ohm|welle[n]?|frequenz|schwingung|elektron\w*|photon\w*|magnet\w*|ladung|masse|dichte|druck|temperatur|wärme|optik|linse|brechung|radioaktiv\w*|atom\w*|quant\w*|gravitation|reibung|fallbeschleunigung|feld)\b/gi,
    Mathematik: /\b(funktion|gleichung|ableitung|integral|nullstelle[n]?|wahrscheinlichkeit|vektor\w*|dreieck|winkel|parabel|matrix|term|steigung|gerade|kreis|prozent\w*|bruch|brüche|extremstelle|wendepunkt|stochastik|binomial\w*|flächeninhalt|volumen|strecke|zeichne|koordinatensystem|lineare?|quadratische?)\b/gi
  };
  function guessSubject(text, fallback) {
    let best = fallback, bs = 0;
    for (const [k, rx] of Object.entries(SUBJ)) { const n = (text.match(rx) || []).length; if (n > bs) { bs = n; best = k; } }
    return { subject: best, sure: bs >= 2 };
  }
  function guessAfb(text) {
    const t = text.toLowerCase();
    if (/(beurteil|bewert|entwickel|interpretier|stellen? sie .{0,30}stellung|diskutier|beweis|herleit|verallgemeiner|reflektier|überprüf|prüfen sie|modellier|optimier|begründen sie .{0,40}(entscheidung|vorgehen))/.test(t)) return 3;
    if (/(erkl[aä]r|erläuter|begründ|vergleich|zusammenfass|untersuch|analysier|zeig|ordne|übertrag|anwend|stell\w* .{0,30}dar|erstell|ermittel|argumentier|schlussfolger|folger)/.test(t)) return 2;
    return t.length > 260 ? 2 : 1;
  }

  // Zerlegt die Zeilen eines Aufgabenblocks in Einleitung, Teilaufgaben, Optionen und Lösungstext
  function scan(body, inSolSection) {
    const S = { intro: [], parts: [], opts: [], sol: [], answerLines: 0, imgs: [] };
    let target = 'intro', solMode = !!inSolSection;
    const addTo = (t, solFlag) => {
      if (target === 'intro') (solFlag ? S.sol : S.intro).push(t);
      else { const p = S.parts[S.parts.length - 1]; (solFlag ? p.sol : p.lines).push(t); }
    };
    for (let raw of body) {
      let l = clean(String(raw).replace(/\u0007(\d+)\u0007/g, (m, i) => CUR.images[+i] ? ' {img:' + i + '} ' : ''));
      if (!l) continue;
      if (RX.ansLine.test(l)) { S.answerLines++; continue; }
      if (RX.ansInline.test(l)) { S.answerLines++; l = l.replace(RX.ansInline, '').trim(); if (!l) continue; }
      let m;
      if ((m = l.match(RX.sol)) && !inSolSection) { solMode = true; if (m[2]) addTo(m[2], true); continue; }
      if (!S.opts.length && (m = l.match(RX.part)) && m[1] === String.fromCharCode(97 + S.parts.length)) {
        solMode = !!inSolSection; target = 'part'; S.parts.push({ lines: [m[2]], sol: [] }); continue;
      }
      if (!S.parts.length && (m = l.match(RX.optU)) && m[1] === String.fromCharCode(65 + S.opts.length) && !inSolSection) { target = 'opt'; S.opts.push({ t: m[2], ok: false }); continue; }
      if (!S.parts.length && !inSolSection && (m = l.match(RX.box)) && (m[2] || '').trim()) {
        const isTf = /^(wahr|richtig|falsch)\b/i.test(m[2]);
        if (!isTf) { target = 'opt'; S.opts.push({ t: m[2], ok: RX.checkedBox.test(l) }); continue; }
      }
      if (target === 'opt') { S.opts[S.opts.length - 1].t += ' ' + l; continue; }
      addTo(l, solMode && !inSolSection ? true : false);
      if (inSolSection) { /* in Lösungsabschnitten ist alles Lösung; addTo hat es in intro/parts.lines abgelegt */ }
    }
    return S;
  }

  function splitBlocks(lines) {
    const idx = [];
    lines.forEach((l, i) => { const m = clean(l).match(RX.head); if (m) idx.push({ i, num: m[1], rest: m[2] || '' }); });
    let mode = 'head';
    if (!idx.length) {
      let exp = 1; lines.forEach((l, i) => { const m = clean(l).match(RX.numd); if (m && +m[1] === exp) { idx.push({ i, num: String(exp), rest: m[2] }); exp++; } });
      mode = 'num'; if (idx.length < 2) idx.length = 0;
    }
    const pre = idx.length ? lines.slice(0, idx[0].i) : [];
    const blocks = idx.map((h, k) => ({ num: h.num, rest: h.rest, body: lines.slice(h.i + 1, k + 1 < idx.length ? idx[k + 1].i : lines.length) }));
    return { blocks, pre, mode };
  }

  async function imgToDataUrl(img) {
    if (!img || !/^image\/(png|jpeg|gif|webp)$/.test(img.mime)) return '';
    const bytes = await img.get(); const blob = new Blob([bytes], { type: img.mime });
    const url = URL.createObjectURL(blob);
    try {
      const el = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1000 / Math.max(el.width, el.height));
      const c = document.createElement('canvas'); c.width = Math.round(el.width * k); c.height = Math.round(el.height * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(el, 0, 0, c.width, c.height);
      return img.mime === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
    } catch (e) { return ''; } finally { URL.revokeObjectURL(url); }
  }

  const joinText = arr => arr.map(x => x.trim()).filter(Boolean).join('\n');

  async function buildQuestion(b, ctx) {
    const hints = [];
    let head = clean(b.rest || '');
    const gp = grabPoints(head, true); head = gp.text.replace(/^[\s:–—-]+|[\s:–—-]+$/g, ''); let headPts = gp.pts;
    let title = '';
    const SENTENCE = /^(berechne|bestimme|zeige|zeigen|gib|nenne|erkläre|beschreibe|zeichne|skizziere|ermittle|untersuche|begründe|vergleiche|erläutere|löse|ergänze|kreuze|ordne|finde|prüfe|beurteile|bewerte|stelle|erstelle|schreibe|entwickle|gegeben|betrachte|ein|eine|einer|der|die|das|im|in|bei|wenn|für|gib|lies|konstruiere|beweise|simuliere|implementiere|programmiere)\b/i;
    if (head) { if (!/\u0007/.test(head) && head.length <= 70 && !/[.?!:]$/.test(head) && !SENTENCE.test(head)) title = head; else b = { ...b, body: [head, ...b.body] }; }
    const S = scan(b.body, false);
    const sub = ctx.sol[b.num];
    let q = {
      type: 'frei', subject: ctx.opts.subject && ctx.opts.subject !== 'auto' ? ctx.opts.subject : '', grade: ctx.opts.grade || ctx.grade || '',
      topic: ctx.opts.topic || (ctx.opts.titleTopic && title ? title : ''), tags: [], text: '', points: 0, afb: 1, solution: '', lines: 0,
      options: [], wahr: true, parts: [], image: '', imgw: 60
    };
    if (S.opts.length >= 2 && !S.parts.length && !/(kreuz|wähl|auswahl|richtig|antwort|multiple)/i.test(joinText(S.intro)) && S.opts.some(o => grabPoints(o.t).pts !== null || o.t.length > 100)) {
      S.parts = S.opts.map(o => ({ lines: [o.t], sol: [] })); S.opts = [];
    }
    const intro = joinText(S.intro);
    const allText = [intro, ...S.parts.map(p => p.lines.join(' ')), ...S.opts.map(o => o.t)].join(' ');

    // Typ bestimmen
    let mcFromParts = false;
    if (S.parts.length >= 2 && /(ankreuz|kreuze|wähle|auswahl|richtige antwort|multiple)/i.test(intro) && S.parts.every(p => p.lines.join(' ').length < 90) && S.parts.every(p => grabPoints(p.lines.join(' ')).pts === null)) mcFromParts = true;
    if (S.opts.length >= 2 && !S.parts.length) q.type = 'mc';
    else if (mcFromParts) { q.type = 'mc'; S.opts = S.parts.map(p => ({ t: p.lines.join(' '), ok: false })); S.parts = []; hints.push('Als Multiple Choice erkannt – bitte die richtige(n) Antwort(en) markieren.'); }
    else if (S.parts.length >= 2) q.type = 'teil';
    else if (!S.parts.length && /\b(wahr|richtig)\b.{0,12}\bfalsch\b/i.test(allText) && /[☐☒☑□■◻◯○]|\[\s?\]/.test(b.body.join(' '))) q.type = 'wf';
    else if (!S.parts.length && (intro.match(RX.gap) || []).length) q.type = 'luecke';
    if (S.parts.length === 1) { S.intro.push('a) ' + S.parts[0].lines.join(' ')); S.parts = []; }

    // Text
    let text = joinText(S.intro.length ? S.intro : []);
    if (q.type === 'wf') {
      text = clean(text.replace(/[☐☒☑□■◻◯○]\s*(wahr|richtig)\b|[☐☒☑□■◻◯○]\s*falsch\b|\[\s?[xX]?\s?\]\s*(wahr|richtig|falsch)\b/gi, '').replace(/\s*(wahr|richtig)\s*[\/|]?\s*falsch\s*$/i, ''));
    }
    // Punkte
    const solText = () => {
      const base = [...S.sol]; if (sub) base.push(...sub.intro, ...sub.sol);
      return joinText(base);
    };
    if (q.type === 'teil') {
      let sum = 0, any = false, je = false;
      q.parts = S.parts.map((p, i) => {
        let t = clean(p.lines.join(' ')); const g = grabPoints(t); const pts = g.pts; if (g.je) je = true;
        if (pts !== null) { t = g.text; any = true; sum += pts; }
        let ps = joinText(p.sol); const sp = sub && sub.parts[i]; if (sp) ps = joinText([ps, ...sp.lines]);
        return { text: t.trim(), points: pts ?? 0, afb: guessAfb(t), solution: ps };
      });
      // Lösung „x … ; b) y …“ steckt komplett in Teil a): auf b), c) … verteilen
      q.parts.forEach((p, i) => {
        if (!p.solution) return;
        const mk = [...p.solution.matchAll(/(?:^|[\s;,.])([b-h])\)\s+/g)].filter(m => m[1].charCodeAt(0) - 97 > i && q.parts[m[1].charCodeAt(0) - 97] && !q.parts[m[1].charCodeAt(0) - 97].solution);
        if (!mk.length) return;
        const full = p.solution;
        p.solution = full.slice(0, mk[0].index).replace(/[;\s]+$/, '').trim();
        mk.forEach((m, k) => { const end = k + 1 < mk.length ? mk[k + 1].index : full.length; q.parts[m[1].charCodeAt(0) - 97].solution = full.slice(m.index + m[0].length, end).replace(/[;\s]+$/, '').trim(); });
      });
      const ig = grabPoints(text.replace(/\n/g, ' ')); if (ig.pts !== null && headPts === null) { headPts = ig.pts; text = ig.text; }
      if (!any && headPts) { const each = Math.round(headPts / q.parts.length * 2) / 2; q.parts.forEach(p => p.points = each); sum = each * q.parts.length; hints.push(`Teilpunkte gleichmäßig aus ${headPts} BE verteilt – bitte prüfen.`); }
      else if (!any) hints.push('Punkte der Teilaufgaben nicht erkannt.');
      else if (headPts !== null && Math.abs(sum - headPts) > 0.01) hints.push(`Teilpunkte (${sum}) und Gesamtpunkte (${headPts}) passen nicht zusammen.`);
      if (je) hints.push('„je … P“ im Text – Punkte pro Teilaufgabe bitte prüfen.');
      q.points = sum; q.afb = Math.max(...q.parts.map(p => p.afb), guessAfb(text));
      q.lines = S.answerLines ? Math.min(6, Math.max(1, Math.round(S.answerLines / S.parts.length))) : 0;
      const gs = solText();
      if (gs) {
        // „a) … b) …“ in einer gemeinsamen Lösung auf die Teilaufgaben verteilen
        const mk = [...gs.matchAll(/(?:^|[\s;])([a-h])\)\s*/g)];
        if (mk.length >= 2 && mk[0][1] === 'a' && !q.parts.some(p => p.solution)) {
          mk.forEach((m, k) => { const i = m[1].charCodeAt(0) - 97; const end = k + 1 < mk.length ? mk[k + 1].index : gs.length; if (q.parts[i]) q.parts[i].solution = gs.slice(m.index + m[0].length, end).replace(/[;\s]+$/, '').trim(); });
        } else q.solution = gs;
      }
    } else {
      const g = grabPoints(text.replace(/\n/g, ' ')); let pts = g.pts;
      if (pts !== null) { text = clean(grabPoints(text).text); }
      if (pts === null && S.opts.length && q.type === 'mc') { const last = S.opts[S.opts.length - 1]; const og = grabPoints(last.t); if (og.pts !== null) { pts = og.pts; last.t = og.text; } }
      if (pts === null) pts = headPts;
      if (pts === null) { pts = 0; hints.push('Punkte nicht erkannt.'); }
      q.points = pts; q.afb = guessAfb(text); q.lines = Math.min(12, S.answerLines);
      let sol = solText();
      if (q.type === 'mc') {
        q.options = S.opts.map(o => ({ t: o.t, ok: !!o.ok }));
        if (!q.options.some(o => o.ok)) {
          const m = sol.match(/\b([A-F])\b/g); if (m && m.length) { m.forEach(L => { const o = q.options[L.charCodeAt(0) - 65]; if (o) o.ok = true; }); }
          else hints.push('Keine richtige Antwort erkannt – bitte markieren.');
        }
        if (q.options.some(o => o.ok) && /^[A-F](?:\s*[,;/und&]+\s*[A-F])*\.?$/i.test(sol.trim())) sol = '';
      } else if (q.type === 'wf') {
        const m = sol.match(/\b(falsch|wahr|richtig)\b/i);
        if (m) q.wahr = !/falsch/i.test(m[1]); else hints.push('Richtige Antwort (wahr/falsch) nicht erkannt – bitte prüfen.');
      } else if (q.type === 'luecke') {
        const n = (text.match(RX.gap) || []).length;
        const ans = sol.split(/\s*[;\n]\s*|\s*,\s+/).map(x => x.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
        let i = 0;
        text = text.replace(RX.gap, () => (ans.length === n && ans[i] ? '[[' + ans[i++] + ']]' : '[[ ]]'));
        if (ans.length === n) sol = ''; else if (!sol) hints.push('Lücken ohne Lösungswörter – bitte ergänzen.');
      }
      q.solution = sol;
    }
    q.text = (title ? '**' + title + '**\n' : '') + text;
    if (!q.text.trim() && q.type !== 'teil') hints.push('Aufgabentext leer – bitte prüfen.');

    // Bild
    q.images = [];
    const allStr = [q.text, q.solution, ...(q.options || []).map(o => o.t), ...q.parts.flatMap(p => [p.text, p.solution])].join('\n');
    const used = [...new Set([...allStr.matchAll(/\{img:(\d+)\}/g)].map(m => +m[1]))];
    let nInl = 0;
    for (const ix of used) {
      const im = ctx.images[ix], src = await imgToDataUrl(im);
      if (!src) { hints.push('Ein Bild konnte nicht übernommen werden (Format).'); continue; }
      if (im.inline) { q.images.push({ src, w: 60, id: String(ix), inline: true, hcm: im.hcm || 0.6 }); nInl++; }
      else q.images.push({ src, w: im.wpct || 60, id: String(ix), placed: true });
    }
    if (nInl) hints.push('Formeln aus dem PDF wurden als Bildausschnitt übernommen (nicht als Text) – bitte prüfen.');
    // Fach
    if (!q.subject) {
      const gs = guessSubject([title, q.text, ...q.parts.map(p => p.text)].join(' '), ctx.docSubject || 'Mathematik');
      q.subject = gs.subject; if (!gs.sure) hints.push('Fach geschätzt – bitte prüfen.');
    }
    hints.push('AFB nach Operatoren geschätzt.');
    return { q, hints };
  }

  // Hauptfunktion: Zeilen eines Dokuments → Aufgaben
  async function split(doc, opts) {
    CUR = { images: doc.images || [] };
    const globalHints = [];
    if (doc.images && doc.images.failed) globalHints.push('Bilder und Formeln konnten in diesem Browser nicht aus dem PDF gelesen werden, übernommen wurde nur der Text.');
    let lines = doc.lines.map(l => String(l).replace(/\s+$/, ''));
    // Lösungsabschnitt am Ende (z. B. „Lösungen“ gefolgt von „Aufgabe 1 …“)
    let solLines = [];
    const heads = lines.map(l => { const m = clean(l).match(RX.head); return m ? m[1] : null; });
    for (let i = 1; i < lines.length; i++) {
      if (RX.solHead.test(clean(lines[i]))) {
        const before = new Set(heads.slice(0, i).filter(Boolean)), after = heads.slice(i + 1).filter(Boolean);
        if (before.size && after.some(h => before.has(h))) { solLines = lines.slice(i + 1); lines = lines.slice(0, i); break; }
      }
    }
    const main = splitBlocks(lines);
    let blocks = main.blocks;
    if (!blocks.length) {
      blocks = [{ num: '1', rest: '', body: lines }];
      globalHints.push('Keine Aufgabenüberschriften („Aufgabe 1“, „1.“ …) gefunden – der gesamte Text ist eine einzige Aufgabe. Besser: Dokument mit Überschriften verwenden oder den KI-Weg nutzen.');
    }
    const sol = {};
    if (solLines.length) { const sb = splitBlocks(solLines).blocks; sb.forEach(b => { const s = scan([b.rest, ...b.body].filter(Boolean), true); if (!sol[b.num]) sol[b.num] = s; }); }
    // Klassenstufe aus dem Kopf
    let grade = '';
    const preText = main.pre.slice(0, 20).join(' ');
    let m = preText.match(/(?:Klasse|Klassenstufe|Jgst\.?|Jahrgangsstufe|Jahrgang)\s*(\d{1,2}|E|Q1|Q2)\b/i) || preText.match(/\b(\d{1,2})\s?[a-f]\b/);
    if (m) { const g = m[1].toUpperCase(); if (['5', '6', '7', '8', '9', '10', 'E', 'Q1', 'Q2'].includes(g)) grade = g; }
    const docSubject = guessSubject(lines.join(' '), 'Mathematik').subject;
    const ctx = { opts, sol, images: doc.images, grade, docSubject };
    const items = [];
    for (const b of blocks) {
      const r = await buildQuestion(b, ctx);
      r.num = b.num; items.push(r);
    }
    Object.keys(sol).forEach(n => { if (!blocks.some(b => b.num === n)) globalHints.push(`Lösung zu Aufgabe ${n} gefunden, aber keine passende Aufgabe.`); });
    if (solLines.length) globalHints.push('Lösungsabschnitt am Ende erkannt und den Aufgaben zugeordnet.');
    return { items, hints: globalHints, grade };
  }

  async function process(file, opts) {
    const buf = await file.arrayBuffer(), ext = (file.name.split('.').pop() || '').toLowerCase();
    let doc;
    if (ext === 'docx') doc = await readDocx(buf);
    else if (ext === 'odt') doc = await readOdt(buf);
    else if (ext === 'pdf') doc = await readPdf(buf);
    else if (ext === 'txt' || ext === 'md') doc = await readText(buf);
    else throw new Error('Dateityp .' + ext + ' wird nicht unterstützt (PDF, DOCX, ODT, TXT).');
    if (!doc.lines.some(l => String(l).trim())) throw new Error('Kein Text gefunden. Bei eingescannten PDFs gibt es keine Textebene; hier hilft nur der KI-Weg.');
    const r = await split(doc, opts);
    r.lineCount = doc.lines.length;
    return r;
  }

  return { process, split, readDocx, readOdt, readPdf, readText, mathmlToTex, ommlToTex, grabPoints, guessAfb };
})();
