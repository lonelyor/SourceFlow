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

console.log("Protyle paste selection safety regression checks passed");
