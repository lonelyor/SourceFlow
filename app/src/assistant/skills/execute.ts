import {Dialog} from "../../dialog";
import {showMessage} from "../../dialog/message";
import {fetchSyncPost} from "../../util/fetch";
import {bgFade, highlightById} from "../../util/highlightById";
import {focusByRange} from "../../protyle/util/selection";
import {writeText} from "../../protyle/util/compatibility";
import {hasClosestBlock} from "../../protyle/util/hasClosest";
import {App} from "../../index";
import {assistantText, buildAssistantNoteContext} from "../constants";
import {escapeAttr, escapeHTML, truncateText} from "../common/dom";
import {
    getActiveEditorProtyle,
    getAssistantNoteContextByRootID,
    getNoteContextFromProtyle,
    ICurrentNoteContext,
    invalidateAssistantNoteContextCache
} from "../common/note";
import {getAssistantAIDefaultProfile, streamAssistantAI} from "../ai/api";
import {reportAssistantRuntimeError} from "../runtime";
import {getAssistantSkillDefinition} from "./registry";
import {IAssistantSkillContext, IAssistantSkillDefinition, IAssistantSkillParams, TAssistantSkillId} from "./types";

const loadAssistantAIDockModule = () => import("../ai/AIDock");
const loadAssistantInboxModule = () => import("../inbox/store");
const loadAssistantResultsModule = () => import("../results/ResultsDock");
const loadMindmapDataModule = () => import("../../protyle/render/mindmapData");

interface IRunAssistantSkillOptions {
    app?: App;
    skillId: TAssistantSkillId;
    protyle?: IProtyle;
    range?: Range | null;
    fallbackSelectionText?: string;
}

interface IAssistantLinkSuggestionItem {
    rootID: string;
    title: string;
    path: string;
    reason: string;
    currentNoteText: string;
    backlinkText: string;
    applyCurrent: boolean;
    applyBacklink: boolean;
}

interface IAssistantLinkSuggestionResult {
    summary: string;
    suggestions: IAssistantLinkSuggestionItem[];
}

interface IAssistantInsertResult {
    ok: boolean;
    blockID?: string;
}

const buildNoteContext = async (protyle: IProtyle, range?: Range | null, fallbackSelectionText = ""): Promise<ICurrentNoteContext | null> => {
    return getNoteContextFromProtyle(protyle, range, fallbackSelectionText);
};

const resolveSkillContext = async (options: IRunAssistantSkillOptions): Promise<IAssistantSkillContext> => {
    const protyle = (options.protyle || getActiveEditorProtyle()) as IProtyle | undefined;
    const range = options.range?.cloneRange() || (getSelection().rangeCount > 0 ? getSelection().getRangeAt(0).cloneRange() : null);
    const note = protyle ? await buildNoteContext(protyle, range, options.fallbackSelectionText) : null;
    const selectedText = note?.selectedText || `${options.fallbackSelectionText || ""}`.trim();
    return {
        note,
        protyle,
        range,
        hasSelection: !!selectedText,
        selectedText,
    };
};

const chooseTargetLanguage = () => {
    const fallback = assistantText("����", "English");
    return `${window.prompt(assistantText("������������ԣ�", "Translate into which language?"), fallback) || fallback}`.trim() || fallback;
};

const ensureSkillParams = (definition: IAssistantSkillDefinition): IAssistantSkillParams | null => {
    if (definition.id !== "selection-translate") {
        return {};
    }
    const targetLanguage = chooseTargetLanguage();
    if (!targetLanguage) {
        return null;
    }
    return {targetLanguage};
};

const ensureDefaultProfile = async () => {
    return getAssistantAIDefaultProfile();
};

const openAssistantChatDock = async (options: {
    message?: string,
    includeCurrentNote?: boolean,
    append?: boolean,
    pinCurrentNote?: boolean,
    clearTarget?: boolean,
    sessionId?: string,
}) => {
    try {
        const {openAssistantAIDock} = await loadAssistantAIDockModule();
        openAssistantAIDock(options);
        return true;
    } catch (error) {
        reportAssistantRuntimeError("skill:open-chat", error);
        return false;
    }
};

const saveToAssistantInbox = async (options: {
    app?: App,
    title: string,
    content: string,
    kind?: string,
    query?: string,
    sourceBlockRef?: string,
    sourceTitle?: string,
    sourcePath?: string,
    goal?: string,
    nextStep?: string,
}) => {
    try {
        const {saveAssistantInboxItem} = await loadAssistantInboxModule();
        return await saveAssistantInboxItem(options);
    } catch (error) {
        reportAssistantRuntimeError("skill:save-inbox", error);
        return false;
    }
};

