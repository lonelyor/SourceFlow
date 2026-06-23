const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");

const read = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), "utf8");

const activityBar = read("src/layout/activityBar.ts");
const render = read("src/assistant/ai/AIDockRender.ts");
const messages = read("src/assistant/ai/AIDockRenderMessages.ts");
const composer = read("src/assistant/ai/AIDockRenderComposer.ts");
const panels = read("src/assistant/ai/AIDockRenderPanels.ts");
const sessions = read("src/assistant/ai/AIDockRenderSessions.ts");
const events = read("src/assistant/ai/AIDockEvents.ts");

assert.ok(activityBar.includes("`dock:${ASSISTANT_AI_DOCK_TYPE}`"), "AI dock must be pinned to the sidebar rail by default");
assert.ok(activityBar.includes("\"action:workbench\""), "Workbench must stay pinned to the sidebar rail by default");
assert.ok(
    activityBar.indexOf("${railAfterOutline}") > activityBar.indexOf("${railBeforeOutline}") &&
    activityBar.indexOf("${moreButtonMarkup}") > activityBar.indexOf("${railAfterOutline}"),
    "More button must render after all rail items in the activity bar",
);

assert.ok(messages.includes("请先配置 AI 提供商"), "No-profile message empty state must require AI provider setup");
assert.ok(messages.includes("data-action=\"configure-profile\""), "No-profile message empty state must open AI configuration");

assert.ok(render.includes("const hasProfile = !!ctx.profiles.length;"), "Composer must derive a single hasProfile gate");
assert.ok(render.includes("textarea") && render.includes("disabled"), "Composer textarea must be disabled before profile setup");
assert.ok(render.includes("data-action=\"configure-profile\""), "Composer must expose an AI setup action before profile setup");
assert.ok(render.includes("data-action=\"send-message\"") && render.includes("canSend"), "Send action must still be gated by canSend");

assert.ok(composer.includes("data-action=\"configure-profile\""), "Model launcher without profile must open AI configuration");
assert.ok(composer.includes("真实提供商"), "Model launcher must make real provider setup explicit");
assert.ok(panels.includes("请先配置真实提供商和模型"), "Profiles panel empty state must require real provider setup");
assert.ok(sessions.includes("请先配置真实提供商和模型"), "Sessions empty state must require real provider setup");

assert.ok(events.includes("case \"open-profiles\":") && events.includes("case \"configure-profile\":"), "AI config actions must share the same handler");
assert.ok(events.includes("openSettingTab(ctx.app, \"AI\")"), "AI config actions must open the AI settings tab");

const userFacingEntrySources = [
    render,
    messages,
    composer,
    panels,
    sessions,
].join("\n");
[
    "本地体验模型",
    "本地模型",
    "sourceflow-fake",
    "fake provider",
].forEach((forbiddenText) => {
    assert.ok(!userFacingEntrySources.includes(forbiddenText), `AI entry UI must not expose ${forbiddenText}`);
});

console.log("[ai-dock-entry-state] ok");
