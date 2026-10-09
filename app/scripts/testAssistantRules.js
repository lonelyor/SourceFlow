const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

// R8 期一：自动化规则系统前端——规则编辑扩展（语义动作）+ 触发器接线 + 运行调用
// （plans/20260915-自动化规则系统设计.md §3 触发器、§4 动作、§5 执行）
// 1. 规则编辑：动作下拉（setAttrs / moveToPath / appendContent / toInbox）+ 参数输入（支持
//    {{title}}/{{notebook}}/{{path}} 占位符，输入旁小字说明）；旧属性键继续按属性设置工作（向后兼容）。
// 2. 运行入口：规则列表「运行…」→ 选范围（工作台选中项 / 当前笔记）→ validate dryRun 预览 →
//    确认 run → 提示已创建任务 N 项并提供打开 Agent 面板入口。
// 3. 笔记事件触发器：监听内核 savedoc 广播（kernel PushSaveDoc），去抖 2s + 去重键
//    （docId + 规则名 + 版本戳）；总开关（localStorage，默认关）+ 规则级「文档事件触发」（默认关）。
// 4. 循环防护：savedoc 载荷（sources 序列化文本）带 ruleRunId 标记的事件直接忽略（后端写上下文标记）。

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");

const readSource = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

// --- 共享桩（fetch / 消息 / 安全配置 / 重 IO 模块）---------------------------------------------
const fetchCalls = [];
let fetchResponder = (url) => {
    if (url === "/api/workbench/getWorkbenchItems") {
        return {code: 0, msg: "", data: {items: workbenchItemFixtures}};
    }
    if (url === "/api/assistant/rules/validate") {
        return {code: 0, msg: "", data: {items: [{id: "doc-1", title: "每周会议记录", summary: "设置属性: tags=meetings; 移动到路径: {{notebook}}/会议记录"}]}};
    }
    if (url === "/api/assistant/rules/run") {
        return {code: 0, msg: "", data: {taskId: "task-1", itemCount: 1, actionsSummary: "setAttrs; moveToPath"}};
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
let securityConfigFixture = {defaultMode: "autoReview"};

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
    [path.join(srcRoot, "dialog", "index.ts"), {Dialog: class DialogStub {}}],
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
    [path.join(srcRoot, "editor", "rename.ts"), {replaceFileName: (v) => v, validateName: () => undefined}],
    [path.join(srcRoot, "layout", "getAll.ts"), {getAllEditor: () => []}],
    [path.join(srcRoot, "protyle", "util", "hasClosest.ts"), {hasClosestByClassName: () => null}],
    [path.join(srcRoot, "assistant", "runtime.ts"), {
        runAssistantFeature: () => undefined,
        reportAssistantRuntimeError: () => undefined,
        scheduleAssistantIdleWork: (fn) => fn(),
        ensureAssistantFeatureAvailable: () => undefined,
    }],
    [path.join(srcRoot, "mobile", "editor.ts"), {openMobileFileById: () => undefined}],
    [path.join(srcRoot, "editor", "util.ts"), {openFileById: () => undefined}],
    [path.join(srcRoot, "workbench", "dialogBinding.ts"), {
        getCurrentRootID: () => currentRootIDFixture,
        getActiveEditorProtyle: () => undefined,
    }],
    [path.join(srcRoot, "assistant", "security", "api.ts"), {
        getSecurityConfig: async () => securityConfigFixture,
    }],
]);

let currentRootIDFixture = "20240101120000-abcdefg";

// --- vm 加载器（参照 testAssistantAssetVision.js）----------------------------------------------
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

