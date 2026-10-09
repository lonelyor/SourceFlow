const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

// R8 期二：自动化规则系统——技能动作（runSkill）+ 规则导入导出
// （plans/20260915-自动化规则系统设计.md §6 期二）
// 1. 技能动作：动作下拉新增「运行技能」+ 技能选择下拉（note 级、产出可审阅的技能，显示技能 label）；
//    「运行…」执行流：后端批量动作先跑（payload 剔除 runSkill），技能动作逐篇在前端执行，
//    每篇产出直接弹既有 patch review，篇与篇之间逐篇确认。
// 2. 事件触发边界：savedoc 自动运行不执行 runSkill（静默自动化不弹审阅窗），命中时 toast 提示手动运行。
// 3. 规则导入导出：{version:1, exportedAt, rules:[...]} JSON 下载/导入；导入校验 version 与规则形状，
//    追加（重名自动加后缀）/ 替换（二次确认）；校验失败给行内可读错误。
// 4. 向后兼容：期一动作（setAttrs/moveToPath/appendContent/toInbox）与旧属性键行为不回归。

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");

const readSource = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

// --- 共享桩（fetch / 消息 / Dialog / 技能执行器）-------------------------------------------------
const fetchCalls = [];
let fetchResponder = (url) => {
    if (url === "/api/workbench/getWorkbenchItems") {
        return {code: 0, msg: "", data: {items: workbenchItemFixtures}};
    }
    if (url === "/api/assistant/rules/validate") {
        return {code: 0, msg: "", data: {items: [{id: "doc-1", title: "每周会议记录", summary: "设置属性: tags=meetings"}]}};
    }
    if (url === "/api/assistant/rules/run") {
        return {code: 0, msg: "", data: {taskId: "task-1", itemCount: 1, actionsSummary: "setAttrs"}};
    }
    return {code: -1, msg: `unexpected url ${url}`, data: {}};
};

const workbenchItemFixtures = [{
    id: "20240101120000-abcdefg",
    box: "20230101111111-notebook",
    notebook: "研究",
    path: "/研究/会议/周会记录",
    hPath: "/研究/会议/周会记录",
    title: "每周会议记录",
    preview: "",
    type: "doc",
    entityKind: "doc",
    status: "",
    project: "",
    dueDate: "",
    eventTime: "",
    location: "",
    sourceURL: "",
    capturedAt: "",
    goal: "",
    nextStep: "",
    tags: ["会议"],
    inbox: false,
    created: "20240101120000",
    updated: "20240101120000",
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
    dueAt: 0,
    eventAt: 0,
    capturedTs: 1704067200000,
    refCount: 0,
    assetCount: 0,
    subFileCount: 0,
    hasBoundView: false,
}];

const showMessageCalls = [];
const skillRunCalls = [];

class DialogStub {
    constructor(options) {
        DialogStub.instances.push(this);
        this.options = options;
        this.destroyed = false;
        this.listeners = {};
        this.element = {
            addEventListener: (type, handler) => {
                this.listeners[type] = this.listeners[type] || [];
                this.listeners[type].push(handler);
            },
            querySelector: () => null,
        };
    }

    dispatchClick(dataAction) {
        (this.listeners.click || []).forEach((handler) => handler({
            target: {closest: (selector) => selector === "[data-action]" ? {getAttribute: () => dataAction} : null},
        }));
    }

    destroy() {
        this.destroyed = true;
        if (typeof this.options?.destroyCallback === "function") {
            this.options.destroyCallback();
        }
    }
}
DialogStub.instances = [];

