export type TAssistantAgentTaskStatus = "running" | "paused" | "review" | "completed" | "canceled";
export type TAssistantAgentItemStatus = "pending" | "running" | "review" | "done" | "failed" | "canceled";

export interface IAssistantAgentTaskItem {
    id: string;
    title: string;
    targetId?: string;
    status: TAssistantAgentItemStatus;
    patchId?: string;
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

const agentQueueStorageKey = "sourceflow.assistant.agent.queue";
const assistantAgentTaskLimit = 20;

const createAgentID = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const readAssistantAgentTasks = () => {
    try {
        const raw = window.localStorage?.getItem(agentQueueStorageKey) || "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((item) => item as IAssistantAgentTask).filter((item) => item?.id).slice(0, assistantAgentTaskLimit) : [];
    } catch (_error) {
        return [] as IAssistantAgentTask[];
    }
};

export const writeAssistantAgentTasks = (items: IAssistantAgentTask[]) => {
    try {
        window.localStorage?.setItem(agentQueueStorageKey, JSON.stringify(items.slice(0, assistantAgentTaskLimit)));
    } catch (_error) {
        // Queue persistence is best-effort.
    }
};

export const createAssistantAgentTask = (title: string, items: Array<{title: string, targetId?: string}>) => {
    const now = Date.now();
    const task: IAssistantAgentTask = {
        id: createAgentID("agent"),
        title: `${title || ""}`.trim() || "AI Agent Task",
        status: "running",
        items: items.slice(0, assistantAgentTaskLimit).map((item) => ({
            id: createAgentID("item"),
            title: `${item.title || ""}`.trim() || "Task item",
            targetId: item.targetId,
            status: "pending",
        })),
        createdAt: now,
        updatedAt: now,
    };
    writeAssistantAgentTasks([task].concat(readAssistantAgentTasks()));
    return task;
};

export const updateAssistantAgentTaskStatus = (id: string, status: TAssistantAgentTaskStatus) => {
    const now = Date.now();
    const next = readAssistantAgentTasks().map((task) => task.id === id ? {
        ...task,
        status,
        updatedAt: now,
        items: status === "canceled" ? task.items.map((item) => item.status === "done" ? item : {...item, status: "canceled" as TAssistantAgentItemStatus}) : task.items,
    } : task);
    writeAssistantAgentTasks(next);
    return next.find((task) => task.id === id) || null;
};

export const updateAssistantAgentTaskItem = (
    taskId: string,
    itemId: string,
    mutator: (item: IAssistantAgentTaskItem) => IAssistantAgentTaskItem,
) => {
    const now = Date.now();
    let updatedItem: IAssistantAgentTaskItem | null = null;
    const next = readAssistantAgentTasks().map((task) => {
        if (task.id !== taskId) {
            return task;
        }
        return {
            ...task,
            updatedAt: now,
            items: task.items.map((item) => {
                if (item.id !== itemId) {
                    return item;
                }
                updatedItem = {...mutator({...item}), updatedAt: now};
                return updatedItem;
            }),
        };
    });
    writeAssistantAgentTasks(next);
    return updatedItem;
};

export const updateAssistantAgentTaskItems = (
    taskId: string,
    mutator: (item: IAssistantAgentTaskItem) => IAssistantAgentTaskItem,
) => {
    const now = Date.now();
    const next = readAssistantAgentTasks().map((task) => {
        if (task.id !== taskId) {
            return task;
        }
        return {
            ...task,
            updatedAt: now,
            items: task.items.map((item) => ({...mutator({...item}), updatedAt: now})),
        };
    });
    writeAssistantAgentTasks(next);
    return next.find((task) => task.id === taskId) || null;
};

export const getAssistantAgentTaskProgress = (task: IAssistantAgentTask) => {
    const total = task.items.length;
    const done = task.items.filter((item) => item.status === "done").length;
    const review = task.items.filter((item) => item.status === "review").length;
    const failed = task.items.filter((item) => item.status === "failed").length;
    return {total, done, review, failed};
};
