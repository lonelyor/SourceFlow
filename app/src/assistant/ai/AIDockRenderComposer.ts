import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, providerDisplayName, truncateText} from "../common/dom";
import {IAssistantAIInputAttachment, IAssistantAIProfile} from "./api";
import {getAssistantAIAttachmentDataURL} from "./AIDockShared";
import type {TAssistantAIDockRenderRuntime} from "./AIDockRender";

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
    return `<span class="assistant-ai__status-pill">${escapeHTML(truncateText(`${contextPart} · ${toolPart}${attachmentPart}`, 54))}</span>`;
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
