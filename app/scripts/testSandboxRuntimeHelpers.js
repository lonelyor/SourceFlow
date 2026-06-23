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
    const runtimeWindow = {eval};
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
        window: runtimeWindow,
        global: {},
        globalThis: {},
    }, {filename: entryPath});
    return moduleObj.exports;
};

const runtimePath = path.join(__dirname, "..", "src", "sandbox", "runtime.ts");
const runtimeModule = compileModule(runtimePath);

const {
    cloneSandboxData,
    createProtectedCallable,
    runSandboxedScript,
} = runtimeModule;

const cloned = cloneSandboxData({
    alpha: 1,
    nested: {
        beta: 2,
    },
    list: ["x", "y"],
});

assert.strictEqual(Object.getPrototypeOf(cloned), null);
assert.strictEqual(Object.getPrototypeOf(cloned.nested), null);
assert.strictEqual(Object.isFrozen(cloned), true);
assert.strictEqual(Object.isFrozen(cloned.nested), true);
assert.strictEqual(Array.isArray(cloned.list), true);
assert.strictEqual(Object.isFrozen(cloned.list), true);
assert.strictEqual(cloned.nested.beta, 2);

const protectedFn = createProtectedCallable((value) => value + 1, "helper");
assert.strictEqual(protectedFn(1), 2);
assert.strictEqual(protectedFn.constructor, undefined);
assert.strictEqual(Object.getPrototypeOf(protectedFn), null);

const sandboxResult = runSandboxedScript({
    label: "unit-test",
    source: "return { value: value + 1, hasWindow: window === null, hasFetch: typeof fetch === 'function' };",
    sourceURL: "sourceflow://unit/test.js",
    parameterNames: ["value"],
    parameters: [3],
});

assert.strictEqual(sandboxResult.value, 4);
assert.strictEqual(sandboxResult.hasWindow, true);
assert.strictEqual(sandboxResult.hasFetch, true);
const excludedShadowResult = runSandboxedScript({
    label: "unit-test",
    source: "return require('sourceflow').version + ':' + exports.tag;",
    sourceURL: "sourceflow://unit/excluded-shadow.js",
    parameterNames: ["require", "exports"],
    parameters: [
        (key) => key === "sourceflow" ? {version: "ok"} : undefined,
        {tag: "module"},
    ],
    excludeShadowNames: ["require", "exports"],
});
assert.strictEqual(excludedShadowResult, "ok:module");
assert.throws(() => {
    runSandboxedScript({
        label: "unit-test",
        source: "return fetch('/api/block/getBlockInfo', {});",
        sourceURL: "sourceflow://unit/fetch.js",
        parameterNames: [],
        parameters: [],
    });
}, /blocked access to fetch/);

const kernelApiPath = path.join(__dirname, "..", "src", "sandbox", "kernelApi.ts");
const kernelApiModule = compileModule(kernelApiPath, {
    "./runtime": runtimeModule,
    "../util/fetch": {
        fetchSyncPost: async (url, payload) => ({
            code: 0,
            msg: "",
            data: {url, payload},
        }),
    },
});

const {
    isReadOnlyKernelAPIPath,
    assertReadOnlyKernelAPIPath,
    createReadOnlyKernelFetch,
} = kernelApiModule;

assert.strictEqual(isReadOnlyKernelAPIPath("/api/block/getBlockInfo"), true);
assert.strictEqual(isReadOnlyKernelAPIPath("/api/search/searchEmbedBlock"), true);
assert.strictEqual(isReadOnlyKernelAPIPath("/api/block/updateBlock"), false);
assert.strictEqual(isReadOnlyKernelAPIPath("/api/file/putFile"), false);
assert.strictEqual(assertReadOnlyKernelAPIPath("test", "/api/file/getFile"), "/api/file/getFile");
assert.throws(() => assertReadOnlyKernelAPIPath("test", "/api/block/updateBlock"), /blocked kernel API path/);

const readonlyFetch = createReadOnlyKernelFetch("test");
readonlyFetch("/api/block/getBlockInfo", {id: "123"}).then((response) => {
    assert.strictEqual(response.data.url, "/api/block/getBlockInfo");
    assert.deepStrictEqual(response.data.payload, {id: "123"});
    return readonlyFetch("/api/block/updateBlock", {id: "123"});
}).then(() => {
    throw new Error("Expected readonly fetch to reject mutating path");
}).catch((error) => {
    assert.ok(/blocked kernel API path/.test(String(error)));
    console.log("[sandbox-runtime-helpers] ok");
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