const constantsStub = {Constants: {SOURCEFLOW_APPID: "sourceflow", LOCAL_WORKBENCH: "test-local-workbench"}};
const stubs = new Map([
    [path.join(srcRoot, "constants.ts"), constantsStub],
    [path.join(srcRoot, "util", "fetch.ts"), {
        fetchSyncPost: async (url, payload) => {
            fetchCalls.push({url, payload});
            return fetchResponder(url);
        },
        fetchPost: (url, _data, cb) => cb(fetchResponder(url)),
    }],
    [path.join(srcRoot, "dialog", "index.ts"), {Dialog: DialogStub}],
    [path.join(srcRoot, "dialog", "message.ts"), {
        showMessage: (message, timeout, type) => showMessageCalls.push({message, timeout, type}),
        hideMessage: () => undefined,
    }],
    [path.join(srcRoot, "dialog", "confirmDialog.ts"), {
        confirmDialog: (title, text, confirm) => {
            showMessageCalls.push({message: `confirmDialog:${title}:${text}`});
            if (confirm) {
                confirm();
            }
        },
    }],
    [path.join(srcRoot, "protyle", "util", "compatibility.ts"), {
        writeText: () => undefined,
        setStorageVal: () => undefined,
    }],
    [path.join(srcRoot, "index.ts"), {}],
    [path.join(srcRoot, "assistant", "runtime.ts"), {
        runAssistantFeature: () => undefined,
        reportAssistantRuntimeError: () => undefined,
    }],
    [path.join(srcRoot, "assistant", "constants.ts"), {
        assistantText: (zh) => zh,
    }],
    [path.join(srcRoot, "assistant", "skills", "execute.ts"), {
        runAssistantSkill: async (options) => {
            skillRunCalls.push(options);
            return true;
        },
    }],
    [path.join(srcRoot, "workbench", "dialogBinding.ts"), {
        getCurrentRootID: () => workbenchItemFixtures[0].id,
        getActiveEditorProtyle: () => undefined,
    }],
    [path.join(srcRoot, "assistant", "security", "api.ts"), {
        getSecurityConfig: async () => ({defaultMode: "default"}),
    }],
]);

// --- vm 加载器（参照 testAssistantRules.js）------------------------------------------------------
const cache = new Map();

const loadModule = (relPath) => {
    const abs = path.join(srcRoot, relPath);
    if (stubs.has(abs)) {
        return stubs.get(abs);
    }
    if (cache.has(abs)) {
        return cache.get(abs);
    }
    const source = fs.readFileSync(abs, "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: relPath,
    });
    const moduleObj = {exports: {}};
    cache.set(abs, moduleObj.exports);
    const contextSandbox = createSandbox();
    contextSandbox.module = moduleObj;
    contextSandbox.exports = moduleObj.exports;
    const localRequire = (id) => {
        if (!id.startsWith(".")) {
            throw new Error(`unexpected bare require: ${id} in ${relPath}`);
        }
        const resolvedBase = path.normalize(path.join(path.dirname(abs), id));
        const candidates = [resolvedBase, `${resolvedBase}.ts`, path.join(resolvedBase, "index.ts")];
        for (const candidate of candidates) {
            if (stubs.has(candidate)) {
                return stubs.get(candidate);
            }
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return loadModule(path.relative(srcRoot, candidate));
            }
        }
        throw new Error(`unresolved require: ${id} from ${relPath}`);
    };
    contextSandbox.require = localRequire;
    vm.runInNewContext(compiled.outputText, contextSandbox, {filename: relPath});
    return moduleObj.exports;
};

// --- 沙箱 ----------------------------------------------------------------------------------------
const localStorageStore = new Map();
const windowObj = {
    sourceflow: {config: {lang: "zh_CN"}, storage: {}, languages: {}},
    localStorage: {
        getItem: (key) => (localStorageStore.has(key) ? localStorageStore.get(key) : null),
        setItem: (key, value) => localStorageStore.set(key, String(value)),
        removeItem: (key) => localStorageStore.delete(key),
    },
    setTimeout: (fn) => {
        if (typeof fn === "function") {
            fn();
        }
        return 0;
    },
    clearTimeout: () => undefined,
};

// 每次 loadModule 都要用全新的包装对象做沙箱（同一对象重复 contextify 会复用上下文）；
// window 等底层对象共享，保证全局状态互通。
const createSandbox = () => ({
    module: null,
    exports: null,
    require: null,
    console,
    navigator: {language: "zh_CN"},
    window: windowObj,
    document: {addEventListener: () => undefined, querySelector: () => null, getElementById: () => null},
    setTimeout: windowObj.setTimeout,
    clearTimeout: windowObj.clearTimeout,
});

// vm 领域里的数组原型与主进程不同，deepStrictEqual 会误报；统一用 JSON 序列化比较。
const assertSameArray = (actual, expected, message) => {
    assert.strictEqual(JSON.stringify(actual || null), JSON.stringify(expected),
        `${message} (got: ${JSON.stringify(actual)})`);
};

