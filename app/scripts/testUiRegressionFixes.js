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

const escapeHTML = (value) => `${value || ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");

const fakeWindow = {
    sourceflow: {
        config: {
            lang: "zh_CN",
            readonly: false,
            system: {
                container: "desktop",
                osPlatform: "win32",
            },
        },
        isPublish: false,
    },
    open() {},
};

const compatibility = compileModule(path.join(srcRoot, "protyle", "util", "compatibility.ts"), {
    "./selection": {focusByRange() {}},
    "../../util/fetch": {fetchPost() {}, fetchSyncPost() {}},
    "../../constants": {Constants: {SOURCEFLOW_HTML_COMMENT_ATTR: "sourceflow"}},
    "../../search/getDefault": {getDefaultType: () => ({})},
    "electron": {ipcRenderer: {}},
}, {
    window: fakeWindow,
    navigator: {platform: "Win32", userAgent: ""},
    TextEncoder,
    TextDecoder,
});

assert.strictEqual(compatibility.updateHotkeyTip("⌘P/⌘K"), "Ctrl+P/Ctrl+K");
assert.strictEqual(compatibility.updateHotkeyTip("⌥⌘A/Shift+Click"), "Ctrl+Alt+A/Shift+Click");
assert.strictEqual(compatibility.updateHotkeyTip("⌃⇧⇥"), "Ctrl+Shift+Tab");

const renderAssets = compileModule(path.join(srcRoot, "asset", "renderAssets.ts"), {
    "../constants": {
        Constants: {
            SOURCEFLOW_ASSETS_IMAGE: [".png"],
            SOURCEFLOW_ASSETS_AUDIO: [".mp3"],
            SOURCEFLOW_ASSETS_VIDEO: [".mp4"],
            ZWSP: "\u200b",
        },
    },
    "../layout/getAll": {getAllModels: () => ({asset: []})},
    "../util/pathName": {pathPosix: () => path.posix},
    "dayjs": () => ({format: () => "20260527000000"}),
}, {
    Lute: {
        EscapeHTMLStr: escapeHTML,
        NewNodeID: () => "20260527000000-abcdefg",
    },
});

const specialHref = 'https://example.com/?q="x"&tag=<b>';
const specialText = 'name <b> & "quote"';
const linkHTML = renderAssets.genAssetHTML(".txt", specialHref, "", specialText);
assert(linkHTML.includes('data-href="https://example.com/?q=&quot;x&quot;&amp;tag=&lt;b&gt;"'));
assert(linkHTML.includes('name &lt;b&gt; &amp; &quot;quote&quot;'));
assert(!linkHTML.includes('data-href="https://example.com/?q="x"'));

const previewHTML = renderAssets.renderAssetsPreview(specialHref);
assert.strictEqual(previewHTML, "https://example.com/?q=&quot;x&quot;&amp;tag=&lt;b&gt;");

const linkMenuSource = fs.readFileSync(path.join(srcRoot, "menus", "protyleMenu", "inline", "link.ts"), "utf8");
assert(linkMenuSource.includes("genLinkText(linkAddress, true, true)"));
assert(!linkMenuSource.includes("decodeURIComponent(linkAddress.replace"));

const mainScss = fs.readFileSync(path.join(srcRoot, "assets", "scss", "main", "_main.scss"), "utf8");
assert(mainScss.includes(".sourceflow-zen-exit"));

const selectionBarSource = fs.readFileSync(path.join(srcRoot, "assistant", "inline", "selectionBar.ts"), "utf8");
assert(selectionBarSource.includes('document.removeEventListener("mousedown", onDocumentMouseDown)'));

let blockContent = "重复。重复。";
const updateCalls = [];
const translateReplace = compileModule(path.join(srcRoot, "assistant", "inline", "translateBubbleReplace.ts"), {
    "../../util/fetch": {
        fetchSyncPost: async (url, payload) => {
            if (url === "/api/block/getBlockInfo") {
                return {code: 0, data: {content: blockContent}};
            }
            updateCalls.push({url, payload});
            return {code: 0};
        },
    },
    "../../protyle/util/hasClosest": {
        hasClosestBlock: () => ({
            getAttribute: (name) => name === "data-node-id" ? "block-1" : "",
        }),
    },
    "../common/note": {
        invalidateAssistantNoteContextCache: () => undefined,
    },
}, {
    getSelection: () => null,
});

(async () => {
    const duplicateResult = await translateReplace.replaceCurrentSelection({
        protyle: {},
        range: {startContainer: {}},
        selectedText: "重复。",
    }, "改写。");
    assert.strictEqual(duplicateResult, false);
    assert.strictEqual(updateCalls.length, 0);

    blockContent = "唯一。";
    const uniqueResult = await translateReplace.replaceCurrentSelection({
        protyle: {},
        range: {startContainer: {}},
        selectedText: "唯一。",
    }, "改写。");
    assert.strictEqual(uniqueResult, true);
    assert.strictEqual(updateCalls.length, 1);
    assert.strictEqual(updateCalls[0].payload.data, "改写。");

    console.log("[ui-regression-fixes] ok");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
