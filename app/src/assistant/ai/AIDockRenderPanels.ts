import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, formatDateTime, panelEmptyHTML, providerDisplayName, truncateText} from "../common/dom";
import {
    assistantAIToolReadScopeOptions,
    assistantAIToolRiskOrder,
    assistantAIToolTraceOptions,
    assistantAIToolWriteScopeOptions,
    getToolRiskLabel,
    getToolTargetLabel,
    renderSelectOptions,
    TAssistantAIFloatingPanel,
} from "./AIDockShared";
import type {TAssistantAIDockRenderRuntime} from "./AIDockRender";
import {getAssistantAgentTaskProgress, readAssistantAgentTasks} from "../agent/queue";
import {canRollbackAssistantPatchOperation} from "../history/operations";
import {readAssistantOperationHistory} from "../history/store";
import {renderAssistantPatchHTML} from "../patch/format";

export const renderAIDockFloatingPanel = (ctx: TAssistantAIDockRenderRuntime) => {
    if (!ctx.activePanel) {
        return "";
    }
    const isBottomPanel = ctx.activePanel === "profiles" || ctx.activePanel === "tools";
    const titleMap: Record<TAssistantAIFloatingPanel, string> = {
        "": "",
        target: assistantText("目标笔记", "Target Note"),
        context: assistantText("上下文预览", "Context Preview"),
        audit: assistantText("最近工具审计", "Recent Tool Audits"),
        profiles: assistantText("模型选择", "Model Switcher"),
        tools: assistantText("能力与权限", "Tools & Permissions"),
        session: assistantText("会话操作", "Session Actions"),
        agent: assistantText("Agent 与历史", "Agent & History"),
    };
    const subtitleMap: Record<TAssistantAIFloatingPanel, string> = {
        "": "",
        target: assistantText("把目标笔记收纳到浮层里，不再占住主聊天区。", "Keep target note management in a floating panel instead of the main chat area."),
        context: assistantText("只在需要时查看上下文细节。", "Inspect context details only when you need them."),
        audit: assistantText("最近工具执行和拦截记录。", "Recent tool execution and blocking events."),
        profiles: assistantText("切换模型会从空白对话开始，左侧历史会话会保留。", "Switching models starts a fresh chat while keeping the history on the left."),
        tools: assistantText("默认把复杂能力收起来，需要时再展开调整。", "Keep advanced tool controls collapsed until you need them."),
        session: assistantText("把次级会话操作收进浮层，顶部只保留核心入口。", "Move secondary chat actions into a floating panel and keep only the primary controls on top."),
        agent: assistantText("批量任务、逐项审阅和 AI 写入历史。", "Batch tasks, item review, and AI write history."),
    };
    let content = "";
    if (ctx.activePanel === "target") {
        content = ctx.renderTargetNoteCard();
    } else if (ctx.activePanel === "context") {
        content = ctx.renderContextCard();
    } else if (ctx.activePanel === "audit") {
        content = ctx.renderAuditCard();
    } else if (ctx.activePanel === "profiles") {
        content = ctx.renderProfilesPanel();
    } else if (ctx.activePanel === "tools") {
        content = ctx.renderToolsPanel();
    } else if (ctx.activePanel === "session") {
        content = ctx.renderSessionPanel();
    } else if (ctx.activePanel === "agent") {
        content = renderAIDockAgentPanel(ctx);
    }
    return `<div class="assistant-ai__floating-panel assistant-ai__floating-panel--${isBottomPanel ? "bottom" : "top"}">
    <div class="assistant-ai__floating-head">
        <div>
            <div class="assistant-ai__floating-title">${escapeHTML(titleMap[ctx.activePanel])}</div>
            <div class="assistant-ai__floating-subtitle">${escapeHTML(subtitleMap[ctx.activePanel])}</div>
        </div>
        <button type="button" class="b3-button b3-button--text" data-action="toggle-panel" data-panel="${ctx.activePanel}">${assistantText("关闭", "Close")}</button>
    </div>
    <div class="assistant-ai__floating-body">${content}</div>
</div>`;
};

