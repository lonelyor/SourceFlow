import {Dialog} from "../../dialog";
import {showMessage} from "../../dialog/message";
import {writeText} from "../../protyle/util/compatibility";
import {App} from "../../index";
import {assistantText, buildAssistantNoteContextForSkill} from "../constants";
import {escapeAttr, escapeHTML, truncateText} from "../common/dom";
import {
    getActiveEditorProtyle,
    getNoteContextFromProtyle,
    ICurrentNoteContext
} from "../common/note";
import {buildMentionSourcesFromNoteContext} from "../common/source";
import {getAssistantAIDefaultProfile, streamAssistantAI} from "../ai/api";
import {reportAssistantRuntimeError} from "../runtime";
import {buildAssistantPatchFromSkillResult, createAssistantPatchID, isAssistantPatchableSkill} from "../patch/build";
import {openAssistantPatchReviewDialog} from "../patch/dialog";
import type {IAssistantEditPatch, IAssistantPatchOperation} from "../patch/types";
import {createAssistantGhostDraft} from "../ghost/draft";
import {
    buildAssistantLinkSuggestionsPatch,
    buildLinkSuggestionMarkdown,
    parseAssistantLinkSuggestionResult,
    renderLinkSuggestionPreview
} from "./linkSuggestions";
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
    const fallback = assistantText("中文", "English");
    return `${window.prompt(assistantText("翻译成哪种语言？", "Translate into which language?"), fallback) || fallback}`.trim() || fallback;
};

const loadFullTextDialogModule = () => import("../translate/fullTextDialog");

const ensureSkillParams = async (definition: IAssistantSkillDefinition): Promise<IAssistantSkillParams | null> => {
    if (definition.id === "selection-translate") {
        const targetLanguage = chooseTargetLanguage();
        if (!targetLanguage) {
            return null;
        }
        return {targetLanguage};
    }
    if (definition.id === "note-translate-mixed" || definition.id === "note-translate-replace") {
        const {openAssistantFullTextTranslateDialog} = await loadFullTextDialogModule();
        const result = await openAssistantFullTextTranslateDialog();
        if (!result) {
            return null;
        }
        const skillId = result.mode === "replace" ? "note-translate-replace" as TAssistantSkillId : "note-translate-mixed" as TAssistantSkillId;
        if (skillId !== definition.id) {
            return {targetLanguage: result.targetLanguage, redirectSkillId: skillId};
        }
        return {targetLanguage: result.targetLanguage};
    }
    return {};
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
    mode?: "ask" | "chat" | "agent",
    newSession?: boolean,
    sources?: ReturnType<typeof buildMentionSourcesFromNoteContext>,
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

const normalizeMarkdown = (result: string) => {
    return `${result || ""}`.trim();
};

const buildMindElixirPatchFromResult = async (
    definition: IAssistantSkillDefinition,
    context: IAssistantSkillContext,
    responseText: string,
): Promise<IAssistantEditPatch | null> => {
    const {buildMindElixirHTMLBlockDOM, parseMindElixirData} = await loadMindmapDataModule();
    const data = parseMindElixirData(responseText);
    if (!data || !context.note) {
        return null;
    }
    const blockID = Lute.NewNodeID();
    const blockDOM = buildMindElixirHTMLBlockDOM(data, {
        id: blockID,
    });
    const targetId = context.note.currentBlockID || context.note.rootID;
    const operation: IAssistantPatchOperation = {
        id: createAssistantPatchID("op"),
        type: "insert-after-block",
        targetId,
        targetLabel: targetId !== context.note.rootID
            ? assistantText("当前块", "Current block")
            : assistantText("当前笔记末尾", "End of current note"),
        after: blockDOM,
        dataType: "dom",
        reason: definition.description,
        status: "pending",
    };
    return {
        id: createAssistantPatchID("patch"),
        skillId: definition.id,
        source: "skill",
        target: "block",
        risk: "L2",
        summary: `${definition.shortLabel}：${data.topic || assistantText("思维导图", "Mind map")}`,
        operations: [operation],
        createdAt: Date.now(),
    };
};

const buildReplaceSelectionPatch = (
    definition: IAssistantSkillDefinition,
    context: IAssistantSkillContext,
    text: string,
): IAssistantEditPatch | null => {
    const note = context.note;
    const before = `${context.selectedText || note?.selectedText || ""}`;
    const after = `${text || ""}`.trim();
    const blockID = `${note?.currentBlockID || ""}`.trim();
    if (!note || !before.trim() || !after || !blockID) {
        return null;
    }
    return {
        id: createAssistantPatchID("patch"),
        skillId: definition.id,
        source: "skill",
        target: "selection",
        risk: "L3",
        summary: `${definition.shortLabel}：${after.slice(0, 80)}`,
        operations: [{
            id: createAssistantPatchID("op"),
            type: "replace-selection",
            targetId: blockID,
            targetLabel: assistantText("当前选区", "Current selection"),
            before,
            after,
            reason: definition.description,
            status: "pending",
        }],
        createdAt: Date.now(),
    };
};

const buildInsertCurrentNotePatch = (
    definition: IAssistantSkillDefinition,
    context: IAssistantSkillContext,
    markdown: string,
): IAssistantEditPatch | null => {
    const after = normalizeMarkdown(markdown);
    if (!after || !context.note) {
        return null;
    }
    const targetId = context.note.currentBlockID || context.note.rootID;
    return {
        id: createAssistantPatchID("patch"),
        skillId: definition.id,
        source: "skill",
        target: targetId === context.note.rootID ? "note" : "block",
        risk: "L2",
        summary: `${definition.shortLabel}：${after.split(/\r?\n/).find((line) => line.trim())?.slice(0, 80) || ""}`,
        operations: [{
            id: createAssistantPatchID("op"),
            type: targetId === context.note.rootID ? "append-note" : "insert-after-block",
            targetId,
            targetLabel: targetId === context.note.rootID
                ? (context.note.title || assistantText("当前笔记", "Current note"))
                : assistantText("当前块", "Current block"),
            after,
            reason: definition.description,
            status: "pending",
        }],
        createdAt: Date.now(),
    };
};

const openSkillPatchReview = (definition: IAssistantSkillDefinition, context: IAssistantSkillContext, patch: IAssistantEditPatch, sessionId = "") => {
    openAssistantPatchReviewDialog({
        patch,
        context,
        title: definition.label,
        sessionId,
    });
    return true;
};

const buildSkillInboxTitle = (definition: IAssistantSkillDefinition, context: IAssistantSkillContext) => {
    return `${definition.shortLabel} · ${context.note?.title || assistantText("未命名笔记", "Untitled note")}`;
};

const buildCaptureTitle = (sourceText: string, fallback: string) => {
    const normalized = `${sourceText || ""}`.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return fallback;
    }
    return truncateText(normalized.split(/[.!?。！？\n]/)[0] || normalized, 40) || fallback;
};

