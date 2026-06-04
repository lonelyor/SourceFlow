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
const capturedPasteFiles = [];
const fakeImageFiles = [{name: "test.png", type: "image/png", size: 1024}];

const eventsModule = compileModule(path.join(aiRoot, "AIDockEvents.ts"), {
    "../../config": {
        openSettingTab: (...args) => {
            openSettingCalls.push(args);
        },
    },
    "../../constants": {
        Constants: {
            CB_GET_FOCUS: "focus",
            CB_GET_SCROLL: "scroll",
        },
    },
    "../../editor/util": {
        openFileById: async () => undefined,
    },
    "./AIDockShared": {
        getImageFilesFromDataTransfer: (dt) => {
            if (dt && dt._hasImages) {
                capturedPasteFiles.push(true);
                return fakeImageFiles;
            }
            return [];
        },
        TAssistantAIFloatingPanel: {},
    },
    "../history/operations": {
        rollbackAssistantOperationHistoryItem: async () => true,
    },
    "../mentions/trigger": {
        detectMentionTrigger: () => null,
        searchAndShowMentions: async () => {},
        insertMentionChip: () => ({newValue: "", newCursorPos: 0}),
    },
    "../mentions/types": {},
    "../security/types": {},
});

const {bindAIDockEvents, handleAIDockAction} = eventsModule;
const mentionSearchCalls = [];
const mentionModule = compileModule(path.join(appRoot, "src", "assistant", "mentions", "trigger.ts"), {
    "./api": {
        searchMentionItems: async (query) => {
            mentionSearchCalls.push(query);
            return [];
        },
    },
    "../common/dom": {
        escapeAttr: (value) => String(value),
        escapeHTML: (value) => String(value),
    },
});

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
        sources: [],
        sourcesPanelVisible: false,
        mentionState: {active: false, query: "", selectedIndex: 0, results: [], seq: 0, anchorRect: null},
        securityMode: "default",
        securityDropdownVisible: false,
        renderCount: 0,
        switchProfileCalls: [],
        refreshToolCatalogCalls: [],
        confirmToolCalls: [],
        rejectToolCalls: [],
        applyToolPatchCalls: [],
        rejectToolPatchCalls: [],
        startAgentCalls: [],
        runAgentTaskCalls: [],
        pauseAgentTaskCalls: [],
        cancelAgentTaskCalls: [],
        retryAgentTaskItemCalls: [],
        applyAgentPatchCalls: [],
        rejectAgentPatchCalls: [],
        deleteSessionCalls: [],
        setSessionPinnedCalls: [],
        sendMessageCalls: [],
        clearEditingMessageCalls: [],
        startEditingMessageCalls: [],
        addComposerAttachmentsCalls: [],
        removeComposerAttachmentCalls: [],
        setComposerDropActiveCalls: [],
        copyMessageCalls: [],
        toggleMessageExpandedCalls: [],
        openComposerAttachmentPickerCalls: [],
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
        async applyToolPatch(messageId, toolIndex, operationId = "") {
            this.applyToolPatchCalls.push({messageId, toolIndex, operationId});
        },
        rejectToolPatch(messageId, toolIndex, operationId = "") {
            this.rejectToolPatchCalls.push({messageId, toolIndex, operationId});
        },
        async startAgentFromDraft() {
            this.startAgentCalls.push(1);
        },
        async runAgentTask(taskId) {
            this.runAgentTaskCalls.push(taskId);
        },
        pauseAgentTask(taskId) {
            this.pauseAgentTaskCalls.push(taskId);
        },
        cancelAgentTask(taskId) {
            this.cancelAgentTaskCalls.push(taskId);
        },
        async retryAgentTaskItem(taskId, itemId) {
            this.retryAgentTaskItemCalls.push({taskId, itemId});
        },
        async applyAgentPatch(taskId, itemId, operationId = "") {
            this.applyAgentPatchCalls.push({taskId, itemId, operationId});
        },
        rejectAgentPatch(taskId, itemId, operationId = "") {
            this.rejectAgentPatchCalls.push({taskId, itemId, operationId});
        },
        async selectSession() {},
        removeComposerAttachment(id) {
            this.removeComposerAttachmentCalls.push(id);
        },
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
        async deleteSession(sessionId) {
            this.deleteSessionCalls.push(sessionId);
        },
        async setSessionPinned(sessionId, pinned) {
            this.setSessionPinnedCalls.push({sessionId, pinned});
        },
        async clearAllSessions() {},
        async saveTranscript() {},
        async saveAnalysis() {},
        async insertLastReply() {},
        async refreshAudits() {},
        async pinCurrentNoteAsTarget() {},
        async applyToolPolicyPreset() {},
        openComposerAttachmentPicker() {
            this.openComposerAttachmentPickerCalls.push(1);
        },
        copyMessage(id) {
            this.copyMessageCalls.push(id);
        },
        toggleMessageExpanded(id) {
            this.toggleMessageExpandedCalls.push(id);
        },
        setComposerDropActive(active) {
            this.setComposerDropActiveCalls.push(active);
        },
        addSource() {},
        clearSources() {},
        toggleSourceIncluded() {},
        toggleSourceChildIncluded() {},
        toggleSourceExpanded() {},
        toggleSourcesPanel() {},
        setSecurityMode() {},
        toggleSecurityDropdown() {},
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

    rt2.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "accept-tool-patch-op", "data-message-id": "msg-1", "data-tool-index": "0", "data-op-id": "op-1"}),
    ));
    assert.deepStrictEqual(rt2.applyToolPatchCalls, [{messageId: "msg-1", toolIndex: 0, operationId: "op-1"}]);

    rt2.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "reject-tool-patch-all", "data-message-id": "msg-1", "data-tool-index": "0"}),
    ));
    assert.deepStrictEqual(rt2.rejectToolPatchCalls, [{messageId: "msg-1", toolIndex: 0, operationId: ""}]);

    rt2.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "start-agent-from-draft"}),
    ));
    assert.deepStrictEqual(rt2.startAgentCalls, [1]);

    rt2.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "resume-agent-task", "data-task-id": "task-1"}),
    ));
    assert.deepStrictEqual(rt2.runAgentTaskCalls, ["task-1"]);

    rt2.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "retry-agent-item", "data-task-id": "task-1", "data-item-id": "item-1"}),
    ));
    assert.deepStrictEqual(rt2.retryAgentTaskItemCalls, [{taskId: "task-1", itemId: "item-1"}]);

    rt2.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "accept-agent-patch-op", "data-task-id": "task-1", "data-item-id": "item-1", "data-op-id": "op-1"}),
    ));
    assert.deepStrictEqual(rt2.applyAgentPatchCalls, [{taskId: "task-1", itemId: "item-1", operationId: "op-1"}]);

    rt2.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "reject-agent-patch-all", "data-task-id": "task-1", "data-item-id": "item-1"}),
    ));
    assert.deepStrictEqual(rt2.rejectAgentPatchCalls, [{taskId: "task-1", itemId: "item-1", operationId: ""}]);

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

    // --- 图片附件测试 ---

    const rt7 = createRuntime();
    bindAIDockEvents(rt7);

    await handleAIDockAction(rt7, "pick-attachments");
    assert.strictEqual(rt7.openComposerAttachmentPickerCalls.length, 1);

    rt7.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "remove-attachment", "data-attachment-id": "att-1"}),
    ));
    assert.deepStrictEqual(rt7.removeComposerAttachmentCalls, ["att-1"]);

    const fakeFileInput = new FakeInputElement({"data-role": "message-attachments"}, {
        files: [fakeImageFiles[0]],
    });
    fakeFileInput.value = "fake-path";
    rt7.element.dispatch("input", {target: fakeFileInput});
    assert.strictEqual(rt7.addComposerAttachmentsCalls.length, 1);
    assert.strictEqual(rt7.addComposerAttachmentsCalls[0].length, 1);
    assert.strictEqual(rt7.addComposerAttachmentsCalls[0][0].name, "test.png");
    assert.strictEqual(fakeFileInput.value, "");

    rt7.element.dispatch("paste", {
        target: new FakeTextAreaElement({"data-role": "message"}),
        clipboardData: {_hasImages: true, getData: () => ""},
        preventDefault() {},
    });
    assert.strictEqual(rt7.addComposerAttachmentsCalls.length, 2);

    const rt8 = createRuntime();
    bindAIDockEvents(rt8);

    rt8.element.dispatch("paste", {
        target: new FakeTextAreaElement({"data-role": "message"}),
        clipboardData: {_hasImages: false, getData: () => "some text"},
        preventDefault() {},
    });
    assert.strictEqual(rt8.addComposerAttachmentsCalls.length, 0);

    // --- 编辑重发测试 ---

    const rt9 = createRuntime();
    bindAIDockEvents(rt9);

    await handleAIDockAction(rt9, "edit-message", new FakeInputElement({"data-message-id": "msg-edit-1"}));
    assert.deepStrictEqual(rt9.startEditingMessageCalls, ["msg-edit-1"]);

    await handleAIDockAction(rt9, "cancel-edit-message");
    assert.deepStrictEqual(rt9.clearEditingMessageCalls, [true]);

    await handleAIDockAction(rt9, "copy-message", new FakeInputElement({"data-message-id": "msg-copy-1"}));
    assert.deepStrictEqual(rt9.copyMessageCalls, ["msg-copy-1"]);

    await handleAIDockAction(rt9, "toggle-message-expand", new FakeInputElement({"data-message-id": "msg-expand-1"}));
    assert.deepStrictEqual(rt9.toggleMessageExpandedCalls, ["msg-expand-1"]);

    const rt10 = createRuntime();
    bindAIDockEvents(rt10);
    rt10.editingMessageId = "msg-active-edit";

    await handleAIDockAction(rt10, "send-message");
    assert.strictEqual(rt10.sendMessageCalls.length, 1);

    const rt11 = createRuntime();
    bindAIDockEvents(rt11);

    rt11.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "delete-session-by-id", "data-session-target-id": "session-1"}),
    ));
    assert.deepStrictEqual(rt11.deleteSessionCalls, ["session-1"]);

    rt11.element.dispatch("click", createFakeClickEvent(
        new FakeInputElement({"data-action": "toggle-session-pin", "data-session-target-id": "session-1", "data-pinned": "false"}),
    ));
    assert.deepStrictEqual(rt11.setSessionPinnedCalls, [{sessionId: "session-1", pinned: true}]);

    await mentionModule.searchAndShowMentions("", 1, {
        active: true,
        query: "",
        selectedIndex: 0,
        results: [{id: "old"}],
        seq: 1,
        anchorRect: null,
    }, "default", () => {});
    assert.deepStrictEqual(mentionSearchCalls, []);

    await mentionModule.searchAndShowMentions("note", 2, {
        active: true,
        query: "note",
        selectedIndex: 0,
        results: [],
        seq: 2,
        anchorRect: null,
    }, "default", () => {});
    assert.deepStrictEqual(mentionSearchCalls, ["note"]);

    console.log("[ai-dock-runtime-behavior] ok");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