const openAssistantResultsPanel = async () => {
    try {
        const {openAssistantResultsDock} = await loadAssistantResultsModule();
        openAssistantResultsDock();
        return true;
    } catch (error) {
        reportAssistantRuntimeError("skill:open-results", error);
        return false;
    }
};

const escapeMarkdownLinkText = (value: string) => `${value || ""}`
    .replace(/\r?\n+/g, " ")
    .replace(/([\[\]\(\)\\])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();

const stripAssistantJSONFence = (value: string) => {
    const trimmed = `${value || ""}`.trim();
    const fencedMatch = trimmed.match(/^```(?:json|assistant-links)?\s*([\s\S]*?)\s*```$/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }
    return trimmed;
};

const parseAssistantJSONObject = <T>(value: string): T | null => {
    const normalized = stripAssistantJSONFence(value);
    const candidates = [normalized];
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start > -1 && end > start) {
        candidates.push(normalized.slice(start, end + 1));
    }
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate) as T;
        } catch (_error) {
            // Continue trying the next candidate.
        }
    }
    return null;
};

const normalizeLinkSuggestionItem = (item: Record<string, unknown>, currentRootID: string) => {
    const rootID = `${item.rootID || item.id || ""}`.trim();
    if (!rootID || rootID === currentRootID) {
        return null;
    }
    const title = `${item.title || item.name || item.path || rootID}`.trim() || rootID;
    return {
        rootID,
        title,
        path: `${item.path || ""}`.trim(),
        reason: `${item.reason || item.why || ""}`.trim(),
        currentNoteText: `${item.currentNoteText || item.anchorText || item.reason || ""}`.trim(),
        backlinkText: `${item.backlinkText || item.reason || ""}`.trim(),
        applyCurrent: item.applyCurrent !== false,
        applyBacklink: item.applyBacklink !== false,
    } as IAssistantLinkSuggestionItem;
};

const parseAssistantLinkSuggestionResult = (value: string, currentRootID: string) => {
    const parsed = parseAssistantJSONObject<{ summary?: unknown, suggestions?: unknown[] }>(value);
    if (!parsed || !Array.isArray(parsed.suggestions)) {
        return null;
    }
    const deduped = new Map<string, IAssistantLinkSuggestionItem>();
    parsed.suggestions.forEach((item) => {
        if (!item || typeof item !== "object") {
            return;
        }
        const normalized = normalizeLinkSuggestionItem(item as Record<string, unknown>, currentRootID);
        if (!normalized) {
            return;
        }
        const existing = deduped.get(normalized.rootID);
        if (!existing) {
            deduped.set(normalized.rootID, normalized);
            return;
        }
        deduped.set(normalized.rootID, {
            ...existing,
            title: existing.title || normalized.title,
            path: existing.path || normalized.path,
            reason: existing.reason || normalized.reason,
            currentNoteText: existing.currentNoteText || normalized.currentNoteText,
            backlinkText: existing.backlinkText || normalized.backlinkText,
            applyCurrent: existing.applyCurrent || normalized.applyCurrent,
            applyBacklink: existing.applyBacklink || normalized.applyBacklink,
        });
    });
    return {
        summary: `${parsed.summary || ""}`.trim(),
        suggestions: Array.from(deduped.values()),
    } as IAssistantLinkSuggestionResult;
};

const buildLinkSuggestionMarkdown = (data: IAssistantLinkSuggestionResult) => {
    const lines = [
        `## ${assistantText("��������", "Link Suggestions")}`,
        "",
        data.summary || assistantText("������ AI ���ɵĹ������顣", "These are the AI generated relationship suggestions."),
        "",
    ];
    data.suggestions.forEach((item) => {
        const flags = [
            item.applyCurrent ? assistantText("��ǰ�ʼǽ���", "Link from current note") : "",
            item.applyBacklink ? assistantText("Ŀ��ʼǻ���", "Backlink from target note") : "",
        ].filter(Boolean).join(" / ");
        const extras = [item.path, flags, item.reason].filter(Boolean).join(" �� ");
        lines.push(`- [${escapeMarkdownLinkText(item.title)}](sf://blocks/${item.rootID})${extras ? ` �� ${extras}` : ""}`);
    });
    return lines.join("\n").trim();
};

