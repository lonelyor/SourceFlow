const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");

const read = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), "utf8");

assert.deepStrictEqual(read("src/workbench/dialog.ts").trim().split(/\r?\n/), [
    'export * from "./dialogRuntime";',
]);

assert.deepStrictEqual(read("src/search/util.ts").trim().split(/\r?\n/), [
    'export * from "./utilRuntime";',
]);

assert.deepStrictEqual(read("src/boot/globalEvent/keydown.ts").trim().split(/\r?\n/), [
    'export {windowKeyDown, sendGlobalShortcut, sendUnregisterGlobalShortcut} from "./keydownRuntime";',
]);

assert.deepStrictEqual(read("src/assistant/ai/AIDock.ts").trim().split(/\r?\n/), [
    'export {destroyAssistantAIDock, mountAssistantAIDock, openAssistantAIDock, resizeAssistantAIDock, updateAssistantAIDock} from "./AIDockRuntime";',
]);

assert.deepStrictEqual(read("src/config/appearance.ts").trim().split(/\r?\n/), [
    'export {appearance} from "./appearanceRuntime";',
]);

assert.deepStrictEqual(read("src/boot/globalEvent/keydownRuntime.ts").trim().split(/\r?\n/), [
    'export {windowKeyDown} from "./keydownWindow";',
    'export {sendGlobalShortcut, sendUnregisterGlobalShortcut} from "./keydownShortcut";',
]);

assert.deepStrictEqual(read("src/search/utilRuntime.ts").trim().split(/\r?\n/), [
    'export {genQueryHTML, genSearch, openGlobalSearch, updateConfig} from "./searchPanel";',
    'export {getArticle, getAttr, inputEvent, openSearchEditor, replace} from "./searchResults";',
]);

assert.deepStrictEqual(read("src/workbench/dialogRuntime.ts").trim().split(/\r?\n/), [
    'export * from "./dialogCore";',
]);

assert.deepStrictEqual(read("src/assistant/ai/AIDockRuntime.ts").trim().split(/\r?\n/), [
    'export {destroyAssistantAIDock, mountAssistantAIDock, openAssistantAIDock, resizeAssistantAIDock, updateAssistantAIDock} from "./AIDockInstance";',
]);

assert.deepStrictEqual(read("src/workbench/dialogCore.ts").trim().split(/\r?\n/), [
    'export * from "./dialogController";',
]);

assert.deepStrictEqual(read("src/assistant/ai/AIDockInstance.ts").trim().split(/\r?\n/), [
    'export {destroyAssistantAIDock, mountAssistantAIDock, openAssistantAIDock, resizeAssistantAIDock, updateAssistantAIDock} from "./AIDockController";',
]);

const expectedFiles = [
    "src/workbench/dialogRuntime.ts",
    "src/workbench/dialogCore.ts",
    "src/workbench/dialogController.ts",
    "src/workbench/dialogShared.ts",
    "src/workbench/dialogRender.ts",
    "src/workbench/dialogQuery.ts",
    "src/workbench/dialogRules.ts",
    "src/workbench/dialogBinding.ts",
    "src/workbench/dialogMeta.ts",
    "src/workbench/dialogDraft.ts",
    "src/workbench/dialogScreen.ts",
    "src/workbench/dialogEvents.ts",
    "src/search/utilRuntime.ts",
    "src/search/searchAI.ts",
    "src/search/searchPanel.ts",
    "src/search/searchResults.ts",
    "src/boot/globalEvent/keydownRuntime.ts",
    "src/boot/globalEvent/keydownWindow.ts",
    "src/boot/globalEvent/keydownShortcut.ts",
    "src/assistant/ai/AIDockRuntime.ts",
    "src/assistant/ai/AIDockInstance.ts",
    "src/assistant/ai/AIDockController.ts",
    "src/assistant/ai/AIDockContract.ts",
    "src/assistant/ai/AIDockMessage.ts",
    "src/assistant/ai/AIDockState.ts",
    "src/assistant/ai/AIDockEvents.ts",
    "src/assistant/ai/AIDockShared.ts",
    "src/assistant/ai/AIDockRender.ts",
    "src/assistant/ai/AIDockRenderShared.ts",
    "src/assistant/ai/AIDockRenderSessions.ts",
    "src/assistant/ai/AIDockRenderMessages.ts",
    "src/assistant/ai/AIDockRenderComposer.ts",
    "src/assistant/ai/AIDockRenderPanels.ts",
    "src/config/appearanceRuntime.ts",
    "src/config/appearanceHelpers.ts",
];

for (const fileName of expectedFiles) {
    assert.ok(fs.existsSync(path.join(appRoot, fileName)), `${fileName} should exist`);
}

