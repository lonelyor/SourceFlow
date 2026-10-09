const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

// R8 期三：自动化规则——定时触发（诚实版）
// （plans/20260915-自动化规则系统设计.md §6 期三）
// 1. 规则模型：IWorkbenchRule.schedule（interval 每 N 小时 / daily 每天 HH:MM），
//    normalizeWorkbenchRuleSchedule 严格归一（kind 合法、everyHours 1-24 整数、atTime HH:MM，非法删除）。
// 2. 编辑 UI：「定时运行」三控件（开关 + 模式 + 参数）+ 诚实小字「仅在 SourceFlow 运行时触发，
//    错过的时点不补跑」；总开关文案改为「自动触发总开关」覆盖文档事件与定时计划。
// 3. 调度器（assistant/rules/scheduler.ts）：每分钟检查；interval=距上次运行 ≥N 小时，
//    daily=当前 HH:MM 命中且今日未跑；上次运行存 localStorage（成功失败都记账，失败不重试风暴）；
//    targets=规则匹配的工作台可见条目、上限 20 篇（后端 assistantAgentTaskItemLimit）超额截断并 toast；
//    runSkill 规则不参与定时（提示手动运行，按天去重）；防重入；复用自动触发总开关（双门）。

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");

const readSource = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

// --- 共享桩（fetch / 消息 / Dialog / 安全配置）----------------------------------------------------
const fetchCalls = [];
let fetchResponder = (url) => {
    if (url === "/api/workbench/getWorkbenchItems") {
        return {code: 0, msg: "", data: {items: workbenchItemFixtures}};
    }
    if (url === "/api/assistant/rules/run") {
        return {code: 0, msg: "", data: {taskId: "task-schedule", itemCount: 1, actionsSummary: "setAttrs"}};
    }
    return {code: -1, msg: `unexpected url ${url}`, data: {}};
};

const makeWorkbenchItem = (id, title, extra = {}) => ({
    id,
    title,
    type: "doc",
    entityKind: "doc",
    inbox: false,
    tags: [],
    notebook: "",
    project: "",
    ...extra,
});

const workbenchItemFixtures = [makeWorkbenchItem("20240101120000-abcdefg", "每周会议记录", {tags: ["会议"]})];

