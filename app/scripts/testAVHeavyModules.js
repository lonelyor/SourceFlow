const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const avRoot = path.join(appRoot, "src", "protyle", "render", "av");

const read = (fileName) => fs.readFileSync(path.join(avRoot, fileName), "utf8");

assert.deepStrictEqual(read("action.ts").trim().split(/\r?\n/), [
    'export {avClick} from "./actionClick";',
    'export {avContextmenu} from "./actionContextmenu";',
    'export {duplicateCompletely, updateAVName} from "./actionDocument";',
]);

assert.deepStrictEqual(read("filter.ts").trim().split(/\r?\n/), [
    'export {getDefaultOperatorByType, setFilter} from "./filterEditor";',
    'export {addFilter} from "./filterList";',
    'export {getFiltersHTML} from "./filterDisplay";',
]);

assert.deepStrictEqual(read("filterEditor.ts").trim().split(/\r?\n/), [
    'export {getDefaultOperatorByType, filterSelect, toggleEmpty} from "./filterShared";',
    'export {setFilter} from "./filterRuntime";',
]);

assert.deepStrictEqual(read("render.ts").trim().split(/\r?\n/), [
    'export {avRender, genTabHeaderHTML, getGroupTitleHTML, updateSearch} from "./renderTable";',
    'export {refreshAV} from "./renderRefresh";',
]);

assert.deepStrictEqual(read("renderTable.ts").trim().split(/\r?\n/), [
    'export {genTabHeaderHTML, getGroupTitleHTML} from "./renderTableHTML";',
    'export {avRender, updateSearch} from "./renderTableRuntime";',
]);

assert.ok(read("select.ts").includes('from "./selectRuntime";'));
assert.ok(read("select.ts").includes("mergeAddOption,"));
assert.ok(read("select.ts").includes("setColOption,"));

assert.deepStrictEqual(read("selectRuntime.ts").trim().split(/\r?\n/), [
    'export {filterSelectHTML, getSelectHTML} from "./selectMenuHTML";',
    'export {removeCellOption, mergeAddOption} from "./selectValueOps";',
    'export {setColOption} from "./selectOptionEditor";',
    'export {bindSelectEvent, addColOptionOrCell} from "./selectEvents";',
]);

const expectedFiles = [
    "actionClick.ts",
    "actionContextmenu.ts",
    "actionDocument.ts",
    "filterEditor.ts",
    "filterShared.ts",
    "filterRuntime.ts",
    "filterList.ts",
    "filterDisplay.ts",
    "renderTable.ts",
    "renderTableHTML.ts",
    "renderTableRuntime.ts",
    "renderRefresh.ts",
    "selectRuntime.ts",
    "selectState.ts",
    "selectMenuHTML.ts",
    "selectValueOps.ts",
    "selectOptionEditor.ts",
    "selectEvents.ts",
];

for (const fileName of expectedFiles) {
    assert.ok(fs.existsSync(path.join(avRoot, fileName)), `${fileName} should exist`);
}

assert.ok(read("renderRefresh.ts").includes('import {avRender} from "./renderTable";'));
assert.ok(read("filterRuntime.ts").includes('import {filterSelect, toggleEmpty} from "./filterShared";'));
assert.ok(read("filterList.ts").includes('import {getDefaultOperatorByType, setFilter} from "./filterEditor";'));
assert.ok(read("filterList.ts").includes('import {getFiltersHTML} from "./filterDisplay";'));
assert.ok(read("renderTableRuntime.ts").includes('import {genTabHeaderHTML, getGroupTitleHTML, getTableHTMLs, IIds, ITableOptions} from "./renderTableHTML";'));
assert.ok(read("selectMenuHTML.ts").includes('import {selectRuntimeState} from "./selectState";'));
assert.ok(read("selectValueOps.ts").includes('import {selectRuntimeState} from "./selectState";'));
assert.ok(read("selectOptionEditor.ts").includes('import {bindSelectEvent} from "./selectEvents";'));
assert.ok(read("selectEvents.ts").includes('import {filterSelectHTML, getSelectHTML} from "./selectMenuHTML";'));
assert.ok(read("selectEvents.ts").includes('import {removeCellOption} from "./selectValueOps";'));

console.log("[av-heavy-modules] ok");
