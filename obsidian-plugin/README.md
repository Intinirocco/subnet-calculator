# Subnet Calculator Plugin per Obsidian

Un plugin Obsidian per il calcolo e la visualizzazione di subnetting VLSM/FLSM direttamente nei tuoi appunti.

## Caratteristiche

- 📊 Visualizzazione tabellare di subnetting
- ✏️ Modifica facile tramite interfaccia interattiva
- 🔄 Supporto VLSM (Variable Length Subnet Masking)
- 📋 Copia rapida della configurazione
- 🎨 Tema supportato (light/dark)
- ⚙️ Personalizzazione colonne visibili

## Installazione

1. Copia l'intera cartella del plugin nella cartella `.obsidian/plugins/` del tuo vault Obsidian
2. Ricarica Obsidian
3. Abilita il plugin nelle impostazioni di Obsidian

## Uso

Crea un blocco di codice markdown con il linguaggio `subnet`:

```subnet
net: 192.168.0.0/24
plan:
  - /26
  - /26
  - /26
  - /26
```

### Comandi disponibili

- **Apri calcolatore subnet**: Apre il calcolatore per creare un nuovo blocco subnet

### Sintassi

```
net: [indirizzo IP]/[CIDR]
plan:
  - /[CIDR]
  - /[CIDR]
```

## Sviluppo

```bash
# Installa le dipendenze
npm install

# Build in development (watch mode)
npm run dev

# Build production
npm run build

# Type checking
npm run check
```

## Configurazione

Accedi alle impostazioni del plugin per:
- Nascondere colonne di default nella visualizzazione
- Personalizzare il tema di rendering

## Licenza

MIT
