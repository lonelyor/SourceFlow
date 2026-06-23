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

checkThinBarrel("src/protyle/render/av/blockAttr.ts", 6, [
    'export {genAVValueHTML} from "./blockAttrValue";',
    'export {isCustomAttr, renderAVAttribute} from "./blockAttrRuntime";',
], [
    "export const genAVValueHTML =",
    "export const renderAVAttribute =",
    "export const isCustomAttr =",
]);

checkThinBarrel("src/protyle/render/av/relation.ts", 8, [
    'export {updateRelation, toggleUpdateRelationBtn} from "./relationConfig";',
    'export {openSearchAV} from "./relationSearch";',
    'export {bindRelationEvent, getRelationHTML} from "./relationPicker";',
    'export {setRelationCell} from "./relationCell";',
], [
    "export const openSearchAV =",
    "export const updateRelation =",
    "export const bindRelationEvent =",
    "export const getRelationHTML =",
    "export const setRelationCell =",
]);

checkThinBarrel("src/protyle/render/av/calc.ts", 6, [
    'export {openCalcMenu} from "./calcMenu";',
    'export {getCalcValue, getNameByOperator} from "./calcLabels";',
], [
    "export const openCalcMenu =",
    "export const getCalcValue =",
    "export const getNameByOperator =",
]);

checkThinBarrel("src/protyle/render/av/colMenu.ts", 4, [
    'export {showColMenu} from "./colMenuRuntime";',
], [
    "export const showColMenu =",
]);

checkThinBarrel("src/protyle/render/av/view.ts", 16, [
    'from "./viewRuntime";',
    "openViewMenu,",
    "getFieldsByData,",
    "dragoverTab,",
], [
    "export const openViewMenu =",
    "export const bindViewEvent =",
    "export const getViewHTML =",
    "export const getFieldsByData =",
]);

const requiredModules = [
    ["src/protyle/render/av/blockAttrValue.ts", "export const genAVValueHTML ="],
    ["src/protyle/render/av/blockAttrValue.ts", "const genAVRollupHTML ="],
    ["src/protyle/render/av/blockAttrEditor.ts", "export const openEdit ="],
    ["src/protyle/render/av/blockAttrRuntime.ts", 'import {genAVValueHTML} from "./blockAttrValue";'],
    ["src/protyle/render/av/blockAttrRuntime.ts", 'import {openEdit} from "./blockAttrEditor";'],
    ["src/protyle/render/av/blockAttrRuntime.ts", "export const renderAVAttribute ="],
    ["src/protyle/render/av/blockAttrRuntime.ts", "export const isCustomAttr ="],
    ["src/protyle/render/av/relationSearch.ts", 'import {toggleUpdateRelationBtn} from "./relationConfig";'],
    ["src/protyle/render/av/relationSearch.ts", "export const openSearchAV ="],
    ["src/protyle/render/av/relationConfig.ts", "export const updateRelation ="],
    ["src/protyle/render/av/relationConfig.ts", "export const toggleUpdateRelationBtn ="],
    ["src/protyle/render/av/relationShared.ts", "export const updateCopyRelatedItems ="],
    ["src/protyle/render/av/relationShared.ts", "export const genSelectItemHTML ="],
    ["src/protyle/render/av/relationPicker.ts", 'import {genSelectItemHTML, updateCopyRelatedItems} from "./relationShared";'],
    ["src/protyle/render/av/relationPicker.ts", 'import {setRelationCell} from "./relationCell";'],
    ["src/protyle/render/av/relationPicker.ts", "export const bindRelationEvent ="],
    ["src/protyle/render/av/relationPicker.ts", "export const getRelationHTML ="],
    ["src/protyle/render/av/relationCell.ts", 'import {genSelectItemHTML, updateCopyRelatedItems} from "./relationShared";'],
    ["src/protyle/render/av/relationCell.ts", "export const setRelationCell = async"],
    ["src/protyle/render/av/calcLabels.ts", "export const getCalcValue ="],
    ["src/protyle/render/av/calcLabels.ts", "export const getNameByOperator ="],
    ["src/protyle/render/av/calcMenu.ts", 'import {getNameByOperator} from "./calcLabels";'],
    ["src/protyle/render/av/calcMenu.ts", "export const openCalcMenu = async"],
    ["src/protyle/render/av/colMenuRuntime.ts", "export const showColMenu ="],
    ["src/protyle/render/av/viewRuntime.ts", "export const openViewMenu ="],
    ["src/protyle/render/av/viewRuntime.ts", "export const getFieldsByData ="],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for av runtime modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(relativePath, `${relativePath} is missing expected fragment`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[av-runtime-modularity] ok");
    process.exit(0);
}

console.error(`[av-runtime-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