const renderLinkSuggestionPreview = (data: IAssistantLinkSuggestionResult) => {
    const emptyText = assistantText("û�п�ִ�еĽ�������", "No actionable link suggestions");
    return `<div class="assistant-skill-dialog__structured">
    <div class="assistant-skill-dialog__structured-summary">${escapeHTML(data.summary || emptyText)}</div>
    <div class="assistant-skill-dialog__suggestions">${data.suggestions.length > 0 ? data.suggestions.map((item) => {
        const flags = [
            item.applyCurrent ? `<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("��ǰ�ʼǽ���", "Link current note"))}</span>` : "",
            item.applyBacklink ? `<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("Ŀ��ʼǻ���", "Backlink target note"))}</span>` : "",
        ].filter(Boolean).join("");
        return `<div class="assistant-skill-dialog__suggestion">
    <div class="assistant-skill-dialog__suggestion-head">
        <div class="assistant-skill-dialog__suggestion-title">${escapeHTML(item.title)}</div>
        <div class="assistant-skill-dialog__suggestion-chips">${flags}</div>
    </div>
    ${item.path ? `<div class="assistant-skill-dialog__suggestion-path">${escapeHTML(item.path)}</div>` : ""}
    ${item.reason ? `<div class="assistant-skill-dialog__suggestion-reason">${escapeHTML(item.reason)}</div>` : ""}
</div>`;
    }).join("") : `<div class="assistant-skill-dialog__suggestion assistant-skill-dialog__suggestion--empty">${escapeHTML(emptyText)}</div>`}</div>
</div>`;
};

const normalizeMarkdown = (result: string) => {
    return `${result || ""}`.trim();
};

const getInsertedBlockIDFromResponse = (response: { data?: Array<{ doOperations?: Array<{ id?: string, blockID?: string }> }> }) => {
    return `${response?.data?.[0]?.doOperations?.[0]?.id || response?.data?.[0]?.doOperations?.[0]?.blockID || ""}`.trim();
};

const highlightCurrentContextBlock = (context: IAssistantSkillContext) => {
    const activeRange = getSelection().rangeCount > 0
        ? getSelection().getRangeAt(0)
        : (context.range || null);
    const activeBlock = activeRange ? hasClosestBlock(activeRange.startContainer) as HTMLElement : null;
    if (activeBlock) {
        bgFade(activeBlock);
        return true;
    }
    const fallbackID = context.note?.currentBlockID || context.note?.rootID || "";
    const fallbackElement = fallbackID && context.protyle
        ? context.protyle.wysiwyg.element.querySelector(`[data-node-id="${fallbackID}"]`) as HTMLElement
        : null;
    if (fallbackElement) {
        bgFade(fallbackElement);
        return true;
    }
    return false;
};

const highlightInsertedBlock = (context: IAssistantSkillContext, blockID?: string) => {
    if (!context.protyle || !blockID) {
        return false;
    }
    const protyle = context.protyle;
    const scheduleHighlight = (retries: number) => {
        if (!protyle.wysiwyg?.element?.isConnected) {
            return;
        }
        const targetElement = protyle.wysiwyg.element.querySelector(`[data-node-id="${blockID}"]`) as HTMLElement;
        if (targetElement) {
            highlightById(protyle, blockID);
            return;
        }
        if (retries > 0) {
            window.setTimeout(() => scheduleHighlight(retries - 1), 80);
        }
    };
    window.setTimeout(() => scheduleHighlight(8), 32);
    return true;
};

const presentSkillApplyFeedback = (context: IAssistantSkillContext, options: {
    blockID?: string,
    fallbackMessage: string,
}) => {
    if (options.blockID && highlightInsertedBlock(context, options.blockID)) {
        return;
    }
    if (highlightCurrentContextBlock(context)) {
        return;
    }
    showMessage(options.fallbackMessage);
};

const insertMarkdownNearCurrentContext = async (context: IAssistantSkillContext, markdown: string): Promise<IAssistantInsertResult> => {
    const normalized = normalizeMarkdown(markdown);
    if (!normalized || !context.note) {
        return {ok: false};
    }
    let response;
    if (context.note.currentBlockID && context.note.currentBlockID !== context.note.rootID) {
        response = await fetchSyncPost("/api/block/insertBlock", {
            previousID: context.note.currentBlockID,
            data: normalized,
            dataType: "markdown",
        });
    } else {
        response = await fetchSyncPost("/api/block/appendBlock", {
            parentID: context.note.rootID,
            data: normalized,
            dataType: "markdown",
        });
    }
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(context.note.rootID);
    }
    return {
        ok: response.code === 0,
        blockID: response.code === 0 ? getInsertedBlockIDFromResponse(response) : "",
    };
};

