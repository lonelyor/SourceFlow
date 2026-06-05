import {showMessage} from "../../dialog/message";
import {fetchSyncPost} from "../../util/fetch";
import {assistantText} from "../constants";
import type {IAssistantEditPatch, IAssistantPatchOperation, TAssistantPatchRisk, TAssistantPatchSource} from "../patch/types";
import {
    addAssistantOperationHistory,
    readAssistantOperationHistory,
    updateAssistantOperationHistoryStatus,
    writeAssistantOperationHistory,
} from "./store";
import type {IAssistantOperationHistoryItem, IAssistantOperationHistoryMetadata} from "./store";

const rollbackableOperationTypes = new Set(["insert-after-block", "append-note", "create-note", "create-child-note"]);

export const canRollbackAssistantPatchOperation = (operation: IAssistantPatchOperation) => {
    return rollbackableOperationTypes.has(operation.type) && !!operation.appliedTargetId;
};

export const isBackendAssistantOperationHistoryItem = (item: IAssistantOperationHistoryItem) => {
    return !item.id.startsWith("history-") || !!item.operationId || !!item.operationType;
};

export const canRevertAssistantOperationHistoryItem = (item: IAssistantOperationHistoryItem) => {
    if (item.status !== "applied" && item.status !== "reapplied") {
        return false;
    }
    if (isBackendAssistantOperationHistoryItem(item)) {
        return true;
    }
    return item.patch.operations.some(canRollbackAssistantPatchOperation);
};

export const canReapplyAssistantOperationHistoryItem = (item: IAssistantOperationHistoryItem) => {
    return item.status === "reverted" && isBackendAssistantOperationHistoryItem(item);
};

const buildPatchHistoryMetadata = (
    patch: IAssistantEditPatch,
    metadata: IAssistantOperationHistoryMetadata = {},
): IAssistantOperationHistoryMetadata => {
    const firstOperation = patch.operations.find((operation) => operation.appliedTargetId || operation.targetId);
    return {
        ...metadata,
        targetId: metadata.targetId || firstOperation?.appliedTargetId || firstOperation?.targetId || "",
        targetLabel: metadata.targetLabel || firstOperation?.targetLabel || patch.summary || "",
        results: metadata.results || patch.operations.map((operation) => ({
            operationId: operation.id,
            type: operation.type,
            status: operation.status || "pending",
            targetId: operation.targetId,
            appliedTargetId: operation.appliedTargetId,
        })),
    };
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

export const recordAssistantExplicitSaveHistory = (options: {
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
}) => {
    const noteId = `${options.noteId || ""}`.trim();
    if (!noteId) {
        return null;
    }
    const now = Date.now();
    const summary = `${options.summary || ""}`.trim() || assistantText("AI 保存内容", "AI saved content");
    const source = options.source || "dock";
    const patch: IAssistantEditPatch = {
        id: `explicit-save-${now}-${Math.random().toString(36).slice(2, 8)}`,
        source,
        target: "note",
        risk: options.risk || "L2",
        summary,
        operations: [{
            id: `explicit-save-op-${now}-${Math.random().toString(36).slice(2, 8)}`,
            type: "create-note",
            targetId: noteId,
            targetLabel: options.targetLabel || summary,
            status: "accepted",
            appliedTargetId: noteId,
        }],
        createdAt: now,
    };
    const item = addAssistantOperationHistory(patch, "applied", buildPatchHistoryMetadata(patch, {
        sessionId: options.sessionId,
        profileId: options.profileId,
        targetId: noteId,
        targetLabel: options.targetLabel || summary,
    }));
    if (options.markdown?.trim()) {
        void fetchSyncPost("/api/assistant/history/recordExplicitSave", {
            source,
            summary,
            noteId,
            targetLabel: options.targetLabel || summary,
            sessionId: options.sessionId,
            profileId: options.profileId,
            risk: options.risk || "L2",
            markdown: options.markdown,
            notebook: options.notebook,
            path: options.path,
        }).then(() => syncAssistantOperationHistoryFromBackend()).catch(() => undefined);
    }
    return item;
};

export const recordAssistantPatchHistory = (
    patch: IAssistantEditPatch,
    metadata: IAssistantOperationHistoryMetadata = {},
) => {
    const accepted = patch.operations.some((operation) => operation.status === "accepted");
    if (!accepted) {
        return null;
    }
    return addAssistantOperationHistory(patch, "applied", buildPatchHistoryMetadata(patch, metadata));
};

export const recordAssistantPatchFailure = (
    patch: IAssistantEditPatch,
    error: string,
    metadata: IAssistantOperationHistoryMetadata = {},
) => {
    return addAssistantOperationHistory(patch, "failed", buildPatchHistoryMetadata(patch, {
        ...metadata,
        error: `${error || ""}`.trim() || assistantText("应用修改失败", "Failed to apply edit"),
    }));
};

export const rollbackAssistantOperationHistoryItem = async (id: string) => {
    const item = readAssistantOperationHistory().find((entry) => entry.id === id);
    if (!item || !canRevertAssistantOperationHistoryItem(item)) {
        return false;
    }
    if (isBackendAssistantOperationHistoryItem(item)) {
        const backendResponse = await fetchSyncPost("/api/assistant/history/revert", {id});
        if (backendResponse.code === 0 && backendResponse.data) {
            await syncAssistantOperationHistoryFromBackend();
            showMessage(assistantText("AI 写入已撤回", "AI write reverted"));
            return true;
        }
        if (backendResponse.msg && !/not found|was not found/i.test(backendResponse.msg)) {
            await syncAssistantOperationHistoryFromBackend();
            showMessage(backendResponse.msg, 5000, "error");
            return false;
        }
    }
    const rollbackOps = item.patch.operations.filter(canRollbackAssistantPatchOperation);
    if (!rollbackOps.length) {
        showMessage(assistantText("这条历史记录没有可自动回滚的低风险写入", "This history item has no low-risk write that can be rolled back automatically"), 5000, "error");
        return false;
    }
    for (const operation of rollbackOps) {
        const response = operation.type === "create-note" || operation.type === "create-child-note"
            ? await fetchSyncPost("/api/filetree/removeDocByID", {id: operation.appliedTargetId})
            : await fetchSyncPost("/api/block/deleteBlock", {id: operation.appliedTargetId});
        if (response.code !== 0) {
            updateAssistantOperationHistoryStatus(id, "failed", response.msg || assistantText("回滚失败", "Rollback failed"));
            showMessage(response.msg || assistantText("回滚失败", "Rollback failed"), 5000, "error");
            return false;
        }
    }
    updateAssistantOperationHistoryStatus(id, "rolled-back");
    showMessage(assistantText("AI 写入已回滚", "AI write rolled back"));
    return true;
};

export const reapplyAssistantOperationHistoryItem = async (id: string) => {
    const item = readAssistantOperationHistory().find((entry) => entry.id === id);
    if (!item || !canReapplyAssistantOperationHistoryItem(item)) {
        return false;
    }
    const response = await fetchSyncPost("/api/assistant/history/reapply", {id});
    if (response.code !== 0 || !response.data) {
        await syncAssistantOperationHistoryFromBackend();
        showMessage(response.msg || assistantText("取消撤回失败", "Failed to reapply the AI write"), 5000, "error");
        return false;
    }
    await syncAssistantOperationHistoryFromBackend();
    showMessage(assistantText("AI 写入已重新应用", "AI write reapplied"));
    return true;
};
