import {isValidEditorCursorColor, normalizeEditorCursorColor} from "./cursor";

const hiddenBlockText = (zh: string, en: string) => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? zh : en;
};

export const normalizeEditorHiddenBlockColor = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) {
        return "";
    }
    return isValidEditorCursorColor(normalized) ? normalizeEditorCursorColor(normalized) : "";
};

export const getEditorHiddenBlockSettingTexts = () => ({
    color: hiddenBlockText("隐藏块遮罩颜色", "Hidden block overlay color"),
    hint: hiddenBlockText("留空时跟随主题色；支持 #hex、rgb(...) 或 rgba(...)", "Leave it empty to follow the theme color. Supports #hex, rgb(...), or rgba(...)."),
});
