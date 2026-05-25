import {Dialog} from "../../dialog";
import {showMessage} from "../../dialog/message";
import {writeText} from "../../protyle/util/compatibility";
import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, truncateText} from "../common/dom";
import type {IAssistantSkillContext} from "../skills/types";
import {recordAssistantPatchHistory} from "../history/operations";
import {applyAssistantPatch, applyAssistantPatchOperation} from "./apply";
import {formatAssistantPatchMarkdown, renderAssistantPatchHTML} from "./format";
import type {IAssistantEditPatch} from "./types";

interface IAssistantPatchReviewOptions {
    patch: IAssistantEditPatch;
    context: IAssistantSkillContext;
    title: string;
    subtitle?: string;
    sessionId?: string;
    onContinue?: () => Promise<boolean> | boolean;
}

const hasPendingOperations = (patch: IAssistantEditPatch) => {
    return patch.operations.some((operation) => (operation.status || "pending") === "pending");
};

export const openAssistantPatchReviewDialog = (options: IAssistantPatchReviewOptions) => {
    const {patch, context} = options;
    const subtitle = options.subtitle || (context.note
        ? `${context.note.title || ""} · ${truncateText(context.note.path || "", 72)}`
        : patch.summary);
    const renderContent = () => `<div class="assistant-skill-dialog assistant-skill-dialog--patch fn__flex-column">
    <div class="assistant-skill-dialog__meta">
        <div class="assistant-skill-dialog__title">${escapeHTML(options.title)}</div>
        <div class="assistant-skill-dialog__subtitle">${escapeHTML(subtitle)}</div>
    </div>
    <div class="assistant-skill-dialog__preview assistant-skill-dialog__preview--structured">${renderAssistantPatchHTML(patch)}</div>
    <div class="assistant-skill-dialog__actions">
        <button type="button" class="b3-button b3-button--outline" data-action="copy-patch">${escapeHTML(assistantText("复制补丁", "Copy patch"))}</button>
        <button type="button" class="b3-button b3-button--text" data-action="accept-all"${hasPendingOperations(patch) ? "" : " disabled"}>${escapeHTML(assistantText("接受全部", "Accept all"))}</button>
        <button type="button" class="b3-button b3-button--outline b3-button--error" data-action="reject-all"${hasPendingOperations(patch) ? "" : " disabled"}>${escapeHTML(assistantText("拒绝剩余", "Reject remaining"))}</button>
        ${options.onContinue ? `<button type="button" class="b3-button b3-button--outline" data-action="continue-adjust"${options.sessionId ? ` data-session-id="${escapeAttr(options.sessionId)}"` : ""}>${escapeHTML(assistantText("继续调整", "Refine"))}</button>` : ""}
        <button type="button" class="b3-button b3-button--cancel" data-action="close">${escapeHTML(window.sourceflow.languages.close)}</button>
    </div>
</div>`;
    const dialog = new Dialog({
        title: options.title,
        width: "760px",
        height: "76vh",
        content: renderContent(),
    });
    const refresh = () => {
        const body = dialog.element.querySelector(".assistant-skill-dialog") as HTMLElement;
        if (body) {
            body.outerHTML = renderContent();
        }
    };
    dialog.element.setAttribute("data-key", "assistant-patch-review");
    dialog.element.addEventListener("click", async (event) => {
        let target = event.target as HTMLElement;
        while (target && !target.isEqualNode(dialog.element)) {
            const action = target.getAttribute("data-action");
            if (!action) {
                target = target.parentElement;
                continue;
            }
            if (action === "copy-patch") {
                writeText(formatAssistantPatchMarkdown(patch));
                showMessage(assistantText("补丁已复制", "Patch copied"));
                event.preventDefault();
                return;
            }
            if (action === "accept-op") {
                const opID = target.getAttribute("data-op-id") || "";
                const operation = patch.operations.find((item) => item.id === opID);
                if (operation && await applyAssistantPatchOperation(patch, operation, context)) {
                    recordAssistantPatchHistory(patch);
                    refresh();
                }
                event.preventDefault();
                return;
            }
            if (action === "reject-op") {
                const opID = target.getAttribute("data-op-id") || "";
                const operation = patch.operations.find((item) => item.id === opID);
                if (operation) {
                    operation.status = "rejected";
                    refresh();
                }
                event.preventDefault();
                return;
            }
            if (action === "accept-all") {
                if (await applyAssistantPatch(patch, context)) {
                    recordAssistantPatchHistory(patch);
                    dialog.destroy();
                } else {
                    refresh();
                }
                event.preventDefault();
                return;
            }
            if (action === "reject-all") {
                patch.operations.forEach((operation) => {
                    if ((operation.status || "pending") === "pending") {
                        operation.status = "rejected";
                    }
                });
                refresh();
                event.preventDefault();
                return;
            }
            if (action === "continue-adjust" && options.onContinue) {
                if (await options.onContinue()) {
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