const appendMarkdownToNoteByRootID = async (rootID: string, markdown: string) => {
    const normalized = normalizeMarkdown(markdown);
    if (!rootID.trim() || !normalized) {
        return false;
    }
    const response = await fetchSyncPost("/api/block/appendBlock", {
        parentID: rootID,
        data: normalized,
        dataType: "markdown",
    });
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(rootID);
    }
    return response.code === 0;
};

const insertMindElixirNearCurrentContext = async (context: IAssistantSkillContext, responseText: string): Promise<IAssistantInsertResult> => {
    const {buildMindElixirAttrs, buildMindElixirHTMLBlockDOM, parseMindElixirData} = await loadMindmapDataModule();
    const data = parseMindElixirData(responseText);
    if (!data || !context.note) {
        return {ok: false};
    }
    const blockID = Lute.NewNodeID();
    const blockDOM = buildMindElixirHTMLBlockDOM(data, {
        id: blockID,
    });
    let response;
    if (context.note.currentBlockID && context.note.currentBlockID !== context.note.rootID) {
        response = await fetchSyncPost("/api/block/insertBlock", {
            previousID: context.note.currentBlockID,
            data: blockDOM,
            dataType: "dom",
        });
    } else {
        response = await fetchSyncPost("/api/block/appendBlock", {
            parentID: context.note.rootID,
            data: blockDOM,
            dataType: "dom",
        });
    }
    if (response.code !== 0) {
        return {ok: false};
    }
    const attrs = buildMindElixirAttrs(data);
    const attrsResponse = await fetchSyncPost("/api/attr/setBlockAttrs", {
        id: blockID,
        attrs,
    });
    if (attrsResponse.code === 0) {
        invalidateAssistantNoteContextCache(context.note.rootID);
    }
    return {
        ok: attrsResponse.code === 0,
        blockID: attrsResponse.code === 0 ? blockID : "",
    };
};

const noteContainsBlockLink = (markdown: string, rootID: string) => {
    const normalizedMarkdown = `${markdown || ""}`;
    const normalizedRootID = `${rootID || ""}`.trim();
    if (!normalizedRootID) {
        return false;
    }
    return normalizedMarkdown.includes(`sf://blocks/${normalizedRootID}`) || normalizedMarkdown.includes(normalizedRootID);
};

const buildAssistantLinkBullet = (title: string, rootID: string, detail = "") => {
    const safeTitle = escapeMarkdownLinkText(title || rootID);
    const safeDetail = `${detail || ""}`.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
    return `- [${safeTitle}](sf://blocks/${rootID})${safeDetail ? ` �� ${safeDetail}` : ""}`;
};

const buildAssistantLinkSection = (heading: string, lines: string[]) => {
    if (lines.length === 0) {
        return "";
    }
    return `## ${heading}\n\n${lines.join("\n")}`;
};

const applyAssistantLinkSuggestions = async (context: IAssistantSkillContext, parsed: IAssistantLinkSuggestionResult) => {
    if (!context.note) {
        return {
            ok: false,
            message: assistantText("��ǰû�п��õıʼ�������", "The current note context is unavailable"),
        };
    }
    const currentLines = parsed.suggestions
        .filter((item) => item.applyCurrent && !noteContainsBlockLink(context.note?.markdown || "", item.rootID))
        .map((item) => buildAssistantLinkBullet(item.title, item.rootID, item.currentNoteText || item.reason));
    let appliedCurrent = 0;
    let failedCurrent = 0;
    if (currentLines.length > 0) {
        const ok = await appendMarkdownToNoteByRootID(context.note.rootID, buildAssistantLinkSection(
            assistantText("AI ��������ʼ�", "AI Suggested Related Notes"),
            currentLines
        ));
        if (ok) {
            appliedCurrent = currentLines.length;
        } else {
            failedCurrent = currentLines.length;
        }
    }

    let appliedBacklinks = 0;
    let skippedBacklinks = 0;
    let failedBacklinks = 0;
    for (const item of parsed.suggestions) {
        if (!item.applyBacklink) {
            continue;
        }
        const targetNote = await getAssistantNoteContextByRootID(item.rootID);
        if (!targetNote) {
            failedBacklinks += 1;
            continue;
        }
        if (noteContainsBlockLink(targetNote.markdown, context.note.rootID)) {
            skippedBacklinks += 1;
            continue;
        }
        const backlinkLine = buildAssistantLinkBullet(
            context.note.title || assistantText("��ǰ�ʼ�", "Current note"),
            context.note.rootID,
            item.backlinkText || item.reason
        );
        const ok = await appendMarkdownToNoteByRootID(targetNote.rootID, buildAssistantLinkSection(
            assistantText("AI �������", "AI Suggested Backlink"),
            [backlinkLine]
        ));
        if (ok) {
            appliedBacklinks += 1;
        } else {
            failedBacklinks += 1;
        }
    }

    const appliedTotal = appliedCurrent + appliedBacklinks;
    if (appliedTotal === 0) {
        return {
            ok: false,
            message: assistantText(
                "û���µĽ��������ִ�У�������ӿ����Ѿ����ڡ�",
                "There were no new link suggestions to apply. The related links may already exist."
            ),
        };
    }
    const messageParts = [
        assistantText("��Ӧ�ý�������", "Applied link suggestions"),
        `${assistantText("��ǰ�ʼ�", "Current note")} ${appliedCurrent}`,
        `${assistantText("����", "Backlinks")} ${appliedBacklinks}`,
        skippedBacklinks ? `${assistantText("������", "Skipped")} ${skippedBacklinks}` : "",
        failedCurrent || failedBacklinks ? `${assistantText("ʧ��", "Failed")} ${failedCurrent + failedBacklinks}` : "",
    ].filter(Boolean);
    return {
        ok: true,
        message: messageParts.join(" �� "),
    };
};

