import {showMessage} from "../../dialog/message";
import {fetchSyncPost} from "../../util/fetch";
import {highlightById} from "../../util/highlightById";
import {assistantText} from "../constants";
import {ICurrentNoteContext, invalidateAssistantNoteContextCache} from "../common/note";
import type {IAssistantSkillContext} from "../skills/types";
import type {IAssistantEditPatch, IAssistantPatchOperation} from "./types";
import {checkPermission} from "../security/api";
import {requestSecurityEscalation, securityEscalationRejectedMessage} from "../security/escalation";
import type {TSecurityCapability, TSecurityMode, TSecurityRisk} from "../security/types";

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

interface IPatchTargetInfo {
    box?: string;
    path?: string;
    rootID?: string;
}

interface IAssistantPatchApplyOptions {
    securityMode?: TSecurityMode;
    onSecurityModeChange?: (mode: TSecurityMode) => Promise<void> | void;
}

const patchRiskOrder: Record<TSecurityRisk, number> = {
    L1: 1,
    L2: 2,
    L3: 3,
    L4: 4,
    L5: 5,
    L6: 6,
};

const normalizePatchRisk = (risk: string | undefined): TSecurityRisk => {
    switch (`${risk || ""}`.trim()) {
        case "L1":
            return "L1";
        case "L2":
            return "L2";
        case "L4":
            return "L4";
        case "L5":
            return "L5";
        case "L6":
            return "L6";
        default:
            return "L3";
    }
};

const patchOperationSecurityRisk = (patch: IAssistantEditPatch, operation: IAssistantPatchOperation): TSecurityRisk => {
    const operationRisk = operation.type === "replace-block" || operation.type === "delete-block" || operation.type === "replace-selection" || operation.type === "rename-note"
        ? "L3"
        : "L2";
    const patchRisk = normalizePatchRisk(patch.risk);
    return patchRiskOrder[patchRisk] > patchRiskOrder[operationRisk] ? patchRisk : operationRisk;
};

const patchOperationCapability = (operation: IAssistantPatchOperation): TSecurityCapability => {
    switch (operation.type) {
        case "create-note":
        case "create-child-note":
            return "create";
        case "delete-block":
            return "deleteBlock";
        default:
            return "write";
    }
};

const ensurePatchOperationSecurity = async (
    patch: IAssistantEditPatch,
    operation: IAssistantPatchOperation,
    context: IAssistantSkillContext,
    options: IAssistantPatchApplyOptions = {},
) => {
    const note = context.note;
    if (!note?.rootID) {
        return false;
    }
    const risk = patchOperationSecurityRisk(patch, operation);
    const target = note.title || operation.targetLabel || note.rootID;
    const result = await checkPermission({
        mode: options.securityMode,
        risk,
        targetType: "note",
        targetIds: [note.rootID],
        sessionBatchCount: patch.operations.filter((item) => (item.status || "pending") === "pending").length || 1,
        capability: patchOperationCapability(operation),
    });
    if (result.decision === "allow") {
        return true;
    }
    if (result.decision === "deny" && !result.escalatable) {
        showMessage(result.reason || assistantText("当前安全配置禁止该 AI 操作", "The current security config blocks this AI operation"), 5000, "error");
        return false;
    }
    const action = await requestSecurityEscalation({
        currentMode: options.securityMode || "default",
        risk,
        target,
        reason: result.reason,
        allowUpgrade: !!options.onSecurityModeChange,
    });
    if (action === "reject") {
        showMessage(securityEscalationRejectedMessage(), 4000, "error");
        return false;
    }
    if (action === "upgrade-auto") {
        await options.onSecurityModeChange?.("autoReview");
    }
    return true;
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
        sanitizeIDs: true,
    });
    return response.code === 0;
};

const getPatchTargetInfo = async (blockID: string): Promise<IPatchTargetInfo | null> => {
    const targetId = `${blockID || ""}`.trim();
    if (!targetId) {
        return null;
    }
    const response = await fetchSyncPost("/api/block/getBlockInfo", {id: targetId});
    if (response.code !== 0) {
        return null;
    }
    return {
        box: `${response.data?.box || ""}`.trim(),
        path: `${response.data?.path || ""}`.trim(),
        rootID: `${response.data?.rootID || ""}`.trim(),
    };
};

const getLiveBlockMarkdown = async (blockID: string) => {
    const targetId = `${blockID || ""}`.trim();
    if (!targetId) {
        return null;
    }
    const response = await fetchSyncPost("/api/block/getBlockKramdown", {id: targetId});
    if (response.code !== 0) {
        return null;
    }
    return `${response.data?.kramdown ?? response.data ?? ""}`;
};

const ensureTargetInCurrentNote = async (note: ICurrentNoteContext, blockID: string) => {
    const targetId = `${blockID || ""}`.trim();
    if (!targetId) {
        return {ok: false, isRoot: false};
    }
    if (targetId === note.rootID) {
        return {ok: true, isRoot: true};
    }
    const info = await getPatchTargetInfo(targetId);
    const sameNote = !!info?.rootID && info.rootID === note.rootID;
    const sameNotebook = !note.notebook || !info?.box || info.box === note.notebook;
    if (!sameNote || !sameNotebook) {
        showMessage(assistantText("补丁目标不属于当前笔记，已停止应用。", "The patch target is outside the current note, so it was not applied."), 5000, "error");
        return {ok: false, isRoot: false};
    }
    return {ok: true, isRoot: false};
};

