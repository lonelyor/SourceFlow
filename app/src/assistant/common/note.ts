import {getAllEditor} from "../../layout/getAll";
import {hasClosestByClassName} from "../../protyle/util/hasClosest";
import {hasClosestBlock} from "../../protyle/util/hasClosest";
import {fetchSyncPost} from "../../util/fetch";
import {showMessage} from "../../dialog/message";

export interface ICurrentNoteContext {
    rootID: string;
    notebook: string;
    path: string;
    title: string;
    markdown: string;
    currentBlockID: string;
    currentBlockType: string;
    currentBlockMarkdown: string;
    selectedText: string;
    outlineMarkdown?: string;
    styleSummary?: string;
    surroundingBlocks?: IAssistantNoteBlockContext[];
}

export interface IAssistantNoteCandidate {
    rootID: string;
    notebook: string;
    path: string;
    title: string;
    boxIcon?: string;
}

export interface IAssistantNoteBlockContext {
    id: string;
    type: string;
    markdown: string;
    position: "previous" | "current" | "next";
}

const resolveEditorProtyle = (editor?: import("../../protyle").Protyle | IProtyle) => {
    if (!editor) {
        return undefined;
    }
    return "protyle" in editor ? editor.protyle : editor;
};

const CURRENT_NOTE_CONTEXT_TTL = 1800;
const ROOT_NOTE_CONTEXT_TTL = 10000;
const ASSISTANT_CONTEXT_SIBLING_LIMIT = 3;

let currentNoteContextCache: {
    key: string;
    expiresAt: number;
    value: ICurrentNoteContext | null;
} | null = null;

const rootNoteContextCache = new Map<string, {
    expiresAt: number;
    value: ICurrentNoteContext | null;
}>();

const sanitizeDocName = (value: string) => {
    return value.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim() || "Assistant";
};

export const getActiveEditorProtyle = () => {
    /// #if MOBILE
    const mobileEditor = window.sourceflow.mobile.popEditor || window.sourceflow.mobile.editor;
    if (!mobileEditor) {
        return undefined;
    }
    const protyle = resolveEditorProtyle(mobileEditor);
    if (protyle?.element?.classList.contains("fn__none")) {
        return undefined;
    }
    return protyle;
    /// #else
    const range = getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : null;
    const allEditor = getAllEditor();
    let activeEditor = range ? allEditor.find((item) => item.protyle?.element?.contains(range.startContainer)) : undefined;
    if (!activeEditor) {
        activeEditor = allEditor.find((item) => {
            return !item.protyle?.element?.classList.contains("fn__none") &&
                hasClosestByClassName(item.protyle.element, "layout__wnd--active", true) &&
                item.protyle.model?.parent?.headElement?.classList.contains("item--focus");
        });
    }
    if (!activeEditor) {
        activeEditor = allEditor.find((item) => {
            return !item.protyle?.element?.classList.contains("fn__none") &&
                hasClosestByClassName(item.protyle.element, "layout__wnd--active", true);
        });
    }
    return activeEditor?.protyle;
    /// #endif
};

const cloneNoteContext = (context: ICurrentNoteContext | null) => {
    return context ? {
        ...context,
    } : null;
};

const getCurrentContextCacheKey = (rootID: string, activeBlockID: string, selectedText: string) => {
    return [rootID, activeBlockID, selectedText].join("::");
};

const isAssistantBlockElement = (element: Element | null): element is HTMLElement => {
    return !!element?.getAttribute("data-node-id");
};

const collectAssistantSiblingBlocks = (blockElement: HTMLElement | null) => {
    if (!blockElement) {
        return [] as Array<{ element: HTMLElement, position: "previous" | "current" | "next" }>;
    }
    const previous: Array<{ element: HTMLElement, position: "previous" }> = [];
    let previousElement = blockElement.previousElementSibling;
    while (previousElement && previous.length < ASSISTANT_CONTEXT_SIBLING_LIMIT) {
        if (isAssistantBlockElement(previousElement)) {
            previous.unshift({element: previousElement, position: "previous"});
        }
        previousElement = previousElement.previousElementSibling;
    }
    const next: Array<{ element: HTMLElement, position: "next" }> = [];
    let nextElement = blockElement.nextElementSibling;
    while (nextElement && next.length < ASSISTANT_CONTEXT_SIBLING_LIMIT) {
        if (isAssistantBlockElement(nextElement)) {
            next.push({element: nextElement, position: "next"});
        }
        nextElement = nextElement.nextElementSibling;
    }
    return [...previous, {element: blockElement, position: "current" as const}, ...next];
};