const showMessageCalls = [];
const intervalArms = [];
const intervalClears = [];

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
        confirmDialog: () => undefined,
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
        runAssistantSkill: async () => {
            throw new Error("schedule must never execute skills");
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

// --- vm 加载器（参照 testAssistantRulesPhase2.js）------------------------------------------------
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
    setInterval: (fn) => {
        intervalArms.push(fn);
        return intervalArms.length;
    },
    clearInterval: () => {
        intervalClears.push(1);
    },
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
    setInterval: windowObj.setInterval,
    clearInterval: windowObj.clearInterval,
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
const scheduler = loadModule(path.join("assistant", "rules", "scheduler.ts"));
const rulesUI = loadModule(path.join("workbench", "dialogRulesUI.ts"));

// --- 测试工具 ------------------------------------------------------------------------------------
const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date(2026, 8, 16, 10, 30, 0, 0).getTime();
const pad2 = (value) => (value < 10 ? `0${value}` : `${value}`);
const minuteOfDay = (timestamp) => {
    const date = new Date(timestamp);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const normalizeRule = (candidate) => dialogShared.normalizeWorkbenchRules([candidate])[0];

const resetTickState = () => {
    localStorageStore.clear();
    fetchCalls.length = 0;
    showMessageCalls.length = 0;
    fetchResponder = (url) => {
        if (url === "/api/workbench/getWorkbenchItems") {
            return {code: 0, msg: "", data: {items: workbenchItemFixtures}};
        }
        if (url === "/api/assistant/rules/run") {
            return {code: 0, msg: "", data: {taskId: "task-schedule", itemCount: 1, actionsSummary: "setAttrs"}};
        }
        return {code: -1, msg: `unexpected url ${url}`, data: {}};
    };
};

const runCalls = () => fetchCalls.filter((call) => call.url === "/api/assistant/rules/run");
const masterOn = () => true;

// =================================================================================================
// 源码断言
// =================================================================================================

test("schedule model is declared and normalized strictly in dialogShared", () => {
    const shared = readSource("workbench", "dialogShared.ts");
    assert.ok(shared.includes("export interface IWorkbenchRuleSchedule"),
        "the schedule shape must be an exported interface");
    assert.ok(shared.includes('kind: "interval" | "daily"') && shared.includes("everyHours?: number;") && shared.includes("atTime?: string;"),
        "schedule must support interval(everyHours) and daily(atTime)");
    assert.ok(shared.includes("schedule?: IWorkbenchRuleSchedule;"),
        "IWorkbenchRule must carry the optional schedule");
    assert.ok(shared.includes("export const normalizeWorkbenchRuleSchedule"),
        "schedule normalization must be exported for the scheduler/UI");
    assert.ok(shared.includes("schedule: normalizeWorkbenchRuleSchedule(item?.schedule),"),
        "normalizeWorkbenchRules must normalize the schedule field");
    assert.ok(shared.includes('if (!Number.isInteger(everyHours) || everyHours < 1 || everyHours > 24)'),
        "everyHours must be a whole number 1-24");
    assert.ok(shared.includes("WORKBENCH_RULE_SCHEDULE_TIME_PATTERN = /^([01]\\d|2[0-3]):[0-5]\\d$/"),
        "atTime must be validated as strict 24-hour HH:MM");
});

test("scheduler is honest: runtime-only triggering, per-minute tick, localStorage lastRun", () => {
    const source = readSource("assistant", "rules", "scheduler.ts");
    assert.ok(source.includes("错过的时点不补跑"),
        "the scheduler must document the no-catch-up semantics");
    assert.ok(source.includes("ASSISTANT_RULES_SCHEDULE_LAST_RUN_PREFIX = \"sourceflow.assistant.rules.schedule.lastRun.\""),
        "lastRun must persist to the documented localStorage prefix");
    assert.ok(source.includes("ASSISTANT_RULES_SCHEDULE_TICK_MS = 60 * 1000"),
        "the scheduler must check once per minute");
    assert.ok(source.includes("ASSISTANT_RULES_SCHEDULE_TARGET_LIMIT = 20"),
        "targets must cap at the backend batch limit of 20");
    assert.ok(source.includes("normalizeWorkbenchRuleSchedule") && source.includes("matchWorkbenchRule"),
        "due checks and target matching must reuse the shared helpers");
    assert.ok(source.includes("\"/api/workbench/getWorkbenchItems\""),
        "targets must come from the visible workbench items");
    assert.ok(source.includes("runAssistantRule(rule, targets, runMode)"),
        "due rules must run through the shared run contract");
    assert.ok(source.includes("if (schedulerTicking)"),
        "the tick must guard against reentrancy");
    assert.ok(source.includes("hasAssistantRuleSkillAction(rule)") && source.includes("请手动运行"),
        "skill-action rules must be excluded from scheduled runs with a manual-run hint");
});

test("scheduler shares the automation master switch and lifecycle with the event trigger", () => {
    const triggers = readSource("assistant", "rules", "triggers.ts");
    assert.ok(triggers.includes("initAssistantRulesScheduler({isMasterEnabled: isAssistantRulesEventTriggerEnabled})"),
        "arming the event trigger must arm the scheduler with the same master switch");
    assert.ok(triggers.includes("disposeAssistantRulesScheduler()"),
        "disposing the event trigger must dispose the scheduler");
    const ui = readSource("workbench", "dialogRulesUI.ts");
    assert.ok(ui.includes("自动触发总开关"),
        "the master switch copy must cover doc events and schedules");
});

test("editor exposes the three schedule controls with the honest fine print", () => {
    const ui = readSource("workbench", "dialogRulesUI.ts");
    assert.ok(ui.includes('id="workbenchRuleScheduleEnabled"'), "the schedule switch must exist");
    assert.ok(ui.includes('id="workbenchRuleScheduleKind"'), "the schedule kind select must exist");
    assert.ok(ui.includes('id="workbenchRuleScheduleParam"'), "the schedule param input must exist");
    assert.ok(ui.includes('value="interval"') && ui.includes('value="daily"'),
        "kind select must offer interval and daily");
    assert.ok(ui.includes('type="time"') && ui.includes('type="number" min="1" max="24"'),
        "param input must switch between hour count and HH:MM time");
    assert.ok(ui.includes("仅在 SourceFlow 运行时触发，错过的时点不补跑"),
        "the fine print must state runtime-only triggering with no catch-up");
    assert.ok(ui.includes("#workbenchRuleScheduleParamHost"),
        "switching kind must re-render the param control");
});

test("assistant rules scheduler test is registered in package.json and typecheck.js", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
    assert.strictEqual(pkg.scripts["test:assistant-rules-scheduler"], "node ./scripts/testAssistantRulesScheduler.js",
        "package.json must register test:assistant-rules-scheduler");
    const typecheck = fs.readFileSync(path.join(appRoot, "scripts", "typecheck.js"), "utf8");
    assert.ok(typecheck.includes("testAssistantRulesScheduler.js") && typecheck.includes("assistant rules scheduler"),
        "typecheck.js must run the assistant rules scheduler test");
});

// =================================================================================================
// vm 行为断言
// =================================================================================================

// --- 1. 模型归一：合法保留、非法删除、缺省不定时 ---------------------------------------------------
test("normalizeWorkbenchRules keeps legal schedules and drops illegal ones", () => {
    assertSameArray([normalizeRule({name: "r", schedule: {kind: "interval", everyHours: 6}, actions: {}}).schedule],
        [{kind: "interval", everyHours: 6}], "legal interval must survive");
    assertSameArray([normalizeRule({name: "r", schedule: {kind: "interval", everyHours: "6"}, actions: {}}).schedule],
        [{kind: "interval", everyHours: 6}], "numeric strings normalize to integers");
    assertSameArray([normalizeRule({name: "r", schedule: {kind: "daily", atTime: "08:05"}, actions: {}}).schedule],
        [{kind: "daily", atTime: "08:05"}], "legal daily must survive");
    for (const bad of [
        {kind: "interval", everyHours: 0},
        {kind: "interval", everyHours: 25},
        {kind: "interval", everyHours: 1.5},
        {kind: "interval"},
        {kind: "daily"},
        {kind: "daily", atTime: "8:05"},
        {kind: "daily", atTime: "08:60"},
        {kind: "daily", atTime: "24:00"},
        {kind: "weekly", everyHours: 1},
    ]) {
        assert.strictEqual(normalizeRule({name: "r", schedule: bad, actions: {}}).schedule, undefined,
            `illegal schedule ${JSON.stringify(bad)} must be dropped`);
    }
    assert.strictEqual(normalizeRule({name: "r", actions: {}}).schedule, undefined, "no schedule means undefined");
    assert.strictEqual(normalizeRule({name: "r", schedule: null, actions: {}}).schedule, undefined, "null schedule means undefined");
    assert.strictEqual(normalizeRule({name: "r", schedule: "daily", actions: {}}).schedule, undefined, "non-object schedule means undefined");
});

// --- 2. interval 距离判定：≥N 小时命中，从未运行立即命中，时钟回拨不误触 ---------------------------
test("interval schedules fire when at least N hours elapsed since the last run", () => {
    const rule = normalizeRule({name: "i6", schedule: {kind: "interval", everyHours: 6}, actions: {}});
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(rule, NOW, 0), true,
        "never-run interval rules are due on the first check");
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(rule, NOW, NOW - 6 * HOUR_MS), true,
        "exactly N hours counts as due (>=)");
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(rule, NOW, NOW - 6 * HOUR_MS + 1000), false,
        "less than N hours must not fire");
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(rule, NOW, NOW - 7 * HOUR_MS), true,
        "more than N hours must fire");
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(rule, NOW, NOW + HOUR_MS), false,
        "future lastRun (clock skew) must not fire");
});

