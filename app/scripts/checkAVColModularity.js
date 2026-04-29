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

const colPath = path.join(appRoot, "src", "protyle", "render", "av", "col.ts");
const colText = fs.readFileSync(colPath, "utf8");
const colLines = colText.split(/\r?\n/).length;

if (colLines > 20) {
    addFinding(colPath, "av/col.ts must stay a thin compatibility barrel");
}

const requiredBarrelFragments = [
    'export {getColId, genColDataByType, getColIconByType, getColNameByType} from "./colLookups";',
    'export {bindEditEvent, getEditHTML} from "./colEdit";',
    'export {addCol, duplicateCol, removeCol, removeColByMenu} from "./colMutations";',
    'export {showColMenu} from "./colMenu";',
];

for (const fragment of requiredBarrelFragments) {
    if (!colText.includes(fragment)) {
        addFinding(colPath, `av/col.ts is missing required re-export (${fragment})`, fragment);
    }
}

const bannedBarrelFragments = [
    "export const getColId =",
    "export const bindEditEvent =",
    "export const showColMenu =",
    "export const addCol =",
];

for (const fragment of bannedBarrelFragments) {
    if (colText.includes(fragment)) {
        addFinding(colPath, `av/col.ts must not inline extracted logic (${fragment})`, fragment);
    }
}

const requiredModules = [
    ["src/protyle/render/av/colLookups.ts", "export const getColId ="],
    ["src/protyle/render/av/colLookups.ts", "export const getColNameByType ="],
    ["src/protyle/render/av/colLookups.ts", "export const getColIconByType ="],
    ["src/protyle/render/av/colLookups.ts", "export const genColDataByType ="],
    ["src/protyle/render/av/colEdit.ts", "export const getEditHTML ="],
    ["src/protyle/render/av/colEdit.ts", "export const bindEditEvent ="],
    ["src/protyle/render/av/colMutations.ts", 'export {addCol} from "./colMutationAdd";'],
    ["src/protyle/render/av/colMutations.ts", 'export {addAttrViewColAnimation} from "./colMutationAnimation";'],
    ["src/protyle/render/av/colMutations.ts", 'export {duplicateCol} from "./colMutationDuplicate";'],
    ["src/protyle/render/av/colMutations.ts", 'export {removeCol, removeColByMenu} from "./colMutationRemove";'],
    ["src/protyle/render/av/colMutationAnimation.ts", "export const addAttrViewColAnimation ="],
    ["src/protyle/render/av/colMutationDuplicate.ts", "export const duplicateCol ="],
    ["src/protyle/render/av/colMutationRemove.ts", "export const removeCol ="],
    ["src/protyle/render/av/colMutationRemove.ts", "export const removeColByMenu ="],
    ["src/protyle/render/av/colMutationAdd.ts", "export const addCol ="],
    ["src/protyle/render/av/colMutationAdd.ts", 'import {getBuiltinAddColSpecs} from "./colMutationAddConfig";'],
    ["src/protyle/render/av/colMutationAddConfig.ts", "export const getBuiltinAddColSpecs ="],
    ["src/protyle/render/av/colMenu.ts", 'export {showColMenu} from "./colMenuRuntime";'],
    ["src/protyle/render/av/colMenuRuntime.ts", "export const showColMenu ="],
    ["src/protyle/render/av/colMenuRuntime.ts", 'import {addCol, duplicateCol, removeColByMenu} from "./colMutations";'],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for av col modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(filePath, `${relativePath} is missing the expected fragment`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[av-col-modularity] ok");
    process.exit(0);
}

console.error(`[av-col-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
