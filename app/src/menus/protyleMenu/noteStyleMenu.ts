import {MenuItem} from "../../menus/Menu";
import {fetchPost} from "../../util/fetch";
import {
    applyNoteStyle,
    removeNoteStyle,
    getNoteStylePresets,
    getNoteStylePresetDisplayName,
    getNoteStyleAttrName,
    isNoteStyleId,
} from "../../editor/noteStylePresets";

const getLang = () => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? "zh" : "en";
};

const presetColorMap: Record<string, string> = {
    "minimal-white": "#ffffff",
    "morandi": "#c4a882",
    "japanese-journal": "#e88ca5",
    "xiaohongshu": "#ff2442",
    "academic": "#1a5276",
    "dark-premium": "#1a1a2e",
};

const presetTextColorMap: Record<string, string> = {
    "minimal-white": "#1a1a1a",
    "morandi": "#5a5a5a",
    "japanese-journal": "#4a4a4a",
    "xiaohongshu": "#ff2442",
    "academic": "#1a5276",
    "dark-premium": "#d4a843",
};

export const showNoteStyleMenu = (protyle: IProtyle) => {
    const presets = getNoteStylePresets();
    const lang = getLang();
    const currentStyle = protyle.wysiwyg.element.getAttribute("data-note-style") || "";

    window.sourceflow.menus.menu.remove();

    presets.forEach((preset) => {
        const bgColor = presetColorMap[preset.id] || "#888";
        const textColor = presetTextColorMap[preset.id] || "#fff";
        const displayName = getNoteStylePresetDisplayName(preset);
        const labelHTML = `<div class="fn__flex fn__flex-center" style="gap:8px;">
            <span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${bgColor};border:1px solid var(--b3-border-color);flex-shrink:0;"></span>
            <span style="color:${textColor};font-size:13px;">${displayName}</span>
        </div>`;

        window.sourceflow.menus.menu.append(new MenuItem({
            iconHTML: "",
            label: labelHTML,
            current: currentStyle === preset.id,
            click: () => {
                const protyleElement = protyle.element;
                applyNoteStyle(protyleElement, preset.id);
                fetchPost("/api/attr/setBlockAttrs", {
                    id: protyle.block.rootID,
                    attrs: {[getNoteStyleAttrName()]: preset.id},
                });
            },
        }).element);
    });

    window.sourceflow.menus.menu.append(new MenuItem({type: "separator"}).element);

    const resetLabel = lang === "zh" ? "恢复默认" : "Reset to default";
    const hasStyle = currentStyle && isNoteStyleId(currentStyle);
    window.sourceflow.menus.menu.append(new MenuItem({
        iconHTML: "",
        label: `<span style="opacity:0.7;">${resetLabel}</span>`,
        current: !hasStyle,
        click: () => {
            if (!hasStyle) {
                return;
            }
            const protyleElement = protyle.element;
            removeNoteStyle(protyleElement);
            fetchPost("/api/attr/setBlockAttrs", {
                id: protyle.block.rootID,
                attrs: {[getNoteStyleAttrName()]: ""},
            });
        },
    }).element);

    const breadcrumbBar = protyle.breadcrumb?.element;
    if (breadcrumbBar) {
        const rect = breadcrumbBar.getBoundingClientRect();
        window.sourceflow.menus.menu.popup({x: rect.left + 40, y: rect.bottom + 4});
    }
};
