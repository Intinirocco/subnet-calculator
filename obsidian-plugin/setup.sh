#!/bin/bash

# Setup script per il plugin Subnet Calculator

set -e

echo "🚀 Setup Plugin Subnet Calculator per Obsidian"
echo ""

# Controlla se Node.js è installato
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non trovato. Installa Node.js 16+ prima di procedere."
    exit 1
fi

echo "✅ Node.js trovato: $(node --version)"
echo ""

# Installa le dipendenze
echo "📦 Installazione dipendenze..."
npm install

echo ""
echo "🔨 Build del plugin..."
npm run build

echo ""
echo "✅ Setup completato!"
echo ""
echo "Prossimi step:"
echo "1. Copia la cartella plugin nel tuo vault Obsidian:"
echo "   mkdir -p <YOUR_VAULT>/.obsidian/plugins/"
echo "   cp -r . <YOUR_VAULT>/.obsidian/plugins/subnet-calculator-plugin/"
echo ""
echo "2. Ricarica Obsidian"
echo ""
echo "3. Abilita il plugin nelle impostazioni di Obsidian"
echo ""
echo "Per lo sviluppo, usa: npm run dev"
