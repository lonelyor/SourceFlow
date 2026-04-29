/// #if !BROWSER
import * as path from "path";
/// #endif
import {Constants} from "../constants";
import {exportLayout, resetLayout} from "../layout/util";
import {isBrowser} from "../util/functions";
import {fetchPost} from "../util/fetch";
import {genLangOptions, genOptions} from "../util/genOptions";
import {openSnippets} from "./util/snippets";
import {loadAssets, setInlineStyle} from "../util/assets";
import {resetFloatDockSize} from "../layout/dock/util";
import {confirmDialog} from "../dialog/confirmDialog";
import {showMessage} from "../dialog/message";
import {useShell} from "../util/pathName";
import {setStatusBar} from "./util/setStatusBar";
import {
    CUSTOM_EDITOR_CURSOR_COLOR_VALUE,
    DEFAULT_EDITOR_CURSOR_BLINK,
    DEFAULT_EDITOR_CURSOR_BLINK_EFFECT,
    DEFAULT_EDITOR_CURSOR_IMAGE_HEIGHT_PERCENT,
    DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_X,
    DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_Y,
    DEFAULT_EDITOR_CURSOR_IMAGE_WIDTH_PERCENT,
    downloadRemoteEditorCursorImage,
    getEditorCursorBlinkEffectOptions,
    getEditorCursorImageDisplayValue,
    getEditorCursorColorOptions,
    getEditorCursorColorSelectValue,
    getEditorCursorPresetOptions,
    getEditorCursorSavedImage,
    getEditorCursorSettingTexts,
    isEditorCursorSVGImage,
    normalizeEditorCursorBlinkEffect,
    normalizeEditorCursorImageHeightPercent,
    normalizeEditorCursorColor,
    normalizeEditorCursorImage,
    normalizeEditorCursorImageOffset,
    normalizeEditorCursorImageWidthPercent,
    normalizeEditorCursorSavedImages,
    readEditorCursorAssetFile,
    removeEditorCursorSavedImage,
    upsertEditorCursorSavedImage,
} from "../editor/cursor";
import {
    DEFAULT_EDITOR_NOTE_BACKGROUND_BLUR,
    DEFAULT_EDITOR_NOTE_BACKGROUND_OPACITY,
    getEditorNoteBackgroundDisplayValue,
    getEditorNoteBackgroundSettingTexts,
    normalizeEditorNoteBackgroundBlur,
    normalizeEditorNoteBackgroundImage,
    normalizeEditorNoteBackgroundOpacity,
    readEditorNoteBackgroundAssetFile
} from "../editor/noteBackground";
import {
    getEditorHiddenBlockSettingTexts,
    normalizeEditorHiddenBlockColor
} from "../editor/hiddenBlock";
import {
    DEFAULT_STARTUP_PAGE_IMAGE,
    DEFAULT_STARTUP_PAGE_BLUR,
    DEFAULT_STARTUP_PAGE_OPACITY,
    getStartupPageDisplayValue,
    getStartupPageSettingTexts,
    normalizeStartupPageBlur,
    normalizeStartupPageImage,
    normalizeStartupPageOpacity,
    readStartupPageAssetFile
} from "../appearance/startupPage";
import {
    applyMascotWidget,
    DEFAULT_MASCOT_EFFECT,
    DEFAULT_MASCOT_OPACITY,
    DEFAULT_MASCOT_SCALE,
    getMascotDisplayValue,
    getMascotEffectOptions,
    getMascotPositionOptions,
    getMascotSettingTexts,
    normalizeMascotEffect,
    normalizeMascotEnabled,
    normalizeMascotImage,
    normalizeMascotOpacity,
    normalizeMascotPosition,
    normalizeMascotScale,
    readMascotAssetFile
} from "../appearance/mascot";
import {
    getCodeBlockSkinOptions,
    getCodeBlockSkinSettingTexts,
    normalizeCodeBlockSkin
} from "../appearance/codeBlockSkin";
import {createImageFileFromDataURL, getRenderableImageURL, pickDesktopImageAssetFile} from "../appearance/imageAsset";
import {escapeAttr, escapeHtml} from "../util/escape";
import {appearance} from "./appearanceRuntime";


