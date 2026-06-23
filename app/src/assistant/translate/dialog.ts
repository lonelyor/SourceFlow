import {openSettingTab} from "../../config";
import {Dialog} from "../../dialog";
import {showMessage} from "../../dialog/message";
import {App} from "../../index";
import {writeText} from "../../protyle/util/compatibility";
import {getAssistantAIDefaultProfile, streamAssistantAI} from "../ai/api";
import {assistantText} from "../constants";
import {reportAssistantRuntimeError} from "../runtime";

interface IOpenAssistantTranslateDialogOptions {
    initialText?: string;
}

interface ITranslateLanguageOption {
    value: string;
    zh: string;
    en: string;
}

const ASSISTANT_TRANSLATE_DIALOG_KEY = "dialog-assistant-translate";
const ASSISTANT_TRANSLATE_POSITION_ID = "assistant-translate";

const translateLanguages: ITranslateLanguageOption[] = [
    {value: "auto", zh: "自动识别", en: "Auto Detect"},
    {value: "Chinese", zh: "中文", en: "Chinese"},
    {value: "English", zh: "英语", en: "English"},
    {value: "Japanese", zh: "日语", en: "Japanese"},
    {value: "Korean", zh: "韩语", en: "Korean"},
    {value: "French", zh: "法语", en: "French"},
    {value: "German", zh: "德语", en: "German"},
    {value: "Spanish", zh: "西班牙语", en: "Spanish"},
    {value: "Russian", zh: "俄语", en: "Russian"},
    {value: "Portuguese", zh: "葡萄牙语", en: "Portuguese"},
    {value: "Italian", zh: "意大利语", en: "Italian"},
    {value: "Arabic", zh: "阿拉伯语", en: "Arabic"},
];

const escapeHTML = (value: string) => `${value || ""}`.replace(/[&<>"']/g, (match) => {
    switch (match) {
        case "&":
            return "&amp;";
        case "<":
            return "&lt;";
        case ">":
            return "&gt;";
        case "\"":
            return "&quot;";
        default:
            return "&#39;";
    }
});

const renderLanguageOptions = (selected: string, includeAuto = true) => {
    return translateLanguages
        .filter((item) => includeAuto || item.value !== "auto")
        .map((item) => {
            const label = assistantText(item.zh, item.en);
            return `<option value="${escapeHTML(item.value)}"${item.value === selected ? " selected" : ""}>${escapeHTML(label)}</option>`;
        }).join("");
};

const getDialogTexts = () => ({
    title: window.sourceflow.languages.aiTranslate || assistantText("翻译", "Translate"),
    sourceLanguage: assistantText("源语言", "Source"),
    targetLanguage: assistantText("目标语言", "Target"),
    swapLanguages: assistantText("交换源语言和目标语言", "Swap source and target languages"),
    inputTitle: assistantText("待翻译内容", "Source Text"),
    inputPlaceholder: assistantText("输入任意内容，然后发送给 AI 进行翻译。", "Enter any content and send it to AI for translation."),
    outputTitle: assistantText("翻译结果", "Translation"),
    outputEmpty: assistantText("翻译结果会显示在这里。", "The translation result will appear here."),
    translate: assistantText("翻译", "Translate"),
    copy: assistantText("复制结果", "Copy Result"),
    copied: assistantText("翻译结果已复制", "Translation copied"),
    translating: assistantText("翻译中...", "Translating..."),
    translateReady: assistantText("按 Ctrl/Cmd + Enter 发送翻译", "Press Ctrl/Cmd + Enter to translate"),
    noProfile: assistantText("请先配置至少一个 AI 模型", "Configure at least one AI profile first"),
    openProfiles: assistantText("打开 AI 配置", "Open AI Profiles"),
    textRequired: assistantText("请输入要翻译的内容", "Enter the content to translate"),
    activeProfile: assistantText("翻译会使用当前默认 AI 配置，不会自动写入笔记。", "Translation uses the current default AI profile and will not write back into notes automatically."),
});

const buildTranslationSystemPrompt = () => assistantText(
    "你是 SourceFlow 内置翻译助手。你的职责是严格翻译用户给出的文本。除非用户明确要求，否则不要解释、不要总结、不要补充背景。尽量保留原有段落、列表、Markdown、代码块、换行和标点结构。专有名词、命令、文件路径、URL、代码标识符默认保持原样，只在明显需要时做最小限度翻译。",
    "You are SourceFlow's built-in translation assistant. Translate the user's text faithfully. Unless explicitly requested, do not explain, summarize, or add commentary. Preserve the original paragraph structure, lists, Markdown, code blocks, line breaks, and punctuation as much as possible. Keep proper nouns, commands, file paths, URLs, and code identifiers unchanged unless translation is clearly necessary."
);