export const renderAIDockAgentPanel = (ctx: TAssistantAIDockRenderRuntime) => {
    const tasks = readAssistantAgentTasks();
    const history = readAssistantOperationHistory();
    const canStartAgent = !!ctx.draftMessage.trim() && !ctx.sending;
    const taskHTML = tasks.length ? tasks.map((task) => {
        const progress = getAssistantAgentTaskProgress(task);
        const canPause = task.status === "running";
        const canResume = task.status === "paused" || task.status === "review";
        const canCancel = task.status === "running" || task.status === "paused";
        const itemHTML = task.items.map((item) => {
            const hasPatch = !!item.patch?.operations?.length;
            const pendingPatch = hasPatch && item.patch!.operations.some((operation) => (operation.status || "pending") === "pending");
            const itemAttrs = `data-task-id="${escapeAttr(task.id)}" data-item-id="${escapeAttr(item.id)}"`;
            const patchHTML = hasPatch ? `<div class="assistant-ai__agent-patch">${renderAssistantPatchHTML(item.patch!, {
                acceptAction: "accept-agent-patch-op",
                rejectAction: "reject-agent-patch-op",
                extraActionAttrs: itemAttrs,
            })}</div>` : "";
            return `<div class="assistant-ai__agent-subitem">
    <div class="assistant-ai__agent-head">
        <span class="assistant-ai__agent-title">${escapeHTML(item.title)}</span>
        <span class="b3-chip b3-chip--small">${escapeHTML(item.status)}</span>
    </div>
    ${item.error ? `<div class="assistant-ai__agent-error">${escapeHTML(item.error)}</div>` : ""}
    ${item.retryCount ? `<div class="assistant-ai__agent-meta">${escapeHTML(`${assistantText("重试", "Retry")} ${item.retryCount}`)}</div>` : ""}
    <div class="assistant-ai__panel-actions">
        ${item.status === "failed" ? `<button type="button" class="b3-button b3-button--outline" data-action="retry-agent-item" ${itemAttrs}>${escapeHTML(assistantText("重试", "Retry"))}</button>` : ""}
        ${pendingPatch ? `<button type="button" class="b3-button b3-button--outline" data-action="accept-agent-patch-all" ${itemAttrs}>${escapeHTML(assistantText("接受全部", "Accept all"))}</button>
        <button type="button" class="b3-button b3-button--outline b3-button--error" data-action="reject-agent-patch-all" ${itemAttrs}>${escapeHTML(assistantText("拒绝剩余", "Reject remaining"))}</button>` : ""}
    </div>
    ${patchHTML}
</div>`;
        }).join("");
        return `<div class="assistant-ai__agent-item">
    <div class="assistant-ai__agent-head">
        <span class="assistant-ai__agent-title">${escapeHTML(task.title)}</span>
        <span class="b3-chip b3-chip--small">${escapeHTML(task.status)}</span>
    </div>
    <div class="assistant-ai__agent-meta">${escapeHTML(`${assistantText("总数", "Total")} ${progress.total} · ${assistantText("完成", "Done")} ${progress.done} · ${assistantText("待审阅", "Review")} ${progress.review} · ${assistantText("失败", "Failed")} ${progress.failed}`)}</div>
    <div class="assistant-ai__panel-actions">
        ${canPause ? `<button type="button" class="b3-button b3-button--outline" data-action="pause-agent-task" data-task-id="${escapeAttr(task.id)}">${escapeHTML(assistantText("暂停", "Pause"))}</button>` : ""}
        ${canResume ? `<button type="button" class="b3-button b3-button--outline" data-action="resume-agent-task" data-task-id="${escapeAttr(task.id)}">${escapeHTML(assistantText("恢复", "Resume"))}</button>` : ""}
        ${canCancel ? `<button type="button" class="b3-button b3-button--outline b3-button--error" data-action="cancel-agent-task" data-task-id="${escapeAttr(task.id)}">${escapeHTML(assistantText("取消", "Cancel"))}</button>` : ""}
    </div>
    <div class="assistant-ai__agent-subitems">${itemHTML}</div>
</div>`;
    }).join("") : `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("当前没有批量 Agent 任务", "No batch Agent tasks yet"))}</div>`;
    const historyHTML = history.length ? history.slice(0, 20).map((item) => {
        const canRollback = item.status === "applied" && item.patch.operations.some(canRollbackAssistantPatchOperation);
        const metaParts = [
            item.patch.source,
            item.patch.risk,
            item.targetLabel || item.targetId || "",
            new Date(item.createdAt).toLocaleString(),
        ].filter(Boolean);
        return `<div class="assistant-ai__agent-item">
    <div class="assistant-ai__agent-head">
        <span class="assistant-ai__agent-title">${escapeHTML(item.patch.summary || assistantText("AI 修改", "AI edit"))}</span>
        <span class="b3-chip b3-chip--small">${escapeHTML(item.status)}</span>
    </div>
    <div class="assistant-ai__agent-meta">${escapeHTML(metaParts.join(" · "))}</div>
    ${item.error ? `<div class="assistant-ai__agent-error">${escapeHTML(item.error)}</div>` : ""}
    <div class="assistant-ai__panel-actions">
        ${canRollback ? `<button type="button" class="b3-button b3-button--outline b3-button--error" data-action="rollback-history" data-history-id="${escapeAttr(item.id)}">${escapeHTML(assistantText("回滚", "Rollback"))}</button>` : ""}
    </div>
</div>`;
    }).join("") : `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("当前还没有 AI 写入历史", "No AI write history yet"))}</div>`;
    return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__panel-heading">${escapeHTML(assistantText("Agent 队列", "Agent Queue"))}</div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="start-agent-from-draft"${canStartAgent ? "" : " disabled"}>${escapeHTML(assistantText("创建并运行", "Create & run"))}</button>
    </div>
    ${taskHTML}
    <div class="assistant-ai__panel-heading">${escapeHTML(assistantText("AI 操作历史", "AI Operation History"))}</div>
    ${historyHTML}
</div>`;
};

export const renderAIDockSessionPanel = (ctx: TAssistantAIDockRenderRuntime) => {
    const session = ctx.getSelectedSession();
    if (!session) {
        return panelEmptyHTML(
            assistantText("还没有会话", "No session selected"),
            assistantText("先新建会话或从历史里选择一个会话，再进行重命名、清空或删除。", "Create or select a chat before renaming, clearing, or deleting it."),
            assistantText("新建会话", "New session"),
            "new-session",
        );
    }
    return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__floating-copy ft__secondary">${escapeHTML(assistantText("顶部只保留历史和新建，次级操作集中到这里，减少主聊天区的干扰。", "Keep history and new chat on top, and move secondary session actions here to reduce clutter."))}</div>
    <div class="assistant-ai__mini-action-list">
        <button type="button" class="assistant-ai__mini-action" data-action="rename-session">
            <span class="assistant-ai__mini-action-icon"><svg><use xlink:href="#iconEdit"></use></svg></span>
            <span class="assistant-ai__mini-action-copy">
                <span class="assistant-ai__mini-action-title">${assistantText("重命名会话", "Rename session")}</span>
                <span class="assistant-ai__mini-action-meta">${escapeHTML(session.title || assistantText("未命名会话", "Untitled session"))}</span>
            </span>
        </button>
        <button type="button" class="assistant-ai__mini-action" data-action="clear-session">
            <span class="assistant-ai__mini-action-icon"><svg><use xlink:href="#iconRefresh"></use></svg></span>
            <span class="assistant-ai__mini-action-copy">
                <span class="assistant-ai__mini-action-title">${assistantText("清空会话", "Clear session")}</span>
                <span class="assistant-ai__mini-action-meta">${assistantText("保留会话，移除当前消息记录。", "Keep the chat but remove current messages.")}</span>
            </span>
        </button>
        <button type="button" class="assistant-ai__mini-action assistant-ai__mini-action--danger" data-action="delete-session">
            <span class="assistant-ai__mini-action-icon"><svg><use xlink:href="#iconTrashcan"></use></svg></span>
            <span class="assistant-ai__mini-action-copy">
                <span class="assistant-ai__mini-action-title">${assistantText("删除会话", "Delete session")}</span>
                <span class="assistant-ai__mini-action-meta">${assistantText("彻底删除该会话及其历史消息。", "Permanently remove this chat and its history.")}</span>
            </span>
        </button>
    </div>
</div>`;
};

