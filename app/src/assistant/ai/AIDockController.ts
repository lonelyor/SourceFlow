import {App} from "../../index";
import {showMessage} from "../../dialog/message";
import {Custom} from "../../layout/dock/Custom";
import {getDockByType} from "../../layout/tabUtil";
import {assistantText, ASSISTANT_AI_DOCK_TYPE} from "../constants";
import type {IAssistantNoteCandidate} from "../common/note";
import type {
    IAssistantAIInputAttachment,
    IAssistantAIProfile,
    IAssistantAIProviderType,
    IAssistantAISession,
    IAssistantAIToolAudit,
    IAssistantAIToolDefinition,
    IAssistantAIToolPolicy,
} from "./api";
import type {IAssistantAIDockRuntime, IAssistantAINotePreview} from "./AIDockContract";
import {
    addAIDockComposerAttachments,
    applyAIDockToolPatch,
    buildAIDockCollapsedMessageContent,
    buildAIDockLocalMessage,
    buildAIDockMessageCopyText,
    buildAIDockUserMessagePreview,
    clearAIDockEditingMessage,
    confirmAIDockTool,
    copyAIDockMessage,
    rejectAIDockTool,
    rejectAIDockToolPatch,
    focusAIDockComposer,
    getAIDockAttachmentSummary,
    getAIDockEffectiveContextPreview,
    getAIDockMessageAttachments,
    getAIDockMessageById,
    getAIDockMessageDisplayContent,
    insertAIDockLastReply,
    isAIDockMessageExpandable,
    isAIDockMessageExpanded,
    openAIDockComposerAttachmentPicker,
    removeAIDockComposerAttachment,
    saveAIDockAnalysis,
    saveAIDockTranscript,
    scrollAIDockToBottom,
    sendAIDockMessage,
    setAIDockComposerDropActive,
    startAIDockEditingMessage,
    syncAIDockEditingMessageState,
    toggleAIDockMessageExpanded,
    updateAIDockMessageContent,
    cloneAIDockComposerAttachments,
} from "./AIDockMessage";
import {IAssistantAIDockRenderContext, renderAssistantAIDock} from "./AIDockRender";
import {
    applyAIDockAgentPatch,
    cancelAIDockAgentTask,
    pauseAIDockAgentTask,
    rejectAIDockAgentPatch,
    retryAIDockAgentTaskItem,
    runAIDockAgentTask,
    startAIDockAgentFromDraft,
} from "./AIDockAgent";
import {
    TAssistantAIFloatingPanel,
    TAssistantAIMessageItem,
} from "./AIDockShared";
import {
    applyAIDockToolPolicyPreset,
    clearAIDockTargetNote,
    clearAllAIDockSessions,
    clearCurrentAIDockSession,
    createAIDockSession,
    deleteCurrentAIDockSession,
    ensureAIDockSelection,
    followAIDockCurrentNote,
    getAIDockDefaultToolMode,
    getSelectedAIDockProfile,
    getSelectedAIDockProfileToolSettings,
    getSelectedAIDockSession,
    pinAIDockCurrentNoteAsTarget,
    refreshAIDock,
    refreshAIDockAudits,
    refreshAIDockContextPreview,
    refreshAIDockToolCatalog,
    renameCurrentAIDockSession,
    resetAIDockTargetSelection,
    resolveAIDockMessageContext,
    saveSelectedAIDockProfileSettings,
    searchAIDockTargetNotes,
    selectAIDockSession,
    selectAIDockTargetNote,
    switchAIDockProfile,
    toggleAIDockFloatingPanel,
    toggleAIDockToolEnabled,
    updateAIDockToolPolicyField,
    upsertAIDockSession,
} from "./AIDockState";
import {bindAIDockEvents, handleAIDockAction} from "./AIDockEvents";

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
    private currentNotePreview: IAssistantAINotePreview | null = null;
    private pinnedNotePreview: IAssistantAINotePreview | null = null;
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

    private getRuntime() {
        return this as unknown as IAssistantAIDockRuntime;
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
        bindAIDockEvents(this.getRuntime());
    }

    private focusComposer() {
        focusAIDockComposer(this.getRuntime());
    }

    private setComposerDropActive(active: boolean) {
        setAIDockComposerDropActive(this.getRuntime(), active);
    }

    private getEffectiveContextPreview() {
        return getAIDockEffectiveContextPreview(this.getRuntime());
    }

    private buildLocalMessage(role: "assistant" | "user", content: string, extra: Partial<TAssistantAIMessageItem> = {}) {
        return buildAIDockLocalMessage(this.getRuntime(), role, content, extra);
    }

    private cloneComposerAttachments() {
        return cloneAIDockComposerAttachments(this.getRuntime());
    }

    private getAttachmentSummary(count: number) {
        return getAIDockAttachmentSummary(this.getRuntime(), count);
    }

    private buildUserMessagePreview(message: string, attachments: IAssistantAIInputAttachment[]) {
        return buildAIDockUserMessagePreview(this.getRuntime(), message, attachments);
    }

    private getMessageById(messageId: string) {
        return getAIDockMessageById(this.getRuntime(), messageId);
    }

    private isMessageExpandable(item: TAssistantAIMessageItem) {
        return isAIDockMessageExpandable(this.getRuntime(), item);
    }

    private isMessageExpanded(messageId: string) {
        return isAIDockMessageExpanded(this.getRuntime(), messageId);
    }

    private toggleMessageExpanded(messageId: string) {
        toggleAIDockMessageExpanded(this.getRuntime(), messageId);
    }

    private buildCollapsedMessageContent(content: string) {
        return buildAIDockCollapsedMessageContent(this.getRuntime(), content);
    }

    private getMessageDisplayContent(item: TAssistantAIMessageItem, attachments: IAssistantAIInputAttachment[]) {
        return getAIDockMessageDisplayContent(this.getRuntime(), item, attachments);
    }

    private buildMessageCopyText(item: TAssistantAIMessageItem) {
        return buildAIDockMessageCopyText(this.getRuntime(), item);
    }

    private copyMessage(messageId: string) {
        copyAIDockMessage(this.getRuntime(), messageId);
    }

    private clearEditingMessage(restoreComposer: boolean) {
        clearAIDockEditingMessage(this.getRuntime(), restoreComposer);
    }

    private startEditingMessage(messageId: string) {
        startAIDockEditingMessage(this.getRuntime(), messageId);
    }

    private syncEditingMessageState() {
        syncAIDockEditingMessageState(this.getRuntime());
    }

    private getMessageAttachments(item: TAssistantAIMessageItem) {
        return getAIDockMessageAttachments(this.getRuntime(), item);
    }

    private removeComposerAttachment(id: string) {
        removeAIDockComposerAttachment(this.getRuntime(), id);
    }

    private async addComposerAttachments(files: File[]) {
        await addAIDockComposerAttachments(this.getRuntime(), files);
    }

    private openComposerAttachmentPicker() {
        openAIDockComposerAttachmentPicker(this.getRuntime());
    }

    private updateMessageContent(messageId: string, content: string) {
        updateAIDockMessageContent(this.getRuntime(), messageId, content);
    }

    private async resolveMessageContext() {
        return resolveAIDockMessageContext(this.getRuntime());
    }

    private async pinCurrentNoteAsTarget() {
        await pinAIDockCurrentNoteAsTarget(this.getRuntime());
    }

    private resetTargetSelection(includeCurrentNote: boolean) {
        resetAIDockTargetSelection(this.getRuntime(), includeCurrentNote);
    }

    private async followCurrentNote() {
        await followAIDockCurrentNote(this.getRuntime());
    }

    private clearTargetNote() {
        clearAIDockTargetNote(this.getRuntime());
    }

    private toggleFloatingPanel(panel: TAssistantAIFloatingPanel) {
        toggleAIDockFloatingPanel(this.getRuntime(), panel);
    }

    private getSelectedProfileToolSettings(profile = this.getSelectedProfile()) {
        return getSelectedAIDockProfileToolSettings(this.getRuntime(), profile);
    }

    private getDefaultToolMode(tool: IAssistantAIToolDefinition) {
        return getAIDockDefaultToolMode(this.getRuntime(), tool);
    }

    private async saveSelectedProfileSettings(mutator: (settings: Record<string, unknown>, profile: IAssistantAIProfile) => void) {
        await saveSelectedAIDockProfileSettings(this.getRuntime(), mutator);
    }

    private async updateToolPolicyField(field: string, value: string) {
        await updateAIDockToolPolicyField(this.getRuntime(), field, value);
    }

    private async toggleToolEnabled(toolId: string, enabled: boolean) {
        await toggleAIDockToolEnabled(this.getRuntime(), toolId, enabled);
    }

    private async applyToolPolicyPreset(mode: "recommended" | "readonly" | "confirm-write") {
        await applyAIDockToolPolicyPreset(this.getRuntime(), mode);
    }

    private async switchProfile(profileId: string) {
        await switchAIDockProfile(this.getRuntime(), profileId);
    }

    private async searchTargetNotes(keyword: string) {
        await searchAIDockTargetNotes(this.getRuntime(), keyword);
    }

    private async selectTargetNote(rootID: string) {
        await selectAIDockTargetNote(this.getRuntime(), rootID);
    }

    private async handleAction(action: string, target?: HTMLElement) {
        await handleAIDockAction(this.getRuntime(), action, target);
    }

    private async refresh(loadMessages: boolean) {
        await refreshAIDock(this.getRuntime(), loadMessages);
    }

    private ensureSelection() {
        ensureAIDockSelection(this.getRuntime());
    }

    private getSelectedSession() {
        return getSelectedAIDockSession(this.getRuntime());
    }

    private getSelectedProfile() {
        return getSelectedAIDockProfile(this.getRuntime());
    }

    private async selectSession(sessionId: string) {
        await selectAIDockSession(this.getRuntime(), sessionId);
    }

    private async refreshToolCatalog(profileId: string) {
        await refreshAIDockToolCatalog(this.getRuntime(), profileId);
    }

    private async refreshAudits() {
        await refreshAIDockAudits(this.getRuntime());
    }

    private async refreshContextPreview() {
        await refreshAIDockContextPreview(this.getRuntime());
    }

    private async createSession() {
        await createAIDockSession(this.getRuntime());
    }

    private async renameCurrentSession() {
        await renameCurrentAIDockSession(this.getRuntime());
    }

    private async clearCurrentSession() {
        await clearCurrentAIDockSession(this.getRuntime());
    }

    private async deleteCurrentSession() {
        await deleteCurrentAIDockSession(this.getRuntime());
    }

    private async clearAllSessions() {
        await clearAllAIDockSessions(this.getRuntime());
    }

    private async sendMessage() {
        await sendAIDockMessage(this.getRuntime());
    }

    private async confirmTool(messageId: string, toolIndex: number) {
        await confirmAIDockTool(this.getRuntime(), messageId, toolIndex);
    }

    private async rejectTool(messageId: string, toolIndex: number) {
        await rejectAIDockTool(this.getRuntime(), messageId, toolIndex);
    }

    private async applyToolPatch(messageId: string, toolIndex: number, operationId = "") {
        await applyAIDockToolPatch(this.getRuntime(), messageId, toolIndex, operationId);
    }

    private rejectToolPatch(messageId: string, toolIndex: number, operationId = "") {
        rejectAIDockToolPatch(this.getRuntime(), messageId, toolIndex, operationId);
    }

    private async startAgentFromDraft() {
        await startAIDockAgentFromDraft(this.getRuntime());
    }

    private async runAgentTask(taskId: string) {
        await runAIDockAgentTask(this.getRuntime(), taskId);
    }

    private pauseAgentTask(taskId: string) {
        pauseAIDockAgentTask(this.getRuntime(), taskId);
    }

    private cancelAgentTask(taskId: string) {
        cancelAIDockAgentTask(this.getRuntime(), taskId);
    }

    private async retryAgentTaskItem(taskId: string, itemId: string) {
        await retryAIDockAgentTaskItem(this.getRuntime(), taskId, itemId);
    }

    private async applyAgentPatch(taskId: string, itemId: string, operationId = "") {
        await applyAIDockAgentPatch(this.getRuntime(), taskId, itemId, operationId);
    }

    private rejectAgentPatch(taskId: string, itemId: string, operationId = "") {
        rejectAIDockAgentPatch(this.getRuntime(), taskId, itemId, operationId);
    }

    private async saveTranscript() {
        await saveAIDockTranscript(this.getRuntime());
    }

    private async saveAnalysis() {
        await saveAIDockAnalysis(this.getRuntime());
    }

    private async insertLastReply() {
        await insertAIDockLastReply(this.getRuntime());
    }

    private upsertSession(session: IAssistantAISession) {
        upsertAIDockSession(this.getRuntime(), session);
    }

    private buildRenderContext(): IAssistantAIDockRenderContext {
        return {
            element: this.element,
            profiles: this.profiles,
            sessions: this.sessions,
            messages: this.messages,
            toolCatalog: this.toolCatalog,
            toolPolicy: this.toolPolicy,
            audits: this.audits,
            currentNotePreview: this.currentNotePreview as never,
            pinnedNotePreview: this.pinnedNotePreview as never,
            selectedSessionId: this.selectedSessionId,
            selectedProfileId: this.selectedProfileId,
            includeCurrentNote: this.includeCurrentNote,
            enableTools: this.enableTools,
            draftMessage: this.draftMessage,
            attachments: this.attachments,
            noteSearchKeyword: this.noteSearchKeyword,
            noteSearchResults: this.noteSearchResults as never,
            noteSearchLoading: this.noteSearchLoading,
            activePanel: this.activePanel,
            sessionsCollapsed: this.sessionsCollapsed,
            loading: this.loading,
            sending: this.sending,
            savingProfile: this.savingProfile,
            editingMessageId: this.editingMessageId,
            getSelectedProfile: () => this.getSelectedProfile(),
            getSelectedSession: () => this.getSelectedSession(),
            getMessageById: (messageId: string) => this.getMessageById(messageId),
            getEffectiveContextPreview: () => this.getEffectiveContextPreview() as never,
            getAttachmentSummary: (count: number) => this.getAttachmentSummary(count),
            getMessageAttachments: (item: TAssistantAIMessageItem) => this.getMessageAttachments(item),
            isMessageExpandable: (item: TAssistantAIMessageItem) => this.isMessageExpandable(item),
            isMessageExpanded: (messageId: string) => this.isMessageExpanded(messageId),
            getMessageDisplayContent: (item: TAssistantAIMessageItem, attachments: IAssistantAIInputAttachment[]) => this.getMessageDisplayContent(item, attachments),
            getDefaultToolMode: (tool: IAssistantAIToolDefinition) => this.getDefaultToolMode(tool),
        };
    }

    private render() {
        renderAssistantAIDock(this.buildRenderContext());
    }

    private scrollToBottom() {
        scrollAIDockToBottom(this.getRuntime());
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
