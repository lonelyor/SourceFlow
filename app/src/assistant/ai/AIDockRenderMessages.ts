import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, formatDateTime, nl2br} from "../common/dom";
import {IAssistantAIMessage, IAssistantAISourceCitation} from "./api";
import type {TAssistantAIDockRenderRuntime} from "./AIDockRender";
import {renderAssistantPatchHTML} from "../patch/format";
import type {IAssistantEditPatch} from "../patch/types";

const SOURCE_CITATION_RE = /\[📄\s*([^\]]+)\]/g;

const flattenSourceCitations = (sources: IAssistantAISourceCitation[]): IAssistantAISourceCitation[] => {
    const ret: IAssistantAISourceCitation[] = [];
    for (const source of sources || []) {
        if (!source?.id || !source.title) {
            continue;
        }
        ret.push(source);
        if (source.children?.length) {
            ret.push(...flattenSourceCitations(source.children));
        }
    }
    return ret;
};

const getMessageSourceCitations = (item: IAssistantAIMessage): IAssistantAISourceCitation[] => {
    const raw = item.metadata?.sources;
    if (!Array.isArray(raw)) {
        return [];
    }
    return flattenSourceCitations(raw as IAssistantAISourceCitation[]);
};

const renderSourceCitations = (html: string, sources: IAssistantAISourceCitation[]): string => {
    const sourceByTitle = new Map<string, IAssistantAISourceCitation>();
    for (const source of sources) {
        const title = `${source.title || ""}`.trim();
        if (title && !sourceByTitle.has(title)) {
            sourceByTitle.set(title, source);
        }
    }
    return html.replace(SOURCE_CITATION_RE, (_, title: string) => {
        const normalizedTitle = `${title || ""}`.trim();
        const source = sourceByTitle.get(normalizedTitle);
        const escapedTitle = escapeAttr(normalizedTitle);
        const canOpenSource = source?.id && (source.type === "note" || source.type === "folder");
        const noteAttr = canOpenSource ? ` data-note-id="${escapeAttr(source.id)}" data-source-type="${escapeAttr(source.type || "")}"` : "";
        return `<span class="assistant-ai__source-citation" data-action="open-source-note"${noteAttr} data-note-title="${escapedTitle}" title="${escapedTitle}">📄 ${escapeHTML(normalizedTitle)}</span>`;
    });
};

