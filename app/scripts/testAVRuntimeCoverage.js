const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const avRoot = path.join(appRoot, "src", "protyle", "render", "av");

const read = (fileName) => fs.readFileSync(path.join(avRoot, fileName), "utf8");
const lineCount = (fileName) => read(fileName).split(/\r?\n/).length;

const ownership = [
    ["blockAttrValue.ts", "export const genAVValueHTML ="],
    ["blockAttrRuntime.ts", "export const renderAVAttribute ="],
    ["blockAttrRuntime.ts", "export const isCustomAttr ="],
    ["relationSearch.ts", "export const openSearchAV ="],
    ["relationConfig.ts", "export const updateRelation ="],
    ["relationConfig.ts", "export const toggleUpdateRelationBtn ="],
    ["relationPicker.ts", "export const bindRelationEvent ="],
    ["relationPicker.ts", "export const getRelationHTML ="],
    ["relationCell.ts", "export const setRelationCell = async"],
    ["calcMenu.ts", "export const openCalcMenu = async"],
    ["calcLabels.ts", "export const getCalcValue ="],
    ["calcLabels.ts", "export const getNameByOperator ="],
    ["colMenuRuntime.ts", "export const showColMenu ="],
    ["viewRuntime.ts", "export const openViewMenu ="],
    ["viewRuntime.ts", "export const getFieldsByData ="],
];

for (const [fileName, fragment] of ownership) {
    assert.ok(read(fileName).includes(fragment), `${fileName} should own ${fragment}`);
}

const forbidden = [
    ["blockAttr.ts", "export const renderAVAttribute ="],
    ["blockAttr.ts", "export const genAVValueHTML ="],
    ["relation.ts", "export const openSearchAV ="],
    ["relation.ts", "export const bindRelationEvent ="],
    ["calc.ts", "export const openCalcMenu ="],
    ["colMenu.ts", "export const showColMenu ="],
    ["view.ts", "export const openViewMenu ="],
];

for (const [fileName, fragment] of forbidden) {
    assert.ok(!read(fileName).includes(fragment), `${fileName} must not inline ${fragment}`);
}

assert.ok(lineCount("blockAttr.ts") <= 6, "blockAttr.ts should stay thin");
assert.ok(lineCount("relation.ts") <= 8, "relation.ts should stay thin");
assert.ok(lineCount("calc.ts") <= 6, "calc.ts should stay thin");
assert.ok(lineCount("colMenu.ts") <= 4, "colMenu.ts should stay thin");
assert.ok(lineCount("view.ts") <= 16, "view.ts should stay thin");

assert.ok(read("blockAttrValue.ts").includes("const genAVRollupHTML ="));
assert.ok(read("relationShared.ts").includes("export const updateCopyRelatedItems ="));
assert.ok(read("relationShared.ts").includes("export const genSelectItemHTML ="));
assert.ok(read("viewRuntime.ts").includes("export const getViewName ="));
assert.ok(read("viewRuntime.ts").includes("export const dragoverTab ="));

console.log("[av-runtime-coverage] ok");
