import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, truncateText} from "../common/dom";
import {captureInputFocus, restoreInputFocus} from "../common/inputStability";
import {IAssistantAIInputAttachment, IAssistantAIMessage, IAssistantAIProfile, IAssistantAISession, IAssistantAIToolAudit, IAssistantAIToolDefinition, IAssistantAIToolPolicy} from "./api";
import type {IAssistantAINotePreview} from "./AIDockContract";
import type {IMentionSource} from "../mentions/types";
import type {IMentionTriggerState} from "../mentions/trigger";
import type {TSecurityMode} from "../security/types";
import {renderMentionPopover} from "../mentions/trigger";
import {renderSourcesPanel} from "../sources/panel";
import {renderSecurityModeSwitcher, renderSecurityModeDropdown} from "../security/modeSwitcher";
import {
    getAssistantAIConversationModeHint,
    getAssistantAIConversationModeLabel,
    TAssistantAIConversationMode,
    TAssistantAIFloatingPanel,
    TAssistantAIMessageItem,
} from "./AIDockShared";
import {
    buildAIDockHoverHint,
    getAIDockContextSummary,
    getAIDockNewSessionHint,
    getAIDockProfilesConfigHint,
    getAIDockSessionItemHint,
    getAIDockSessionPanelHint,
    getAIDockSessionsToggleHint,
    getAIDockTargetLockGlyph,
    getAIDockTargetLockLabel,
    getAIDockTargetSummary,
    isAIDockTargetPinned,
    renderAIDockQuickActions,
    renderAIDockSessionActions,
    renderAIDockToolSummary,
} from "./AIDockRenderShared";
import {renderAIDockSessions} from "./AIDockRenderSessions";
import {renderAIDockMessages, renderAIDockMessageToolResults} from "./AIDockRenderMessages";
import {
    renderAIDockAttachmentList,
    renderAIDockComposerAttachments,
    renderAIDockContextStatus,
    renderAIDockModelLauncher,
} from "./AIDockRenderComposer";
import {
    renderAIDockAuditCard,
    renderAIDockContextCard,
    renderAIDockFloatingPanel,
    renderAIDockProfilesPanel,
    renderAIDockSessionPanel,
    renderAIDockTargetNoteCard,
    renderAIDockToolsPanel,
} from "./AIDockRenderPanels";

interface IAssistantAINoteSearchResult {
    rootID: string;
    title: string;
    path: string;
}

const AI_DOCK_RESTORABLE_INPUT_ROLES = ["message", "note-search"] as const;

export interface IAssistantAIDockRenderContext {
    element: HTMLElement;
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
    conversationMode: TAssistantAIConversationMode;
    draftMessage: string;
    attachments: IAssistantAIInputAttachment[];
    noteSearchKeyword: string;
    noteSearchResults: IAssistantAINoteSearchResult[];
    noteSearchLoading: boolean;
    activePanel: TAssistantAIFloatingPanel;
    sessionsCollapsed: boolean;
    loading: boolean;
    sending: boolean;
    savingProfile: boolean;
    editingMessageId: string;
    sources: IMentionSource[];
    sourcesPanelVisible: boolean;
    mentionState: IMentionTriggerState;
    securityMode: TSecurityMode;
    securityDropdownVisible: boolean;
    activeRequestController: AbortController | null;
    userStoppedGenerating: boolean;
    getSelectedProfile(): IAssistantAIProfile | undefined;
    getSelectedSession(): IAssistantAISession | undefined;
    getMessageById(messageId: string): TAssistantAIMessageItem | undefined;
    getEffectiveContextPreview(): IAssistantAINotePreview | null;
    getAttachmentSummary(count: number): string;
    getMessageAttachments(item: TAssistantAIMessageItem): IAssistantAIInputAttachment[];
    isMessageExpandable(item: TAssistantAIMessageItem): boolean;
    isMessageExpanded(messageId: string): boolean;
    getMessageDisplayContent(item: TAssistantAIMessageItem, attachments: IAssistantAIInputAttachment[]): string;
    getDefaultToolMode(tool: IAssistantAIToolDefinition): string;
}