export const escapeCSSURL = (value: string) => {
    return `${value || ""}`.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
};

export const escapeCSSURLAttr = (value: string) => {
    return escapeAttr(escapeCSSURL(value));
};

export const getAppearancePreviewImageURL = (value: string) => {
    const normalized = `${value || ""}`.trim();
    return normalized.startsWith("data:image/") ? normalized : getRenderableImageURL(normalized);
};

export const getCursorColorPickerValue = (value: string) => {
    const normalized = normalizeEditorCursorColor(value);
    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
        return normalized.toLowerCase();
    }
    if (/^#[0-9a-f]{3}$/i.test(normalized)) {
        return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toLowerCase();
    }
    if (/^#[0-9a-f]{8}$/i.test(normalized)) {
        return normalized.slice(0, 7).toLowerCase();
    }
    return normalizeEditorCursorColor("");
};

export const getCursorColorValue = (root: Element) => {
    const customValue = (root.querySelector("#cursorColorCustom") as HTMLInputElement)?.value || "";
    return normalizeEditorCursorColor(customValue);
};

export const shouldKeepCursorCustomSelection = (root: Element) => {
    return (root.querySelector("#cursorColor") as HTMLSelectElement)?.dataset.forceCustom === "true";
};

export const getCursorImageInput = (root: Element) => {
    return root.querySelector("#cursorImage") as HTMLInputElement;
};

export const setCursorImageInputValue = (root: Element, value: string) => {
    const input = getCursorImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeEditorCursorImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getEditorCursorImageDisplayValue(normalized);
};

export const getCursorImageValue = (root: Element) => {
    const input = getCursorImageInput(root);
    return normalizeEditorCursorImage(input?.dataset.sourceValue || input?.value || "");
};

export const getCursorSavedImages = () => {
    return normalizeEditorCursorSavedImages(window.sourceflow.config.editor.cursorSavedImages);
};

