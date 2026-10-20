(() => {
  'use strict';

  const { $, el, nf, E } = ExUI;
  let current = null;   // { id, ex }
  const DRAFT_KEY = 'subnet.exerciseDraft';

  const toast = text => {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 1600);
  };
  const genMsg = (text, error) => {
    $('gen-msg').textContent = text;
    $('gen-msg').classList.toggle('error', !!error);
  };

  // ---------- Generator form ----------
  const genRows = $('gen-rows');
  const addGenRow = (name = '', hosts = '') => {
    if (genRows.children.length >= 64) return;
    genRows.append(el('div', { className: 'vlsm-row' },
      el('input', { className: 'name', value: name, placeholder: 'Rete ' + (genRows.children.length + 1), maxLength: 60, ariaLabel: 'Nome della rete' }),
      el('input', { className: 'hosts', type: 'number', min: 1, value: hosts, placeholder: 'host', ariaLabel: 'Numero di host' }),
      el('span', { textContent: 'host' })));
  };
  [['Amministrazione', 50], ['Laboratorio', 25], ['Segreteria', 12], ['Magazzino', 6]].forEach(([n, h]) => addGenRow(n, h));
  $('gen-count').addEventListener('change', e => {
    const want = Math.min(64, Math.max(2, Math.floor(Number(e.target.value)) || 2));
    e.target.value = want;
    while (genRows.children.length < want) addGenRow();
    while (genRows.children.length > want) genRows.lastChild.remove();
  });
  const syncGenForm = () => {
    const custom = document.querySelector('[name="gen-mode"]:checked').value === 'custom';
    $('gen-random').hidden = custom;
    $('gen-custom').hidden = !custom;
    $('gen-base-field').hidden = !custom || document.querySelector('[name="gen-base"]:checked').value !== 'given';
  };
  document.querySelectorAll('[name="gen-mode"], [name="gen-base"]').forEach(r => r.addEventListener('change', syncGenForm));
  syncGenForm();

  $('gen-form').addEventListener('submit', e => {
    e.preventDefault();
    const mode = document.querySelector('[name="gen-mode"]:checked').value;
    const baseMode = document.querySelector('[name="gen-base"]:checked').value;
    let res;
    if (mode === 'custom') {
      const mask = document.querySelector('[name="gen-mask"]:checked').value;
      res = E.generate({
        mode, baseMode, base: $('gen-base-net').value,
        maskType: mask === 'student' ? null : mask,
        nets: [...genRows.children].map(r => ({ name: r.querySelector('.name').value, hosts: Number(r.querySelector('.hosts').value) })),
      });
    } else {
      res = E.generate({ mode, baseMode, level: document.querySelector('[name="gen-level"]:checked').value, randomMask: $('gen-random-mask').checked });
    }
    if (!res.ok) return genMsg(res.message, true);
    genMsg('');
    start(res.exercise);
  });

  // ---------- Current exercise ----------
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const start = (ex, id = null, draft = null) => {
    if (!id) {
      id = newId();
      const h = ExUI.loadHistory();
      h.items.push({ id, created: Date.now(), ex, attempts: [], hintsUsed: 0, solutionShown: false });
      ExUI.saveHistory(h);
    }
    current = { id, ex };
    const n = ExUI.loadHistory().items.findIndex(it => it.id === id) + 1;
    $('ex-title').textContent = `Esercizio ${n || ''} · ${ExUI.LEVEL_NAMES[ex.level] || ex.level}`;
    $('ex-statement').replaceChildren(ExUI.statement(ex));
    renderAnswerForm(ex);
    if (draft) fillAnswer(draft);
    $('ex-hints').replaceChildren();
    $('ex-result').replaceChildren();
    $('ex-solution-out').replaceChildren();
    $('ex-hint').disabled = false;
    $('ex-hint').textContent = 'Suggerimento';
    $('ex-card').hidden = false;
    saveDraft();
    renderHistory();
    if (!draft) $('ex-card').scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const renderAnswerForm = ex => {
    const choices = [];
    if (ex.baseMode === 'choose') {
      choices.push(el('div', { className: 'field' },
        el('label', { htmlFor: 'ans-base', textContent: 'Rete di partenza scelta *' }),
        el('input', { id: 'ans-base', autocomplete: 'off', spellcheck: false, placeholder: 'es. 192.168.0.0/24' })));
    }
    if (!ex.maskType) {
      choices.push(el('fieldset', { className: 'vlsm-base', id: 'ans-mask' },
        el('legend', { textContent: 'Tipo di partizionamento *' }),
        el('label', {}, el('input', { type: 'radio', name: 'ans-mask', value: 'variable' }), ' Maschera variabile (VLSM)'),
        el('label', {}, el('input', { type: 'radio', name: 'ans-mask', value: 'fixed' }), ' Maschera fissa (FLSM)')));
    }
    $('ans-choices').replaceChildren(...choices);
    $('ans-choices').hidden = !choices.length;
    $('ans-body').replaceChildren(...ex.nets.flatMap((net, i) => [
      el('tr', { dataset: { row: i } },
        el('td', {}, el('b', { textContent: net.name })),
        el('td', { className: 'num', textContent: nf.format(net.hosts) }),
        ...ExUI.FIELDS.map(([f, label]) => el('td', {}, el('input', {
          className: 'ans', spellcheck: false, autocomplete: 'off', ariaLabel: `${label} di ${net.name}`,
          placeholder: f === 'prefix' ? '/24' : '', dataset: { row: i, field: f },
        })))),
      el('tr', { className: 'feedback', hidden: true, dataset: { feedback: i } }, el('td', { colSpan: 2 + ExUI.FIELDS.length })),
    ]));
  };

  const readAnswer = () => {
    const rows = current.ex.nets.map(() => ({}));
    document.querySelectorAll('#ans-body input.ans').forEach(inp => { rows[Number(inp.dataset.row)][inp.dataset.field] = inp.value.trim(); });
    const mask = document.querySelector('[name="ans-mask"]:checked');
    return { base: $('ans-base') ? $('ans-base').value.trim() : '', maskType: mask ? mask.value : '', rows };
  };
  const fillAnswer = a => {
    if ($('ans-base')) $('ans-base').value = a.base || '';
    const mask = a.maskType && document.querySelector(`[name="ans-mask"][value="${a.maskType}"]`);
    if (mask) mask.checked = true;
    document.querySelectorAll('#ans-body input.ans').forEach(inp => {
      const row = (a.rows || [])[Number(inp.dataset.row)] || {};
      inp.value = row[inp.dataset.field] || '';
    });
  };
  // The exercise in progress survives a reload of the page
  const saveDraft = () => {
    if (!current) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ id: current.id, ex: current.ex, answer: readAnswer() })); } catch (e) { /* ignore */ }
  };
  $('ans-form').addEventListener('input', e => {
    // A field edited after a correction loses its colour until the next one
    if (e.target.classList.contains('ans') || e.target.id === 'ans-base') e.target.classList.remove('f-ok', 'f-err', 'f-warn');
    saveDraft();
  });
  $('ans-form').addEventListener('change', saveDraft);

  // ---------- Correction ----------
  $('ans-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!current) return;
    const answer = readAnswer();
    const res = E.check(current.ex, answer);
    showCorrection(res);
    ExUI.updateItem(current.id, it => it.attempts.push({ at: Date.now(), answer }));
    renderHistory();
  });

  const showCorrection = res => {
    document.querySelectorAll('#ans-body input.ans').forEach(inp => {
      const st = res.rows[Number(inp.dataset.row)].fields[inp.dataset.field] || { status: 'empty' };
      inp.classList.remove('f-ok', 'f-err', 'f-warn');
      if (st.status !== 'empty') inp.classList.add('f-' + st.status);
      inp.title = st.status !== 'ok' && st.expected ? 'Valore atteso: ' + st.expected : '';
    });
    document.querySelectorAll('#ans-body tr.feedback').forEach(tr => {
      const r = res.rows[Number(tr.dataset.feedback)];
      tr.hidden = !r.issues.length;
      tr.firstChild.replaceChildren(ExUI.issueList(r.issues));
    });
    const baseIssues = res.global.filter(g => g.field === 'base');
    if ($('ans-base')) {
      $('ans-base').classList.remove('f-ok', 'f-err', 'f-warn');
      $('ans-base').classList.add(baseIssues.some(g => g.level === 'err') ? 'f-err' : baseIssues.length ? 'f-warn' : 'f-ok');
    }
    if ($('ans-mask')) $('ans-mask').classList.toggle('f-err', res.global.some(g => g.field === 'maskType'));
    $('ex-result').replaceChildren(ExUI.verdict(res), ...(res.global.length ? [ExUI.issueList(res.global)] : []));
    $('ex-result').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // ---------- Hints and solution ----------
  $('ex-hint').addEventListener('click', () => {
    if (!current) return;
    const answer = readAnswer();
    const list = E.hints(current.ex, answer.maskType || null);
    const it = ExUI.updateItem(current.id, x => { x.hintsUsed = Math.min(list.length, x.hintsUsed + 1); });
    const shown = it ? it.hintsUsed : 1;
    $('ex-hints').replaceChildren(...list.slice(0, shown).map(t => el('li', { textContent: t })));
    if (shown >= list.length) { $('ex-hint').disabled = true; $('ex-hint').textContent = 'Nessun altro suggerimento'; }
    renderHistory();
  });
  $('ex-solution').addEventListener('click', () => {
    if (!current) return;
    const answer = readAnswer();
    $('ex-solution-out').replaceChildren(el('h3', { className: 'section-label', textContent: 'Soluzione' }), ExUI.solutionBlock(current.ex, answer.maskType || null));
    ExUI.updateItem(current.id, it => { it.solutionShown = true; });
    renderHistory();
    $('ex-solution-out').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('ex-share').addEventListener('click', async () => {
    if (!current) return;
    const link = location.href.split('#')[0] + '#ex=' + ExUI.encodeEx(current.ex);
    try { await navigator.clipboard.writeText(link); toast('Link all\'esercizio copiato'); } catch (e) { prompt('Copia questo link:', link); }
  });

  // ---------- History ----------
  const statusOf = it => {
    const last = it.attempts[it.attempts.length - 1];
    if (!last) return { cls: 'none', text: 'Da correggere' };
    const r = E.check(it.ex, last.answer);
    if (r.errors) return { cls: 'err', text: `${r.correctRows}/${r.total} corrette` };
    return r.warns ? { cls: 'warn', text: 'Corretto, con avvisi' } : { cls: 'ok', text: 'Corretto' };
  };
  const renderHistory = () => {
    const h = ExUI.loadHistory();
    if (!h.items.length) {
      $('hist').replaceChildren(el('p', { className: 'hint', textContent: 'Nessun esercizio svolto oggi. Gli esercizi che generi compaiono qui; la cronologia riparte ogni giorno.' }));
      $('hist-clear').disabled = true;
      return;
    }
    $('hist-clear').disabled = false;
    $('hist').replaceChildren(el('div', { className: 'table-wrap' }, el('table', { className: 'hist-table' },
      el('thead', {}, el('tr', {}, ...['#', 'Ora', 'Esercizio', 'Esito', 'Tentativi', 'Aiuti', ''].map(t => el('th', { textContent: t })))),
      el('tbody', {}, ...h.items.map((it, i) => {
        const st = statusOf(it);
        const help = [it.hintsUsed ? ExUI.plural(it.hintsUsed, 'suggerimento', 'suggerimenti') : '', it.solutionShown ? 'soluzione vista' : ''].filter(Boolean).join(', ');
        return el('tr', { className: current && current.id === it.id ? 'current' : '' },
          el('td', { textContent: String(i + 1) }),
          el('td', { textContent: ExUI.time(it.created) }),
          el('td', { textContent: ExUI.describe(it.ex) }),
          el('td', {}, el('span', { className: 'badge ' + st.cls, textContent: st.text })),
          el('td', { className: 'num', textContent: String(it.attempts.length) }),
          el('td', { textContent: help || '—' }),
          el('td', {}, el('a', { className: 'btn small', href: 'revisione.html?id=' + encodeURIComponent(it.id), target: '_blank', rel: 'noopener', textContent: 'Apri' })));
      })))));
  };
  $('hist-clear').addEventListener('click', () => {
    if (!confirm('Cancellare tutti gli esercizi di oggi dalla cronologia?')) return;
    ExUI.saveHistory({ day: ExUI.loadHistory().day, items: [] });
    renderHistory();
  });
  window.addEventListener('storage', e => { if (e.key === 'subnet.exercises') renderHistory(); });

  // ---------- Boot: a shared exercise in the link, or the one in progress ----------
  const openFromLink = () => {
    const fromLink = /#ex=(.+)$/.exec(location.hash);
    if (!fromLink) return false;
    history.replaceState(null, '', location.pathname + location.search);
    const shared = ExUI.decodeEx(fromLink[1]);
    if (!shared) { toast('Il link all\'esercizio non è valido'); return false; }
    start(shared);
    toast('Esercizio aperto dal link');
    return true;
  };
  // A link pasted while the page is already open only changes the hash
  window.addEventListener('hashchange', openFromLink);

  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY)); } catch (e) { draft = null; }
  if (!openFromLink() && draft && draft.ex && ExUI.findItem(draft.id)) start(draft.ex, draft.id, draft.answer);
  renderHistory();
})();
