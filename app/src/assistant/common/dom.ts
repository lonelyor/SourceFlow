import {assistantText} from "../constants";

export const escapeHTML = (value: string) => `${value || ""}`.replace(/[&<>"']/g, (match) => {
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

export const escapeAttr = (value: string) => escapeHTML(value).replace(/"/g, "&quot;");

export const nl2br = (value: string) => escapeHTML(value).replace(/\n/g, "<br>");

export const formatDateTime = (value: number) => {
    if (!value) {
        return "";
    }
    return new Date(value).toLocaleString();
};

export const truncateText = (value: string, length = 64) => {
    const normalized = `${value || ""}`.trim();
    if (normalized.length <= length) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(length - 1, 1))}…`;
};

export const panelEmptyHTML = (title: string, detail: string, actionLabel = "", action = "") => {
    const actionHTML = actionLabel ? `<button class="b3-button b3-button--text" data-action="${escapeAttr(action)}">${escapeHTML(actionLabel)}</button>` : "";
    return `<div class="assistant-empty fn__flex-column fn__flex-center">
    <div class="assistant-empty__title">${escapeHTML(title)}</div>
    <div class="assistant-empty__detail">${escapeHTML(detail)}</div>
    ${actionHTML}
</div>`;
};

export const providerDisplayName = (provider: string) => {
    switch (provider) {
        case "openai-compatible":
            return "OpenAI Compatible";
        case "anthropic":
            return "Anthropic";
        case "gemini":
            return "Gemini";
        case "volcengine":
            return assistantText("火山方舟", "Volcengine Ark");
        case "kimi":
            return "Kimi";
        case "glm":
            return "GLM";
        case "openrouter":
            return "OpenRouter";
        case "deepseek":
            return "DeepSeek";
        case "ollama":
            return "Ollama";
        default:
            return provider || "AI";
    }
};
