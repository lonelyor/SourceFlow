const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const findings = [];

const toRepoPath = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/");
const readText = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), "utf8");

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

checkThinBarrel("src/protyle/render/av/action.ts", 8, [
    'export {avClick} from "./actionClick";',
    'export {avContextmenu} from "./actionContextmenu";',
    'export {duplicateCompletely, updateAVName} from "./actionDocument";',
], [
    "export const avClick =",
    "export const avContextmenu =",
    "export const updateAVName =",
    "export const duplicateCompletely =",
]);

checkThinBarrel("src/protyle/render/av/filter.ts", 8, [
    'export {getDefaultOperatorByType, setFilter} from "./filterEditor";',
    'export {addFilter} from "./filterList";',
    'export {getFiltersHTML} from "./filterDisplay";',
], [
    "export const getDefaultOperatorByType =",
    "export const setFilter =",
    "export const addFilter =",
    "export const getFiltersHTML =",
]);

checkThinBarrel("src/protyle/render/av/filterEditor.ts", 6, [
    'export {getDefaultOperatorByType, filterSelect, toggleEmpty} from "./filterShared";',
    'export {setFilter} from "./filterRuntime";',
], [
    "export const getDefaultOperatorByType =",
    "export const setFilter = async",
    "const toggleEmpty =",
]);

checkThinBarrel("src/protyle/render/av/render.ts", 8, [
    'export {avRender, genTabHeaderHTML, getGroupTitleHTML, updateSearch} from "./renderTable";',
    'export {refreshAV} from "./renderRefresh";',
], [
    "export const genTabHeaderHTML =",
    "export const getGroupTitleHTML =",
    "export const avRender =",
    "export const updateSearch =",
    "export const refreshAV =",
]);

checkThinBarrel("src/protyle/render/av/renderTable.ts", 6, [
    'export {genTabHeaderHTML, getGroupTitleHTML} from "./renderTableHTML";',
    'export {avRender, updateSearch} from "./renderTableRuntime";',
], [
    "export const genTabHeaderHTML =",
    "export const getGroupTitleHTML =",
    "export const avRender = async",
    "export const updateSearch =",
]);

checkThinBarrel("src/protyle/render/av/select.ts", 12, [
    'from "./selectRuntime";',
    "addColOptionOrCell,",
    "bindSelectEvent,",
    "getSelectHTML,",
    "mergeAddOption,",
    "removeCellOption,",
    "setColOption,",
], [
    "export const removeCellOption =",
    "export const setColOption =",
    "export const bindSelectEvent =",
    "export const addColOptionOrCell =",
    "export const getSelectHTML =",
    "export const mergeAddOption =",
]);

checkThinBarrel("src/protyle/render/av/selectRuntime.ts", 8, [
    'export {filterSelectHTML, getSelectHTML} from "./selectMenuHTML";',
    'export {removeCellOption, mergeAddOption} from "./selectValueOps";',
    'export {setColOption} from "./selectOptionEditor";',
    'export {bindSelectEvent, addColOptionOrCell} from "./selectEvents";',
], [
    "export const removeCellOption =",
    "export const setColOption =",
    "export const bindSelectEvent =",
    "export const addColOptionOrCell =",
    "export const getSelectHTML =",
    "export const mergeAddOption =",
]);

const requiredModules = [
    ["src/protyle/render/av/actionClick.ts", "export const avClick ="],
    ["src/protyle/render/av/actionContextmenu.ts", "export const avContextmenu ="],
    ["src/protyle/render/av/actionDocument.ts", "export const updateAVName ="],
    ["src/protyle/render/av/actionDocument.ts", "export const duplicateCompletely ="],
    ["src/protyle/render/av/filterEditor.ts", 'export {getDefaultOperatorByType, filterSelect, toggleEmpty} from "./filterShared";'],
    ["src/protyle/render/av/filterEditor.ts", 'export {setFilter} from "./filterRuntime";'],
    ["src/protyle/render/av/filterShared.ts", "export const getDefaultOperatorByType ="],
    ["src/protyle/render/av/filterShared.ts", "export const toggleEmpty ="],
    ["src/protyle/render/av/filterShared.ts", "export const filterSelect ="],
    ["src/protyle/render/av/filterRuntime.ts", 'import {filterSelect, toggleEmpty} from "./filterShared";'],
    ["src/protyle/render/av/filterRuntime.ts", "export const setFilter = async"],
    ["src/protyle/render/av/filterDisplay.ts", "export const getFiltersHTML ="],
    ["src/protyle/render/av/filterList.ts", "export const addFilter ="],
    ["src/protyle/render/av/renderTable.ts", 'export {genTabHeaderHTML, getGroupTitleHTML} from "./renderTableHTML";'],
    ["src/protyle/render/av/renderTable.ts", 'export {avRender, updateSearch} from "./renderTableRuntime";'],
    ["src/protyle/render/av/renderTableHTML.ts", "export const genTabHeaderHTML ="],
    ["src/protyle/render/av/renderTableHTML.ts", "export const getGroupTitleHTML ="],
    ["src/protyle/render/av/renderTableRuntime.ts", 'import {genTabHeaderHTML, getGroupTitleHTML, getTableHTMLs, IIds, ITableOptions} from "./renderTableHTML";'],
    ["src/protyle/render/av/renderTableRuntime.ts", "export const avRender = async"],
    ["src/protyle/render/av/renderRefresh.ts", "export const refreshAV ="],
    ["src/protyle/render/av/selectRuntime.ts", 'export {filterSelectHTML, getSelectHTML} from "./selectMenuHTML";'],
    ["src/protyle/render/av/selectRuntime.ts", 'export {removeCellOption, mergeAddOption} from "./selectValueOps";'],
    ["src/protyle/render/av/selectRuntime.ts", 'export {setColOption} from "./selectOptionEditor";'],
    ["src/protyle/render/av/selectRuntime.ts", 'export {bindSelectEvent, addColOptionOrCell} from "./selectEvents";'],
    ["src/protyle/render/av/selectState.ts", "export const selectRuntimeState ="],
    ["src/protyle/render/av/selectMenuHTML.ts", "export const getSelectHTML ="],
    ["src/protyle/render/av/selectMenuHTML.ts", "const filterSelectHTML ="],
    ["src/protyle/render/av/selectValueOps.ts", "export const removeCellOption ="],
    ["src/protyle/render/av/selectValueOps.ts", "export const mergeAddOption ="],
    ["src/protyle/render/av/selectOptionEditor.ts", "export const setColOption ="],
    ["src/protyle/render/av/selectEvents.ts", "export const bindSelectEvent ="],
    ["src/protyle/render/av/selectEvents.ts", "export const addColOptionOrCell ="],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for av heavy modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(relativePath, `${relativePath} is missing expected fragment`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[av-heavy-modularity] ok");
    process.exit(0);
}

console.error(`[av-heavy-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
