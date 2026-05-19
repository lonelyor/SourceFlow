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

const gutterIndexPath = path.join(appRoot, "src", "protyle", "gutter", "index.ts");
const gutterIndexText = fs.readFileSync(gutterIndexPath, "utf8");
const gutterIndexLines = gutterIndexText.split(/\r?\n/).length;
const gutterMenusPath = path.join(appRoot, "src", "protyle", "gutter", "menus.ts");
const gutterMenusText = fs.readFileSync(gutterMenusPath, "utf8");
const gutterMenusLines = gutterMenusText.split(/\r?\n/).length;
const gutterSingleMenuPath = path.join(appRoot, "src", "protyle", "gutter", "menus", "single.ts");
const gutterSingleMenuText = fs.readFileSync(gutterSingleMenuPath, "utf8");
const gutterSingleMenuLines = gutterSingleMenuText.split(/\r?\n/).length;

if (gutterIndexLines > 650) {
    addFinding(gutterIndexPath, "gutter/index.ts must stay a thin coordination layer");
}

if (gutterMenusLines > 12) {
    addFinding(gutterMenusPath, "gutter/menus.ts must stay a thin compatibility barrel");
}

if (gutterSingleMenuLines > 60) {
    addFinding(gutterSingleMenuPath, "gutter/menus/single.ts must stay a thin coordination layer");
}

const requiredIndexFragments = [
    'import {isMatchNode} from "./actions";',
    'import {renderMultipleMenu, renderMenu} from "./menus";',
    'import {renderGutter} from "./render";',
    "return renderMultipleMenu(protyle, selectsElement);",
    "return renderMenu(this.element, protyle, buttonElement, this.gutterTip);",
    "return renderGutter(this.element, this.gutterTip, protyle, element, target);",
];

for (const fragment of requiredIndexFragments) {
    if (!gutterIndexText.includes(fragment)) {
        addFinding(gutterIndexPath, `gutter/index.ts is missing required delegation (${fragment})`, fragment);
    }
}

const bannedFragments = [
    "public renderMultipleMenu(protyle: IProtyle, selectsElement: Element[]) {\n        let isList = false;",
    "public renderMenu(protyle: IProtyle, buttonElement: Element) {\n        if (!buttonElement) {",
    "public render(protyle: IProtyle, element: Element, target?: Element) {\n        // https://github.com/lonelyor/SourceFlow/issues/4659",
    "private genWidths(",
    "private genHeights(",
    "private genAlign(",
];

for (const fragment of bannedFragments) {
    if (gutterIndexText.includes(fragment)) {
        addFinding(gutterIndexPath, `gutter/index.ts must not inline extracted gutter logic (${fragment.split("\n")[0]})`, fragment);
    }
}

const gutterMenuBarrelFragments = [
    'export {renderMultipleMenu} from "./menus/multiple";',
    'export {renderMenu} from "./menus/single";',
];

for (const fragment of gutterMenuBarrelFragments) {
    if (!gutterMenusText.includes(fragment)) {
        addFinding(gutterMenusPath, `gutter/menus.ts is missing required re-export (${fragment})`, fragment);
    }
}

const gutterSingleRequiredFragments = [
    'import {appendClipboardSection} from "./clipboard";',
    'import {appendFooterSections} from "./footer";',
    'import {prepareSingleMenuContext} from "./resolve";',
    'import {appendSpecializedSection} from "./specialized";',
    'import {appendTurnIntoSection} from "./turnInto";',
    "const result = prepareSingleMenuContext(gutterElement, protyle, buttonElement);",
    "appendTurnIntoSection(result.context);",
    "appendClipboardSection(result.context);",
    "appendSpecializedSection(result.context);",
    "appendFooterSections(result.context);",
];

for (const fragment of gutterSingleRequiredFragments) {
    if (!gutterSingleMenuText.includes(fragment)) {
        addFinding(gutterSingleMenuPath, `gutter/menus/single.ts is missing required delegation (${fragment})`, fragment);
    }
}

for (const fragment of ["export const renderMenu =", "export const renderMultipleMenu ="]) {
    if (gutterMenusText.includes(fragment)) {
        addFinding(gutterMenusPath, `gutter/menus.ts must not inline extracted logic (${fragment})`, fragment);
    }
}

for (const fragment of [
    "const turnIntoSubmenu: IMenu[] = [];",
    "const copyMenu = (copySubMenu([id], true, nodeElement) as IMenu[]).concat([",
    "if (type === \"NodeSuperBlock\" && !protyle.disabled) {",
    "if (protyle?.app?.plugins) {",
]) {
    if (gutterSingleMenuText.includes(fragment)) {
        addFinding(gutterSingleMenuPath, `gutter/menus/single.ts must not inline extracted logic (${fragment})`, fragment);
    }
}

const requiredModules = [
    ["src/protyle/gutter/actions.ts", "export const createTurnsIntoMenu ="],
    ["src/protyle/gutter/menus.ts", "export {renderMultipleMenu} from \"./menus/multiple\";"],
    ["src/protyle/gutter/menus/multiple.ts", "export const renderMultipleMenu ="],
    ["src/protyle/gutter/menus/single.ts", "export const renderMenu ="],
    ["src/protyle/gutter/menus/resolve.ts", "export const prepareSingleMenuContext ="],
    ["src/protyle/gutter/menus/turnInto.ts", "export const appendTurnIntoSection ="],
    ["src/protyle/gutter/menus/clipboard.ts", "export const appendClipboardSection ="],
    ["src/protyle/gutter/menus/specialized.ts", "export const appendSpecializedSection ="],
    ["src/protyle/gutter/menus/footer.ts", "export const appendFooterSections ="],
    ["src/protyle/gutter/menus/shared.ts", "export interface SingleMenuContext"],
    ["src/protyle/gutter/render.ts", "export const renderGutter ="],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for gutter modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(filePath, `${relativePath} is missing the expected export`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[gutter-modularity] ok");
    process.exit(0);
}

console.error(`[gutter-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
