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

const createMockConfig = (overrides = {}) => ({
    editor: {
        displayHeadingLevel: true,
        ...overrides,
    },
});

const createMockElement = () => {
    const classes = new Set();
    return {
        _classes: classes,
        classList: {
            add(cls) { classes.add(cls); },
            remove(cls) { classes.delete(cls); },
            contains(cls) { return classes.has(cls); },
            toggle(cls, force) {
                if (force) classes.add(cls);
                else classes.delete(cls);
            },
        },
        innerHTML: "",
        style: {},
        querySelectorAll() { return []; },
        querySelector() { return null; },
        getAttribute() { return null; },
        setAttribute() {},
        removeAttribute() {},
    };
};

console.log("=== testStructureGuideBugfix ===\n");

// ============================================================
// BUG 1: CSS overflow-x:clip on .protyle-wysiwyg clips pseudo-elements
// ============================================================
console.log("--- Bug 1: CSS overflow-x clipping ---");

const scssContent = fs.readFileSync(
    path.join(appRoot, "src", "assets", "scss", "protyle", "_structure-guide.scss"), "utf8"
);

assert.ok(
    /overflow-x:\s*visible/.test(scssContent),
    "structure-guide.scss must have overflow-x: visible (either on .protyle-content or .protyle-wysiwyg)"
);
console.log("[scss] overflow-x: visible present to unclip pseudo-elements");

assert.ok(
    scssContent.includes(".protyle-content") && scssContent.includes("overflow-x: visible"),
    "structure-guide.scss must override overflow-x on .protyle-content to prevent parent clipping"
);
console.log("[scss] overflow-x override on .protyle-content for parent clip prevention");

// ============================================================
// BUG 1b: contain:layout on [data-node-id] conflicts with overflow:visible
// ============================================================
console.log("\n--- Bug 1b: contain property downgrade ---");

const wysiwygScss = fs.readFileSync(
    path.join(appRoot, "src", "assets", "scss", "protyle", "_wysiwyg.scss"), "utf8"
);

assert.ok(
    wysiwygScss.includes("contain: layout style"),
    "_wysiwyg.scss should still have contain:layout style as baseline"
);
console.log("[scss] baseline contain:layout style still present on [data-node-id]");

assert.ok(
    scssContent.includes("contain: style"),
    "structure-guide.scss must downgrade contain to 'style' for elements needing overflow:visible"
);
console.log("[scss] contain downgraded to 'style' on structure-guide targets");

assert.ok(
    !scssContent.includes("contain: layout"),
    "structure-guide.scss must NOT reintroduce contain:layout on overflow:visible elements"
);
console.log("[scss] no contain:layout in structure-guide overflow targets");

// ============================================================
// Regression: applyEditorStructureGuideClasses
// ============================================================
console.log("\n--- Regression: structureGuide module ---");

const structureGuideSource = readSrc("protyle", "util", "structureGuide.ts");

{
    const mockConfig = createMockConfig({
        displayHeadingLevel: true,
    });
    const mockWindow = {sourceflow: {config: mockConfig}};
    const compiled = compileModule(structureGuideSource, {window: mockWindow});
    const el = createMockElement();
    compiled.applyEditorStructureGuideClasses(el);

    assert.ok(el._classes.has("protyle-wysiwyg--heading-levels"),
        "should add --heading-levels when displayHeadingLevel=true");
    console.log("[structureGuide] heading-levels class added when enabled");
}

{
    const mockConfig = createMockConfig({
        displayHeadingLevel: false,
    });
    const mockWindow = {sourceflow: {config: mockConfig}};
    const compiled = compileModule(structureGuideSource, {window: mockWindow});
    const el = createMockElement();
    compiled.applyEditorStructureGuideClasses(el);

    assert.ok(!el._classes.has("protyle-wysiwyg--heading-levels"),
        "should NOT add --heading-levels when displayHeadingLevel=false");
    console.log("[structureGuide] heading-levels class removed when disabled");
}