export const renderAIDockMessages = (ctx: TAssistantAIDockRenderRuntime) => {
    if (ctx.loading && !ctx.messages.length) {
        return `<div class="assistant-ai__loading">${assistantText("加载消息中...", "Loading messages...")}</div>`;
    }
    if (!ctx.profiles.length && !ctx.messages.length) {
        return `<div class="assistant-ai__empty-state">
    <div class="assistant-ai__empty-kicker">${assistantText("AI 配置", "AI Setup")}</div>
    <div class="assistant-ai__empty-title">${assistantText("请先配置 AI 提供商", "Configure an AI provider first")}</div>
    <div class="assistant-ai__empty-detail">${assistantText("配置真实提供商和模型后，即可在这里开始独立对话，并在对话中引用笔记上下文。", "Configure a real provider and model, then start a standalone chat here with note context.")}</div>
    <button type="button" class="b3-button b3-button--outline" data-action="configure-profile">${escapeHTML(assistantText("打开 AI 配置", "Open AI settings"))}</button>
</div>`;
    }
    if (!ctx.messages.length) {
        return `<div class="assistant-ai__empty-state">
    <div class="assistant-ai__empty-kicker">${assistantText("第二大脑", "Second Brain")}</div>
    <div class="assistant-ai__empty-title">${assistantText("开始一次聚焦对话", "Start a focused chat")}</div>
    <div class="assistant-ai__empty-detail">${assistantText("聊天保持主视图，目标笔记、上下文、审计和能力都压缩成按钮，需要时再展开。", "Keep chat as the main canvas while target notes, context, audits, and tools stay compressed into buttons until you need them.")}</div>
</div>`;
    }
    let activeSources: IAssistantAISourceCitation[] = [];
    return ctx.messages.map((item) => {
        if (item.role === "user") {
            activeSources = getMessageSourceCitations(item);
        }
        const attachments = ctx.getMessageAttachments(item);
        const displayContent = ctx.getMessageDisplayContent(item, attachments);
        const isExpandable = ctx.isMessageExpandable(item);
        const isExpanded = ctx.isMessageExpanded(item.id);
        const isEdited = item.role === "user" && !!item.metadata?.editedAt;
        return `
<div class="assistant-ai__message assistant-ai__message--${item.role === "assistant" ? "assistant" : "user"}${item.localPending ? " assistant-ai__message--pending" : ""}${item.localError ? " assistant-ai__message--error" : ""}" data-message-id="${escapeAttr(item.id)}">
    <div class="assistant-ai__message-head">
        <div class="assistant-ai__message-badges">
            <span class="assistant-ai__message-role assistant-ai__message-role--${item.role === "assistant" ? "assistant" : "user"}">${item.role === "assistant" ? "AI" : assistantText("你", "You")}</span>
            ${isEdited ? `<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("已编辑", "Edited"))}</span>` : ""}
            ${item.localPending ? `<span class="b3-chip b3-chip--small b3-chip--warning">${escapeHTML(assistantText("处理中", "Processing"))}</span>` : ""}
            ${item.localStopped ? `<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("已停止", "Stopped"))}</span>` : ""}
            ${item.localError ? `<span class="b3-chip b3-chip--small b3-chip--error">${escapeHTML(assistantText("失败", "Failed"))}</span>` : ""}
        </div>
        <div class="assistant-ai__message-side">
            <div class="assistant-ai__message-time">${item.localPending ? assistantText("处理中...", "Processing...") : formatDateTime(item.createdAt)}</div>
            <div class="assistant-ai__message-actions">
                <button type="button" class="assistant-ai__message-action" data-action="copy-message" data-message-id="${escapeAttr(item.id)}">${escapeHTML(assistantText("复制", "Copy"))}</button>
                ${item.role === "user" && !item.localPending ? `<button type="button" class="assistant-ai__message-action" data-action="edit-message" data-message-id="${escapeAttr(item.id)}">${escapeHTML(assistantText("编辑", "Edit"))}</button>` : ""}
                ${isExpandable ? `<button type="button" class="assistant-ai__message-action assistant-ai__message-action--expand" data-action="toggle-message-expand" data-message-id="${escapeAttr(item.id)}">${escapeHTML(isExpanded ? assistantText("收起", "Collapse") : assistantText("展开", "Expand"))}</button>` : ""}
            </div>
        </div>
    </div>
    ${displayContent ? `<div class="assistant-ai__message-content">${renderSourceCitations(nl2br(displayContent), activeSources)}</div>` : ""}
    ${ctx.renderAttachmentList(attachments)}
    ${ctx.renderMessageToolResults(item)}
</div>`;
    }).join("");
};

