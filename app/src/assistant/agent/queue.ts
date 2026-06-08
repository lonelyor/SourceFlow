import type {IAssistantEditPatch} from "../patch/types";
import {fetchSyncPost} from "../../util/fetch";

export type TAssistantAgentTaskStatus = "running" | "paused" | "review" | "completed" | "canceled";
export type TAssistantAgentItemStatus = "pending" | "running" | "review" | "done" | "failed" | "canceled";

export interface IAssistantAgentPatchContext {
    rootID: string;
    notebook: string;
    path: string;
    title: string;
    currentBlockID?: string;
    currentBlockType?: string;
    currentBlockMarkdown?: string;
    selectedText?: string;
}

export interface IAssistantAgentTaskItem {
    id: string;
    title: string;
    targetId?: string;
    status: TAssistantAgentItemStatus;
    patchId?: string;
    patch?: IAssistantEditPatch;
    context?: IAssistantAgentPatchContext;
    error?: string;
    retryCount?: number;
    updatedAt?: number;
}

export interface IAssistantAgentTask {
    id: string;
    title: string;
    status: TAssistantAgentTaskStatus;
    items: IAssistantAgentTaskItem[];
    createdAt: number;
    updatedAt: number;
}

const assistantAgentTaskLimit = 20;
const assistantAgentOwner = `window-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let assistantAgentTaskCache: IAssistantAgentTask[] = [];

const cloneAgentTask = <T>(value: T): T => JSON.parse(JSON.stringify(value || null));

const requireAgentResponse = async <T>(url: string, payload: Record<string, unknown>): Promise<T> => {
    const response = await fetchSyncPost(url, payload);
    if (response.code !== 0) {
        throw new Error(response.msg || "Assistant Agent request failed");
    }
    return response.data as T;
};

const setAgentTaskCache = (items: IAssistantAgentTask[]) => {
    assistantAgentTaskCache = Array.isArray(items)
        ? items.filter((item) => item?.id).slice(0, assistantAgentTaskLimit).map(cloneAgentTask)
        : [];
    return readAssistantAgentTasks();
};

const upsertAgentTaskCache = (task: IAssistantAgentTask | null | undefined) => {
    if (!task?.id) {
        return null;
    }
    const cloned = cloneAgentTask(task);
    const existing = assistantAgentTaskCache.findIndex((item) => item.id === cloned.id);
    if (existing >= 0) {
        assistantAgentTaskCache[existing] = cloned;
    } else {
        assistantAgentTaskCache = [cloned].concat(assistantAgentTaskCache).slice(0, assistantAgentTaskLimit);
    }
    return cloneAgentTask(cloned);
};

export const readAssistantAgentTasks = () => {
    return assistantAgentTaskCache.map(cloneAgentTask);
};

export const syncAssistantAgentTasksFromBackend = async (limit = assistantAgentTaskLimit) => {
    const tasks = await requireAgentResponse<IAssistantAgentTask[]>("/api/assistant/agent/list", {limit});
    return setAgentTaskCache(tasks);
};

export const createAssistantAgentTask = async (title: string, items: Array<{title: string, targetId?: string, context?: IAssistantAgentPatchContext}>) => {
    const task = await requireAgentResponse<IAssistantAgentTask>("/api/assistant/agent/create", {
        title,
        items: items.slice(0, assistantAgentTaskLimit),
    });
    return upsertAgentTaskCache(task) as IAssistantAgentTask;
};

export const updateAssistantAgentTaskStatus = async (id: string, status: TAssistantAgentTaskStatus) => {
    const task = await requireAgentResponse<IAssistantAgentTask>("/api/assistant/agent/updateStatus", {id, status});
    return upsertAgentTaskCache(task);
};

export const updateAssistantAgentTaskItem = async (
    taskId: string,
    itemId: string,
    mutator: (item: IAssistantAgentTaskItem) => IAssistantAgentTaskItem,
) => {
    const task = readAssistantAgentTasks().find((entry) => entry.id === taskId);
    const current = task?.items.find((item) => item.id === itemId);
    if (!current) {
        return null;
    }
    const item = mutator(cloneAgentTask(current));
    const updatedItem = await requireAgentResponse<IAssistantAgentTaskItem>("/api/assistant/agent/updateItem", {taskId, itemId, item});
    const latest = readAssistantAgentTasks().find((entry) => entry.id === taskId);
    if (latest) {
        upsertAgentTaskCache({
            ...latest,
            items: latest.items.map((entry) => entry.id === itemId ? updatedItem : entry),
            updatedAt: Date.now(),
        });
    } else {
        await syncAssistantAgentTasksFromBackend();
    }
    return cloneAgentTask(updatedItem);
};

export const updateAssistantAgentTaskItems = async (
    taskId: string,
    mutator: (item: IAssistantAgentTaskItem) => IAssistantAgentTaskItem,
) => {
    const task = readAssistantAgentTasks().find((entry) => entry.id === taskId);
    if (!task) {
        return null;
    }
    const items = task.items.map((item) => mutator(cloneAgentTask(item)));
    const updated = await requireAgentResponse<IAssistantAgentTask>("/api/assistant/agent/updateItems", {taskId, items});
    return upsertAgentTaskCache(updated);
};

export const cancelAssistantAgentPendingItems = async (taskId: string) => {
    const task = await requireAgentResponse<IAssistantAgentTask>("/api/assistant/agent/cancelPending", {taskId});
    return upsertAgentTaskCache(task);
};

export const acquireAssistantAgentTaskLease = async (taskId: string) => {
    const result = await requireAgentResponse<{task?: IAssistantAgentTask, token?: string, expiresAt?: number}>("/api/assistant/agent/acquireLease", {
        taskId,
        owner: assistantAgentOwner,
    });
    if (result.task) {
        upsertAgentTaskCache(result.task);
    }
    return {
        token: result.token || "",
        expiresAt: result.expiresAt || 0,
        task: result.task ? cloneAgentTask(result.task) : null,
    };
};

export const releaseAssistantAgentTaskLease = async (taskId: string, leaseToken: string) => {
    const task = await requireAgentResponse<IAssistantAgentTask>("/api/assistant/agent/releaseLease", {taskId, leaseToken});
    return upsertAgentTaskCache(task);
};

export const getAssistantAgentTaskProgress = (task: IAssistantAgentTask) => {
    const total = task.items.length;
    const done = task.items.filter((item) => item.status === "done").length;
    const review = task.items.filter((item) => item.status === "review").length;
    const failed = task.items.filter((item) => item.status === "failed").length;
    return {total, done, review, failed};
};