export type TAssistantAIDockRenderRuntime = IAssistantAIDockRenderContext & {
    render: (...args: any[]) => any;
    renderSessions: (...args: any[]) => any;
    renderMessages: (...args: any[]) => any;
    getTargetSummary: (...args: any[]) => any;
    getContextSummary: (...args: any[]) => any;
    isTargetPinned: (...args: any[]) => any;
    getTargetLockGlyph: (...args: any[]) => any;
    getTargetLockLabel: (...args: any[]) => any;
    buildHoverHint: (...args: any[]) => any;
    getSessionsToggleHint: (...args: any[]) => any;
    getNewSessionHint: (...args: any[]) => any;
    getSessionPanelHint: (...args: any[]) => any;
    getProfilesConfigHint: (...args: any[]) => any;
    getSessionItemHint: (...args: any[]) => any;
    renderQuickActions: (...args: any[]) => any;
    renderSessionActions: (...args: any[]) => any;
    renderContextStatus: (...args: any[]) => any;
    renderComposerAttachments: (...args: any[]) => any;
    renderAttachmentList: (...args: any[]) => any;
    renderModelLauncher: (...args: any[]) => any;
    renderFloatingPanel: (...args: any[]) => any;
    renderSessionPanel: (...args: any[]) => any;
    renderProfilesPanel: (...args: any[]) => any;
    renderToolSummary: (...args: any[]) => any;
    renderTargetNoteCard: (...args: any[]) => any;
    renderContextCard: (...args: any[]) => any;
    renderAuditCard: (...args: any[]) => any;
    renderToolsPanel: (...args: any[]) => any;
    renderMessageToolResults: (...args: any[]) => any;
};

const renderConversationModeSwitch = (ctx: TAssistantAIDockRenderRuntime) => {
    const modes: TAssistantAIConversationMode[] = ["ask", "chat", "agent"];
    return `<div class="assistant-ai__mode-switch" role="group" aria-label="${escapeAttr(assistantText("AI 模式", "AI mode"))}">
        ${modes.map((mode) => {
        const active = ctx.conversationMode === mode;
        const hint = getAssistantAIConversationModeHint(mode);
        return `<button type="button" class="assistant-ai__mode-button${active ? " assistant-ai__mode-button--active" : ""}" data-action="set-conversation-mode" data-mode="${mode}" aria-label="${escapeAttr(hint)}" title="${escapeAttr(hint)}">${escapeHTML(getAssistantAIConversationModeLabel(mode))}</button>`;
    }).join("")}
    </div>`;
};

const createRenderRuntime = (ctx: IAssistantAIDockRenderContext): TAssistantAIDockRenderRuntime => {
    const runtime = ctx as TAssistantAIDockRenderRuntime;
    runtime.render = () => render(runtime);
    runtime.renderSessions = () => renderAIDockSessions(runtime);
    runtime.renderMessages = () => renderAIDockMessages(runtime);
    runtime.getTargetSummary = () => getAIDockTargetSummary(runtime);
    runtime.getContextSummary = () => getAIDockContextSummary(runtime);
    runtime.isTargetPinned = () => isAIDockTargetPinned(runtime);
    runtime.getTargetLockGlyph = () => getAIDockTargetLockGlyph(runtime);
    runtime.getTargetLockLabel = () => getAIDockTargetLockLabel(runtime);
    runtime.buildHoverHint = (summary: string, action: string) => buildAIDockHoverHint(runtime, summary, action);
    runtime.getSessionsToggleHint = () => getAIDockSessionsToggleHint(runtime);
    runtime.getNewSessionHint = () => getAIDockNewSessionHint(runtime);
    runtime.getSessionPanelHint = () => getAIDockSessionPanelHint(runtime);
    runtime.getProfilesConfigHint = () => getAIDockProfilesConfigHint(runtime);
    runtime.getSessionItemHint = (item: IAssistantAISession) => getAIDockSessionItemHint(runtime, item);
    runtime.renderQuickActions = () => renderAIDockQuickActions(runtime);
    runtime.renderSessionActions = (session?: IAssistantAISession) => renderAIDockSessionActions(runtime, session);
    runtime.renderContextStatus = () => renderAIDockContextStatus(runtime);
    runtime.renderComposerAttachments = () => renderAIDockComposerAttachments(runtime);
    runtime.renderAttachmentList = (attachments: IAssistantAIInputAttachment[], composer = false) => renderAIDockAttachmentList(runtime, attachments, composer);
    runtime.renderModelLauncher = (profile?: IAssistantAIProfile) => renderAIDockModelLauncher(runtime, profile);
    runtime.renderFloatingPanel = () => renderAIDockFloatingPanel(runtime);
    runtime.renderSessionPanel = () => renderAIDockSessionPanel(runtime);
    runtime.renderProfilesPanel = () => renderAIDockProfilesPanel(runtime);
    runtime.renderToolSummary = () => renderAIDockToolSummary(runtime);
    runtime.renderTargetNoteCard = () => renderAIDockTargetNoteCard(runtime);
    runtime.renderContextCard = () => renderAIDockContextCard(runtime);
    runtime.renderAuditCard = () => renderAIDockAuditCard(runtime);
    runtime.renderToolsPanel = () => renderAIDockToolsPanel(runtime);
    runtime.renderMessageToolResults = (item: IAssistantAIMessage) => renderAIDockMessageToolResults(runtime, item);
    return runtime;
};

