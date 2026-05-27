import {Dialog} from "../../dialog";
import {assistantText} from "../constants";
import {escapeAttr, escapeHTML} from "../common/dom";

type TAssistantTranslateMode = "mixed" | "replace";

interface IOpenFullTextTranslateDialogResult {
    mode: TAssistantTranslateMode;
    targetLanguage: string;
}

interface ITranslateLanguageOption {
    value: string;
    zh: string;
    en: string;
}

const fullTextTranslateLanguages: ITranslateLanguageOption[] = [
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

const renderFullTextLanguageOptions = (selected: string) => {
    return fullTextTranslateLanguages
        .map((item) => {
            const label = assistantText(item.zh, item.en);
            return `<option value="${escapeHTML(item.value)}"${item.value === selected ? " selected" : ""}>${escapeHTML(label)}</option>`;
        }).join("");
};

export const openAssistantFullTextTranslateDialog = (): Promise<IOpenFullTextTranslateDialogResult | null> => {
    return new Promise((resolve) => {
        const defaultLang = assistantText("Chinese", "English");
        const dialog = new Dialog({
            title: assistantText("全文翻译", "Full-Text Translation"),
            width: "420px",
            height: "280px",
            content: `<div class="assistant-fulltext-dialog fn__flex-column">
    <div class="assistant-fulltext-dialog__field">
        <span>${escapeHTML(assistantText("翻译模式", "Translation mode"))}</span>
        <select class="b3-select fn__block" data-role="translate-mode">
            <option value="mixed">${escapeHTML(assistantText("混合模式（保留原文，关键术语后加译文）", "Mixed (keep original, append translation for key terms)"))}</option>
            <option value="replace">${escapeHTML(assistantText("替换模式（整篇翻译为目标语言）", "Replace (translate entire document)"))}</option>
        </select>
    </div>
    <div class="assistant-fulltext-dialog__field">
        <span>${escapeHTML(assistantText("目标语言", "Target language"))}</span>
        <select class="b3-select fn__block" data-role="target-language">${renderFullTextLanguageOptions(defaultLang)}</select>
    </div>
    <div class="assistant-fulltext-dialog__actions">
        <button type="button" class="b3-button b3-button--cancel" data-action="cancel">${escapeHTML(window.sourceflow.languages.close)}</button>
        <button type="button" class="b3-button b3-button--blue" data-action="start">${escapeHTML(assistantText("开始翻译", "Start Translation"))}</button>
    </div>
</div>`,
        });
        dialog.element.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            const action = target.getAttribute("data-action");
            if (action === "cancel") {
                dialog.destroy();
                resolve(null);
                event.preventDefault();
                return;
            }
            if (action === "start") {
                const modeSelect = dialog.element.querySelector("[data-role='translate-mode']") as HTMLSelectElement;
                const langSelect = dialog.element.querySelector("[data-role='target-language']") as HTMLSelectElement;
                dialog.destroy();
                resolve({
                    mode: modeSelect.value as TAssistantTranslateMode,
                    targetLanguage: langSelect.value,
                });
                event.preventDefault();
                return;
            }
        });
    });
};
