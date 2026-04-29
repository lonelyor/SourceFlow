const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const createHostWindow = () => ({
    sourceflow: {
        config: {
            appearance: {
                lang: "en_US",
                mode: 0,
                icon: "material",
                themeLight: "daylight",
                themeDark: "midnight",
                codeBlockThemeDark: "dark-theme",
                codeBlockThemeLight: "light-theme",
                codeBlockSkinDark: "dark-skin",
                codeBlockSkinLight: "light-skin",
            },
            editor: {
                allowSVGScriptTip: true,
                allowHTMLBLockScript: true,
                codeLineWrap: false,
                displayBookmarkIcon: true,
                fontSize: 16,
                codeLigatures: false,
                plantUMLServePath: "https://plantuml.example",
                codeSyntaxHighlightLineNum: true,
                katexMacros: "</script><img onerror=1>\u2028macro",
            },
        },
        languages: {
            export: "Export",
            copy: "</script><img onerror=1>",
            edit: "Edit",
            more: "More",
            refresh: "Refresh",
            update: "Update",
            htmlBlockError: "Blocked",
            exportPDF0: "Page size",
            exportPDF1: "Landscape",
            exportPDF2: "Margins",
            exportPDF3: "Scale",
            exportPDF4: "Remove assets",
            exportPDF5: "Keep fold",
            exportPDFLowMemory: "Low memory",
            defaultMargin: "Default",
            noneMargin: "None",
            minimalMargin: "Minimal",
            customMargin: "Custom",
            marginTop: "Top",
            marginRight: "Right",
            marginBottom: "Bottom",
            marginLeft: "Left",
            unitInches: "in",
            mergeSubdocs: "Merge",
            export27: "Watermark",
            paged: "Paged",
            cancel: "Cancel",
            confirm: "Confirm",
        },
    },
});

const createDocumentStub = () => ({
    documentElement: {
        attributes: {},
        setAttribute(key, value) {
            this.attributes[key] = value;
        },
    },
});

