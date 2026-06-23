import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, formatDateTime, panelEmptyHTML} from "../common/dom";
import type {TAssistantAIDockRenderRuntime} from "./AIDockRender";

export const renderAIDockSessions = (ctx: TAssistantAIDockRenderRuntime) => {
    const closeLabel = ctx.getSessionsToggleHint();
    const newLabel = ctx.getNewSessionHint();
    const headActionsHTML = (showNew = false) => `<div class="assistant-ai__sessions-head-actions">
    ${showNew ? `<button type="button" class="assistant-ai__sessions-close assistant-ai__sessions-close--accent" data-action="new-session" aria-label="${escapeAttr(newLabel)}" title="${escapeAttr(newLabel)}">
        <svg><use xlink:href="#iconAdd"></use></svg>
    </button>` : ""}
    <button type="button" class="assistant-ai__sessions-close" data-action="dismiss-sessions" aria-label="${escapeAttr(closeLabel)}" title="${escapeAttr(closeLabel)}">
        <svg><use xlink:href="#iconCloseRound"></use></svg>
    </button>
</div>`;
    if (ctx.loading) {
        return `<div class="assistant-ai__loading">${assistantText("加载中...", "Loading...")}</div>`;
    }
    if (!ctx.profiles.length) {
        return `<div class="assistant-ai__sessions-head">
    <div class="assistant-ai__sessions-title">${assistantText("会话", "Sessions")}</div>
    ${headActionsHTML()}
</div>${panelEmptyHTML(assistantText("还没有 AI 配置", "No AI profile yet"), assistantText("请先配置真实提供商和模型，再开始多轮对话。", "Configure a real provider and model before chatting."), assistantText("打开 AI 配置", "Open AI settings"), "configure-profile")}`;
    }
    if (!ctx.sessions.length) {
        return `<div class="assistant-ai__sessions-head">
    <div class="assistant-ai__sessions-title">${assistantText("会话", "Sessions")}</div>
    ${headActionsHTML(true)}
</div>${panelEmptyHTML(assistantText("还没有会话", "No sessions yet"), assistantText("点击右上角新建，或直接发送消息开始。", "Use the upper-right create button or send a message to start."))}`;
    }
    return `<div class="assistant-ai__sessions-head">
    <div>
        <div class="assistant-ai__sessions-title">${assistantText("会话", "Sessions")}</div>
        <div class="assistant-ai__sessions-meta">${assistantText("最近", "Recent")} ${ctx.sessions.length}</div>
    </div>
    ${headActionsHTML(true)}
</div>
<div class="assistant-ai__session-list">${ctx.sessions.map((item) => {
        const sessionHint = ctx.getSessionItemHint(item);
        const pinned = (item.pinnedAt || 0) > 0;
        const pinLabel = pinned ? assistantText("取消置顶", "Unpin") : assistantText("置顶", "Pin");
        const deleteLabel = assistantText("删除会话", "Delete session");
        return `
<div class="assistant-ai__session${item.id === ctx.selectedSessionId ? " assistant-ai__session--active" : ""}${pinned ? " assistant-ai__session--pinned" : ""}">
    <button type="button" class="assistant-ai__session-main" data-session-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(sessionHint)}" title="${escapeAttr(sessionHint)}">
        <span class="assistant-ai__session-title">${pinned ? `<span class="assistant-ai__session-pin-mark" aria-hidden="true"><svg><use xlink:href="#iconPin"></use></svg></span>` : ""}${escapeHTML(item.title || assistantText("未命名会话", "Untitled Session"))}</span>
        <span class="assistant-ai__session-meta">${assistantText("消息", "Messages")} ${item.messageCount}</span>
        <span class="assistant-ai__session-time">${formatDateTime(item.updatedAt || item.createdAt)}</span>
    </button>
    <div class="assistant-ai__session-inline-actions">
        <button type="button" class="assistant-ai__session-mini" data-action="toggle-session-pin" data-session-target-id="${escapeAttr(item.id)}" data-pinned="${pinned ? "true" : "false"}" aria-label="${escapeAttr(pinLabel)}" title="${escapeAttr(pinLabel)}">
            <svg><use xlink:href="#${pinned ? "iconUnpin" : "iconPin"}"></use></svg>
        </button>
        <button type="button" class="assistant-ai__session-mini assistant-ai__session-mini--danger" data-action="delete-session-by-id" data-session-target-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(deleteLabel)}" title="${escapeAttr(deleteLabel)}">
            <svg><use xlink:href="#iconTrashcan"></use></svg>
        </button>
    </div>
</div>`;
    }).join("")}</div>`;
};
