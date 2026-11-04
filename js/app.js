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
    delete q.id; delete q._u;
    return q;
  }

  /* ---------- Rahmen ---------- */
  function shell(active, inner) {
    const nav = (id, label) => `<a href="#/${id}" class="${active === id ? 'on' : ''}">${label}</a>`;
    $('#app').innerHTML = `<div class="shell">
      <aside class="side">
        <div class="brand"><i>✓</i>Prüfungsbank</div>
        <nav class="nav">${nav('aufgaben', 'Aufgabenbank')}${nav('pruefungen', 'Prüfungen')}${nav('info', 'Info &amp; Einstellungen')}</nav>
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
    const snip = `<div class="snip">${R.md(q.text || '(kein Text)')}</div>`;
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
    const root = $('#modal-root');

    const afbSel = (path, val) => `<select data-path="${path}" data-num>${[1, 2, 3].map(a => `<option value="${a}" ${+val === a ? 'selected' : ''}>${AFBL[a]}</option>`).join('')}</select>`;
    const hint = () => ({
      luecke: 'Lücken im Text mit <code>[[Antwort]]</code> markieren – im Druck wird eine Linie daraus.',
      mc: 'Formeln: <code>$x^2$</code> inline, <code>$$\\frac{a}{b}$$</code> als eigene Zeile. Code: <code>`x = 1`</code>',
      wf: 'Der Aufgabentext ist die Aussage, die als wahr oder falsch bewertet wird.',
      teil: 'Gemeinsamer Einleitungstext; die Teilaufgaben a), b), … legst du darunter an.',
      frei: 'Formeln: <code>$x^2$</code> inline, <code>$$\\frac{a}{b}$$</code> als eigene Zeile. Code: <code>```…```</code>'
    })[d.type];

    const ensure = () => {
      if (d.type === 'mc' && (!d.options || d.options.length < 2)) d.options = [{ t: '', ok: false }, { t: '', ok: false }];
      if (d.type === 'teil' && (!d.parts || !d.parts.length)) d.parts = [{ text: '', points: 2, afb: d.afb || 1, solution: '' }];
    };

    const dynHtml = () => {
      let h = '';
      if (d.type === 'teil') {
        h += `<label class="f">Antwortzeilen je Teilaufgabe <small>(freier Platz im Druck)</small><input type="number" min="0" step="1" data-num data-path="lines" value="${d.lines || 0}"></label>`;
        h += d.parts.map((p, i) => `<div class="sub"><div class="row" style="align-items:center"><b>Teilaufgabe ${String.fromCharCode(97 + i)})</b>
          <button type="button" class="btn sm danger" data-m="part-del" data-i="${i}" ${d.parts.length < 2 ? 'disabled' : ''} style="justify-self:end">Entfernen</button></div>
          <textarea data-path="parts.${i}.text" placeholder="Aufgabentext der Teilaufgabe">${esc(p.text)}</textarea>
          <div class="row"><label class="f">Punkte<input type="number" min="0" step="0.5" data-num data-path="parts.${i}.points" value="${p.points}"></label>
          <label class="f">Anforderungsbereich${afbSel(`parts.${i}.afb`, p.afb)}</label></div>
          <textarea data-path="parts.${i}.solution" placeholder="Lösung / Erwartungshorizont">${esc(p.solution)}</textarea></div>`).join('');
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
        h += `<label class="f">Antwortzeilen <small>(freier Platz im Druck, 0 = keiner)</small><input type="number" min="0" step="1" data-num data-path="lines" value="${d.lines || 0}"></label>`;
      }
      h += `<label class="f">${d.type === 'luecke' ? 'Hinweis zur Lösung (optional)' : 'Lösung / Erwartungshorizont'}<textarea data-path="solution">${esc(d.solution)}</textarea></label>`;
      return h;
    };

    const imgHtml = () => `<div class="sub" id="imgbox"><b>Bild / Skizze (optional)</b>
      ${d.image ? `<img src="${esc(d.image)}" alt="" style="max-width:100%;max-height:150px;border:1px solid var(--line);border-radius:6px;background:#fff">
      <div class="row" style="align-items:end"><label class="f">Breite im Dokument<select data-path="imgw" data-num>${[30, 50, 60, 80, 100].map(w => `<option value="${w}" ${+d.imgw === w ? 'selected' : ''}>${w} %</option>`).join('')}</select></label>
      <button type="button" class="btn sm danger" data-m="img-del" style="justify-self:start">Bild entfernen</button></div>` : ''}
      <input type="file" id="imgfile" accept="image/*"></div>`;

    root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
      <header><h2>${esc(opts.title)}</h2><button type="button" data-m="cancel" aria-label="Schließen">✕</button></header>
      <div class="modal-body two">
        <form class="form" id="qform" onsubmit="return false">
          ${opts.note ? `<div class="meta" style="background:#fff3d6;padding:8px 10px;border-radius:8px">${esc(opts.note)}</div>` : ''}
          <div class="row">
            <label class="f">Fach<select data-path="subject">${R.SUBJECTS.map(s => `<option ${d.subject === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <label class="f">Klassenstufe<select data-path="grade">${gradeOptions(d.grade)}</select></label>
          </div>
          <div class="row">
            <label class="f">Thema<input type="text" data-path="topic" list="topiclist" value="${esc(d.topic)}" placeholder="z. B. Quadratische Funktionen"></label>
            <label class="f">Aufgabentyp<select data-path="type">${Object.entries(R.TYPES).map(([k, v]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          </div>
          <datalist id="topiclist">${topics().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
          <label class="f">Aufgabentext<textarea data-path="text" rows="5">${esc(d.text)}</textarea><small id="hint">${hint()}</small></label>
          <div id="dyn" class="form">${dynHtml()}</div>
          ${imgHtml()}
          <label class="f">Schlagwörter <small>(durch Komma getrennt)</small><input type="text" data-path="tagsText" value="${esc((d.tags || []).join(', '))}"></label>
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
      if (p === 'type' && e.type === 'change') { ensure(); redyn(); return; }
      if (p === 'imgw') { preview(); return; }
      preview();
    };
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    $('#prevsol').addEventListener('change', preview);

    const close = () => { root.innerHTML = ''; root.onclick = null; root.onchange = null; };
    root.onchange = null;
    root.onclick = async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const i = +b.dataset.i;
      switch (b.dataset.m) {
        case 'cancel': close(); break;
        case 'opt-add': d.options.push({ t: '', ok: false }); redyn(); break;
        case 'opt-del': d.options.splice(i, 1); redyn(); break;
        case 'part-add': d.parts.push({ text: '', points: 2, afb: d.afb || 1, solution: '' }); redyn(); break;
        case 'part-del': d.parts.splice(i, 1); redyn(); break;
        case 'img-del': d.image = ''; $('#imgbox').outerHTML = imgHtml(); preview(); break;
        case 'save':
          if (!d.text.trim() && !(d.type === 'teil' && d.parts.some(p => p.text.trim()))) { toast('Bitte einen Aufgabentext eingeben.'); return; }
          if (d.type === 'mc' && !d.options.some(o => o.ok)) { if (!confirm('Es ist keine Antwort als richtig markiert. Trotzdem speichern?')) return; }
          try { await opts.onSave(d); close(); } catch (err) { toast(err.message); }
          break;
      }
    };
    root.onchange = async e => {
      if (e.target.id !== 'imgfile' || !e.target.files[0]) return;
      try { d.image = await fileToDataUrl(e.target.files[0]); $('#imgbox').outerHTML = imgHtml(); preview(); }
      catch (err) { toast('Bild konnte nicht geladen werden.'); }
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
        return `<article class="card"><div class="tags"><span class="tag ${e.subject}">${esc(e.subject)}</span>${e.grade ? `<span class="tag">${esc(R.gradeLabel(e.grade))}</span>` : ''}<span class="tag">${(e.items || []).length} Aufgaben</span><span class="tag">${R.fmt(total)} BE</span></div>
        <b style="font-size:17px">${esc(e.title)}</b><div class="meta">${e.updatedBy ? esc(e.updatedBy) + ' · ' : ''}${e._u ? new Date(e._u).toLocaleDateString('de-DE') : ''}</div>
        <div class="btns"><a class="btn sm primary" style="text-decoration:none" href="#/pruefung/${e.id}">Öffnen</a>
        <button class="btn sm" data-a="e-dup" data-id="${e.id}">Duplizieren</button><button class="btn sm danger" data-a="e-del" data-id="${e.id}">Löschen</button></div></article>`;
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
        <button class="btn sm" data-a="e-head">Kopfzeile …</button>
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
          <small class="meta">Karten per Drag &amp; Drop in den Bogen ziehen oder auf „+ In Prüfung“ klicken.</small></div>
          <div class="list" id="s-list"></div></aside>
      </div></div>`);
    renderPaper(); renderStats(); renderSide();
  }

  function renderPaper() { const p = $('#paper'); if (p && S.exam) p.innerHTML = R.paper(S.exam, { edit: true, solutions: S.solutions }); }
  function renderStats() {
    const el = $('#stats'); if (!el || !S.exam) return;
    const st = R.afbStats(S.exam.items);
    el.innerHTML = `<span><b>${(S.exam.items || []).length}</b> Aufgaben</span><span><b>${R.fmt(st.total)}</b> BE gesamt</span>` +
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

  /* ---------- Info ---------- */
  function infoView() {
    shell('info', `<div class="page-h"><h1>Info &amp; Einstellungen</h1></div><div class="info">
      <label class="f" style="max-width:340px">Dein Name <small>(wird bei Aufgaben und Prüfungen als „zuletzt bearbeitet von“ gespeichert)</small>
      <input type="text" id="u-name" value="${esc(S.user)}" placeholder="z. B. Frau Meier"></label>
      <h2>So arbeitet die Prüfungsbank</h2>
      <p><b>Aufgabenbank:</b> Hier liegen alle Aufgaben, sortierbar nach Fach, Klassenstufe, Thema und Anforderungsbereich.<br>
      <b>Prüfungen:</b> Aufgaben aus der Bank werden als Kopie in die Prüfung gezogen. Änderungen dort wirken nur in dieser Prüfung. Mit „In Bank“ kannst du eine geänderte Aufgabe zusätzlich als neue Bankaufgabe sichern.<br>
      <b>Export:</b> PDF über den Druckdialog des Browsers („Als PDF speichern“), ODT zum Weiterbearbeiten in LibreOffice oder Word – jeweils mit oder ohne Lösungen.</p>
      <h2>Schreibweise</h2>
      <p>Formeln: <code>$x^2 + 1$</code> im Text, <code>$$\\frac{a}{b}$$</code> als eigene Zeile. Fett: <code>**Text**</code>, kursiv: <code>*Text*</code>, Code: <code>\`x = 1\`</code> oder dreifache Backticks für Blöcke. Lückentext: <code>[[Antwort]]</code>.</p>
      <h2>Speicherort</h2>
      <p>${Store.cloud ? 'Die Daten liegen in der gemeinsamen Datenbank (Supabase). Alle Kolleginnen und Kollegen sehen dieselben Aufgaben. Änderungen werden automatisch gespeichert; speichert jemand anderes zeitgleich dieselbe Aufgabe, wirst du gefragt.'
        : 'Aktuell läuft die App im <b>Lokal-Modus</b>: Die Daten bleiben nur in diesem Browser. Für die gemeinsame Nutzung trägst du in <code>js/config.js</code> die Supabase-Zugangsdaten ein (siehe README).'}</p></div>`);
  }

  /* ---------- Kopfzeile-Dialog ---------- */
  function openHead() {
    const e = S.exam, root = $('#modal-root');
    root.innerHTML = `<div class="modal-back"><div class="modal narrow"><header><h2>Kopfzeile der Prüfung</h2><button data-m="cancel" type="button">✕</button></header>
      <div class="modal-body form">
        <label class="f">Schule / Institution<input type="text" id="h-school" value="${esc(e.school || '')}"></label>
        <label class="f">Dauer in Minuten<input type="number" id="h-dur" min="0" value="${esc(e.duration || '')}"></label>
        <label class="f">Hinweise für die Prüflinge <small>(z. B. Hilfsmittel, Bearbeitungshinweise)</small><textarea id="h-hints" rows="4">${esc(e.hints || '')}</textarea></label>
      </div><footer><button class="btn" data-m="cancel" type="button">Abbrechen</button><button class="btn primary" data-m="ok" type="button">Übernehmen</button></footer></div></div>`;
    root.onclick = ev => {
      const b = ev.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === 'ok') { e.school = $('#h-school').value; e.duration = $('#h-dur').value; e.hints = $('#h-hints').value; touch(); renderPaper(); }
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
        case 'i-up': case 'i-down': {
          const items = S.exam.items, i = items.findIndex(x => x.uid === uid), j = a === 'i-up' ? i - 1 : i + 1;
          if (j >= 0 && j < items.length) { [items[i], items[j]] = [items[j], items[i]]; touch(); renderPaper(); }
          break;
        }
        case 'i-del': S.exam.items = S.exam.items.filter(x => x.uid !== uid); touch(); renderPaper(); renderStats(); renderSide(); break;
        case 'i-edit': openEditor({ title: 'Aufgabe in dieser Prüfung bearbeiten', q: item(), note: 'Änderungen gelten nur für diese Prüfung, nicht für die Aufgabenbank.',
          onSave: async d => { const i = S.exam.items.findIndex(x => x.uid === uid); d.uid = uid; d.srcId = S.exam.items[i].srcId; S.exam.items[i] = d; touch(); renderPaper(); renderStats(); } }); break;
        case 'i-bank': { const c = clone(item()); delete c.uid; delete c.srcId; c.id = Store.uuid(); await saveQuestion(c); toast('In die Aufgabenbank übernommen'); renderSide(); break; }
      }
    } catch (err) { if (err && err.message !== 'auth') toast(err.message || 'Fehler'); }
  });

  document.addEventListener('input', ev => {
    const id = ev.target.id;
    if (id === 'f-q') { S.f.q = ev.target.value; renderList(); }
    else if (id === 's-q') { S.side.q = ev.target.value; renderSide(); }
    else if (id === 'e-title' && S.exam) { S.exam.title = ev.target.value; touch(); }
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