const flushMicrotasks = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
    await new Promise((resolve) => setImmediate(resolve));
};

const waitFor = async (predicate) => {
    for (let i = 0; i < 200 && !predicate(); i++) {
        await flushMicrotasks();
    }
};

const pendingTests = [];
const test = (name, fn) => {
    pendingTests.push({name, fn});
};

// --- 被测模块 ------------------------------------------------------------------------------------
const dialogShared = loadModule(path.join("workbench", "dialogShared.ts"));
const dialogRules = loadModule(path.join("workbench", "dialogRules.ts"));
const rulesApi = loadModule(path.join("assistant", "rules", "api.ts"));
const rulesSkills = loadModule(path.join("assistant", "rules", "skills.ts"));
const rulesTriggers = loadModule(path.join("assistant", "rules", "triggers.ts"));
const rulesUI = loadModule(path.join("workbench", "dialogRulesUI.ts"));

// =================================================================================================
// 源码断言
// =================================================================================================

test("runSkill action renders in the dropdown with a skill picker fed by note-level skills", () => {
    const ui = readSource("workbench", "dialogRulesUI.ts");
    assert.ok(ui.includes("WORKBENCH_RULE_SKILL_ACTION_ID"),
        "action editor must know the runSkill action id");
    assert.ok(ui.includes('label: "运行技能"'),
        "dropdown must label the skill action in Chinese-first meta");
    assert.ok(ui.includes("workbench-rule-action-skill"),
        "runSkill rows must render a dedicated skill select instead of a text input");
    assert.ok(ui.includes("getAssistantRuleSkillOptions()"),
        "skill picker data source must come from the registry-backed options helper");
    assert.ok(ui.includes("getAssistantRuleSkillLabel("),
        "rule description must show the human-readable skill label");
    const skills = readSource("assistant", "rules", "skills.ts");
    assert.ok(skills.includes('listAssistantSkills("note")'),
        "skill options must come from listAssistantSkills with note placement");
    assert.ok(skills.includes('"chat"') && skills.includes('"capture-task"') && skills.includes('"capture-event"'),
        "non-patch chat/capture skills must be excluded from rule skill options");
});

test("runSkill never reaches the backend rules payload", () => {
    const shared = readSource("workbench", "dialogShared.ts");
    assert.ok(shared.includes('WORKBENCH_RULE_SKILL_ACTION_ID = "runSkill"'),
        "runSkill must be declared as its own semantic action id");
    assert.ok(shared.includes("isWorkbenchRuleSkillActionId"),
        "split must classify runSkill into the skill bucket");
    assert.ok(shared.includes("const skill = {} as Record<string, string>;"),
        "split must keep a dedicated skill bucket");
    const api = readSource("assistant", "rules", "api.ts");
    assert.ok(api.includes("(actionId as string) === WORKBENCH_RULE_SKILL_ACTION_ID"),
        "backend action builder must explicitly guard the skill action id");
    assert.ok(api.includes("hasAssistantRuleSkillAction") && api.includes("getAssistantRuleSkillActionId"),
        "run-flow helpers must detect skill actions");
    const rules = readSource("workbench", "dialogRules.ts");
    assert.ok(rules.includes("isWorkbenchRuleSkillActionId(key)"),
        "passive attr application must also skip the skill action id");
});

test("event trigger skips runSkill rules and tells the user to run manually", () => {
    const triggers = readSource("assistant", "rules", "triggers.ts");
    assert.ok(triggers.includes("hasAssistantRuleSkillAction(rule)"),
        "event trigger must detect skill rules before running");
    assert.ok(triggers.includes("请手动运行"),
        "event trigger must toast a readable manual-run hint");
    assert.ok(triggers.includes("buildAssistantTriggerDedupeKey(rootID, rule.name, version)"),
        "the manual-run toast must be deduped per doc+rule+version");
});

