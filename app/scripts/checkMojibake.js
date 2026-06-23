const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const maxFindings = 100;

const ignoredDirectoryNames = new Set([
    ".git",
    ".opensource-release",
    ".tmp",
    "__pycache__",
    "node_modules",
    "pandoc",
    "stage",
    "third_party",
]);

const ignoredRelativeDirectories = new Set([
    "app/.tmp-tscheck",
    "app/build",
    "app/build-darwin-arm64-portable",
    "app/build-darwin-portable",
    "app/build-linux-arm64-portable",
    "app/build-linux-portable",
    "app/src/types/dist",
    "app/stage/build",
    "browser-extension/sourceflow-web-clipper/dist",
    "electron/dist",
    "marketplace/sourceflow-bazaar/dist",
    "marketplace/sourceflow-bazaar/tmp-import-test",
]);

const ignoredFileExtensions = new Set([
    ".7z",
    ".asar",
    ".bcmap",
    ".bin",
    ".bmp",
    ".db",
    ".dll",
    ".dmg",
    ".DS_Store",
    ".eot",
    ".exe",
    ".gif",
    ".gz",
    ".icns",
    ".ico",
    ".jar",
    ".jpeg",
    ".jpg",
    ".lockb",
    ".log",
    ".map",
    ".mp3",
    ".mp4",
    ".node",
    ".otf",
    ".pdf",
    ".png",
    ".snap",
    ".so",
    ".sqlite",
    ".tar",
    ".tgz",
    ".ttf",
    ".wasm",
    ".webp",
    ".woff",
    ".woff2",
    ".zip",
]);

const textFileExtensions = new Set([
    ".bat",
    ".c",
    ".cc",
    ".cmd",
    ".conf",
    ".cpp",
    ".cs",
    ".css",
    ".csv",
    ".d.ts",
    ".env",
    ".go",
    ".h",
    ".hpp",
    ".htm",
    ".html",
    ".ini",
    ".java",
    ".js",
    ".json",
    ".jsonc",
    ".jsx",
    ".kt",
    ".less",
    ".mjs",
    ".md",
    ".mdx",
    ".mm",
    ".py",
    ".rs",
    ".sass",
    ".scss",
    ".sf",
    ".sh",
    ".sql",
    ".svg",
    ".swift",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".vue",
    ".xml",
    ".yaml",
    ".yml",
]);

const textFileNames = new Set([
    ".dockerignore",
    ".editorconfig",
    ".env",
    ".env.example",
    ".gitattributes",
    ".gitignore",
    "Dockerfile",
    "LICENSE",
    "NOTICE",
    "Versions",
]);

const regexRules = [
    {
        reason: "invalid UTF-8 replacement character",
        regex: /\ufffd/u,
    },
    {
        reason: "private-use glyph usually emitted by GBK mojibake",
        regex: /[\ue000-\uf8ff]/u,
    },
    {
        reason: "Windows-1252/Latin-1 mojibake",
        regex: /(?:\u00c3[\u0080-\u00bf\u00a0-\u00ff]|\u00c2[\u0080-\u00bf\u00a0 ]|\u00e2[\u0080-\u00bf\u20ac\u2122\u0153\u0098-\u009d])/u,
    },
    {
        reason: "replacement mojibake marker",
        regex: /(?:\u951f\u65a4\u62f7|\u951f\u62f7|\u70eb\u70eb|\u5c6f\u5c6f)/u,
    },
];

const cjkMojibakeFragments = [
    "\u9359\u62bd\u656d",
    "\u7ed7\u65c7",
    "\u9354\u3124\u7d94",
    "\u8930\u64b3\u58a0",
    "\u5a0c\u2103\u6e41",
    "\u6769\u65bf\u6d16",
    "\u9359\ue21c\u6564",
    "\u7f01\u64b4\u7049",
    "\u93c2\u677f\u7f13",
    "\u93c4\u5267\u305a",
    "\u95ab\u590a\u5c2f",
    "\u95c5\u612f\u68cc",
    "\u9350\u546d\ue190",
    "\u6d93\u5d88",
    "\u6d63\u72b2\u30bd",
    "\u9422\u3126\u57db",
    "\u93b4\u621c\u6ed1",
    "\u93c2\u56e6\u6b22",
    "\u6769\u6b10\u69f8",
    "\u7039\u6c2b\u7b9f",
    "\u7f03\u6220\u7cb6",
    "\u7459\u55db\ue576",
    "\u93cd\u56ec\ue57d",
    "\u93c3\u5815\u68ff",
    "\u93c8\u5d85\u59df",
];

