const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {pathToFileURL} = require("url");
const {spawnSync} = require("child_process");

if (!process.versions.electron || process.env.ELECTRON_RUN_AS_NODE) {
    const electronPath = require("electron");
    const env = {...process.env};
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(electronPath, [__filename], {
        env,
        stdio: "inherit",
    });
    if (result.status === 0) {
        process.stdout.write("[export-runtime] ok\n");
    }
    process.exit(result.status === null ? 1 : result.status);
}

const {app, BrowserWindow} = require("electron");
const runtimeUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sourceflow-export-runtime-userdata-"));
app.setPath("userData", runtimeUserDataDir);
app.once("quit", () => {
    fs.rmSync(runtimeUserDataDir, {recursive: true, force: true});
});

const waitForResult = async (win, timeoutMs = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const result = await win.webContents.executeJavaScript("window.__sourceflowExportRuntimeResult || null", true);
        if (result) {
            return result;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Timed out waiting for export runtime result");
};

const getPreloadPath = (appRoot) => {
    const candidates = [
        path.join(appRoot, "electron", "exportPreload.js"),
        path.join(appRoot, "app.asar", "electron", "exportPreload.js"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error(`Export preload script not found under ${appRoot}`);
};

const getExportSafetyTestScript = () => `
    window.__sourceflowExportSafeMode = true;
    window.__sourceflowExportErrors = window.__sourceflowExportErrors || [];
    window.sourceflowSanitizeExportExecutableContent = (root) => {
        root.querySelectorAll("script").forEach((item) => item.remove());
        root.querySelectorAll("*").forEach((item) => {
            Array.from(item.attributes).forEach((attr) => {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim().toLowerCase();
                if (name.startsWith("on") ||
                    ((name === "href" || name === "src" || name === "xlink:href") &&
                        (value.startsWith("javascript:") || value.startsWith("vbscript:"))) ||
                    (name === "style" && (value.includes("expression(") || value.includes("url(javascript:") || value.includes("url(vbscript:")))) {
                    item.removeAttribute(attr.name);
                }
            });
        });
    };
    var sanitizeExportExecutableContent = window.sourceflowSanitizeExportExecutableContent;
    window.addEventListener("error", (event) => {
        window.__sourceflowExportErrors.push(String(event.message || event.error || ""));
    });
    window.addEventListener("unhandledrejection", (event) => {
        window.__sourceflowExportErrors.push(String(event.reason || ""));
    });
`;

const createWindow = (preloadPath) => {
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            sandbox: false,
            webSecurity: false,
            preload: preloadPath,
        },
    });
    const pageDiagnostics = [];
    win.webContents.on("did-fail-provisional-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame) {
            pageDiagnostics.push(`provisional-load-failed ${errorCode}: ${errorDescription} ${validatedURL}`);
        }
    });
    win.webContents.on("did-fail-load", (_event, _errorCode, errorDescription) => {
        pageDiagnostics.push(errorDescription);
    });
    win.webContents.on("render-process-gone", (_event, details) => {
        pageDiagnostics.push(`render-process-gone: ${details.reason}`);
    });
    return {win, pageDiagnostics};
};

