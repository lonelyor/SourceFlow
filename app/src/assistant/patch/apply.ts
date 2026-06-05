import {showMessage} from "../../dialog/message";
import {fetchSyncPost} from "../../util/fetch";
import {highlightById} from "../../util/highlightById";
import {assistantText} from "../constants";
import {invalidateAssistantNoteContextCache} from "../common/note";
import type {IAssistantSkillContext} from "../skills/types";
import type {IAssistantEditPatch, IAssistantPatchOperation} from "./types";
import {requestSecurityEscalation, securityEscalationRejectedMessage} from "../security/escalation";
import type {ISecurityPermissionResult, TSecurityMode} from "../security/types";

interface IAssistantPatchApplyOptions {
    securityMode?: TSecurityMode;
    onSecurityModeChange?: (mode: TSecurityMode) => Promise<void> | void;
    audit?: {
        sessionId?: string;
        profileId?: string;
        targetLabel?: string;
    };
}

interface IAssistantPatchApplyResult {
    appliedTargetId?: string;
    historyId?: string;
    requiresConfirm?: boolean;
    security?: ISecurityPermissionResult;
    summary?: string;
    historyError?: string;
}

interface IAssistantPatchEscalationResult {
    token?: string;
    expiresAt?: number;
    security?: ISecurityPermissionResult;
}

const highlightPatchTarget = (context: IAssistantSkillContext, blockID?: string) => {
    if (!context.protyle || !blockID) {
        return;
    }
    window.setTimeout(() => {
        highlightById(context.protyle as IProtyle, blockID);
    }, 64);
};

const buildBackendPatchContext = (context: IAssistantSkillContext) => {
    const note = context.note;
    if (!note) {
        return null;
    }
    return {
        rootID: note.rootID,
        notebook: note.notebook,
        path: note.path,
        title: note.title,
        currentBlockID: note.currentBlockID,
        currentBlockType: note.currentBlockType,
        currentBlockMarkdown: note.currentBlockMarkdown,
        selectedText: note.selectedText,
    };
};

const requestBackendPatchApply = async (
    patch: IAssistantEditPatch,
    operation: IAssistantPatchOperation,
    context: IAssistantSkillContext,
    securityMode: TSecurityMode | undefined,
    escalationToken: string,
    audit: IAssistantPatchApplyOptions["audit"],
): Promise<IAssistantPatchApplyResult | null> => {
    const noteContext = buildBackendPatchContext(context);
    if (!noteContext) {
        showMessage(assistantText("当前没有可用的笔记上下文", "The current note context is unavailable"), 4000, "error");
        return null;
    }
    const response = await fetchSyncPost("/api/assistant/patch/apply", {
        patch,
        operation,
        context: noteContext,
        securityMode,
        escalationToken,
        audit,
    });
    if (response.code !== 0) {
        showMessage(response.msg || assistantText("应用修改失败，请改用复制结果。", "Failed to apply the edit. Copy the result instead."), 5000, "error");
        return null;
    }
    return response.data || null;
};

const requestBackendPatchEscalationToken = async (
    patch: IAssistantEditPatch,
    operation: IAssistantPatchOperation,
    context: IAssistantSkillContext,
    securityMode: TSecurityMode | undefined,
): Promise<string> => {
    const noteContext = buildBackendPatchContext(context);
    if (!noteContext) {
        showMessage(assistantText("当前没有可用的笔记上下文", "The current note context is unavailable"), 4000, "error");
        return "";
    }
    const response = await fetchSyncPost("/api/assistant/patch/issueEscalation", {
        patch,
        operation,
        context: noteContext,
        securityMode,
    });
    const data = response.data as IAssistantPatchEscalationResult | undefined;
    if (response.code !== 0 || !data?.token) {
        showMessage(response.msg || data?.security?.reason || assistantText("本次允许凭证申请失败，请重新确认。", "Failed to issue one-time permission. Please confirm again."), 5000, "error");
        return "";
    }
    return data.token;
};

const applyBackendPatchOperation = async (
    patch: IAssistantEditPatch,
    operation: IAssistantPatchOperation,
    context: IAssistantSkillContext,
    options: IAssistantPatchApplyOptions,
    securityMode: TSecurityMode | undefined,
    escalationToken: string,
): Promise<IAssistantPatchApplyResult | null> => {
    const result = await requestBackendPatchApply(patch, operation, context, securityMode, escalationToken, options.audit);
    if (!result) {
        return null;
    }
    if (!result.requiresConfirm) {
        return result;
    }

    const security = result.security;
    if (!security?.escalatable) {
        showMessage(security?.reason || assistantText("当前安全配置禁止该 AI 操作", "The current security config blocks this AI operation"), 5000, "error");
        return null;
    }
    const action = await requestSecurityEscalation({
        currentMode: securityMode || "default",
        risk: patch.risk || "L3",
        target: operation.targetLabel || context.note?.title || context.note?.rootID || "",
        reason: security.reason,
        allowUpgrade: !!options.onSecurityModeChange,
    });
    if (action === "reject") {
        showMessage(securityEscalationRejectedMessage(), 4000, "error");
        return null;
    }
    if (action === "upgrade-auto") {
        await options.onSecurityModeChange?.("autoReview");
        return applyBackendPatchOperation(patch, operation, context, options, "autoReview", "");
    }
    const token = await requestBackendPatchEscalationToken(patch, operation, context, securityMode);
    if (!token) {
        return null;
    }
    return applyBackendPatchOperation(patch, operation, context, options, securityMode, token);
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
    const result = await applyBackendPatchOperation(patch, operation, context, options, options.securityMode, "");
    if (!result || result.requiresConfirm) {
        return false;
    }
    operation.status = "accepted";
    operation.appliedTargetId = result.appliedTargetId || operation.targetId;
    operation.historyId = result.historyId || operation.historyId;
    if (result.historyError) {
        showMessage(assistantText("AI 写入已完成，但历史记录失败，无法保证撤回。", "The AI write was applied, but history recording failed, so revert may be unavailable"), 7000, "error");
    }
    invalidateAssistantNoteContextCache(context.note.rootID);
    highlightPatchTarget(context, operation.appliedTargetId || operation.targetId);
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