const buildContextReference = (context: IAssistantSkillContext) => {
    if (!context.note) {
        return "";
    }
    const blockID = context.note.currentBlockID || context.note.rootID;
    const title = blockID === context.note.rootID
        ? (context.note.title || assistantText("当前笔记", "Current note"))
        : assistantText(`${context.note.title || assistantText("当前笔记", "Current note")} · 当前块`, `${context.note.title || assistantText("Current note", "Current note")} · Current block`);
    return `((${blockID} '${title.replace(/'/g, " ")}'))`;
};

const buildContextNoteReference = (context: IAssistantSkillContext) => {
    if (!context.note) {
        return "";
    }
    const title = context.note.title || assistantText("当前笔记", "Current note");
    return `((${context.note.rootID} '${title.replace(/'/g, " ")}'))`;
};

const appendResultCitation = (result: string, context: IAssistantSkillContext) => {
    const normalized = normalizeMarkdown(result);
    if (!normalized || !context.note) {
        return normalized;
    }
    if (normalized.includes("## " + assistantText("来源", "Source"))) {
        return normalized;
    }
    const lines = [normalized, "", `## ${assistantText("来源", "Source")}`, "", `- ${assistantText("来源块", "Source block")}：${buildContextReference(context)}`];
    const noteRef = buildContextNoteReference(context);
    if (noteRef && context.note.currentBlockID && context.note.currentBlockID !== context.note.rootID) {
        lines.push(`- ${assistantText("来源笔记", "Source note")}：${noteRef}`);
    }
    return lines.join("\n").trim();
};

