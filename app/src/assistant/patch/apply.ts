import {showMessage} from "../../dialog/message";
import {fetchSyncPost} from "../../util/fetch";
import {highlightById} from "../../util/highlightById";
import {assistantText} from "../constants";
import {ICurrentNoteContext, invalidateAssistantNoteContextCache} from "../common/note";
import type {IAssistantSkillContext} from "../skills/types";
import type {IAssistantEditPatch, IAssistantPatchOperation} from "./types";

const normalizeMarkdown = (value: string) => `${value || ""}`.trim();

const getInsertedBlockIDFromResponse = (response: { data?: Array<{ doOperations?: Array<{ id?: string, blockID?: string }> }> }) => {
    return `${response?.data?.[0]?.doOperations?.[0]?.id || response?.data?.[0]?.doOperations?.[0]?.blockID || ""}`.trim();
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
    if (!note || !targetId || !before.trim() || !after || !blockMarkdown.includes(before)) {
        return {ok: false, blockID: ""};
    }
    const nextMarkdown = blockMarkdown.replace(before, after);
    const ok = await updateBlockMarkdown(targetId, nextMarkdown);
    if (ok) {
        invalidateAssistantNoteContextCache(note.rootID);
    }
    return {ok, blockID: ok ? targetId : ""};
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