{
    const mockConfig = createMockConfig({
        displayHeadingLevel: undefined,
    });
    const mockWindow = {sourceflow: {config: mockConfig}};
    const compiled = compileModule(structureGuideSource, {window: mockWindow});
    const el = createMockElement();
    compiled.applyEditorStructureGuideClasses(el);

    assert.ok(el._classes.has("protyle-wysiwyg--heading-levels"),
        "undefined displayHeadingLevel should still add --heading-levels (!== false)");
    console.log("[structureGuide] undefined heading level handled safely");
}

// ============================================================
// Regression: Go backend config
// ============================================================
console.log("\n--- Regression: Go backend config ---");

const editorGo = fs.readFileSync(path.join(appRoot, "..", "kernel", "conf", "editor.go"), "utf8");

assert.ok(/DisplayHeadingLevel:\s+true,/.test(editorGo),
    "DisplayHeadingLevel must default to true");
console.log("[go-config] DisplayHeadingLevel default correct");

const editorTestGo = fs.readFileSync(path.join(appRoot, "..", "kernel", "conf", "editor_test.go"), "utf8");
assert.ok(editorTestGo.includes("DisplayHeadingLevel"), "Go test covers DisplayHeadingLevel");
console.log("[go-test] DisplayHeadingLevel covered by existing test");

// ============================================================
// Bug 4: null safety - applyEditorStructureGuideClasses
// ============================================================
console.log("\n--- Bug 4: Null safety ---");

assert.ok(
    structureGuideSource.includes("getEditorConfig") && structureGuideSource.includes("window.sourceflow?.config?.editor"),
    "structureGuide must export getEditorConfig with optional chaining"
);
console.log("[null-safety] structureGuide exports null-safe getEditorConfig");

{
    const mockWindow = {sourceflow: {config: {editor: null}}};
    const compiled = compileModule(structureGuideSource, {window: mockWindow});
    const el = createMockElement();
    let threw = false;
    try {
        compiled.applyEditorStructureGuideClasses(el);
    } catch (e) {
        threw = true;
    }
    assert.ok(!threw, "applyEditorStructureGuideClasses must not throw when editor is null");
    assert.ok(!el._classes.has("protyle-wysiwyg--heading-levels"),
        "no classes added when editor config is null");
    console.log("[null-safety] structureGuide survives null editor config");
}

// ============================================================
// Regression: i18n keys present
// ============================================================
console.log("\n--- Regression: i18n keys ---");

const zhCN = JSON.parse(fs.readFileSync(path.join(appRoot, "appearance", "langs", "zh_CN.json"), "utf8"));
const enUS = JSON.parse(fs.readFileSync(path.join(appRoot, "appearance", "langs", "en_US.json"), "utf8"));

const i18nKeys = [
    "displayHeadingLevel", "displayHeadingLevelTip",
];
for (const key of i18nKeys) {
    assert.ok(zhCN[key], `zh_CN must have ${key}`);
    assert.ok(enUS[key], `en_US must have ${key}`);
}
console.log("[i18n] all keys present in zh_CN and en_US");

// ============================================================
// Regression: Desktop settings save displayHeadingLevel
// ============================================================
console.log("\n--- Regression: Desktop settings save ---");

const desktopEditorSource = readSrc("config", "editor.ts");
assert.ok(
    desktopEditorSource.includes('id="displayHeadingLevel"'),
    "desktop editor settings must have #displayHeadingLevel switch"
);
assert.ok(
    desktopEditorSource.includes("displayHeadingLevel:"),
    "desktop editor setEditor must include displayHeadingLevel in save payload"
);
console.log("[desktop-settings] displayHeadingLevel UI and save present");

// ============================================================
// Regression: config.d.ts type declarations
// ============================================================
console.log("\n--- Regression: TypeScript types ---");

const configTypes = readSrc("types", "config.d.ts");
const headingRegex = /displayHeadingLevel:\s*boolean/;
assert.ok(headingRegex.test(configTypes), "config.d.ts must declare displayHeadingLevel: boolean");
console.log("[ts-types] displayHeadingLevel boolean field declared");

// ============================================================
// Regression: search index includes relevant keys
// ============================================================
console.log("\n--- Regression: Search index ---");

const searchTs = readSrc("config", "search.ts");
for (const key of i18nKeys) {
    assert.ok(searchTs.includes(key), `search index must include ${key}`);
}
console.log("[search-index] all i18n keys indexed");

console.log("\n=== ALL TESTS PASSED ===");
