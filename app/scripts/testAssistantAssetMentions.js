const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

// R7 期一：@ 引用与来源面板支持附件（asset）——前端接线
// （plans/20260915-附件引用与OCR来源设计.md §2.1 第一期）
// 1. 候选列表：type==="asset" 用文件类型图标（图片 #iconImage / 文档 #iconFile），副行显示 hPath。
// 2. 来源面板：asset 渲染为叶子（无展开箭头），文件图标+文件名，副行 hPath，勾选/排除复用 included 流程。
// 3. prompt 上下文：resolveSourcesForPrompt 对 asset 来源生成明确元数据段，并附「元数据引用、
//    看图需开启（第二期）」的 AI 指令文本。
// 4. 附件逻辑仅落在 mentions/ 与 sources/ 内，ai/ 沿用通用 resolveSourcesForPrompt/buildIncludedContextText。

const srcRoot = path.join(__dirname, "..", "src");

// 依赖替身：src/constants.ts（assistant/constants.ts 的上游）、mentions/api.ts、dialog/message.ts。
const stubs = new Map([
    [path.join(srcRoot, "constants.ts"), {Constants: {SOURCEFLOW_APPID: "sourceflow"}}],
    [path.join(srcRoot, "dialog", "message.ts"), {showMessage: () => {}}],
    [path.join(srcRoot, "assistant", "mentions", "api.ts"), {
        searchMentionItems: async () => [],
        buildContextPack: async () => ({items: [], dropped: [], truncated: false}),
    }],
]);

const cache = new Map();

const loadModule = (relPath) => {
    const abs = path.join(srcRoot, relPath);
    if (stubs.has(abs)) {
        return stubs.get(abs);
    }
    if (cache.has(abs)) {
        return cache.get(abs);
    }
    const source = fs.readFileSync(abs, "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: relPath,
    });
    const moduleObj = {exports: {}};
    cache.set(abs, moduleObj.exports);
    const localRequire = (id) => {
        if (!id.startsWith(".")) {
            throw new Error(`unexpected bare require: ${id} in ${relPath}`);
        }
        const resolvedBase = path.normalize(path.join(path.dirname(abs), id));
        for (const candidate of [resolvedBase, `${resolvedBase}.ts`]) {
            if (stubs.has(candidate)) {
                return stubs.get(candidate);
            }
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return loadModule(path.relative(srcRoot, candidate));
            }
        }
        throw new Error(`unresolved require: ${id} from ${relPath}`);
    };
    vm.runInNewContext(compiled.outputText, {
        module: moduleObj,
        exports: moduleObj.exports,
        require: localRequire,
        console,
        navigator: {language: "zh_CN"},
        window: {sourceflow: {config: {lang: "zh_CN"}}},
    }, {filename: relPath});
    return moduleObj.exports;
};

const readSource = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

