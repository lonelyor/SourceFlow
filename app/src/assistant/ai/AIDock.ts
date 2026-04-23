import {App} from "../../index";
import {openSettingTab} from "../../config";
import {Custom} from "../../layout/dock/Custom";
import {getDockByType} from "../../layout/tabUtil";
import {confirmDialog} from "../../dialog/confirmDialog";
import {showMessage} from "../../dialog/message";
import {assistantText, ASSISTANT_AI_DOCK_TYPE, ASSISTANT_ANALYZE_PROMPT, buildAssistantNoteContext} from "../constants";
import {escapeAttr, escapeHTML, formatDateTime, nl2br, panelEmptyHTML, providerDisplayName, truncateText} from "../common/dom";
import {
    appendMarkdownToCurrentNote,
    formatTranscriptMarkdown,
    getAssistantNoteContextByRootID,
    getCurrentNoteContext,
    IAssistantNoteCandidate,
    saveMarkdownAsAssistantNote,
    searchAssistantNoteCandidates,
} from "../common/note";
import {
    analyzeAssistantAISession,
    clearAllAssistantAISessions,
    clearAssistantAISession,
    createAssistantAISession,
    deleteAssistantAISession,
    getAssistantAISessionMessages,
    IAssistantAIInputAttachment,
    IAssistantAIMessage,
    IAssistantAIProfile,
    IAssistantAIProviderType,
    IAssistantAISession,
    IAssistantAIToolAudit,
    IAssistantAIToolDefinition,
    IAssistantAIToolPolicy,
    listAssistantAIProfiles,
    listAssistantAIProviders,
    listAssistantAISessions,
    listAssistantAIToolAudits,
    getAssistantAIToolCatalog,
    confirmAssistantAITool,
    editAssistantAIMessageStream,
    renameAssistantAISession,
    saveAssistantAIProfile,
    streamAssistantAI,
} from "./api";
import {writeText} from "../../protyle/util/compatibility";

type TAssistantAIMessageItem = IAssistantAIMessage & {
    localPending?: boolean;
    localError?: boolean;
};

type TAssistantAIFloatingPanel = "" | "target" | "context" | "audit" | "profiles" | "tools" | "session";

const assistantAIToolReadScopeOptions = [
    {value: "current-note", label: assistantText("当前笔记", "Current note")},
    {value: "current-notebook", label: assistantText("当前笔记本", "Current notebook")},
    {value: "workspace", label: assistantText("整个工作区", "Workspace")},
];

const assistantAIToolWriteScopeOptions = [
    {value: "current-note", label: assistantText("仅当前笔记", "Current note only")},
    {value: "current-notebook", label: assistantText("当前笔记本", "Current notebook")},
    {value: "workspace", label: assistantText("整个工作区", "Workspace")},
];

const assistantAIToolTraceOptions = [
    {value: "audit-only", label: assistantText("仅内部审计", "Audit only")},
    {value: "markdown", label: assistantText("正文留痕 + 审计", "Markdown trace + audit")},
];

const assistantAIToolRiskOrder = ["L1", "L2", "L3", "L4"];
const assistantAIComposerAttachmentLimit = 6;
const assistantAIComposerAttachmentMaxBytes = 8 * 1024 * 1024;
const assistantAIMessageCollapseCharLimit = 220;
const assistantAIMessageCollapseLineLimit = 6;

const renderSelectOptions = (options: Array<{value: string, label: string}>, selected: string) => {
    return options.map((item) => `<option value="${escapeAttr(item.value)}"${item.value === selected ? " selected" : ""}>${escapeHTML(item.label)}</option>`).join("");
};

const readAssistantAIImageFile = (file: File) => {
    return new Promise<IAssistantAIInputAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataURL = `${reader.result || ""}`;
            const commaIndex = dataURL.indexOf(",");
            resolve({
                id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name || "image",
                mimeType: file.type || "image/png",
                data: commaIndex > -1 ? dataURL.slice(commaIndex + 1) : dataURL,
            });
        };
        reader.onerror = () => {
            reject(reader.error || new Error(assistantText("读取图片失败", "Failed to read the image")));
        };
        reader.readAsDataURL(file);
    });
};

const getAssistantAIAttachmentDataURL = (attachment: IAssistantAIInputAttachment) => {
    return `data:${attachment.mimeType};base64,${attachment.data}`;
};

const getImageFilesFromDataTransfer = (dataTransfer: DataTransfer | null | undefined) => {
    if (!dataTransfer?.files?.length) {
        return [] as File[];
    }
    return Array.from(dataTransfer.files).filter((file) => file.type.startsWith("image/"));
};

const getStringSetting = (settings: Record<string, unknown> | undefined, key: string, fallback: string) => {
    const raw = settings?.[key];
    const value = `${raw ?? ""}`.trim();
    return value || fallback;
};

const cloneToolModes = (settings?: Record<string, unknown>) => {
    const raw = settings?.toolModes;
    if (!raw || typeof raw !== "object") {
        return {};
    }
    return {...(raw as Record<string, string>)};
};

const cloneProfileToolSettings = (settings?: Record<string, unknown>) => {
    return {
        ...settings,
        toolReadScope: getStringSetting(settings, "toolReadScope", "workspace"),
        toolWriteScope: getStringSetting(settings, "toolWriteScope", "current-notebook"),
        toolTraceMode: getStringSetting(settings, "toolTraceMode", "audit-only"),
        toolModes: cloneToolModes(settings),
    };
};

const getToolRiskLabel = (risk: string) => {
    switch (risk) {
        case "L1":
            return assistantText("L1 只读", "L1 Read only");
        case "L2":
            return assistantText("L2 低风险写入", "L2 Low-risk write");
        case "L3":
            return assistantText("L3 中风险写入", "L3 Medium-risk write");
        case "L4":
            return assistantText("L4 高风险操作", "L4 High-risk action");
        default:
            return risk;
    }
};

const getToolTargetLabel = (target: string) => {
    switch (target) {
        case "current-note":
            return assistantText("当前笔记", "Current note");
        case "current-notebook":
            return assistantText("当前笔记本", "Current notebook");
        case "workspace":
            return assistantText("工作区", "Workspace");
        default:
            return target;
    }
};

class AssistantAIDock {
    private readonly app: App;
    private readonly custom: Custom;
    private readonly element: HTMLElement;
    private providers: IAssistantAIProviderType[] = [];
    private profiles: IAssistantAIProfile[] = [];
    private sessions: IAssistantAISession[] = [];
    private messages: TAssistantAIMessageItem[] = [];
    private toolCatalog: IAssistantAIToolDefinition[] = [];
    private toolPolicy: IAssistantAIToolPolicy | null = null;
    private audits: IAssistantAIToolAudit[] = [];
    private currentNotePreview: Awaited<ReturnType<typeof getCurrentNoteContext>> = null;
    private pinnedNotePreview: Awaited<ReturnType<typeof getCurrentNoteContext>> = null;
    private selectedSessionId = "";
    private selectedProfileId = "";
    private includeCurrentNote = true;
    private enableTools = false;
    private draftMessage = "";
    private attachments: IAssistantAIInputAttachment[] = [];
    private noteSearchKeyword = "";
    private noteSearchResults: IAssistantNoteCandidate[] = [];
    private noteSearchLoading = false;
    private noteSearchSeq = 0;
    private activePanel: TAssistantAIFloatingPanel = "";
    private sessionsCollapsed = true;
    private loading = false;
    private sending = false;
    private savingProfile = false;
    private expandedMessageIds = new Set<string>();
    private editingMessageId = "";
    private draftBackup = "";
    private attachmentsBackup: IAssistantAIInputAttachment[] | null = null;

    constructor(custom: Custom, app: App) {
        this.app = app;
        this.custom = custom;
        this.element = custom.element as HTMLElement;
        this.element.classList.add("assistant-dock", "assistant-dock--ai", "fn__flex-column");
        this.bindEvents();
        void this.refresh(true);
        void this.refreshContextPreview();
    }

    public destroy() {
        this.element.innerHTML = "";
    }

    public resize() {
        this.scrollToBottom();
    }

    public update() {
        void this.refresh(false);
        if (this.includeCurrentNote && !this.pinnedNotePreview) {
            void this.refreshContextPreview();
        }
    }

    public open(options: {
        message?: string,
        includeCurrentNote?: boolean,
        append?: boolean,
        pinCurrentNote?: boolean,
        clearTarget?: boolean,
        sessionId?: string,
    } = {}) {
        this.activePanel = "";
        if (options.clearTarget) {
            this.resetTargetSelection(false);
        } else if (options.pinCurrentNote) {
            this.resetTargetSelection(true);
        } else if (typeof options.includeCurrentNote === "boolean") {
            this.resetTargetSelection(options.includeCurrentNote);
        } else {
            this.resetTargetSelection(true);
        }
        if (`${options.sessionId || ""}`.trim() && options.sessionId !== this.selectedSessionId) {
            this.selectedSessionId = options.sessionId;
            void this.refresh(true);
        }
        const nextMessage = `${options.message || ""}`.trim();
        if (nextMessage) {
            this.draftMessage = options.append && this.draftMessage.trim()
                ? `${this.draftMessage.trim()}\n${nextMessage}`
                : nextMessage;
        }
        this.render();
        this.focusComposer();
        void this.refreshContextPreview();
        if (options.pinCurrentNote) {
            void this.pinCurrentNoteAsTarget();
        }
    }