// --- 3. daily 命中与当日去重：HH:MM 命中 + 今日未跑，跨午夜重置 ------------------------------------
test("daily schedules fire at HH:MM only when not already run today", () => {
    const rule = normalizeRule({name: "d", schedule: {kind: "daily", atTime: "10:30"}, actions: {}});
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(rule, NOW, 0), true,
        "exact minute with no lastRun fires");
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(rule, NOW, new Date(2026, 8, 15, 10, 30).getTime()), true,
        "exact minute the day before fires (cross-midnight reset)");
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(rule, NOW, new Date(2026, 8, 16, 9, 0).getTime()), false,
        "already run today must not fire again");
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(rule, new Date(2026, 8, 16, 10, 31).getTime(), new Date(2026, 8, 15, 10, 30).getTime()), false,
        "off-by-one minutes must not fire");
    const midnight = normalizeRule({name: "m", schedule: {kind: "daily", atTime: "00:00"}, actions: {}});
    assert.strictEqual(scheduler.isAssistantRuleScheduleDue(midnight, new Date(2026, 8, 16, 0, 0).getTime(), new Date(2026, 8, 15, 23, 59).getTime()), true,
        "midnight schedules fire the next local day");
});

// --- 4. targets 收集：规则匹配 + 上限 20 篇截断 ----------------------------------------------------
test("schedule targets match the rule over visible items and cap at 20", () => {
    const rule = normalizeRule({name: "会议规则", titleIncludes: "会议", schedule: {kind: "interval", everyHours: 1}, actions: {}});
    const items = [];
    for (let i = 0; i < 25; i++) {
        items.push(makeWorkbenchItem(`doc-match-${i}`, `会议记录 ${i}`));
    }
    items.push(makeWorkbenchItem("doc-other", "随手笔记"));
    const {targets, totalMatches} = scheduler.collectAssistantRuleScheduleTargets(rule, items);
    assert.strictEqual(totalMatches, 25, "all matching items count toward the total");
    assert.strictEqual(targets.length, 20, "targets must cap at the backend limit of 20");
    assertSameArray(targets.slice(0, 2), ["doc-match-0", "doc-match-1"], "targets keep match order");
    const noMatch = scheduler.collectAssistantRuleScheduleTargets(
        normalizeRule({name: "空", titleIncludes: "不存在", schedule: {kind: "daily", atTime: "00:00"}, actions: {}}), items);
    assertSameArray(noMatch.targets, [], "non-matching rules collect no targets");
    assert.strictEqual(noMatch.totalMatches, 0);
});