const replaceCurrentSelection = (context: IAssistantSkillContext, text: string) => {
    if (!context.range || !context.range.toString().trim()) {
        return false;
    }
    focusByRange(context.range);
    const replaced = document.execCommand("insertText", false, `${text || ""}`.trim());
    if (replaced && context.note?.rootID) {
        invalidateAssistantNoteContextCache(context.note.rootID);
    }
    return replaced;
};

const buildSkillInboxTitle = (definition: IAssistantSkillDefinition, context: IAssistantSkillContext) => {
    return `${definition.shortLabel} �� ${context.note?.title || assistantText("δ�����ʼ�", "Untitled note")}`;
};

const buildCaptureTitle = (sourceText: string, fallback: string) => {
    const normalized = `${sourceText || ""}`.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return fallback;
    }
    return truncateText(normalized.split(/[.!?������\n]/)[0] || normalized, 40) || fallback;
};

const buildContextReference = (context: IAssistantSkillContext) => {
    if (!context.note) {
        return "";
    }
    const blockID = context.note.currentBlockID || context.note.rootID;
    const title = blockID === context.note.rootID
        ? (context.note.title || assistantText("��ǰ�ʼ�", "Current note"))
        : assistantText(`${context.note.title || assistantText("��ǰ�ʼ�", "Current note")} �� ��ǰ��`, `${context.note.title || assistantText("Current note", "Current note")} �� Current block`);
    return `((${blockID} '${title.replace(/'/g, " ")}'))`;
};

const buildContextNoteReference = (context: IAssistantSkillContext) => {
    if (!context.note) {
        return "";
    }
    const title = context.note.title || assistantText("��ǰ�ʼ�", "Current note");
    return `((${context.note.rootID} '${title.replace(/'/g, " ")}'))`;
};

const appendResultCitation = (result: string, context: IAssistantSkillContext) => {
    const normalized = normalizeMarkdown(result);
    if (!normalized || !context.note) {
        return normalized;
    }
    if (normalized.includes("## " + assistantText("��Դ", "Source"))) {
        return normalized;
    }
    const lines = [normalized, "", `## ${assistantText("��Դ", "Source")}`, "", `- ${assistantText("��Դ��", "Source block")}��${buildContextReference(context)}`];
    const noteRef = buildContextNoteReference(context);
    if (noteRef && context.note.currentBlockID && context.note.currentBlockID !== context.note.rootID) {
        lines.push(`- ${assistantText("��Դ�ʼ�", "Source note")}��${noteRef}`);
    }
    return lines.join("\n").trim();
};

const buildCaptureContent = (context: IAssistantSkillContext) => {
    const sections: string[] = [];
    const noteRef = buildContextReference(context);
    if (noteRef) {
        sections.push(`${assistantText("��Դ�ʼ�", "Source note")}��${noteRef}`);
    }
    if (context.selectedText) {
        sections.push(`${assistantText("ѡ������", "Selected content")}��`);
        sections.push(context.selectedText.trim());
    }
    return sections.join("\n\n").trim();
};

const formatDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const formatDateTimeLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const hour = `${date.getHours()}`.padStart(2, "0");
    const minute = `${date.getMinutes()}`.padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
};

