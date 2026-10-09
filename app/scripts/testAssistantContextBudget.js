const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

// Regression for the 2026-08-17 audit fixes to the dynamic context budget
// (plans/20260812-AI上下文动态预算.md C2):
// 1. The frontend note allowance must be a CJK-aware token budget on the same
//    yardstick as the backend estimator — not runes×4, which overfed Chinese
//    content 4x and could blow small context windows.
// 2. The note-body truncation must be token-aware: CJK text is cut at ~budget
//    runes while Latin text may run ~4x budget runes.

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
const constants = compileModule(path.join(srcRoot, "assistant", "constants.ts"), {
    // constants.ts imports ../constants for SOURCEFLOW_APPID / websocket URLs.
    require: (id) => {
        if ("../constants" === id) {
            return {Constants: {SOURCEFLOW_APPID: "sourceflow"}};
        }
        throw new Error(`unexpected require: ${id}`);
    },
});

// --- Allowance is a token budget, not runes -------------------------------
// 8192-token window, default reserves: output 4096 (maxTokens=0), system
// overhead 1500, history min(16*512, 8192/2)=4096 -> 8192-4096-1500-4096 < 0
// so the 2000-token floor applies. A 32768 window with explicit maxTokens:
// 32768 - 4096 - 1500 - min(16*512,16384)=8192 -> 18980 tokens.
assert.strictEqual(
    presets.computeAssistantAINoteTokenAllowance(8192, {maxTokens: 0, maxContextMessages: 16}),
    2000,
    "small window clamps to the token floor",
);
assert.strictEqual(
    presets.computeAssistantAINoteTokenAllowance(32768, {maxTokens: 4096, maxContextMessages: 16}),
    18980,
    "token budget = window - reserves (no runes×4 blowup)",
);

// The old bug multiplied by 4: a 32k window allowed ~76k runes of Chinese
// (~76k backend-estimated tokens). The allowance must stay <= the window.
for (const windowTokens of [4096, 8192, 32768, 131072, 1048576]) {
    const allowance = presets.computeAssistantAINoteTokenAllowance(windowTokens, {maxTokens: 4096});
    assert.ok(allowance <= windowTokens, `allowance ${allowance} must fit window ${windowTokens}`);
}

// --- resolveAssistantAIContextWindow priority ------------------------------
assert.strictEqual(presets.resolveAssistantAIContextWindow({settings: {contextWindow: 65536, maxContextTokens: 1048576}}), 65536);
assert.strictEqual(presets.resolveAssistantAIContextWindow({settings: {maxContextTokens: 32768}}), 32768);
assert.strictEqual(presets.resolveAssistantAIContextWindow(null), 256 * 1024);

// --- Token-aware truncation of the note body --------------------------------
const cjkNote = "笔".repeat(50000);
const latinNote = "a".repeat(200000);

const buildContext = (markdown, allowance) => constants.buildAssistantNoteContext({
    title: "t",
    path: "/t.md",
    markdown,
}, allowance);

const cjkContext = buildContext(cjkNote, 5000);
const cjkBody = cjkContext.split("```markdown")[1] || "";
assert.ok(cjkBody.includes("[truncated]"), "CJK note is truncated");
// CJK: ~1 token per rune. 5000-token budget must keep the kept body under
// ~5010 runes — the old runes×4 bug would have kept ~20000 runes.
const cjkKept = cjkBody.replace("[truncated]", "").trim();
assert.ok(Array.from(cjkKept).length <= 5100, `CJK kept ${Array.from(cjkKept).length} runes for a 5000-token budget (was 4x before)`);

const latinContext = buildContext(latinNote, 5000);
const latinBody = (latinContext.split("```markdown")[1] || "").replace("[truncated]", "").trim();
// Latin: ~4 runes per token, so a 5000-token budget keeps ~20000 runes.
assert.ok(Array.from(latinBody).length > 15000, `Latin kept ${Array.from(latinBody).length} runes for a 5000-token budget (expected ~4x CJK)`);

// Estimator mirrors the backend: CJK ~1/rune, Latin ~4 runes/token.
assert.strictEqual(constants.estimateAssistantAITextTokens("笔".repeat(84)), 100);
assert.strictEqual(constants.estimateAssistantAITextTokens("a".repeat(336)), 100);

// No allowance: legacy 20000-rune fallback still applies.
const fallbackContext = buildContext(cjkNote, 0);
assert.ok((fallbackContext.split("```markdown")[1] || "").includes("[truncated]"), "legacy fallback truncates oversized notes");

// Skill builder threads the token allowance (note-polish uses full mode).
const polishContext = constants.buildAssistantNoteContextForSkill({
    title: "t",
    path: "/t.md",
    markdown: cjkNote,
}, "note-polish", 5000);
const polishBody = polishContext.split("```markdown")[1] || "";
assert.ok(polishBody.includes("[truncated]"), "skill full-mode context is token-budgeted");
assert.ok(Array.from(polishBody.replace("[truncated]", "").trim()).length <= 5100, "skill full-mode keeps the CJK body within budget");

// --- No stale runes×4 references remain ------------------------------------
const presetSource = fs.readFileSync(path.join(srcRoot, "assistant", "ai", "presets.ts"), "utf8");
assert.ok(!presetSource.includes("RuneAllowance"), "rune-allowance naming must be gone from presets.ts");
const grepTargets = [
    "assistant/inline/commands.ts",
    "assistant/ai/AIDockMessage.ts",
    "assistant/skills/execute.ts",
    "assistant/constants.ts",
].map((rel) => path.join(srcRoot, rel));
for (const target of grepTargets) {
    const source = fs.readFileSync(target, "utf8");
    assert.ok(!source.includes("NoteRuneAllowance"), `${path.basename(target)} must not reference the old rune allowance`);
}

console.log("[assistant-context-budget] ok");
