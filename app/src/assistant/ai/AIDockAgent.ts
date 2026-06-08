import {showMessage} from "../../dialog/message";
import {assistantText, buildAssistantNoteContext} from "../constants";
import type {ICurrentNoteContext} from "../common/note";
import {buildIncludedContextText, buildSourceCitationsFromMentionSources, resolveSourcesForPrompt} from "../mentions/contextBuilder";
import {
    abortRunningAssistantAgentTask,
    cancelPendingAssistantAgentItems,
    runAssistantAgentTask,
} from "../agent/executor";
import {
    createAssistantAgentTask,
    IAssistantAgentPatchContext,
    IAssistantAgentTaskItem,
    readAssistantAgentTasks,
    syncAssistantAgentTasksFromBackend,
    updateAssistantAgentTaskItem,
    updateAssistantAgentTaskStatus,
} from "../agent/queue";
import {recordAssistantPatchFailure, recordAssistantPatchHistory} from "../history/operations";
import {applyAssistantPatch, applyAssistantPatchOperation} from "../patch/apply";
import type {IAssistantEditPatch} from "../patch/types";
import type {IAssistantSkillContext} from "../skills/types";
import {chatAssistantAI, IAssistantAIChatResult} from "./api";
import type {IAssistantAIDockRuntime, IAssistantAINotePreview} from "./AIDockContract";

const assistantAgentTaskItemLimit = 8;
const assistantAgentItemTimeoutMs = 90000;

const createAgentPatchId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const truncateAgentText = (value: string, limit: number) => {
    const runes = Array.from(`${value || ""}`.trim());
    if (runes.length <= limit) {
        return runes.join("");
    }
    return `${runes.slice(0, limit).join("").trim()}...`;
};

const normalizeAgentTaskLine = (line: string) => {
    return `${line || ""}`
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        .trim();
};

const parseAgentDraft = (draft: string) => {
    const items = `${draft || ""}`
        .split(/\r?\n/)
        .map(normalizeAgentTaskLine)
        .filter(Boolean)
        .slice(0, assistantAgentTaskItemLimit);
    return {
        title: truncateAgentText(items[0] || assistantText("AI 批量任务", "AI batch task"), 48),
        items,
    };
};

const toAgentPatchContext = (note: IAssistantAINotePreview): IAssistantAgentPatchContext => ({
    rootID: note.rootID,
    notebook: note.notebook,
    path: note.path,
    title: note.title,
    currentBlockID: note.currentBlockID || note.rootID,
    currentBlockType: note.currentBlockType || "d",
    currentBlockMarkdown: note.currentBlockMarkdown || "",
    selectedText: note.selectedText || "",
});

const toNoteContext = (context: IAssistantAgentPatchContext): ICurrentNoteContext => ({
    rootID: context.rootID,
    notebook: context.notebook,
    path: context.path,
    title: context.title,
    markdown: "",
    currentBlockID: context.currentBlockID || context.rootID,
    currentBlockType: context.currentBlockType || "d",
    currentBlockMarkdown: context.currentBlockMarkdown || "",
    selectedText: context.selectedText || "",
});

const toSkillContext = (context: IAssistantAgentPatchContext): IAssistantSkillContext => ({
    note: toNoteContext(context),
    hasSelection: !!`${context.selectedText || ""}`.trim(),
    selectedText: `${context.selectedText || ""}`,
});

const buildAgentPatchHistoryMetadata = (ctx: IAssistantAIDockRuntime, context: IAssistantAgentPatchContext) => ({
    sessionId: ctx.selectedSessionId,
    profileId: ctx.selectedProfileId,
    targetId: context.rootID,
    targetLabel: context.title,
});

const getTaskItem = async (taskId: string, itemId: string) => {
    if (!readAssistantAgentTasks().find((entry) => entry.id === taskId)) {
        await syncAssistantAgentTasksFromBackend();
    }
    const task = readAssistantAgentTasks().find((entry) => entry.id === taskId);
    return {
        task: task || null,
        item: task?.items.find((entry) => entry.id === itemId) || null,
    };
};

const extractPatchFromAgentResult = (
    result: IAssistantAIChatResult,
    item: IAssistantAgentTaskItem,
    context: IAssistantAgentPatchContext,
) => {
    const toolResults = Array.isArray(result.toolResults) ? result.toolResults : [];
    for (const tool of toolResults) {
        const data = tool?.data && typeof tool.data === "object" ? tool.data as Record<string, unknown> : {};
        const patch = (data.patch || data.previewPatch) as IAssistantEditPatch | undefined;
        if (patch?.operations?.length) {
            return {
                ...patch,
                id: patch.id || createAgentPatchId("agent-patch"),
                source: "agent" as const,
                summary: patch.summary || item.title,
                operations: patch.operations.map((operation) => ({
                    ...operation,
                    targetId: operation.targetId || context.currentBlockID || context.rootID,
                    status: operation.status || "pending" as const,
                })),
            };
        }
    }
    return null;
};

