import {openSettingTab} from "../../config";
import {Constants} from "../../constants";
import {openFileById} from "../../editor/util";
import type {IAssistantAIDockRuntime} from "./AIDockContract";
import {getImageFilesFromDataTransfer, TAssistantAIFloatingPanel} from "./AIDockShared";
import {
    reapplyAssistantOperationHistoryItem,
    rollbackAssistantOperationHistoryItem,
    syncAssistantOperationHistoryFromBackend,
} from "../history/operations";
import {detectMentionTrigger, searchAndShowMentions, insertMentionChip} from "../mentions/trigger";
import type {IMentionSource} from "../mentions/types";
import type {TSecurityMode} from "../security/types";

export const bindAIDockEvents = (ctx: IAssistantAIDockRuntime) => {
    ctx.element.addEventListener("click", (event: MouseEvent) => {
        let target = event.target as HTMLElement;

        if (ctx.securityDropdownVisible) {
            if (!target.closest("[data-role=\"security-dropdown\"]") && !target.closest("[data-action=\"toggle-security-mode\"]")) {
                ctx.securityDropdownVisible = false;
                ctx.render();
                return;
            }
        }

        if (ctx.mentionState.active) {
            if (!target.closest("[data-role=\"message\"]") && !target.closest("[data-role=\"mention-popover\"]")) {
                ctx.mentionState.active = false;
                ctx.mentionState.results = [];
                ctx.render();
            }
        }

        while (target && !target.isEqualNode(ctx.element)) {
            const noteRootID = target.getAttribute("data-note-root-id");
            if (noteRootID) {
                void ctx.selectTargetNote(noteRootID);
                event.preventDefault();
                return;
            }
            const profileId = target.getAttribute("data-profile-id");
            if (profileId) {
                void ctx.switchProfile(profileId);
                event.preventDefault();
                return;
            }
            if (target.getAttribute("data-action") === "confirm-tool") {
                const messageId = target.getAttribute("data-message-id") || "";
                const toolIndex = parseInt(target.getAttribute("data-tool-index") || "-1", 10);
                void ctx.confirmTool(messageId, toolIndex);
                event.preventDefault();
                return;
            }
            if (target.getAttribute("data-action") === "reject-tool") {
                const messageId = target.getAttribute("data-message-id") || "";
                const toolIndex = parseInt(target.getAttribute("data-tool-index") || "-1", 10);
                void ctx.rejectTool(messageId, toolIndex);
                event.preventDefault();
                return;
            }
            const sessionId = target.getAttribute("data-session-id");
            if (sessionId) {
                ctx.activePanel = "";
                void ctx.selectSession(sessionId);
                event.preventDefault();
                return;
            }
            const action = target.getAttribute("data-action");
            if (action) {
                if (action === "remove-attachment") {
                    ctx.removeComposerAttachment(target.getAttribute("data-attachment-id") || "");
                    event.preventDefault();
                    return;
                }
                if (action === "open-source-note") {
                    const noteId = target.getAttribute("data-note-id") || "";
                    if (noteId) {
                        void openFileById({
                            app: ctx.app,
                            id: noteId,
                            action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL],
                        });
                    }
                    event.preventDefault();
                    return;
                }
                if (action === "select-mention") {
                    const index = parseInt(target.getAttribute("data-mention-index") || "0", 10);
                    const result = ctx.mentionState.results[index];
                    const textarea = ctx.element.querySelector("[data-role='message']") as HTMLTextAreaElement;
                    if (result && textarea) {
                        const {newValue, newCursorPos} = insertMentionChip(textarea, result);
                        textarea.value = newValue;
                        textarea.selectionStart = newCursorPos;
                        textarea.selectionEnd = newCursorPos;
                        ctx.draftMessage = newValue;
                        const source: IMentionSource = {
                            id: result.id,
                            type: result.type,
                            title: result.title,
                            notebook: result.notebook,
                            path: result.path,
                            hPath: result.hPath,
                            included: true,
                        };
                        ctx.mentionState.active = false;
                        ctx.mentionState.results = [];
                        ctx.addSource(source);
                    }
                    event.preventDefault();
                    return;
                }
                if (action === "toggle-source") {
                    const index = parseInt(target.getAttribute("data-source-index") || "0", 10);
                    ctx.toggleSourceIncluded(index);
                    event.preventDefault();
                    ctx.render();
                    return;
                }
                if (action === "toggle-source-child") {
                    const sourceIndex = parseInt(target.getAttribute("data-source-index") || "0", 10);
                    const childIndex = parseInt(target.getAttribute("data-child-index") || "0", 10);
                    ctx.toggleSourceChildIncluded(sourceIndex, childIndex);
                    event.preventDefault();
                    ctx.render();
                    return;
                }
                if (action === "toggle-source-expand") {
                    const index = parseInt(target.getAttribute("data-source-index") || "0", 10);
                    ctx.toggleSourceExpanded(index);
                    event.preventDefault();
                    ctx.render();
                    return;
                }
                if (action === "toggle-sources-panel") {
                    ctx.toggleSourcesPanel();
                    event.preventDefault();
                    ctx.render();
                    return;
                }
                if (action === "toggle-security-mode") {
                    ctx.toggleSecurityDropdown();
                    event.preventDefault();
                    ctx.render();
                    return;
                }
                if (action === "set-security-mode") {
                    const mode = target.getAttribute("data-mode") as TSecurityMode;
                    if (mode) {
                        ctx.setSecurityMode(mode);
                    }
                    event.preventDefault();
                    ctx.render();
                    return;
                }
                if (action === "set-conversation-mode") {
                    const mode = target.getAttribute("data-mode");
                    if (mode === "ask" || mode === "chat" || mode === "agent") {
                        ctx.setConversationMode(mode);
                    }
                    event.preventDefault();
                    return;
                }
                if (action === "toggle-panel") {
                    const panel = (target.getAttribute("data-panel") || "") as TAssistantAIFloatingPanel;
                    ctx.toggleFloatingPanel(panel);
                    if (panel === "agent") {
                        void syncAssistantOperationHistoryFromBackend().then(() => ctx.render());
                    }
                    event.preventDefault();
                    return;
                }
                void ctx.handleAction(action, target);
                event.preventDefault();
                return;
            }
            target = target.parentElement;
        }
    });

    ctx.element.addEventListener("input", (event: Event) => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        const role = target.getAttribute("data-role");
        if (role === "message") {
            ctx.draftMessage = target.value;
            if (target instanceof HTMLTextAreaElement) {
                const mentionInfo = detectMentionTrigger(target, target.value, target.selectionStart);
                if (mentionInfo) {
                    ctx.mentionState.active = true;
                    ctx.mentionState.query = mentionInfo.query;
                    ctx.mentionState.seq++;
                    void searchAndShowMentions(mentionInfo.query, ctx.mentionState.seq, ctx.mentionState, ctx.securityMode, () => {
                        ctx.render();
                    });
                } else {
                    if (ctx.mentionState.active) {
                        ctx.mentionState.active = false;
                        ctx.mentionState.results = [];
                    }
                }
            }
            return;
        }
        if (role === "note-search") {
            ctx.noteSearchKeyword = target.value;
            void ctx.searchTargetNotes(ctx.noteSearchKeyword);
            return;
        }
        if (role === "message-attachments" && target instanceof HTMLInputElement && target.files?.length) {
            void ctx.addComposerAttachments(Array.from(target.files));
            target.value = "";
            return;
        }
    });

    ctx.element.addEventListener("change", (event: Event) => {
        const target = event.target as HTMLInputElement | HTMLSelectElement;
        const role = target.getAttribute("data-role");
        if (role === "profile") {
            void ctx.switchProfile(target.value);
            return;
        }
        const policy = target.getAttribute("data-policy");
        if (policy) {
            void ctx.updateToolPolicyField(policy, target.value);
            return;
        }
        const toolToggle = target.getAttribute("data-tool-toggle");
        if (toolToggle && target instanceof HTMLInputElement) {
            void ctx.toggleToolEnabled(toolToggle, target.checked);
            return;
        }
        if (role === "include-current-note" && target instanceof HTMLInputElement) {
            if (target.checked) {
                void ctx.followCurrentNote();
            } else {
                ctx.clearTargetNote();
            }
            return;
        }
        if (role === "enable-tools" && target instanceof HTMLInputElement) {
            ctx.enableTools = target.checked;
            ctx.render();
        }
    });

    ctx.element.addEventListener("keydown", (event: KeyboardEvent) => {
        const target = event.target as HTMLElement;
        if (target.getAttribute("data-role") === "message" && ctx.mentionState.active && ctx.mentionState.results.length > 0) {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                ctx.mentionState.selectedIndex = (ctx.mentionState.selectedIndex + 1) % ctx.mentionState.results.length;
                ctx.render();
                return;
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                ctx.mentionState.selectedIndex = (ctx.mentionState.selectedIndex - 1 + ctx.mentionState.results.length) % ctx.mentionState.results.length;
                ctx.render();
                return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                const result = ctx.mentionState.results[ctx.mentionState.selectedIndex];
                if (result && target instanceof HTMLTextAreaElement) {
                    const {newValue, newCursorPos} = insertMentionChip(target, result);
                    target.value = newValue;
                    target.selectionStart = newCursorPos;
                    target.selectionEnd = newCursorPos;
                    ctx.draftMessage = newValue;
                    const source: IMentionSource = {
                        id: result.id,
                        type: result.type,
                        title: result.title,
                        notebook: result.notebook,
                        path: result.path,
                        hPath: result.hPath,
                        included: true,
                    };
                    ctx.mentionState.active = false;
                    ctx.mentionState.results = [];
                    ctx.addSource(source);
                }
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                ctx.mentionState.active = false;
                ctx.mentionState.results = [];
                ctx.render();
                return;
            }
        }
        if (target.getAttribute("data-role") === "message" && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            void ctx.sendMessage();
            return;
        }
        if (target.getAttribute("data-role") === "message" && event.key === "Escape") {
            event.preventDefault();
            if (ctx.sending) {
                ctx.stopGenerating();
                return;
            }
            if (ctx.editingMessageId) {
                ctx.clearEditingMessage(true);
                ctx.render();
                ctx.focusComposer();
                return;
            }
            target.blur();
            return;
        }
        if (target.getAttribute("data-role") === "note-search" && event.key === "Enter" && !event.isComposing) {
            const first = ctx.noteSearchResults[0];
            if (!first) {
                return;
            }
            event.preventDefault();
            void ctx.selectTargetNote(first.rootID);
            return;
        }
        if (target.getAttribute("data-role") === "note-search" && event.key === "Escape") {
            event.preventDefault();
            ctx.noteSearchKeyword = "";
            ctx.noteSearchResults = [];
            ctx.noteSearchLoading = false;
            ctx.render();
            return;
        }
        if (event.key === "Escape" && ctx.securityDropdownVisible) {
            event.preventDefault();
            ctx.securityDropdownVisible = false;
            ctx.render();
            return;
        }
        if (event.key === "Escape" && !ctx.sessionsCollapsed) {
            event.preventDefault();
            ctx.sessionsCollapsed = true;
            ctx.render();
            return;
        }
        if (event.key === "Escape" && ctx.activePanel) {
            event.preventDefault();
            ctx.activePanel = "";
            ctx.render();
        }
    });

    ctx.element.addEventListener("paste", (event: ClipboardEvent) => {
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
        void ctx.addComposerAttachments(files);
    });

    ctx.element.addEventListener("dragover", (event: DragEvent) => {
        const target = event.target as HTMLElement;
        if (!target?.closest(".assistant-ai__composer-card")) {
            return;
        }
        const files = getImageFilesFromDataTransfer(event.dataTransfer);
        if (!files.length) {
            return;
        }
        event.preventDefault();
        ctx.setComposerDropActive(true);
    });

    ctx.element.addEventListener("dragleave", (event: DragEvent) => {
        const target = event.target as HTMLElement;
        if (!target?.closest(".assistant-ai__composer-card")) {
            return;
        }
        ctx.setComposerDropActive(false);
    });

    ctx.element.addEventListener("drop", (event: DragEvent) => {
        const target = event.target as HTMLElement;
        if (!target?.closest(".assistant-ai__composer-card")) {
            return;
        }
        const files = getImageFilesFromDataTransfer(event.dataTransfer);
        ctx.setComposerDropActive(false);
        if (!files.length) {
            return;
        }
        event.preventDefault();
        void ctx.addComposerAttachments(files);
    });
};

