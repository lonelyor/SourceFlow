const assert = require("assert");
const fs = require("fs");
const path = require("path");

const srcRoot = path.join(__dirname, "..", "src");

const contentSource = fs.readFileSync(path.join(srcRoot, "menus", "protyleMenu", "content.ts"), "utf8");
const keymapTsSource = fs.readFileSync(path.join(srcRoot, "config", "keymap.ts"), "utf8");
const constantsSource = fs.readFileSync(path.join(srcRoot, "constants.ts"), "utf8");

const INLINE_FORMAT_KEYMAP_KEYS = [
    "bold",
    "italic",
    "underline",
    "strike",
    "kbd",
    "mark",
    "sup",
    "sub",
    "clearInline",
];

const INLINE_CODE_KEYMAP_KEY = "inline-code";

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

test("INLINE_FORMAT_KEYMAP_KEYS: all dot-notation keys exist in SOURCEFLOW_KEYMAP.editor.insert", () => {
    for (const key of INLINE_FORMAT_KEYMAP_KEYS) {
        const pattern = `${key}:`;
        assert(constantsSource.includes(`${key}: {default:`) || constantsSource.includes(`"${key}": {default:`),
            `Key "${key}" not found in SOURCEFLOW_KEYMAP.editor.insert. Check constants.ts`);
    }
});

test("INLINE_CODE_KEYMAP_KEY: bracket-notation key exists in SOURCEFLOW_KEYMAP.editor.insert", () => {
    assert(constantsSource.includes(`"${INLINE_CODE_KEYMAP_KEY}": {default:`),
        `Key "${INLINE_CODE_KEYMAP_KEY}" not found in SOURCEFLOW_KEYMAP.editor.insert`);
});

test("content.ts: no reference to non-existent keymap.editor.insert.strong", () => {
    assert(!contentSource.includes("editor.insert.strong"),
        "content.ts still references editor.insert.strong (should be editor.insert.bold)");
});

test("content.ts: no reference to keymap.editor.insert.code (should be inline-code)", () => {
    const badPattern = "editor.insert.code.custom";
    assert(!contentSource.includes(badPattern),
        `content.ts contains "${badPattern}" — use editor.insert["inline-code"] instead`);
});

test("content.ts: all inline format accelerator keys use correct keymap paths", () => {
    for (const key of INLINE_FORMAT_KEYMAP_KEYS) {
        assert(contentSource.includes(`editor.insert.${key}.custom`),
            `content.ts missing accelerator for editor.insert.${key}.custom`);
    }
});

test("content.ts: inline-code uses bracket notation", () => {
    assert(contentSource.includes(`editor.insert["${INLINE_CODE_KEYMAP_KEY}"].custom`),
        `content.ts should use editor.insert["${INLINE_CODE_KEYMAP_KEY}"].custom for inline-code`);
});

test("keymap.ts: plugin keymap access uses optional chaining", () => {
    const dangerousPattern = "config.keymap.plugin[item.name][toolbarItem.name]";
    const safePattern = "config.keymap.plugin?.[item.name]";
    assert(!keymapTsSource.includes(dangerousPattern),
        `keymap.ts still has unsafe plugin access: ${dangerousPattern}`);
    assert(keymapTsSource.includes(safePattern),
        `keymap.ts should use safe plugin access with optional chaining`);
});

test("keymap.ts: dock keymap access is guarded by null check", () => {
    const dockUnsafePattern = "config.keymap.plugin[item.name][key]";
    assert(!keymapTsSource.includes(dockUnsafePattern),
        `keymap.ts still has unsafe dock keymap access: ${dockUnsafePattern}`);
});

test("keymap.ts: toolbarItem forEach uses early return when dockKeymap is missing", () => {
    assert(keymapTsSource.includes("if (!dockKeymap)"),
        "keymap.ts should guard against missing dockKeymap entries");
});

test("SOURCEFLOW_KEYMAP: editor.insert has all keys used by content.ts inline format menu", () => {
    const allRequiredKeys = [...INLINE_FORMAT_KEYMAP_KEYS, INLINE_CODE_KEYMAP_KEY];
    const insertStart = constantsSource.indexOf("insert: {");
    const headingStart = constantsSource.indexOf("heading: {");
    const insertSection = constantsSource.substring(insertStart, headingStart);
    for (const key of allRequiredKeys) {
        const keyPattern = key.includes("-") ? `"${key}":` : `${key}:`;
        assert(insertSection.includes(keyPattern),
            `SOURCEFLOW_KEYMAP.editor.insert missing required key: "${key}"`);
    }
});

