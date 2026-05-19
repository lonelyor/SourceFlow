const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const findings = [];

const toRepoPath = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/");

const addFinding = (relativePath, message, pattern = "") => {
    const filePath = path.join(appRoot, relativePath);
    const text = fs.readFileSync(filePath, "utf8");
    const index = pattern ? text.indexOf(pattern) : 0;
    const before = text.slice(0, Math.max(0, index));
    findings.push({
        filePath,
        line: before.split(/\r?\n/).length,
        message,
    });
};

const checkThinBarrel = (relativePath, maxLines, requiredFragments, bannedFragments = []) => {
    const filePath = path.join(appRoot, relativePath);
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/).length;
    if (lines > maxLines) {
        addFinding(relativePath, `${relativePath} must stay under ${maxLines} lines after runtime modularization`);
    }
    for (const fragment of requiredFragments) {
        if (!text.includes(fragment)) {
            addFinding(relativePath, `${relativePath} is missing required delegation (${fragment})`, fragment);
        }
    }
    for (const fragment of bannedFragments) {
        if (text.includes(fragment)) {
            addFinding(relativePath, `${relativePath} must not inline extracted logic (${fragment})`, fragment);
        }
    }
};

const checkModuleShape = (relativePath, requiredFragments, bannedFragments = []) => {
    const filePath = path.join(appRoot, relativePath);
    const text = fs.readFileSync(filePath, "utf8");
    for (const fragment of requiredFragments) {
        if (!text.includes(fragment)) {
            addFinding(relativePath, `${relativePath} is missing required fragment (${fragment})`, fragment);
        }
    }
    for (const fragment of bannedFragments) {
        if (text.includes(fragment)) {
            addFinding(relativePath, `${relativePath} must not inline extracted logic (${fragment})`, fragment);
        }
    }
};

checkThinBarrel("src/workbench/dialog.ts", 4, [
    'export * from "./dialogRuntime";',
], [
    "export const openWorkbenchDialog =",
    "export const openWorkbenchAssistant =",
    "export interface IWorkbenchRule",
]);

checkThinBarrel("src/search/util.ts", 4, [
    'export * from "./utilRuntime";',
], [
    "export const openGlobalSearch =",
    "export const genSearch =",
    "export const replace =",
]);

checkThinBarrel("src/boot/globalEvent/keydown.ts", 4, [
    'export {windowKeyDown, sendGlobalShortcut, sendUnregisterGlobalShortcut} from "./keydownRuntime";',
], [
    "export const windowKeyDown =",
    "export const sendGlobalShortcut =",
    "export const sendUnregisterGlobalShortcut =",
]);

checkThinBarrel("src/assistant/ai/AIDock.ts", 4, [
    'export {destroyAssistantAIDock, mountAssistantAIDock, openAssistantAIDock, resizeAssistantAIDock, updateAssistantAIDock} from "./AIDockRuntime";',
], [
    "export const mountAssistantAIDock =",
    "export const destroyAssistantAIDock =",
    "export const openAssistantAIDock =",
]);

checkThinBarrel("src/config/appearance.ts", 4, [
    'export {appearance} from "./appearanceRuntime";',
], [
    "export const appearance =",
]);

checkThinBarrel("src/boot/globalEvent/keydownRuntime.ts", 4, [
    'export {windowKeyDown} from "./keydownWindow";',
    'export {sendGlobalShortcut, sendUnregisterGlobalShortcut} from "./keydownShortcut";',
], [
    "export const windowKeyDown =",
    "export const sendGlobalShortcut =",
    "export const sendUnregisterGlobalShortcut =",
]);

checkThinBarrel("src/search/utilRuntime.ts", 4, [
    'export {genQueryHTML, genSearch, openGlobalSearch, updateConfig} from "./searchPanel";',
    'export {getArticle, getAttr, inputEvent, openSearchEditor, replace} from "./searchResults";',
], [
    "export const openGlobalSearch =",
    "export const genSearch =",
    "export const replace =",
]);

checkThinBarrel("src/workbench/dialogRuntime.ts", 4, [
    'export * from "./dialogCore";',
], [
    "export const openWorkbenchDialog =",
    "export const openWorkbenchAssistant = async",
    "export interface IWorkbenchRule",
]);

checkThinBarrel("src/assistant/ai/AIDockRuntime.ts", 4, [
    'export {destroyAssistantAIDock, mountAssistantAIDock, openAssistantAIDock, resizeAssistantAIDock, updateAssistantAIDock} from "./AIDockInstance";',
], [
    "export const mountAssistantAIDock =",
    "export const destroyAssistantAIDock =",
    "export const openAssistantAIDock =",
]);

checkThinBarrel("src/workbench/dialogCore.ts", 4, [
    'export * from "./dialogController";',
], [
    "export const openWorkbenchDialog =",
    "export const openWorkbenchAssistant = async",
    "export interface IWorkbenchRule",
]);

checkThinBarrel("src/assistant/ai/AIDockInstance.ts", 4, [
    'export {destroyAssistantAIDock, mountAssistantAIDock, openAssistantAIDock, resizeAssistantAIDock, updateAssistantAIDock} from "./AIDockController";',
], [
    "export const mountAssistantAIDock =",
    "export const destroyAssistantAIDock =",
    "export const openAssistantAIDock =",
]);

