const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const avRoot = path.join(appRoot, "src", "protyle", "render", "av");

const read = (fileName) => fs.readFileSync(path.join(avRoot, fileName), "utf8");

const barrelText = read("openMenuPanel.ts").trim().split(/\r?\n/);
assert.deepStrictEqual(barrelText, [
    'export {openMenuPanel} from "./panelCoordinator";',
    'export {getPropertiesHTML} from "./propertiesMenu";',
]);

const coordinatorText = read("panelCoordinator.ts");
assert.ok(coordinatorText.includes("const state: AVPanelState = {"));
assert.ok(coordinatorText.includes('bindAVPanelDrag({options, avPanelElement, menuElement, state, avID, blockID, isCustomAttr});'));
assert.ok(coordinatorText.includes('bindAVPanelClick({options, avPanelElement, menuElement, state, avID, blockID, isCustomAttr});'));

const clickText = read("panelClick.ts");
assert.ok(clickText.includes("const PANEL_CLICK_HANDLERS: AVPanelClickBranchHandler[] = ["));
assert.ok(clickText.includes("handleAVPanelNavigationClick,"));
assert.ok(clickText.includes("handleAVPanelSortClick,"));
assert.ok(clickText.includes("handleAVPanelFilterClick,"));
assert.ok(clickText.includes("handleAVPanelColumnClick,"));
assert.ok(clickText.includes("handleAVPanelCellValueClick,"));
assert.ok(clickText.includes("handleAVPanelViewClick,"));
assert.ok(clickText.includes("handleAVPanelGroupClick,"));

const dragText = read("panelDrag.ts");
assert.ok(dragText.includes('import {handleAVPanelDrop} from "./panelDragDrop";'));
assert.ok(dragText.includes('import {bindAVPanelDragHover} from "./panelDragHover";'));
assert.ok(dragText.includes("handleAVPanelDrop({sourceElement, targetElement, isTop, context})"));

const modules = [
    "panelTypes.ts",
    "panelShared.ts",
    "panelClickNavigation.ts",
    "panelClickSorts.ts",
    "panelClickFilters.ts",
    "panelClickColumns.ts",
    "panelClickCellValues.ts",
    "panelClickViews.ts",
    "panelClickGroups.ts",
    "panelDragShared.ts",
    "panelDragHover.ts",
    "panelDragDrop.ts",
];

for (const moduleFile of modules) {
    assert.ok(fs.existsSync(path.join(avRoot, moduleFile)), `${moduleFile} should exist`);
}

console.log("[av-panel-modules] ok");
