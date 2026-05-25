import {showMessage} from "../../dialog/message";
import {fetchSyncPost} from "../../util/fetch";
import {assistantText} from "../constants";
import type {IAssistantEditPatch, IAssistantPatchOperation} from "../patch/types";
import {
    addAssistantOperationHistory,
    readAssistantOperationHistory,
    updateAssistantOperationHistoryStatus,
} from "./store";

const rollbackableOperationTypes = new Set(["insert-after-block", "append-note"]);

export const canRollbackAssistantPatchOperation = (operation: IAssistantPatchOperation) => {
    return rollbackableOperationTypes.has(operation.type) && !!operation.appliedTargetId;
};

export const recordAssistantPatchHistory = (patch: IAssistantEditPatch) => {
    const accepted = patch.operations.some((operation) => operation.status === "accepted");
    if (!accepted) {
        return null;
    }
    return addAssistantOperationHistory(patch, "applied");
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
        const response = await fetchSyncPost("/api/block/deleteBlock", {
            id: operation.appliedTargetId,
        });
        if (response.code !== 0) {
            updateAssistantOperationHistoryStatus(id, "failed");
            showMessage(response.msg || assistantText("回滚失败", "Rollback failed"), 5000, "error");
            return false;
        }
    }
    updateAssistantOperationHistoryStatus(id, "rolled-back");
    showMessage(assistantText("AI 写入已回滚", "AI write rolled back"));
    return true;
};
