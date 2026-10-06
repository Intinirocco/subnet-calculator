# Installazione Plugin Obsidian

## Quick Start

Segui questi passi per installare il plugin Subnet Calculator in Obsidian:

### 1. Prepara l'ambiente

```bash
cd obsidian-plugin
npm install
npm run build
```

### 2. Locazione del vault Obsidian

Il tuo vault si trova tipicamente in:
- **Mac/Linux**: `~/Obsidian Vault` oppure un percorso personalizzato
- **Windows**: `C:\Users\[username]\Obsidian Vault`

### 3. Copia il plugin

Copia l'intera cartella `obsidian-plugin` in:

```
<YOUR_VAULT>/.obsidian/plugins/subnet-calculator-plugin/
```

**Oppure** (scelta consigliata per lo sviluppo):

```bash
# Crea un symbolic link per lo sviluppo
ln -s /Users/roccointini/Desktop/subnet-calculator/obsidian-plugin \
      ~/.obsidian/vault/.obsidian/plugins/subnet-calculator-plugin
```

### 4. Ricarica Obsidian

- Chiudi e riapri Obsidian oppure premi `Ctrl+R` (Windows/Linux) o `Cmd+R` (Mac)

### 5. Abilita il plugin

1. Apri **Impostazioni** (gear icon)
2. Vai a **Plugin della comunità**
3. Scorri fino a trovare **Subnet Calculator**
4. Clicca il toggle per abilitare

## Sviluppo

Durante lo sviluppo puoi usare:

```bash
npm run dev    # Watch mode per auto-rebuild
npm run build  # Production build
```

Ogni volta che modifichi i file TypeScript, il plugin verrà automaticamente ricompilato.

## Primo utilizzo

Nel tuo vault Obsidian, crea una nota e aggiungi:

````markdown
# Mio Piano di Subnetting

```subnet
net: 192.168.0.0/24
plan:
  - /26
  - /26
  - /26
  - /26
```
````

Vedrai una tabella renderizzata con i parametri e pulsanti per modificare il blocco.

## Comandi disponibili

Nel Obsidian Command Palette (Ctrl+P / Cmd+P):
- **Apri calcolatore subnet**: Apre il calcolatore per creare un nuovo blocco

## Struttura della configurazione subnet

```
net: <rete_CIDR>        # La rete principale (es. 192.168.0.0/24)
plan:
  - <subnet_CIDR>       # Prima subnet (es. /26)
  - <subnet_CIDR>       # Seconda subnet
  - ...
```

## Prossimi passi

1. **Modifica i file TypeScript** in `obsidian-plugin/src/`
2. **Customizza gli stili** in `obsidian-plugin/styles.css`
3. **Aggiungi test** in `obsidian-plugin/test/`

Per ulteriori informazioni, consulta il [PLUGIN_GUIDE.md](obsidian-plugin/PLUGIN_GUIDE.md)