export const renderAIDockProfilesPanel = (ctx: TAssistantAIDockRenderRuntime) => {
    if (!ctx.profiles.length) {
        return panelEmptyHTML(assistantText("还没有 AI 配置", "No AI profile yet"), assistantText("先配置一个提供商，再回来开始对话。", "Configure a provider first, then come back to chat."), assistantText("打开配置", "Open Profiles"), "configure-profile");
    }
    return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__floating-copy ft__secondary">${escapeHTML(assistantText("这里把模型切换收纳到底部左侧，避免顶部工具栏继续膨胀。", "The model switcher lives at the lower-left so the main toolbar stays compact."))}</div>
    <div class="assistant-ai__profile-list">${ctx.profiles.map((item) => `
        <button type="button" class="assistant-ai__profile-item${item.id === ctx.selectedProfileId ? " assistant-ai__profile-item--active" : ""}" data-profile-id="${escapeAttr(item.id)}"${ctx.savingProfile ? " disabled" : ""}>
            <span class="assistant-ai__profile-name">${escapeHTML(item.name || item.model || providerDisplayName(item.provider))}</span>
            <span class="assistant-ai__profile-meta">${escapeHTML(providerDisplayName(item.provider))}${item.model ? ` · ${escapeHTML(item.model)}` : ""}${item.isDefault ? ` · ${escapeHTML(assistantText("默认", "Default"))}` : ""}</span>
        </button>`).join("")}</div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="open-profiles">${assistantText("管理模型与提供商", "Manage models & providers")}</button>
    </div>
</div>`;
};

export const renderAIDockTargetNoteCard = (ctx: TAssistantAIDockRenderRuntime) => {
    const effectiveContext = ctx.getEffectiveContextPreview();
    const lockGlyph = ctx.getTargetLockGlyph();
    const targetLockLabel = ctx.getTargetLockLabel();
    const targetSummaryHTML = !ctx.includeCurrentNote
        ? `<div class="assistant-ai__target-summary assistant-ai__target-summary--muted"><div class="assistant-ai__target-summary-title"><span class="assistant-ai__target-lock" aria-hidden="true">${escapeHTML(lockGlyph)}</span><span>${escapeHTML(assistantText("当前未附加笔记上下文", "Current note context is not attached"))}</span></div><div class="assistant-ai__target-summary-meta">${escapeHTML(targetLockLabel)}</div></div>`
        : effectiveContext
            ? `<div class="assistant-ai__target-summary">
    <div class="assistant-ai__target-summary-title"><span class="assistant-ai__target-lock" aria-hidden="true">${escapeHTML(lockGlyph)}</span><span>${escapeHTML(effectiveContext.title || assistantText("当前笔记", "Current note"))}</span></div>
    <div class="assistant-ai__note-result-path">${escapeHTML(effectiveContext.path || "")}</div>
    <div class="assistant-ai__target-summary-meta">${escapeHTML(targetLockLabel)}</div>
</div>`
            : `<div class="assistant-ai__target-summary assistant-ai__target-summary--muted"><div class="assistant-ai__target-summary-title"><span class="assistant-ai__target-lock" aria-hidden="true">${escapeHTML(lockGlyph)}</span><span>${escapeHTML(assistantText("当前没有可读取的活动笔记", "No active note is available"))}</span></div><div class="assistant-ai__target-summary-meta">${escapeHTML(targetLockLabel)}</div></div>`;
    const searchResultHTML = ctx.noteSearchLoading
        ? `<div class="assistant-ai__note-search-popover assistant-ai__note-search-popover--inline"><div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("正在搜索笔记...", "Searching notes..."))}</div></div>`
        : ctx.noteSearchResults.length
            ? `<div class="assistant-ai__note-search-popover assistant-ai__note-search-popover--inline"><div class="assistant-ai__note-results">${ctx.noteSearchResults.map((item) => `<button type="button" class="assistant-ai__note-result" data-note-root-id="${escapeAttr(item.rootID)}">
    <span class="assistant-ai__note-result-title">${escapeHTML(item.title)}</span>
    <span class="assistant-ai__note-result-path">${escapeHTML(item.path)}</span>
</button>`).join("")}</div></div>`
            : ctx.noteSearchKeyword.trim()
                ? `<div class="assistant-ai__note-search-popover assistant-ai__note-search-popover--inline"><div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("没有找到匹配的笔记", "No matching notes found"))}</div></div>`
                : "";
    return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__floating-copy ft__secondary">${escapeHTML(assistantText("搜索任意笔记、固定当前笔记，或让 AI 自动跟随当前活动笔记。", "Search any note, pin the current note, or let AI follow the active note."))}</div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="pin-current-note"${ctx.currentNotePreview ? "" : " disabled"}>${escapeHTML(assistantText("固定当前笔记", "Pin current note"))}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="follow-current-note">${escapeHTML(assistantText("跟随当前笔记", "Follow current note"))}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="clear-target-note">${escapeHTML(assistantText("清空目标笔记", "Clear target note"))}</button>
    </div>
    ${targetSummaryHTML}
    <div class="assistant-ai__note-search">
        <input class="b3-text-field b3-text-field--text" data-role="note-search" placeholder="${escapeAttr(assistantText("搜索并选择任意笔记作为 AI 目标", "Search any note and set it as the AI target"))}" value="${escapeAttr(ctx.noteSearchKeyword)}">
        ${searchResultHTML}
    </div>
</div>`;
};

