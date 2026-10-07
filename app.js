(() => {
  'use strict';

  const MAX_SUBNETS = 4096;
  const COLUMNS = [
    { id: 'label', name: 'Nome / note', off: true },
    { id: 'netmask', name: 'Netmask' },
    { id: 'wild', name: 'Wildcard', off: true },
    { id: 'range', name: 'Intervallo indirizzi', off: true },
    { id: 'usable', name: 'IP utilizzabili', off: true },
    { id: 'gw', name: 'Gateway' },
    { id: 'bc', name: 'Broadcast' },
    { id: 'hosts', name: 'Host', num: true, off: true },
    { id: 'req', name: 'Richiesti', num: true, plan: true, off: true },
    { id: 'divide', name: 'Dividi' },
    { id: 'join', name: 'Unisci' },
  ];

  const $ = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });

  // All the subnet maths lives in subnet-lib.js, loaded before this file
  const {
    parseIp, ipStr, maskBits, wildStr, parseMask, sizeOf, hostsOf, hostBitsFor, maskForHosts,
    lastOf, cidr, usableOf, gatewayNum, gatewayOf, firstHostNum, lastHostNum, broadcastOf,
    classFor, classOf, typeOf,
  } = SubnetLib;
  const colorOf = m => `hsl(${(m * 47 + 200) % 360} 62% var(--block-l))`;

  // ---------- Tree ----------
  const node = (addr, mask) => ({ addr: addr >>> 0, mask, children: null, label: '', req: 0, grown: 0, wan: false });
  const clearMeta = n => { n.label = ''; n.req = 0; n.grown = 0; n.wan = false; };
  const split = n => {
    n.children = [node(n.addr, n.mask + 1), node(n.addr + sizeOf(n.mask + 1), n.mask + 1)];
    clearMeta(n);
  };
  // Splits `base` as needed and returns the /mask leaf that starts at `addr`
  const carve = (base, addr, mask) => {
    let n = base;
    while (n.mask < mask) {
      if (!n.children) split(n);
      n = n.children[addr >= n.children[1].addr ? 1 : 0];
    }
    return n;
  };
  const leavesOf = (n, out = []) => {
    if (n.children) n.children.forEach(c => leavesOf(c, out)); else out.push(n);
    return out;
  };

  let root = node(parseIp('192.168.0.0'), 24);
  // After a generated plan, leaves without a name are unassigned space rather than networks
  let planned = false;
  let planFixed = false;
  let showFree = false;
  const isFree = n => planned && !n.label;

  // ---------- State <-> URL ----------
  const serialize = () => {
    let bits = '';
    const labels = {}, reqs = {};
    (function walk(n) {
      if (n.children) { bits += '1'; n.children.forEach(walk); return; }
      bits += '0';
      if (n.label) labels[cidr(n)] = n.label;
      if (n.req) reqs[cidr(n)] = [n.req, n.grown, n.wan ? 1 : 0];
    })(root);
    const p = new URLSearchParams();
    p.set('net', cidr(root));
    if (bits !== '0') p.set('tree', bits);
    if (planned) p.set('plan', planFixed ? 'f' : 'v');
    if (Object.keys(labels).length) p.set('labels', JSON.stringify(labels));
    if (Object.keys(reqs).length) p.set('req', JSON.stringify(reqs));
    return p.toString();
  };

  const deserialize = str => {
    const p = new URLSearchParams(str.replace(/^#/, ''));
    const net = p.get('net');
    if (!net) return false;
    const [a, m] = net.split('/');
    const addr = parseIp(a || ''), mask = Number(m);
    if (addr === null || !Number.isInteger(mask) || mask < 0 || mask > 32) return false;
    const json = k => { try { return JSON.parse(p.get(k) || '{}') || {}; } catch (e) { return {}; } };
    const labels = json('labels'), reqs = json('req');
    const bits = p.get('tree') || '0';
    let i = 0, count = 0;
    const r = node((addr & maskBits(mask)) >>> 0, mask);
    (function walk(n) {
      const b = bits[i++];
      if (b === '1' && n.mask < 32 && count < MAX_SUBNETS) {
        count++;
        split(n);
        n.children.forEach(walk);
        return;
      }
      const l = labels[cidr(n)], q = reqs[cidr(n)];
      if (typeof l === 'string') n.label = l;
      if (Array.isArray(q) && q[0] > 0) { n.req = Number(q[0]) || 0; n.grown = Number(q[1]) || n.req; n.wan = !!q[2]; }
    })(r);
    root = r;
    planned = !!p.get('plan');
    planFixed = p.get('plan') === 'f';
    return true;
  };

  const undoStack = [], redoStack = [];
  let current = '';
  const writeUrl = () => {
    try { history.replaceState(null, '', '#' + current); } catch (e) { /* file:// or sandboxed */ }
  };
  const commit = () => {
    const next = serialize();
    if (next === current) return;
    undoStack.push(current);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    current = next;
    writeUrl();
    render();
  };
  const travel = (from, to) => {
    if (!from.length) return;
    to.push(current);
    current = from.pop();
    deserialize(current);
    writeUrl();
    syncForm();
    render();
  };

  // ---------- Rendering ----------
  let leaves = [];
  // Subnets (by CIDR) whose binary detail row is open
  const expanded = new Set();
  // 32 bits as dotted octets, network part and host part in different colours
  const binRow = (label, value, mask) => {
    const netPart = el('span', { className: 'bits-net' }), hostPart = el('span', { className: 'bits-host' });
    for (let i = 0; i < 32; i++) {
      const target = i < mask ? netPart : hostPart;
      target.textContent += (i && i % 8 === 0 ? '.' : '') + ((value >>> (31 - i)) & 1);
    }
    return el('div', { className: 'bin-row' }, el('span', { textContent: label }),
      el('span', {}, netPart, hostPart), el('span', { className: 'dec', textContent: ipStr(value >>> 0) }));
  };

  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const k in props) {
      if (k === 'dataset') Object.assign(e.dataset, props[k]);
      else if (k === 'style') e.style.cssText = props[k];
      else e[k] = props[k];
    }
    kids.forEach(c => e.append(c));
    return e;
  };
  const tile = (label, value) => el('div', { className: 'tile' }, el('small', { textContent: label }), el('b', { textContent: value }));

  const render = () => {
    // Walk the tree: leaves in order, and for each row the join blocks starting there.
    leaves = [];
    const starts = [];
    let maxDepth = 0;
    (function walk(n, depth) {
      if (!n.children) {
        maxDepth = Math.max(maxDepth, depth);
        n.depth = depth;
        leaves.push(n);
        return 1;
      }
      const first = leaves.length;
      (starts[first] = starts[first] || []).push(n);
      n.first = first;
      n.count = n.children.reduce((s, c) => s + walk(c, depth + 1), 0);
      return n.count;
    })(root, 0);
    const joinCols = Math.max(maxDepth, 1);

    // Header
    const head = el('tr', {}, el('th', { textContent: 'Sottorete' }));
    COLUMNS.forEach(c => {
      const th = el('th', { textContent: c.name, dataset: { col: c.id } });
      if (c.num) th.className = 'num';
      if (c.id === 'join') th.colSpan = joinCols;
      head.append(th);
    });
    $('thead').replaceChildren(head);

    // Rows
    const cell = (col, text, cls = 'mono') => el('td', { className: cls, textContent: text, dataset: { col } });
    // An open detail row sits under its subnet, so every join block spanning it grows by one row
    const open = leaves.map(n => expanded.has(cidr(n)));
    const openIn = (first, count) => open.slice(first, first + count).filter(Boolean).length;
    const dataCols = 1 + COLUMNS.filter(c => c.id !== 'join' && !hidden.includes(c.id) && (planned || !c.plan)).length;
    const rows = leaves.flatMap((n, i) => {
      const free = isFree(n);
      const tr = el('tr', { className: free ? 'free' : '', dataset: { i } });
      tr.append(
        el('td', {},
          el('button', {
            className: 'toggle no-print', type: 'button', textContent: open[i] ? '▾' : '▸', ariaExpanded: String(open[i]),
            title: (open[i] ? 'Nascondi' : 'Mostra') + ' gli indirizzi in binario', dataset: { act: 'toggle' },
          }),
          el('span', { className: 'swatch', style: `background:${free ? 'var(--border)' : colorOf(n.mask)}` }),
          el('button', { className: 'cidr', type: 'button', textContent: cidr(n), title: 'Copia ' + cidr(n), dataset: { copy: cidr(n) } }),
          el('span', { className: 'inline-name', textContent: n.label })),
        el('td', { dataset: { col: 'label' } },
          el('input', { className: 'label', value: n.label, placeholder: free ? 'libera — aggiungi nome…' : 'aggiungi nome…', maxLength: 60, ariaLabel: 'Nome per ' + cidr(n) })),
        cell('netmask', ipStr(maskBits(n.mask))),
        cell('wild', wildStr(n.mask)),
        cell('range', ipStr(n.addr) + ' – ' + ipStr(lastOf(n))),
        cell('usable', usableOf(n)),
        cell('gw', gatewayOf(n)),
        cell('bc', broadcastOf(n)),
        cell('hosts', nf.format(hostsOf(n.mask)), 'num'),
        cell('req', n.req ? nf.format(n.req) : '—', 'num'),
      );

      const canSplit = n.mask < 32 && leaves.length < MAX_SUBNETS;
      tr.append(el('td', { dataset: { col: 'divide' } }, el('button', {
        className: 'btn small', type: 'button', textContent: 'Dividi', disabled: !canSplit,
        title: canSplit ? `Dividi in 2 × /${n.mask + 1}` : 'Non ulteriormente divisibile', dataset: { act: 'split' },
      })));

      // Join: filler up to the deepest level, then ancestors that start on this row (deepest first)
      const fill = joinCols - n.depth;
      if (fill > 0) {
        tr.append(el('td', { className: 'join-empty', colSpan: fill, rowSpan: open[i] ? 2 : 1, textContent: maxDepth === 0 ? '—' : '', dataset: { col: 'join' } }));
      }
      (starts[i] || []).slice().reverse().forEach(a => {
        tr.append(el('td', { className: 'join', rowSpan: a.count + openIn(a.first, a.count), dataset: { col: 'join' } },
          el('button', {
            type: 'button', textContent: '/' + a.mask,
            title: `Unisci ${a.count} sottoreti in ${cidr(a)}`,
            dataset: { act: 'join', first: a.first, count: a.count },
          })));
      });
      if (!open[i]) return [tr];
      return [tr, el('tr', { className: 'detail' + (free ? ' free' : '') }, el('td', { colSpan: dataCols },
        el('div', { className: 'bin' },
          binRow('Indirizzo di rete', n.addr, n.mask),
          binRow('Maschera di sottorete', maskBits(n.mask), n.mask),
          binRow('Primo host', firstHostNum(n), n.mask),
          binRow('Ultimo host', lastHostNum(n), n.mask),
          binRow('Default gateway', gatewayNum(n), n.mask),
          binRow('Broadcast', lastOf(n), n.mask))))];
    });
    $('tbody').replaceChildren(...rows);

    // Map
    const total = sizeOf(root.mask);
    const freeLeaves = leaves.filter(isFree);
    const freeSize = freeLeaves.reduce((s, n) => s + sizeOf(n.mask), 0);
    const collapseFree = planned && !showFree && freeLeaves.length > 0;
    // With free space collapsed the assigned networks share the bar, so they stay readable inside a big network
    const mapTotal = collapseFree ? total - freeSize : total;
    const blocks = [];
    leaves.forEach((n, i) => {
      const free = isFree(n);
      if (free && collapseFree) return;
      blocks.push(el('button', {
        type: 'button',
        className: free ? 'free' : '',
        textContent: n.label || (free ? 'libera' : '/' + n.mask),
        title: cidr(n) + (n.label ? ' — ' + n.label : free ? ' — libera' : '') + ` (${nf.format(hostsOf(n.mask))} host)` +
          (free ? '. Clicca per nascondere lo spazio libero dalla tabella.' : ''),
        style: `flex:${(sizeOf(n.mask) / mapTotal) * 10000} 1 0;` + (free ? '' : `background:${colorOf(n.mask)}`),
        dataset: { i },
      }));
    });
    if (collapseFree) {
      blocks.push(el('button', {
        type: 'button', className: 'free', id: 'map-free',
        textContent: `spazio libero: ${nf.format(freeSize)} indirizzi`,
        title: 'Non in scala. Clicca per mostrare lo spazio libero nella tabella (e la colonna Unisci).',
        style: 'flex:0 0 22%',
      }));
    }
    $('map').replaceChildren(...blocks);

    $('table').classList.toggle('no-free', planned && !showFree);
    $('table').classList.toggle('no-plan', !planned);
    COLUMNS.filter(c => c.plan).forEach(c => { $('chip-' + c.id).hidden = !planned; });

    $('stats').innerHTML = '';
    if (planned) {
      const used = leaves.length - freeLeaves.length;
      $('stats').append(
        el('b', { textContent: cidr(root) }), ' · ',
        el('b', { textContent: nf.format(used) }), used === 1 ? ' rete assegnata · ' : ' reti assegnate · ',
        el('b', { textContent: nf.format(total - freeSize) }), ' indirizzi usati su ' + nf.format(total) + ' · ',
        el('b', { textContent: nf.format(freeSize) }), ' liberi');
    } else {
      $('stats').append(
        el('b', { textContent: cidr(root) }), ' · ',
        el('b', { textContent: nf.format(leaves.length) }), leaves.length === 1 ? ' sottorete · ' : ' sottoreti · ',
        el('b', { textContent: nf.format(total) }), ' indirizzi');
    }
    renderPlanDetails();
    renderTopo();
    $('undo').disabled = !undoStack.length;
    $('redo').disabled = !redoStack.length;
    $('reset').disabled = !root.children;
  };

  // Efficiency summary and calculation steps, rebuilt from the requests stored on the planned leaves
  const renderPlanDetails = () => {
    const items = planned ? leaves.filter(n => n.req) : [];
    $('summary').hidden = $('steps').hidden = !items.length;
    if (!items.length) return;

    const reqTotal = items.reduce((s, n) => s + n.req, 0);
    const capacity = items.reduce((s, n) => s + hostsOf(n.mask), 0);
    const addrs = items.reduce((s, n) => s + sizeOf(n.mask), 0);
    $('tiles').replaceChildren(
      tile('Host richiesti', nf.format(reqTotal)),
      tile('Host disponibili', nf.format(capacity)),
      tile('Host inutilizzati', nf.format(capacity - reqTotal)),
      tile('Efficienza', (reqTotal / capacity * 100).toFixed(1).replace('.', ',') + '%'),
      tile('Indirizzi occupati', nf.format(addrs)));

    const ownBits = items.map(n => hostBitsFor(n.grown));
    const varTotal = ownBits.reduce((s, h) => s + Math.pow(2, h), 0);
    const fixTotal = items.length * Math.pow(2, Math.max(...ownBits));
    const describe = t => `${nf.format(t)} indirizzi` + (classFor(t) ? ` (entra in una classe ${classFor(t)})` : ' (oltre una classe A)');
    $('compare').replaceChildren(
      'Confronto sugli stessi dati — ',
      el(planFixed ? 'span' : 'b', { textContent: 'maschera variabile: ' + describe(varTotal) }), ' · ',
      el(planFixed ? 'b' : 'span', { textContent: 'maschera fissa: ' + describe(fixTotal) }),
      fixTotal > varTotal ? `. La variabile risparmia ${nf.format(fixTotal - varTotal)} indirizzi.` : '. Nessuna differenza.');

    // Steps
    const margin = items.some(n => n.grown !== n.req);
    const heads = ['Rete', 'Host richiesti'].concat(margin ? ['Con margine'] : [],
      ['+ rete e broadcast', 'Potenza di 2 sufficiente', 'Bit di host', 'Prefisso', 'Netmask'], planFixed ? ['Assegnata'] : [], ['Sottorete']);
    $('steps-head').replaceChildren(el('tr', {}, ...heads.map(h => el('th', { textContent: h }))));
    $('steps-body').replaceChildren(...items.map((n, k) => {
      const h = ownBits[k], own = 32 - h;
      const cells = [n.label, nf.format(n.req)].concat(margin ? [nf.format(n.grown)] : [], [
        `${nf.format(n.grown)} + 2 = ${nf.format(n.grown + 2)}`,
        `2^${h} = ${nf.format(Math.pow(2, h))} ≥ ${nf.format(n.grown + 2)}`,
        String(h),
        `32 − ${h} = /${own}`,
        ipStr(maskBits(own)),
      ], planFixed ? ['/' + n.mask] : [], [cidr(n)]);
      return el('tr', {}, ...cells.map((c, j) => el('td', { className: j ? 'mono' : '', textContent: c })));
    }));
    $('steps-intro').replaceChildren(
      'Per ogni rete: si aggiungono 2 indirizzi agli host (rete e broadcast), si prende la più piccola potenza di 2 che li contiene, ' +
      'l\'esponente è il numero di bit di host e il prefisso è 32 meno quei bit. ',
      planFixed
        ? el('b', { textContent: `Maschera fissa: tutte le reti usano il prefisso della più grande, /${items[0].mask} (${ipStr(maskBits(items[0].mask))}).` })
        : el('b', { textContent: 'Maschera variabile: le reti vengono assegnate dalla più grande alla più piccola, una di seguito all\'altra.' }));
    $('steps-outro').replaceChildren(
      'Totale da assegnare: ', el('b', { textContent: nf.format(addrs) + ' indirizzi' }),
      ` su ${nf.format(sizeOf(root.mask))} disponibili in `, el('b', { textContent: cidr(root) }), '.');
  };

  // ---------- Feedback ----------
  let toastTimer;
  const toast = text => {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  };
  const copy = async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = el('textarea', { value: text, style: 'position:fixed;opacity:0' });
      (document.querySelector('dialog[open]') || document.body).append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(okMsg);
  };
  const download = (name, text, type) => {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const highlight = (first, count, on) => {
    for (let i = first; i < first + count; i++) {
      document.querySelectorAll(`#tbody tr[data-i="${i}"], #map [data-i="${i}"]`).forEach(e => e.classList.toggle('hl', on));
    }
  };

  // ---------- Network form ----------
  const setMsg = (text, error) => {
    $('msg').textContent = text;
    $('msg').classList.toggle('error', !!error);
  };
  const showMaskInfo = () => {
    const m = parseMask($('mask').value);
    $('mask-info').replaceChildren(...(m === null ? [] : [
      'Prefisso ', el('b', { textContent: '/' + m }), ' · netmask ', el('b', { textContent: ipStr(maskBits(m)) }),
      ' · wildcard ', el('b', { textContent: wildStr(m) }), ' · ', el('b', { textContent: nf.format(hostsOf(m)) }), ' host']));
  };
  const syncForm = () => {
    $('addr').value = ipStr(root.addr);
    $('mask').value = root.mask;
    showMaskInfo();
    setMsg('');
  };

  const applyNetwork = () => {
    const addrEl = $('addr'), maskEl = $('mask');
    // Allow typing/pasting "address/prefix" or "address netmask" in the address field
    const parts = addrEl.value.trim().split(/[\/\s]+/);
    if (parts.length > 1) maskEl.value = parts[1];
    const addr = parseIp(parts[0]);
    const mask = parseMask(maskEl.value);
    addrEl.classList.toggle('invalid', addr === null);
    maskEl.classList.toggle('invalid', mask === null);
    if (addr === null) return setMsg('Indirizzo non valido: usa quattro numeri da 0 a 255, es. 192.168.0.0', true);
    if (mask === null) return setMsg('Maschera non valida: usa un prefisso da 0 a 32, una netmask (255.255.255.0) o una wildcard (0.0.0.255).', true);

    const net = (addr & maskBits(mask)) >>> 0;
    root = node(net, mask);
    planned = false;
    syncForm();
    setMsg(net !== addr ? `${ipStr(addr)} non è un indirizzo di rete per /${mask}: corretto in ${ipStr(net)}.` : '');
    commit();
  };

  $('net-form').addEventListener('submit', e => { e.preventDefault(); applyNetwork(); });
  $('mask').addEventListener('input', showMaskInfo);
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    $('addr').value = b.dataset.preset;
    applyNetwork();
  }));

  // ---------- Planner ----------
  const VLSM_MAX = 64;
  const vlsmRows = $('vlsm-rows');
  const vlsmMsg = (text, error) => {
    $('vlsm-msg').textContent = text;
    $('vlsm-msg').classList.toggle('error', !!error);
  };
  const addVlsmRow = (hosts = '') => {
    if (vlsmRows.children.length >= VLSM_MAX) return;
    vlsmRows.append(el('div', { className: 'vlsm-row' },
      el('input', { className: 'name', placeholder: 'Rete ' + (vlsmRows.children.length + 1), maxLength: 60, ariaLabel: 'Nome della rete' }),
      el('input', { className: 'hosts', type: 'number', min: 1, value: hosts, placeholder: 'host', ariaLabel: 'Numero di host' }),
      el('span', { textContent: 'host' }),
      el('button', { className: 'rm', type: 'button', textContent: '×', title: 'Rimuovi questa rete', ariaLabel: 'Rimuovi questa rete' })));
  };
  const syncVlsmCount = () => {
    $('vlsm-count').value = vlsmRows.children.length;
    [...vlsmRows.children].forEach((r, i) => { r.querySelector('.name').placeholder = 'Rete ' + (i + 1); });
  };
  [50, 25, 10].forEach(addVlsmRow);

  $('vlsm-count').addEventListener('change', e => {
    const want = Math.min(VLSM_MAX, Math.max(1, Math.floor(Number(e.target.value)) || 1));
    while (vlsmRows.children.length < want) addVlsmRow();
    while (vlsmRows.children.length > want) vlsmRows.lastChild.remove();
    syncVlsmCount();
  });
  $('vlsm-add').addEventListener('click', () => {
    addVlsmRow();
    syncVlsmCount();
    vlsmRows.lastChild.querySelector('.hosts').focus();
  });
  vlsmRows.addEventListener('click', e => {
    if (!e.target.classList.contains('rm') || vlsmRows.children.length <= 1) return;
    e.target.closest('.vlsm-row').remove();
    syncVlsmCount();
  });

  const intField = (id, max) => {
    const v = Number($(id).value || 0);
    const ok = Number.isInteger(v) && v >= 0 && v <= max;
    $(id).classList.toggle('invalid', !ok);
    return ok ? v : null;
  };

  $('vlsm-form').addEventListener('submit', e => {
    e.preventDefault();
    const growth = intField('vlsm-growth', 500), wan = intField('vlsm-wan', VLSM_MAX);
    if (growth === null) return vlsmMsg('Il margine di crescita deve essere una percentuale intera tra 0 e 500.', true);
    if (wan === null) return vlsmMsg(`I link punto-punto devono essere un numero intero tra 0 e ${VLSM_MAX}.`, true);

    let bad = false;
    const reqs = [...vlsmRows.children].map((r, i) => {
      const hEl = r.querySelector('.hosts'), hosts = Number(hEl.value);
      const grown = Math.ceil(hosts * (100 + growth) / 100);
      const ok = hEl.value.trim() !== '' && Number.isInteger(hosts) && hosts >= 1 && grown <= 16777214;
      hEl.classList.toggle('invalid', !ok);
      bad = bad || !ok;
      return { name: r.querySelector('.name').value.trim() || 'Rete ' + (i + 1), hosts, grown, wan: false };
    });
    if (bad) return vlsmMsg('Indica per ogni rete un numero intero di host (almeno 1).', true);
    // Point-to-point links only ever need two hosts, so the growth margin does not apply to them
    for (let i = 1; i <= wan; i++) reqs.push({ name: 'Link ' + i, hosts: 2, grown: 2, wan: true, mask: 30 });

    const fixed = document.querySelector('[name="vlsm-mode"]:checked').value === 'fixed';
    const useCurrent = document.querySelector('[name="vlsm-base"]:checked').value === 'current';
    const res = SubnetLib.allocate(reqs, { fixed, base: useCurrent ? root : null });
    if (!res.ok) {
      return vlsmMsg(res.error === 'too-small'
        ? `${cidr(root)} è troppo piccola: servono ${nf.format(res.needed)} indirizzi (almeno una /${res.neededMask}), ne ha ${nf.format(sizeOf(root.mask))}.`
        : `Servono ${nf.format(res.needed)} indirizzi: non entrano nemmeno in una classe A (10.0.0.0/8).`, true);
    }
    const { items, needed, cls } = res;
    const base = node(res.base.addr, res.base.mask);
    items.forEach(r => Object.assign(carve(base, r.addr, r.mask), { label: r.name, req: r.hosts, grown: r.grown, wan: r.wan }));

    root = base;
    planned = true;
    planFixed = fixed;
    showFree = false;
    syncForm();
    commit();
    const free = sizeOf(root.mask) - needed;
    const how = fixed ? `maschera fissa /${items[0].mask} (${ipStr(maskBits(items[0].mask))})` : 'maschera variabile';
    vlsmMsg(`Piano a ${how} su ${cidr(root)}${cls ? ' (classe ' + cls + ')' : ''}: ${items.length} reti, ${nf.format(needed)} indirizzi assegnati` +
      (free ? `, ${nf.format(free)} ancora liberi.` : ', nessuno libero.'));
    $('stats').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // ---------- Table / map events ----------
  const leafOfEvent = e => {
    const tr = e.target.closest('tr[data-i]');
    return tr ? leaves[Number(tr.dataset.i)] : null;
  };
  const findNode = (first, count) => {
    let found = null;
    (function walk(n) {
      if (!n.children || found) return;
      if (n.first === first && n.count === count) { found = n; return; }
      n.children.forEach(walk);
    })(root);
    return found;
  };

  $('tbody').addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.copy) return copy(t.dataset.copy, 'Copiato ' + t.dataset.copy);
    if (t.dataset.act === 'toggle') {
      const key = cidr(leafOfEvent(e));
      expanded.has(key) ? expanded.delete(key) : expanded.add(key);
      return render();
    }
    if (t.dataset.act === 'split') {
      const n = leafOfEvent(e);
      if (n && n.mask < 32) {
        // In a plan, unnamed leaves count as free space (hidden by default): the halves keep the name so they stay visible
        const name = planned ? n.label : '';
        split(n);
        n.children.forEach(c => { c.label = name; });
        commit();
      }
    } else if (t.dataset.act === 'join') {
      const n = findNode(Number(t.dataset.first), Number(t.dataset.count));
      if (n) {
        const named = planned && leavesOf(n).find(l => l.label);
        n.children = null;
        clearMeta(n);
        n.label = named ? named.label : '';
        commit();
      }
    }
  });
  $('tbody').addEventListener('change', e => {
    const t = e.target, n = leafOfEvent(e);
    if (n && t.classList.contains('label')) { n.label = t.value.trim(); commit(); }
  });
  ['mouseover', 'mouseout', 'focusin', 'focusout'].forEach(type => {
    $('tbody').addEventListener(type, e => {
      const d = e.target.dataset;
      if (d && d.act === 'join') highlight(Number(d.first), Number(d.count), type === 'mouseover' || type === 'focusin');
    });
  });

  $('map').addEventListener('mouseover', e => e.target.dataset.i && highlight(Number(e.target.dataset.i), 1, true));
  $('map').addEventListener('mouseout', e => e.target.dataset.i && highlight(Number(e.target.dataset.i), 1, false));
  $('map').addEventListener('click', e => {
    if (planned && e.target.classList.contains('free')) { showFree = !showFree; return render(); }
    const row = $('tbody').querySelector(`tr[data-i="${e.target.dataset.i}"]`);
    if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  // ---------- Toolbar ----------
  $('undo').addEventListener('click', () => travel(undoStack, redoStack));
  $('redo').addEventListener('click', () => travel(redoStack, undoStack));
  $('reset').addEventListener('click', () => { root.children = null; clearMeta(root); planned = false; commit(); });
  $('sort').addEventListener('click', () => {
    // Re-lay the subnets largest first: sizes and names are kept, addresses are reassigned.
    // In a plan the free space is left out and ends up after the assigned networks.
    const items = leaves.filter(n => !isFree(n)).sort((a, b) => a.mask - b.mask);
    const base = node(root.addr, root.mask);
    let next = base.addr;
    items.forEach(n => {
      Object.assign(carve(base, next, n.mask), { label: n.label, req: n.req, grown: n.grown, wan: n.wan });
      next += sizeOf(n.mask);
    });
    root = base;
    const before = current;
    commit();
    toast(current === before ? 'Le sottoreti sono già in ordine' : 'Sottoreti riordinate dalla più grande alla più piccola');
  });
  $('share').addEventListener('click', () => copy(location.href.split('#')[0] + '#' + current, 'Link copiato'));
  $('csv').addEventListener('click', () => {
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    const head = ['Sottorete', 'Nome', 'Netmask', 'Wildcard', 'Primo indirizzo', 'Ultimo indirizzo', 'IP utilizzabili', 'Gateway', 'Broadcast', 'Host', 'Host richiesti'];
    const lines = [head].concat(leaves.map(n => [cidr(n), n.label || (isFree(n) ? '(libera)' : ''), ipStr(maskBits(n.mask)), wildStr(n.mask),
      ipStr(n.addr), ipStr(lastOf(n)), usableOf(n), gatewayOf(n), broadcastOf(n), hostsOf(n.mask), n.req || '']));
    download(`subnet-${ipStr(root.addr)}_${root.mask}.csv`, lines.map(l => l.map(q).join(',')).join('\r\n'), 'text/csv');
  });
  $('print').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => { $('steps').open = true; });
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.target.matches('input, select, textarea')) return;
    e.preventDefault();
    e.shiftKey ? travel(redoStack, undoStack) : travel(undoStack, redoStack);
  });

  // ---------- Cisco configuration ----------
  const showConfig = () => { $('cfg-out').textContent = topoBuild().text; };
  const openConfig = () => { showConfig(); $('cfg').showModal(); };
  $('cfg-dhcp').addEventListener('change', showConfig);
  $('cfg-copy').addEventListener('click', () => copy($('cfg-out').textContent, 'Configurazione copiata'));
  $('cfg-save').addEventListener('click', () => download(`config-${ipStr(root.addr)}_${root.mask}.txt`, $('cfg-out').textContent, 'text/plain'));
  $('cfg-close').addEventListener('click', () => $('cfg').close());

  // ---------- Address analyzer ----------
  $('an-form').addEventListener('submit', e => {
    e.preventDefault();
    const fail = text => { $('an-msg').textContent = text; $('an-msg').classList.add('error'); $('an-out').replaceChildren(); };
    const parts = $('an-input').value.trim().split(/[\/\s]+/).filter(Boolean);
    const ip = parseIp(parts[0] || '');
    if (ip === null) return fail('Indirizzo non valido: usa quattro numeri da 0 a 255, es. 192.168.1.130/26');
    const leaf = ip >= root.addr && ip <= lastOf(root) ? leaves.find(l => ip >= l.addr && ip <= lastOf(l)) : null;
    let mask, note = '';
    if (parts.length > 1) {
      mask = parseMask(parts[1]);
      if (mask === null) return fail('Maschera non valida: usa un prefisso da 0 a 32, una netmask o una wildcard.');
    } else if (leaf) {
      mask = leaf.mask;
      note = `Maschera non indicata: uso quella della sottorete in tabella (/${mask}).`;
    } else {
      const o = ip >>> 24;
      mask = o < 128 ? 8 : o < 192 ? 16 : o < 224 ? 24 : 32;
      note = `Maschera non indicata: uso quella predefinita della classe (/${mask}).`;
    }
    // Classful rule: a prefix shorter than the class default would be a supernet, not a subnet of that class
    const first = ip >>> 24, classMask = first < 128 ? 8 : first < 192 ? 16 : first < 224 ? 24 : 0;
    if (mask < classMask) {
      return fail(`Maschera non valida: ${ipStr(ip)} è di classe ${classOf(ip)}, la cui maschera predefinita è /${classMask} ` +
        `(${ipStr(maskBits(classMask))}). Il prefisso deve essere tra /${classMask} e /32, mentre /${mask} è più corto. Per aggregare più reti usa la sezione Supernetting.`);
    }
    $('an-msg').textContent = note;
    $('an-msg').classList.remove('error');

    const n = node((ip & maskBits(mask)) >>> 0, mask);
    const role = mask >= 31 ? 'Host' : ip === n.addr ? 'Indirizzo di rete' : ip === lastOf(n) ? 'Indirizzo di broadcast' : 'Host';
    const item = (k, v) => el('div', {}, el('small', { textContent: k }), el('b', { textContent: v }));
    $('an-out').replaceChildren(
      el('div', { className: 'an-grid' },
        item('Rete', cidr(n)),
        item('Ruolo dell\'indirizzo', role),
        item('Netmask', ipStr(maskBits(mask))),
        item('Wildcard', wildStr(mask)),
        item('Broadcast', broadcastOf(n)),
        item('Host utilizzabili', usableOf(n)),
        item('Numero di host', nf.format(hostsOf(mask))),
        item('Classe', classOf(ip)),
        item('Tipo', typeOf(ip)),
        item(`Nella rete in uso sopra (${cidr(root)})`, leaf
          ? 'Sì: sottorete ' + cidr(leaf) + (leaf.label ? ' — ' + leaf.label : isFree(leaf) ? ' — libera' : '')
          : 'No: l\'indirizzo non ne fa parte')),
      el('div', { className: 'bin' },
        binRow('Indirizzo', ip, mask),
        binRow('Netmask', maskBits(mask), mask),
        binRow('Wildcard', ~maskBits(mask) >>> 0, mask),
        binRow('Rete', n.addr, mask),
        binRow('Broadcast', lastOf(n) >>> 0, mask)),
      el('p', { className: 'legend' },
        el('span', { className: 'bits-net mono', textContent: '1010' }), ` = ${mask} bit di rete · `,
        el('span', { className: 'bits-host mono', textContent: '1010' }), ` = ${32 - mask} bit di host`));
  });

  // ---------- Preferences (columns, theme) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  let hidden;
  try { hidden = JSON.parse(store.get('subnet.columns2')); } catch (e) { hidden = null; }
  if (!Array.isArray(hidden)) hidden = COLUMNS.filter(c => c.off).map(c => c.id);
  const colStyle = document.head.appendChild(el('style'));
  const applyColumns = () => {
    // Without the name column the name is shown next to the subnet address instead
    colStyle.textContent = hidden.map(id => `#table [data-col="${id}"]{display:none}`).join('') +
      (hidden.includes('label') ? '#table .inline-name{display:inline}' : '');
  };
  COLUMNS.forEach(c => {
    const cb = el('input', { type: 'checkbox', checked: !hidden.includes(c.id) });
    cb.addEventListener('change', () => {
      hidden = cb.checked ? hidden.filter(h => h !== c.id) : hidden.concat(c.id);
      store.set('subnet.columns2', JSON.stringify(hidden));
      applyColumns();
      render();
    });
    $('chips').append(el('label', { className: 'chip', id: 'chip-' + c.id }, cb, el('span', { textContent: c.name })));
  });
  applyColumns();

  const setTheme = t => { document.documentElement.dataset.theme = t; };
  setTheme(store.get('subnet.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('theme').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    store.set('subnet.theme', t);
  });

  // ---------- Topology: which router and switches each network lives on ----------
  const topoDefaults = () => ({ routers: 1, switches: 1, routing: 'static', access: 5, linkBase: '10.0.0.0', nets: {}, uplink: [], links: [], linksEdited: false });
  let topo = topoDefaults();
  try { topo = Object.assign(topoDefaults(), JSON.parse(store.get('subnet.topo')) || {}); } catch (e) { /* keep defaults */ }
  const saveTopo = () => store.set('subnet.topo', JSON.stringify(topo));

  const lanNets = () => leaves.filter(n => !isFree(n) && !n.wan);
  const netCfg = (n, k) => {
    const c = topo.nets[cidr(n)] || (topo.nets[cidr(n)] = { router: 0, vlan: (k + 1) * 10, sw: topo.switches ? [0] : [] });
    c.router = Math.min(c.router, topo.routers - 1);
    c.sw = c.sw.filter(s => s < topo.switches);
    return c;
  };
  // 'R<n>' or 'S<n>': the device a switch's uplink goes to
  const uplinkOf = i => {
    const u = topo.uplink[i] || '', idx = Number(u.slice(1));
    const ok = (u[0] === 'R' && idx < topo.routers) || (u[0] === 'S' && idx < topo.switches && idx !== i);
    return ok ? u : 'R0';
  };
  // Until the user edits them, router links default to a chain R1-R2-R3…
  const syncLinks = () => {
    if (!topo.linksEdited) topo.links = Array.from({ length: Math.max(0, topo.routers - 1) }, (_, i) => ({ a: i, b: i + 1 }));
    topo.links = topo.links.filter(l => l.a < topo.routers && l.b < topo.routers);
  };
  // Link subnets come from the plan's point-to-point links first, then from a separate /30 range
  const linkSubnets = () => {
    const pool = leaves.filter(n => !isFree(n) && n.wan);
    const parsed = parseIp(topo.linkBase);
    const base = ((parsed === null ? parseIp('10.0.0.0') : parsed) & ~3) >>> 0;
    return topo.links.map((l, j) => ({ a: l.a, b: l.b, source: j < pool.length ? 'dal piano' : 'piano separato',
      addr: (j < pool.length ? pool[j].addr : base + 4 * (j - pool.length)) >>> 0 }));
  };
  // Router links (by position) whose binary detail row is open
  const openLinks = new Set();

  const topoBuild = () => {
    syncLinks();
    const warns = [], out = [];
    const R = topo.routers, S = topo.switches;
    const nets = lanNets().map((n, k) => ({ n, name: n.label || 'Rete ' + (k + 1), c: netCfg(n, k) }));
    const links = linkSubnets();
    const lmask = ipStr(maskBits(30));
    const tag = s => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'RETE';
    const banner = name => out.push('!', `!==================== ${name} ====================`, 'hostname ' + name, '!');

    // Switch tree
    const up = Array.from({ length: S }, (_, i) => uplinkOf(i));
    const kids = i => up.map((u, j) => (u === 'S' + i ? j : -1)).filter(j => j >= 0);
    const subtree = (i, seen = new Set()) => {
      if (seen.has(i)) return seen;
      seen.add(i);
      kids(i).forEach(j => subtree(j, seen));
      return seen;
    };
    const vlansUnder = i => {
      const sub = subtree(i);
      return [...new Set(nets.filter(x => x.c.sw.some(s => sub.has(s))).map(x => x.c.vlan))].sort((a, b) => a - b);
    };
    for (let i = 0; i < S; i++) {
      const seen = new Set();
      let cur = i;
      while (up[cur][0] === 'S' && !seen.has(cur)) { seen.add(cur); cur = Number(up[cur].slice(1)); }
      if (up[cur][0] === 'S') warns.push(`SW${i + 1} non arriva a nessun router: i collegamenti tra switch formano un anello.`);
    }
    nets.forEach((x, k) => {
      if (nets.findIndex(y => y.c.vlan === x.c.vlan) < k) warns.push(`${x.name}: la VLAN ${x.c.vlan} è già usata da un'altra rete.`);
    });
    links.forEach((l, j) => { if (l.a === l.b) warns.push(`Collegamento ${j + 1}: unisce R${l.a + 1} a se stesso e viene ignorato.`); });
    links.forEach((l, j) => {
      if (links.findIndex(m => m.addr === l.addr) < j) warns.push(`Collegamento ${j + 1}: la sottorete ${ipStr(l.addr)}/30 è già usata da un altro collegamento.`);
      if (nets.some(x => l.addr >= x.n.addr && l.addr <= lastOf(x.n))) warns.push(`Collegamento ${j + 1}: la sottorete ${ipStr(l.addr)}/30 si sovrappone a una rete della tabella.`);
    });
    const realLinks = links.filter(l => l.a !== l.b);

    for (let r = 0; r < R; r++) {
      const rn = 'R' + (r + 1);
      banner(rn);
      const mine = nets.filter(x => x.c.router === r);
      const direct = up.map((u, i) => (u === 'R' + r ? i : -1)).filter(i => i >= 0);
      let port = 0;
      const trunkPort = {};
      direct.forEach(d => {
        trunkPort[d] = port++;
        out.push('interface GigabitEthernet0/' + trunkPort[d], ` description Trunk verso SW${d + 1}`, ' no shutdown', '!');
      });
      mine.forEach(x => {
        const mask = ipStr(maskBits(x.n.mask));
        const d = direct.find(s => { const sub = subtree(s); return x.c.sw.some(w => sub.has(w)); });
        if (d === undefined) {
          if (x.c.sw.length) warns.push(`${x.name}: gli switch scelti non sono collegati a ${rn}, che ne ha il gateway.`);
          out.push('interface GigabitEthernet0/' + port++, ' description ' + x.name, ` ip address ${gatewayOf(x.n)} ${mask}`, ' no shutdown', '!');
          return;
        }
        const sub = subtree(d);
        x.c.sw.filter(w => !sub.has(w)).forEach(w => warns.push(`${x.name}: SW${w + 1} non è raggiungibile dalla stessa porta di ${rn} usata per SW${d + 1}.`));
        out.push(`interface GigabitEthernet0/${trunkPort[d]}.${x.c.vlan}`, ' description ' + x.name,
          ' encapsulation dot1Q ' + x.c.vlan, ` ip address ${gatewayOf(x.n)} ${mask}`, '!');
      });
      let ser = 0;
      const myLinks = realLinks.filter(l => l.a === r || l.b === r);
      myLinks.forEach(l => {
        const other = l.a === r ? l.b : l.a;
        out.push('interface Serial0/0/' + ser++, ` description Collegamento con R${other + 1}`,
          ` ip address ${ipStr(l.addr + (l.a === r ? 1 : 2))} ${lmask}`, ' no shutdown', '!');
      });
      if ($('cfg-dhcp').checked) {
        mine.forEach(x => out.push('ip dhcp excluded-address ' + gatewayOf(x.n), 'ip dhcp pool ' + tag(x.name),
          ` network ${ipStr(x.n.addr)} ${ipStr(maskBits(x.n.mask))}`, ' default-router ' + gatewayOf(x.n), '!'));
      }
      if (R < 2 || topo.routing === 'none') continue;

      if (topo.routing === 'static') {
        // Breadth-first search over the router links: next hop towards every other router
        const via = { [r]: null }, queue = [r];
        while (queue.length) {
          const cur = queue.shift();
          realLinks.forEach(l => {
            if (l.a !== cur && l.b !== cur) return;
            const nb = l.a === cur ? l.b : l.a;
            if (nb in via) return;
            via[nb] = cur === r ? ipStr(l.addr + (l.a === r ? 2 : 1)) : via[cur];
            queue.push(nb);
          });
        }
        nets.filter(x => x.c.router !== r).forEach(x => {
          const hop = via[x.c.router];
          if (hop) out.push(`ip route ${ipStr(x.n.addr)} ${ipStr(maskBits(x.n.mask))} ${hop}`);
          else warns.push(`${rn} non ha un percorso verso ${x.name} (su R${x.c.router + 1}): manca un collegamento tra router.`);
        });
        realLinks.filter(l => l.a !== r && l.b !== r).forEach(l => {
          const hop = via[l.a] || via[l.b];
          if (hop) out.push(`ip route ${ipStr(l.addr)} ${lmask} ${hop}`);
        });
        out.push('!');
      } else if (topo.routing === 'ospf') {
        out.push('router ospf 1',
          ...mine.map(x => ` network ${ipStr(x.n.addr)} ${wildStr(x.n.mask)} area 0`),
          ...myLinks.map(l => ` network ${ipStr(l.addr)} ${wildStr(30)} area 0`), '!');
      } else {
        // RIP announces classful networks
        const classful = a => { const o = a >>> 24; return ipStr((a & maskBits(o < 128 ? 8 : o < 192 ? 16 : 24)) >>> 0); };
        const list = [...new Set(mine.map(x => classful(x.n.addr)).concat(myLinks.map(l => classful(l.addr))))];
        out.push('router rip', ' version 2', ' no auto-summary', ...list.map(a => ' network ' + a), '!');
      }
    }

    for (let i = 0; i < S; i++) {
      banner('SW' + (i + 1));
      const all = vlansUnder(i);
      all.forEach(v => out.push('vlan ' + v, ' name ' + tag(nets.find(x => x.c.vlan === v).name), '!'));
      const trunk = (portName, to, vlans) => out.push('interface ' + portName, ' description Trunk verso ' + to,
        ' switchport mode trunk', ...(vlans.length ? [' switchport trunk allowed vlan ' + vlans.join(',')] : []), '!');
      trunk('GigabitEthernet0/1', up[i][0] === 'R' ? 'R' + (Number(up[i].slice(1)) + 1) : 'SW' + (Number(up[i].slice(1)) + 1), all);
      const down = kids(i);
      down.forEach((c, k) => trunk(k === 0 ? 'GigabitEthernet0/2' : 'FastEthernet0/' + (25 - k), 'SW' + (c + 1), vlansUnder(c)));
      let p = 1;
      nets.filter(x => x.c.sw.includes(i)).forEach(x => {
        const last = p + topo.access - 1;
        out.push(`interface range FastEthernet0/${p} - ${last}`, ' description ' + x.name,
          ' switchport mode access', ' switchport access vlan ' + x.c.vlan, '!');
        p = last + 1;
      });
      if (p - 1 > 24 - Math.max(0, down.length - 1)) warns.push(`SW${i + 1}: servono ${p - 1} porte access, più di quelle di uno switch a 24 porte.`);
    }
    if (!nets.length) warns.unshift('Non ci sono reti in tabella: genera un piano o dividi la rete.');

    const head = ['! Configurazione per dispositivo - ' + cidr(root), '! Adatta i nomi delle interfacce ai tuoi dispositivi',
      ...warns.map(w => '! ATTENZIONE: ' + w)];
    return { text: head.concat(out).join('\n'), warns };
  };

  const renderTopo = () => {
    syncLinks();
    const lans = lanNets();
    const pick = (options, value, dataset) => {
      const s = el('select', { dataset }, ...options.map(([v, t]) => el('option', { value: v, textContent: t })));
      s.value = value;
      return s;
    };
    const num = (value, min, max, dataset, cls = '') => el('input', { type: 'number', min, max, value, className: cls, dataset });
    const field = (label, control, title = '') => el('div', { className: 'field', title }, el('label', { textContent: label }), control);
    const routers = Array.from({ length: topo.routers }, (_, i) => [i, 'R' + (i + 1)]);
    const head = (...cols) => el('thead', {}, el('tr', {}, ...cols.map(c => el('th', { textContent: c }))));
    const table = (thead, rows) => el('div', { className: 'table-wrap' }, el('table', {}, thead, el('tbody', {}, ...rows)));

    const parts = [el('div', { className: 'vlsm-top' },
      field('Router', num(topo.routers, 1, 8, { t: 'routers' })),
      field('Switch', num(topo.switches, 0, 12, { t: 'switches' })),
      field('Routing tra router', pick([['static', 'Rotte statiche'], ['ospf', 'OSPF'], ['rip', 'RIP v2'], ['none', 'Nessuno']], topo.routing, { t: 'routing' })),
      field('Porte access per VLAN', num(topo.access, 1, 24, { t: 'access' }), 'Quante porte di ogni switch assegnare a ciascuna VLAN presente su quello switch'))];

    parts.push(el('h3', { textContent: 'Reti: router che fa da gateway, VLAN e switch su cui è presente' }));
    parts.push(lans.length ? table(head('Rete', 'Router', 'VLAN', 'Switch'), lans.map((n, k) => {
      const c = netCfg(n, k), key = cidr(n);
      const sw = Array.from({ length: topo.switches }, (_, s) => el('label', {},
        el('input', { type: 'checkbox', checked: c.sw.includes(s), dataset: { t: 'net-sw', k: key, s } }), ' SW' + (s + 1)));
      return el('tr', {},
        el('td', {}, el('b', { className: 'mono', textContent: key }), el('span', { className: 'inline-name', style: 'display:inline', textContent: n.label })),
        el('td', {}, pick(routers, c.router, { t: 'net-router', k: key })),
        el('td', {}, num(c.vlan, 1, 4094, { t: 'net-vlan', k: key })),
        el('td', {}, sw.length ? el('div', { className: 'sw-list' }, ...sw) : 'nessuno switch: porta dedicata sul router'));
    })) : el('p', { className: 'hint', textContent: 'Nessuna rete in tabella.' }));

    if (topo.switches) {
      parts.push(el('h3', { textContent: 'Switch: a cosa è collegato ciascuno' }));
      parts.push(table(head('Switch', 'Collegato a'), Array.from({ length: topo.switches }, (_, i) => {
        const options = routers.map(([r, t]) => ['R' + r, t])
          .concat(Array.from({ length: topo.switches }, (_, s) => ['S' + s, 'SW' + (s + 1)]).filter((_, s) => s !== i));
        return el('tr', {}, el('td', {}, el('b', { textContent: 'SW' + (i + 1) })), el('td', {}, pick(options, uplinkOf(i), { t: 'uplink', s: i })));
      })));
    }

    if (topo.routers > 1) {
      parts.push(el('h3', { textContent: 'Collegamenti tra router' }));
      parts.push(el('div', { className: 'link-base' },
        el('label', { htmlFor: 'link-base', textContent: 'Indirizzo di partenza' }),
        el('input', { id: 'link-base', className: 'link-net', value: topo.linkBase, spellcheck: false, dataset: { t: 'linkBase' } }),
        el('span', { textContent: 'Il primo collegamento usa questa /30, i successivi avanzano di 4 in 4.' })));
      parts.push(table(head('Da', 'A', 'Sottorete del collegamento', ''), linkSubnets().flatMap((l, j) => {
        const open = openLinks.has(j);
        const tr = el('tr', {},
          el('td', {},
            el('button', { className: 'toggle', type: 'button', textContent: open ? '▾' : '▸', ariaExpanded: String(open),
              title: (open ? 'Nascondi' : 'Mostra') + ' gli indirizzi in binario', dataset: { t: 'link-toggle', j } }),
            pick(routers, l.a, { t: 'link-a', j })),
          el('td', {}, pick(routers, l.b, { t: 'link-b', j })),
          el('td', { className: 'mono', textContent: `${ipStr(l.addr)}/30 (${l.source})` }),
          el('td', {}, el('button', { className: 'btn small', type: 'button', textContent: 'Rimuovi', dataset: { t: 'link-rm', j } })));
        if (!open) return [tr];
        return [tr, el('tr', { className: 'detail' }, el('td', { colSpan: 4 }, el('div', { className: 'bin' },
          binRow('Indirizzo di rete', l.addr, 30),
          binRow('Maschera di sottorete', maskBits(30), 30),
          binRow(`Indirizzo di R${l.a + 1}`, l.addr + 1, 30),
          binRow(`Indirizzo di R${l.b + 1}`, l.addr + 2, 30),
          binRow('Broadcast', l.addr + 3, 30))))];
      })));
      parts.push(el('div', { className: 'vlsm-actions' }, el('button', { className: 'btn small', type: 'button', textContent: '+ Aggiungi collegamento', dataset: { t: 'link-add' } })));
    }

    parts.push(el('ul', { className: 'topo-warn' }, ...topoBuild().warns.map(w => el('li', { textContent: w }))));
    parts.push(el('div', { className: 'vlsm-actions' }, el('button', { className: 'btn primary', type: 'button', textContent: 'Genera configurazioni', dataset: { t: 'build' } })));
    $('topo-body').replaceChildren(...parts);
  };

  $('topo-body').addEventListener('change', e => {
    const d = e.target.dataset, v = e.target.value;
    const clamp = (min, max) => Math.min(max, Math.max(min, Math.floor(Number(v)) || min));
    if (d.t === 'routers') topo.routers = clamp(1, 8);
    else if (d.t === 'switches') topo.switches = clamp(0, 12);
    else if (d.t === 'routing') topo.routing = v;
    else if (d.t === 'access') topo.access = clamp(1, 24);
    else if (d.t === 'linkBase') {
      const ip = parseIp(v.split('/')[0]);
      if (ip === null) toast('Indirizzo non valido: usa il formato 10.0.0.0');
      else topo.linkBase = ipStr((ip & ~3) >>> 0);
    }
    else if (d.t === 'net-router') topo.nets[d.k].router = Number(v);
    else if (d.t === 'net-vlan') topo.nets[d.k].vlan = clamp(1, 4094);
    else if (d.t === 'net-sw') {
      const c = topo.nets[d.k], s = Number(d.s);
      c.sw = e.target.checked ? c.sw.concat(s).sort((a, b) => a - b) : c.sw.filter(x => x !== s);
    } else if (d.t === 'uplink') topo.uplink[Number(d.s)] = v;
    else if (d.t === 'link-a' || d.t === 'link-b') { topo.links[Number(d.j)][d.t === 'link-a' ? 'a' : 'b'] = Number(v); topo.linksEdited = true; }
    else return;
    saveTopo();
    renderTopo();
  });
  $('topo-body').addEventListener('click', e => {
    const d = e.target.dataset;
    if (d.t === 'build') return openConfig();
    if (d.t === 'link-toggle') {
      const j = Number(d.j);
      openLinks.has(j) ? openLinks.delete(j) : openLinks.add(j);
      return renderTopo();
    }
    if (d.t === 'link-add') topo.links.push({ a: 0, b: Math.min(1, topo.routers - 1) });
    else if (d.t === 'link-rm') { topo.links.splice(Number(d.j), 1); openLinks.clear(); }
    else return;
    topo.linksEdited = true;
    saveTopo();
    renderTopo();
  });

  // ---------- Plan checker: validate a partitioning written by the user ----------
  let verified = null;
  const verifyPlan = () => {
    const v = SubnetLib.verify($('vf-text').value, $('vf-base').value);
    $('vf-base').classList.toggle('invalid', v.baseInvalid);
    return v;
  };

  const renderVerify = () => {
    const v = verified;
    if (!v) { $('vf-out').replaceChildren(); $('vf-load').disabled = true; return; }
    $('vf-load').disabled = v.errors > 0 || !v.valid.length || !v.base;
    if (!v.entries.length) {
      $('vf-out').replaceChildren(el('div', { className: 'verdict warn', textContent: 'Non c\'è nessuna sottorete da verificare: incollane almeno una.' }));
      return;
    }
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const kind = v.errors ? 'err' : v.warns ? 'warn' : 'ok';
    const title = v.errors ? `Ci sono problemi: ${plural(v.errors, 'errore', 'errori')}` + (v.warns ? ` e ${plural(v.warns, 'avviso', 'avvisi')}` : '')
      : v.warns ? `Il piano funziona, ma con ${plural(v.warns, 'avviso', 'avvisi')}` : 'Va tutto bene: nessun errore e nessun avviso';

    // Comparison with the optimal variable-mask plan, when every valid row has its hosts
    let compare = '';
    if (v.valid.length && v.valid.every(e => e.hosts)) {
      const mine = v.valid.reduce((s, e) => s + sizeOf(e.n.mask), 0);
      const best = v.valid.reduce((s, e) => s + sizeOf(maskForHosts(e.hosts)), 0);
      compare = ` Il tuo piano occupa ${nf.format(mine)} indirizzi; ` + (mine === best ? 'è lo stesso spazio del piano ottimale a maschera variabile.'
        : `quello ottimale a maschera variabile ne occuperebbe ${nf.format(best)}.`);
    }
    const verdict = el('div', { className: 'verdict ' + kind, textContent: title },
      el('small', { textContent: `${plural(v.entries.length, 'sottorete letta', 'sottoreti lette')}` +
        (v.base ? `, rete di partenza ${cidr(v.base)}${v.baseNote}.` : '.') + compare }));

    const list = issues => el('ul', { className: 'issues' },
      ...(issues.length ? issues.map(([k, t]) => el('li', { className: k, textContent: t })) : [el('li', { className: 'ok', textContent: 'Corretta' })]));
    const rows = v.entries.map(e => el('tr', {},
      el('td', {}, el('b', { textContent: e.label }), el('span', { className: 'inline-name', style: 'display:inline', textContent: e.hosts ? nf.format(e.hosts) + ' host' : '' })),
      el('td', { className: 'mono', textContent: e.n ? cidr(e.n) + (e.gw !== null ? ' · gw ' + ipStr(e.gw) : '') : e.raw }),
      el('td', {}, list(e.issues))));
    $('vf-out').replaceChildren(verdict,
      ...(v.global.length ? [list(v.global), el('p', { style: 'margin:0 0 10px' })] : []),
      el('div', { className: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ...['Rete', 'Letta come', 'Esito'].map(h => el('th', { textContent: h })))),
        el('tbody', {}, ...rows))));
  };

  $('vf-form').addEventListener('submit', e => {
    e.preventDefault();
    verified = verifyPlan();
    renderVerify();
  });
  $('vf-load').addEventListener('click', () => {
    const v = verified;
    if (!v || v.errors || !v.base) return;
    const base = node(v.base.addr, v.base.mask);
    v.valid.forEach(e => Object.assign(carve(base, e.n.addr, e.n.mask), { label: e.label, req: e.hosts, grown: e.hosts }));
    root = base;
    planned = true;
    planFixed = false;
    showFree = false;
    syncForm();
    commit();
    $('stats').scrollIntoView({ block: 'start', behavior: 'smooth' });
    toast('Piano caricato nella tabella');
  });

  // ---------- Supernetting ----------
  let supernetted = null;
  const renderSupernet = () => {
    const v = supernetted;
    if (!v) { $('sn-out').replaceChildren(); $('sn-load').disabled = true; return; }
    $('sn-load').disabled = v.errors > 0 || !v.summary;
    if (!v.entries.length) {
      $('sn-out').replaceChildren(el('div', { className: 'verdict warn', textContent: 'Non c\'è nessuna rete da aggregare: scrivine almeno due.' }));
      return;
    }
    const issueList = items => el('ul', { className: 'issues' }, ...items.map(([k, t]) => el('li', { className: k, textContent: t })));
    const s = v.summary, parts = [];
    const kind = v.errors ? 'err' : !s || !v.exact || v.warns ? 'warn' : 'ok';
    const title = v.errors ? `Ci sono problemi: ${v.errors} ${v.errors === 1 ? 'errore' : 'errori'}`
      : v.exact ? (v.warns ? `Aggregazione esatta in ${cidr(s)}, con ${v.warns} ${v.warns === 1 ? 'avviso' : 'avvisi'}` : `Aggregazione esatta: le ${v.networks.length} reti formano ${cidr(s)}`)
      : `Aggregazione non esatta: ${cidr(s)} contiene più indirizzi di quelli indicati`;
    parts.push(el('div', { className: 'verdict ' + kind, textContent: title },
      el('small', { textContent: s ? `${v.networks.length} reti distinte, ${nf.format(v.covered)} indirizzi coperti su ${nf.format(sizeOf(s.mask))} del supernet.` : '' })));
    if (v.global.length) parts.push(issueList(v.global));

    if (s) {
      const first = v.networks[0].n;
      parts.push(el('h3', { textContent: 'Supernet' }), el('div', { className: 'tiles' },
        tile('Rete riassunta', cidr(s)),
        tile('Netmask', ipStr(maskBits(s.mask))),
        tile('Wildcard', wildStr(s.mask)),
        tile('Intervallo', ipStr(s.addr) + ' – ' + ipStr(lastOf(s))),
        tile('Bit comuni', `${s.mask} (${first.mask - s.mask > 0 ? first.mask - s.mask + ' in meno di /' + first.mask : 'nessuno in meno'})`)));
      parts.push(el('h3', { textContent: 'Condizioni classiche del supernetting' }),
        el('ul', { className: 'issues' }, ...v.conditions.map(c => el('li', { className: c.ok ? 'ok' : 'no', textContent: c.text }))));
      if (v.exact && v.conditions.some(c => !c.ok)) {
        parts.push(el('p', { className: 'hint', textContent: 'Non tutte le condizioni classiche sono rispettate, ma le reti coprono comunque ogni indirizzo del supernet: l\'aggregazione resta esatta.' }));
      }
      if (!v.exact) {
        parts.push(el('h3', { textContent: `Aggregazione esatta in ${v.blocks.length} ${v.blocks.length === 1 ? 'rete' : 'reti'}, senza indirizzi in più` }),
          el('p', { className: 'mono', style: 'margin:0', textContent: v.blocks.map(cidr).join('   ') }));
      }
      // The bits shared by every network are the supernet prefix
      parts.push(el('h3', { textContent: 'In binario: i bit comuni formano il prefisso' }), el('div', { className: 'bin' },
        ...v.networks.map(e => binRow(e.label, e.n.addr, s.mask)),
        binRow('Supernet', s.addr, s.mask),
        binRow('Netmask', maskBits(s.mask), s.mask)),
        el('p', { className: 'legend' },
          el('span', { className: 'bits-net mono', textContent: '1010' }), ` = ${s.mask} bit uguali in tutte le reti · `,
          el('span', { className: 'bits-host mono', textContent: '1010' }), ` = ${32 - s.mask} bit che cambiano`));
    }

    if (s) {
      parts.push(el('h3', { textContent: 'Passaggi del calcolo' }), el('ol', { className: 'steps' },
        ...v.steps.map(st => el('li', {}, el('b', { textContent: st.title + '. ' }), st.text))));
    }

    parts.push(el('h3', { textContent: 'Reti lette' }), el('div', { className: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, ...['Rete', 'Letta come', 'Esito'].map(h => el('th', { textContent: h })))),
      el('tbody', {}, ...v.entries.map(e => el('tr', {},
        el('td', {}, el('b', { textContent: e.label })),
        el('td', { className: 'mono', textContent: e.n ? cidr(e.n) : e.raw }),
        el('td', {}, issueList(e.issues.length ? e.issues : [['ok', 'Corretta']]))))))));
    $('sn-out').replaceChildren(...parts);
  };

  $('sn-form').addEventListener('submit', e => {
    e.preventDefault();
    supernetted = SubnetLib.supernet($('sn-text').value);
    renderSupernet();
  });
  $('sn-load').addEventListener('click', () => {
    const v = supernetted;
    if (!v || v.errors || !v.summary) return;
    const base = node(v.summary.addr, v.summary.mask);
    v.networks.forEach(e => { carve(base, e.n.addr, e.n.mask).label = e.label; });
    root = base;
    planned = true;
    planFixed = false;
    showFree = false;
    syncForm();
    commit();
    $('stats').scrollIntoView({ block: 'start', behavior: 'smooth' });
    toast('Supernet caricato nella tabella');
  });

  // ---------- Restore everything to the initial state ----------
  const AN_HELP = $('an-msg').textContent;
  $('restore').addEventListener('click', () => {
    root = node(parseIp('192.168.0.0'), 24);
    planned = planFixed = showFree = false;
    $('addr').classList.remove('invalid');
    $('mask').classList.remove('invalid');
    syncForm();

    $('vlsm-form').reset();
    vlsmRows.replaceChildren();
    [50, 25, 10].forEach(addVlsmRow);
    syncVlsmCount();
    $('vlsm-form').querySelectorAll('.invalid').forEach(i => i.classList.remove('invalid'));
    vlsmMsg('');

    $('an-form').reset();
    $('an-out').replaceChildren();
    $('an-msg').textContent = AN_HELP;
    $('an-msg').classList.remove('error');

    hidden = COLUMNS.filter(c => c.off).map(c => c.id);
    store.set('subnet.columns2', JSON.stringify(hidden));
    COLUMNS.forEach(c => { $('chip-' + c.id).querySelector('input').checked = !hidden.includes(c.id); });
    applyColumns();
    $('steps').open = false;
    expanded.clear();
    topo = topoDefaults();
    saveTopo();
    $('vf-form').reset();
    $('vf-base').classList.remove('invalid');
    verified = null;
    renderVerify();
    $('sn-form').reset();
    supernetted = null;
    renderSupernet();

    commit();
    render();
    toast('Pagina ripristinata');
  });

  // ---------- Boot ----------
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (h === current || !deserialize(h)) return;
    undoStack.push(current);
    redoStack.length = 0;
    current = serialize();
    syncForm();
    render();
  });
  deserialize(location.hash);
  current = serialize();
  syncForm();
  render();
})();
