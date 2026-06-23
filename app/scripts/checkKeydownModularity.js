const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");

const findings = [];

const addFinding = (filePath, message, pattern = "") => {
    const text = fs.readFileSync(filePath, "utf8");
    const index = pattern ? text.indexOf(pattern) : 0;
    const before = text.slice(0, Math.max(0, index));
    const line = before.split(/\r?\n/).length;
    findings.push({
        filePath,
        line,
        message,
    });
};

const toRepoPath = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/");

const keydownPath = path.join(appRoot, "src", "protyle", "wysiwyg", "keydown.ts");
const keydownText = fs.readFileSync(keydownPath, "utf8");
const keydownLines = keydownText.split(/\r?\n/).length;

if (keydownLines > 60) {
    addFinding(keydownPath, "keydown.ts must stay a thin coordination layer");
}

const requiredBarrelFragments = [
    'import {handleDocumentActionKeydown} from "./keydown/documentActions";',
    'import {handleEditingKeydown} from "./keydown/editing";',
    'import {getContentByInlineHTML} from "./keydown/inline";',
    'import {prepareKeydownContext} from "./keydown/preflight";',
    'import {handleSelectionKeydown} from "./keydown/selection";',
    'import {handleStructureKeydown} from "./keydown/structureActions";',
    "const context = prepareKeydownContext(protyle, editorElement, event);",
    "const activeContext: ActiveKeydownContext = {",
    "const editingResult = handleEditingKeydown(activeContext);",
    "return handleStructureKeydown(activeContext);",
];

for (const fragment of requiredBarrelFragments) {
    if (!keydownText.includes(fragment)) {
        addFinding(keydownPath, `keydown.ts is missing required delegation (${fragment})`, fragment);
    }
}

const bannedBarrelFragments = [
    "if (event.target.localName === \"protyle-html\" || event.target.localName === \"input\")",
    "if (fixTable(protyle, event, range))",
    "if (matchHotKey(window.sourceflow.config.keymap.editor.general.copyText.custom, event))",
    "if (matchHotKey(window.sourceflow.config.keymap.editor.heading.paragraph.custom, event))",
];

for (const fragment of bannedBarrelFragments) {
    if (keydownText.includes(fragment)) {
        addFinding(keydownPath, `keydown.ts must not inline extracted logic (${fragment})`, fragment);
    }
}

const requiredModules = [
    ["src/protyle/wysiwyg/keydown/shared.ts", "export interface KeydownContext"],
    ["src/protyle/wysiwyg/keydown/inline.ts", "export const getContentByInlineHTML ="],
    ["src/protyle/wysiwyg/keydown/preflight.ts", "export const prepareKeydownContext ="],
    ["src/protyle/wysiwyg/keydown/selection.ts", "export const handleSelectionKeydown ="],
    ["src/protyle/wysiwyg/keydown/editing.ts", "export const handleEditingKeydown ="],
    ["src/protyle/wysiwyg/keydown/documentActions.ts", "export const handleDocumentActionKeydown ="],
    ["src/protyle/wysiwyg/keydown/structureActions.ts", "export const handleStructureKeydown = async"],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for keydown modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(filePath, `${relativePath} is missing the expected fragment`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[keydown-modularity] ok");
    process.exit(0);
}

console.error(`[keydown-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
