import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {escapeHTML} from "../common/dom";
import {getNoteContextFromProtyle} from "../common/note";
import {getAssistantAIDefaultProfile, streamAssistantAI} from "../ai/api";
import {replaceCurrentSelection} from "./translateBubbleReplace";

interface IOpenTranslateBubbleOptions {
    protyle: IProtyle;
    range?: Range | null;
    selectedText: string;
}

const ASSISTANT_TRANSLATE_LANG_KEY = "assistant-translate-lang";

interface ITranslateBubbleState {
    element: HTMLElement | null;
    closed: boolean;
}

const bubbleState: ITranslateBubbleState = {
    element: null,
    closed: false,
};

const getSavedTargetLanguage = () => {
    try {
        return window.localStorage?.getItem(ASSISTANT_TRANSLATE_LANG_KEY) || "";
    } catch (_error) {
        return "";
    }
};

const saveTargetLanguage = (lang: string) => {
    try {
        window.localStorage?.setItem(ASSISTANT_TRANSLATE_LANG_KEY, lang);
    } catch (_error) {
        // Ignore storage failures.
    }
};

const buildTranslateBubbleSystemPrompt = () => assistantText(
    "你是 SourceFlow 内置翻译助手。严格翻译用户给出的文本。不要解释、不要总结、不要补充背景。保持原有段落、列表、换行和标点结构。只输出译文。",
    "You are SourceFlow's built-in translation assistant. Translate the text faithfully. Do not explain, summarize, or add commentary. Preserve the original paragraph structure, lists, line breaks, and punctuation. Return only the translation."
);

const buildTranslateBubbleMessage = (text: string, targetLanguage: string) => {
    const lang = targetLanguage || assistantText("中文", "English");
    return assistantText(
        `将下面的内容翻译成${lang}。只输出译文，不要解释，不要加标题。\n\n\`\`\`text\n${text.trim()}\n\`\`\``,
        `Translate the content below into ${lang}. Return only the translated text with no explanation and no title.\n\n\`\`\`text\n${text.trim()}\n\`\`\``
    );
};

const createTranslateBubbleElement = (selectedText: string) => {
    const element = document.createElement("div");
    element.className = "assistant-translate-bubble";
    element.setAttribute("data-assistant-translate-bubble", "");
    const savedLang = getSavedTargetLanguage();
    element.innerHTML = `<div class="assistant-translate-bubble__head">
    <span class="assistant-translate-bubble__label">${escapeHTML(assistantText("翻译", "Translate"))}</span>
    <input type="text" class="assistant-translate-bubble__lang-input b3-text-field" data-role="target-lang" value="${escapeHTML(savedLang || assistantText("中文", "English"))}" placeholder="${escapeHTML(assistantText("目标语言", "Target language"))}">
    <button type="button" class="assistant-translate-bubble__close" data-action="close">${escapeHTML(assistantText("关闭", "Close"))}</button>
</div>
<div class="assistant-translate-bubble__body" data-role="output">${escapeHTML(assistantText("准备中...", "Preparing..."))}</div>
<div class="assistant-translate-bubble__actions">
    <button type="button" class="b3-button b3-button--text assistant-translate-bubble__replace" data-action="replace" disabled>${escapeHTML(assistantText("替换", "Replace"))}</button>
    <button type="button" class="b3-button b3-button--outline assistant-translate-bubble__insert" data-action="insert" disabled>${escapeHTML(assistantText("插入", "Insert"))}</button>
</div>`;
    return element;
};

const positionTranslateBubble = (bubble: HTMLElement, range: Range) => {
    const rect = range.getBoundingClientRect();
    const bubbleHeight = 200;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const bubbleWidth = Math.min(480, viewportWidth - 32);
    let left = rect.left + rect.width / 2 - bubbleWidth / 2;
    left = Math.max(16, Math.min(left, viewportWidth - bubbleWidth - 16));
    let top = rect.bottom + 8;
    if (top + bubbleHeight > viewportHeight - 16) {
        top = rect.top - bubbleHeight - 8;
    }
    if (top < 16) {
        top = 16;
    }
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.style.width = `${bubbleWidth}px`;
};

