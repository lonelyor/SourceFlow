const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");

const readSrc = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

const packageJSON = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
const selectionScope = readSrc("protyle", "util", "selectionScope.ts");
const multiBlockPaste = readSrc("protyle", "util", "multiBlockPaste.ts");
const insertHTML = readSrc("protyle", "util", "insertHTML.ts");
const paste = readSrc("protyle", "util", "paste.ts");
const copy = readSrc("protyle", "wysiwyg", "commonEvents", "copy.ts");
const cut = readSrc("protyle", "wysiwyg", "editorEvents", "cut.ts");

assert.strictEqual(
    packageJSON.scripts["test:protyle-paste-selection-safety"],
    "node ./scripts/testProtylePasteSelectionSafety.js",
    "package.json must expose the paste selection safety regression"
);

[
    "resolveSelectionScope",
    "canWriteInternalSourceFlowClipboard",
    "sanitizeStandardClipboardHTML",
].forEach((exportName) => {
    assert(
        selectionScope.includes(`export const ${exportName}`),
        `selectionScope.ts must export ${exportName}`
    );
});

assert(
    selectionScope.includes('scope.kind !== "single-block-text"') ||
    selectionScope.includes("scope.kind !== \"single-block-text\""),
    "internal SourceFlow clipboard writes must be rejected outside single-block text or explicit block scopes"
);
assert(
    selectionScope.includes('scope.kind === "explicit-block"') &&
    selectionScope.includes('scope.kind === "table"') &&
    selectionScope.includes('scope.kind === "attribute-view"'),
    "explicit block, table, and attribute-view clipboard paths must stay allowed"
);

const insertGuardIndex = insertHTML.indexOf("replaceMultiBlockSelection(protyle, range, html)");
const firstDeleteIndex = insertHTML.indexOf("range.deleteContents()");
assert(insertGuardIndex > -1, "insertHTML must call replaceMultiBlockSelection");
assert(firstDeleteIndex > -1, "insertHTML still contains inline delete paths");
assert(
    insertGuardIndex < firstDeleteIndex,
    "cross-block paste guard must run before any range.deleteContents call"
);

