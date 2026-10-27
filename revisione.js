(() => {
  'use strict';

  const { $, el, E } = ExUI;
  const id = new URLSearchParams(location.search).get('id');
  const it = id ? ExUI.findItem(id) : null;

  if (!it) {
    $('rev-title').textContent = 'Esercizio non trovato';
    $('rev-sub').textContent = 'Non è nella cronologia di oggi: la cronologia riparte ogni giorno e resta solo in questo browser.';
    document.querySelectorAll('main > section').forEach(s => { s.hidden = true; });
    return;
  }

  const n = ExUI.loadHistory().items.findIndex(x => x.id === id) + 1;
  document.title = `Esercizio ${n} · Revisione · SubnetLab`;
  $('rev-title').textContent = `Esercizio ${n} · ${ExUI.LEVEL_NAMES[it.ex.level] || it.ex.level}`;
  const help = [it.hintsUsed ? ExUI.plural(it.hintsUsed, 'suggerimento usato', 'suggerimenti usati') : '', it.solutionShown ? 'soluzione vista' : ''].filter(Boolean);
  $('rev-sub').textContent = `Generato alle ${ExUI.time(it.created)} · ${ExUI.plural(it.attempts.length, 'tentativo', 'tentativi')}` + (help.length ? ' · ' + help.join(', ') : '');
  $('rev-statement').replaceChildren(ExUI.statement(it.ex));

  // Every attempt, the latest first and open; the correction is recomputed from the stored answer
  if (!it.attempts.length) {
    $('rev-attempts').replaceChildren(el('p', { className: 'hint', textContent: 'Nessuna risposta corretta per questo esercizio.' }));
  } else {
    $('rev-attempts').replaceChildren(...it.attempts.map((att, k) => ({ att, k })).reverse().map(({ att, k }, pos) => {
      const res = E.check(it.ex, att.answer);
      const choices = [];
      if (it.ex.baseMode === 'choose') choices.push(`Rete di partenza scelta: ${att.answer.base || 'non indicata'}`);
      if (!it.ex.maskType) choices.push(`Partizionamento scelto: ${att.answer.maskType ? ExUI.maskName(att.answer.maskType) : 'non indicato'}`);
      const status = res.errors ? `${res.correctRows}/${res.total} corrette` : res.warns ? 'corretto, con avvisi' : 'corretto';
      return el('details', { className: 'attempt', open: pos === 0 },
        el('summary', {}, `Tentativo ${k + 1} · ${ExUI.time(att.at)} · ${status}`),
        ExUI.verdict(res),
        choices.length ? el('ul', { className: 'notes' }, ...choices.map(t => el('li', { textContent: t }))) : null,
        res.global.length ? ExUI.issueList(res.global) : null,
        ExUI.correctedTable(it.ex, att.answer, res));
    }));
  }

  const last = it.attempts[it.attempts.length - 1];
  $('rev-solution').replaceChildren(ExUI.solutionBlock(it.ex, last && last.answer.maskType ? last.answer.maskType : null));
})();