// --- 沙箱：window / localStorage / 手动定时器（去抖用例确定性推进）------------------------------
const timerQueue = new Map();
let timerSeq = 0;
const makeTimerTools = () => ({
    setTimeout: (fn, ms) => {
        const id = ++timerSeq;
        timerQueue.set(id, {fn, at: now + (ms || 0)});
        return id;
    },
    clearTimeout: (id) => timerQueue.delete(id),
    setInterval: (fn, ms) => {
        const id = ++timerSeq;
        timerQueue.set(id, {fn, at: now + (ms || 0), interval: ms || 0});
        return id;
    },
    clearInterval: (id) => timerQueue.delete(id),
});
const timerTools = makeTimerTools();
let now = 1704067200000;
const flushMicrotasks = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
    await new Promise((resolve) => setImmediate(resolve));
};
const advance = (ms) => {
    const deadline = now + ms;
    while (true) {
        let nextId = null;
        let nextAt = Infinity;
        for (const [id, timer] of timerQueue) {
            if (timer.at <= deadline && timer.at < nextAt) {
                nextId = id;
                nextAt = timer.at;
            }
        }
        if (nextId == null) {
            break;
        }
        const timer = timerQueue.get(nextId);
        if (timer.interval != null) {
            timer.at += timer.interval;
        } else {
            timerQueue.delete(nextId);
        }
        now = Math.max(now, nextAt);
        timer.fn();
    }
    now = deadline;
};

const fakeSocket = {onmessage: null};
const localStorageStore = new Map();
const windowObj = {
    sourceflow: {config: {lang: "zh_CN"}, storage: {}, ws: {ws: fakeSocket}, languages: {}},
    localStorage: {
        getItem: (key) => (localStorageStore.has(key) ? localStorageStore.get(key) : null),
        setItem: (key, value) => localStorageStore.set(key, String(value)),
        removeItem: (key) => localStorageStore.delete(key),
    },
    setTimeout: timerTools.setTimeout,
    clearTimeout: timerTools.clearTimeout,
    setInterval: timerTools.setInterval,
    clearInterval: timerTools.clearInterval,
};

// 每次 loadModule 都要用全新的包装对象做沙箱（同一对象重复 contextify 会复用上下文，
// 顶层 const 声明跨模块冲突）；window 等底层对象共享，保证全局状态互通。
const createSandbox = () => ({
    module: null,
    exports: null,
    require: null,
    console,
    navigator: {language: "zh_CN"},
    window: windowObj,
    document: {addEventListener: () => undefined, querySelector: () => null, getElementById: () => null},
    setTimeout: timerTools.setTimeout,
    clearTimeout: timerTools.clearTimeout,
    setInterval: timerTools.setInterval,
    clearInterval: timerTools.clearInterval,
});

// 测试用例操作全局状态（workbench storage / localStorage）走这个主沙箱的 window。
const sandbox = createSandbox();

// vm 领域里的数组原型与主进程不同，deepStrictEqual 会误报；统一用 JSON 序列化比较。
const assertSameArray = (actual, expected, message) => {
    assert.strictEqual(JSON.stringify(actual || null), JSON.stringify(expected),
        `${message} (got: ${JSON.stringify(actual)})`);
};

const pendingTests = [];
const test = (name, fn) => {
    pendingTests.push({name, fn});
};

// --- 被测模块 ------------------------------------------------------------------------------------
const dialogShared = loadModule(path.join("workbench", "dialogShared.ts"));
const dialogRules = loadModule(path.join("workbench", "dialogRules.ts"));
const rulesApi = loadModule(path.join("assistant", "rules", "api.ts"));
const rulesTriggers = loadModule(path.join("assistant", "rules", "triggers.ts"));
const rulesUI = loadModule(path.join("workbench", "dialogRulesUI.ts"));

// =================================================================================================
// 源码断言
// =================================================================================================

