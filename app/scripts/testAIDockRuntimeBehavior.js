const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

class FakeInputElement {
    constructor(attrs = {}, extra = {}) {
        this.attrs = attrs;
        Object.assign(this, extra);
    }

    getAttribute(name) {
        return this.attrs[name] ?? null;
    }

    closest() {
        return null;
    }

    blur() {
    }
}

class FakeTextAreaElement extends FakeInputElement {
}

class FakeSelectElement extends FakeInputElement {
}

class FakeElement {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, handler) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type).push(handler);
    }

    dispatch(type, event) {
        const handlers = this.listeners.get(type) || [];
        handlers.forEach((handler) => handler(event));
    }
}

const compileModule = (entryPath, requireMap = {}, globals = {}) => {
    const source = fs.readFileSync(entryPath, "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: entryPath,
    });
    const moduleObj = {exports: {}};
    const dirname = path.dirname(entryPath);
    const localRequire = (request) => {
        if (request in requireMap) {
            return requireMap[request];
        }
        if (request.startsWith(".")) {
            const target = path.resolve(dirname, request);
            const withExt = fs.existsSync(target) ? target : `${target}.ts`;
            return compileModule(withExt, requireMap, globals);
        }
        return require(request);
    };
    vm.runInNewContext(compiled.outputText, {
        module: moduleObj,
        exports: moduleObj.exports,
        require: localRequire,
        console,
        HTMLInputElement: FakeInputElement,
        HTMLTextAreaElement: FakeTextAreaElement,
        HTMLSelectElement: FakeSelectElement,
        ...globals,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const appRoot = path.join(__dirname, "..");
const aiRoot = path.join(appRoot, "src", "assistant", "ai");
const openSettingCalls = [];

const eventsModule = compileModule(path.join(aiRoot, "AIDockEvents.ts"), {
    "../../config": {
        openSettingTab: (...args) => {
            openSettingCalls.push(args);
        },
    },
    "./AIDockShared": {
        getImageFilesFromDataTransfer: () => [],
    },
});

const {bindAIDockEvents, handleAIDockAction} = eventsModule;

const createRuntime = () => {
    const element = new FakeElement();
    return {
        app: {name: "test-app"},
        element,
        activePanel: "target",
        sessionsCollapsed: false,
        enableTools: false,
        noteSearchKeyword: "",
        noteSearchResults: [],
        noteSearchLoading: false,
        selectedProfileId: "",
        renderCount: 0,
        switchProfileCalls: [],
        refreshToolCatalogCalls: [],
        render() {
            this.renderCount += 1;
        },
        async switchProfile(profileId) {
            this.switchProfileCalls.push(profileId);
        },
        async refreshToolCatalog(profileId) {
            this.refreshToolCatalogCalls.push(profileId);
        },
        async searchTargetNotes() {},
        async addComposerAttachments() {},
        async confirmTool() {},
        async selectSession() {},
        removeComposerAttachment() {},
        toggleFloatingPanel() {},
        async handleAction(action, target) {
            return handleAIDockAction(this, action, target);
        },
        async sendMessage() {},
        clearEditingMessage() {},
        focusComposer() {},
        async selectTargetNote() {},
        async updateToolPolicyField() {},
        async toggleToolEnabled() {},
        async followCurrentNote() {},
        clearTargetNote() {},
        async createSession() {},
        async renameCurrentSession() {},
        async clearCurrentSession() {},
        async deleteCurrentSession() {},
        async clearAllSessions() {},
        async saveTranscript() {},
        async saveAnalysis() {},
        async insertLastReply() {},
        async refreshAudits() {},
        async pinCurrentNoteAsTarget() {},
        async applyToolPolicyPreset() {},
        openComposerAttachmentPicker() {},
        copyMessage() {},
        startEditingMessage() {},
        toggleMessageExpanded() {},
    };
};

(async () => {
    const runtime = createRuntime();
    bindAIDockEvents(runtime);

    runtime.element.dispatch("change", {
        target: new FakeInputElement({"data-role": "enable-tools"}, {checked: true}),
    });
    assert.strictEqual(runtime.enableTools, true);
    assert.strictEqual(runtime.renderCount, 1);

    runtime.element.dispatch("change", {
        target: new FakeSelectElement({"data-role": "profile"}, {value: "profile-2"}),
    });
    assert.deepStrictEqual(runtime.switchProfileCalls, ["profile-2"]);
    assert.deepStrictEqual(runtime.refreshToolCatalogCalls, []);

    runtime.element.dispatch("input", {
        target: new FakeSelectElement({"data-role": "profile"}, {value: "profile-3"}),
    });
    assert.deepStrictEqual(runtime.switchProfileCalls, ["profile-2"]);
    assert.deepStrictEqual(runtime.refreshToolCatalogCalls, []);

    await handleAIDockAction(runtime, "open-profiles");
    assert.strictEqual(runtime.activePanel, "");
    assert.strictEqual(runtime.sessionsCollapsed, true);
    assert.ok(runtime.renderCount >= 2);
    assert.strictEqual(openSettingCalls.length, 1);
    assert.strictEqual(openSettingCalls[0][1], "AI");

    console.log("[ai-dock-runtime-behavior] ok");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
