import {escapeAttr, escapeHTML} from "../common/dom";
import {assistantText} from "../constants";
import type {IMentionSource} from "../mentions/types";
import {renderAssetTypeIcon} from "../mentions/asset";
import {estimateTokenCount} from "../mentions/contextBuilder";
import {
    ASSISTANT_AI_ASSET_IMAGE_TOKEN_ESTIMATE,
    getCachedAssistantAssetOcr,
    isAssistantAssetVisionToggleable,
    saveAssistantAssetTranscript,
} from "./assetVision";

export const renderSourcesPanel = (sources: IMentionSource[]): string => {
    if (!sources.length) {
        return "";
    }
    // 委托点击需要拿到当前面板的来源数组；每次渲染都刷新引用（ctx.render 会重建面板 HTML）。
    assistantSourcesPanelSources = sources;
    bindAssistantSourcesPanelDelegatedClick();

    const includedCount = sources.filter((s) => s.included).length;
    const tokenEstimate = estimateTokenCount(sources);

    return `<div class="assistant-ai__sources-panel" data-role="sources-panel">
    <div class="assistant-ai__sources-header">
        <span class="assistant-ai__sources-title">${assistantText("来源", "Sources")} (${includedCount}/${sources.length})</span>
        <span class="assistant-ai__sources-tokens">~${tokenEstimate} tokens</span>
        <button type="button" class="assistant-ai__sources-toggle" data-action="toggle-sources-panel" aria-label="${escapeAttr(assistantText("收起来源", "Collapse sources"))}">
            <svg><use xlink:href="#iconCloseRound"></use></svg>
        </button>
    </div>
    <div class="assistant-ai__sources-list">
        ${sources.map((source, index) => renderSourceItem(source, index)).join("")}
    </div>
</div>`;
};

const renderSourceItem = (source: IMentionSource, index: number): string => {
    // 附件来源是叶子（无 children/展开箭头）：文件图标 + 文件名，副行显示所属 hPath。
    const isAsset = source.type === "asset";
    const typeIcon = isAsset
        ? renderAssetTypeIcon(source.title || source.id)
        : source.type === "folder" ? "📁" : "📄";
    const assetPath = isAsset ? (source.hPath || source.path || "") : "";
    const checkbox = `<input type="checkbox" class="assistant-ai__source-checkbox" data-action="toggle-source" data-source-index="${index}" ${source.included ? "checked" : ""}>`;
    const visionControls = isAsset && isAssistantAssetVisionToggleable(source)
        ? renderAssetVisionControls(source, index)
        : "";

    let childrenHtml = "";
    if (!isAsset && source.children && source.children.length > 0) {
        const expanded = source.expanded ? " assistant-ai__source-children--expanded" : "";
        childrenHtml = `<div class="assistant-ai__source-children${expanded}">
            ${source.children.map((child, childIndex) => renderSourceChild(child, index, childIndex)).join("")}
        </div>`;
    }

    const expandButton = !isAsset && source.children && source.children.length > 0
        ? `<button type="button" class="assistant-ai__source-expand" data-action="toggle-source-expand" data-source-index="${index}">
            ${source.expanded ? assistantText("收起", "Collapse") : `${assistantText("展开", "Expand")} (${source.children.length})`}
        </button>`
        : "";

    return `<div class="assistant-ai__source-item${!source.included ? " assistant-ai__source-item--excluded" : ""}">
    <div class="assistant-ai__source-row" ${isAsset && assetPath ? `title="${escapeAttr(assetPath)}"` : ""}>
        ${checkbox}
        <span class="assistant-ai__source-icon">${typeIcon}</span>
        <span class="assistant-ai__source-title">${escapeHTML(source.title)}</span>
        ${assetPath ? `<span class="assistant-ai__mention-subtitle" data-role="source-asset-path">${escapeHTML(assetPath)}</span>` : ""}
        ${visionControls}
        ${expandButton}
    </div>
    ${childrenHtml}
</div>`;
};