export const handleAIDockAction = async (ctx: IAssistantAIDockRuntime, action: string, target?: HTMLElement) => {
    const messageId = target?.getAttribute("data-message-id") || target?.closest<HTMLElement>(".assistant-ai__message")?.getAttribute("data-message-id") || "";
    const toolIndex = parseInt(target?.getAttribute("data-tool-index") || target?.closest<HTMLElement>(".assistant-ai__tool-result")?.getAttribute("data-tool-index") || "-1", 10);
    const operationId = target?.getAttribute("data-op-id") || "";
    const taskId = target?.getAttribute("data-task-id") || "";
    const itemId = target?.getAttribute("data-item-id") || "";
    const sessionTargetId = target?.getAttribute("data-session-target-id") || "";
    switch (action) {
        case "open-profiles":
        case "configure-profile":
            ctx.activePanel = "";
            ctx.sessionsCollapsed = true;
            ctx.render();
            openSettingTab(ctx.app, "AI");
            return;
        case "new-session":
            await ctx.createSession();
            return;
        case "dismiss-sessions":
            ctx.sessionsCollapsed = true;
            ctx.render();
            return;
        case "toggle-sessions":
            if (ctx.sessionsCollapsed) {
                ctx.activePanel = "";
            }
            ctx.sessionsCollapsed = !ctx.sessionsCollapsed;
            ctx.render();
            return;
        case "rename-session":
            ctx.activePanel = "";
            ctx.render();
            await ctx.renameCurrentSession();
            return;
        case "clear-session":
            ctx.activePanel = "";
            ctx.render();
            await ctx.clearCurrentSession();
            return;
        case "delete-session":
            ctx.activePanel = "";
            ctx.render();
            await ctx.deleteCurrentSession();
            return;
        case "delete-session-by-id":
            await ctx.deleteSession(sessionTargetId);
            return;
        case "toggle-session-pin":
            await ctx.setSessionPinned(sessionTargetId, target?.getAttribute("data-pinned") !== "true");
            return;
        case "clear-all-sessions":
            await ctx.clearAllSessions();
            return;
        case "save-transcript":
            await ctx.saveTranscript();
            return;
        case "analyze-session":
            await ctx.saveAnalysis();
            return;
        case "insert-last-reply":
            await ctx.insertLastReply();
            return;
        case "refresh-audits":
            await ctx.refreshAudits();
            return;
        case "accept-tool-patch-op":
            await ctx.applyToolPatch(messageId, toolIndex, operationId);
            return;
        case "accept-tool-patch-all":
            await ctx.applyToolPatch(messageId, toolIndex);
            return;
        case "reject-tool-patch-op":
            ctx.rejectToolPatch(messageId, toolIndex, operationId);
            return;
        case "reject-tool-patch-all":
            ctx.rejectToolPatch(messageId, toolIndex);
            return;
        case "start-agent-from-draft":
            await ctx.startAgentFromDraft();
            return;
        case "pause-agent-task":
            await ctx.pauseAgentTask(taskId);
            return;
        case "resume-agent-task":
            await ctx.runAgentTask(taskId);
            return;
        case "cancel-agent-task":
            await ctx.cancelAgentTask(taskId);
            return;
        case "retry-agent-item":
            await ctx.retryAgentTaskItem(taskId, itemId);
            return;
        case "accept-agent-patch-op":
            await ctx.applyAgentPatch(taskId, itemId, operationId);
            return;
        case "accept-agent-patch-all":
            await ctx.applyAgentPatch(taskId, itemId);
            return;
        case "reject-agent-patch-op":
            await ctx.rejectAgentPatch(taskId, itemId, operationId);
            return;
        case "reject-agent-patch-all":
            await ctx.rejectAgentPatch(taskId, itemId);
            return;
        case "rollback-history":
            await rollbackAssistantOperationHistoryItem(target?.getAttribute("data-history-id") || "");
            ctx.render();
            return;
        case "reapply-history":
            await reapplyAssistantOperationHistoryItem(target?.getAttribute("data-history-id") || "");
            ctx.render();
            return;
        case "pin-current-note":
            await ctx.pinCurrentNoteAsTarget();
            return;
        case "follow-current-note":
            await ctx.followCurrentNote();
            return;
        case "clear-target-note":
            ctx.clearTargetNote();
            return;
        case "tool-policy-recommended":
            await ctx.applyToolPolicyPreset("recommended");
            return;
        case "tool-policy-readonly":
            await ctx.applyToolPolicyPreset("readonly");
            return;
        case "tool-policy-confirm-write":
            await ctx.applyToolPolicyPreset("confirm-write");
            return;
        case "pick-attachments":
            ctx.openComposerAttachmentPicker();
            return;
        case "copy-message":
            ctx.copyMessage(messageId);
            return;
        case "edit-message":
            ctx.startEditingMessage(messageId);
            return;
        case "cancel-edit-message":
            ctx.clearEditingMessage(true);
            ctx.render();
            ctx.focusComposer();
            return;
        case "toggle-message-expand":
            ctx.toggleMessageExpanded(messageId);
            return;
        case "send-message":
            await ctx.sendMessage();
            return;
        case "stop-message":
            ctx.stopGenerating();
            return;
        default:
            return;
    }
};
