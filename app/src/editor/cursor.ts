import {showMessage} from "../dialog/message";
import {getSelectionPosition} from "../protyle/util/selection";
import {normalizeImportedImageDataURL} from "../appearance/imageAsset";

export type TEditorCursorPreset =
    | "bar"
    | "underline"
    | "underline-breathe"
    | "image";

export type TEditorCursorBlinkEffect =
    | "fade"
    | "pulse"
    | "glow";

export interface IEditorCursorOption {
    value: string;
    label: string;
}

export interface IEditorCursorSavedImage {
    id: string;
    name: string;
    source: string;
    createdAt: number;
}

export const DEFAULT_EDITOR_CURSOR_PRESET: TEditorCursorPreset = "bar";
export const DEFAULT_EDITOR_CURSOR_COLOR = "#ff9f1a";
export const CUSTOM_EDITOR_CURSOR_COLOR_VALUE = "__custom__";
export const EDITOR_CURSOR_IMAGE_MAX_BYTES = 1024 * 1024;
export const DEFAULT_EDITOR_CURSOR_IMAGE_WIDTH_PERCENT = 118;
export const DEFAULT_EDITOR_CURSOR_IMAGE_HEIGHT_PERCENT = 118;
export const DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_X = 0;
export const DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_Y = 0;
export const DEFAULT_EDITOR_CURSOR_BLINK = true;
export const DEFAULT_EDITOR_CURSOR_BLINK_EFFECT: TEditorCursorBlinkEffect = "fade";

const editorCursorSavedImageMaxCount = 48;
const editorCursorSupportedImagePattern = /\.(svg|png|jpe?g|gif|webp)$/i;
const editorCursorSupportedImageMimePattern = /^image\/(?:svg\+xml|png|jpe?g|gif|webp)$/i;
const editorCursorSupportedDataURLPattern = /^data:image\/(?:svg\+xml|png|jpe?g|gif|webp)(?:;[^,]*)?,/i;

const editorCursorText = (zh: string, en: string) => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? zh : en;
};

const presetOptions: Array<{value: TEditorCursorPreset, label: () => string}> = [{
    value: "bar",
    label: () => editorCursorText("竖线", "Bar"),
}, {
    value: "underline",
    label: () => editorCursorText("下划线", "Underline"),
}, {
    value: "underline-breathe",
    label: () => editorCursorText("呼吸渐变下划线", "Breathing Underline"),
}, {
    value: "image",
    label: () => editorCursorText("自定义图片", "Custom Image"),
}];

const colorOptions = [{
    value: "#ffffff",
    label: () => editorCursorText("白色", "White"),
}, {
    value: "#ff9f1a",
    label: () => editorCursorText("橙色", "Orange"),
}, {
    value: "#ff6b6b",
    label: () => editorCursorText("珊瑚红", "Coral Red"),
}, {
    value: "#ffd166",
    label: () => editorCursorText("琥珀黄", "Amber"),
}, {
    value: "#b8ff1f",
    label: () => editorCursorText("荧光绿", "Neon Green"),
}, {
    value: "#42d392",
    label: () => editorCursorText("薄荷绿", "Mint"),
}, {
    value: "#ff8fb8",
    label: () => editorCursorText("樱花粉", "Sakura Pink"),
}, {
    value: "#225cff",
    label: () => editorCursorText("宝蓝色", "Royal Blue"),
}, {
    value: "#4fc3ff",
    label: () => editorCursorText("天蓝色", "Sky Blue"),
}, {
    value: "#00c2ff",
    label: () => editorCursorText("湖蓝色", "Aqua Blue"),
}, {
    value: "#a46bff",
    label: () => editorCursorText("紫色", "Purple"),
}];

const blinkEffectOptions: Array<{value: TEditorCursorBlinkEffect, label: () => string}> = [{
    value: "fade",
    label: () => editorCursorText("淡入淡出", "Fade"),
}, {
    value: "pulse",
    label: () => editorCursorText("脉冲", "Pulse"),
}, {
    value: "glow",
    label: () => editorCursorText("辉光", "Glow"),
}];

