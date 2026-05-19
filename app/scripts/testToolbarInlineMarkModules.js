const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const toolbarRoot = path.join(appRoot, "src", "protyle", "toolbar");

const read = (fileName) => fs.readFileSync(path.join(toolbarRoot, fileName), "utf8");

const inlineMarkBarrel = read("inlineMark.ts").trim();
assert.strictEqual(inlineMarkBarrel, 'export {setToolbarInlineMark} from "./inlineMarkEngine";');

const inlineMarkEngine = read("inlineMarkEngine.ts");
assert.ok(inlineMarkEngine.includes("export const setToolbarInlineMark ="));
assert.ok(inlineMarkEngine.includes('const BATCH_INLINE_MARK_TYPES = new Set(["strong"]);'));
assert.ok(inlineMarkEngine.includes("applyBatchInlineMark(toolbar, protyle, nodeElement, endElement, type, action, textObj)"));
assert.ok(inlineMarkEngine.includes("transaction(protyle, operations, undoOperations);"));
assert.ok(inlineMarkEngine.includes("skipTransaction: true"));

const toolbarIndex = read("index.ts");
assert.ok(toolbarIndex.includes('import {setToolbarInlineMark} from "./inlineMark";'));
assert.ok(toolbarIndex.includes("return setToolbarInlineMark(this, protyle, type, action, textObj);"));
assert.ok(toolbarIndex.includes("let typeRange = range;"));
assert.ok(toolbarIndex.includes("const displayRange = range.cloneRange();"));
assert.ok(toolbarIndex.includes("const types = this.getCurrentType(typeRange);"));

console.log("[toolbar-inline-mark-modules] ok");