const fetchAssistantBlockMarkdown = async (id: string, fallback = "") => {
    const blockID = `${id || ""}`.trim();
    if (!blockID) {
        return fallback;
    }
    const response = await fetchSyncPost("/api/block/getBlockKramdown", {id: blockID});
    if (response.code !== 0) {
        return fallback;
    }
    return response.data?.kramdown || response.data || fallback;
};

const buildAssistantSurroundingBlocks = async (
    activeBlockElement: HTMLElement | null,
    activeBlockID: string,
    activeBlockMarkdown: string,
) => {
    const candidates = collectAssistantSiblingBlocks(activeBlockElement);
    if (!candidates.length) {
        const markdown = `${activeBlockMarkdown || ""}`.trim();
        return markdown ? [{
            id: activeBlockID,
            type: "",
            markdown,
            position: "current" as const,
        }] : [];
    }
    const seen = new Set<string>();
    const rows = candidates.map((item) => {
        const id = item.element.getAttribute("data-node-id") || "";
        if (!id || seen.has(id)) {
            return null;
        }
        seen.add(id);
        return {
            id,
            type: item.element.getAttribute("data-type") || "",
            position: item.position,
        };
    }).filter(Boolean) as Array<{ id: string, type: string, position: "previous" | "current" | "next" }>;
    const markdownRows = await Promise.all(rows.map(async (item) => {
        const markdown = item.id === activeBlockID
            ? `${activeBlockMarkdown || ""}`.trim()
            : `${await fetchAssistantBlockMarkdown(item.id)}`.trim();
        return {
            ...item,
            markdown,
        };
    }));
    return markdownRows.filter((item) => !!item.markdown);
};

const buildAssistantMarkdownOutline = (markdown: string) => {
    const lines = `${markdown || ""}`.split(/\r?\n/);
    const headings: string[] = [];
    for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (!match) {
            continue;
        }
        const level = match[1].length;
        const title = match[2].replace(/\s+/g, " ").trim();
        if (!title) {
            continue;
        }
        headings.push(`${"  ".repeat(Math.max(level - 1, 0))}- H${level} ${title}`);
        if (headings.length >= 32) {
            break;
        }
    }
    return headings.join("\n");
};