const presetSet = new Set(presetOptions.map((item) => item.value));
const colorSet = new Set(colorOptions.map((item) => item.value));
const blinkEffectSet = new Set(blinkEffectOptions.map((item) => item.value));
const hexColorPattern = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const remoteCursorImagePattern = /^(https?:\/\/|file:\/\/)/i;

let runtimeBound = false;
let frame = 0;
let overlayElement: HTMLElement;
let blockedCursorImageSource = "";
let blockedCursorImageNoticeAt = 0;

const ensureOverlayElement = () => {
    if (overlayElement?.isConnected) {
        return overlayElement;
    }
    overlayElement = document.createElement("div");
    overlayElement.className = "editor-caret-overlay";
    overlayElement.innerHTML = `<span class="editor-caret-overlay__visual"></span><span class="editor-caret-overlay__image"></span>`;
    document.body.appendChild(overlayElement);
    return overlayElement;
};

const hideOverlay = () => {
    if (!overlayElement) {
        return;
    }
    overlayElement.classList.remove("editor-caret-overlay--visible");
    overlayElement.removeAttribute("data-preset");
    overlayElement.classList.remove(
        "editor-caret-overlay--image",
        "editor-caret-overlay--image-tint",
        "editor-caret-overlay--blink",
        "editor-caret-overlay--blink-fade",
        "editor-caret-overlay--blink-pulse",
        "editor-caret-overlay--blink-glow",
    );
};

const getSelectionHost = (range: Range) => {
    const startElement = range.startContainer.nodeType === 1
        ? range.startContainer as Element
        : range.startContainer.parentElement;
    return startElement?.closest(".protyle-wysiwyg, .protyle-title__input") as HTMLElement;
};

const getLineHeight = (host: HTMLElement, range: Range) => {
    const rects = range.getClientRects();
    const rect = rects[rects.length - 1] || range.getBoundingClientRect();
    if (rect?.height) {
        return rect.height;
    }
    const computed = getComputedStyle(host);
    const parsedLineHeight = parseFloat(computed.lineHeight);
    if (!isNaN(parsedLineHeight)) {
        return parsedLineHeight;
    }
    const parsedFontSize = parseFloat(computed.fontSize);
    return isNaN(parsedFontSize) ? 24 : parsedFontSize * 1.6;
};

export const normalizeEditorCursorImage = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) {
        return "";
    }
    if (editorCursorSupportedDataURLPattern.test(normalized)) {
        return normalized;
    }
    return remoteCursorImagePattern.test(normalized) ? normalized : "";
};

export const normalizeEditorCursorImageWidthPercent = (value: number) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return DEFAULT_EDITOR_CURSOR_IMAGE_WIDTH_PERCENT;
    }
    return Math.min(300, Math.max(40, normalized));
};

export const normalizeEditorCursorImageHeightPercent = (value: number) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return DEFAULT_EDITOR_CURSOR_IMAGE_HEIGHT_PERCENT;
    }
    return Math.min(300, Math.max(40, normalized));
};

export const normalizeEditorCursorImageOffset = (value: number) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return 0;
    }
    return Math.min(96, Math.max(-96, normalized));
};

export const isRemoteEditorCursorImage = (value: string) => {
    return /^https?:\/\//i.test(normalizeEditorCursorImage(value));
};

export const isLocalEditorCursorImage = (value: string) => {
    return normalizeEditorCursorImage(value).startsWith("data:image/");
};

export const getEditorCursorImageDisplayValue = (value: string) => {
    const normalized = normalizeEditorCursorImage(value);
    return isRemoteEditorCursorImage(normalized) || normalized.startsWith("file://") ? normalized : "";
};

export const isEditorCursorSVGImage = (value: string) => {
    const normalized = normalizeEditorCursorImage(value).toLowerCase();
    if (!normalized) {
        return false;
    }
    if (normalized.startsWith("data:image/svg+xml")) {
        return true;
    }
    if (!remoteCursorImagePattern.test(normalized)) {
        return false;
    }
    const withoutQuery = normalized.split("?")[0].split("#")[0];
    return withoutQuery.endsWith(".svg");
};

