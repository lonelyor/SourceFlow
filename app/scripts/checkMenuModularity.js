const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");

const findings = [];

const addFinding = (filePath, message, pattern = "") => {
    const text = fs.readFileSync(filePath, "utf8");
    const index = pattern ? text.indexOf(pattern) : 0;
    const before = text.slice(0, Math.max(0, index));
    const line = before.split(/\r?\n/).length;
    findings.push({
        filePath,
        line,
        message,
    });
};

const toRepoPath = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/");

const commonMenuItemPath = path.join(appRoot, "src", "menus", "commonMenuItem.ts");
const commonMenuItemText = fs.readFileSync(commonMenuItemPath, "utf8");
const commonMenuItemLines = commonMenuItemText.split(/\r?\n/).length;

if (commonMenuItemLines > 12) {
    addFinding(commonMenuItemPath, "commonMenuItem.ts must stay a thin compatibility barrel");
}

if (!/export \* from "\.\/common";/.test(commonMenuItemText)) {
    addFinding(commonMenuItemPath, "commonMenuItem.ts must re-export from ./common", 'export * from "./common";');
}

const bannedFragments = [
    "fetchPost(",
    "fetchSyncPost(",
    "new Dialog(",
    "dayjs(",
    "new MenuItem(",
    "runAsyncMenuAction(",
];

for (const fragment of bannedFragments) {
    if (commonMenuItemText.includes(fragment)) {
        addFinding(commonMenuItemPath, `commonMenuItem.ts must not contain implementation code (${fragment})`, fragment);
    }
}

const requiredModules = [
    ["src/menus/common/index.ts", "export {openWechatNotify, openFileWechatNotify} from \"./reminders\";"],
    ["src/menus/common/reminders.ts", "export const openWechatNotify"],
    ["src/menus/common/attributes.ts", "export const openFileAttr"],
    ["src/menus/common/copy.ts", "export const copySubMenu"],
    ["src/menus/common/export.ts", "export const exportMd"],
    ["src/menus/common/open.ts", "export const openMenu"],
    ["src/menus/common/file.ts", "export const renameMenu"],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for menu modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(filePath, `${relativePath} is missing the expected export`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[menu-modularity] ok");
    process.exit(0);
}

console.error(`[menu-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
