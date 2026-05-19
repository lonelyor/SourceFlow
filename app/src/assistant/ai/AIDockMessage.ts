import {showMessage} from "../../dialog/message";
import {writeText} from "../../protyle/util/compatibility";
import {assistantText, ASSISTANT_ANALYZE_PROMPT, buildAssistantNoteContext} from "../constants";
import {formatTranscriptMarkdown, saveMarkdownAsAssistantNote, appendMarkdownToCurrentNote} from "../common/note";
import {nl2br, truncateText} from "../common/dom";
import {
    analyzeAssistantAISession,
    confirmAssistantAITool,
    editAssistantAIMessageStream,
    IAssistantAIInputAttachment,
    rejectAssistantAITool,
    streamAssistantAI,
} from "./api";
import type {IAssistantAIDockRuntime} from "./AIDockContract";
import {
    assistantAIComposerAttachmentLimit,
    assistantAIComposerAttachmentMaxBytes,
    assistantAIMessageCollapseCharLimit,
    assistantAIMessageCollapseLineLimit,
    readAssistantAIImageFile,
    TAssistantAIMessageItem,
} from "./AIDockShared";

export const focusAIDockComposer = (ctx: IAssistantAIDockRuntime) => {
    const textarea = ctx.element.querySelector("[data-role='message']") as HTMLTextAreaElement;
    if (!textarea) {
        return;
    }
    window.requestAnimationFrame(() => {
        textarea.focus();
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
    });
};

export const setAIDockComposerDropActive = (ctx: IAssistantAIDockRuntime, active: boolean) => {
    const composer = ctx.element.querySelector(".assistant-ai__composer-card") as HTMLElement;
    composer?.classList.toggle("assistant-ai__composer-card--drop", active);
};

export const getAIDockEffectiveContextPreview = (ctx: IAssistantAIDockRuntime) => {
    if (!ctx.includeCurrentNote) {
        return null;
    }
    return ctx.pinnedNotePreview || ctx.currentNotePreview;
};

export const buildAIDockLocalMessage = (
    ctx: IAssistantAIDockRuntime,
    role: "assistant" | "user",
    content: string,
    extra: Partial<TAssistantAIMessageItem> = {},
): TAssistantAIMessageItem => {
    return {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId: ctx.selectedSessionId,
        role,
        content,
        providerMessageId: "",
        inputTokens: 0,
        outputTokens: 0,
        metadata: {},
        createdAt: Date.now(),
        ...extra,
    };
};

export const cloneAIDockComposerAttachments = (ctx: IAssistantAIDockRuntime) => {
    return ctx.attachments.map((item) => ({...item}));
};

export const getAIDockAttachmentSummary = (_ctx: IAssistantAIDockRuntime, count: number) => {
    if (count < 1) {
        return "";
    }
    return assistantText(`已附带 ${count} 张图片`, `${count} image${count > 1 ? "s" : ""} attached`);
};

export const buildAIDockUserMessagePreview = (
    ctx: IAssistantAIDockRuntime,
    message: string,
    attachments: IAssistantAIInputAttachment[],
) => {
    const normalizedMessage = `${message || ""}`.trim();
    if (normalizedMessage) {
        return normalizedMessage;
    }
    return ctx.getAttachmentSummary(attachments.length);
};

export const getAIDockMessageById = (ctx: IAssistantAIDockRuntime, messageId: string) => {
    return ctx.messages.find((item) => item.id === messageId);
};

export const isAIDockMessageExpandable = (_ctx: IAssistantAIDockRuntime, item: TAssistantAIMessageItem) => {
    if (!item || item.role !== "user") {
        return false;
    }
    const content = `${item.content || ""}`.trim();
    if (!content) {
        return false;
    }
    return Array.from(content).length > assistantAIMessageCollapseCharLimit || content.split(/\r?\n/).length > assistantAIMessageCollapseLineLimit;
};

export const isAIDockMessageExpanded = (ctx: IAssistantAIDockRuntime, messageId: string) => {
    return ctx.expandedMessageIds.has(messageId);
};