const normalizeEditorCursorImageName = (value: string, source = "") => {
    const sanitizedValue = Array.from(`${value || ""}`)
        .map((char) => {
            const code = char.charCodeAt(0);
            if (code <= 0x1f || /[\\/:*?"<>|]/.test(char)) {
                return "-";
            }
            return char;
        })
        .join("");
    const normalized = sanitizedValue
        .trim()
        .slice(0, 120);
    if (normalized) {
        return normalized;
    }
    if (remoteCursorImagePattern.test(source)) {
        try {
            const parsed = new URL(source);
            const baseName = Array.from(decodeURIComponent((parsed.pathname.split("/").pop() || "").trim()))
                .map((char) => {
                    const code = char.charCodeAt(0);
                    if (code <= 0x1f || /[\\/:*?"<>|]/.test(char)) {
                        return "-";
                    }
                    return char;
                })
                .join("")
                .trim()
                .slice(0, 120);
            if (baseName) {
                return baseName;
            }
        } catch (error) {
            console.warn(error);
        }
    }
    return "cursor-image";
};

const createEditorCursorSavedImage = (source: string, name = "", id = "", createdAt = Date.now()): IEditorCursorSavedImage | null => {
    const normalizedSource = normalizeEditorCursorImage(source);
    if (!isLocalEditorCursorImage(normalizedSource)) {
        return null;
    }
    const normalizedCreatedAt = Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now();
    return {
        id: `${id || `cursor-${normalizedCreatedAt}-${Math.random().toString(36).slice(2, 8)}`}`.trim(),
        name: normalizeEditorCursorImageName(name, normalizedSource),
        source: normalizedSource,
        createdAt: normalizedCreatedAt,
    };
};

export const normalizeEditorCursorSavedImages = (value: unknown) => {
    const ret: IEditorCursorSavedImage[] = [];
    const seenSources = new Set<string>();
    if (!Array.isArray(value)) {
        return ret;
    }
    for (const item of value) {
        if (ret.length >= editorCursorSavedImageMaxCount) {
            break;
        }
        const row = item as Record<string, unknown>;
        const savedItem = createEditorCursorSavedImage(
            `${row?.source || ""}`,
            `${row?.name || ""}`,
            `${row?.id || ""}`,
            Number(row?.createdAt || 0),
        );
        if (!savedItem || seenSources.has(savedItem.source)) {
            continue;
        }
        seenSources.add(savedItem.source);
        ret.push(savedItem);
    }
    return ret;
};

export const upsertEditorCursorSavedImage = (value: unknown, item: {
    source: string;
    name?: string;
    id?: string;
    createdAt?: number;
}) => {
    const items = normalizeEditorCursorSavedImages(value);
    const savedItem = createEditorCursorSavedImage(item.source, item.name || "", item.id || "", item.createdAt || Date.now());
    if (!savedItem) {
        return items;
    }
    const existing = items.find((current) => current.source === savedItem.source || current.id === savedItem.id);
    const nextItem = existing ? {
        ...savedItem,
        id: existing.id,
        createdAt: existing.createdAt,
    } : savedItem;
    return [nextItem, ...items.filter((current) => current.id !== nextItem.id && current.source !== nextItem.source)].slice(0, editorCursorSavedImageMaxCount);
};

export const getEditorCursorSavedImage = (value: unknown, id: string) => {
    const normalizedID = `${id || ""}`.trim();
    if (!normalizedID) {
        return null;
    }
    return normalizeEditorCursorSavedImages(value).find((item) => item.id === normalizedID) || null;
};

export const removeEditorCursorSavedImage = (value: unknown, id: string) => {
    const normalizedID = `${id || ""}`.trim();
    if (!normalizedID) {
        return normalizeEditorCursorSavedImages(value);
    }
    return normalizeEditorCursorSavedImages(value).filter((item) => item.id !== normalizedID);
};

const ensureEditorCursorAssetFile = (file: File) => {
    if (!file) {
        throw new Error(editorCursorText("请选择光标文件", "Please choose a cursor image file"));
    }
    const fileName = `${file.name || ""}`.trim();
    const fileType = `${file.type || ""}`.trim().toLowerCase();
    if (!(editorCursorSupportedImageMimePattern.test(fileType) || editorCursorSupportedImagePattern.test(fileName))) {
        throw new Error(editorCursorText("仅支持 SVG、PNG、JPG、GIF、WEBP 等图片文件", "Only SVG, PNG, JPG, GIF, WEBP, and similar image files are supported"));
    }
    if (file.size > EDITOR_CURSOR_IMAGE_MAX_BYTES) {
        throw new Error(editorCursorText("光标文件过大，最大支持 1 MB", "Cursor image is too large. The maximum supported size is 1 MB"));
    }
};

export const readEditorCursorAssetFile = (file: File) => {
    return new Promise<{dataURL: string, name: string}>((resolve, reject) => {
        try {
            ensureEditorCursorAssetFile(file);
        } catch (error) {
            reject(error);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataURL = normalizeImportedImageDataURL(`${reader.result || ""}`, file.name || "", file.type || "", "image/png");
            resolve({
                dataURL,
                name: normalizeEditorCursorImageName(file.name || "cursor-image"),
            });
        };
        reader.onerror = () => {
            reject(reader.error || new Error(editorCursorText("读取光标文件失败", "Failed to read the cursor file")));
        };
        reader.readAsDataURL(file);
    });
};

const disableCustomCursorImage = (imageSource: string, error: unknown) => {
    blockedCursorImageSource = imageSource;
    console.error("[cursor] custom image disabled", error);
    document.documentElement.setAttribute("data-editor-cursor-style", "bar");
    hideOverlay();
    const now = Date.now();
    if (now - blockedCursorImageNoticeAt < 3000) {
        return;
    }
    blockedCursorImageNoticeAt = now;
    showMessage(editorCursorText(
        "自定义光标已自动停用，不影响笔记使用。请换一张更小或更常见格式的图片。",
        "Custom cursor has been disabled automatically. Notes remain usable. Try a smaller image or a common format."
    ), 6000, "error");
};

const updateOverlay = () => {
    const preset = normalizeEditorCursorPreset(window.sourceflow?.config?.editor?.cursorPreset);
    const color = normalizeEditorCursorColor(window.sourceflow?.config?.editor?.cursorColor);
    const imageSource = normalizeEditorCursorImage(window.sourceflow?.config?.editor?.cursorImage);
    const blinkEnabled = window.sourceflow?.config?.editor?.cursorBlink !== false;
    const blinkEffect = normalizeEditorCursorBlinkEffect(window.sourceflow?.config?.editor?.cursorBlinkEffect);
    if (blockedCursorImageSource && (preset !== "image" || imageSource !== blockedCursorImageSource)) {
        blockedCursorImageSource = "";
    }
    const isBlockedImageSource = !!imageSource && imageSource === blockedCursorImageSource;
    try {
        const imageWidthPercent = normalizeEditorCursorImageWidthPercent(window.sourceflow?.config?.editor?.cursorImageWidthPercent);
        const imageHeightPercent = normalizeEditorCursorImageHeightPercent(window.sourceflow?.config?.editor?.cursorImageHeightPercent);
        const imageOffsetX = normalizeEditorCursorImageOffset(window.sourceflow?.config?.editor?.cursorImageOffsetX);
        const imageOffsetY = normalizeEditorCursorImageOffset(window.sourceflow?.config?.editor?.cursorImageOffsetY);
        const effectivePreset: TEditorCursorPreset = preset === "image" && (!imageSource || isBlockedImageSource) ? "bar" : preset;
        document.documentElement.style.setProperty("--editor-cursor-color", color);
        const requiresOverlay = effectivePreset !== "bar" || !blinkEnabled || blinkEffect !== DEFAULT_EDITOR_CURSOR_BLINK_EFFECT;
        document.documentElement.setAttribute("data-editor-cursor-style", requiresOverlay ? "custom" : "bar");
        if (!requiresOverlay) {
            hideOverlay();
            return;
        }
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
            hideOverlay();
            return;
        }
        const range = selection.getRangeAt(0);
        const host = getSelectionHost(range);
        if (!host || !host.isConnected || host.getClientRects().length === 0 || host.closest(".fn__none")) {
            hideOverlay();
            return;
        }
        const position = getSelectionPosition(host, range);
        if (!Number.isFinite(position.left) || !Number.isFinite(position.top) || (position.left === 0 && position.top === 0 && !host.contains(range.startContainer))) {
            hideOverlay();
            return;
        }
        const overlay = ensureOverlayElement();
        overlay.setAttribute("data-preset", effectivePreset);
        overlay.style.setProperty("--editor-cursor-color", color);
        overlay.style.left = `${Math.max(position.left, 0)}px`;
        overlay.style.top = `${Math.max(position.top, 0)}px`;
        overlay.style.setProperty("--editor-caret-line-height", `${Math.max(getLineHeight(host, range), 12)}px`);
        overlay.style.setProperty("--editor-caret-font-size", `${parseFloat(getComputedStyle(host).fontSize) || 16}px`);
        overlay.style.setProperty("--editor-cursor-image-width-scale", `${imageWidthPercent / 100}`);
        overlay.style.setProperty("--editor-cursor-image-height-scale", `${imageHeightPercent / 100}`);
        overlay.style.setProperty("--editor-cursor-image-offset-x", `${imageOffsetX}px`);
        overlay.style.setProperty("--editor-cursor-image-offset-y", `${imageOffsetY}px`);
        overlay.classList.toggle("editor-caret-overlay--blink", blinkEnabled);
        overlay.classList.toggle("editor-caret-overlay--blink-fade", blinkEnabled && blinkEffect === "fade");
        overlay.classList.toggle("editor-caret-overlay--blink-pulse", blinkEnabled && blinkEffect === "pulse");
        overlay.classList.toggle("editor-caret-overlay--blink-glow", blinkEnabled && blinkEffect === "glow");
        const visualElement = overlay.querySelector(".editor-caret-overlay__visual") as HTMLElement;
        const imageElement = overlay.querySelector(".editor-caret-overlay__image") as HTMLElement;
        if (visualElement) {
            visualElement.innerHTML = "";
        }
        if (imageElement) {
            imageElement.style.backgroundImage = "";
            imageElement.style.maskImage = "";
            imageElement.style.webkitMaskImage = "";
            imageElement.style.removeProperty("--editor-cursor-image");
        }
        overlay.classList.remove("editor-caret-overlay--image", "editor-caret-overlay--image-tint");
        if (effectivePreset === "image" && imageSource && imageElement) {
            const tintSVG = !!window.sourceflow?.config?.editor?.cursorImageTint && isEditorCursorSVGImage(imageSource);
            overlay.classList.add("editor-caret-overlay--image");
            overlay.classList.toggle("editor-caret-overlay--image-tint", tintSVG);
            imageElement.style.setProperty("--editor-cursor-image", `url("${imageSource.replace(/"/g, "\\\"")}")`);
            if (tintSVG) {
                imageElement.style.maskImage = `var(--editor-cursor-image)`;
                imageElement.style.webkitMaskImage = `var(--editor-cursor-image)`;
            } else {
                imageElement.style.backgroundImage = `var(--editor-cursor-image)`;
            }
        }
        overlay.classList.add("editor-caret-overlay--visible");
    } catch (error) {
        disableCustomCursorImage(imageSource, error);
    } finally {
        frame = 0;
    }
};

const scheduleOverlayUpdate = () => {
    if (frame) {
        return;
    }
    frame = window.requestAnimationFrame(updateOverlay);
};

const ensureRuntime = () => {
    if (runtimeBound) {
        return;
    }
    runtimeBound = true;
    document.addEventListener("selectionchange", scheduleOverlayUpdate);
    document.addEventListener("keydown", scheduleOverlayUpdate, true);
    document.addEventListener("keyup", scheduleOverlayUpdate, true);
    document.addEventListener("click", scheduleOverlayUpdate, true);
    document.addEventListener("mouseup", scheduleOverlayUpdate, true);
    document.addEventListener("input", scheduleOverlayUpdate, true);
    document.addEventListener("compositionstart", scheduleOverlayUpdate, true);
    document.addEventListener("compositionupdate", scheduleOverlayUpdate, true);
    document.addEventListener("compositionend", scheduleOverlayUpdate, true);
    document.addEventListener("scroll", scheduleOverlayUpdate, true);
    document.addEventListener("focusin", scheduleOverlayUpdate, true);
    document.addEventListener("focusout", () => {
        window.setTimeout(scheduleOverlayUpdate, 0);
    }, true);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            hideOverlay();
            return;
        }
        scheduleOverlayUpdate();
    });
    window.addEventListener("resize", scheduleOverlayUpdate);
    window.addEventListener("focus", scheduleOverlayUpdate);
    window.addEventListener("blur", hideOverlay);
}

