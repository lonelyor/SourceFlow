import {assistantText, estimateAssistantAITextTokens} from "../constants";
import {isImageAssetName} from "../mentions/asset";
import {resolveAssistantAIContextWindow} from "./presets";
import {escapeAttr, escapeHTML, providerDisplayName, truncateText} from "../common/dom";
import {IAssistantAIInputAttachment, IAssistantAIProfile} from "./api";
import {getAssistantAIAttachmentDataURL} from "./AIDockShared";
import type {TAssistantAIDockRenderRuntime} from "./AIDockRender";

// I5: remember the last context signature so the pill can flash once when the
// followed/pinned note actually changes, instead of on every re-render.
let lastAssistantAIContextSignature = "";
let assistantAIContextChanged = false;

// I5: the context switch stays visible as a notice bar until the user sends a
// message (which acknowledges the new context) or dismisses it explicitly.
let assistantAIContextNotice: { rootId: string; title: string } | null = null;
let assistantAIContextNoticeDismissedRootId = "";

const ASSISTANT_AI_IMAGE_TOKEN_ESTIMATE = 1024;

// I5+C4: 检测与置位必须在每帧渲染最前面执行——renderContextNotice 在模板中先于
// status pill 渲染，若在 pill 处才置位，提示条会永远滞后一帧。
export const updateAIDockContextNoticeState = (ctx: TAssistantAIDockRenderRuntime) => {
    const signature = `${ctx.includeCurrentNote ? 1 : 0}:${ctx.getTargetSummary ? ctx.getTargetSummary() : ""}`;
    const changed = "" !== lastAssistantAIContextSignature && signature !== lastAssistantAIContextSignature;
    lastAssistantAIContextSignature = signature;
    assistantAIContextChanged = changed;
    const effectivePreview = ctx.includeCurrentNote ? ctx.getEffectiveContextPreview() : null;
    if (!ctx.includeCurrentNote || ctx.sending) {
        assistantAIContextNotice = null;
    } else if (changed) {
        // 签名变化当帧就要置位提示条；异步预览可能尚未返回，标题退回摘要文本。
        const summary = ctx.getTargetSummary ? String(ctx.getTargetSummary() || "") : "";
        const title = effectivePreview?.title || (summary.includes("·") ? summary.split("·").slice(1).join("·").trim() : summary) || assistantText("当前笔记", "Current note");
        assistantAIContextNotice = {rootId: effectivePreview?.rootID || signature, title};
    }
    if (assistantAIContextNotice && assistantAIContextNotice.rootId === assistantAIContextNoticeDismissedRootId) {
        assistantAIContextNotice = null;
    }
};

export const renderAIDockContextStatus = (ctx: TAssistantAIDockRenderRuntime) => {
    const enabledCount = ctx.toolPolicy
        ? ctx.toolCatalog.filter((item) => {
            const mode = ctx.toolPolicy?.toolModes?.[item.id] || item.defaultMode || ctx.getDefaultToolMode(item);
            return mode !== "deny";
        }).length
        : 0;
    const contextPart = ctx.includeCurrentNote ? ctx.getTargetSummary() : assistantText("未附加上下文", "No context");
    const toolPart = ctx.toolPolicy
        ? (ctx.enableTools ? `${assistantText("能力", "Tools")} ${enabledCount}/${ctx.toolCatalog.length}` : assistantText("能力关闭", "Tools off"))
        : assistantText("能力加载中", "Tools loading");
    const attachmentPart = ctx.attachments.length ? ` · ${ctx.getAttachmentSummary(ctx.attachments.length)}` : "";
    const fullText = `${contextPart} · ${toolPart}${attachmentPart}`;
    const classes = ["assistant-ai__status-pill"];
    if (assistantAIContextChanged) {
        classes.push("assistant-ai__status-pill--changed");
    }
    return `<span class="${classes.join(" ")}" title="${escapeAttr(fullText)}">${escapeHTML(truncateText(fullText, 80))}</span>`;
};