test("workbench dialog renders the rules card and wires the run/edit/delete actions", () => {
    const screen = readSource("workbench", "dialogScreen.ts");
    assert.ok(screen.includes('renderWorkbenchRulesCard(state, {selectedCount: selectedVisible.length})'),
        "workbench dialog must render the rules card with the current selection count");
    const events = readSource("workbench", "dialogEvents.ts");
    assert.ok(events.includes('action?.startsWith("workbench-rule")') && events.includes("handleWorkbenchRulesClick"),
        "dialog click handler must delegate workbench-rule* actions to the rules UI module");
    const ui = readSource("workbench", "dialogRulesUI.ts");
    assert.ok(ui.includes('data-action="workbench-rule-run"') && ui.includes("运行…"),
        "each rule row must carry a Run… button");
    assert.ok(ui.includes('data-action="workbench-rule-edit"') && ui.includes('data-action="workbench-rule-delete"'),
        "each rule row must carry edit/delete actions");
    assert.ok(ui.includes('data-action="workbench-rules-master-trigger"'),
        "rules card must expose the event-trigger master switch");
    assert.ok(ui.includes('data-action="workbench-rule-toggle-event"'),
        "each rule row must expose the rule-level doc event trigger checkbox");
});

test("action editor renders the four action ids with placeholder hints", () => {
    const ui = readSource("workbench", "dialogRulesUI.ts");
    const shared = readSource("workbench", "dialogShared.ts");
    for (const actionId of ["setAttrs", "moveToPath", "appendContent", "toInbox"]) {
        assert.ok(shared.includes(`"${actionId}"`), `semantic action id list must declare ${actionId}`);
        assert.ok(ui.includes(`${actionId}`) && ui.includes("workbench-rule-action-id"),
            `action editor must render the ${actionId} dropdown`);
    }
    assert.ok(ui.includes("{{title}}") && ui.includes("{{notebook}}") && ui.includes("{{path}}"),
        "placeholder hint must document title/notebook/path placeholders");
    assert.ok(shared.includes('WORKBENCH_RULE_ACTION_IDS: TWorkbenchRuleActionId[] = ["setAttrs", "moveToPath", "appendContent", "toInbox"]'),
        "semantic action id list must stay authoritative in dialogShared");
});

test("run flow calls validate then run against the contract endpoints", () => {
    const api = readSource("assistant", "rules", "api.ts");
    assert.ok(api.includes('"/api/assistant/rules/validate"'), "validate endpoint must match the contract");
    assert.ok(api.includes('"/api/assistant/rules/run"'), "run endpoint must match the contract");
    assert.ok(api.includes("rule,") && api.includes("targets:") && api.includes("mode,") ||
        api.includes("{rule,targets,mode}") || api.includes("rule,\n    targets"), "payload must be {rule, targets, mode}");
    const ui = readSource("workbench", "dialogRulesUI.ts");
    assert.ok(ui.includes("validateAssistantRule") && ui.includes("runAssistantRule"),
        "run dialog must preview via validate before run");
    assert.ok(ui.includes("openWorkbenchAssistantDock"), "run success must offer the Agent panel entry");
});

test("event trigger listens to the kernel savedoc broadcast with debounce, dedupe and loop guard", () => {
    const triggers = readSource("assistant", "rules", "triggers.ts");
    assert.ok(triggers.includes('"savedoc"'), "trigger must consume the kernel savedoc broadcast (PushSaveDoc)");
    assert.ok(triggers.includes("ASSISTANT_RULES_EVENT_TRIGGER_DEBOUNCE_MS = 2000"), "debounce must be 2s");
    assert.ok(triggers.includes("buildAssistantTriggerDedupeKey"), "dedupe key builder must exist");
    assert.ok(triggers.includes("ruleRunId"), "loop guard must filter ruleRunId-marked writes");
    assert.ok(triggers.includes("sourceflow.assistant.rules.eventTrigger"), "master switch must persist to localStorage");
    assert.ok(triggers.includes("isAssistantRulesEventTriggerEnabled"),
        "master switch reader must gate event handling");
    const controller = readSource("workbench", "dialogController.ts");
    assert.ok(controller.includes("initAssistantRulesEventTrigger"),
        "workbench render must arm the trigger listener");
});