export const normalizeEditorCursorPreset = (value: string) => {
    const normalized = `${value || ""}`.trim() as TEditorCursorPreset;
    return presetSet.has(normalized) ? normalized : DEFAULT_EDITOR_CURSOR_PRESET;
};

const isValidEditorCursorChannel = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) {
        return false;
    }
    if (normalized.endsWith("%")) {
        const percent = Number(normalized.slice(0, -1));
        return Number.isFinite(percent) && percent >= 0 && percent <= 100;
    }
    const channel = Number(normalized);
    return Number.isFinite(channel) && channel >= 0 && channel <= 255;
};

const isValidEditorCursorAlpha = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) {
        return false;
    }
    if (normalized.endsWith("%")) {
        const percent = Number(normalized.slice(0, -1));
        return Number.isFinite(percent) && percent >= 0 && percent <= 100;
    }
    const alpha = Number(normalized);
    return Number.isFinite(alpha) && alpha >= 0 && alpha <= 1;
};

const isValidEditorCursorRGBColor = (value: string) => {
    const normalized = `${value || ""}`.trim();
    const match = normalized.match(/^(rgba?)\((.*)\)$/i);
    if (!match) {
        return false;
    }
    const fn = match[1].toLowerCase();
    const parts = match[2].split(",").map((item) => item.trim()).filter(Boolean);
    if (fn === "rgb" && parts.length !== 3) {
        return false;
    }
    if (fn === "rgba" && parts.length !== 4) {
        return false;
    }
    if (!parts.slice(0, 3).every(isValidEditorCursorChannel)) {
        return false;
    }
    return fn !== "rgba" || isValidEditorCursorAlpha(parts[3]);
};

