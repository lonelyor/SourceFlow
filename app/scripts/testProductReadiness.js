const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const projectRoot = path.join(appRoot, "..");

const failures = [];

const toRepoPath = (filePath) => path.relative(projectRoot, filePath).replace(/\\/g, "/");

const fail = (message) => {
    failures.push(message);
};

const ensure = (condition, message) => {
    if (!condition) {
        fail(message);
    }
};

const readText = (relativePath) => {
    const filePath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        fail(`${relativePath} is missing`);
        return "";
    }
    return fs.readFileSync(filePath, "utf8");
};

const readJson = (relativePath) => {
    const text = readText(relativePath);
    if (!text) {
        return {};
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(`${relativePath} is not valid JSON: ${error.message}`);
        return {};
    }
};

const ensureFile = (relativePath) => {
    const filePath = path.join(projectRoot, relativePath);
    ensure(fs.existsSync(filePath) && fs.statSync(filePath).isFile(), `${relativePath} must exist`);
};

const checkVersionConsistency = () => {
    const appPackage = readJson("app/package.json");
    const appVersion = String(appPackage.version || "");
    ensure(/^\d+\.\d+\.\d+$/.test(appVersion), "app/package.json version must use x.y.z format");

    const workingGo = readText("kernel/util/working.go");
    const kernelVersion = workingGo.match(/\bVer\s*=\s*"([^"]+)"/)?.[1] || "";
    ensure(kernelVersion === appVersion, `kernel/util/working.go Ver (${kernelVersion}) must match app version (${appVersion})`);

    for (const manifestPath of ["app/appx/AppxManifest.xml", "app/appx/AppxManifest-arm64.xml"]) {
        const manifest = readText(manifestPath);
        const manifestVersion = manifest.match(/\bVersion="([^"]+)"/)?.[1] || "";
        ensure(manifestVersion === `${appVersion}.0`, `${manifestPath} Version (${manifestVersion}) must match ${appVersion}.0`);
    }

    ensure(readText("CHANGELOG.md").includes(`## [${appVersion}]`), `CHANGELOG.md must contain ${appVersion}`);
    ensureFile(`app/changelogs/v${appVersion}/v${appVersion}.md`);
    ensureFile(`app/changelogs/v${appVersion}/v${appVersion}_zh_CN.md`);
};

const checkPlansAreClosed = () => {
    const todoPath = "plans/todo.md";
    const todo = readText(todoPath);
    const unchecked = todo
        .split(/\r?\n/)
        .filter((line) => /^\s*-\s+\[\s\]/.test(line));
    if (unchecked.length > 0) {
        fail(`${todoPath} has unchecked tasks:\n${unchecked.map((line) => `  ${line}`).join("\n")}`);
    }
};

const checkQualityScripts = () => {
    const appPackage = readJson("app/package.json");
    const rootPackage = readJson("package.json");
    const appScripts = appPackage.scripts || {};
    const rootScripts = rootPackage.scripts || {};

    ensure(appScripts["lint:check"] === "eslint . --cache", "app/package.json must expose lint:check without --fix");
    ensure(appScripts["test:product-readiness"] === "node ./scripts/testProductReadiness.js", "app/package.json must expose test:product-readiness");
    ensure(appScripts["test:product-resilience"] === "node ./scripts/testProductResilienceMatrix.js", "app/package.json must expose test:product-resilience");
    ensure(appScripts["test:lint-budget"] === "node ./scripts/testLintBudget.js", "app/package.json must expose test:lint-budget");
    ensure(rootScripts["test:product-readiness"] === "node ./app/scripts/testProductReadiness.js", "root package.json must expose test:product-readiness");
    ensure(rootScripts["test:product-resilience"] === "node ./app/scripts/testProductResilienceMatrix.js", "root package.json must expose test:product-resilience");
    ensure(rootScripts["test:lint-budget"] === "node ./app/scripts/testLintBudget.js", "root package.json must expose test:lint-budget");
    ensure(String(rootScripts["test:stability"] || "").includes("--stability-gate-only"), "root package.json test:stability must run the stability gate");
};

const checkCriticalFrontendRegressions = () => {
    const typecheck = readText("app/scripts/typecheck.js");
    const requiredTypecheckScripts = [
        "testAIDockRuntimeBehavior.js",
        "testAssistantInputStability.js",
        "testProductResilienceMatrix.js",
        "testAssistantSecrets.js",
        "testHomepageModules.js",
        "testPluginSandboxRuntime.js",
        "testProtyleBlockDOMPreservation.js",
        "testProtylePasteSelectionSafety.js",
        "testFileTreeAppearanceSettings.js",
        "testWorkbenchStability.js",
        "testStructureGuideBugfix.js",
    ];
    for (const scriptName of requiredTypecheckScripts) {
        ensure(typecheck.includes(scriptName), `typecheck.js must run ${scriptName}`);
    }

    const appScripts = readJson("app/package.json").scripts || {};
    const requiredScripts = [
        "test:ai-dock-runtime",
        "test:assistant-input-stability",
        "test:product-resilience",
        "test:lint-budget",
        "test:assistant-secrets",
        "test:homepage-modules",
        "test:protyle-blockdom-preservation",
        "test:protyle-paste-selection-safety",
        "test:file-tree-appearance-settings",
        "test:workbench-stability",
        "test:editor-structure-guide",
        "test:editor-structure-guide-bugfix",
    ];
    for (const scriptName of requiredScripts) {
        ensure(scriptName in appScripts, `app/package.json must expose ${scriptName}`);
    }
};

const checkQualityDocs = () => {
    const testing = readText("docs/TESTING.md");
    const productQuality = readText("docs/PRODUCT_QUALITY.md");
    const requiredMarkers = [
        "test:product-readiness",
        "test:product-resilience",
        "test:lint-budget",
        "lint:check",
        "python 编译.py --stability-gate-only",
    ];
    for (const marker of requiredMarkers) {
        ensure(testing.includes(marker), `docs/TESTING.md must mention ${marker}`);
        ensure(productQuality.includes(marker), `docs/PRODUCT_QUALITY.md must mention ${marker}`);
    }
};

checkVersionConsistency();
checkPlansAreClosed();
checkQualityScripts();
checkCriticalFrontendRegressions();
checkQualityDocs();

if (failures.length > 0) {
    console.error("[product-readiness] failed");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}

console.log(`[product-readiness] ok (${toRepoPath(projectRoot) || "."})`);
