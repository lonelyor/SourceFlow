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

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");

const contextPackCalls = [];
const contextBuilder = compileModule(path.join(srcRoot, "assistant", "mentions", "contextBuilder.ts"), {
    "./api": {
        buildContextPack: async (items) => {
            contextPackCalls.push(items);
            return {
                items: items.map((item) => ({
                    type: item.type,
                    id: item.id,
                    title: item.id,
                    summary: `summary:${item.id}`,
                })),
            };
        },
    },
    "../../dialog/message": {
        showMessage: () => undefined,
    },
    "../constants": {
        assistantText: (zh, en) => zh || en,
    },
});

(async () => {
    const alreadyResolved = [{
        id: "note-ready",
        type: "note",
        title: "Ready",
        included: true,
        summary: "ready summary",
    }];
    const resolvedClone = await contextBuilder.resolveSourcesForPrompt(alreadyResolved, "default");
    assert.strictEqual(contextPackCalls.length, 0, "resolved sources should not be fetched again before prompt send");
    assert.notStrictEqual(resolvedClone, alreadyResolved, "prompt source resolution should protect caller state");

    const unresolved = await contextBuilder.resolveSourcesForPrompt([{
        id: "note-missing",
        type: "note",
        title: "Missing",
        included: true,
    }], "default");
    assert.strictEqual(contextPackCalls.length, 1, "unresolved note sources should be fetched before prompt send");
    assert.strictEqual(unresolved[0].summary, "summary:note-missing");

    const folderWithChildren = [{
        id: "folder-1",
        type: "folder",
        title: "Folder",
        included: true,
        children: [
            {id: "child-1", type: "note", title: "Child 1", included: true, summary: "child one"},
            {id: "child-2", type: "note", title: "Child 2", included: false, summary: "child two"},
        ],
    }];
    const folderPromptSources = await contextBuilder.resolveSourcesForPrompt(folderWithChildren, "default");
    assert.strictEqual(contextPackCalls.length, 1, "resolved folder children should not trigger another folder fetch");
    const promptText = contextBuilder.buildIncludedContextText(folderPromptSources);
    assert(promptText.includes("child one"));
    assert(!promptText.includes("child two"));

    let editors = [];
    const fakeWindow = {
        sourceflow: {
            mobile: {},
            languages: {
                workbenchNeedCurrentNote: "need note",
                emptyContent: "empty",
            },
        },
    };
    const fetchCalls = [];
    const commonNote = compileModule(path.join(srcRoot, "assistant", "common", "note.ts"), {
        "../../layout/getAll": {
            getAllEditor: () => editors,
        },
        "../../protyle/util/hasClosest": {
            hasClosestByClassName: () => true,
            hasClosestBlock: () => null,
        },
        "../../util/fetch": {
            fetchSyncPost: async (url, payload) => {
                fetchCalls.push({url, payload});
                if (url === "/api/notebook/lsNotebooks") {
                    return {code: 0, data: {notebooks: [{id: "box-1"}]}};
                }
                if (url === "/api/filetree/createDocWithMd") {
                    return {code: 0, data: "doc-created"};
                }
                if (url === "/api/block/appendBlock") {
                    return {code: 0};
                }
                return {code: 0, data: {}};
            },
        },
        "../../dialog/message": {
            showMessage: () => undefined,
        },
        "../constants": {
            assistantText: (zh, en) => zh || en,
        },
    }, {
        window: fakeWindow,
        getSelection: () => ({rangeCount: 0}),
    });

    const savedID = await commonNote.saveMarkdownAsAssistantNote("AI 保存", "markdown");
    assert.strictEqual(savedID, "doc-created", "createDocWithMd string data should be treated as the created note ID");
    const createCall = fetchCalls.find((item) => item.url === "/api/filetree/createDocWithMd");
    assert.strictEqual(createCall.payload.sanitizeIDs, true, "AI-created Markdown notes must regenerate block IDs");

    editors = [{
        protyle: {
            block: {rootID: "root-1"},
            element: {classList: {contains: () => false}},
            model: {parent: {headElement: {classList: {contains: () => true}}}},
        },
    }];
    fakeWindow.sourceflow.mobile.editor = editors[0].protyle;
    const inserted = await commonNote.appendMarkdownToCurrentNote("reply markdown");
    assert.strictEqual(inserted, true);
    const appendCall = fetchCalls.find((item) => item.url === "/api/block/appendBlock");
    assert.strictEqual(appendCall.payload.sanitizeIDs, true, "AI appends must regenerate block IDs");

    const inboxFetchCalls = [];
    const inboxHistoryCalls = [];
    const inboxEvents = [];
    let inboxCreateSucceeds = true;
    const inboxStore = compileModule(path.join(srcRoot, "assistant", "inbox", "store.ts"), {
        "../../dialog/message": {
            showMessage: () => undefined,
        },
        "../../util/fetch": {
            fetchSyncPost: async (url, payload) => {
                inboxFetchCalls.push({url, payload});
                if (url === "/api/assistant/inbox/create") {
                    return inboxCreateSucceeds
                        ? {code: 0, data: {id: "inbox-doc"}}
                        : {code: -1, msg: "attrs failed"};
                }
                return {code: 0, data: {}};
            },
        },
        "../common/note": {
            getAssistantNoteCreatePath: (title) => `/AI/${title}`,
            invalidateAssistantNoteContextCache: () => undefined,
            resolveAssistantNoteNotebook: async () => "box-1",
        },
        "../constants": {
            assistantText: (zh, en) => zh || en,
        },
        "../../workbench/constants": {
            WorkbenchAttr: {
                type: "custom-type",
                status: "custom-status",
                inbox: "custom-inbox",
                project: "custom-project",
                goal: "custom-goal",
                nextStep: "custom-next-step",
                capturedAt: "custom-captured-at",
            },
        },
        "../history/operations": {
            recordAssistantExplicitSaveHistory: (payload) => inboxHistoryCalls.push(payload),
        },
    }, {
        window: {
            dispatchEvent: (event) => inboxEvents.push(event),
            sourceflow: {},
        },
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init?.detail;
            }
        },
    });

    const inboxID = await inboxStore.saveAssistantInboxItem({
        title: "结果",
        content: "markdown",
        kind: "search",
        goal: "整理",
    });
    assert.strictEqual(inboxID, "inbox-doc");
    const inboxCreateCall = inboxFetchCalls.find((item) => item.url === "/api/assistant/inbox/create");
    assert(inboxCreateCall, "AI inbox save should use the atomic backend API");
    assert.strictEqual(inboxCreateCall.payload.notebook, "box-1");
    assert.strictEqual(inboxCreateCall.payload.sanitizeIDs, true);
    assert.strictEqual(inboxCreateCall.payload.attrs["custom-inbox"], "true");
    assert(inboxCreateCall.payload.tags.includes("assistant-ai"));
    assert(!inboxFetchCalls.some((item) => item.url === "/api/attr/setBlockAttrs"));
    assert(!inboxFetchCalls.some((item) => item.url === "/api/filetree/createDocWithMd"));
    assert.strictEqual(inboxHistoryCalls.length, 1, "successful atomic inbox save should be audited once");
    assert.strictEqual(inboxHistoryCalls[0].noteId, "inbox-doc");
    assert.strictEqual(inboxEvents.length, 1);

    inboxCreateSucceeds = false;
    inboxFetchCalls.length = 0;
    inboxHistoryCalls.length = 0;
    inboxEvents.length = 0;
    const failedInboxID = await inboxStore.saveAssistantInboxItem({
        title: "失败",
        content: "markdown",
    });
    assert.strictEqual(failedInboxID, null);
    assert.strictEqual(inboxHistoryCalls.length, 0, "failed atomic inbox save must not create an applied audit record");
    assert.strictEqual(inboxEvents.length, 0);

    const semanticSource = fs.readFileSync(path.join(srcRoot, "assistant", "search", "semanticSearch.ts"), "utf8");
    assert(semanticSource.includes("let searchSeq = 0;"));
    assert(semanticSource.includes("currentSeq !== searchSeq"));
    assert(semanticSource.includes("<svg id=\"semanticSearchLoading\""));

    const studioSource = fs.readFileSync(path.join(srcRoot, "assistant", "studio", "sourceFlow.ts"), "utf8");
    assert(studioSource.includes('from "../common/inputStability"'), "Source Studio note search render must use shared input focus helpers");
    assert(studioSource.includes("captureInputFocus(body"), "Source Studio search render must capture input focus state");
    assert(studioSource.includes("restoreInputFocus(body"), "Source Studio search render must restore cursor selection");

    console.log("[assistant-source-and-save] ok");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