export const isEditorCursorPresetColor = (value: string) => {
    return colorSet.has(`${value || ""}`.trim().toLowerCase());
};

export const isValidEditorCursorColor = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) {
        return false;
    }
    return isEditorCursorPresetColor(normalized) || hexColorPattern.test(normalized) || isValidEditorCursorRGBColor(normalized);
};

export const normalizeEditorCursorColor = (value: string) => {
    const normalized = `${value || ""}`.trim();
    const lowerCase = normalized.toLowerCase();
    if (colorSet.has(lowerCase)) {
        return lowerCase;
    }
    if (hexColorPattern.test(normalized)) {
        return normalized.startsWith("#") ? lowerCase : `#${lowerCase}`;
    }
    if (isValidEditorCursorRGBColor(normalized)) {
        return normalized;
    }
    return DEFAULT_EDITOR_CURSOR_COLOR;
};

export const getEditorCursorColorSelectValue = (value: string) => {
    const normalized = normalizeEditorCursorColor(value);
    return isEditorCursorPresetColor(normalized) ? normalized : CUSTOM_EDITOR_CURSOR_COLOR_VALUE;
};

export const getEditorCursorPresetOptions = (): IEditorCursorOption[] => {
    return presetOptions.map((item) => ({
        value: item.value,
        label: item.label(),
    }));
};

