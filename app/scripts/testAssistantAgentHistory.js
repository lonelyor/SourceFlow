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

const fetchCalls = [];
let backendHistory = [];
const historyStore = compileModule(path.join(appRoot, "src", "assistant", "history", "store.ts"), {}, {window: fakeWindow});
const upsertBackendHistory = (item) => {
    const next = plain(item);
    const index = backendHistory.findIndex((entry) => entry.id === next.id);
    if (index >= 0) {
        backendHistory[index] = next;
    } else {
        backendHistory = [next].concat(backendHistory);
    }
    return plain(next);
};
const requireMap = {
    "../../dialog/message": {
        showMessage: () => undefined,
    },
    "../../util/fetch": {
        fetchSyncPost: async (url, payload) => {
            fetchCalls.push({url, payload});
            if (url === "/api/assistant/history/revert") {
                const item = backendHistory.find((entry) => entry.id === payload.id);
                if (!item) {
                    return {code: -1, msg: "assistant operation history was not found"};
                }
                item.status = "reverted";
                item.updatedAt = Date.now();
                return {code: 0, data: {item: plain(item)}};
            }
            if (url === "/api/assistant/history/reapply") {
                const item = backendHistory.find((entry) => entry.id === payload.id);
                if (!item) {
                    return {code: -1, msg: "assistant operation history was not found"};
                }
                item.status = "reapplied";
                item.updatedAt = Date.now();
                return {code: 0, data: {item: plain(item)}};
            }
            if (url === "/api/assistant/history/list") {
                return {code: 0, data: plain(backendHistory)};
            }
            if (url === "/api/assistant/history/recordExplicitSave") {
                const now = Date.now();
                return {code: 0, data: upsertBackendHistory({
                    id: `aihist-explicit-${payload.noteId}`,
                    patchId: `explicit-save-${payload.noteId}`,
                    operationId: `explicit-op-${payload.noteId}`,
                    operationType: "create-note",
                    patch: {
                        id: `explicit-save-${payload.noteId}`,
                        source: payload.source,
                        target: "note",
                        risk: payload.risk || "L2",
                        summary: payload.summary,
                        operations: [{
                            id: `explicit-op-${payload.noteId}`,
                            type: "create-note",
                            targetId: payload.noteId,
                            targetLabel: payload.targetLabel,
                            status: "accepted",
                            appliedTargetId: payload.noteId,
                            after: payload.markdown,
                        }],
                        createdAt: now,
                    },
                    status: "applied",
                    source: payload.source,
                    risk: payload.risk || "L2",
                    sessionId: payload.sessionId,
                    profileId: payload.profileId,
                    targetId: payload.noteId,
                    targetLabel: payload.targetLabel,
                    results: [],
                    createdAt: now,
                    updatedAt: now,
                })};
            }
            throw new Error(`unexpected history API ${url}`);
        },
    },
    "../constants": {
        assistantText: (zh, en) => zh || en,
    },
    "./store": historyStore,
};
const operations = compileModule(path.join(appRoot, "src", "assistant", "history", "operations.ts"), requireMap, {window: fakeWindow});
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
const backendPatchHistoryItem = {
    id: "aihist-applied",
    patchId: patch.id,
    operationId: "op-1",
    operationType: "insert-after-block",
    patch,
    status: "applied",
    source: "skill",
    risk: "L2",
    sessionId: "session-1",
    profileId: "profile-1",
    targetId: "root-1",
    targetLabel: "目标笔记",
    results: [{
        operationId: "op-1",
        type: "insert-after-block",
        status: "accepted",
        appliedTargetId: "inserted-block",
    }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
};
assert.strictEqual(operations.recordAssistantPatchHistory(patch, {
    sessionId: "session-1",
    profileId: "profile-1",
    targetId: "root-1",
    targetLabel: "目标笔记",
}), null);
assert.strictEqual(historyStore.readAssistantOperationHistory().length, 0);

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
assert.strictEqual(failureItem, null);

const historyPromise = (async () => {
    backendHistory = [plain(backendPatchHistoryItem)];
    await operations.syncAssistantOperationHistoryFromBackend();
    const historyItem = historyStore.readAssistantOperationHistory()[0];
    assert.strictEqual(historyItem.id, "aihist-applied");
    assert.strictEqual(historyItem.sessionId, "session-1");
    assert.strictEqual(historyItem.profileId, "profile-1");
    assert.strictEqual(historyItem.targetLabel, "目标笔记");
    assert.strictEqual(historyItem.results[0].appliedTargetId, "inserted-block");
    assert.strictEqual(operations.canRevertAssistantOperationHistoryItem(historyItem), true);

    const explicitSaveItem = await operations.recordAssistantExplicitSaveHistory({
        source: "dock",
        summary: "对话记录",
        noteId: "saved-doc",
        targetLabel: "对话记录",
        sessionId: "session-2",
        profileId: "profile-2",
        markdown: "保存内容",
    });
    assert(explicitSaveItem.id, "explicit AI save history item should be recorded by backend");
    assert.strictEqual(explicitSaveItem.source, "dock");
    assert.strictEqual(explicitSaveItem.sessionId, "session-2");
    assert.strictEqual(explicitSaveItem.profileId, "profile-2");
    assert.strictEqual(explicitSaveItem.patch.operations[0].type, "create-note");
    assert.strictEqual(explicitSaveItem.patch.operations[0].appliedTargetId, "saved-doc");

    assert.strictEqual(await operations.rollbackAssistantOperationHistoryItem(historyItem.id), true);
    assert.strictEqual(historyStore.readAssistantOperationHistory().find((item) => item.id === historyItem.id).status, "reverted");
    assert.strictEqual(await operations.rollbackAssistantOperationHistoryItem(explicitSaveItem.id), true);
    assert.strictEqual(historyStore.readAssistantOperationHistory().find((item) => item.id === explicitSaveItem.id).status, "reverted");
    assert(!fetchCalls.some((item) => item.url === "/api/block/deleteBlock" || item.url === "/api/filetree/removeDocByID"),
        "history rollback must not use old local block/filetree fallback APIs");

    backendHistory = [{
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
    }];
    await operations.syncAssistantOperationHistoryFromBackend();
    const ok = await operations.reapplyAssistantOperationHistoryItem("aihist-reverted");
    assert.strictEqual(ok, true);
    assert(fetchCalls.some((item) => item.url === "/api/assistant/history/reapply" && item.payload.id === "aihist-reverted"));
})();

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
