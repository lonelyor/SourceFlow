import {openSettingTab} from "../../config";
import type {IAssistantAIDockRuntime} from "./AIDockContract";
import {getImageFilesFromDataTransfer, TAssistantAIFloatingPanel} from "./AIDockShared";
import {updateAssistantAgentTaskStatus} from "../agent/queue";
import {rollbackAssistantOperationHistoryItem} from "../history/operations";

export const bindAIDockEvents = (ctx: IAssistantAIDockRuntime) => {
    ctx.element.addEventListener("click", (event: MouseEvent) => {
        let target = event.target as HTMLElement;
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
                if (action === "toggle-panel") {
                    ctx.toggleFloatingPanel((target.getAttribute("data-panel") || "") as TAssistantAIFloatingPanel);
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
        if (target.getAttribute("data-role") === "message" && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            void ctx.sendMessage();
            return;
        }
        if (target.getAttribute("data-role") === "message" && event.key === "Escape") {
            event.preventDefault();
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
        case "pause-agent-task":
            updateAssistantAgentTaskStatus(target?.getAttribute("data-task-id") || "", "paused");
            ctx.render();
            return;
        case "resume-agent-task":
            updateAssistantAgentTaskStatus(target?.getAttribute("data-task-id") || "", "running");
            ctx.render();
            return;
        case "cancel-agent-task":
            updateAssistantAgentTaskStatus(target?.getAttribute("data-task-id") || "", "canceled");
            ctx.render();
            return;
        case "rollback-history":
            await rollbackAssistantOperationHistoryItem(target?.getAttribute("data-history-id") || "");
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
        default:
            return;
    }
};