const buildTranslationMessage = (sourceLanguage: string, targetLanguage: string, text: string) => {
    const normalizedSource = sourceLanguage === "auto"
        ? assistantText("自动识别的源语言", "the detected source language")
        : sourceLanguage;
    return assistantText(
        `请将下面的内容从${normalizedSource}翻译成${targetLanguage}。只输出译文，不要解释，不要加标题。\n\n\`\`\`text\n${text.trim()}\n\`\`\``,
        `Translate the content below from ${normalizedSource} into ${targetLanguage}. Return only the translated text with no explanation and no title.\n\n\`\`\`text\n${text.trim()}\n\`\`\``
    );
};

class AssistantTranslateDialog {
    private readonly app: App;
    private readonly dialog: Dialog;
    private readonly element: HTMLElement;
    private readonly inputElement: HTMLTextAreaElement;
    private readonly outputElement: HTMLElement;
    private readonly statusElement: HTMLElement;
    private readonly sourceElement: HTMLSelectElement;
    private readonly targetElement: HTMLSelectElement;
    private readonly submitElement: HTMLButtonElement;
    private readonly copyElement: HTMLButtonElement;
    private readonly texts = getDialogTexts();
    private result = "";
    private sending = false;

    constructor(dialog: Dialog, app?: App, options: IOpenAssistantTranslateDialogOptions = {}) {
        this.app = app || window.sourceflow.ws.app;
        this.dialog = dialog;
        this.element = dialog.element.querySelector(".assistant-translate") as HTMLElement;
        this.inputElement = this.element.querySelector('[data-role="input"]') as HTMLTextAreaElement;
        this.outputElement = this.element.querySelector('[data-role="output"]') as HTMLElement;
        this.statusElement = this.element.querySelector('[data-role="status"]') as HTMLElement;
        this.sourceElement = this.element.querySelector('[data-role="source-language"]') as HTMLSelectElement;
        this.targetElement = this.element.querySelector('[data-role="target-language"]') as HTMLSelectElement;
        this.submitElement = this.element.querySelector('[data-action="submit"]') as HTMLButtonElement;
        this.copyElement = this.element.querySelector('[data-action="copy"]') as HTMLButtonElement;
        this.bindEvents();
        this.setInitialText(options.initialText || "");
        this.renderOutput("");
        this.updateSendingState(false);
        this.inputElement.focus();
        this.inputElement.setSelectionRange(this.inputElement.value.length, this.inputElement.value.length);
    }

    public setInitialText(value: string) {
        const normalized = `${value || ""}`.trim();
        if (!normalized) {
            return;
        }
        if (!this.inputElement.value.trim()) {
            this.inputElement.value = normalized;
            return;
        }
        if (this.inputElement.value.trim() === normalized) {
            return;
        }
        this.inputElement.value = `${this.inputElement.value.trim()}\n\n${normalized}`;
    }

    private bindEvents() {
        this.element.addEventListener("click", (event: MouseEvent) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.element)) {
                const action = target.getAttribute("data-action");
                if (action === "submit") {
                    void this.translate();
                    event.preventDefault();
                    return;
                }
                if (action === "copy") {
                    void this.copyResult();
                    event.preventDefault();
                    return;
                }
                if (action === "swap") {
                    this.swapLanguages();
                    event.preventDefault();
                    return;
                }
                if (action === "open-profiles") {
                    openSettingTab(this.app, "AI");
                    event.preventDefault();
                    return;
                }
                target = target.parentElement;
            }
        });

        this.inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.isComposing) {
                return;
            }
            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === "Enter" && !event.repeat) {
                void this.translate();
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (event.key === "Escape" && !event.repeat) {
                this.dialog.destroy();
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }

    private swapLanguages() {
        const source = this.sourceElement.value;
        const target = this.targetElement.value;
        if (source === "auto") {
            this.sourceElement.value = target;
            this.targetElement.value = assistantText("中文", "English");
            return;
        }
        this.sourceElement.value = target;
        this.targetElement.value = source;
    }

    private updateSendingState(sending: boolean) {
        this.sending = sending;
        this.submitElement.disabled = sending;
        this.sourceElement.disabled = sending;
        this.targetElement.disabled = sending;
        this.copyElement.disabled = sending || !this.result.trim();
        this.statusElement.textContent = sending ? this.texts.translating : this.texts.translateReady;
        this.element.classList.toggle("assistant-translate--sending", sending);
    }

    private renderOutput(value: string) {
        this.result = value;
        if (value.trim()) {
            this.outputElement.innerHTML = `<pre>${escapeHTML(value)}</pre>`;
        } else {
            this.outputElement.innerHTML = `<div class="assistant-translate__empty">${escapeHTML(this.texts.outputEmpty)}</div>`;
        }
        this.copyElement.disabled = this.sending || !value.trim();
    }

    private async copyResult() {
        if (!this.result.trim()) {
            return;
        }
        await writeText(this.result);
        showMessage(this.texts.copied);
    }

    private async translate() {
        if (this.sending) {
            return;
        }
        const text = `${this.inputElement.value || ""}`.trim();
        if (!text) {
            showMessage(this.texts.textRequired, 4000, "error");
            this.inputElement.focus();
            return;
        }
        const profile = await getAssistantAIDefaultProfile();
        if (!profile) {
            showMessage(this.texts.noProfile, 5000, "error");
            openSettingTab(this.app, "AI");
            return;
        }
        const sourceLanguage = this.sourceElement.value || "auto";
        const targetLanguage = this.targetElement.value || assistantText("中文", "English");
        let nextOutput = "";
        this.renderOutput("");
        this.updateSendingState(true);
        try {
            const result = await streamAssistantAI({
                profileId: profile.id,
                mode: "translate",
                title: this.texts.title,
                system: buildTranslationSystemPrompt(),
                message: buildTranslationMessage(sourceLanguage, targetLanguage, text),
                enableTools: false,
            }, {
                onDelta: (delta) => {
                    nextOutput += delta;
                    this.renderOutput(nextOutput);
                },
            });
            const finalOutput = `${result.assistantMessage?.content || nextOutput || ""}`.trim();
            this.renderOutput(finalOutput);
        } catch (error) {
            reportAssistantRuntimeError("translate:request", error);
            if (nextOutput) {
                this.renderOutput(nextOutput);
            }
        } finally {
            this.updateSendingState(false);
        }
    }
}

