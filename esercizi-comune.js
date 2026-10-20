// Shared by esercizi.html and revisione.html: theme, today's history, and the pieces both pages draw
// (the exercise text, a corrected answer, the site's solution).
const ExUI = (() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });
  const E = SubnetLib.exercise;

  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const k in props) {
      if (k === 'dataset') Object.assign(e.dataset, props[k]);
      else e[k] = props[k];
    }
    kids.forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c); });
    return e;
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  // ---------- Theme (same preference as the calculator) ----------
  const setTheme = t => { document.documentElement.dataset.theme = t; };
  setTheme(store.get('subnet.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  if ($('theme')) {
    $('theme').addEventListener('click', () => {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(t);
      store.set('subnet.theme', t);
    });
  }

  // ---------- Today's history ----------
  // { day: 'YYYY-MM-DD', items: [{ id, created, ex, attempts: [{ at, answer }], hintsUsed, solutionShown }] }
  // A new day starts an empty history.
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const HISTORY_KEY = 'subnet.exercises';
  const loadHistory = () => {
    let h = null;
    try { h = JSON.parse(store.get(HISTORY_KEY)); } catch (e) { h = null; }
    if (!h || h.day !== today() || !Array.isArray(h.items)) h = { day: today(), items: [] };
    return h;
  };
  const saveHistory = h => store.set(HISTORY_KEY, JSON.stringify(h));
  const findItem = id => loadHistory().items.find(it => it.id === id) || null;
  const updateItem = (id, change) => {
    const h = loadHistory(), it = h.items.find(x => x.id === id);
    if (!it) return null;
    change(it);
    saveHistory(h);
    return it;
  };
  const time = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  // ---------- Words ----------
  const LEVEL_NAMES = { facile: 'Facile', medio: 'Medio', difficile: 'Difficile', personalizzato: 'Personalizzato' };
  const maskName = t => (t === 'fixed' ? 'maschera fissa (FLSM)' : t === 'variable' ? 'maschera variabile (VLSM)' : '');
  const FIELDS = [
    ['network', 'Indirizzo di rete'], ['prefix', 'Prefisso'], ['netmask', 'Netmask'], ['broadcast', 'Broadcast'],
    ['gateway', 'Gateway'], ['firstHost', 'Primo host'], ['lastHost', 'Ultimo host'],
  ];
  const FIELD_LABEL = Object.fromEntries(FIELDS);
  const describe = ex => `${LEVEL_NAMES[ex.level] || ex.level} · ${ex.nets.length} reti · ` +
    (ex.maskType ? (ex.maskType === 'fixed' ? 'maschera fissa' : 'maschera variabile') : 'maschera a scelta') +
    (ex.baseMode === 'given' ? ' · ' + ex.base : ' · rete da scegliere');

  // ---------- Exercise text ----------
  const statement = ex => {
    const intro = ex.baseMode === 'given'
      ? `Hai a disposizione la rete ${ex.base}. Suddividila in ${ex.nets.length} sottoreti`
      : `Scegli la rete privata di partenza più adatta (classe A, B o C, con la maschera della sua classe) e suddividila in ${ex.nets.length} sottoreti`;
    const mask = ex.maskType ? ` a ${maskName(ex.maskType)}.` : '. Scegli tu se usare la maschera fissa o variabile.';
    return el('div', { className: 'ex-statement' },
      el('p', { textContent: intro + mask + ' Per ogni sottorete indica indirizzo di rete, prefisso, netmask e broadcast; gateway, primo e ultimo host sono facoltativi.' }),
      el('div', { className: 'table-wrap narrow' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { textContent: 'Rete' }), el('th', { className: 'num', textContent: 'Host richiesti' }))),
        el('tbody', {}, ...ex.nets.map(n => el('tr', {}, el('td', { textContent: n.name }), el('td', { className: 'num', textContent: nf.format(n.hosts) })))))));
  };

  // ---------- Correction ----------
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const verdict = res => {
    const kind = res.errors ? 'err' : res.warns ? 'warn' : 'ok';
    const title = res.errors
      ? `${res.correctRows} sottoreti corrette su ${res.total}: ${plural(res.errors, 'errore', 'errori')}` + (res.warns ? ` e ${plural(res.warns, 'avviso', 'avvisi')}` : '')
      : res.warns ? `Soluzione corretta, ma con ${plural(res.warns, 'avviso', 'avvisi')}` : 'Tutto corretto!';
    const sub = res.errors ? 'I campi sbagliati sono evidenziati in rosso; sotto ogni rete trovi cosa correggere.'
      : res.warns ? 'Funziona, ma si può migliorare: guarda i punti in giallo.' : `Tutte le ${res.total} sottoreti sono giuste.`;
    return el('div', { className: 'verdict ' + kind, textContent: title }, el('small', { textContent: sub }));
  };
  // One issue as a line: "Broadcast: il broadcast di … è …"
  const issueItem = i => el('li', { className: i.level },
    FIELD_LABEL[i.field] ? el('b', { textContent: FIELD_LABEL[i.field] + ': ' }) : null, i.text);
  const issueList = issues => el('ul', { className: 'issues' }, ...issues.map(issueItem));

  // Read-only table of an answer with its correction: wrong values in red, with the right one next to them
  const correctedTable = (ex, answer, res) => {
    const head = el('tr', {}, el('th', { textContent: 'Rete' }), el('th', { className: 'num', textContent: 'Host' }),
      ...FIELDS.map(([, label]) => el('th', { textContent: label })));
    const rows = ex.nets.flatMap((net, i) => {
      const a = (answer.rows || [])[i] || {}, r = res.rows[i];
      const tr = el('tr', {}, el('td', {}, el('b', { textContent: net.name })), el('td', { className: 'num', textContent: nf.format(net.hosts) }),
        ...FIELDS.map(([f]) => {
          const st = r.fields[f] || { status: 'empty' }, v = String(a[f] || '').trim();
          return el('td', { className: 'mono cell-' + st.status },
            v || (st.status === 'err' ? 'mancante' : '—'),
            st.status !== 'ok' && st.status !== 'empty' && st.expected ? el('span', { className: 'expected', textContent: ' → ' + st.expected }) : null);
        }));
      if (!r.issues.length) return [tr];
      return [tr, el('tr', { className: 'feedback' }, el('td', { colSpan: 2 + FIELDS.length }, issueList(r.issues)))];
    });
    return el('div', { className: 'table-wrap' }, el('table', { className: 'ans-table review' }, el('thead', {}, head), el('tbody', {}, ...rows)));
  };

  // ---------- Solution ----------
  const solutionBlock = (ex, chosenMask) => {
    const sol = E.solve(ex, chosenMask);
    if (!sol.ok) return el('p', { className: 'hint', textContent: 'Non riesco a calcolare una soluzione per questo esercizio.' });
    const head = el('tr', {}, el('th', { textContent: 'Rete' }), el('th', { className: 'num', textContent: 'Host' }),
      ...FIELDS.map(([, label]) => el('th', { textContent: label })));
    const rows = sol.rows.map(r => el('tr', {}, el('td', {}, el('b', { textContent: r.name })), el('td', { className: 'num', textContent: nf.format(r.hosts) }),
      ...[r.network, '/' + r.prefix, r.netmask, r.broadcast || '—', r.gateway, r.firstHost, r.lastHost].map(v => el('td', { className: 'mono', textContent: v }))));
    const notes = [];
    if (ex.baseMode === 'choose') notes.push(`Rete di partenza: ${sol.base.cidr} (classe ${sol.cls}); va bene anche un'altra rete privata della stessa classe.`);
    notes.push(`Partizionamento a ${maskName(sol.maskType)}` + (ex.maskType ? '.' : ', quello che hai scelto (o la variabile, se non l\'hai indicato).'));
    notes.push('Le reti sono assegnate dalla più grande alla più piccola. Quando due reti hanno la stessa dimensione, anche l\'ordine inverso è corretto.');
    return el('div', {}, el('ul', { className: 'notes' }, ...notes.map(t => el('li', { textContent: t }))),
      el('div', { className: 'table-wrap' }, el('table', { className: 'ans-table' }, el('thead', {}, head), el('tbody', {}, ...rows))));
  };

  // ---------- Share links ----------
  const encodeEx = ex => btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, level: ex.level, nets: ex.nets, maskType: ex.maskType, baseMode: ex.baseMode, base: ex.base }))));
  const decodeEx = text => {
    try {
      const ex = JSON.parse(decodeURIComponent(escape(atob(text))));
      const okNets = Array.isArray(ex.nets) && ex.nets.length >= 2 && ex.nets.every(n => typeof n.name === 'string' && Number.isInteger(n.hosts) && n.hosts > 0);
      const okBase = ex.baseMode === 'choose' || (ex.baseMode === 'given' && SubnetLib.parseCidr(ex.base || ''));
      return okNets && okBase && [null, 'fixed', 'variable'].includes(ex.maskType) ? ex : null;
    } catch (e) { return null; }
  };

  return { $, el, nf, store, E, loadHistory, saveHistory, findItem, updateItem, time, describe, maskName, statement,
    verdict, issueList, correctedTable, solutionBlock, encodeEx, decodeEx, FIELDS, LEVEL_NAMES, plural };
})();
