.PHONY: help install dev build clean check test setup

help:
	@echo "Subnet Calculator Obsidian Plugin - Available targets:"
	@echo ""
	@echo "  make setup       - Initial setup (npm install + build)"
	@echo "  make install     - Install dependencies only"
	@echo "  make dev         - Development mode (watch + rebuild)"
	@echo "  make build       - Production build"
	@echo "  make clean       - Remove generated files"
	@echo "  make check       - Type checking"
	@echo "  make test        - Run tests"
	@echo "  make help        - Show this help message"

setup: install build
	@echo "✅ Setup complete! Copy plugin to Obsidian vault and reload."

install:
	@echo "📦 Installing dependencies..."
	npm install

dev:
	@echo "👨‍💻 Development mode (watching for changes)..."
	npm run dev

build:
	@echo "🔨 Building plugin..."
	npm run build

clean:
	@echo "🧹 Cleaning generated files..."
	rm -f main.js main.js.map

check:
	@echo "🔍 Type checking..."
	npm run check

test:
	@echo "🧪 Running tests..."
	npm test

.DEFAULT_GOAL := help
