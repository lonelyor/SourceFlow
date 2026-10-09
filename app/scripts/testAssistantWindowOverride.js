const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

// T1.6 (frontend half): user-facing context window override.
// Backend semantics live in kernel/model/assistant_ai_provider_compat.go and
// must not drift: a stored settings.contextWindowOverride only applies when it
// is a positive integer strictly smaller than the resolved model window
// (contextWindow > 0 -> maxContextTokens -> 256k default). The UI is opt-in:
// empty input means "follow the model", invalid input is silently cleared on
// blur with a one-line notice.

const compileModule = (entryPath, globals = {}) => {
    const source = fs.readFileSync(entryPath, "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: entryPath,
    });
    const moduleObj = {exports: {}};
    vm.runInNewContext(compiled.outputText, {
        module: moduleObj,
        exports: moduleObj.exports,
        require,
        console,
        navigator: {language: "zh_CN"},
        window: {sourceflow: {config: {lang: "zh_CN"}}},
        ...globals,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");
const presets = compileModule(path.join(srcRoot, "assistant", "ai", "presets.ts"));

// --- Override priority ------------------------------------------------------
// Override strictly below the model window takes effect.
assert.strictEqual(
    presets.resolveAssistantAIContextWindow({settings: {contextWindow: 131072, contextWindowOverride: 32768}}),
    32768,
    "override below the model window applies",
);
// Equal is NOT below: strict-less gate keeps the model window.
assert.strictEqual(
    presets.resolveAssistantAIContextWindow({settings: {contextWindow: 32768, contextWindowOverride: 32768}}),
    32768,
    "override equal to the model window is ignored",
);
assert.strictEqual(
    presets.resolveAssistantAIContextWindow({settings: {contextWindow: 32768, contextWindowOverride: 65536}}),
    32768,
    "override above the model window is ignored",
);
// Without a model window the override gates against the maxContextTokens chain.
assert.strictEqual(
    presets.resolveAssistantAIContextWindow({settings: {maxContextTokens: 65536, contextWindowOverride: 32768}}),
    32768,
    "override applies against the maxContextTokens fallback",
);
assert.strictEqual(
    presets.resolveAssistantAIContextWindow({settings: {maxContextTokens: 65536, contextWindowOverride: 131072}}),
    65536,
    "override above maxContextTokens is ignored",
);
// Without any window info the override gates against the 256k default.
assert.strictEqual(
    presets.resolveAssistantAIContextWindow({settings: {contextWindowOverride: 1024}}),
    1024,
    "override applies against the 256k default fallback",
);
assert.strictEqual(
    presets.resolveAssistantAIContextWindow({settings: {contextWindowOverride: 512 * 1024}}),
    256 * 1024,
    "override above the 256k default is ignored",
);
// Existing (override-free) priorities must be untouched.
assert.strictEqual(presets.resolveAssistantAIContextWindow({settings: {contextWindow: 65536, maxContextTokens: 1048576}}), 65536);
assert.strictEqual(presets.resolveAssistantAIContextWindow({settings: {maxContextTokens: 32768}}), 32768);
assert.strictEqual(presets.resolveAssistantAIContextWindow(null), 256 * 1024);

// --- Invalid overrides never resolve ---------------------------------------
for (const invalid of [0, -5, -4096, 3.5, "", "   ", "abc", "12.5", "-1", "1e5", null, undefined, [], {}]) {
    assert.strictEqual(
        presets.parseAssistantAIContextWindowOverride(invalid),
        0,
        `override ${JSON.stringify(invalid)} must parse as "no override"`,
    );
    assert.strictEqual(
        presets.resolveAssistantAIContextWindow({settings: {contextWindow: 32768, contextWindowOverride: invalid}}),
        32768,
        `override ${JSON.stringify(invalid)} must keep the model window`,
    );
}
// Positive integers survive, including as clean numeric strings.
assert.strictEqual(presets.parseAssistantAIContextWindowOverride(4096), 4096);
assert.strictEqual(presets.parseAssistantAIContextWindowOverride("4096"), 4096);
assert.strictEqual(presets.parseAssistantAIContextWindowOverride(" 4096 "), 4096);

// --- Resolution detail (source reporting for the panel) --------------------
const detail = presets.resolveAssistantAIContextWindowDetail({settings: {contextWindow: 131072, contextWindowOverride: 32768}});
assert.strictEqual(detail.window, 32768);
assert.strictEqual(detail.baseWindow, 131072);
assert.strictEqual(detail.override, 32768);
assert.strictEqual(detail.overrideApplied, true);
assert.strictEqual(detail.source, "override");
assert.strictEqual(presets.resolveAssistantAIContextWindowDetail({settings: {contextWindow: 32768, contextWindowOverride: 65536}}).source, "model");
assert.strictEqual(presets.resolveAssistantAIContextWindowDetail({settings: {maxContextTokens: 32768}}).source, "budget");
assert.strictEqual(presets.resolveAssistantAIContextWindowDetail({settings: {}}).source, "fallback");

// --- Allowance threads the effective window --------------------------------
// contextWindow 32768 but override 16384 -> allowance = 16384 - 4096 (output)
// - 1500 (system) - min(16*512, 16384/2)=8192 = 2596.
assert.strictEqual(
    presets.getAssistantAINoteTokenAllowance({settings: {contextWindow: 32768, maxTokens: 4096, maxContextMessages: 16, contextWindowOverride: 16384}}),
    2596,
    "note allowance must be sized to the override, not the nominal window",
);

// --- ProfilesPanel source contract ------------------------------------------
const panelSource = fs.readFileSync(path.join(srcRoot, "assistant", "ai", "ProfilesPanel.ts"), "utf8");
assert.ok(panelSource.includes(`data-setting="contextWindowOverride"`), "the advanced section must render the override input");
assert.ok(panelSource.includes("留空跟随模型"), "the override input must tell users that empty means follow-the-model");
assert.ok(panelSource.includes("focusout") && panelSource.includes("sanitizeContextWindowOverrideInput"), "invalid override input must be sanitized on blur");
assert.ok(panelSource.includes("delete this.state.draft.settings.contextWindowOverride"), "sanitizing must drop the key to restore follow-the-model");
assert.ok(panelSource.includes("输入无效，已清空并恢复跟随模型"), "clearing invalid input must explain itself in a small line, no dialog");
assert.ok(panelSource.includes("resolveAssistantAIContextWindowDetail"), "the panel must show the effective window via the shared resolver");
assert.ok(panelSource.includes("来源"), "the panel must report where the effective window comes from");
assert.ok(panelSource.includes("手动覆写"), "manual override must be reported as a window source");
// Dirty tracking: serializeDraft must carry the override explicitly.
const serializeStart = panelSource.indexOf("private serializeDraft");
assert.ok(serializeStart > -1, "serializeDraft must exist");
const serializeBody = panelSource.slice(serializeStart, panelSource.indexOf("private isDraftDirty", serializeStart));
assert.ok(serializeBody.includes("contextWindowOverride"), "serializeDraft must include contextWindowOverride so dirty tracking cannot miss it");
// Save path: cloneSettings must persist a clean positive integer and drop
// invalid/empty values instead of storing 0 or "".
const cloneStart = panelSource.indexOf("const cloneSettings");
const cloneEnd = panelSource.indexOf("const createDraft", cloneStart);
assert.ok(cloneStart > -1 && cloneEnd > cloneStart, "cloneSettings must exist before createDraft");
const cloneBody = panelSource.slice(cloneStart, cloneEnd);
assert.ok(cloneBody.includes("parseAssistantAIContextWindowOverride"), "cloneSettings must normalize the override");
assert.ok(cloneBody.includes("contextWindowOverride > 0 ? {contextWindowOverride} : {}"), "cloneSettings must persist the override only when valid (never 0 or \"\")");
// The save endpoint payload goes through cloneSettings.
assert.ok(panelSource.includes("settings: cloneSettings(this.state.draft.settings"), "saveProfile must serialize settings through cloneSettings");
// apiKeyAction save chain untouched.
assert.ok(panelSource.includes("apiKeyAction: secret.apiKeyAction"), "existing apiKeyAction save chain must stay wired");

// --- Backend alignment guard -------------------------------------------------
const backendSource = fs.readFileSync(path.join(appRoot, "..", "kernel", "model", "assistant_ai_provider_compat.go"), "utf8");
assert.ok(backendSource.includes(`"contextWindowOverride"`), "backend settings key must stay contextWindowOverride");
assert.ok(backendSource.includes("0 < override && override < window"), "backend override gate must stay strictly-less-than");

// --- No regression in the CJK context budget -------------------------------
const budgetTest = path.join(__dirname, "testAssistantContextBudget.js");
const {spawnSync} = require("child_process");
const result = spawnSync(process.execPath, [budgetTest], {cwd: appRoot, stdio: "inherit"});
if (result.status !== 0) {
    throw new Error("testAssistantContextBudget.js regressed");
}

console.log("[assistant-window-override] ok");
