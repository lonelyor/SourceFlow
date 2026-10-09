const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", "src", ...parts), "utf8");

const test = (name, fn) => {
    try {
        fn();
        console.log(`[assistant-settings-guards] ok - ${name}`);
    } catch (error) {
        console.error(`[assistant-settings-guards] failed - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

const aiSource = read("config", "ai.ts");
const configIndexSource = read("config", "index.ts");
const scssSource = read("assets", "scss", "business", "_assistant.scss");

const mediaStart = scssSource.indexOf("@media (max-width: 680px)");
const mediaBlock = mediaStart === -1 ? "" : scssSource.slice(mediaStart, scssSource.indexOf("\n}", mediaStart) + 2);

test("S2: embedding section has the serialize/isDirty/markClean dirty trio", () => {
    assert(aiSource.includes("serializeEmbeddingValues"), "embedding draft must have a deterministic serializer");
    assert(aiSource.includes("const markEmbeddingClean"), "embedding must be able to mark the snapshot clean");
    assert(aiSource.includes("const isEmbeddingDirty"), "embedding must expose a dirty check");
    // API key is secret-managed and excluded from the comparison (ProfilesPanel
    // precedent): the serializer must only cover provider/baseURL/model/enabled.
    assert(aiSource.includes("const serializeEmbeddingValues = (provider: string, baseURL: string, model: string, enabled: boolean)"),
        "serializer whitelist must exclude the API key");
    assert(aiSource.includes("export const isAiSettingsDirty"), "combined dirty check must be exported for the leave guard");
});

test("S2: security section has the same dirty trio with deterministic capabilities", () => {
    assert(aiSource.includes("const markSecurityClean"), "security must be able to mark the snapshot clean");
    assert(aiSource.includes("const isSecurityDirty"), "security must expose a dirty check");
    assert(aiSource.includes("SECURITY_CAPABILITY_KEYS"), "capability switches must serialize in fixed key order");
    assert(aiSource.includes("parseSecurityBatchThreshold"), "threshold parsing must be shared by dirty check and save");
});

test("S2: markClean runs after load and after save for both sections", () => {
    const loadAndSaveMarks = aiSource.match(/markEmbeddingClean\(\)/g) || [];
    assert(loadAndSaveMarks.length >= 2, "embedding snapshot must reset on load and on save");
    const securityMarks = aiSource.match(/markSecurityClean\(\)/g) || [];
    assert(securityMarks.length >= 2, "security snapshot must reset on load and on save");
});

test("S2: leave guard goes through confirmDialog with save-or-discard and pending navigation", () => {
    assert(aiSource.includes("import {confirmDialog}"), "must reuse the shared confirm dialog");
    assert(aiSource.includes("const confirmAiSettingsLeave"), "leave guard must be centralized");
    assert(aiSource.includes("pendingAiSettingsLeave"), "pending navigation must be remembered so the user confirms once");
    assert(aiSource.includes("const saveDirtySectionsAndLeave"), "confirm must save the dirty sections before leaving");
    assert(aiSource.includes("const discardAiSettingsAndLeave"), "cancel must discard the changes before leaving");
    assert(aiSource.includes("有未保存的改动"), "dialog must warn about unsaved changes");
});

test("S2: save buttons echo the saved state", () => {
    assert(aiSource.includes("const refreshEmbeddingSaveButton"), "embedding save button must refresh its state");
    assert(aiSource.includes("const refreshSecuritySaveButton"), "security save button must refresh its state");
    assert(aiSource.includes('assistantText("已保存", "Saved")'), "clean sections must show the saved state on the button");
    assert(aiSource.includes("watchSectionDirtyState"), "edits must refresh the button without rebinding duplicates");
});

test("S2: config/index.ts hooks tab switching and dialog closing into the guard", () => {
    assert(configIndexSource.includes("ai.confirmLeave("), "AI panel guard must be invoked from the settings hooks");
    assert(configIndexSource.includes('!ai.confirmLeave(() => item.dispatchEvent(new CustomEvent("click")))'),
        "tab switch must be deferred until the guard resolves, then re-dispatched");
    assert(configIndexSource.includes("!ai.confirmLeave(() => dialog.destroy())"),
        "dialog close must be deferred until the guard resolves");
    assert(configIndexSource.includes('target?.closest(".b3-dialog__close")') && configIndexSource.includes('target?.closest(".b3-dialog__scrim")'),
        "close button and scrim must both be guarded");
    assert(configIndexSource.includes("event.stopImmediatePropagation()"), "guarded close must hold back destroy()");
    assert(configIndexSource.includes('if (type !== "AI" && !ai.confirmLeave'), "switching within the AI tab itself must not prompt");
});

test("S5: provider dropdown comes from the shared provider directory API", () => {
    assert(aiSource.includes('import {listAssistantAIProviders} from "../assistant/ai/api"'), "provider list must come from the assistant API module");
    assert(aiSource.includes("listAssistantAIProviders()"), "provider list must be fetched from /api/assistant/ai/provider/list");
    assert(aiSource.includes("loadEmbeddingProviderCatalog"), "the directory must be loaded for the settings page");
    assert(!aiSource.includes("embeddingProviderOptions"), "the hardcoded two-option list must be gone");
    assert(aiSource.includes("embeddingProviderFallback"), "a fallback must keep the dropdown usable when the API fails");
    assert(aiSource.includes("OpenAI 兼容协议"), "non-embedding-native providers must be annotated as OpenAI-compatible");
});

test("S5: save uses the dropdown value and provider change fills the directory default URL", () => {
    assert(aiSource.includes('const provider = (container.querySelector("#embeddingProvider") as HTMLSelectElement)?.value || embeddingConfig?.provider || "";'),
        "save must take the provider from the dropdown instead of a hardcoded id");
    assert(aiSource.includes("const embeddingProviderDefaultBaseURL"), "provider defaults must resolve from the loaded directory");
    assert(aiSource.includes("baseURLInput.value = embeddingProviderDefaultBaseURL(providerSelect.value)"),
        "switching provider must fill the directory default baseURL like ProfilesPanel");
});

test("S6: narrow-screen media query covers the profiles panel and embedding/security sections", () => {
    assert(mediaBlock.includes(".assistant-config--settings .assistant-config__body"), "settings body must be covered");
    assert(mediaBlock.includes("min-height: 0"), "wide-screen min-height: 520px must be reverted on narrow screens");
    assert(mediaBlock.includes("flex-direction: column"), "profiles panel must stack into a single column");
    assert(mediaBlock.includes(".assistant-config--settings .assistant-config__section .config__item"), "embedding/security rows must be covered");
    assert(mediaBlock.includes(".assistant-config--settings .assistant-config__section .fn__size200"), "fixed 200px controls must stretch on phones");
    assert(scssSource.includes("min-height: 520px"), "wide-screen rule keeps its height; only the narrow case is overridden");
});

test("sections render into the wrappers they are handed (querySelector matches descendants only)", () => {
    const embedRender = aiSource.slice(aiSource.indexOf("const renderEmbeddingSection"), aiSource.indexOf("const bindEmbeddingEvents"));
    const securityRender = aiSource.slice(aiSource.indexOf("const renderSecuritySection"), aiSource.indexOf("const saveSecurityConfig") === -1 ? aiSource.indexOf("const bindSecurityEvents") : aiSource.indexOf("const saveSecurityConfig"));
    assert(embedRender.includes("|| container"), "embedding renderer must fall back to the container itself");
    assert(securityRender.includes("|| container"), "security renderer must fall back to the container itself");
});