const insertAfterBlock = async (note: ICurrentNoteContext, operation: IAssistantPatchOperation) => {
    const markdown = normalizeMarkdown(operation.after || "");
    const targetId = `${operation.targetId || note.currentBlockID || note.rootID}`.trim();
    if (!targetId || !markdown) {
        return {ok: false, blockID: ""};
    }
    const scope = await ensureTargetInCurrentNote(note, targetId);
    if (!scope.ok) {
        return {ok: false, blockID: ""};
    }
    const response = targetId && targetId !== note.rootID
        ? await fetchSyncPost("/api/block/insertBlock", {
            previousID: targetId,
            data: markdown,
            dataType: "markdown",
            sanitizeIDs: true,
        })
        : await fetchSyncPost("/api/block/appendBlock", {
            parentID: note.rootID,
            data: markdown,
            dataType: "markdown",
            sanitizeIDs: true,
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
        sanitizeIDs: true,
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
    if (!note || !targetId || !before.trim() || !after) {
        return {ok: false, blockID: ""};
    }
    const scope = await ensureTargetInCurrentNote(note, targetId);
    if (!scope.ok || scope.isRoot) {
        return {ok: false, blockID: ""};
    }
    const liveMarkdown = await getLiveBlockMarkdown(targetId);
    if (null === liveMarkdown) {
        showMessage(assistantText("无法确认当前块内容，已停止自动替换。", "The current block content could not be verified, so automatic replacement was stopped."), 5000, "error");
        return {ok: false, blockID: ""};
    }
    const occurrences = countTextOccurrences(liveMarkdown, before);
    if (occurrences !== 1) {
        showMessage(occurrences > 1
            ? assistantText("选区原文在当前块中出现多次，已停止自动替换以避免误改。", "The selected source appears multiple times in the block, so automatic replacement was stopped.")
            : assistantText("当前块已变化，找不到选区原文。", "The current block changed and the selected source text could not be found."),
        5000, "error");
        return {ok: false, blockID: ""};
    }
    const nextMarkdown = liveMarkdown.replace(before, after);
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
    const parentID = `${operation.targetId || note.rootID}`.trim();
    if (child && parentID !== note.rootID) {
        showMessage(assistantText("创建子文档补丁只能挂到当前笔记下。", "A create-child-note patch can only target the current note."), 5000, "error");
        return {ok: false, blockID: ""};
    }
    const response = await fetchSyncPost("/api/filetree/createDocWithMd", {
        notebook: note.notebook,
        path: child ? `/${title}` : `/AI/${title}`,
        parentID: child ? parentID : "",
        markdown,
        sanitizeIDs: true,
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
    const scope = await ensureTargetInCurrentNote(note, targetId);
    if (!scope.ok) {
        return {ok: false, blockID: ""};
    }
    if (scope.isRoot) {
        showMessage(assistantText("不能通过删除块补丁删除整篇笔记。", "A delete-block patch cannot delete an entire note."), 5000, "error");
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
    if (!targetId || !title || targetId !== note.rootID) {
        showMessage(assistantText("重命名补丁只能作用于当前笔记。", "A rename-note patch can only target the current note."), 5000, "error");
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
    const scope = await ensureTargetInCurrentNote(note, targetId);
    if (!scope.ok) {
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
    const before = `${operation.before || ""}`.trim();
    if (!note || !targetId || !before || !after) {
        showMessage(assistantText("替换块补丁缺少可校验的原文，已停止应用。", "The replace-block patch is missing verifiable source text, so it was not applied."), 5000, "error");
        return {ok: false, blockID: ""};
    }
    const scope = await ensureTargetInCurrentNote(note, targetId);
    if (!scope.ok) {
        return {ok: false, blockID: ""};
    }
    if (scope.isRoot) {
        showMessage(assistantText("不能通过替换块补丁整体替换整篇笔记。", "A replace-block patch cannot replace an entire note."), 5000, "error");
        return {ok: false, blockID: ""};
    }
    const liveMarkdown = await getLiveBlockMarkdown(targetId);
    if (null === liveMarkdown || normalizeMarkdown(liveMarkdown) !== before) {
        showMessage(assistantText("目标块已变化，已停止替换以避免覆盖用户修改。", "The target block changed, so replacement was stopped to avoid overwriting user edits."), 5000, "error");
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
    options: IAssistantPatchApplyOptions = {},
) => {
    if (!context.note) {
        showMessage(assistantText("当前没有可用的笔记上下文", "The current note context is unavailable"), 4000, "error");
        return false;
    }
    if (!await ensurePatchOperationSecurity(patch, operation, context, options)) {
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

export const applyAssistantPatch = async (patch: IAssistantEditPatch, context: IAssistantSkillContext, options: IAssistantPatchApplyOptions = {}) => {
    for (const operation of patch.operations) {
        if ((operation.status || "pending") !== "pending") {
            continue;
        }
        const ok = await applyAssistantPatchOperation(patch, operation, context, options);
        if (!ok) {
            return false;
        }
    }
    return true;
};