const test = (name, fn) => {
    try {
        fn();
        console.log(`[assistant-asset-mentions] ok - ${name}`);
    } catch (error) {
        console.error(`[assistant-asset-mentions] failed - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

const assetModule = loadModule(path.join("assistant", "mentions", "asset.ts"));
const triggerModule = loadModule(path.join("assistant", "mentions", "trigger.ts"));
const panelModule = loadModule(path.join("assistant", "sources", "panel.ts"));
const contextBuilderModule = loadModule(path.join("assistant", "mentions", "contextBuilder.ts"));

// --- 1. asset.ts helper ------------------------------------------------------
test("asset helper distinguishes image vs document assets", () => {
    assert.strictEqual(assetModule.isImageAssetName("foo.png"), true);
    assert.strictEqual(assetModule.isImageAssetName("pic.JPEG"), true);
    assert.strictEqual(assetModule.isImageAssetName("screenshot.webp"), true);
    assert.strictEqual(assetModule.isImageAssetName("spec.pdf"), false);
    assert.strictEqual(assetModule.isImageAssetName("data.csv"), false);
    assert.strictEqual(assetModule.isImageAssetName(undefined), false);
});

test("asset helper renders in-repo svg icons (iconImage/iconFile)", () => {
    const imageIcon = assetModule.renderAssetTypeIcon("foo.png");
    assert.ok(imageIcon.includes("#iconImage"), "image asset must use #iconImage");
    assert.ok(imageIcon.includes('width="14"'), "svg must carry inline sizing (no new SCSS)");
    const fileIcon = assetModule.renderAssetTypeIcon("spec.pdf");
    assert.ok(fileIcon.includes("#iconFile"), "document asset must use #iconFile");
    assert.ok(!fileIcon.includes("#iconImage"));
});

// --- 2. 候选列表（mention popover）--------------------------------------------
test("popover renders asset candidates with file-type icons and hPath subtitle", () => {
    const popover = triggerModule.renderMentionPopover({
        active: true,
        query: "foo",
        selectedIndex: 0,
        seq: 1,
        anchorRect: null,
        results: [
            {id: "assets/foo.png", type: "asset", title: "foo.png", hPath: "assets"},
            {id: "assets/spec.pdf", type: "asset", title: "spec.pdf", hPath: "研究/assets"},
            {id: "20260915-note", type: "note", title: "普通笔记", hPath: "/"},
        ],
    });
    assert.ok(popover.includes("#iconImage"), "png candidate must show image icon");
    assert.ok(popover.includes("#iconFile"), "pdf candidate must show file icon");
    assert.ok(popover.includes('<span class="assistant-ai__mention-subtitle">assets</span>'),
        "asset subtitle must show hPath");
    assert.ok(popover.includes('<span class="assistant-ai__mention-subtitle">研究/assets</span>'),
        "asset subtitle must show notebook-prefixed hPath");
    assert.ok(!popover.includes("📎"), "asset emoji placeholder must be replaced by file icons");
    assert.ok(popover.includes("普通笔记"), "note candidates keep rendering");
    assert.ok(popover.includes('data-action="select-mention"'), "asset candidates stay selectable");
});

// --- 3. 来源面板（sources panel）----------------------------------------------
test("sources panel renders assets as leaves with file icon and hPath subline", () => {
    const html = panelModule.renderSourcesPanel([
        {id: "assets/foo.png", type: "asset", title: "foo.png", hPath: "assets", included: true},
        {id: "assets/spec.pdf", type: "asset", title: "spec.pdf", hPath: "研究/assets", included: true},
        {
            id: "folder-1", type: "folder", title: "文件夹", included: true, expanded: false,
            children: [{id: "note-1", type: "note", title: "子笔记", included: true}],
        },
    ]);
    assert.ok(html.includes("#iconImage"), "image asset row must show image icon");
    assert.ok(html.includes("#iconFile"), "document asset row must show file icon");
    assert.ok(html.includes('<span class="assistant-ai__mention-subtitle" data-role="source-asset-path">assets</span>'),
        "asset row must carry hPath subline");
    assert.ok(html.includes(">研究/assets</span>"), "asset subline shows notebook-prefixed hPath");
    assert.ok(!html.includes("📎"), "asset emoji placeholder must be replaced by file icons");
    // 叶子：只有文件夹产生展开按钮（asset 即使被误塞 children 也不渲染展开箭头）。
    assert.strictEqual(html.split("toggle-source-expand").length - 1, 1,
        "only the folder row may render an expand button");
    // 勾选/排除复用现有 included 流程，无特判。
    assert.strictEqual(html.split('data-action="toggle-source"').length - 1, 3,
        "asset rows reuse the generic toggle-source checkbox");
    const excluded = panelModule.renderSourcesPanel([
        {id: "assets/foo.png", type: "asset", title: "foo.png", hPath: "assets", included: false},
    ]);
    assert.ok(excluded.includes("assistant-ai__source-item--excluded"), "excluded asset keeps excluded style");
});

// --- 4. prompt 上下文（asset 元数据段 + AI 指令）-------------------------------
test("resolveSourcesForPrompt requests pack for asset sources and emits metadata segment", async () => {
    const apiStub = stubs.get(path.join(srcRoot, "assistant", "mentions", "api.ts"));
    let packRequest = null;
    apiStub.buildContextPack = async (items) => {
        packRequest = items;
        return {
            items: [{
                type: "asset",
                id: "assets/foo.png",
                title: "foo.png",
                hPath: "assets",
                notebook: "研究笔记",
                summary: "文件名：foo.png\n类型：image/png\n大小：12 KB",
            }],
            dropped: [],
            truncated: false,
        };
    };
    const resolved = await contextBuilderModule.resolveSourcesForPrompt([
        {id: "assets/foo.png", type: "asset", title: "foo.png", hPath: "assets", notebook: "研究笔记", included: true},
    ], "default");
    assert.ok(packRequest, "asset-only sources must still trigger context pack resolution");
    assert.strictEqual(packRequest[0].type, "asset", "pack request must carry the asset item");
    const summary = resolved[0].summary;
    assert.ok(summary.startsWith("- 附件：foo.png（图片，位于 assets/，所属 研究笔记）"),
        `metadata line must match the contract, got: ${summary}`);
    assert.ok(summary.includes("说明：该附件为元数据引用，图片内容需用户开启看图后方可分析（第二期）。"),
        "AI instruction about metadata-only reference must be present");
    assert.ok(summary.includes("文件名：foo.png"), "backend metadata content must be preserved");
});

test("buildAssetSourceSummary labels documents and stays idempotent", async () => {
    const docSummary = contextBuilderModule.buildAssetSourceSummary({
        id: "assets/spec.pdf", type: "asset", title: "spec.pdf", hPath: "assets", included: true,
    });
    assert.ok(docSummary.startsWith("- 附件：spec.pdf（文档，位于 assets/）"), `got: ${docSummary}`);
    assert.ok(docSummary.includes("该附件为元数据引用"));
    assert.ok(!docSummary.includes("所属"), "no owner clause when notebook is absent");

    const apiStub = stubs.get(path.join(srcRoot, "assistant", "mentions", "api.ts"));
    apiStub.buildContextPack = async () => ({items: [], dropped: [], truncated: false});
    const annotated = {
        id: "assets/foo.png", type: "asset", title: "foo.png", hPath: "assets", included: true,
        summary: "- 附件：foo.png（图片，位于 assets/）\n说明：该附件为元数据引用，图片内容需用户开启看图后方可分析（第二期）。",
    };
    const twice = await contextBuilderModule.resolveSourcesForPrompt([annotated], "default");
    assert.strictEqual(twice[0].summary, annotated.summary, "annotation must not duplicate the metadata note");

    // 非 asset 来源与排除的 asset 不被追加元数据段。
    const mixed = await contextBuilderModule.resolveSourcesForPrompt([
        {id: "note-1", type: "note", title: "普通笔记", included: true, summary: "普通摘要"},
        {id: "assets/skip.png", type: "asset", title: "skip.png", hPath: "assets", included: false},
    ], "default");
    assert.strictEqual(mixed[0].summary, "普通摘要", "note summaries must stay untouched");
    assert.strictEqual(mixed[1].summary, undefined, "excluded assets must not be annotated");
});

// --- 5. 无越界改动：附件逻辑只落在 mentions/ 与 sources/ ------------------------
test("asset wiring stays inside mentions/ and sources/ (ai/ keeps generic flow)", () => {
    const messageSource = readSource("assistant", "ai", "AIDockMessage.ts");
    const agentSource = readSource("assistant", "ai", "AIDockAgent.ts");
    for (const source of [messageSource, agentSource]) {
        assert.ok(!source.includes("mentions/asset"), "ai/ must not import the asset helper directly");
        assert.ok(!source.includes("buildAssetSourceSummary"), "ai/ must not special-case asset summaries");
        assert.ok(!source.includes("renderAssetTypeIcon"), "ai/ must not special-case asset icons");
    }
    assert.ok(messageSource.includes("resolveSourcesForPrompt"), "message flow keeps resolving sources generically");
    assert.ok(messageSource.includes("buildIncludedContextText"), "message flow keeps building source context generically");
    // 触发搜索/面板/上下文构建确实接上了 asset 分支。
    const triggerSource = readSource("assistant", "mentions", "trigger.ts");
    const panelSource = readSource("assistant", "sources", "panel.ts");
    const builderSource = readSource("assistant", "mentions", "contextBuilder.ts");
    assert.ok(triggerSource.includes('item.type === "asset"'), "popover must branch on asset");
    assert.ok(panelSource.includes('source.type === "asset"'), "panel must branch on asset");
    assert.ok(builderSource.includes('"note" || source.type === "folder" || source.type === "asset"'),
        "pack resolution must cover asset sources");
});
