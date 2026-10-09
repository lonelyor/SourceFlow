import type {IAssistantEditPatch} from "../patch/types";

export type TAssistantOperationHistoryStatus = "applied" | "reverted" | "reapplied" | "failed" | "revert-failed" | "reapply-failed";

export interface IAssistantOperationHistoryResult {
    operationId: string;
    type: string;
    status: string;
    targetId?: string;
    appliedTargetId?: string;
}

export interface IAssistantOperationHistoryMetadata {
    sessionId?: string;
    profileId?: string;
    targetId?: string;
    targetLabel?: string;
    error?: string;
    results?: IAssistantOperationHistoryResult[];
}

export interface IAssistantOperationHistoryItem {
    id: string;
    patchId?: string;
    operationId?: string;
    operationType?: string;
    patch: IAssistantEditPatch;
    status: TAssistantOperationHistoryStatus;
    source: string;
    risk: string;
    sessionId?: string;
    profileId?: string;
    targetId?: string;
    targetLabel?: string;
    notebook?: string;
    path?: string;
    error?: string;
    results: IAssistantOperationHistoryResult[];
    createdAt: number;
    updatedAt: number;
}

const assistantOperationHistoryLimit = 100;
let assistantOperationHistoryCache: IAssistantOperationHistoryItem[] = [];

const cloneHistoryItem = (item: IAssistantOperationHistoryItem) => JSON.parse(JSON.stringify(item)) as IAssistantOperationHistoryItem;

const buildHistoryResults = (patch: IAssistantEditPatch) => {
    return (patch.operations || []).map((operation) => ({
        operationId: operation.id,
        type: operation.type,
        status: operation.status || "pending",
        targetId: operation.targetId,
        appliedTargetId: operation.appliedTargetId,
    }));
};

const normalizeHistoryItem = (item: IAssistantOperationHistoryItem) => {
    if (!item?.patch) {
        return item;
    }
    const patch = item.patch;
    const firstOperation = patch?.operations?.find((operation) => operation.appliedTargetId || operation.targetId);
    return {
        ...item,
        source: item.source || patch?.source || "",
        risk: item.risk || patch?.risk || "",
        operationType: item.operationType || item.patch?.operations?.[0]?.type || "",
        targetId: item.targetId || firstOperation?.appliedTargetId || firstOperation?.targetId || "",
        targetLabel: item.targetLabel || firstOperation?.targetLabel || patch?.summary || "",
        results: item.results?.length ? item.results : buildHistoryResults(patch),
    };
};

export const readAssistantOperationHistory = () => {
    return assistantOperationHistoryCache.map(cloneHistoryItem);
};

export const writeAssistantOperationHistory = (items: IAssistantOperationHistoryItem[]) => {
    assistantOperationHistoryCache = Array.isArray(items)
        ? items.map((item) => normalizeHistoryItem(item)).filter((item) => item?.id && item?.patch).slice(0, assistantOperationHistoryLimit).map(cloneHistoryItem)
        : [];
};
