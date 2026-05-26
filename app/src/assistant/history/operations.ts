import {showMessage} from "../../dialog/message";
import {fetchSyncPost} from "../../util/fetch";
import {assistantText} from "../constants";
import type {IAssistantEditPatch, IAssistantPatchOperation} from "../patch/types";
import {
    addAssistantOperationHistory,
    readAssistantOperationHistory,
    updateAssistantOperationHistoryStatus,
} from "./store";
import type {IAssistantOperationHistoryMetadata} from "./store";

const rollbackableOperationTypes = new Set(["insert-after-block", "append-note", "create-note", "create-child-note"]);

export const canRollbackAssistantPatchOperation = (operation: IAssistantPatchOperation) => {
    return rollbackableOperationTypes.has(operation.type) && !!operation.appliedTargetId;
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
    if (!item || item.status !== "applied") {
        return false;
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
