export interface INoteStylePreset {
    id: string;
    nameZH: string;
    nameEN: string;
    cssVars: Record<string, string>;
}

const NOTE_STYLE_PRESETS: INoteStylePreset[] = [
    {
        id: "minimal-white",
        nameZH: "极简白",
        nameEN: "Minimal White",
        cssVars: {
            "--editor-note-bg": "#ffffff",
            "--editor-note-text": "#1a1a1a",
            "--editor-note-accent": "#e0e0e0",
            "--editor-note-heading-color": "#111111",
            "--editor-note-border-color": "#e8e8e8",
            "--editor-note-radius": "2px",
            "--editor-note-font": "system-ui, -apple-system, sans-serif",
            "--editor-note-line-height": "1.85",
        },
    },
    {
        id: "morandi",
        nameZH: "莫兰迪",
        nameEN: "Morandi",
        cssVars: {
            "--editor-note-bg": "#f5f0eb",
            "--editor-note-text": "#5a5a5a",
            "--editor-note-accent": "#c4a882",
            "--editor-note-heading-color": "#6b7c6e",
            "--editor-note-border-color": "#d5ccc3",
            "--editor-note-radius": "10px",
            "--editor-note-font": "'Georgia', 'Noto Serif SC', serif",
            "--editor-note-line-height": "1.8",
        },
    },
    {
        id: "japanese-journal",
        nameZH: "日系手账",
        nameEN: "Japanese Journal",
        cssVars: {
            "--editor-note-bg": "#fdf6e3",
            "--editor-note-text": "#4a4a4a",
            "--editor-note-accent": "#e88ca5",
            "--editor-note-heading-color": "#d4726a",
            "--editor-note-border-color": "#e0d5c1",
            "--editor-note-radius": "6px",
            "--editor-note-font": "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans SC', sans-serif",
            "--editor-note-line-height": "1.85",
        },
    },
    {
        id: "xiaohongshu",
        nameZH: "小红书风",
        nameEN: "Xiaohongshu",
        cssVars: {
            "--editor-note-bg": "#ffffff",
            "--editor-note-text": "#333333",
            "--editor-note-accent": "#ff2442",
            "--editor-note-heading-color": "#ff2442",
            "--editor-note-border-color": "#ffe0e6",
            "--editor-note-radius": "14px",
            "--editor-note-font": "system-ui, -apple-system, 'PingFang SC', sans-serif",
            "--editor-note-line-height": "2",
        },
    },
    {
        id: "academic",
        nameZH: "学术严谨",
        nameEN: "Academic",
        cssVars: {
            "--editor-note-bg": "#fefefe",
            "--editor-note-text": "#222222",
            "--editor-note-accent": "#1a5276",
            "--editor-note-heading-color": "#1a5276",
            "--editor-note-border-color": "#bbd0e4",
            "--editor-note-radius": "0px",
            "--editor-note-font": "'Times New Roman', 'Noto Serif SC', 'Source Han Serif SC', serif",
            "--editor-note-line-height": "1.65",
        },
    },
    {
        id: "dark-premium",
        nameZH: "暗黑高级",
        nameEN: "Dark Premium",
        cssVars: {
            "--editor-note-bg": "#1a1a2e",
            "--editor-note-text": "#e0d8c8",
            "--editor-note-accent": "#d4a843",
            "--editor-note-heading-color": "#d4a843",
            "--editor-note-border-color": "#2d2d4a",
            "--editor-note-radius": "4px",
            "--editor-note-font": "system-ui, -apple-system, sans-serif",
            "--editor-note-line-height": "1.75",
        },
    },
];

export const getNoteStylePresets = (): INoteStylePreset[] => NOTE_STYLE_PRESETS;

export const getNoteStylePreset = (id: string): INoteStylePreset | undefined => {
    return NOTE_STYLE_PRESETS.find((p) => p.id === id);
};

export const isNoteStyleId = (value: string): boolean => {
    return NOTE_STYLE_PRESETS.some((p) => p.id === value);
};

const NOTE_STYLE_ATTR = "custom-note-style";

export const getNoteStyleAttrName = () => NOTE_STYLE_ATTR;

export const applyNoteStyle = (protyleElement: HTMLElement, presetId: string) => {
    const preset = getNoteStylePreset(presetId);
    if (!preset) {
        return;
    }
    const wysiwyg = protyleElement.querySelector(".protyle-wysiwyg") as HTMLElement | null;
    if (!wysiwyg) {
        return;
    }
    wysiwyg.setAttribute("data-note-style", presetId);
    const styleId = `noteStyle_${presetId}`;
    const existing = protyleElement.querySelector(`:scope > style[id^="noteStyle_"]`);
    if (existing) {
        existing.remove();
    }
    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    Object.entries(preset.cssVars).forEach(([key, value]) => {
        wysiwyg.style.setProperty(key, value);
    });
    protyleElement.appendChild(styleEl);
    styleEl.dataset.noteStyleFor = presetId;
};

export const removeNoteStyle = (protyleElement: HTMLElement) => {
    const wysiwyg = protyleElement.querySelector(".protyle-wysiwyg") as HTMLElement | null;
    if (!wysiwyg) {
        return;
    }
    wysiwyg.removeAttribute("data-note-style");
    NOTE_STYLE_PRESETS.forEach((preset) => {
        Object.keys(preset.cssVars).forEach((key) => {
            wysiwyg.style.removeProperty(key);
        });
    });
    protyleElement.querySelectorAll(`:scope > style[id^="noteStyle_"]`).forEach((el) => el.remove());
};

export const reapplyNoteStyleFromAttr = (protyleElement: HTMLElement, rootID: string) => {
    const existing = protyleElement.querySelector(`:scope > style[id^="noteStyle_"]`);
    if (existing) {
        existing.remove();
    }
    const wysiwyg = protyleElement.querySelector(".protyle-wysiwyg") as HTMLElement | null;
    if (!wysiwyg) {
        return;
    }
    const currentStyle = wysiwyg.getAttribute("data-note-style") ||
        wysiwyg.getAttribute(getNoteStyleAttrName());
    if (currentStyle && isNoteStyleId(currentStyle)) {
        applyNoteStyle(protyleElement, currentStyle);
    }
};

export const getNoteStylePresetDisplayName = (preset: INoteStylePreset): string => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? preset.nameZH : preset.nameEN;
};
