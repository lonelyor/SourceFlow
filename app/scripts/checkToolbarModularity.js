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

const toolbarPath = path.join(appRoot, "src", "protyle", "toolbar", "index.ts");
const toolbarText = fs.readFileSync(toolbarPath, "utf8");
const toolbarLines = toolbarText.split(/\r?\n/).length;

if (toolbarLines > 350) {
    addFinding(toolbarPath, "toolbar/index.ts must stay under 350 lines after modularization");
}

const requiredBarrelFragments = [
    'import {setToolbarInlineMark} from "./inlineMark";',
    'import {showRenderPanel} from "./renderPanel";',
    'import {buildToolbarItemElement, mergeToolbarNodes, updateToolbarLanguage} from "./shared";',
    'import {showCodeLanguagePanel, showSelectionContentPanel, showTemplatePanel, showWidgetPanel} from "./searchPanels";',
    "return setToolbarInlineMark(this, protyle, type, action, textObj);",
    "showRenderPanel(this, protyle, renderElement, updateElements, oldHTML);",
    "showCodeLanguagePanel(this, protyle, languageElements);",
    "showTemplatePanel(this, protyle, nodeElement, range);",
    "showWidgetPanel(this, protyle, nodeElement, range);",
    "showSelectionContentPanel(this, protyle, range, nodeElement);",
    "return buildToolbarItemElement(protyle, menuItem);",
    "mergeToolbarNodes(nodes);",
    "updateToolbarLanguage(this, languageElements, protyle, selectedLang);",
];

for (const fragment of requiredBarrelFragments) {
    if (!toolbarText.includes(fragment)) {
        addFinding(toolbarPath, `toolbar/index.ts is missing required delegation (${fragment})`, fragment);
    }
}

const bannedBarrelFragments = [
    'const selectText = this.range.toString();',
    "const isPin = this.subElement.querySelector('[data-type=\"pin\"]')?.getAttribute(\"aria-label\")",
    "let hljsLanguages = Constants.ALIAS_CODE_LANGUAGES.concat(window.hljs?.listLanguages() ?? []).sort();",
    "const previewElement = this.subElement.firstElementChild.lastElementChild;",
    'const hasCopy = range.toString() !== "" ||',
];

for (const fragment of bannedBarrelFragments) {
    if (toolbarText.includes(fragment)) {
        addFinding(toolbarPath, `toolbar/index.ts must not inline extracted logic (${fragment})`, fragment);
    }
}

const requiredModules = [
    ["src/protyle/toolbar/inlineMark.ts", 'export {setToolbarInlineMark} from "./inlineMarkEngine";'],
    ["src/protyle/toolbar/inlineMarkEngine.ts", "export const setToolbarInlineMark ="],
    ["src/protyle/toolbar/shared.ts", "export const buildToolbarItemElement ="],
    ["src/protyle/toolbar/shared.ts", "export const mergeToolbarNodes ="],
    ["src/protyle/toolbar/shared.ts", "export const updateToolbarLanguage ="],
    ["src/protyle/toolbar/renderPanel.ts", "export const showRenderPanel ="],
    ["src/protyle/toolbar/searchPanels.ts", "export const showCodeLanguagePanel ="],
    ["src/protyle/toolbar/searchPanels.ts", "export const showTemplatePanel ="],
    ["src/protyle/toolbar/searchPanels.ts", "export const showWidgetPanel ="],
    ["src/protyle/toolbar/searchPanels.ts", "export const showSelectionContentPanel ="],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for toolbar modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(filePath, `${relativePath} is missing the expected fragment`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[toolbar-modularity] ok");
    process.exit(0);
}

console.error(`[toolbar-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
