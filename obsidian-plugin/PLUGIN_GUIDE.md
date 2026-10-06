# Guida Plugin Subnet Calculator per Obsidian

## Struttura del plugin

```
obsidian-plugin/
├── src/
│   ├── main.ts          # Entry point principale del plugin
│   ├── view.ts          # Componente di rendering per i blocchi subnet
│   ├── settings.ts      # Gestione impostazioni plugin
├── styles.css           # Stili CSS del plugin
├── manifest.json        # Metadati plugin
├── package.json         # Dipendenze npm
├── tsconfig.json        # Configurazione TypeScript
├── esbuild.config.mjs   # Configurazione build
└── README.md            # Documentazione plugin
```

## Installazione locale

### Prerequisiti
- Node.js 16+
- Obsidian 1.4.0+

### Setup

1. **Clona o posizionati nella cartella del plugin:**
```bash
cd obsidian-plugin
```

2. **Installa dipendenze:**
```bash
npm install
```

3. **Copia il plugin nel vault:**

Devi copiare la cartella `obsidian-plugin` in:
```
<TUO_VAULT>/.obsidian/plugins/subnet-calculator-plugin/
```

4. **Build in development:**
```bash
npm run dev
```

5. **Abilita il plugin in Obsidian:**
- Vai a Impostazioni → Plugin della community
- Scorri fino a "Subnet Calculator"
- Clicca su "Abilita"

## Uso del plugin

### Blocco subnet di base

Crea un blocco di codice markdown:

````
```subnet
net: 192.168.0.0/24
plan:
  - /26
  - /26
  - /26
  - /26
```
````

### Parametri

- **net**: Rete in formato CIDR (es. `192.168.0.0/24`)
- **plan**: Lista di subnet da creare (in formato CIDR)

### Interazioni

Una volta renderizzato il blocco, vedrai:
- **Tabella dei parametri**: Visualizza la configurazione
- **Pulsante Modifica** (✏️): Permette di modificare il blocco
- **Pulsante Copia** (📋): Copia il testo del blocco

## Sviluppo

### Build

```bash
# Development (watch mode)
npm run dev

# Production
npm run build

# Type checking
npm run check
```

### Test

```bash
npm test
```

## Estensioni future

Il plugin è progettato per integrarsi con `subnet-lib.js` del progetto principale per:
- Calcoli VLSM avanzati
- Visualizzazione gerarchica delle subnet
- Generazione configurazioni Cisco
- Analisi e verifica dei piani di subnetting

## Troubleshooting

### Il plugin non appare

1. Verifica che il file `main.js` sia stato generato (esegui `npm run build`)
2. Assicurati che la cartella sia posizionata correttamente in `.obsidian/plugins/`
3. Ricarica Obsidian (Ctrl+R su Windows/Linux, Cmd+R su Mac)

### Errori nel parsing

Controlla che la sintassi del blocco subnet sia corretta:
- La rete deve avere il formato CIDR
- Le subnet nel plan devono iniziare con `/` o `-`

## Licenza

MIT
