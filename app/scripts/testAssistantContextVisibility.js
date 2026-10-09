const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", "src", ...parts), "utf8");

const test = (name, fn) => {
    try {
        fn();
        console.log(`[assistant-context-visibility] ok - ${name}`);
    } catch (error) {
        console.error(`[assistant-context-visibility] failed - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

const composerSource = read("assistant", "ai", "AIDockRenderComposer.ts");
const renderSource = read("assistant", "ai", "AIDockRender.ts");
const eventsSource = read("assistant", "ai", "AIDockEvents.ts");
const scssSource = read("assets", "scss", "business", "_assistant.scss");

test("I5 context switch notice renders above the composer and can be dismissed", () => {
    assert(composerSource.includes("renderAIDockContextNotice"), "composer module must render the notice");
    assert(composerSource.includes("dismissAIDockContextNotice"), "notice must be dismissible");
    assert(composerSource.includes("data-action=\"dismiss-context-notice\""), "notice must carry the dismiss action");
    assert(eventsSource.includes("case \"dismiss-context-notice\""), "events must handle the dismiss action");
    assert(renderSource.includes("${ctx.renderContextNotice()}"), "notice must be mounted above composer card content");
});

test("I5 notice survives re-renders and is acknowledged by sending", () => {
    assert(composerSource.includes("assistantAIContextNoticeDismissedRootId"), "dismissed notice must be remembered per note");
    assert(composerSource.includes("if (!ctx.includeCurrentNote || ctx.sending)"), "sending or detached context must clear the notice");
});

test("C4 usage meter measures with the shared token estimator and window resolver", () => {
    assert(composerSource.includes("estimateAssistantAITextTokens"), "usage must use the shared token estimator");
    assert(composerSource.includes("resolveAssistantAIContextWindow"), "usage must resolve the model window via presets");
    assert(!composerSource.includes("RuneAllowance"), "must not reintroduce rune-based budgets");
    assert(composerSource.includes("data-role=\"ai-context-usage\""), "usage element must be addressable for in-place updates");
    assert(composerSource.includes("updateAIDockContextUsageInPlace"), "typing must update the meter without a re-render");
    assert(eventsSource.includes("updateAIDockContextUsageInPlace(ctx)"), "composer input must refresh the meter");
});

test("usage meter and notice are wired into the dock render", () => {
    assert(renderSource.includes("renderAIDockContextUsage"), "runtime must expose the usage renderer");
    assert(renderSource.includes("${ctx.renderContextUsage()}${ctx.renderContextStatus()}"), "usage meter must sit beside the context pill (C4 x I5 merged row)");
});

test("notice and meter styles exist", () => {
    assert(scssSource.includes(".assistant-ai__context-notice"), "notice styles must exist");
    assert(scssSource.includes(".assistant-ai__context-usage"), "usage meter styles must exist");
    assert(scssSource.includes("&--warn"), "warn state styles must exist");
    void composerSource;
    void eventsSource;
});

test("I10 output actions state their destination", () => {
    const resultsSource = read("assistant", "results", "ResultsDock.ts");
    assert(renderSource.includes("assistant-ai__utility-label"), "output group must carry a unified label");
    assert(renderSource.includes("把本次对话记录保存为新笔记"), "transcript tooltip must state the destination");
    assert(renderSource.includes("把最后一条回复追加到当前笔记末尾"), "insert tooltip must state the destination");
    assert(resultsSource.includes("存入成果箱"), "results quick actions must state they save into results");
});