// --- 5. 总开关双门 + 规则级门槛：关/未配置/停用一票否 ----------------------------------------------
test("tick respects the master switch and rule-level gates", async () => {
    resetTickState();
    const rule = normalizeRule({name: "i1", schedule: {kind: "interval", everyHours: 1}, actions: {setAttrs: "tags=x"}});
    const off = await scheduler.runAssistantRulesSchedulerTick({rules: [rule], now: NOW, isMasterEnabled: () => false});
    assertSameArray(off, [], "master switch off must silence the whole tick");
    assert.strictEqual(fetchCalls.length, 0, "no fetches may happen while the master switch is off");

    const noSchedule = normalizeRule({name: "无定时", actions: {setAttrs: "tags=x"}});
    const disabled = normalizeRule({name: "停用", enabled: false, schedule: {kind: "interval", everyHours: 1}, actions: {setAttrs: "tags=x"}});
    const results = await scheduler.runAssistantRulesSchedulerTick({
        rules: [noSchedule, disabled, rule], now: NOW, isMasterEnabled: masterOn});
    assert.strictEqual(results.length, 1, "only enabled rules with a schedule may run");
    assert.strictEqual(results[0].ruleName, "i1");
});

// --- 6. interval 快乐路径：命中 → runAssistantRule → 记账 → 本轮内不重跑 ---------------------------
test("interval tick runs due rules, books lastRun and never double-fires", async () => {
    resetTickState();
    const rule = normalizeRule({name: "间隔规则", schedule: {kind: "interval", everyHours: 6}, actions: {setAttrs: "tags=x"}});
    const results = await scheduler.runAssistantRulesSchedulerTick({rules: [rule], now: NOW, isMasterEnabled: masterOn});
    assert.strictEqual(results.length, 1, "the never-run interval rule fires on the first check");
    assert.strictEqual(results[0].targetCount, 1);
    const run = runCalls()[0];
    assert.ok(run, "rules/run must be called through the shared contract");
    assertSameArray(run.payload.targets, [workbenchItemFixtures[0].id]);
    assert.strictEqual(run.payload.mode, "default", "scheduled runs use the current security mode");
    assert.ok(run.payload.rule.actions["set-attrs"], "backend actions compile as in manual runs");
    assert.strictEqual(scheduler.getAssistantRuleScheduleLastRun("间隔规则"), NOW,
        "lastRun must be booked to localStorage");

    const second = await scheduler.runAssistantRulesSchedulerTick({rules: [rule], now: NOW + 60 * 1000, isMasterEnabled: masterOn});
    assertSameArray(second, [], "an interval rule must not re-fire inside its window");
    assert.strictEqual(runCalls().length, 1, "no second batch run may be submitted");
});