export const openAssistantTranslateBubble = async (options: IOpenTranslateBubbleOptions) => {
    closeAssistantTranslateBubble();
    const range = options.range?.cloneRange() || (getSelection().rangeCount > 0 ? getSelection().getRangeAt(0).cloneRange() : null);
    if (!range || !options.selectedText) {
        return;
    }
    const note = await getNoteContextFromProtyle(options.protyle, range, options.selectedText);
    if (!note) {
        showMessage(assistantText("请先打开一个笔记", "Open a note first"), 4000, "error");
        return;
    }
    const profile = await getAssistantAIDefaultProfile();
    if (!profile) {
        showMessage(assistantText("请先配置至少一个 AI 模型", "Configure at least one AI profile first"), 5000, "error");
        return;
    }
    bubbleState.closed = false;
    const bubble = createTranslateBubbleElement(options.selectedText);
    bubbleState.element = bubble;
    document.body.appendChild(bubble);
    positionTranslateBubble(bubble, range);
    window.requestAnimationFrame(() => {
        bubble.classList.add("assistant-translate-bubble--visible");
    });

    const outputEl = bubble.querySelector("[data-role='output']") as HTMLElement;
    const replaceBtn = bubble.querySelector("[data-action='replace']") as HTMLButtonElement;
    const insertBtn = bubble.querySelector("[data-action='insert']") as HTMLButtonElement;
    const langInput = bubble.querySelector("[data-role='target-lang']") as HTMLInputElement;
    const targetLang = langInput.value.trim() || assistantText("中文", "English");
    saveTargetLanguage(targetLang);

    const selectedText = options.selectedText;
    const protyle = options.protyle;

    const onActionClick = async (event: Event) => {
        const target = event.target as HTMLElement;
        const action = target.getAttribute("data-action");
        if (action === "close") {
            closeAssistantTranslateBubble();
            return;
        }
        if (action === "replace") {
            const translation = (outputEl.textContent || "").trim();
            if (!translation) {
                return;
            }
            const replaced = await replaceCurrentSelection({protyle, range: options.range, selectedText}, translation);
            if (replaced) {
                closeAssistantTranslateBubble();
                showMessage(assistantText("已替换选区内容", "Selection replaced"), 2000);
            } else {
                showMessage(assistantText("替换失败，请手动替换。", "Replace failed. Please replace manually."), 4000, "error");
            }
            return;
        }
        if (action === "insert") {
            const translation = (outputEl.textContent || "").trim();
            if (!translation) {
                return;
            }
            await navigator.clipboard.writeText(translation);
            closeAssistantTranslateBubble();
            showMessage(assistantText("翻译结果已复制", "Translation copied"), 2000);
            return;
        }
    };
    bubble.addEventListener("click", onActionClick);
    langInput.addEventListener("keydown", (event) => {
        event.stopPropagation();
    });

    let partialResult = "";
    try {
        const result = await streamAssistantAI({
            profileId: profile.id,
            mode: "chat",
            title: assistantText("翻译", "Translate"),
            system: buildTranslateBubbleSystemPrompt(),
            message: buildTranslateBubbleMessage(selectedText, targetLang),
            enableTools: false,
            context: note,
        }, {
            onDelta: (delta) => {
                if (bubbleState.closed) {
                    return;
                }
                partialResult += delta;
                outputEl.textContent = partialResult || assistantText("准备中...", "Preparing...");
            },
        });
        const finalReply = [...result.messages].reverse().find((item) => item.role === "assistant")?.content?.trim() || partialResult.trim();
        if (bubbleState.closed) {
            return;
        }
        outputEl.textContent = finalReply || assistantText("翻译完成", "Translation complete");
        replaceBtn.disabled = !finalReply;
        insertBtn.disabled = !finalReply;
    } catch (error) {
        if (bubbleState.closed) {
            return;
        }
        if (partialResult) {
            outputEl.textContent = partialResult;
            replaceBtn.disabled = false;
            insertBtn.disabled = false;
        } else {
            outputEl.textContent = assistantText("翻译失败", "Translation failed");
            const errorDetail = error instanceof Error ? error.message : String(error);
            showMessage(errorDetail, 5000, "error");
        }
    }
};

export const closeAssistantTranslateBubble = () => {
    bubbleState.closed = true;
    if (bubbleState.element) {
        bubbleState.element.classList.remove("assistant-translate-bubble--visible");
        const el = bubbleState.element;
        window.setTimeout(() => el.remove(), 160);
        bubbleState.element = null;
    }
};
