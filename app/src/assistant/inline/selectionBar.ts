import {assistantText} from "../constants";
import {escapeAttr, escapeHTML} from "../common/dom";
import {runAssistantFeature} from "../runtime";
import {getAllEditor} from "../../layout/getAll";

const loadAssistantSkillModule = () => import("../skills/execute");
const loadAssistantInlineModule = () => import("./commands");
const loadAssistantTranslateBubbleModule = () => import("./translateBubble");

interface ISelectionBarState {
    element: HTMLElement | null;
    debounceTimer: number;
    hideTimer: number;
    currentProtyle: IProtyle | null;
    currentRange: Range | null;
}

const state: ISelectionBarState = {
    element: null,
    debounceTimer: 0,
    hideTimer: 0,
    currentProtyle: null,
    currentRange: null,
};

const DEBOUNCE_MS = 200;
const AUTO_HIDE_MS = 5000;

const createSelectionBarElement = () => {
    const element = document.createElement("div");
    element.className = "assistant-selection-bar";
    element.setAttribute("data-assistant-selection-bar", "");
    element.innerHTML = `<button type="button" class="assistant-selection-bar__button" data-action="translate">${escapeHTML(assistantText("翻译", "Translate"))}</button>
<button type="button" class="assistant-selection-bar__button" data-action="summarize">${escapeHTML(assistantText("总结", "Summarize"))}</button>
<button type="button" class="assistant-selection-bar__button" data-action="rewrite">${escapeHTML(assistantText("改写", "Rewrite"))}</button>
<button type="button" class="assistant-selection-bar__button" data-action="more">${escapeHTML(assistantText("更多", "More"))}</button>
<span class="assistant-selection-bar__input-row"><input type="text" class="assistant-selection-bar__input" data-role="assistant-selection-inline-input" placeholder="${escapeAttr(assistantText("输入指令，Enter 生成", "Type an instruction, press Enter"))}" title="${escapeAttr(assistantText("Enter 生成修改，Esc 返回", "Enter to generate, Esc to go back"))}"></span>`;
    return element;
};

const getSelectionRange = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        return null;
    }
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
        return null;
    }
    return range;
};

const isInsideProtyle = (node: Node) => {
    let current = node instanceof HTMLElement ? node : node.parentElement;
    while (current) {
        if (current.classList.contains("protyle-wysiwyg")) {
            return true;
        }
        current = current.parentElement;
    }
    return false;
};

const findProtyleFromElement = (node: Node): IProtyle | null => {
    const allEditor = getAllEditor();
    const editor = allEditor.find((item) => item.protyle?.element?.contains(node));
    return editor?.protyle || null;
};

const positionSelectionBar = (bar: HTMLElement, range: Range) => {
    const rect = range.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = rect.left + rect.width / 2 - barRect.width / 2;
    left = Math.max(8, Math.min(left, viewportWidth - barRect.width - 8));
    let top = rect.bottom + 8;
    if (top + barRect.height > viewportHeight - 8) {
        top = rect.top - barRect.height - 8;
    }
    if (top < 8) {
        top = 8;
    }
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
};

const showSelectionBar = (protyle: IProtyle, range: Range) => {
    if (!state.element) {
        state.element = createSelectionBarElement();
        document.body.appendChild(state.element);
        bindSelectionBarEvents(state.element);
    }
    state.currentProtyle = protyle;
    state.currentRange = range.cloneRange();
    state.element.classList.add("assistant-selection-bar--visible");
    positionSelectionBar(state.element, range);
    resetAutoHideTimer();
};

export const hideSelectionBar = () => {
    if (state.hideTimer) {
        window.clearTimeout(state.hideTimer);
        state.hideTimer = 0;
    }
    if (state.element) {
        state.element.classList.remove("assistant-selection-bar--visible");
        state.element.classList.remove("assistant-selection-bar--input-mode");
        const input = state.element.querySelector("[data-role='assistant-selection-inline-input']") as HTMLInputElement | null;
        if (input) {
            input.value = "";
        }
    }
    state.currentProtyle = null;
    state.currentRange = null;
};

const isSelectionBarInInputMode = () => !!state.element?.classList.contains("assistant-selection-bar--input-mode");

const enterSelectionBarInputMode = (bar: HTMLElement) => {
    bar.classList.add("assistant-selection-bar--input-mode");
    if (state.hideTimer) {
        window.clearTimeout(state.hideTimer);
        state.hideTimer = 0;
    }
    const input = bar.querySelector("[data-role='assistant-selection-inline-input']") as HTMLInputElement | null;
    if (input) {
        input.value = "";
        window.setTimeout(() => input.focus(), 16);
    }
};

const exitSelectionBarInputMode = (bar: HTMLElement) => {
    bar.classList.remove("assistant-selection-bar--input-mode");
    const input = bar.querySelector("[data-role='assistant-selection-inline-input']") as HTMLInputElement | null;
    if (input) {
        input.value = "";
    }
};

