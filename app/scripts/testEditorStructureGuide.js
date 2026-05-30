const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");

const readSrc = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

const compileModule = (source, globals = {}) => {
    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    });
    const moduleObj = {exports: {}};
    const mockRequire = (id) => {
        if (id.includes("layout/getAll")) return {getAllEditor: () => []};
        if (id.includes("compatibility")) return {isIPhone: () => false};
        if (id.includes("structureGuide")) return {getEditorConfig: () => globals.window?.sourceflow?.config?.editor};
        return {};
    };
    const sandbox = {
        module: moduleObj,
        exports: moduleObj.exports,
        require: mockRequire,
        console,
        setTimeout,
        clearTimeout,
        ...globals,
    };
    vm.runInNewContext(compiled.outputText, sandbox, {filename: "test"});
    return moduleObj.exports;
};

const createMockElement = () => {
    const classes = new Set();
    return {
        _classes: classes,
        classList: {
            add(cls) { classes.add(cls); },
            remove(cls) { classes.delete(cls); },
            contains(cls) { classes.has(cls); },
        },
        innerHTML: "<button></button>",
        style: {},
        querySelectorAll() { return []; },
        querySelector() { return null; },
        getAttribute() { return null; },
        setAttribute() {},
        removeAttribute() {},
    };
};

const createMockProtyle = () => ({
    gutter: {element: createMockElement()},
    toolbar: {
        element: createMockElement(),
        subElement: createMockElement(),
        subElementCloseCB: null,
    },
    hint: {timeId: null, element: createMockElement()},
    wysiwyg: {element: createMockElement()},
});

console.log("=== testEditorStructureGuide ===");

// ---- Go backend config ----
const editorGo = fs.readFileSync(path.join(appRoot, "..", "kernel", "conf", "editor.go"), "utf8");
assert.ok(/DisplayHeadingLevel:\s+true,/.test(editorGo), "DisplayHeadingLevel should default to true in NewEditor");
console.log("[go-config] DisplayHeadingLevel field, JSON tag, and default ok");

// ---- TypeScript type ----
const configTypes = readSrc("types", "config.d.ts");
assert.ok(configTypes.includes("displayHeadingLevel: boolean"), "config.d.ts should have displayHeadingLevel boolean");
console.log("[ts-type] displayHeadingLevel type declaration ok");

// ---- Settings UI ----
const editorConfig = readSrc("config", "editor.ts");
assert.ok(editorConfig.includes('id="displayHeadingLevel"'), "editor settings should have displayHeadingLevel switch");
assert.ok(editorConfig.includes("displayHeadingLevelTip"), "editor settings should reference displayHeadingLevelTip");
assert.ok(editorConfig.includes("displayHeadingLevel:"), "editor save should include displayHeadingLevel");
console.log("[settings-ui] displayHeadingLevel toggle and save ok");

// ---- i18n ----
const zhCN = JSON.parse(fs.readFileSync(path.join(appRoot, "appearance", "langs", "zh_CN.json"), "utf8"));
const enUS = JSON.parse(fs.readFileSync(path.join(appRoot, "appearance", "langs", "en_US.json"), "utf8"));
assert.ok(zhCN.displayHeadingLevel, "zh_CN should have displayHeadingLevel");
assert.ok(zhCN.displayHeadingLevelTip, "zh_CN should have displayHeadingLevelTip");
assert.ok(enUS.displayHeadingLevel, "en_US should have displayHeadingLevel");
assert.ok(enUS.displayHeadingLevelTip, "en_US should have displayHeadingLevelTip");
console.log("[i18n] zh_CN and en_US labels ok");

// ---- Search index ----
const searchTs = readSrc("config", "search.ts");
assert.ok(searchTs.includes("displayHeadingLevel"), "search index should include displayHeadingLevel");
assert.ok(searchTs.includes("displayHeadingLevelTip"), "search index should include displayHeadingLevelTip");
console.log("[search-index] displayHeadingLevel entries ok");

// ---- hideElements logic ----
const hideElementsSource = readSrc("protyle", "ui", "hideElements.ts");

// Test: "gutter" panel → should add fn__none and clear innerHTML
{
    const compiled = compileModule(hideElementsSource, {
        window: {sourceflow: {}},
        document: {querySelectorAll: () => []},
    });
    const protyle = createMockProtyle();
    compiled.hideElements(["gutter"], protyle);
    assert.ok(protyle.gutter.element._classes.has("fn__none"),
        "gutter should be hidden (fn__none) when panel=gutter");
    assert.strictEqual(protyle.gutter.element.innerHTML, "",
        "gutter innerHTML should be cleared when panel=gutter");
    console.log("[hideElements] gutter hidden and cleared when panel=gutter");
}

// Test: "gutterOnly" panel → should add fn__none and clear innerHTML
{
    const compiled = compileModule(hideElementsSource, {
        window: {sourceflow: {}},
        document: {querySelectorAll: () => []},
    });
    const protyle = createMockProtyle();
    compiled.hideElements(["gutterOnly"], protyle);
    assert.ok(protyle.gutter.element._classes.has("fn__none"),
        "gutter should be hidden when panel=gutterOnly");
    assert.strictEqual(protyle.gutter.element.innerHTML, "",
        "gutter innerHTML should be cleared when panel=gutterOnly");
    console.log("[hideElements] gutter hidden when panel=gutterOnly");
}

// Test: non-gutter panels should be unaffected
{
    const compiled = compileModule(hideElementsSource, {
        window: {sourceflow: {}},
        document: {querySelectorAll: () => []},
    });
    const protyle = createMockProtyle();
    compiled.hideElements(["toolbar"], protyle);
    assert.ok(!protyle.gutter.element._classes.has("fn__none"),
        "gutter should be untouched when panel=toolbar");
    console.log("[hideElements] non-gutter panels leave gutter untouched");
}

// Test: hideAllElements hides gutter
{
    const mockGutterElements = [];
    const mockDoc = {
        querySelectorAll: (sel) => {
            if (sel === ".protyle-toolbar" || sel === ".pdf__util") return [];
            if (sel === ".protyle-gutters") return mockGutterElements;
            return [];
        },
    };

    const compiled = compileModule(hideElementsSource, {
        window: {sourceflow: {}},
        document: mockDoc,
    });

    const fakeGutter = createMockElement();
    mockGutterElements.push(fakeGutter);
    compiled.hideAllElements(["gutter"]);
    assert.ok(fakeGutter._classes.has("fn__none"),
        "hideAllElements should hide gutters");
    console.log("[hideAllElements] gutter hidden");
}

console.log("\n=== ALL TESTS PASSED ===");
