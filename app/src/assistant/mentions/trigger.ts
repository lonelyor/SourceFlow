import {searchMentionItems} from "./api";
import {escapeAttr, escapeHTML} from "../common/dom";
import {renderAssetTypeIcon} from "./asset";
import type {IMentionSearchResult} from "./types";
import type {TSecurityMode} from "../security/types";

export interface IMentionTriggerState {
    active: boolean;
    query: string;
    selectedIndex: number;
    results: IMentionSearchResult[];
    seq: number;
    anchorRect: DOMRect | null;
}

export const createMentionTriggerState = (): IMentionTriggerState => ({
    active: false,
    query: "",
    selectedIndex: 0,
    results: [],
    seq: 0,
    anchorRect: null,
});

export const detectMentionTrigger = (textarea: HTMLTextAreaElement, value: string, cursorPos: number): {
    triggered: boolean;
    query: string;
    atStart: number;
} | null => {
    const textBefore = value.substring(0, cursorPos);
    const atIndex = textBefore.lastIndexOf("@");
    if (atIndex < 0) {
        return null;
    }
    const textAfterAt = textBefore.substring(atIndex + 1);
    if (textAfterAt.includes(" ") && textAfterAt.length > 0) {
        const spaceIndex = textAfterAt.indexOf(" ");
        if (spaceIndex < textAfterAt.length - 1) {
            return null;
        }
    }
    if (atIndex > 0) {
        const charBefore = value[atIndex - 1];
        if (charBefore !== " " && charBefore !== "\n" && charBefore !== "\t") {
            return null;
        }
    }
    const query = textAfterAt.trim();
    return {
        triggered: true,
        query,
        atStart: atIndex,
    };
};

export const searchAndShowMentions = async (
    query: string,
    seq: number,
    state: IMentionTriggerState,
    securityMode: TSecurityMode,
    onUpdate: () => void,
) => {
    const normalizedQuery = `${query || ""}`.trim();
    if (!normalizedQuery) {
        if (seq !== state.seq) {
            return;
        }
        state.results = [];
        state.selectedIndex = 0;
        onUpdate();
        return;
    }
    let results: IMentionSearchResult[] = [];
    try {
        results = await searchMentionItems(normalizedQuery, 8, securityMode);
    } catch (_) {
        results = [];
    }
    if (seq !== state.seq) {
        return;
    }
    state.results = results;
    state.selectedIndex = 0;
    onUpdate();
};

export const renderMentionPopover = (state: IMentionTriggerState): string => {
    if (!state.active || !state.results.length) {
        return "";
    }

    // 附件候选使用文件类型图标（图片/文档区分），其余沿用 emoji；
    // 附件副行显示所属 hPath（设计 §2.1：后端返回 title=文件名、hPath=所属路径）。
    const typeIcon = (item: IMentionSearchResult): string => {
        if (item.type === "asset") {
            return renderAssetTypeIcon(item.title || item.id);
        }
        switch (item.type) {
            case "folder": return "📁";
            default: return "📄";
        }
    };

    const resultSubtitle = (item: IMentionSearchResult): string => {
        if (item.type === "asset") {
            return item.hPath || item.subtitle || "";
        }
        return item.subtitle || "";
    };

    return `<div class="assistant-ai__mention-popover" data-role="mention-popover">
    ${state.results.map((item, i) => `<div class="assistant-ai__mention-item${i === state.selectedIndex ? " assistant-ai__mention-item--selected" : ""}" data-action="select-mention" data-mention-index="${i}" title="${escapeAttr(item.hPath || item.title)}">
        <span class="assistant-ai__mention-icon">${typeIcon(item)}</span>
        <span class="assistant-ai__mention-text">
            <span class="assistant-ai__mention-title">${escapeHTML(item.title)}</span>
            ${resultSubtitle(item) ? `<span class="assistant-ai__mention-subtitle">${escapeHTML(resultSubtitle(item))}</span>` : ""}
        </span>
    </div>`).join("")}
</div>`;
};

export const insertMentionChip = (textarea: HTMLTextAreaElement, result: IMentionSearchResult): {
    newValue: string;
    newCursorPos: number;
} => {
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBefore = value.substring(0, cursorPos);
    const atIndex = textBefore.lastIndexOf("@");
    if (atIndex < 0) {
        return {newValue: value, newCursorPos: cursorPos};
    }

    const chip = `@${result.title}`;
    const newValue = value.substring(0, atIndex) + chip + " " + value.substring(cursorPos);
    const newCursorPos = atIndex + chip.length + 1;

    return {newValue, newCursorPos};
};
