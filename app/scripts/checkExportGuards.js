const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");

const toRepoPath = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/");

const readAppFile = (relativePath) => {
    return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
};

const findings = [];

const addFinding = (filePath, message, matchIndex = 0) => {
    const text = fs.readFileSync(filePath, "utf8");
    const before = text.slice(0, Math.max(0, matchIndex));
    const line = before.split(/\r?\n/).length;
    const column = before.length - before.lastIndexOf("\n");
    findings.push({
        filePath,
        line,
        column,
        message,
    });
};

const walk = (directoryPath, files) => {
    for (const entry of fs.readdirSync(directoryPath, {withFileTypes: true})) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            const relativePath = toRepoPath(entryPath);
            if (entry.name === "node_modules" || entry.name === "dist" || relativePath === "app/src/types/dist") {
                continue;
            }
            walk(entryPath, files);
            continue;
        }
        if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
            files.push(entryPath);
        }
    }
};

const checkMalformedAPIPaths = () => {
    const files = [];
    walk(path.join(appRoot, "src"), files);
    for (const filePath of files) {
        const text = fs.readFileSync(filePath, "utf8");
        const regex = /\b(?:fetchPost|fetchSyncPost|fetchGet)\(\s*(["'`])\s+\/api\//g;
        let match;
        while ((match = regex.exec(text))) {
            addFinding(filePath, "API path literal starts with whitespace", match.index);
        }
    }
};

const checkPDFExportGuards = () => {
    const bootPath = path.join(appRoot, "src", "boot", "onGetConfig.ts");
    const exportIndexPath = path.join(appRoot, "src", "protyle", "export", "index.ts");
    const exportRuntimeAssetsPath = path.join(appRoot, "src", "protyle", "export", "runtimeAssets.ts");
    const exportRuntimeStatePath = path.join(appRoot, "src", "protyle", "export", "runtimeState.ts");
    const exportSharedPath = path.join(appRoot, "src", "protyle", "export", "shared.ts");
    const exportStaticHTMLPath = path.join(appRoot, "src", "protyle", "export", "staticHTML.ts");
    const exportPDFHTMLPath = path.join(appRoot, "src", "protyle", "export", "pdfPreviewHTML.ts");
    const exportPDFWorkerHTMLPath = path.join(appRoot, "src", "protyle", "export", "pdfWorkerHTML.ts");
    const exportPDFWorkerPath = path.join(appRoot, "src", "protyle", "export", "pdfWorker.ts");
    const mainPath = path.join(appRoot, "electron", "main.js");
    const preloadPath = path.join(appRoot, "electron", "exportPreload.js");
    const htmlBlockPath = path.join(appRoot, "stage", "protyle", "js", "protyle-html.js");

    const bootText = readAppFile(path.join("src", "boot", "onGetConfig.ts"));
    const exportIndexText = readAppFile(path.join("src", "protyle", "export", "index.ts"));
    const exportRuntimeAssetsText = readAppFile(path.join("src", "protyle", "export", "runtimeAssets.ts"));
    const exportRuntimeStateText = readAppFile(path.join("src", "protyle", "export", "runtimeState.ts"));
    const exportSharedText = readAppFile(path.join("src", "protyle", "export", "shared.ts"));
    const exportStaticHTMLText = readAppFile(path.join("src", "protyle", "export", "staticHTML.ts"));
    const exportPDFHTMLText = readAppFile(path.join("src", "protyle", "export", "pdfPreviewHTML.ts"));
    const exportPDFWorkerHTMLText = readAppFile(path.join("src", "protyle", "export", "pdfWorkerHTML.ts"));
    const exportPDFWorkerText = readAppFile(path.join("src", "protyle", "export", "pdfWorker.ts"));
    const exportText = [
        exportIndexText,
        exportRuntimeAssetsText,
        exportRuntimeStateText,
        exportSharedText,
        exportStaticHTMLText,
        exportPDFHTMLText,
        exportPDFWorkerHTMLText,
        exportPDFWorkerText,
    ].join("\n");
    const mainText = readAppFile(path.join("electron", "main.js"));
    const preloadText = readAppFile(path.join("electron", "exportPreload.js"));
    const htmlBlockText = readAppFile(path.join("stage", "protyle", "js", "protyle-html.js"));

    const requiredBootFragments = [
        ["getPDFExportErrorMessage", "PDF export must convert generic failures to precise messages"],
        ["isPDFMemoryError", "PDF export must detect real memory errors before showing memory guidance"],
        ["runPDFExportStep", "PDF export must label async failure stages"],
        ["runPDFExportStep(\"生成 PDF 文件\"", "PDF export must label printToPDF failures"],
        ["runPDFExportStep(\"分页重试生成 PDF 文件\"", "PDF export must label paged printToPDF retries"],
        ["fetchPostForExport(\"/api/export/exportHTML\"", "PDF exportHTML call must be awaited and checked"],
        ["keepFold: ipcData.keepFold", "PDF export worker content must preserve keepFold when fetching export HTML"],
        ["buildPDFWorkerExportHTML", "PDF export must build a dedicated worker HTML document before printing"],
        ["fetchPostForExport(\"/api/export/exportTempContent\"", "PDF export must stage a dedicated worker HTML document before printing"],
        ["createPDFExportWorker", "PDF export must create a dedicated hidden worker window before printing"],
        ["workerWebContentsId", "PDF export must print a dedicated worker window instead of the preview window"],
        ["fetchPostForExport(\"/api/export/processPDF\"", "PDF processPDF call must be awaited and checked"],
        ["if (ipcData?.error)", "PDF export preview errors must be handled by the parent window"],
        ["postProcessWarning", "PDF post-processing must be best-effort so a raw PDF remains exported"],
        ["PDF 已导出，但目录、水印或附件后处理失败", "PDF export must report post-processing failure as a warning after saving the PDF"],
    ];
    for (const [fragment, message] of requiredBootFragments) {
        if (!bootText.includes(fragment)) {
            addFinding(bootPath, message);
        }
    }
    if (/showMessage\(\s*window\.sourceflow\.languages\.exportPDFLowMemory/.test(bootText)) {
        addFinding(bootPath, "PDF export must not display exportPDFLowMemory as a generic catch-all");
    }
    if (!bootText.includes("catch (printError)") || !bootText.includes("ipcData.paged = true")) {
        addFinding(bootPath, "PDF export must retry memory-related printToPDF failures with paged output");
    }

    const requiredPreviewFragments = [
        ["maxUnpagedPageHeight", "PDF preview must cap unsafe unpaged height"],
        ["buildExportConfig();", "PDF preview must fall back to paged export for unsafe unpaged documents"],
        ["const getSnippetJS = (includeEditorRuntimeJS = false)", "PDF export must default to skipping editor runtime JS snippets"],
        ["getSnippetJS(false)", "PDF/static export must explicitly skip editor runtime JS snippets"],
        ["getExportSafetyJS", "PDF/static export must install export runtime safety guards"],
        ["getExportRuntimeLoaderJS", "PDF/static export must define a dedicated export runtime loader"],
        ["loadExportScript", "PDF/static export must load export runtime scripts explicitly"],
        ["requiredProtyleMethods", "PDF/static export must validate the complete Protyle export API before rendering"],
        ["Export runtime requires window.sourceflow before initialization", "PDF/static export must initialize sourceflow before loading the export runtime"],
        ["ensureExportRuntime", "PDF/static export must wait for export runtime initialization"],
        ["callExportProtyle", "PDF/static export must call validated Protyle export methods"],
        ["data-sourceflow-export=\"true\"", "PDF/static export documents must be marked as export-safe mode"],
        ["sanitizeExportHTMLContent", "Static export must sanitize initial HTML before document parsing"],
        ["sanitizeExportExecutableContent(previewElement)", "PDF/static export must sanitize injected preview content before rendering"],
        ["allowSVGScriptTip: false", "PDF/static export must not execute SVG scripts from note content"],
        ["allowHTMLBLockScript: false", "PDF/static export must not execute HTML block scripts from note content"],
        ["reportPDFExportRuntimeError", "PDF preview runtime errors must be routed through IPC instead of native alert dialogs"],
        ["window.alert = (message) => reportPDFExportRuntimeError(message)", "PDF preview must suppress native alert dialogs"],
    ];
    for (const [fragment, message] of requiredPreviewFragments) {
        if (!exportText.includes(fragment)) {
            addFinding(exportPDFHTMLPath, message);
        }
    }
    if (!exportIndexText.includes("buildPDFPreviewHTML(")) {
        addFinding(exportIndexPath, "PDF export index must delegate preview HTML assembly to the dedicated builder");
    }
    if (!exportIndexText.includes("buildStaticExportHTML(")) {
        addFinding(exportIndexPath, "Static export index must delegate HTML assembly to the dedicated builder");
    }
    if (!exportPDFWorkerText.includes("buildPDFWorkerHTML(")) {
        addFinding(exportPDFWorkerPath, "PDF export worker module must delegate HTML assembly to the dedicated worker builder");
    }
    if (/actionElement\.remove\(\)/.test(exportPDFHTMLText)) {
        addFinding(exportPDFHTMLPath, "PDF export must hide the settings panel instead of removing it");
    }
    if (/alert\(\s*(?:\$\{JSON\.stringify\()?window\.sourceflow\.languages\.exportPDFLowMemory/.test(exportPDFHTMLText)) {
        addFinding(exportPDFHTMLPath, "PDF preview must not alert exportPDFLowMemory as a generic catch-all");
    }
    if (/getSnippetJS\(\s*true\s*\)/.test(exportPDFHTMLText)) {
        addFinding(exportPDFHTMLPath, "PDF preview must not execute user JS snippets");
    } else if (!/data-sourceflow-export="true"/.test(exportPDFHTMLText) || !/sanitizeExportExecutableContent\(previewElement\)/.test(exportPDFHTMLText)) {
        addFinding(exportPDFHTMLPath, "PDF preview must mark export mode and sanitize injected content");
    } else if (!/allowSVGScriptTip:\s*false/.test(exportRuntimeStateText) || !/allowHTMLBLockScript:\s*false/.test(exportRuntimeStateText)) {
        addFinding(exportRuntimeStatePath, "PDF preview must force note HTML/SVG scripts off");
    } else if (/allowHTMLBLockScript:\s*\$\{window\.sourceflow\.config\.editor\.allowHTMLBLockScript\}/.test(exportPDFHTMLText)) {
        addFinding(exportPDFHTMLPath, "PDF preview must not inherit the editor HTML block script setting");
    } else if (/\balert\s*\(/.test(exportPDFHTMLText.replace("window.alert = (message) => reportPDFExportRuntimeError(message)", ""))) {
        addFinding(exportPDFHTMLPath, "PDF preview must not use native alert dialogs for export failures");
    }
    if (/preparePDFPrintView|restorePDFPreviewView|export-pdf-printing/.test(exportPDFHTMLText)) {
        addFinding(exportPDFHTMLPath, "PDF preview must not mutate itself into the print target anymore");
    }
    if (/window\.Protyle = createNoopProxy/.test(exportText)) {
        addFinding(exportPDFHTMLPath, "Export HTML builders must not silently replace missing Protyle with a noop proxy");
    }
    if (/window\.protyle\s*=/.test(exportText)) {
        addFinding(exportPDFHTMLPath, "Export HTML builders must not silently replace missing protyle with a proxy");
    }
    if (/sourceflowRunExportProtyle|runExportProtyle/.test(exportText)) {
        addFinding(exportPDFHTMLPath, "Export HTML builders must not silently degrade missing Protyle export methods");
    }
    if (/<script src="\$\{servePath\}stage\/build\/export\/protyle-method\.js/.test(exportText)) {
        addFinding(exportRuntimeAssetsPath, "Export HTML builders must load the Protyle export runtime through the validated loader");
    }
    if (!/sanitizeExportHTMLContent\(data\.data\.content\)/.test(exportIndexText) || !/data-sourceflow-export="true"/.test(exportStaticHTMLText)) {
        addFinding(exportStaticHTMLPath, "Static export must sanitize initial HTML before document parsing and mark export mode");
    } else if (!/allowSVGScriptTip:\s*false/.test(exportRuntimeStateText) || !/allowHTMLBLockScript:\s*false/.test(exportRuntimeStateText)) {
        addFinding(exportRuntimeStatePath, "Static export must force note HTML/SVG scripts off");
    } else if (/allowHTMLBLockScript:\s*\$\{window\.sourceflow\.config\.editor\.allowHTMLBLockScript\}/.test(exportStaticHTMLText)) {
        addFinding(exportStaticHTMLPath, "Static export must not inherit the editor HTML block script setting");
    }
    const requiredWorkerFragments = [
        ["reportPDFWorkerReady", "PDF worker must signal readiness back to the main process"],
        ["reportPDFWorkerError", "PDF worker must signal runtime failures back to the main process"],
        ["waitForDocumentFonts", "PDF worker must wait for fonts before printing"],
        ["waitForMutationIdle", "PDF worker must wait for async renderers to settle before printing"],
        ["waitForLoadableElements", "PDF worker must wait for images and objects before printing"],
        ["const printableWidth = Math.max", "PDF worker must size content from printable width instead of page padding"],
        ["padding: 0 !important;", "PDF worker must not keep editor padding around the printed content"],
        ["sanitizeExportExecutableContent(previewElement)", "PDF worker must sanitize injected content before rendering"],
        ["callExportProtyle(\"highlightRender\"", "PDF worker must rerender width-sensitive code blocks for the print page"],
        ["callExportProtyle(\"mathRender\"", "PDF worker must rerender math blocks for the print page"],
        ["window.alert = (message) => reportPDFWorkerError(message)", "PDF worker must suppress native alert dialogs"],
    ];
    for (const [fragment, message] of requiredWorkerFragments) {
        if (!exportPDFWorkerHTMLText.includes(fragment)) {
            addFinding(exportPDFWorkerHTMLPath, message);
        }
    }
    if (/setPreviewPadding|style\.padding\s*=/.test(exportPDFWorkerHTMLText)) {
        addFinding(exportPDFWorkerHTMLPath, "PDF worker must not duplicate print margins by writing preview padding into the DOM");
    }

    if (!mainText.includes("PDF export worker window is unavailable")) {
        addFinding(mainPath, "printToPDF must check that the dedicated worker window still exists");
    }
    if (!mainText.includes("exportPreload.js")) {
        addFinding(mainPath, "PDF export preview windows must install export preload before page scripts run");
    }
    if (!mainText.includes("data && data.error")) {
        addFinding(mainPath, "PDF export IPC must forward preview runtime errors to the parent window");
    }
    if (!mainText.includes("createPDFExportWorkerWindow") || !mainText.includes("pendingPDFExportWorkers")) {
        addFinding(mainPath, "Main process must manage hidden PDF export worker windows explicitly");
    }
    if (!mainText.includes("sourceflow-export-pdf-worker-ready") || !mainText.includes("sourceflow-export-pdf-worker-error")) {
        addFinding(mainPath, "Main process must handle PDF worker ready/error IPC channels");
    }
    if (preloadText.includes("window.Protyle = createNoopProxy(\"Protyle\")")) {
        addFinding(preloadPath, "PDF export preload must not silently replace missing Protyle with a noop proxy");
    }
    if (/window\.protyle\s*=/.test(preloadText)) {
        addFinding(preloadPath, "PDF export preload must not silently replace missing protyle with a proxy");
    }
    if (!/ensureExportRuntime\(\)/.test(exportPDFHTMLText)) {
        addFinding(exportPDFHTMLPath, "PDF preview must explicitly wait for export runtime initialization");
    }
    if (!/ensureExportRuntime\(\)/.test(exportStaticHTMLText)) {
        addFinding(exportStaticHTMLPath, "Static export must explicitly wait for export runtime initialization");
    }

    const requiredHTMLBlockFragments = [
        ["isSourceflowExportSafeMode", "HTML block renderer must detect export safe mode"],
        ["isHTMLBlockScriptAllowed", "HTML block renderer must centralize script permission checks"],
        ["document.documentElement.getAttribute('data-sourceflow-export') === 'true'", "HTML block renderer must honor export-safe document marker"],
        ["DOMPurify.sanitize(dataContent)", "HTML block renderer must sanitize blocked content"],
    ];
    for (const [fragment, message] of requiredHTMLBlockFragments) {
        if (!htmlBlockText.includes(fragment)) {
            addFinding(htmlBlockPath, message);
        }
    }
    if (/if\s*\(\s*!\s*window\.sourceflow\.config\.editor\.allowHTMLBLockScript\s*\)/.test(htmlBlockText)) {
        addFinding(htmlBlockPath, "HTML block renderer must not directly dereference window.sourceflow in export windows");
    }
    if (!/this\.display\.innerHTML\s*=\s*DOMPurify\.sanitize\(dataContent\)\s*;?\s*return/.test(htmlBlockText)) {
        addFinding(htmlBlockPath, "HTML block renderer must stop before executing scripts after sanitizing blocked content");
    }
};

checkMalformedAPIPaths();
checkPDFExportGuards();

if (findings.length === 0) {
    console.log("[export-guards] ok");
    process.exit(0);
}

console.error(`[export-guards] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line}:${finding.column} ${finding.message}`);
}
process.exit(1);