    private bindEvents() {
        this.element.addEventListener("click", (event: MouseEvent) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.element)) {
                const noteRootID = target.getAttribute("data-note-root-id");
                if (noteRootID) {
                    void this.selectTargetNote(noteRootID);
                    event.preventDefault();
                    return;
                }
                const profileId = target.getAttribute("data-profile-id");
                if (profileId) {
                    void this.switchProfile(profileId);
                    event.preventDefault();
                    return;
                }
                if (target.getAttribute("data-action") === "confirm-tool") {
                    const messageId = target.getAttribute("data-message-id") || "";
                    const toolIndex = parseInt(target.getAttribute("data-tool-index") || "-1");
                    void this.confirmTool(messageId, toolIndex);
                    event.preventDefault();
                    return;
                }
                const sessionId = target.getAttribute("data-session-id");
                if (sessionId) {
                    this.activePanel = "";
                    void this.selectSession(sessionId);
                    event.preventDefault();
                    return;
                }
                const action = target.getAttribute("data-action");
                if (action) {
                    if (action === "remove-attachment") {
                        this.removeComposerAttachment(target.getAttribute("data-attachment-id") || "");
                        event.preventDefault();
                        return;
                    }
                    if (action === "toggle-panel") {
                        this.toggleFloatingPanel((target.getAttribute("data-panel") || "") as TAssistantAIFloatingPanel);
                        event.preventDefault();
                        return;
                    }
                    void this.handleAction(action, target);
                    event.preventDefault();
                    return;
                }
                target = target.parentElement;
            }
        });

        this.element.addEventListener("input", (event: Event) => {
            const target = event.target as HTMLInputElement | HTMLTextAreaElement;
            const role = target.getAttribute("data-role");
            if (role === "message") {
                this.draftMessage = target.value;
                return;
            }
            if (role === "note-search") {
                this.noteSearchKeyword = target.value;
                void this.searchTargetNotes(this.noteSearchKeyword);
                return;
            }
            if (role === "message-attachments" && target instanceof HTMLInputElement && target.files?.length) {
                void this.addComposerAttachments(Array.from(target.files));
                target.value = "";
                return;
            }
            if (role === "profile") {
                this.selectedProfileId = target.value;
                void this.refreshToolCatalog(this.selectedProfileId);
            }
        });

        this.element.addEventListener("change", (event: Event) => {
            const target = event.target as HTMLInputElement | HTMLSelectElement;
            const role = target.getAttribute("data-role");
            if (role === "profile") {
                this.selectedProfileId = target.value;
                void this.refreshToolCatalog(this.selectedProfileId);
                return;
            }
            const policy = target.getAttribute("data-policy");
            if (policy) {
                void this.updateToolPolicyField(policy, target.value);
                return;
            }
            const toolToggle = target.getAttribute("data-tool-toggle");
            if (toolToggle && target instanceof HTMLInputElement) {
                void this.toggleToolEnabled(toolToggle, target.checked);
                return;
            }
            if (role === "include-current-note" && target instanceof HTMLInputElement) {
                if (target.checked) {
                    void this.followCurrentNote();
                } else {
                    this.clearTargetNote();
                }
                return;
            }
            if (role === "enable-tools" && target instanceof HTMLInputElement) {
                this.enableTools = target.checked;
            }
        });

        this.element.addEventListener("keydown", (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (target.getAttribute("data-role") === "message" && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                void this.sendMessage();
                return;
            }
            if (target.getAttribute("data-role") === "message" && event.key === "Escape") {
                event.preventDefault();
                if (this.editingMessageId) {
                    this.clearEditingMessage(true);
                    this.render();
                    this.focusComposer();
                    return;
                }
                target.blur();
                return;
            }
            if (target.getAttribute("data-role") === "note-search" && event.key === "Enter" && !event.isComposing) {
                const first = this.noteSearchResults[0];
                if (!first) {
                    return;
                }
                event.preventDefault();
                void this.selectTargetNote(first.rootID);
                return;
            }
            if (target.getAttribute("data-role") === "note-search" && event.key === "Escape") {
                event.preventDefault();
                this.noteSearchKeyword = "";
                this.noteSearchResults = [];
                this.noteSearchLoading = false;
                this.render();
                return;
            }
            if (event.key === "Escape" && !this.sessionsCollapsed) {
                event.preventDefault();
                this.sessionsCollapsed = true;
                this.render();
                return;
            }
            if (event.key === "Escape" && this.activePanel) {
                event.preventDefault();
                this.activePanel = "";
                this.render();
            }
        });

        this.element.addEventListener("paste", (event: ClipboardEvent) => {
            const target = event.target as HTMLElement;
            if (target.getAttribute("data-role") !== "message") {
                return;
            }
            const files = getImageFilesFromDataTransfer(event.clipboardData);
            if (!files.length) {
                return;
            }
            const text = event.clipboardData?.getData("text/plain") || "";
            if (!text.trim()) {
                event.preventDefault();
            }
            void this.addComposerAttachments(files);
        });

        this.element.addEventListener("dragover", (event: DragEvent) => {
            const target = event.target as HTMLElement;
            if (!target?.closest(".assistant-ai__composer-card")) {
                return;
            }
            const files = getImageFilesFromDataTransfer(event.dataTransfer);
            if (!files.length) {
                return;
            }
            event.preventDefault();
            this.setComposerDropActive(true);
        });

        this.element.addEventListener("dragleave", (event: DragEvent) => {
            const target = event.target as HTMLElement;
            if (!target?.closest(".assistant-ai__composer-card")) {
                return;
            }
            this.setComposerDropActive(false);
        });

        this.element.addEventListener("drop", (event: DragEvent) => {
            const target = event.target as HTMLElement;
            if (!target?.closest(".assistant-ai__composer-card")) {
                return;
            }
            const files = getImageFilesFromDataTransfer(event.dataTransfer);
            this.setComposerDropActive(false);
            if (!files.length) {
                return;
            }
            event.preventDefault();
            void this.addComposerAttachments(files);
        });
    }

    private focusComposer() {
        const textarea = this.element.querySelector("[data-role='message']") as HTMLTextAreaElement;
        if (!textarea) {
            return;
        }
        window.requestAnimationFrame(() => {
            textarea.focus();
            const length = textarea.value.length;
            textarea.setSelectionRange(length, length);
        });
    }

    private setComposerDropActive(active: boolean) {
        const composer = this.element.querySelector(".assistant-ai__composer-card") as HTMLElement;
        composer?.classList.toggle("assistant-ai__composer-card--drop", active);
    }

    private getEffectiveContextPreview() {
        if (!this.includeCurrentNote) {
            return null;
        }
        return this.pinnedNotePreview || this.currentNotePreview;
    }

    private buildLocalMessage(role: "assistant" | "user", content: string, extra: Partial<TAssistantAIMessageItem> = {}): TAssistantAIMessageItem {
        return {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sessionId: this.selectedSessionId,
            role,
            content,
            providerMessageId: "",
            inputTokens: 0,
            outputTokens: 0,
            metadata: {},
            createdAt: Date.now(),
            ...extra,
        };
    }

    private cloneComposerAttachments() {
        return this.attachments.map((item) => ({...item}));
    }

    private getAttachmentSummary(count: number) {
        if (count < 1) {
            return "";
        }
        return assistantText(`已附带 ${count} 张图片`, `${count} image${count > 1 ? "s" : ""} attached`);
    }

    private buildUserMessagePreview(message: string, attachments: IAssistantAIInputAttachment[]) {
        const normalizedMessage = `${message || ""}`.trim();
        if (normalizedMessage) {
            return normalizedMessage;
        }
        return this.getAttachmentSummary(attachments.length);
    }

    private getMessageById(messageId: string) {
        return this.messages.find((item) => item.id === messageId);
    }

    private isMessageExpandable(item: TAssistantAIMessageItem) {
        if (!item || item.role !== "user") {
            return false;
        }
        const content = `${item.content || ""}`.trim();
        if (!content) {
            return false;
        }
        return Array.from(content).length > assistantAIMessageCollapseCharLimit || content.split(/\r?\n/).length > assistantAIMessageCollapseLineLimit;
    }

    private isMessageExpanded(messageId: string) {
        return this.expandedMessageIds.has(messageId);
    }

    private toggleMessageExpanded(messageId: string) {
        if (!messageId) {
            return;
        }
        if (this.expandedMessageIds.has(messageId)) {
            this.expandedMessageIds.delete(messageId);
        } else {
            this.expandedMessageIds.add(messageId);
        }
        this.render();
    }

    private buildCollapsedMessageContent(content: string) {
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
    }

    private getMessageDisplayContent(item: TAssistantAIMessageItem, attachments: IAssistantAIInputAttachment[]) {
        const fullContent = `${item.content || ""}`.trim();
        if (!fullContent) {
            return this.getAttachmentSummary(attachments.length);
        }
        if (this.isMessageExpandable(item) && !this.isMessageExpanded(item.id)) {
            return this.buildCollapsedMessageContent(fullContent);
        }
        return fullContent;
    }

    private buildMessageCopyText(item: TAssistantAIMessageItem) {
        const content = `${item.content || ""}`.trim();
        const attachments = this.getMessageAttachments(item);
        if (!attachments.length) {
            return content;
        }
        const lines = content ? [content, ""] : [];
        lines.push(assistantText(`图片 ${attachments.length} 张`, `Images ${attachments.length}`));
        attachments.forEach((attachment, index) => {
            lines.push(`${index + 1}. ${attachment.name || assistantText("未命名图片", "Untitled image")}`);
        });
        return lines.join("\n").trim();
    }

    private copyMessage(messageId: string) {
        const message = this.getMessageById(messageId);
        if (!message) {
            return;
        }
        const text = this.buildMessageCopyText(message);
        if (!text) {
            return;
        }
        writeText(text);
        showMessage(assistantText("消息已复制", "Message copied"));
    }

    private clearEditingMessage(restoreComposer: boolean) {
        const backupAttachments = this.attachmentsBackup?.map((item) => ({...item})) || [];
        this.editingMessageId = "";
        if (restoreComposer) {
            this.draftMessage = this.draftBackup;
            this.attachments = backupAttachments;
        }
        this.draftBackup = "";
        this.attachmentsBackup = null;
    }

    private startEditingMessage(messageId: string) {
        const message = this.getMessageById(messageId);
        if (!message || message.role !== "user") {
            return;
        }
        if (!this.editingMessageId) {
            this.draftBackup = this.draftMessage;
            this.attachmentsBackup = this.cloneComposerAttachments();
        }
        this.editingMessageId = message.id;
        this.expandedMessageIds.add(message.id);
        this.draftMessage = `${message.content || ""}`.trim();
        this.attachments = this.getMessageAttachments(message).map((item) => ({...item}));
        this.render();
        this.focusComposer();
    }

    private syncEditingMessageState() {
        if (this.editingMessageId && !this.getMessageById(this.editingMessageId)) {
            this.clearEditingMessage(false);
        }
    }

    private getMessageAttachments(item: TAssistantAIMessageItem) {
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
    }

    private removeComposerAttachment(id: string) {
        if (!id) {
            return;
        }
        this.attachments = this.attachments.filter((item) => item.id !== id);
        this.render();
        this.focusComposer();
    }

    private async addComposerAttachments(files: File[]) {
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
            const availableCount = Math.max(assistantAIComposerAttachmentLimit - this.attachments.length, 0);
            if (availableCount < 1) {
                showMessage(assistantText("最多同时附带 6 张图片", "You can attach up to 6 images at a time"), 4000, "error");
                return;
            }
            const loaded = await Promise.all(nextFiles.slice(0, availableCount).map((file) => readAssistantAIImageFile(file)));
            this.attachments = this.attachments.concat(loaded);
            if (nextFiles.length > availableCount) {
                showMessage(assistantText("图片数量已超出上限，其余图片未加入", "Some images were skipped because the attachment limit was reached"), 4000, "error");
            }
            this.render();
            this.focusComposer();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        }
    }

    private openComposerAttachmentPicker() {
        const input = this.element.querySelector("[data-role='message-attachments']") as HTMLInputElement;
        input?.click();
    }

    private upsertSession(session: IAssistantAISession) {
        const nextSessions = this.sessions.filter((item) => item.id !== session.id);
        nextSessions.unshift(session);
        this.sessions = nextSessions.sort((left, right) => (right.updatedAt || right.createdAt) - (left.updatedAt || left.createdAt));
    }

    private updateMessageContent(messageId: string, content: string) {
        const element = this.element.querySelector(`.assistant-ai__message[data-message-id="${messageId}"] .assistant-ai__message-content`) as HTMLElement;
        if (element) {
            element.innerHTML = nl2br(content);
        }
    }

    private async resolveMessageContext() {
        if (!this.includeCurrentNote) {
            return null;
        }
        if (this.pinnedNotePreview?.rootID) {
            const refreshed = await getAssistantNoteContextByRootID(this.pinnedNotePreview.rootID);
            if (refreshed) {
                this.pinnedNotePreview = refreshed;
                return refreshed;
            }
            return this.pinnedNotePreview;
        }
        const current = await getCurrentNoteContext();
        if (current) {
            this.currentNotePreview = current;
        }
        return current;
    }

    private async pinCurrentNoteAsTarget() {
        const current = await getCurrentNoteContext() || this.currentNotePreview;
        if (!current) {
            showMessage(assistantText("当前没有可固定的活动笔记", "No active note is available to pin"), 3000, "error");
            return;
        }
        this.includeCurrentNote = true;
        this.currentNotePreview = current;
        this.pinnedNotePreview = current;
        this.noteSearchKeyword = "";
        this.noteSearchResults = [];
        this.noteSearchLoading = false;
        this.activePanel = "";
        this.render();
    }

    private resetTargetSelection(includeCurrentNote: boolean) {
        this.includeCurrentNote = includeCurrentNote;
        this.pinnedNotePreview = null;
        this.noteSearchKeyword = "";
        this.noteSearchResults = [];
        this.noteSearchLoading = false;
    }

    private async followCurrentNote() {
        this.resetTargetSelection(true);
        this.activePanel = "";
        await this.refreshContextPreview();
    }

    private clearTargetNote() {
        this.resetTargetSelection(false);
        this.activePanel = "";
        this.render();
    }

    private toggleFloatingPanel(panel: TAssistantAIFloatingPanel) {
        this.sessionsCollapsed = true;
        this.activePanel = this.activePanel === panel ? "" : panel;
        this.render();
    }

    private getSelectedProfileToolSettings(profile = this.getSelectedProfile()) {
        return cloneProfileToolSettings(profile?.settings as Record<string, unknown> | undefined);
    }

    private getDefaultToolMode(tool: IAssistantAIToolDefinition) {
        if (tool.category === "read" || tool.risk === "L1") {
            return "auto";
        }
        return "confirm";
    }

    private async saveSelectedProfileSettings(mutator: (settings: Record<string, unknown>, profile: IAssistantAIProfile) => void) {
        const profile = this.getSelectedProfile();
        if (!profile || this.savingProfile) {
            return;
        }
        const settings = this.getSelectedProfileToolSettings(profile);
        mutator(settings, profile);
        this.savingProfile = true;
        this.render();
        try {
            const saved = await saveAssistantAIProfile({
                ...profile,
                settings,
            });
            this.profiles = this.profiles.map((item) => item.id === saved.id ? saved : item);
            this.selectedProfileId = saved.id;
            await this.refreshToolCatalog(saved.id);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        } finally {
            this.savingProfile = false;
            this.render();
        }
    }

    private async updateToolPolicyField(field: string, value: string) {
        await this.saveSelectedProfileSettings((settings) => {
            settings[field] = value;
        });
    }

    private async toggleToolEnabled(toolId: string, enabled: boolean) {
        const tool = this.toolCatalog.find((item) => item.id === toolId);
        if (!tool) {
            return;
        }
        await this.saveSelectedProfileSettings((settings) => {
            const toolModes = cloneToolModes(settings);
            toolModes[toolId] = enabled ? (toolModes[toolId] && toolModes[toolId] !== "deny" ? toolModes[toolId] : this.getDefaultToolMode(tool)) : "deny";
            settings.toolModes = toolModes;
        });
    }

    private async applyToolPolicyPreset(mode: "recommended" | "readonly" | "confirm-write") {
        await this.saveSelectedProfileSettings((settings) => {
            const toolModes: Record<string, string> = {};
            this.toolCatalog.forEach((tool) => {
                if (mode === "readonly") {
                    toolModes[tool.id] = tool.category === "read" ? "auto" : "deny";
                    return;
                }
                if (mode === "confirm-write") {
                    toolModes[tool.id] = tool.category === "read" ? "auto" : "confirm";
                    return;
                }
                toolModes[tool.id] = this.getDefaultToolMode(tool);
                if (tool.risk === "L2") {
                    toolModes[tool.id] = "confirm";
                } else if (tool.risk === "L3" || tool.risk === "L4") {
                    toolModes[tool.id] = "deny";
                }
            });
            settings.toolModes = toolModes;
        });
    }

    private async switchProfile(profileId: string) {
        if (!profileId) {
            return;
        }
        if (profileId === this.selectedProfileId) {
            this.activePanel = "";
            this.render();
            this.focusComposer();
            return;
        }
        this.selectedProfileId = profileId;
        this.selectedSessionId = "";
        this.messages = [];
        this.activePanel = "";
        await this.refreshToolCatalog(profileId);
        void this.refreshAudits();
        this.render();
        this.focusComposer();
    }

    private async searchTargetNotes(keyword: string) {
        const normalizedKeyword = `${keyword || ""}`.trim();
        const currentSeq = ++this.noteSearchSeq;
        if (!normalizedKeyword) {
            this.noteSearchLoading = false;
            this.noteSearchResults = [];
            this.render();
            return;
        }
        this.noteSearchLoading = true;
        this.render();
        try {
            const results = await searchAssistantNoteCandidates(normalizedKeyword, 12);
            if (currentSeq !== this.noteSearchSeq) {
                return;
            }
            this.noteSearchResults = results;
        } catch (error) {
            if (currentSeq !== this.noteSearchSeq) {
                return;
            }
            this.noteSearchResults = [];
        } finally {
            if (currentSeq === this.noteSearchSeq) {
                this.noteSearchLoading = false;
                this.render();
            }
        }
    }

    private async selectTargetNote(rootID: string) {
        const note = await getAssistantNoteContextByRootID(rootID);
        if (!note) {
            showMessage(assistantText("读取目标笔记失败，请重试", "Failed to read the target note"), 3000, "error");
            return;
        }
        this.includeCurrentNote = true;
        this.pinnedNotePreview = note;
        this.noteSearchKeyword = "";
        this.noteSearchResults = [];
        this.noteSearchLoading = false;
        this.activePanel = "";
        this.render();
    }

    private async handleAction(action: string, target?: HTMLElement) {
        const messageId = target?.getAttribute("data-message-id") || target?.closest<HTMLElement>(".assistant-ai__message")?.getAttribute("data-message-id") || "";
        switch (action) {
            case "open-profiles":
            case "configure-profile":
                this.activePanel = "";
                this.sessionsCollapsed = true;
                this.render();
                openSettingTab(this.app, "AI");
                return;
            case "new-session":
                await this.createSession();
                return;
            case "dismiss-sessions":
                this.sessionsCollapsed = true;
                this.render();
                return;
            case "toggle-sessions":
                if (this.sessionsCollapsed) {
                    this.activePanel = "";
                }
                this.sessionsCollapsed = !this.sessionsCollapsed;
                this.render();
                return;
            case "rename-session":
                this.activePanel = "";
                this.render();
                await this.renameCurrentSession();
                return;
            case "clear-session":
                this.activePanel = "";
                this.render();
                await this.clearCurrentSession();
                return;
            case "delete-session":
                this.activePanel = "";
                this.render();
                await this.deleteCurrentSession();
                return;
            case "clear-all-sessions":
                await this.clearAllSessions();
                return;
            case "save-transcript":
                await this.saveTranscript();
                return;
            case "analyze-session":
                await this.saveAnalysis();
                return;
            case "insert-last-reply":
                await this.insertLastReply();
                return;
            case "refresh-audits":
                await this.refreshAudits();
                return;
            case "pin-current-note":
                await this.pinCurrentNoteAsTarget();
                return;
            case "follow-current-note":
                await this.followCurrentNote();
                return;
            case "clear-target-note":
                this.clearTargetNote();
                return;
            case "tool-policy-recommended":
                await this.applyToolPolicyPreset("recommended");
                return;
            case "tool-policy-readonly":
                await this.applyToolPolicyPreset("readonly");
                return;
            case "tool-policy-confirm-write":
                await this.applyToolPolicyPreset("confirm-write");
                return;
            case "pick-attachments":
                this.openComposerAttachmentPicker();
                return;
            case "copy-message":
                this.copyMessage(messageId);
                return;
            case "edit-message":
                this.startEditingMessage(messageId);
                return;
            case "cancel-edit-message":
                this.clearEditingMessage(true);
                this.render();
                this.focusComposer();
                return;
            case "toggle-message-expand":
                this.toggleMessageExpanded(messageId);
                return;
            case "send-message":
                await this.sendMessage();
                return;
            default:
                return;
        }
    }

    private async refresh(loadMessages: boolean) {
        this.loading = true;
        this.render();
        try {
            const [providers, profiles, sessions] = await Promise.all([
                listAssistantAIProviders(),
                listAssistantAIProfiles(),
                listAssistantAISessions(),
            ]);
            this.providers = providers;
            this.profiles = profiles;
            this.sessions = sessions;
            this.ensureSelection();
            await Promise.all([
                this.refreshToolCatalog(this.selectedProfileId),
                this.refreshAudits(),
            ]);
            if (loadMessages && this.selectedSessionId) {
                this.messages = await getAssistantAISessionMessages(this.selectedSessionId);
            } else if (!this.selectedSessionId) {
                this.messages = [];
            }
            this.syncEditingMessageState();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        } finally {
            this.loading = false;
            this.render();
            this.scrollToBottom();
        }
    }

    private ensureSelection() {
        if (!this.profiles.length) {
            this.selectedProfileId = "";
            this.selectedSessionId = "";
            return;
        }
        const defaultProfile = this.profiles.find((item) => item.isDefault) || this.profiles[0];
        if (!this.selectedProfileId || !this.profiles.find((item) => item.id === this.selectedProfileId)) {
            this.selectedProfileId = defaultProfile?.id || "";
        }
        if (this.selectedSessionId) {
            const session = this.sessions.find((item) => item.id === this.selectedSessionId);
            if (session) {
                this.selectedProfileId = session.profileId || this.selectedProfileId;
                return;
            }
        }
        this.selectedSessionId = this.sessions[0]?.id || "";
        if (this.selectedSessionId) {
            this.selectedProfileId = this.sessions[0].profileId || this.selectedProfileId;
        }
    }

    private getSelectedSession() {
        return this.sessions.find((item) => item.id === this.selectedSessionId);
    }

    private getSelectedProfile() {
        const session = this.getSelectedSession();
        if (session?.profileId) {
            return this.profiles.find((item) => item.id === session.profileId) || this.profiles.find((item) => item.id === this.selectedProfileId);
        }
        return this.profiles.find((item) => item.id === this.selectedProfileId) || this.profiles[0];
    }

    private async selectSession(sessionId: string) {
        if (!sessionId) {
            return;
        }
        if (sessionId === this.selectedSessionId) {
            if (!this.sessionsCollapsed) {
                this.sessionsCollapsed = true;
                this.activePanel = "";
                this.render();
            }
            return;
        }
        this.clearEditingMessage(false);
        this.selectedSessionId = sessionId;
        this.sessionsCollapsed = true;
        this.activePanel = "";
        const session = this.getSelectedSession();
        if (session?.profileId) {
            this.selectedProfileId = session.profileId;
        }
        this.render();
        try {
            const [messages] = await Promise.all([
                getAssistantAISessionMessages(sessionId),
                this.refreshToolCatalog(this.selectedProfileId),
                this.refreshAudits(),
            ]);
            this.messages = messages;
            this.syncEditingMessageState();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        }
        this.render();
        this.scrollToBottom();
    }

    private async refreshToolCatalog(profileId: string) {
        if (!profileId && !this.profiles.length) {
            this.toolCatalog = [];
            this.toolPolicy = null;
            return;
        }
        try {
            const catalog = await getAssistantAIToolCatalog(profileId || this.profiles.find((item) => item.isDefault)?.id || this.profiles[0]?.id || "");
            this.toolCatalog = catalog.tools || [];
            this.toolPolicy = catalog.policy || null;
        } catch (error) {
            this.toolCatalog = [];
            this.toolPolicy = null;
        }
        this.render();
    }

    private async refreshAudits() {
        try {
            this.audits = await listAssistantAIToolAudits({
                sessionId: this.selectedSessionId,
                profileId: this.selectedProfileId,
                limit: 8,
            });
        } catch (error) {
            this.audits = [];
        }
        this.render();
    }

    private async refreshContextPreview() {
        if (!this.includeCurrentNote) {
            this.render();
            return;
        }
        try {
            this.currentNotePreview = await getCurrentNoteContext();
        } catch (error) {
            this.currentNotePreview = null;
        }
        this.render();
    }

    private async createSession() {
        const profile = this.profiles.find((item) => item.id === this.selectedProfileId) || this.profiles[0];
        if (!profile) {
            showMessage(assistantText("请先配置至少一个 AI 提供商", "Configure at least one AI profile first"), 5000, "error");
            await this.handleAction("open-profiles");
            return;
        }
        try {
            const session = await createAssistantAISession(profile.id, "chat", "");
            this.activePanel = "";
            this.sessionsCollapsed = true;
            this.selectedSessionId = session.id;
            this.selectedProfileId = profile.id;
            this.clearEditingMessage(false);
            this.messages = [];
            await this.refresh(false);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        }
    }

    private async renameCurrentSession() {
        const session = this.getSelectedSession();
        if (!session) {
            return;
        }
        const nextTitle = window.prompt(assistantText("重命名会话", "Rename session"), session.title || "")?.trim();
        if (!nextTitle || nextTitle === session.title) {
            return;
        }
        try {
            await renameAssistantAISession(session.id, nextTitle);
            await this.refresh(false);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        }
    }

    private async clearCurrentSession() {
        const session = this.getSelectedSession();
        if (!session) {
            return;
        }
        confirmDialog(window.sourceflow.languages.clearAll || assistantText("清空", "Clear"), assistantText("清空当前会话中的全部消息？", "Clear all messages in the current session?"), async () => {
            try {
                await clearAssistantAISession(session.id);
                this.clearEditingMessage(false);
                this.messages = [];
                await this.refresh(false);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            }
        }, true);
    }

    private async deleteCurrentSession() {
        const session = this.getSelectedSession();
        if (!session) {
            return;
        }
        confirmDialog(window.sourceflow.languages.deleteOpConfirm || assistantText("删除", "Delete"), assistantText("删除当前会话及其全部消息？", "Delete the current session and all messages?"), async () => {
            try {
                await deleteAssistantAISession(session.id);
                this.selectedSessionId = "";
                this.clearEditingMessage(false);
                this.messages = [];
                await this.refresh(false);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            }
        }, true);
    }

    private async clearAllSessions() {
        if (!this.sessions.length) {
            return;
        }
        confirmDialog(window.sourceflow.languages.clearAll || assistantText("全部清空", "Clear all"), assistantText("清空全部 AI 会话？这个操作不可撤销。", "Clear all AI sessions? This cannot be undone."), async () => {
            try {
                await clearAllAssistantAISessions();
                this.selectedSessionId = "";
                this.clearEditingMessage(false);
                this.messages = [];
                await this.refresh(false);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            }
        }, true);
    }

    private async sendMessage() {
        const profile = this.getSelectedProfile();
        if (!profile) {
            showMessage(assistantText("请先配置 AI 提供商", "Configure an AI profile first"), 5000, "error");
            return;
        }
        const message = this.draftMessage.trim();
        const attachments = this.cloneComposerAttachments();
        if ((!message && !attachments.length) || this.sending) {
            return;
        }
        const editingMessageId = this.editingMessageId;
        const editingMessage = editingMessageId ? this.getMessageById(editingMessageId) : null;
        const isEditing = !!editingMessage;
        const session = this.getSelectedSession();
        if (isEditing && (!session || !editingMessage)) {
            this.clearEditingMessage(false);
            this.render();
            showMessage(assistantText("原始消息不存在，无法编辑", "The original message is no longer available to edit"), 5000, "error");
            return;
        }
        const previousMessages = this.messages.slice();
        const messagePreview = this.buildUserMessagePreview(message, attachments) || assistantText("图片消息", "Image message");
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
            : this.buildLocalMessage("user", messagePreview, {
                metadata: attachments.length ? {attachments} : {},
            });
        const optimisticAssistant = this.buildLocalMessage("assistant", assistantText("正在处理...", "Thinking..."), {
            localPending: true,
        });
        this.draftMessage = "";
        this.attachments = [];
        if (isEditing) {
            const editingIndex = previousMessages.findIndex((item) => item.id === editingMessageId);
            this.messages = [...previousMessages.slice(0, editingIndex), optimisticUser, optimisticAssistant];
        } else {
            this.messages = [...this.messages, optimisticUser, optimisticAssistant];
        }
        this.sending = true;
        this.render();
        this.scrollToBottom();
        try {
            let currentNote = null;
            let system = "";
            if (this.includeCurrentNote) {
                currentNote = await this.resolveMessageContext();
                if (currentNote) {
                    system = buildAssistantNoteContext(currentNote);
                }
            }
            let partialReply = "";
            let previewTimer = 0;
            const flushOptimisticReply = () => {
                previewTimer = 0;
                optimisticAssistant.content = partialReply;
                this.updateMessageContent(optimisticAssistant.id, partialReply || assistantText("正在处理...", "Thinking..."));
                this.scrollToBottom();
            };
            const payload = {
                profileId: session?.profileId || profile.id,
                sessionId: session?.id,
                message,
                system,
                enableTools: this.enableTools,
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
            this.selectedSessionId = result.session.id;
            this.selectedProfileId = result.profile.id;
            this.messages = result.messages;
            if (isEditing) {
                this.clearEditingMessage(false);
            }
            this.syncEditingMessageState();
            this.upsertSession(result.session);
            await this.refreshAudits();
            this.render();
        } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            this.draftMessage = message;
            this.attachments = attachments;
            if (isEditing) {
                this.editingMessageId = editingMessageId;
                this.messages = previousMessages;
            } else {
                this.messages = this.messages.map((item) => {
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
            this.sending = false;
            this.render();
            this.scrollToBottom();
        }
    }

    private async confirmTool(messageID: string, toolIndex: number) {
        const session = this.getSelectedSession();
        const profile = this.getSelectedProfile();
        if (!session || !profile || !messageID || toolIndex < 0 || this.sending) {
            return;
        }
        const message = this.messages.find((item) => item.id === messageID);
        const toolResults = Array.isArray(message?.metadata?.toolResults) ? message.metadata.toolResults as Array<Record<string, unknown>> : [];
        const tool = toolResults[toolIndex];
        if (!tool || tool.executed || tool.decision !== "confirm") {
            return;
        }
        this.sending = true;
        this.render();
        try {
            const result = await confirmAssistantAITool({
                profileId: profile.id,
                sessionId: session.id,
                messageId: messageID,
                auditId: `${tool.auditId || ""}`,
                context: tool.context as never,
                toolId: `${tool.toolId || ""}`,
                args: (tool.args || {}) as Record<string, unknown>,
            });
            this.selectedSessionId = result.session.id;
            this.selectedProfileId = result.profile.id;
            this.messages = result.messages;
            this.syncEditingMessageState();
            await this.refreshAudits();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        } finally {
            this.sending = false;
            this.render();
            this.scrollToBottom();
        }
    }

    private async saveTranscript() {
        const session = this.getSelectedSession();
        if (!session || !this.messages.length) {
            return;
        }
        const title = `${session.title || assistantText("AI 对话", "AI Chat")} ${assistantText("对话记录", "Transcript")}`;
        const markdown = formatTranscriptMarkdown(title, this.messages.map((item) => ({
            role: item.role,
            content: item.content,
            createdAt: item.createdAt,
        })));
        const id = await saveMarkdownAsAssistantNote(title, markdown);
        if (id) {
            showMessage(assistantText("对话已保存到笔记", "Transcript saved to a note"));
        }
    }

    private async saveAnalysis() {
        const session = this.getSelectedSession();
        const profile = this.getSelectedProfile();
        if (!session || !profile || !this.messages.length) {
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
    }

    private async insertLastReply() {
        const reply = [...this.messages].reverse().find((item) => item.role === "assistant");
        if (!reply) {
            return;
        }
        const ok = await appendMarkdownToCurrentNote(reply.content);
        if (ok) {
            showMessage(window.sourceflow.languages.workbenchInserted || assistantText("已插入到当前笔记", "Inserted into current note"));
        }
    }

    private render() {
        const profile = this.getSelectedProfile();
        const session = this.getSelectedSession();
        const editingMessage = this.editingMessageId ? this.getMessageById(this.editingMessageId) : null;
        const sessionTitle = session?.title || (this.messages.length ? assistantText("当前对话", "Current chat") : assistantText("新对话", "New chat"));
        const profilesConfigHint = this.getProfilesConfigHint();
        const sessionsBackdropHint = this.getSessionsToggleHint();
        const canSend = !!this.profiles.length && !this.sending && (!!this.draftMessage.trim() || !!this.attachments.length);
        this.element.innerHTML = `<div class="assistant-dock__header">
    <div class="assistant-dock__header-main">
        <div class="assistant-dock__headline">
            <div class="assistant-dock__title">${assistantText("AI 助手", "AI Assistant")}</div>
            <div class="assistant-dock__summary">${this.renderToolSummary()}</div>
        </div>
    </div>
    <div class="assistant-dock__header-actions">
        <button type="button" class="assistant-dock__header-icon" data-action="open-profiles" aria-label="${escapeAttr(profilesConfigHint)}" title="${escapeAttr(profilesConfigHint)}">
            <svg><use xlink:href="#iconSettings"></use></svg>
        </button>
    </div>
</div>
<div class="assistant-ai fn__flex-1">
    ${this.sessionsCollapsed ? "" : `<button type="button" class="assistant-ai__sessions-backdrop" data-action="dismiss-sessions" aria-label="${escapeAttr(sessionsBackdropHint)}"></button>`}
    <div class="assistant-ai__sessions${this.sessionsCollapsed ? " assistant-ai__sessions--collapsed" : ""}">${this.sessionsCollapsed ? "" : this.renderSessions()}</div>
    <div class="assistant-ai__main fn__flex-column">
        <div class="assistant-ai__topbar">
            <div class="assistant-ai__conversation">
                <div class="assistant-ai__conversation-title">${escapeHTML(truncateText(sessionTitle, 58))}</div>
            </div>
            <div class="assistant-ai__conversation-actions">${this.renderSessionActions(session)}</div>
        </div>
        <div class="assistant-ai__toolbar">
            ${this.renderQuickActions()}
        </div>
        ${this.renderFloatingPanel()}
        <div class="assistant-ai__messages fn__flex-1">${this.renderMessages()}</div>
        <div class="assistant-ai__composer">
            <div class="assistant-ai__composer-shell">
                <div class="assistant-ai__composer-card">
                    ${editingMessage ? `<div class="assistant-ai__composer-edit">
                        <div class="assistant-ai__composer-edit-main">
                            <div class="assistant-ai__composer-edit-title">${escapeHTML(assistantText("正在编辑你的上一条消息", "Editing your previous message"))}</div>
                            <div class="assistant-ai__composer-edit-meta">${escapeHTML(assistantText("发送后会从这条消息重新生成后续回复。", "Sending will regenerate the conversation from this message."))}</div>
                        </div>
                        <button type="button" class="assistant-ai__composer-edit-action" data-action="cancel-edit-message">${escapeHTML(assistantText("取消编辑", "Cancel"))}</button>
                    </div>` : ""}
                    ${this.renderComposerAttachments()}
                    <div class="assistant-ai__composer-hint">${escapeHTML(assistantText("可上传图片，也可直接粘贴截图或拖拽到这里。", "Upload images, or paste a screenshot / drag files here."))}</div>
                    <textarea class="b3-text-field assistant-ai__textarea" data-role="message" placeholder="${escapeAttr(assistantText("输入消息或直接发图片，Enter 发送，Shift+Enter 换行", "Type a message or just send images. Enter to send, Shift+Enter for newline"))}">${escapeAttr(this.draftMessage)}</textarea>
                    <div class="assistant-ai__composer-bottom">
                        <div class="assistant-ai__launcher-group">
                            ${this.renderModelLauncher(profile)}
                            <button type="button" class="assistant-ai__icon-button assistant-ai__icon-button--compact" data-action="pick-attachments" aria-label="${escapeAttr(assistantText("上传图片", "Upload images"))}" title="${escapeAttr(assistantText("上传图片", "Upload images"))}">
                                <svg><use xlink:href="#iconImage"></use></svg>
                            </button>
                            <button type="button" class="assistant-ai__icon-button assistant-ai__icon-button--compact" data-action="open-profiles" aria-label="${escapeAttr(profilesConfigHint)}" title="${escapeAttr(profilesConfigHint)}">
                                <svg><use xlink:href="#iconSettings"></use></svg>
                            </button>
                            <input class="fn__none" type="file" data-role="message-attachments" accept="image/*" multiple>
                        </div>
                        <div class="assistant-ai__composer-main-actions">
                            <button type="button" class="b3-button b3-button--outline assistant-ai__send-button" data-action="send-message"${canSend ? "" : " disabled"}>${this.sending ? assistantText("发送中...", "Sending...") : (editingMessage ? assistantText("保存并重生成", "Save & Regenerate") : assistantText("发送", "Send"))}</button>
                        </div>
                    </div>
                </div>
                <div class="assistant-ai__composer-meta">
                    <div class="assistant-ai__utility-actions">
                        <button type="button" class="assistant-ai__utility-button" data-action="save-transcript"${this.messages.length ? "" : " disabled"}>${assistantText("保存对话", "Save Transcript")}</button>
                        <button type="button" class="assistant-ai__utility-button" data-action="analyze-session"${this.messages.length ? "" : " disabled"}>${assistantText("分析并保存", "Analyze & Save")}</button>
                        <button type="button" class="assistant-ai__utility-button" data-action="insert-last-reply"${this.messages.find((item) => item.role === "assistant") ? "" : " disabled"}>${assistantText("插入回复", "Insert Reply")}</button>
                    </div>
                    <div class="assistant-ai__context-status">${this.renderContextStatus()}</div>
                </div>
            </div>
        </div>
    </div>
</div>`;
    }

    private renderSessions() {
        const closeLabel = this.getSessionsToggleHint();
        const newLabel = this.getNewSessionHint();
        const headActionsHTML = (showNew = false) => `<div class="assistant-ai__sessions-head-actions">
    ${showNew ? `<button type="button" class="assistant-ai__sessions-close assistant-ai__sessions-close--accent" data-action="new-session" aria-label="${escapeAttr(newLabel)}" title="${escapeAttr(newLabel)}">
        <svg><use xlink:href="#iconAdd"></use></svg>
    </button>` : ""}
    <button type="button" class="assistant-ai__sessions-close" data-action="dismiss-sessions" aria-label="${escapeAttr(closeLabel)}" title="${escapeAttr(closeLabel)}">
        <svg><use xlink:href="#iconCloseRound"></use></svg>
    </button>
</div>`;
        if (this.loading) {
            return `<div class="assistant-ai__loading">${assistantText("加载中...", "Loading...")}</div>`;
        }
        if (!this.profiles.length) {
            return `<div class="assistant-ai__sessions-head">
    <div class="assistant-ai__sessions-title">${assistantText("会话", "Sessions")}</div>
    ${headActionsHTML()}
</div>${panelEmptyHTML(assistantText("还没有 AI 配置", "No AI profile yet"), assistantText("先配置提供商，再开始多轮对话。", "Configure a provider first, then start chatting."), assistantText("打开配置", "Open Profiles"), "configure-profile")}`;
        }
        if (!this.sessions.length) {
            return `<div class="assistant-ai__sessions-head">
    <div class="assistant-ai__sessions-title">${assistantText("会话", "Sessions")}</div>
    ${headActionsHTML(true)}
</div>${panelEmptyHTML(assistantText("还没有会话", "No sessions yet"), assistantText("点击右上角新建，或直接发送消息开始。", "Use the upper-right create button or send a message to start."))}`;
        }
        return `<div class="assistant-ai__sessions-head">
    <div>
        <div class="assistant-ai__sessions-title">${assistantText("会话", "Sessions")}</div>
        <div class="assistant-ai__sessions-meta">${assistantText("最近", "Recent")} ${this.sessions.length}</div>
    </div>
    ${headActionsHTML(true)}
</div>
<div class="assistant-ai__session-list">${this.sessions.map((item) => {
            const sessionHint = this.getSessionItemHint(item);
            return `
<button type="button" class="assistant-ai__session${item.id === this.selectedSessionId ? " assistant-ai__session--active" : ""}" data-session-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(sessionHint)}" title="${escapeAttr(sessionHint)}">
    <span class="assistant-ai__session-title">${escapeHTML(item.title || assistantText("未命名会话", "Untitled Session"))}</span>
    <span class="assistant-ai__session-meta">${assistantText("消息", "Messages")} ${item.messageCount}</span>
    <span class="assistant-ai__session-time">${formatDateTime(item.updatedAt || item.createdAt)}</span>
</button>`;
        }).join("")}</div>`;
    }

    private renderMessages() {
        if (this.loading && !this.messages.length) {
            return `<div class="assistant-ai__loading">${assistantText("加载消息中...", "Loading messages...")}</div>`;
        }
        if (!this.messages.length) {
            return `<div class="assistant-ai__empty-state">
    <div class="assistant-ai__empty-kicker">${assistantText("第二大脑", "Second Brain")}</div>
    <div class="assistant-ai__empty-title">${assistantText("开始一次聚焦对话", "Start a focused chat")}</div>
    <div class="assistant-ai__empty-detail">${assistantText("聊天保持主视图，目标笔记、上下文、审计和能力都压缩成按钮，需要时再展开。", "Keep chat as the main canvas while target notes, context, audits, and tools stay compressed into buttons until you need them.")}</div>
</div>`;
        }
        return this.messages.map((item) => {
            const attachments = this.getMessageAttachments(item);
            const displayContent = this.getMessageDisplayContent(item, attachments);
            const isExpandable = this.isMessageExpandable(item);
            const isExpanded = this.isMessageExpanded(item.id);
            const isEdited = item.role === "user" && !!item.metadata?.editedAt;
            return `
<div class="assistant-ai__message assistant-ai__message--${item.role === "assistant" ? "assistant" : "user"}${item.localPending ? " assistant-ai__message--pending" : ""}${item.localError ? " assistant-ai__message--error" : ""}" data-message-id="${escapeAttr(item.id)}">
    <div class="assistant-ai__message-head">
        <div class="assistant-ai__message-badges">
            <span class="assistant-ai__message-role assistant-ai__message-role--${item.role === "assistant" ? "assistant" : "user"}">${item.role === "assistant" ? "AI" : assistantText("你", "You")}</span>
            ${isEdited ? `<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("已编辑", "Edited"))}</span>` : ""}
            ${item.localPending ? `<span class="b3-chip b3-chip--small b3-chip--warning">${escapeHTML(assistantText("处理中", "Processing"))}</span>` : ""}
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
    ${displayContent ? `<div class="assistant-ai__message-content">${nl2br(displayContent)}</div>` : ""}
    ${this.renderAttachmentList(attachments)}
    ${this.renderMessageToolResults(item)}
</div>`;
        }).join("");
    }

    private getTargetSummary() {
        const effectiveContext = this.getEffectiveContextPreview();
        if (!this.includeCurrentNote) {
            return assistantText("未附加笔记", "No note attached");
        }
        if (!effectiveContext) {
            return assistantText("没有活动笔记", "No active note");
        }
        return this.isTargetPinned()
            ? `${assistantText("已固定", "Pinned")} · ${effectiveContext.title || assistantText("当前笔记", "Current note")}`
            : `${assistantText("跟随当前", "Following")} · ${effectiveContext.title || assistantText("当前笔记", "Current note")}`;
    }

    private getContextSummary() {
        const effectiveContext = this.getEffectiveContextPreview();
        if (!this.includeCurrentNote || !effectiveContext) {
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
    }

    private isTargetPinned() {
        return !!this.pinnedNotePreview;
    }

    private getTargetLockGlyph() {
        return this.isTargetPinned() ? "🔒" : "🔓";
    }

    private getTargetLockLabel() {
        if (!this.includeCurrentNote) {
            return assistantText("未固定，当前未附加笔记", "Unlocked, no note attached");
        }
        return this.isTargetPinned()
            ? assistantText("已固定目标笔记", "Pinned target note")
            : assistantText("未固定，正在跟随当前活动笔记", "Unlocked, following the active note");
    }

    private buildHoverHint(summary: string, action: string) {
        return `${summary} · ${action}`;
    }

    private getSessionsToggleHint() {
        return this.buildHoverHint(
            this.sessionsCollapsed ? assistantText("历史已收起", "History hidden") : assistantText("历史已展开", "History shown"),
            this.sessionsCollapsed ? assistantText("点击展开", "Click to show") : assistantText("点击收起", "Click to hide")
        );
    }

    private getNewSessionHint() {
        return assistantText("新建会话", "Start a new chat");
    }

    private getSessionPanelHint() {
        return this.buildHoverHint(
            this.activePanel === "session" ? assistantText("更多操作已展开", "More actions shown") : assistantText("更多操作已收起", "More actions hidden"),
            this.activePanel === "session" ? assistantText("点击收起", "Click to hide") : assistantText("点击展开", "Click to show")
        );
    }

    private getProfilesConfigHint() {
        return assistantText("模型与提供商配置", "Model and provider settings");
    }

    private getSessionItemHint(item: IAssistantAISession) {
        const title = item.title || assistantText("未命名会话", "Untitled session");
        if (item.id === this.selectedSessionId) {
            return this.buildHoverHint(
                `${assistantText("当前会话", "Current chat")} · ${title}`,
                assistantText("点击收起历史", "Click to hide history")
            );
        }
        return this.buildHoverHint(title, assistantText("点击切换", "Click to switch"));
    }

    private renderQuickActions() {
        const targetSummary = this.getTargetSummary();
        const contextSummary = this.getContextSummary();
        const lockGlyph = this.getTargetLockGlyph();
        const executedCount = this.audits.filter((audit) => audit.executed).length;
        const blockedCount = this.audits.filter((audit) => !audit.executed).length;
        const enabledCount = this.toolPolicy
            ? this.toolCatalog.filter((item) => {
                const mode = this.toolPolicy?.toolModes?.[item.id] || item.defaultMode || this.getDefaultToolMode(item);
                return mode !== "deny";
            }).length
            : 0;
        const auditSummary = `${assistantText("已执行", "Executed")} ${executedCount} · ${assistantText("已拦截", "Blocked")} ${blockedCount}`;
        const toolSummary = this.toolPolicy
            ? (this.enableTools ? `${assistantText("已开", "On")} ${enabledCount}/${this.toolCatalog.length}` : assistantText("已关闭", "Disabled"))
            : assistantText("加载中", "Loading");
        const targetHint = this.buildHoverHint(targetSummary, assistantText("点击管理目标", "Click to manage"));
        const contextHint = this.buildHoverHint(contextSummary, assistantText("点击查看", "Click to inspect"));
        const auditHint = this.buildHoverHint(auditSummary, assistantText("点击查看", "Click to inspect"));
        const toolsHint = this.buildHoverHint(toolSummary, assistantText("点击管理", "Click to manage"));
        return `<div class="assistant-ai__toolbar-group assistant-ai__toolbar-group--chips">
    <button type="button" class="assistant-ai__quick-button${this.activePanel === "target" ? " assistant-ai__quick-button--active" : ""}" data-action="toggle-panel" data-panel="target" aria-label="${escapeAttr(targetHint)}" title="${escapeAttr(targetHint)}">
        <svg><use xlink:href="#iconFiles"></use></svg>
        <span class="assistant-ai__quick-copy">
            <span class="assistant-ai__quick-lock" aria-hidden="true">${escapeHTML(lockGlyph)}</span>
            <span class="assistant-ai__quick-label">${assistantText("目标", "Target")}</span>
        </span>
    </button>
    <button type="button" class="assistant-ai__quick-button${this.activePanel === "context" ? " assistant-ai__quick-button--active" : ""}" data-action="toggle-panel" data-panel="context" aria-label="${escapeAttr(contextHint)}" title="${escapeAttr(contextHint)}">
        <svg><use xlink:href="#iconAlignCenter"></use></svg>
        <span class="assistant-ai__quick-copy">
            <span class="assistant-ai__quick-label">${assistantText("上下文", "Context")}</span>
        </span>
    </button>
    <button type="button" class="assistant-ai__quick-button${this.activePanel === "audit" ? " assistant-ai__quick-button--active" : ""}" data-action="toggle-panel" data-panel="audit" aria-label="${escapeAttr(auditHint)}" title="${escapeAttr(auditHint)}">
        <svg><use xlink:href="#iconInfo"></use></svg>
        <span class="assistant-ai__quick-copy">
            <span class="assistant-ai__quick-label">${assistantText("审计", "Audits")}</span>
        </span>
    </button>
    <button type="button" class="assistant-ai__quick-button${this.activePanel === "tools" ? " assistant-ai__quick-button--active" : ""}" data-action="toggle-panel" data-panel="tools"${!this.getSelectedProfile() ? " disabled" : ""} aria-label="${escapeAttr(toolsHint)}" title="${escapeAttr(toolsHint)}">
        <svg><use xlink:href="#iconSettings"></use></svg>
        <span class="assistant-ai__quick-copy">
            <span class="assistant-ai__quick-label">${assistantText("能力", "Tools")}</span>
        </span>
    </button>
</div>`;
    }

    private renderSessionActions(session?: IAssistantAISession) {
        const historyHint = this.getSessionsToggleHint();
        const newHint = this.getNewSessionHint();
        const sessionPanelHint = this.getSessionPanelHint();
        return `<div class="assistant-ai__session-tools">
<button type="button" class="assistant-ai__session-action assistant-ai__session-action--icon assistant-ai__session-action--ghost" data-action="toggle-sessions" aria-label="${escapeAttr(historyHint)}" title="${escapeAttr(historyHint)}">
    <svg><use xlink:href="#iconHistory"></use></svg>
</button>
<button type="button" class="assistant-ai__session-action assistant-ai__session-action--icon assistant-ai__session-action--primary" data-action="new-session" aria-label="${escapeAttr(newHint)}" title="${escapeAttr(newHint)}">
    <svg><use xlink:href="#iconAdd"></use></svg>
</button>
<button type="button" class="assistant-ai__session-action assistant-ai__session-action--icon${this.activePanel === "session" ? " assistant-ai__session-action--active" : ""}" data-action="toggle-panel" data-panel="session"${session ? "" : " disabled"} aria-label="${escapeAttr(sessionPanelHint)}" title="${escapeAttr(sessionPanelHint)}">
    <svg><use xlink:href="#iconMore"></use></svg>
</button>
</div>`;
    }

    private renderContextStatus() {
        const enabledCount = this.toolPolicy
            ? this.toolCatalog.filter((item) => {
                const mode = this.toolPolicy?.toolModes?.[item.id] || item.defaultMode || this.getDefaultToolMode(item);
                return mode !== "deny";
            }).length
            : 0;
        const contextPart = this.includeCurrentNote ? this.getTargetSummary() : assistantText("未附加上下文", "No context");
        const toolPart = this.toolPolicy
            ? (this.enableTools ? `${assistantText("能力", "Tools")} ${enabledCount}/${this.toolCatalog.length}` : assistantText("能力关闭", "Tools off"))
            : assistantText("能力加载中", "Tools loading");
        const attachmentPart = this.attachments.length ? ` · ${this.getAttachmentSummary(this.attachments.length)}` : "";
        return `<span class="assistant-ai__status-pill">${escapeHTML(truncateText(`${contextPart} · ${toolPart}${attachmentPart}`, 54))}</span>`;
    }

    private renderComposerAttachments() {
        if (!this.attachments.length) {
            return "";
        }
        return `<div class="assistant-ai__composer-attachments">
    <div class="assistant-ai__attachment-summary">${escapeHTML(this.getAttachmentSummary(this.attachments.length))}</div>
    ${this.renderAttachmentList(this.attachments, true)}
</div>`;
    }

    private renderAttachmentList(attachments: IAssistantAIInputAttachment[], composer = false) {
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
    }

    private renderModelLauncher(profile?: IAssistantAIProfile) {
        if (!profile) {
            const setupHint = assistantText("还没有模型，点击配置", "No model yet. Click to set one up");
            return `<button type="button" class="assistant-ai__model-button" data-action="open-profiles" aria-label="${escapeAttr(setupHint)}" title="${escapeAttr(setupHint)}">
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
        const modelHint = this.buildHoverHint(`${primaryLabel} · ${secondaryLabel}`, assistantText("点击切换模型", "Click to switch"));
        return `<button type="button" class="assistant-ai__model-button${this.activePanel === "profiles" ? " assistant-ai__model-button--active" : ""}" data-action="toggle-panel" data-panel="profiles" aria-label="${escapeAttr(modelHint)}" title="${escapeAttr(modelHint)}">
    <span class="assistant-ai__model-plus"><svg><use xlink:href="#iconAdd"></use></svg></span>
    <span class="assistant-ai__model-copy">
        <span class="assistant-ai__model-name">${escapeHTML(primaryLabel)}</span>
        <span class="assistant-ai__model-meta">${escapeHTML(secondaryLabel)}</span>
    </span>
</button>`;
    }

    private renderFloatingPanel() {
        if (!this.activePanel) {
            return "";
        }
        const isBottomPanel = this.activePanel === "profiles" || this.activePanel === "tools";
        const titleMap: Record<TAssistantAIFloatingPanel, string> = {
            "": "",
            target: assistantText("目标笔记", "Target Note"),
            context: assistantText("上下文预览", "Context Preview"),
            audit: assistantText("最近工具审计", "Recent Tool Audits"),
            profiles: assistantText("模型选择", "Model Switcher"),
            tools: assistantText("能力与权限", "Tools & Permissions"),
            session: assistantText("会话操作", "Session Actions"),
        };
        const subtitleMap: Record<TAssistantAIFloatingPanel, string> = {
            "": "",
            target: assistantText("把目标笔记收纳到浮层里，不再占住主聊天区。", "Keep target note management in a floating panel instead of the main chat area."),
            context: assistantText("只在需要时查看上下文细节。", "Inspect context details only when you need them."),
            audit: assistantText("最近工具执行和拦截记录。", "Recent tool execution and blocking events."),
            profiles: assistantText("切换模型会从空白对话开始，左侧历史会话会保留。", "Switching models starts a fresh chat while keeping the history on the left."),
            tools: assistantText("默认把复杂能力收起来，需要时再展开调整。", "Keep advanced tool controls collapsed until you need them."),
            session: assistantText("把次级会话操作收进浮层，顶部只保留核心入口。", "Move secondary chat actions into a floating panel and keep only the primary controls on top."),
        };
        let content = "";
        if (this.activePanel === "target") {
            content = this.renderTargetNoteCard();
        } else if (this.activePanel === "context") {
            content = this.renderContextCard();
        } else if (this.activePanel === "audit") {
            content = this.renderAuditCard();
        } else if (this.activePanel === "profiles") {
            content = this.renderProfilesPanel();
        } else if (this.activePanel === "tools") {
            content = this.renderToolsPanel();
        } else if (this.activePanel === "session") {
            content = this.renderSessionPanel();
        }
        return `<div class="assistant-ai__floating-panel assistant-ai__floating-panel--${isBottomPanel ? "bottom" : "top"}">
    <div class="assistant-ai__floating-head">
        <div>
            <div class="assistant-ai__floating-title">${escapeHTML(titleMap[this.activePanel])}</div>
            <div class="assistant-ai__floating-subtitle">${escapeHTML(subtitleMap[this.activePanel])}</div>
        </div>
        <button type="button" class="b3-button b3-button--text" data-action="toggle-panel" data-panel="${this.activePanel}">${assistantText("关闭", "Close")}</button>
    </div>
    <div class="assistant-ai__floating-body">${content}</div>
</div>`;
    }

    private renderSessionPanel() {
        const session = this.getSelectedSession();
        if (!session) {
            return panelEmptyHTML(
                assistantText("还没有会话", "No session selected"),
                assistantText("先新建会话或从历史里选择一个会话，再进行重命名、清空或删除。", "Create or select a chat before renaming, clearing, or deleting it."),
                assistantText("新建会话", "New session"),
                "new-session"
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
    }

    private renderProfilesPanel() {
        if (!this.profiles.length) {
            return panelEmptyHTML(assistantText("还没有 AI 配置", "No AI profile yet"), assistantText("先配置一个提供商，再回来开始对话。", "Configure a provider first, then come back to chat."), assistantText("打开配置", "Open Profiles"), "configure-profile");
        }
        return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__floating-copy ft__secondary">${escapeHTML(assistantText("这里把模型切换收纳到底部左侧，避免顶部工具栏继续膨胀。", "The model switcher lives at the lower-left so the main toolbar stays compact."))}</div>
    <div class="assistant-ai__profile-list">${this.profiles.map((item) => `
        <button type="button" class="assistant-ai__profile-item${item.id === this.selectedProfileId ? " assistant-ai__profile-item--active" : ""}" data-profile-id="${escapeAttr(item.id)}"${this.savingProfile ? " disabled" : ""}>
            <span class="assistant-ai__profile-name">${escapeHTML(item.name || item.model || providerDisplayName(item.provider))}</span>
            <span class="assistant-ai__profile-meta">${escapeHTML(providerDisplayName(item.provider))}${item.model ? ` · ${escapeHTML(item.model)}` : ""}${item.isDefault ? ` · ${escapeHTML(assistantText("默认", "Default"))}` : ""}</span>
        </button>`).join("")}</div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="open-profiles">${assistantText("管理模型与提供商", "Manage models & providers")}</button>
    </div>
</div>`;
    }

    private renderToolSummary() {
        const profile = this.getSelectedProfile();
        if (!profile) {
            return escapeHTML(assistantText("未配置提供商", "No provider configured"));
        }
        const providerSummary = providerDisplayName(profile.provider);
        if (!this.toolPolicy) {
            return escapeHTML(`${providerSummary} · ${assistantText("能力策略加载中...", "Loading tool policy...")}`);
        }
        const enabledCount = this.toolCatalog.filter((item) => {
            const mode = this.toolPolicy?.toolModes?.[item.id] || item.defaultMode || this.getDefaultToolMode(item);
            return mode !== "deny";
        }).length;
        const toolSummary = `${this.enableTools ? assistantText("能力", "Tools") : assistantText("能力关闭", "Tools off")} ${enabledCount}/${this.toolCatalog.length}`;
        const scopeSummary = `${getToolTargetLabel(this.toolPolicy.readScope)} / ${getToolTargetLabel(this.toolPolicy.writeScope)}`;
        return escapeHTML(`${providerSummary} · ${toolSummary} · ${scopeSummary}`);
    }

    private renderTargetNoteCard() {
        const effectiveContext = this.getEffectiveContextPreview();
        const lockGlyph = this.getTargetLockGlyph();
        const targetLockLabel = this.getTargetLockLabel();
        const targetSummaryHTML = !this.includeCurrentNote
            ? `<div class="assistant-ai__target-summary assistant-ai__target-summary--muted"><div class="assistant-ai__target-summary-title"><span class="assistant-ai__target-lock" aria-hidden="true">${escapeHTML(lockGlyph)}</span><span>${escapeHTML(assistantText("当前未附加笔记上下文", "Current note context is not attached"))}</span></div><div class="assistant-ai__target-summary-meta">${escapeHTML(targetLockLabel)}</div></div>`
            : effectiveContext
                ? `<div class="assistant-ai__target-summary">
    <div class="assistant-ai__target-summary-title"><span class="assistant-ai__target-lock" aria-hidden="true">${escapeHTML(lockGlyph)}</span><span>${escapeHTML(effectiveContext.title || assistantText("当前笔记", "Current note"))}</span></div>
    <div class="assistant-ai__note-result-path">${escapeHTML(effectiveContext.path || "")}</div>
    <div class="assistant-ai__target-summary-meta">${escapeHTML(targetLockLabel)}</div>
</div>`
                : `<div class="assistant-ai__target-summary assistant-ai__target-summary--muted"><div class="assistant-ai__target-summary-title"><span class="assistant-ai__target-lock" aria-hidden="true">${escapeHTML(lockGlyph)}</span><span>${escapeHTML(assistantText("当前没有可读取的活动笔记", "No active note is available"))}</span></div><div class="assistant-ai__target-summary-meta">${escapeHTML(targetLockLabel)}</div></div>`;
        const searchResultHTML = this.noteSearchLoading
            ? `<div class="assistant-ai__note-search-popover assistant-ai__note-search-popover--inline"><div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("正在搜索笔记...", "Searching notes..."))}</div></div>`
            : this.noteSearchResults.length
                ? `<div class="assistant-ai__note-search-popover assistant-ai__note-search-popover--inline"><div class="assistant-ai__note-results">${this.noteSearchResults.map((item) => `<button type="button" class="assistant-ai__note-result" data-note-root-id="${escapeAttr(item.rootID)}">
    <span class="assistant-ai__note-result-title">${escapeHTML(item.title)}</span>
    <span class="assistant-ai__note-result-path">${escapeHTML(item.path)}</span>
</button>`).join("")}</div></div>`
                : this.noteSearchKeyword.trim()
                ? `<div class="assistant-ai__note-search-popover assistant-ai__note-search-popover--inline"><div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("没有找到匹配的笔记", "No matching notes found"))}</div></div>`
                    : "";
        return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__floating-copy ft__secondary">${escapeHTML(assistantText("搜索任意笔记、固定当前笔记，或让 AI 自动跟随当前活动笔记。", "Search any note, pin the current note, or let AI follow the active note."))}</div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="pin-current-note"${this.currentNotePreview ? "" : " disabled"}>${escapeHTML(assistantText("固定当前笔记", "Pin current note"))}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="follow-current-note">${escapeHTML(assistantText("跟随当前笔记", "Follow current note"))}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="clear-target-note">${escapeHTML(assistantText("清空目标笔记", "Clear target note"))}</button>
    </div>
    ${targetSummaryHTML}
    <div class="assistant-ai__note-search">
        <input class="b3-text-field b3-text-field--text" data-role="note-search" placeholder="${escapeAttr(assistantText("搜索并选择任意笔记作为 AI 目标", "Search any note and set it as the AI target"))}" value="${escapeAttr(this.noteSearchKeyword)}">
        ${searchResultHTML}
    </div>
</div>`;
    }

    private renderContextCard() {
        const effectiveContext = this.getEffectiveContextPreview();
        const previewBits: string[] = [];
        if (effectiveContext?.title) {
            previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(truncateText(effectiveContext.title, 24))}</span>`);
        }
        if (effectiveContext?.currentBlockID) {
            previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("当前块", "Block"))}</span>`);
        }
        if (this.toolPolicy) {
            previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("读", "Read"))} ${escapeHTML(getToolTargetLabel(this.toolPolicy.readScope))}</span>`);
            previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("写", "Write"))} ${escapeHTML(getToolTargetLabel(this.toolPolicy.writeScope))}</span>`);
            previewBits.push(`<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("留痕", "Trace"))} ${escapeHTML(this.toolPolicy.traceMode === "markdown" ? assistantText("正文", "Markdown") : assistantText("审计", "Audit"))}</span>`);
        }
        const currentNoteHTML = !this.includeCurrentNote
            ? `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("当前未附加笔记上下文", "Current note context is not attached"))}</div>`
            : effectiveContext
                ? `<div class="assistant-ai__context-line"><strong>${escapeHTML(effectiveContext.title || assistantText("当前笔记", "Current note"))}</strong></div>
