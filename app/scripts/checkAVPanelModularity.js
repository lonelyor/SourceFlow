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

const panelPath = path.join(appRoot, "src", "protyle", "render", "av", "openMenuPanel.ts");
const panelText = fs.readFileSync(panelPath, "utf8");
const panelLines = panelText.split(/\r?\n/).length;

if (panelLines > 20) {
    addFinding(panelPath, "av/openMenuPanel.ts must stay a thin compatibility barrel");
}

const requiredFragments = [
    'export {openMenuPanel} from "./panelCoordinator";',
    'export {getPropertiesHTML} from "./propertiesMenu";',
];

for (const fragment of requiredFragments) {
    if (!panelText.includes(fragment)) {
        addFinding(panelPath, `av/openMenuPanel.ts is missing required delegation (${fragment})`, fragment);
    }
}

const bannedFragments = [
    "export const openMenuPanel =",
    'avPanelElement.addEventListener("click", async (event: MouseEvent) => {',
    'avPanelElement.addEventListener("dragstart", (event: DragEvent) => {',
];

for (const fragment of bannedFragments) {
    if (panelText.includes(fragment)) {
        addFinding(panelPath, `av/openMenuPanel.ts must not inline extracted logic (${fragment})`, fragment);
    }
}

const requiredModules = [
    ["src/protyle/render/av/propertiesMenu.ts", "export const getPropertiesHTML ="],
    ["src/protyle/render/av/panelDrag.ts", "export const bindAVPanelDrag ="],
    ["src/protyle/render/av/panelCoordinator.ts", "export const openMenuPanel ="],
    ["src/protyle/render/av/panelCoordinator.ts", 'import {bindAVPanelDrag} from "./panelDrag";'],
    ["src/protyle/render/av/panelCoordinator.ts", 'import {bindAVPanelClick} from "./panelClick";'],
    ["src/protyle/render/av/panelCoordinator.ts", "const state: AVPanelState = {"],
    ["src/protyle/render/av/panelCoordinator.ts", "bindAVPanelDrag({options, avPanelElement, menuElement, state, avID, blockID, isCustomAttr});"],
    ["src/protyle/render/av/panelCoordinator.ts", "bindAVPanelClick({options, avPanelElement, menuElement, state, avID, blockID, isCustomAttr});"],
    ["src/protyle/render/av/panelClick.ts", "export const bindAVPanelClick ="],
    ["src/protyle/render/av/panelClick.ts", "const PANEL_CLICK_HANDLERS: AVPanelClickBranchHandler[] = ["],
    ["src/protyle/render/av/panelClick.ts", "handleAVPanelNavigationClick,"],
    ["src/protyle/render/av/panelClick.ts", "handleAVPanelSortClick,"],
    ["src/protyle/render/av/panelClick.ts", "handleAVPanelFilterClick,"],
    ["src/protyle/render/av/panelClick.ts", "handleAVPanelColumnClick,"],
    ["src/protyle/render/av/panelClick.ts", "handleAVPanelCellValueClick,"],
    ["src/protyle/render/av/panelClick.ts", "handleAVPanelViewClick,"],
    ["src/protyle/render/av/panelClick.ts", "handleAVPanelGroupClick,"],
    ["src/protyle/render/av/panelClickNavigation.ts", "handleAVPanelNavigationClick"],
    ["src/protyle/render/av/panelClickSorts.ts", "handleAVPanelSortClick"],
    ["src/protyle/render/av/panelClickFilters.ts", "handleAVPanelFilterClick"],
    ["src/protyle/render/av/panelClickColumns.ts", "handleAVPanelColumnClick"],
    ["src/protyle/render/av/panelClickCellValues.ts", "handleAVPanelCellValueClick"],
    ["src/protyle/render/av/panelClickViews.ts", "handleAVPanelViewClick"],
    ["src/protyle/render/av/panelClickGroups.ts", "handleAVPanelGroupClick"],
    ["src/protyle/render/av/panelTypes.ts", "export interface AVPanelState {"],
    ["src/protyle/render/av/panelShared.ts", "export const refreshEditMenu ="],
    ["src/protyle/render/av/panelDrag.ts", 'import {handleAVPanelDrop} from "./panelDragDrop";'],
    ["src/protyle/render/av/panelDrag.ts", 'import {bindAVPanelDragHover} from "./panelDragHover";'],
    ["src/protyle/render/av/panelDragDrop.ts", "export const handleAVPanelDrop:"],
    ["src/protyle/render/av/panelDragHover.ts", "export const bindAVPanelDragHover ="],
    ["src/protyle/render/av/panelDragShared.ts", "export const clearAVPanelDragIndicators ="],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for av panel modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(filePath, `${relativePath} is missing the expected fragment`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[av-panel-modularity] ok");
    process.exit(0);
}

console.error(`[av-panel-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