// 「让 AI 看图」开关（仅图片附件展示，默认关）+ 开启后的行内预计消耗与「保存转录」入口。
// 默认关：看图消耗真实 token，每次会话默认关是安全默认（状态仅存内存，不持久化）。
const renderAssetVisionControls = (source: IMentionSource, index: number): string => {
    const enabled = source.visionEnabled === true;
    const cachedTranscript = `${getCachedAssistantAssetOcr(source.id)?.transcript || ""}`.trim();
    const toggleTitle = enabled
        ? assistantText("关闭后本次引用只看附件元数据", "Turn off to reference metadata only")
        : assistantText("开启后该图片会随请求发送给多模态模型", "The image will be sent to the vision model with the request");
    const toggle = `<button type="button" class="assistant-ai__asset-vision-toggle${enabled ? " assistant-ai__asset-vision-toggle--on" : ""}" data-action="toggle-asset-vision" data-source-index="${index}" aria-pressed="${enabled ? "true" : "false"}" title="${escapeAttr(toggleTitle)}">${escapeHTML(assistantText("让 AI 看图", "Let AI see"))}</button>`;
    if (!enabled) {
        return `<span class="assistant-ai__asset-vision">${toggle}</span>`;
    }
    // 消耗一眼可见：未命中缓存按每图 1024 tokens 预估；命中缓存则本次不发图、零图像消耗。
    const costHint = cachedTranscript
        ? `<span class="assistant-ai__asset-vision-cost">${escapeHTML(assistantText("已命中转录缓存，本次不重复发图", "cached transcript hit; image not resent"))}</span>`
        : `<span class="assistant-ai__asset-vision-cost">~${ASSISTANT_AI_ASSET_IMAGE_TOKEN_ESTIMATE} ${escapeHTML(assistantText("tokens/图", "tokens/image"))}</span>`;
    const saveButton = `<button type="button" class="assistant-ai__asset-vision-save" data-action="save-asset-transcript" data-source-index="${index}" title="${escapeAttr(assistantText("把当前 AI 回复保存为该附件的转录缓存", "Save the current AI reply as this asset's transcript cache"))}">${escapeHTML(assistantText("保存转录", "Save transcript"))}</button>`;
    return `<span class="assistant-ai__asset-vision">${toggle}${costHint}${saveButton}</span>`;
};

// 面板上的「看图/保存转录」不走 AIDockEvents 的 ctx 委托（本模块不持有 dock runtime），
// 改为 document 级委托 + 原地重渲染面板；ctx.render 时整块 HTML 会被重建，两套渲染天然一致。
let assistantSourcesPanelSources: IMentionSource[] = [];
let assistantSourcesPanelDelegatedBound = false;

const getAssistantSourcesPanelSource = (element: Element): IMentionSource | null => {
    const index = parseInt(element.getAttribute("data-source-index") || "-1", 10);
    if (Number.isNaN(index) || index < 0) {
        return null;
    }
    return assistantSourcesPanelSources[index] || null;
};

const rerenderAssistantSourcesPanel = () => {
    if (typeof document === "undefined" || !document || typeof document.querySelector !== "function") {
        return;
    }
    const panel = document.querySelector(".assistant-ai__sources-panel");
    if (panel) {
        panel.outerHTML = renderSourcesPanel(assistantSourcesPanelSources);
    }
};

export const handleAssistantSourcesPanelDelegatedClick = (event: Event): void => {
    const target = event?.target as HTMLElement | null;
    if (!target || typeof target.closest !== "function") {
        return;
    }
    const visionToggle = target.closest("[data-action='toggle-asset-vision']");
    if (visionToggle) {
        const source = getAssistantSourcesPanelSource(visionToggle);
        if (source && isAssistantAssetVisionToggleable(source)) {
            source.visionEnabled = !(source.visionEnabled === true);
            event.preventDefault();
            rerenderAssistantSourcesPanel();
        }
        return;
    }
    const saveButton = target.closest("[data-action='save-asset-transcript']");
    if (saveButton) {
        const source = getAssistantSourcesPanelSource(saveButton);
        if (source && isAssistantAssetVisionToggleable(source)) {
            event.preventDefault();
            saveAssistantAssetTranscript(source).then((saved) => {
                if (saved) {
                    rerenderAssistantSourcesPanel();
                }
            });
        }
    }
};

const bindAssistantSourcesPanelDelegatedClick = () => {
    if (assistantSourcesPanelDelegatedBound || typeof document === "undefined" || !document || typeof document.addEventListener !== "function") {
        return;
    }
    assistantSourcesPanelDelegatedBound = true;
    document.addEventListener("click", handleAssistantSourcesPanelDelegatedClick);
};

const renderSourceChild = (child: IMentionSource, parentIndex: number, childIndex: number): string => {
    const checkbox = `<input type="checkbox" class="assistant-ai__source-checkbox" data-action="toggle-source-child" data-source-index="${parentIndex}" data-child-index="${childIndex}" ${child.included ? "checked" : ""}>`;

    return `<div class="assistant-ai__source-child${!child.included ? " assistant-ai__source-child--excluded" : ""}">
    ${checkbox}
    <span class="assistant-ai__source-icon">📄</span>
    <span class="assistant-ai__source-title">${escapeHTML(child.title)}</span>
</div>`;
};
