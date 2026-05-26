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
const inlineRoot = path.join(appRoot, "src", "assistant", "inline");
const storage = new Map();
const fakeWindow = {
    localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
    },
};

const state = compileModule(path.join(inlineRoot, "state.ts"), {}, {window: fakeWindow});
const plain = (value) => JSON.parse(JSON.stringify(value));

assert.strictEqual(state.normalizeAssistantInlineInstruction("  改成   列表  "), "改成 列表");
assert.deepStrictEqual(Array.from(state.pushAssistantInlineRecentInstruction(["翻译", "简洁"], "翻译")), ["翻译", "简洁"]);
assert.deepStrictEqual(
    Array.from(state.pushAssistantInlineRecentInstruction(["a", "b", "c", "d", "e"], "f")),
    ["f", "a", "b", "c", "d"]
);
state.rememberAssistantInlineInstruction("更简洁");
state.rememberAssistantInlineInstruction("翻译成英文");
assert.deepStrictEqual(Array.from(state.readAssistantInlineRecentInstructions()), ["翻译成英文", "更简洁"]);

const key = state.buildAssistantInlineRoundKey("root", "block", "选择文本");
assert.deepStrictEqual(plain(state.claimAssistantInlineRound(key)), {ok: true, round: 1});
assert.deepStrictEqual(plain(state.claimAssistantInlineRound(key)), {ok: true, round: 2});
assert.deepStrictEqual(plain(state.claimAssistantInlineRound(key)), {ok: true, round: 3});
assert.deepStrictEqual(plain(state.claimAssistantInlineRound(key)), {ok: false, round: 3});
state.resetAssistantInlineRounds(key);
assert.deepStrictEqual(plain(state.claimAssistantInlineRound(key)), {ok: true, round: 1});

console.log("[assistant-inline-command] ok");
