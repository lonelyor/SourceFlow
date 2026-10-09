const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", "src", ...parts), "utf8");
const readRoot = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

const test = (name, fn) => {
    try {
        fn();
        console.log(`[related-notes-panel] ok - ${name}`);
    } catch (error) {
        console.error(`[related-notes-panel] failed - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

const panelSource = read("assistant", "search", "relatedNotesPanel.ts");
const pluginSource = read("assistant", "BuiltinAssistantPlugin.ts");
const scssSource = read("assets", "scss", "business", "_assistant.scss");
const packageSource = readRoot("package.json");
const typecheckSource = readRoot("scripts", "typecheck.js");

test("related notes dock is registered through the builtin assistant plugin", () => {
    assert(panelSource.includes("export const ASSISTANT_RELATED_DOCK_KEY = \"related\""), "panel must own its dock key");
    assert(panelSource.includes("export const ASSISTANT_RELATED_DOCK_TYPE = `syassistant${ASSISTANT_RELATED_DOCK_KEY}`"), "panel must own its dock type");
    assert(pluginSource.includes("ASSISTANT_RELATED_DOCK_KEY = \"related\""), "plugin must register the related dock key");
    assert(pluginSource.includes("import(\"./search/relatedNotesPanel\")"), "plugin must lazy-load the panel module");
    assert(pluginSource.includes("mount: module.mountAssistantRelatedDock"), "plugin must wire panel mount");
    assert(pluginSource.includes("destroy: module.destroyAssistantRelatedDock"), "plugin must wire panel destroy");
    assert(pluginSource.includes("resize: module.resizeAssistantRelatedDock"), "plugin must wire panel resize");
    assert(pluginSource.includes("update: module.updateAssistantRelatedDock"), "plugin must wire panel update");
    assert(/type: ASSISTANT_RELATED_DOCK_KEY/.test(pluginSource), "addDock must use the related dock key");
    assert(pluginSource.includes("icon: \"iconLink\""), "dock icon must reuse an existing svg icon");
    assert(panelSource.includes("export const mountAssistantRelatedDock"), "panel must export mount");
    assert(panelSource.includes("export const destroyAssistantRelatedDock"), "panel must export destroy");
    assert(panelSource.includes("export const resizeAssistantRelatedDock"), "panel must export resize");
    assert(panelSource.includes("export const updateAssistantRelatedDock"), "panel must export update");
    assert(panelSource.includes("export const openAssistantRelatedDock"), "panel must export an open entry");
    assert(panelSource.includes("getDockByType(ASSISTANT_RELATED_DOCK_TYPE)"), "open entry must resolve the dock by type");
    assert(panelSource.includes("dock.toggleModel(ASSISTANT_RELATED_DOCK_TYPE, true)"), "open entry must toggle the dock model");
});

test("dock key and title literals stay in sync between plugin and panel module", () => {
    const keyMatch = panelSource.match(/ASSISTANT_RELATED_DOCK_KEY = "([^"]+)"/);
    assert(keyMatch, "panel dock key literal must exist");
    assert(pluginSource.includes(`ASSISTANT_RELATED_DOCK_KEY = "${keyMatch[1]}"`), "plugin dock key must match the panel module");
    const typeMatch = panelSource.match(/ASSISTANT_RELATED_DOCK_TYPE = `([a-z]+)\$\{ASSISTANT_RELATED_DOCK_KEY\}`/);
    assert(typeMatch && typeMatch[1] === "syassistant", "dock type must be prefixed with the assistant plugin name");
    assert(panelSource.includes("assistantRelatedDockTitle = () => assistantText(\"相关笔记\", \"Related Notes\")"), "panel title must be bilingual");
    assert(pluginSource.includes("assistantRelatedDockTitle = () => assistantText(\"相关笔记\", \"Related Notes\")"), "plugin isolation title must match");
    assert(panelSource.includes("width: 320"), "default width must align with the results dock (320)");
});

test("panel reacts to current note switches with a 500ms debounce", () => {
    assert(panelSource.includes("RELATED_NOTES_SWITCH_DEBOUNCE_MS = 500"), "switch debounce must be 500ms");
    assert(panelSource.includes("document.addEventListener(\"selectionchange\", this.handleEditorActivity)"), "selectionchange must trigger refresh");
    assert(panelSource.includes("document.addEventListener(\"click\", this.handleEditorActivity, true)"), "captured click must trigger refresh");
    assert(panelSource.includes("window.addEventListener(\"focus\", this.handleEditorActivity)"), "window focus must trigger refresh");
    assert(panelSource.includes("document.removeEventListener(\"selectionchange\", this.handleEditorActivity)"), "selectionchange listener must be removable");
    assert(panelSource.includes("document.removeEventListener(\"click\", this.handleEditorActivity, true)"), "click listener must be removable");
    assert(panelSource.includes("window.removeEventListener(\"focus\", this.handleEditorActivity)"), "focus listener must be removable");
    assert(panelSource.includes("window.clearTimeout(this.switchTimer)"), "pending debounce must be cancellable");
    assert(panelSource.includes("getActiveEditorProtyle()?.block?.rootID"), "active note must be detected via the shared helper");
    assert(panelSource.includes("getAssistantNoteContextByRootID(activeRootID)"), "note title/content must come from the shared context helper");
});

test("query is built from title plus first excerpt within 200 runes and excludes the current note", () => {
    assert(panelSource.includes("RELATED_NOTES_QUERY_MAX_RUNES = 200"), "query budget must be 200 runes");
    assert(panelSource.includes("export const buildRelatedNotesQuery"), "query builder must be exported");
    assert(panelSource.includes("export const filterRelatedResults"), "result filter must be exported");
    assert(panelSource.includes("rootID: item.rootID || item.id || \"\""), "both rootID and id shapes must be normalized");
    assert(panelSource.includes("item.rootID && item.rootID !== normalized"), "current note itself must be filtered out");
    assert(panelSource.includes('"/api/assistant/embedding/search"'), "panel must call the semantic search endpoint");
    assert(panelSource.includes("RELATED_NOTES_QUERY_LIMIT = 12"), "search must pass a bounded limit");
    assert(panelSource.includes("Array.from("), "rune-aware truncation must back the 200/40-char budgets");
    assert(panelSource.includes("RELATED_NOTES_SUMMARY_RUNES = 40"), "summaries must be capped at 40 runes");
});

test("panel renders three states: loading skeleton, ready list, and guidance empty states", () => {
    assert(panelSource.includes("type TRelatedPanelState = \"no-note\" | \"loading\" | \"ready\" | \"empty\" | \"unconfigured\" | \"error\""), "panel must model all states");
    assert(panelSource.includes("assistant-related__skeleton-item"), "loading state must render a skeleton");
    assert(panelSource.includes("data-action=\"open-related\""), "ready state must render clickable items");
    assert(panelSource.includes("panelEmptyHTML("), "empty states must reuse the shared empty panel style");
    assert(scssSource.includes(".assistant-related"), "panel styles must exist");
    assert(scssSource.includes("&__item-summary"), "summary styles must exist");
    assert(scssSource.includes("assistant-related-skeleton"), "skeleton animation must exist");
});

test("clicking a result opens the note via openFileById", () => {
    assert(panelSource.includes("openFileById({"), "results must jump via openFileById");
    assert(panelSource.includes("app: this.app,"), "openFileById must receive the app");
    assert(panelSource.includes("id,"), "openFileById must receive the target id");
    assert(panelSource.includes("Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS"), "jump must scroll to and focus the note");
    assert(panelSource.includes("data-related-id"), "items must carry the target note id");
});

test("unconfigured embedding shows friendly guidance with a shortcut to AI settings", () => {
    assert(panelSource.includes("export const isEmbeddingNotEnabledMessage"), "embedding-disabled detection must be exported");
    assert(panelSource.includes("\"embedding is not enabled\""), "backend message must be recognized");
    assert(panelSource.includes("assistantText(\"语义搜索未开启\", \"Semantic search is off\")"), "unconfigured title must be friendly and bilingual");
    assert(panelSource.includes("assistantText(\"去配置\", \"Configure\")"), "unconfigured state must offer a configure action");
    assert(panelSource.includes("data-action=\"open-ai-settings\"") || panelSource.includes("\"open-ai-settings\""), "configure action must be wired");
    assert(panelSource.includes("openSettingTab(this.app, \"AI\")"), "configure action must jump to the AI settings tab");
});

test("query failures degrade silently to an empty state with retry, without toasts", () => {
    assert(!panelSource.includes("showMessage"), "panel must never toast failures");
    assert(panelSource.includes("assistantText(\"重试\", \"Retry\")"), "error state must offer retry");
    assert(panelSource.includes("data-action=\"retry\"") || panelSource.includes("\"retry\""), "retry action must be wired");
    assert(panelSource.includes("void this.refresh(true)"), "retry must force a refresh");
    assert(!panelSource.includes("/api/block/appendBlock"), "panel must not write blocks");
    assert(!panelSource.includes("/api/block/updateBlock"), "panel must not update blocks");
    assert(!panelSource.includes("/api/block/deleteBlock"), "panel must not delete blocks");
    assert(!panelSource.includes("setBlockAttrs"), "panel must not write attributes");
});

test("test entry is registered in package.json and typecheck pipeline", () => {
    const parsed = JSON.parse(packageSource);
    assert(parsed.scripts["test:related-notes-panel"] === "node ./scripts/testRelatedNotesPanel.js", "package.json must register the test script");
    assert(typecheckSource.includes("runRelatedNotesPanelTest"), "typecheck pipeline must run the panel test");
    assert(typecheckSource.includes("testRelatedNotesPanel.js"), "typecheck pipeline must reference the test file");
});
