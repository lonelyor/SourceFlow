const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

// R7 期二：附件「让 AI 看图」前端——来源面板开关 + 发送接线 + OCR 缓存
// （plans/20260915-附件引用与OCR来源设计.md §2.2 第二期）
// 1. 来源面板：仅图片 asset 显示「让 AI 看图」开关，默认关；开启后行内显示 ~1024 tokens/图 预计消耗，
//    并提供「保存转录」入口。
// 2. 发送接线：sendAIDockMessage 收集已开启看图的图片 asset → assetAttachments；先查 OCR 缓存，
//    命中（transcript 非空）不发图、转录并入元数据段（标注「来自缓存转录」）。
// 3. OCR 缓存 API：POST /api/assistant/asset/ocr {id}；保存走 /save，契约调整：前端不带 mtime，
//    由后端 stat 填充（mtime 可选）。
// 4. 用量：开启看图的每张图 +1024 tokens（对齐后端 assistantAIImageTokenEstimate）。

const srcRoot = path.join(__dirname, "..", "src");

// 依赖替身：src/constants.ts（assistant/constants.ts 的上游）、dialog/message.ts、mentions/api.ts。
const showMessageCalls = [];
const stubs = new Map([
    [path.join(srcRoot, "constants.ts"), {Constants: {SOURCEFLOW_APPID: "sourceflow"}}],
    [path.join(srcRoot, "dialog", "message.ts"), {
        showMessage: (message, timeout, type) => showMessageCalls.push({message, timeout, type}),
    }],
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
        fetch: (url, init) => assetVisionFetch(url, init),
        document: documentStub,
    }, {filename: relPath});
    return moduleObj.exports;
};

const readSource = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

// vm 领域里的数组原型与主进程不同，deepStrictEqual 会误报；统一用 JSON 序列化比较。
const assertSameArray = (actual, expected, message) => {
    assert.strictEqual(JSON.stringify(actual || null), JSON.stringify(expected),
        `${message} (got: ${JSON.stringify(actual)})`);
};

// 顺序执行（支持 async 用例）：共享桩状态（fetch 调用记录、会话缓存）不允许用例间交错。
const pendingTests = [];
const test = (name, fn) => {
    pendingTests.push({name, fn});
};

// --- 直连 fetch 桩（assetVision 不走 util/fetch，避免 electron 依赖链）--------------------------
const fetchCalls = [];
const assetVisionFetch = async (url, init) => {
    const payload = JSON.parse((init && init.body) || "{}");
    fetchCalls.push({url, payload});
    let data = {};
    if (url === "/api/assistant/asset/ocr") {
        // assets/cached.png 有缓存转录；assets/fresh.png 无缓存（空 transcript = 无缓存）。
        data = payload.id === "assets/cached.png" ? {transcript: "图中文字：架构图 A->B", mtime: "1700000000"} : {transcript: "", mtime: "1700000001"};
    }
    if (url === "/api/assistant/asset/ocr/save") {
        data = {transcript: payload.transcript, mtime: "1700000002"};
    }
    return {json: async () => ({code: 0, msg: "", data})};
};

// --- document 桩：捕获面板委托监听 + 原地重渲染 ------------------------------------------------
const documentStub = {
    listeners: {},
    addEventListener(type, handler) {
        documentStub.listeners[type] = handler;
    },
    querySelectorResult: null,
    querySelector(selector) {
        if (selector === ".assistant-ai__sources-panel") {
            if (!documentStub.querySelectorResult) {
                documentStub.querySelectorResult = {outerHTML: ""};
            }
            return documentStub.querySelectorResult;
        }
        return null;
    },
};

const assetVisionModule = loadModule(path.join("assistant", "sources", "assetVision.ts"));
const contextBuilderModule = loadModule(path.join("assistant", "mentions", "contextBuilder.ts"));
const panelModule = loadModule(path.join("assistant", "sources", "panel.ts"));

// --- 1. 面板：开关仅图片显示且默认关 ------------------------------------------------------------
test("vision toggle renders only for image assets and defaults off", () => {
    const html = panelModule.renderSourcesPanel([
        {id: "assets/foo.png", type: "asset", title: "foo.png", hPath: "assets", included: true},
        {id: "assets/spec.pdf", type: "asset", title: "spec.pdf", hPath: "assets", included: true},
        {id: "note-1", type: "note", title: "普通笔记", included: true},
    ]);
    assert.strictEqual(html.split("toggle-asset-vision").length - 1, 1,
        "only the image asset row may render the vision toggle");
    assert.ok(html.includes('aria-pressed="false"'), "vision toggle must default to off");
    assert.ok(!html.includes("assistant-ai__asset-vision-cost"), "cost hint must stay hidden while off");
    assert.ok(!html.includes("save-asset-transcript"), "save-transcript button must stay hidden while off");
    // 开关文案双语内联。
    assert.ok(html.includes("让 AI 看图"), "toggle must carry the zh label");
});