test("rules export downloads a versioned JSON payload and import validates before merging", () => {
    const ui = readSource("workbench", "dialogRulesUI.ts");
    assert.ok(ui.includes('data-action="workbench-rules-export"') && ui.includes('data-action="workbench-rules-import"'),
        "rules card must expose export/import buttons");
    assert.ok(ui.includes("version: 1") && ui.includes("exportedAt"),
        "export payload must carry the version marker and export time");
    assert.ok(ui.includes("sourceflow-rules-"),
        "export file name must follow sourceflow-rules-<date>.json");
    assert.ok(ui.includes("new Blob([content], {type: \"application/json\"})"),
        "export must download via a JSON Blob");
    assert.ok(ui.includes('accept = ".json,application/json"'),
        "import must pick JSON files");
    assert.ok(ui.includes("parseAssistantRulesImportPayload"),
        "import must validate the payload shape");
    assert.ok(ui.includes("mergeAssistantRulesImport"),
        "import must merge through a dedicated helper");
    assert.ok(ui.includes("追加") && ui.includes("替换"),
        "import confirm must offer append/replace choices");
    assert.ok(ui.includes("confirmDialog("),
        "replace must double-confirm via confirmDialog");
});

test("assistant rules phase-2 test is registered in package.json and typecheck.js", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
    assert.strictEqual(pkg.scripts["test:assistant-rules-phase2"], "node ./scripts/testAssistantRulesPhase2.js",
        "package.json must register test:assistant-rules-phase2");
    const typecheck = fs.readFileSync(path.join(appRoot, "scripts", "typecheck.js"), "utf8");
    assert.ok(typecheck.includes("testAssistantRulesPhase2.js") && typecheck.includes("assistant rules phase 2"),
        "typecheck.js must run the assistant rules phase-2 test");
});

test("phase-one actions keep their authoritative declaration and dropdown entries", () => {
    const shared = readSource("workbench", "dialogShared.ts");
    assert.ok(shared.includes('WORKBENCH_RULE_ACTION_IDS: TWorkbenchRuleActionId[] = ["setAttrs", "moveToPath", "appendContent", "toInbox"]'),
        "phase-one action id list must stay untouched in dialogShared");
    const row = rulesUI.renderWorkbenchRuleActionRow();
    for (const actionId of ["setAttrs", "moveToPath", "appendContent", "toInbox"]) {
        assert.ok(row.includes(`value="${actionId}"`), `dropdown must still offer ${actionId}`);
    }
});

// =================================================================================================
// vm 行为断言
// =================================================================================================

// --- 1. 动作分类：runSkill 进 skill 桶，绝不落属性；旧属性键继续工作 -------------------------------
test("splitWorkbenchRuleActions classifies runSkill separately and keeps legacy attrs", () => {
    const split = dialogShared.splitWorkbenchRuleActions({
        "tags": "meetings",
        "custom-workbench-status": "todo",
        "runSkill": "note-summarize",
        "setAttrs": "tags=meetings",
    });
    assertSameArray(Object.keys(split.skill), ["runSkill"], "runSkill must land in the skill bucket");
    assertSameArray(Object.keys(split.attrs).sort(), ["custom-workbench-status", "tags"], "legacy keys must stay attrs");
    assertSameArray(Object.keys(split.semantic), ["setAttrs"], "backend semantic ids stay in the semantic bucket");

    // 被动属性应用：runSkill 绝不能作为属性写入。
    const state = {
        rules: dialogShared.normalizeWorkbenchRules([{
            name: "技能规则",
            actions: {"runSkill": "note-summarize", "tags": "ai"},
        }]),
    };
    windowObj.sourceflow.storage[constantsStub.Constants.LOCAL_WORKBENCH] = state;
    const attrs = dialogRules.applyWorkbenchRulesToAttrs({type: "doc", tags: []}, {});
    assert.strictEqual(attrs.runSkill, undefined, "runSkill must never leak into passive attrs");
    assert.strictEqual(attrs.tags, "ai", "legacy attr keys must still apply passively");
    delete windowObj.sourceflow.storage[constantsStub.Constants.LOCAL_WORKBENCH];
});

