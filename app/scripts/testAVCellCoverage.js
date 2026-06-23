const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const avRoot = path.join(appRoot, "src", "protyle", "render", "av");
const read = (fileName) => fs.readFileSync(path.join(avRoot, fileName), "utf8");

const ownership = {
    cellValue: ["getCellText", "genCellValueByElement", "genCellValue", "getTypeByCellElement", "cellValueIsEmpty", "transformCellValue"],
    cellRender: ["renderCellAttr", "renderCell", "updateHeaderCell"],
    cellAnimation: ["updateAttrViewCellAnimation", "removeAttrViewColAnimation"],
    cellEditor: ["cellScrollIntoView", "popTextCell"],
    cellMutation: ["updateCellsValue"],
    cellDrag: ["getPositionByCellElement", "dragFillCellsValue", "addDragFill"],
};

for (const [moduleName, exportsList] of Object.entries(ownership)) {
    const text = read(`${moduleName}.ts`);
    for (const exportName of exportsList) {
        assert.ok(text.includes(`export const ${exportName} =`), `${moduleName}.ts should own ${exportName}`);
    }
}

const forbiddenCrossovers = [
    ["cellEditor.ts", "export const getTypeByCellElement ="],
    ["cellMutation.ts", "export const renderCell ="],
    ["cellRender.ts", "export const updateCellsValue ="],
    ["cellAnimation.ts", "export const getCellText ="],
    ["cellDrag.ts", "export const popTextCell ="],
];

for (const [fileName, fragment] of forbiddenCrossovers) {
    assert.ok(!read(fileName).includes(fragment), `${fileName} should not own ${fragment}`);
}

const importContracts = [
    ["cellAnimation.ts", 'import {addDragFill} from "./cellDrag";'],
    ["cellAnimation.ts", 'import {renderCell, renderCellAttr, updateHeaderCell} from "./cellRender";'],
    ["cellAnimation.ts", 'import {cellValueIsEmpty} from "./cellValue";'],
    ["cellDrag.ts", 'import {renderCell, renderCellAttr} from "./cellRender";'],
    ["cellDrag.ts", 'import {genCellValueByElement, getTypeByCellElement} from "./cellValue";'],
    ["cellEditor.ts", 'import {addDragFill} from "./cellDrag";'],
    ["cellEditor.ts", 'import {updateCellsValue} from "./cellMutation";'],
    ["cellEditor.ts", 'import {getTypeByCellElement} from "./cellValue";'],
    ["cellMutation.ts", 'import {updateAttrViewCellAnimation} from "./cellAnimation";'],
    ["cellMutation.ts", 'import {genCellValue, genCellValueByElement, getCellText, getTypeByCellElement, transformCellValue} from "./cellValue";'],
];

for (const [fileName, fragment] of importContracts) {
    assert.ok(read(fileName).includes(fragment), `${fileName} should include ${fragment}`);
}

const barrelText = read("cell.ts");
const publicExports = [
    "updateAttrViewCellAnimation",
    "removeAttrViewColAnimation",
    "addDragFill",
    "dragFillCellsValue",
    "getPositionByCellElement",
    "cellScrollIntoView",
    "popTextCell",
    "updateCellsValue",
    "renderCell",
    "renderCellAttr",
    "updateHeaderCell",
    "cellValueIsEmpty",
    "genCellValue",
    "genCellValueByElement",
    "getCellText",
    "getTypeByCellElement",
];

for (const exportName of publicExports) {
    assert.ok(barrelText.includes(exportName), `cell.ts should re-export ${exportName}`);
}

const lineCounts = {
    cell: read("cell.ts").split(/\r?\n/).length,
    cellValue: read("cellValue.ts").split(/\r?\n/).length,
    cellRender: read("cellRender.ts").split(/\r?\n/).length,
    cellEditor: read("cellEditor.ts").split(/\r?\n/).length,
    cellMutation: read("cellMutation.ts").split(/\r?\n/).length,
    cellDrag: read("cellDrag.ts").split(/\r?\n/).length,
    cellAnimation: read("cellAnimation.ts").split(/\r?\n/).length,
};

assert.ok(lineCounts.cell <= 16, "cell.ts should remain a thin barrel");
assert.ok(lineCounts.cellValue > 100, "cellValue.ts should contain the extracted value runtime");
assert.ok(lineCounts.cellEditor > 100, "cellEditor.ts should contain the extracted editor runtime");
assert.ok(lineCounts.cellMutation > 100, "cellMutation.ts should contain the extracted mutation runtime");

console.log("[av-cell-coverage] ok");
