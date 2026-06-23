import {getRenderableImageURL, normalizeImportedImageDataURL} from "../appearance/imageAsset";

const appearanceText = (zh: string, en: string) => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? zh : en;
};

export const DEFAULT_EDITOR_NOTE_BACKGROUND_IMAGE = "";
export const DEFAULT_EDITOR_NOTE_BACKGROUND_OPACITY = 28;
export const DEFAULT_EDITOR_NOTE_BACKGROUND_BLUR = 0;
export const EDITOR_NOTE_BACKGROUND_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const noteBackgroundSupportedImagePattern = /\.(svg|png|jpe?g|gif|webp)$/i;
const noteBackgroundSupportedImageMimePattern = /^image\/(?:svg\+xml|png|jpe?g|gif|webp)$/i;
const noteBackgroundSupportedDataURLPattern = /^data:image\/(?:svg\+xml|png|jpe?g|gif|webp)(?:;[^,]*)?,/i;
const remoteNoteBackgroundImagePattern = /^(https?:\/\/|file:\/\/)/i;
const noteBackgroundLayerClass = "editor-note-background-layer";
const noteBackgroundImageClass = "editor-note-background-layer__image";
let noteBackgroundRuntimeBound = false;
let noteBackgroundFrame = 0;
let noteBackgroundObserver: MutationObserver;

export const normalizeEditorNoteBackgroundImage = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) {
        return "";
    }
    if (noteBackgroundSupportedDataURLPattern.test(normalized)) {
        return normalized;
    }
    return remoteNoteBackgroundImagePattern.test(normalized) ? normalized : "";
};

export const normalizeEditorNoteBackgroundOpacity = (value: number) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return DEFAULT_EDITOR_NOTE_BACKGROUND_OPACITY;
    }
    return Math.min(100, Math.max(0, normalized));
};

export const normalizeEditorNoteBackgroundBlur = (value: number) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return DEFAULT_EDITOR_NOTE_BACKGROUND_BLUR;
    }
    return Math.min(32, Math.max(0, normalized));
};

export const getEditorNoteBackgroundDisplayValue = (value: string) => {
    const normalized = normalizeEditorNoteBackgroundImage(value);
    return remoteNoteBackgroundImagePattern.test(normalized) ? normalized : "";
};

export const isLocalEditorNoteBackgroundImage = (value: string) => {
    return normalizeEditorNoteBackgroundImage(value).startsWith("data:image/");
};

export const readEditorNoteBackgroundAssetFile = (file: File) => {
    return new Promise<{dataURL: string}>((resolve, reject) => {
        if (!file) {
            reject(new Error(appearanceText("请选择背景图文件", "Please choose a background image file")));
            return;
        }
        const fileName = `${file.name || ""}`.trim();
        const fileType = `${file.type || ""}`.trim().toLowerCase();
        if (!(noteBackgroundSupportedImageMimePattern.test(fileType) || noteBackgroundSupportedImagePattern.test(fileName))) {
            reject(new Error(appearanceText("仅支持 SVG、PNG、JPG、GIF、WEBP 等图片文件", "Only SVG, PNG, JPG, GIF, WEBP, and similar image files are supported")));
            return;
        }
        if (file.size > EDITOR_NOTE_BACKGROUND_IMAGE_MAX_BYTES) {
            reject(new Error(appearanceText("背景图文件过大，最大支持 8 MB", "Background image is too large. The maximum supported size is 8 MB")));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataURL = normalizeImportedImageDataURL(`${reader.result || ""}`, file.name || "", file.type || "", "image/png");
            resolve({
                dataURL,
            });
        };
        reader.onerror = () => {
            reject(reader.error || new Error(appearanceText("读取背景图文件失败", "Failed to read the background image file")));
        };
        reader.readAsDataURL(file);
    });
};

