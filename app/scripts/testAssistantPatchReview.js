const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const compileModule = (entryPath, requireMap = {}) => {
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
            return compileModule(withExt, requireMap);
        }
        return require(request);
    };
    vm.runInNewContext(compiled.outputText, {
        module: moduleObj,
        exports: moduleObj.exports,
        require: localRequire,
        console,
        Date,
        Math,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const appRoot = path.join(__dirname, "..");
const patchRoot = path.join(appRoot, "src", "assistant", "patch");
const requireMap = {
    "../constants": {
        assistantText: (zh, en) => zh || en,
    },
    "../common/dom": {
        escapeHTML: (value) => `${value || ""}`
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;"),
        truncateText: (value, limit) => `${value || ""}`.slice(0, limit),
    },
};

const buildModule = compileModule(path.join(patchRoot, "build.ts"), requireMap);
const formatModule = compileModule(path.join(patchRoot, "format.ts"), requireMap);

const baseContext = {
    note: {
        rootID: "root-1",
        title: "测试笔记",
        path: "/测试笔记",
        currentBlockID: "block-1",
        currentBlockMarkdown: "原文第一句。原文第二句。",
        selectedText: "原文第二句。",
    },
    selectedText: "原文第二句。",
    hasSelection: true,
};

const replaceDefinition = {
    id: "selection-rewrite",
    shortLabel: "改写",
    description: "保留原意，让表达更顺。",
    action: "replace-selection",
};
const replacePatch = buildModule.buildAssistantPatchFromSkillResult(replaceDefinition, baseContext, "改写后的第二句。");
assert(replacePatch, "replace selection should create a patch");
assert.strictEqual(replacePatch.target, "selection");
assert.strictEqual(replacePatch.risk, "L3");
assert.strictEqual(replacePatch.operations[0].type, "replace-selection");
assert.strictEqual(replacePatch.operations[0].before, "原文第二句。");
assert.strictEqual(replacePatch.operations[0].after, "改写后的第二句。");

const insertDefinition = {
    id: "note-continue-writing",
    shortLabel: "续写",
    description: "延续当前笔记的上下文继续写下去。",
    action: "insert-below",
};
const insertPatch = buildModule.buildAssistantPatchFromSkillResult(insertDefinition, baseContext, "新的续写段落。");
assert(insertPatch, "insert below should create a patch");
assert.strictEqual(insertPatch.target, "block");
assert.strictEqual(insertPatch.risk, "L2");
assert.strictEqual(insertPatch.operations[0].type, "insert-after-block");
assert.strictEqual(insertPatch.operations[0].targetId, "block-1");

const patchMarkdown = formatModule.formatAssistantPatchMarkdown(insertPatch);
assert(patchMarkdown.includes("新的续写段落。"));
assert(patchMarkdown.includes("L2"));

const patchHTML = formatModule.renderAssistantPatchHTML(replacePatch);
assert(patchHTML.includes("assistant-patch__operation"));
assert(patchHTML.includes("替换选区"));
const toolPatchHTML = formatModule.renderAssistantPatchHTML(replacePatch, {
    acceptAction: "accept-tool-patch-op",
    rejectAction: "reject-tool-patch-op",
    extraActionAttrs: 'data-message-id="msg-1" data-tool-index="0"',
});
assert(toolPatchHTML.includes("accept-tool-patch-op"));
assert(toolPatchHTML.includes('data-message-id="msg-1"'));

const healthPatch = buildModule.buildAssistantPatchFromSkillResult({
    id: "note-health",
    shortLabel: "体检",
    description: "检查当前笔记异常",
    action: "insert-below",
}, baseContext, JSON.stringify({
    summary: "发现结构问题",
    target: "note",
    operations: [{
        type: "append-note",
        targetId: "root-1",
        after: "## AI 体检建议\n- 补充来源。",
        reason: "缺少引用信息",
    }],
}));
assert(healthPatch, "structured health result should create a patch");
assert.strictEqual(healthPatch.summary, "发现结构问题");
assert.strictEqual(healthPatch.operations[0].type, "append-note");
assert.strictEqual(healthPatch.operations[0].after, "## AI 体检建议\n- 补充来源。");

const attrsPatch = buildModule.buildAssistantPatchFromSkillResult({
    id: "note-health",
    shortLabel: "体检",
    description: "检查当前笔记异常",
    action: "insert-below",
}, baseContext, JSON.stringify({
    summary: "补充属性",
    target: "block",
    operations: [{
        type: "set-attrs",
        targetId: "block-1",
        attrs: {"custom-ai-reviewed": "true"},
        reason: "标记已审阅",
    }],
}));
assert(attrsPatch, "set attrs result should create a patch");
assert.strictEqual(attrsPatch.operations[0].type, "set-attrs");
assert.strictEqual(attrsPatch.operations[0].attrs["custom-ai-reviewed"], "true");

const fetchCalls = [];
const applyModule = compileModule(path.join(patchRoot, "apply.ts"), {
    "../../dialog/message": {
        showMessage: (message) => fetchCalls.push({url: "message", payload: message}),
    },
    "../../util/fetch": {
        fetchSyncPost: async (url, payload) => {
            fetchCalls.push({url, payload});
            if (url === "/api/filetree/createDocWithMd") {
                return {code: 0, data: "doc-created"};
            }
            return {code: 0, data: [{doOperations: [{id: "block-created"}]}]};
        },
    },
    "../../util/highlightById": {
        highlightById: () => undefined,
    },
    "../constants": {
        assistantText: (zh, en) => zh || en,
    },
    "../common/note": {
        invalidateAssistantNoteContextCache: () => undefined,
    },
});

const applyContext = {
    note: {
        rootID: "root-1",
        notebook: "notebook-1",
        path: "/测试笔记",
        title: "测试笔记",
        markdown: "",
        currentBlockID: "block-1",
        currentBlockType: "p",
        currentBlockMarkdown: "重复。重复。",
        selectedText: "重复。",
    },
    hasSelection: true,
    selectedText: "重复。",
};

applyModule.applyAssistantPatchOperation(replacePatch, {
    id: "dup",
    type: "replace-selection",
    targetId: "block-1",
    before: "重复。",
    after: "改写。",
    status: "pending",
}, applyContext).then((ok) => {
    assert.strictEqual(ok, false, "duplicate selection should not be auto replaced");
    return applyModule.applyAssistantPatchOperation(attrsPatch, attrsPatch.operations[0], applyContext);
}).then((ok) => {
    assert.strictEqual(ok, true, "attrs patch should apply");
    return applyModule.applyAssistantPatchOperation({
        ...insertPatch,
        operations: [{
            id: "create-note-op",
            type: "create-note",
            targetLabel: "新笔记",
            after: "内容",
            status: "pending",
        }],
    }, {
        id: "create-note-op",
        type: "create-note",
        targetLabel: "新笔记",
        after: "内容",
        status: "pending",
    }, applyContext);
}).then((ok) => {
    assert.strictEqual(ok, true, "create-note patch should apply");
    assert(fetchCalls.some((item) => item.url === "/api/attr/setBlockAttrs"));
    assert(fetchCalls.some((item) => item.url === "/api/filetree/createDocWithMd" && item.payload.path === "/AI/新笔记"));
    console.log("[assistant-patch-review] ok");
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
