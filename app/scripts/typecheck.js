const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");
const {parse} = require("ifdef-loader/preprocessor");

const appRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(appRoot, "src");
const targets = {
    app: {
        defs: {BROWSER: false, MOBILE: false},
        entries: ["src/index.ts", "src/window/index.ts"],
    },
    desktop: {
        defs: {BROWSER: true, MOBILE: false},
        entries: ["src/index.ts"],
    },
    mobile: {
        defs: {BROWSER: true, MOBILE: true},
        entries: ["src/mobile/index.ts"],
    },
    export: {
        defs: {BROWSER: true, MOBILE: true},
        entries: ["src/protyle/method.ts"],
    },
};

const requestedTarget = process.argv[2] || "all";
const targetNames = requestedTarget === "all" ? Object.keys(targets) : [requestedTarget];

for (const targetName of targetNames) {
    if (!targets[targetName]) {
        console.error(`Unknown typecheck target: ${targetName}`);
        process.exit(1);
    }
}

const shouldProcessTextFile = (filePath) => {
    return filePath.endsWith(".ts") || filePath.endsWith(".tsx") || filePath.endsWith(".d.ts");
};

const copyProcessedSourceTree = (sourceDir, targetDir, defs) => {
    for (const entry of fs.readdirSync(sourceDir, {withFileTypes: true})) {
        if (entry.name === "types" && sourceDir === srcRoot) {
            const targetTypesDir = path.join(targetDir, entry.name);
            fs.mkdirSync(targetTypesDir, {recursive: true});
            for (const typeEntry of fs.readdirSync(path.join(sourceDir, entry.name), {withFileTypes: true})) {
                if (typeEntry.name === "dist") {
                    continue;
                }
                const typeEntrySource = path.join(sourceDir, entry.name, typeEntry.name);
                const typeEntryTarget = path.join(targetTypesDir, typeEntry.name);
                if (typeEntry.isDirectory()) {
                    fs.mkdirSync(typeEntryTarget, {recursive: true});
                    copyProcessedSourceTree(typeEntrySource, typeEntryTarget, defs);
                } else if (typeEntry.isFile()) {
                    const content = fs.readFileSync(typeEntrySource, "utf8");
                    const nextContent = shouldProcessTextFile(typeEntrySource) ? parse(content, defs, false, true, typeEntrySource) : content;
                    fs.writeFileSync(typeEntryTarget, nextContent);
                }
            }
            continue;
        }

        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            fs.mkdirSync(targetPath, {recursive: true});
            copyProcessedSourceTree(sourcePath, targetPath, defs);
            continue;
        }

        if (!entry.isFile()) {
            continue;
        }

        if (!shouldProcessTextFile(sourcePath)) {
            continue;
        }

        const content = fs.readFileSync(sourcePath, "utf8");
        const nextContent = parse(content, defs, false, true, sourcePath);
        fs.writeFileSync(targetPath, nextContent);
    }
};

