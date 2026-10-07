/*!
 * subnet-lib.js — calcolo di sottoreti IPv4 (nessuna dipendenza, nessun accesso al DOM).
 *
 * Si può usare in tre modi:
 *   <script src="subnet-lib.js"></script>           → variabile globale SubnetLib
 *   const SubnetLib = require('./subnet-lib.js')    → Node / CommonJS
 *   import SubnetLib, { info, plan } from './subnet-lib.mjs'   → moduli ES
 *
 * Convenzioni: il default gateway è l'ultimo indirizzo utilizzabile (quello prima del
 * broadcast); la scelta automatica della rete è per classi (C /24, B /16, A /8).
 */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  root.SubnetLib = lib;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const nf = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });

  // ---------- Addresses and masks as numbers ----------
  // Dotted address -> unsigned 32-bit number, or null if it is not a valid IPv4 address
  const parseIp = s => {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s).trim());
    if (!m) return null;
    const o = m.slice(1).map(Number);
    if (o.some(n => n > 255)) return null;
    return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
  };
  const ipStr = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  // 32 bits as four dotted octets, e.g. 11000000.10101000.00000000.00000001
  const toBinary = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].map(o => o.toString(2).padStart(8, '0')).join('.');
  const maskBits = m => (m === 0 ? 0 : (~0 << (32 - m)) >>> 0);
  const wildStr = m => ipStr(~maskBits(m) >>> 0);
  // Accepts a prefix ("24", "/24"), a dotted netmask or a dotted wildcard; returns the prefix length or null
  const parseMask = s => {
    s = String(s).trim().replace(/^\//, '');
    if (/^\d{1,2}$/.test(s)) return Number(s) <= 32 ? Number(s) : null;
    const v = parseIp(s);
    if (v === null) return null;
    const prefixOf = x => { for (let m = 0; m <= 32; m++) if (maskBits(m) === x) return m; return null; };
    const direct = prefixOf(v);
    return direct !== null ? direct : prefixOf(~v >>> 0);
  };
  const sizeOf = m => Math.pow(2, 32 - m);
  const hostsOf = m => (m === 32 ? 1 : m === 31 ? 2 : sizeOf(m) - 2);
  // Host bits needed for `hosts` usable addresses (network + broadcast reserved)
  const hostBitsFor = hosts => Math.max(2, Math.ceil(Math.log2(hosts + 2)));
  const maskForHosts = hosts => 32 - hostBitsFor(hosts);

  // ---------- Subnets as { addr, mask } ----------
  const lastOf = n => n.addr + sizeOf(n.mask) - 1;
  const cidr = n => ipStr(n.addr) + '/' + n.mask;
  const usableOf = n => {
    if (n.mask === 32) return ipStr(n.addr);
    if (n.mask === 31) return ipStr(n.addr) + ' – ' + ipStr(n.addr + 1);
    return ipStr(n.addr + 1) + ' – ' + ipStr(lastOf(n) - 1);
  };
  // Convention used here: the default gateway is the last usable address, the one just before the broadcast
  const gatewayNum = n => (n.mask >= 31 ? lastOf(n) : lastOf(n) - 1);
  const gatewayOf = n => ipStr(gatewayNum(n));
  // Addresses left for the hosts once the gateway is taken
  const firstHostNum = n => (n.mask >= 31 ? n.addr : n.addr + 1);
  const lastHostNum = n => (n.mask >= 31 ? n.addr : Math.max(n.addr + 1, lastOf(n) - 2));
  const broadcastOf = n => (n.mask >= 31 ? '—' : ipStr(lastOf(n)));

  // ---------- Classes and address types ----------
  // Smallest class whose standard private network holds `total` addresses
  const classFor = total => (total <= sizeOf(24) ? 'C' : total <= sizeOf(16) ? 'B' : total <= sizeOf(8) ? 'A' : null);
  const PRIVATE = { A: { addr: parseIp('10.0.0.0'), mask: 8 }, B: { addr: parseIp('172.16.0.0'), mask: 16 }, C: { addr: parseIp('192.168.0.0'), mask: 24 } };
  const classOf = ip => {
    const o = ip >>> 24;
    return o < 128 ? 'A' : o < 192 ? 'B' : o < 224 ? 'C' : o < 240 ? 'D (multicast)' : 'E (riservata)';
  };
  // Default prefix of the address class (0 for classes D and E, which have none)
  const classMaskOf = ip => { const o = ip >>> 24; return o < 128 ? 8 : o < 192 ? 16 : o < 224 ? 24 : 0; };
  const inNet = (ip, net, mask) => ((ip & maskBits(mask)) >>> 0) === parseIp(net);
  const typeOf = ip => {
    if (ip === 0xffffffff) return 'Broadcast limitato';
    if (inNet(ip, '10.0.0.0', 8) || inNet(ip, '172.16.0.0', 12) || inNet(ip, '192.168.0.0', 16)) return 'Privato (RFC 1918)';
    if (inNet(ip, '127.0.0.0', 8)) return 'Loopback';
    if (inNet(ip, '169.254.0.0', 16)) return 'Link-local (APIPA)';
    if (inNet(ip, '100.64.0.0', 10)) return 'Condiviso (CGNAT)';
    if (inNet(ip, '0.0.0.0', 8)) return 'Riservato («questa rete»)';
    if (inNet(ip, '224.0.0.0', 4)) return 'Multicast';
    if (inNet(ip, '240.0.0.0', 4)) return 'Riservato';
    return 'Pubblico';
  };

  // ---------- Text in, plain objects out ----------
  // "192.168.1.130/26", "192.168.1.130 255.255.255.192" or { addr, mask } -> { addr, mask } aligned to the network, or null
  const parseCidr = input => {
    if (input && typeof input === 'object') return { addr: (input.addr & maskBits(input.mask)) >>> 0, mask: input.mask };
    const parts = String(input).trim().split(/[\/\s]+/);
    const ip = parseIp(parts[0] || ''), mask = parts[1] === undefined ? null : parseMask(parts[1]);
    if (ip === null || mask === null) return null;
    return { addr: (ip & maskBits(mask)) >>> 0, mask };
  };

  // Everything about one subnet, as strings ready to show. Returns null if the input is not valid.
  const info = input => {
    const n = parseCidr(input);
    if (!n) return null;
    const mask = maskBits(n.mask), last = lastOf(n) >>> 0;
    return {
      cidr: cidr(n),
      network: ipStr(n.addr),
      prefix: n.mask,
      netmask: ipStr(mask),
      wildcard: wildStr(n.mask),
      broadcast: n.mask >= 31 ? null : ipStr(last),
      firstHost: ipStr(firstHostNum(n)),
      lastHost: ipStr(lastHostNum(n)),
      gateway: gatewayOf(n),
      hosts: hostsOf(n.mask),
      size: sizeOf(n.mask),
      class: classOf(n.addr),
      type: typeOf(n.addr),
      binary: {
        network: toBinary(n.addr),
        netmask: toBinary(mask),
        wildcard: toBinary(~mask >>> 0),
        broadcast: toBinary(last),
        firstHost: toBinary(firstHostNum(n)),
        lastHost: toBinary(lastHostNum(n)),
        gateway: toBinary(gatewayNum(n)),
      },
    };
  };

  // The two halves of a subnet, or null if it cannot be divided
  const split = input => {
    const n = parseCidr(input);
    if (!n || n.mask >= 32) return null;
    return [info({ addr: n.addr, mask: n.mask + 1 }), info({ addr: n.addr + sizeOf(n.mask + 1), mask: n.mask + 1 })];
  };

  // ---------- Planning ----------
  // Lays out the requests one after the other, largest first.
  //   reqs:    [{ name, hosts, grown?, wan?, mask? }]  (grown = hosts after a growth margin)
  //   options: { fixed: same mask for all, base: { addr, mask } to use instead of the automatic private network }
  // Returns { ok: true, base, cls, items: [{ ...req, mask, addr }], needed } or { ok: false, error, needed, neededMask }.
  const allocate = (reqs, options = {}) => {
    const items = reqs.map(r => Object.assign({}, r, { mask: r.mask === undefined ? maskForHosts(r.grown || r.hosts) : r.mask }));
    if (options.fixed && items.length) {
      // One mask for all, sized on the largest network; the order entered is kept
      const widest = Math.min(...items.map(r => r.mask));
      items.forEach(r => { r.mask = widest; });
    }
    // Largest first: every block then starts on a boundary of its own size
    items.sort((a, b) => a.mask - b.mask);
    const needed = items.reduce((s, r) => s + sizeOf(r.mask), 0);
    const neededMask = 32 - Math.ceil(Math.log2(needed || 1));

    // Automatic choice is classful: the smallest standard private network (C /24, B /16, A /8) that holds every block
    let base, cls = '';
    if (options.base) {
      if (needed > sizeOf(options.base.mask)) return { ok: false, error: 'too-small', needed, neededMask };
      base = { addr: options.base.addr >>> 0, mask: options.base.mask };
    } else {
      cls = classFor(needed);
      if (!cls) return { ok: false, error: 'too-big', needed, neededMask };
      base = Object.assign({}, PRIVATE[cls]);
    }
    let next = base.addr;
    items.forEach(r => { r.addr = next >>> 0; next += sizeOf(r.mask); });
    return { ok: true, base, cls, items, needed, fixed: !!options.fixed };
  };

  // Friendly front end to allocate().
  //   requests: [{ name, hosts }] or plain numbers
  //   options:  { mode: 'variable' | 'fixed', base: '172.16.0.0/16', growth: percentage, links: point-to-point /30s }
  // Returns { ok, mode, base, class, subnets: [{ name, hosts, ...info }], used, free } or { ok: false, error, message }.
  const plan = (requests, options = {}) => {
    const growth = options.growth || 0;
    const reqs = requests.map((r, i) => {
      const hosts = typeof r === 'number' ? r : r.hosts;
      return { name: (typeof r === 'object' && r.name) || 'Rete ' + (i + 1), hosts, grown: Math.ceil(hosts * (100 + growth) / 100), wan: false };
    });
    if (reqs.some(r => !Number.isInteger(r.hosts) || r.hosts < 1)) {
      return { ok: false, error: 'bad-hosts', message: 'Ogni rete deve avere un numero intero di host, almeno 1.' };
    }
    for (let i = 1; i <= (options.links || 0); i++) reqs.push({ name: 'Link ' + i, hosts: 2, grown: 2, wan: true, mask: 30 });
    let base = null;
    if (options.base) {
      base = parseCidr(options.base);
      if (!base) return { ok: false, error: 'bad-base', message: 'La rete di partenza non è valida: scrivila come 172.16.0.0/16.' };
    }
    const r = allocate(reqs, { fixed: options.mode === 'fixed', base });
    if (!r.ok) {
      return { ok: false, error: r.error, needed: r.needed, message: r.error === 'too-small'
        ? `${cidr(base)} è troppo piccola: servono ${nf.format(r.needed)} indirizzi (almeno una /${r.neededMask}).`
        : `Servono ${nf.format(r.needed)} indirizzi: non entrano nemmeno in una classe A (10.0.0.0/8).` };
    }
    return {
      ok: true,
      mode: r.fixed ? 'fixed' : 'variable',
      base: info(r.base),
      class: r.cls || null,
      subnets: r.items.map(it => Object.assign({ name: it.name, requestedHosts: it.hosts, link: !!it.wan }, info(it))),
      used: r.needed,
      free: sizeOf(r.base.mask) - r.needed,
    };
  };

  // ---------- Checking a plan written by hand ----------
  const NAME_WORDS = /^(rete|vlan|lan|link|net|subnet|sottorete)$/i;

  // One line -> { name, hosts, addr, mask, gw }. Fields may be separated by ; , or tabs, otherwise by spaces.
  const parseEntry = line => {
    const strict = /[;,\t]/.test(line);
    const e = { raw: line.trim(), name: '', hosts: 0, addr: null, mask: null, gw: null, bad: false };
    const items = [];
    (strict ? line.split(/[;,\t]/) : [line]).forEach(fieldText => {
      const field = fieldText.trim();
      if (!field) return;
      const hasIp = /\d+\.\d+\.\d+\.\d+|^\/\d+$/.test(field);
      (strict && !hasIp ? [field] : field.split(/\s+/)).forEach(t => {
        const m = /^(\d+\.\d+\.\d+\.\d+)(?:\/(\d+))?$/.exec(t);
        if (m) {
          const ip = parseIp(m[1]);
          if (ip === null || (m[2] && Number(m[2]) > 32)) { e.bad = true; return; }
          if (e.addr === null) { e.addr = ip; if (m[2]) e.mask = Number(m[2]); }
          else if (e.mask === null && !m[2] && parseMask(m[1]) !== null) e.mask = parseMask(m[1]);
          else if (e.gw === null) e.gw = ip;
        } else if (/^\/\d+$/.test(t) && e.addr !== null && e.mask === null && Number(t.slice(1)) <= 32) e.mask = Number(t.slice(1));
        else items.push(t);
      });
    });
    // Which number is the host count: with separators the first numeric field, otherwise the last number
    // (earlier ones belong to the name, as does a lone number right after a word like "Rete" or "VLAN")
    const ints = items.map((t, i) => (/^\d+$/.test(t) ? i : -1)).filter(i => i >= 0);
    let hostIdx = ints.length ? (strict ? ints[0] : ints[ints.length - 1]) : -1;
    if (!strict && ints.length === 1 && hostIdx > 0 && NAME_WORDS.test(items[hostIdx - 1])) hostIdx = -1;
    if (hostIdx >= 0) e.hosts = Number(items[hostIdx]);
    e.name = items.filter((_, i) => i !== hostIdx).join(' ');
    return e;
  };

  // Checks a plan given as text, one subnet per line (see parseEntry). `baseText` is the starting network, optional.
  // Returns { entries, valid, base, baseNote, baseInvalid, global, errors, warns }: every entry has `issues`,
  // a list of ['err' | 'warn', message]; `global` holds the issues that concern the plan as a whole.
  const verify = (text, baseText = '') => {
    const entries = String(text).split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).map(parseEntry);
    entries.forEach((e, i) => { e.issues = []; e.label = e.name || 'Rete ' + (i + 1); });
    const err = (e, t) => e.issues.push(['err', t]), warn = (e, t) => e.issues.push(['warn', t]);
    const global = [];

    // Per-entry checks
    entries.forEach(e => {
      if (e.bad || e.addr === null) { e.addr = null; return err(e, 'non riesco a leggere un indirizzo valido in questa riga.'); }
      if (e.mask === null) return err(e, 'manca la maschera: scrivi /22, 255.255.252.0 oppure la wildcard.');
      const cm = classMaskOf(e.addr);
      if (e.mask < cm) err(e, `il prefisso /${e.mask} è più corto di quello della classe ${classOf(e.addr)} (/${cm}).`);
      const net = (e.addr & maskBits(e.mask)) >>> 0;
      if (net !== e.addr) err(e, `${ipStr(e.addr)} non è un indirizzo di rete per /${e.mask}: quello giusto è ${ipStr(net)}.`);
      e.n = { addr: net, mask: e.mask };
      if (e.mask >= 31) warn(e, `una /${e.mask} non ha indirizzi per gli host oltre a rete e broadcast.`);
      if (e.hosts) {
        const cap = hostsOf(e.mask), best = maskForHosts(e.hosts);
        if (e.hosts > cap) err(e, `non bastano gli indirizzi: ${nf.format(e.hosts)} host richiesti, una /${e.mask} ne contiene ${nf.format(cap)}. Serve almeno una /${best}.`);
        else if (e.mask < best) warn(e, `sottorete più grande del necessario: per ${nf.format(e.hosts)} host bastava una /${best} (${nf.format(hostsOf(best))} host), la /${e.mask} ne ha ${nf.format(cap)}.`);
      }
      if (e.gw !== null) {
        if (e.gw < e.n.addr || e.gw > lastOf(e.n)) err(e, `il gateway ${ipStr(e.gw)} è fuori dalla sottorete.`);
        else if (e.mask < 31 && (e.gw === e.n.addr || e.gw === lastOf(e.n))) err(e, `il gateway ${ipStr(e.gw)} coincide con l'indirizzo di ${e.gw === e.n.addr ? 'rete' : 'broadcast'}.`);
        else if (e.gw !== gatewayNum(e.n)) warn(e, `per convenzione il gateway è l'indirizzo prima del broadcast: ${gatewayOf(e.n)}, non ${ipStr(e.gw)}.`);
      }
    });
    const valid = entries.filter(e => e.n);

    // Starting network: the one given, or the classful network of the first subnet
    let base = null, baseNote = '', baseInvalid = false;
    baseText = String(baseText).trim();
    if (baseText) {
      base = parseCidr(baseText);
      if (!base) { baseInvalid = true; global.push(['err', 'la rete di partenza non è valida: scrivila come 172.16.0.0/16.']); }
    } else if (valid.length) {
      const cm = classMaskOf(valid[0].n.addr) || valid[0].n.mask;
      base = { addr: (valid[0].n.addr & maskBits(cm)) >>> 0, mask: cm };
      baseNote = ` (dedotta dalla classe ${classOf(valid[0].n.addr)} del primo indirizzo)`;
    }
    if (base) valid.forEach(e => {
      if (e.n.addr < base.addr || lastOf(e.n) > lastOf(base)) err(e, `è fuori dalla rete di partenza ${cidr(base)}.`);
    });

    // Overlaps
    valid.forEach((e, i) => valid.forEach((f, j) => {
      if (j <= i || e.n.addr > lastOf(f.n) || f.n.addr > lastOf(e.n)) return;
      const same = e.n.addr === f.n.addr && e.n.mask === f.n.mask;
      err(e, same ? `è la stessa sottorete di «${f.label}».` : `si sovrappone a «${f.label}» (${cidr(f.n)}).`);
      err(f, same ? `è la stessa sottorete di «${e.label}».` : `si sovrappone a «${e.label}» (${cidr(e.n)}).`);
    }));

    // Layout: largest first and no gaps, checked in address order
    const sorted = valid.filter(e => !base || (e.n.addr >= base.addr && lastOf(e.n) <= lastOf(base))).sort((a, b) => a.n.addr - b.n.addr);
    if (base && sorted.length && sorted[0].n.addr > base.addr && sorted[0].n.addr <= lastOf(base)) {
      global.push(['warn', `il piano non parte dall'inizio della rete: i primi ${nf.format(sorted[0].n.addr - base.addr)} indirizzi di ${cidr(base)} restano inutilizzati.`]);
    }
    sorted.forEach((e, i) => {
      const prev = sorted[i - 1];
      if (!prev) return;
      const gap = e.n.addr - lastOf(prev.n) - 1;
      if (gap > 0) warn(e, `c'è un buco di ${nf.format(gap)} indirizzi tra «${prev.label}» e questa rete.`);
      if (e.n.mask < prev.n.mask) warn(e, `è più grande di «${prev.label}», che la precede: nel VLSM si assegna dalla rete più grande alla più piccola.`);
    });

    const count = k => entries.reduce((s, e) => s + e.issues.filter(i => i[0] === k).length, 0) + global.filter(g => g[0] === k).length;
    return { entries, valid, base, baseNote, baseInvalid, global, errors: count('err'), warns: count('warn') };
  };

  // ---------- Supernetting (route summarisation) ----------
  // Smallest set of CIDR blocks covering exactly the addresses from `a` to `b`
  const blocksOf = (a, b) => {
    const out = [];
    while (a <= b) {
      let size = a === 0 ? Math.pow(2, 32) : (a & -a) >>> 0;
      while (size > b - a + 1) size /= 2;
      out.push({ addr: a, mask: 32 - Math.log2(size) });
      a += size;
    }
    return out;
  };

  // Aggregates several networks into one supernet and says whether the summary is exact.
  //   input: text with one network per line ("192.168.0.0/24", "192.168.1.0 255.255.255.0", an optional name
  //          in front) or an array of such strings. Without a mask the class default is used.
  // Returns { entries, valid, networks, summary, exact, extra, covered, blocks, conditions, global, errors, warns }:
  //   summary    { addr, mask } of the smallest single network containing them all (null with fewer than two networks)
  //   extra      addresses inside the summary that belong to none of the networks (0 when exact)
  //   blocks     smallest list of networks covering exactly the input, for when one summary is not exact
  //   conditions the four textbook conditions for a perfect supernet, each { ok, text }
  //   steps      how the summary is worked out, each { title, text }
  const supernet = input => {
    const lines = Array.isArray(input) ? input.map(String) : String(input).split('\n');
    const entries = lines.filter(l => l.trim() && !l.trim().startsWith('#')).map(parseEntry);
    entries.forEach((e, i) => { e.issues = []; e.label = e.name || 'Rete ' + (i + 1); });
    const err = (e, t) => e.issues.push(['err', t]), warn = (e, t) => e.issues.push(['warn', t]);
    const global = [];

    entries.forEach(e => {
      if (e.bad || e.addr === null) { e.addr = null; return err(e, 'non riesco a leggere un indirizzo valido in questa riga.'); }
      if (e.mask === null) {
        const cm = classMaskOf(e.addr);
        if (!cm) return err(e, 'manca la maschera: scrivi /24, 255.255.255.0 oppure la wildcard.');
        e.mask = cm;
        warn(e, `maschera non indicata: uso quella della classe ${classOf(e.addr)} (/${cm}).`);
      }
      const net = (e.addr & maskBits(e.mask)) >>> 0;
      if (net !== e.addr) err(e, `${ipStr(e.addr)} non è un indirizzo di rete per /${e.mask}: quello giusto è ${ipStr(net)}.`);
      e.n = { addr: net, mask: e.mask };
    });
    const valid = entries.filter(e => e.n);

    // CIDR blocks are either disjoint or nested: a network repeated or contained in another adds nothing
    const networks = [];
    valid.forEach((e, i) => {
      const twin = valid.find((f, j) => j < i && f.n.addr === e.n.addr && f.n.mask === e.n.mask);
      const outer = valid.find(f => f !== e && f.n.mask < e.n.mask && e.n.addr >= f.n.addr && e.n.addr <= lastOf(f.n));
      if (twin) warn(e, `è ripetuta: è la stessa rete di «${twin.label}».`);
      else if (outer) warn(e, `è già contenuta in «${outer.label}» (${cidr(outer.n)}).`);
      else networks.push(e);
    });
    networks.sort((a, b) => a.n.addr - b.n.addr);

    const count = k => entries.reduce((s, e) => s + e.issues.filter(i => i[0] === k).length, 0) + global.filter(g => g[0] === k).length;
    const result = { entries, valid, networks, summary: null, exact: false, extra: 0, covered: 0, blocks: [], conditions: [], steps: [], global };
    const done = () => Object.assign(result, { errors: count('err'), warns: count('warn') });
    if (networks.length < 2) {
      global.push(['err', valid.length < 2 ? 'servono almeno due reti valide per fare supernetting.'
        : 'le reti indicate si riducono a una sola: servono almeno due reti distinte.']);
      return done();
    }

    // Summary: the bits shared by the first and the last address of the whole range
    const first = networks[0].n.addr, last = Math.max(...networks.map(e => lastOf(e.n)));
    const common = Math.clz32((first ^ last) >>> 0);
    const summary = { addr: (first & maskBits(common)) >>> 0, mask: common };

    // Contiguous runs, to count the addresses really covered
    const runs = [];
    networks.forEach(e => {
      const run = runs[runs.length - 1];
      if (run && e.n.addr === run.b + 1) run.b = lastOf(e.n); else runs.push({ a: e.n.addr, b: lastOf(e.n) });
    });
    const covered = runs.reduce((s, r) => s + (r.b - r.a + 1), 0);
    const extra = sizeOf(summary.mask) - covered;
    const blocks = runs.flatMap(r => blocksOf(r.a, r.b));

    const n = networks.length, sameMask = networks.every(e => e.n.mask === networks[0].n.mask);
    const pow2 = (n & (n - 1)) === 0;
    const conditions = [
      { ok: sameMask, text: sameMask ? `Tutte le reti hanno la stessa maschera (/${networks[0].n.mask})` : 'Le reti non hanno tutte la stessa maschera' },
      { ok: runs.length === 1, text: runs.length === 1 ? 'Le reti sono contigue, senza buchi' : `Le reti non sono contigue: ci sono ${runs.length - 1} ${runs.length === 2 ? 'buco' : 'buchi'} tra una e l'altra` },
      { ok: pow2, text: `Il numero di reti ${pow2 ? 'è' : 'non è'} una potenza di 2 (sono ${n})` },
      { ok: first === summary.addr, text: first === summary.addr ? `La prima rete (${ipStr(first)}) coincide con l'inizio del supernet`
        : `La prima rete (${ipStr(first)}) non è allineata: il supernet deve partire da ${ipStr(summary.addr)}` },
    ];
    if (extra > 0) {
      global.push(['warn', `il supernet ${cidr(summary)} contiene anche ${nf.format(extra)} indirizzi che non appartengono alle reti indicate: ` +
        'una rotta riassunta così instrada anche quelli.']);
    }
    // How the result is reached, one step at a time
    const octet = (v, k) => (v >>> (24 - 8 * k)) & 255, bin8 = o => o.toString(2).padStart(8, '0');
    const k = Math.floor(common / 8), inOctet = common - 8 * k, d = networks[0].n.mask - common;
    const ordinal = ['primo', 'secondo', 'terzo', 'quarto'][k];
    const steps = [
      { title: 'Intervallo da coprire',
        text: `Dal primo indirizzo della prima rete all'ultimo dell'ultima rete: da ${ipStr(first)} a ${ipStr(last)}.` },
      { title: 'Bit comuni da sinistra',
        text: (k ? `${k === 1 ? 'Il primo ottetto è uguale' : 'I primi ' + k + ' ottetti sono uguali'} (${8 * k} bit). ` : '') +
          `Nel ${ordinal} ottetto ${octet(first, k)} = ${bin8(octet(first, k))} e ${octet(last, k)} = ${bin8(octet(last, k))}: ` +
          (inOctet ? `coincidono i primi ${inOctet} bit.` : 'non coincide nemmeno il primo bit.') +
          ` Bit comuni: ${8 * k} + ${inOctet} = ${common}.` },
      { title: 'Prefisso e netmask del supernet',
        text: `I bit comuni sono il nuovo prefisso: /${common}. Con ${common} bit a 1 e ${32 - common} a 0 la netmask è ${ipStr(maskBits(common))}.` },
      { title: 'Indirizzo del supernet',
        text: `Si tengono i ${common} bit comuni e si azzerano gli altri: ${ipStr(summary.addr)}.` +
          (first === summary.addr ? ' Coincide con la prima rete.' : ` È diverso dalla prima rete (${ipStr(first)}), che quindi non è allineata.`) },
      sameMask
        ? { title: 'Quante reti contiene',
            text: `Il prefisso passa da /${networks[0].n.mask} a /${common}: ${d} bit in meno, quindi il supernet contiene 2^${d} = ${nf.format(Math.pow(2, d))} reti /${networks[0].n.mask}. Tu ne hai indicate ${n}.` }
        : { title: 'Quante reti contiene',
            text: `Le reti hanno maschere diverse, quindi si confrontano gli indirizzi: quelle indicate ne coprono ${nf.format(covered)}.` },
      { title: 'Verifica',
        text: `Il supernet ha 2^${32 - common} = ${nf.format(sizeOf(common))} indirizzi; le reti indicate ne coprono ${nf.format(covered)}. ` +
          (extra === 0 ? 'Coincidono: l\'aggregazione è esatta.' : `Restano ${nf.format(extra)} indirizzi in più: l'aggregazione non è esatta.`) },
    ];
    Object.assign(result, { summary, exact: extra === 0, extra, covered, blocks, conditions, steps });
    return done();
  };

  return {
    // text in, plain objects out
    info, split, plan, verify, supernet, parseCidr, parseEntry, allocate,
    // addresses and masks as numbers
    parseIp, ipStr, toBinary, maskBits, wildStr, parseMask, sizeOf, hostsOf, hostBitsFor, maskForHosts,
    // subnets as { addr, mask }
    lastOf, cidr, usableOf, gatewayNum, gatewayOf, firstHostNum, lastHostNum, broadcastOf,
    // classes and address types
    classFor, classOf, classMaskOf, typeOf,
  };
});