export const renderAIDockContextNotice = (ctx: TAssistantAIDockRenderRuntime) => {
    void ctx;
    if (!assistantAIContextNotice) {
        return "";
    }
    const dismissHint = assistantText("关闭提示", "Dismiss");
    return `<div class="assistant-ai__context-notice" data-role="assistant-context-notice" role="status">
    <span class="assistant-ai__context-notice-text">${escapeHTML(assistantText("上下文已切换为：", "Context switched to: "))}${escapeHTML(truncateText(assistantAIContextNotice.title, 48))}</span>
    <button type="button" class="assistant-ai__context-notice-close" data-action="dismiss-context-notice" aria-label="${escapeAttr(dismissHint)}" title="${escapeAttr(dismissHint)}">
        <svg><use xlink:href="#iconCloseRound"></use></svg>
    </button>
</div>`;
};

export const dismissAIDockContextNotice = () => {
    if (assistantAIContextNotice) {
        assistantAIContextNoticeDismissedRootId = assistantAIContextNotice.rootId;
    }
    assistantAIContextNotice = null;
};

export const computeAIDockContextUsage = (ctx: IAssistantAIContextUsageSource) => {
    const profile = ctx.getSelectedProfile();
    if (!profile) {
        return null;
    }
    const windowTokens = resolveAssistantAIContextWindow(profile);
    let used = estimateAssistantAITextTokens(ctx.draftMessage || "");
    used += ctx.attachments.length * ASSISTANT_AI_IMAGE_TOKEN_ESTIMATE;
    // R7 期二：开启「让 AI 看图」的图片资产按图像口径计入（与后端 assistantAIImageTokenEstimate 对齐）。
    for (const source of ctx.sources || []) {
        if (source.visionEnabled && source.included !== false && source.type === "asset" && isImageAssetName(source.id || "")) {
            used += ASSISTANT_AI_IMAGE_TOKEN_ESTIMATE;
        }
    }
    for (const item of ctx.messages) {
        used += estimateAssistantAITextTokens(item.content || "");
    }
    return {used, windowTokens};
};

const formatAssistantAITokenCount = (value: number) => {
    if (value < 1000) {
        return `${value}`;
    }
    if (value < 10000) {
        return `${(value / 1000).toFixed(1)}k`;
    }
    return `${Math.round(value / 1000)}k`;
};

export const renderAIDockContextUsage = (ctx: TAssistantAIDockRenderRuntime) => {
    const usage = computeAIDockContextUsage(ctx);
    if (!usage) {
        return "";
    }
    const ratio = usage.windowTokens > 0 ? Math.min(1, usage.used / usage.windowTokens) : 0;
    const percent = Math.round(ratio * 100);
    const warn = ratio >= 0.85;
    const hint = assistantText("当前对话上下文用量 / 模型窗口", "Current conversation context usage / model window");
    return `<span class="assistant-ai__context-usage${warn ? " assistant-ai__context-usage--warn" : ""}" data-role="ai-context-usage" title="${escapeAttr(hint)}" data-window="${usage.windowTokens}">
    <span class="assistant-ai__context-usage-bar"><span class="assistant-ai__context-usage-fill" style="width: ${percent}%"></span></span>
    <span class="assistant-ai__context-usage-text">${formatAssistantAITokenCount(usage.used)} / ${formatAssistantAITokenCount(usage.windowTokens)}</span>
</span>`;
};

// C4: the meter only needs this slice of the dock runtime, so the same helper
// serves both the render runtime and the action runtime (IAssistantAIDockRuntime).
export interface IAssistantAIContextUsageSource {
    element: HTMLElement;
    messages: {content: string}[];
    draftMessage: string;
    attachments: unknown[];
    sources?: Array<{type?: string; id?: string; included?: boolean; visionEnabled?: boolean}>;
    getSelectedProfile(): IAssistantAIProfile | undefined;
}