const render = (ctx: TAssistantAIDockRenderRuntime) => {
    const focusSnapshot = captureInputFocus(ctx.element, AI_DOCK_RESTORABLE_INPUT_ROLES);
    const profile = ctx.getSelectedProfile();
    const session = ctx.getSelectedSession();
    const editingMessage = ctx.editingMessageId ? ctx.getMessageById(ctx.editingMessageId) : null;
    const sessionTitle = session?.title || (ctx.messages.length ? assistantText("当前对话", "Current chat") : assistantText("新对话", "New chat"));
    const profilesConfigHint = ctx.getProfilesConfigHint();
    const sessionsBackdropHint = ctx.getSessionsToggleHint();
    const hasProfile = !!ctx.profiles.length;
    const canSend = hasProfile && !ctx.sending && (!!ctx.draftMessage.trim() || !!ctx.attachments.length);
    const composerHint = hasProfile
        ? getAssistantAIConversationModeHint(ctx.conversationMode)
        : assistantText("请先配置 AI 提供商和模型，配置完成后即可开始对话。", "Configure an AI provider and model before chatting.");
    const composerPlaceholder = hasProfile
        ? assistantText("输入消息或直接发图片，Enter 发送，Shift+Enter 换行", "Type a message or just send images. Enter to send, Shift+Enter for newline")
        : assistantText("配置 AI 后即可开始对话", "Set up AI before chatting");
    ctx.element.innerHTML = `<div class="assistant-dock__header">
    <div class="assistant-dock__header-main">
        <div class="assistant-dock__headline">
            <div class="assistant-dock__title">${assistantText("AI 助手", "AI Assistant")}</div>
            <div class="assistant-dock__summary">${ctx.renderToolSummary()}</div>
        </div>
    </div>
    <div class="assistant-dock__header-actions">
        <button type="button" class="assistant-dock__header-icon" data-action="open-profiles" aria-label="${escapeAttr(profilesConfigHint)}" title="${escapeAttr(profilesConfigHint)}">
            <svg><use xlink:href="#iconSettings"></use></svg>
        </button>
    </div>
</div>
<div class="assistant-ai fn__flex-1">
    ${ctx.sessionsCollapsed ? "" : `<button type="button" class="assistant-ai__sessions-backdrop" data-action="dismiss-sessions" aria-label="${escapeAttr(sessionsBackdropHint)}"></button>`}
    <div class="assistant-ai__sessions${ctx.sessionsCollapsed ? " assistant-ai__sessions--collapsed" : ""}">${ctx.sessionsCollapsed ? "" : ctx.renderSessions()}</div>
    <div class="assistant-ai__main fn__flex-column">
        <div class="assistant-ai__topbar">
            <div class="assistant-ai__conversation">
                <div class="assistant-ai__conversation-title">${escapeHTML(truncateText(sessionTitle, 58))}</div>
            </div>
            <div class="assistant-ai__conversation-actions">
                <div class="assistant-ai__security-mode-wrap">
                    ${renderSecurityModeSwitcher(ctx.securityMode)}
                    ${renderSecurityModeDropdown(ctx.securityMode, ctx.securityDropdownVisible)}
                </div>
                ${ctx.renderSessionActions(session)}
            </div>
        </div>
        <div class="assistant-ai__toolbar">
            ${ctx.renderQuickActions()}
        </div>
        ${ctx.renderFloatingPanel()}
        <div class="assistant-ai__messages fn__flex-1">${ctx.renderMessages()}</div>
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
                    ${ctx.renderComposerAttachments()}
                    ${ctx.sourcesPanelVisible ? renderSourcesPanel(ctx.sources) : ""}
                    ${renderConversationModeSwitch(ctx)}
                    <div class="assistant-ai__composer-hint">${escapeHTML(composerHint)}</div>
                    <textarea class="b3-text-field assistant-ai__textarea" data-role="message" placeholder="${escapeAttr(composerPlaceholder)}"${hasProfile ? "" : " disabled"}>${escapeAttr(ctx.draftMessage)}</textarea>
                    ${renderMentionPopover(ctx.mentionState)}
                    <div class="assistant-ai__composer-bottom">
                        <div class="assistant-ai__launcher-group">
                            ${ctx.renderModelLauncher(profile)}
                            <button type="button" class="assistant-ai__icon-button assistant-ai__icon-button--compact" data-action="pick-attachments" aria-label="${escapeAttr(assistantText("上传图片", "Upload images"))}" title="${escapeAttr(assistantText("上传图片", "Upload images"))}"${hasProfile ? "" : " disabled"}>
                                <svg><use xlink:href="#iconImage"></use></svg>
                            </button>
                            <button type="button" class="assistant-ai__icon-button assistant-ai__icon-button--compact" data-action="open-profiles" aria-label="${escapeAttr(profilesConfigHint)}" title="${escapeAttr(profilesConfigHint)}">
                                <svg><use xlink:href="#iconSettings"></use></svg>
                            </button>
                            <input class="fn__none" type="file" data-role="message-attachments" accept="image/*" multiple>
                        </div>
                        <div class="assistant-ai__composer-main-actions">
                            ${hasProfile ? "" : `<button type="button" class="b3-button b3-button--outline assistant-ai__send-button" data-action="configure-profile">${assistantText("配置 AI", "Set up AI")}</button>`}
                            ${ctx.sending
        ? `<button type="button" class="b3-button b3-button--outline assistant-ai__send-button assistant-ai__send-button--stop" data-action="stop-message">${assistantText("停止", "Stop")}</button>`
        : `<button type="button" class="b3-button b3-button--outline assistant-ai__send-button" data-action="send-message"${canSend ? "" : " disabled"}>${editingMessage ? assistantText("保存并重生成", "Save & Regenerate") : assistantText("发送", "Send")}</button>`}
                        </div>
                    </div>
                </div>
                <div class="assistant-ai__composer-meta">
                    <div class="assistant-ai__utility-actions">
                        <button type="button" class="assistant-ai__utility-button" data-action="save-transcript"${ctx.messages.length ? "" : " disabled"}>${assistantText("保存对话", "Save Transcript")}</button>
                        <button type="button" class="assistant-ai__utility-button" data-action="analyze-session"${ctx.messages.length ? "" : " disabled"}>${assistantText("分析并保存", "Analyze & Save")}</button>
                        <button type="button" class="assistant-ai__utility-button" data-action="insert-last-reply"${ctx.messages.find((item) => item.role === "assistant") ? "" : " disabled"}>${assistantText("插入回复", "Insert Reply")}</button>
                    </div>
                    <div class="assistant-ai__context-status">${ctx.renderContextStatus()}</div>
                </div>
            </div>
        </div>
    </div>
</div>`;
    restoreInputFocus(ctx.element, focusSnapshot);
};

export const renderAssistantAIDock = (ctx: IAssistantAIDockRenderContext) => {
    const runtime = createRenderRuntime(ctx);
    runtime.render();
};
