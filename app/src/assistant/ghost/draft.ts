import {assistantText} from "../constants";
import {escapeHTML} from "../common/dom";
import type {IAssistantSkillContext, IAssistantSkillDefinition} from "../skills/types";

export interface IAssistantGhostDraft {
    update(markdown: string): void;
    markReviewing(): void;
    destroy(): void;
    isCanceled(): boolean;
}

const patchableGhostActions = new Set(["replace-selection", "insert-below", "append-note"]);

const resolveAssistantGhostAnchor = (context: IAssistantSkillContext) => {
    const editor = context.protyle?.wysiwyg?.element as HTMLElement | undefined;
    if (!editor || !editor.isConnected) {
        return null;
    }
    const blockID = context.note?.currentBlockID || context.note?.rootID || "";
    const block = blockID ? editor.querySelector(`[data-node-id="${blockID}"]`) as HTMLElement : null;
    return block || editor.lastElementChild as HTMLElement || editor;
};

const buildAssistantGhostElement = (definition: IAssistantSkillDefinition, inline: boolean) => {
    const element = document.createElement("div");
    element.className = `assistant-ghost-draft${inline ? " assistant-ghost-draft--inline" : ""}`;
    element.setAttribute("data-assistant-ghost-draft", definition.id);
    element.innerHTML = `<div class="assistant-ghost-draft__head">
    <span class="assistant-ghost-draft__label">${escapeHTML(inline ? assistantText("AI 替换预览", "AI replacement preview") : assistantText("AI 临时草稿", "AI ghost draft"))}</span>
    <span class="assistant-ghost-draft__hint">${escapeHTML(assistantText("Esc 取消", "Esc to cancel"))}</span>
</div>
<div class="assistant-ghost-draft__body">${escapeHTML(assistantText("准备中...", "Preparing..."))}</div>`;
    return element;
};

export const shouldUseAssistantGhostDraft = (definition: IAssistantSkillDefinition) => {
    return patchableGhostActions.has(definition.action);
};

export const createAssistantGhostDraft = (
    definition: IAssistantSkillDefinition,
    context: IAssistantSkillContext,
): IAssistantGhostDraft | null => {
    if (!context.protyle || !shouldUseAssistantGhostDraft(definition)) {
        return null;
    }
    const anchor = resolveAssistantGhostAnchor(context);
    if (!anchor) {
        return null;
    }
    const inline = definition.action === "replace-selection";
    const element = buildAssistantGhostElement(definition, inline);
    if (anchor.parentElement && anchor !== context.protyle.wysiwyg.element) {
        anchor.insertAdjacentElement("afterend", element);
    } else {
        context.protyle.wysiwyg.element.appendChild(element);
    }
    let canceled = false;
    const body = element.querySelector(".assistant-ghost-draft__body") as HTMLElement;
    const onKeydown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") {
            return;
        }
        canceled = true;
        element.remove();
        window.removeEventListener("keydown", onKeydown, true);
    };
    window.addEventListener("keydown", onKeydown, true);
    return {
        update(markdown: string) {
            if (!body || canceled) {
                return;
            }
            body.textContent = `${markdown || ""}`.trim() || assistantText("准备中...", "Preparing...");
        },
        markReviewing() {
            const hint = element.querySelector(".assistant-ghost-draft__hint") as HTMLElement;
            if (hint) {
                hint.textContent = assistantText("等待审阅", "Review pending");
            }
        },
        destroy() {
            element.remove();
            window.removeEventListener("keydown", onKeydown, true);
        },
        isCanceled() {
            return canceled || !element.isConnected;
        },
    };
};
