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

const createMockConfig = (alwaysShowGutter) => ({
    editor: {alwaysShowGutter},
});

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
assert.ok(editorGo.includes("AlwaysShowGutter") && editorGo.includes("alwaysShowGutter"), "Editor should have AlwaysShowGutter field and JSON tag");
assert.ok(/AlwaysShowGutter:\s+false,/.test(editorGo), "AlwaysShowGutter should default to false in NewEditor");
console.log("[go-config] AlwaysShowGutter field, JSON tag, and default ok");

// ---- TypeScript type ----
const configTypes = readSrc("types", "config.d.ts");
assert.ok(configTypes.includes("alwaysShowGutter: boolean"), "config.d.ts should have alwaysShowGutter boolean");
console.log("[ts-type] alwaysShowGutter type declaration ok");

// ---- Settings UI ----
const editorConfig = readSrc("config", "editor.ts");
assert.ok(editorConfig.includes('id="alwaysShowGutter"'), "editor settings should have alwaysShowGutter switch");
assert.ok(editorConfig.includes("alwaysShowGutterTip"), "editor settings should reference alwaysShowGutterTip");
assert.ok(editorConfig.includes("alwaysShowGutter:"), "editor save should include alwaysShowGutter");
console.log("[settings-ui] alwaysShowGutter toggle and save ok");

// ---- i18n ----
const zhCN = JSON.parse(fs.readFileSync(path.join(appRoot, "appearance", "langs", "zh_CN.json"), "utf8"));
const enUS = JSON.parse(fs.readFileSync(path.join(appRoot, "appearance", "langs", "en_US.json"), "utf8"));
assert.ok(zhCN.alwaysShowGutter, "zh_CN should have alwaysShowGutter");
assert.ok(zhCN.alwaysShowGutterTip, "zh_CN should have alwaysShowGutterTip");
assert.ok(enUS.alwaysShowGutter, "en_US should have alwaysShowGutter");
assert.ok(enUS.alwaysShowGutterTip, "en_US should have alwaysShowGutterTip");
console.log("[i18n] zh_CN and en_US labels ok");

// ---- Search index ----
const searchTs = readSrc("config", "search.ts");
assert.ok(searchTs.includes("alwaysShowGutter"), "search index should include alwaysShowGutter");
assert.ok(searchTs.includes("alwaysShowGutterTip"), "search index should include alwaysShowGutterTip");
console.log("[search-index] alwaysShowGutter entries ok");

// ---- hideElements logic ----
const hideElementsSource = readSrc("protyle", "ui", "hideElements.ts");
assert.ok(hideElementsSource.includes("isGutterAlwaysShow"), "hideElements should use isGutterAlwaysShow helper");

// Test: alwaysShowGutter=false, "gutter" panel → should add fn__none
{
    const mockConfig = createMockConfig(false);
    const mockWindow = {sourceflow: {config: mockConfig}};
    const compiled = compileModule(hideElementsSource, {
        window: mockWindow,
        document: {querySelectorAll: () => []},
    });
    const protyle = createMockProtyle();
    compiled.hideElements(["gutter"], protyle);
    assert.ok(protyle.gutter.element._classes.has("fn__none"),
        "gutter should be hidden (fn__none) when alwaysShowGutter=false and panel=gutter");
    assert.strictEqual(protyle.gutter.element.innerHTML, "",
        "gutter innerHTML should be cleared when alwaysShowGutter=false and panel=gutter");
    console.log("[hideElements] gutter hidden when alwaysShowGutter=false, panel=gutter");
}

// Test: alwaysShowGutter=true, "gutter" panel → should NOT add fn__none but clear innerHTML
{
    const mockConfig = createMockConfig(true);
    const mockWindow = {sourceflow: {config: mockConfig}};
    const compiled = compileModule(hideElementsSource, {
        window: mockWindow,
        document: {querySelectorAll: () => []},
    });
    const protyle = createMockProtyle();
    compiled.hideElements(["gutter"], protyle);
    assert.ok(!protyle.gutter.element._classes.has("fn__none"),
        "gutter should NOT be hidden when alwaysShowGutter=true and panel=gutter");
    assert.strictEqual(protyle.gutter.element.innerHTML, "",
        "gutter innerHTML should be cleared when alwaysShowGutter=true and panel=gutter");
    console.log("[hideElements] gutter content cleared but stays visible when alwaysShowGutter=true, panel=gutter");
}

// Test: alwaysShowGutter=false, "gutterOnly" panel → should add fn__none
{
    const mockConfig = createMockConfig(false);
    const mockWindow = {sourceflow: {config: mockConfig}};
    const compiled = compileModule(hideElementsSource, {
        window: mockWindow,
        document: {querySelectorAll: () => []},
    });
    const protyle = createMockProtyle();
    compiled.hideElements(["gutterOnly"], protyle);
    assert.ok(protyle.gutter.element._classes.has("fn__none"),
        "gutter should be hidden when alwaysShowGutter=false and panel=gutterOnly");
    assert.strictEqual(protyle.gutter.element.innerHTML, "",
        "gutter innerHTML should be cleared when alwaysShowGutter=false and panel=gutterOnly");
    console.log("[hideElements] gutter hidden when alwaysShowGutter=false, panel=gutterOnly");
}