checkModuleShape("src/config/appearanceRuntime.ts", [
    'from "./appearanceHelpers";',
    "export const appearance = {",
], [
    "const escapeCSSURL =",
    "const syncMascotControls =",
]);

const requiredModules = [
    ["src/workbench/dialogShared.ts", "export interface IWorkbenchRule"],
    ["src/workbench/dialogRender.ts", "export const getPrimaryTime ="],
    ["src/workbench/dialogQuery.ts", "export const resolveWorkbenchContext = async"],
    ["src/workbench/dialogRules.ts", "export const applyWorkbenchRulesToAttrs ="],
    ["src/workbench/dialogBinding.ts", "export const appendMarkdownToCurrentNote = async"],
    ["src/workbench/dialogMeta.ts", "export const openWorkbenchMetaDialog ="],
    ["src/workbench/dialogDraft.ts", "export const buildWorkbenchDraft = async"],
    ["src/workbench/dialogScreen.ts", "export const buildWorkbenchDialogHTML ="],
    ["src/workbench/dialogEvents.ts", "export const bindWorkbenchDialogEvents ="],
    ["src/workbench/dialogController.ts", "export const openWorkbenchDialog ="],
    ["src/workbench/dialogController.ts", "export const openWorkbenchAssistant = async"],
    ["src/workbench/dialogController.ts", 'from "./dialogScreen";'],
    ["src/workbench/dialogController.ts", 'from "./dialogEvents";'],
    ["src/search/searchAI.ts", "export {getSearchAIState, renderSearchAIPanel, resetSearchAI, runSearchAI};"],
    ["src/search/searchPanel.ts", "export const openGlobalSearch ="],
    ["src/search/searchPanel.ts", "export const genSearch ="],
    ["src/search/searchResults.ts", "export const getArticle ="],
    ["src/search/searchResults.ts", "export const replace ="],
    ["src/search/searchResults.ts", "export {focusSearchResultById, renderNextSearchMark};"],
    ["src/boot/globalEvent/keydownWindow.ts", "export const windowKeyDown ="],
    ["src/boot/globalEvent/keydownShortcut.ts", "export const sendGlobalShortcut ="],
    ["src/boot/globalEvent/keydownShortcut.ts", "export const sendUnregisterGlobalShortcut ="],
    ["src/assistant/ai/AIDockShared.ts", "export type TAssistantAIMessageItem ="],
    ["src/assistant/ai/AIDockController.ts", "class AssistantAIDock"],
    ["src/assistant/ai/AIDockController.ts", "export const mountAssistantAIDock ="],
    ["src/assistant/ai/AIDockController.ts", "export const openAssistantAIDock ="],
    ["src/assistant/ai/AIDockContract.ts", "export interface IAssistantAIDockRuntime"],
    ["src/assistant/ai/AIDockMessage.ts", "export const sendAIDockMessage = async"],
    ["src/assistant/ai/AIDockState.ts", "export const refreshAIDock = async"],
    ["src/assistant/ai/AIDockEvents.ts", "export const bindAIDockEvents ="],
    ["src/assistant/ai/AIDockRender.ts", "export const renderAssistantAIDock ="],
    ["src/assistant/ai/AIDockRenderShared.ts", "export const renderAIDockQuickActions ="],
    ["src/assistant/ai/AIDockRenderSessions.ts", "export const renderAIDockSessions ="],
    ["src/assistant/ai/AIDockRenderMessages.ts", "export const renderAIDockMessages ="],
    ["src/assistant/ai/AIDockRenderComposer.ts", "export const renderAIDockModelLauncher ="],
    ["src/assistant/ai/AIDockRenderPanels.ts", "export const renderAIDockFloatingPanel ="],
    ["src/assistant/ai/AIDockController.ts", 'from "./AIDockRender";'],
    ["src/assistant/ai/AIDockController.ts", 'from "./AIDockMessage";'],
    ["src/assistant/ai/AIDockController.ts", 'from "./AIDockState";'],
    ["src/assistant/ai/AIDockController.ts", 'from "./AIDockEvents";'],
    ["src/assistant/ai/AIDockRender.ts", 'from "./AIDockRenderShared";'],
    ["src/assistant/ai/AIDockRender.ts", 'from "./AIDockRenderSessions";'],
    ["src/assistant/ai/AIDockRender.ts", 'from "./AIDockRenderMessages";'],
    ["src/assistant/ai/AIDockRender.ts", 'from "./AIDockRenderComposer";'],
    ["src/assistant/ai/AIDockRender.ts", 'from "./AIDockRenderPanels";'],
    ["src/config/appearanceHelpers.ts", "export const escapeCSSURL ="],
    ["src/config/appearanceHelpers.ts", "export const syncMascotControls ="],
    ["src/config/appearanceRuntime.ts", "export const appearance ="],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for system runtime modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(relativePath, `${relativePath} is missing expected fragment`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[system-runtime-modularity] ok");
    process.exit(0);
}

console.error(`[system-runtime-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