export const toggleAIDockMessageExpanded = (ctx: IAssistantAIDockRuntime, messageId: string) => {
    if (!messageId) {
        return;
    }
    if (ctx.expandedMessageIds.has(messageId)) {
        ctx.expandedMessageIds.delete(messageId);
    } else {
        ctx.expandedMessageIds.add(messageId);
    }
    ctx.render();
};

export const buildAIDockCollapsedMessageContent = (_ctx: IAssistantAIDockRuntime, content: string) => {
    const normalized = `${content || ""}`.replace(/\r\n/g, "\n").trim();
    if (!normalized) {
        return "";
    }
    const lines = normalized.split("\n");
    let collapsed = lines.slice(0, assistantAIMessageCollapseLineLimit).join("\n").trimEnd();
    const limitedRunes = Array.from(collapsed);
    if (limitedRunes.length > assistantAIMessageCollapseCharLimit) {
        collapsed = `${limitedRunes.slice(0, assistantAIMessageCollapseCharLimit).join("")}…`;
    } else if (collapsed !== normalized || lines.length > assistantAIMessageCollapseLineLimit) {
        collapsed = `${collapsed}…`;
    }
    return collapsed;
};

export const getAIDockMessageDisplayContent = (
    ctx: IAssistantAIDockRuntime,
    item: TAssistantAIMessageItem,
    attachments: IAssistantAIInputAttachment[],
) => {
    const fullContent = `${item.content || ""}`.trim();
    if (!fullContent) {
        return ctx.getAttachmentSummary(attachments.length);
    }
    if (ctx.isMessageExpandable(item) && !ctx.isMessageExpanded(item.id)) {
        return ctx.buildCollapsedMessageContent(fullContent);
    }
    return fullContent;
};

export const buildAIDockMessageCopyText = (ctx: IAssistantAIDockRuntime, item: TAssistantAIMessageItem) => {
    const content = `${item.content || ""}`.trim();
    const attachments = ctx.getMessageAttachments(item);
    if (!attachments.length) {
        return content;
    }
    const lines = content ? [content, ""] : [];
    lines.push(assistantText(`图片 ${attachments.length} 张`, `Images ${attachments.length}`));
    attachments.forEach((attachment, index) => {
        lines.push(`${index + 1}. ${attachment.name || assistantText("未命名图片", "Untitled image")}`);
    });
    return lines.join("\n").trim();
};

export const copyAIDockMessage = (ctx: IAssistantAIDockRuntime, messageId: string) => {
    const message = ctx.getMessageById(messageId);
    if (!message) {
        return;
    }
    const text = ctx.buildMessageCopyText(message);
    if (!text) {
        return;
    }
    writeText(text);
    showMessage(assistantText("消息已复制", "Message copied"));
};

export const clearAIDockEditingMessage = (ctx: IAssistantAIDockRuntime, restoreComposer: boolean) => {
    const backupAttachments = ctx.attachmentsBackup?.map((item) => ({...item})) || [];
    ctx.editingMessageId = "";
    if (restoreComposer) {
        ctx.draftMessage = ctx.draftBackup;
        ctx.attachments = backupAttachments;
    }
    ctx.draftBackup = "";
    ctx.attachmentsBackup = null;
};

export const startAIDockEditingMessage = (ctx: IAssistantAIDockRuntime, messageId: string) => {
    const message = ctx.getMessageById(messageId);
    if (!message || message.role !== "user") {
        return;
    }
    if (!ctx.editingMessageId) {
        ctx.draftBackup = ctx.draftMessage;
        ctx.attachmentsBackup = ctx.cloneComposerAttachments();
    }
    ctx.editingMessageId = message.id;
    ctx.expandedMessageIds.add(message.id);
    ctx.draftMessage = `${message.content || ""}`.trim();
    ctx.attachments = ctx.getMessageAttachments(message).map((item) => ({...item}));
    ctx.render();
    ctx.focusComposer();
};

export const syncAIDockEditingMessageState = (ctx: IAssistantAIDockRuntime) => {
    if (ctx.editingMessageId && !ctx.getMessageById(ctx.editingMessageId)) {
        ctx.clearEditingMessage(false);
    }
};

