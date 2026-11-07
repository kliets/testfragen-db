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
  const fontStyle = e => `font-family:${fontOf(e).css};font-size:${fsizeOf(e)}pt`;
  const imgs = q => (q && Array.isArray(q.images) && q.images.length) ? q.images.filter(i => i && i.src) : (q && q.image ? [{ src: q.image, w: +q.imgw || 60 }] : []);

  function tex(t, display) {
    try { return katex.renderToString(t, { displayMode: display, throwOnError: false }); }
    catch (e) { return esc(t); }
  }

  /* Mini-Markdown: **fett**, *kursiv*, `code`, ```Codeblock```, $Formel$, $$Formel$$, [[Lücke]] */
  function md(src, o = {}) {
    const stash = [];
    const put = h => { stash.push(h); return '\u0001' + (stash.length - 1) + '\u0002'; };
    let s = String(src ?? '');
    s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, l, c) => put('<pre class="code"><code>' + esc(c.replace(/\n$/, '')) + '</code></pre>'));
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, t) => put(tex(t, true)));
    s = s.replace(/\$([^$\n]+?)\$/g, (m, t) => put(tex(t, false)));
    s = s.replace(/\{img:([\w-]+)\}/g, (m, id) => { const i = o.imgs && o.imgs[id]; return !i ? '' : put(i.inline ? `<img class="inl" alt="" src="${esc(i.src)}" style="height:${+i.hcm || 0.6}cm">` : `<div class="fig"><img class="q-img" alt="" src="${esc(i.src)}" style="width:${+i.w || 60}%"></div>`); });
    s = s.replace(/\[\[(.+?)\]\]/g, (m, a) => put(o.gaps === 'fill' ? `<span class="gap fill">${esc(a)}</span>` : '<span class="gap"></span>'));
    s = s.replace(/`([^`\n]+)`/g, (m, c) => put('<code>' + esc(c) + '</code>'));
    s = s.replace(/(^|\n)- /g, '$1\u2022 ');
    s = esc(s);
    s = s.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    s = s.replace(/\n/g, '<br>');
    return s.replace(/\u0001(\d+)\u0002/g, (m, i) => stash[i]);
  }

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

  const pts = n => `<span class="q-pts">${fmt(n)} BE</span>`;
  const lines = n => n > 0 ? `<div class="lines" style="height:${(n * 0.8).toFixed(1)}cm"></div>` : '';
  const sol = (t, label, im) => t && String(t).trim() ? `<div class="sol"><b>${label || 'Lösung'}:</b> ${md(t, { gaps: 'fill', imgs: im })}</div>` : '';

  const imgHtml = q => imgs(q).filter(i => !i.inline && !i.placed).map(i => `<img class="q-img" alt="" src="${esc(i.src)}" style="width:${+i.w || 60}%">`).join('');

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
        `<li><div class="part-text"><div class="part-main">${md(p.text, { gaps, imgs: IMG })}</div>${pts(num(p.points))}</div>${S ? sol(p.solution, '', IMG) : lines(Math.max(0, +q.lines || 0))}</li>`).join('') + '</ol>';
    } else if (q.type === 'frei') {
      body = S ? '' : lines(+q.lines || 0);
    }
    const img = imgHtml(q);
    const solution = S && q.type !== 'teil' ? sol(q.solution, '', IMG) : (S && q.type === 'teil' ? sol(q.solution, 'Hinweis', IMG) : '');
    return `<section class="q"><div class="q-head"><span class="q-num">Aufgabe ${n}</span>${pts(qPoints(q))}</div>
      <div class="q-text">${md(q.text, { gaps, imgs: IMG })}</div>${img}${body}${solution}</section>`;
  }

  function header(exam) {
    const meta = [exam.subject, gradeLabel(exam.grade), exam.date ? new Date(exam.date + 'T12:00').toLocaleDateString('de-DE') : '', exam.duration ? exam.duration + ' Minuten' : ''].filter(Boolean).join(' · ');
    const total = (exam.items || []).reduce((a, q) => a + qPoints(q), 0);
    return `<header class="p-head">
      ${exam.school ? `<div class="p-school">${esc(exam.school)}</div>` : ''}
      <h1>${esc(exam.title || 'Ohne Titel')}</h1>
      ${meta ? `<div class="p-meta">${esc(meta)}</div>` : ''}
      <div class="p-name"><span>Name:</span><span>Klasse:</span><span>Datum:</span></div>
      ${exam.hints ? `<div class="p-hints">${md(exam.hints)}</div>` : ''}
      <div class="p-total">Gesamtpunktzahl: <b>${fmt(total)} BE</b></div>
    </header>`;
  }

  function paper(exam, o = {}) {
    const items = exam.items || [];
    let cnt = 0;
    const inner = items.map((q, i) => {
      const html = renderQ(q, q.type === 'block' ? 0 : ++cnt, { solutions: o.solutions });
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
    return header(exam) + `<div id="paper-items" class="p-items">${inner}${empty}</div>`;
  }

  return { SUBJECTS, GRADES, TYPES, AFB, AFB_SOLL, esc, num, fmt, md, tex, gradeLabel, qPoints, qAfbPoints, afbStats, newQuestion, newBlock, renderQ, paper, header, FONTS, fontOf, fsizeOf, fontStyle, imgs };
})();
