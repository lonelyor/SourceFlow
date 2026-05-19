const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const findings = [];

const toRepoPath = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/");

const addFinding = (relativePath, message, pattern = "") => {
    const filePath = path.join(appRoot, relativePath);
    const text = fs.readFileSync(filePath, "utf8");
    const index = pattern ? text.indexOf(pattern) : 0;
    const before = text.slice(0, Math.max(0, index));
    findings.push({
        filePath,
        line: before.split(/\r?\n/).length,
        message,
    });
};

const checkThinBarrel = (relativePath, maxLines, requiredFragments, bannedFragments = []) => {
    const filePath = path.join(appRoot, relativePath);
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/).length;
    if (lines > maxLines) {
        addFinding(relativePath, `${relativePath} must stay under ${maxLines} lines after modularization`);
    }
    for (const fragment of requiredFragments) {
        if (!text.includes(fragment)) {
            addFinding(relativePath, `${relativePath} is missing required delegation (${fragment})`, fragment);
        }
    }
    for (const fragment of bannedFragments) {
        if (text.includes(fragment)) {
            addFinding(relativePath, `${relativePath} must not inline extracted logic (${fragment})`, fragment);
        }
    }
};

checkThinBarrel("src/protyle/render/av/cell.ts", 16, [
    'export {updateAttrViewCellAnimation, removeAttrViewColAnimation} from "./cellAnimation";',
    'export {addDragFill, dragFillCellsValue, getPositionByCellElement} from "./cellDrag";',
    'export {cellScrollIntoView, popTextCell} from "./cellEditor";',
    'export {updateCellsValue} from "./cellMutation";',
    'export {renderCell, renderCellAttr, updateHeaderCell} from "./cellRender";',
    'from "./cellValue";',
    "cellValueIsEmpty,",
    "genCellValue,",
    "genCellValueByElement,",
    "getCellText,",
    "getTypeByCellElement,",
], [
    "export const getCellText =",
    "export const updateAttrViewCellAnimation =",
    "export const genCellValueByElement =",
    "export const cellScrollIntoView =",
    "export const updateCellsValue =",
    "export const renderCell =",
    "export const addDragFill =",
]);

const requiredModules = [
    ["src/protyle/render/av/cellAnimation.ts", "export const updateAttrViewCellAnimation ="],
    ["src/protyle/render/av/cellAnimation.ts", "export const removeAttrViewColAnimation ="],
    ["src/protyle/render/av/cellAnimation.ts", 'import {addDragFill} from "./cellDrag";'],
    ["src/protyle/render/av/cellAnimation.ts", 'import {renderCell, renderCellAttr, updateHeaderCell} from "./cellRender";'],
    ["src/protyle/render/av/cellAnimation.ts", 'import {cellValueIsEmpty} from "./cellValue";'],
    ["src/protyle/render/av/cellDrag.ts", "export const getPositionByCellElement ="],
    ["src/protyle/render/av/cellDrag.ts", "export const dragFillCellsValue ="],
    ["src/protyle/render/av/cellDrag.ts", "export const addDragFill ="],
    ["src/protyle/render/av/cellEditor.ts", "export const cellScrollIntoView ="],
    ["src/protyle/render/av/cellEditor.ts", "export const popTextCell ="],
    ["src/protyle/render/av/cellEditor.ts", 'import {updateCellsValue} from "./cellMutation";'],
    ["src/protyle/render/av/cellMutation.ts", "export const updateCellsValue = async"],
    ["src/protyle/render/av/cellMutation.ts", 'import {updateAttrViewCellAnimation} from "./cellAnimation";'],
    ["src/protyle/render/av/cellMutation.ts", "transformCellValue"],
    ["src/protyle/render/av/cellRender.ts", "export const renderCellAttr ="],
    ["src/protyle/render/av/cellRender.ts", "export const renderCell ="],
    ["src/protyle/render/av/cellRender.ts", "export const updateHeaderCell ="],
    ["src/protyle/render/av/cellValue.ts", "export const getCellText ="],
    ["src/protyle/render/av/cellValue.ts", "export const genCellValueByElement ="],
    ["src/protyle/render/av/cellValue.ts", "export const genCellValue ="],
    ["src/protyle/render/av/cellValue.ts", "export const getTypeByCellElement ="],
    ["src/protyle/render/av/cellValue.ts", "export const cellValueIsEmpty ="],
    ["src/protyle/render/av/cellValue.ts", "export const transformCellValue ="],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for av cell modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(relativePath, `${relativePath} is missing expected fragment`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[av-cell-modularity] ok");
    process.exit(0);
}

console.error(`[av-cell-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