assert(
    multiBlockPaste.includes('scope.kind !== "multi-block-text"') &&
    multiBlockPaste.includes("collapseToSafeStart(range)") &&
    multiBlockPaste.includes("transaction(protyle, doOperations, undoOperations)"),
    "multiBlockPaste must atomically replace safe text selections and collapse unsafe complex selections"
);
assert(
    !/showMessage|confirmDialog|alert\(/.test(multiBlockPaste + selectionScope),
    "paste selection safety must not add user-facing CV prompts"
);

assert(
    paste.includes("resolveSelectionScope(range, protyle.wysiwyg.element)") &&
    paste.includes('["single-block-text", "multi-block-text"].includes(pasteScope.kind)') &&
    paste.includes("sourceflowHTML = \"\";"),
    "paste must discard internal Block DOM MIME for ordinary text selections"
);
assert(
    paste.includes("const sanitizeClipboardTextHTML = (html: string) =>") &&
    paste.includes("textHTML = sanitizeClipboardTextHTML(textHTML);"),
    "paste must centralize standard clipboard HTML cleanup"
);
const discardSourceflowIndex = paste.indexOf("sourceflowHTML = \"\";");
const stripSourceflowCommentIndex = paste.indexOf("const textObj = getTextSourceFlowFromTextHTML(textHTML);", discardSourceflowIndex);
const resanitizeHTMLIndex = paste.indexOf("textHTML = sanitizeClipboardTextHTML(textObj.textHtml);", discardSourceflowIndex);
const processPasteCodeIndex = paste.indexOf("const code = htmlPasteMode === \"smart\" ? processPasteCode", discardSourceflowIndex);
assert(
    discardSourceflowIndex > -1 &&
    stripSourceflowCommentIndex > discardSourceflowIndex &&
    resanitizeHTMLIndex > stripSourceflowCommentIndex,
    "discarded internal MIME must strip SourceFlow comments and re-sanitize text/html before fallback paste"
);
assert(
    processPasteCodeIndex > resanitizeHTMLIndex,
    "paste code detection must run after ordinary text selections downgrade and sanitize clipboard HTML"
);

[copy, cut].forEach((source, index) => {
    const name = index === 0 ? "copy" : "cut";
    assert(
        source.includes("canWriteInternalSourceFlowClipboard") &&
        source.includes("sanitizeStandardClipboardHTML"),
        `${name} must centralize internal MIME eligibility and standard HTML cleanup`
    );
    assert(
        source.includes("if (canWriteSourceFlowHTML)") &&
        source.includes("setData(Constants.SOURCEFLOW_HTML_CLIPBOARD_MIME"),
        `${name} must only write SourceFlow internal MIME after eligibility check`
    );
});

assert(
    cut.indexOf("const clipboardSelectionScope = resolveSelectionScope") <
    cut.indexOf("range.extractContents()"),
    "cut must capture selection scope before mutating DOM"
);

// ---- 阶段 2：复杂结构精细化 ----

assert(
    multiBlockPaste.split("\n").length < 800,
    "multiBlockPaste.ts must stay under 800 lines"
);

assert(
    multiBlockPaste.includes('data-type", "NodeListItem"') &&
    multiBlockPaste.includes('=== "NodeList"') &&
    multiBlockPaste.includes("isSimpleListItem") &&
    multiBlockPaste.includes("getUnitElement(startBlock)") &&
    multiBlockPaste.includes("collectCoveredUnits(startUnit, endUnit)"),
    "selection boundaries must resolve into li-aware replacement units for list selections"
);
assert(
    multiBlockPaste.includes("units.every(isSafeCoveredUnit)") &&
    multiBlockPaste.includes("return isTextBlock(element);"),
    "covered units must be validated so quotes, tables, and code blocks degrade to the safe text flow"
);

// 半选区精细化：首尾部分区间只在分离克隆上做区间删除，未选中的前缀/后缀原样保留
assert(
    multiBlockPaste.includes("deleteEditableRange(startTarget, startOffset, getEditableTextLength(getEditable(startTarget)))") &&
    multiBlockPaste.includes("deleteEditableRange(endTarget, 0, endOffset)"),
    "partial first/last unit intervals must be cut on detached clones, not on live DOM"
);
assert(
    multiBlockPaste.includes("const prefixHTML = getEditableHTML(startTarget);") &&
    multiBlockPaste.includes("const suffixHTML = getEditableHTML(endTarget);") &&
    multiBlockPaste.includes("setEditableHTML(startTarget, `${prefixHTML}${getEditableHTML(firstPastedBlock)}<wbr>${suffixHTML}`);"),
    "first unit prefix and last unit suffix must be merged with pasted content atomically"
);
assert(
    multiBlockPaste.includes("const removedUnits = keepEndUnit ? units.slice(1, -1) : units.slice(1);") &&
    multiBlockPaste.includes("startUnit.replaceWith(startClone);"),
    "only fully covered middle units are removed while boundaries update in place"
);

// 列表项边界保留：后缀未选中时两侧边界单元都以 update 进入同一事务，
// 撤销插回被覆盖列表项时锚定在保留的 endUnit 之前
assert(
    multiBlockPaste.includes("const keepEndUnit = (startIsListItem || endIsListItem) && !endFullyCovered;") &&
    multiBlockPaste.includes("id: getBlockID(endUnit),") &&
    multiBlockPaste.includes("nextID: getBlockID(endUnit),"),
    "kept list item boundaries must join the same transaction and undo inserts must anchor before the kept end unit"
);
assert(
    multiBlockPaste.includes("wrapPastedBlockInListItem(blockElement, templateListItem);") &&
    multiBlockPaste.includes("resetCloneBlockIDs(listItemClone);"),
    "inserted pasted blocks must be wrapped into same-structure list items with fresh node ids"
);
assert(
    multiBlockPaste.includes('if (!startIsListItem && endIsListItem && endFullyCovered) {'),
    "entering a list with a fully covered tail item must degrade instead of risking an empty list"
);

// explicit-block / table / attribute-view / code 边界无回归
assert(
    multiBlockPaste.includes('scope.kind !== "multi-block-text"'),
    "explicit-block, table, attribute-view, code, and unsupported scopes must still bypass multi-block replacement"
);
assert(
    selectionScope.includes('kind: "table"') &&
    selectionScope.includes('kind: "attribute-view"') &&
    selectionScope.includes('kind: "code"'),
    "table, attribute-view, and code selection scope kinds must remain available"
);

// 逻辑桩：剥离类型标注后提取 collectCoveredUnits，用最小 DOM 桩验证结构判定
const toRunnableSource = (source) => source
    .replace(/: (HTMLElement|Element)(\[\])?(\s*\|\s*(undefined|null))?/g, "")
    .replace(/new Set<Element>\(\)/g, "new Set()")
    .replace(/ as (HTMLElement|Element)/g, "");

const extractFunctionSource = (name) => {
    const matched = multiBlockPaste.match(new RegExp(`const ${name} = [\\s\\S]*?\\n};`));
    assert(matched, `multiBlockPaste must define ${name} with a closable block for stub evaluation`);
    return toRunnableSource(matched[0]);
};

const collectCoveredUnits = new Function(
    ["isListItemElement", "isListContainer", "collectCoveredUnits"].map(extractFunctionSource).join("\n") +
    "\nreturn collectCoveredUnits;"
)();

class FakeElement {
    constructor(attributes) {
        this.attributes = attributes || {};
        this.parentElement = null;
        this.childElements = [];
    }
    appendChild(child) {
        child.parentElement = this;
        this.childElements.push(child);
        return child;
    }
    get firstElementChild() {
        return this.childElements[0] || null;
    }
    get nextElementSibling() {
        if (!this.parentElement) {
            return null;
        }
        const siblings = this.parentElement.childElements;
        return siblings[siblings.indexOf(this) + 1] || null;
    }
    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    }
    contains(target) {
        let current = target;
        while (current) {
            if (current === this) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }
}

const buildSelectionTree = () => {
    const wysiwyg = new FakeElement({});
    const append = (parent, id, type) => parent.appendChild(new FakeElement({"data-node-id": id, "data-type": type}));
    const p1 = append(wysiwyg, "p1", "NodeParagraph");
    const list1 = append(wysiwyg, "list1", "NodeList");
    const li1 = append(list1, "li1", "NodeListItem");
    append(li1, "li1p", "NodeParagraph");
    const li2 = append(list1, "li2", "NodeListItem");
    append(li2, "li2p", "NodeParagraph");
    const liNestedHost = append(list1, "liNestedHost", "NodeListItem");
    append(liNestedHost, "liNestedHostP", "NodeParagraph");
    const nestedList = append(liNestedHost, "nestedList", "NodeList");
    const liNested = append(nestedList, "liNested", "NodeListItem");
    append(liNested, "liNestedP", "NodeParagraph");
    const p3 = append(wysiwyg, "p3", "NodeParagraph");
    const list2 = append(wysiwyg, "list2", "NodeList");
    const li3 = append(list2, "li3", "NodeListItem");
    append(li3, "li3p", "NodeParagraph");
    const p4 = append(wysiwyg, "p4", "NodeParagraph");
    const quote = append(wysiwyg, "quote", "NodeBlockquote");
    const quoteP = append(quote, "quoteP", "NodeParagraph");
    return {p1, list1, li1, li2, liNestedHost, liNested, p3, list2, li3, p4, quote, quoteP};
};

const selectionTree = buildSelectionTree();
const idsOfUnits = (units) => units ? units.map((item) => item.getAttribute("data-node-id")) : null;

assert.deepStrictEqual(
    idsOfUnits(collectCoveredUnits(selectionTree.p1, selectionTree.li2)),
    ["p1", "li1", "li2"],
    "mixed paragraph + same-list li selection must resolve into the structured safe path"
);
assert.deepStrictEqual(
    idsOfUnits(collectCoveredUnits(selectionTree.li1, selectionTree.li2)),
    ["li1", "li2"],
    "same-list li selections must resolve into the structured safe path"
);
assert.deepStrictEqual(
    idsOfUnits(collectCoveredUnits(selectionTree.p1, selectionTree.p3)),
    ["p1", "list1", "p3"],
    "a single fully covered list between paragraphs must be treated as one covered unit"
);
assert.deepStrictEqual(
    idsOfUnits(collectCoveredUnits(selectionTree.p1, selectionTree.p4)),
    null,
    "selections spanning two separate lists must degrade"
);
assert.strictEqual(
    collectCoveredUnits(selectionTree.li1, selectionTree.li3),
    undefined,
    "cross-list li selections must degrade"
);
assert.strictEqual(
    collectCoveredUnits(selectionTree.li2, selectionTree.liNested),
    undefined,
    "selections reaching into a nested list must degrade"
);
assert.strictEqual(
    collectCoveredUnits(selectionTree.p3, selectionTree.quoteP),
    undefined,
    "selections crossing into blockquote/callout content must degrade"
);
assert.strictEqual(
    collectCoveredUnits(selectionTree.liNestedHost, selectionTree.liNested),
    undefined,
    "boundary inside the same li holding a nested list must degrade"
);

console.log("Protyle paste selection safety regression checks passed");
