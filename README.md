# Subnet Calculator visuale

Calcolatore di sottoreti IPv4: divisione e unione, pianificatore a maschera variabile o fissa,
verifica di un partizionamento, topologia e comandi Cisco per dispositivo.

Sito: https://intinirocco.github.io/subnet-calculator/

## File

| File | Contenuto |
|---|---|
| `index.html` | Struttura della pagina |
| `style.css` | Stile |
| `app.js` | Interfaccia del sito (usa la libreria) |
| `subnet-lib.js` | Libreria con tutti i calcoli, senza dipendenze e senza DOM |
| `subnet-lib.mjs` | Ingresso per i moduli ES (richiede `subnet-lib.js` nella stessa cartella) |

Per aprire il sito basta un doppio clic su `index.html`.

## Usare la libreria in un altro progetto

Copia `subnet-lib.js` nel progetto (e `subnet-lib.mjs` se usi `import`).

```html
<!-- Pagina web: variabile globale SubnetLib -->
<script src="subnet-lib.js"></script>
<script>
  console.log(SubnetLib.info('192.168.1.130/26').gateway); // 192.168.1.190
</script>
```

```js
// Node / CommonJS
const SubnetLib = require('./subnet-lib.js');

// Moduli ES (browser con type="module", Vite, Node)
import SubnetLib, { info, plan, verify } from './subnet-lib.mjs';
```

## Funzioni principali

### `info(sottorete)`

Accetta `'192.168.1.130/26'`, `'192.168.1.130 255.255.255.192'` o una wildcard. Restituisce `null` se non è valida.

```js
info('192.168.1.130/26');
// {
//   cidr: '192.168.1.128/26', network: '192.168.1.128', prefix: 26,
//   netmask: '255.255.255.192', wildcard: '0.0.0.63', broadcast: '192.168.1.191',
//   firstHost: '192.168.1.129', lastHost: '192.168.1.189', gateway: '192.168.1.190',
//   hosts: 62, size: 64, class: 'C', type: 'Privato (RFC 1918)',
//   binary: { network: '11000000.10101000.00000001.10000000', netmask: '…', … }
// }
```

Il gateway è per convenzione l'ultimo indirizzo utilizzabile (quello prima del broadcast);
`firstHost` e `lastHost` sono gli indirizzi che restano per gli host.

### `plan(richieste, opzioni)`

Genera un piano di indirizzamento. Le richieste sono numeri di host oppure oggetti `{ name, hosts }`.

```js
const p = plan([{ name: 'Rosa', hosts: 800 }, { name: 'Rosso', hosts: 350 }, 15]);
p.base.cidr;       // '172.16.0.0/16'
p.class;           // 'B'
p.subnets[0];      // { name: 'Rosa', requestedHosts: 800, cidr: '172.16.0.0/22', gateway: '172.16.3.254', … }
p.used; p.free;    // indirizzi assegnati e liberi
```

| Opzione | Valori | Predefinito |
|---|---|---|
| `mode` | `'variable'` (VLSM) o `'fixed'` (stessa maschera per tutte) | `'variable'` |
| `base` | rete di partenza, es. `'192.168.0.0/24'` | scelta per classe: C `/24`, B `/16`, A `/8` |
| `growth` | margine di crescita in percentuale | `0` |
| `links` | numero di collegamenti punto-punto `/30` da aggiungere | `0` |

Se il piano non è possibile restituisce `{ ok: false, error, message }`.

### `verify(testo, retePartenza)`

Controlla un partizionamento scritto a mano, una sottorete per riga (`nome host indirizzo/maschera [gateway]`).

```js
const v = verify('A 800 172.16.0.0/23\nB 20 172.16.2.0/27');
v.errors;                 // 1
v.entries[0].issues;      // [['err', 'non bastano gli indirizzi: 800 host richiesti, …']]
```

Ogni voce ha `issues`, un elenco di `['err' | 'warn', messaggio]`; `global` contiene i problemi del piano nel suo insieme.

### Altre

- `split('10.0.0.0/8')` → le due metà, come oggetti `info`.
- `parseIp`, `ipStr`, `toBinary`, `parseMask`, `maskBits`, `hostsOf`, `maskForHosts`, `classOf`, `typeOf`…:
  funzioni di base che lavorano con indirizzi come numeri a 32 bit e sottoreti come `{ addr, mask }`.