test("enabled vision row shows inline token cost and save-transcript entry", async () => {
    const html = panelModule.renderSourcesPanel([
        {id: "assets/foo.png", type: "asset", title: "foo.png", hPath: "assets", included: true, visionEnabled: true},
    ]);
    assert.ok(html.includes('aria-pressed="true"'), "enabled toggle must reflect state");
    assert.ok(html.includes("~1024"), "cost hint must use the 1024 token yardstick");
    assert.ok(html.includes("tokens/图"), "cost hint must be per image");
    assert.ok(html.includes('data-action="save-asset-transcript"'), "save-transcript button appears when enabled");
    // 命中缓存的资产：本次不发图，消耗提示替换为缓存命中提示。
    await assetVisionModule.fetchAssistantAssetOcr("assets/cached.png");
    const cachedHtml = panelModule.renderSourcesPanel([
        {id: "assets/cached.png", type: "asset", title: "cached.png", hPath: "assets", included: true, visionEnabled: true},
    ]);
    assert.ok(cachedHtml.includes("已命中转录缓存"), "cached transcript must replace the token cost hint");
    assert.ok(!cachedHtml.includes("tokens/图"), "no per-image token cost when cache hits");
});

// --- 2. 开关交互（vm 逻辑桩：委托点击 + 原地重渲染）----------------------------------------------
test("delegated click flips visionEnabled and rerenders the panel in place", () => {
    assert.strictEqual(typeof documentStub.listeners.click, "function",
        "panel module must register its delegated click listener on first render");
    const sources = [
        {id: "assets/foo.png", type: "asset", title: "foo.png", hPath: "assets", included: true},
    ];
    panelModule.renderSourcesPanel(sources);
    const clickTarget = {
        getAttribute: (name) => (name === "data-source-index" ? "0" : null),
    };
    let prevented = false;
    panelModule.handleAssistantSourcesPanelDelegatedClick({
        target: {closest: (selector) => (selector === "[data-action='toggle-asset-vision']" ? clickTarget : null)},
        preventDefault: () => {
            prevented = true;
        },
    });
    assert.strictEqual(sources[0].visionEnabled, true, "click must enable vision");
    assert.ok(prevented, "toggle click must preventDefault");
    assert.ok(documentStub.querySelectorResult.outerHTML.includes('aria-pressed="true"'),
        "panel must rerender in place after toggling");
    // 非图片 asset 与未知索引不吃开关。
    const pdfSources = [{id: "assets/spec.pdf", type: "asset", title: "spec.pdf", included: true}];
    panelModule.renderSourcesPanel(pdfSources);
    panelModule.handleAssistantSourcesPanelDelegatedClick({
        target: {closest: (selector) => (selector === "[data-action='toggle-asset-vision']" ? clickTarget : null)},
        preventDefault: () => undefined,
    });
    assert.notStrictEqual(pdfSources[0].visionEnabled, true, "pdf asset must not be vision-toggleable");
});

// --- 3. assetAttachments 组装 + OCR 缓存命中走文本 / 未命中走发图 --------------------------------
test("vision plan sends images only for enabled image assets without cached transcript", async () => {
    const plan = await assetVisionModule.resolveAssistantAssetVisionForSend([
        {id: "assets/fresh.png", type: "asset", title: "fresh.png", included: true, visionEnabled: true},
        {id: "assets/spec.pdf", type: "asset", title: "spec.pdf", included: true, visionEnabled: true},
        {id: "assets/skip.png", type: "asset", title: "skip.png", included: false, visionEnabled: true},
        {id: "assets/off.png", type: "asset", title: "off.png", included: true, visionEnabled: false},
        {id: "note-1", type: "note", title: "普通笔记", included: true},
    ]);
    assertSameArray(plan.assetAttachments, ["assets/fresh.png"],
        "only included vision-enabled image assets go into assetAttachments");
    assert.strictEqual(plan.cacheHits.length, 0, "fresh asset has no cached transcript");
    const ocrCalls = fetchCalls.filter((call) => call.url === "/api/assistant/asset/ocr");
    assert.ok(ocrCalls.some((call) => JSON.stringify(call.payload) === JSON.stringify({id: "assets/fresh.png"})),
        "ocr query must carry the asset id");
});