export const renderAIDockContextCard = (ctx: TAssistantAIDockRenderRuntime) => {
    const effectiveContext = ctx.getEffectiveContextPreview();
    const previewBits: string[] = [];
    if (effectiveContext?.title) {
        previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(truncateText(effectiveContext.title, 24))}</span>`);
    }
    if (effectiveContext?.currentBlockID) {
        previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("当前块", "Block"))}</span>`);
    }
    if (ctx.toolPolicy) {
        previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("读", "Read"))} ${escapeHTML(getToolTargetLabel(ctx.toolPolicy.readScope))}</span>`);
        previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("写", "Write"))} ${escapeHTML(getToolTargetLabel(ctx.toolPolicy.writeScope))}</span>`);
        previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("留痕", "Trace"))} ${escapeHTML(ctx.toolPolicy.traceMode === "markdown" ? assistantText("正文", "Markdown") : assistantText("审计", "Audit"))}</span>`);
    }
    const currentNoteHTML = !ctx.includeCurrentNote
        ? `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("当前未附加笔记上下文", "Current note context is not attached"))}</div>`
        : effectiveContext
            ? `<div class="assistant-ai__context-line"><strong>${escapeHTML(effectiveContext.title || assistantText("当前笔记", "Current note"))}</strong></div>