export const getEditorCursorColorOptions = (): IEditorCursorOption[] => {
    return colorOptions.map((item) => ({
        value: item.value,
        label: item.label(),
    })).concat([{
        value: CUSTOM_EDITOR_CURSOR_COLOR_VALUE,
        label: editorCursorText("自定义", "Custom"),
    }]);
};

export const normalizeEditorCursorBlinkEffect = (value: string) => {
    const normalized = `${value || ""}`.trim().toLowerCase() as TEditorCursorBlinkEffect;
    return blinkEffectSet.has(normalized) ? normalized : DEFAULT_EDITOR_CURSOR_BLINK_EFFECT;
};

export const shouldUseCustomEditorCursorOverlay = (editor = window.sourceflow?.config?.editor) => {
    const preset = normalizeEditorCursorPreset(editor?.cursorPreset);
    const imageSource = normalizeEditorCursorImage(editor?.cursorImage);
    const effectivePreset: TEditorCursorPreset = preset === "image" && !imageSource ? "bar" : preset;
    if (effectivePreset !== "bar") {
        return true;
    }
    if (editor?.cursorBlink === false) {
        return true;
    }
    return normalizeEditorCursorBlinkEffect(editor?.cursorBlinkEffect) !== DEFAULT_EDITOR_CURSOR_BLINK_EFFECT;
};