test("semantic actions stay out of the passive attr application path (backward compatible)", () => {
    const rulesSource = readSource("workbench", "dialogRules.ts");
    assert.ok(rulesSource.includes("isWorkbenchRuleActionId(key)"),
        "passive attr application must skip semantic action ids");
});

test("assistant rules test is registered in package.json and typecheck.js", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
    assert.strictEqual(pkg.scripts["test:assistant-rules"], "node ./scripts/testAssistantRules.js",
        "package.json must register test:assistant-rules");
    const typecheck = fs.readFileSync(path.join(appRoot, "scripts", "typecheck.js"), "utf8");
    assert.ok(typecheck.includes("testAssistantRules.js") && typecheck.includes("assistant rules"),
        "typecheck.js must run the assistant rules test");
});

// =================================================================================================
// vm 行为断言
// =================================================================================================

// --- 1. 规则归一：规则级触发开关默认关 ------------------------------------------------------------
test("normalizeWorkbenchRules defaults the doc event trigger to off", () => {
    const normalized = dialogShared.normalizeWorkbenchRules([{name: "会议打标签", actions: {"setAttrs": "tags=meetings"}}]);
    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].eventTrigger, false, "rule-level event trigger must default to off");
    assert.strictEqual(normalized[0].actions.setAttrs, "tags=meetings", "semantic action params must survive normalization");
    const explicit = dialogShared.normalizeWorkbenchRules([{name: "r", eventTrigger: true, actions: {}}]);
    assert.strictEqual(explicit[0].eventTrigger, true, "explicit opt-in must be preserved");
});

// --- 2. 向后兼容：旧属性键继续按属性设置工作，语义键不进属性 ---------------------------------------
test("legacy attr keys keep working and semantic action ids stay out of attrs", () => {
    const split = dialogShared.splitWorkbenchRuleActions({
        "tags": "meetings",
        "custom-workbench-status": "todo",
        "moveToPath": "{{notebook}}/会议记录",
        "setAttrs": "tags=meetings",
    });
    assertSameArray(Object.keys(split.attrs).sort(), ["custom-workbench-status", "tags"], "legacy keys must stay attrs");
    assertSameArray(Object.keys(split.semantic).sort(), ["moveToPath", "setAttrs"], "semantic ids must be recognized");

    const state = {
        rules: dialogShared.normalizeWorkbenchRules([{
            name: "兼容规则",
            enabled: true,
            titleIncludes: "",
            actions: {"tags": "meetings", "moveToPath": "{{notebook}}/会议记录"},
        }]),
    };
    const windowStub = sandbox.window;
    windowStub.sourceflow.storage[constantsStub.Constants.LOCAL_WORKBENCH] = state;
    const attrs = dialogRules.applyWorkbenchRulesToAttrs({type: "doc", tags: []}, {});
    assert.strictEqual(attrs.tags, "meetings", "legacy attr action must still apply passively");
    assert.strictEqual(attrs.moveToPath, undefined, "semantic action must never leak into attrs");
    delete windowStub.sourceflow.storage[constantsStub.Constants.LOCAL_WORKBENCH];
});

// --- 3. 动作编辑渲染：下拉四动作 + 占位符说明 ------------------------------------------------------
test("action row renders a dropdown of the four actions plus a params input with placeholder hint", () => {
    const row = rulesUI.renderWorkbenchRuleActionRow("moveToPath", "{{notebook}}/会议记录");
    for (const [actionId, label] of [["setAttrs", "设置属性"], ["moveToPath", "移动到路径"], ["appendContent", "追加内容"], ["toInbox", "推入收件箱"]]) {
        assert.ok(row.includes(`value="${actionId}"`), `dropdown must offer ${actionId}`);
        assert.ok(row.includes(label), `dropdown must label ${actionId}`);
    }
    assert.ok(row.includes('value="{{notebook}}/会议记录"'), "params input must keep the given value");
    assert.ok(row.includes("{{notebook}}"), "row hint must mention placeholders");
    const emptyRow = rulesUI.renderWorkbenchRuleActionRow();
    assert.ok(emptyRow.includes('value="setAttrs" selected'), "new action rows default to setAttrs");
});