// --- 2. 动作行渲染：runSkill 下拉 + 技能选择（label 可读） -----------------------------------------
test("action row renders runSkill with a skill select showing skill labels", () => {
    const row = rulesUI.renderWorkbenchRuleActionRow("runSkill", "note-summarize");
    assert.ok(row.includes('value="runSkill"'), "dropdown must offer runSkill");
    assert.ok(row.includes("运行技能"), "runSkill option must be labeled 运行技能");
    assert.ok(row.includes("workbench-rule-action-skill"), "runSkill must render the skill select");
    assert.ok(row.includes('value="note-summarize" selected'), "stored skill id must stay selected");
    assert.ok(row.includes("总结当前笔记"), "skill option must show the human-readable label");
    const defaultRow = rulesUI.renderWorkbenchRuleActionRow();
    assert.ok(defaultRow.includes('value="setAttrs" selected'), "new rows still default to setAttrs");
    assert.ok(defaultRow.includes("workbench-rule-action-params"), "text actions keep the params input");
    const unknownRow = rulesUI.renderWorkbenchRuleActionRow("runSkill", "imported-unknown-skill");
    assert.ok(unknownRow.includes('value="imported-unknown-skill" selected'),
        "unknown imported skill ids must stay visible instead of vanishing");
});

// --- 3. 编辑器收集：runSkill 参数取自技能下拉，旧属性键保留 ----------------------------------------
test("editor collect gathers runSkill from the skill select and preserves legacy attrs", () => {
    const makeElement = (values, rows) => ({
        querySelector: (selector) => values[selector] === undefined ? null : values[selector],
        querySelectorAll: (selector) => selector === ".workbench-rule-action-row" ? rows : [],
    });
    const input = (value) => ({value});
    const select = (value) => ({value});
    const checkbox = (checked) => ({checked});
    const element = makeElement({
        "#workbenchRuleName": input("技能规则"),
        "#workbenchRuleEnabled": checkbox(true),
        "#workbenchRuleMatchKind": select("*"),
        "#workbenchRuleMatchType": select("*"),
        "#workbenchRuleInbox": select(""),
        "#workbenchRuleTitle": input(""),
        "#workbenchRuleNotebook": input(""),
        "#workbenchRuleProject": input(""),
        "#workbenchRuleTag": input(""),
        "#workbenchRuleEventTrigger": checkbox(false),
    }, [
        {querySelector: (s) => s === ".workbench-rule-action-id" ? select("runSkill") : s === ".workbench-rule-action-skill" ? select("note-summarize") : input("")},
        {querySelector: (s) => s === ".workbench-rule-action-id" ? select("setAttrs") : s === ".workbench-rule-action-skill" ? null : input("tags=meetings")},
    ]);
    const collected = rulesUI.collectWorkbenchRuleEditorRule(element, {
        name: "旧规则",
        actions: {"tags": "legacy-tag"},
    });
    assert.strictEqual(collected.rule.actions.runSkill, "note-summarize", "runSkill params must come from the skill select");
    assert.strictEqual(collected.rule.actions.setAttrs, "tags=meetings");
    assert.strictEqual(collected.rule.actions.tags, "legacy-tag", "legacy attr keys must be preserved");
});

// --- 4. 后端 payload：runSkill 被剔除，后端动作照旧编译 --------------------------------------------
test("backend payload excludes runSkill while backend actions compile as before", async () => {
    const rule = dialogShared.normalizeWorkbenchRules([{
        name: "混合规则",
        titleIncludes: "会议",
        actions: {"setAttrs": "tags=meetings", "runSkill": "note-summarize"},
    }])[0];
    assert.ok(rulesApi.hasAssistantRuleSkillAction(rule), "mixed rule must be detected as containing a skill action");
    assert.strictEqual(rulesApi.getAssistantRuleSkillActionId(rule), "note-summarize");

    const backend = rulesApi.buildAssistantRuleBackendActions(rule);
    assertSameArray(Object.keys(backend), ["set-attrs"], "only backend actions may compile");
    assert.strictEqual(backend["set-attrs"].attrs.tags, "meetings");

    fetchCalls.length = 0;
    const mode = await rulesApi.resolveAssistantRuleRunMode();
    await rulesApi.validateAssistantRule(rule, ["doc-1"], mode);
    const validateCall = fetchCalls.find((call) => call.url === "/api/assistant/rules/validate");
    assert.ok(validateCall, "validate must hit the contract endpoint");
    assert.ok(!("runSkill" in validateCall.payload.rule.actions),
        "runSkill must be stripped from the validate payload");
    assert.ok("set-attrs" in validateCall.payload.rule.actions,
        "backend actions must survive payload building");

    const backendOnly = dialogShared.normalizeWorkbenchRules([{name: "纯后端", actions: {"toInbox": "true"}}])[0];
    assert.strictEqual(rulesApi.hasAssistantRuleSkillAction(backendOnly), false,
        "phase-one rules must not be flagged as skill rules");
});

