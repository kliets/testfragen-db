/* Prüfungsbank – Oberfläche */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = R.esc;
  const cfg = window.PB_CONFIG || {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const AFBL = { 1: 'I – Reproduzieren', 2: 'II – Zusammenhänge herstellen', 3: 'III – Verallgemeinern, Reflektieren' };

  const S = {
    questions: [], exams: [],
    f: { subject: '', q: '', afb: '', topic: '', grade: '' },
    side: { subject: '', q: '' },
    exam: null, dirty: false, timer: null, solutions: false, mathText: false,
    imp: { items: [], log: [], sol: false, opts: { subject: 'auto', grade: '', topic: '', titleTopic: true } },
    user: localStorage.getItem('pb_user') || ''
  };

  /* ---------- Hilfen ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }
  const route = () => { const [a, b] = location.hash.replace(/^#\/?/, '').split('/'); return { name: a || 'aufgaben', id: b }; };
  const setPath = (o, path, val) => { const k = path.split('.'); let c = o; for (let i = 0; i < k.length - 1; i++) c = c[k[i]]; c[k[k.length - 1]] = val; };
  const topics = () => [...new Set(S.questions.map(q => (q.topic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const today = () => new Date().toISOString().slice(0, 10);
  const gradeOptions = cur => `<option value="">Klassenstufe …</option>` + R.GRADES.map(g => `<option value="${g}" ${cur === g ? 'selected' : ''}>${esc(R.gradeLabel(g))}</option>`).join('');

  async function load() {
    try {
      [S.questions, S.exams] = await Promise.all([Store.list('questions'), Store.list('exams')]);
    } catch (e) {
      if (e.message === 'auth') return go();
      toast('Laden fehlgeschlagen: ' + e.message);
    }
  }

  async function saveWithConflict(table, obj) {
    try { return await Store.save(table, obj); }
    catch (e) {
      if (!e.conflict) throw e;
      if (confirm('Dieser Eintrag wurde inzwischen von jemand anderem geändert.\n\nOK = meine Version speichern (überschreibt die andere)\nAbbrechen = nicht speichern')) return Store.save(table, obj, { force: true });
      throw new Error('Nicht gespeichert (Konflikt).');
    }
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function normalizeQ(raw, defSubject) {
    const q = Object.assign(R.newQuestion(defSubject), raw || {});
    if (!R.SUBJECTS.includes(q.subject)) q.subject = defSubject || 'Mathematik';
    if (!R.TYPES[q.type]) q.type = Array.isArray(raw && raw.parts) && raw.parts.length ? 'teil' : 'frei';
    q.text = String(q.text || '');
    q.tags = Array.isArray(q.tags) ? q.tags.map(String) : [];
    q.points = R.num(q.points); q.afb = [1, 2, 3].includes(+q.afb) ? +q.afb : 1;
    if (!Array.isArray(q.options)) q.options = [];
    q.options = q.options.map(o => ({ t: String(o.t ?? o.text ?? ''), ok: !!(o.ok ?? o.correct) }));
    if (!Array.isArray(q.parts)) q.parts = [];
    q.parts = q.parts.map(p => ({ text: String(p.text || ''), points: R.num(p.points), afb: [1, 2, 3].includes(+p.afb) ? +p.afb : q.afb, solution: String(p.solution || '') }));
    q.grade = String(q.grade || '');
    q.images = R.imgs(q).map(i => Object.assign({ src: String(i.src), w: R.num(i.w) || 60 }, i.id ? { id: String(i.id) } : {}, i.inline ? { inline: true, hcm: R.num(i.hcm) || 0.6 } : {}, i.placed ? { placed: true } : {})); q.image = ''; q.imgw = 60;
    delete q.id; delete q._u;
    return q;
  }

  /* ---------- Rahmen ---------- */
  function shell(active, inner) {
    const nav = (id, label) => `<a href="#/${id}" class="${active === id ? 'on' : ''}">${label}</a>`;
    $('#app').innerHTML = `<div class="shell">
      <aside class="side">
        <div class="brand"><i>✓</i>Prüfungsbank</div>
        <nav class="nav">${nav('aufgaben', 'Aufgabenbank')}${nav('import', 'Dokument-Import')}${nav('pruefungen', 'Prüfungen')}${nav('info', 'Info &amp; Einstellungen')}</nav>
        <div class="foot">
          <span class="badge-mode ${Store.mode}">${Store.cloud ? 'Gemeinsam (Cloud)' : 'Lokal – nur dieser Browser'}</span>
          <span>${S.user ? 'Angemeldet als ' + esc(S.user) : '<a href="#/info">Namen eintragen</a>'}</span>
          ${Store.cloud ? '<a href="#" data-a="logout">Abmelden</a>' : ''}
        </div>
      </aside>
      <main class="main">${inner}</main></div>`;
  }

  function loginView() {
    $('#app').innerHTML = `<div class="center"><form class="login" id="loginform">
      <h1>Prüfungsbank</h1><p style="margin:0;color:var(--muted)">Gemeinsamer Zugang für Lehrkräfte</p>
      <label class="f">Passwort<input type="password" id="pw" autocomplete="current-password" autofocus></label>
      <div class="err" id="loginerr"></div><button class="btn primary">Anmelden</button></form></div>`;
    $('#loginform').onsubmit = async e => {
      e.preventDefault();
      try { await Store.login($('#pw').value); await load(); go(); }
      catch (err) { $('#loginerr').textContent = err.message; }
    };
  }

  async function go() {
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
    if (Store.needsLogin) return loginView();
    const r = route();
    if (r.name !== 'pruefung') { if (S.dirty) await saveExam(); S.exam = null; }
    if (r.name === 'pruefung') return examView(r.id);
    if (r.name === 'import') return importView();
    if (r.name === 'pruefungen') return examsView();
    if (r.name === 'info') return infoView();
    return bankView();
  }

  /* ---------- Aufgabenbank ---------- */
  function select(id, label, opts, cur) {
    return `<select id="${id}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }

  function bankView() {
    const chips = [['', 'Alle Fächer'], ...R.SUBJECTS.map(s => [s, s])]
      .map(([v, l]) => `<button class="chip ${S.f.subject === v ? 'on' : ''}" data-a="f-subject" data-v="${v}">${l}</button>`).join('');
    shell('aufgaben', `
      <div class="page-h"><h1>Aufgabenbank</h1><div class="actions">
        <a class="btn" href="#/import" style="text-decoration:none">Aus Dokument erstellen</a>
        <button class="btn" data-a="q-import">Importieren (JSON)</button>
        <button class="btn" data-a="q-export">Exportieren (JSON)</button>
        <button class="btn primary" data-a="q-new">+ Neue Aufgabe</button>
        <input type="file" id="importfile" accept=".json,application/json" hidden>
      </div></div>
      <div class="filters">${chips}
        <input type="text" id="f-q" placeholder="Suchen …" value="${esc(S.f.q)}">
        ${select('f-grade', 'Klassenstufe', R.GRADES.map(g => [g, R.gradeLabel(g)]), S.f.grade)}
        ${select('f-afb', 'Alle AFB', [[1, 'AFB I'], [2, 'AFB II'], [3, 'AFB III']], S.f.afb)}
        ${select('f-topic', 'Alle Themen', topics().map(t => [t, t]), S.f.topic)}
      </div><div id="qlist" class="cards"></div>`);
    renderList();
  }

  function matches(q, f) {
    if (f.subject && q.subject !== f.subject) return false;
    if (f.grade && q.grade !== f.grade) return false;
    if (f.topic && (q.topic || '').trim() !== f.topic) return false;
    if (f.afb && !R.qAfbPoints(q).some(x => x.afb === +f.afb)) return false;
    if (f.q) {
      const hay = [q.text, q.topic, (q.tags || []).join(' '), (q.parts || []).map(p => p.text).join(' '), (q.options || []).map(o => o.t).join(' ')].join(' ').toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  }

  function qCard(q, compact) {
    const afbs = [...new Set(R.qAfbPoints(q).map(x => x.afb).filter(Boolean))].sort();
    const tags = `<div class="tags"><span class="tag ${q.subject}">${esc(q.subject)}</span>
      ${q.grade ? `<span class="tag">${esc(R.gradeLabel(q.grade))}</span>` : ''}
      ${afbs.length ? `<span class="tag">AFB ${afbs.map(a => R.AFB[a]).join('/')}</span>` : ''}
      <span class="tag">${R.fmt(R.qPoints(q))} BE</span>${compact ? '' : `<span class="tag">${R.TYPES[q.type] || ''}</span>`}</div>`;
    const head = q.topic ? `<div class="meta"><b>${esc(q.topic)}</b></div>` : '';
    const snip = `<div class="snip">${R.md(q.text || '(kein Text)', { flat: true })}</div>`;
    if (compact) {
      return `<article class="card compact" draggable="true" data-qid="${q.id}">${tags}${head}${snip}
        <div class="btns"><button class="btn sm" data-a="s-add" data-id="${q.id}">+ In Prüfung</button></div></article>`;
    }
    return `<article class="card">${tags}${head}${snip}
      <div class="meta">${q.updatedBy ? esc(q.updatedBy) + ' · ' : ''}${q._u ? new Date(q._u).toLocaleDateString('de-DE') : ''}</div>
      <div class="btns"><button class="btn sm" data-a="q-edit" data-id="${q.id}">Bearbeiten</button>
      <button class="btn sm" data-a="q-dup" data-id="${q.id}">Duplizieren</button>
      <button class="btn sm danger" data-a="q-del" data-id="${q.id}">Löschen</button></div></article>`;
  }

  function renderList() {
    const el = $('#qlist'); if (!el) return;
    const list = S.questions.filter(q => matches(q, S.f));
    el.innerHTML = list.length ? list.map(q => qCard(q)).join('')
      : `<div class="empty" style="grid-column:1/-1">${S.questions.length ? 'Keine Aufgabe passt zu den Filtern.' : 'Noch keine Aufgaben. Lege mit „+ Neue Aufgabe“ die erste an oder importiere eine JSON-Datei.'}</div>`;
  }

  /* ---------- Aufgaben-Editor (Modal) ---------- */
  function openEditor(opts) {
    const d = clone(opts.q); d.tags = d.tags || [];
    d.images = R.imgs(d).map(i => Object.assign({}, i, { w: +i.w || 60 })); d.image = ''; d.imgw = 60;
    const isBlock = d.type === 'block';
    const root = $('#modal-root');
    const SYMS = ['°', '²', '³', '½', '±', '·', '×', '÷', '→', '⇒', '≤', '≥', '≠', '≈', '√', '∞', 'π', 'Δ', 'α', 'β', 'γ', 'λ', 'μ', 'ρ', 'σ', 'φ', 'θ', 'ω', 'Ω', '€'];
    const COL_BTNS = Object.entries(R.COLORS).map(([k, v]) => `<button type="button" data-m="color" data-v="${k}" title="${R.COLOR_LABEL[k]}" style="background:${v}"></button>`).join('');
    const MARK_BTNS = Object.entries(R.MARKS).map(([k, v]) => `<button type="button" data-m="mark" data-v="${k}" title="${R.MARK_LABEL[k]}" style="background:${v}"></button>`).join('');
    const IC = {
      list: '<svg viewBox="0 0 24 24"><circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none"/><path d="M9.5 6H21M9.5 12H21M9.5 18H21"/></svg>',
      nlist: '<svg viewBox="0 0 24 24"><path d="M10 6h11M10 12h11M10 18h11"/><text x="2" y="8" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">1</text><text x="2" y="14" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">2</text><text x="2" y="20" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">3</text></svg>',
      align: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
      table: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 10h18M3 15h18M9 4.5v15M15 4.5v15"/></svg>',
      box: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.8 6v12" stroke-width="4"/><path d="M10 10h8M10 14h5"/></svg>',
      hr: '<svg viewBox="0 0 24 24"><path d="M3 12h18" stroke-width="2.4"/></svg>',
      pb: '<svg viewBox="0 0 24 24"><path d="M6 3v6h12V3M6 21v-6h12v6"/><path d="M2 12h3M8 12h2.5M13.5 12h2.5M19 12h3" stroke-dasharray="0"/></svg>',
      gap: '<svg viewBox="0 0 24 24"><path d="M3 18h18" stroke-width="2.2"/><path d="M7 11h10" stroke-dasharray="2 2.5"/></svg>',
      mark: '<svg viewBox="0 0 24 24"><path d="M4 16l9-9 4 4-9 9H4z"/><path d="M13 7l2-2 4 4-2 2"/></svg>',
      caret: '<i class="car">▾</i>'
    };
    const tbBtn = (m, k, ico, tip, extra = '') => `<button type="button" class="tbi" data-m="${m}" data-k="${k}" title="${tip}" aria-label="${tip}"${extra}>${ico}</button>`;
    const tb = (gap = true) => `<div class="tbw"><div class="tb" role="toolbar" aria-label="Textformatierung">
      <span class="tbg">${tbBtn('fmt', 'b', '<b>F</b>', 'Fett (Strg/Cmd+B)')}${tbBtn('fmt', 'i', '<i>K</i>', 'Kursiv (Strg/Cmd+I)')}${tbBtn('fmt', 'u', '<u>U</u>', 'Unterstrichen (Strg/Cmd+U)')}${tbBtn('fmt', 'st', '<s>S</s>', 'Durchgestrichen')}${tbBtn('fmt', 'hoch', 'x<sup>2</sup>', 'Hochgestellt')}${tbBtn('fmt', 'tief', 'x<sub>2</sub>', 'Tiefgestellt')}</span>
      <span class="tbg">${tbBtn('pop', 'color', '<span class="ic-a"><b>A</b><i class="bar bar-c"></i></span>' + IC.caret, 'Schriftfarbe')}${tbBtn('pop', 'mark', '<span class="ic-a">' + IC.mark + '<i class="bar bar-m"></i></span>' + IC.caret, 'Textmarker (Hintergrundfarbe)')}${tbBtn('pop', 'size', '<span class="ic-sz"><small>A</small><big>A</big></span>' + IC.caret, 'Schriftgröße')}</span>
      <span class="tbg">${tbBtn('fmt', 'l', IC.list, 'Aufzählung')}${tbBtn('fmt', 'n', IC.nlist, 'Nummerierte Liste')}${tbBtn('pop', 'head', '<b class="ic-h">Aa</b>' + IC.caret, 'Überschrift / Absatzformat')}${tbBtn('pop', 'align', IC.align + IC.caret, 'Ausrichtung')}</span>
      <span class="tbg">${tbBtn('fmt', 'f', '<span class="ic-t">Σ</span>', 'Formel einfügen')}${gap ? tbBtn('fmt', 'g', IC.gap, 'Lücke im Text') : ''}${tbBtn('fmt', 'c', '<span class="ic-m">&lt;/&gt;</span>', 'Code')}${tbBtn('pop', 'table', IC.table + IC.caret, 'Tabelle einfügen / bearbeiten')}${tbBtn('pop', 'box', IC.box + IC.caret, 'Kasten (Merksatz, Definition, Beispiel …)')}</span>
      <span class="tbg">${tbBtn('fmt', 'hr', IC.hr, 'Trennlinie')}${tbBtn('fmt', 'pb', IC.pb, 'Seitenumbruch')}${tbBtn('pop', 'sym', '<span class="ic-t">Ω</span>' + IC.caret, 'Sonderzeichen')}</span>
    </div><div class="pop" hidden></div></div>`;
    const CHEAT = `<details class="cheat"><summary>Schreibweise &amp; Layout-Hilfe</summary><table>
      <tr><td>**fett**  *kursiv*  __unterstrichen__  ~~durchgestrichen~~</td><td>Textformat (oder Knöpfe / Strg+B, I, U)</td></tr>
      <tr><td>{c:rot|farbiger Text}  {c:#1f4fd8|…}</td><td>Schriftfarbe (rot, blau, grün, orange, lila, grau, braun oder #Hex)</td></tr>
      <tr><td>{bg:gelb|markiert}</td><td>Textmarker (gelb, grün, blau, rosa, orange, grau)</td></tr>
      <tr><td>{s:groß|…}  {s:klein|…}  {s:riesig|…}</td><td>Schriftgröße;  {s:hoch|2} / {s:tief|2} hoch-/tiefgestellt</td></tr>
      <tr><td># Überschrift\n## Unterüberschrift</td><td>Überschriften (bis ###)</td></tr>
      <tr><td>- Punkt\n  - Unterpunkt\n1. Erstens</td><td>Listen (Unterpunkte 2 Leerzeichen eingerückt)</td></tr>
      <tr><td>| Größe | Einheit |\n|---|:---:|\n| Länge | m |</td><td>Tabelle; Zeile mit --- macht die erste Zeile zur Kopfzeile, Doppelpunkte steuern die Ausrichtung (:--- links, :---: mitte, ---: rechts). Leere Zellen = Platz zum Ausfüllen</td></tr>
      <tr><td>:::merke Satz des Pythagoras\n$a^2+b^2=c^2$\n:::</td><td>Kasten: merke, definition, beispiel, achtung, tipp, info, rahmen. Titel optional (ein Minuszeichen statt Titel = ohne Titel)</td></tr>
      <tr><td>:::mitte\nZentrierter Text\n:::</td><td>Ausrichtung: mitte, rechts, links, blocksatz</td></tr>
      <tr><td>---    :::seite</td><td>Trennlinie / neue Seite</td></tr>
      <tr><td>$x^2$   $$\\frac{a}{b}$$   [[Lücke]]</td><td>Formel im Text / eigene Zeile / Lückentext</td></tr>
      <tr><td>Leerzeile = Absatzabstand, mehrere Leerzeilen = mehr Platz</td><td>Mit \\* oder \\{ kannst du Sonderzeichen wörtlich schreiben</td></tr>
    </table></details>`;

    const afbSel = (path, val) => `<select data-path="${path}" data-num>${[1, 2, 3].map(a => `<option value="${a}" ${+val === a ? 'selected' : ''}>${AFBL[a]}</option>`).join('')}</select>`;
    const hint = () => isBlock ? 'Für Material, Überschriften oder Hinweise zwischen den Aufgaben. Wird nicht nummeriert und zählt nicht zu den Punkten.' : ({
      luecke: 'Lücken im Text mit <code>[[Antwort]]</code> markieren – im Druck wird eine Linie daraus.',
      mc: 'Formeln: <code>$x^2$</code> inline, <code>$$\\frac{a}{b}$$</code> als eigene Zeile. Code: <code>`x = 1`</code>',
      wf: 'Der Aufgabentext ist die Aussage, die als wahr oder falsch bewertet wird.',
      teil: 'Gemeinsamer Einleitungstext; die Teilaufgaben a), b), … legst du darunter an.',
      frei: 'Formeln: <code>$x^2$</code> inline, <code>$$\\frac{a}{b}$$</code> als eigene Zeile. Farben, Tabellen und Kästen findest du in der Werkzeugleiste.'
    })[d.type];

    const ensure = () => {
      if (d.type === 'mc' && (!d.options || d.options.length < 2)) d.options = [{ t: '', ok: false }, { t: '', ok: false }];
      if (d.type === 'teil' && (!d.parts || !d.parts.length)) d.parts = [{ text: '', points: 2, afb: d.afb || 1, solution: '' }];
    };

    const answerHtml = suffix => { const k = R.answerKind(d); return `<div class="row"><label class="f">Antwortplatz ${suffix}<select data-path="answer">${Object.entries(R.ANSWERS).map(([v, t]) => `<option value="${v}" ${k === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${k === 'lines' ? `<label class="f">Zeilen <small>(0 = kein Platz)</small><input type="number" min="0" step="1" data-num data-path="lines" value="${d.lines || 0}"></label>` : `<label class="f">Höhe in cm<input type="number" min="2" max="24" step="1" data-num data-path="ah" value="${R.answerH(d)}"></label>`}</div>`; };
    const dynHtml = () => {
      let h = '';
      if (isBlock) return `<label class="f">Darstellung<select data-path="style">${[['text', 'Normaler Text'], ['heading', 'Überschrift (fett)'], ['box', 'Grauer Kasten (einfach)']].map(([k, v]) => `<option value="${k}" ${d.style === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
      if (d.type === 'teil') {
        h += answerHtml('je Teilaufgabe');
        h += d.parts.map((p, i) => `<div class="sub"><div class="row" style="align-items:center"><b>Teilaufgabe ${String.fromCharCode(97 + i)})</b>
          <button type="button" class="btn sm danger" data-m="part-del" data-i="${i}" ${d.parts.length < 2 ? 'disabled' : ''} style="justify-self:end">Entfernen</button></div>
          ${tb()}<textarea data-path="parts.${i}.text" placeholder="Aufgabentext der Teilaufgabe">${esc(p.text)}</textarea>
          <div class="row"><label class="f">Punkte<input type="number" min="0" step="0.5" data-num data-path="parts.${i}.points" value="${p.points}"></label>
          <label class="f">Anforderungsbereich${afbSel(`parts.${i}.afb`, p.afb)}</label></div>
          ${tb(false)}<textarea data-path="parts.${i}.solution" placeholder="Lösung / Erwartungshorizont">${esc(p.solution)}</textarea></div>`).join('');
        h += `<button type="button" class="btn" data-m="part-add">+ Teilaufgabe</button>`;
        return h;
      }
      h += `<div class="row"><label class="f">Punkte (BE)<input type="number" min="0" step="0.5" data-num data-path="points" value="${d.points}"></label>
        <label class="f">Anforderungsbereich${afbSel('afb', d.afb)}</label></div>`;
      if (d.type === 'mc') {
        h += `<div class="sub"><b>Antwortmöglichkeiten</b>${d.options.map((o, i) => `<div class="opt">
          <label style="display:flex;gap:5px;align-items:center;font-size:13px"><input type="checkbox" data-path="options.${i}.ok" ${o.ok ? 'checked' : ''}> richtig</label>
          <input type="text" data-path="options.${i}.t" value="${esc(o.t)}" placeholder="Antwort ${String.fromCharCode(65 + i)}">
          <button type="button" class="btn sm danger" data-m="opt-del" data-i="${i}" ${d.options.length < 2 ? 'disabled' : ''}>✕</button></div>`).join('')}
          <button type="button" class="btn sm" data-m="opt-add" style="justify-self:start">+ Antwort</button></div>`;
      }
      if (d.type === 'wf') {
        h += `<div class="sub"><b>Richtige Antwort</b><div class="row"><label><input type="radio" name="wahr" data-path="wahr" value="1" ${d.wahr ? 'checked' : ''}> wahr</label><label><input type="radio" name="wahr" data-path="wahr" value="0" ${!d.wahr ? 'checked' : ''}> falsch</label></div></div>`;
      }
      if (d.type === 'frei') {
        h += answerHtml('');
      }
      h += `<label class="f">${d.type === 'luecke' ? 'Hinweis zur Lösung (optional)' : 'Lösung / Erwartungshorizont'}${tb(false)}<textarea data-path="solution">${esc(d.solution)}</textarea></label>`;
      return h;
    };

    const imgHtml = () => `<div class="sub" id="imgbox"><b>Bilder / Skizzen (optional, beliebig viele)</b>
      ${d.images.map((im, i) => im.inline || im.placed ? `<div class="imgrow"><img src="${esc(im.src)}" alt="" style="max-height:40px">
        <div class="meta">${im.inline ? 'Formel/Grafik im Text (Bildausschnitt aus dem Import)' : 'Bild im Text'} – Platzhalter <code>{img:${esc(im.id)}}</code>: im Text an die gewünschte Stelle verschieben.</div>
        <div class="btns">${im.inline ? '' : `<select data-path="images.${i}.w" data-num title="Breite">${[...new Set([20, 30, 40, 50, 60, 80, 100, +im.w])].sort((a, b) => a - b).map(w => `<option value="${w}" ${+im.w === w ? 'selected' : ''}>${w} %</option>`).join('')}</select>`}<button type="button" class="btn sm danger" data-m="img-del" data-i="${i}">Entfernen</button></div></div>` : `<div class="imgrow"><img src="${esc(im.src)}" alt="">
        <div class="opts"><label class="f">Breite<select data-path="images.${i}.w" data-num>${[...new Set([20, 30, 40, 50, 60, 80, 100, +im.w])].sort((a, b) => a - b).map(w => `<option value="${w}" ${+im.w === w ? 'selected' : ''}>${w} %</option>`).join('')}</select></label>
        <label class="f">Ausrichtung<select data-path="images.${i}.align">${[['left', 'links'], ['center', 'mittig'], ['right', 'rechts']].map(([k, t]) => `<option value="${k}" ${(im.align || 'left') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f wide">Bildunterschrift <small>(optional)</small><input type="text" data-path="images.${i}.cap" value="${esc(im.cap || '')}" placeholder="z. B. Abb. 1: Versuchsaufbau"></label></div>
        <div class="btns"><button type="button" class="btn sm" data-m="img-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Nach vorn">↑</button><button type="button" class="btn sm" data-m="img-down" data-i="${i}" ${i === d.images.length - 1 ? 'disabled' : ''} title="Nach hinten">↓</button><button type="button" class="btn sm danger" data-m="img-del" data-i="${i}">Entfernen</button></div></div>`).join('')}
      <input type="file" id="imgfile" accept="image/*" multiple><small class="meta">Tipp: Bilder aus der Zwischenablage mit Strg+V (Mac: Cmd+V) im Fenster einfügen. Die Bilder erscheinen unter dem Aufgabentext.</small></div>`;

    root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
      <header><h2>${esc(opts.title)}</h2><button type="button" data-m="cancel" aria-label="Schließen">✕</button></header>
      <div class="modal-body two">
        <form class="form" id="qform" onsubmit="return false">
          ${opts.note ? `<div class="meta" style="background:#fff3d6;padding:8px 10px;border-radius:8px">${esc(opts.note)}</div>` : ''}
          ${isBlock ? '' : `<div class="row">
            <label class="f">Fach<select data-path="subject">${R.SUBJECTS.map(s => `<option ${d.subject === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <label class="f">Klassenstufe<select data-path="grade">${gradeOptions(d.grade)}</select></label>
          </div>`}
          ${isBlock ? '' : `<div class="row">
            <label class="f">Thema<input type="text" data-path="topic" list="topiclist" value="${esc(d.topic)}" placeholder="z. B. Quadratische Funktionen"></label>
            <label class="f">Aufgabentyp<select data-path="type">${Object.entries(R.TYPES).map(([k, v]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          </div>`}
          <datalist id="topiclist">${topics().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
          <label class="f">${isBlock ? 'Text' : 'Aufgabentext'}${tb(!isBlock)}<textarea data-path="text" rows="5">${esc(d.text)}</textarea><small id="hint">${hint()}</small></label>
          ${CHEAT}
          <div id="dyn" class="form">${dynHtml()}</div>
          ${imgHtml()}
          ${isBlock ? '' : `<label class="f">Schlagwörter <small>(durch Komma getrennt)</small><input type="text" data-path="tagsText" value="${esc((d.tags || []).join(', '))}"></label>`}
        </form>
        <aside class="preview"><h3>Vorschau <label><input type="checkbox" id="prevsol"> mit Lösung</label></h3><div class="pv" id="qprev"></div></aside>
      </div>
      <footer><button type="button" class="btn" data-m="cancel">Abbrechen</button><button type="button" class="btn primary" data-m="save">Speichern</button></footer>
    </div></div>`;

    const preview = () => { $('#qprev').innerHTML = R.renderQ(d, 1, { solutions: $('#prevsol').checked }); };
    const redyn = () => { $('#dyn').innerHTML = dynHtml(); $('#hint').innerHTML = hint(); preview(); };
    preview();

    const form = $('#qform');
    const onInput = e => {
      const t = e.target, p = t.dataset && t.dataset.path; if (!p) return;
      if (t.type === 'radio' && !t.checked) return;
      if (p === 'tagsText') { d.tags = t.value.split(',').map(x => x.trim()).filter(Boolean); return; }
      const v = t.type === 'checkbox' ? t.checked : t.type === 'radio' ? t.value === '1' : t.dataset.num !== undefined ? R.num(t.value) : t.value;
      setPath(d, p, v);
      if ((p === 'type' || p === 'answer') && e.type === 'change') { ensure(); redyn(); return; }
      preview();
    };
    document.addEventListener('mousedown', e => { if (!e.target.closest || !e.target.closest('.tbw')) document.querySelectorAll('.tbw .pop').forEach(x => x.hidden = true); });
    form.addEventListener('keydown', e => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.target.tagName !== 'TEXTAREA' || !e.target.previousElementSibling || !e.target.previousElementSibling.classList.contains('tbw')) return;
      const k = { b: 'b', i: 'i', u: 'u' }[e.key.toLowerCase()]; if (k) { e.preventDefault(); fmtText(e.target, k); }
    });
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    $('#prevsol').addEventListener('change', preview);

    const close = () => { root.innerHTML = ''; root.onclick = null; root.onchange = null; root.onmousedown = null; root.onpaste = null; };
    root.onmousedown = e => { if (e.target.closest('.tbw button')) e.preventDefault(); };
    const fire = ta => ta.dispatchEvent(new Event('input', { bubbles: true }));
    const setSel = (ta, a, b) => { ta.setSelectionRange(a, b); ta.focus(); };
    const lineRange = ta => { const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd; const st = v.lastIndexOf('\n', a - 1) + 1; let en = v.indexOf('\n', b > a ? b - 1 : b); if (en < 0) en = v.length; return [st, en]; };
    const replLines = (ta, fn) => {
      const [st, en] = lineRange(ta), seg = ta.value.slice(st, en).split('\n'), out = fn(seg);
      ta.value = ta.value.slice(0, st) + out.join('\n') + ta.value.slice(en);
      setSel(ta, st, st + out.join('\n').length); fire(ta);
    };
    const insertBlock = (ta, txt, s0, s1) => {
      const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
      const pre = a > 0 && v[a - 1] !== '\n' ? '\n' : '', post = b < v.length && v[b] !== '\n' ? '\n' : '';
      ta.value = v.slice(0, a) + pre + txt + post + v.slice(b);
      const base = a + pre.length; setSel(ta, base + (s0 ?? txt.length), base + (s1 ?? txt.length)); fire(ta);
    };
    const wrapSel = (ta, open, close, ph) => {
      const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, sel = v.slice(a, b);
      if (sel && sel.length >= open.length + close.length && sel.startsWith(open) && sel.endsWith(close) && !(open === '*' && sel.startsWith('**'))) {
        const inner = sel.slice(open.length, sel.length - close.length);
        ta.value = v.slice(0, a) + inner + v.slice(b); setSel(ta, a, a + inner.length); fire(ta); return;
      }
      if (sel && v.slice(a - open.length, a) === open && v.slice(b, b + close.length) === close && !(open === '*' && v[a - 2] === '*')) {
        ta.value = v.slice(0, a - open.length) + sel + v.slice(b + close.length); setSel(ta, a - open.length, a - open.length + sel.length); fire(ta); return;
      }
      const t = sel || ph;
      ta.value = v.slice(0, a) + open + t + close + v.slice(b);
      setSel(ta, a + open.length, a + open.length + t.length); fire(ta);
    };
    // Farbe/Markierung: bestehende Gruppe gleicher Art ersetzen statt zu verschachteln
    const setGroup = (ta, kind, val) => {
      const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, rx = new RegExp('^\\{' + kind + ':[^|{}\\n]*\\|([\\s\\S]*)\\}$');
      let sel = v.slice(a, b), A = a, B = b;
      const m = rx.exec(sel);
      if (m) sel = m[1];
      else {
        const before = v.slice(0, a).match(new RegExp('\\{' + kind + ':[^|{}\\n]*\\|$'));
        if (before && v[b] === '}') { A = a - before[0].length; B = b + 1; }
      }
      const t = sel || 'Text';
      const rep = val ? '{' + kind + ':' + val + '|' + t + '}' : t;
      ta.value = v.slice(0, A) + rep + v.slice(B);
      setSel(ta, A + (val ? ('{' + kind + ':' + val + '|').length : 0), A + (val ? ('{' + kind + ':' + val + '|').length : 0) + t.length); fire(ta);
    };
    const setSize = (ta, val) => {
      const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
      let sel = v.slice(a, b), A = a, B = b;
      const m = /^\{s:(?:klein|gro(?:ß|ss)|riesig)\|([\s\S]*)\}$/i.exec(sel);
      if (m) sel = m[1];
      else { const before = v.slice(0, a).match(/\{s:(?:klein|gro(?:ß|ss)|riesig)\|$/i); if (before && v[b] === '}') { A = a - before[0].length; B = b + 1; } }
      const t = sel || 'Text', rep = val && val !== '-' ? '{s:' + (val === 'gross' ? 'groß' : val) + '|' + t + '}' : t;
      ta.value = v.slice(0, A) + rep + v.slice(B);
      const off = val && val !== '-' ? rep.length - t.length - 1 : 0; setSel(ta, A + off, A + off + t.length); fire(ta);
    };
    const boxWrap = (ta, kind) => {
      const [st, en] = lineRange(ta), seg = ta.value.slice(st, en);
      const sel = seg.trim() ? seg : 'Text hier eingeben';
      const txt = ':::' + kind + '\n' + sel + '\n:::';
      ta.value = ta.value.slice(0, st) + txt + ta.value.slice(en);
      const s0 = st + kind.length + 4; setSel(ta, s0, s0 + sel.length); fire(ta);
    };
    const alignWrap = (ta, al) => {
      const kind = { center: 'mitte', right: 'rechts', justify: 'blocksatz', left: 'links' }[al];
      const [st, en] = lineRange(ta), v = ta.value, lines = v.split('\n');
      const li = v.slice(0, st).split('\n').length - 1, le = li + v.slice(st, en).split('\n').length - 1;
      const prev = lines[li - 1], next = lines[le + 1];
      if (prev !== undefined && /^\s*:::\s*(mitte|zentriert|rechts|links|blocksatz)\s*$/.test(prev) && next !== undefined && /^\s*:::\s*$/.test(next)) {
        lines.splice(le + 1, 1); lines.splice(li - 1, 1);
      } else if (al === 'left') return;
      if (al !== 'left') {
        const base = lines.slice();
        const hadWrap = prev !== undefined && /^\s*:::\s*(mitte|zentriert|rechts|links|blocksatz)\s*$/.test(prev) && next !== undefined && /^\s*:::\s*$/.test(next);
        const i0 = hadWrap ? li - 1 : li, i1 = hadWrap ? le - 1 : le;
        base.splice(i1 + 1, 0, ':::'); base.splice(i0, 0, ':::' + kind);
        ta.value = base.join('\n'); setSel(ta, ta.value.split('\n').slice(0, i0 + 1).join('\n').length + 1, ta.value.split('\n').slice(0, i1 + 2).join('\n').length); fire(ta); return;
      }
      ta.value = lines.join('\n'); setSel(ta, st, st); fire(ta);
    };
    // Tabellen
    const tableAt = ta => {
      const v = ta.value, pos = ta.selectionStart, ls = v.split('\n'); let off = 0, idx = -1;
      for (let k = 0; k < ls.length; k++) { if (pos <= off + ls[k].length) { idx = k; break; } off += ls[k].length + 1; }
      if (idx < 0 || !/^\s*\|/.test(ls[idx])) return null;
      let a = idx, b = idx; while (a > 0 && /^\s*\|/.test(ls[a - 1])) a--; while (b < ls.length - 1 && /^\s*\|/.test(ls[b + 1])) b++;
      return { ls, a, b, idx };
    };
    const tableMd = (rows, cols, head) => {
      const w = 12, cell = t => ' ' + t.padEnd(w - 1);
      const line = arr => '|' + arr.map(cell).join('|') + '|';
      const out = [];
      if (head) { out.push(line(Array.from({ length: cols }, (_, k) => 'Spalte ' + (k + 1)))); out.push('|' + Array.from({ length: cols }, () => '-'.repeat(w)).join('|') + '|'); }
      for (let r = 0; r < rows; r++) out.push(line(Array.from({ length: cols }, () => '')));
      return out.join('\n');
    };
    const tableOp = (ta, op) => {
      const T = tableAt(ta); if (!T) { toast('Setze den Cursor zuerst in eine Tabelle.'); return; }
      let { ls, a, b, idx } = T; const isSep = l => R.isSepRow(R.splitCells(l));
      const fix = l => { l = l.replace(/\s+$/, ''); return /\|$/.test(l) ? l : l + ' |'; };
      if (op === 'row+') { const nc = R.splitCells(ls[a]).length; const nl = '|' + Array.from({ length: nc }, () => '            ').join('|') + '|'; ls.splice(idx + 1, 0, nl); }
      else if (op === 'row-') { if (b - a < 1 || isSep(ls[idx]) || (idx === a && a + 1 <= b && isSep(ls[a + 1]))) { toast('Diese Zeile kann nicht entfernt werden.'); return; } ls.splice(idx, 1); }
      else if (op === 'col+') { for (let k = a; k <= b; k++) ls[k] = fix(ls[k]) + (isSep(ls[k]) ? '------------|' : '            |'); }
      else if (op === 'col-') { if (R.splitCells(ls[a]).length < 2) return; for (let k = a; k <= b; k++) ls[k] = fix(ls[k]).replace(/\|[^|]*\|$/, '|'); }
      const tgt = op === 'row+' ? idx + 1 : Math.min(idx, ls.length - 1);
      ta.value = ls.join('\n');
      const off = ls.slice(0, tgt).join('\n').length + (tgt ? 1 : 0) + 1;
      setSel(ta, off, off); fire(ta);
    };
    const fmtText = (ta, k) => {
      const v = ta.value;
      switch (k) {
        case 'l': return replLines(ta, seg => { const all = seg.every(l => /^\s*- /.test(l) || !l.trim()); return seg.map(l => !l.trim() ? l : all ? l.replace(/^(\s*)- /, '$1') : (/^\s*- /.test(l) ? l : '- ' + l.replace(/^\s*\d{1,2}[.)]\s+/, ''))); });
        case 'n': return replLines(ta, seg => { const all = seg.every(l => /^\s*\d{1,2}[.)] /.test(l) || !l.trim()); let c = 0; return seg.map(l => !l.trim() ? l : all ? l.replace(/^(\s*)\d{1,2}[.)] /, '$1') : (++c + '. ' + l.replace(/^\s*(?:- |\d{1,2}[.)]\s+)/, ''))); });
        case 'hr': ta.setSelectionRange(ta.selectionEnd, ta.selectionEnd); return insertBlock(ta, '---');
        case 'pb': ta.setSelectionRange(ta.selectionEnd, ta.selectionEnd); return insertBlock(ta, ':::seite');
        case 'b': return wrapSel(ta, '**', '**', 'fett');
        case 'i': return wrapSel(ta, '*', '*', 'kursiv');
        case 'u': return wrapSel(ta, '__', '__', 'unterstrichen');
        case 'st': return wrapSel(ta, '~~', '~~', 'durchgestrichen');
        case 'hoch': return wrapSel(ta, '{s:hoch|', '}', '2');
        case 'tief': return wrapSel(ta, '{s:tief|', '}', '2');
        case 'f': return wrapSel(ta, '$', '$', 'x^2');
        case 'g': return wrapSel(ta, '[[', ']]', 'Lösung');
        case 'c': return wrapSel(ta, '`', '`', 'code');
      }
    };
    const mi = (o, v, inner, cls = '') => `<button type="button" class="mi ${cls}" data-m="opt" data-o="${o}" data-v="${v}">${inner}</button>`;
    const popHtml = (kind, ta) => {
      if (kind === 'color') return `<div class="pt">Schriftfarbe</div><div class="sw">${COL_BTNS}<input type="color" data-colorpick value="#c00000" title="Eigene Farbe"></div><button type="button" class="mi" data-m="color" data-v="">✕ Farbe entfernen</button>`;
      if (kind === 'mark') return `<div class="pt">Textmarker</div><div class="sw">${MARK_BTNS}<input type="color" data-markpick value="#fff176" title="Eigene Farbe"></div><button type="button" class="mi" data-m="mark" data-v="">✕ Markierung entfernen</button>`;
      if (kind === 'size') return `<div class="pt">Schriftgröße</div>${mi('size', 'klein', '<span style="font-size:.85em">Klein</span>')}${mi('size', '-', 'Normal')}${mi('size', 'gross', '<span style="font-size:1.25em">Groß</span>')}${mi('size', 'riesig', '<span style="font-size:1.55em">Sehr groß</span>')}`;
      if (kind === 'head') return `<div class="pt">Absatzformat</div>${mi('head', '1', '<b style="font-size:1.3em">Überschrift 1</b>')}${mi('head', '2', '<b style="font-size:1.15em">Überschrift 2</b>')}${mi('head', '3', '<b><u>Überschrift 3</u></b>')}${mi('head', '0', 'Normaler Text')}`;
      if (kind === 'align') return `<div class="pt">Ausrichtung</div>${[['left', 'Linksbündig', 'M4 6h16M4 10h10M4 14h16M4 18h10'], ['center', 'Zentriert', 'M4 6h16M7 10h10M4 14h16M7 18h10'], ['right', 'Rechtsbündig', 'M4 6h16M10 10h10M4 14h16M10 18h10'], ['justify', 'Blocksatz', 'M4 6h16M4 10h16M4 14h16M4 18h16']].map(([v, t, d]) => mi('align', v, `<svg viewBox="0 0 24 24" class="mic"><path d="${d}"/></svg>${t}`)).join('')}`;
      if (kind === 'box') return `<div class="pt">Kasten um die markierten Zeilen</div>${[['merke', 'Merksatz'], ['definition', 'Definition'], ['beispiel', 'Beispiel'], ['achtung', 'Achtung'], ['tipp', 'Tipp'], ['info', 'Info'], ['rahmen', 'Einfacher Rahmen']].map(([v, t]) => { const K = R.BOXES[v]; return mi('box', v, `<span class="boxchip" style="--bar:${K.bar};--bg:${K.bg}"></span>${t}`); }).join('')}`;
      if (kind === 'sym') return `<div class="pt">Sonderzeichen</div><div class="symgrid">${SYMS.map(x => mi('sym', x, x, 'symb')).join('')}</div>`;
      const inT = !!tableAt(ta);
      return `<div class="pt">Tabelle</div><div class="tr"><label>Zeilen<input type="number" min="1" max="30" value="3" data-t="rows"></label><label>Spalten<input type="number" min="1" max="8" value="3" data-t="cols"></label><label class="ck"><input type="checkbox" data-t="head" checked> mit Kopfzeile</label><button type="button" class="btn sm primary" data-m="tbl-ins">Einfügen</button></div>
        <div class="pt" style="margin-top:6px">Bestehende Tabelle ändern ${inT ? '' : '<small>(Cursor in die Tabelle setzen)</small>'}</div><div class="tr"><button type="button" class="btn sm" data-m="tbl-op" data-op="row+" ${inT ? '' : 'disabled'}>+ Zeile</button><button type="button" class="btn sm" data-m="tbl-op" data-op="row-" ${inT ? '' : 'disabled'}>− Zeile</button><button type="button" class="btn sm" data-m="tbl-op" data-op="col+" ${inT ? '' : 'disabled'}>+ Spalte</button><button type="button" class="btn sm" data-m="tbl-op" data-op="col-" ${inT ? '' : 'disabled'}>− Spalte</button></div>
        <small>Leere Zellen = Schreibfeld für die Lernenden.</small>`;
    };
    const togglePop = (b, kind) => {
      const w = b.closest('.tbw'), pop = w.querySelector('.pop'), ta = w.nextElementSibling;
      if (!pop.hidden && pop.dataset.kind === kind) { pop.hidden = true; return; }
      pop.dataset.kind = kind; pop.innerHTML = popHtml(kind, ta); pop.hidden = false;
      const maxL = Math.max(0, w.clientWidth - pop.offsetWidth - 4);
      pop.style.left = Math.max(0, Math.min(b.offsetLeft - 4, maxL)) + 'px';
    };
    const addImages = async files => {
      for (const f of files) { if (!/^image\//.test(f.type)) continue; try { d.images.push({ src: await fileToDataUrl(f), w: 60 }); } catch (err) { toast('Bild konnte nicht geladen werden.'); } }
      $('#imgbox').outerHTML = imgHtml(); preview();
    };
    root.onpaste = e => { const fl = [...(e.clipboardData ? e.clipboardData.files : [])].filter(f => /^image\//.test(f.type)); if (fl.length) { e.preventDefault(); addImages(fl); } };
    root.onclick = async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const i = +b.dataset.i;
      switch (b.dataset.m) {
        case 'cancel': close(); break;
        case 'opt-add': d.options.push({ t: '', ok: false }); redyn(); break;
        case 'opt-del': d.options.splice(i, 1); redyn(); break;
        case 'part-add': d.parts.push({ text: '', points: 2, afb: d.afb || 1, solution: '' }); redyn(); break;
        case 'part-del': d.parts.splice(i, 1); redyn(); break;
        case 'fmt': { const ta = b.closest('.tbw').nextElementSibling; if (ta) fmtText(ta, b.dataset.k); break; }
        case 'pop': togglePop(b, b.dataset.k); break;
        case 'opt': {
          const ta = b.closest('.tbw').nextElementSibling, o = b.dataset.o, v = b.dataset.v;
          if (o === 'size') setSize(ta, v);
          else if (o === 'head') { const lv = +v; replLines(ta, seg => seg.map(l => !l.trim() ? l : (lv ? '#'.repeat(lv) + ' ' : '') + l.replace(/^\s*#{1,3}\s+/, ''))); }
          else if (o === 'align') alignWrap(ta, v);
          else if (o === 'box') boxWrap(ta, v);
          else if (o === 'sym') { const x = ta.selectionStart; ta.value = ta.value.slice(0, x) + v + ta.value.slice(ta.selectionEnd); ta.setSelectionRange(x + v.length, x + v.length); ta.focus(); fire(ta); }
          b.closest('.pop').hidden = true; break;
        }
        case 'color': case 'mark': { const ta = b.closest('.tbw').nextElementSibling; setGroup(ta, b.dataset.m === 'color' ? 'c' : 'bg', b.dataset.v); if (b.dataset.v) b.closest('.tbw').style.setProperty(b.dataset.m === 'color' ? '--cc' : '--cm', getComputedStyle(b).backgroundColor); b.closest('.pop').hidden = true; break; }
        case 'tbl-ins': {
          const pop = b.closest('.pop'), ta = b.closest('.tbw').nextElementSibling, g = k => pop.querySelector('[data-t=' + k + ']');
          const rows = Math.max(1, Math.min(30, +g('rows').value || 3)), cols = Math.max(1, Math.min(8, +g('cols').value || 3));
          insertBlock(ta, tableMd(rows, cols, g('head').checked)); pop.hidden = true; break;
        }
        case 'tbl-op': { const ta = b.closest('.tbw').nextElementSibling; tableOp(ta, b.dataset.op); const pop = b.closest('.pop'); pop.innerHTML = popHtml('table', ta); break; }
        case 'img-del': {
          const im = d.images[i];
          if (im && (im.inline || im.placed)) { const tok = new RegExp('\\s?\\{img:' + im.id + '\\}', 'g'); d.text = d.text.replace(tok, ''); d.solution = (d.solution || '').replace(tok, ''); (d.options || []).forEach(o => o.t = o.t.replace(tok, '')); (d.parts || []).forEach(p => { p.text = p.text.replace(tok, ''); p.solution = (p.solution || '').replace(tok, ''); }); $$('#qform textarea, #qform input[type=text]').forEach(el => { if (el.dataset.path) { const v = el.dataset.path.split('.').reduce((o, k) => o && o[k], d); if (typeof v === 'string') el.value = v; } }); }
          d.images.splice(i, 1); $('#imgbox').outerHTML = imgHtml(); preview(); break; }
        case 'img-del-old': d.images.splice(i, 1); $('#imgbox').outerHTML = imgHtml(); preview(); break;
        case 'img-up': case 'img-down': { const j = b.dataset.m === 'img-up' ? i - 1 : i + 1; if (d.images[j]) { [d.images[i], d.images[j]] = [d.images[j], d.images[i]]; $('#imgbox').outerHTML = imgHtml(); preview(); } break; }
        case 'save':
          if (isBlock) { if (!d.text.trim() && !d.images.length) { toast('Bitte Text eingeben oder ein Bild hinzufügen.'); return; } }
          else if (!d.text.trim() && !(d.type === 'teil' && d.parts.some(p => p.text.trim()))) { toast('Bitte einen Aufgabentext eingeben.'); return; }
          if (d.type === 'mc' && !d.options.some(o => o.ok)) { if (!confirm('Es ist keine Antwort als richtig markiert. Trotzdem speichern?')) return; }
          try { await opts.onSave(d); close(); } catch (err) { toast(err.message); }
          break;
      }
    };
    root.onchange = async e => {
      const tgt = e.target;
      if (tgt.matches && tgt.matches('[data-colorpick],[data-markpick]')) { const ta = tgt.closest('.tbw').nextElementSibling; setGroup(ta, tgt.matches('[data-colorpick]') ? 'c' : 'bg', tgt.value); tgt.closest('.tbw').style.setProperty(tgt.matches('[data-colorpick]') ? '--cc' : '--cm', tgt.value); tgt.closest('.pop').hidden = true; return; }
      if (tgt.matches && tgt.matches('[data-size],[data-head],[data-align],[data-box]')) {
        const ta = tgt.closest('.tbw').nextElementSibling, v = tgt.value; tgt.value = ''; if (!v && v !== '0') return;
        if (tgt.matches('[data-size]')) setSize(ta, v);
        else if (tgt.matches('[data-head]')) { const lv = +v; replLines(ta, seg => seg.map(l => !l.trim() ? l : (lv ? '#'.repeat(lv) + ' ' : '') + l.replace(/^\s*#{1,3}\s+/, ''))); }
        else if (tgt.matches('[data-align]')) alignWrap(ta, v);
        else boxWrap(ta, v);
        return;
      }
      if (e.target.matches && e.target.matches('[data-sym]')) {
        const ta = e.target.closest('.tbw').nextElementSibling, v = e.target.value; e.target.value = '';
        if (ta && v) { const a = ta.selectionStart; ta.value = ta.value.slice(0, a) + v + ta.value.slice(ta.selectionEnd); ta.setSelectionRange(a + v.length, a + v.length); ta.focus(); fire(ta); }
        return;
      }
      if (e.target.id !== 'imgfile' || !e.target.files.length) return;
      const fl = [...e.target.files]; e.target.value = ''; await addImages(fl);
    };
  }

  function fileToDataUrl(file, max = 1000) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = rej;
      fr.onload = () => {
        const img = new Image();
        img.onerror = rej;
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
          res(file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  async function saveQuestion(d) {
    d.updatedBy = S.user || d.updatedBy || '';
    if (!d.id) d.id = Store.uuid();
    const saved = await saveWithConflict('questions', d);
    const i = S.questions.findIndex(x => x.id === saved.id);
    if (i >= 0) S.questions[i] = saved; else S.questions.unshift(saved);
    toast('Aufgabe gespeichert');
    return saved;
  }

  /* ---------- Prüfungen ---------- */
  function newExam() {
    return { id: Store.uuid(), title: 'Neue Prüfung', subject: S.f.subject || 'Mathematik', grade: '', date: '', duration: '', school: cfg.SCHOOL_NAME || '', hints: '', items: [], updatedBy: S.user };
  }

  function examsView() {
    shell('pruefungen', `<div class="page-h"><h1>Prüfungen</h1><div class="actions"><button class="btn primary" data-a="e-new">+ Neue Prüfung</button></div></div>
      <div class="grid2">${S.exams.length ? S.exams.map(e => {
        const total = (e.items || []).reduce((a, q) => a + R.qPoints(q), 0);
        return `<article class="card"><div class="tags"><span class="tag ${e.subject}">${esc(e.subject)}</span>${e.grade ? `<span class="tag">${esc(R.gradeLabel(e.grade))}</span>` : ''}<span class="tag">${(e.items || []).filter(i => i.type !== 'block').length} Aufgaben</span><span class="tag">${R.fmt(total)} BE</span></div>
        <b style="font-size:17px">${esc(e.title)}</b><div class="meta">${e.updatedBy ? esc(e.updatedBy) + ' · ' : ''}${e._u ? new Date(e._u).toLocaleDateString('de-DE') : ''}</div>
        <div class="btns"><a class="btn sm primary" style="text-decoration:none" href="#/pruefung/${e.id}">Öffnen</a>
        <button class="btn sm" data-a="e-dup" data-id="${e.id}">Duplizieren</button><button class="btn sm" data-a="e-dupb" data-id="${e.id}" title="Kopie mit gemischter Aufgabenreihenfolge und gemischten Antworten (gegen Abschreiben)">Gruppe B</button><button class="btn sm danger" data-a="e-del" data-id="${e.id}">Löschen</button></div></article>`;
      }).join('') : '<div class="empty" style="grid-column:1/-1">Noch keine Prüfungen. Lege die erste an und ziehe Aufgaben aus der Aufgabenbank hinein.</div>'}</div>`);
  }

  function setSaveState(txt, warn) { const el = $('#savestate'); if (el) { el.textContent = txt; el.classList.toggle('dirty', !!warn); } }
  function touch() { S.dirty = true; setSaveState('Ungespeicherte Änderungen', true); clearTimeout(S.timer); S.timer = setTimeout(() => saveExam(), 900); }

  async function saveExam(force) {
    if (!S.exam) return;
    clearTimeout(S.timer); setSaveState('Speichert …');
    S.exam.updatedBy = S.user || S.exam.updatedBy || '';
    try {
      const saved = await Store.save('exams', S.exam, { force });
      S.exam._u = saved._u; S.dirty = false;
      const i = S.exams.findIndex(x => x.id === saved.id);
      if (i >= 0) S.exams[i] = clone(S.exam); else S.exams.unshift(clone(S.exam));
      setSaveState('Gespeichert ✓');
    } catch (e) {
      if (e.conflict) {
        if (confirm('Diese Prüfung wurde inzwischen von jemand anderem geändert.\n\nOK = meine Version speichern (überschreibt die andere)\nAbbrechen = meine Änderungen verwerfen und neu laden')) return saveExam(true);
        const fresh = (await Store.list('exams')).find(x => x.id === S.exam.id);
        S.dirty = false; S.exam = null; if (fresh) { const i = S.exams.findIndex(x => x.id === fresh.id); if (i >= 0) S.exams[i] = fresh; }
        return examView(fresh && fresh.id);
      }
      setSaveState('Fehler: ' + e.message, true);
    }
  }

  function examView(id) {
    const ex = S.exams.find(e => e.id === id);
    if (!ex) { toast('Prüfung nicht gefunden.'); location.hash = '#/pruefungen'; return; }
    if (!S.exam || S.exam.id !== id) { S.exam = clone(ex); S.dirty = false; S.side = { subject: ex.subject || '', q: '' }; }
    const e = S.exam;
    shell('pruefungen', `<div class="exam-wrap">
      <div class="exam-top">
        <a href="#/pruefungen" class="btn sm" style="text-decoration:none">← Prüfungen</a>
        <input class="title" id="e-title" value="${esc(e.title)}" placeholder="Titel der Prüfung">
        <select id="e-subject">${R.SUBJECTS.map(s => `<option ${e.subject === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <select id="e-grade">${gradeOptions(e.grade)}</select>
        <input type="date" id="e-date" value="${esc(e.date || '')}">
        <button class="btn sm" data-a="e-head">Kopfzeile &amp; Schrift …</button>
        <span class="savestate" id="savestate">${S.dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert ✓'}</span>
        <span style="flex:1"></span>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="e-sol" ${S.solutions ? 'checked' : ''}> Lösungen anzeigen</label>
        <div class="dropdown"><button class="btn primary" data-a="menu">Exportieren ▾</button>
          <div class="menu" id="expmenu">
            <button data-a="x-pdf">PDF (Druckdialog → „Als PDF speichern“)</button>
            <button data-a="x-pdf-sol">PDF mit Lösungen</button><hr>
            <button data-a="x-odt">ODT (LibreOffice / Word)</button>
            <button data-a="x-odt-sol">ODT mit Lösungen</button>
            <label style="display:flex;gap:6px;padding:6px 10px;font-size:12.5px;color:var(--muted);align-items:flex-start"><input type="checkbox" id="x-text" ${S.mathText ? 'checked' : ''}> <span>ODT: Formeln als einfachen Text statt als Formelobjekte (falls Formeln fehlen)</span></label>
          </div></div>
      </div>
      <div class="exam-stats" id="stats"></div>
      <div class="exam-panes">
        <div class="paper-scroll"><div class="paper" id="paper"></div></div>
        <aside class="bank-side"><div class="top"><b>Aufgabenbank</b>
          <input type="text" id="s-q" placeholder="Suchen …" value="${esc(S.side.q)}">
          <select id="s-subject"><option value="">Alle Fächer</option>${R.SUBJECTS.map(s => `<option ${S.side.subject === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn sm" data-a="s-new">+ Neue Aufgabe direkt in der Prüfung</button>
          <button class="btn sm" data-a="s-block" title="Überschrift, Material, Hinweis oder Bild zwischen den Aufgaben">+ Textblock / Bild einfügen</button>
          <small class="meta">Karten per Drag &amp; Drop in den Bogen ziehen oder auf „+ In Prüfung“ klicken.</small></div>
          <div class="list" id="s-list"></div></aside>
      </div></div>`);
    renderPaper(); renderStats(); renderSide();
  }

  function renderPaper() { const p = $('#paper'); if (p && S.exam) { p.setAttribute('style', R.fontStyle(S.exam)); p.innerHTML = R.paper(S.exam, { edit: true, solutions: S.solutions }); } }
  function renderStats() {
    const el = $('#stats'); if (!el || !S.exam) return;
    const st = R.afbStats(S.exam.items);
    el.innerHTML = `<span><b>${(S.exam.items || []).filter(i => i.type !== 'block').length}</b> Aufgaben</span><span><b>${R.fmt(st.total)}</b> BE gesamt</span>` +
      [1, 2, 3].map(k => `<span class="afbbar">AFB ${R.AFB[k]}
        <span class="track"><span class="fill" style="width:${st.pct(k)}%"></span><span class="soll" style="left:${R.AFB_SOLL[k]}%"></span></span>
        <b>${st.pct(k)} %</b> <small style="color:var(--muted)">(Soll ${R.AFB_SOLL[k]} %)</small></span>`).join('');
  }
  function renderSide() {
    const el = $('#s-list'); if (!el) return;
    const inExam = new Set((S.exam.items || []).map(i => i.srcId));
    const list = S.questions.filter(q => matches(q, { subject: S.side.subject, q: S.side.q }) && !inExam.has(q.id));
    el.innerHTML = list.length ? list.map(q => qCard(q, true)).join('') : '<div class="empty">Keine (weiteren) Aufgaben gefunden.</div>';
  }

  function addToExam(q, idx) {
    const it = clone(q); delete it.id; delete it._u; it.srcId = q.id; it.uid = Store.uuid();
    const items = S.exam.items; idx = idx === undefined ? items.length : idx;
    items.splice(idx, 0, it);
    touch(); renderPaper(); renderStats(); renderSide();
  }
  function moveItem(uid, idx) {
    const items = S.exam.items, from = items.findIndex(i => i.uid === uid); if (from < 0) return;
    const [it] = items.splice(from, 1); if (from < idx) idx--; items.splice(idx, 0, it);
    touch(); renderPaper();
  }

  /* Drag & Drop */
  const dropIndex = y => { const its = $$('#paper-items .item'); for (let i = 0; i < its.length; i++) { const r = its[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return i; } return its.length; };
  const clearDrop = () => { $$('.drop-before,.drop-end').forEach(x => x.classList.remove('drop-before', 'drop-end')); };
  const isOurs = e => e.dataTransfer && [...e.dataTransfer.types].some(t => t === 'text/x-qid' || t === 'text/x-uid');
  document.addEventListener('dragstart', e => {
    const card = e.target.closest && e.target.closest('.card[data-qid]');
    const grip = e.target.closest && e.target.closest('.grip');
    if (card) { e.dataTransfer.setData('text/x-qid', card.dataset.qid); e.dataTransfer.effectAllowed = 'copy'; }
    else if (grip) { e.dataTransfer.setData('text/x-uid', grip.dataset.uid); e.dataTransfer.effectAllowed = 'move'; const it = grip.closest('.item'); if (it) e.dataTransfer.setDragImage(it, 20, 20); }
  });
  document.addEventListener('dragover', e => {
    if (!isOurs(e) || !e.target.closest('.paper-scroll')) return;
    e.preventDefault(); clearDrop();
    const idx = dropIndex(e.clientY), its = $$('#paper-items .item');
    if (idx < its.length) its[idx].classList.add('drop-before'); else $('#paper-items').classList.add('drop-end');
  });
  document.addEventListener('dragend', clearDrop);
  document.addEventListener('drop', e => {
    if (!isOurs(e) || !e.target.closest('.paper-scroll')) return;
    e.preventDefault(); clearDrop();
    const idx = dropIndex(e.clientY);
    const qid = e.dataTransfer.getData('text/x-qid'), uid = e.dataTransfer.getData('text/x-uid');
    if (qid) { const q = S.questions.find(x => x.id === qid); if (q) addToExam(q, idx); }
    else if (uid) moveItem(uid, idx);
  });


  /* ---------- Dokument-Import ---------- */
  const KI_PROMPT = `Zerlege das angehängte Dokument in einzelne Aufgaben und gib mir ALLE Aufgaben in EINER JSON-Datei zurück (nur ein Codeblock, sonst nichts).
Format: {"format":"pruefungsbank-aufgaben","version":1,"questions":[ … ]}
Pro Aufgabe: {"type":"frei|mc|wf|luecke|teil","subject":"Mathematik|Physik|Informatik","grade":"5–10 | E | Q1 | Q2","topic":"kurzes Thema","afb":1|2|3,"points":Zahl,"text":"Aufgabentext","solution":"Lösung oder leer","lines":0}
Zusätzlich: Teilaufgaben a), b), … → type "teil" mit "parts":[{"text":"…","points":Zahl,"afb":1|2|3,"solution":"…"}]; Multiple Choice → type "mc" mit "options":[{"t":"…","ok":true|false}]; Wahr/Falsch → type "wf" mit "wahr":true|false; Lückentext → type "luecke", Lücken im Text als [[Lösungswort]].
Regeln: Aufgabentext und Teilaufgaben wörtlich übernehmen, Formeln als LaTeX in $…$, Punkte und Lösungen nur aus dem Dokument (sonst 0 bzw. ""), nichts erfinden. AFB nach Operatoren (I Reproduzieren, II Zusammenhänge herstellen, III Verallgemeinern/Beurteilen).`;

  function importView() {
    const o = S.imp.opts;
    shell('import', `
      <div class="page-h"><h1>Dokument-Import</h1><div class="actions"><a class="btn" href="#/aufgaben" style="text-decoration:none">← Aufgabenbank</a></div></div>
      <div class="info" style="margin-bottom:14px"><p style="margin-top:0">Lade Klassenarbeiten, Arbeitsblätter oder Aufgabensammlungen hoch: <b>PDF, DOCX, ODT oder TXT</b>, auch mehrere Dateien auf einmal.
      Die Dateien werden <b>nur in deinem Browser gelesen</b> und nirgends hochgeladen. Erkannt werden Aufgaben-Überschriften, Teilaufgaben a), b), Punkte, Lösungen, Multiple Choice, Lückentexte,
      Formeln aus Word und LibreOffice sowie Bilder. Bei PDFs werden Bilder, Grafiken und Formeln (Brüche, Wurzeln, Summen, Integrale) als Bildausschnitt an der passenden Stelle übernommen, sie lassen sich dann nicht als Text bearbeiten. Bei DOCX/ODT bleiben Formeln bearbeitbar. Prüfe das Ergebnis unten, ändere es bei Bedarf und übernimm es dann in die Aufgabenbank.</p></div>
      <div class="dz" id="dz"><b>Dateien hierher ziehen</b> oder
        <label class="btn primary" style="cursor:pointer">Dateien auswählen<input id="docfiles" type="file" multiple hidden accept=".pdf,.docx,.odt,.txt,.md,.json"></label>
        <div class="meta">PDF · DOCX · ODT · TXT · oder eine fertige JSON-Datei (z. B. von einer KI)</div></div>
      <div class="row imp-opts" style="margin:12px 0 4px">
        <label class="f">Fach<select id="imp-subject"><option value="auto" ${o.subject === 'auto' ? 'selected' : ''}>automatisch erkennen</option>${R.SUBJECTS.map(x => `<option ${o.subject === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="f">Klassenstufe<select id="imp-grade"><option value="">aus dem Dokument / keine</option>${R.GRADES.map(g => `<option value="${g}" ${o.grade === g ? 'selected' : ''}>${esc(R.gradeLabel(g))}</option>`).join('')}</select></label>
        <label class="f">Thema für alle <small>(optional)</small><input type="text" id="imp-topic" value="${esc(o.topic)}" placeholder="sonst Überschrift der Aufgabe"></label>
      </div>
      <label style="display:flex;gap:6px;align-items:center;font-size:13.5px;margin-bottom:6px"><input type="checkbox" id="imp-title" ${o.titleTopic ? 'checked' : ''}> Überschrift der Aufgabe als Thema verwenden (wenn kein Thema eingetragen ist)</label>
      <div id="imp-status" class="meta"></div>
      <div id="imp-results"></div>
      <details class="ki-box"><summary>Das Ergebnis passt nicht? Mit einer KI zerlegen lassen</summary>
        <p>Lade das Dokument in einen KI-Chat (z. B. Claude) hoch und füge diesen Text dazu. Die KI gibt dir eine JSON-Datei zurück. Speichere sie als <code>.json</code> und ziehe sie oben in dieses Fenster, oder nutze in der Aufgabenbank „Importieren (JSON)“.</p>
        <textarea id="ki-prompt" readonly rows="9">${esc(KI_PROMPT)}</textarea>
        <button class="btn sm" data-a="ki-copy" style="margin-top:6px">Text kopieren</button></details>`);
    const dz = $('#dz');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => impFiles([...e.dataTransfer.files]));
    $('#imp-status').innerHTML = S.imp.log.map(l => `<div>${l}</div>`).join('');
    renderImp();
  }

  function impStatus(html) { S.imp.log.push(html); const el = $('#imp-status'); if (el) el.innerHTML = S.imp.log.map(l => `<div>${l}</div>`).join(''); }

  async function impFiles(files) {
    const o = S.imp.opts;
    for (const f of files) {
      impStatus(`⏳ ${esc(f.name)} wird gelesen …`);
      try {
        let n = 0, hints = [];
        if (/\.json$/i.test(f.name)) {
          const j = JSON.parse(await f.text()); const arr = Array.isArray(j) ? j : (j.questions || []);
          for (const raw of arr) {
            const q = normalizeQ(raw, o.subject === 'auto' ? 'Mathematik' : o.subject);
            if (o.grade && !q.grade) q.grade = o.grade; if (o.topic && !q.topic) q.topic = o.topic;
            if (!q.text.trim() && !q.parts.some(p => p.text.trim())) continue;
            S.imp.items.push({ id: Store.uuid(), include: true, q, hints: [], src: f.name }); n++;
          }
        } else {
          if (!window.DocImport) throw new Error('Das Programmteil js/docimport.js wurde nicht geladen (Datei fehlt im Repo oder alte Seite im Zwischenspeicher: Strg+Shift+R). Version: ' + (document.querySelector('script[src*="app.js"]') || {}).src);
          const r = await window.DocImport.process(f, { subject: o.subject, grade: o.grade, topic: o.topic, titleTopic: o.titleTopic });
          hints = r.hints;
          for (const x of r.items) { S.imp.items.push({ id: Store.uuid(), include: true, q: normalizeQ(x.q, x.q.subject), hints: x.hints.filter(h => !/^AFB nach Operatoren/.test(h)), src: f.name }); n++; }
        }
        S.imp.log.pop();
        impStatus(`✓ <b>${esc(f.name)}</b>: ${n} Aufgabe${n === 1 ? '' : 'n'} erkannt.${hints.length ? ' ' + hints.map(esc).join(' ') : ''}`);
      } catch (e) {
        S.imp.log.pop();
        impStatus(`✗ <b>${esc(f.name)}</b>: ${esc(e.message || 'Fehler beim Lesen')}`);
      }
    }
    renderImp();
  }

  function impCard(it, i) {
    const q = it.q, afbs = [...new Set(R.qAfbPoints(q).map(x => x.afb).filter(Boolean))].sort();
    return `<article class="imp-card ${it.include ? '' : 'off'}">
      <div class="imp-h"><label><input type="checkbox" class="imp-inc" data-id="${it.id}" ${it.include ? 'checked' : ''}> <b>Aufgabe ${i + 1}</b></label>
        <span class="meta">${esc(it.src)} · ${esc(q.subject)}${q.grade ? ' · ' + esc(R.gradeLabel(q.grade)) : ''}${q.topic ? ' · ' + esc(q.topic) : ''} · ${R.fmt(R.qPoints(q))} BE${afbs.length ? ' · AFB ' + afbs.map(a => R.AFB[a]).join('/') : ''} · ${R.TYPES[q.type]}</span>
        <span style="flex:1"></span>
        <button class="btn sm" data-a="imp-edit" data-id="${it.id}">Bearbeiten</button>
        <button class="btn sm danger" data-a="imp-del" data-id="${it.id}">Entfernen</button></div>
      ${it.hints.length ? `<div class="imp-warn">${it.hints.map(h => '⚠ ' + esc(h)).join('<br>')}</div>` : ''}
      <div class="pv">${R.renderQ(q, i + 1, { solutions: S.imp.sol })}</div></article>`;
  }

  function impUpdateBar() {
    const sel = S.imp.items.filter(i => i.include).length;
    const a = $('#imp-count'); if (a) a.textContent = `${S.imp.items.length} Aufgaben erkannt · ${sel} ausgewählt`;
    const b = $('#imp-savebtn'); if (b) b.textContent = `${sel} in die Aufgabenbank übernehmen`;
  }

  function renderImp() {
    const el = $('#imp-results'); if (!el) return;
    const items = S.imp.items;
    if (!items.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="imp-bar">
        <b id="imp-count"></b>
        <button class="btn sm" data-a="imp-all">Alle</button><button class="btn sm" data-a="imp-none">Keine</button>
        <span class="imp-bulk">Für ausgewählte setzen:
          <select id="bulk-subject"><option value="">Fach</option>${R.SUBJECTS.map(x => `<option>${x}</option>`).join('')}</select>
          <select id="bulk-grade"><option value="">Klasse</option>${R.GRADES.map(g => `<option value="${g}">${esc(R.gradeLabel(g))}</option>`).join('')}</select>
          <input type="text" id="bulk-topic" placeholder="Thema" style="width:150px">
          <button class="btn sm" data-a="imp-apply">Setzen</button></span>
        <label style="display:flex;gap:5px;align-items:center;font-size:13px"><input type="checkbox" id="imp-sol" ${S.imp.sol ? 'checked' : ''}> Lösungen zeigen</label>
        <span style="flex:1"></span>
        <button class="btn" data-a="imp-json">Als JSON herunterladen</button>
        <button class="btn primary" data-a="imp-save" id="imp-savebtn"></button></div>
      <div class="meta" style="margin:6px 0 10px">AFB wurden nach Operatoren (z. B. „nennen“ → I, „erklären“ → II, „beurteilen“ → III) geschätzt, bitte im Zweifel anpassen.</div>
      <div class="imp-list">${items.map((it, i) => impCard(it, i)).join('')}</div>`;
    impUpdateBar();
  }

  /* ---------- Info ---------- */
  function infoView() {
    shell('info', `<div class="page-h"><h1>Info &amp; Einstellungen</h1></div><div class="info">
      <label class="f" style="max-width:340px">Dein Name <small>(wird bei Aufgaben und Prüfungen als „zuletzt bearbeitet von“ gespeichert)</small>
      <input type="text" id="u-name" value="${esc(S.user)}" placeholder="z. B. Frau Meier"></label>
      <h2>So arbeitet die Prüfungsbank</h2>
      <p><b>Aufgabenbank:</b> Hier liegen alle Aufgaben, sortierbar nach Fach, Klassenstufe, Thema und Anforderungsbereich.<br>
      <b>Prüfungen:</b> Aufgaben aus der Bank werden als Kopie in die Prüfung gezogen. Änderungen dort wirken nur in dieser Prüfung. Mit „In Bank“ kannst du eine geänderte Aufgabe zusätzlich als neue Bankaufgabe sichern.<br>
      <b>Export:</b> PDF über den Druckdialog des Browsers („Als PDF speichern“), ODT zum Weiterbearbeiten in LibreOffice oder Word – jeweils mit oder ohne Lösungen.</p>
      <h2>Schreibweise und Layout</h2>
      <p>Über jedem Textfeld findest du eine Werkzeugleiste für Fett, Kursiv, Unterstrichen, <b>Schriftfarbe</b>, <b>Textmarker</b>, Größe, Listen, Überschriften, Ausrichtung, <b>Tabellen</b> und <b>Kästen</b> (Merksatz, Definition, Beispiel, Achtung, Tipp, Info, Rahmen). Unter dem Textfeld erklärt „Schreibweise &amp; Layout-Hilfe“ alles auch zum Tippen. Alles erscheint gleich in Vorschau, PDF und ODT.</p>
      <p>Kurzform: <code>**fett**</code>, <code>*kursiv*</code>, <code>{c:rot|Farbe}</code>, <code>{bg:gelb|Marker}</code>, <code>$x^2$</code> oder <code>$$\\frac{a}{b}$$</code> für Formeln, <code>[[Antwort]]</code> für Lücken, <code>:::merke</code> … <code>:::</code> für einen Kasten, <code>| a | b |</code> für Tabellen.</p>
      <h2>Speicherort</h2>
      <p>${Store.cloud ? 'Die Daten liegen in der gemeinsamen Datenbank (Supabase). Alle Kolleginnen und Kollegen sehen dieselben Aufgaben. Änderungen werden automatisch gespeichert; speichert jemand anderes zeitgleich dieselbe Aufgabe, wirst du gefragt.'
        : 'Aktuell läuft die App im <b>Lokal-Modus</b>: Die Daten bleiben nur in diesem Browser. Für die gemeinsame Nutzung trägst du in <code>js/config.js</code> die Supabase-Zugangsdaten ein (siehe README).'}</p></div>`);
  }

  /* ---------- Kopfzeile-Dialog ---------- */
  function openHead() {
    const e = S.exam, root = $('#modal-root');
    root.innerHTML = `<div class="modal-back"><div class="modal narrow"><header><h2>Kopfzeile und Schrift</h2><button data-m="cancel" type="button">✕</button></header>
      <div class="modal-body form">
        <label class="f">Schule / Institution<input type="text" id="h-school" value="${esc(e.school || '')}"></label>
        <label class="f">Dauer in Minuten<input type="number" id="h-dur" min="0" value="${esc(e.duration || '')}"></label>
        <div class="row"><label class="f">Schriftart<select id="h-font">${Object.entries(R.FONTS).map(([k, v]) => `<option value="${k}" ${R.fontOf(e) === v ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
        <label class="f">Schriftgröße<select id="h-fsize">${[10, 11, 12, 13, 14].map(n => `<option value="${n}" ${R.fsizeOf(e) === n ? 'selected' : ''}>${n} pt</option>`).join('')}</select></label></div>
        <small class="meta">Gilt für Vorschau, PDF und ODT. Ist die Schrift auf dem Rechner nicht vorhanden, nimmt das Programm automatisch eine ähnliche.</small>
        <div class="row"><label class="f">Bezeichnung der Aufgaben<input type="text" id="h-label" list="h-labels" value="${esc(e.taskLabel || '')}" placeholder="Aufgabe"><datalist id="h-labels"><option>Aufgabe<option>Übung<option>Station<option>Teil<option>Beispiel</datalist></label>
        <label class="f">Akzentfarbe (Titel, Aufgabenüberschriften, Linien)<select id="h-acc">${Object.entries(R.ACCENTS).map(([k, v]) => `<option value="${k}" ${(e.accent || 'schwarz') === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label></div>
        <div class="row"><label class="f">Titel<select id="h-talign"><option value="left" ${e.titleAlign !== 'center' ? 'selected' : ''}>linksbündig</option><option value="center" ${e.titleAlign === 'center' ? 'selected' : ''}>zentriert</option></select></label></div>
        <div class="f" style="display:grid;gap:5px;font-size:13.5px">
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="h-name" ${e.noName ? '' : 'checked'}> Zeile für Name / Klasse / Datum anzeigen</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="h-total" ${e.noTotal ? '' : 'checked'}> Gesamtpunktzahl anzeigen</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="h-pts" ${e.noPts ? '' : 'checked'}> Punkte (BE) bei den Aufgaben anzeigen</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="h-score" ${e.scoreTable ? 'checked' : ''}> Punkteübersicht (erreichbar / erreicht / Note) am Ende</label>
          <label class="f" style="margin-top:4px">Notenschlüssel auf dem Lösungsblatt<select id="h-grade"><option value="">keiner</option>${Object.entries(R.GRADES_KEY).map(([k, v]) => `<option value="${k}" ${e.gradeKey === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="h-pnum" ${e.pageNum ? 'checked' : ''}> Seitenzahl unten (ODT sicher; PDF in Chrome/Edge – in Safari über den Druckdialog „Kopf-/Fußzeilen“)</label>
        </div>
        <label class="f">Hinweise für die Prüflinge <small>(z. B. Hilfsmittel, Bearbeitungshinweise)</small><textarea id="h-hints" rows="4">${esc(e.hints || '')}</textarea></label>
      </div><footer><button class="btn" data-m="cancel" type="button">Abbrechen</button><button class="btn primary" data-m="ok" type="button">Übernehmen</button></footer></div></div>`;
    root.onclick = ev => {
      const b = ev.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === 'ok') { e.school = $('#h-school').value; e.duration = $('#h-dur').value; e.hints = $('#h-hints').value; e.font = $('#h-font').value; e.fsize = +$('#h-fsize').value; e.taskLabel = $('#h-label').value.trim(); e.accent = $('#h-acc').value; e.titleAlign = $('#h-talign').value; e.noName = !$('#h-name').checked; e.noTotal = !$('#h-total').checked; e.noPts = !$('#h-pts').checked; e.pageNum = $('#h-pnum').checked; e.scoreTable = $('#h-score').checked; e.gradeKey = $('#h-grade').value; touch(); renderPaper(); }
      root.innerHTML = ''; root.onclick = null;
    };
  }

  /* ---------- Ereignisse ---------- */
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-a]');
    if (!ev.target.closest('.dropdown')) document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
    if (!b) return;
    const a = b.dataset.a, id = b.dataset.id, uid = b.dataset.uid;
    const item = () => S.exam.items.find(i => i.uid === uid);
    try {
      switch (a) {
        case 'ki-copy': { const ta = $('#ki-prompt'); try { await navigator.clipboard.writeText(KI_PROMPT); } catch (e) { ta.select(); document.execCommand('copy'); } toast('Text kopiert'); break; }
        case 'imp-all': S.imp.items.forEach(i => i.include = true); renderImp(); break;
        case 'imp-none': S.imp.items.forEach(i => i.include = false); renderImp(); break;
        case 'imp-del': S.imp.items = S.imp.items.filter(i => i.id !== id); renderImp(); break;
        case 'imp-edit': {
          const it = S.imp.items.find(i => i.id === id);
          openEditor({ title: 'Erkannte Aufgabe prüfen', q: it.q, note: it.hints.length ? it.hints.join(' · ') : '', onSave: async d => { it.q = normalizeQ(d, d.subject); it.hints = []; renderImp(); } });
          break;
        }
        case 'imp-apply': {
          const sj = $('#bulk-subject').value, gr = $('#bulk-grade').value, tp = $('#bulk-topic').value.trim();
          S.imp.items.filter(i => i.include).forEach(i => { if (sj) i.q.subject = sj; if (gr) i.q.grade = gr; if (tp) i.q.topic = tp; });
          renderImp(); break;
        }
        case 'imp-json': {
          const list = S.imp.items.filter(i => i.include).map(i => clone(i.q));
          if (!list.length) { toast('Keine Aufgaben ausgewählt.'); break; }
          download(new Blob([JSON.stringify({ format: 'pruefungsbank-aufgaben', version: 1, questions: list }, null, 2)], { type: 'application/json' }), `aufgaben-import-${today()}.json`);
          toast(list.length + ' Aufgaben als JSON gespeichert'); break;
        }
        case 'imp-save': {
          const sel = S.imp.items.filter(i => i.include);
          if (!sel.length) { toast('Keine Aufgaben ausgewählt.'); break; }
          let n = 0;
          try {
            for (const it of sel) {
              const q = clone(it.q); q.id = Store.uuid(); q.updatedBy = S.user || '';
              const saved = await Store.save('questions', q); S.questions.unshift(saved);
              S.imp.items = S.imp.items.filter(x => x !== it); n++;
            }
          } finally {
            if (n) { S.imp.log = [`✓ ${n} Aufgabe${n === 1 ? '' : 'n'} in die Aufgabenbank übernommen. <a href="#/aufgaben">Zur Aufgabenbank</a>`]; $('#imp-status').innerHTML = S.imp.log.map(l => `<div>${l}</div>`).join(''); renderImp(); toast(n + ' Aufgaben übernommen'); }
          }
          break;
        }
        case 'logout': ev.preventDefault(); Store.logout(); S.questions = []; S.exams = []; go(); break;
        case 'f-subject': S.f.subject = b.dataset.v; bankView(); break;
        case 'q-new': openEditor({ title: 'Neue Aufgabe', q: R.newQuestion(S.f.subject), onSave: async d => { await saveQuestion(d); renderList(); } }); break;
        case 'q-edit': openEditor({ title: 'Aufgabe bearbeiten', q: S.questions.find(q => q.id === id), onSave: async d => { await saveQuestion(d); renderList(); } }); break;
        case 'q-dup': { const c = clone(S.questions.find(q => q.id === id)); delete c._u; c.id = Store.uuid(); c.topic = c.topic || ''; await saveQuestion(c); renderList(); break; }
        case 'q-del': if (confirm('Diese Aufgabe wirklich löschen? (Prüfungen, die sie bereits enthalten, behalten ihre Kopie.)')) { await Store.remove('questions', id); S.questions = S.questions.filter(q => q.id !== id); renderList(); toast('Gelöscht'); } break;
        case 'q-import': $('#importfile').click(); break;
        case 'q-export': {
          const list = S.questions.filter(q => matches(q, S.f)).map(q => { const c = clone(q); delete c.id; delete c._u; return c; });
          download(new Blob([JSON.stringify({ format: 'pruefungsbank-aufgaben', version: 1, questions: list }, null, 2)], { type: 'application/json' }), `aufgabenbank-${today()}.json`);
          toast(list.length + ' Aufgaben exportiert'); break;
        }
        case 'e-new': { const e = newExam(); const s = await Store.save('exams', e); S.exams.unshift(s); location.hash = '#/pruefung/' + s.id; break; }
        case 'e-dup': { const c = clone(S.exams.find(e => e.id === id)); delete c._u; c.id = Store.uuid(); c.title += ' (Kopie)'; c.items.forEach(i => i.uid = Store.uuid()); const s = await Store.save('exams', c); S.exams.unshift(s); examsView(); break; }
        case 'e-dupb': {
          const c = clone(S.exams.find(e => e.id === id)); delete c._u; c.id = Store.uuid(); c.title = c.title.replace(/\s*\(Gruppe [AB]\)$/, '') + ' (Gruppe B)';
          const sh = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
          const slots = c.items.map((q, i) => q.type === 'block' ? -1 : i).filter(i => i >= 0), tasks = sh(slots.map(i => c.items[i]));
          slots.forEach((i, k) => { c.items[i] = tasks[k]; });
          c.items.forEach(q => { q.uid = Store.uuid(); if (q.type === 'mc') sh(q.options); });
          const s = await Store.save('exams', c); S.exams.unshift(s); examsView(); toast('Gruppe B angelegt: Aufgaben und Antworten sind gemischt.'); break; }
        case 'e-del': if (confirm('Diese Prüfung wirklich löschen?')) { await Store.remove('exams', id); S.exams = S.exams.filter(e => e.id !== id); examsView(); } break;
        case 'e-head': openHead(); break;
        case 'menu': b.nextElementSibling.classList.toggle('open'); break;
        case 'x-pdf': Export.pdf(S.exam, false); break;
        case 'x-pdf-sol': Export.pdf(S.exam, true); break;
        case 'x-odt': await Export.odt(S.exam, false, { mathText: S.mathText }); break;
        case 'x-odt-sol': await Export.odt(S.exam, true, { mathText: S.mathText }); break;
        case 's-add': addToExam(S.questions.find(q => q.id === id)); break;
        case 's-new': {
          const q = R.newQuestion(S.exam.subject);
          openEditor({ title: 'Neue Aufgabe für diese Prüfung', q, note: 'Die Aufgabe wird in der Prüfung angelegt. Mit „In Bank“ kannst du sie anschließend auch in die Aufgabenbank übernehmen.',
            onSave: async d => { const it = clone(d); it.uid = Store.uuid(); S.exam.items.push(it); touch(); renderPaper(); renderStats(); } });
          break;
        }
        case 's-block':
          openEditor({ title: 'Textblock / Bild einfügen', q: R.newBlock(), note: '',
            onSave: async d => { const it = clone(d); it.uid = Store.uuid(); S.exam.items.push(it); touch(); renderPaper(); renderStats(); } });
          break;
        case 'i-up': case 'i-down': {
          const items = S.exam.items, i = items.findIndex(x => x.uid === uid), j = a === 'i-up' ? i - 1 : i + 1;
          if (j >= 0 && j < items.length) { [items[i], items[j]] = [items[j], items[i]]; touch(); renderPaper(); }
          break;
        }
        case 'i-del': S.exam.items = S.exam.items.filter(x => x.uid !== uid); touch(); renderPaper(); renderStats(); renderSide(); break;
        case 'i-edit': openEditor({ title: 'Aufgabe in dieser Prüfung bearbeiten', q: item(), note: 'Änderungen gelten nur für diese Prüfung, nicht für die Aufgabenbank.',
          onSave: async d => { const i = S.exam.items.findIndex(x => x.uid === uid); d.uid = uid; d.srcId = S.exam.items[i].srcId; d.image = '';  S.exam.items[i] = d; touch(); renderPaper(); renderStats(); } }); break;
        case 'i-bank': { const c = clone(item()); delete c.uid; delete c.srcId; c.id = Store.uuid(); await saveQuestion(c); toast('In die Aufgabenbank übernommen'); renderSide(); break; }
      }
    } catch (err) { if (err && err.message !== 'auth') toast(err.message || 'Fehler'); }
  });

  document.addEventListener('input', ev => {
    const id = ev.target.id;
    if (id === 'f-q') { S.f.q = ev.target.value; renderList(); }
    else if (id === 's-q') { S.side.q = ev.target.value; renderSide(); }
    else if (id === 'e-title' && S.exam) { S.exam.title = ev.target.value; touch(); }
    else if (id === 'imp-topic') S.imp.opts.topic = ev.target.value.trim();
    else if (id === 'u-name') { S.user = ev.target.value.trim(); localStorage.setItem('pb_user', S.user); }
  });
  document.addEventListener('change', async ev => {
    const id = ev.target.id, v = ev.target.value;
    if (id === 'f-grade') { S.f.grade = v; renderList(); }
    else if (id === 'f-afb') { S.f.afb = v; renderList(); }
    else if (id === 'f-topic') { S.f.topic = v; renderList(); }
    else if (id === 's-subject') { S.side.subject = v; renderSide(); }
    else if (id === 'e-subject' && S.exam) { S.exam.subject = v; S.side.subject = v; touch(); renderPaper(); renderSide(); $('#s-subject').value = v; }
    else if (id === 'e-grade' && S.exam) { S.exam.grade = v; touch(); renderPaper(); }
    else if (id === 'e-date' && S.exam) { S.exam.date = v; touch(); renderPaper(); }
    else if (id === 'x-text') { S.mathText = ev.target.checked; }
    else if (id === 'e-sol') { S.solutions = ev.target.checked; renderPaper(); }
    else if (id === 'docfiles') { const fl = [...ev.target.files]; ev.target.value = ''; impFiles(fl); }
    else if (id === 'imp-subject') S.imp.opts.subject = v;
    else if (id === 'imp-grade') S.imp.opts.grade = v;
    else if (id === 'imp-title') S.imp.opts.titleTopic = ev.target.checked;
    else if (id === 'imp-sol') { S.imp.sol = ev.target.checked; renderImp(); }
    else if (ev.target.classList && ev.target.classList.contains('imp-inc')) { const it = S.imp.items.find(i => i.id === ev.target.dataset.id); if (it) { it.include = ev.target.checked; ev.target.closest('.imp-card').classList.toggle('off', !it.include); impUpdateBar(); } }
    else if (id === 'importfile' && ev.target.files[0]) {
      try {
        const j = JSON.parse(await ev.target.files[0].text());
        const arr = Array.isArray(j) ? j : (j.questions || []);
        let n = 0;
        for (const raw of arr) {
          const q = normalizeQ(raw, S.f.subject || 'Mathematik');
          if (!q.text.trim() && !q.parts.some(p => p.text.trim())) continue;
          q.id = Store.uuid(); q.updatedBy = S.user || '';
          const s = await Store.save('questions', q); S.questions.unshift(s); n++;
        }
        toast(n + ' Aufgaben importiert'); bankView();
      } catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
      ev.target.value = '';
    }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { const r = $('#modal-root'); if (r.firstChild) r.innerHTML = ''; } });
  window.addEventListener('beforeunload', ev => { if (S.dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  window.addEventListener('hashchange', go);

  // Gemeinsame Daten regelmäßig auffrischen (nur im Cloud-Modus)
  async function refresh() {
    if (!Store.cloud || Store.needsLogin || document.hidden || $('.modal-back')) return;
    await load();
    const r = route().name;
    if (r === 'aufgaben') renderList();
    else if (r === 'pruefung') renderSide();
    else if (r === 'pruefungen') examsView();
  }
  setInterval(refresh, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  window.PB = { S, go, load };
  (async () => {
    if (!location.hash) location.hash = '#/aufgaben';
    if (!Store.needsLogin) await load();
    go();
  })();
})();
