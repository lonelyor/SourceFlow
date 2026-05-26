import type {App} from "../../index";
import type {IAssistantNoteCandidate, ICurrentNoteContext} from "../common/note";
import type {
    IAssistantAIInputAttachment,
    IAssistantAIProfile,
    IAssistantAIProviderType,
    IAssistantAISession,
    IAssistantAIToolAudit,
    IAssistantAIToolDefinition,
    IAssistantAIToolPolicy,
} from "./api";
import type {TAssistantAIFloatingPanel, TAssistantAIMessageItem} from "./AIDockShared";

export type IAssistantAINotePreview = ICurrentNoteContext;

export type TAssistantAIToolPolicyPreset = "recommended" | "readonly" | "confirm-write";

export interface IAssistantAIDockRuntime {
    app: App;
    element: HTMLElement;
    providers: IAssistantAIProviderType[];
    profiles: IAssistantAIProfile[];
    sessions: IAssistantAISession[];
    messages: TAssistantAIMessageItem[];
    toolCatalog: IAssistantAIToolDefinition[];
    toolPolicy: IAssistantAIToolPolicy | null;
    audits: IAssistantAIToolAudit[];
    currentNotePreview: IAssistantAINotePreview | null;
    pinnedNotePreview: IAssistantAINotePreview | null;
    selectedSessionId: string;
    selectedProfileId: string;
    includeCurrentNote: boolean;
    enableTools: boolean;
    draftMessage: string;
    attachments: IAssistantAIInputAttachment[];
    noteSearchKeyword: string;
    noteSearchResults: IAssistantNoteCandidate[];
    noteSearchLoading: boolean;
    noteSearchSeq: number;
    activePanel: TAssistantAIFloatingPanel;
    sessionsCollapsed: boolean;
    loading: boolean;
    sending: boolean;
    savingProfile: boolean;
    expandedMessageIds: Set<string>;
    editingMessageId: string;
    draftBackup: string;
    attachmentsBackup: IAssistantAIInputAttachment[] | null;
    render(): void;
    focusComposer(): void;
    scrollToBottom(): void;
    setComposerDropActive(active: boolean): void;
    getEffectiveContextPreview(): IAssistantAINotePreview | null;
    buildLocalMessage(role: "assistant" | "user", content: string, extra?: Partial<TAssistantAIMessageItem>): TAssistantAIMessageItem;
    cloneComposerAttachments(): IAssistantAIInputAttachment[];
    getAttachmentSummary(count: number): string;
    buildUserMessagePreview(message: string, attachments: IAssistantAIInputAttachment[]): string;
    getMessageById(messageId: string): TAssistantAIMessageItem | undefined;
    isMessageExpandable(item: TAssistantAIMessageItem): boolean;
    isMessageExpanded(messageId: string): boolean;
    toggleMessageExpanded(messageId: string): void;
    buildCollapsedMessageContent(content: string): string;
    getMessageDisplayContent(item: TAssistantAIMessageItem, attachments: IAssistantAIInputAttachment[]): string;
    buildMessageCopyText(item: TAssistantAIMessageItem): string;
    copyMessage(messageId: string): void;
    clearEditingMessage(restoreComposer: boolean): void;
    startEditingMessage(messageId: string): void;
    syncEditingMessageState(): void;
    getMessageAttachments(item: TAssistantAIMessageItem): IAssistantAIInputAttachment[];
    removeComposerAttachment(id: string): void;
    addComposerAttachments(files: File[]): Promise<void>;
    openComposerAttachmentPicker(): void;
    updateMessageContent(messageId: string, content: string): void;
    resolveMessageContext(): Promise<IAssistantAINotePreview | null>;
    pinCurrentNoteAsTarget(): Promise<void>;
    resetTargetSelection(includeCurrentNote: boolean): void;
    followCurrentNote(): Promise<void>;
    clearTargetNote(): void;
    toggleFloatingPanel(panel: TAssistantAIFloatingPanel): void;
    getSelectedProfileToolSettings(profile?: IAssistantAIProfile): Record<string, unknown>;
    getDefaultToolMode(tool: IAssistantAIToolDefinition): string;
    saveSelectedProfileSettings(mutator: (settings: Record<string, unknown>, profile: IAssistantAIProfile) => void): Promise<void>;
    updateToolPolicyField(field: string, value: string): Promise<void>;
    toggleToolEnabled(toolId: string, enabled: boolean): Promise<void>;
    applyToolPolicyPreset(mode: TAssistantAIToolPolicyPreset): Promise<void>;
    switchProfile(profileId: string): Promise<void>;
    searchTargetNotes(keyword: string): Promise<void>;
    selectTargetNote(rootID: string): Promise<void>;
    handleAction(action: string, target?: HTMLElement): Promise<void>;
    refresh(loadMessages: boolean): Promise<void>;
    ensureSelection(): void;
    getSelectedSession(): IAssistantAISession | undefined;
    getSelectedProfile(): IAssistantAIProfile | undefined;
    selectSession(sessionId: string): Promise<void>;
    refreshToolCatalog(profileId: string): Promise<void>;
    refreshAudits(): Promise<void>;
    refreshContextPreview(): Promise<void>;
    createSession(): Promise<void>;
    renameCurrentSession(): Promise<void>;
    clearCurrentSession(): Promise<void>;
    deleteCurrentSession(): Promise<void>;
    clearAllSessions(): Promise<void>;
    sendMessage(): Promise<void>;
    confirmTool(messageId: string, toolIndex: number): Promise<void>;
    rejectTool(messageId: string, toolIndex: number): Promise<void>;
    applyToolPatch(messageId: string, toolIndex: number, operationId?: string): Promise<void>;
    rejectToolPatch(messageId: string, toolIndex: number, operationId?: string): void;
    saveTranscript(): Promise<void>;
    saveAnalysis(): Promise<void>;
    insertLastReply(): Promise<void>;
    upsertSession(session: IAssistantAISession): void;
}