<div class="assistant-ai__context-line ft__secondary">${escapeHTML(effectiveContext.path || "")}</div>
${effectiveContext.currentBlockID ? `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(`${assistantText("当前块", "Current block")}: ${effectiveContext.currentBlockID}`)}</div>` : ""}
${effectiveContext.selectedText ? `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(`${assistantText("选中文本", "Selected text")}: ${truncateText(effectiveContext.selectedText, 80)}`)}</div>` : ""}`
            : `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("当前没有可读取的活动笔记", "No active note is available"))}</div>`;
    const policyHTML = ctx.toolPolicy
        ? `<div class="assistant-ai__context-line">${escapeHTML(assistantText("工具", "Tools"))}: ${escapeHTML(ctx.enableTools ? assistantText("已启用", "Enabled") : assistantText("已关闭", "Disabled"))}</div>
<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("读取", "Read"))}: ${escapeHTML(getToolTargetLabel(ctx.toolPolicy.readScope))} · ${escapeHTML(assistantText("写入", "Write"))}: ${escapeHTML(getToolTargetLabel(ctx.toolPolicy.writeScope))} · ${escapeHTML(assistantText("留痕", "Trace"))}: ${escapeHTML(ctx.toolPolicy.traceMode === "markdown" ? assistantText("正文留痕 + 审计", "Markdown trace + audit") : assistantText("仅内部审计", "Audit only"))}</div>`
        : `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("工具权限加载中...", "Loading tool permissions..."))}</div>`;
    return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__chips">${previewBits.join("")}</div>
    ${currentNoteHTML}
    ${policyHTML}
</div>`;
};

