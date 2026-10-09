const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");

const findings = [];

const toRepoPath = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/");

const readAppFile = (relativePath) => {
    return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
};

const addFinding = (relativePath, message, pattern) => {
    const filePath = path.join(appRoot, relativePath);
    const text = fs.readFileSync(filePath, "utf8");
    const index = typeof pattern === "string" ? text.indexOf(pattern) : (pattern ? (text.match(pattern)?.index ?? 0) : 0);
    const before = text.slice(0, Math.max(0, index));
    const line = before.split(/\r?\n/).length;
    findings.push({
        filePath,
        line,
        message,
    });
};

const ensureContains = (relativePath, fragment, message) => {
    const text = readAppFile(relativePath);
    if (!text.includes(fragment)) {
        addFinding(relativePath, message, fragment);
    }
};

const ensureNotContains = (relativePath, fragment, message) => {
    const text = readAppFile(relativePath);
    if (text.includes(fragment)) {
        addFinding(relativePath, message, fragment);
    }
};

const ensureMissing = (relativePath, message) => {
    const filePath = path.join(appRoot, relativePath);
    if (fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message,
        });
    }
};

const checkDirectDynamicExecutionGuards = () => {
    ensureContains("src/protyle/render/blockRender.ts", "runEmbedQueryScript", "Embed block rendering must use the isolated embed script runtime");
    ensureNotContains("src/protyle/render/blockRender.ts", "new Function(", "Embed block rendering must not execute scripts with new Function");
    ensureNotContains("src/protyle/render/blockRender.ts", "fetchSyncPost", "Embed block rendering must not pass raw fetchSyncPost into note scripts");

    ensureContains("src/homepage/runtime.ts", "尚未创建主页", "Homepage empty state must stay inside the note-homepage flow");
    ensureContains("src/homepage/actions.ts", "openFileById", "Homepage must open the bound note through the regular editor path");
    ensureNotContains("src/homepage/runtime.ts", "runHomepageTemplateScript", "Homepage must not run template scripts");
    ensureNotContains("src/homepage/runtime.ts", "new Function(", "Homepage rendering must not execute scripts with new Function");
    ensureMissing("src/homepage/templateScriptRuntime.ts", "Homepage template script runtime must remain removed");

    ensureContains("src/protyle/render/embedScriptRuntime.ts", "createReadOnlyKernelFetch", "Embed script runtime must gate kernel access behind a read-only fetch wrapper");
    ensureContains("src/protyle/render/embedScriptRuntime.ts", "normalizeEmbedScriptResult", "Embed script runtime must validate returned include IDs");
    ensureContains("src/plugin/loader.ts", "executePluginModule", "Plugin loader must delegate script execution to the shared plugin sandbox runtime");
    ensureContains("src/plugin/runtimeSandbox.ts", "runSandboxedScript", "Plugin sandbox runtime must use the shared sandbox executor");
    ensureContains("src/sandbox/runtime.ts", "DEFAULT_SANDBOX_SHADOW_NAMES", "Sandbox runtime must shadow dangerous globals");
    ensureContains("src/sandbox/runtime.ts", "createProtectedCallable", "Sandbox runtime must protect callable escape hatches");
    ensureContains("src/sandbox/kernelApi.ts", "assertReadOnlyKernelAPIPath", "Sandbox kernel wrapper must validate read-only API paths");
};

const checkEvalLocations = () => {
    const files = [];
    const walk = (directoryPath) => {
        for (const entry of fs.readdirSync(directoryPath, {withFileTypes: true})) {
            const entryPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "types" || entry.name === "build") {
                    continue;
                }
                walk(entryPath);
                continue;
            }
            if (entry.isFile() && /\.(ts|tsx|js)$/.test(entry.name)) {
                files.push(entryPath);
            }
        }
    };
    walk(path.join(appRoot, "src"));
    const allowedEvalFiles = new Set([
        path.join(appRoot, "src", "sandbox", "runtime.ts"),
    ]);
    files.forEach((filePath) => {
        const text = fs.readFileSync(filePath, "utf8");
        if (text.includes("window.eval(") && !allowedEvalFiles.has(filePath)) {
            addFinding(path.relative(appRoot, filePath), "window.eval usage is only allowed in the shared sandbox runtime", "window.eval(");
        }
        if (text.includes("new Function(")) {
            addFinding(path.relative(appRoot, filePath), "new Function must not be used in app runtime source", "new Function(");
        }
    });
};

checkDirectDynamicExecutionGuards();
checkEvalLocations();

if (findings.length === 0) {
    console.log("[script-runtime-guards] ok");
    process.exit(0);
}

console.error(`[script-runtime-guards] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
