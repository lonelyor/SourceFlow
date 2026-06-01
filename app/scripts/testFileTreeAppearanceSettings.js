const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const repoRoot = path.join(appRoot, "..");
const srcRoot = path.join(appRoot, "src");

const readApp = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), "utf8");
const readRepo = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), "utf8");

const appearanceGo = readRepo("kernel", "conf", "appearance.go");
const settingGo = readRepo("kernel", "api", "setting.go");
const modelConfGo = readRepo("kernel", "model", "conf.go");
const configTypes = readApp("src", "types", "config.d.ts");
const fileTreeAppearance = readApp("src", "appearance", "fileTreeAppearance.ts");
const appearanceRuntime = readApp("src", "config", "appearanceRuntime.ts");
const configSearch = readApp("src", "config", "search.ts");
const mainScss = readApp("src", "assets", "scss", "main", "_main.scss");
const navigationScss = readApp("src", "assets", "scss", "business", "_file-tree-navigation.scss");
const navigationTs = readApp("src", "layout", "dock", "fileTreeNavigation.ts");
const zhCN = JSON.parse(readApp("appearance", "langs", "zh_CN.json"));
const enUS = JSON.parse(readApp("appearance", "langs", "en_US.json"));

let testsPassed = 0;
let testsFailed = 0;

const test = (name, fn) => {
    try {
        fn();
        testsPassed++;
    } catch (e) {
        testsFailed++;
        console.error(`FAIL: ${name}`);
        console.error(`  ${e.message}`);
    }
};

test("Go appearance config defines safe doc tree font size defaults", () => {
    assert(appearanceGo.includes("DefaultFileTreeFontSize = 0"),
        "DefaultFileTreeFontSize should keep current theme default");
    assert(appearanceGo.includes("MinFileTreeFontSize") && appearanceGo.includes("MaxFileTreeFontSize"),
        "font size bounds should have a single backend source");
    assert(/FileTreeFontSize\s+int\s+`json:"fileTreeFontSize"`/.test(appearanceGo),
        "Appearance should persist fileTreeFontSize");
    assert(/FileTreeFontSize:\s+DefaultFileTreeFontSize/.test(appearanceGo),
        "NewAppearance should default fileTreeFontSize to 0");
});

test("Go setting path normalizes doc tree font size", () => {
    assert(settingGo.includes("normalizeAppearanceFileTreeFontSize"),
        "setAppearance should expose font size normalization");
    assert(settingGo.includes("appearance.FileTreeFontSize = normalizeAppearanceFileTreeFontSize(appearance.FileTreeFontSize)"),
        "setAppearance should normalize incoming fileTreeFontSize");
    assert(modelConfGo.includes("Conf.Appearance.FileTreeFontSize = conf.NormalizeFileTreeFontSize(Conf.Appearance.FileTreeFontSize)"),
        "InitConf should normalize persisted fileTreeFontSize");
});

test("TypeScript config and runtime expose doc tree font size setting", () => {
    assert(configTypes.includes("fileTreeFontSize: number"),
        "Config.IAppearance should type fileTreeFontSize");
    assert(fileTreeAppearance.includes("normalizeFileTreeFontSize"),
        "fileTreeAppearance should normalize fileTreeFontSize");
    assert(fileTreeAppearance.includes('setProperty(fileTreeFontSizeCSSVar, `${fontSize}px`)'),
        "fileTreeAppearance should apply the CSS variable when custom size is set");
    assert(fileTreeAppearance.includes("removeProperty(fileTreeFontSizeCSSVar)"),
        "fileTreeAppearance should remove the CSS variable for default size");
    assert(appearanceRuntime.includes('id="fileTreeFontSize"'),
        "appearance settings UI should render the fileTreeFontSize input");
    assert(appearanceRuntime.includes("fileTreeFontSize: normalizeFileTreeFontSize"),
        "appearance settings save should include normalized fileTreeFontSize");
});

test("Doc tree font size is searchable and localized", () => {
    assert(configSearch.includes('"fileTreeFontSize", "fileTreeFontSizeTip"'),
        "config search should include fileTreeFontSize labels");
    assert.strictEqual(typeof zhCN.fileTreeFontSize, "string");
    assert.strictEqual(typeof zhCN.fileTreeFontSizeTip, "string");
    assert.strictEqual(typeof enUS.fileTreeFontSize, "string");
    assert.strictEqual(typeof enUS.fileTreeFontSizeTip, "string");
});

test("SCSS consumes the doc tree font size variable without changing defaults", () => {
    assert(mainScss.includes("--sf-file-tree-font-size"),
        "main file tree rows should consume --sf-file-tree-font-size");
    assert(navigationScss.includes("--sf-file-tree-font-size"),
        "file tree navigation should consume --sf-file-tree-font-size");
    assert(navigationScss.includes("var(--sf-file-tree-font-size, 12px)"),
        "navigation fallback should preserve existing 12px labels");
});

test("Recent and frequent shortcut groups default collapsed only before user state exists", () => {
    assert(navigationTs.includes('DEFAULT_COLLAPSED_NAV_GROUPS = ["recent-edited", "frequent"]'),
        "default collapsed groups should include recent-edited and frequent");
    assert(navigationTs.includes("raw !== null"),
        "stored localStorage state should override the default collapsed groups");
    assert(navigationTs.includes("Array.isArray(parsed)"),
        "stored collapsed state should be validated before use");
});

if (testsFailed > 0) {
    console.error(`\n${testsFailed} test(s) FAILED, ${testsPassed} passed`);
    process.exit(1);
}

console.log(`\n${testsPassed} tests passed`);
