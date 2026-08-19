import {showMessage} from "../../dialog/message";
import {writeText} from "../../protyle/util/compatibility";
import {assistantText, ASSISTANT_ANALYZE_PROMPT, buildAssistantNoteContext} from "../constants";
import {getAssistantAINoteTokenAllowance} from "./presets";
import {formatTranscriptMarkdown, saveMarkdownAsAssistantNote, appendMarkdownToCurrentNote} from "../common/note";
import {nl2br, truncateText} from "../common/dom";
import {
    analyzeAssistantAISession,
    confirmAssistantAITool,
    createAssistantAISession,
    editAssistantAIMessageStream,
    IAssistantAIInputAttachment,
    IAssistantAINoteContext,
    rejectAssistantAITool,
    streamAssistantAI,
} from "./api";
import type {IAssistantAIDockRuntime} from "./AIDockContract";
import {buildIncludedContextText, buildSourceCitationsFromMentionSources, cloneMentionSources, resolveSourcesForPrompt} from "../mentions/contextBuilder";
import {
    assistantAIComposerAttachmentLimit,
    assistantAIComposerAttachmentMaxBytes,
    assistantAIMessageCollapseCharLimit,
    assistantAIMessageCollapseLineLimit,
    readAssistantAIImageFile,
    TAssistantAIMessageItem,
} from "./AIDockShared";
import {recordAssistantExplicitSaveHistory, recordAssistantPatchFailure, recordAssistantPatchHistory} from "../history/operations";
import {applyAssistantPatch, applyAssistantPatchOperation} from "../patch/apply";
import type {IAssistantEditPatch} from "../patch/types";
import type {IAssistantSkillContext} from "../skills/types";

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
    const requestController = new AbortController();
    ctx.activeRequestController = requestController;
    ctx.userStoppedGenerating = false;
    const editingMessageId = ctx.editingMessageId;
    const editingMessage = editingMessageId ? ctx.getMessageById(editingMessageId) : null;
    const isEditing = !!editingMessage;
    let session = ctx.getSelectedSession();
    if (isEditing && (!session || !editingMessage)) {
        ctx.activeRequestController = null;
        ctx.clearEditingMessage(false);
        ctx.render();
        showMessage(assistantText("原始消息不存在，无法编辑", "The original message is no longer available to edit"), 5000, "error");
        return;
    }
    const previousMessages = ctx.messages.slice();
    const messagePreview = ctx.buildUserMessagePreview(message, attachments) || assistantText("图片消息", "Image message");
    const sourcesSnapshot = cloneMentionSources(ctx.sources);
    ctx.sending = true;
    ctx.render();
    let resolvedSourcesSnapshot = sourcesSnapshot;
    try {
        resolvedSourcesSnapshot = await resolveSourcesForPrompt(sourcesSnapshot, ctx.securityMode);
        if (requestController.signal.aborted) {
            ctx.sending = false;
            ctx.activeRequestController = null;
            ctx.userStoppedGenerating = false;
            ctx.render();
            return;
        }
        if (!session && !isEditing) {
            session = await createAssistantAISession(
                profile.id,
                ctx.conversationMode,
                truncateText(messagePreview, 30) || assistantText("新对话", "New Chat"),
            );
            ctx.selectedSessionId = session.id;
            ctx.selectedProfileId = profile.id;
            ctx.upsertSession(session);
        }
        if (requestController.signal.aborted) {
            ctx.sending = false;
            ctx.activeRequestController = null;
            ctx.userStoppedGenerating = false;
            ctx.render();
            return;
        }
    } catch (error) {
        ctx.sending = false;
        ctx.activeRequestController = null;
        if (ctx.userStoppedGenerating && requestController.signal.aborted) {
            ctx.userStoppedGenerating = false;
            ctx.render();
            showMessage(assistantText("已停止生成", "Generation stopped"));
            return;
        }
        ctx.userStoppedGenerating = false;
        ctx.render();
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        return;
    }
    const sourceCitations = buildSourceCitationsFromMentionSources(resolvedSourcesSnapshot);
    const messageMetadata: Record<string, unknown> = {};
    if (attachments.length) {
        messageMetadata.attachments = attachments.map((item) => ({...item}));
    }
    if (sourceCitations.length) {
        messageMetadata.sources = sourceCitations;
    }
    const optimisticUser = isEditing
        ? (() => {
            const nextMetadata = {...(editingMessage?.metadata || {})} as Record<string, unknown>;
            if (messageMetadata.attachments) {
                nextMetadata.attachments = messageMetadata.attachments;
            } else {
                delete nextMetadata.attachments;
            }
            if (messageMetadata.sources) {
                nextMetadata.sources = messageMetadata.sources;
            } else {
                delete nextMetadata.sources;
            }
            nextMetadata.editedAt = Date.now();
            return {
                ...editingMessage,
                content: message,
                metadata: nextMetadata,
            } as TAssistantAIMessageItem;
        })()
        : ctx.buildLocalMessage("user", messagePreview, {
            metadata: messageMetadata,
        });
    const optimisticAssistant = ctx.buildLocalMessage("assistant", assistantText("正在处理...", "Thinking..."), {
        localPending: true,
    });
    ctx.draftMessage = "";
    ctx.attachments = [];
    ctx.clearSources();
    if (isEditing) {
        const editingIndex = previousMessages.findIndex((item) => item.id === editingMessageId);
        ctx.messages = [...previousMessages.slice(0, editingIndex), optimisticUser, optimisticAssistant];
    } else {
        ctx.messages = [...ctx.messages, optimisticUser, optimisticAssistant];
    }
    ctx.render();
    ctx.scrollToBottom();
    let partialReply = "";
    let previewTimer = 0;
    const flushOptimisticReply = () => {
        previewTimer = 0;
        optimisticAssistant.content = partialReply;
        ctx.updateMessageContent(optimisticAssistant.id, partialReply || assistantText("正在处理...", "Thinking..."));
        ctx.scrollToBottom();
    };
    try {
        let currentNote = null;
        let system = "";
        if (ctx.includeCurrentNote) {
            currentNote = await ctx.resolveMessageContext();
            if (currentNote) {
                system = buildAssistantNoteContext(currentNote, getAssistantAINoteTokenAllowance(profile));
            }
        }
        if (resolvedSourcesSnapshot.length) {
            const sourceContext = buildIncludedContextText(resolvedSourcesSnapshot);
            if (sourceContext) {
                const sourceBlock = `\n\n---\n${assistantText(
                "用户引用了以下来源，回答时请基于这些来源，并在相关段落末尾标注来源笔记标题（格式：[📄 笔记标题]）：",
                "The user referenced the following sources. Answer based on these sources, and cite the source note title at the end of relevant paragraphs (format: [📄 Note Title]):"
            )}\n\n${sourceContext}`;
                system += sourceBlock;
            }
        }
        const payload = {
            profileId: session?.profileId || profile.id,
            sessionId: session?.id,
            message,
            system,
            enableTools: ctx.conversationMode === "ask" ? false : ctx.enableTools,
            securityMode: ctx.securityMode,
            context: currentNote,
            attachments,
            sources: sourceCitations,
        };
        const result = await (isEditing
            ? editAssistantAIMessageStream({
                ...payload,
                sessionId: session!.id,
                messageId: editingMessageId,
            }, {
                signal: requestController.signal,
                onDelta: (delta) => {
                    partialReply += delta;
                    if (!previewTimer) {
                        previewTimer = window.setTimeout(flushOptimisticReply, 48);
                    }
                },
            })
            : streamAssistantAI({
                ...payload,
                mode: ctx.conversationMode,
                title: session?.title || truncateText(messagePreview, 30) || assistantText("新对话", "New Chat"),
            }, {
                signal: requestController.signal,
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
        const stoppedByUser = ctx.userStoppedGenerating && requestController.signal.aborted;
        if (stoppedByUser) {
            if (previewTimer) {
                window.clearTimeout(previewTimer);
                flushOptimisticReply();
            }
            const stoppedContent = partialReply.trim() || assistantText("已停止生成。", "Generation stopped.");
            ctx.messages = ctx.messages.map((item) => {
                if (item.id !== optimisticAssistant.id) {
                    return item;
                }
                return {
                    ...item,
                    content: stoppedContent,
                    localPending: false,
                    localStopped: true,
                };
            });
            showMessage(assistantText("已停止生成", "Generation stopped"));
            return;
        }
        const errorText = error instanceof Error ? error.message : String(error);
        ctx.draftMessage = message;
        ctx.attachments = attachments;
        ctx.sources = cloneMentionSources(sourcesSnapshot);
        ctx.sourcesPanelVisible = sourcesSnapshot.length > 0;
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
        if (ctx.activeRequestController === requestController) {
            ctx.activeRequestController = null;
        }
        ctx.userStoppedGenerating = false;
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
            securityMode: ctx.securityMode,
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

const getAIDockToolResult = (ctx: IAssistantAIDockRuntime, messageId: string, toolIndex: number) => {
    const message = ctx.messages.find((item) => item.id === messageId);
    const toolResults = Array.isArray(message?.metadata?.toolResults) ? message.metadata.toolResults as Array<Record<string, unknown>> : [];
    return toolResults[toolIndex];
};

const getAIDockToolPatch = (tool: Record<string, unknown> | undefined) => {
    const data = tool?.data && typeof tool.data === "object" ? tool.data as Record<string, unknown> : {};
    const patch = (data.patch || data.previewPatch) as IAssistantEditPatch | undefined;
    return patch?.operations?.length ? patch : null;
};

const buildAIDockToolPatchContext = (tool: Record<string, unknown>): IAssistantSkillContext | null => {
    const context = tool.context && typeof tool.context === "object" ? tool.context as IAssistantAINoteContext : null;
    if (!context?.rootID) {
        return null;
    }
    const note = {
        rootID: context.rootID,
        notebook: context.notebook || "",
        path: context.path || "",
        title: context.title || assistantText("当前笔记", "Current note"),
        markdown: "",
        currentBlockID: context.currentBlockID || context.rootID,
        currentBlockType: context.currentBlockType || "d",
        currentBlockMarkdown: context.currentBlockMarkdown || "",
        selectedText: context.selectedText || "",
    };
    return {
        note,
        hasSelection: !!note.selectedText,
        selectedText: note.selectedText,
    };
};

const buildAIDockPatchHistoryMetadata = (ctx: IAssistantAIDockRuntime, context: IAssistantSkillContext | null) => ({
    sessionId: ctx.selectedSessionId,
    profileId: ctx.selectedProfileId,
    targetId: context?.note?.rootID || "",
    targetLabel: context?.note?.title || "",
});

export const applyAIDockToolPatch = async (ctx: IAssistantAIDockRuntime, messageId: string, toolIndex: number, operationId = "") => {
    if (!messageId || toolIndex < 0 || ctx.sending) {
        return;
    }
    const tool = getAIDockToolResult(ctx, messageId, toolIndex);
    const patch = getAIDockToolPatch(tool);
    const context = tool ? buildAIDockToolPatchContext(tool) : null;
    if (!tool || !patch || !context) {
        showMessage(assistantText("当前工具补丁缺少可应用的笔记上下文", "This tool patch has no applicable note context"), 5000, "error");
        return;
    }
    ctx.sending = true;
    ctx.render();
    try {
        const metadata = buildAIDockPatchHistoryMetadata(ctx, context);
        const securityOptions = {
            securityMode: ctx.securityMode,
            audit: metadata,
            onSecurityModeChange: async (mode: typeof ctx.securityMode) => {
                ctx.setSecurityMode(mode);
                ctx.render();
            },
        };
        if (operationId) {
            const operation = patch.operations.find((item) => item.id === operationId);
            if (!operation) {
                showMessage(assistantText("没有找到要应用的补丁项", "Patch operation not found"), 4000, "error");
                return;
            }
            if (await applyAssistantPatchOperation(patch, operation, context, securityOptions)) {
                recordAssistantPatchHistory(patch, metadata);
            } else {
                recordAssistantPatchFailure(patch, assistantText("应用工具补丁失败", "Failed to apply tool patch"), metadata);
            }
            return;
        }
        if (await applyAssistantPatch(patch, context, securityOptions)) {
            recordAssistantPatchHistory(patch, metadata);
        } else {
            recordAssistantPatchFailure(patch, assistantText("应用工具补丁失败", "Failed to apply tool patch"), metadata);
        }
    } catch (error) {
        recordAssistantPatchFailure(patch, error instanceof Error ? error.message : String(error), buildAIDockPatchHistoryMetadata(ctx, context));
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    } finally {
        ctx.sending = false;
        ctx.render();
    }
};

export const rejectAIDockToolPatch = (ctx: IAssistantAIDockRuntime, messageId: string, toolIndex: number, operationId = "") => {
    const patch = getAIDockToolPatch(getAIDockToolResult(ctx, messageId, toolIndex));
    if (!patch) {
        return;
    }
    patch.operations.forEach((operation) => {
        if ((operation.status || "pending") !== "pending") {
            return;
        }
        if (!operationId || operation.id === operationId) {
            operation.status = "rejected";
        }
    });
    ctx.render();
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
        recordAssistantExplicitSaveHistory({
            source: "dock",
            summary: title,
            noteId: id,
            targetLabel: title,
            sessionId: session.id,
            profileId: session.profileId,
            markdown,
        });
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
            recordAssistantExplicitSaveHistory({
                source: "dock",
                summary: title,
                noteId: id,
                targetLabel: title,
                sessionId: session.id,
                profileId: profile.id,
                markdown,
            });
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