test("rules card renders master switch (unchecked) and per-rule trigger checkboxes", () => {
    const state = {rules: dialogShared.normalizeWorkbenchRules([
        {name: "会议打标签", enabled: true, titleIncludes: "会议", actions: {"setAttrs": "tags=meetings"}, eventTrigger: false},
    ])};
    const html = rulesUI.renderWorkbenchRulesCard(state, {selectedCount: 3});
    assert.ok(html.includes('data-action="workbench-rules-master-trigger"'), "master switch must render");
    assert.ok(!html.includes('data-action="workbench-rules-master-trigger" checked'),
        "master switch must render unchecked by default");
    assert.ok(html.includes('data-action="workbench-rule-toggle-event"'), "rule-level trigger must render");
    assert.ok(!html.includes('data-rule="会议打标签" checked'), "rule-level trigger must render unchecked");
    assert.ok(html.includes("文档事件触发"), "trigger labels must be visible");
    assert.ok(html.includes("当前选中 3 项"), "selection count hint must render for the run scope");
});

// --- 4. 编辑器收集：语义动作收集 + 旧属性键保留 ---------------------------------------------------
test("editor collect gathers semantic actions and preserves legacy attr keys", () => {
    const makeElement = (values, rows) => ({
        querySelector: (selector) => values[selector] === undefined ? null : values[selector],
        querySelectorAll: (selector) => selector === ".workbench-rule-action-row" ? rows : [],
    });
    const input = (value) => ({value});
    const select = (value) => ({value});
    const checkbox = (checked) => ({checked});
    const element = makeElement({
        "#workbenchRuleName": input("新规则"),
        "#workbenchRuleEnabled": checkbox(true),
        "#workbenchRuleMatchKind": select("*"),
        "#workbenchRuleMatchType": select("*"),
        "#workbenchRuleInbox": select(""),
        "#workbenchRuleTitle": input(""),
        "#workbenchRuleNotebook": input(""),
        "#workbenchRuleProject": input(""),
        "#workbenchRuleTag": input(""),
        "#workbenchRuleEventTrigger": checkbox(true),
    }, [
        {querySelector: (s) => s === ".workbench-rule-action-id" ? select("moveToPath") : input("{{notebook}}/会议记录")},
        {querySelector: (s) => s === ".workbench-rule-action-id" ? select("setAttrs") : input("tags=meetings")},
        {querySelector: (s) => s === ".workbench-rule-action-id" ? select("toInbox") : input("")},
    ]);
    const collected = rulesUI.collectWorkbenchRuleEditorRule(element, {
        name: "旧规则",
        actions: {"tags": "legacy-tag", "custom-workbench-project": "研究"},
    });
    assert.strictEqual(collected.rule.name, "新规则");
    assert.strictEqual(collected.rule.eventTrigger, true, "explicit rule-level opt-in must be collected");
    assert.strictEqual(collected.rule.actions.moveToPath, "{{notebook}}/会议记录");
    assert.strictEqual(collected.rule.actions.setAttrs, "tags=meetings");
    assert.strictEqual(collected.rule.actions.toInbox, undefined, "empty params must be dropped");
    assert.strictEqual(collected.rule.actions.tags, "legacy-tag", "legacy attr keys must be preserved");
    assert.strictEqual(collected.rule.actions["custom-workbench-project"], "研究");

    const missingName = rulesUI.collectWorkbenchRuleEditorRule(makeElement({"#workbenchRuleName": input("  ")}, []));
    assert.ok(missingName.error, "empty name must produce an error");
});

