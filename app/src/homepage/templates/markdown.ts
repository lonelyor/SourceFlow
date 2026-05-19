import {setLute} from "../../protyle/render/setLute";
import {IHomepageTemplateBundle} from "../types";

export const getMarkdownHomepageCSS = () => `
.homepage-note {
    max-width: 980px;
    margin: 0 auto;
    padding: 28px 24px 48px;
    box-sizing: border-box;
}

.homepage-note__surface {
    position: relative;
    padding: 24px 0;
    border-radius: 28px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--b3-theme-surface) 96%, transparent),
        color-mix(in srgb, var(--b3-theme-background) 98%, transparent)
    );
    border: 1px solid color-mix(in srgb, var(--b3-border-color) 82%, transparent);
    box-shadow: 0 22px 46px rgba(15, 23, 42, 0.08);
    overflow: hidden;
}

.homepage-note__surface::before {
    content: "";
    position: absolute;
    left: -80px;
    top: -120px;
    width: 240px;
    height: 240px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(255, 136, 179, 0.18), rgba(255, 136, 179, 0) 72%);
    pointer-events: none;
}

.homepage-note__surface::after {
    content: "";
    position: absolute;
    right: -60px;
    top: 12px;
    width: 220px;
    height: 220px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(79, 195, 255, 0.14), rgba(79, 195, 255, 0) 72%);
    pointer-events: none;
}

.homepage-note .protyle-content {
    padding: 0 28px;
}

.homepage-note .protyle-wysiwyg {
    padding: 0 !important;
    max-width: none;
}

@media (max-width: 720px) {
    .homepage-note {
        padding: 16px 14px 30px;
    }

    .homepage-note__surface {
        padding: 18px 0;
        border-radius: 22px;
    }

    .homepage-note .protyle-content {
        padding: 0 18px;
    }
}
`.trim();

export const renderMarkdownHomepageHTML = (markdown: string) => {
    const lute = setLute({
        emojis: {},
        emojiSite: "/emojis",
        headingAnchor: false,
        sanitize: true,
        listStyle: false,
        paragraphBeginningSpace: !!window.sourceflow.config.export.paragraphBeginningSpace,
    });
    const blockDOM = lute.Md2BlockDOM(`${markdown || ""}`);
    return `<div class="homepage-note">
    <div class="homepage-note__surface">
        <div class="protyle-content">
            <div class="protyle-wysiwyg" data-readonly="true">${blockDOM}</div>
        </div>
    </div>
</div>`;
};

export const createMarkdownHomepageBundle = (markdown: string, css = "", script = "", config = "{}"): IHomepageTemplateBundle => ({
    html: renderMarkdownHomepageHTML(markdown),
    css: `${getMarkdownHomepageCSS()}\n${css || ""}`.trim(),
    script,
    config,
});
