import { MarkdownView, Plugin, TFile } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  SubnetSettings,
  SubnetSettingTab,
} from './settings';
import { SubnetRenderChild, SourceRef } from './view';

export default class SubnetPlugin extends Plugin {
  settings!: SubnetSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new SubnetSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor(
      'subnet',
      (source, el, ctx) => {
        ctx.addChild(
          new SubnetRenderChild(el, source, this.settings, ctx, (ref) => this.openCalculator(ref))
        );
      }
    );

    this.addCommand({
      id: 'open-calculator',
      name: 'Apri calcolatore subnet',
      callback: () => this.openCalculator(null),
    });
  }

  onunload(): void {
    // Il ciclo di vita dei singoli viewer è gestito da ogni SubnetRenderChild.
  }

  private openCalculator(ref: SourceRef | null): void {
    // Per ora, apre una semplice finestra modale
    // In futuro, potrebbe aprire un pannello o una modal più complessa
    if (ref) {
      // Modifica il blocco di origine
      this.updateSourceBlock(ref);
    } else {
      // Inserisce un nuovo blocco
      this.insertNewBlock();
    }
  }

  private updateSourceBlock(ref: SourceRef): void {
    const file = this.app.vault.getAbstractFileByPath(ref.path);
    if (!(file instanceof TFile)) return;

    this.app.vault.process(file, (data: string) => {
      // Placeholder: la logica di modifica verrà implementata nel modal
      return data;
    });
  }

  private insertNewBlock(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    view.editor.replaceSelection('```subnet\nnet: 192.168.0.0/24\nplan:\n  - /26\n  - /26\n  - /26\n  - /26\n```');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
