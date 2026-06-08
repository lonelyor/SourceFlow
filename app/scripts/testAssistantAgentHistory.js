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

let backendTasks = [];
let nextAgentId = 1;
let activeLease = "";
const createBackendId = (prefix) => `${prefix}-${nextAgentId++}`;
const upsertBackendTask = (task) => {
    const index = backendTasks.findIndex((item) => item.id === task.id);
    if (index >= 0) {
        backendTasks[index] = plain(task);
    } else {
        backendTasks = [plain(task)].concat(backendTasks);
    }
    return plain(task);
};
const fakeAgentFetch = async (url, payload) => {
    if (url === "/api/assistant/agent/list") {
        return {code: 0, data: plain(backendTasks)};
    }
    if (url === "/api/assistant/agent/create") {
        const now = Date.now();
        const task = {
            id: createBackendId("agent"),
            title: payload.title || "AI Agent Task",
            status: "running",
            items: payload.items.map((item) => ({
                id: createBackendId("item"),
                title: item.title || "Task item",
                targetId: item.targetId || "",
                context: item.context,
                status: "pending",
            })),
            createdAt: now,
            updatedAt: now,
        };
        return {code: 0, data: upsertBackendTask(task)};
    }
    if (url === "/api/assistant/agent/updateStatus") {
        const task = backendTasks.find((item) => item.id === payload.id);
        task.status = payload.status;
        if (payload.status === "canceled") {
            task.items = task.items.map((item) => item.status === "done" || item.status === "review" ? item : {...item, status: "canceled"});
        }
        return {code: 0, data: upsertBackendTask(task)};
    }
    if (url === "/api/assistant/agent/updateItem") {
        const task = backendTasks.find((item) => item.id === payload.taskId);
        task.items = task.items.map((item) => item.id === payload.itemId ? plain(payload.item) : item);
        upsertBackendTask(task);
        return {code: 0, data: plain(payload.item)};
    }
    if (url === "/api/assistant/agent/updateItems") {
        const task = backendTasks.find((item) => item.id === payload.taskId);
        task.items = plain(payload.items);
        return {code: 0, data: upsertBackendTask(task)};
    }
    if (url === "/api/assistant/agent/cancelPending") {
        const task = backendTasks.find((item) => item.id === payload.taskId);
        task.items = task.items.map((item) => item.status === "done" || item.status === "review" ? item : {...item, status: "canceled"});
        return {code: 0, data: upsertBackendTask(task)};
    }
    if (url === "/api/assistant/agent/acquireLease") {
        if (activeLease) {
            return {code: -1, msg: "assistant agent task is already running"};
        }
        activeLease = createBackendId("lease");
        const task = backendTasks.find((item) => item.id === payload.taskId);
        task.status = "running";
        return {code: 0, data: {task: upsertBackendTask(task), token: activeLease, expiresAt: Date.now() + 10000}};
    }
    if (url === "/api/assistant/agent/releaseLease") {
        assert.strictEqual(payload.leaseToken, activeLease);
        activeLease = "";
        const task = backendTasks.find((item) => item.id === payload.taskId);
        return {code: 0, data: upsertBackendTask(task)};
    }
    throw new Error(`unexpected agent API ${url}`);
};

const queueRequireMap = {
    "../../util/fetch": {
        fetchSyncPost: fakeAgentFetch,
    },
};
const queue = compileModule(path.join(appRoot, "src", "assistant", "agent", "queue.ts"), queueRequireMap, {window: fakeWindow});

