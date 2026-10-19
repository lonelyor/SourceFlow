const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");
const scanRoots = [
    path.join(projectRoot, "kernel"),
    path.join(projectRoot, "app", "src"),
    path.join(projectRoot, "app", "electron"),
];
const scanFiles = [
    path.join(projectRoot, "scripts", "portable-build.js"),
    path.join(projectRoot, "编译.py"),
];
const forbidden = [
    ["Add", "MpPreference"].join("-"),
    ["MicrosoftDefender", "Excluded"].join(""),
    ["AddMicrosoftDefender", "Exclusion"].join(""),
    ["AutoCheckMicrosoft", "DefenderJob"].join(""),
    ["elevator", "-amd64.exe"].join(""),
];
const extensions = new Set([".go", ".js", ".ts", ".tsx"]);

const collectFiles = (directory) => {
    const files = [];
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        if (["node_modules", "build", "dist"].includes(entry.name)) {
            continue;
        }
        const currentPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(currentPath));
        } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
            files.push(currentPath);
        }
    }
    return files;
};

const violations = [];
for (const filePath of [...scanRoots.flatMap(collectFiles), ...scanFiles]) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const token of forbidden) {
        if (content.includes(token)) {
            violations.push(`${path.relative(projectRoot, filePath)} contains ${token}`);
        }
    }
}

if (violations.length > 0) {
    console.error("Defender exclusion code must not be shipped:");
    for (const violation of violations) {
        console.error(`- ${violation}`);
    }
    process.exit(1);
}

console.log("Defender exclusion removal checks passed");