assert.ok(read("src/workbench/dialogController.ts").includes("export const openWorkbenchDialog ="));
assert.ok(read("src/workbench/dialogShared.ts").includes("export interface IWorkbenchRule"));
assert.ok(read("src/workbench/dialogRender.ts").includes("export const getPrimaryTime ="));
assert.ok(read("src/workbench/dialogQuery.ts").includes("export const resolveWorkbenchContext = async"));
assert.ok(read("src/workbench/dialogRules.ts").includes("export const applyWorkbenchRulesToAttrs ="));
assert.ok(read("src/workbench/dialogBinding.ts").includes("export const appendMarkdownToCurrentNote = async"));
assert.ok(read("src/workbench/dialogMeta.ts").includes("export const openWorkbenchMetaDialog ="));
assert.ok(read("src/workbench/dialogDraft.ts").includes("export const buildWorkbenchDraft = async"));
assert.ok(read("src/workbench/dialogScreen.ts").includes("export const buildWorkbenchDialogHTML ="));
assert.ok(read("src/workbench/dialogEvents.ts").includes("export const bindWorkbenchDialogEvents ="));
assert.ok(read("src/workbench/dialogController.ts").includes('from "./dialogScreen";'));
assert.ok(read("src/workbench/dialogController.ts").includes('from "./dialogEvents";'));
assert.ok(read("src/search/searchAI.ts").includes("export {getSearchAIState, renderSearchAIPanel, resetSearchAI, runSearchAI};"));
assert.ok(read("src/search/searchPanel.ts").includes("export const openGlobalSearch ="));
assert.ok(read("src/search/searchResults.ts").includes("export const getArticle ="));
assert.ok(read("src/boot/globalEvent/keydownWindow.ts").includes("export const windowKeyDown ="));
assert.ok(read("src/boot/globalEvent/keydownShortcut.ts").includes("export const sendGlobalShortcut ="));
assert.ok(read("src/assistant/ai/AIDockController.ts").includes("export const mountAssistantAIDock ="));
assert.ok(read("src/assistant/ai/AIDockContract.ts").includes("export interface IAssistantAIDockRuntime"));
assert.ok(read("src/assistant/ai/AIDockMessage.ts").includes("export const sendAIDockMessage = async"));
assert.ok(read("src/assistant/ai/AIDockState.ts").includes("export const refreshAIDock = async"));
assert.ok(read("src/assistant/ai/AIDockEvents.ts").includes("export const bindAIDockEvents ="));
assert.ok(read("src/assistant/ai/AIDockShared.ts").includes("export type TAssistantAIMessageItem ="));
assert.ok(read("src/assistant/ai/AIDockRender.ts").includes("export const renderAssistantAIDock ="));
assert.ok(read("src/assistant/ai/AIDockRenderShared.ts").includes("export const renderAIDockQuickActions ="));
assert.ok(read("src/assistant/ai/AIDockRenderSessions.ts").includes("export const renderAIDockSessions ="));
assert.ok(read("src/assistant/ai/AIDockRenderMessages.ts").includes("export const renderAIDockMessages ="));
assert.ok(read("src/assistant/ai/AIDockRenderComposer.ts").includes("export const renderAIDockModelLauncher ="));
assert.ok(read("src/assistant/ai/AIDockRenderPanels.ts").includes("export const renderAIDockFloatingPanel ="));
assert.ok(read("src/assistant/ai/AIDockController.ts").includes('from "./AIDockRender";'));
assert.ok(read("src/assistant/ai/AIDockController.ts").includes('from "./AIDockMessage";'));
assert.ok(read("src/assistant/ai/AIDockController.ts").includes('from "./AIDockState";'));
assert.ok(read("src/assistant/ai/AIDockController.ts").includes('from "./AIDockEvents";'));
assert.ok(read("src/assistant/ai/AIDockRender.ts").includes('from "./AIDockRenderShared";'));
assert.ok(read("src/assistant/ai/AIDockRender.ts").includes('from "./AIDockRenderSessions";'));
assert.ok(read("src/assistant/ai/AIDockRender.ts").includes('from "./AIDockRenderMessages";'));
assert.ok(read("src/assistant/ai/AIDockRender.ts").includes('from "./AIDockRenderComposer";'));
assert.ok(read("src/assistant/ai/AIDockRender.ts").includes('from "./AIDockRenderPanels";'));
assert.ok(read("src/config/appearanceHelpers.ts").includes("export const escapeCSSURL ="));
assert.ok(read("src/config/appearanceRuntime.ts").includes('from "./appearanceHelpers";'));
assert.ok(read("src/config/appearanceRuntime.ts").includes("export const appearance ="));

console.log("[system-runtime-modules] ok");
