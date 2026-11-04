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
      <link rel="stylesheet" href="${abs('vendor/katex.min.css')}"><link rel="stylesheet" href="${abs('css/paper.css')}"></head>
      <body><div class="paper" style="${R.fontStyle(exam)}">${R.paper(exam, { solutions })}</div></body></html>`);
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

  function build(exam, solutions, opts = {}) {
    const objs = [];       // MathML-Objekte
    const pics = [];       // Bilder {name, bytes, w, h}
    const frames = [];     // noch aufzulösende Bilder

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

    // Inline-Markup → ODF-Spans (gleiche Syntax wie R.md)
    const inline = (src, gaps) => {
      const re = /```(\w*)\n?([\s\S]*?)```|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\[\[(.+?)\]\]|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|__([^_\n]+)__/g;
      let out = '', last = 0, m; src = String(src ?? '').replace(/(^|\n)- /g, '$1\u2022 ');
      const txt = s => s.split('\n').map(plain).join('<text:line-break/>');
      while ((m = re.exec(src))) {
        out += txt(src.slice(last, m.index)); last = re.lastIndex;
        if (m[2] !== undefined) out += '<text:line-break/><text:span text:style-name="Tcode">' + m[2].replace(/\n$/, '').split('\n').map(plain).join('<text:line-break/>') + '</text:span><text:line-break/>';
        else if (m[3] !== undefined) out += '<text:line-break/>' + formula(m[3], true) + '<text:line-break/>';
        else if (m[4] !== undefined) out += formula(m[4], false);
        else if (m[5] !== undefined) out += gaps === 'fill' ? `<text:span text:style-name="Tfill">${plain(m[5])}</text:span>` : '<text:span text:style-name="Tgap">' + ' '.repeat(16) + '</text:span>';
        else if (m[6] !== undefined) out += '<text:span text:style-name="Tcode">' + plain(m[6]) + '</text:span>';
        else if (m[7] !== undefined) out += '<text:span text:style-name="Tb">' + plain(m[7]) + '</text:span>';
        else if (m[8] !== undefined) out += '<text:span text:style-name="Ti">' + plain(m[8]) + '</text:span>';
        else if (m[9] !== undefined) out += '<text:span text:style-name="Tu">' + plain(m[9]) + '</text:span>';
      }
      return out + txt(src.slice(last));
    };

    const P = (style, inner) => `<text:p text:style-name="${style}">${inner}</text:p>`;
    const be = n => R.fmt(n) + ' BE';
    const body = [];
    const gaps = solutions ? 'fill' : 'blank';

    // Kopf
    if (exam.school) body.push(P('Pschool', plain(exam.school)));
    body.push(P('Ptitle', plain(exam.title || 'Ohne Titel')));
    const meta = [exam.subject, R.gradeLabel(exam.grade), exam.date ? new Date(exam.date + 'T12:00').toLocaleDateString('de-DE') : '', exam.duration ? exam.duration + ' Minuten' : ''].filter(Boolean).join(' · ');
    if (meta) body.push(P('Pmeta', plain(meta)));
    body.push(P('Pname', 'Name: ' + '_'.repeat(28) + ' &#160; Klasse: ' + '_'.repeat(10) + ' &#160; Datum: ' + '_'.repeat(12)));
    if (exam.hints) body.push(P('Phint', inline(exam.hints)));
    const total = (exam.items || []).reduce((a, q) => a + R.qPoints(q), 0);
    body.push(P('Ptotal', 'Gesamtpunktzahl: <text:span text:style-name="Tb">' + be(total) + '</text:span>'));

    const imgPara = (q) => {
      R.imgs(q).forEach(im => {
        const id = 'IMG' + frames.length; frames.push({ id, src: im.src, w: im.w });
        body.push(P('Pimg', '@@' + id + '@@'));
      });
    };

    let cnt = 0;
    (exam.items || []).forEach((q) => {
      if (q.type === 'block') {
        if (q.text && q.text.trim()) body.push(P(q.style === 'heading' ? 'Ptask' : q.style === 'box' ? 'Phint' : 'Pbody', inline(q.text, gaps)));
        imgPara(q); return;
      }
      body.push(P('Ptask', `Aufgabe ${++cnt} <text:span text:style-name="Tpts">(${be(R.qPoints(q))})</text:span>`));
      if (q.text && q.text.trim()) body.push(P('Pbody', inline(q.text, gaps)));
      imgPara(q);
      if (q.type === 'mc') {
        (q.options || []).forEach((o, k) => body.push(P('Plist', (solutions && o.ok ? '☒' : '☐') + ' ' + String.fromCharCode(65 + k) + ') ' + inline(o.t))));
      } else if (q.type === 'wf') {
        body.push(P('Plist', (solutions && q.wahr ? '☒' : '☐') + ' wahr &#160;&#160;&#160; ' + (solutions && !q.wahr ? '☒' : '☐') + ' falsch'));
      } else if (q.type === 'teil') {
        (q.parts || []).forEach((p, k) => {
          body.push(P('Ppart', `<text:span text:style-name="Tb">${String.fromCharCode(97 + k)})</text:span> ` + inline(p.text, gaps) + ` <text:span text:style-name="Tpts">(${be(R.num(p.points))})</text:span>`));
          if (solutions) { if (p.solution && p.solution.trim()) body.push(P('Psol', '<text:span text:style-name="Tb">Lösung:</text:span> ' + inline(p.solution, 'fill'))); }
          else for (let l = 0; l < (+q.lines || 0); l++) body.push('<text:p text:style-name="Pline"/>');
        });
      }
      if (q.type === 'frei' && !solutions) for (let l = 0; l < (+q.lines || 0); l++) body.push('<text:p text:style-name="Pline"/>');
      if (solutions && q.type !== 'teil' && q.solution && q.solution.trim()) body.push(P('Psol', '<text:span text:style-name="Tb">Lösung:</text:span> ' + inline(q.solution, 'fill')));
    });

    return { body, objs, frames };
  }

  const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const dataToBytes = url => { const b = atob(url.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

  async function odt(exam, solutions, opts = {}) {
    const { body, objs, frames } = build(exam, solutions, opts);
    const fnt = R.fontOf(exam);
    const zip = new JSZip();
    const pics = [];
    let xml = body.join('\n');

    for (const f of frames) {
      const img = await loadImg(f.src);
      const ext = /^data:image\/png/.test(f.src) ? 'png' : 'jpg';
      let repl = '';
      if (img) {
        const w = 17 * ((+f.w || 60) / 100), h = w * img.height / img.width;
        const name = `Pictures/${f.id}.${ext}`;
        pics.push({ name, ext, bytes: dataToBytes(f.src) });
        repl = `<draw:frame draw:style-name="fr2" draw:name="${f.id}" text:anchor-type="as-char" svg:width="${w.toFixed(2)}cm" svg:height="${h.toFixed(2)}cm"><draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
      }
      xml = xml.replace(`@@${f.id}@@`, repl);
    }

    const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.2">
