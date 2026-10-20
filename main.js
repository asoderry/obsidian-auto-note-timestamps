const { Plugin, PluginSettingTab, Setting, TFile } = require("obsidian");

const DEFAULT_SETTINGS = {
  excludedFolders: [],
};

module.exports = class NoteTimestampsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.lastUpdates = new Map();

    // Register native Obsidian property types
    const metadataTypeManager = this.app.metadataTypeManager;

    if (metadataTypeManager) {
      metadataTypeManager.setType("date", "date");
      metadataTypeManager.setType("last_modified", "datetime");
    }

    // Add the plugin settings page
    this.addSettingTab(new NoteTimestampsSettingTab(this.app, this));

    // Add date when a new Markdown note is created
    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (!(file instanceof TFile)) return;
        if (file.extension !== "md") return;
        if (this.isExcluded(file)) return;

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          if (!frontmatter.date) {
            frontmatter.date = window.moment().format("YYYY-MM-DD");
          }

          this.reorderProperties(frontmatter);
        });
      }),
    );

    // Update last_modified whenever a Markdown note changes
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (!(file instanceof TFile)) return;
        if (file.extension !== "md") return;
        if (this.isExcluded(file)) return;

        const now = Date.now();
        const lastUpdate = this.lastUpdates.get(file.path) ?? 0;

        if (now - lastUpdate < 60_000) {
          return;
        }

        this.lastUpdates.set(file.path, now);

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          frontmatter.last_modified = window
            .moment()
            .format("YYYY-MM-DDTHH:mm:ss");

          this.reorderProperties(frontmatter);
        });
      }),
    );

    console.log("Note Timestamps loaded");
  }

  isExcluded(file) {
    return this.settings.excludedFolders.some((folder) => {
      const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");

      if (!cleanFolder) return false;

      return (
        file.path === cleanFolder || file.path.startsWith(cleanFolder + "/")
      );
    });
  }

  reorderProperties(frontmatter) {
    const dateCreated = frontmatter.date;
    const lastModified = frontmatter.last_modified;

    delete frontmatter.date;
    delete frontmatter.last_modified;

    const otherProperties = { ...frontmatter };

    // Clear the current object
    for (const key of Object.keys(frontmatter)) {
      delete frontmatter[key];
    }

    // Timestamp properties always go first
    if (dateCreated !== undefined) {
      frontmatter.date = dateCreated;
    }

    if (lastModified !== undefined) {
      frontmatter.last_modified = lastModified;
    }

    // Restore everything else afterwards
    Object.assign(frontmatter, otherProperties);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    this.lastUpdates?.clear();
  }
};

class NoteTimestampsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc(
        "Notes inside these folders will not receive date or last_modified properties. Enter one folder per line.",
      )
      .addTextArea((text) => {
        text
          .setPlaceholder("Templates\nAttachments\nArchive")
          .setValue(this.plugin.settings.excludedFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value
              .split("\n")
              .map((folder) => folder.trim())
              .filter((folder) => folder.length > 0);

            await this.plugin.saveSettings();
          });

        text.inputEl.rows = 6;
        text.inputEl.cols = 40;
      });
  }
}
