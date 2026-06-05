import {showMessage} from "../../dialog/message";
import {App} from "../../index";
import {fetchSyncPost} from "../../util/fetch";
import {getAssistantNoteCreatePath, invalidateAssistantNoteContextCache, resolveAssistantNoteNotebook} from "../common/note";
import {assistantText} from "../constants";
import {WorkbenchAttr} from "../../workbench/constants";
import {recordAssistantExplicitSaveHistory} from "../history/operations";

export const ASSISTANT_INBOX_TAG = "assistant-ai";
export const ASSISTANT_INBOX_QUERY = `tag:${ASSISTANT_INBOX_TAG}`;

interface ISaveAssistantInboxItemOptions {
    app?: App;
    title: string;
    content: string;
    kind?: string;
    sourceBlockRef?: string;
    sourceTitle?: string;
    sourcePath?: string;
    query?: string;
    goal?: string;
    nextStep?: string;
}

const normalizeAssistantInboxTitle = (value: string) => `${value || ""}`.replace(/\s+/g, " ").trim() || assistantText("AI 收件箱", "AI Inbox");

const buildAssistantInboxMarkdown = (options: ISaveAssistantInboxItemOptions) => {
    const sections = [`# ${normalizeAssistantInboxTitle(options.title)}`, ""];
    const metaLines = [
        `- ${assistantText("来源能力", "Source skill")}：${options.kind || assistantText("AI 结果", "AI result")}`,
        options.query ? `- ${assistantText("查询", "Query")}：${options.query}` : "",
        options.sourceBlockRef ? `- ${assistantText("来源块", "Source block")}：${options.sourceBlockRef}` : "",
        options.sourceTitle ? `- ${assistantText("关联笔记", "Related note")}：${options.sourceTitle}` : "",
        options.sourcePath ? `- ${assistantText("路径", "Path")}：${options.sourcePath}` : "",
        `- ${assistantText("生成时间", "Generated at")}：${new Date().toLocaleString()}`,
    ].filter(Boolean);
    if (metaLines.length > 0) {
        sections.push("## " + assistantText("上下文", "Context"));
        sections.push("");
        sections.push(...metaLines);
        sections.push("");
    }
    sections.push("## " + assistantText("内容", "Content"));
    sections.push("");
    sections.push(options.content.trim());
    sections.push("");
    return sections.join("\n");
};

export const saveAssistantInboxItem = async (options: ISaveAssistantInboxItemOptions) => {
    const title = normalizeAssistantInboxTitle(options.title);
    const markdown = buildAssistantInboxMarkdown(options);
    const notebook = await resolveAssistantNoteNotebook();
    if (!notebook) {
        showMessage(assistantText("保存到 AI 收件箱失败", "Failed to save to AI Inbox"), 4000, "error");
        return null;
    }

    const tags = [ASSISTANT_INBOX_TAG, "assistant-inbox", options.kind ? `assistant-${options.kind}` : ""].filter(Boolean).join(",");
    let response: IWebSocketData;
    try {
        response = await fetchSyncPost("/api/assistant/inbox/create", {
            notebook,
            path: getAssistantNoteCreatePath(title),
            markdown,
            tags,
            sanitizeIDs: true,
            attrs: {
                [WorkbenchAttr.type]: "note",
                [WorkbenchAttr.status]: "open",
                [WorkbenchAttr.inbox]: "true",
                [WorkbenchAttr.project]: assistantText("AI 收件箱", "AI Inbox"),
                [WorkbenchAttr.goal]: `${options.goal || ""}`.trim(),
                [WorkbenchAttr.nextStep]: `${options.nextStep || ""}`.trim(),
                [WorkbenchAttr.capturedAt]: new Date().toISOString(),
                tags,
            },
        });
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        return null;
    }
    if (response.code !== 0) {
        showMessage(response.msg || assistantText("保存到 AI 收件箱失败", "Failed to save to AI Inbox"), 4000, "error");
        return null;
    }
    const id = typeof response.data === "string" ? response.data : response.data?.id as string;
    if (!id) {
        showMessage(assistantText("保存到 AI 收件箱失败", "Failed to save to AI Inbox"), 4000, "error");
        return null;
    }
    invalidateAssistantNoteContextCache();
    recordAssistantExplicitSaveHistory({
        source: "automation",
        summary: title,
        noteId: id,
        targetLabel: title,
        markdown,
        notebook,
    });
    window.dispatchEvent(new CustomEvent("assistant-inbox-updated", {
        detail: {
            id,
            kind: options.kind || "",
        },
    }));
    showMessage(assistantText("已收进 AI 收件箱", "Saved to AI Inbox"));
    return id as string;
};

export const openAssistantInbox = async (app?: App) => {
    const targetApp = app || (window.sourceflow as typeof window.sourceflow & { ws?: { app?: App } }).ws?.app;
    if (!targetApp) {
        showMessage(assistantText("当前无法打开 AI 收件箱", "AI Inbox is not available right now"), 4000, "error");
        return false;
    }
    const {openWorkbenchDialog} = await import("../../workbench/dialog");
    openWorkbenchDialog(targetApp, "inbox", undefined, ASSISTANT_INBOX_QUERY);
    return true;
};