// --- 5. 规则描述：runSkill 显示技能 label ----------------------------------------------------------
test("rule description renders the skill label for runSkill actions", () => {
    const rule = dialogShared.normalizeWorkbenchRules([{name: "r", actions: {"runSkill": "note-summarize", "tags": "x"}}])[0];
    const description = rulesUI.describeWorkbenchRuleActions(rule);
    assert.ok(description.includes("运行技能: 总结当前笔记"),
        `description must show the skill label (got: ${description})`);
    assert.ok(description.includes("属性设置 ×1"), "legacy attr actions still summarized");
});

// --- 6. 技能下拉数据源：note 级 + 产出可审阅，label 展示 -------------------------------------------
test("skill options come from note placement and exclude non-patch skills", () => {
    const options = rulesSkills.getAssistantRuleSkillOptions();
    const summarize = options.find((option) => option.id === "note-summarize");
    assert.ok(summarize && summarize.label === "总结当前笔记", "note skills must appear with their label");
    assert.ok(options.some((option) => option.id === "note-polish"), "patch-producing note skills stay available");
    assert.ok(!options.some((option) => option.id === "ask-ai"), "chat fallback skill must be excluded");
    assert.ok(!options.some((option) => option.id === "note-batch-instruct"), "chat skills must be excluded");
    assert.ok(!options.some((option) => option.id === "note-task"), "capture skills must be excluded");
    assert.strictEqual(rulesSkills.getAssistantRuleSkillLabel("note-summarize"), "总结当前笔记");
    assert.strictEqual(rulesSkills.getAssistantRuleSkillLabel("not-a-skill"), "not-a-skill",
        "unknown ids fall back to the raw id");
});

// --- 7. 事件触发：含 runSkill 的规则不自动运行，toast 提示手动运行（同版本去重） --------------------
test("event trigger skips skill rules with a deduped manual-run toast", async () => {
    const skillRule = dialogShared.normalizeWorkbenchRules([{
        name: "会议技能规则",
        enabled: true,
        titleIncludes: "会议",
        eventTrigger: true,
        actions: {"runSkill": "note-summarize"},
    }])[0];
    const mixedRule = dialogShared.normalizeWorkbenchRules([{
        name: "混合触发规则",
        enabled: true,
        titleIncludes: "会议",
        eventTrigger: true,
        actions: {"setAttrs": "tags=meetings", "runSkill": "note-summarize"},
    }])[0];
    localStorageStore.set("sourceflow.assistant.rules.eventTrigger", "on");
    fetchCalls.length = 0;
    showMessageCalls.length = 0;

    const results = await rulesTriggers.runAssistantRulesForDoc(workbenchItemFixtures[0].id, "tx-1", [skillRule, mixedRule], "default");
    assertSameArray(results, [], "event trigger must not run skill rules");
    assert.strictEqual(fetchCalls.filter((call) => call.url === "/api/assistant/rules/run").length, 0,
        "no backend batch run may happen for skill rules");
    const manualHints = showMessageCalls.filter((call) => `${call.message}`.includes("请手动运行"));
    assert.strictEqual(manualHints.length, 2, "each matching skill rule must toast once");

    // 同文档同版本：不重复 toast。
    await rulesTriggers.runAssistantRulesForDoc(workbenchItemFixtures[0].id, "tx-1", [skillRule], "default");
    assert.strictEqual(showMessageCalls.filter((call) => `${call.message}`.includes("请手动运行")).length, 2,
        "same doc+rule+version must not re-toast");

    // 新版本可再次提示。
    await rulesTriggers.runAssistantRulesForDoc(workbenchItemFixtures[0].id, "tx-2", [skillRule], "default");
    assert.strictEqual(showMessageCalls.filter((call) => `${call.message}`.includes("请手动运行")).length, 3,
        "a new doc version may remind again");
    localStorageStore.clear();
});

