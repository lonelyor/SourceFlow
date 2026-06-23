const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const avRoot = path.join(appRoot, "src", "protyle", "render", "av");

const read = (fileName) => fs.readFileSync(path.join(avRoot, fileName), "utf8");

assert.deepStrictEqual(read("cell.ts").trim().split(/\r?\n/), [
    'export {updateAttrViewCellAnimation, removeAttrViewColAnimation} from "./cellAnimation";',
    'export {addDragFill, dragFillCellsValue, getPositionByCellElement} from "./cellDrag";',
    'export {cellScrollIntoView, popTextCell} from "./cellEditor";',
    'export {updateCellsValue} from "./cellMutation";',
    'export {renderCell, renderCellAttr, updateHeaderCell} from "./cellRender";',
    'export {',
    "    cellValueIsEmpty,",
    "    genCellValue,",
    "    genCellValueByElement,",
    "    getCellText,",
    "    getTypeByCellElement,",
    '} from "./cellValue";',
]);

assert.deepStrictEqual(read("colMutations.ts").trim().split(/\r?\n/), [
    'export {addCol} from "./colMutationAdd";',
    'export {addAttrViewColAnimation} from "./colMutationAnimation";',
    'export {duplicateCol} from "./colMutationDuplicate";',
    'export {removeCol, removeColByMenu} from "./colMutationRemove";',
]);

const expectedFiles = [
    "cellAnimation.ts",
    "cellDrag.ts",
    "cellEditor.ts",
    "cellMutation.ts",
    "cellRender.ts",
    "cellValue.ts",
    "colMutationAdd.ts",
    "colMutationAddConfig.ts",
    "colMutationAnimation.ts",
    "colMutationDuplicate.ts",
    "colMutationRemove.ts",
];

for (const fileName of expectedFiles) {
    assert.ok(fs.existsSync(path.join(avRoot, fileName)), `${fileName} should exist`);
}

assert.ok(read("cellEditor.ts").includes('import {updateCellsValue} from "./cellMutation";'));
assert.ok(!read("cellEditor.ts").includes("export const getTypeByCellElement ="));
assert.ok(read("cellMutation.ts").includes('import {updateAttrViewCellAnimation} from "./cellAnimation";'));
assert.ok(read("cellMutation.ts").includes("transformCellValue"));
assert.ok(read("cellDrag.ts").includes('import {renderCell, renderCellAttr} from "./cellRender";'));
assert.ok(read("colMutationDuplicate.ts").includes('import {addAttrViewColAnimation} from "./colMutationAnimation";'));
assert.ok(read("colMutationAdd.ts").includes('import {addAttrViewColAnimation} from "./colMutationAnimation";'));
assert.ok(read("colMutationAdd.ts").includes('import {getBuiltinAddColSpecs} from "./colMutationAddConfig";'));
assert.ok(read("colMutationAddConfig.ts").includes("export const getBuiltinAddColSpecs ="));

console.log("[av-cell-col-modules] ok");