const collectTypeDefinitionFiles = (typesDir) => {
    const files = [];
    for (const entry of fs.readdirSync(typesDir, {withFileTypes: true})) {
        const currentPath = path.join(typesDir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "dist") {
                continue;
            }
            files.push(...collectTypeDefinitionFiles(currentPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith(".d.ts")) {
            files.push(currentPath);
        }
    }
    return files;
};

const buildTsconfig = (tempDir, targetName) => {
    const target = targets[targetName];
    const typeFiles = collectTypeDefinitionFiles(path.join(tempDir, "src", "types"));
    return {
        compilerOptions: {
            noImplicitAny: true,
            module: "commonjs",
            moduleResolution: "node",
            target: "es2021",
            lib: ["DOM", "DOM.Iterable", "ES2021"],
            typeRoots: [path.join(appRoot, "node_modules/@types")],
            types: ["node"],
            noEmit: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
        },
        files: [
            ...typeFiles,
            ...target.entries.map((entry) => path.join(tempDir, entry)),
        ],
        exclude: [path.join(appRoot, "node_modules/**/*")],
    };
};

const runNodeScript = (fileName) => {
    const scriptPath = path.join(__dirname, fileName);
    const result = spawnSync(process.execPath, [scriptPath], {
        cwd: appRoot,
        stdio: "inherit",
    });

    if (result.error) {
        console.error(result.error);
        return 1;
    }
    return result.status || 0;
};

const runMojibakeCheck = () => {
    return runNodeScript("checkMojibake.js");
};

const runExportGuardCheck = () => {
    return runNodeScript("checkExportGuards.js");
};

const runScriptRuntimeGuardCheck = () => {
    return runNodeScript("checkScriptRuntimeGuards.js");
};

const runMenuModularityCheck = () => {
    return runNodeScript("checkMenuModularity.js");
};

const runProtyleMenuModularityCheck = () => {
    return runNodeScript("checkProtyleMenuModularity.js");
};

const runGutterModularityCheck = () => {
    return runNodeScript("checkGutterModularity.js");
};

const runWysiwygModularityCheck = () => {
    return runNodeScript("checkWysiwygModularity.js");
};

const runKeydownModularityCheck = () => {
    return runNodeScript("checkKeydownModularity.js");
};

const runAVColModularityCheck = () => {
    return runNodeScript("checkAVColModularity.js");
};

const runAVCellModularityCheck = () => {
    return runNodeScript("checkAVCellModularity.js");
};

const runAVPanelModularityCheck = () => {
    return runNodeScript("checkAVPanelModularity.js");
};

const runAVHeavyModularityCheck = () => {
    return runNodeScript("checkAVHeavyModularity.js");
};

const runAVRuntimeModularityCheck = () => {
    return runNodeScript("checkAVRuntimeModularity.js");
};

const runSystemRuntimeModularityCheck = () => {
    return runNodeScript("checkSystemRuntimeModularity.js");
};

const runToolbarModularityCheck = () => {
    return runNodeScript("checkToolbarModularity.js");
};

const runAVPanelModuleTest = () => {
    return runNodeScript("testAVPanelModules.js");
};

const runAVPanelHandlerCoverageTest = () => {
    return runNodeScript("testAVPanelHandlerCoverage.js");
};

const runAVHeavyModuleTest = () => {
    return runNodeScript("testAVHeavyModules.js");
};

const runAVCellColModuleTest = () => {
    return runNodeScript("testAVCellColModules.js");
};

const runAVCellCoverageTest = () => {
    return runNodeScript("testAVCellCoverage.js");
};

const runAVRuntimeModuleTest = () => {
    return runNodeScript("testAVRuntimeModules.js");
};

const runAVRuntimeCoverageTest = () => {
    return runNodeScript("testAVRuntimeCoverage.js");
};

const runSystemRuntimeModuleTest = () => {
    return runNodeScript("testSystemRuntimeModules.js");
};

const runAIDockRuntimeBehaviorTest = () => {
    return runNodeScript("testAIDockRuntimeBehavior.js");
};

const runAssistantSecretsTest = () => {
    return runNodeScript("testAssistantSecrets.js");
};

const runAssistantInputStabilityTest = () => {
    return runNodeScript("testAssistantInputStability.js");
};

const runProductResilienceMatrixTest = () => {
    return runNodeScript("testProductResilienceMatrix.js");
};

const runToolbarInlineMarkModuleTest = () => {
    return runNodeScript("testToolbarInlineMarkModules.js");
};

const runTransactionModularityCheck = () => {
    return runNodeScript("checkTransactionModularity.js");
};

const runSandboxRuntimeHelperTest = () => {
    return runNodeScript("testSandboxRuntimeHelpers.js");
};

const runHomepageModuleTest = () => {
    return runNodeScript("testHomepageModules.js");
};

const runPluginSandboxRuntimeTest = () => {
    return runNodeScript("testPluginSandboxRuntime.js");
};

const runKeymapConsistencyTest = () => {
    return runNodeScript("testKeymapConsistency.js");
};

const runExportBuilderTest = () => {
    return runNodeScript("testExportBuilders.js");
};

const runFileTreeActiveDocTest = () => {
    return runNodeScript("testFileTreeActiveDoc.js");
};

const runProtyleBlockDOMPreservationTest = () => {
    return runNodeScript("testProtyleBlockDOMPreservation.js");
};

const runProtylePasteSelectionSafetyTest = () => {
    return runNodeScript("testProtylePasteSelectionSafety.js");
};

const runEditorStructureGuideTest = () => {
    return runNodeScript("testEditorStructureGuide.js");
};

const runEditorStructureGuideBugfixTest = () => {
    return runNodeScript("testStructureGuideBugfix.js");
};

const runFileTreeAppearanceSettingsTest = () => {
    return runNodeScript("testFileTreeAppearanceSettings.js");
};

const runWorkbenchStabilityTest = () => {
    return runNodeScript("testWorkbenchStability.js");
};

const runTypecheck = (targetName) => {
    const tempDir = fs.mkdtempSync(path.join(appRoot, `.typecheck-${targetName}-`));
    const tempSrcDir = path.join(tempDir, "src");
    fs.mkdirSync(tempSrcDir, {recursive: true});

    try {
        copyProcessedSourceTree(srcRoot, tempSrcDir, targets[targetName].defs);
        const tempTsconfigPath = path.join(tempDir, "tsconfig.json");
        fs.writeFileSync(tempTsconfigPath, `${JSON.stringify(buildTsconfig(tempDir, targetName), null, 2)}\n`);

        const tscCliPath = require.resolve("typescript/bin/tsc", {paths: [appRoot]});
        const result = spawnSync(process.execPath, [tscCliPath, "-p", tempTsconfigPath, "--pretty", "false"], {
            cwd: appRoot,
            stdio: "inherit",
        });

        if (result.error) {
            console.error(result.error);
            return 1;
        }
        if (result.status !== 0) {
            return result.status || 1;
        }
        return 0;
    } finally {
        fs.rmSync(tempDir, {recursive: true, force: true});
    }
};

console.log("\n[typecheck] mojibake");
let exitCode = runMojibakeCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] export guards");
exitCode = runExportGuardCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] script runtime guards");
exitCode = runScriptRuntimeGuardCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] menu modularity");
exitCode = runMenuModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] protyle menu modularity");
exitCode = runProtyleMenuModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] gutter modularity");
exitCode = runGutterModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] wysiwyg modularity");
exitCode = runWysiwygModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] keydown modularity");
exitCode = runKeydownModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av col modularity");
exitCode = runAVColModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av cell modularity");
exitCode = runAVCellModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av panel modularity");
exitCode = runAVPanelModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av heavy modularity");
exitCode = runAVHeavyModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av runtime modularity");
exitCode = runAVRuntimeModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] system runtime modularity");
exitCode = runSystemRuntimeModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av panel modules");
exitCode = runAVPanelModuleTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av heavy modules");
exitCode = runAVHeavyModuleTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av cell/col modules");
exitCode = runAVCellColModuleTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av cell coverage");
exitCode = runAVCellCoverageTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av runtime modules");
exitCode = runAVRuntimeModuleTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av runtime coverage");
exitCode = runAVRuntimeCoverageTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] system runtime modules");
exitCode = runSystemRuntimeModuleTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] ai dock runtime");
exitCode = runAIDockRuntimeBehaviorTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] assistant secrets");
exitCode = runAssistantSecretsTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] assistant input stability");
exitCode = runAssistantInputStabilityTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] product resilience");
exitCode = runProductResilienceMatrixTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] av panel handler coverage");
exitCode = runAVPanelHandlerCoverageTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] toolbar modularity");
exitCode = runToolbarModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] toolbar inline mark modules");
exitCode = runToolbarInlineMarkModuleTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] transaction modularity");
exitCode = runTransactionModularityCheck();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] sandbox runtime helpers");
exitCode = runSandboxRuntimeHelperTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] homepage modules");
exitCode = runHomepageModuleTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] plugin sandbox runtime");
exitCode = runPluginSandboxRuntimeTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] export builders");
exitCode = runExportBuilderTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] keymap consistency");
exitCode = runKeymapConsistencyTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] file tree active doc tracking");
exitCode = runFileTreeActiveDocTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] protyle block dom preservation");
exitCode = runProtyleBlockDOMPreservationTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] protyle paste selection safety");
exitCode = runProtylePasteSelectionSafetyTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] editor structure guide");
exitCode = runEditorStructureGuideTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] editor structure guide bugfix");
exitCode = runEditorStructureGuideBugfixTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] file tree appearance settings");
exitCode = runFileTreeAppearanceSettingsTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

console.log("\n[typecheck] workbench stability");
exitCode = runWorkbenchStabilityTest();
if (exitCode !== 0) {
    process.exit(exitCode);
}

for (const targetName of targetNames) {
    console.log(`\n[typecheck] ${targetName}`);
    exitCode = runTypecheck(targetName);
    if (exitCode !== 0) {
        break;
    }
}
process.exit(exitCode);
