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

operations.rollbackAssistantOperationHistoryItem(historyItem.id).then((ok) => {
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(deleted, ["inserted-block"]);
    assert.strictEqual(historyStore.readAssistantOperationHistory()[0].status, "rolled-back");
    console.log("[assistant-agent-history] ok");
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
