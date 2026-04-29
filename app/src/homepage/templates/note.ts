import {homepageText} from "../constants";
import {escapeHTML} from "../html";
import {IHomepageTemplateBundle} from "../types";
import {getMarkdownHomepageCSS} from "./markdown";

export const getNoteHomepageCSS = () => `
.homepage-note__meta {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 0 28px 18px;
    margin-bottom: 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
}

.homepage-note__info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}

.homepage-note__eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--b3-theme-primary);
}

.homepage-note__title {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--b3-theme-on-surface);
    word-break: break-word;
}

@media (max-width: 720px) {
    .homepage-note__meta {
        padding: 0 18px 16px;
        flex-direction: column;
        align-items: stretch;
    }

    .homepage-note__title {
        font-size: 20px;
    }
}
`.trim();

export const createNoteHomepageBundle = (title: string, content: string): IHomepageTemplateBundle => ({
    html: `<div class="homepage-note">
    <div class="homepage-note__surface">
        <div class="homepage-note__meta">
            <div class="homepage-note__info">
                <div class="homepage-note__eyebrow">${escapeHTML(homepageText("主页笔记", "Homepage Note"))}</div>
                <div class="homepage-note__title">${escapeHTML(title || homepageText("未命名主页笔记", "Untitled Homepage Note"))}</div>
            </div>
        </div>
        <div class="protyle-content">
            <div class="protyle-wysiwyg" data-readonly="true">${content}</div>
        </div>
    </div>
</div>`,
    css: `${getMarkdownHomepageCSS()}\n${getNoteHomepageCSS()}`.trim(),
    script: "",
    config: "{}",
});