// --- 5. validate → run：契约载荷 + dryRun 摘要宽容归一 + run 结果 ----------------------------------
test("validate posts {rule, targets, mode} and tolerates string/object dryRun summaries", async () => {
    fetchCalls.length = 0;
    securityConfigFixture = {defaultMode: "autoReview"};
    const rule = dialogShared.normalizeWorkbenchRules([{name: "会议打标签", titleIncludes: "会议", actions: {"setAttrs": "tags=meetings"}}])[0];
    const mode = await rulesApi.resolveAssistantRuleRunMode();
    assert.strictEqual(mode, "autoReview", "mode must follow the current security mode");
    const summaries = await rulesApi.validateAssistantRule(rule, ["doc-1"], mode);
    const validateCall = fetchCalls.find((call) => call.url === "/api/assistant/rules/validate");
    assert.ok(validateCall, "validate must hit the contract endpoint");
    assertSameArray(Object.keys(validateCall.payload).sort(), ["mode", "rule", "targets"], "validate payload must be {rule, targets, mode}");
    assertSameArray(validateCall.payload.targets, ["doc-1"]);
    assert.strictEqual(validateCall.payload.mode, "autoReview");
    assert.strictEqual(validateCall.payload.rule.name, "会议打标签");
    assert.strictEqual(summaries.length, 1);
    assert.strictEqual(summaries[0].title, "每周会议记录");
    assert.ok(summaries[0].summary.includes("移动到路径"));

    fetchResponder = () => ({code: 0, msg: "", data: {items: ["设置属性: tags=meetings"]}});
    const stringSummaries = await rulesApi.validateAssistantRule(rule, ["doc-1"], mode);
    assert.strictEqual(stringSummaries[0].summary, "设置属性: tags=meetings", "string summaries must be tolerated");
    fetchResponder = (url) => {
        if (url === "/api/workbench/getWorkbenchItems") {
            return {code: 0, msg: "", data: {items: workbenchItemFixtures}};
        }
        return {code: 0, msg: "", data: {taskId: "task-1", itemCount: 1, actionsSummary: "setAttrs"}};
    };

    fetchCalls.length = 0;
    const run = await rulesApi.runAssistantRule(rule, ["doc-1"], mode);
    const runCall = fetchCalls.find((call) => call.url === "/api/assistant/rules/run");
    assert.ok(runCall, "run must hit the contract endpoint");
    assertSameArray(Object.keys(runCall.payload).sort(), ["mode", "rule", "targets"], "run payload must be {rule, targets, mode}");
    assert.strictEqual(run.taskId, "task-1");
    assert.strictEqual(run.itemCount, 1);

    fetchResponder = () => ({code: 7, msg: "安全拒绝", data: {}});
    await assert.rejects(rulesApi.runAssistantRule(rule, ["doc-1"], mode), /安全拒绝/,
        "non-zero code must surface the backend message");
    fetchResponder = (url) => {
        if (url === "/api/workbench/getWorkbenchItems") {
            return {code: 0, msg: "", data: {items: workbenchItemFixtures}};
        }
        if (url === "/api/assistant/rules/validate") {
            return {code: 0, msg: "", data: {items: [{id: "doc-1", title: "每周会议记录", summary: "设置属性: tags=meetings"}]}};
        }
        return {code: 0, msg: "", data: {taskId: "task-1", itemCount: 1, actionsSummary: "setAttrs"}};
    };
});

// --- 6. 总开关默认关 + 规则级开关默认关（事件全程无运行）-------------------------------------------
test("event trigger stays silent when the master switch defaults to off", async () => {
    assert.strictEqual(localStorageStore.get("sourceflow.assistant.rules.eventTrigger"), undefined,
        "master switch must start unpersisted");
    assert.strictEqual(rulesTriggers.isAssistantRulesEventTriggerEnabled(), false,
        "master switch must default to off");
    rulesTriggers.initAssistantRulesEventTrigger();
    fetchCalls.length = 0;
    rulesTriggers.handleAssistantTriggerKernelMessage({data: JSON.stringify({cmd: "savedoc", data: {rootID: "doc-1", sources: []}})});
    advance(2000);
    assert.strictEqual(fetchCalls.filter((call) => call.url === "/api/assistant/rules/run").length, 0,
        "master-off must swallow doc events entirely");
    rulesTriggers.disposeAssistantRulesEventTrigger();
});