// C4: keep the meter in sync while the user types, without a full dock re-render.
export const updateAIDockContextUsageInPlace = (ctx: IAssistantAIContextUsageSource) => {
    const element = ctx.element?.querySelector("[data-role='ai-context-usage']") as HTMLElement | null;
    if (!element) {
        return;
    }
    const usage = computeAIDockContextUsage(ctx);
    if (!usage) {
        return;
    }
    const windowTokens = usage.windowTokens || Number(element.getAttribute("data-window")) || 0;
    const ratio = windowTokens > 0 ? Math.min(1, usage.used / windowTokens) : 0;
    const fill = element.querySelector(".assistant-ai__context-usage-fill") as HTMLElement | null;
    if (fill) {
        fill.style.width = `${Math.round(ratio * 100)}%`;
    }
    const text = element.querySelector(".assistant-ai__context-usage-text") as HTMLElement | null;
    if (text) {
        text.textContent = `${formatAssistantAITokenCount(usage.used)} / ${formatAssistantAITokenCount(windowTokens)}`;
    }
    element.classList.toggle("assistant-ai__context-usage--warn", ratio >= 0.85);
};

export const renderAIDockComposerAttachments = (ctx: TAssistantAIDockRenderRuntime) => {
    if (!ctx.attachments.length) {
        return "";
    }
    return `<div class="assistant-ai__composer-attachments">
    <div class="assistant-ai__attachment-summary">${escapeHTML(ctx.getAttachmentSummary(ctx.attachments.length))}</div>
    ${ctx.renderAttachmentList(ctx.attachments, true)}
</div>`;
};

export const renderAIDockAttachmentList = (ctx: TAssistantAIDockRenderRuntime, attachments: IAssistantAIInputAttachment[], composer = false) => {
    if (!attachments.length) {
        return "";
    }
    return `<div class="assistant-ai__attachment-list${composer ? " assistant-ai__attachment-list--composer" : ""}">${attachments.map((attachment) => `
    <div class="assistant-ai__attachment-card${composer ? " assistant-ai__attachment-card--composer" : ""}">
        <div class="assistant-ai__attachment-media">
            <img class="assistant-ai__attachment-image" alt="${escapeAttr(attachment.name || "image")}" src="${escapeAttr(getAssistantAIAttachmentDataURL(attachment))}">
            ${composer ? `<button type="button" class="assistant-ai__attachment-remove" data-action="remove-attachment" data-attachment-id="${escapeAttr(attachment.id)}" aria-label="${escapeAttr(assistantText("移除图片", "Remove image"))}" title="${escapeAttr(assistantText("移除图片", "Remove image"))}">
                <svg><use xlink:href="#iconCloseRound"></use></svg>
            </button>` : ""}
        </div>
        <div class="assistant-ai__attachment-caption">${escapeHTML(truncateText(attachment.name || assistantText("图片", "Image"), 22))}</div>
    </div>`).join("")}</div>`;
};

export const renderAIDockModelLauncher = (ctx: TAssistantAIDockRenderRuntime, profile?: IAssistantAIProfile) => {
    if (!profile) {
        const setupHint = assistantText("还没有模型，请先配置真实提供商", "No model yet. Configure a real provider first");
        return `<button type="button" class="assistant-ai__model-button" data-action="configure-profile" aria-label="${escapeAttr(setupHint)}" title="${escapeAttr(setupHint)}">
    <span class="assistant-ai__model-plus"><svg><use xlink:href="#iconAdd"></use></svg></span>
    <span class="assistant-ai__model-copy">
        <span class="assistant-ai__model-name">${assistantText("配置模型", "Set up a model")}</span>
    </span>
</button>`;
    }
    const primaryLabel = profile.name || profile.model || providerDisplayName(profile.provider);
    const secondaryLabel = profile.model && profile.name && profile.name !== profile.model
        ? `${profile.model} · ${providerDisplayName(profile.provider)}`
        : providerDisplayName(profile.provider);
    const modelHint = ctx.buildHoverHint(`${primaryLabel} · ${secondaryLabel}`, assistantText("点击切换模型", "Click to switch"));
    return `<button type="button" class="assistant-ai__model-button${ctx.activePanel === "profiles" ? " assistant-ai__model-button--active" : ""}" data-action="toggle-panel" data-panel="profiles" aria-label="${escapeAttr(modelHint)}" title="${escapeAttr(modelHint)}">
    <span class="assistant-ai__model-plus"><svg><use xlink:href="#iconAdd"></use></svg></span>
    <span class="assistant-ai__model-copy">
        <span class="assistant-ai__model-name">${escapeHTML(primaryLabel)}</span>
        <span class="assistant-ai__model-meta">${escapeHTML(secondaryLabel)}</span>
    </span>
</button>`;
};
