import {
    IAssistantAgentPatchContext,
    IAssistantAgentTask,
    IAssistantAgentTaskItem,
    acquireAssistantAgentTaskLease,
    cancelAssistantAgentPendingItems,
    readAssistantAgentTasks,
    releaseAssistantAgentTaskLease,
    updateAssistantAgentTaskItem,
    updateAssistantAgentTaskStatus,
} from "./queue";
import type {IAssistantEditPatch} from "../patch/types";

export interface IAssistantAgentRunResult {
    patchId?: string;
    patch?: IAssistantEditPatch;
    context?: IAssistantAgentPatchContext;
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
const activeAgentItemControllers = new Map<string, AbortController>();

const getTask = (taskId: string) => {
    return readAssistantAgentTasks().find((task) => task.id === taskId) || null;
};

const runWithTimeout = async <T>(controllerKey: string, runner: (signal: AbortSignal) => Promise<T>, timeoutMs: number) => {
    const controller = new AbortController();
    activeAgentItemControllers.set(controllerKey, controller);
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
        activeAgentItemControllers.delete(controllerKey);
    }
};

export const abortRunningAssistantAgentTask = (taskId: string) => {
    const normalizedTaskId = `${taskId || ""}`.trim();
    if (!normalizedTaskId) {
        return;
    }
    activeAgentItemControllers.forEach((controller, key) => {
        if (key.startsWith(`${normalizedTaskId}:`)) {
            controller.abort();
        }
    });
};

export const cancelPendingAssistantAgentItems = (taskId: string) => {
    return cancelAssistantAgentPendingItems(taskId);
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
    const lease = await acquireAssistantAgentTaskLease(normalizedTaskId);
    let task = lease.task || await updateAssistantAgentTaskStatus(normalizedTaskId, "running");
    if (!task) {
        return null;
    }
    try {
        let processed = 0;
        for (const item of task.items) {
            task = getTask(normalizedTaskId);
            if (!task || task.status === "paused") {
                return task;
            }
            if (task.status === "canceled") {
                await cancelPendingAssistantAgentItems(normalizedTaskId);
                return getTask(normalizedTaskId);
            }
            if (processed >= maxItems) {
                return await updateAssistantAgentTaskStatus(normalizedTaskId, "paused");
            }
            if (item.status !== "pending" && item.status !== "failed") {
                continue;
            }
            processed += 1;
            await updateAssistantAgentTaskItem(normalizedTaskId, item.id, (current) => ({...current, status: "running", error: ""}));
            try {
                const result = await runWithTimeout(`${normalizedTaskId}:${item.id}`, (signal) => runner(item, {signal, task: task as IAssistantAgentTask}), timeoutMs);
                await updateAssistantAgentTaskItem(normalizedTaskId, item.id, (current) => ({
                    ...current,
                    status: result.patch || result.patchId ? "review" : "done",
                    patchId: result.patch?.id || result.patchId || current.patchId,
                    patch: result.patch || current.patch,
                    context: result.context || current.context,
                    error: "",
                }));
            } catch (error) {
                const latestTask = getTask(normalizedTaskId);
                if (latestTask?.status === "paused") {
                    await updateAssistantAgentTaskItem(normalizedTaskId, item.id, (current) => ({...current, status: "pending", error: ""}));
                    return getTask(normalizedTaskId);
                }
                if (latestTask?.status === "canceled") {
                    await cancelPendingAssistantAgentItems(normalizedTaskId);
                    return getTask(normalizedTaskId);
                }
                await updateAssistantAgentTaskItem(normalizedTaskId, item.id, (current) => ({
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
            return await updateAssistantAgentTaskStatus(normalizedTaskId, "completed");
        }
        if (!hasPending && hasReview && !hasFailed) {
            return await updateAssistantAgentTaskStatus(normalizedTaskId, "review");
        }
        return task;
    } finally {
        if (lease.token) {
            try {
                await releaseAssistantAgentTaskLease(normalizedTaskId, lease.token);
            } catch (_error) {
                // Lease release is best-effort after task state has been persisted.
            }
        }
    }
};