// --- 7. runSkill 排除：定时不执行技能，按天去重提示手动运行 ----------------------------------------
test("scheduled runs skip skill rules with a day-deduped manual-run hint", async () => {
    resetTickState();
    const skillRule = normalizeRule({
        name: "技能定时规则",
        schedule: {kind: "daily", atTime: minuteOfDay(NOW)},
        actions: {runSkill: "note-summarize"},
    });
    const results = await scheduler.runAssistantRulesSchedulerTick({rules: [skillRule], now: NOW, isMasterEnabled: masterOn});
    assertSameArray(results, [], "skill rules must not run on a schedule");
    assert.strictEqual(runCalls().length, 0, "no backend batch run may happen for skill rules");
    const hints = showMessageCalls.filter((call) => `${call.message}`.includes("请手动运行"));
    assert.strictEqual(hints.length, 1, "the manual-run hint must appear once");

    await scheduler.runAssistantRulesSchedulerTick({rules: [skillRule], now: NOW + 60 * 1000, isMasterEnabled: masterOn});
    assert.strictEqual(showMessageCalls.filter((call) => `${call.message}`.includes("请手动运行")).length, 1,
        "the hint must be deduped per rule per day");
});

// --- 8. 失败记账：失败 toast 一次，不重试风暴 ------------------------------------------------------
test("failed scheduled runs toast once and stay booked to avoid retry storms", async () => {
    resetTickState();
    fetchResponder = (url) => {
        if (url === "/api/workbench/getWorkbenchItems") {
            return {code: 0, msg: "", data: {items: workbenchItemFixtures}};
        }
        if (url === "/api/assistant/rules/run") {
            return {code: -1, msg: "boom"};
        }
        return {code: -1, msg: `unexpected url ${url}`, data: {}};
    };
    const rule = normalizeRule({name: "会失败", schedule: {kind: "interval", everyHours: 6}, actions: {setAttrs: "tags=x"}});
    const results = await scheduler.runAssistantRulesSchedulerTick({rules: [rule], now: NOW, isMasterEnabled: masterOn});
    assertSameArray(results, [], "failed runs produce no results");
    const failures = showMessageCalls.filter((call) => `${call.message}`.includes("失败") && `${call.message}`.includes("boom"));
    assert.strictEqual(failures.length, 1, "the failure must surface exactly once per hit");
    assert.strictEqual(scheduler.getAssistantRuleScheduleLastRun("会失败"), NOW,
        "failures must book lastRun to avoid retry storms");

    await scheduler.runAssistantRulesSchedulerTick({rules: [rule], now: NOW + 1000, isMasterEnabled: masterOn});
    assert.strictEqual(runCalls().length, 1, "a booked failure must not retry immediately");
    assert.strictEqual(showMessageCalls.filter((call) => `${call.message}`.includes("失败")).length, 1,
        "no duplicate failure toast");
});

