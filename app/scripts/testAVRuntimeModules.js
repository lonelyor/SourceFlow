const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const avRoot = path.join(appRoot, "src", "protyle", "render", "av");

const read = (fileName) => fs.readFileSync(path.join(avRoot, fileName), "utf8");

assert.deepStrictEqual(read("blockAttr.ts").trim().split(/\r?\n/), [
    'export {genAVValueHTML} from "./blockAttrValue";',
    'export {isCustomAttr, renderAVAttribute} from "./blockAttrRuntime";',
]);

assert.deepStrictEqual(read("relation.ts").trim().split(/\r?\n/), [
    'export {updateRelation, toggleUpdateRelationBtn} from "./relationConfig";',
    'export {openSearchAV} from "./relationSearch";',
    'export {bindRelationEvent, getRelationHTML} from "./relationPicker";',
    'export {setRelationCell} from "./relationCell";',
]);

assert.deepStrictEqual(read("calc.ts").trim().split(/\r?\n/), [
    'export {openCalcMenu} from "./calcMenu";',
    'export {getCalcValue, getNameByOperator} from "./calcLabels";',
]);

assert.deepStrictEqual(read("colMenu.ts").trim().split(/\r?\n/), [
    'export {showColMenu} from "./colMenuRuntime";',
]);

assert.ok(read("view.ts").includes('from "./viewRuntime";'));
assert.ok(read("view.ts").includes("openViewMenu,"));
assert.ok(read("view.ts").includes("getFieldsByData,"));
assert.ok(read("view.ts").includes("dragoverTab,"));

const expectedFiles = [
    "blockAttrValue.ts",
    "blockAttrEditor.ts",
    "blockAttrRuntime.ts",
    "relationSearch.ts",
    "relationConfig.ts",
    "relationShared.ts",
    "relationPicker.ts",
    "relationCell.ts",
    "calcLabels.ts",
    "calcMenu.ts",
    "colMenuRuntime.ts",
    "viewRuntime.ts",
];

for (const fileName of expectedFiles) {
    assert.ok(fs.existsSync(path.join(avRoot, fileName)), `${fileName} should exist`);
}

assert.ok(read("blockAttrRuntime.ts").includes('import {genAVValueHTML} from "./blockAttrValue";'));
assert.ok(read("blockAttrRuntime.ts").includes('import {openEdit} from "./blockAttrEditor";'));
assert.ok(read("relationSearch.ts").includes('import {toggleUpdateRelationBtn} from "./relationConfig";'));
assert.ok(read("relationPicker.ts").includes('import {genSelectItemHTML, updateCopyRelatedItems} from "./relationShared";'));
assert.ok(read("relationPicker.ts").includes('import {setRelationCell} from "./relationCell";'));
assert.ok(read("relationCell.ts").includes('import {genSelectItemHTML, updateCopyRelatedItems} from "./relationShared";'));
assert.ok(read("calcMenu.ts").includes('import {getNameByOperator} from "./calcLabels";'));

console.log("[av-runtime-modules] ok");