const escapeRegExp = (value) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const cjkMojibakeRegex = new RegExp(cjkMojibakeFragments.map(escapeRegExp).join("|"), "u");

const getExtension = (filePath) => {
    if (filePath.endsWith(".d.ts")) {
        return ".d.ts";
    }
    return path.extname(filePath);
};

const shouldIgnoreDirectory = (directoryPath, entryName) => {
    const relativePath = path.relative(repoRoot, directoryPath).replace(/\\/g, "/");
    if (ignoredRelativeDirectories.has(relativePath)) {
        return true;
    }
    if ((relativePath.startsWith("examples/") || relativePath.startsWith("plugins/")) && entryName === "dist") {
        return true;
    }
    if (/^\.typecheck-/.test(entryName) && path.dirname(directoryPath) === appRoot) {
        return true;
    }
    return ignoredDirectoryNames.has(entryName);
};

const isTextPath = (filePath) => {
    return textFileExtensions.has(getExtension(filePath)) || textFileNames.has(path.basename(filePath));
};

const shouldIgnoreFile = (filePath) => {
    return ignoredFileExtensions.has(getExtension(filePath));
};

const looksBinary = (buffer) => {
    const sampleSize = Math.min(buffer.length, 4096);
    if (sampleSize === 0) {
        return false;
    }

    let controlCount = 0;
    for (let i = 0; i < sampleSize; i++) {
        const byte = buffer[i];
        if (byte === 0) {
            return true;
        }
        if (byte < 8 || (byte > 13 && byte < 32)) {
            controlCount++;
        }
    }
    return controlCount / sampleSize > 0.05;
};

const isLikelyUtf16WithoutBom = (buffer) => {
    const sampleSize = Math.min(buffer.length, 200);
    if (sampleSize < 16) {
        return false;
    }

    let evenZeroes = 0;
    let oddZeroes = 0;
    for (let i = 0; i < sampleSize; i++) {
        if (buffer[i] !== 0) {
            continue;
        }
        if (i % 2 === 0) {
            evenZeroes++;
        } else {
            oddZeroes++;
        }
    }
    return evenZeroes > sampleSize * 0.3 || oddZeroes > sampleSize * 0.3;
};

const normalizeSnippet = (line, column) => {
    const start = Math.max(0, column - 35);
    const end = Math.min(line.length, column + 45);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < line.length ? "..." : "";
    return `${prefix}${line.slice(start, end)}${suffix}`.replace(/\t/g, " ");
};

const checkText = (text) => {
    const findings = [];
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        for (const rule of regexRules) {
            const match = rule.regex.exec(line);
            if (!match) {
                continue;
            }
            findings.push({
                line: index + 1,
                column: match.index + 1,
                reason: rule.reason,
                snippet: normalizeSnippet(line, match.index),
            });
        }

        const cjkMatch = cjkMojibakeRegex.exec(line);
        if (cjkMatch) {
            findings.push({
                line: index + 1,
                column: cjkMatch.index + 1,
                reason: "UTF-8 text decoded as GBK mojibake",
                snippet: normalizeSnippet(line, cjkMatch.index),
            });
        }
    }
    return findings;
};

const walk = (directoryPath, files) => {
    for (const entry of fs.readdirSync(directoryPath, {withFileTypes: true})) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            if (!shouldIgnoreDirectory(entryPath, entry.name)) {
                walk(entryPath, files);
            }
            continue;
        }

        if (entry.isFile()) {
            files.push(entryPath);
        }
    }
};

