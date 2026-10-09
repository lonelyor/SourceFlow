const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const projectRoot = path.join(__dirname, "..", "..");
const appRoot = path.join(projectRoot, "app");
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), "utf8");

const compileModule = (entryPath, requireMap = {}, globals = {}) => {
    const source = fs.readFileSync(entryPath, "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
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
            return compileModule(fs.existsSync(target) ? target : `${target}.ts`, requireMap, globals);
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

const assertContains = (text, pattern, message) => {
    assert(pattern.test(text), message);
};

const checkFetchSyncPostFailures = async () => {
    const calls = [];
    const fetchModule = compileModule(path.join(appRoot, "src", "util", "fetch.ts"), {
        "../constants": {Constants: {}},
        "electron": {ipcRenderer: {send() {}}},
        "./processMessage": {processMessage: () => true},
        "../dialog/processSystem": {kernelError() {}},
    }, {
        window: {sourceflow: {reqIds: {}}, location: {reload() {}}},
        location: {port: "6806"},
        setTimeout,
        console,
        FormData: class {},
        fetch: async (url, init) => {
            calls.push({url, init});
            if (url === "/network-error") {
                throw new Error("network down");
            }
            if (url === "/html-error") {
                return {status: 502, statusText: "Bad Gateway", headers: {get: () => "text/html"}, text: async () => "<html>gateway</html>"};
            }
            if (url === "/bad-json") {
                return {status: 200, statusText: "OK", headers: {get: () => "application/json"}, json: async () => { throw new Error("bad json"); }};
            }
            return {status: 200, statusText: "OK", headers: {get: () => "application/json"}, json: async () => ({code: 0, data: {ok: true}})};
        },
    });
    const signal = new AbortController().signal;
    await assert.rejects(() => fetchModule.fetchSyncPost("/network-error"), /POST \/network-error failed: .*network down/);
    await assert.rejects(() => fetchModule.fetchSyncPost("/html-error"), /returned non-JSON response \(502 Bad Gateway\): <html>gateway<\/html>/);
    await assert.rejects(() => fetchModule.fetchSyncPost("/bad-json"), /returned invalid JSON: .*bad json/);
    await fetchModule.fetchSyncPost("/ok", {a: 1}, {signal});
    assert.strictEqual(calls.at(-1).init.signal, signal, "fetchSyncPost must pass AbortSignal to fetch");
};

const checkStaticResilienceBoundaries = () => {
    const main = read("app", "electron", "main.js");
    assertContains(main, /requestSingleInstanceLock\(\)/, "desktop must keep single-instance protection");
    assertContains(main, /app\.on\("second-instance"/, "desktop must handle second-instance workspace routing");
    assertContains(main, /SOURCEFLOW_ALLOW_MULTI_INSTANCE/, "desktop smoke must keep an explicit multi-instance test bypass");

    const desktopSmoke = read("scripts", "smoke-desktop-startup.js");
    const kernelSmoke = read("scripts", "smoke-portable-kernel.js");
    assert(desktopSmoke.includes("booted kernel process \\[pid=\\d+, port=(\\d+)\\]"), "desktop smoke must boot a real desktop executable and discover kernel port");
    assertContains(desktopSmoke, /\/api\/system\/bootProgress/, "desktop smoke must wait for real boot progress");
    assertContains(kernelSmoke, /\/api\/system\/bootProgress/, "kernel smoke must wait for real boot progress");
    assertContains(read("编译.py"), /run_kernel_main_note_flow_smoke[\s\S]*verify_kernel_main_note_flow_persistence/, "build gate must keep kernel E2E persistence smoke");

    const executor = read("app", "src", "assistant", "agent", "executor.ts");
    assertContains(executor, /new AbortController\(\)/, "Agent executor must use AbortController for cancellation");
    assertContains(executor, /controller\.abort\(\)/, "Agent executor must abort timed-out work");
    assertContains(executor, /defaultAgentItemTimeoutMs = 60000/, "Agent executor must retain item timeout");
    assertContains(executor, /defaultAgentMaxItems = 20/, "Agent executor must retain bounded batch size");
    assertContains(executor, /releaseAssistantAgentTaskLease/, "Agent executor must release backend lease");

    const sourceStudio = read("app", "src", "assistant", "studio", "sourceFlow.ts");
    assertContains(sourceStudio, /MAX_SOURCE_CHARS = 48000/, "Source Studio must keep a global large-source budget");
    assertContains(sourceStudio, /MAX_SOURCE_CHARS_PER_ITEM = 12000/, "Source Studio must keep per-item source budget");
    assertContains(sourceStudio, /clampSourceContent/, "Source Studio must clamp large source content");

    assertContains(read("kernel", "api", "assistant_context.go"), /too many items \(max 50\)/, "context pack must reject too many sources");
    assertContains(read("kernel", "model", "workbench.go"), /4096 < limit/, "workbench must bound large result sets");
    assertContains(read("kernel", "model", "upload.go"), /maxUploadFileCount\s*=\s*1024/, "uploads must bound many-file batches");
};

(async () => {
    await checkFetchSyncPostFailures();
    checkStaticResilienceBoundaries();
    console.log("[product-resilience] ok");
})().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
});
