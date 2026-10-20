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

  // ---------- Exercises ----------
  const DEPARTMENTS = ['Amministrazione', 'Laboratorio', 'Segreteria', 'Magazzino', 'Produzione', 'Vendite', 'Direzione',
    'Ufficio tecnico', 'Marketing', 'Assistenza', 'Ricerca', 'Logistica', 'Contabilità', 'Risorse umane', 'Aula informatica',
    'Biblioteca', 'Reception', 'Sala server'];
  const LEVELS = {
    facile: { label: 'Facile', nets: [3, 4], hosts: [5, 60], classes: ['C'], links: [0, 0] },
    medio: { label: 'Medio', nets: [4, 6], hosts: [10, 500], classes: ['C', 'B'], links: [0, 0] },
    difficile: { label: 'Difficile', nets: [6, 8], hosts: [2, 2000], classes: ['B'], links: [0, 3] },
  };
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = list => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  // Log-uniform, so small and large host counts are equally likely
  const randHosts = (lo, hi) => Math.round(Math.exp(Math.log(lo) + Math.random() * (Math.log(hi) - Math.log(lo))));
  const randomBase = cls => (cls === 'C' ? { addr: parseIp(`192.168.${rand(0, 255)}.0`), mask: 24 }
    : cls === 'B' ? { addr: parseIp(`172.${rand(16, 31)}.0.0`), mask: 16 } : Object.assign({}, PRIVATE.A));
  // Addresses taken by the networks: one block each, all as big as the largest one with a fixed mask
  const neededFor = (nets, maskType) => (maskType === 'fixed'
    ? nets.length * sizeOf(Math.min(...nets.map(n => maskForHosts(n.hosts))))
    : nets.reduce((s, n) => s + sizeOf(maskForHosts(n.hosts)), 0));
  // A standard private network with its class mask: 192.168.x.0/24, 172.16-31.0.0/16 or 10.0.0.0/8
  const isClassfulPrivate = n => (n.mask === 24 && inNet(n.addr, '192.168.0.0', 16))
    || (n.mask === 16 && inNet(n.addr, '172.16.0.0', 12)) || (n.mask === 8 && n.addr === PRIVATE.A.addr);

  // Creates an exercise.
  //   random: { mode: 'random', level: 'facile' | 'medio' | 'difficile', randomMask, baseMode: 'given' | 'choose' }
  //   custom: { mode: 'custom', nets: [{ name, hosts }], maskType: 'fixed' | 'variable' | null, baseMode, base?: '172.16.0.0/16' }
  // maskType null means the student has to choose it; baseMode 'choose' means the student picks the starting network.
  // Returns { ok: true, exercise } or { ok: false, message }.
  const generate = (opts = {}) => {
    const baseMode = opts.baseMode === 'choose' ? 'choose' : 'given';
    if (opts.mode === 'custom') {
      const nets = (opts.nets || []).map((n, i) => ({ name: String(n.name || '').trim() || 'Rete ' + (i + 1), hosts: Number(n.hosts) }));
      if (nets.length < 2) return { ok: false, message: 'Servono almeno due reti.' };
      if (nets.some(n => !Number.isInteger(n.hosts) || n.hosts < 1 || n.hosts > 16777214)) {
        return { ok: false, message: 'Ogni rete deve avere un numero intero di host, almeno 1.' };
      }
      const maskType = opts.maskType === 'fixed' || opts.maskType === 'variable' ? opts.maskType : null;
      // When the student chooses the mask, either choice must fit
      const needed = neededFor(nets, maskType || 'fixed');
      let base = null;
      if (baseMode === 'given') {
        if (opts.base && String(opts.base).trim()) {
          base = parseCidr(opts.base);
          if (!base) return { ok: false, message: 'La rete di partenza non è valida: scrivila come 172.16.0.0/16.' };
          if (needed > sizeOf(base.mask)) return { ok: false, message: `${cidr(base)} è troppo piccola: servono ${nf.format(needed)} indirizzi.` };
        } else {
          const cls = classFor(needed);
          if (!cls) return { ok: false, message: `Servono ${nf.format(needed)} indirizzi: non entrano nemmeno in una classe A.` };
          base = PRIVATE[cls];
        }
      } else if (!classFor(needed)) {
        return { ok: false, message: `Servono ${nf.format(needed)} indirizzi: non entrano nemmeno in una classe A.` };
      }
      return { ok: true, exercise: { v: 1, level: 'personalizzato', nets, maskType, baseMode, base: base ? cidr(base) : null } };
    }

    const level = LEVELS[opts.level] ? opts.level : 'facile', L = LEVELS[level];
    for (let attempt = 0; attempt < 1000; attempt++) {
      const nets = shuffle(DEPARTMENTS).slice(0, rand(L.nets[0], L.nets[1])).map(name => ({ name, hosts: randHosts(L.hosts[0], L.hosts[1]) }));
      const links = rand(L.links[0], L.links[1]);
      for (let i = 1; i <= links; i++) nets.push({ name: 'Link punto-punto ' + i, hosts: 2 });
      const maskType = opts.randomMask ? (Math.random() < 0.5 ? 'fixed' : 'variable') : null;
      const cls = classFor(neededFor(nets, maskType || 'fixed'));
      if (!cls || !L.classes.includes(cls)) continue;
      return { ok: true, exercise: { v: 1, level, nets, maskType, baseMode, base: baseMode === 'given' ? cidr(randomBase(cls)) : null } };
    }
    return { ok: false, message: 'Non sono riuscito a generare un esercizio: riprova.' };
  };

  // The site's solution, in the order of the exercise. With a starting network to choose, the standard one of the class is used.
  const solve = (ex, chosenMask) => {
    const maskType = ex.maskType || chosenMask || 'variable';
    const base = ex.base ? parseCidr(ex.base) : null;
    const res = allocate(ex.nets.map((n, i) => ({ name: n.name, hosts: n.hosts, index: i })), { fixed: maskType === 'fixed', base });
    if (!res.ok) return { ok: false, maskType };
    const rows = [];
    res.items.forEach(it => { rows[it.index] = Object.assign({ name: it.name, hosts: it.hosts }, info(it)); });
    return { ok: true, maskType, base: info(res.base), cls: res.cls || classOf(res.base.addr), rows };
  };

  // Progressive hints: show the first one, then one more each time
  const hints = (ex, chosenMask) => {
    const maskType = ex.maskType || chosenMask || null;
    const biggest = ex.nets.reduce((a, b) => (b.hosts > a.hosts ? b : a));
    const h = hostBitsFor(biggest.hosts);
    const list = [];
    if (!ex.maskType && !chosenMask) {
      list.push('Prima scegli il tipo di partizionamento: a maschera variabile ogni rete ha la maschera più piccola che le basta, a maschera fissa tutte hanno la maschera della rete più grande.');
    }
    list.push('Per ogni rete: host + 2 (indirizzo di rete e broadcast), poi arrotonda alla potenza di 2 successiva. L\'esponente è il numero di bit di host e il prefisso è 32 meno quei bit.');
    list.push(`La rete più grande è «${biggest.name}» con ${nf.format(biggest.hosts)} host: ${nf.format(biggest.hosts)} + 2 = ${nf.format(biggest.hosts + 2)}, ` +
      `la potenza di 2 che basta è 2^${h} = ${nf.format(Math.pow(2, h))}, quindi /${32 - h}.` +
      (maskType === 'fixed' ? ' A maschera fissa è la maschera di tutte le reti.' : ''));
    const needed = neededFor(ex.nets, maskType || 'variable');
    if (ex.baseMode === 'choose') {
      const cls = classFor(needed);
      list.push(`In tutto servono ${nf.format(needed)} indirizzi${maskType ? '' : ' a maschera variabile'}: la rete privata più piccola che basta è di classe ${cls}, per esempio ${cidr(PRIVATE[cls])}.`);
    }
    list.push('Assegna le reti dalla più grande alla più piccola, una subito dopo l\'altra, partendo dall\'inizio della rete di partenza: così ogni rete è allineata.');
    const sol = solve(ex, maskType || 'variable');
    if (sol.ok) {
      const row = sol.rows[ex.nets.indexOf(biggest)];
      list.push(`«${biggest.name}» parte dall'inizio della rete: ${row.cidr}, con netmask ${row.netmask} e broadcast ${row.broadcast}.`);
    }
    return list;
  };

  const ANSWER_FIELDS = ['network', 'prefix', 'netmask', 'broadcast', 'gateway', 'firstHost', 'lastHost'];
  const REQUIRED_FIELDS = ['network', 'prefix', 'netmask', 'broadcast'];
  const FIELD_NAMES = { network: 'l\'indirizzo di rete', prefix: 'il prefisso', netmask: 'la netmask', broadcast: 'il broadcast',
    gateway: 'il gateway', firstHost: 'il primo host', lastHost: 'l\'ultimo host' };

  // Corrects an answer.
  //   answer: { base, maskType, rows: [{ network, prefix, netmask, broadcast, gateway?, firstHost?, lastHost? }] }  (strings, in exercise order)
  // Returns { global, rows, errors, warns, correctRows, total, perfect }. Every row has `fields` ({ status, expected } per field,
  // status 'ok' | 'err' | 'warn' | 'empty') and `issues` ({ level, field, text }); global issues concern the whole answer.
  const check = (ex, answer = {}) => {
    const global = [];
    const gIssue = (level, field, text) => global.push({ level, field, text });
    const maskType = ex.maskType || (answer.maskType === 'fixed' || answer.maskType === 'variable' ? answer.maskType : null);
    if (!maskType) gIssue('err', 'maskType', 'Scegli se il partizionamento è a maschera fissa o variabile.');
    const fixedMask = Math.min(...ex.nets.map(n => maskForHosts(n.hosts)));

    // Starting network
    let base = null;
    if (ex.baseMode === 'given') base = parseCidr(ex.base);
    else {
      const text = String(answer.base || '').trim();
      const parts = text.split(/[\/\s]+/), ip = parseIp(parts[0] || ''), m = parts[1] === undefined ? null : parseMask(parts[1]);
      if (!text) gIssue('err', 'base', 'Indica la rete di partenza che hai scelto.');
      else if (ip === null || m === null) gIssue('err', 'base', 'La rete di partenza non è valida: scrivila come indirizzo e prefisso, per esempio 172.16.0.0/16.');
      else {
        base = { addr: (ip & maskBits(m)) >>> 0, mask: m };
        const needed = neededFor(ex.nets, maskType || 'variable'), best = classFor(needed);
        if (base.addr !== ip) gIssue('err', 'base', `${ipStr(ip)} non è un indirizzo di rete per /${m}: dovrebbe essere ${ipStr(base.addr)}.`);
        if (!isClassfulPrivate(base)) {
          gIssue('err', 'base', 'La rete di partenza deve essere una rete privata con la maschera della sua classe: 192.168.x.0/24 (classe C), 172.16.0.0/16 … 172.31.0.0/16 (classe B) o 10.0.0.0/8 (classe A).');
        } else if (sizeOf(base.mask) < needed) {
          gIssue('err', 'base', `${cidr(base)} è troppo piccola: servono ${nf.format(needed)} indirizzi, quindi almeno una classe ${best}.`);
        } else if (best && base.mask < PRIVATE[best].mask) {
          gIssue('warn', 'base', `Servono ${nf.format(needed)} indirizzi: bastava una classe ${best} (per esempio ${cidr(PRIVATE[best])}).`);
        }
      }
    }

    const rows = ex.nets.map((net, i) => {
      const a = (answer.rows || [])[i] || {};
      const r = { fields: {}, issues: [], n: null };
      const val = f => String(a[f] === undefined || a[f] === null ? '' : a[f]).trim();
      const rank = { empty: 0, ok: 1, warn: 2, err: 3 };
      const mark = (f, status, expected) => {
        const cur = r.fields[f];
        if (!cur || rank[status] > rank[cur.status]) r.fields[f] = { status, expected: expected === undefined ? (cur && cur.expected) : expected };
      };
      const issue = (level, f, text, expected) => { r.issues.push({ level, field: f, text }); mark(f, level, expected); };
      ANSWER_FIELDS.forEach(f => mark(f, val(f) ? 'ok' : 'empty'));
      REQUIRED_FIELDS.forEach(f => { if (!val(f)) issue('err', f, `Manca ${FIELD_NAMES[f]}: è obbligatorio.`); });

      const ip = val('network') ? parseIp(val('network')) : null;
      if (val('network') && ip === null) issue('err', 'network', `«${val('network')}» non è un indirizzo IPv4 valido.`);
      let prefix = null;
      const p = val('prefix').replace(/^\//, '');
      if (p) {
        if (/^\d{1,2}$/.test(p) && Number(p) <= 32) prefix = Number(p);
        else issue('err', 'prefix', 'Il prefisso deve essere un numero da 0 a 32, per esempio /26.');
      }
      const need = maskForHosts(net.hosts);
      if (prefix !== null) {
        if (net.hosts > hostsOf(prefix)) {
          issue('err', 'prefix', `Una /${prefix} ha ${nf.format(hostsOf(prefix))} host, ne servono ${nf.format(net.hosts)}: serve almeno una /${need}.`, '/' + need);
        } else if (maskType === 'fixed' && prefix !== fixedMask) {
          issue('err', 'prefix', `A maschera fissa tutte le reti hanno la maschera della rete più grande: /${fixedMask}.`, '/' + fixedMask);
        } else if (maskType !== 'fixed' && prefix < need) {
          issue('warn', 'prefix', `Più grande del necessario: per ${nf.format(net.hosts)} host basta una /${need}.`, '/' + need);
        }
      }
      // The other fields are checked against the student's own network and prefix
      const compare = (f, expected, text) => {
        if (!val(f)) return;
        const got = parseIp(val(f));
        if (got === null) issue('err', f, `«${val(f)}» non è un indirizzo valido. ${text}`, ipStr(expected));
        else if (got !== expected) issue('err', f, text, ipStr(expected));
      };
      if (prefix !== null) compare('netmask', maskBits(prefix), `La netmask di una /${prefix} è ${ipStr(maskBits(prefix))}: ${prefix} bit a 1 e ${32 - prefix} a 0.`);
      if (ip !== null && prefix !== null) {
        const n = { addr: (ip & maskBits(prefix)) >>> 0, mask: prefix };
        r.n = n;
        if (n.addr !== ip) issue('err', 'network', `${ipStr(ip)} non è un indirizzo di rete per /${prefix}: i bit di host devono essere a 0, quindi ${ipStr(n.addr)}.`, ipStr(n.addr));
        compare('broadcast', lastOf(n), `Il broadcast di ${cidr(n)} è ${ipStr(lastOf(n))}: i bit di host tutti a 1.`);
        compare('gateway', gatewayNum(n), `Per convenzione il gateway è l'indirizzo prima del broadcast: ${gatewayOf(n)}.`);
        compare('firstHost', firstHostNum(n), `Il primo host è l'indirizzo subito dopo quello di rete: ${ipStr(firstHostNum(n))}.`);
        if (val('lastHost')) {
          const got = parseIp(val('lastHost'));
          if (prefix < 31 && got === gatewayNum(n)) {
            issue('warn', 'lastHost', `${ipStr(got)} è l'ultimo indirizzo utilizzabile, ma è quello del gateway: l'ultimo host è ${ipStr(lastHostNum(n))}.`, ipStr(lastHostNum(n)));
          } else {
            compare('lastHost', lastHostNum(n), `L'ultimo host è l'indirizzo prima del gateway: ${ipStr(lastHostNum(n))}.`);
          }
        }
        if (base && (n.addr < base.addr || lastOf(n) > lastOf(base))) issue('err', 'network', `È fuori dalla rete di partenza ${cidr(base)}.`);
      }
      return r;
    });

    // Overlaps, then layout in address order
    const placed = rows.map((r, i) => ({ r, i, n: r.n, name: ex.nets[i].name })).filter(x => x.n);
    placed.forEach((x, a) => placed.forEach((y, b) => {
      if (b <= a || x.n.addr > lastOf(y.n) || y.n.addr > lastOf(x.n)) return;
      x.r.issues.push({ level: 'err', field: 'network', text: `Si sovrappone a «${y.name}» (${cidr(y.n)}).` });
      y.r.issues.push({ level: 'err', field: 'network', text: `Si sovrappone a «${x.name}» (${cidr(x.n)}).` });
      x.r.fields.network.status = y.r.fields.network.status = 'err';
    }));
    const inside = placed.filter(x => !base || (x.n.addr >= base.addr && lastOf(x.n) <= lastOf(base))).sort((x, y) => x.n.addr - y.n.addr);
    if (base && inside.length && inside[0].n.addr > base.addr) {
      gIssue('warn', 'layout', `Il piano non parte dall'inizio della rete: i primi ${nf.format(inside[0].n.addr - base.addr)} indirizzi di ${cidr(base)} restano inutilizzati.`);
    }
    inside.forEach((x, k) => {
      const prev = inside[k - 1];
      if (!prev || x.n.addr <= lastOf(prev.n)) return;
      const warn = text => { x.r.issues.push({ level: 'warn', field: 'network', text }); if (x.r.fields.network.status === 'ok') x.r.fields.network.status = 'warn'; };
      const gap = x.n.addr - lastOf(prev.n) - 1;
      if (gap > 0) warn(`C'è un buco di ${nf.format(gap)} indirizzi tra «${prev.name}» e questa rete.`);
      if (x.n.mask < prev.n.mask) warn(`È più grande di «${prev.name}», che la precede: si assegna dalla rete più grande alla più piccola.`);
    });

    const count = level => rows.reduce((s, r) => s + r.issues.filter(i => i.level === level).length, 0) + global.filter(g => g.level === level).length;
    const correctRows = rows.filter(r => !r.issues.some(i => i.level === 'err')).length;
    const errors = count('err'), warns = count('warn');
    return { global, rows, errors, warns, correctRows, total: rows.length, perfect: errors === 0 && warns === 0, maskType };
  };

  const exercise = { LEVELS, generate, solve, hints, check, neededFor, ANSWER_FIELDS, REQUIRED_FIELDS };

  return {
    // exercises
    exercise,
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