const openCaptureFromSkill = async (definition: IAssistantSkillDefinition, context: IAssistantSkillContext, app?: App) => {
    const targetApp = app || context.protyle?.app;
    if (!targetApp) {
        showMessage(assistantText("��ǰ�޷�������/�����ռ�", "Task/reminder capture is not available right now"), 4000, "error");
        return false;
    }
    const selectedTitle = buildCaptureTitle(context.selectedText, context.note?.title || definition.shortLabel);
    const noteTitle = buildCaptureTitle(context.note?.title || "", definition.shortLabel);
    const now = new Date();
    const tomorrow = new Date(now.getTime());
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const title = context.hasSelection ? selectedTitle : noteTitle;
    const content = buildCaptureContent(context);
    const project = "";
    const {openWorkbenchItemDialog} = await import("../../workbench/itemDialog");
    if (definition.action === "capture-task") {
        await openWorkbenchItemDialog(targetApp, "task", {
            mode: "task",
            title,
            content,
            project,
            dueDate: formatDateInput(tomorrow),
            modeTags: ["assistant", "assistant-task"],
        });
        return true;
    }
    if (definition.action === "capture-event") {
        await openWorkbenchItemDialog(targetApp, "event", {
            mode: "event",
            title,
            content,
            project,
            eventTime: formatDateTimeLocal(tomorrow),
            modeTags: ["assistant", "assistant-event"],
        });
        return true;
    }
    return false;
};

const openSkillResultDialog = (definition: IAssistantSkillDefinition, context: IAssistantSkillContext, result: string, sessionId = "") => {
    const canReplaceSelection = definition.action === "replace-selection" && !!context.range?.toString().trim();
    const canInsert = !!context.note;
    const parsedLinkSuggestions = definition.id === "note-links" && context.note
        ? parseAssistantLinkSuggestionResult(result, context.note.rootID)
        : null;
    const displayResult = parsedLinkSuggestions ? buildLinkSuggestionMarkdown(parsedLinkSuggestions) : (definition.output === "markdown" ? result : `${result}`.trim());
    const resultWithCitation = appendResultCitation(displayResult, context);
    const previewMode = parsedLinkSuggestions ? "structured" : (definition.output === "markdown" ? "markdown" : "text");
    const previewHTML = parsedLinkSuggestions ? renderLinkSuggestionPreview(parsedLinkSuggestions) : escapeHTML(displayResult);
    const dialog = new Dialog({
        title: definition.label,
        width: "720px",
        height: "72vh",
        content: `<div class="assistant-skill-dialog fn__flex-column">
    <div class="assistant-skill-dialog__meta">
        <div class="assistant-skill-dialog__title">${escapeHTML(definition.label)}</div>
        <div class="assistant-skill-dialog__subtitle">${escapeHTML(context.note ? `${context.note.title} �� ${truncateText(context.note.path, 72)}` : definition.description)}</div>
    </div>
    <div class="assistant-skill-dialog__preview assistant-skill-dialog__preview--${previewMode}">${previewHTML}</div>
    <div class="assistant-skill-dialog__actions">
        <button type="button" class="b3-button b3-button--outline" data-action="copy-result">${assistantText("���ƽ��", "Copy result")}</button>
        ${canReplaceSelection ? `<button type="button" class="b3-button b3-button--outline" data-action="replace-selection">${assistantText("�滻ѡ��", "Replace selection")}</button>` : ""}
        ${canInsert ? `<button type="button" class="b3-button b3-button--text" data-action="insert-note">${assistantText("���뵱ǰ�ʼ�", "Insert into current note")}</button>` : ""}
        ${parsedLinkSuggestions?.suggestions.length ? `<button type="button" class="b3-button b3-button--text" data-action="apply-links">${assistantText("һ��Ӧ�ý�������", "Apply link suggestions")}</button>` : ""}
        <button type="button" class="b3-button b3-button--outline" data-action="save-inbox">${assistantText("���浽�ɹ�����", "Save to Results")}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="open-inbox">${assistantText("�򿪳ɹ�����", "Open Results")}</button>
        ${sessionId ? `<button type="button" class="b3-button b3-button--outline" data-action="open-chat" data-session-id="${escapeAttr(sessionId)}">${assistantText("��������", "Continue in chat")}</button>` : ""}
        <button type="button" class="b3-button b3-button--cancel" data-action="close">${window.sourceflow.languages.close}</button>
    </div>
</div>`,
    });
    dialog.element.setAttribute("data-key", "assistant-skill-result");
    dialog.element.addEventListener("click", async (event) => {
        let target = event.target as HTMLElement;
        while (target && !target.isEqualNode(dialog.element)) {
            const action = target.getAttribute("data-action");
            if (!action) {
                target = target.parentElement;
                continue;
            }
            if (action === "copy-result") {
                writeText(displayResult);
                showMessage(assistantText("����Ѹ���", "Result copied"));
                event.preventDefault();
                return;
            }
            if (action === "replace-selection") {
                const replaced = replaceCurrentSelection(context, displayResult);
                if (replaced) {
                    dialog.destroy();
                    presentSkillApplyFeedback(context, {
                        fallbackMessage: assistantText("���滻ѡ������", "Selection replaced"),
                    });
                } else {
                    showMessage(assistantText("�滻ʧ�ܣ�����ò������", "Replace failed. Use insert or copy instead."), 4000, "error");
                }
                event.preventDefault();
                return;
            }
            if (action === "insert-note") {
                const inserted = await insertMarkdownNearCurrentContext(context, resultWithCitation);
                if (inserted.ok) {
                    dialog.destroy();
                    presentSkillApplyFeedback(context, {
                        blockID: inserted.blockID,
                        fallbackMessage: assistantText("�����д�뵱ǰ�ʼ�", "Result inserted into the current note"),
                    });
                } else {
                    showMessage(assistantText("д�뵱ǰ�ʼ�ʧ��", "Failed to insert into the current note"), 4000, "error");
                }
                event.preventDefault();
                return;
            }
            if (action === "apply-links") {
                if (!parsedLinkSuggestions) {
                    showMessage(assistantText("��ǰ���û�п�ִ�еĽ�������", "This result does not contain actionable link suggestions"), 4000, "error");
                    event.preventDefault();
                    return;
                }
                const applied = await applyAssistantLinkSuggestions(context, parsedLinkSuggestions);
                showMessage(applied.message, applied.ok ? 3000 : 5000, applied.ok ? "info" : "error");
                if (applied.ok) {
                    dialog.destroy();
                }
                event.preventDefault();
                return;
            }
            if (action === "save-inbox") {
                const saved = await saveToAssistantInbox({
                    app: context.protyle?.app,
                    title: buildSkillInboxTitle(definition, context),
                    content: resultWithCitation,
                    kind: definition.id,
                    sourceBlockRef: buildContextReference(context),
                    sourceTitle: context.note?.title,
                    sourcePath: context.note?.path,
                    goal: definition.label,
                    nextStep: assistantText("�ص��ɹ�������������Ӧ�á���д���Ǽ��������", "Review it in the results sidebar and decide whether to apply, refine, or continue."),
                });
                if (saved) {
                    await openAssistantResultsPanel();
                    dialog.destroy();
                }
                event.preventDefault();
                return;
            }
            if (action === "open-inbox") {
                await openAssistantResultsPanel();
                event.preventDefault();
                return;
            }
            if (action === "open-chat") {
                if (await openAssistantChatDock({sessionId})) {
                    dialog.destroy();
                }
                event.preventDefault();
                return;
            }
            if (action === "close") {
                dialog.destroy();
                event.preventDefault();
                return;
            }
            target = target.parentElement;
        }
    });
};