export const renderAIDockAuditCard = (ctx: TAssistantAIDockRenderRuntime) => {
    const executedCount = ctx.audits.filter((audit) => audit.executed).length;
    const blockedCount = ctx.audits.filter((audit) => !audit.executed).length;
    return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__chips">
        <span class="b3-chip b3-chip--small">${escapeHTML(assistantText("最近", "Recent"))} ${ctx.audits.length}</span>
        <span class="b3-chip b3-chip--small">${escapeHTML(assistantText("已执行", "Executed"))} ${executedCount}</span>
        <span class="b3-chip b3-chip--small">${escapeHTML(assistantText("已拦截", "Blocked"))} ${blockedCount}</span>
    </div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="refresh-audits">${escapeHTML(assistantText("刷新", "Refresh"))}</button>
    </div>
    ${ctx.audits.length ? ctx.audits.map((audit) => {
        const status = audit.executed
            ? assistantText("已执行", "Executed")
            : (audit.status === "error" ? assistantText("失败", "Failed") : assistantText("已拦截", "Blocked"));
        const statusClass = audit.executed ? "success" : (audit.status === "error" ? "error" : "secondary");
        const detail = `${audit.summary || audit.error || ""}`.trim();
        return `<div class="assistant-ai__audit-item">
    <div class="assistant-ai__audit-head">
        <span class="assistant-ai__audit-name">${escapeHTML(audit.toolName || audit.toolId)}</span>
        <span class="b3-chip b3-chip--small b3-chip--${statusClass}">${escapeHTML(status)}</span>
    </div>
    <div class="assistant-ai__audit-meta">${escapeHTML(`${audit.risk} · ${audit.decision} · ${formatDateTime(audit.createdAt)}`)}</div>
    ${detail ? `<div class="assistant-ai__audit-detail">${escapeHTML(detail)}</div>` : ""}
</div>`;
    }).join("") : `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("当前还没有工具审计记录", "No tool audits yet"))}</div>`}
</div>`;
};

export const renderAIDockToolsPanel = (ctx: TAssistantAIDockRenderRuntime) => {
    const profile = ctx.getSelectedProfile();
    if (!profile) {
        return panelEmptyHTML(assistantText("还没有 AI 配置", "No AI profile yet"), assistantText("先配置一个模型，再决定要开放哪些能力。", "Configure a model first, then decide which tools to expose."), assistantText("打开配置", "Open Profiles"), "configure-profile");
    }
    if (!ctx.toolPolicy) {
        return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("工具权限加载中...", "Loading tool permissions..."))}</div>
</div>`;
    }
    const groups = assistantAIToolRiskOrder.map((risk) => ({
        risk,
        items: ctx.toolCatalog.filter((item) => item.risk === risk),
    })).filter((group) => group.items.length);
    const getModeLabel = (mode: string) => {
        switch (mode) {
            case "auto":
                return assistantText("自动", "Auto");
            case "confirm":
                return assistantText("确认", "Confirm");
            case "deny":
                return assistantText("关闭", "Off");
            default:
                return mode;
        }
    };
    return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__floating-copy ft__secondary">${escapeHTML(assistantText("默认把复杂能力收起来，只保留聊天主视图；真正需要时再到这里展开。", "Keep advanced capabilities collapsed by default and only open them here when needed."))}</div>
    <label class="assistant-ai__toggle assistant-ai__toggle--panel fn__flex">
        <input type="checkbox" data-role="enable-tools"${ctx.enableTools ? " checked" : ""}>
        <span>${escapeHTML(assistantText("允许 AI 使用工具能力", "Allow AI to use tools"))}</span>
    </label>
    <div class="assistant-ai__policy-grid">
        <label class="fn__flex-column assistant-ai__policy-field">
            <span>${escapeHTML(assistantText("读取范围", "Read scope"))}</span>
            <select class="b3-select fn__flex-1" data-policy="toolReadScope"${ctx.savingProfile ? " disabled" : ""}>
                ${renderSelectOptions(assistantAIToolReadScopeOptions, ctx.toolPolicy.readScope)}
            </select>
        </label>
        <label class="fn__flex-column assistant-ai__policy-field">
            <span>${escapeHTML(assistantText("写入范围", "Write scope"))}</span>
            <select class="b3-select fn__flex-1" data-policy="toolWriteScope"${ctx.savingProfile ? " disabled" : ""}>
                ${renderSelectOptions(assistantAIToolWriteScopeOptions, ctx.toolPolicy.writeScope)}
            </select>
        </label>
        <label class="fn__flex-column assistant-ai__policy-field assistant-ai__policy-field--wide">
            <span>${escapeHTML(assistantText("留痕策略", "Trace mode"))}</span>
            <select class="b3-select fn__flex-1" data-policy="toolTraceMode"${ctx.savingProfile ? " disabled" : ""}>
                ${renderSelectOptions(assistantAIToolTraceOptions, ctx.toolPolicy.traceMode)}
            </select>
        </label>
    </div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="tool-policy-recommended"${ctx.savingProfile ? " disabled" : ""}>${assistantText("推荐", "Recommended")}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="tool-policy-readonly"${ctx.savingProfile ? " disabled" : ""}>${assistantText("只读", "Read-only")}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="tool-policy-confirm-write"${ctx.savingProfile ? " disabled" : ""}>${assistantText("写入前确认", "Confirm writes")}</button>
    </div>
    <div class="assistant-ai__tool-groups">${groups.map((group) => `
        <div class="assistant-ai__tool-group">
            <div class="assistant-ai__tool-group-title">${escapeHTML(getToolRiskLabel(group.risk))}</div>
            ${group.items.map((tool) => {
                const mode = ctx.toolPolicy?.toolModes?.[tool.id] || tool.defaultMode || ctx.getDefaultToolMode(tool);
                const enabled = mode !== "deny";
                const metaBits = [
                    tool.description,
                    `${assistantText("范围", "Scope")}: ${getToolTargetLabel(tool.target)}`,
                    `${assistantText("默认", "Default")}: ${getModeLabel(tool.defaultMode || ctx.getDefaultToolMode(tool))}`,
                    `${assistantText("当前", "Current")}: ${getModeLabel(mode)}`,
                ].filter(Boolean);
                return `<label class="assistant-ai__tool-toggle-row">
    <span class="assistant-ai__tool-toggle-copy">
        <span class="assistant-ai__tool-toggle-name">${escapeHTML(tool.name || tool.id)}</span>
        <span class="assistant-ai__tool-toggle-meta">${escapeHTML(metaBits.join(" · "))}</span>
    </span>
    <span class="assistant-ai__tool-toggle-state">
        <span class="b3-chip b3-chip--small">${escapeHTML(getModeLabel(mode))}</span>
        <input type="checkbox" data-tool-toggle="${escapeAttr(tool.id)}"${enabled ? " checked" : ""}${ctx.savingProfile ? " disabled" : ""}>
    </span>
</label>`;
            }).join("")}
        </div>`).join("")}</div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="open-profiles">${assistantText("打开完整配置", "Open full config")}</button>
    </div>
</div>`;
};
