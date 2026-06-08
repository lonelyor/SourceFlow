import {showMessage} from "../../dialog/message";
import {fetchSyncPost} from "../../util/fetch";
import {assistantText} from "../constants";
import type {IAssistantEditPatch, TAssistantPatchRisk, TAssistantPatchSource} from "../patch/types";
import {readAssistantOperationHistory, writeAssistantOperationHistory} from "./store";
import type {IAssistantOperationHistoryItem, IAssistantOperationHistoryMetadata} from "./store";

export const isBackendAssistantOperationHistoryItem = (item: IAssistantOperationHistoryItem) => {
    return !!item?.id && !item.id.startsWith("history-");
};

export const canRevertAssistantOperationHistoryItem = (item: IAssistantOperationHistoryItem) => {
    if (item.status !== "applied" && item.status !== "reapplied") {
        return false;
    }
    return isBackendAssistantOperationHistoryItem(item);
};

export const canReapplyAssistantOperationHistoryItem = (item: IAssistantOperationHistoryItem) => {
    return item.status === "reverted" && isBackendAssistantOperationHistoryItem(item);
};

export const syncAssistantOperationHistoryFromBackend = async (limit = 50) => {
    try {
        const response = await fetchSyncPost("/api/assistant/history/list", {limit});
        if (response.code !== 0 || !Array.isArray(response.data)) {
            return readAssistantOperationHistory();
        }
        writeAssistantOperationHistory(response.data as IAssistantOperationHistoryItem[]);
        return readAssistantOperationHistory();
    } catch (_error) {
        return readAssistantOperationHistory();
    }
};

export const recordAssistantExplicitSaveHistory = async (options: {
    source: TAssistantPatchSource;
    summary: string;
    noteId: string;
    targetLabel?: string;
    sessionId?: string;
    profileId?: string;
    risk?: TAssistantPatchRisk;
    markdown?: string;
    notebook?: string;
    path?: string;
}): Promise<IAssistantOperationHistoryItem | null> => {
    const noteId = `${options.noteId || ""}`.trim();
    const markdown = `${options.markdown || ""}`.trim();
    if (!noteId || !markdown) {
        return null;
    }
    const summary = `${options.summary || ""}`.trim() || assistantText("AI 保存内容", "AI saved content");
    const source = options.source || "dock";
    try {
        const response = await fetchSyncPost("/api/assistant/history/recordExplicitSave", {
            source,
            summary,
            noteId,
            targetLabel: options.targetLabel || summary,
            sessionId: options.sessionId,
            profileId: options.profileId,
            risk: options.risk || "L2",
            markdown,
            notebook: options.notebook,
            path: options.path,
        });
        if (response.code !== 0 || !response.data) {
            return null;
        }
        await syncAssistantOperationHistoryFromBackend();
        return response.data as IAssistantOperationHistoryItem;
    } catch (_error) {
        return null;
    }
};

export const recordAssistantPatchHistory = (
    patch: IAssistantEditPatch,
    metadata: IAssistantOperationHistoryMetadata = {},
): null => {
    void metadata;
    const accepted = patch.operations.some((operation) => operation.status === "accepted");
    if (!accepted) {
        return null;
    }
    void syncAssistantOperationHistoryFromBackend();
    return null;
};

export const recordAssistantPatchFailure = (
    patch: IAssistantEditPatch,
    error: string,
    metadata: IAssistantOperationHistoryMetadata = {},
): null => {
    void patch;
    void error;
    void metadata;
    void syncAssistantOperationHistoryFromBackend();
    return null;
};

export const rollbackAssistantOperationHistoryItem = async (id: string) => {
    const item = readAssistantOperationHistory().find((entry) => entry.id === id);
    if (!item || !canRevertAssistantOperationHistoryItem(item)) {
        return false;
    }
    const backendResponse = await fetchSyncPost("/api/assistant/history/revert", {id});
    await syncAssistantOperationHistoryFromBackend();
    if (backendResponse.code === 0 && backendResponse.data) {
        showMessage(assistantText("AI 写入已撤回", "AI write reverted"));
        return true;
    }
    showMessage(backendResponse.msg || assistantText("撤回失败", "Failed to revert the AI write"), 5000, "error");
    return false;
};

export const reapplyAssistantOperationHistoryItem = async (id: string) => {
    const item = readAssistantOperationHistory().find((entry) => entry.id === id);
    if (!item || !canReapplyAssistantOperationHistoryItem(item)) {
        return false;
    }
    const response = await fetchSyncPost("/api/assistant/history/reapply", {id});
    await syncAssistantOperationHistoryFromBackend();
    if (response.code !== 0 || !response.data) {
        showMessage(response.msg || assistantText("取消撤回失败", "Failed to reapply the AI write"), 5000, "error");
        return false;
    }
    showMessage(assistantText("AI 写入已重新应用", "AI write reapplied"));
    return true;
};
