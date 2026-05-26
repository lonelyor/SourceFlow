import {showMessage} from "../../dialog/message";
import {fetchSyncPost} from "../../util/fetch";
import {highlightById} from "../../util/highlightById";
import {assistantText} from "../constants";
import {ICurrentNoteContext, invalidateAssistantNoteContextCache} from "../common/note";
import type {IAssistantSkillContext} from "../skills/types";
import type {IAssistantEditPatch, IAssistantPatchOperation} from "./types";

const normalizeMarkdown = (value: string) => `${value || ""}`.trim();

const sanitizeDocName = (value: string) => `${value || ""}`.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim() || "Assistant";

const countTextOccurrences = (text: string, needle: string) => {
    if (!needle) {
        return 0;
    }
    let count = 0;
    let index = text.indexOf(needle);
    while (index > -1) {
        count += 1;
        index = text.indexOf(needle, index + needle.length);
    }
    return count;
};

const getInsertedBlockIDFromResponse = (response: { data?: Array<{ doOperations?: Array<{ id?: string, blockID?: string }> }> }) => {
    return `${response?.data?.[0]?.doOperations?.[0]?.id || response?.data?.[0]?.doOperations?.[0]?.blockID || ""}`.trim();
};

const getCreatedDocIDFromResponse = (response: { data?: string | { id?: string } }) => {
    return `${typeof response?.data === "string" ? response.data : response?.data?.id || ""}`.trim();
};

const highlightPatchTarget = (context: IAssistantSkillContext, blockID?: string) => {
    if (!context.protyle || !blockID) {
        return;
    }
    window.setTimeout(() => {
        highlightById(context.protyle as IProtyle, blockID);
    }, 64);
};

const updateBlockMarkdown = async (blockID: string, markdown: string) => {
    const response = await fetchSyncPost("/api/block/updateBlock", {
        id: blockID,
        data: normalizeMarkdown(markdown),
        dataType: "markdown",
    });
    return response.code === 0;
};

const insertAfterBlock = async (note: ICurrentNoteContext, operation: IAssistantPatchOperation) => {
    const markdown = normalizeMarkdown(operation.after || "");
    const targetId = `${operation.targetId || note.currentBlockID || note.rootID}`.trim();
    if (!targetId || !markdown) {
        return {ok: false, blockID: ""};
    }
    const response = targetId && targetId !== note.rootID
        ? await fetchSyncPost("/api/block/insertBlock", {
            previousID: targetId,
            data: markdown,
            dataType: "markdown",
        })
        : await fetchSyncPost("/api/block/appendBlock", {
            parentID: note.rootID,
            data: markdown,
            dataType: "markdown",
        });
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(note.rootID);
    }
    return {
        ok: response.code === 0,
        blockID: response.code === 0 ? getInsertedBlockIDFromResponse(response) : "",
    };
};

const appendNote = async (note: ICurrentNoteContext, operation: IAssistantPatchOperation) => {
    const markdown = normalizeMarkdown(operation.after || "");
    if (!markdown) {
        return {ok: false, blockID: ""};
    }
    const response = await fetchSyncPost("/api/block/appendBlock", {
        parentID: note.rootID,
        data: markdown,
        dataType: "markdown",
    });
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(note.rootID);
    }
    return {
        ok: response.code === 0,
        blockID: response.code === 0 ? getInsertedBlockIDFromResponse(response) : "",
    };
};

const replaceSelection = async (context: IAssistantSkillContext, operation: IAssistantPatchOperation) => {
    const note = context.note;
    const targetId = `${operation.targetId || note?.currentBlockID || ""}`.trim();
    const before = `${operation.before || ""}`;
    const after = normalizeMarkdown(operation.after || "");
    const blockMarkdown = `${note?.currentBlockMarkdown || ""}`;
    if (!note || !targetId || !before.trim() || !after) {
        return {ok: false, blockID: ""};
    }
    const occurrences = countTextOccurrences(blockMarkdown, before);
    if (occurrences !== 1) {
        showMessage(occurrences > 1
            ? assistantText("选区原文在当前块中出现多次，已停止自动替换以避免误改。", "The selected source appears multiple times in the block, so automatic replacement was stopped.")
            : assistantText("当前块已变化，找不到选区原文。", "The current block changed and the selected source text could not be found."),
        5000, "error");
        return {ok: false, blockID: ""};
    }
    const nextMarkdown = blockMarkdown.replace(before, after);
    const ok = await updateBlockMarkdown(targetId, nextMarkdown);
    if (ok) {
        invalidateAssistantNoteContextCache(note.rootID);
    }
    return {ok, blockID: ok ? targetId : ""};
};