const executor = compileModule(path.join(appRoot, "src", "assistant", "agent", "executor.ts"), {"./queue": queue}, {
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

const deleted = [];
const fetchCalls = [];
const requireMap = {
    "../../dialog/message": {
        showMessage: () => undefined,
    },
    "../../util/fetch": {
        fetchSyncPost: async (url, payload) => {
            fetchCalls.push({url, payload});
            if (url === "/api/assistant/history/reapply") {
                return {code: 0, data: {item: {id: payload.id, status: "reapplied"}}};
            }
            if (url === "/api/assistant/history/list") {
                return {code: 0, data: historyStore.readAssistantOperationHistory()};
            }
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
const historyItem = operations.recordAssistantPatchHistory(patch, {
    sessionId: "session-1",
    profileId: "profile-1",
    targetId: "root-1",
    targetLabel: "目标笔记",
});
assert(historyItem.id, "history item should be recorded");
assert.strictEqual(historyItem.sessionId, "session-1");
assert.strictEqual(historyItem.profileId, "profile-1");
assert.strictEqual(historyItem.targetLabel, "目标笔记");
assert.strictEqual(historyItem.results[0].appliedTargetId, "inserted-block");
assert.strictEqual(historyStore.readAssistantOperationHistory().length, 1);
assert.strictEqual(operations.canRevertAssistantOperationHistoryItem(historyItem), true);

const localReplaceHistoryItem = {
    id: "history-local-replace",
    patch: {
        id: "patch-replace",
        source: "skill",
        target: "block",
        risk: "L3",
        summary: "替换内容",
        operations: [{
            id: "op-replace",
            type: "replace-block",
            targetId: "block-1",
            status: "accepted",
        }],
        createdAt: Date.now(),
    },
    status: "applied",
    source: "skill",
    risk: "L3",
    results: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
};
assert.strictEqual(operations.canRevertAssistantOperationHistoryItem(localReplaceHistoryItem), false);
assert.strictEqual(operations.canReapplyAssistantOperationHistoryItem({
    ...localReplaceHistoryItem,
    status: "reverted",
}), false);
assert.strictEqual(operations.canReapplyAssistantOperationHistoryItem({
    ...localReplaceHistoryItem,
    id: "aihist-reverted",
    status: "reverted",
    operationId: "op-1",
    operationType: "replace-block",
}), true);

const failureItem = operations.recordAssistantPatchFailure(patch, "写入失败", {targetLabel: "失败目标"});
assert.strictEqual(failureItem.status, "failed");
assert.strictEqual(failureItem.error, "写入失败");

const createPatch = {
    id: "patch-create",
    source: "agent",
    target: "notebook",
    risk: "L2",
    summary: "创建笔记",
    operations: [{
        id: "op-create",
        type: "create-note",
        status: "accepted",
        appliedTargetId: "created-doc",
        after: "内容",
    }],
    createdAt: Date.now(),
};
const createHistoryItem = operations.recordAssistantPatchHistory(createPatch);
assert(createHistoryItem.id, "create-note history item should be recorded");

const explicitSaveItem = operations.recordAssistantExplicitSaveHistory({
    source: "dock",
    summary: "对话记录",
    noteId: "saved-doc",
    targetLabel: "对话记录",
    sessionId: "session-2",
    profileId: "profile-2",
});
assert(explicitSaveItem.id, "explicit AI save history item should be recorded");
assert.strictEqual(explicitSaveItem.source, "dock");
assert.strictEqual(explicitSaveItem.sessionId, "session-2");
assert.strictEqual(explicitSaveItem.profileId, "profile-2");
assert.strictEqual(explicitSaveItem.patch.operations[0].type, "create-note");
assert.strictEqual(explicitSaveItem.patch.operations[0].appliedTargetId, "saved-doc");

const historyPromise = operations.rollbackAssistantOperationHistoryItem(historyItem.id).then((ok) => {
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(deleted, ["inserted-block"]);
    assert.strictEqual(historyStore.readAssistantOperationHistory().find((item) => item.id === historyItem.id).status, "rolled-back");
    return operations.rollbackAssistantOperationHistoryItem(createHistoryItem.id);
}).then((ok) => {
    assert.strictEqual(ok, true);
    assert(fetchCalls.some((item) => item.url === "/api/filetree/removeDocByID" && item.payload.id === "created-doc"));
    assert.strictEqual(historyStore.readAssistantOperationHistory().find((item) => item.id === createHistoryItem.id).status, "rolled-back");
    return operations.rollbackAssistantOperationHistoryItem(explicitSaveItem.id);
}).then((ok) => {
    assert.strictEqual(ok, true);
    assert(fetchCalls.some((item) => item.url === "/api/filetree/removeDocByID" && item.payload.id === "saved-doc"));
    assert.strictEqual(historyStore.readAssistantOperationHistory().find((item) => item.id === explicitSaveItem.id).status, "rolled-back");
    historyStore.writeAssistantOperationHistory([{
        id: "aihist-reverted",
        patch,
        status: "reverted",
        source: "skill",
        risk: "L2",
        operationId: "op-1",
        operationType: "insert-after-block",
        results: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }]);
    return operations.syncAssistantOperationHistoryFromBackend()
        .then(() => operations.reapplyAssistantOperationHistoryItem("aihist-reverted"));
}).then((ok) => {
    assert.strictEqual(ok, true);
    assert(fetchCalls.some((item) => item.url === "/api/assistant/history/reapply" && item.payload.id === "aihist-reverted"));
});

const agentPromise = (async () => {
    const task = await queue.createAssistantAgentTask("批量审查", [{title: "A"}, {title: "B", targetId: "block-b"}]);
    assert.strictEqual(task.items.length, 2);
    assert.deepStrictEqual(plain(queue.getAssistantAgentTaskProgress(task)), {total: 2, done: 0, review: 0, failed: 0});
    assert.strictEqual((await queue.updateAssistantAgentTaskStatus(task.id, "paused")).status, "paused");
    assert.strictEqual((await queue.updateAssistantAgentTaskStatus(task.id, "canceled")).items[0].status, "canceled");

    const runTask = await queue.createAssistantAgentTask("执行测试", [{title: "生成补丁"}, {title: "直接完成"}]);
    const updatedTask = await executor.runAssistantAgentTask(runTask.id, async (item) => {
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
    }, {itemTimeoutMs: 1000});
    assert(updatedTask, "agent executor should return task");
    const latest = queue.readAssistantAgentTasks().find((entry) => entry.id === runTask.id);
    assert.strictEqual(latest.items[0].status, "review");
    assert.strictEqual(latest.items[0].patchId, "patch-1");
    assert.strictEqual(latest.items[0].patch.summary, "Agent 补丁");
    assert.strictEqual(latest.items[0].context.rootID, "doc-1");
    assert.strictEqual(latest.items[1].status, "done");
    assert.strictEqual(latest.status, "review");
})();

Promise.all([agentPromise, historyPromise]).then(() => {
    console.log("[assistant-agent-history] ok");
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
