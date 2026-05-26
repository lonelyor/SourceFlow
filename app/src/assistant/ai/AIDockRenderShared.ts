import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, providerDisplayName} from "../common/dom";
import {IAssistantAISession} from "./api";
import {getToolTargetLabel} from "./AIDockShared";
import type {TAssistantAIDockRenderRuntime} from "./AIDockRender";

export const getAIDockTargetSummary = (ctx: TAssistantAIDockRenderRuntime) => {
    const effectiveContext = ctx.getEffectiveContextPreview();
    if (!ctx.includeCurrentNote) {
        return assistantText("未附加笔记", "No note attached");
    }
    if (!effectiveContext) {
        return assistantText("没有活动笔记", "No active note");
    }
    return ctx.isTargetPinned()
        ? `${assistantText("已固定", "Pinned")} · ${effectiveContext.title || assistantText("当前笔记", "Current note")}`
        : `${assistantText("跟随当前", "Following")} · ${effectiveContext.title || assistantText("当前笔记", "Current note")}`;
};

export const getAIDockContextSummary = (ctx: TAssistantAIDockRenderRuntime) => {
    const effectiveContext = ctx.getEffectiveContextPreview();
    if (!ctx.includeCurrentNote || !effectiveContext) {
        return assistantText("未附加上下文", "No context attached");
    }
    const parts = [effectiveContext.title || assistantText("当前笔记", "Current note")];
    if (effectiveContext.currentBlockID) {
        parts.push(assistantText("含当前块", "Current block"));
    }
    if (effectiveContext.selectedText) {
        parts.push(assistantText("含选中内容", "Selection"));
    }
    return parts.join(" · ");
};

export const isAIDockTargetPinned = (ctx: TAssistantAIDockRenderRuntime) => {
    return !!ctx.pinnedNotePreview;
};

export const getAIDockTargetLockGlyph = (ctx: TAssistantAIDockRenderRuntime) => {
    return ctx.isTargetPinned() ? "🔒" : "🔓";
};

export const getAIDockTargetLockLabel = (ctx: TAssistantAIDockRenderRuntime) => {
    if (!ctx.includeCurrentNote) {
        return assistantText("未固定，当前未附加笔记", "Unlocked, no note attached");
    }
    return ctx.isTargetPinned()
        ? assistantText("已固定目标笔记", "Pinned target note")
        : assistantText("未固定，正在跟随当前活动笔记", "Unlocked, following the active note");
};

export const buildAIDockHoverHint = (_ctx: TAssistantAIDockRenderRuntime, summary: string, action: string) => {
    return `${summary} · ${action}`;
};

export const getAIDockSessionsToggleHint = (ctx: TAssistantAIDockRenderRuntime) => {
    return ctx.buildHoverHint(
        ctx.sessionsCollapsed ? assistantText("历史已收起", "History hidden") : assistantText("历史已展开", "History shown"),
        ctx.sessionsCollapsed ? assistantText("点击展开", "Click to show") : assistantText("点击收起", "Click to hide"),
    );
};

export const getAIDockNewSessionHint = (_ctx: TAssistantAIDockRenderRuntime) => {
    return assistantText("新建会话", "Start a new chat");
};

export const getAIDockSessionPanelHint = (ctx: TAssistantAIDockRenderRuntime) => {
    return ctx.buildHoverHint(
        ctx.activePanel === "session" ? assistantText("更多操作已展开", "More actions shown") : assistantText("更多操作已收起", "More actions hidden"),
        ctx.activePanel === "session" ? assistantText("点击收起", "Click to hide") : assistantText("点击展开", "Click to show"),
    );
};

export const getAIDockProfilesConfigHint = (_ctx: TAssistantAIDockRenderRuntime) => {
    return assistantText("模型与提供商配置", "Model and provider settings");
};

export const getAIDockSessionItemHint = (ctx: TAssistantAIDockRenderRuntime, item: IAssistantAISession) => {
    const title = item.title || assistantText("未命名会话", "Untitled session");
    if (item.id === ctx.selectedSessionId) {
        return ctx.buildHoverHint(
            `${assistantText("当前会话", "Current chat")} · ${title}`,
            assistantText("点击收起历史", "Click to hide history"),
        );
    }
    return ctx.buildHoverHint(title, assistantText("点击切换", "Click to switch"));
};

