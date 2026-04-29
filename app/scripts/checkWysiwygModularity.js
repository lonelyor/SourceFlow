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

const wysiwygIndexPath = path.join(appRoot, "src", "protyle", "wysiwyg", "index.ts");
const wysiwygIndexText = fs.readFileSync(wysiwygIndexPath, "utf8");
const wysiwygIndexLines = wysiwygIndexText.split(/\r?\n/).length;
const commonEventsPath = path.join(appRoot, "src", "protyle", "wysiwyg", "commonEvents.ts");
const editorEventsPath = path.join(appRoot, "src", "protyle", "wysiwyg", "editorEvents.ts");
const commonEventsText = fs.readFileSync(commonEventsPath, "utf8");
const editorEventsText = fs.readFileSync(editorEventsPath, "utf8");
const commonEventsLines = commonEventsText.split(/\r?\n/).length;
const editorEventsLines = editorEventsText.split(/\r?\n/).length;

if (wysiwygIndexLines > 260) {
    addFinding(wysiwygIndexPath, "wysiwyg/index.ts must stay a thin coordination layer");
}

if (commonEventsLines > 20) {
    addFinding(commonEventsPath, "wysiwyg/commonEvents.ts must stay a thin coordination layer");
}

if (editorEventsLines > 40) {
    addFinding(editorEventsPath, "wysiwyg/editorEvents.ts must stay a thin coordination layer");
}

const requiredIndexFragments = [
    'import {bindCommonEvent as bindCommonEventImpl} from "./commonEvents";',
    'import {bindEvent as bindEditorEventImpl} from "./editorEvents";',
    'import {emojiToMd as emojiToMdImpl, escapeInline as escapeInlineImpl, setEmptyOutline as setEmptyOutlineImpl} from "./helpers";',
    "return bindCommonEventImpl(this as unknown as WYSIWYGEventContext, protyle);",
    "return bindEditorEventImpl(this as unknown as WYSIWYGEventContext, protyle);",
];

for (const fragment of requiredIndexFragments) {
    if (!wysiwygIndexText.includes(fragment)) {
        addFinding(wysiwygIndexPath, `wysiwyg/index.ts is missing required delegation (${fragment})`, fragment);
    }
}

const bannedFragments = [
    "private bindCommonEvent(protyle: IProtyle) {\n        this.element.addEventListener(",
    "private bindEvent(protyle: IProtyle) {\n        protyle.observer = new ResizeObserver(",
    "private emojiToMd(element: HTMLElement) {\n        element.querySelectorAll(\".emoji\")",
    "private escapeInline(protyle: IProtyle, range: Range, event: InputEvent) {\n        if (!event.data",
];

for (const fragment of bannedFragments) {
    if (wysiwygIndexText.includes(fragment)) {
        addFinding(wysiwygIndexPath, `wysiwyg/index.ts must not inline extracted logic (${fragment.split("\n")[0]})`, fragment);
    }
}

const requiredModules = [
    ["src/protyle/wysiwyg/shared.ts", "export interface WYSIWYGEventContext"],
    ["src/protyle/wysiwyg/shared.ts", "export interface WYSIWYGEditorEventState"],
    ["src/protyle/wysiwyg/helpers.ts", "export const escapeInline ="],
    ["src/protyle/wysiwyg/commonEvents.ts", "export const bindCommonEvent ="],
    ["src/protyle/wysiwyg/editorEvents.ts", "export const bindEvent ="],
    ["src/protyle/wysiwyg/commonEvents/copy.ts", "export const registerCopyEvent ="],
    ["src/protyle/wysiwyg/commonEvents/mousedown.ts", "export const registerMouseDownEvent ="],
    ["src/protyle/wysiwyg/editorEvents/focusout.ts", "export const registerFocusOutEvent ="],
    ["src/protyle/wysiwyg/editorEvents/cut.ts", "export const registerCutEvent ="],
    ["src/protyle/wysiwyg/editorEvents/contextmenu.ts", "export const registerContextMenuEvent ="],
    ["src/protyle/wysiwyg/editorEvents/pointer.ts", "export const registerPointerDownEvent ="],
    ["src/protyle/wysiwyg/editorEvents/mousewheel.ts", "export const registerMouseWheelEvent ="],
    ["src/protyle/wysiwyg/editorEvents/paste.ts", "export const registerPasteEvent ="],
    ["src/protyle/wysiwyg/editorEvents/inputLifecycle.ts", "export const registerInputLifecycleEvents ="],
    ["src/protyle/wysiwyg/editorEvents/click.ts", "export const registerClickEvents ="],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for wysiwyg modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(filePath, `${relativePath} is missing the expected export`, fragment);
    }
}

const requiredCommonEventFragments = [
    'import {registerCopyEvent} from "./commonEvents/copy";',
    'import {registerMouseDownEvent} from "./commonEvents/mousedown";',
    "registerCopyEvent(wysiwyg, protyle);",
    "registerMouseDownEvent(wysiwyg, protyle);",
];

for (const fragment of requiredCommonEventFragments) {
    if (!commonEventsText.includes(fragment)) {
        addFinding(commonEventsPath, `wysiwyg/commonEvents.ts is missing required delegation (${fragment})`, fragment);
    }
}

const requiredEditorEventFragments = [
    'import {registerClickEvents} from "./editorEvents/click";',
    'import {registerContextMenuEvent} from "./editorEvents/contextmenu";',
    'import {registerCutEvent} from "./editorEvents/cut";',
    'import {registerFocusOutEvent} from "./editorEvents/focusout";',
    'import {registerInputLifecycleEvents} from "./editorEvents/inputLifecycle";',
    'import {registerMouseWheelEvent} from "./editorEvents/mousewheel";',
    'import {registerPasteEvent} from "./editorEvents/paste";',
    'import {registerPointerDownEvent} from "./editorEvents/pointer";',
    "const state: WYSIWYGEditorEventState = {",
    "registerClickEvents(wysiwyg, protyle, state);",
];

for (const fragment of requiredEditorEventFragments) {
    if (!editorEventsText.includes(fragment)) {
        addFinding(editorEventsPath, `wysiwyg/editorEvents.ts is missing required delegation (${fragment})`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[wysiwyg-modularity] ok");
    process.exit(0);
}

console.error(`[wysiwyg-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
