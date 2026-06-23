import {hideMessage, showMessage} from "../dialog/message";
import {fetchSyncPost} from "../util/fetch";
import {chatAssistantAI, getAssistantAIDefaultProfile} from "./ai/api";
import {getAssistantNoteContextByRootID} from "./common/note";
import {openFileById} from "../editor/util";
import {App} from "../index";
import {getDisplayName, getNotebookName, pathPosix} from "../util/pathName";
import * as dayjs from "dayjs";
import {Constants} from "../constants";
import {recordAssistantExplicitSaveHistory} from "./history/operations";

interface IFolderReviewDocEntry {
    id: string;
    path: string;
    name: string;
    subFileCount: number;
}

const folderReviewText = (zh: string, en: string) => {
    return window.sourceflow.config.lang === "zh_CN" ? zh : en;
};

const FOLDER_REVIEW_LIMIT = 24;
const FOLDER_REVIEW_SNIPPET_LIMIT = 1500;

const normalizeDocHPath = (pathString: string) => {
    if (!pathString || pathString === "/") {
        return "/";
    }
    return getDisplayName(pathString, false, true) || "/";
};

const sanitizeDocPathSegment = (value: string) => {
    return `${value || ""}`.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
};

const buildReportPath = (notebookId: string, pathString: string, name?: string) => {
    const docHPath = normalizeDocHPath(pathString);
    const baseDir = docHPath === "/" ? "/AI" : pathPosix().dirname(docHPath);
    const baseName = sanitizeDocPathSegment(name || pathPosix().basename(docHPath) || getNotebookName(notebookId) || "Review");
    const title = `${baseName} · ${folderReviewText("AI复盘", "AI Review")} ${dayjs().format("YYYYMMDD-HHmmss")}`;
    return pathPosix().join(baseDir, title);
};

const appendDocEntries = async (notebookId: string, pathString: string, entries: IFolderReviewDocEntry[], visited: Set<string>) => {
    if (entries.length >= FOLDER_REVIEW_LIMIT || visited.has(pathString)) {
        return;
    }
    visited.add(pathString);
    const response = await fetchSyncPost("/api/filetree/listDocsByPath", {
        notebook: notebookId,
        path: pathString,
        maxListCount: FOLDER_REVIEW_LIMIT,
        ignoreMaxListHint: true,
    });
    if (response.code !== 0 || !Array.isArray(response.data?.files)) {
        return;
    }
    for (const item of response.data.files as IFolderReviewDocEntry[]) {
        if (!item?.id) {
            continue;
        }
        entries.push({
            id: item.id,
            path: item.path,
            name: item.name,
            subFileCount: item.subFileCount || 0,
        });
        if (entries.length >= FOLDER_REVIEW_LIMIT) {
            break;
        }
        if ((item.subFileCount || 0) > 0) {
            await appendDocEntries(notebookId, item.path, entries, visited);
            if (entries.length >= FOLDER_REVIEW_LIMIT) {
                break;
            }
        }
    }
};

const buildReviewPrompt = async (folderName: string, notebookId: string, pathString: string, docs: IFolderReviewDocEntry[]) => {
    const lines: string[] = [];
    for (const [index, doc] of docs.entries()) {
        const context = await getAssistantNoteContextByRootID(doc.id);
        if (!context) {
            continue;
        }
        const snippet = `${context.markdown || ""}`.trim().slice(0, FOLDER_REVIEW_SNIPPET_LIMIT);
        lines.push([
            `## ${index + 1}. ${context.title || doc.name || doc.id}`,
            "",
            `- Notebook: ${context.notebook || notebookId}`,
            `- Path: ${context.path || doc.path}`,
            snippet ? `- Excerpt:\n\n${snippet}` : "- Excerpt: (empty)",
            "",
        ].join("\n"));
        if (lines.length >= FOLDER_REVIEW_LIMIT) {
            break;
        }
    }
    const scopePath = normalizeDocHPath(pathString);
    return [
        folderReviewText(
            "请对下面这组笔记做一次自动化复盘，输出一篇适合直接保存为 SourceFlow 笔记的 Markdown 报告。",
            "Review the following note collection and return a Markdown report suitable for saving directly into SourceFlow."
        ),
        "",
        folderReviewText(
            "要求：",
            "Requirements:"
        ),
        folderReviewText(
            "- 先总结这组笔记在做什么、推进到哪里了",
            "- First summarize what this note set is about and how far it has progressed"
        ),
        folderReviewText(
            "- 再列出已经完成、正在推进、明显缺失、风险问题",
            "- Then list what is done, in progress, clearly missing, and risky"
        ),
        folderReviewText(
            "- 最后给出下一步行动建议和推荐的整理结构",
            "- Finally provide next actions and a suggested cleanup structure"
        ),
        folderReviewText(
            "- 只输出 Markdown，不要额外寒暄",
            "- Output Markdown only, with no extra chatter"
        ),
        "",
        `- Scope name: ${folderName}`,
        `- Notebook: ${getNotebookName(notebookId) || notebookId}`,
        `- Scope path: ${scopePath}`,
        `- Note count: ${docs.length}`,
        "",
        lines.join("\n"),
    ].join("\n");
};

