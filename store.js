/* Datenschicht: Cloud-Modus (Supabase über die REST-Schnittstelle) oder Lokal-Modus (localStorage).
   Keine externe Bibliothek nötig. */
const Store = (() => {
  const cfg = window.PB_CONFIG || {};
  const cloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const base = (cfg.SUPABASE_URL || '').replace(/\/$/, '');
  let sess = null;
  try { sess = JSON.parse(localStorage.getItem('pb_session') || 'null'); } catch (e) { sess = null; }

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      }));

  async function authCall(grant, body) {
    const r = await fetch(`${base}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || 'Anmeldung fehlgeschlagen');
    sess = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600)
    };
    localStorage.setItem('pb_session', JSON.stringify(sess));
  }

  async function token() {
    if (!sess) throw new Error('auth');
    if (sess.expires_at - 60 < Date.now() / 1000) {
      try { await authCall('refresh_token', { refresh_token: sess.refresh_token }); }
      catch (e) { logout(); throw new Error('auth'); }
    }
    return sess.access_token;
  }

  async function rest(method, path, body, headers = {}) {
    const t = await token();
    const r = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (r.status === 401) { logout(); throw new Error('auth'); }
    if (!r.ok) throw new Error((await r.text()) || ('Fehler ' + r.status));
    return r.status === 204 ? null : r.json();
  }

  const fromRow = row => ({ ...row.data, id: row.id, _u: row.updated_at });

  // ---- lokal ----
  const lsGet = t => { try { return JSON.parse(localStorage.getItem('pb_' + t) || '[]'); } catch (e) { return []; } };
  const lsSet = (t, v) => {
    try { localStorage.setItem('pb_' + t, JSON.stringify(v)); }
    catch (e) { throw new Error('Der lokale Speicher ist voll (Bilder verkleinern oder Cloud-Modus nutzen).'); }
  };

  async function login(password) {
    await authCall('password', { email: cfg.SHARED_EMAIL, password });
  }
  function logout() { sess = null; localStorage.removeItem('pb_session'); }

  async function list(table) {
    if (!cloud) return lsGet(table).sort((a, b) => (b._u || '').localeCompare(a._u || ''));
    const rows = await rest('GET', `${table}?select=id,data,updated_at&order=updated_at.desc`);
    return rows.map(fromRow);
  }

  // Speichert ein Objekt. Bei Cloud-Änderungen wird atomar geprüft, ob zwischenzeitlich jemand anders gespeichert hat.
  async function save(table, obj, opts = {}) {
    const { id, _u, ...data } = obj;
    if (!cloud) {
      const all = lsGet(table);
      const now = new Date().toISOString();
      const rec = { ...data, id, _u: now };
      const i = all.findIndex(x => x.id === id);
      if (i >= 0) all[i] = rec; else all.push(rec);
      lsSet(table, all);
      return rec;
    }
    if (_u && !opts.force) {
      const res = await rest('PATCH', `${table}?id=eq.${id}&updated_at=eq.${encodeURIComponent(_u)}`, { data },
        { Prefer: 'return=representation' });
      if (!res.length) {
        const exists = await rest('GET', `${table}?select=id&id=eq.${id}`);
        if (exists.length) { const e = new Error('conflict'); e.conflict = true; throw e; }
        const created = await rest('POST', table, [{ id, data }], { Prefer: 'return=representation' });
        return fromRow(created[0]);
      }
      return fromRow(res[0]);
    }
    const res = await rest('POST', table, [{ id, data }],
      { Prefer: 'resolution=merge-duplicates,return=representation' });
    return fromRow(res[0]);
  }

  async function remove(table, id) {
    if (!cloud) { lsSet(table, lsGet(table).filter(x => x.id !== id)); return; }
    await rest('DELETE', `${table}?id=eq.${id}`);
  }

  return {
    cloud, uuid, login, logout, list, save, remove,
    get needsLogin() { return cloud && !sess; },
    get mode() { return cloud ? 'cloud' : 'lokal'; }
  };
})();
