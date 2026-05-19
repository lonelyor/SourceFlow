const { Plugin, Setting, showMessage } = require("sourceflow");

const DEFAULT_STATE = {
  enabled: true,
  compactMode: false,
  softContrast: true
};

module.exports = class SourceFlowPaperPolishPlugin extends Plugin {
  async onload() {
    this.state = await this.loadState();
    this.createSettings();
    this.createStatusBar();
    this.addTopBar({
      icon: "iconSparkles",
      title: this.t("toggleTitle", "Toggle Paper Polish"),
      callback: () => {
        void this.togglePolish();
      }
    });
    this.addCommand({
      langKey: "togglePaperPolish",
      hotkey: "",
      callback: () => {
        void this.togglePolish();
      }
    });
    this.ensureRuntimeStyle();
    this.applyPolish();
  }

  async loadState() {
    const stored = await this.loadData("state.json");
    if (!stored || typeof stored !== "object") {
      return { ...DEFAULT_STATE };
    }
    return {
      ...DEFAULT_STATE,
      ...stored
    };
  }

  async persistState() {
    await this.saveData("state.json", this.state);
  }

  createSettings() {
    this.enabledInput = this.createCheckbox(this.state.enabled);
    this.compactInput = this.createCheckbox(this.state.compactMode);
    this.contrastInput = this.createCheckbox(this.state.softContrast);
    this.setting = new Setting({
      confirmCallback: async () => {
        this.state.enabled = Boolean(this.enabledInput.checked);
        this.state.compactMode = Boolean(this.compactInput.checked);
        this.state.softContrast = Boolean(this.contrastInput.checked);
        this.applyPolish();
        await this.persistState();
        showMessage(this.t("settingsSaved", "Paper Polish settings saved"));
      }
    });
    this.setting.addItem({
      title: this.t("enabledTitle", "Enable polish"),
      description: this.t("enabledDesc", "Apply the reading and writing polish layer automatically."),
      actionElement: this.enabledInput
    });
    this.setting.addItem({
      title: this.t("compactTitle", "Compact density"),
      description: this.t("compactDesc", "Use tighter spacing for dense notebooks and dashboards."),
      actionElement: this.compactInput
    });
    this.setting.addItem({
      title: this.t("contrastTitle", "Soft contrast"),
      description: this.t("contrastDesc", "Use softer panels, quotes, tables, and code blocks."),
      actionElement: this.contrastInput
    });
  }

  createCheckbox(checked) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(checked);
    return input;
  }

  createStatusBar() {
    this.statusElement = document.createElement("div");
    this.statusElement.className = "sourceflow-paper-polish-status";
    this.addStatusBar({
      element: this.statusElement,
      position: "left"
    });
    this.renderStatus();
  }

  renderStatus() {
    if (!this.statusElement) {
      return;
    }
    this.statusElement.textContent = this.state.enabled
      ? this.t("statusOn", "Paper Polish")
      : this.t("statusOff", "Polish off");
  }

  async togglePolish() {
    this.state.enabled = !this.state.enabled;
    if (this.enabledInput) {
      this.enabledInput.checked = this.state.enabled;
    }
    this.applyPolish();
    await this.persistState();
    showMessage(this.state.enabled ? this.t("enabledMessage", "Paper Polish enabled") : this.t("disabledMessage", "Paper Polish disabled"));
  }

  async sayHello() {
    await this.togglePolish();
  }

  applyPolish() {
    const root = this.getRootElement();
    this.toggleClass(root, "sourceflow-paper-polish--on", this.state.enabled);
    this.toggleClass(root, "sourceflow-paper-polish--compact", this.state.enabled && this.state.compactMode);
    this.toggleClass(root, "sourceflow-paper-polish--soft", this.state.enabled && this.state.softContrast);
    this.renderStatus();
  }

  getRootElement() {
    if (typeof document === "undefined") {
      return null;
    }
    return document.documentElement || document.body || null;
  }

  toggleClass(element, className, enabled) {
    if (!element) {
      return;
    }
    if (element.classList && typeof element.classList.toggle === "function") {
      element.classList.toggle(className, Boolean(enabled));
      return;
    }
    const current = `${element.className || ""}`.split(/\s+/).filter(Boolean);
    const exists = current.includes(className);
    if (enabled && !exists) {
      current.push(className);
    } else if (!enabled && exists) {
      current.splice(current.indexOf(className), 1);
    }
    element.className = current.join(" ");
  }

  ensureRuntimeStyle() {
    if (this.runtimeStyle || typeof document === "undefined" || !document.head || typeof document.head.appendChild !== "function") {
      return;
    }
    const style = document.createElement("style");
    style.textContent = `
html.sourceflow-paper-polish--on {
  --paper-polish-text: #202124;
  --paper-polish-muted: #69707a;
  --paper-polish-surface: rgba(248, 250, 252, 0.92);
  --paper-polish-border: rgba(87, 96, 111, 0.18);
}
html.sourceflow-paper-polish--on .protyle-wysiwyg,
html.sourceflow-paper-polish--on .b3-typography {
  max-width: 920px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.78;
  color: var(--paper-polish-text);
}
html.sourceflow-paper-polish--on .protyle-title__input {
  max-width: 920px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.28;
}
html.sourceflow-paper-polish--on .protyle-wysiwyg [data-node-id] {
  margin-top: 0.18em;
  margin-bottom: 0.18em;
}
html.sourceflow-paper-polish--on .protyle-wysiwyg blockquote,
html.sourceflow-paper-polish--on .b3-typography blockquote {
  border-left: 4px solid rgba(81, 124, 183, 0.38);
  background: var(--paper-polish-surface);
  border-radius: 6px;
  padding: 10px 14px;
}
html.sourceflow-paper-polish--on .protyle-wysiwyg table,
html.sourceflow-paper-polish--on .b3-typography table {
  border-radius: 6px;
  overflow: hidden;
}
html.sourceflow-paper-polish--on .protyle-wysiwyg code,
html.sourceflow-paper-polish--on .b3-typography code {
  border: 1px solid var(--paper-polish-border);
  border-radius: 4px;
}
html.sourceflow-paper-polish--compact .protyle-wysiwyg,
html.sourceflow-paper-polish--compact .b3-typography {
  max-width: 1080px;
  line-height: 1.58;
}
html.sourceflow-paper-polish--soft .protyle-background,
html.sourceflow-paper-polish--soft .layout-tab-container {
  background-color: rgba(250, 251, 253, 0.9);
}`;
    document.head.appendChild(style);
    this.runtimeStyle = style;
  }

  t(key, fallback) {
    return this.i18n?.[key] || fallback;
  }
};
