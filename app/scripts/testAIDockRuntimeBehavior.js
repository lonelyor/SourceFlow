const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

class FakeInputElement {
    constructor(attrs = {}, extra = {}) {
        this.attrs = attrs;
        this.parentElement = null;
        Object.assign(this, extra);
    }

    getAttribute(name) {
        return this.attrs[name] ?? null;
    }

    closest() {
        return null;
    }

    isEqualNode(other) {
        return this === other;
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

    isEqualNode(other) {
        return this === other;
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
        sending: false,
        editingMessageId: "",
        draftMessage: "",
        draftBackup: "",
        attachments: [],
        attachmentsBackup: null,
        noteSearchKeyword: "",
        noteSearchResults: [],
        noteSearchLoading: false,
        selectedProfileId: "",
        messages: [],
        renderCount: 0,
        switchProfileCalls: [],
        refreshToolCatalogCalls: [],
        confirmToolCalls: [],
        rejectToolCalls: [],
        sendMessageCalls: [],
        clearEditingMessageCalls: [],
        startEditingMessageCalls: [],
        addComposerAttachmentsCalls: [],
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
        async addComposerAttachments(files) {
            this.addComposerAttachmentsCalls.push(files);
        },
        async confirmTool(messageId, toolIndex) {
            this.confirmToolCalls.push({messageId, toolIndex});
        },
        async rejectTool(messageId, toolIndex) {
            this.rejectToolCalls.push({messageId, toolIndex});
        },
        async selectSession() {},
        removeComposerAttachment() {},
        toggleFloatingPanel() {},
        async handleAction(action, target) {
            return handleAIDockAction(this, action, target);
        },
        async sendMessage() {
            this.sendMessageCalls.push(1);
        },
        clearEditingMessage(restore) {
            this.clearEditingMessageCalls.push(restore);
        },
        startEditingMessage(messageId) {
            this.startEditingMessageCalls.push(messageId);
        },
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
        toggleMessageExpanded() {},
    };
};

const createFakeClickEvent = (target) => ({
    target,
    preventDefault() {},
});

const createFakeKeyboardEvent = (target, key) => ({
    target,
    key,
    shiftKey: false,
    isComposing: false,
    preventDefault() {},
});

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

    const rt2 = createRuntime();
    bindAIDockEvents(rt2);

    rt2.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "confirm-tool", "data-message-id": "msg-1", "data-tool-index": "2"}),
    ));
    assert.deepStrictEqual(rt2.confirmToolCalls, [{messageId: "msg-1", toolIndex: 2}]);

    rt2.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "reject-tool", "data-message-id": "msg-1", "data-tool-index": "0"}),
    ));
    assert.deepStrictEqual(rt2.rejectToolCalls, [{messageId: "msg-1", toolIndex: 0}]);

    const rt3 = createRuntime();
    bindAIDockEvents(rt3);

    rt3.element.dispatch("keydown", createFakeKeyboardEvent(
        new FakeTextAreaElement({"data-role": "message"}),
        "Enter",
    ));
    assert.strictEqual(rt3.sendMessageCalls.length, 1);

    rt3.editingMessageId = "msg-1";
    rt3.element.dispatch("keydown", createFakeKeyboardEvent(
        new FakeTextAreaElement({"data-role": "message"}),
        "Escape",
    ));
    assert.deepStrictEqual(rt3.clearEditingMessageCalls, [true]);

    await handleAIDockAction(rt3, "edit-message", new FakeInputElement({"data-message-id": "msg-42"}));
    assert.deepStrictEqual(rt3.startEditingMessageCalls, ["msg-42"]);

    const rt4 = createRuntime();
    bindAIDockEvents(rt4);

    rt4.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "copy-message", "data-message-id": "msg-c1"}),
    ));
    rt4.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "edit-message", "data-message-id": "msg-e1"}),
    ));
    assert.deepStrictEqual(rt4.startEditingMessageCalls, ["msg-e1"]);

    const rt5 = createRuntime();
    bindAIDockEvents(rt5);

    rt5.element.dispatch("keydown", createFakeKeyboardEvent(
        new FakeTextAreaElement({"data-role": "message"}),
        "Enter",
    ));
    assert.strictEqual(rt5.sendMessageCalls.length, 1);

    rt5.element.dispatch("keydown", createFakeKeyboardEvent(
        new FakeTextAreaElement({"data-role": "message"}),
        "a",
    ));
    assert.strictEqual(rt5.sendMessageCalls.length, 1);

    const rt6 = createRuntime();
    bindAIDockEvents(rt6);
    rt6.editingMessageId = "";

    rt6.element.dispatch("keydown", createFakeKeyboardEvent(
        new FakeTextAreaElement({"data-role": "message"}),
        "Escape",
    ));
    assert.deepStrictEqual(rt6.clearEditingMessageCalls, []);

    console.log("[ai-dock-runtime-behavior] ok");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