// --- 9. 超额截断：命中 25 篇只跑 20 篇并 toast 说明 ------------------------------------------------
test("oversized matches truncate to 20 with an explanatory toast", async () => {
    resetTickState();
    const items = [];
    for (let i = 0; i < 25; i++) {
        items.push(makeWorkbenchItem(`doc-match-${i}`, `会议记录 ${i}`));
    }
    fetchResponder = (url) => {
        if (url === "/api/workbench/getWorkbenchItems") {
            return {code: 0, msg: "", data: {items}};
        }
        if (url === "/api/assistant/rules/run") {
            return {code: 0, msg: "", data: {taskId: "task-trunc", itemCount: 20}};
        }
        return {code: -1, msg: `unexpected url ${url}`, data: {}};
    };
    const rule = normalizeRule({name: "大盘规则", titleIncludes: "会议", schedule: {kind: "interval", everyHours: 1}, actions: {setAttrs: "tags=x"}});
    const results = await scheduler.runAssistantRulesSchedulerTick({rules: [rule], now: NOW, isMasterEnabled: masterOn});
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].targetCount, 20, "only the first 20 matches run");
    assert.strictEqual(runCalls()[0].payload.targets.length, 20);
    assert.ok(showMessageCalls.some((call) => `${call.message}`.includes("仅运行前 20 篇")),
        "the truncation must be explained in a toast");
});

// --- 10. 防重入：上一轮未完成时跳过本轮 ------------------------------------------------------------
test("overlapping ticks are skipped while the previous tick is still running", async () => {
    resetTickState();
    let releaseRun;
    fetchResponder = (url) => {
        if (url === "/api/workbench/getWorkbenchItems") {
            return {code: 0, msg: "", data: {items: workbenchItemFixtures}};
        }
        if (url === "/api/assistant/rules/run") {
            return new Promise((resolve) => {
                releaseRun = () => resolve({code: 0, msg: "", data: {taskId: "task-hold", itemCount: 1}});
            });
        }
        return {code: -1, msg: `unexpected url ${url}`, data: {}};
    };
    const rule = normalizeRule({name: "慢规则", schedule: {kind: "interval", everyHours: 6}, actions: {setAttrs: "tags=x"}});
    const first = scheduler.runAssistantRulesSchedulerTick({rules: [rule], now: NOW, isMasterEnabled: masterOn});
    await waitFor(() => runCalls().length === 1);
    const second = await scheduler.runAssistantRulesSchedulerTick({rules: [rule], now: NOW, isMasterEnabled: masterOn});
    assertSameArray(second, [], "a tick that starts while another is in flight must be skipped");
    releaseRun();
    const results = await first;
    assert.strictEqual(results.length, 1, "the in-flight tick completes normally");
    assert.strictEqual(runCalls().length, 1, "still only one batch run");
});

// --- 11. 武装/销毁生命周期：幂等武装、销毁清理、武装即首检 ------------------------------------------
test("arm/dispose lifecycle is idempotent and wires the per-minute timer", async () => {
    intervalArms.length = 0;
    intervalClears.length = 0;
    fetchCalls.length = 0;
    localStorageStore.clear();
    scheduler.initAssistantRulesScheduler({isMasterEnabled: () => false});
    scheduler.initAssistantRulesScheduler({isMasterEnabled: () => false});
    assert.strictEqual(intervalArms.length, 1, "arming twice must install exactly one timer");
    await flushMicrotasks();
    assert.strictEqual(fetchCalls.length, 0, "the armed first check must stay silent while the master switch is off");
    scheduler.disposeAssistantRulesScheduler();
    scheduler.disposeAssistantRulesScheduler();
    assert.strictEqual(intervalClears.length, 1, "disposing twice must clear the timer once");
});

