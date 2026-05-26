import {assistantText} from "../constants";
import {escapeHTML, truncateText} from "../common/dom";
import type {IAssistantEditPatch, IAssistantPatchOperation, TAssistantPatchOperationStatus} from "./types";

export interface IAssistantPatchRenderOptions {
    readonly?: boolean;
    acceptAction?: string;
    rejectAction?: string;
    extraActionAttrs?: string;
}

const normalizePatchRenderOptions = (options: boolean | IAssistantPatchRenderOptions = false): IAssistantPatchRenderOptions => {
    return typeof options === "boolean" ? {readonly: options} : options;
};

export const getAssistantPatchRiskLabel = (risk: string) => {
    switch (risk) {
        case "L1":
            return assistantText("L1 只读", "L1 Read only");
        case "L2":
            return assistantText("L2 低风险写入", "L2 Low-risk write");
        case "L3":
            return assistantText("L3 中风险写入", "L3 Medium-risk write");
        case "L4":
            return assistantText("L4 高风险操作", "L4 High-risk action");
        default:
            return risk;
    }
};

export const getAssistantPatchOperationLabel = (type: string) => {
    switch (type) {
        case "insert-after-block":
            return assistantText("块后插入", "Insert after block");
        case "replace-selection":
            return assistantText("替换选区", "Replace selection");
        case "replace-block":
            return assistantText("替换块", "Replace block");
        case "append-note":
            return assistantText("追加笔记", "Append note");
        case "create-note":
            return assistantText("新建笔记", "Create note");
        case "create-child-note":
            return assistantText("创建子文档", "Create child note");
        case "move-note":
            return assistantText("移动笔记", "Move note");
        case "rename-note":
            return assistantText("重命名笔记", "Rename note");
        case "set-attrs":
            return assistantText("设置属性", "Set attributes");
        case "delete-block":
            return assistantText("删除块", "Delete block");
        default:
            return type;
    }
};

export const getAssistantPatchStatusLabel = (status: TAssistantPatchOperationStatus | undefined) => {
    switch (status) {
        case "accepted":
            return assistantText("已接受", "Accepted");
        case "rejected":
            return assistantText("已拒绝", "Rejected");
        default:
            return assistantText("待审阅", "Pending");
    }
};

export const formatAssistantPatchMarkdown = (patch: IAssistantEditPatch) => {
    const lines = [
        `# ${patch.summary || assistantText("AI 修改建议", "AI edit proposal")}`,
        "",
        `- ${assistantText("来源", "Source")}: ${patch.source}`,
        `- ${assistantText("风险", "Risk")}: ${getAssistantPatchRiskLabel(patch.risk)}`,
        `- ${assistantText("操作数", "Operations")}: ${patch.operations.length}`,
        "",
    ];
    patch.operations.forEach((operation, index) => {
        lines.push(`## ${index + 1}. ${getAssistantPatchOperationLabel(operation.type)}`);
        if (operation.targetId) {
            lines.push(`- ${assistantText("目标", "Target")}: ${operation.targetLabel || operation.targetId} (${operation.targetId})`);
        }
        if (operation.reason) {
            lines.push(`- ${assistantText("原因", "Reason")}: ${operation.reason}`);
        }
        if (operation.before) {
            lines.push("", assistantText("修改前：", "Before:"), "```markdown", operation.before, "```");
        }
        if (operation.after) {
            lines.push("", assistantText("修改后：", "After:"), "```markdown", operation.after, "```");
        }
        lines.push("");
    });
    return lines.join("\n").trim();
};

export const renderAssistantPatchOperationHTML = (
    operation: IAssistantPatchOperation,
    index: number,
    options: boolean | IAssistantPatchRenderOptions = false,
) => {
    const renderOptions = normalizePatchRenderOptions(options);
    const status = operation.status || "pending";
    const canAct = !renderOptions.readonly && status === "pending";
    const acceptAction = renderOptions.acceptAction || "accept-op";
    const rejectAction = renderOptions.rejectAction || "reject-op";
    const extraActionAttrs = renderOptions.extraActionAttrs ? ` ${renderOptions.extraActionAttrs}` : "";
    return `<div class="assistant-patch__operation assistant-patch__operation--${status}" data-op-id="${operation.id}">
    <div class="assistant-patch__op-head">
        <div class="assistant-patch__op-title">
            <span>${escapeHTML(`${index + 1}. ${getAssistantPatchOperationLabel(operation.type)}`)}</span>
            <span class="b3-chip b3-chip--small">${escapeHTML(getAssistantPatchStatusLabel(status))}</span>
        </div>
        ${canAct ? `<div class="assistant-patch__op-actions">
            <button type="button" class="b3-button b3-button--outline" data-action="${acceptAction}" data-op-id="${operation.id}"${extraActionAttrs}>${escapeHTML(assistantText("接受", "Accept"))}</button>
            <button type="button" class="b3-button b3-button--outline b3-button--error" data-action="${rejectAction}" data-op-id="${operation.id}"${extraActionAttrs}>${escapeHTML(assistantText("拒绝", "Reject"))}</button>
        </div>` : ""}
    </div>
    ${operation.targetId ? `<div class="assistant-patch__meta">${escapeHTML(`${operation.targetLabel || assistantText("目标", "Target")}: ${truncateText(operation.targetId, 48)}`)}</div>` : ""}
    ${operation.reason ? `<div class="assistant-patch__reason">${escapeHTML(operation.reason)}</div>` : ""}
    ${operation.before ? `<div class="assistant-patch__diff">
        <div class="assistant-patch__diff-title">${escapeHTML(assistantText("修改前", "Before"))}</div>
        <pre>${escapeHTML(operation.before)}</pre>
    </div>` : ""}
    ${operation.after ? `<div class="assistant-patch__diff assistant-patch__diff--after">
        <div class="assistant-patch__diff-title">${escapeHTML(assistantText("修改后", "After"))}</div>
        <pre>${escapeHTML(operation.after)}</pre>
    </div>` : ""}
</div>`;
};

export const renderAssistantPatchHTML = (patch: IAssistantEditPatch, options: boolean | IAssistantPatchRenderOptions = false) => {
    const renderOptions = normalizePatchRenderOptions(options);
    return `<div class="assistant-patch">
    <div class="assistant-patch__summary">${escapeHTML(patch.summary || assistantText("AI 修改建议", "AI edit proposal"))}</div>
    <div class="assistant-patch__chips">
        <span class="b3-chip b3-chip--small">${escapeHTML(getAssistantPatchRiskLabel(patch.risk))}</span>
        <span class="b3-chip b3-chip--small">${escapeHTML(`${assistantText("操作", "Ops")} ${patch.operations.length}`)}</span>
    </div>
    <div class="assistant-patch__operations">${patch.operations.map((operation, index) => renderAssistantPatchOperationHTML(operation, index, renderOptions)).join("")}</div>
</div>`;
};
