import {escapeAttr, escapeHTML} from "../common/dom";
import {assistantText} from "../constants";
import type {IMentionSource} from "../mentions/types";
import {estimateTokenCount} from "../mentions/contextBuilder";

export const renderSourcesPanel = (sources: IMentionSource[]): string => {
    if (!sources.length) {
        return "";
    }

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
    const typeIcon = source.type === "folder" ? "📁" : source.type === "asset" ? "📎" : "📄";
    const checkbox = `<input type="checkbox" class="assistant-ai__source-checkbox" data-action="toggle-source" data-source-index="${index}" ${source.included ? "checked" : ""}>`;

    let childrenHtml = "";
    if (source.children && source.children.length > 0) {
        const expanded = source.expanded ? " assistant-ai__source-children--expanded" : "";
        childrenHtml = `<div class="assistant-ai__source-children${expanded}">
            ${source.children.map((child, childIndex) => renderSourceChild(child, index, childIndex)).join("")}
        </div>`;
    }

    const expandButton = source.children && source.children.length > 0
        ? `<button type="button" class="assistant-ai__source-expand" data-action="toggle-source-expand" data-source-index="${index}">
            ${source.expanded ? assistantText("收起", "Collapse") : `${assistantText("展开", "Expand")} (${source.children.length})`}
        </button>`
        : "";

    return `<div class="assistant-ai__source-item${!source.included ? " assistant-ai__source-item--excluded" : ""}">
    <div class="assistant-ai__source-row">
        ${checkbox}
        <span class="assistant-ai__source-icon">${typeIcon}</span>
        <span class="assistant-ai__source-title">${escapeHTML(source.title)}</span>
        ${expandButton}
    </div>
    ${childrenHtml}
</div>`;
};

const renderSourceChild = (child: IMentionSource, parentIndex: number, childIndex: number): string => {
    const checkbox = `<input type="checkbox" class="assistant-ai__source-checkbox" data-action="toggle-source-child" data-source-index="${parentIndex}" data-child-index="${childIndex}" ${child.included ? "checked" : ""}>`;

    return `<div class="assistant-ai__source-child${!child.included ? " assistant-ai__source-child--excluded" : ""}">
    ${checkbox}
    <span class="assistant-ai__source-icon">📄</span>
    <span class="assistant-ai__source-title">${escapeHTML(child.title)}</span>
</div>`;
};
