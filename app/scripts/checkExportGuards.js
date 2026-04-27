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
    const exportPath = path.join(appRoot, "src", "protyle", "export", "index.ts");
    const mainPath = path.join(appRoot, "electron", "main.js");

    const bootText = readAppFile(path.join("src", "boot", "onGetConfig.ts"));
    const exportText = readAppFile(path.join("src", "protyle", "export", "index.ts"));
    const mainText = readAppFile(path.join("electron", "main.js"));

    const requiredBootFragments = [
        ["getPDFExportErrorMessage", "PDF export must convert generic failures to precise messages"],
        ["isPDFMemoryError", "PDF export must detect real memory errors before showing memory guidance"],
        ["fetchPostForExport(\"/api/export/exportHTML\"", "PDF exportHTML call must be awaited and checked"],
        ["fetchPostForExport(\"/api/export/processPDF\"", "PDF processPDF call must be awaited and checked"],
        ["pdfData = await printToPDF(ipcData.pdfOptions)", "PDF export must call printToPDF through the guarded wrapper"],
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
        ["body.export-pdf-printing #action", "PDF settings panel must be hidden during print"],
        ["preparePDFPrintView", "PDF preview must prepare a print-only view"],
        ["restorePDFPreviewView", "PDF preview must restore the view on pre-print failure"],
        ["maxUnpagedPageHeight", "PDF preview must cap unsafe unpaged height"],
        ["buildExportConfig();", "PDF preview must fall back to paged export for unsafe unpaged documents"],
        ["const getSnippetJS = (includeEditorRuntimeJS = false)", "PDF export must default to skipping editor runtime JS snippets"],
        ["allowSVGScriptTip: false", "PDF/static export must not execute SVG scripts from note content"],
        ["allowHTMLBLockScript: false", "PDF/static export must not execute HTML block scripts from note content"],
    ];
    for (const [fragment, message] of requiredPreviewFragments) {
        if (!exportText.includes(fragment)) {
            addFinding(exportPath, message);
        }
    }
    if (/actionElement\.remove\(\)/.test(exportText)) {
        addFinding(exportPath, "PDF export must hide the settings panel instead of removing it");
    }
    if (/alert\(\s*(?:\$\{JSON\.stringify\()?window\.sourceflow\.languages\.exportPDFLowMemory/.test(exportText)) {
        addFinding(exportPath, "PDF preview must not alert exportPDFLowMemory as a generic catch-all");
    }
    const renderPDFMatch = exportText.match(/const renderPDF[\s\S]*?const getExportPath/);
    if (!renderPDFMatch) {
        addFinding(exportPath, "PDF preview renderer is missing");
    } else if (/getSnippetJS\(\s*true\s*\)/.test(renderPDFMatch[0])) {
        addFinding(exportPath, "PDF preview must not execute user JS snippets");
    } else if (!/allowSVGScriptTip:\s*false/.test(renderPDFMatch[0]) || !/allowHTMLBLockScript:\s*false/.test(renderPDFMatch[0])) {
        addFinding(exportPath, "PDF preview must force note HTML/SVG scripts off");
    } else if (/allowHTMLBLockScript:\s*\$\{window\.sourceflow\.config\.editor\.allowHTMLBLockScript\}/.test(renderPDFMatch[0])) {
        addFinding(exportPath, "PDF preview must not inherit the editor HTML block script setting");
    }
    const staticExportMatch = exportText.match(/export const onExport[\s\S]*?\/\/ 移动端导出 pdf、浏览器导出 HTML/);
    if (!staticExportMatch) {
        addFinding(exportPath, "Static export renderer is missing");
    } else if (!/allowSVGScriptTip:\s*false/.test(staticExportMatch[0]) || !/allowHTMLBLockScript:\s*false/.test(staticExportMatch[0])) {
        addFinding(exportPath, "Static export must force note HTML/SVG scripts off");
    } else if (/allowHTMLBLockScript:\s*\$\{window\.sourceflow\.config\.editor\.allowHTMLBLockScript\}/.test(staticExportMatch[0])) {
        addFinding(exportPath, "Static export must not inherit the editor HTML block script setting");
    }

    if (!mainText.includes("PDF preview window is unavailable")) {
        addFinding(mainPath, "printToPDF must check that the preview window still exists");
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