export const getCursorImageWidthPercentValue = (root: Element) => {
    return normalizeEditorCursorImageWidthPercent(Number((root.querySelector("#cursorImageWidthPercent") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_WIDTH_PERCENT));
};

export const getCursorImageHeightPercentValue = (root: Element) => {
    return normalizeEditorCursorImageHeightPercent(Number((root.querySelector("#cursorImageHeightPercent") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_HEIGHT_PERCENT));
};

export const getCursorImageOffsetXValue = (root: Element) => {
    return normalizeEditorCursorImageOffset(Number((root.querySelector("#cursorImageOffsetX") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_X));
};

export const getCursorImageOffsetYValue = (root: Element) => {
    return normalizeEditorCursorImageOffset(Number((root.querySelector("#cursorImageOffsetY") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_Y));
};

export const getHiddenBlockColorValue = (root: Element) => {
    return normalizeEditorHiddenBlockColor((root.querySelector("#hiddenBlockColor") as HTMLInputElement)?.value || "");
};

export const getNoteBackgroundImageInput = (root: Element) => {
    return root.querySelector("#noteBackgroundImage") as HTMLInputElement;
};

export const setNoteBackgroundImageInputValue = (root: Element, value: string) => {
    const input = getNoteBackgroundImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeEditorNoteBackgroundImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getEditorNoteBackgroundDisplayValue(normalized);
};

export const getNoteBackgroundImageValue = (root: Element) => {
    const input = getNoteBackgroundImageInput(root);
    return normalizeEditorNoteBackgroundImage(input?.dataset.sourceValue || input?.value || "");
};

export const getNoteBackgroundOpacityValue = (root: Element) => {
    return normalizeEditorNoteBackgroundOpacity(Number((root.querySelector("#noteBackgroundOpacity") as HTMLInputElement)?.value || DEFAULT_EDITOR_NOTE_BACKGROUND_OPACITY));
};

export const getNoteBackgroundBlurValue = (root: Element) => {
    return normalizeEditorNoteBackgroundBlur(Number((root.querySelector("#noteBackgroundBlur") as HTMLInputElement)?.value || DEFAULT_EDITOR_NOTE_BACKGROUND_BLUR));
};

export const getStartupPageImageInput = (root: Element) => {
    return root.querySelector("#startupPageImage") as HTMLInputElement;
};

export const setStartupPageImageInputValue = (root: Element, value: string) => {
    const input = getStartupPageImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeStartupPageImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getStartupPageDisplayValue(normalized);
};

export const getStartupPageImageValue = (root: Element) => {
    const input = getStartupPageImageInput(root);
    return normalizeStartupPageImage(input?.dataset.sourceValue || input?.value || "");
};

export const getStartupPageOpacityValue = (root: Element) => {
    return normalizeStartupPageOpacity(Number((root.querySelector("#startupPageOpacity") as HTMLInputElement)?.value || DEFAULT_STARTUP_PAGE_OPACITY));
};

export const getStartupPageBlurValue = (root: Element) => {
    return normalizeStartupPageBlur(Number((root.querySelector("#startupPageBlur") as HTMLInputElement)?.value || DEFAULT_STARTUP_PAGE_BLUR));
};

export const getMascotImageInput = (root: Element) => {
    return root.querySelector("#mascotImage") as HTMLInputElement;
};

export const setMascotImageInputValue = (root: Element, value: string) => {
    const input = getMascotImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeMascotImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getMascotDisplayValue(normalized);
};

export const getMascotImageValue = (root: Element) => {
    const input = getMascotImageInput(root);
    return normalizeMascotImage(input?.dataset.sourceValue || input?.value || "");
};

export const getMascotEnabledValue = (root: Element) => {
    return normalizeMascotEnabled((root.querySelector("#mascotEnabled") as HTMLInputElement)?.checked);
};

export const getMascotPositionValue = (root: Element) => {
    return normalizeMascotPosition((root.querySelector("#mascotPosition") as HTMLSelectElement)?.value || "");
};

export const getMascotEffectValue = (root: Element) => {
    return normalizeMascotEffect((root.querySelector("#mascotEffect") as HTMLSelectElement)?.value || DEFAULT_MASCOT_EFFECT);
};

export const getMascotOpacityValue = (root: Element) => {
    return normalizeMascotOpacity(Number((root.querySelector("#mascotOpacity") as HTMLInputElement)?.value || DEFAULT_MASCOT_OPACITY));
};

export const getMascotScaleValue = (root: Element) => {
    return normalizeMascotScale(Number((root.querySelector("#mascotScale") as HTMLInputElement)?.value || DEFAULT_MASCOT_SCALE));
};

export const getNoteBackgroundState = (root: Element, overrides?: Partial<Config.IEditor>) => ({
    noteBackgroundImage: overrides?.noteBackgroundImage !== undefined
        ? normalizeEditorNoteBackgroundImage(`${overrides.noteBackgroundImage || ""}`)
        : getNoteBackgroundImageValue(root),
    noteBackgroundOpacity: overrides?.noteBackgroundOpacity ?? getNoteBackgroundOpacityValue(root),
    noteBackgroundBlur: overrides?.noteBackgroundBlur ?? getNoteBackgroundBlurValue(root),
});

export const applyNoteBackgroundState = (root: Element, overrides?: Partial<Config.IEditor>, persist = false) => {
    const nextState = getNoteBackgroundState(root, overrides);
    setNoteBackgroundImageInputValue(root, nextState.noteBackgroundImage);
    const opacityInput = root.querySelector("#noteBackgroundOpacity") as HTMLInputElement;
    const blurInput = root.querySelector("#noteBackgroundBlur") as HTMLInputElement;
    if (opacityInput) {
        opacityInput.value = `${nextState.noteBackgroundOpacity}`;
    }
    if (blurInput) {
        blurInput.value = `${nextState.noteBackgroundBlur}`;
    }
    Object.assign(window.sourceflow.config.editor, nextState);
    syncNoteBackgroundControls(root);
    setInlineStyle();
    if (persist) {
        appearance._sendEditorVisual(nextState);
    }
    return nextState;
};

export const getMascotState = (root: Element, overrides?: Partial<Config.IAppearance>) => {
    const mascotImage = overrides?.mascotImage !== undefined
        ? normalizeMascotImage(`${overrides.mascotImage || ""}`)
        : getMascotImageValue(root);
    const mascotEnabled = mascotImage
        ? (overrides?.mascotEnabled !== undefined
            ? normalizeMascotEnabled(!!overrides.mascotEnabled)
            : getMascotEnabledValue(root))
        : false;
    return {
        mascotEnabled,
        mascotImage,
        mascotPosition: overrides?.mascotPosition !== undefined
            ? normalizeMascotPosition(`${overrides.mascotPosition || ""}`)
            : getMascotPositionValue(root),
        mascotEffect: overrides?.mascotEffect !== undefined
            ? normalizeMascotEffect(`${overrides.mascotEffect || ""}`)
            : getMascotEffectValue(root),
        mascotOpacity: overrides?.mascotOpacity ?? getMascotOpacityValue(root),
        mascotScale: overrides?.mascotScale ?? getMascotScaleValue(root),
    };
};

export const applyMascotState = (root: Element, overrides?: Partial<Config.IAppearance>, persist = false) => {
    const nextState = getMascotState(root, overrides);
    setMascotImageInputValue(root, nextState.mascotImage);
    const enabledInput = root.querySelector("#mascotEnabled") as HTMLInputElement;
    const positionSelect = root.querySelector("#mascotPosition") as HTMLSelectElement;
    const effectSelect = root.querySelector("#mascotEffect") as HTMLSelectElement;
    const opacityInput = root.querySelector("#mascotOpacity") as HTMLInputElement;
    const scaleInput = root.querySelector("#mascotScale") as HTMLInputElement;
    if (enabledInput) {
        enabledInput.checked = nextState.mascotEnabled;
    }
    if (positionSelect) {
        positionSelect.value = nextState.mascotPosition;
    }
    if (effectSelect) {
        effectSelect.value = nextState.mascotEffect;
    }
    if (opacityInput) {
        opacityInput.value = `${nextState.mascotOpacity}`;
    }
    if (scaleInput) {
        scaleInput.value = `${nextState.mascotScale}`;
    }
    Object.assign(window.sourceflow.config.appearance, nextState);
    syncMascotControls(root);
    applyMascotWidget(window.sourceflow.config.appearance);
    if (persist) {
        appearance._send();
    }
    return nextState;
};

export const importDesktopAppearanceImageFile = async () => {
    if (isBrowser()) {
        return null;
    }
    const picked = await pickDesktopImageAssetFile();
    if (!picked) {
        return null;
    }
    const file = createImageFileFromDataURL(picked.dataURL, picked.fileName);
    if (!file) {
        throw new Error(window.sourceflow.config.lang === "zh_CN" ? "读取本地图片失败" : "Failed to read the local image");
    }
    return file;
};

export const applyImportedNoteBackgroundFile = async (root: Element) => {
    const file = await importDesktopAppearanceImageFile();
    if (!file) {
        return false;
    }
    const result = await readEditorNoteBackgroundAssetFile(file);
    applyNoteBackgroundState(root, {
        noteBackgroundImage: result.dataURL,
    }, true);
    return true;
};

export const applyImportedStartupPageFile = async (root: Element) => {
    const file = await importDesktopAppearanceImageFile();
    if (!file) {
        return false;
    }
    const result = await readStartupPageAssetFile(file);
    setStartupPageImageInputValue(root, result.dataURL);
    syncStartupPageControls(root);
    appearance._send();
    return true;
};

export const applyImportedMascotFile = async (root: Element) => {
    const file = await importDesktopAppearanceImageFile();
    if (!file) {
        return false;
    }
    const result = await readMascotAssetFile(file);
    applyMascotState(root, {
        mascotImage: result.dataURL,
        mascotEnabled: true,
    }, true);
    return true;
};

export const renderCursorImagePreview = (root: Element) => {
    const previewElement = root.querySelector("#cursorImagePreview") as HTMLElement;
    if (!previewElement) {
        return;
    }
    const texts = getEditorCursorSettingTexts();
    const imageValue = getCursorImageValue(root);
    if (!imageValue) {
        previewElement.innerHTML = `<div class="b3-label__text" style="padding:0 10px;text-align:center;">${escapeHtml(texts.previewEmpty)}</div>`;
        return;
    }
    const tintSVG = !!(root.querySelector("#cursorImageTint") as HTMLInputElement)?.checked && isEditorCursorSVGImage(imageValue);
    const color = getCursorColorValue(root);
    if (tintSVG) {
        previewElement.innerHTML = `<span style="width:72px;height:72px;display:block;background:${escapeAttr(color)};mask-image:url(&quot;${escapeCSSURLAttr(imageValue)}&quot;);mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-image:url(&quot;${escapeCSSURLAttr(imageValue)}&quot;);-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain;"></span>`;
        return;
    }
    previewElement.innerHTML = `<img src="${escapeAttr(imageValue)}" alt="${escapeAttr(window.sourceflow.config.editor.cursorImageName || "cursor-image")}" style="max-width:72px;max-height:72px;object-fit:contain;display:block;">`;
};

export const renderNoteBackgroundPreview = (root: Element) => {
    const previewElement = root.querySelector("#noteBackgroundPreview") as HTMLElement;
    if (!previewElement) {
        return;
    }
    const texts = getEditorNoteBackgroundSettingTexts();
    const imageValue = getNoteBackgroundImageValue(root);
    if (!imageValue) {
        previewElement.innerHTML = `<div class="b3-label__text" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 12px;text-align:center;">${escapeHtml(texts.previewEmpty)}</div>`;
        return;
    }
    previewElement.innerHTML = `<div style="position:absolute;inset:0;background-color:transparent;"></div>`;
    const layer = document.createElement("img");
    layer.alt = "";
    layer.setAttribute("aria-hidden", "true");
    layer.draggable = false;
    layer.style.position = "absolute";
    layer.style.left = "-24px";
    layer.style.top = "-24px";
    layer.style.width = "calc(100% + 48px)";
    layer.style.height = "calc(100% + 48px)";
    layer.style.objectFit = "cover";
    layer.style.objectPosition = "center";
    layer.style.opacity = `${getNoteBackgroundOpacityValue(root) / 100}`;
    layer.style.filter = `blur(${getNoteBackgroundBlurValue(root)}px)`;
    layer.style.transform = `scale(${1 + getNoteBackgroundBlurValue(root) / 60})`;
    layer.style.transformOrigin = "center";
    layer.src = getAppearancePreviewImageURL(imageValue);
    previewElement.appendChild(layer);
};

export const renderStartupPagePreview = (root: Element) => {
    const previewElement = root.querySelector("#startupPagePreview") as HTMLElement;
    if (!previewElement) {
        return;
    }
    const texts = getStartupPageSettingTexts();
    const imageValue = getStartupPageImageValue(root);
    if (!imageValue) {
        previewElement.innerHTML = `<div class="b3-label__text" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 12px;text-align:center;">${escapeHtml(texts.previewEmpty)}</div>`;
        return;
    }
    previewElement.innerHTML = `<div style="position:absolute;inset:0;background-color:#1e1e1e;"></div>`;
    const layer = document.createElement("img");
    layer.alt = "";
    layer.setAttribute("aria-hidden", "true");
    layer.draggable = false;
    layer.style.position = "absolute";
    layer.style.left = "-24px";
    layer.style.top = "-24px";
    layer.style.width = "calc(100% + 48px)";
    layer.style.height = "calc(100% + 48px)";
    layer.style.objectFit = "cover";
    layer.style.objectPosition = "center";
    layer.style.opacity = `${getStartupPageOpacityValue(root) / 100}`;
    layer.style.filter = `blur(${getStartupPageBlurValue(root)}px)`;
    layer.style.transform = `scale(${1 + getStartupPageBlurValue(root) / 60})`;
    layer.style.transformOrigin = "center";
    layer.src = getAppearancePreviewImageURL(imageValue);
    previewElement.appendChild(layer);
};

export const renderMascotPreview = (root: Element) => {
    const previewElement = root.querySelector("#mascotPreview") as HTMLElement;
    if (!previewElement) {
        return;
    }
    const texts = getMascotSettingTexts();
    const imageValue = getMascotImageValue(root);
    if (!imageValue) {
        previewElement.innerHTML = `<div class="b3-label__text" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 12px;text-align:center;">${escapeHtml(texts.previewEmpty)}</div>`;
        return;
    }
    const position = getMascotPositionValue(root);
    const scale = getMascotScaleValue(root);
    const opacity = getMascotOpacityValue(root) / 100;
    const effect = getMascotEffectValue(root);
    const effectStyle = effect === "pulse"
        ? "opacity:.8;transform:translateY(-4px) scale(.98);"
        : effect === "sway"
            ? "transform:rotate(-3deg);transform-origin:center bottom;"
            : effect === "float"
                ? "transform:translateY(-6px);"
                : "";
    previewElement.innerHTML = `<div style="position:absolute;inset:0;background:linear-gradient(180deg, color-mix(in srgb, var(--b3-theme-background) 96%, transparent), color-mix(in srgb, var(--b3-theme-surface-lighter) 92%, transparent));"></div>
<button type="button" style="position:absolute;${position === "left" ? "left" : "right"}:8px;bottom:10px;width:24px;height:56px;border:1px solid var(--b3-border-color);border-radius:999px;background:color-mix(in srgb, var(--b3-theme-background) 88%, transparent);color:var(--b3-theme-on-surface);font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;">${position === "left" ? ">" : "<"}</button>`;
    const imageElement = document.createElement("img");
    imageElement.alt = texts.title;
    imageElement.draggable = false;
    imageElement.style.position = "absolute";
    if (position === "left") {
        imageElement.style.left = "14px";
    } else {
        imageElement.style.right = "14px";
    }
    imageElement.style.bottom = "8px";
    imageElement.style.width = `${Math.round(64 * scale / 100)}px`;
    imageElement.style.maxWidth = "92px";
    imageElement.style.maxHeight = "108px";
    imageElement.style.objectFit = "contain";
    imageElement.style.opacity = `${opacity}`;
    imageElement.style.filter = "drop-shadow(0 12px 18px rgba(15, 23, 42, .18))";
    imageElement.style.cssText += effectStyle;
    imageElement.src = getAppearancePreviewImageURL(imageValue);
    previewElement.appendChild(imageElement);
};

export const renderCursorSavedImageList = (root: Element) => {
    const listElement = root.querySelector("#cursorSavedImageList") as HTMLElement;
    if (!listElement) {
        return;
    }
    const texts = getEditorCursorSettingTexts();
    const activeSource = getCursorImageValue(root);
    const items = getCursorSavedImages();
    if (!items.length) {
        listElement.innerHTML = `<div class="b3-label__text">${escapeHtml(texts.imageLibraryEmpty)}</div>`;
        return;
    }
    listElement.innerHTML = items.map((item) => {
        const active = activeSource === item.source;
        return `<div class="fn__flex config__item" data-cursor-saved-image-id="${escapeAttr(item.id)}">
    <div class="fn__flex-center fn__flex-1" style="min-width:0;gap:8px;">
        <span class="fn__flex-center" role="img" aria-label="${escapeAttr(item.name)}" style="width:40px;height:40px;min-width:40px;min-height:40px;max-width:40px;max-height:40px;border-radius:8px;overflow:hidden;background-color:var(--b3-theme-surface-lighter);background-image:url(&quot;${escapeCSSURLAttr(item.source)}&quot;);background-position:center;background-repeat:no-repeat;background-size:contain;flex:0 0 40px;"></span>
        <span class="fn__ellipsis" style="min-width:0;">${escapeHtml(item.name)}</span>
        ${active ? `<span class="b3-chip b3-chip--small">${escapeHtml(texts.currentLibraryImage)}</span>` : ""}
    </div>
    <div class="fn__flex-center" style="gap:8px;flex-shrink:0;">
        <button class="b3-button b3-button--outline fn__flex-center" data-action="cursor-saved-apply" data-cursor-saved-image-id="${escapeAttr(item.id)}">${escapeHtml(texts.applyLibraryImage)}</button>
        <button class="b3-button b3-button--outline fn__flex-center" data-action="cursor-saved-delete" data-cursor-saved-image-id="${escapeAttr(item.id)}">${escapeHtml(texts.deleteLibraryImage)}</button>
    </div>
</div>`;
    }).join(`<div class="fn__hr"></div>`);
};

export const syncCursorControls = (root: Element) => {
    const texts = getEditorCursorSettingTexts();
    const colorValue = getCursorColorValue(root);
    const colorSelect = root.querySelector("#cursorColor") as HTMLSelectElement;
    const colorCustomInput = root.querySelector("#cursorColorCustom") as HTMLInputElement;
    const blinkSwitch = root.querySelector("#cursorBlink") as HTMLInputElement;
    const blinkEffectSelect = root.querySelector("#cursorBlinkEffect") as HTMLSelectElement;
    if (colorSelect) {
        colorSelect.value = shouldKeepCursorCustomSelection(root) ? CUSTOM_EDITOR_CURSOR_COLOR_VALUE : getEditorCursorColorSelectValue(colorValue);
    }
    if (colorCustomInput) {
        colorCustomInput.value = getCursorColorPickerValue(colorValue);
    }
    const blinkEnabled = blinkSwitch?.checked ?? (window.sourceflow.config.editor.cursorBlink !== false);
    if (blinkEffectSelect) {
        blinkEffectSelect.value = normalizeEditorCursorBlinkEffect(blinkEffectSelect.value || window.sourceflow.config.editor.cursorBlinkEffect || DEFAULT_EDITOR_CURSOR_BLINK_EFFECT);
        blinkEffectSelect.disabled = !blinkEnabled;
    }

    const imageValue = getCursorImageValue(root);
    const tintSwitch = root.querySelector("#cursorImageTint") as HTMLInputElement;
    const tintHint = root.querySelector("#cursorImageTintHint") as HTMLElement;
    const imageMeta = root.querySelector("#cursorImageMeta") as HTMLElement;
    const imageName = `${window.sourceflow.config.editor.cursorImageName || ""}`.trim();
    const imageSaveButton = root.querySelector("#cursorImageSaveToLibrary") as HTMLButtonElement;
    const widthInput = root.querySelector("#cursorImageWidthPercent") as HTMLInputElement;
    const heightInput = root.querySelector("#cursorImageHeightPercent") as HTMLInputElement;
    const offsetXInput = root.querySelector("#cursorImageOffsetX") as HTMLInputElement;
    const offsetYInput = root.querySelector("#cursorImageOffsetY") as HTMLInputElement;
    if (tintSwitch) {
        const svgImage = isEditorCursorSVGImage(imageValue);
        tintSwitch.disabled = !svgImage;
        if (!svgImage) {
            tintSwitch.checked = false;
        }
    }
    if (imageSaveButton) {
        imageSaveButton.disabled = !imageValue || imageValue.startsWith("file://");
    }
    if (tintHint) {
        tintHint.textContent = isEditorCursorSVGImage(imageValue)
            ? texts.imageTintHint
            : window.sourceflow.config.lang === "zh_CN" ? "仅 SVG 图片支持着色；PNG/JPG/GIF/WEBP 会保持原图。" : "Only SVG images support tinting; PNG/JPG/GIF/WEBP keep their original pixels.";
    }
    if (imageMeta) {
        imageMeta.innerHTML = imageValue
            ? `${texts.imageActiveLabel}：<code class="fn__code">${escapeAttr(imageName || imageValue)}</code>`
            : texts.imageActiveNone;
    }
    if (widthInput) {
        widthInput.value = `${getCursorImageWidthPercentValue(root)}`;
    }
    if (heightInput) {
        heightInput.value = `${getCursorImageHeightPercentValue(root)}`;
    }
    if (offsetXInput) {
        offsetXInput.value = `${getCursorImageOffsetXValue(root)}`;
    }
    if (offsetYInput) {
        offsetYInput.value = `${getCursorImageOffsetYValue(root)}`;
    }
    renderCursorImagePreview(root);
    renderCursorSavedImageList(root);
};

export const syncNoteBackgroundControls = (root: Element) => {
    const imageMeta = root.querySelector("#noteBackgroundMeta") as HTMLElement;
    const opacityInput = root.querySelector("#noteBackgroundOpacity") as HTMLInputElement;
    const blurInput = root.querySelector("#noteBackgroundBlur") as HTMLInputElement;
    const imageValue = getNoteBackgroundImageValue(root);
    const texts = getEditorNoteBackgroundSettingTexts();
    if (imageMeta) {
        imageMeta.innerHTML = imageValue
            ? `<code class="fn__code">${escapeAttr(imageValue.startsWith("data:image/") ? (window.sourceflow.config.lang === "zh_CN" ? "已内嵌本地背景图" : "Embedded local background image") : imageValue)}</code>`
            : texts.previewEmpty;
    }
    if (opacityInput) {
        opacityInput.value = `${getNoteBackgroundOpacityValue(root)}`;
    }
    if (blurInput) {
        blurInput.value = `${getNoteBackgroundBlurValue(root)}`;
    }
    renderNoteBackgroundPreview(root);
};

export const syncStartupPageControls = (root: Element) => {
    const imageMeta = root.querySelector("#startupPageMeta") as HTMLElement;
    const opacityInput = root.querySelector("#startupPageOpacity") as HTMLInputElement;
    const blurInput = root.querySelector("#startupPageBlur") as HTMLInputElement;
    const imageValue = getStartupPageImageValue(root);
    const texts = getStartupPageSettingTexts();
    if (imageMeta) {
        imageMeta.innerHTML = imageValue
            ? `<code class="fn__code">${escapeAttr(imageValue.startsWith("data:image/") ? texts.embeddedLabel : imageValue)}</code>`
            : texts.previewEmpty;
    }
    if (opacityInput) {
        opacityInput.value = `${getStartupPageOpacityValue(root)}`;
    }
    if (blurInput) {
        blurInput.value = `${getStartupPageBlurValue(root)}`;
    }
    renderStartupPagePreview(root);
};

export const syncMascotControls = (root: Element) => {
    const texts = getMascotSettingTexts();
    const imageMeta = root.querySelector("#mascotMeta") as HTMLElement;
    const enabledInput = root.querySelector("#mascotEnabled") as HTMLInputElement;
    const positionSelect = root.querySelector("#mascotPosition") as HTMLSelectElement;
    const effectSelect = root.querySelector("#mascotEffect") as HTMLSelectElement;
    const opacityInput = root.querySelector("#mascotOpacity") as HTMLInputElement;
    const scaleInput = root.querySelector("#mascotScale") as HTMLInputElement;
    const imageValue = getMascotImageValue(root);
    if (enabledInput) {
        enabledInput.checked = getMascotEnabledValue(root);
    }
    if (positionSelect) {
        positionSelect.value = getMascotPositionValue(root);
    }
    if (effectSelect) {
        effectSelect.value = getMascotEffectValue(root);
    }
    if (opacityInput) {
        opacityInput.value = `${getMascotOpacityValue(root)}`;
    }
    if (scaleInput) {
        scaleInput.value = `${getMascotScaleValue(root)}`;
    }
    if (imageMeta) {
        imageMeta.innerHTML = imageValue
            ? `<code class="fn__code">${escapeAttr(imageValue.startsWith("data:image/") ? texts.embeddedLabel : imageValue)}</code>`
            : texts.previewEmpty;
    }
    renderMascotPreview(root);
};
