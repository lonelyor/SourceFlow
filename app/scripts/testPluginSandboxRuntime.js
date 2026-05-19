const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const createHostEnvironment = () => {
    const location = {
        href: "https://example.com/",
        assign() {
            return undefined;
        },
        replace() {
            return undefined;
        },
        reload() {
            return undefined;
        },
    };
    const history = {
        length: 1,
        pushState() {
            return undefined;
        },
        replaceState() {
            return undefined;
        },
        go() {
            return undefined;
        },
        back() {
            return undefined;
        },
        forward() {
            return undefined;
        },
    };
    const navigator = {
        language: "en-US",
        userAgent: "sourceflow-test",
        sendBeacon() {
            return true;
        },
    };
    const document = {
        title: "Host Document",
        cookie: "session=real",
        body: {},
        createElement() {
            return {};
        },
    };
    const hostWindow = {
        sourceflow: {
            config: {
                lang: "en_US",
            },
        },
        eval,
        location,
        history,
        navigator,
        document,
        fetch(...args) {
            return {args};
        },
        XMLHttpRequest: function XMLHttpRequest() {
            return undefined;
        },
        WebSocket: function WebSocket() {
            return undefined;
        },
        EventSource: function EventSource() {
            return undefined;
        },
        Worker: function Worker() {
            return undefined;
        },
        SharedWorker: function SharedWorker() {
            return undefined;
        },
        BroadcastChannel: function BroadcastChannel() {
            return undefined;
        },
        MessageChannel: function MessageChannel() {
            return undefined;
        },
        MessagePort: function MessagePort() {
            return undefined;
        },
        postMessage() {
            return undefined;
        },
        open() {
            return null;
        },
        close() {
            return undefined;
        },
        require(key) {
            if (key === "fs") {
                return {name: "fs"};
            }
            return undefined;
        },
    };
    document.defaultView = hostWindow;
    document.parentWindow = hostWindow;
    hostWindow.window = hostWindow;
    hostWindow.globalThis = hostWindow;
    hostWindow.self = hostWindow;
    hostWindow.top = hostWindow;
    hostWindow.parent = hostWindow;
    hostWindow.frames = hostWindow;
    hostWindow.opener = null;
    return {window: hostWindow, document, navigator};
};

const compileModule = (entryPath, requireMap = {}, host = createHostEnvironment()) => {
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
            return compileModule(withExt, requireMap, host);
        }
        return require(request);
    };
    vm.runInNewContext(compiled.outputText, {
        module: moduleObj,
        exports: moduleObj.exports,
        require: localRequire,
        console,
        window: host.window,
        document: host.document,
        navigator: host.navigator,
        global: host.window,
        globalThis: host.window,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const host = createHostEnvironment();
const runtimePath = path.join(__dirname, "..", "src", "sandbox", "runtime.ts");
const runtimeModule = compileModule(runtimePath, {}, host);
const pluginSandboxPath = path.join(__dirname, "..", "src", "plugin", "runtimeSandbox.ts");
const pluginSandboxModule = compileModule(pluginSandboxPath, {
    "../sandbox/runtime": runtimeModule,
}, host);

const {executePluginModule} = pluginSandboxModule;

const baseItem = {
    name: "demo-plugin",
    manifest: {
        name: "demo-plugin",
        permissions: [],
        allowedRequireModules: [],
    },
};

const scopedAPI = {
    name: "api",
};

const moduleA = {exports: {}};
const exportsA = {};
executePluginModule({
    ...baseItem,
    js: `
const sf = require("sourceflow");
const fs = require("fs");
module.exports = {
    apiName: sf.name,
    fsName: fs.name,
    sameWindow: window === globalThis && self === window && top === window && parent === window,
    documentCookie: document.cookie,
    windowDocument: window.document === document,
    sourceflowGlobal: sourceflow === sf
};
    `,
    manifest: {
        ...baseItem.manifest,
        permissions: ["network.http"],
        allowedRequireModules: ["fs"],
    },
}, scopedAPI, moduleA, exportsA);

assert.strictEqual(moduleA.exports.apiName, "api");
assert.strictEqual(moduleA.exports.fsName, "fs");
assert.strictEqual(moduleA.exports.sameWindow, true);
assert.strictEqual(moduleA.exports.documentCookie, "");
assert.strictEqual(moduleA.exports.windowDocument, true);
assert.strictEqual(moduleA.exports.sourceflowGlobal, true);

const moduleB = {exports: {}};
const exportsB = {};
executePluginModule({
    ...baseItem,
    js: "module.exports = fetch('https://example.com/resource').args[0];",
    manifest: {
        ...baseItem.manifest,
        permissions: ["network.http"],
    },
}, scopedAPI, moduleB, exportsB);
assert.strictEqual(moduleB.exports, "https://example.com/resource");

assert.throws(() => {
    executePluginModule({
        ...baseItem,
        js: "fetch('https://example.com/blocked');",
    }, scopedAPI, {exports: {}}, {});
}, /network\.http|fetch/);

assert.throws(() => {
    executePluginModule({
        ...baseItem,
        js: "window.location.assign('https://example.com/blocked');",
    }, scopedAPI, {exports: {}}, {});
}, /location\.assign/);

console.log("[plugin-sandbox-runtime] ok");
