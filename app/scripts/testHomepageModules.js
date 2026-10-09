const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const createHostWindow = () => ({
    sourceflow: {
        config: {
            lang: "zh_CN",
        },
        storage: {},
    },
});

const compileModule = (entryPath, requireMap = {}, hostWindow = createHostWindow()) => {
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
            return compileModule(withExt, requireMap, hostWindow);
        }
        return require(request);
    };
    vm.runInNewContext(compiled.outputText, {
        module: moduleObj,
        exports: moduleObj.exports,
        require: localRequire,
        console,
        window: hostWindow,
        global: hostWindow,
        globalThis: hostWindow,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const appRoot = path.join(__dirname, "..");
const homepageRoot = path.join(appRoot, "src", "homepage");
const constantsPath = path.join(homepageRoot, "constants.ts");
const statePath = path.join(homepageRoot, "state.ts");
const actionsPath = path.join(homepageRoot, "actions.ts");
const shortcutsPath = path.join(homepageRoot, "shortcuts.ts");
const runtimePath = path.join(homepageRoot, "runtime.ts");
const tabPath = path.join(homepageRoot, "tab.ts");
const templateFiles = [
    "io.ts",
    "loader.ts",
    "templateConfig.ts",
    "templateScriptRuntime.ts",
    path.join("templates", "defaultTemplate.ts"),
    path.join("templates", "markdown.ts"),
    path.join("templates", "note.ts"),
    path.join("templates", "standalone.ts"),
];

const hostWindow = createHostWindow();
const constantsModule = compileModule(constantsPath, {}, hostWindow);
const savedValues = [];
const stateModule = compileModule(statePath, {
    "../constants": {
        Constants: {
            LOCAL_HOMEPAGE: "local-homepage",
        },
    },
    "../protyle/util/compatibility": {
        setStorageVal(key, value) {
            savedValues.push({key, value});
        },
    },
}, hostWindow);
const assertHomepageState = (actual, noteId) => {
    assert.strictEqual(actual.noteId, noteId);
    assert.deepStrictEqual(Object.keys(actual), ["noteId"]);
};
let fetchSyncPostMock = async () => ({code: 0, data: {rootID: ""}});
const actionsModule = compileModule(actionsPath, {
    "../index": {},
    "../constants": {
        Constants: {
            CB_GET_SCROLL: "cb-get-scroll",
            CB_GET_FOCUS: "cb-get-focus",
        },
    },
    "../dialog": {
        Dialog: class {
            constructor() {
                this.element = {
                    querySelector() {
                        return null;
                    },
                    querySelectorAll() {
                        return [];
                    },
                };
            }
            bindInput() {
                return undefined;
            }
            destroy() {
                return undefined;
            }
        },
    },
    "../dialog/message": {
        showMessage() {
            return undefined;
        },
    },
    "../layout/getAll": {
        getAllModels() {
            return {editor: []};
        },
    },
    "../util/newFile": {
        newFile() {
            return undefined;
        },
    },
    "../util/fetch": {
        fetchPost() {
            return undefined;
        },
        fetchSyncPost(...args) {
            return fetchSyncPostMock(...args);
        },
    },
    "../util/escape": {
        escapeHtml(value) {
            return `${value || ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },
    },
    "./constants": constantsModule,
    "./state": stateModule,
    "../mobile/editor": {
        openMobileFileById() {
            return undefined;
        },
    },
    "../editor/util": {
        openFileById() {
            return Promise.resolve();
        },
    },
}, hostWindow);

let insertedShortcutHTML = "";
const shortcutsModule = compileModule(shortcutsPath, {
    "../constants": {
        Constants: {
            SOURCEFLOW_GET: "sourceflow-get",
            ZWSP: "\u200b",
        },
    },
    "../dialog": {
        Dialog: class {
            constructor() {
                this.element = {
                    querySelector() {
                        return null;
                    },
                    querySelectorAll() {
                        return [];
                    },
                };
            }
            bindInput() {
                return undefined;
            }
            destroy() {
                return undefined;
            }
        },
    },
    "../dialog/message": {
        showMessage() {
            return undefined;
        },
    },
    "../protyle/util/insertHTML": {
        insertHTML(value) {
            insertedShortcutHTML = value;
        },
    },
    "../protyle/util/selection": {
        focusByRange() {
            return undefined;
        },
    },
    "../util/escape": {
        escapeAttr(value) {
            return `${value || ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
        },
        escapeHtml(value) {
            return `${value || ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },
    },
    "./constants": constantsModule,
    electron: {
        ipcRenderer: {
            invoke() {
                return Promise.resolve({canceled: true, filePaths: []});
            },
        },
    },
}, hostWindow);

const assertReadiness = async (noteId, responseOrError, expected) => {
    fetchSyncPostMock = async () => {
        if (responseOrError instanceof Error) {
            throw responseOrError;
        }
        return responseOrError;
    };
    const originalWarn = console.warn;
    if (responseOrError instanceof Error) {
        console.warn = () => undefined;
    }
    try {
        const actual = await actionsModule.getHomepageNoteReadiness(noteId);
        assert.strictEqual(actual.readable, expected.readable);
        assert.strictEqual(actual.clearBinding, expected.clearBinding);
    } finally {
        console.warn = originalWarn;
    }
};

assert.strictEqual(constantsModule.DEFAULT_TEMPLATE_PATH, undefined);
assert.strictEqual(stateModule.normalizeHomepageNoteId(" 20260608000000-abcdefg "), "20260608000000-abcdefg");
assertHomepageState(stateModule.normalizeHomepageState({}), "");
assertHomepageState(stateModule.normalizeHomepageState({sourceType: "template", templatePath: "/data/storage/homepage/default"}), "");
assertHomepageState(stateModule.normalizeHomepageState({sourceType: "note", noteId: "doc-1"}), "doc-1");

hostWindow.sourceflow.storage["local-homepage"] = {sourceType: "template", templatePath: "/data/storage/homepage/default"};
assertHomepageState(stateModule.getHomepageState(), "");
stateModule.setHomepageSourceToNote(" doc-2 ");
assertHomepageState(hostWindow.sourceflow.storage["local-homepage"], "doc-2");
assert.strictEqual(savedValues.at(-1).key, "local-homepage");
assertHomepageState(savedValues.at(-1).value, "doc-2");
stateModule.clearHomepage();
assertHomepageState(hostWindow.sourceflow.storage["local-homepage"], "");

for (const relativePath of templateFiles) {
    assert.strictEqual(fs.existsSync(path.join(homepageRoot, relativePath)), false, `${relativePath} should be removed`);
}

const actionsSource = fs.readFileSync(actionsPath, "utf8");
const shortcutsSource = fs.readFileSync(shortcutsPath, "utf8");
const runtimeSource = fs.readFileSync(runtimePath, "utf8");
const tabSource = fs.readFileSync(tabPath, "utf8");

assert.ok(actionsSource.includes("openFileById"));
assert.ok(actionsSource.includes("/api/block/getBlockInfo"));
assert.ok(actionsSource.includes("/api/filetree/searchDocs"));
assert.ok(actionsSource.includes("clearBinding"));
assert.ok(actionsSource.includes("catch (error)"));
assert.ok(runtimeSource.includes("尚未创建主页"));
assert.ok(runtimeSource.includes("主页暂时无法打开"));
assert.ok(runtimeSource.includes("create-homepage-note"));
assert.ok(runtimeSource.includes("select-homepage-note"));
assert.ok(shortcutsSource.includes("HOMEPAGE_SHORTCUT_SLASH_VALUE"));
assert.ok(shortcutsSource.includes("showOpenDialog"));
assert.ok(tabSource.includes("openHomepageNote"));

assert.strictEqual(shortcutsModule.normalizeHomepageShortcutTarget({kind: "url", target: "example.com"}), "https://example.com");
assert.strictEqual(shortcutsModule.normalizeHomepageShortcutTarget({kind: "file", target: "D:\\Work\\Plan.xmind"}), "file:///D:/Work/Plan.xmind");
assert.ok(shortcutsModule.buildHomepageShortcutHTML({kind: "folder", target: "D:\\Work", title: "项目资料"}).includes('data-type="a"'));
shortcutsModule.insertHomepageShortcut({}, {kind: "url", target: "sourceflow.dev", title: "SourceFlow"});
assert.ok(insertedShortcutHTML.includes('data-href="https://sourceflow.dev"'));

for (const source of [actionsSource, shortcutsSource, runtimeSource, tabSource]) {
    assert.ok(!source.includes("runHomepageTemplateScript"));
    assert.ok(!source.includes("normalizeTemplatePath"));
    assert.ok(!source.includes("shell.openExternal"));
    assert.ok(!source.includes("new Function("));
}

(async () => {
    await assertReadiness("doc-2", {code: 0, data: {rootID: "doc-2"}}, {readable: true, clearBinding: false});
    await assertReadiness("doc-2", {code: 3, data: null}, {readable: false, clearBinding: false});
    await assertReadiness("doc-2", {code: -1, data: null}, {readable: false, clearBinding: true});
    await assertReadiness("doc-2", new Error("network down"), {readable: false, clearBinding: false});

    stateModule.setHomepageSourceToNote("doc-indexing");
    fetchSyncPostMock = async () => ({code: 3, data: null});
    assert.strictEqual(await actionsModule.openHomepageNote({}, "doc-indexing"), false);
    assertHomepageState(stateModule.getHomepageState(), "doc-indexing");

    stateModule.setHomepageSourceToNote("doc-deleted");
    fetchSyncPostMock = async () => ({code: -1, data: null});
    assert.strictEqual(await actionsModule.openHomepageNote({}, "doc-deleted"), false);
    assertHomepageState(stateModule.getHomepageState(), "");

    console.log("[homepage-modules] ok");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