<office:font-face-decls>
 <style:font-face style:name="${X(fnt.odt)}" svg:font-family="'${X(fnt.odt)}'" style:font-family-generic="${fnt.gen}"/>
 <style:font-face style:name="Liberation Mono" svg:font-family="'Liberation Mono'" style:font-family-generic="modern"/>
</office:font-face-decls>
<office:automatic-styles>
 <style:style style:name="Pschool" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.1cm"/><style:text-properties fo:font-size="9.5pt" fo:color="#444444"/></style:style>
 <style:style style:name="Ptitle" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.1cm"/><style:text-properties fo:font-size="18pt" fo:font-weight="bold"/></style:style>
 <style:style style:name="Pmeta" style:family="paragraph"><style:text-properties fo:font-size="10pt" fo:color="#333333"/></style:style>
 <style:style style:name="Pname" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.4cm"/><style:text-properties fo:font-size="10pt"/></style:style>
 <style:style style:name="Phint" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.3cm" fo:padding-left="0.3cm" fo:border-left="1.5pt solid #999999"/><style:text-properties fo:font-size="10pt"/></style:style>
 <style:style style:name="Ptotal" style:family="paragraph"><style:paragraph-properties fo:text-align="end" fo:margin-bottom="0.4cm" fo:padding-bottom="0.15cm" fo:border-bottom="1.5pt solid #000000"/><style:text-properties fo:font-size="10pt"/></style:style>
 <style:style style:name="Ptask" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.55cm" fo:margin-bottom="0.15cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="12pt" fo:font-weight="bold"/></style:style>
 <style:style style:name="Pbody" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.12cm"/></style:style>
 <style:style style:name="Plist" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.5cm" fo:margin-bottom="0.08cm"/></style:style>
 <style:style style:name="Ppart" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.8cm" fo:text-indent="-0.8cm" fo:margin-top="0.12cm" fo:margin-bottom="0.1cm"/></style:style>
 <style:style style:name="Pline" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.8cm" fo:margin-bottom="0cm" fo:padding-top="0.4cm" fo:border-bottom="0.5pt solid #aaaaaa"/></style:style>
 <style:style style:name="Pimg" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.1cm" fo:margin-bottom="0.15cm"/></style:style>
 <style:style style:name="Psol" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.8cm" fo:margin-bottom="0.15cm" fo:padding-left="0.2cm" fo:border-left="2pt solid #1a6b2a" fo:background-color="#eef7ee"/><style:text-properties fo:font-size="10pt" fo:color="#123c1a"/></style:style>
 <style:style style:name="Tb" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
 <style:style style:name="Ti" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
 <style:style style:name="Tpts" style:family="text"><style:text-properties fo:font-weight="normal" fo:font-size="10pt" fo:color="#333333"/></style:style>
 <style:style style:name="Tcode" style:family="text"><style:text-properties style:font-name="Liberation Mono" fo:font-size="9.5pt" fo:background-color="#f0f0f0"/></style:style>
 <style:style style:name="Tu" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
 <style:style style:name="Tgap" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
 <style:style style:name="Tfill" style:family="text"><style:text-properties fo:font-weight="bold" fo:color="#1a6b2a" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
 <style:style style:name="fr1" style:family="graphic"><style:graphic-properties style:vertical-pos="middle" style:vertical-rel="text" style:wrap="none" fo:padding="0cm" fo:border="none"/></style:style>
 <style:style style:name="fr2" style:family="graphic"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" style:wrap="none" fo:padding="0cm" fo:border="none"/></style:style>
</office:automatic-styles>
<office:body><office:text>
${xml}
</office:text></office:body></office:document-content>`;

    const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.2">
<office:font-face-decls><style:font-face style:name="${X(fnt.odt)}" svg:font-family="'${X(fnt.odt)}'" style:font-family-generic="${fnt.gen}"/></office:font-face-decls>
<office:styles>
 <style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="130%"/><style:text-properties style:font-name="${X(fnt.odt)}" fo:font-size="${R.fsizeOf(exam)}pt" fo:language="de" fo:country="DE"/></style:default-style>
 <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
</office:styles>
<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="1.8cm" fo:margin-bottom="1.8cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>
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