const compileModule = (entryPath, requireMap = {}, hostWindow = createHostWindow(), documentStub = createDocumentStub()) => {
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
            return compileModule(withExt, requireMap, hostWindow, documentStub);
        }
        return require(request);
    };
    vm.runInNewContext(compiled.outputText, {
        module: moduleObj,
        exports: moduleObj.exports,
        require: localRequire,
        console,
        window: hostWindow,
        document: documentStub,
        global: hostWindow,
        globalThis: hostWindow,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const appRoot = path.join(__dirname, "..");
const exportRoot = path.join(appRoot, "src", "protyle", "export");
const constantsModule = {
    Constants: {
        SOURCEFLOW_VERSION: "0.1.1",
        SOURCEFLOW_APPID: "test-app",
        SOURCEFLOW_EXPORT_PDF: "export-pdf",
        SOURCEFLOW_EXPORT_PDF_WORKER_READY: "export-pdf-worker-ready",
        SOURCEFLOW_EXPORT_PDF_WORKER_ERROR: "export-pdf-worker-error",
        SOURCEFLOW_CMD: "cmd",
    },
};
const hostWindow = createHostWindow();
const documentStub = createDocumentStub();

const sharedModule = compileModule(path.join(exportRoot, "shared.ts"), {}, hostWindow, documentStub);
const runtimeStateModule = compileModule(path.join(exportRoot, "runtimeState.ts"), {}, hostWindow, documentStub);
const staticHTMLModule = compileModule(path.join(exportRoot, "staticHTML.ts"), {
    "../../constants": constantsModule,
    "../../util/assets": {
        getThemeMode: () => "dark",
    },
    "./runtimeState": runtimeStateModule,
    "./shared": sharedModule,
}, hostWindow, documentStub);
const pdfPreviewHTMLModule = compileModule(path.join(exportRoot, "pdfPreviewHTML.ts"), {
    "../../constants": constantsModule,
    "./runtimeState": runtimeStateModule,
    "./shared": sharedModule,
}, hostWindow, documentStub);
const pdfWorkerHTMLModule = compileModule(path.join(exportRoot, "pdfWorkerHTML.ts"), {
    "../../constants": constantsModule,
    "./runtimeState": runtimeStateModule,
    "./shared": sharedModule,
}, hostWindow, documentStub);

const {
    serializeInlineScriptValue,
    buildExportSourceflowBootstrapJS,
} = runtimeStateModule;
const {buildStaticExportHTML} = staticHTMLModule;
const {buildPDFPreviewHTML} = pdfPreviewHTMLModule;
const {buildPDFWorkerHTML} = pdfWorkerHTMLModule;

const serialized = serializeInlineScriptValue({
    text: "</script><img onerror=1>\u2028x",
});
assert.ok(serialized.includes("\\u003C/script\\u003E"));
assert.ok(serialized.includes("\\u2028"));
assert.ok(!serialized.includes("</script>"));

const bootstrapJS = buildExportSourceflowBootstrapJS(0);
const bootstrapWindow = createHostWindow();
const bootstrapDocument = createDocumentStub();
vm.runInNewContext(bootstrapJS, {
    window: bootstrapWindow,
    document: bootstrapDocument,
});
assert.strictEqual(bootstrapWindow.sourceflow.config.editor.allowHTMLBLockScript, false);
assert.strictEqual(bootstrapWindow.sourceflow.languages.copy, "</script><img onerror=1>");
assert.strictEqual(bootstrapDocument.documentElement.attributes["data-code-block-skin"], "light-skin");

const staticHTML = buildStaticExportHTML({
    data: {
        data: {
            name: "Static </title> Export",
            content: "<div>safe</div>",
        },
    },
    servePath: "https://example.com/",
    exportOption: {type: "html", id: "root"},
    themeName: "daylight",
    mode: 0,
    themeStyle: "",
    inlineStyle: ".demo{}",
    pluginStyle: ".plugin{}",
    snippetCSS: "<style id=\"snippetCSS-test\"></style>",
    snippetJS: "",
    mobileJS: "",
    mobileCSS: "",
    exportHTMLContent: "<div>safe</div>",
    iconScript: "",
    runtimeLoaderJS: "const ensureExportRuntime = () => Promise.resolve(); const callExportProtyle = () => {};",
    safetyJS: "window.__sourceflowExportSafeMode = true;",
});
assert.ok(staticHTML.includes("data-sourceflow-export=\"true\""));
assert.ok(staticHTML.includes("ensureExportRuntime()"));
assert.ok(staticHTML.includes("\\u003C/script\\u003E\\u003Cimg onerror=1\\u003E"));
assert.ok(!staticHTML.includes("<title>Static </title> Export</title>"));

const pdfHTML = buildPDFPreviewHTML({
    id: "root",
    localData: {
        pageSize: "A4",
        paged: true,
    },
    servePath: "https://example.com/",
    servePathWithoutTrailingSlash: "https://example.com",
    currentWindowId: 42,
    themeStyle: "",
    inlineStyle: ".inline{}",
    pluginStyle: ".plugin{}",
    snippetCSS: "",
    snippetJS: "",
    iconScript: "",
    runtimeLoaderJS: "const ensureExportRuntime = () => Promise.resolve(); const callExportProtyle = () => {};",
    safetyJS: "window.__sourceflowExportSafeMode = true;",
});
assert.ok(pdfHTML.includes("reportPDFExportRuntimeError"));
assert.ok(pdfHTML.includes("buildExportConfig"));
assert.ok(pdfHTML.includes("window.alert = (message) => reportPDFExportRuntimeError(message)"));
assert.ok(pdfHTML.includes("ensureExportRuntime()"));
assert.ok(!pdfHTML.includes("preparePDFPrintView"));

const workerHTML = buildPDFWorkerHTML({
    data: {
        data: {
            name: "Worker Export",
            content: "<div>worker</div>",
        },
    },
    servePath: "https://example.com/",
    themeStyle: "",
    inlineStyle: ".inline{}",
    pluginStyle: ".plugin{}",
    snippetCSS: "",
    exportHTMLContent: "<div>worker</div>",
    iconScript: "",
    runtimeLoaderJS: "const ensureExportRuntime = () => Promise.resolve(); const callExportProtyle = () => {};",
    safetyJS: "window.__sourceflowExportSafeMode = true;",
    pdfConfig: {
        pageSize: "A4",
        pdfOptions: {
            landscape: false,
            scale: 1,
            margins: {top: 1, right: 0.54, bottom: 1, left: 0.54},
            pageSize: "A4",
        },
    },
});
assert.ok(workerHTML.includes("reportPDFWorkerReady"));
assert.ok(workerHTML.includes("reportPDFWorkerError"));
assert.ok(workerHTML.includes("waitForDocumentFonts"));
assert.ok(workerHTML.includes("waitForMutationIdle"));
assert.ok(workerHTML.includes("padding: 0 !important;"));
assert.ok(workerHTML.includes("const printableWidth = Math.max"));
assert.ok(workerHTML.includes("export-pdf-worker-ready"));
assert.ok(workerHTML.includes("export-pdf-worker-error"));
assert.ok(!workerHTML.includes("id=\"action\""));
assert.ok(!workerHTML.includes("setPreviewPadding"));

console.log("[export-builders] ok");