const buildCaptureContent = (context: IAssistantSkillContext) => {
    const sections: string[] = [];
    const noteRef = buildContextReference(context);
    if (noteRef) {
        sections.push(`${assistantText("来源笔记", "Source note")}：${noteRef}`);
    }
    if (context.selectedText) {
        sections.push(`${assistantText("选中内容", "Selected content")}：`);
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
        showMessage(assistantText("当前无法打开任务/提醒收集", "Task/reminder capture is not available right now"), 4000, "error");
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
        <div class="assistant-skill-dialog__subtitle">${escapeHTML(context.note ? `${context.note.title} · ${truncateText(context.note.path, 72)}` : definition.description)}</div>
    </div>
    <div class="assistant-skill-dialog__preview assistant-skill-dialog__preview--${previewMode}">${previewHTML}</div>
    <div class="assistant-skill-dialog__actions">
        <button type="button" class="b3-button b3-button--outline" data-action="copy-result">${assistantText("复制结果", "Copy result")}</button>
        ${canReplaceSelection ? `<button type="button" class="b3-button b3-button--outline" data-action="replace-selection">${assistantText("替换选区", "Replace selection")}</button>` : ""}
        ${canInsert ? `<button type="button" class="b3-button b3-button--text" data-action="insert-note">${assistantText("插入当前笔记", "Insert into current note")}</button>` : ""}
        ${parsedLinkSuggestions?.suggestions.length ? `<button type="button" class="b3-button b3-button--text" data-action="apply-links">${assistantText("一键应用建链建议", "Apply link suggestions")}</button>` : ""}
        <button type="button" class="b3-button b3-button--outline" data-action="save-inbox">${assistantText("保存到成果箱", "Save to Results")}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="open-inbox">${assistantText("打开成果箱", "Open Results")}</button>
        ${sessionId ? `<button type="button" class="b3-button b3-button--outline" data-action="open-chat" data-session-id="${escapeAttr(sessionId)}">${assistantText("继续聊天", "Continue in chat")}</button>` : ""}
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
                showMessage(assistantText("结果已复制", "Result copied"));
                event.preventDefault();
                return;
            }
            if (action === "replace-selection") {
                const patch = buildReplaceSelectionPatch(definition, context, displayResult);
                if (patch) {
                    openSkillPatchReview(definition, context, patch, sessionId);
                    dialog.destroy();
                } else {
                    showMessage(assistantText("无法生成替换补丁，请改用插入或复制。", "Failed to create a replacement patch. Use insert or copy instead."), 4000, "error");
                }
                event.preventDefault();
                return;
            }
            if (action === "insert-note") {
                const patch = buildInsertCurrentNotePatch(definition, context, resultWithCitation);
                if (patch) {
                    openSkillPatchReview(definition, context, patch, sessionId);
                    dialog.destroy();
                } else {
                    showMessage(assistantText("无法生成写入补丁", "Failed to create an insertion patch"), 4000, "error");
                }
                event.preventDefault();
                return;
            }
            if (action === "apply-links") {
                if (!parsedLinkSuggestions) {
                    showMessage(assistantText("当前结果没有可执行的建链建议", "This result does not contain actionable link suggestions"), 4000, "error");
                    event.preventDefault();
                    return;
                }
                const patch = await buildAssistantLinkSuggestionsPatch(definition, context, parsedLinkSuggestions);
                if (patch) {
                    openSkillPatchReview(definition, context, patch, sessionId);
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
                    nextStep: assistantText("回到成果箱复核，再决定应用、改写或继续追问。", "Review it in the results sidebar and decide whether to apply, refine, or continue."),
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
        <div class="assistant-skill-dialog__subtitle">${escapeHTML(context.note ? `${context.note.title} · ${truncateText(context.note.path, 72)}` : definition.description)}</div>
    </div>
    <div class="assistant-skill-dialog__loading-hint">${escapeHTML(assistantText("正在生成，完成后会进入审阅或结果预览。", "Generating now. The result will open for review or preview when it finishes..."))}</div>
    <div class="assistant-skill-dialog__preview assistant-skill-dialog__preview--text" data-role="stream-preview">${escapeHTML(assistantText("准备中...", "Preparing..."))}</div>
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
    preview.textContent = text || assistantText("准备中...", "Preparing...");
};

export const runAssistantSkill = async (options: IRunAssistantSkillOptions) => {
    let definition = getAssistantSkillDefinition(options.skillId);
    if (!definition) {
        return false;
    }
    const context = await resolveSkillContext(options);
    if (definition.requiresNote && !context.note) {
        showMessage(assistantText("请先打开一个笔记再使用这个能力", "Open a note before using this skill"), 4000, "error");
        return false;
    }
    if (definition.requiresSelection && !context.hasSelection) {
        showMessage(assistantText("请先选中要处理的内容", "Select some content first"), 4000, "error");
        return false;
    }
    const params = await ensureSkillParams(definition);
    if (!params) {
        return false;
    }
    if (params.redirectSkillId) {
        const redirectDefinition = getAssistantSkillDefinition(params.redirectSkillId);
        if (redirectDefinition) {
            definition = redirectDefinition;
            delete params.redirectSkillId;
        }
    }
    if (definition.action === "capture-task" || definition.action === "capture-event") {
        return openCaptureFromSkill(definition, context, options.app);
    }
    if (definition.action === "chat") {
        const sources = buildMentionSourcesFromNoteContext(context.note);
        return await openAssistantChatDock({
            message: definition.buildMessage(context, params),
            includeCurrentNote: false,
            mode: "ask",
            sources,
        });
    }
    const profile = await ensureDefaultProfile();
    if (!profile) {
        showMessage(assistantText("请先配置至少一个 AI 模型", "Configure at least one AI profile first"), 5000, "error");
        return false;
    }
    const useGhostDraft = isAssistantPatchableSkill(definition);
    const loadingDialog = useGhostDraft ? null : createSkillLoadingDialog(definition, context);
    const ghostDraft = useGhostDraft ? createAssistantGhostDraft(definition, context) : null;
    try {
        let partialReply = "";
        let previewTimer = 0;
        const flushStreamPreview = () => {
            previewTimer = 0;
            if (loadingDialog) {
                updateSkillLoadingDialog(loadingDialog, partialReply);
            }
            ghostDraft?.update(partialReply);
        };
        const requestTitle = truncateText(`${definition.shortLabel} ${context.note?.title || ""}`.trim(), 72) || definition.label;
        const result = await streamAssistantAI({
            profileId: profile.id,
            mode: "chat",
            title: requestTitle,
            message: definition.buildMessage(context, params),
            system: context.note ? buildAssistantNoteContextForSkill(context.note, definition.id) : "",
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
        loadingDialog?.destroy();
        if (ghostDraft?.isCanceled()) {
            showMessage(assistantText("AI 临时草稿已取消", "AI ghost draft canceled"));
            return false;
        }
        if (!reply) {
            ghostDraft?.destroy();
            showMessage(assistantText("AI 没有返回可用结果", "The AI did not return a usable result"), 4000, "error");
            return false;
        }
        const patchResult = buildAssistantPatchFromSkillResult(
            definition,
            context,
            definition.action === "replace-selection" ? reply : appendResultCitation(reply, context)
        );
        if (patchResult) {
            ghostDraft?.markReviewing();
            openAssistantPatchReviewDialog({
                patch: patchResult,
                context,
                title: definition.label,
                sessionId: result.session.id,
                onContinue: () => openAssistantChatDock({
                    sessionId: result.session.id,
                    append: true,
                    message: assistantText(
                        `请基于刚才的「${definition.shortLabel}」结果继续调整，目标是得到更合适的可接受补丁。`,
                        `Continue refining the previous ${definition.shortLabel} result into a better acceptable patch.`
                    ),
                }),
                onClose: () => ghostDraft?.destroy(),
            });
            return true;
        }
        const domPatchResult = definition.action === "insert-mind-elixir"
            ? await buildMindElixirPatchFromResult(definition, context, reply)
            : null;
        if (domPatchResult) {
            openAssistantPatchReviewDialog({
                patch: domPatchResult,
                context,
                title: definition.label,
                sessionId: result.session.id,
                onContinue: () => openAssistantChatDock({
                    sessionId: result.session.id,
                    append: true,
                    message: assistantText(
                        `请基于刚才的「${definition.shortLabel}」结果继续调整，目标是得到更合适的可接受补丁。`,
                        `Continue refining the previous ${definition.shortLabel} result into a better acceptable patch.`
                    ),
                }),
            });
            return true;
        }
        ghostDraft?.destroy();
        if (definition.resultMode === "auto-apply") {
            showMessage(assistantText("已打开结果预览，请审阅后再应用。", "Opened the result preview. Review it before applying."), 4000);
        }
        openSkillResultDialog(definition, context, reply, result.session.id);
        return true;
    } catch (error) {
        ghostDraft?.destroy();
        loadingDialog?.destroy();
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        return false;
    }
};