const getAgentAssistantContent = (result: IAssistantAIChatResult) => {
    const direct = `${result.assistantMessage?.content || ""}`.trim();
    if (direct) {
        return direct;
    }
    return `${[...result.messages].reverse().find((message) => message.role === "assistant")?.content || ""}`.trim();
};

const buildAppendPatch = (
    item: IAssistantAgentTaskItem,
    context: IAssistantAgentPatchContext,
    markdown: string,
): IAssistantEditPatch => ({
    id: createAgentPatchId("agent-patch"),
    source: "agent",
    target: "note",
    risk: "L2",
    summary: truncateAgentText(item.title, 80),
    operations: [{
        id: createAgentPatchId("agent-op"),
        type: "append-note",
        targetId: context.rootID,
        targetLabel: context.title,
        after: markdown,
        reason: item.title,
        status: "pending",
    }],
    createdAt: Date.now(),
});

const buildAgentSystemPrompt = (note: ICurrentNoteContext) => {
    return [
        buildAssistantNoteContext(note),
        assistantText(
            "你正在执行一个批量 Agent 任务项。请只输出适合追加或提交审阅的 Markdown 正文，不要解释执行过程。",
            "You are executing one batch Agent task item. Output only Markdown content suitable for review or appending; do not explain the process.",
        ),
    ].join("\n\n");
};

const syncAgentTaskReviewStatus = async (taskId: string) => {
    const task = readAssistantAgentTasks().find((entry) => entry.id === taskId);
    if (!task || task.status === "canceled") {
        return task || null;
    }
    const hasPending = task.items.some((item) => item.status === "pending" || item.status === "running");
    const hasReview = task.items.some((item) => item.status === "review");
    const hasFailed = task.items.some((item) => item.status === "failed");
    if (!hasPending && !hasReview && !hasFailed) {
        return await updateAssistantAgentTaskStatus(taskId, "completed");
    }
    if (hasReview) {
        return await updateAssistantAgentTaskStatus(taskId, "review");
    }
    return task;
};

export const startAIDockAgentFromDraft = async (ctx: IAssistantAIDockRuntime) => {
    const profile = ctx.getSelectedProfile();
    if (!profile) {
        showMessage(assistantText("请先配置 AI 提供商", "Configure an AI profile first"), 5000, "error");
        return;
    }
    const parsed = parseAgentDraft(ctx.draftMessage);
    if (!parsed.items.length) {
        showMessage(assistantText("请输入至少一个 Agent 任务项", "Enter at least one Agent task item"), 4000, "error");
        return;
    }
    const note = await ctx.resolveMessageContext();
    if (!note?.rootID) {
        showMessage(assistantText("当前没有可用的目标笔记", "No target note is available"), 4000, "error");
        return;
    }
    const context = toAgentPatchContext(note);
    const task = await createAssistantAgentTask(parsed.title, parsed.items.map((title) => ({
        title,
        targetId: context.rootID,
        context,
    })));
    ctx.draftMessage = "";
    ctx.activePanel = "agent";
    ctx.render();
    await runAIDockAgentTask(ctx, task.id);
};

export const runAIDockAgentTask = async (ctx: IAssistantAIDockRuntime, taskId: string) => {
    const profile = ctx.getSelectedProfile();
    const normalizedTaskId = `${taskId || ""}`.trim();
    if (!profile || !normalizedTaskId || ctx.sending) {
        return;
    }
    ctx.sending = true;
    ctx.activePanel = "agent";
    ctx.render();
    try {
        await runAssistantAgentTask(normalizedTaskId, async (item, runContext) => {
            const context = item.context || (await ctx.resolveMessageContext().then((note) => note ? toAgentPatchContext(note) : null));
            if (!context?.rootID) {
                throw new Error(assistantText("任务项缺少目标笔记上下文", "Task item has no target note context"));
            }
            const agentSources = ctx.sources.length
                ? await resolveSourcesForPrompt(ctx.sources, ctx.securityMode)
                : [];
            const note = toNoteContext(context);
            let system = buildAgentSystemPrompt(note);
            if (agentSources.length) {
                const sourceContext = buildIncludedContextText(agentSources);
                if (sourceContext) {
                    system += `\n\n---\n${assistantText(
                        "用户引用了以下来源，回答时请基于这些来源，并在相关段落末尾标注来源笔记标题（格式：[📄 笔记标题]）：",
                        "The user referenced the following sources. Answer based on these sources, and cite the source note title at the end of relevant paragraphs (format: [📄 Note Title]):"
                    )}\n\n${sourceContext}`;
                }
            }
            const result = await chatAssistantAI({
                profileId: profile.id,
                sessionId: ctx.selectedSessionId,
                mode: "agent",
                title: runContext.task.title,
                message: item.title,
                system,
                enableTools: ctx.enableTools,
                securityMode: ctx.securityMode,
                context,
                attachments: [],
                sources: buildSourceCitationsFromMentionSources(agentSources),
            }, {signal: runContext.signal});
            ctx.selectedSessionId = result.session.id;
            ctx.selectedProfileId = result.profile.id;
            ctx.upsertSession(result.session);
            ctx.messages = result.messages;
            const patch = extractPatchFromAgentResult(result, item, context) || buildAppendPatch(item, context, getAgentAssistantContent(result));
            if (!patch.operations.some((operation) => `${operation.after || operation.before || ""}`.trim() || operation.attrs)) {
                throw new Error(assistantText("AI 没有返回可审阅内容", "The AI did not return reviewable content"));
            }
            return {patchId: patch.id, patch, context};
        }, {
            itemTimeoutMs: assistantAgentItemTimeoutMs,
            maxItems: assistantAgentTaskItemLimit,
        });
        await ctx.refreshAudits();
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    } finally {
        ctx.sending = false;
        await syncAgentTaskReviewStatus(normalizedTaskId);
        ctx.render();
    }
};

