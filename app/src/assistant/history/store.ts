import type {IAssistantEditPatch} from "../patch/types";

export type TAssistantOperationHistoryStatus = "applied" | "rolled-back" | "failed";

export interface IAssistantOperationHistoryItem {
    id: string;
    patch: IAssistantEditPatch;
    status: TAssistantOperationHistoryStatus;
    createdAt: number;
    updatedAt: number;
}

const historyStorageKey = "sourceflow.assistant.operation.history";
const assistantOperationHistoryLimit = 100;

const cloneHistoryItem = (item: IAssistantOperationHistoryItem) => JSON.parse(JSON.stringify(item)) as IAssistantOperationHistoryItem;

export const readAssistantOperationHistory = () => {
    try {
        const raw = window.localStorage?.getItem(historyStorageKey) || "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.map((item) => item as IAssistantOperationHistoryItem).filter((item) => item?.id && item?.patch).slice(0, assistantOperationHistoryLimit)
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

export const addAssistantOperationHistory = (patch: IAssistantEditPatch, status: TAssistantOperationHistoryStatus = "applied") => {
    const now = Date.now();
    const item: IAssistantOperationHistoryItem = {
        id: `history-${now}-${Math.random().toString(36).slice(2, 8)}`,
        patch: JSON.parse(JSON.stringify(patch)) as IAssistantEditPatch,
        status,
        createdAt: now,
        updatedAt: now,
    };
    const next = [item].concat(readAssistantOperationHistory()).slice(0, assistantOperationHistoryLimit);
    writeAssistantOperationHistory(next);
    return cloneHistoryItem(item);
};

export const updateAssistantOperationHistoryStatus = (id: string, status: TAssistantOperationHistoryStatus) => {
    const now = Date.now();
    const next = readAssistantOperationHistory().map((item) => item.id === id ? {...item, status, updatedAt: now} : item);
    writeAssistantOperationHistory(next);
    return next.find((item) => item.id === id) || null;
};
