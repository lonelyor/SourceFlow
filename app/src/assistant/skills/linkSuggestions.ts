import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {escapeHTML} from "../common/dom";
import {getAssistantNoteContextByRootID} from "../common/note";
import {createAssistantPatchID} from "../patch/build";
import type {IAssistantEditPatch, IAssistantPatchOperation} from "../patch/types";
import type {IAssistantSkillContext, IAssistantSkillDefinition} from "./types";

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

export interface IAssistantLinkSuggestionResult {
    summary: string;
    suggestions: IAssistantLinkSuggestionItem[];
}

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

export const parseAssistantLinkSuggestionResult = (value: string, currentRootID: string) => {
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
        deduped.set(normalized.rootID, existing ? {
            ...existing,
            title: existing.title || normalized.title,
            path: existing.path || normalized.path,
            reason: existing.reason || normalized.reason,
            currentNoteText: existing.currentNoteText || normalized.currentNoteText,
            backlinkText: existing.backlinkText || normalized.backlinkText,
            applyCurrent: existing.applyCurrent || normalized.applyCurrent,
            applyBacklink: existing.applyBacklink || normalized.applyBacklink,
        } : normalized);
    });
    return {
        summary: `${parsed.summary || ""}`.trim(),
        suggestions: Array.from(deduped.values()),
    } as IAssistantLinkSuggestionResult;
};

export const buildLinkSuggestionMarkdown = (data: IAssistantLinkSuggestionResult) => {
    const lines = [
        `## ${assistantText("关联建议", "Link Suggestions")}`,
        "",
        data.summary || assistantText("这些是 AI 生成的关联建议。", "These are the AI generated relationship suggestions."),
        "",
    ];
    data.suggestions.forEach((item) => {
        const flags = [
            item.applyCurrent ? assistantText("当前笔记建链", "Link from current note") : "",
            item.applyBacklink ? assistantText("目标笔记回链", "Backlink from target note") : "",
        ].filter(Boolean).join(" / ");
        const extras = [item.path, flags, item.reason].filter(Boolean).join(" · ");
        lines.push(`- [${escapeMarkdownLinkText(item.title)}](sf://blocks/${item.rootID})${extras ? ` · ${extras}` : ""}`);
    });
    return lines.join("\n").trim();
};

export const renderLinkSuggestionPreview = (data: IAssistantLinkSuggestionResult) => {
    const emptyText = assistantText("没有可执行的建链建议", "No actionable link suggestions");
    return `<div class="assistant-skill-dialog__structured">
    <div class="assistant-skill-dialog__structured-summary">${escapeHTML(data.summary || emptyText)}</div>
    <div class="assistant-skill-dialog__suggestions">${data.suggestions.length > 0 ? data.suggestions.map((item) => {
        const flags = [
            item.applyCurrent ? `<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("当前笔记建链", "Link current note"))}</span>` : "",
            item.applyBacklink ? `<span class="b3-chip b3-chip--small">${escapeHTML(assistantText("目标笔记回链", "Backlink target note"))}</span>` : "",
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

const noteContainsBlockLink = (markdown: string, rootID: string) => {
    const normalizedRootID = `${rootID || ""}`.trim();
    if (!normalizedRootID) {
        return false;
    }
    return `${markdown || ""}`.includes(`sf://blocks/${normalizedRootID}`) || `${markdown || ""}`.includes(normalizedRootID);
};

const buildAssistantLinkBullet = (title: string, rootID: string, detail = "") => {
    const safeTitle = escapeMarkdownLinkText(title || rootID);
    const safeDetail = `${detail || ""}`.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
    return `- [${safeTitle}](sf://blocks/${rootID})${safeDetail ? ` · ${safeDetail}` : ""}`;
};

const buildAssistantLinkSection = (heading: string, lines: string[]) => {
    if (lines.length === 0) {
        return "";
    }
    return `## ${heading}\n\n${lines.join("\n")}`;
};

export const buildAssistantLinkSuggestionsPatch = async (
    definition: IAssistantSkillDefinition,
    context: IAssistantSkillContext,
    parsed: IAssistantLinkSuggestionResult,
): Promise<IAssistantEditPatch | null> => {
    if (!context.note) {
        return null;
    }
    const operations: IAssistantPatchOperation[] = [];
    const currentLines = parsed.suggestions
        .filter((item) => item.applyCurrent && !noteContainsBlockLink(context.note?.markdown || "", item.rootID))
        .map((item) => buildAssistantLinkBullet(item.title, item.rootID, item.currentNoteText || item.reason));
    if (currentLines.length > 0) {
        operations.push({
            id: createAssistantPatchID("op"),
            type: "append-note",
            targetId: context.note.rootID,
            targetLabel: context.note.title || assistantText("当前笔记", "Current note"),
            after: buildAssistantLinkSection(assistantText("AI 建议关联笔记", "AI Suggested Related Notes"), currentLines),
            reason: assistantText("把 AI 建议的相关笔记链接追加到当前笔记。", "Append AI suggested related-note links to the current note."),
            status: "pending",
        });
    }

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
            context.note.title || assistantText("当前笔记", "Current note"),
            context.note.rootID,
            item.backlinkText || item.reason
        );
        operations.push({
            id: createAssistantPatchID("op"),
            type: "append-note",
            targetId: targetNote.rootID,
            targetLabel: targetNote.title || item.title || targetNote.rootID,
            after: buildAssistantLinkSection(assistantText("AI 建议回链", "AI Suggested Backlink"), [backlinkLine]),
            reason: item.reason || assistantText("把当前笔记作为回链追加到目标笔记。", "Append the current note as a backlink to the target note."),
            status: "pending",
        });
    }

    if (operations.length === 0) {
        if (failedBacklinks > 0) {
            showMessage(assistantText("部分目标笔记不可读取，无法生成回链补丁。", "Some target notes could not be read, so backlink patches were not generated."), 5000, "error");
        } else {
            showMessage(assistantText("没有新的建链建议可生成，相关链接可能已经存在。", "There were no new link suggestions to patch. The related links may already exist."), 4000, "error");
        }
        return null;
    }
    const messageParts = [
        assistantText("建链补丁", "Link patch"),
        `${assistantText("操作", "Operations")} ${operations.length}`,
        skippedBacklinks ? `${assistantText("已跳过", "Skipped")} ${skippedBacklinks}` : "",
        failedBacklinks ? `${assistantText("无法读取", "Unreadable")} ${failedBacklinks}` : "",
    ].filter(Boolean);
    return {
        id: createAssistantPatchID("patch"),
        skillId: definition.id,
        source: "skill",
        target: operations.length > 1 ? "notebook" : "note",
        risk: operations.length > 1 ? "L3" : "L2",
        summary: messageParts.join(" · "),
        operations,
        createdAt: Date.now(),
    };
};