// --- 12. 编辑器收集：三控件 → schedule，非法给行内错误 ---------------------------------------------
test("editor collect reads the three schedule controls with readable errors", () => {
    const input = (value) => ({value});
    const select = (value) => ({value});
    const checkbox = (checked) => ({checked});
    const makeElement = (values) => ({
        querySelector: (selector) => values[selector] === undefined ? null : values[selector],
        querySelectorAll: () => [],
    });
    const base = {
        "#workbenchRuleName": input("定时规则"),
        "#workbenchRuleEnabled": checkbox(true),
        "#workbenchRuleMatchKind": select("*"),
        "#workbenchRuleMatchType": select("*"),
        "#workbenchRuleInbox": select(""),
        "#workbenchRuleTitle": input(""),
        "#workbenchRuleNotebook": input(""),
        "#workbenchRuleProject": input(""),
        "#workbenchRuleTag": input(""),
        "#workbenchRuleEventTrigger": checkbox(false),
        "#workbenchRuleScheduleEnabled": checkbox(false),
        "#workbenchRuleScheduleKind": select("interval"),
        "#workbenchRuleScheduleParam": input("6"),
    };
    const off = rulesUI.collectWorkbenchRuleEditorRule(makeElement(base), undefined);
    assert.strictEqual(off.rule.schedule, undefined, "switch off means no schedule");

    const interval = rulesUI.collectWorkbenchRuleEditorRule(
        makeElement({...base, "#workbenchRuleScheduleEnabled": checkbox(true)}), undefined);
    assertSameArray([interval.rule.schedule], [{kind: "interval", everyHours: 6}]);

    const daily = rulesUI.collectWorkbenchRuleEditorRule(
        makeElement({...base, "#workbenchRuleScheduleEnabled": checkbox(true), "#workbenchRuleScheduleKind": select("daily"), "#workbenchRuleScheduleParam": input("07:20")}), undefined);
    assertSameArray([daily.rule.schedule], [{kind: "daily", atTime: "07:20"}]);

    const badHours = rulesUI.collectWorkbenchRuleEditorRule(
        makeElement({...base, "#workbenchRuleScheduleEnabled": checkbox(true), "#workbenchRuleScheduleParam": input("30")}), undefined);
    assert.ok(badHours.error && badHours.error.includes("1-24"), "out-of-range hours must fail with a readable error");

    const badTime = rulesUI.collectWorkbenchRuleEditorRule(
        makeElement({...base, "#workbenchRuleScheduleEnabled": checkbox(true), "#workbenchRuleScheduleKind": select("daily"), "#workbenchRuleScheduleParam": input("7:20")}), undefined);
    assert.ok(badTime.error && badTime.error.includes("HH:MM"), "malformed times must fail with a readable error");
});

// --- 13. 列表/编辑器描述：定时 chip 与诚实文案 ------------------------------------------------------
test("rule rows describe schedules and the editor carries the honest fine print", () => {
    assert.strictEqual(rulesUI.describeWorkbenchRuleSchedule({kind: "interval", everyHours: 6}), "每 6 小时");
    assert.strictEqual(rulesUI.describeWorkbenchRuleSchedule({kind: "daily", atTime: "08:30"}), "每天 08:30");
    assert.strictEqual(rulesUI.describeWorkbenchRuleSchedule(undefined), "");
    assert.strictEqual(rulesUI.describeWorkbenchRuleSchedule({kind: "weekly"}), "", "illegal schedules describe as empty");

    const dailyParam = rulesUI.renderWorkbenchRuleScheduleParam({kind: "daily", atTime: "08:30"});
    assert.ok(dailyParam.includes('type="time"') && dailyParam.includes('value="08:30"'), "daily renders a time input");
    const intervalParam = rulesUI.renderWorkbenchRuleScheduleParam({kind: "interval", everyHours: 6});
    assert.ok(intervalParam.includes('type="number"') && intervalParam.includes('value="6"'), "interval renders a number input");
    const defaultParam = rulesUI.renderWorkbenchRuleScheduleParam(undefined);
    assert.ok(defaultParam.includes('type="number"'), "unknown schedules fall back to the interval input");

    const state = {rules: dialogShared.normalizeWorkbenchRules([
        {name: "会议打标签", enabled: true, titleIncludes: "会议", actions: {"setAttrs": "tags=meetings"}, schedule: {kind: "interval", everyHours: 6}},
    ])};
    const html = rulesUI.renderWorkbenchRulesCard(state, {selectedCount: 0});
    assert.ok(html.includes("自动触发总开关"), "master switch copy covers both trigger kinds");
    assert.ok(html.includes("定时") && html.includes("每 6 小时"), "scheduled rules show a schedule chip");
    assert.ok(html.includes("文档事件触发"), "event trigger labels stay visible");
});

(async () => {
    for (const {name, fn} of pendingTests) {
        try {
            await fn();
            console.log(`[assistant-rules-scheduler] ok - ${name}`);
        } catch (error) {
            console.error(`[assistant-rules-scheduler] failed - ${name}`);
            console.error(error);
            process.exitCode = 1;
        }
    }
})();
