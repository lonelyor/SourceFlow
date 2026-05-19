const { Plugin, Setting, showMessage } = require("sourceflow");

const DEFAULT_STATE = {
  greeting: "Hello from SourceFlow",
  clickCount: 0
};

module.exports = class SourceFlowHelloPlugin extends Plugin {
  async onload() {
    this.state = await this.loadState();
    this.greetingInput = document.createElement("input");
    this.greetingInput.className = "b3-text-field fn__block";
    this.greetingInput.value = this.state.greeting;
    this.greetingInput.placeholder = this.t("greetingPlaceholder", "Hello from SourceFlow");

    this.setting = new Setting({
      confirmCallback: async () => {
        this.state.greeting = this.greetingInput.value.trim() || DEFAULT_STATE.greeting;
        this.renderStatus();
        await this.persistState();
        showMessage(this.t("settingsSaved", "Plugin settings saved"));
      }
    });
    this.setting.addItem({
      title: this.t("settingsTitle", "Greeting text"),
      description: this.t("settingsDesc", "This text is shown when the example plugin runs."),
      actionElement: this.greetingInput,
      direction: "column"
    });

    this.statusElement = document.createElement("div");
    this.statusElement.className = "sourceflow-hello-status";
    this.addStatusBar({
      element: this.statusElement,
      position: "left"
    });
    this.renderStatus();

    this.addTopBar({
      icon: "iconSparkles",
      title: this.t("topBarTitle", "SourceFlow Hello"),
      callback: () => {
        void this.sayHello();
      }
    });

    this.addCommand({
      langKey: "sayHelloCommand",
      hotkey: "",
      callback: () => {
        void this.sayHello();
      }
    });
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

  renderStatus() {
    if (!this.statusElement) {
      return;
    }
    this.statusElement.textContent = `${this.t("statusLabel", "Hello Count")}: ${this.state.clickCount}`;
  }

  async sayHello() {
    this.state.clickCount += 1;
    this.renderStatus();
    await this.persistState();
    showMessage(`${this.state.greeting} (#${this.state.clickCount})`);
  }

  t(key, fallback) {
    return this.i18n?.[key] || fallback;
  }
};
