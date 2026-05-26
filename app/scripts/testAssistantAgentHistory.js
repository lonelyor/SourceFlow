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
        Date,
        Math,
        ...globals,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const plain = (value) => JSON.parse(JSON.stringify(value));
const appRoot = path.join(__dirname, "..");
const storage = new Map();
const fakeWindow = {
    localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
    },
};

const queue = compileModule(path.join(appRoot, "src", "assistant", "agent", "queue.ts"), {}, {window: fakeWindow});
const task = queue.createAssistantAgentTask("批量审查", [{title: "A"}, {title: "B", targetId: "block-b"}]);
assert.strictEqual(task.items.length, 2);
assert.deepStrictEqual(plain(queue.getAssistantAgentTaskProgress(task)), {total: 2, done: 0, review: 0, failed: 0});
assert.strictEqual(queue.updateAssistantAgentTaskStatus(task.id, "paused").status, "paused");
assert.strictEqual(queue.updateAssistantAgentTaskStatus(task.id, "canceled").items[0].status, "canceled");

const executor = compileModule(path.join(appRoot, "src", "assistant", "agent", "executor.ts"), {}, {
    window: fakeWindow,
    AbortController,
    setTimeout,
    clearTimeout,
});
const agentPatchContext = {
    rootID: "doc-1",
    notebook: "box",
    path: "/doc",
    title: "Doc",
    currentBlockID: "doc-1",
    currentBlockType: "d",
    currentBlockMarkdown: "",
    selectedText: "",
};
const runTask = queue.createAssistantAgentTask("执行测试", [{title: "生成补丁"}, {title: "直接完成"}]);
const executorPromise = executor.runAssistantAgentTask(runTask.id, async (item) => {
    if (item.title === "生成补丁") {
        return {
            patchId: "patch-1",
            context: agentPatchContext,
            patch: {
                id: "patch-1",
                source: "agent",
                target: "note",
                risk: "L2",
                summary: "Agent 补丁",
                operations: [{
                    id: "op-agent-1",
                    type: "append-note",
                    targetId: "doc-1",
                    after: "生成内容",
                    status: "pending",
                }],
                createdAt: Date.now(),
            },
        };
    }
    return {};
}, {itemTimeoutMs: 1000}).then((updatedTask) => {
    assert(updatedTask, "agent executor should return task");
    const latest = queue.readAssistantAgentTasks().find((entry) => entry.id === runTask.id);
    assert.strictEqual(latest.items[0].status, "review");
    assert.strictEqual(latest.items[0].patchId, "patch-1");
    assert.strictEqual(latest.items[0].patch.summary, "Agent 补丁");
    assert.strictEqual(latest.items[0].context.rootID, "doc-1");
    assert.strictEqual(latest.items[1].status, "done");
    assert.strictEqual(latest.status, "review");
});

const deleted = [];
const requireMap = {
    "../../dialog/message": {
        showMessage: () => undefined,
    },
    "../../util/fetch": {
        fetchSyncPost: async (_url, payload) => {
            deleted.push(payload.id);
            return {code: 0};
        },
    },
    "../constants": {
        assistantText: (zh, en) => zh || en,
    },
};
const operations = compileModule(path.join(appRoot, "src", "assistant", "history", "operations.ts"), requireMap, {window: fakeWindow});
const historyStore = compileModule(path.join(appRoot, "src", "assistant", "history", "store.ts"), {}, {window: fakeWindow});
const patch = {
    id: "patch-1",
    source: "skill",
    target: "block",
    risk: "L2",
    summary: "追加内容",
    operations: [{
        id: "op-1",
        type: "insert-after-block",
        status: "accepted",
        appliedTargetId: "inserted-block",
        after: "内容",
    }],
    createdAt: Date.now(),
};
const historyItem = operations.recordAssistantPatchHistory(patch);
assert(historyItem.id, "history item should be recorded");
assert.strictEqual(historyStore.readAssistantOperationHistory().length, 1);

const historyPromise = operations.rollbackAssistantOperationHistoryItem(historyItem.id).then((ok) => {
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(deleted, ["inserted-block"]);
    assert.strictEqual(historyStore.readAssistantOperationHistory()[0].status, "rolled-back");
});

Promise.all([executorPromise, historyPromise]).then(() => {
    console.log("[assistant-agent-history] ok");
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