// --- 8. 导出：版本标记 JSON + 日期文件名 -----------------------------------------------------------
test("export payload carries version marker and the file name uses the date", () => {
    const rules = dialogShared.normalizeWorkbenchRules([
        {name: "会议打标签", actions: {"setAttrs": "tags=meetings"}},
        {name: "总结", actions: {"runSkill": "note-summarize"}},
    ]);
    const payload = JSON.parse(rulesUI.buildAssistantRulesExportPayload(rules, "2026-09-16T08:00:00.000Z"));
    assert.strictEqual(payload.version, 1, "export payload must be marked version 1");
    assert.strictEqual(payload.exportedAt, "2026-09-16T08:00:00.000Z");
    assert.strictEqual(payload.rules.length, 2, "export carries the full rule array");
    assert.strictEqual(payload.rules[1].actions.runSkill, "note-summarize", "skill actions survive export");
    assert.strictEqual(rulesUI.getAssistantRulesExportFileName(new Date("2026-09-16T10:00:00.000Z")),
        "sourceflow-rules-2026-09-16.json", "file name must be sourceflow-rules-<date>.json");
    const empty = JSON.parse(rulesUI.buildAssistantRulesExportPayload([], "2026-09-16T08:00:00.000Z"));
    assertSameArray(empty.rules, [], "empty rule set exports an empty array");
});

// --- 9. 导入校验：坏 JSON / 缺 version / 形状错都给行内可读错误 -------------------------------------
test("import parser rejects bad payloads with readable inline errors", () => {
    const badJSON = rulesUI.parseAssistantRulesImportPayload("{not-json");
    assert.ok(badJSON.error && badJSON.error.includes("JSON"), "broken JSON must produce a readable error");
    const noVersion = rulesUI.parseAssistantRulesImportPayload('{"rules": []}');
    assert.ok(noVersion.error && noVersion.error.includes("version"), "missing version marker must be rejected");
    const noRules = rulesUI.parseAssistantRulesImportPayload('{"version": 1}');
    assert.ok(noRules.error && noRules.error.includes("rules"), "missing rules array must be rejected");
    const emptyRules = rulesUI.parseAssistantRulesImportPayload('{"version": 1, "rules": []}');
    assert.ok(emptyRules.error, "empty rules array must be rejected");
    const noName = rulesUI.parseAssistantRulesImportPayload('{"version": 1, "rules": [{"actions": {}}]}');
    assert.ok(noName.error && noName.error.includes("名称"), "rules without a name must be rejected");
    const badActions = rulesUI.parseAssistantRulesImportPayload('{"version": 1, "rules": [{"name": "A", "actions": ["x"]}, {"name": "B", "actions": {}}]}');
    assert.ok(badActions.error && badActions.error.includes("A"), "non-object actions must be rejected");
    const ok = rulesUI.parseAssistantRulesImportPayload('{"version": 1, "exportedAt": "2026-09-16", "rules": [{"name": "A", "actions": {"runSkill": "note-summarize"}}]}');
    assert.ok(!ok.error && ok.rules.length === 1 && ok.rules[0].actions.runSkill === "note-summarize",
        "valid payloads pass through with skill actions intact");
});

// --- 10. 导入合并：追加重名自动加后缀；替换覆盖 -----------------------------------------------------
test("import merge appends with dedupe suffixes and replaces on request", () => {
    const existing = dialogShared.normalizeWorkbenchRules([
        {name: "会议打标签", actions: {"setAttrs": "tags=meetings"}},
        {name: "会议打标签 (2)", actions: {"toInbox": "true"}},
    ]);
    const incoming = dialogShared.normalizeWorkbenchRules([
        {name: "会议打标签", actions: {"runSkill": "note-summarize"}},
        {name: "会议打标签 (2)", actions: {"appendContent": "摘要"}},
        {name: "全新规则", actions: {"moveToPath": "{{notebook}}/归档"}},
    ]);
    const appended = rulesUI.mergeAssistantRulesImport(existing, incoming, "append");
    assert.strictEqual(appended.added, 3, "all importable rules count as added");
    assertSameArray(appended.renamed.map((item) => item.to), ["会议打标签 (3)", "会议打标签 (4)"],
        "duplicate names must get incrementing suffixes");
    assertSameArray(appended.rules.map((rule) => rule.name),
        ["会议打标签", "会议打标签 (2)", "会议打标签 (3)", "会议打标签 (4)", "全新规则"],
        "existing rules stay first, imported rules follow with renamed duplicates");
    const replaced = rulesUI.mergeAssistantRulesImport(existing, incoming.slice(0, 1), "replace");
    assertSameArray(replaced.rules.map((rule) => rule.name), ["会议打标签"],
        "replace overwrites the whole rule list");
    assert.strictEqual(replaced.rules[0].actions.runSkill, "note-summarize",
        "replace keeps the incoming rule content");
});

