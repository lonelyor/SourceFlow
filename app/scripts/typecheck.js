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
            const distDir = path.join(sourceDir, entry.name, "dist");
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

const runMojibakeCheck = () => {
    const checkerPath = path.join(__dirname, "checkMojibake.js");
    const result = spawnSync(process.execPath, [checkerPath], {
        cwd: appRoot,
        stdio: "inherit",
    });

    if (result.error) {
        console.error(result.error);
        return 1;
    }
    return result.status || 0;
};

const runExportGuardCheck = () => {
    const checkerPath = path.join(__dirname, "checkExportGuards.js");
    const result = spawnSync(process.execPath, [checkerPath], {
        cwd: appRoot,
        stdio: "inherit",
    });

    if (result.error) {
        console.error(result.error);
        return 1;
    }
    return result.status || 0;
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

for (const targetName of targetNames) {
    console.log(`\n[typecheck] ${targetName}`);
    exitCode = runTypecheck(targetName);
    if (exitCode !== 0) {
        break;
    }
}
process.exit(exitCode);