const buildAssistantWritingStyleSummary = (markdown: string) => {
    const normalized = `${markdown || ""}`;
    const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
        return "";
    }
    const listLines = lines.filter((line) => /^([-*+]|\d+[.)])\s+/.test(line)).length;
    const headingLevels = lines
        .map((line) => line.match(/^(#{1,6})\s+/)?.[1].length || 0)
        .filter((level) => level > 0);
    const paragraphs = lines.filter((line) => !/^#{1,6}\s+/.test(line) && !/^([-*+]|\d+[.)])\s+/.test(line));
    const paragraphLengths = paragraphs.map((line) => Array.from(line).length).filter((length) => length > 0);
    const avgParagraphLength = paragraphLengths.length
        ? Math.round(paragraphLengths.reduce((sum, length) => sum + length, 0) / paragraphLengths.length)
        : 0;
    const cjkCount = (normalized.match(/[\u4e00-\u9fff]/g) || []).length;
    const latinCount = (normalized.match(/[A-Za-z]/g) || []).length;
    const language = cjkCount >= latinCount ? "中文为主" : "英文为主";
    const listRatio = lines.length ? Math.round((listLines / lines.length) * 100) : 0;
    const maxHeadingLevel = headingLevels.length ? Math.max(...headingLevels) : 0;
    const paragraphStyle = avgParagraphLength
        ? `平均段落约 ${avgParagraphLength} 字符`
        : "段落长度不明显";
    const structureStyle = maxHeadingLevel
        ? `标题最深 H${maxHeadingLevel}`
        : "标题层级较少";
    return `写作风格：${language}，${paragraphStyle}，列表行约 ${listRatio}% ，${structureStyle}。`;
};

export const invalidateAssistantNoteContextCache = (rootID = "") => {
    currentNoteContextCache = null;
    if (!rootID.trim()) {
        rootNoteContextCache.clear();
        return;
    }
    rootNoteContextCache.delete(rootID.trim());
};

export const getNoteContextFromProtyle = async (protyle: IProtyle, range?: Range | null, fallbackSelectionText = ""): Promise<ICurrentNoteContext | null> => {
    if (!protyle?.block?.rootID) {
        return null;
    }
    const rootID = protyle.block.rootID;
    const selectionRange = range && protyle.element?.contains(range.startContainer) ? range : null;
    const selectedText = selectionRange?.toString().trim() || `${fallbackSelectionText || ""}`.trim();
    let activeBlockType = "d";
    let activeBlockElement: HTMLElement | null = null;
    const activeBlockID = (() => {
        if (selectionRange) {
            activeBlockElement = hasClosestBlock(selectionRange.startContainer) as HTMLElement;
            const blockID = activeBlockElement?.getAttribute("data-node-id") || "";
            if (blockID) {
                activeBlockType = activeBlockElement.getAttribute("data-type") || activeBlockType;
                return blockID;
            }
        }
        const fallbackID = protyle.block.id || rootID;
        if (fallbackID !== rootID) {
            activeBlockType = "";
        }
        return fallbackID;
    })();
    const cacheKey = getCurrentContextCacheKey(rootID, activeBlockID, selectedText);
    if (currentNoteContextCache && currentNoteContextCache.key === cacheKey && currentNoteContextCache.expiresAt > Date.now()) {
        return cloneNoteContext(currentNoteContextCache.value);
    }
    const [pathResponse, infoResponse, markdownResponse, blockInfoResponse, blockMarkdownResponse] = await Promise.all([
        fetchSyncPost("/api/filetree/getPathByID", {id: rootID}),
        fetchSyncPost("/api/block/getBlockInfo", {id: rootID}),
        fetchSyncPost("/api/block/getBlockKramdown", {id: rootID}),
        fetchSyncPost("/api/block/getBlockInfo", {id: activeBlockID}),
        fetchSyncPost("/api/block/getBlockKramdown", {id: activeBlockID}),
    ]);
    if (pathResponse.code !== 0 || infoResponse.code !== 0 || markdownResponse.code !== 0 ||
        blockInfoResponse.code !== 0 || blockMarkdownResponse.code !== 0) {
        return null;
    }
    const markdown = markdownResponse.data.kramdown || markdownResponse.data || "";
    const currentBlockMarkdown = blockMarkdownResponse.data.kramdown || blockMarkdownResponse.data || "";
    const surroundingBlocks = await buildAssistantSurroundingBlocks(activeBlockElement, activeBlockID, currentBlockMarkdown);
    const context: ICurrentNoteContext = {
        rootID,
        notebook: pathResponse.data.notebook,
        path: pathResponse.data.path,
        title: infoResponse.data.name || infoResponse.data.rootTitle || "Assistant",
        markdown,
        currentBlockID: activeBlockID,
        currentBlockType: activeBlockType,
        currentBlockMarkdown,
        selectedText,
        outlineMarkdown: buildAssistantMarkdownOutline(markdown),
        styleSummary: buildAssistantWritingStyleSummary(markdown),
        surroundingBlocks,
    };
    currentNoteContextCache = {
        key: cacheKey,
        expiresAt: Date.now() + CURRENT_NOTE_CONTEXT_TTL,
        value: context,
    };
    rootNoteContextCache.set(rootID, {
        expiresAt: Date.now() + ROOT_NOTE_CONTEXT_TTL,
        value: {
            ...context,
            currentBlockID: rootID,
            currentBlockType: "d",
            currentBlockMarkdown: "",
            selectedText: "",
            surroundingBlocks: [],
        },
    });
    return cloneNoteContext(context);
};

export const getCurrentNoteContext = async (): Promise<ICurrentNoteContext | null> => {
    const protyle = getActiveEditorProtyle();
    if (!protyle?.block?.rootID) {
        return null;
    }
    const range = getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : null;
    return getNoteContextFromProtyle(protyle, range);
};

export const getAssistantNoteContextByRootID = async (rootID: string): Promise<ICurrentNoteContext | null> => {
    const normalizedRootID = `${rootID || ""}`.trim();
    if (!normalizedRootID) {
        return null;
    }
    const cached = rootNoteContextCache.get(normalizedRootID);
    if (cached && cached.expiresAt > Date.now()) {
        return cloneNoteContext(cached.value);
    }
    const [pathResponse, infoResponse, markdownResponse] = await Promise.all([
        fetchSyncPost("/api/filetree/getPathByID", {id: normalizedRootID}),
        fetchSyncPost("/api/block/getBlockInfo", {id: normalizedRootID}),
        fetchSyncPost("/api/block/getBlockKramdown", {id: normalizedRootID}),
    ]);
    if (pathResponse.code !== 0 || infoResponse.code !== 0 || markdownResponse.code !== 0) {
        return null;
    }
    const markdown = markdownResponse.data.kramdown || markdownResponse.data || "";
    const context: ICurrentNoteContext = {
        rootID: normalizedRootID,
        notebook: pathResponse.data.notebook,
        path: pathResponse.data.path,
        title: infoResponse.data.name || infoResponse.data.rootTitle || "Assistant",
        markdown,
        currentBlockID: normalizedRootID,
        currentBlockType: "d",
        currentBlockMarkdown: "",
        selectedText: "",
        outlineMarkdown: buildAssistantMarkdownOutline(markdown),
        styleSummary: buildAssistantWritingStyleSummary(markdown),
        surroundingBlocks: [],
    };
    rootNoteContextCache.set(normalizedRootID, {
        expiresAt: Date.now() + ROOT_NOTE_CONTEXT_TTL,
        value: context,
    });
    return cloneNoteContext(context);
};

const getCandidateNotebook = (hPath: string, fallbackNotebook: string) => {
    const parts = `${hPath || ""}`.split("/").map((item) => item.trim()).filter(Boolean);
    return parts[0] || fallbackNotebook || "";
};

const getCandidateTitle = (hPath: string) => {
    const parts = `${hPath || ""}`.split("/").map((item) => item.trim()).filter(Boolean);
    return parts[parts.length - 1] || "Assistant";
};

export const searchAssistantNoteCandidates = async (keyword: string, limit = 12): Promise<IAssistantNoteCandidate[]> => {
    const normalizedKeyword = `${keyword || ""}`.trim();
    if (!normalizedKeyword) {
        return [];
    }
    const response = await fetchSyncPost("/api/filetree/searchDocs", {
        k: normalizedKeyword,
        flashcard: false,
        excludeIDs: [],
    });
    if (response.code !== 0 || !Array.isArray(response.data)) {
        return [];
    }
    return response.data
        .filter((item: Record<string, string>) => item?.path && item.path !== "/" && item.rootID)
        .map((item: Record<string, string>) => ({
            rootID: item.rootID,
            notebook: getCandidateNotebook(item.hPath || "", item.box || ""),
            path: item.hPath || item.path,
            title: getCandidateTitle(item.hPath || ""),
            boxIcon: item.boxIcon,
        }))
        .slice(0, Math.max(limit, 1));
};

export const appendMarkdownToCurrentNote = async (markdown: string) => {
    const protyle = getActiveEditorProtyle();
    if (!markdown.trim() || !protyle?.block?.rootID) {
        showMessage(window.sourceflow.languages.workbenchNeedCurrentNote || "请先打开一个可编辑的笔记");
        return false;
    }
    const response = await fetchSyncPost("/api/block/appendBlock", {
        parentID: protyle.block.rootID,
        data: markdown,
        dataType: "markdown",
    });
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(protyle.block.rootID);
    }
    return response.code === 0;
};

export const saveMarkdownAsAssistantNote = async (title: string, markdown: string) => {
    const context = await getCurrentNoteContext();
    let notebook = context?.notebook;
    if (!notebook) {
        const notebooksResponse = await fetchSyncPost("/api/notebook/lsNotebooks", {});
        if (notebooksResponse.code !== 0 || !notebooksResponse.data?.notebooks?.length) {
            showMessage(window.sourceflow.languages.emptyContent || "没有可用的笔记本", 3000, "error");
            return null;
        }
        notebook = notebooksResponse.data.notebooks[0].id;
    }
    const docTitle = sanitizeDocName(title);
    const response = await fetchSyncPost("/api/filetree/createDocWithMd", {
        notebook,
        path: `/AI/${docTitle}`,
        markdown,
    });
    if (response.code !== 0) {
        return null;
    }
    invalidateAssistantNoteContextCache();
    return response.data.id as string;
};

export const formatTranscriptMarkdown = (title: string, messages: Array<{ role: string, content: string, createdAt?: number }>) => {
    const sections = [`# ${sanitizeDocName(title)}`, ""];
    messages.forEach((message, index) => {
        const role = message.role === "assistant" ? "AI" : (message.role === "user" ? "User" : message.role);
        sections.push(`## ${index + 1}. ${role}`);
        sections.push("");
        sections.push(message.content.trim());
        sections.push("");
    });
    return sections.join("\n");
};