export const pauseAIDockAgentTask = async (ctx: IAssistantAIDockRuntime, taskId: string) => {
    await updateAssistantAgentTaskStatus(taskId, "paused");
    abortRunningAssistantAgentTask(taskId);
    ctx.render();
};

export const cancelAIDockAgentTask = async (ctx: IAssistantAIDockRuntime, taskId: string) => {
    await updateAssistantAgentTaskStatus(taskId, "canceled");
    abortRunningAssistantAgentTask(taskId);
    await cancelPendingAssistantAgentItems(taskId);
    ctx.render();
};

export const retryAIDockAgentTaskItem = async (ctx: IAssistantAIDockRuntime, taskId: string, itemId: string) => {
    const {item} = await getTaskItem(taskId, itemId);
    if (!item) {
        return;
    }
    await updateAssistantAgentTaskItem(taskId, itemId, (current) => ({
        ...current,
        status: "pending",
        patchId: "",
        patch: undefined,
        error: "",
    }));
    await updateAssistantAgentTaskStatus(taskId, "running");
    await runAIDockAgentTask(ctx, taskId);
};

export const applyAIDockAgentPatch = async (ctx: IAssistantAIDockRuntime, taskId: string, itemId: string, operationId = "") => {
    const {item} = await getTaskItem(taskId, itemId);
    if (!item?.patch || !item.context) {
        showMessage(assistantText("任务项缺少可应用的补丁", "This task item has no applicable patch"), 4000, "error");
        return;
    }
    const patch = item.patch;
    const context = toSkillContext(item.context);
    const metadata = buildAgentPatchHistoryMetadata(ctx, item.context);
    ctx.sending = true;
    ctx.render();
    try {
        let ok = false;
        const securityOptions = {
            securityMode: ctx.securityMode,
            audit: metadata,
            onSecurityModeChange: async (mode: typeof ctx.securityMode) => {
                ctx.setSecurityMode(mode);
                ctx.render();
            },
        };
        if (operationId) {
            const operation = patch.operations.find((entry) => entry.id === operationId);
            if (!operation) {
                showMessage(assistantText("没有找到要应用的补丁项", "Patch operation not found"), 4000, "error");
                return;
            }
            ok = await applyAssistantPatchOperation(patch, operation, context, securityOptions);
        } else {
            ok = await applyAssistantPatch(patch, context, securityOptions);
        }
        if (!ok) {
            recordAssistantPatchFailure(patch, assistantText("应用 Agent 补丁失败", "Failed to apply Agent patch"), metadata);
            return;
        }
        recordAssistantPatchHistory(patch, metadata);
        const hasPending = patch.operations.some((operation) => (operation.status || "pending") === "pending");
        await updateAssistantAgentTaskItem(taskId, itemId, (current) => ({
            ...current,
            patch,
            status: hasPending ? "review" : "done",
            error: "",
        }));
        await syncAgentTaskReviewStatus(taskId);
    } catch (error) {
        recordAssistantPatchFailure(patch, error instanceof Error ? error.message : String(error), metadata);
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    } finally {
        ctx.sending = false;
        ctx.render();
    }
};

export const rejectAIDockAgentPatch = async (ctx: IAssistantAIDockRuntime, taskId: string, itemId: string, operationId = "") => {
    const {item} = await getTaskItem(taskId, itemId);
    if (!item?.patch) {
        return;
    }
    const patch = item.patch;
    patch.operations.forEach((operation) => {
        if ((operation.status || "pending") !== "pending") {
            return;
        }
        if (!operationId || operation.id === operationId) {
            operation.status = "rejected";
        }
    });
    const hasPending = patch.operations.some((operation) => (operation.status || "pending") === "pending");
    await updateAssistantAgentTaskItem(taskId, itemId, (current) => ({
        ...current,
        patch,
        status: hasPending ? "review" : "done",
    }));
    await syncAgentTaskReviewStatus(taskId);
    ctx.render();
};