export const getAIDockMessageAttachments = (_ctx: IAssistantAIDockRuntime, item: TAssistantAIMessageItem) => {
    const raw = item.metadata?.attachments;
    if (!Array.isArray(raw)) {
        return [] as IAssistantAIInputAttachment[];
    }
    return raw.map((attachment) => {
        const row = attachment as Record<string, unknown>;
        return {
            id: `${row.id || ""}`.trim(),
            name: `${row.name || ""}`.trim(),
            mimeType: `${row.mimeType || ""}`.trim(),
            data: `${row.data || ""}`.trim(),
        };
    }).filter((attachment) => attachment.mimeType.startsWith("image/") && !!attachment.data);
};

export const removeAIDockComposerAttachment = (ctx: IAssistantAIDockRuntime, id: string) => {
    if (!id) {
        return;
    }
    ctx.attachments = ctx.attachments.filter((item) => item.id !== id);
    ctx.render();
    ctx.focusComposer();
};

export const addAIDockComposerAttachments = async (ctx: IAssistantAIDockRuntime, files: File[]) => {
    if (!files.length) {
        return;
    }
    const nextFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!nextFiles.length) {
        showMessage(assistantText("目前仅支持上传图片到 AI 对话", "Only image uploads are supported in AI chat right now"), 4000, "error");
        return;
    }
    const oversizeFile = nextFiles.find((file) => file.size > assistantAIComposerAttachmentMaxBytes);
    if (oversizeFile) {
        showMessage(assistantText("图片过大，请换一张更小的图片", "The image is too large. Please choose a smaller one."), 4000, "error");
        return;
    }
    try {
        const availableCount = Math.max(assistantAIComposerAttachmentLimit - ctx.attachments.length, 0);
        if (availableCount < 1) {
            showMessage(assistantText("最多同时附带 6 张图片", "You can attach up to 6 images at a time"), 4000, "error");
            return;
        }
        const loaded = await Promise.all(nextFiles.slice(0, availableCount).map((file) => readAssistantAIImageFile(file)));
        ctx.attachments = ctx.attachments.concat(loaded);
        if (nextFiles.length > availableCount) {
            showMessage(assistantText("图片数量已超出上限，其余图片未加入", "Some images were skipped because the attachment limit was reached"), 4000, "error");
        }
        ctx.render();
        ctx.focusComposer();
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    }
};

export const openAIDockComposerAttachmentPicker = (ctx: IAssistantAIDockRuntime) => {
    const input = ctx.element.querySelector("[data-role='message-attachments']") as HTMLInputElement;
    input?.click();
};

export const updateAIDockMessageContent = (ctx: IAssistantAIDockRuntime, messageId: string, content: string) => {
    const element = ctx.element.querySelector(`.assistant-ai__message[data-message-id="${messageId}"] .assistant-ai__message-content`) as HTMLElement;
    if (element) {
        element.innerHTML = nl2br(content);
    }
};

