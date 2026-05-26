const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

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
        ...globals,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const appRoot = path.join(__dirname, "..");
const assistantRoot = path.join(appRoot, "src", "assistant");

const constantsModule = compileModule(path.join(assistantRoot, "constants.ts"), {
    "../constants": {
        Constants: {
            SOURCEFLOW_APPID: "sourceflow-test",
        },
    },
}, {
    window: {
        sourceflow: {
            config: {
                lang: "zh-CN",
            },
        },
    },
    navigator: {
        language: "zh-CN",
    },
});

const {
    buildAssistantMarkdownExcerpt,
    buildAssistantNoteContextForSkill,
} = constantsModule;

const longMarkdown = [
    "# 开头",
    "这是一段开头内容。",
    "中段内容 ".repeat(900),
    "## 末尾",
    "尾段唯一TOKEN",
].join("\n");

const noteContext = {
    title: "测试笔记",
    path: "/测试笔记",
    markdown: longMarkdown,
    currentBlockID: "20260525-current",
    currentBlockMarkdown: "当前块内容",
    selectedText: "选中文本",
    outlineMarkdown: "- H1 开头\n  - H2 末尾",
    styleSummary: "写作风格：中文为主，平均段落约 60 字符。",
    surroundingBlocks: [
        {id: "prev", type: "p", markdown: "前文块", position: "previous"},
        {id: "20260525-current", type: "p", markdown: "当前块内容", position: "current"},
        {id: "next", type: "p", markdown: "后文块", position: "next"},
    ],
};

const selectionPrompt = buildAssistantNoteContextForSkill(noteContext, "selection-rewrite");
assert(selectionPrompt.includes("选中文本"));
assert(selectionPrompt.includes("当前块内容"));
assert(!selectionPrompt.includes("尾段唯一TOKEN"));

const continuePrompt = buildAssistantNoteContextForSkill(noteContext, "note-continue-writing");
assert(continuePrompt.includes("当前光标附近内容"));
assert(continuePrompt.includes("前文块"));
assert(continuePrompt.includes("后文块"));
assert(!continuePrompt.includes("尾段唯一TOKEN"));

const summaryPrompt = buildAssistantNoteContextForSkill(noteContext, "note-summarize");
assert(summaryPrompt.includes("当前文档摘要窗口"));
assert(summaryPrompt.includes("尾段唯一TOKEN"));

const excerpt = buildAssistantMarkdownExcerpt(`${"a".repeat(5000)}TAIL`, 100, 20, 4);
assert(excerpt.includes("..."));
assert(excerpt.endsWith("TAIL"));

const registryModule = compileModule(path.join(assistantRoot, "skills", "registry.ts"), {
    "../constants": {
        assistantText: (zh) => zh,
    },
});

const continueMessage = registryModule.getAssistantSkillDefinition("note-continue-writing").buildMessage({
    note: noteContext,
    protyle: undefined,
    range: null,
    hasSelection: false,
    selectedText: "",
}, {});
assert(continueMessage.includes("1-2 个自然段"));
assert(continueMessage.includes("不要写完整篇文章"));

const selectionMessage = registryModule.getAssistantSkillDefinition("selection-summarize").buildMessage({
    note: noteContext,
    protyle: undefined,
    range: null,
    hasSelection: true,
    selectedText: "很多很多内容",
}, {});
assert(selectionMessage.includes("1-3 句话"));

console.log("[assistant-skill-context] ok");
