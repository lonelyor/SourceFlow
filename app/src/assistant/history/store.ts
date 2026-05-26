import type {IAssistantEditPatch} from "../patch/types";

export type TAssistantOperationHistoryStatus = "applied" | "rolled-back" | "failed";

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
    patch: IAssistantEditPatch;
    status: TAssistantOperationHistoryStatus;
    source: string;
    risk: string;
    sessionId?: string;
    profileId?: string;
    targetId?: string;
    targetLabel?: string;
    error?: string;
    results: IAssistantOperationHistoryResult[];
    createdAt: number;
    updatedAt: number;
}

const historyStorageKey = "sourceflow.assistant.operation.history";
const assistantOperationHistoryLimit = 100;

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
        targetId: item.targetId || firstOperation?.appliedTargetId || firstOperation?.targetId || "",
        targetLabel: item.targetLabel || firstOperation?.targetLabel || patch?.summary || "",
        results: item.results?.length ? item.results : buildHistoryResults(patch),
    };
};

export const readAssistantOperationHistory = () => {
    try {
        const raw = window.localStorage?.getItem(historyStorageKey) || "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.map((item) => normalizeHistoryItem(item as IAssistantOperationHistoryItem)).filter((item) => item?.id && item?.patch).slice(0, assistantOperationHistoryLimit)
            : [];
    } catch (_error) {
        return [] as IAssistantOperationHistoryItem[];
    }
};

export const writeAssistantOperationHistory = (items: IAssistantOperationHistoryItem[]) => {
    try {
        window.localStorage?.setItem(historyStorageKey, JSON.stringify(items.slice(0, assistantOperationHistoryLimit)));
    } catch (_error) {
        // Operation history is best-effort and must not block editing.
    }
};

export const addAssistantOperationHistory = (
    patch: IAssistantEditPatch,
    status: TAssistantOperationHistoryStatus = "applied",
    metadata: IAssistantOperationHistoryMetadata = {},
) => {
    const now = Date.now();
    const firstOperation = patch.operations.find((operation) => operation.appliedTargetId || operation.targetId);
    const item: IAssistantOperationHistoryItem = {
        id: `history-${now}-${Math.random().toString(36).slice(2, 8)}`,
        patch: JSON.parse(JSON.stringify(patch)) as IAssistantEditPatch,
        status,
        source: patch.source,
        risk: patch.risk,
        sessionId: metadata.sessionId,
        profileId: metadata.profileId,
        targetId: metadata.targetId || firstOperation?.appliedTargetId || firstOperation?.targetId || "",
        targetLabel: metadata.targetLabel || firstOperation?.targetLabel || patch.summary || "",
        error: metadata.error,
        results: metadata.results || buildHistoryResults(patch),
        createdAt: now,
        updatedAt: now,
    };
    const next = [item].concat(readAssistantOperationHistory()).slice(0, assistantOperationHistoryLimit);
    writeAssistantOperationHistory(next);
    return cloneHistoryItem(item);
};

export const updateAssistantOperationHistoryStatus = (id: string, status: TAssistantOperationHistoryStatus, error = "") => {
    const now = Date.now();
    const next = readAssistantOperationHistory().map((item) => item.id === id ? {
        ...item,
        status,
        error: error || item.error,
        updatedAt: now,
    } : item);
    writeAssistantOperationHistory(next);
    return next.find((item) => item.id === id) || null;
};