const runHTMLBlockTest = async (appRoot, preloadPath) => {
    const htmlBlockScript = pathToFileURL(path.join(appRoot, "stage", "protyle", "js", "protyle-html.js")).href;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sourceflow-export-runtime-"));
    const htmlPath = path.join(tmpDir, "index.html");
    const html = `<!DOCTYPE html>
<html data-sourceflow-export="true">
<head>
    <meta charset="utf-8">
    <script>
        ${getExportSafetyTestScript()}
    </script>
    <script src="${htmlBlockScript}"></script>
</head>
<body>
    <protyle-html id="html-block"></protyle-html>
    <script>
        const escapeHTML = (value) => {
            const element = document.createElement("div");
            element.textContent = value;
            return element.innerHTML;
        };
        const dirtyHTML = '<div id="kept">safe</div><script>window.__sourceflowHtmlScriptRan = true; protyle.foo();</' + 'script><img id="probe" src="missing.png" onerror="window.__sourceflowHtmlScriptRan = true">';
        const block = document.getElementById("html-block");
        block.setAttribute("data-content", escapeHTML(dirtyHTML));
        setTimeout(() => {
            const shadow = block.shadowRoot;
            window.__sourceflowExportRuntimeResult = {
                scriptRan: window.__sourceflowHtmlScriptRan === true,
                hasShadow: !!shadow,
                hasScript: !!shadow && !!shadow.querySelector("script"),
                hasInlineHandler: !!shadow && /onerror/i.test(shadow.innerHTML),
                hasKeptContent: !!shadow && !!shadow.querySelector("#kept"),
                errors: window.__sourceflowExportErrors
            };
        }, 100);
    </script>
</body>
</html>`;

    fs.writeFileSync(htmlPath, html);

    const {win, pageDiagnostics} = createWindow(preloadPath);

    try {
        await win.loadURL(pathToFileURL(htmlPath).href);
    } catch (error) {
        throw new Error(`${error.message}; diagnostics: ${pageDiagnostics.join(" | ")}`);
    }
    const result = await waitForResult(win);

    assert.deepStrictEqual(pageDiagnostics, [], "export runtime page must not log load failures");
    assert.strictEqual(result.hasShadow, true, "export HTML block custom element must initialize");
    assert.strictEqual(result.scriptRan, false, "export HTML block script must not execute");
    assert.strictEqual(result.hasScript, false, "export HTML block must remove script nodes");
    assert.strictEqual(result.hasInlineHandler, false, "export HTML block must remove inline event handlers");
    assert.strictEqual(result.hasKeptContent, true, "export HTML block should keep safe content");
    assert.deepStrictEqual(result.errors, [], "export HTML block must not emit runtime errors");

    win.destroy();
    fs.rmSync(tmpDir, {recursive: true, force: true});
};

