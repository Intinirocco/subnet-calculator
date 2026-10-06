# Sviluppo Plugin Subnet Calculator

## Prossime fasi di sviluppo

### Fase 1: Integrazione subnet-lib
Attualmente il plugin esegue parsing semplice. Prossimamente integreremo `subnet-lib.js` per:

```bash
# Copia o riferisci subnet-lib.js nel plugin
cp ../subnet-lib.mjs ./src/subnet-lib.mjs
```

### Fase 2: Componenti avanzati di rendering

Nel file `src/view.ts`, estenderemo il metodo `renderConfig()` per:
- Visualizzare tabelle con subnet calcolate
- Mostrare gateway, broadcast, range di indirizzi usabili
- Colorare le righe per classe di indirizzo
- Aggiungere il rendering in modalità binaria

### Fase 3: Modal interattiva

Nel file `src/main.ts` aggiungeremo una `SubnetLabModal` che permetta:
- Editing interattivo del blocco subnet
- Calcolo real-time del piano di subnetting
- Visualizzazione dell'albero VLSM
- Verifica della validità del piano

### Fase 4: Comandi avanzati

Aggiungeremo comandi per:
```typescript
this.addCommand({
  id: 'analyze-subnet',
  name: 'Analizza subnet',
  callback: () => { /* analize */ }
});

this.addCommand({
  id: 'verify-subnet',
  name: 'Verifica piano',
  callback: () => { /* verify */ }
});

this.addCommand({
  id: 'export-cisco',
  name: 'Esporta configurazione Cisco',
  callback: () => { /* export */ }
});
```

## Architettura

```
main.ts (Plugin principale)
├── registerMarkdownCodeBlockProcessor("subnet", ...)
├── addCommand("open-calculator")
└── addSettingTab(SubnetSettingTab)

view.ts (SubnetRenderChild)
├── parseConfig() - Parser DSL
├── renderToolbar() - Barre degli strumenti
├── renderConfig() - Visualizzazione della configurazione
└── fail() - Gestione errori

settings.ts (Configurazione)
├── SubnetSettings (interfaccia)
└── SubnetSettingTab (UI impostazioni)
```

## Integrare subnet-lib

Dopo aver copiato `subnet-lib.mjs`:

```typescript
// In view.ts
import { parseSubnet, calculateVLSM } from './subnet-lib.mjs';

private render(): void {
  const config = this.parseConfig(lines);
  const result = calculateVLSM(config.net, config.plan);
  this.renderTable(result);
}
```

## Testing

I test vanno aggiunti in `test/test.ts`:

```typescript
import { parseSubnet } from '../src/subnet-lib.mjs';

describe('Subnet parsing', () => {
  it('should parse valid CIDR notation', () => {
    const result = parseSubnet('192.168.0.0/24');
    assert.ok(result);
  });
});
```

## Configurazione del plugin nel Makefile

Nel futuro aggiungeremo un Makefile come nel plugin di riferimento:

```makefile
.PHONY: dev build test
dev:
	npm run dev

build:
	npm run build

test:
	npm test
```

## File structure finale (obiettivo)

```
obsidian-plugin/
├── src/
│   ├── main.ts
│   ├── view.ts
│   ├── settings.ts
│   ├── lab-modal.ts        # FUTURE: Modal per editing
│   ├── render.ts           # FUTURE: Rendering avanzato
│   └── subnet-lib.mjs      # Copia da ../subnet-lib.mjs
├── test/
│   ├── test.ts
│   └── test.js (generato)
├── .github/workflows/
│   └── release.yml
├── styles.css
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── main.js (generato)
└── README.md
```

## Debugging

Per debuggare il plugin in Obsidian:

1. Apri Developer Tools (Ctrl+Shift+I / Cmd+Opt+I)
2. Console tab per controllare i log
3. Usa `console.log()` nel TypeScript - sarà visibile dopo il build

### Dev di convenienza

Usa symbolic links per lo sviluppo:

```bash
# Mac/Linux
ln -s /Users/roccointini/Desktop/subnet-calculator/obsidian-plugin \
      ~/.obsidian/plugins/subnet-calculator-plugin
```

Poi ogni volta che farai `npm run build`, il plugin in Obsidian si aggiornerà automaticamente.

## Prossimi step immediati

1. ✅ Setup base plugin
2. ⏳ Integrare subnet-lib.js
3. ⏳ Sviluppare lab-modal per editing
4. ⏳ Rendering avanzato con tabelle VLSM
5. ⏳ Testare in Obsidian

## Riferimenti

- [Obsidian Plugin API](https://docs.obsidian.md/)
- [Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Plugin Plugin Repository](https://docs.obsidian.md/Obsidian+Publish/Obsidian+Plugins)
