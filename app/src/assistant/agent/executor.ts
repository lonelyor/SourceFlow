import {
    IAssistantAgentTask,
    IAssistantAgentTaskItem,
    readAssistantAgentTasks,
    updateAssistantAgentTaskItem,
    updateAssistantAgentTaskItems,
    updateAssistantAgentTaskStatus,
} from "./queue";

export interface IAssistantAgentRunResult {
    patchId?: string;
}

export interface IAssistantAgentRunContext {
    signal: AbortSignal;
    task: IAssistantAgentTask;
}

export type TAssistantAgentItemRunner = (
    item: IAssistantAgentTaskItem,
    context: IAssistantAgentRunContext,
) => Promise<IAssistantAgentRunResult>;

export interface IAssistantAgentExecutorOptions {
    itemTimeoutMs?: number;
    maxItems?: number;
}

const defaultAgentItemTimeoutMs = 60000;
const defaultAgentMaxItems = 20;

const getTask = (taskId: string) => {
    return readAssistantAgentTasks().find((task) => task.id === taskId) || null;
};

const runWithTimeout = async <T>(runner: (signal: AbortSignal) => Promise<T>, timeoutMs: number) => {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            runner(controller.signal),
            new Promise<T>((_resolve, reject) => {
                timeoutHandle = setTimeout(() => {
                    controller.abort();
                    reject(new Error("Agent item timed out"));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
};

export const cancelPendingAssistantAgentItems = (taskId: string) => {
    return updateAssistantAgentTaskItems(taskId, (item) => {
        if (item.status === "done" || item.status === "review") {
            return item;
        }
        return {...item, status: "canceled"};
    });
};

export const runAssistantAgentTask = async (
    taskId: string,
    runner: TAssistantAgentItemRunner,
    options: IAssistantAgentExecutorOptions = {},
) => {
    const normalizedTaskId = `${taskId || ""}`.trim();
    if (!normalizedTaskId) {
        return null;
    }
    const timeoutMs = Math.max(options.itemTimeoutMs || defaultAgentItemTimeoutMs, 1000);
    const maxItems = Math.max(Math.min(options.maxItems || defaultAgentMaxItems, defaultAgentMaxItems), 1);
    let task = updateAssistantAgentTaskStatus(normalizedTaskId, "running");
    if (!task) {
        return null;
    }
    let processed = 0;
    for (const item of task.items) {
        task = getTask(normalizedTaskId);
        if (!task || task.status === "paused") {
            return task;
        }
        if (task.status === "canceled") {
            cancelPendingAssistantAgentItems(normalizedTaskId);
            return getTask(normalizedTaskId);
        }
        if (processed >= maxItems) {
            return updateAssistantAgentTaskStatus(normalizedTaskId, "paused");
        }
        if (item.status !== "pending" && item.status !== "failed") {
            continue;
        }
        processed += 1;
        updateAssistantAgentTaskItem(normalizedTaskId, item.id, (current) => ({...current, status: "running", error: ""}));
        try {
            const result = await runWithTimeout((signal) => runner(item, {signal, task: task as IAssistantAgentTask}), timeoutMs);
            updateAssistantAgentTaskItem(normalizedTaskId, item.id, (current) => ({
                ...current,
                status: result.patchId ? "review" : "done",
                patchId: result.patchId || current.patchId,
                error: "",
            }));
        } catch (error) {
            updateAssistantAgentTaskItem(normalizedTaskId, item.id, (current) => ({
                ...current,
                status: "failed",
                retryCount: (current.retryCount || 0) + 1,
                error: error instanceof Error ? error.message : String(error),
            }));
        }
    }
    task = getTask(normalizedTaskId);
    if (!task) {
        return null;
    }
    const hasPending = task.items.some((item) => item.status === "pending" || item.status === "running");
    const hasReview = task.items.some((item) => item.status === "review");
    const hasFailed = task.items.some((item) => item.status === "failed");
    if (!hasPending && !hasReview && !hasFailed) {
        return updateAssistantAgentTaskStatus(normalizedTaskId, "completed");
    }
    if (!hasPending && hasReview && !hasFailed) {
        return updateAssistantAgentTaskStatus(normalizedTaskId, "review");
    }
    return task;
};