const createDialogHTML = () => {
    const texts = getDialogTexts();
    return `<div class="assistant-translate fn__flex-column">
    <div class="assistant-translate__toolbar">
        <label class="assistant-translate__field fn__flex-column">
            <span>${escapeHTML(texts.sourceLanguage)}</span>
            <select class="b3-select fn__block" data-role="source-language">${renderLanguageOptions("auto", true)}</select>
        </label>
        <button type="button" class="assistant-translate__swap" data-action="swap" aria-label="${escapeHTML(texts.swapLanguages)}" title="${escapeHTML(texts.swapLanguages)}">
            <svg><use xlink:href="#iconRefresh"></use></svg>
        </button>
        <label class="assistant-translate__field fn__flex-column">
            <span>${escapeHTML(texts.targetLanguage)}</span>
            <select class="b3-select fn__block" data-role="target-language">${renderLanguageOptions(assistantText("中文", "English"), false)}</select>
        </label>
        <div class="assistant-translate__toolbar-meta fn__flex-1">
            <div class="assistant-translate__summary">${escapeHTML(texts.activeProfile)}</div>
            <button type="button" class="b3-button b3-button--outline" data-action="open-profiles">${escapeHTML(texts.openProfiles)}</button>
        </div>
    </div>
    <div class="assistant-translate__panes fn__flex-1">
        <label class="assistant-translate__pane assistant-translate__pane--input fn__flex-column">
            <span class="assistant-translate__pane-title">${escapeHTML(texts.inputTitle)}</span>
            <textarea class="b3-text-field" data-role="input" spellcheck="false" placeholder="${escapeHTML(texts.inputPlaceholder)}"></textarea>
        </label>
        <div class="assistant-translate__pane assistant-translate__pane--output fn__flex-column">
            <div class="assistant-translate__pane-head">
                <span class="assistant-translate__pane-title">${escapeHTML(texts.outputTitle)}</span>
                <span class="assistant-translate__status" data-role="status">${escapeHTML(texts.translateReady)}</span>
            </div>
            <div class="assistant-translate__output" data-role="output"></div>
        </div>
    </div>
    <div class="assistant-translate__footer">
        <button type="button" class="b3-button b3-button--text" data-action="copy">${escapeHTML(texts.copy)}</button>
        <span class="fn__flex-1"></span>
        <button type="button" class="b3-button b3-button--blue" data-action="submit">${escapeHTML(texts.translate)}</button>
    </div>
</div>`;
};

export const openAssistantTranslateDialog = (app?: App, options: IOpenAssistantTranslateDialogOptions = {}) => {
    const existing = window.sourceflow.dialogs.find((item) => item.element.getAttribute("data-key") === ASSISTANT_TRANSLATE_DIALOG_KEY);
    if (existing) {
        const instance = existing.data?.assistantTranslateDialog as AssistantTranslateDialog | undefined;
        instance?.setInitialText(options.initialText || "");
        const inputElement = existing.element.querySelector('.assistant-translate [data-role="input"]') as HTMLTextAreaElement;
        inputElement?.focus();
        return existing;
    }
    const dialog = new Dialog({
        title: window.sourceflow.languages.aiTranslate || assistantText("翻译", "Translate"),
        content: createDialogHTML(),
        width: "840px",
        height: "72vh",
        positionId: ASSISTANT_TRANSLATE_POSITION_ID,
        containerClassName: "assistant-translate-dialog",
    });
    dialog.element.setAttribute("data-key", ASSISTANT_TRANSLATE_DIALOG_KEY);
    dialog.data = dialog.data || {};
    dialog.data.assistantTranslateDialog = new AssistantTranslateDialog(dialog, app, options);
    return dialog;
};