export const renderAIDockMessageToolResults = (ctx: TAssistantAIDockRenderRuntime, item: IAssistantAIMessage) => {
    if (item.role !== "assistant") {
        return "";
    }
    const raw = item.metadata?.toolResults;
    if (!Array.isArray(raw) || !raw.length) {
        return "";
    }
    const renderToolDetails = (tool: Record<string, unknown>) => {
        const data = tool?.data && typeof tool.data === "object" ? tool.data as Record<string, unknown> : {};
        const patch = (data.patch || data.previewPatch) as IAssistantEditPatch | undefined;
        const args = tool?.args && typeof tool.args === "object" ? tool.args as Record<string, unknown> : null;
        const context = tool?.context && typeof tool.context === "object" ? tool.context as Record<string, unknown> : null;
        const details: string[] = [];
        if (patch?.operations?.length) {
            const canReviewPatch = tool?.decision === "confirm" && !tool?.executed && !tool?.rejected && hasPendingPatchOperations(patch);
            const messageId = `${tool?.messageId || ""}`;
            const toolIndex = typeof tool?.toolIndex === "number" ? tool.toolIndex : -1;
            const extraActionAttrs = canReviewPatch && messageId && toolIndex > -1
                ? `data-message-id="${escapeAttr(messageId)}" data-tool-index="${toolIndex}"`
                : "";
            details.push(`<div class="assistant-ai__tool-patch">${renderAssistantPatchHTML(patch, {
                readonly: !canReviewPatch,
                acceptAction: "accept-tool-patch-op",
                rejectAction: "reject-tool-patch-op",
                extraActionAttrs,
            })}</div>`);
        }
        if (context?.currentBlockID || context?.rootID) {
            details.push(`<div class="assistant-ai__tool-summary">${escapeHTML(`${assistantText("目标", "Target")}: ${context.currentBlockID || context.rootID}`)}</div>`);
        }
        if (args && Object.keys(args).length) {
            details.push(`<pre class="assistant-ai__tool-args">${escapeHTML(JSON.stringify(args, null, 2))}</pre>`);
        }
        return details.join("");
    };
    const hasPendingPatchOperations = (patch: IAssistantEditPatch | undefined) => {
        return !!patch?.operations?.some((operation) => (operation.status || "pending") === "pending");
    };
    const hasAcceptedPatchOperations = (patch: IAssistantEditPatch | undefined) => {
        return !!patch?.operations?.some((operation) => operation.status === "accepted");
    };
    return `<div class="assistant-ai__tool-results">${raw.map((tool, index) => {
        const normalizedTool = tool && typeof tool === "object" ? {
            ...(tool as Record<string, unknown>),
            messageId: item.id,
            toolIndex: index,
        } : tool;
        const data = normalizedTool?.data && typeof normalizedTool.data === "object" ? normalizedTool.data as Record<string, unknown> : {};
        const patch = (data.patch || data.previewPatch) as IAssistantEditPatch | undefined;
        const canReviewPatch = !!patch?.operations?.length && !normalizedTool?.executed && !normalizedTool?.rejected && normalizedTool?.decision === "confirm" && hasPendingPatchOperations(patch);
        const patchReviewed = !!patch?.operations?.length && !hasPendingPatchOperations(patch);
        const name = `${tool?.name || tool?.toolId || assistantText("工具", "Tool")}`;
        const isRejected = !!tool?.rejected;
        const status = tool?.executed
            ? assistantText("已执行", "Executed")
            : (isRejected
                ? assistantText("已拒绝", "Rejected")
                : (patchReviewed
                    ? (hasAcceptedPatchOperations(patch) ? assistantText("补丁已应用", "Patch applied") : assistantText("补丁已拒绝", "Patch rejected"))
                    : (tool?.decision === "confirm" ? assistantText("待审阅", "Needs review") : assistantText("已拦截", "Blocked"))));
        const summary = `${tool?.summary || tool?.error || ""}`.trim();
        const canConfirm = !tool?.executed && !isRejected && tool?.decision === "confirm" && !!tool?.toolId && !patch?.operations?.length;
        const statusClass = tool?.executed || (patchReviewed && hasAcceptedPatchOperations(patch)) ? "success" : (isRejected || (patchReviewed && !hasAcceptedPatchOperations(patch)) ? "error" : (tool?.decision === "confirm" ? "warning" : "secondary"));
        return `<div class="assistant-ai__tool-result assistant-ai__tool-result--${statusClass}" data-message-id="${escapeAttr(item.id)}" data-tool-index="${index}">
    <div class="assistant-ai__tool-result-head">
        <div class="assistant-ai__tool-title-group">
            <span class="assistant-ai__tool-name">${escapeHTML(name)}</span>
            <span class="b3-chip b3-chip--small b3-chip--${statusClass}">${escapeHTML(status)}</span>
        </div>
        ${canReviewPatch ? `<div class="assistant-ai__tool-result-actions">
            <button type="button" class="b3-button b3-button--outline assistant-ai__tool-action" data-action="accept-tool-patch-all" data-message-id="${escapeAttr(item.id)}" data-tool-index="${index}"${ctx.sending ? " disabled" : ""}>${escapeHTML(assistantText("接受全部", "Accept all"))}</button>
            <button type="button" class="b3-button b3-button--outline b3-button--error assistant-ai__tool-action" data-action="reject-tool-patch-all" data-message-id="${escapeAttr(item.id)}" data-tool-index="${index}"${ctx.sending ? " disabled" : ""}>${escapeHTML(assistantText("拒绝剩余", "Reject remaining"))}</button>
        </div>` : ""}
        ${canConfirm ? `<button type="button" class="b3-button b3-button--outline assistant-ai__tool-action" data-action="confirm-tool" data-message-id="${escapeAttr(item.id)}" data-tool-index="${index}"${ctx.sending ? " disabled" : ""}>${escapeHTML(assistantText("确认执行", "Confirm"))}</button><button type="button" class="b3-button b3-button--outline b3-button--error assistant-ai__tool-action" data-action="reject-tool" data-message-id="${escapeAttr(item.id)}" data-tool-index="${index}"${ctx.sending ? " disabled" : ""}>${escapeHTML(assistantText("拒绝", "Reject"))}</button>` : ""}
    </div>
    ${summary ? `<div class="assistant-ai__tool-summary">${escapeHTML(summary)}</div>` : ""}
    ${renderToolDetails(normalizedTool as Record<string, unknown>)}
</div>`;
    }).join("")}</div>`;
};