// --- 11. 逐篇执行器：顺序运行 + 逐篇确认（继续/停止/直接关闭） --------------------------------------
test("skill runner executes per target with a per-note continue prompt", async () => {
    DialogStub.instances.length = 0;
    skillRunCalls.length = 0;
    const runner = rulesSkills.runAssistantRuleSkillForTargets({skillId: "note-summarize", targets: ["doc-1", "doc-2"]});
    await waitFor(() => skillRunCalls.length >= 1);
    assert.strictEqual(skillRunCalls[0].protyle.block.rootID, "doc-1",
        "each run must use the target doc as the skill context");
    await waitFor(() => DialogStub.instances.length >= 1);
    const prompt = DialogStub.instances[DialogStub.instances.length - 1];
    assert.ok(`${prompt.options.content}`.includes("继续"), "the prompt must ask whether to continue");
    prompt.dispatchClick("assistant-rule-skill-next");
    const outcome = await runner;
    assert.strictEqual(outcome.total, 2);
    assert.strictEqual(outcome.ran, 2, "both targets must run");
    assert.strictEqual(outcome.stopped, false);
    assert.strictEqual(skillRunCalls[1].protyle.block.rootID, "doc-2");
});

test("skill runner stops cleanly when the user declines the next note", async () => {
    DialogStub.instances.length = 0;
    skillRunCalls.length = 0;
    const runner = rulesSkills.runAssistantRuleSkillForTargets({skillId: "note-summarize", targets: ["doc-1", "doc-2", "doc-3"]});
    await waitFor(() => DialogStub.instances.length >= 1);
    DialogStub.instances[DialogStub.instances.length - 1].dispatchClick("assistant-rule-skill-stop");
    const outcome = await runner;
    assert.strictEqual(outcome.stopped, true, "declining must stop the batch");
    assert.strictEqual(outcome.ran, 1, "only the notes run so far count");
    assert.strictEqual(skillRunCalls.length, 1, "remaining targets must not run");

    // 直接关闭弹窗（无按钮路径）也按停止处理，不悬挂执行流。
    DialogStub.instances.length = 0;
    skillRunCalls.length = 0;
    const closedRunner = rulesSkills.runAssistantRuleSkillForTargets({skillId: "note-summarize", targets: ["doc-1", "doc-2"]});
    await waitFor(() => DialogStub.instances.length >= 1);
    DialogStub.instances[DialogStub.instances.length - 1].destroy();
    const closedOutcome = await closedRunner;
    assert.strictEqual(closedOutcome.stopped, true, "closing the prompt must resolve as stop");
});

test("skill runner reports unknown skills without executing anything", async () => {
    DialogStub.instances.length = 0;
    skillRunCalls.length = 0;
    showMessageCalls.length = 0;
    const outcome = await rulesSkills.runAssistantRuleSkillForTargets({skillId: "no-such-skill", targets: ["doc-1", "doc-2"]});
    assert.strictEqual(outcome.ran, 0, "unknown skills must not run");
    assert.strictEqual(skillRunCalls.length, 0, "no skill execution may happen");
    assert.ok(showMessageCalls.some((call) => `${call.message}`.includes("no-such-skill")),
        "unknown skills must surface a readable error");
    assert.strictEqual(DialogStub.instances.length, 0, "no per-note prompt may appear");
});

(async () => {
    for (const {name, fn} of pendingTests) {
        try {
            await fn();
            console.log(`[assistant-rules-phase2] ok - ${name}`);
        } catch (error) {
            console.error(`[assistant-rules-phase2] failed - ${name}`);
            console.error(error);
            process.exitCode = 1;
        }
    }
})();
