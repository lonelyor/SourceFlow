const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const avRoot = path.join(appRoot, "src", "protyle", "render", "av");

const read = (fileName) => fs.readFileSync(path.join(avRoot, fileName), "utf8");

const clickFiles = [
    "panelClickNavigation.ts",
    "panelClickSorts.ts",
    "panelClickFilters.ts",
    "panelClickColumns.ts",
    "panelClickCellValues.ts",
    "panelClickViews.ts",
    "panelClickGroups.ts",
];

const expectedClickTypes = [
    "close",
    "go-config",
    "go-properties",
    "go-layout",
    "goSorts",
    "removeSorts",
    "addSort",
    "removeSort",
    "goFilters",
    "removeFilters",
    "addFilter",
    "removeFilter",
    "setFilter",
    "numberFormat",
    "newCol",
    "update-view-icon",
    "set-page-size",
    "duplicate-view",
    "delete-view",
    "update-icon",
    "showAllCol",
    "hideAllCol",
    "editCol",
    "updateColType",
    "goUpdateColType",
    "goSearchAV",
    "goSearchRollupCol",
    "goSearchRollupTarget",
    "goSearchRollupCalc",
    "updateRelation",
    "goEditCol",
    "hideCol",
    "showCol",
    "duplicateCol",
    "removeCol",
    "setColOption",
    "setRelationCell",
    "addColOptionOrCell",
    "removeCellOption",
    "addAssetLink",
    "addAssetExist",
    "openAssetItem",
    "editAssetItem",
    "clearDate",
    "av-add",
    "av-view-switch",
    "av-view-edit",
    "set-gallery-cover",
    "set-gallery-size",
    "set-gallery-ratio",
    "set-layout",
    "goGroupsDate",
    "goGroupsSort",
    "setGroupMethod",
    "goGroups",
    "goGroupsMethod",
    "getGroupsNumber",
    "hideGroup",
    "hideGroups",
    "removeGroups",
];

const extractLiteralTypes = (text) => {
    const matches = text.match(/type === "([^"]+)"/g) || [];
    return matches
        .map((item) => item.match(/"([^"]+)"/)[1])
        .filter((item) => item !== "lineNumber");
};

const clickCoverage = new Map();
for (const fileName of clickFiles) {
    const types = Array.from(new Set(extractLiteralTypes(read(fileName))));
    assert.ok(types.length > 0, `${fileName} should expose at least one click handler`);
    for (const type of types) {
        const owners = clickCoverage.get(type) || [];
        owners.push(fileName);
        clickCoverage.set(type, owners);
    }
}

for (const type of expectedClickTypes) {
    assert.ok(clickCoverage.has(type), `missing click handler for ${type}`);
}

for (const [type, owners] of clickCoverage.entries()) {
    assert.strictEqual(owners.length, 1, `click handler ${type} should belong to a single module`);
}

const clickIndex = read("panelClick.ts");
const orderedHandlerImports = [
    "handleAVPanelNavigationClick",
    "handleAVPanelSortClick",
    "handleAVPanelFilterClick",
    "handleAVPanelColumnClick",
    "handleAVPanelCellValueClick",
    "handleAVPanelViewClick",
    "handleAVPanelGroupClick",
];

for (const handlerName of orderedHandlerImports) {
    assert.ok(clickIndex.includes(handlerName), `panelClick.ts should reference ${handlerName}`);
}

const dragDropText = read("panelDragDrop.ts");
const expectedDragTargets = [
    "removeSort",
    "removeFilter",
    "av-view-edit",
    "editAssetItem",
    "setColOption",
    "setRelationCell",
    "editCol",
    "hideGroup",
];

for (const type of expectedDragTargets) {
    assert.ok(
        dragDropText.includes(`data-type="${type}"`) ||
        dragDropText.includes(`'${type}'`) ||
        dragDropText.includes(`"${type}"`),
        `panelDragDrop.ts should cover ${type}`,
    );
}

const dragIndex = read("panelDrag.ts");
assert.ok(dragIndex.includes("handleAVPanelDrop({sourceElement, targetElement, isTop, context})"));
assert.ok(dragIndex.includes("bindAVPanelDragHover(avPanelElement);"));

const sharedText = read("panelShared.ts");
const requiredSharedHelpers = [
    "clearAVPanelMenus",
    "stopAVPanelEvent",
    "positionAVPanelMenu",
    "recomputeAVPanelTabRect",
    "closeAVPanel",
    "refreshPropertiesMenu",
    "refreshSortsMenu",
    "refreshFiltersMenu",
    "resolveAVPanelColId",
    "refreshEditMenu",
];

for (const helperName of requiredSharedHelpers) {
    assert.ok(sharedText.includes(`export const ${helperName} =`), `panelShared.ts should export ${helperName}`);
}

const typeText = read("panelTypes.ts");
const requiredTypeContracts = [
    "export interface AVPanelOpenOptions",
    "export interface AVPanelState",
    "export interface AVPanelContext",
    "export interface AVPanelClickHandlerArgs",
    "export interface AVPanelDropHandlerArgs",
];

for (const contract of requiredTypeContracts) {
    assert.ok(typeText.includes(contract), `panelTypes.ts should declare ${contract}`);
}

console.log("[av-panel-handler-coverage] ok");