<div class="assistant-ai__context-line ft__secondary">${escapeHTML(effectiveContext.path || "")}</div>
${effectiveContext.currentBlockID ? `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(`${assistantText("当前块", "Current block")}: ${effectiveContext.currentBlockID}`)}</div>` : ""}
${effectiveContext.selectedText ? `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(`${assistantText("选中文本", "Selected text")}: ${truncateText(effectiveContext.selectedText, 80)}`)}</div>` : ""}`
                : `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("当前没有可读取的活动笔记", "No active note is available"))}</div>`;
        const policyHTML = this.toolPolicy
            ? `<div class="assistant-ai__context-line">${escapeHTML(assistantText("工具", "Tools"))}: ${escapeHTML(this.enableTools ? assistantText("已启用", "Enabled") : assistantText("已关闭", "Disabled"))}</div>
<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("读取", "Read"))}: ${escapeHTML(getToolTargetLabel(this.toolPolicy.readScope))} · ${escapeHTML(assistantText("写入", "Write"))}: ${escapeHTML(getToolTargetLabel(this.toolPolicy.writeScope))} · ${escapeHTML(assistantText("留痕", "Trace"))}: ${escapeHTML(this.toolPolicy.traceMode === "markdown" ? assistantText("正文留痕 + 审计", "Markdown trace + audit") : assistantText("仅内部审计", "Audit only"))}</div>`
            : `<div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("工具权限加载中...", "Loading tool permissions..."))}</div>`;
        return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__chips">${previewBits.join("")}</div>
    ${currentNoteHTML}
    ${policyHTML}
</div>`;
    }

    private renderAuditCard() {
        const executedCount = this.audits.filter((audit) => audit.executed).length;
        const blockedCount = this.audits.filter((audit) => !audit.executed).length;
        return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__chips">
        <span class="b3-chip b3-chip--small">${escapeHTML(assistantText("最近", "Recent"))} ${this.audits.length}</span>
        <span class="b3-chip b3-chip--small">${escapeHTML(assistantText("已执行", "Executed"))} ${executedCount}</span>
        <span class="b3-chip b3-chip--small">${escapeHTML(assistantText("已拦截", "Blocked"))} ${blockedCount}</span>
    </div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="refresh-audits">${escapeHTML(assistantText("刷新", "Refresh"))}</button>
    </div>
    ${this.audits.length ? this.audits.map((audit) => {
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
    }

    private renderToolsPanel() {
        const profile = this.getSelectedProfile();
        if (!profile) {
            return panelEmptyHTML(assistantText("还没有 AI 配置", "No AI profile yet"), assistantText("先配置一个模型，再决定要开放哪些能力。", "Configure a model first, then decide which tools to expose."), assistantText("打开配置", "Open Profiles"), "configure-profile");
        }
        if (!this.toolPolicy) {
            return `<div class="assistant-ai__panel-stack">
    <div class="assistant-ai__context-line ft__secondary">${escapeHTML(assistantText("工具权限加载中...", "Loading tool permissions..."))}</div>
</div>`;
        }
        const groups = assistantAIToolRiskOrder.map((risk) => ({
            risk,
            items: this.toolCatalog.filter((item) => item.risk === risk),
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
        <input type="checkbox" data-role="enable-tools"${this.enableTools ? " checked" : ""}>
        <span>${escapeHTML(assistantText("允许 AI 使用工具能力", "Allow AI to use tools"))}</span>
    </label>
    <div class="assistant-ai__policy-grid">
        <label class="fn__flex-column assistant-ai__policy-field">
            <span>${escapeHTML(assistantText("读取范围", "Read scope"))}</span>
            <select class="b3-select fn__flex-1" data-policy="toolReadScope"${this.savingProfile ? " disabled" : ""}>
                ${renderSelectOptions(assistantAIToolReadScopeOptions, this.toolPolicy.readScope)}
            </select>
        </label>
        <label class="fn__flex-column assistant-ai__policy-field">
            <span>${escapeHTML(assistantText("写入范围", "Write scope"))}</span>
            <select class="b3-select fn__flex-1" data-policy="toolWriteScope"${this.savingProfile ? " disabled" : ""}>
                ${renderSelectOptions(assistantAIToolWriteScopeOptions, this.toolPolicy.writeScope)}
            </select>
        </label>
        <label class="fn__flex-column assistant-ai__policy-field assistant-ai__policy-field--wide">
            <span>${escapeHTML(assistantText("留痕策略", "Trace mode"))}</span>
            <select class="b3-select fn__flex-1" data-policy="toolTraceMode"${this.savingProfile ? " disabled" : ""}>
                ${renderSelectOptions(assistantAIToolTraceOptions, this.toolPolicy.traceMode)}
            </select>
        </label>
    </div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="tool-policy-recommended"${this.savingProfile ? " disabled" : ""}>${assistantText("推荐", "Recommended")}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="tool-policy-readonly"${this.savingProfile ? " disabled" : ""}>${assistantText("只读", "Read-only")}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="tool-policy-confirm-write"${this.savingProfile ? " disabled" : ""}>${assistantText("写入前确认", "Confirm writes")}</button>
    </div>
    <div class="assistant-ai__tool-groups">${groups.map((group) => `
        <div class="assistant-ai__tool-group">
            <div class="assistant-ai__tool-group-title">${escapeHTML(getToolRiskLabel(group.risk))}</div>
            ${group.items.map((tool) => {
                const mode = this.toolPolicy?.toolModes?.[tool.id] || tool.defaultMode || this.getDefaultToolMode(tool);
                const enabled = mode !== "deny";
                const metaBits = [
                    tool.description,
                    `${assistantText("范围", "Scope")}: ${getToolTargetLabel(tool.target)}`,
                    `${assistantText("默认", "Default")}: ${getModeLabel(tool.defaultMode || this.getDefaultToolMode(tool))}`,
                    `${assistantText("当前", "Current")}: ${getModeLabel(mode)}`,
                ].filter(Boolean);
                return `<label class="assistant-ai__tool-toggle-row">
    <span class="assistant-ai__tool-toggle-copy">
        <span class="assistant-ai__tool-toggle-name">${escapeHTML(tool.name || tool.id)}</span>
        <span class="assistant-ai__tool-toggle-meta">${escapeHTML(metaBits.join(" · "))}</span>
    </span>
    <span class="assistant-ai__tool-toggle-state">
        <span class="b3-chip b3-chip--small">${escapeHTML(getModeLabel(mode))}</span>
        <input type="checkbox" data-tool-toggle="${escapeAttr(tool.id)}"${enabled ? " checked" : ""}${this.savingProfile ? " disabled" : ""}>
    </span>
</label>`;
            }).join("")}
        </div>`).join("")}</div>
    <div class="assistant-ai__panel-actions">
        <button type="button" class="b3-button b3-button--outline" data-action="open-profiles">${assistantText("打开完整配置", "Open full config")}</button>
    </div>
</div>`;
    }

    private renderMessageToolResults(item: IAssistantAIMessage) {
        if (item.role !== "assistant") {
            return "";
        }
        const raw = item.metadata?.toolResults;
        if (!Array.isArray(raw) || !raw.length) {
            return "";
        }
        return `<div class="assistant-ai__tool-results">${raw.map((tool, index) => {
            const name = `${tool?.name || tool?.toolId || assistantText("工具", "Tool")}`;
            const status = tool?.executed ? assistantText("已执行", "Executed") : (tool?.decision === "confirm" ? assistantText("待确认", "Needs confirm") : assistantText("已拦截", "Blocked"));
            const summary = `${tool?.summary || tool?.error || ""}`.trim();
            const canConfirm = !tool?.executed && tool?.decision === "confirm" && !!tool?.toolId;
            const statusClass = tool?.executed ? "success" : (tool?.decision === "confirm" ? "warning" : "secondary");
            return `<div class="assistant-ai__tool-result assistant-ai__tool-result--${statusClass}">
    <div class="assistant-ai__tool-result-head">
        <div class="assistant-ai__tool-title-group">
            <span class="assistant-ai__tool-name">${escapeHTML(name)}</span>
            <span class="b3-chip b3-chip--small b3-chip--${statusClass}">${escapeHTML(status)}</span>
        </div>
        ${canConfirm ? `<button type="button" class="b3-button b3-button--outline assistant-ai__tool-action" data-action="confirm-tool" data-message-id="${escapeAttr(item.id)}" data-tool-index="${index}"${this.sending ? " disabled" : ""}>${escapeHTML(assistantText("确认执行", "Confirm"))}</button>` : ""}
    </div>
    ${summary ? `<div class="assistant-ai__tool-summary">${escapeHTML(summary)}</div>` : ""}
</div>`;
        }).join("")}</div>`;
    }

    private scrollToBottom() {
        const container = this.element.querySelector(".assistant-ai__messages") as HTMLElement;
        if (!container) {
            return;
        }
        window.requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }
}

let aiDockInstance: AssistantAIDock | null = null;

export const mountAssistantAIDock = (custom: Custom, app: App) => {
    aiDockInstance?.destroy();
    aiDockInstance = new AssistantAIDock(custom, app);
};

export const destroyAssistantAIDock = () => {
    aiDockInstance?.destroy();
    aiDockInstance = null;
};

export const resizeAssistantAIDock = () => {
    aiDockInstance?.resize();
};

export const updateAssistantAIDock = () => {
    aiDockInstance?.update();
};

export const openAssistantAIDock = (options: {
    message?: string,
    includeCurrentNote?: boolean,
    append?: boolean,
    pinCurrentNote?: boolean,
    clearTarget?: boolean,
    sessionId?: string,
} = {}) => {
    const dock = getDockByType(ASSISTANT_AI_DOCK_TYPE);
    if (!dock) {
        showMessage(assistantText("AI 助手尚未初始化", "AI assistant is not ready"), 5000, "error");
        return;
    }
    dock.toggleModel(ASSISTANT_AI_DOCK_TYPE, true);
    const tryOpen = (retries = 10) => {
        if (aiDockInstance) {
            aiDockInstance.open(options);
            return;
        }
        if (0 < retries) {
            window.setTimeout(() => {
                tryOpen(retries - 1);
            }, 60);
        }
    };
    tryOpen();
};