const runFullExportShellTest = async (appRoot, preloadPath) => {
    const toURL = (relativePath) => pathToFileURL(path.join(appRoot, ...relativePath)).href;
    const htmlBlockScript = toURL(["stage", "protyle", "js", "protyle-html.js"]);
    const protyleMethodScript = toURL(["stage", "build", "export", "protyle-method.js"]);
    const luteScript = toURL(["stage", "protyle", "js", "lute", "lute.min.js"]);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sourceflow-export-shell-"));
    const htmlPath = path.join(tmpDir, "index.html");
    const html = `<!DOCTYPE html>
<html data-sourceflow-export="true" data-theme-mode="light" data-light-theme="daylight" data-dark-theme="midnight">
<head>
    <base href="${pathToFileURL(appRoot + path.sep).href}">
    <meta charset="utf-8">
    <script>
        ${getExportSafetyTestScript()}
    </script>
</head>
<body>
    <div id="preview" class="protyle-wysiwyg">
        <protyle-html id="html-block"></protyle-html>
        <img id="unsafe-img" src="missing.png" onerror="window.__sourceflowHtmlScriptRan = true">
    </div>
    <script>
        ${getExportSafetyTestScript()}
        window.sourceflow = {
            config: {
                appearance: {
                    mode: 0,
                    codeBlockThemeDark: "base16/dracula",
                    codeBlockThemeLight: "github",
                    codeBlockSkinDark: "dark",
                    codeBlockSkinLight: "light"
                },
                editor: {
                    allowSVGScriptTip: false,
                    allowHTMLBLockScript: false,
                    codeLineWrap: true,
                    fontSize: 16,
                    codeLigatures: false,
                    plantUMLServePath: "",
                    codeSyntaxHighlightLineNum: false,
                    katexMacros: ""
                }
            },
            languages: {
                copy: "Copy",
                edit: "Edit",
                more: "More",
                refresh: "Refresh",
                update: "Update",
                htmlBlockError: "HTML block script is blocked"
            }
        };
        const requiredProtyleMethods = ["highlightRender", "mathRender", "mermaidRender", "flowchartRender", "graphvizRender", "chartRender", "mindmapRender", "abcRender", "htmlRender", "plantumlRender"];
        const escapeHTML = (value) => {
            const element = document.createElement("div");
            element.textContent = value;
            return element.innerHTML;
        };
        const loadScript = (src, id, validate) => new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.id = id;
            script.src = src;
            script.async = false;
            script.onload = () => {
                try {
                    if (validate && !validate()) {
                        reject(new Error(src + " loaded but did not initialize correctly"));
                        return;
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            script.onerror = () => reject(new Error("Failed to load " + src));
            document.head.appendChild(script);
        });
        (async () => {
            await loadScript("${luteScript}", "testExportLuteScript", () => typeof window.Lute !== "undefined");
            await loadScript("${htmlBlockScript}", "testExportHTMLBlockScript");
            await loadScript("${protyleMethodScript}", "testExportRuntimeScript", () => !!window.Protyle && requiredProtyleMethods.every((method) => typeof window.Protyle[method] === "function"));
            const dirtyHTML = '<div id="kept">safe</div><script>window.__sourceflowHtmlScriptRan = true; protyle.foo();</' + 'script>';
            const previewElement = document.getElementById("preview");
            document.getElementById("html-block").setAttribute("data-content", escapeHTML(dirtyHTML));
            sanitizeExportExecutableContent(previewElement);
            Protyle.highlightRender(previewElement, "stage/protyle");
            Protyle.mathRender(previewElement, "stage/protyle", false);
            Protyle.htmlRender(previewElement);
            setTimeout(() => {
                const shadow = document.getElementById("html-block").shadowRoot;
                window.__sourceflowExportRuntimeResult = {
                    scriptRan: window.__sourceflowHtmlScriptRan === true,
                    hasShadow: !!shadow,
                    hasScript: !!shadow && !!shadow.querySelector("script"),
                    hasInlineHandler: /onerror/i.test(previewElement.innerHTML),
                    hasKeptContent: !!shadow && !!shadow.querySelector("#kept"),
                    hasProtyleReferenceError: window.__sourceflowExportErrors.some((message) => /protyle is not defined/i.test(message)),
                    hasProtyleApi: !!window.Protyle && requiredProtyleMethods.every((method) => typeof window.Protyle[method] === "function"),
                    errors: window.__sourceflowExportErrors
                };
            }, 100);
        })().catch((error) => {
            window.__sourceflowExportRuntimeResult = {
                loadError: String(error && (error.message || error) || ""),
                errors: window.__sourceflowExportErrors
            };
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(htmlPath, html);

    const {win, pageDiagnostics} = createWindow(preloadPath);
    win.loadURL(pathToFileURL(htmlPath).href).catch((error) => {
        pageDiagnostics.push(`${error.message}; diagnostics: ${pageDiagnostics.join(" | ")}`);
    });
    const result = await waitForResult(win);

    assert.deepStrictEqual(pageDiagnostics, [], "full export shell must not log load failures");
    assert.strictEqual(result.hasShadow, true, "full export shell must initialize HTML block");
    assert.strictEqual(result.scriptRan, false, "full export shell must not execute note HTML scripts");
    assert.strictEqual(result.hasScript, false, "full export shell must remove HTML block script nodes");
    assert.strictEqual(result.hasInlineHandler, false, "full export shell must remove inline event handlers");
    assert.strictEqual(result.hasKeptContent, true, "full export shell should keep safe content");
    assert.strictEqual(result.hasProtyleReferenceError, false, "full export shell must not emit protyle reference errors");
    assert.strictEqual(result.hasProtyleApi, true, "full export shell must initialize the real Protyle export runtime");
    assert.strictEqual(result.loadError, undefined, "full export shell must not fail to load export runtime scripts");
    assert.deepStrictEqual(result.errors, [], "full export shell must not emit runtime errors");

    win.destroy();
    fs.rmSync(tmpDir, {recursive: true, force: true});
};

const run = async () => {
    await app.whenReady();
    const appRoot = process.env.SOURCEFLOW_EXPORT_RUNTIME_ROOT ?
        path.resolve(process.env.SOURCEFLOW_EXPORT_RUNTIME_ROOT) :
        path.resolve(__dirname, "..");
    const preloadPath = getPreloadPath(appRoot);
    await runHTMLBlockTest(appRoot, preloadPath);
    await runFullExportShellTest(appRoot, preloadPath);
    process.stdout.write("[export-runtime] ok\n");
};

run().then(() => {
    app.exit(0);
}).catch((error) => {
    console.error(error);
    app.exit(1);
});