test("rule-level trigger defaults keep event-trigger rules opt-in only", async () => {
    localStorageStore.set("sourceflow.assistant.rules.eventTrigger", "on");
    assert.strictEqual(rulesTriggers.isAssistantRulesEventTriggerEnabled(), true);
    fetchCalls.length = 0;
    const optOutRule = dialogShared.normalizeWorkbenchRules([{name: "没开触发", titleIncludes: "会议", actions: {"setAttrs": "tags=meetings"}}])[0];
    assert.strictEqual(optOutRule.eventTrigger, false, "rule without the flag must not event-trigger");
    const results = await rulesTriggers.runAssistantRulesForDoc(workbenchItemFixtures[0].id, "tx-1", [optOutRule], "default");
    assert.strictEqual(results.length, 0, "no run for rules without the event trigger flag");
    assert.strictEqual(fetchCalls.filter((call) => call.url === "/api/assistant/rules/run").length, 0);
    localStorageStore.clear();
});

// --- 7. 去抖 2s + 去重（同版本不重复执行）+ savedoc 全链路 -----------------------------------------
test("savedoc events debounce 2s, run matching rules, and dedupe by doc+rule+version", async () => {
    securityConfigFixture = {defaultMode: "default"};
    localStorageStore.set("sourceflow.assistant.rules.eventTrigger", "on");
    sandbox.window.sourceflow.storage[constantsStub.Constants.LOCAL_WORKBENCH] = {
        rules: dialogShared.normalizeWorkbenchRules([
            {name: "会议打标签", enabled: true, titleIncludes: "会议", eventTrigger: true, actions: {"setAttrs": "tags=meetings"}},
        ]),
    };
    rulesTriggers.initAssistantRulesEventTrigger();
    fetchCalls.length = 0;
    const savedocPayload = JSON.stringify({
        cmd: "savedoc",
        data: {rootID: workbenchItemFixtures[0].id, type: "tx", sources: [{timestamp: 1704067200000, doOperations: []}]},
    });
    // 去抖：事件到达后立即无调用，2s 后一次运行。
    rulesTriggers.handleAssistantTriggerKernelMessage({data: savedocPayload});
    assert.strictEqual(fetchCalls.length, 0, "debounce must delay evaluation");
    advance(1999);
    assert.strictEqual(fetchCalls.length, 0, "evaluation must wait the full 2s");
    advance(1);
    await flushMicrotasks();
    const runCalls = fetchCalls.filter((call) => call.url === "/api/assistant/rules/run");
    assert.strictEqual(runCalls.length, 1, "matching rule must run once after the debounce window");
    assertSameArray(runCalls[0].payload.targets, [workbenchItemFixtures[0].id], "trigger targets the event doc itself");
    assert.strictEqual(runCalls[0].payload.mode, "default");

    // 去重：同文档同版本（同 timestamp）再次保存不重复执行。
    fetchCalls.length = 0;
    rulesTriggers.handleAssistantTriggerKernelMessage({data: savedocPayload});
    advance(2000);
    await flushMicrotasks();
    assert.strictEqual(fetchCalls.filter((call) => call.url === "/api/assistant/rules/run").length, 0,
        "same doc+rule+version must not run twice");

    // 新版本（新 timestamp）可再次触发。
    rulesTriggers.handleAssistantTriggerKernelMessage({data: JSON.stringify({
        cmd: "savedoc",
        data: {rootID: workbenchItemFixtures[0].id, type: "tx", sources: [{timestamp: 1704067200001, doOperations: []}]},
    })});
    advance(2000);
    await flushMicrotasks();
    assert.strictEqual(fetchCalls.filter((call) => call.url === "/api/assistant/rules/run").length, 1,
        "a new doc version may trigger again");

    // 非命中标题不触发。
    fetchCalls.length = 0;
    rulesTriggers.handleAssistantTriggerKernelMessage({data: JSON.stringify({
        cmd: "savedoc",
        data: {rootID: "99990101120000-otherdoc", type: "tx", sources: [{timestamp: 1704067200002}]},
    })});
    advance(2000);
    await flushMicrotasks();
    assert.strictEqual(fetchCalls.filter((call) => call.url === "/api/assistant/rules/run").length, 0,
        "non-matching docs must not trigger");
    rulesTriggers.disposeAssistantRulesEventTrigger();
    delete sandbox.window.sourceflow.storage[constantsStub.Constants.LOCAL_WORKBENCH];
    localStorageStore.clear();
});