// Test: alwaysShowGutter=true, "gutterOnly" panel → should NOT hide or clear
{
    const mockConfig = createMockConfig(true);
    const mockWindow = {sourceflow: {config: mockConfig}};
    const compiled = compileModule(hideElementsSource, {
        window: mockWindow,
        document: {querySelectorAll: () => []},
    });
    const protyle = createMockProtyle();
    const originalHTML = protyle.gutter.element.innerHTML;
    compiled.hideElements(["gutterOnly"], protyle);
    assert.ok(!protyle.gutter.element._classes.has("fn__none"),
        "gutter should NOT be hidden when alwaysShowGutter=true and panel=gutterOnly");
    assert.strictEqual(protyle.gutter.element.innerHTML, originalHTML,
        "gutter innerHTML should be preserved when alwaysShowGutter=true and panel=gutterOnly");
    console.log("[hideElements] gutter fully preserved when alwaysShowGutter=true, panel=gutterOnly");
}

// Test: non-gutter panels should be unaffected
{
    const mockConfig = createMockConfig(true);
    const mockWindow = {sourceflow: {config: mockConfig}};
    const compiled = compileModule(hideElementsSource, {
        window: mockWindow,
        document: {querySelectorAll: () => []},
    });
    const protyle = createMockProtyle();
    compiled.hideElements(["toolbar"], protyle);
    assert.ok(!protyle.gutter.element._classes.has("fn__none"),
        "gutter should be untouched when panel=toolbar");
    console.log("[hideElements] non-gutter panels leave gutter untouched");
}

// Test: hideAllElements respects alwaysShowGutter
{
    const mockConfig = createMockConfig(true);
    const mockWindow = {sourceflow: {config: mockConfig}};
    const mockGutterElements = [];
    const mockDoc = {
        querySelectorAll: (sel) => {
            if (sel === ".protyle-toolbar" || sel === ".pdf__util") return [];
            if (sel === ".protyle-gutters") return mockGutterElements;
            return [];
        },
    };

    const compiled = compileModule(hideElementsSource, {
        window: mockWindow,
        document: mockDoc,
    });

    const fakeGutter = createMockElement();
    mockGutterElements.push(fakeGutter);
    compiled.hideAllElements(["gutter"]);
    assert.ok(!fakeGutter._classes.has("fn__none"),
        "hideAllElements should NOT hide gutters when alwaysShowGutter=true");
    console.log("[hideAllElements] gutter preserved when alwaysShowGutter=true");
}

// Test: hideAllElements hides when alwaysShowGutter=false
{
    const mockConfig = createMockConfig(false);
    const mockWindow = {sourceflow: {config: mockConfig}};
    const mockGutterElements = [];
    const mockDoc = {
        querySelectorAll: (sel) => {
            if (sel === ".protyle-toolbar" || sel === ".pdf__util") return [];
            if (sel === ".protyle-gutters") return mockGutterElements;
            return [];
        },
    };

    const compiled = compileModule(hideElementsSource, {
        window: mockWindow,
        document: mockDoc,
    });

    const fakeGutter = createMockElement();
    mockGutterElements.push(fakeGutter);
    compiled.hideAllElements(["gutter"]);
    assert.ok(fakeGutter._classes.has("fn__none"),
        "hideAllElements should hide gutters when alwaysShowGutter=false");
    console.log("[hideAllElements] gutter hidden when alwaysShowGutter=false");
}

// ---- Block number positioning ----
const structureGuideSCSS = fs.readFileSync(
    path.join(appRoot, "src", "assets", "scss", "protyle", "_structure-guide.scss"), "utf8"
);
assert.ok(!structureGuideSCSS.includes("display: inline-flex"),
    "block numbers should no longer use inline-flex");
assert.ok(!structureGuideSCSS.includes("background-color:"),
    "block numbers should no longer have background");
assert.ok(!structureGuideSCSS.includes("border:"),
    "block numbers should no longer have border");
assert.ok(structureGuideSCSS.includes("position: absolute"),
    "block numbers should use absolute positioning");
assert.ok(structureGuideSCSS.includes("right: calc(100% + 4px)"),
    "block numbers should be positioned to the left of content");
assert.ok(structureGuideSCSS.includes("position: relative"),
    "[spellcheck] should have position: relative for ::before anchor");
assert.ok(structureGuideSCSS.includes("text-align: right"),
    "block numbers should be right-aligned");
assert.ok(structureGuideSCSS.includes("white-space: nowrap"),
    "block numbers should not wrap");
assert.ok(structureGuideSCSS.includes("max-width:"),
    "block numbers should have max-width to prevent overflow");
assert.ok(structureGuideSCSS.includes("text-overflow: ellipsis"),
    "block numbers should ellipsis on overflow");
console.log("[scss] block numbers positioned in left margin, inline badge styles removed");

// ---- Global events respect config ----
const globalEventTs = readSrc("boot", "globalEvent", "event.ts");
assert.ok(globalEventTs.includes("alwaysShowGutter"),
    "global event.ts should check alwaysShowGutter config");
const mousemoveTs = readSrc("boot", "globalEvent", "mousemove.ts");
assert.ok(mousemoveTs.includes("alwaysShowGutter"),
    "mousemove.ts should check alwaysShowGutter config");
console.log("[global-events] mouseleave and mousemove respect alwaysShowGutter config");

console.log("\n=== ALL TESTS PASSED ===");