const resetAutoHideTimer = () => {
    if (isSelectionBarInInputMode()) {
        return;
    }
    if (state.hideTimer) {
        window.clearTimeout(state.hideTimer);
    }
    state.hideTimer = window.setTimeout(() => {
        hideSelectionBar();
    }, AUTO_HIDE_MS);
};

const runInlineInstructionFromBar = (instruction: string, protyle: IProtyle, range: Range | null, selectedText: string) => {
    runAssistantFeature("selection-bar:inline-input", loadAssistantInlineModule, ({runAssistantInlineInstruction}) => {
        return runAssistantInlineInstruction({protyle, range, fallbackSelectionText: selectedText}, instruction);
    });
};

const bindSelectionBarEvents = (bar: HTMLElement) => {
    bar.addEventListener("mouseenter", () => {
        if (state.hideTimer) {
            window.clearTimeout(state.hideTimer);
            state.hideTimer = 0;
        }
    });
    bar.addEventListener("mouseleave", () => {
        if (isSelectionBarInInputMode()) {
            return;
        }
        resetAutoHideTimer();
    });
    bar.addEventListener("keydown", (event) => {
        const target = event.target as HTMLElement;
        if (!target.classList.contains("assistant-selection-bar__input")) {
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            exitSelectionBarInputMode(bar);
            resetAutoHideTimer();
            return;
        }
        if (event.key !== "Enter" || event.isComposing) {
            event.stopPropagation();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const instruction = (target as HTMLInputElement).value;
        const protyle = state.currentProtyle;
        const range = state.currentRange;
        const selectedText = range?.toString() || "";
        hideSelectionBar();
        if (!instruction.trim() || !protyle || !selectedText) {
            hideSelectionBar();
            return;
        }
        runInlineInstructionFromBar(instruction, protyle, range, selectedText);
    });
    bar.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const action = target.getAttribute("data-action");
        if (!action) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (action === "more") {
            enterSelectionBarInputMode(bar);
            return;
        }
        const protyle = state.currentProtyle;
        const range = state.currentRange;
        const selectedText = range?.toString() || "";
        if (!protyle || !selectedText) {
            hideSelectionBar();
            return;
        }
        hideSelectionBar();
        handleSelectionBarAction(action, protyle, range, selectedText);
    });
};

const handleSelectionBarAction = (action: string, protyle: IProtyle, range: Range | null, selectedText: string) => {
    if (action === "translate") {
        runAssistantFeature("selection-bar:translate", loadAssistantTranslateBubbleModule, ({openAssistantTranslateBubble}) => {
            openAssistantTranslateBubble({protyle, range, selectedText});
        });
        return;
    }
    if (action === "summarize") {
        runAssistantFeature("selection-bar:summarize", loadAssistantSkillModule, ({runAssistantSkill}) => {
            return runAssistantSkill({
                skillId: "selection-summarize",
                protyle,
                range,
                fallbackSelectionText: selectedText,
            });
        });
        return;
    }
    if (action === "rewrite") {
        runAssistantFeature("selection-bar:rewrite", loadAssistantSkillModule, ({runAssistantSkill}) => {
            return runAssistantSkill({
                skillId: "selection-rewrite",
                protyle,
                range,
                fallbackSelectionText: selectedText,
            });
        });
        return;
    }
};

const onSelectionChange = () => {
    if (isSelectionBarInInputMode()) {
        return;
    }
    if (state.debounceTimer) {
        window.clearTimeout(state.debounceTimer);
    }
    state.debounceTimer = window.setTimeout(() => {
        const range = getSelectionRange();
        if (!range) {
            hideSelectionBar();
            return;
        }
        if (!isInsideProtyle(range.startContainer)) {
            hideSelectionBar();
            return;
        }
        const text = range.toString().trim();
        if (!text) {
            hideSelectionBar();
            return;
        }
        const protyle = findProtyleFromElement(range.startContainer);
        if (!protyle) {
            return;
        }
        showSelectionBar(protyle, range);
    }, DEBOUNCE_MS);
};

const onDocumentMouseDown = (event: MouseEvent) => {
    const target = event.target as Node | null;
    if (target && state.element?.contains(target)) {
        return;
    }
    if (!getSelectionRange()) {
        hideSelectionBar();
    }
};

let selectionBarInitialized = false;

export const initAssistantSelectionBar = () => {
    if (selectionBarInitialized) {
        return;
    }
    selectionBarInitialized = true;
    document.addEventListener("selectionchange", onSelectionChange, {passive: true});
    document.addEventListener("mousedown", onDocumentMouseDown, {passive: true});
};

export const destroyAssistantSelectionBar = () => {
    if (state.debounceTimer) {
        window.clearTimeout(state.debounceTimer);
        state.debounceTimer = 0;
    }
    hideSelectionBar();
    if (state.element) {
        state.element.remove();
        state.element = null;
    }
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("mousedown", onDocumentMouseDown);
    selectionBarInitialized = false;
};