export const getEditorNoteBackgroundSettingTexts = () => ({
    title: appearanceText("笔记背景图", "Note Background"),
    detail: appearanceText("为笔记编辑区设置背景图，并控制透明度和模糊度。支持远程地址或本地导入；本地图片会保存为内嵌数据，不依赖原始文件路径。", "Set a background image for the note editor and control its opacity and blur. Remote URLs and local imports are supported; local files are stored as embedded data and do not depend on the original file path."),
    source: appearanceText("背景图来源", "Background source"),
    sourceHint: appearanceText("支持远程链接，或通过下方按钮导入本地 svg/png/jpg/gif/webp。当前使用本地图片时，这里不会显示 data URL。", "Supports remote URLs, or import a local svg/png/jpg/gif/webp file using the button below. When the active background uses a local image, the raw data URL is hidden here."),
    uploadImage: appearanceText("导入本地文件", "Import local file"),
    clearImage: appearanceText("清除背景图", "Clear background"),
    localFileHint: appearanceText("单张最大 8 MB，超过会明确提示。", "Each image can be up to 8 MB; oversized files are rejected with a prompt."),
    preview: appearanceText("预览", "Preview"),
    previewEmpty: appearanceText("当前未设置背景图。", "No background image is configured."),
    opacity: appearanceText("透明度", "Opacity"),
    opacityHint: appearanceText("范围 0-100，数值越大背景越明显。", "Range 0-100. Larger values make the background more visible."),
    blur: appearanceText("模糊度", "Blur"),
    blurHint: appearanceText("范围 0-32 px，用于弱化背景细节，避免干扰编辑。", "Range 0-32 px. Use it to soften background details and reduce distraction while editing."),
});

const removeEditorNoteBackgroundLayers = () => {
    document.querySelectorAll(`.${noteBackgroundLayerClass}`).forEach((item) => item.remove());
};

const getEditorNoteBackgroundRuntimeURL = (value: string) => {
    const normalized = normalizeEditorNoteBackgroundImage(value);
    return isLocalEditorNoteBackgroundImage(normalized) ? normalized : getRenderableImageURL(normalized);
};

const ensureEditorNoteBackgroundLayer = (container: HTMLElement) => {
    let layer = container.querySelector(`:scope > .${noteBackgroundLayerClass}`) as HTMLDivElement;
    if (!layer) {
        layer = document.createElement("div");
        layer.className = noteBackgroundLayerClass;
        const image = document.createElement("img");
        image.className = noteBackgroundImageClass;
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        image.draggable = false;
        layer.appendChild(image);
        container.insertBefore(layer, container.firstChild);
    }
    return {
        layer,
        image: layer.querySelector(`.${noteBackgroundImageClass}`) as HTMLImageElement,
    };
};

const syncEditorNoteBackgroundLayers = () => {
    const imageSource = normalizeEditorNoteBackgroundImage(window.sourceflow?.config?.editor?.noteBackgroundImage || "");
    const opacity = normalizeEditorNoteBackgroundOpacity(window.sourceflow?.config?.editor?.noteBackgroundOpacity);
    const blur = normalizeEditorNoteBackgroundBlur(window.sourceflow?.config?.editor?.noteBackgroundBlur);
    document.documentElement.setAttribute("data-editor-note-background", imageSource ? "on" : "off");
    if (!imageSource) {
        removeEditorNoteBackgroundLayers();
        noteBackgroundFrame = 0;
        return;
    }
    document.querySelectorAll(".protyle-content").forEach((item) => {
        const container = item as HTMLElement;
        const {layer, image} = ensureEditorNoteBackgroundLayer(container);
        layer.style.opacity = `${opacity / 100}`;
        layer.style.setProperty("--editor-note-background-width", `${container.clientWidth}px`);
        layer.style.setProperty("--editor-note-background-height", `${container.clientHeight}px`);
        image.style.filter = `blur(${blur}px)`;
        image.style.transform = `scale(${1 + blur / 60})`;
        if (image.dataset.sourceValue !== imageSource) {
            image.dataset.sourceValue = imageSource;
            image.src = getEditorNoteBackgroundRuntimeURL(imageSource);
        }
    });
    noteBackgroundFrame = 0;
};

const scheduleEditorNoteBackgroundSync = () => {
    if (noteBackgroundFrame) {
        return;
    }
    noteBackgroundFrame = window.requestAnimationFrame(syncEditorNoteBackgroundLayers);
};

const ensureEditorNoteBackgroundRuntime = () => {
    if (noteBackgroundRuntimeBound) {
        return;
    }
    noteBackgroundRuntimeBound = true;
    noteBackgroundObserver = new MutationObserver(() => {
        scheduleEditorNoteBackgroundSync();
    });
    noteBackgroundObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
    window.addEventListener("resize", scheduleEditorNoteBackgroundSync);
};

export const applyEditorNoteBackground = () => {
    ensureEditorNoteBackgroundRuntime();
    scheduleEditorNoteBackgroundSync();
};