export const runFolderAIReview = async (app: App, options: {
    notebookId: string;
    pathString: string;
    rootID?: string;
    name?: string;
}) => {
    const notebookId = `${options.notebookId || ""}`.trim();
    if (!notebookId) {
        return;
    }
    const profile = await getAssistantAIDefaultProfile();
    if (!profile?.id) {
        showMessage(folderReviewText("请先配置默认 AI 模型", "Configure a default AI profile first"), 5000, "error");
        return;
    }

    const loading = showMessage(folderReviewText("AI 正在自动化复盘...", "AI is generating a review..."), -1);
    try {
        const docs: IFolderReviewDocEntry[] = [];
        const visited = new Set<string>();
        if (options.rootID) {
            docs.push({
                id: options.rootID,
                path: options.pathString,
                name: options.name || "",
                subFileCount: 0,
            });
        }
        await appendDocEntries(notebookId, options.pathString, docs, visited);
        const uniqueDocs = docs.filter((item, index, list) => {
            return list.findIndex((subItem) => subItem.id === item.id) === index;
        }).slice(0, FOLDER_REVIEW_LIMIT);
        if (!uniqueDocs.length) {
            showMessage(folderReviewText("当前目录下没有可复盘的笔记", "No reviewable notes were found in this scope"), 5000, "warning");
            return;
        }

        const scopeName = options.name || (options.pathString === "/" ? getNotebookName(notebookId) : pathPosix().basename(normalizeDocHPath(options.pathString))) || "Review";
        const prompt = await buildReviewPrompt(scopeName, notebookId, options.pathString, uniqueDocs);
        const result = await chatAssistantAI({
            profileId: profile.id,
            mode: "chat",
            title: `${scopeName} ${folderReviewText("自动化复盘", "Automated Review")}`,
            message: prompt,
            system: folderReviewText(
                "你是 SourceFlow 内置的项目复盘助手。请只返回结构清晰、结论明确的 Markdown 报告。",
                "You are SourceFlow's built-in review assistant. Return only a clear Markdown report."
            ),
            enableTools: false,
        });
        const content = `${result?.assistantMessage?.content || ""}`.trim();
        if (!content) {
            throw new Error(folderReviewText("AI 没有返回可保存的复盘内容", "The AI did not return a savable review"));
        }
        const reportPath = buildReportPath(notebookId, options.pathString, scopeName);
        const saveResponse = await fetchSyncPost("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: reportPath,
            markdown: content,
            tags: "ai,review",
            sanitizeIDs: true,
        });
        if (saveResponse.code !== 0) {
            throw new Error(saveResponse.msg || folderReviewText("保存复盘报告失败", "Failed to save the review note"));
        }
        const savedID = typeof saveResponse.data === "string" ? saveResponse.data : saveResponse.data?.id;
        if (!savedID) {
            throw new Error(folderReviewText("保存复盘报告失败：缺少新笔记 ID", "Failed to save the review note: missing note ID"));
        }
        recordAssistantExplicitSaveHistory({
            source: "automation",
            summary: scopeName,
            noteId: savedID,
            targetLabel: scopeName,
            markdown: content,
        });
        openFileById({
            app,
            id: savedID,
            action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS],
        });
        showMessage(folderReviewText("AI 复盘报告已生成", "AI review note created"), 4000, "info");
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 7000, "error");
    } finally {
        hideMessage(loading);
    }
};
