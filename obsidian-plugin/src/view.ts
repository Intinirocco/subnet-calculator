import { MarkdownRenderChild, MarkdownPostProcessorContext, TFile } from 'obsidian';
import type { SubnetSettings } from './settings';

export interface SourceRef {
  path: string;
  oldBlock: string;
  info: string;
}

/**
 * Componente di rendering per blocchi markdown ```subnet
 * Renderizza una tabella di subnetting e pulsanti di azione
 */
export class SubnetRenderChild extends MarkdownRenderChild {
  private wrap!: HTMLElement;
  private inner!: HTMLElement;
  private toolbar!: HTMLElement;

  constructor(
    containerEl: HTMLElement,
    private source: string,
    private settings: SubnetSettings,
    private ctxPost: MarkdownPostProcessorContext,
    private openCalculator: (ref: SourceRef | null) => void
  ) {
    super(containerEl);
  }

  onload(): void {
    this.wrap = this.containerEl.createDiv({ cls: 'subnet-wrap' });
    this.toolbar = this.wrap.createDiv({ cls: 'subnet-toolbar' });
    this.inner = this.wrap.createDiv({ cls: 'subnet-inner' });

    try {
      this.render();
    } catch (e) {
      this.fail('Errore nel parsing: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  onunload(): void {
    /* nessuna risorsa esterna */
  }

  private render(): void {
    const lines = this.source.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

    // Parsing semplice della configurazione subnet
    const config = this.parseConfig(lines);

    if (!config.net) {
      this.fail('Configurazione non valida: manca "net"');
      return;
    }

    this.renderToolbar();
    this.renderConfig(config);
  }

  private parseConfig(lines: string[]): Record<string, string | string[]> {
    const config: Record<string, string | string[]> = {};
    let currentKey = '';

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':', 2).map((s) => s.trim());
        if (value) {
          config[key] = value;
          currentKey = key;
        }
      } else if (currentKey === 'plan' && (line.startsWith('-') || line.startsWith('/'))) {
        if (!Array.isArray(config.plan)) config.plan = [];
        (config.plan as string[]).push(line.replace(/^[- ]/, '').trim());
      }
    }

    return config;
  }

  private renderToolbar(): void {
    this.toolbar.innerHTML = '';

    const editBtn = this.toolbar.createEl('button', {
      text: '✏️ Modifica',
      cls: 'subnet-btn-edit',
    });
    editBtn.addEventListener('click', () => {
      const ref: SourceRef = {
        path: this.ctxPost.sourcePath,
        oldBlock: '```subnet\n' + this.source + '\n```',
        info: '',
      };
      this.openCalculator(ref);
    });

    const copyBtn = this.toolbar.createEl('button', {
      text: '📋 Copia',
      cls: 'subnet-btn-copy',
    });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.source);
      copyBtn.textContent = '✓ Copiato';
      setTimeout(() => (copyBtn.textContent = '📋 Copia'), 2000);
    });
  }

  private renderConfig(config: Record<string, string | string[]>): void {
    this.inner.innerHTML = '';

    const table = this.inner.createEl('table', { cls: 'subnet-table' });
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: 'Parametro' });
    headerRow.createEl('th', { text: 'Valore' });

    const tbody = table.createEl('tbody');
    for (const [key, value] of Object.entries(config)) {
      const row = tbody.createEl('tr');
      row.createEl('td', { text: key });
      const valueCell = row.createEl('td');
      if (Array.isArray(value)) {
        valueCell.textContent = value.join(', ');
      } else {
        valueCell.textContent = String(value);
      }
    }
  }

  private fail(text: string): void {
    this.inner.innerHTML = '';
    this.inner.createDiv({ text, cls: 'subnet-msg-error' });
  }
}