const collectGitFiles = () => {
    const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
        cwd: repoRoot,
        encoding: "utf8",
    });
    if (result.error || result.status !== 0) {
        return null;
    }

    return result.stdout.split("\0")
        .filter(Boolean)
        .map((filePath) => path.join(repoRoot, filePath));
};

const isIgnoredByPath = (filePath) => {
    let currentPath = path.dirname(filePath);
    while (currentPath.startsWith(repoRoot)) {
        const entryName = path.basename(currentPath);
        if (shouldIgnoreDirectory(currentPath, entryName)) {
            return true;
        }
        if (currentPath === repoRoot) {
            break;
        }
        currentPath = path.dirname(currentPath);
    }
    return false;
};

const checkFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    if (shouldIgnoreFile(filePath)) {
        return [];
    }

    const textPath = isTextPath(filePath);
    const buffer = fs.readFileSync(filePath);
    if (!textPath && looksBinary(buffer)) {
        return [];
    }

    if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))) {
        return [{
            line: 1,
            column: 1,
            reason: "UTF-16 text file; save as UTF-8",
            snippet: path.basename(filePath),
        }];
    }

    if (textPath && isLikelyUtf16WithoutBom(buffer)) {
        return [{
            line: 1,
            column: 1,
            reason: "possible UTF-16 text file; save as UTF-8",
            snippet: path.basename(filePath),
        }];
    }

    if (!textPath && looksBinary(buffer)) {
        return [];
    }

    return checkText(buffer.toString("utf8"));
};

const runScan = () => {
    let files = collectGitFiles();
    const findings = [];
    if (!files) {
        files = [];
        walk(repoRoot, files);
    }

    for (const filePath of files) {
        if (isIgnoredByPath(filePath)) {
            continue;
        }
        const fileFindings = checkFile(filePath);
        if (fileFindings.length === 0) {
            continue;
        }

        for (const finding of fileFindings) {
            findings.push({filePath, ...finding});
            if (findings.length >= maxFindings) {
                break;
            }
        }
        if (findings.length >= maxFindings) {
            break;
        }
    }

    if (findings.length === 0) {
        console.log("[mojibake] ok");
        return 0;
    }

    console.error(`[mojibake] found ${findings.length}${findings.length === maxFindings ? "+" : ""} suspicious text issue(s):`);
    for (const finding of findings) {
        const relativePath = path.relative(repoRoot, finding.filePath).replace(/\\/g, "/");
        console.error(`${relativePath}:${finding.line}:${finding.column} ${finding.reason}`);
        console.error(`  ${finding.snippet}`);
    }
    return 1;
};

const fromCodePoints = (...codePoints) => {
    return String.fromCodePoint(...codePoints);
};

const runSelfTest = () => {
    const badSamples = [
        fromCodePoints(0xfffd),
        fromCodePoints(0x00c3, 0x00a9),
        fromCodePoints(0x00e2, 0x20ac, 0x2122),
        fromCodePoints(0x951f, 0x65a4, 0x62f7),
        fromCodePoints(0x9359, 0x62bd, 0x656d, 0x41, 0x49, 0x7ed7, 0x65c7, 0xe187),
    ];
    const goodSamples = [
        "AI 没有返回可用结果",
        "技能笔记",
        "当前笔记",
        "中文标点：，。！？",
        "Nauru locale entry",
    ];

    const missedBadSample = badSamples.find((sample) => checkText(sample).length === 0);
    if (missedBadSample) {
        console.error("[mojibake:self-test] detector missed a bad sample");
        return 1;
    }

    const rejectedGoodSample = goodSamples.find((sample) => checkText(sample).length !== 0);
    if (rejectedGoodSample) {
        console.error(`[mojibake:self-test] detector rejected a good sample: ${rejectedGoodSample}`);
        return 1;
    }

    console.log("[mojibake:self-test] ok");
    return 0;
};

if (process.argv.includes("--self-test")) {
    process.exit(runSelfTest());
}

process.exit(runScan());