export const getEditorCursorBlinkEffectOptions = (): IEditorCursorOption[] => {
    return blinkEffectOptions.map((item) => ({
        value: item.value,
        label: item.label(),
    }));
};

export const getEditorCursorSettingTexts = () => ({
    title: editorCursorText("光标", "Cursor"),
    detail: editorCursorText("切换编辑光标样式与颜色。竖线、下划线、呼吸渐变下划线都支持改色；图片光标支持 svg/png/jpg/gif/webp，其中仅 SVG 可跟随当前颜色着色，其它格式保持原图。远程图片还可以保存到本地光标库。", "Switch the editor caret style and color. Bar, underline, and breathing underline presets all support color changes. Image cursors support svg/png/jpg/gif/webp, and only SVG images can follow the selected color while other formats keep their original pixels. Remote images can also be saved into a local cursor library."),
    preset: editorCursorText("样式", "Preset"),
    color: editorCursorText("颜色", "Color"),
    blink: editorCursorText("闪烁", "Blink"),
    blinkHint: editorCursorText("关闭后光标保持常亮；开启后可选择不同闪烁特效。", "Turn it off to keep the caret steady, or turn it on to choose a blink effect."),
    blinkEffect: editorCursorText("闪烁特效", "Blink effect"),
    blinkEffectHint: editorCursorText("不同特效只影响显示方式，不影响输入。", "Different effects only change how the caret is rendered and do not affect typing."),
    customColor: editorCursorText("自定义颜色", "Custom color"),
    customColorHint: editorCursorText("输入 #hex、rgb(...) 或 rgba(...)，例如 rgb(255, 120, 64)。", "Enter #hex, rgb(...), or rgba(...), for example rgb(255, 120, 64)."),
    imageSource: editorCursorText("图片来源", "Image source"),
    imageSourceHint: editorCursorText("支持远程链接，或通过下方按钮导入本地 svg/png/jpg/gif/webp。当前使用本地图片时，这里不会显示 data URL。", "Supports remote URLs, or import a local svg/png/jpg/gif/webp file using the button below. When the active cursor uses a local image, the raw data URL is hidden here."),
    imageTint: editorCursorText("SVG 着色", "SVG tint"),
    imageTintHint: editorCursorText("仅对 SVG 光标生效，开启后会使用当前光标颜色着色。", "Only applies to SVG cursors. When enabled, the current cursor color is used as the tint."),
    imageSize: editorCursorText("图片尺寸", "Image size"),
    imageSizeHint: editorCursorText("宽高按当前编辑字号的百分比缩放，默认 118%。", "Width and height scale as a percentage of the current editor font size. The default is 118%."),
    imageWidth: editorCursorText("宽度（% 字号）", "Width (% font size)"),
    imageHeight: editorCursorText("高度（% 字号）", "Height (% font size)"),
    imagePercentUnit: editorCursorText("% 字号", "% font size"),
    imagePosition: editorCursorText("图片位置", "Image position"),
    imagePositionHint: editorCursorText("水平和垂直偏移基于默认光标位置计算，正数向右/向下，负数向左/向上。", "Horizontal and vertical offsets are applied relative to the default cursor position. Positive values move right/down; negative values move left/up."),
    imageOffsetX: editorCursorText("左右偏移（px）", "Horizontal offset (px)"),
    imageOffsetY: editorCursorText("上下偏移（px）", "Vertical offset (px)"),
    imageOffsetUnit: editorCursorText("px", "px"),
    resetImageTransform: editorCursorText("恢复默认大小和位置", "Reset Default Size & Position"),
    imageFile: editorCursorText("本地文件", "Local file"),
    imageFileHint: editorCursorText("已导入的本地文件会保存为内嵌数据，不依赖原始文件路径。单张最大 1 MB，超出会直接提示。", "Imported local files are stored as embedded data and do not depend on the original file path. Each image can be up to 1 MB; oversized files are rejected with a prompt."),
    preview: editorCursorText("预览", "Preview"),
    previewHint: editorCursorText("这里显示固定尺寸的光标预览，不再按原图尺寸铺开。", "A fixed-size cursor preview is shown here instead of expanding to the source image size."),
    previewEmpty: editorCursorText("当前未设置图片光标。", "No custom cursor image is configured."),
    uploadImage: editorCursorText("导入本地文件", "Import local file"),
    saveImageToLibrary: editorCursorText("保存到本地库", "Save to Local Library"),
    clearImage: editorCursorText("清除图片", "Clear image"),
    imageActiveNone: editorCursorText("当前未设置图片光标。", "No custom cursor image is configured."),
    imageActiveLabel: editorCursorText("当前图片", "Current image"),
    imageLibrary: editorCursorText("本地光标库", "Local Cursor Library"),
    imageLibraryHint: editorCursorText("已保存的本地光标可随时应用或删除。远程地址保存后会转成本地数据，不再依赖原链接。", "Saved local cursors can be applied or deleted at any time. Remote URLs are converted into local data when saved, so they no longer depend on the original link."),
    imageLibraryEmpty: editorCursorText("还没有保存任何本地光标。", "No local cursor has been saved yet."),
    applyLibraryImage: editorCursorText("使用", "Use"),
    deleteLibraryImage: editorCursorText("删除", "Delete"),
    currentLibraryImage: editorCursorText("当前使用", "In use"),
    saveLibrarySuccess: editorCursorText("已保存到本地光标库", "Saved to the local cursor library"),
    deleteLibrarySuccess: editorCursorText("已删除本地光标", "Removed the local cursor"),
    savingRemoteImage: editorCursorText("正在保存远程光标...", "Saving the remote cursor..."),
    invalidLibrarySource: editorCursorText("请先填写远程地址或选择一个本地图片光标", "Enter a remote URL or select a local image cursor first"),
    invalidRemoteImage: editorCursorText("仅支持保存 http/https 远程图片地址", "Only http/https remote image URLs can be saved"),
    resetImageTransformSuccess: editorCursorText("已恢复默认光标大小和位置", "Reset the cursor size and position to defaults"),
});

export const downloadRemoteEditorCursorImage = async (value: string) => {
    const normalized = normalizeEditorCursorImage(value);
    if (!isRemoteEditorCursorImage(normalized)) {
        throw new Error(getEditorCursorSettingTexts().invalidRemoteImage);
    }
    const response = await fetch("/api/setting/downloadEditorCursorImage", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({url: normalized}),
    });
    const result = await response.json() as IWebSocketData;
    if (!result || typeof result !== "object" || result.code !== 0) {
        throw new Error(result?.msg || editorCursorText("保存远程光标失败", "Failed to save the remote cursor"));
    }
    const data = result.data as {name?: string; dataURL?: string} | null;
    const dataURL = normalizeEditorCursorImage(`${data?.dataURL || ""}`);
    if (!isLocalEditorCursorImage(dataURL)) {
        throw new Error(editorCursorText("远程光标下载结果无效", "The downloaded remote cursor is invalid"));
    }
    return {
        dataURL,
        name: normalizeEditorCursorImageName(`${data?.name || ""}`, normalized),
    };
};

export const applyEditorCursor = () => {
    ensureRuntime();
    scheduleOverlayUpdate();
};