const createSkillLoadingDialog = (definition: IAssistantSkillDefinition, context: IAssistantSkillContext) => {
    const dialog = new Dialog({
        title: definition.label,
        width: "420px",
        height: window.innerWidth < 680 ? "42vh" : "320px",
        content: `<div class="assistant-skill-dialog assistant-skill-dialog--compact fn__flex-column">
    <div class="assistant-skill-dialog__meta">
        <div class="assistant-skill-dialog__title">${escapeHTML(definition.label)}</div>
        <div class="assistant-skill-dialog__subtitle">${escapeHTML(context.note ? `${context.note.title} �� ${truncateText(context.note.path, 72)}` : definition.description)}</div>
    </div>
    <div class="assistant-skill-dialog__loading-hint">${escapeHTML(assistantText("�������ɣ���ɺ��ֱ��Ӧ��Ĭ�϶�����", "Generating now. The default action will be applied automatically once it finishes..."))}</div>
    <div class="assistant-skill-dialog__preview assistant-skill-dialog__preview--text" data-role="stream-preview">${escapeHTML(assistantText("׼����...", "Preparing..."))}</div>
</div>`,
    });
    dialog.element.setAttribute("data-key", "assistant-skill-loading");
    return dialog;
};

const updateSkillLoadingDialog = (dialog: Dialog, partial: string) => {
    const preview = dialog.element.querySelector("[data-role='stream-preview']") as HTMLElement;
    if (!preview) {
        return;
    }
    const text = `${partial || ""}`.trim();
    preview.textContent = text || assistantText("׼����...", "Preparing...");
};