test("ocr cache hit merges transcript into the source metadata segment instead of sending the image", async () => {
    const plan = await assetVisionModule.resolveAssistantAssetVisionForSend([
        {id: "assets/cached.png", type: "asset", title: "cached.png", included: true, visionEnabled: true},
    ]);
    assertSameArray(plan.assetAttachments, [], "cache hit must not send the image");
    assert.strictEqual(plan.cacheHits.length, 1);
    assert.strictEqual(plan.cacheHits[0].id, "assets/cached.png");
    const sources = [{
        id: "assets/cached.png", type: "asset", title: "cached.png", included: true, visionEnabled: true,
        summary: "- 附件：cached.png（图片，位于 assets/）\n说明：该附件图像已附带，请直接分析/按需转录图中文字。",
    }];
    assetVisionModule.applyAssistantAssetOcrCacheHits(sources, plan.cacheHits);
    assert.ok(sources[0].summary.includes("来自缓存转录"), "transcript must be marked as from cache");
    assert.ok(sources[0].summary.includes("图中文字：架构图 A->B"), "transcript text must be merged");
});

// --- 4. prompt 指令：开启看图后元数据段替换为「直接分析/按需转录」---------------------------------
test("asset prompt note switches to vision instruction when vision is enabled", async () => {
    const apiStub = stubs.get(path.join(srcRoot, "assistant", "mentions", "api.ts"));
    apiStub.buildContextPack = async (items) => ({
        items: items.map((item) => ({
            type: item.type, id: item.id, title: item.id, hPath: "assets",
            summary: "文件名与大小等元数据",
        })),
        dropped: [],
        truncated: false,
    });
    const resolved = await contextBuilderModule.resolveSourcesForPrompt([
        {id: "assets/foo.png", type: "asset", title: "foo.png", hPath: "assets", included: true, visionEnabled: true},
    ], "default");
    assert.strictEqual(resolved[0].visionEnabled, true, "visionEnabled must survive pack rebuild");
    assert.ok(resolved[0].summary.includes("该附件图像已附带，请直接分析/按需转录图中文字"),
        `vision instruction must be present, got: ${resolved[0].summary}`);
    assert.ok(!resolved[0].summary.includes("该附件为元数据引用"),
        "metadata-only note must be replaced when vision is on");

    const plain = await contextBuilderModule.resolveSourcesForPrompt([
        {id: "assets/bar.png", type: "asset", title: "bar.png", hPath: "assets", included: true},
    ], "default");
    assert.notStrictEqual(plain[0].visionEnabled, true, "vision stays off by default");
    assert.ok(plain[0].summary.includes("该附件为元数据引用"), "metadata-only note stays for vision-off assets");
});

// --- 5. 用量：开启看图的每张图 +1024 tokens -------------------------------------------------------
test("token estimate adds 1024 per included vision-enabled image", () => {
    const summaryOnly = [{id: "note-1", type: "note", title: "n", included: true, summary: "12345678"}];
    assert.strictEqual(contextBuilderModule.estimateTokenCount(summaryOnly), 2, "text estimate stays runes/4");
    const withVision = summaryOnly.concat([
        {id: "assets/foo.png", type: "asset", title: "foo.png", included: true, visionEnabled: true},
    ]);
    assert.strictEqual(contextBuilderModule.estimateTokenCount(withVision), 2 + 1024,
        "each vision image adds the 1024-token yardstick");
    const visionOff = summaryOnly.concat([
        {id: "assets/foo.png", type: "asset", title: "foo.png", included: true},
    ]);
    assert.strictEqual(contextBuilderModule.estimateTokenCount(visionOff), 2, "vision-off image adds nothing");
    const excluded = summaryOnly.concat([
        {id: "assets/foo.png", type: "asset", title: "foo.png", included: false, visionEnabled: true},
    ]);
    assert.strictEqual(contextBuilderModule.estimateTokenCount(excluded), 2, "excluded image adds nothing");
    // 面板头部 tokens 汇总同步可见。
    const html = panelModule.renderSourcesPanel(withVision);
    assert.ok(html.includes("~1026 tokens"), `panel header must reflect the vision cost, got: ${html}`);
});