// --- 8. 循环防护：ruleRunId 标记的写入事件被忽略 ---------------------------------------------------
test("savedoc payloads marked with ruleRunId are ignored (loop protection)", async () => {
    localStorageStore.set("sourceflow.assistant.rules.eventTrigger", "on");
    sandbox.window.sourceflow.storage[constantsStub.Constants.LOCAL_WORKBENCH] = {
        rules: dialogShared.normalizeWorkbenchRules([
            {name: "会议打标签", enabled: true, titleIncludes: "会议", eventTrigger: true, actions: {"setAttrs": "tags=meetings"}},
        ]),
    };
    rulesTriggers.initAssistantRulesEventTrigger();
    // 单元口径：isAssistantRuleRunEvent 直接识别标记。
    const marked = {rootID: workbenchItemFixtures[0].id, sources: [{doOperations: [{data: {new: {"custom-rule-run-id": "", "ruleRunId": "run-1"}}}]}]};
    assert.strictEqual(rulesTriggers.isAssistantRuleRunEvent(marked), true, "ruleRunId in sources must be detected");
    assert.strictEqual(rulesTriggers.isAssistantRuleRunEvent({rootID: workbenchItemFixtures[0].id, sources: []}), false);
    // 端到端口径：带标记的 savedoc 在去抖后也不产生任何调用。
    fetchCalls.length = 0;
    rulesTriggers.handleAssistantTriggerKernelMessage({data: JSON.stringify({
        cmd: "savedoc",
        data: {rootID: workbenchItemFixtures[0].id, type: "tx", sources: [{timestamp: 1704067200003, doOperations: [{data: {new: {"ruleRunId": "run-9"}}}]}]},
    })});
    advance(2000);
    await flushMicrotasks();
    assert.strictEqual(fetchCalls.length, 0, "rule-produced writes must never re-trigger rules");
    rulesTriggers.disposeAssistantRulesEventTrigger();
    delete sandbox.window.sourceflow.storage[constantsStub.Constants.LOCAL_WORKBENCH];
    localStorageStore.clear();
});

// --- 9. 匹配使用工作台条目（笔记本/标签等条件生效）------------------------------------------------
test("trigger matching reuses matchWorkbenchRule over workbench items", async () => {
    const rule = dialogShared.normalizeWorkbenchRules([
        {name: "笔记本限定", enabled: true, notebookIncludes: "完全不含的笔记本", eventTrigger: true, actions: {"setAttrs": "tags=x"}},
    ])[0];
    fetchCalls.length = 0;
    const results = await rulesTriggers.runAssistantRulesForDoc(workbenchItemFixtures[0].id, "tx-9", [rule], "default");
    assert.strictEqual(results.length, 0, "notebook condition must gate the trigger");
    const unknownDoc = await rulesTriggers.runAssistantRulesForDoc("8888-not-in-workbench", "tx-9", [rule], "default");
    assert.strictEqual(unknownDoc.length, 0, "docs absent from workbench items are skipped silently");
});

(async () => {
    for (const {name, fn} of pendingTests) {
        try {
            await fn();
            console.log(`[assistant-rules] ok - ${name}`);
        } catch (error) {
            console.error(`[assistant-rules] failed - ${name}`);
            console.error(error);
            process.exitCode = 1;
        }
    }
})();