const applySkillResultAutomatically = async (definition: IAssistantSkillDefinition, context: IAssistantSkillContext, reply: string) => {
    if (definition.action === "replace-selection") {
        const replaced = replaceCurrentSelection(context, reply);
        if (replaced) {
            presentSkillApplyFeedback(context, {
                fallbackMessage: assistantText("��Ӧ�õ���ǰѡ������", "Applied to the current selection"),
            });
            return true;
        }
        return false;
    }
    if (definition.action === "insert-below" || definition.action === "append-note") {
        const inserted = await insertMarkdownNearCurrentContext(context, appendResultCitation(reply, context));
        if (inserted.ok) {
            presentSkillApplyFeedback(context, {
                blockID: inserted.blockID,
                fallbackMessage: assistantText("�����д�뵱ǰ�ʼ�", "Inserted into the current note"),
            });
            return true;
        }
        return false;
    }
    if (definition.action === "insert-mind-elixir") {
        const insertedMindElixir = await insertMindElixirNearCurrentContext(context, reply);
        if (insertedMindElixir.ok) {
            presentSkillApplyFeedback(context, {
                blockID: insertedMindElixir.blockID,
                fallbackMessage: assistantText("˼ά��ͼ�Ѳ��뵱ǰ�ʼ�", "Mind map inserted into the current note"),
            });
            return true;
        }
        return false;
    }
    return false;
};

export const runAssistantSkill = async (options: IRunAssistantSkillOptions) => {
    const definition = getAssistantSkillDefinition(options.skillId);
    if (!definition) {
        return false;
    }
    const context = await resolveSkillContext(options);
    if (definition.requiresNote && !context.note) {
        showMessage(assistantText("���ȴ�һ���ʼ���ʹ���������", "Open a note before using this skill"), 4000, "error");
        return false;
    }
    if (definition.requiresSelection && !context.hasSelection) {
        showMessage(assistantText("����ѡ��Ҫ���������", "Select some content first"), 4000, "error");
        return false;
    }
    const params = ensureSkillParams(definition);
    if (!params) {
        return false;
    }
    if (definition.action === "capture-task" || definition.action === "capture-event") {
        return openCaptureFromSkill(definition, context, options.app);
    }
    if (definition.action === "chat") {
        return await openAssistantChatDock({
            message: definition.buildMessage(context, params),
            includeCurrentNote: !!context.note,
        });
    }
    const profile = await ensureDefaultProfile();
    if (!profile) {
        showMessage(assistantText("������������һ�� AI ģ��", "Configure at least one AI profile first"), 5000, "error");
        return false;
    }
    const loadingDialog = createSkillLoadingDialog(definition, context);
    try {
        let partialReply = "";
        let previewTimer = 0;
        const flushStreamPreview = () => {
            previewTimer = 0;
            updateSkillLoadingDialog(loadingDialog, partialReply);
        };
        const requestTitle = truncateText(`${definition.shortLabel} ${context.note?.title || ""}`.trim(), 72) || definition.label;
        const result = await streamAssistantAI({
            profileId: profile.id,
            mode: "chat",
            title: requestTitle,
            message: definition.buildMessage(context, params),
            system: context.note ? buildAssistantNoteContext(context.note) : "",
            enableTools: definition.allowTools === true,
            context: context.note || undefined,
        }, {
            onDelta: (delta) => {
                partialReply += delta;
                if (!previewTimer) {
                    previewTimer = window.setTimeout(flushStreamPreview, 48);
                }
            },
        });
        if (previewTimer) {
            window.clearTimeout(previewTimer);
            flushStreamPreview();
        }
        const reply = [...result.messages].reverse().find((item) => item.role === "assistant")?.content?.trim() || "";
        loadingDialog.destroy();
        if (!reply) {
            showMessage(assistantText("AI û�з��ؿ��ý��", "The AI did not return a usable result"), 4000, "error");
            return false;
        }
        if (definition.resultMode === "auto-apply") {
            const applied = await applySkillResultAutomatically(definition, context, reply);
            if (applied) {
                return true;
            }
            showMessage(assistantText("�Զ�Ӧ��ʧ�ܣ��Ѵ򿪽��Ԥ��", "Automatic apply failed. Opened the result preview instead."), 5000, "error");
        }
        openSkillResultDialog(definition, context, reply, result.session.id);
        return true;
    } catch (error) {
        loadingDialog.destroy();
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        return false;
    }
};