export const sendAIDockMessage = async (ctx: IAssistantAIDockRuntime) => {
    const profile = ctx.getSelectedProfile();
    if (!profile) {
        showMessage(assistantText("请先配置 AI 提供商", "Configure an AI profile first"), 5000, "error");
        return;
    }
    const message = ctx.draftMessage.trim();
    const attachments = ctx.cloneComposerAttachments();
    if ((!message && !attachments.length) || ctx.sending) {
        return;
    }
    const editingMessageId = ctx.editingMessageId;
    const editingMessage = editingMessageId ? ctx.getMessageById(editingMessageId) : null;
    const isEditing = !!editingMessage;
    const session = ctx.getSelectedSession();
    if (isEditing && (!session || !editingMessage)) {
        ctx.clearEditingMessage(false);
        ctx.render();
        showMessage(assistantText("原始消息不存在，无法编辑", "The original message is no longer available to edit"), 5000, "error");
        return;
    }
    const previousMessages = ctx.messages.slice();
    const messagePreview = ctx.buildUserMessagePreview(message, attachments) || assistantText("图片消息", "Image message");
    const optimisticUser = isEditing
        ? (() => {
            const nextMetadata = {...(editingMessage?.metadata || {})} as Record<string, unknown>;
            if (attachments.length) {
                nextMetadata.attachments = attachments.map((item) => ({...item}));
            } else {
                delete nextMetadata.attachments;
            }
            nextMetadata.editedAt = Date.now();
            return {
                ...editingMessage,
                content: message,
                metadata: nextMetadata,
            } as TAssistantAIMessageItem;
        })()
        : ctx.buildLocalMessage("user", messagePreview, {
            metadata: attachments.length ? {attachments} : {},
        });
    const optimisticAssistant = ctx.buildLocalMessage("assistant", assistantText("正在处理...", "Thinking..."), {
        localPending: true,
    });
    ctx.draftMessage = "";
    ctx.attachments = [];
    if (isEditing) {
        const editingIndex = previousMessages.findIndex((item) => item.id === editingMessageId);
        ctx.messages = [...previousMessages.slice(0, editingIndex), optimisticUser, optimisticAssistant];
    } else {
        ctx.messages = [...ctx.messages, optimisticUser, optimisticAssistant];
    }
    ctx.sending = true;
    ctx.render();
    ctx.scrollToBottom();
    try {
        let currentNote = null;
        let system = "";
        if (ctx.includeCurrentNote) {
            currentNote = await ctx.resolveMessageContext();
            if (currentNote) {
                system = buildAssistantNoteContext(currentNote);
            }
        }
        let partialReply = "";
        let previewTimer = 0;
        const flushOptimisticReply = () => {
            previewTimer = 0;
            optimisticAssistant.content = partialReply;
            ctx.updateMessageContent(optimisticAssistant.id, partialReply || assistantText("正在处理...", "Thinking..."));
            ctx.scrollToBottom();
        };
        const payload = {
            profileId: session?.profileId || profile.id,
            sessionId: session?.id,
            message,
            system,
            enableTools: ctx.enableTools,
            context: currentNote,
            attachments,
        };
        const result = await (isEditing
            ? editAssistantAIMessageStream({
                ...payload,
                sessionId: session!.id,
                messageId: editingMessageId,
            }, {
                onDelta: (delta) => {
                    partialReply += delta;
                    if (!previewTimer) {
                        previewTimer = window.setTimeout(flushOptimisticReply, 48);
                    }
                },
            })
            : streamAssistantAI({
                ...payload,
                mode: "chat",
                title: session?.title || truncateText(messagePreview, 30) || assistantText("新对话", "New Chat"),
            }, {
                onDelta: (delta) => {
                    partialReply += delta;
                    if (!previewTimer) {
                        previewTimer = window.setTimeout(flushOptimisticReply, 48);
                    }
                },
            }));
        if (previewTimer) {
            window.clearTimeout(previewTimer);
            flushOptimisticReply();
        }
        ctx.selectedSessionId = result.session.id;
        ctx.selectedProfileId = result.profile.id;
        ctx.messages = result.messages;
        if (isEditing) {
            ctx.clearEditingMessage(false);
        }
        ctx.syncEditingMessageState();
        ctx.upsertSession(result.session);
        await ctx.refreshAudits();
        ctx.render();
    } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        ctx.draftMessage = message;
        ctx.attachments = attachments;
        if (isEditing) {
            ctx.editingMessageId = editingMessageId;
            ctx.messages = previousMessages;
        } else {
            ctx.messages = ctx.messages.map((item) => {
                if (item.id !== optimisticAssistant.id) {
                    return item;
                }
                return {
                    ...item,
                    content: assistantText("处理失败：", "Request failed: ") + errorText,
                    localPending: false,
                    localError: true,
                };
            });
        }
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    } finally {
        ctx.sending = false;
        ctx.render();
        ctx.scrollToBottom();
    }
};

