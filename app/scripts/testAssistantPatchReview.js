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

console.log("[assistant-patch-review] ok");