const createNote = async (note: ICurrentNoteContext, operation: IAssistantPatchOperation, child: boolean) => {
    const markdown = normalizeMarkdown(operation.after || "");
    const title = sanitizeDocName(operation.targetLabel || operation.reason || "AI Note");
    if (!note.notebook || !markdown) {
        return {ok: false, blockID: ""};
    }
    const response = await fetchSyncPost("/api/filetree/createDocWithMd", {
        notebook: note.notebook,
        path: child ? `/${title}` : `/AI/${title}`,
        parentID: child ? `${operation.targetId || note.rootID}`.trim() : "",
        markdown,
    });
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(note.rootID);
    }
    return {
        ok: response.code === 0,
        blockID: response.code === 0 ? getCreatedDocIDFromResponse(response) : "",
    };
};

const deleteBlock = async (note: ICurrentNoteContext, operation: IAssistantPatchOperation) => {
    const targetId = `${operation.targetId || note.currentBlockID || ""}`.trim();
    if (!targetId) {
        return {ok: false, blockID: ""};
    }
    const response = await fetchSyncPost("/api/block/deleteBlock", {id: targetId});
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(note.rootID);
    }
    return {ok: response.code === 0, blockID: response.code === 0 ? targetId : ""};
};

const renameNote = async (note: ICurrentNoteContext, operation: IAssistantPatchOperation) => {
    const targetId = `${operation.targetId || note.rootID}`.trim();
    const title = sanitizeDocName(operation.after || operation.targetLabel || "");
    if (!targetId || !title) {
        return {ok: false, blockID: ""};
    }
    const response = await fetchSyncPost("/api/filetree/renameDocByID", {id: targetId, title});
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(note.rootID);
    }
    return {ok: response.code === 0, blockID: response.code === 0 ? targetId : ""};
};

const setAttrs = async (note: ICurrentNoteContext, operation: IAssistantPatchOperation) => {
    const targetId = `${operation.targetId || note.currentBlockID || note.rootID}`.trim();
    const attrs = operation.attrs || (() => {
        try {
            const parsed = JSON.parse(operation.after || "{}");
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string | null> : {};
        } catch (_error) {
            return {};
        }
    })();
    if (!targetId || !Object.keys(attrs).length) {
        return {ok: false, blockID: ""};
    }
    const response = await fetchSyncPost("/api/attr/setBlockAttrs", {id: targetId, attrs});
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(note.rootID);
    }
    return {ok: response.code === 0, blockID: response.code === 0 ? targetId : ""};
};

const replaceBlock = async (context: IAssistantSkillContext, operation: IAssistantPatchOperation) => {
    const note = context.note;
    const targetId = `${operation.targetId || note?.currentBlockID || ""}`.trim();
    const after = normalizeMarkdown(operation.after || "");
    if (!note || !targetId || !after) {
        return {ok: false, blockID: ""};
    }
    const ok = await updateBlockMarkdown(targetId, after);
    if (ok) {
        invalidateAssistantNoteContextCache(note.rootID);
    }
    return {ok, blockID: ok ? targetId : ""};
};

export const applyAssistantPatchOperation = async (
    patch: IAssistantEditPatch,
    operation: IAssistantPatchOperation,
    context: IAssistantSkillContext,
) => {
    if (!context.note) {
        showMessage(assistantText("当前没有可用的笔记上下文", "The current note context is unavailable"), 4000, "error");
        return false;
    }
    let result = {ok: false, blockID: ""};
    if (operation.type === "insert-after-block") {
        result = await insertAfterBlock(context.note, operation);
    } else if (operation.type === "append-note") {
        result = await appendNote(context.note, operation);
    } else if (operation.type === "replace-selection") {
        result = await replaceSelection(context, operation);
    } else if (operation.type === "replace-block") {
        result = await replaceBlock(context, operation);
    } else if (operation.type === "create-note") {
        result = await createNote(context.note, operation, false);
    } else if (operation.type === "create-child-note") {
        result = await createNote(context.note, operation, true);
    } else if (operation.type === "delete-block") {
        result = await deleteBlock(context.note, operation);
    } else if (operation.type === "rename-note") {
        result = await renameNote(context.note, operation);
    } else if (operation.type === "set-attrs") {
        result = await setAttrs(context.note, operation);
    } else {
        showMessage(assistantText("当前补丁操作暂不支持直接应用", "This patch operation cannot be applied yet"), 4000, "error");
        return false;
    }
    if (!result.ok) {
        showMessage(assistantText("应用修改失败，请改用复制结果。", "Failed to apply the edit. Copy the result instead."), 4000, "error");
        return false;
    }
    operation.status = "accepted";
    operation.appliedTargetId = result.blockID || operation.targetId;
    highlightPatchTarget(context, result.blockID || operation.targetId);
    showMessage(patch.operations.length > 1
        ? assistantText("已应用该项修改", "Applied this edit")
        : assistantText("已应用 AI 修改", "Applied the AI edit"));
    return true;
};

export const applyAssistantPatch = async (patch: IAssistantEditPatch, context: IAssistantSkillContext) => {
    for (const operation of patch.operations) {
        if ((operation.status || "pending") !== "pending") {
            continue;
        }
        const ok = await applyAssistantPatchOperation(patch, operation, context);
        if (!ok) {
            return false;
        }
    }
    return true;
};
