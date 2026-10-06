import { App, PluginSettingTab, Setting } from 'obsidian';
import SubnetPlugin from './main';

export interface SubnetSettings {
  hiddenColumns: string[];
}

export const DEFAULT_SETTINGS: SubnetSettings = {
  hiddenColumns: ['wild', 'range', 'usable', 'hosts', 'req'],
};

export class SubnetSettingTab extends PluginSettingTab {
  plugin: SubnetPlugin;

  constructor(app: App, plugin: SubnetPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Colonne nascoste per default')
      .setDesc('Seleziona le colonne nascoste di default nella visualizzazione')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.hiddenColumns.includes('wild'))
          .onChange(async (value) => {
            if (value) {
              this.plugin.settings.hiddenColumns.push('wild');
            } else {
              this.plugin.settings.hiddenColumns = this.plugin.settings.hiddenColumns.filter(
                (c) => c !== 'wild'
              );
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Intervallo indirizzi')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.hiddenColumns.includes('range'))
          .onChange(async (value) => {
            if (value) {
              this.plugin.settings.hiddenColumns.push('range');
            } else {
              this.plugin.settings.hiddenColumns = this.plugin.settings.hiddenColumns.filter(
                (c) => c !== 'range'
              );
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('IP utilizzabili')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.hiddenColumns.includes('usable'))
          .onChange(async (value) => {
            if (value) {
              this.plugin.settings.hiddenColumns.push('usable');
            } else {
              this.plugin.settings.hiddenColumns = this.plugin.settings.hiddenColumns.filter(
                (c) => c !== 'usable'
              );
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Numero di host')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.hiddenColumns.includes('hosts'))
          .onChange(async (value) => {
            if (value) {
              this.plugin.settings.hiddenColumns.push('hosts');
            } else {
              this.plugin.settings.hiddenColumns = this.plugin.settings.hiddenColumns.filter(
                (c) => c !== 'hosts'
              );
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Host richiesti')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.hiddenColumns.includes('req'))
          .onChange(async (value) => {
            if (value) {
              this.plugin.settings.hiddenColumns.push('req');
            } else {
              this.plugin.settings.hiddenColumns = this.plugin.settings.hiddenColumns.filter(
                (c) => c !== 'req'
              );
            }
            await this.plugin.saveSettings();
          })
      );
  }
}