export const renderAIDockQuickActions = (ctx: TAssistantAIDockRenderRuntime) => {
    const targetSummary = ctx.getTargetSummary();
    const contextSummary = ctx.getContextSummary();
    const lockGlyph = ctx.getTargetLockGlyph();
    const executedCount = ctx.audits.filter((audit) => audit.executed).length;
    const blockedCount = ctx.audits.filter((audit) => !audit.executed).length;
    const enabledCount = ctx.toolPolicy
        ? ctx.toolCatalog.filter((item) => {
            const mode = ctx.toolPolicy?.toolModes?.[item.id] || item.defaultMode || ctx.getDefaultToolMode(item);
            return mode !== "deny";
        }).length
        : 0;
    const auditSummary = `${assistantText("已执行", "Executed")} ${executedCount} · ${assistantText("已拦截", "Blocked")} ${blockedCount}`;
    const toolSummary = ctx.toolPolicy
        ? (ctx.enableTools ? `${assistantText("已开", "On")} ${enabledCount}/${ctx.toolCatalog.length}` : assistantText("已关闭", "Disabled"))
        : assistantText("加载中", "Loading");
    const targetHint = ctx.buildHoverHint(targetSummary, assistantText("点击管理目标", "Click to manage"));
    const contextHint = ctx.buildHoverHint(contextSummary, assistantText("点击查看", "Click to inspect"));
    const auditHint = ctx.buildHoverHint(auditSummary, assistantText("点击查看", "Click to inspect"));
    const agentHint = ctx.buildHoverHint(assistantText("队列与历史", "Queue & history"), assistantText("点击查看", "Click to inspect"));
    const toolsHint = ctx.buildHoverHint(toolSummary, assistantText("点击管理", "Click to manage"));
    return `<div class="assistant-ai__toolbar-group assistant-ai__toolbar-group--chips">
    <button type="button" class="assistant-ai__quick-button${ctx.activePanel === "target" ? " assistant-ai__quick-button--active" : ""}" data-action="toggle-panel" data-panel="target" aria-label="${escapeAttr(targetHint)}" title="${escapeAttr(targetHint)}">
        <svg><use xlink:href="#iconFiles"></use></svg>
        <span class="assistant-ai__quick-copy">
            <span class="assistant-ai__quick-lock" aria-hidden="true">${escapeHTML(lockGlyph)}</span>
            <span class="assistant-ai__quick-label">${assistantText("目标", "Target")}</span>
        </span>
    </button>
    <button type="button" class="assistant-ai__quick-button${ctx.activePanel === "context" ? " assistant-ai__quick-button--active" : ""}" data-action="toggle-panel" data-panel="context" aria-label="${escapeAttr(contextHint)}" title="${escapeAttr(contextHint)}">
        <svg><use xlink:href="#iconAlignCenter"></use></svg>
        <span class="assistant-ai__quick-copy">
            <span class="assistant-ai__quick-label">${assistantText("上下文", "Context")}</span>
        </span>
    </button>
    <button type="button" class="assistant-ai__quick-button${ctx.activePanel === "audit" ? " assistant-ai__quick-button--active" : ""}" data-action="toggle-panel" data-panel="audit" aria-label="${escapeAttr(auditHint)}" title="${escapeAttr(auditHint)}">
        <svg><use xlink:href="#iconInfo"></use></svg>
        <span class="assistant-ai__quick-copy">
            <span class="assistant-ai__quick-label">${assistantText("审计", "Audits")}</span>
        </span>
    </button>
    <button type="button" class="assistant-ai__quick-button${ctx.activePanel === "agent" ? " assistant-ai__quick-button--active" : ""}" data-action="toggle-panel" data-panel="agent" aria-label="${escapeAttr(agentHint)}" title="${escapeAttr(agentHint)}">
        <svg><use xlink:href="#iconHistory"></use></svg>
        <span class="assistant-ai__quick-copy">
            <span class="assistant-ai__quick-label">${assistantText("Agent", "Agent")}</span>
        </span>
    </button>
    <button type="button" class="assistant-ai__quick-button${ctx.activePanel === "tools" ? " assistant-ai__quick-button--active" : ""}" data-action="toggle-panel" data-panel="tools"${!ctx.getSelectedProfile() ? " disabled" : ""} aria-label="${escapeAttr(toolsHint)}" title="${escapeAttr(toolsHint)}">
        <svg><use xlink:href="#iconSettings"></use></svg>
        <span class="assistant-ai__quick-copy">
            <span class="assistant-ai__quick-label">${assistantText("能力", "Tools")}</span>
        </span>
    </button>
</div>`;
};

export const renderAIDockSessionActions = (ctx: TAssistantAIDockRenderRuntime, session?: IAssistantAISession) => {
    const historyHint = ctx.getSessionsToggleHint();
    const newHint = ctx.getNewSessionHint();
    const sessionPanelHint = ctx.getSessionPanelHint();
    return `<div class="assistant-ai__session-tools">
<button type="button" class="assistant-ai__session-action assistant-ai__session-action--icon assistant-ai__session-action--ghost" data-action="toggle-sessions" aria-label="${escapeAttr(historyHint)}" title="${escapeAttr(historyHint)}">
    <svg><use xlink:href="#iconHistory"></use></svg>
</button>
<button type="button" class="assistant-ai__session-action assistant-ai__session-action--icon assistant-ai__session-action--primary" data-action="new-session" aria-label="${escapeAttr(newHint)}" title="${escapeAttr(newHint)}">
    <svg><use xlink:href="#iconAdd"></use></svg>
</button>
<button type="button" class="assistant-ai__session-action assistant-ai__session-action--icon${ctx.activePanel === "session" ? " assistant-ai__session-action--active" : ""}" data-action="toggle-panel" data-panel="session"${session ? "" : " disabled"} aria-label="${escapeAttr(sessionPanelHint)}" title="${escapeAttr(sessionPanelHint)}">
    <svg><use xlink:href="#iconMore"></use></svg>
</button>
</div>`;
};

export const renderAIDockToolSummary = (ctx: TAssistantAIDockRenderRuntime) => {
    const profile = ctx.getSelectedProfile();
    if (!profile) {
        return escapeHTML(assistantText("未配置提供商", "No provider configured"));
    }
    const providerSummary = providerDisplayName(profile.provider);
    if (!ctx.toolPolicy) {
        return escapeHTML(`${providerSummary} · ${assistantText("能力策略加载中...", "Loading tool policy...")}`);
    }
    const enabledCount = ctx.toolCatalog.filter((item) => {
        const mode = ctx.toolPolicy?.toolModes?.[item.id] || item.defaultMode || ctx.getDefaultToolMode(item);
        return mode !== "deny";
    }).length;
    const toolSummary = `${ctx.enableTools ? assistantText("能力", "Tools") : assistantText("能力关闭", "Tools off")} ${enabledCount}/${ctx.toolCatalog.length}`;
    const scopeSummary = `${getToolTargetLabel(ctx.toolPolicy.readScope)} / ${getToolTargetLabel(ctx.toolPolicy.writeScope)}`;
    return escapeHTML(`${providerSummary} · ${toolSummary} · ${scopeSummary}`);
};
