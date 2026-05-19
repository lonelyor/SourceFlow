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

const protyleMenuPath = path.join(appRoot, "src", "menus", "protyle.ts");
const protyleMenuText = fs.readFileSync(protyleMenuPath, "utf8");
const protyleMenuLines = protyleMenuText.split(/\r?\n/).length;
const inlineMenuPath = path.join(appRoot, "src", "menus", "protyleMenu", "inline.ts");
const inlineMenuText = fs.readFileSync(inlineMenuPath, "utf8");
const inlineMenuLines = inlineMenuText.split(/\r?\n/).length;

if (protyleMenuLines > 12) {
    addFinding(protyleMenuPath, "protyle.ts must stay a thin compatibility barrel");
}

if (!/export \* from "\.\/protyleMenu";/.test(protyleMenuText)) {
    addFinding(protyleMenuPath, "protyle.ts must re-export from ./protyleMenu", 'export * from "./protyleMenu";');
}

if (inlineMenuLines > 12) {
    addFinding(inlineMenuPath, "inline.ts must stay a thin compatibility barrel");
}

const inlineRequiredFragments = [
    'export {fileAnnotationRefMenu} from "./inline/fileAnnotationRef";',
    'export {refMenu} from "./inline/ref";',
    'export {linkMenu} from "./inline/link";',
    'export {tagMenu} from "./inline/tag";',
    'export {inlineMathMenu} from "./inline/math";',
];

for (const fragment of inlineRequiredFragments) {
    if (!inlineMenuText.includes(fragment)) {
        addFinding(inlineMenuPath, `inline.ts is missing required re-export (${fragment})`, fragment);
    }
}

const bannedFragments = [
    "export const ",
    "fetchPost(",
    "fetchSyncPost(",
    "new MenuItem(",
    "window.sourceflow.menus.menu.append(",
    "updateTransaction(",
];

for (const fragment of bannedFragments) {
    if (protyleMenuText.includes(fragment)) {
        addFinding(protyleMenuPath, `protyle.ts must not contain implementation code (${fragment})`, fragment);
    }
}

for (const fragment of ["window.sourceflow.menus.menu.append(", "new MenuItem(", "fetchPost("]) {
    if (inlineMenuText.includes(fragment)) {
        addFinding(inlineMenuPath, `inline.ts must not contain implementation code (${fragment})`, fragment);
    }
}

const requiredModules = [
    ["src/menus/protyleMenu/index.ts", "export * from \"./asset\";"],
    ["src/menus/protyleMenu/asset.ts", "export const assetMenu"],
    ["src/menus/protyleMenu/inline.ts", "export {fileAnnotationRefMenu} from \"./inline/fileAnnotationRef\";"],
    ["src/menus/protyleMenu/inline/fileAnnotationRef.ts", "export const fileAnnotationRefMenu"],
    ["src/menus/protyleMenu/inline/ref.ts", "export const refMenu"],
    ["src/menus/protyleMenu/inline/link.ts", "export const linkMenu"],
    ["src/menus/protyleMenu/inline/tag.ts", "export const tagMenu"],
    ["src/menus/protyleMenu/inline/math.ts", "export const inlineMathMenu"],
    ["src/menus/protyleMenu/content.ts", "export const contentMenu"],
    ["src/menus/protyleMenu/navigation.ts", "export const zoomOut"],
    ["src/menus/protyleMenu/media.ts", "export const imgMenu"],
    ["src/menus/protyleMenu/table.ts", "export const tableMenu"],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for protyle menu modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(filePath, `${relativePath} is missing the expected export`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[protyle-menu-modularity] ok");
    process.exit(0);
}

console.error(`[protyle-menu-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