test("SOURCEFLOW_KEYMAP: editor.general has openInNewTab key (used in Panel.ts)", () => {
    assert(constantsSource.includes("openInNewTab:"),
        "SOURCEFLOW_KEYMAP.editor.general missing openInNewTab");
});

test("SOURCEFLOW_KEYMAP: editor.insert has no 'strong' key (should be 'bold')", () => {
    const insertSection = constantsSource
        .substring(
            constantsSource.indexOf("insert: {"),
            constantsSource.indexOf("heading: {")
        );
    assert(!insertSection.includes("strong:"),
        "SOURCEFLOW_KEYMAP.editor.insert should not have 'strong' key (use 'bold' instead)");
});

test("SOURCEFLOW_KEYMAP: editor.general has no 'code' key in insert section (use 'inline-code' or 'code')", () => {
    const insertSection = constantsSource
        .substring(
            constantsSource.indexOf("insert: {"),
            constantsSource.indexOf("heading: {")
        );
    assert(insertSection.includes("code:"),
        "SOURCEFLOW_KEYMAP.editor.insert should have 'code' key for code block shortcut");
    assert(insertSection.includes('"inline-code":'),
        "SOURCEFLOW_KEYMAP.editor.insert should have 'inline-code' key");
});

test("content.ts: insertBlockTemplate function exists", () => {
    assert(contentSource.includes("const insertBlockTemplate ="),
        "content.ts should define insertBlockTemplate for block insertion menu");
});

test("keymap.ts: genHTML wraps plugin access in try-catch or optional chaining", () => {
    const pluginKeymapVar = "pluginKeymap";
    assert(keymapTsSource.includes(pluginKeymapVar),
        "keymap.ts genHTML should extract plugin keymap to a local variable with optional chaining");
    assert(keymapTsSource.includes("pluginKeymap?.["),
        "keymap.ts genHTML should use optional chaining for pluginKeymap access");
});

test("content.ts: insertBlock menu appears before formatInline menu", () => {
    const insertPos = contentSource.indexOf("insertBlock");
    const formatPos = contentSource.indexOf("formatInline");
    assert(insertPos > 0 && formatPos > 0, "both menus should exist");
    assert(insertPos < formatPos, "insertBlock menu should appear before formatInline menu");
});

test("genLinkText: does not decode percent-encoded URLs", () => {
    const utilSource = fs.readFileSync(path.join(srcRoot, "protyle", "toolbar", "util.ts"), "utf8");
    assert(!utilSource.includes("decodeURIComponent"), "genLinkText should not use decodeURIComponent");
});

test("genLinkText: truncation guards against splitting multi-byte and percent sequences", () => {
    const utilSource = fs.readFileSync(path.join(srcRoot, "protyle", "toolbar", "util.ts"), "utf8");
    const genLinkFn = utilSource.substring(
        utilSource.indexOf("export const genLinkText"),
        utilSource.indexOf("};", utilSource.indexOf("export const genLinkText")) + 2
    );
    assert(genLinkFn.includes("truncated.endsWith"), "truncation should check for dangling percent sign");
});

test("link.ts: auto-fill anchor uses textContent instead of innerHTML", () => {
    const linkMenuSource = fs.readFileSync(path.join(srcRoot, "menus", "protyleMenu", "inline", "link.ts"), "utf8");
    const autoFillBlock = linkMenuSource.substring(
        linkMenuSource.indexOf("!anchor && linkAddress"),
        linkMenuSource.indexOf("inputElements[1].value = anchor")
    );
    assert(!autoFillBlock.includes("innerHTML = Lute.EscapeHTMLStr"), "auto-fill should use textContent, not innerHTML with Lute.EscapeHTMLStr");
});

test("fileTreeAppearance.ts: applyFileTreeHighlightColor function exists", () => {
    const ftSource = fs.readFileSync(path.join(srcRoot, "appearance", "fileTreeAppearance.ts"), "utf8");
    assert(ftSource.includes("applyFileTreeHighlightColor"), "should export applyFileTreeHighlightColor");
    assert(ftSource.includes("--sf-file-tree-active-bg"), "should set CSS variable --sf-file-tree-active-bg");
});

test("_main.scss: file-tree highlight uses CSS variable fallback", () => {
    const scssSource = fs.readFileSync(path.join(srcRoot, "assets", "scss", "main", "_main.scss"), "utf8");
    assert(scssSource.includes("var(--sf-file-tree-active-bg"), "CSS should use --sf-file-tree-active-bg variable");
});

if (testsFailed > 0) {
    console.error(`\n${testsFailed} test(s) FAILED, ${testsPassed} passed`);
    process.exit(1);
} else {
    console.log(`[keymap-consistency] ${testsPassed} tests passed`);
}