export const confirmAIDockTool = async (ctx: IAssistantAIDockRuntime, messageId: string, toolIndex: number) => {
    const session = ctx.getSelectedSession();
    const profile = ctx.getSelectedProfile();
    if (!session || !profile || !messageId || toolIndex < 0 || ctx.sending) {
        return;
    }
    const message = ctx.messages.find((item) => item.id === messageId);
    const toolResults = Array.isArray(message?.metadata?.toolResults) ? message.metadata.toolResults as Array<Record<string, unknown>> : [];
    const tool = toolResults[toolIndex];
    if (!tool || tool.executed || tool.decision !== "confirm") {
        return;
    }
    ctx.sending = true;
    ctx.render();
    try {
        const result = await confirmAssistantAITool({
            profileId: profile.id,
            sessionId: session.id,
            messageId,
            auditId: `${tool.auditId || ""}`,
            context: tool.context as never,
            toolId: `${tool.toolId || ""}`,
            args: (tool.args || {}) as Record<string, unknown>,
        });
        ctx.selectedSessionId = result.session.id;
        ctx.selectedProfileId = result.profile.id;
        ctx.messages = result.messages;
        ctx.syncEditingMessageState();
        await ctx.refreshAudits();
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    } finally {
        ctx.sending = false;
        ctx.render();
        ctx.scrollToBottom();
    }
};

export const rejectAIDockTool = async (ctx: IAssistantAIDockRuntime, messageId: string, toolIndex: number) => {
    const session = ctx.getSelectedSession();
    const profile = ctx.getSelectedProfile();
    if (!session || !profile || !messageId || toolIndex < 0 || ctx.sending) {
        return;
    }
    const message = ctx.messages.find((item) => item.id === messageId);
    const toolResults = Array.isArray(message?.metadata?.toolResults) ? message.metadata.toolResults as Array<Record<string, unknown>> : [];
    const tool = toolResults[toolIndex];
    if (!tool || tool.executed || tool.decision !== "confirm") {
        return;
    }
    ctx.sending = true;
    ctx.render();
    try {
        const result = await rejectAssistantAITool({
            profileId: profile.id,
            sessionId: session.id,
            messageId,
            auditId: `${tool.auditId || ""}`,
            toolId: `${tool.toolId || ""}`,
        });
        ctx.selectedSessionId = result.session.id;
        ctx.selectedProfileId = result.profile.id;
        ctx.messages = result.messages;
        ctx.syncEditingMessageState();
        await ctx.refreshAudits();
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    } finally {
        ctx.sending = false;
        ctx.render();
        ctx.scrollToBottom();
    }
};

export const saveAIDockTranscript = async (ctx: IAssistantAIDockRuntime) => {
    const session = ctx.getSelectedSession();
    if (!session || !ctx.messages.length) {
        return;
    }
    const title = `${session.title || assistantText("AI 对话", "AI Chat")} ${assistantText("对话记录", "Transcript")}`;
    const markdown = formatTranscriptMarkdown(title, ctx.messages.map((item) => ({
        role: item.role,
        content: item.content,
        createdAt: item.createdAt,
    })));
    const id = await saveMarkdownAsAssistantNote(title, markdown);
    if (id) {
        showMessage(assistantText("对话已保存到笔记", "Transcript saved to a note"));
    }
};

export const saveAIDockAnalysis = async (ctx: IAssistantAIDockRuntime) => {
    const session = ctx.getSelectedSession();
    const profile = ctx.getSelectedProfile();
    if (!session || !profile || !ctx.messages.length) {
        return;
    }
    try {
        const markdown = await analyzeAssistantAISession(session.id, profile.id, ASSISTANT_ANALYZE_PROMPT);
        const title = `${session.title || assistantText("AI 对话", "AI Chat")} ${assistantText("分析", "Analysis")}`;
        const id = await saveMarkdownAsAssistantNote(title, markdown);
        if (id) {
            showMessage(assistantText("分析结果已保存到笔记", "Analysis saved to a note"));
        }
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    }
};

export const insertAIDockLastReply = async (ctx: IAssistantAIDockRuntime) => {
    const reply = [...ctx.messages].reverse().find((item) => item.role === "assistant");
    if (!reply) {
        return;
    }
    const ok = await appendMarkdownToCurrentNote(reply.content);
    if (ok) {
        showMessage(window.sourceflow.languages.workbenchInserted || assistantText("已插入到当前笔记", "Inserted into current note"));
    }
};

export const scrollAIDockToBottom = (ctx: IAssistantAIDockRuntime) => {
    const container = ctx.element.querySelector(".assistant-ai__messages") as HTMLElement;
    if (!container) {
        return;
    }
    window.requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });
};