test("frontend image token yardstick matches the assetVision constant and backend yardstick", () => {
    const extract = (source) => {
        const match = source.match(/ASSISTANT_AI_ASSET_IMAGE_TOKEN_ESTIMATE\s*=\s*(\d+)/);
        return match ? Number(match[1]) : null;
    };
    const builderValue = extract(readSource("assistant", "mentions", "contextBuilder.ts"));
    const visionValue = extract(readSource("assistant", "sources", "assetVision.ts"));
    assert.strictEqual(builderValue, 1024, "contextBuilder yardstick must stay 1024");
    assert.strictEqual(visionValue, 1024, "assetVision yardstick must stay 1024");
    assert.strictEqual(builderValue, visionValue, "both frontend yardsticks must agree");
});

// --- 6. 保存转录：显式保存当前 AI 回复，不带 mtime（由后端 stat 填充）-----------------------------
test("save transcript requires a recorded AI reply and posts without mtime", async () => {
    const source = {id: "assets/foo.png", type: "asset", title: "foo.png", included: true, visionEnabled: true};
    showMessageCalls.length = 0;
    const savesBefore = fetchCalls.filter((call) => call.url === "/api/assistant/asset/ocr/save").length;
    const okWithoutReply = await assetVisionModule.saveAssistantAssetTranscript(source);
    assert.strictEqual(okWithoutReply, false, "no reply recorded yet, save must refuse");
    assert.strictEqual(fetchCalls.filter((call) => call.url === "/api/assistant/asset/ocr/save").length, savesBefore,
        "refused save must not hit the API");
    assert.ok(showMessageCalls.length >= 1, "refused save must surface inline feedback");

    assetVisionModule.recordAssistantAILastReplyForAssetSave("图中标题为 SourceFlow 架构，包含 kernel/app 两层。");
    showMessageCalls.length = 0;
    const ok = await assetVisionModule.saveAssistantAssetTranscript(source);
    assert.strictEqual(ok, true, "save with a recorded reply must succeed");
    const saveCall = fetchCalls.filter((call) => call.url === "/api/assistant/asset/ocr/save").pop();
    assert.strictEqual(saveCall.payload.id, "assets/foo.png");
    assert.ok(saveCall.payload.transcript.includes("SourceFlow 架构"));
    assert.ok(!("mtime" in saveCall.payload), "frontend must not send mtime; backend stats and fills it");
    assert.ok(showMessageCalls.some((call) => `${call.message}`.includes("已保存")), "success feedback must show");
    assert.strictEqual(assetVisionModule.getCachedAssistantAssetOcr("assets/foo.png").transcript,
        saveCall.payload.transcript, "session cache must be backfilled after save");
});

// --- 7. 发送链接线：AIDockMessage 组装 assetAttachments 并记录可保存回复 ---------------------------
test("send chain assembles assetAttachments and records the final reply for save", () => {
    const messageSource = readSource("assistant", "ai", "AIDockMessage.ts");
    assert.ok(messageSource.includes("resolveAssistantAssetVisionForSend"),
        "send chain must plan the vision attachments before building the payload");
    assert.ok(messageSource.includes("applyAssistantAssetOcrCacheHits"),
        "cache-hit transcripts must merge into the resolved sources");
    assert.ok(messageSource.includes("assetAttachments"),
        "payload must carry assetAttachments");
    assert.ok(messageSource.includes("recordAssistantAILastReplyForAssetSave"),
        "send chain must record the final assistant reply for explicit transcript saving");

    const apiSource = readSource("assistant", "ai", "api.ts");
    assert.strictEqual(apiSource.split("assetAttachments?: string[]").length - 1, 3,
        "chat/stream + edit/stream payload types must all accept assetAttachments");

    // 分层约束：mentions/ 不反向依赖 sources/（prompt 段在本层独立声明口径）。
    const builderSource = readSource("assistant", "mentions", "contextBuilder.ts");
    assert.ok(!builderSource.includes('from "../sources/assetVision"') && !builderSource.includes('require("../sources/assetVision")'),
        "contextBuilder must not import sources/assetVision");
});

(async () => {
    for (const {name, fn} of pendingTests) {
        try {
            await fn();
            console.log(`[assistant-asset-vision] ok - ${name}`);
        } catch (error) {
            console.error(`[assistant-asset-vision] failed - ${name}`);
            console.error(error);
            process.exitCode = 1;
        }
    }
})();
