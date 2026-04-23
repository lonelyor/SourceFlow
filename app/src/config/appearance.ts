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

const escapeCSSURL = (value: string) => {
    return `${value || ""}`.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
};

const escapeCSSURLAttr = (value: string) => {
    return escapeAttr(escapeCSSURL(value));
};

const getAppearancePreviewImageURL = (value: string) => {
    const normalized = `${value || ""}`.trim();
    return normalized.startsWith("data:image/") ? normalized : getRenderableImageURL(normalized);
};

const getCursorColorPickerValue = (value: string) => {
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

const getCursorColorValue = (root: Element) => {
    const customValue = (root.querySelector("#cursorColorCustom") as HTMLInputElement)?.value || "";
    return normalizeEditorCursorColor(customValue);
};

const shouldKeepCursorCustomSelection = (root: Element) => {
    return (root.querySelector("#cursorColor") as HTMLSelectElement)?.dataset.forceCustom === "true";
};

const getCursorImageInput = (root: Element) => {
    return root.querySelector("#cursorImage") as HTMLInputElement;
};

const setCursorImageInputValue = (root: Element, value: string) => {
    const input = getCursorImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeEditorCursorImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getEditorCursorImageDisplayValue(normalized);
};

const getCursorImageValue = (root: Element) => {
    const input = getCursorImageInput(root);
    return normalizeEditorCursorImage(input?.dataset.sourceValue || input?.value || "");
};

const getCursorSavedImages = () => {
    return normalizeEditorCursorSavedImages(window.sourceflow.config.editor.cursorSavedImages);
};

const getCursorImageWidthPercentValue = (root: Element) => {
    return normalizeEditorCursorImageWidthPercent(Number((root.querySelector("#cursorImageWidthPercent") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_WIDTH_PERCENT));
};

const getCursorImageHeightPercentValue = (root: Element) => {
    return normalizeEditorCursorImageHeightPercent(Number((root.querySelector("#cursorImageHeightPercent") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_HEIGHT_PERCENT));
};

const getCursorImageOffsetXValue = (root: Element) => {
    return normalizeEditorCursorImageOffset(Number((root.querySelector("#cursorImageOffsetX") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_X));
};

const getCursorImageOffsetYValue = (root: Element) => {
    return normalizeEditorCursorImageOffset(Number((root.querySelector("#cursorImageOffsetY") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_Y));
};

const getHiddenBlockColorValue = (root: Element) => {
    return normalizeEditorHiddenBlockColor((root.querySelector("#hiddenBlockColor") as HTMLInputElement)?.value || "");
};

const getNoteBackgroundImageInput = (root: Element) => {
    return root.querySelector("#noteBackgroundImage") as HTMLInputElement;
};

const setNoteBackgroundImageInputValue = (root: Element, value: string) => {
    const input = getNoteBackgroundImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeEditorNoteBackgroundImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getEditorNoteBackgroundDisplayValue(normalized);
};

const getNoteBackgroundImageValue = (root: Element) => {
    const input = getNoteBackgroundImageInput(root);
    return normalizeEditorNoteBackgroundImage(input?.dataset.sourceValue || input?.value || "");
};

const getNoteBackgroundOpacityValue = (root: Element) => {
    return normalizeEditorNoteBackgroundOpacity(Number((root.querySelector("#noteBackgroundOpacity") as HTMLInputElement)?.value || DEFAULT_EDITOR_NOTE_BACKGROUND_OPACITY));
};

const getNoteBackgroundBlurValue = (root: Element) => {
    return normalizeEditorNoteBackgroundBlur(Number((root.querySelector("#noteBackgroundBlur") as HTMLInputElement)?.value || DEFAULT_EDITOR_NOTE_BACKGROUND_BLUR));
};

const getStartupPageImageInput = (root: Element) => {
    return root.querySelector("#startupPageImage") as HTMLInputElement;
};

const setStartupPageImageInputValue = (root: Element, value: string) => {
    const input = getStartupPageImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeStartupPageImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getStartupPageDisplayValue(normalized);
};

const getStartupPageImageValue = (root: Element) => {
    const input = getStartupPageImageInput(root);
    return normalizeStartupPageImage(input?.dataset.sourceValue || input?.value || "");
};

const getStartupPageOpacityValue = (root: Element) => {
    return normalizeStartupPageOpacity(Number((root.querySelector("#startupPageOpacity") as HTMLInputElement)?.value || DEFAULT_STARTUP_PAGE_OPACITY));
};

const getStartupPageBlurValue = (root: Element) => {
    return normalizeStartupPageBlur(Number((root.querySelector("#startupPageBlur") as HTMLInputElement)?.value || DEFAULT_STARTUP_PAGE_BLUR));
};

const getMascotImageInput = (root: Element) => {
    return root.querySelector("#mascotImage") as HTMLInputElement;
};

const setMascotImageInputValue = (root: Element, value: string) => {
    const input = getMascotImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeMascotImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getMascotDisplayValue(normalized);
};

const getMascotImageValue = (root: Element) => {
    const input = getMascotImageInput(root);
    return normalizeMascotImage(input?.dataset.sourceValue || input?.value || "");
};

const getMascotEnabledValue = (root: Element) => {
    return normalizeMascotEnabled((root.querySelector("#mascotEnabled") as HTMLInputElement)?.checked);
};

const getMascotPositionValue = (root: Element) => {
    return normalizeMascotPosition((root.querySelector("#mascotPosition") as HTMLSelectElement)?.value || "");
};

const getMascotEffectValue = (root: Element) => {
    return normalizeMascotEffect((root.querySelector("#mascotEffect") as HTMLSelectElement)?.value || DEFAULT_MASCOT_EFFECT);
};

const getMascotOpacityValue = (root: Element) => {
    return normalizeMascotOpacity(Number((root.querySelector("#mascotOpacity") as HTMLInputElement)?.value || DEFAULT_MASCOT_OPACITY));
};

const getMascotScaleValue = (root: Element) => {
    return normalizeMascotScale(Number((root.querySelector("#mascotScale") as HTMLInputElement)?.value || DEFAULT_MASCOT_SCALE));
};

const getNoteBackgroundState = (root: Element, overrides?: Partial<Config.IEditor>) => ({
    noteBackgroundImage: overrides?.noteBackgroundImage !== undefined
        ? normalizeEditorNoteBackgroundImage(`${overrides.noteBackgroundImage || ""}`)
        : getNoteBackgroundImageValue(root),
    noteBackgroundOpacity: overrides?.noteBackgroundOpacity ?? getNoteBackgroundOpacityValue(root),
    noteBackgroundBlur: overrides?.noteBackgroundBlur ?? getNoteBackgroundBlurValue(root),
});

const applyNoteBackgroundState = (root: Element, overrides?: Partial<Config.IEditor>, persist = false) => {
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

const getMascotState = (root: Element, overrides?: Partial<Config.IAppearance>) => {
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

const applyMascotState = (root: Element, overrides?: Partial<Config.IAppearance>, persist = false) => {
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

const importDesktopAppearanceImageFile = async () => {
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

const applyImportedNoteBackgroundFile = async (root: Element) => {
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

const applyImportedStartupPageFile = async (root: Element) => {
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

const applyImportedMascotFile = async (root: Element) => {
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

const renderCursorImagePreview = (root: Element) => {
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

const renderNoteBackgroundPreview = (root: Element) => {
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

const renderStartupPagePreview = (root: Element) => {
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

const renderMascotPreview = (root: Element) => {
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

const renderCursorSavedImageList = (root: Element) => {
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

const syncCursorControls = (root: Element) => {
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

const syncNoteBackgroundControls = (root: Element) => {
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

const syncStartupPageControls = (root: Element) => {
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

const syncMascotControls = (root: Element) => {
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

export const appearance = {
    element: undefined as Element,
    genHTML: () => {
        const cursorTexts = getEditorCursorSettingTexts();
        const hiddenBlockTexts = getEditorHiddenBlockSettingTexts();
        const noteBackgroundTexts = getEditorNoteBackgroundSettingTexts();
        const codeBlockSkinTexts = getCodeBlockSkinSettingTexts();
        const cursorPresetOptionsHTML = getEditorCursorPresetOptions().map((item) => `<option value="${item.value}" ${window.sourceflow.config.editor.cursorPreset === item.value ? "selected" : ""}>${item.label}</option>`).join("");
        const normalizedCursorColor = normalizeEditorCursorColor(window.sourceflow.config.editor.cursorColor);
        const cursorColorOptionsHTML = getEditorCursorColorOptions().map((item) => `<option value="${item.value}" ${getEditorCursorColorSelectValue(normalizedCursorColor) === item.value ? "selected" : ""}>${item.label}</option>`).join("");
        const cursorBlinkEffectOptionsHTML = getEditorCursorBlinkEffectOptions().map((item) => `<option value="${item.value}" ${normalizeEditorCursorBlinkEffect(window.sourceflow.config.editor.cursorBlinkEffect) === item.value ? "selected" : ""}>${item.label}</option>`).join("");
        const codeBlockSkinLightOptionsHTML = genOptions(getCodeBlockSkinOptions(), normalizeCodeBlockSkin(window.sourceflow.config.appearance.codeBlockSkinLight));
        const codeBlockSkinDarkOptionsHTML = genOptions(getCodeBlockSkinOptions(), normalizeCodeBlockSkin(window.sourceflow.config.appearance.codeBlockSkinDark));
        const normalizedCursorImage = normalizeEditorCursorImage(window.sourceflow.config.editor.cursorImage);
        const cursorImageDisplayValue = getEditorCursorImageDisplayValue(normalizedCursorImage);
        const cursorImageWidthPercent = normalizeEditorCursorImageWidthPercent(window.sourceflow.config.editor.cursorImageWidthPercent);
        const cursorImageHeightPercent = normalizeEditorCursorImageHeightPercent(window.sourceflow.config.editor.cursorImageHeightPercent);
        const cursorImageOffsetX = normalizeEditorCursorImageOffset(window.sourceflow.config.editor.cursorImageOffsetX);
        const cursorImageOffsetY = normalizeEditorCursorImageOffset(window.sourceflow.config.editor.cursorImageOffsetY);
        const hiddenBlockColor = normalizeEditorHiddenBlockColor(window.sourceflow.config.editor.hiddenBlockColor);
        const normalizedNoteBackgroundImage = normalizeEditorNoteBackgroundImage(window.sourceflow.config.editor.noteBackgroundImage);
        const noteBackgroundDisplayValue = getEditorNoteBackgroundDisplayValue(normalizedNoteBackgroundImage);
        const noteBackgroundOpacity = normalizeEditorNoteBackgroundOpacity(window.sourceflow.config.editor.noteBackgroundOpacity);
        const noteBackgroundBlur = normalizeEditorNoteBackgroundBlur(window.sourceflow.config.editor.noteBackgroundBlur);
        const startupPageTexts = getStartupPageSettingTexts();
        const normalizedStartupPageImage = normalizeStartupPageImage(window.sourceflow.config.appearance.startupPageImage || DEFAULT_STARTUP_PAGE_IMAGE);
        const startupPageDisplayValue = getStartupPageDisplayValue(window.sourceflow.config.appearance.startupPageImage);
        const startupPageOpacity = normalizeStartupPageOpacity(normalizedStartupPageImage
            ? window.sourceflow.config.appearance.startupPageOpacity
            : (window.sourceflow.config.appearance.startupPageOpacity || DEFAULT_STARTUP_PAGE_OPACITY));
        const startupPageBlur = normalizeStartupPageBlur(window.sourceflow.config.appearance.startupPageBlur);
        const mascotTexts = getMascotSettingTexts();
        const normalizedMascotImage = normalizeMascotImage(window.sourceflow.config.appearance.mascotImage);
        const mascotDisplayValue = getMascotDisplayValue(normalizedMascotImage);
        const mascotEnabled = normalizeMascotEnabled(window.sourceflow.config.appearance.mascotEnabled);
        const mascotPosition = normalizeMascotPosition(window.sourceflow.config.appearance.mascotPosition);
        const mascotEffect = normalizeMascotEffect(window.sourceflow.config.appearance.mascotEffect);
        const mascotOpacity = normalizeMascotOpacity(window.sourceflow.config.appearance.mascotOpacity);
        const mascotScale = normalizeMascotScale(window.sourceflow.config.appearance.mascotScale);
        const mascotPositionOptionsHTML = getMascotPositionOptions().map((item) => `<option value="${item.value}" ${mascotPosition === item.value ? "selected" : ""}>${item.label}</option>`).join("");
        const mascotEffectOptionsHTML = getMascotEffectOptions().map((item) => `<option value="${item.value}" ${mascotEffect === item.value ? "selected" : ""}>${item.label}</option>`).join("");
        return `<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.appearance4}
        <div class="b3-label__text">${window.sourceflow.languages.appearance5}</div>
    </div>
    <span class="fn__space"></span>
    <select class="b3-select fn__flex-center fn__size200" id="mode">
      <option value="0" ${(window.sourceflow.config.appearance.mode === 0 && !window.sourceflow.config.appearance.modeOS) ? "selected" : ""}>${window.sourceflow.languages.themeLight}</option>
      <option value="1" ${(window.sourceflow.config.appearance.mode === 1 && !window.sourceflow.config.appearance.modeOS) ? "selected" : ""}>${window.sourceflow.languages.themeDark}</option>
      <option value="2" ${window.sourceflow.config.appearance.modeOS ? "selected" : ""}>${window.sourceflow.languages.themeOS}</option>
    </select>
</div>
<div class="b3-label">
    <div class="fn__flex">
        <div class="fn__flex-center fn__flex-1">${window.sourceflow.languages.theme}</div>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-center fn__size200${isBrowser() ? " fn__none" : ""}" id="appearanceOpenTheme">
            <svg><use xlink:href="#iconFolder"></use></svg>
            ${window.sourceflow.languages.appearance9}
        </button>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
            ${window.sourceflow.languages.theme11}
        </div>
        <span class="fn__space"></span>
        <select class="b3-select fn__flex-center fn__size200" id="themeLight">
          ${genOptions(window.sourceflow.config.appearance.lightThemes, window.sourceflow.config.appearance.themeLight)}
        </select>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
            ${window.sourceflow.languages.theme12}
        </div>
        <span class="fn__space"></span>
        <select class="b3-select fn__flex-center fn__size200" id="themeDark">
           ${genOptions(window.sourceflow.config.appearance.darkThemes, window.sourceflow.config.appearance.themeDark)}
        </select>
    </div>
</div>
<div class="b3-label">
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">
            ${window.sourceflow.languages.icon}
        </div>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-center fn__size200${isBrowser() ? " fn__none" : ""}" id="appearanceOpenIcon">
            <svg><use xlink:href="#iconFolder"></use></svg>
            ${window.sourceflow.languages.appearance8}
        </button>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">${window.sourceflow.languages.theme2}</div>
        <span class="fn__space"></span>
        <select class="b3-select fn__flex-center fn__size200" id="icon">
            ${genOptions(window.sourceflow.config.appearance.icons, window.sourceflow.config.appearance.icon)}
        </select>
    </div>
</div>
<div class="b3-label fn__flex">
    <div class="fn__block">
        <div>
            ${window.sourceflow.languages.appearance1}
        </div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${window.sourceflow.languages.appearance2}</div>
            <span class="fn__space"></span>
            <select id="codeBlockThemeLight" class="b3-select fn__size200">
                ${genOptions(Constants.SOURCEFLOW_CONFIG_APPEARANCE_LIGHT_CODE, window.sourceflow.config.appearance.codeBlockThemeLight)}
            </select>
        </div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${window.sourceflow.languages.appearance3}</div>
            <span class="fn__space"></span>
            <select id="codeBlockThemeDark" class="b3-select fn__size200">
                ${genOptions(Constants.SOURCEFLOW_CONFIG_APPEARANCE_DARK_CODE, window.sourceflow.config.appearance.codeBlockThemeDark)}
            </select>
        </div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${codeBlockSkinTexts.light}</div>
            <span class="fn__space"></span>
            <select id="codeBlockSkinLight" class="b3-select fn__size200">
                ${codeBlockSkinLightOptionsHTML}
            </select>
        </div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${codeBlockSkinTexts.dark}</div>
            <span class="fn__space"></span>
            <select id="codeBlockSkinDark" class="b3-select fn__size200">
                ${codeBlockSkinDarkOptionsHTML}
            </select>
        </div>
        <div class="b3-label__text">${codeBlockSkinTexts.detail}</div>
    </div>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.language}
        <div class="b3-label__text">${window.sourceflow.languages.language1}</div>
    </div>
    <span class="fn__space"></span>
    <select id="lang" class="b3-select fn__flex-center fn__size200">${genLangOptions(window.sourceflow.config.langs, window.sourceflow.config.appearance.lang)}</select>
</div>
<div class="b3-label">
    <div class="fn__block">
        ${cursorTexts.title}
        <div class="b3-label__text">${cursorTexts.detail}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.preset}</div>
            <span class="fn__space"></span>
            <select class="b3-select fn__flex-center fn__size200" id="cursorPreset">${cursorPresetOptionsHTML}</select>
        </div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.color}</div>
            <span class="fn__space"></span>
            <select class="b3-select fn__flex-center fn__size200" id="cursorColor">${cursorColorOptionsHTML}</select>
        </div>
        <div class="fn__hr"></div>
        <label class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.blink}</div>
            <span class="fn__space"></span>
            <input class="b3-switch fn__flex-center" id="cursorBlink" type="checkbox"${window.sourceflow.config.editor.cursorBlink !== false ? " checked" : ""}>
        </label>
        <div class="b3-label__text">${cursorTexts.blinkHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.blinkEffect}</div>
            <span class="fn__space"></span>
            <select class="b3-select fn__flex-center fn__size200" id="cursorBlinkEffect"${window.sourceflow.config.editor.cursorBlink !== false ? "" : " disabled"}>${cursorBlinkEffectOptionsHTML}</select>
        </div>
        <div class="b3-label__text">${cursorTexts.blinkEffectHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.customColor}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="cursorColorCustom" type="color" title="${escapeAttr(cursorTexts.customColorHint)}" value="${escapeAttr(getCursorColorPickerValue(normalizedCursorColor))}">
        </div>
        <div class="b3-label__text">${cursorTexts.customColorHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${hiddenBlockTexts.color}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="hiddenBlockColor" placeholder="${escapeAttr(hiddenBlockTexts.hint)}" value="${escapeAttr(hiddenBlockColor)}">
        </div>
        <div class="b3-label__text">${hiddenBlockTexts.hint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.imageSource}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="cursorImage" data-source-value="${escapeAttr(normalizedCursorImage)}" placeholder="${escapeAttr("https://example.com/cursor.svg")}" value="${escapeAttr(cursorImageDisplayValue)}">
        </div>
        <div class="b3-label__text">${cursorTexts.imageSourceHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.imageFile}</div>
            <span class="fn__space"></span>
            <div class="fn__flex">
                <button class="b3-button b3-button--outline fn__flex-center" id="cursorImageSaveToLibrary">${cursorTexts.saveImageToLibrary}</button>
                <span class="fn__space"></span>
                <button class="b3-button b3-button--outline fn__flex-center" id="cursorImagePick">${cursorTexts.uploadImage}</button>
                <span class="fn__space"></span>
                <button class="b3-button b3-button--outline fn__flex-center" id="cursorImageClear">${cursorTexts.clearImage}</button>
            </div>
            <input class="fn__none" type="file" id="cursorImageFile" accept="image/*,.svg">
        </div>
        <div class="b3-label__text">${cursorTexts.imageFileHint}</div>
        <div class="b3-label__text" id="cursorImageMeta">${normalizedCursorImage ? `${cursorTexts.imageActiveLabel}：<code class="fn__code">${escapeAttr(window.sourceflow.config.editor.cursorImageName || normalizedCursorImage)}</code>` : cursorTexts.imageActiveNone}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item" style="align-items:flex-start;">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.preview}</div>
            <span class="fn__space"></span>
            <div style="width:112px;height:112px;border-radius:12px;border:1px solid var(--b3-border-color);background:linear-gradient(135deg,var(--b3-theme-surface) 0%, var(--b3-theme-surface-lighter) 100%);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;" id="cursorImagePreview">${normalizedCursorImage ? `<img src="${escapeAttr(normalizedCursorImage)}" alt="${escapeAttr(window.sourceflow.config.editor.cursorImageName || "cursor-image")}" style="max-width:72px;max-height:72px;object-fit:contain;display:block;">` : `<div class="b3-label__text">${escapeHtml(cursorTexts.previewEmpty)}</div>`}</div>
        </div>
        <div class="b3-label__text">${cursorTexts.previewHint}</div>
        <div class="fn__hr"></div>
        <label class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.imageTint}</div>
            <span class="fn__space"></span>
            <input class="b3-switch fn__flex-center" id="cursorImageTint" type="checkbox"${window.sourceflow.config.editor.cursorImageTint ? " checked" : ""}${isEditorCursorSVGImage(normalizedCursorImage) ? "" : " disabled"}>
        </label>
        <div class="b3-label__text" id="cursorImageTintHint">${isEditorCursorSVGImage(normalizedCursorImage) ? cursorTexts.imageTintHint : (window.sourceflow.config.lang === "zh_CN" ? "仅 SVG 图片支持着色；PNG/JPG/GIF/WEBP 会保持原图。" : "Only SVG images support tinting; PNG/JPG/GIF/WEBP keep their original pixels.")}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.imageWidth}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="cursorImageWidthPercent" type="number" min="40" max="300" step="1" value="${cursorImageWidthPercent}">
        </div>
        <div class="b3-label__text">${cursorTexts.imageSizeHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.imageHeight}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="cursorImageHeightPercent" type="number" min="40" max="300" step="1" value="${cursorImageHeightPercent}">
        </div>
        <div class="b3-label__text">${cursorTexts.imagePercentUnit}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.imageOffsetX}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="cursorImageOffsetX" type="number" min="-96" max="96" step="1" value="${cursorImageOffsetX}">
        </div>
        <div class="b3-label__text">${cursorTexts.imagePositionHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.imageOffsetY}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="cursorImageOffsetY" type="number" min="-96" max="96" step="1" value="${cursorImageOffsetY}">
        </div>
        <div class="b3-label__text">${cursorTexts.imageOffsetUnit}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${cursorTexts.resetImageTransform}</div>
            <span class="fn__space"></span>
            <button class="b3-button b3-button--outline fn__flex-center" id="cursorImageTransformReset">${cursorTexts.resetImageTransform}</button>
        </div>
        <div class="fn__hr"></div>
        <div class="fn__block">
            <div>${cursorTexts.imageLibrary}</div>
            <div class="b3-label__text">${cursorTexts.imageLibraryHint}</div>
            <div class="fn__hr"></div>
            <div id="cursorSavedImageList"></div>
        </div>
    </div>
</div>
<div class="b3-label">
    <div class="fn__block">
        ${noteBackgroundTexts.title}
        <div class="b3-label__text">${noteBackgroundTexts.detail}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${noteBackgroundTexts.source}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="noteBackgroundImage" placeholder="${escapeAttr("https://example.com/background.webp")}" value="${escapeAttr(noteBackgroundDisplayValue)}">
        </div>
        <div class="b3-label__text">${noteBackgroundTexts.sourceHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${noteBackgroundTexts.preview}</div>
            <span class="fn__space"></span>
            <div style="width:160px;height:104px;border-radius:14px;border:1px solid var(--b3-border-color);background:linear-gradient(135deg,var(--b3-theme-surface) 0%, var(--b3-theme-surface-lighter) 100%);position:relative;overflow:hidden;" id="noteBackgroundPreview"></div>
        </div>
        <div class="b3-label__text" id="noteBackgroundMeta">${normalizedNoteBackgroundImage ? `<code class="fn__code">${escapeAttr(normalizedNoteBackgroundImage.startsWith("data:image/") ? (window.sourceflow.config.lang === "zh_CN" ? "已内嵌本地背景图" : "Embedded local background image") : normalizedNoteBackgroundImage)}</code>` : noteBackgroundTexts.previewEmpty}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${noteBackgroundTexts.opacity}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="noteBackgroundOpacity" type="number" min="0" max="100" step="1" value="${noteBackgroundOpacity}">
        </div>
        <div class="b3-label__text">${noteBackgroundTexts.opacityHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${noteBackgroundTexts.blur}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="noteBackgroundBlur" type="number" min="0" max="32" step="1" value="${noteBackgroundBlur}">
        </div>
        <div class="b3-label__text">${noteBackgroundTexts.blurHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${noteBackgroundTexts.source}</div>
            <span class="fn__space"></span>
            <div class="fn__flex">
                <button class="b3-button b3-button--outline fn__flex-center" id="noteBackgroundImagePick">${noteBackgroundTexts.uploadImage}</button>
                <span class="fn__space"></span>
                <button class="b3-button b3-button--outline fn__flex-center" id="noteBackgroundImageClear">${noteBackgroundTexts.clearImage}</button>
            </div>
            <input class="fn__none" type="file" id="noteBackgroundImageFile" accept="image/*,.svg">
        </div>
        <div class="b3-label__text">${noteBackgroundTexts.localFileHint}</div>
    </div>
</div>
<div class="b3-label">
    <div class="fn__block">
        ${startupPageTexts.title}
        <div class="b3-label__text">${startupPageTexts.detail}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${startupPageTexts.source}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="startupPageImage" placeholder="${escapeAttr("https://example.com/startup.webp")}" value="${escapeAttr(startupPageDisplayValue)}">
        </div>
        <div class="b3-label__text">${startupPageTexts.sourceHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${startupPageTexts.preview}</div>
            <span class="fn__space"></span>
            <div style="width:176px;height:112px;border-radius:14px;border:1px solid var(--b3-border-color);background:#1e1e1e;position:relative;overflow:hidden;" id="startupPagePreview"></div>
        </div>
        <div class="b3-label__text" id="startupPageMeta">${normalizedStartupPageImage ? `<code class="fn__code">${escapeAttr(normalizedStartupPageImage.startsWith("data:image/") ? startupPageTexts.embeddedLabel : normalizedStartupPageImage)}</code>` : startupPageTexts.previewEmpty}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${startupPageTexts.opacity}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="startupPageOpacity" type="number" min="0" max="100" step="1" value="${startupPageOpacity}">
        </div>
        <div class="b3-label__text">${startupPageTexts.opacityHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${startupPageTexts.blur}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="startupPageBlur" type="number" min="0" max="32" step="1" value="${startupPageBlur}">
        </div>
        <div class="b3-label__text">${startupPageTexts.blurHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${startupPageTexts.source}</div>
            <span class="fn__space"></span>
            <div class="fn__flex">
                <button class="b3-button b3-button--outline fn__flex-center" id="startupPageImagePick">${startupPageTexts.uploadImage}</button>
                <span class="fn__space"></span>
                <button class="b3-button b3-button--outline fn__flex-center" id="startupPageImageClear">${startupPageTexts.clearImage}</button>
            </div>
            <input class="fn__none" type="file" id="startupPageImageFile" accept="image/*,.svg">
        </div>
        <div class="b3-label__text">${startupPageTexts.localFileHint}</div>
    </div>
</div>
<div class="b3-label">
    <div class="fn__block">
        ${mascotTexts.title}
        <div class="b3-label__text">${mascotTexts.detail}</div>
        <div class="b3-label__text">${mascotTexts.controlHint}</div>
        <div class="fn__hr"></div>
        <label class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${mascotTexts.enabled}</div>
            <span class="fn__space"></span>
            <input class="b3-switch fn__flex-center" id="mascotEnabled" type="checkbox"${mascotEnabled ? " checked" : ""}>
        </label>
        <div class="b3-label__text">${mascotTexts.enabledHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${mascotTexts.source}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="mascotImage" placeholder="${escapeAttr("https://example.com/mascot.webp")}" value="${escapeAttr(mascotDisplayValue)}">
        </div>
        <div class="b3-label__text">${mascotTexts.sourceHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${mascotTexts.preview}</div>
            <span class="fn__space"></span>
            <div style="width:176px;height:132px;border-radius:14px;border:1px solid var(--b3-border-color);background:var(--b3-theme-background);position:relative;overflow:hidden;" id="mascotPreview"></div>
        </div>
        <div class="b3-label__text" id="mascotMeta">${normalizedMascotImage ? `<code class="fn__code">${escapeAttr(normalizedMascotImage.startsWith("data:image/") ? mascotTexts.embeddedLabel : normalizedMascotImage)}</code>` : mascotTexts.previewEmpty}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${mascotTexts.position}</div>
            <span class="fn__space"></span>
            <select class="b3-select fn__flex-center fn__size200" id="mascotPosition">${mascotPositionOptionsHTML}</select>
        </div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${mascotTexts.effect}</div>
            <span class="fn__space"></span>
            <select class="b3-select fn__flex-center fn__size200" id="mascotEffect">${mascotEffectOptionsHTML}</select>
        </div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${mascotTexts.opacity}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="mascotOpacity" type="number" min="0" max="100" step="1" value="${mascotOpacity}">
        </div>
        <div class="b3-label__text">${mascotTexts.opacityHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${mascotTexts.scale}</div>
            <span class="fn__space"></span>
            <input class="b3-text-field fn__flex-center fn__size200" id="mascotScale" type="number" min="40" max="180" step="1" value="${mascotScale}">
        </div>
        <div class="b3-label__text">${mascotTexts.scaleHint}</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-center fn__flex-1 ft__on-surface">${mascotTexts.source}</div>
            <span class="fn__space"></span>
            <div class="fn__flex">
                <button class="b3-button b3-button--outline fn__flex-center" id="mascotImagePick">${mascotTexts.uploadImage}</button>
                <span class="fn__space"></span>
                <button class="b3-button b3-button--outline fn__flex-center" id="mascotImageClear">${mascotTexts.clearImage}</button>
            </div>
            <input class="fn__none" type="file" id="mascotImageFile" accept="image/*,.svg">
        </div>
        <div class="b3-label__text">${mascotTexts.localFileHint}</div>
    </div>
</div>
<div class="b3-label config__item${isBrowser() ? " fn__none" : " fn__flex"}">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.customEmoji}
        <div class="b3-label__text">${window.sourceflow.languages.customEmojiTip}</div>
    </div>
    <span class="fn__space"></span>
    <button class="b3-button b3-button--outline fn__flex-center fn__size200" id="appearanceOpenEmoji">
        <svg><use xlink:href="#iconFolder"></use></svg>
        ${window.sourceflow.languages.showInFolder}
    </button>
</div>
<div class="b3-label fn__flex config__item">
   <div class="fn__flex-1">
        ${window.sourceflow.languages.resetLayout}
        <div class="b3-label__text">${window.sourceflow.languages.appearance6}</div>
    </div>
    <span class="fn__space"></span>
    <button class="b3-button b3-button--outline fn__flex-center fn__size200" id="resetLayout">
        <svg><use xlink:href="#iconUndo"></use></svg>${window.sourceflow.languages.reset}
    </button>
</div>
<div class="b3-label">
    <div class="fn__flex config__item">
        <div class="fn__flex-1 fn__flex-center">
            ${window.sourceflow.languages.codeSnippet}
        </div>
        <span class="fn__space"></span>
        <a class="b3-button b3-button--outline fn__flex-center fn__size200" target="_blank" href="https://github.com/lonelyor/SourceFlow">
            <svg><use xlink:href="#iconUpload"></use></svg>${window.sourceflow.languages.visitCommunityShare}
        </a>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
            ${window.sourceflow.languages.codeSnippetTip}
        </div>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-center fn__size200" id="codeSnippet">
            <svg><use xlink:href="#iconSettings"></use></svg>${window.sourceflow.languages.config}
        </button>
    </div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.appearance16}
    <div class="fn__hr"></div>
    <label class="fn__flex">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
           ${window.sourceflow.languages.appearance17}
        </div>
        <span class="fn__space"></span>
        <input class="b3-switch fn__flex-center" id="hideStatusBar" type="checkbox"${window.sourceflow.config.appearance.hideStatusBar ? " checked" : ""}>
    </label>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
            ${window.sourceflow.languages.appearance18}
        </div>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-center fn__size200" id="statusBarSetting">
            <svg><use xlink:href="#iconSettings"></use></svg>${window.sourceflow.languages.config}
        </button>
    </div>
</div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.appearance10}
        <div class="b3-label__text">${window.sourceflow.languages.appearance11}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="closeButtonBehavior" type="checkbox"${window.sourceflow.config.appearance.closeButtonBehavior === 0 ? "" : " checked"}>
</label>`;
    },
    _sendEditorVisual: (overrides?: Partial<Config.IEditor>) => {
        const cursorColor = getCursorColorValue(appearance.element);
        const cursorImage = getCursorImageValue(appearance.element);
        const nextCursorImage = overrides?.cursorImage !== undefined ? normalizeEditorCursorImage(overrides.cursorImage) : cursorImage;
        const nextCursorImageName = nextCursorImage
            ? `${overrides?.cursorImageName !== undefined
                ? overrides.cursorImageName
                : ((nextCursorImage === window.sourceflow.config.editor.cursorImage ? window.sourceflow.config.editor.cursorImageName : "") || "")}`.trim()
            : "";
        const nextNoteBackgroundImage = overrides?.noteBackgroundImage !== undefined
            ? normalizeEditorNoteBackgroundImage(`${overrides.noteBackgroundImage || ""}`)
            : getNoteBackgroundImageValue(appearance.element);
        fetchPost("/api/setting/setEditor", Object.assign({}, window.sourceflow.config.editor, {
            cursorPreset: overrides?.cursorPreset ?? (appearance.element.querySelector("#cursorPreset") as HTMLSelectElement).value,
            cursorColor: overrides?.cursorColor ?? cursorColor,
            cursorImage: nextCursorImage,
            cursorImageName: overrides?.cursorImage === "" ? "" : nextCursorImageName,
            cursorImageTint: overrides?.cursorImageTint !== undefined
                ? !!overrides.cursorImageTint
                : (!!nextCursorImage && !!(appearance.element.querySelector("#cursorImageTint") as HTMLInputElement)?.checked),
            cursorImageWidthPercent: overrides?.cursorImageWidthPercent ?? getCursorImageWidthPercentValue(appearance.element),
            cursorImageHeightPercent: overrides?.cursorImageHeightPercent ?? getCursorImageHeightPercentValue(appearance.element),
            cursorImageOffsetX: overrides?.cursorImageOffsetX ?? getCursorImageOffsetXValue(appearance.element),
            cursorImageOffsetY: overrides?.cursorImageOffsetY ?? getCursorImageOffsetYValue(appearance.element),
            cursorSavedImages: normalizeEditorCursorSavedImages(overrides?.cursorSavedImages !== undefined ? overrides.cursorSavedImages : window.sourceflow.config.editor.cursorSavedImages),
            cursorBlink: overrides?.cursorBlink ?? ((appearance.element.querySelector("#cursorBlink") as HTMLInputElement)?.checked ?? DEFAULT_EDITOR_CURSOR_BLINK),
            cursorBlinkEffect: overrides?.cursorBlinkEffect ?? normalizeEditorCursorBlinkEffect((appearance.element.querySelector("#cursorBlinkEffect") as HTMLSelectElement)?.value || DEFAULT_EDITOR_CURSOR_BLINK_EFFECT),
            hiddenBlockColor: overrides?.hiddenBlockColor ?? getHiddenBlockColorValue(appearance.element),
            noteBackgroundImage: nextNoteBackgroundImage,
            noteBackgroundOpacity: overrides?.noteBackgroundOpacity ?? getNoteBackgroundOpacityValue(appearance.element),
            noteBackgroundBlur: overrides?.noteBackgroundBlur ?? getNoteBackgroundBlurValue(appearance.element),
        }), (response) => {
            window.sourceflow.config.editor = response.data;
            const imageInput = getCursorImageInput(appearance.element);
            const colorCustomInput = appearance.element.querySelector("#cursorColorCustom") as HTMLInputElement;
            const hiddenBlockColorInput = appearance.element.querySelector("#hiddenBlockColor") as HTMLInputElement;
            const presetSelect = appearance.element.querySelector("#cursorPreset") as HTMLSelectElement;
            const blinkSwitch = appearance.element.querySelector("#cursorBlink") as HTMLInputElement;
            const blinkEffectSelect = appearance.element.querySelector("#cursorBlinkEffect") as HTMLSelectElement;
            if (imageInput) {
                setCursorImageInputValue(appearance.element, window.sourceflow.config.editor.cursorImage);
            }
            if (colorCustomInput) {
                colorCustomInput.value = getCursorColorPickerValue(window.sourceflow.config.editor.cursorColor);
            }
            if (hiddenBlockColorInput) {
                hiddenBlockColorInput.value = normalizeEditorHiddenBlockColor(window.sourceflow.config.editor.hiddenBlockColor);
            }
            if (presetSelect) {
                presetSelect.value = window.sourceflow.config.editor.cursorPreset;
            }
            if (blinkSwitch) {
                blinkSwitch.checked = window.sourceflow.config.editor.cursorBlink !== false;
            }
            if (blinkEffectSelect) {
                blinkEffectSelect.value = normalizeEditorCursorBlinkEffect(window.sourceflow.config.editor.cursorBlinkEffect);
            }
            setNoteBackgroundImageInputValue(appearance.element, window.sourceflow.config.editor.noteBackgroundImage);
            syncCursorControls(appearance.element);
            syncNoteBackgroundControls(appearance.element);
            setInlineStyle();
        });
    },
    _send: () => {
        const themeLight = (appearance.element.querySelector("#themeLight") as HTMLSelectElement).value;
        const themeDark = (appearance.element.querySelector("#themeDark") as HTMLSelectElement).value;
        const modeElementValue = parseInt((appearance.element.querySelector("#mode") as HTMLSelectElement).value);
        const OSTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        fetchPost("/api/setting/setAppearance", Object.assign({}, window.sourceflow.config.appearance, {
            icon: (appearance.element.querySelector("#icon") as HTMLSelectElement).value,
            mode: modeElementValue === 2 ? (OSTheme === "light" ? 0 : 1) : modeElementValue,
            modeOS: modeElementValue === 2,
            codeBlockThemeDark: (appearance.element.querySelector("#codeBlockThemeDark") as HTMLSelectElement).value,
            codeBlockThemeLight: (appearance.element.querySelector("#codeBlockThemeLight") as HTMLSelectElement).value,
            codeBlockSkinDark: normalizeCodeBlockSkin((appearance.element.querySelector("#codeBlockSkinDark") as HTMLSelectElement)?.value),
            codeBlockSkinLight: normalizeCodeBlockSkin((appearance.element.querySelector("#codeBlockSkinLight") as HTMLSelectElement)?.value),
            themeDark,
            themeLight,
            darkThemes: window.sourceflow.config.appearance.darkThemes,
            lightThemes: window.sourceflow.config.appearance.lightThemes,
            icons: window.sourceflow.config.appearance.icons,
            lang: (appearance.element.querySelector("#lang") as HTMLSelectElement).value,
            closeButtonBehavior: (appearance.element.querySelector("#closeButtonBehavior") as HTMLInputElement).checked ? 1 : 0,
            hideStatusBar: (appearance.element.querySelector("#hideStatusBar") as HTMLInputElement).checked,
            startupPageImage: getStartupPageImageValue(appearance.element),
            startupPageOpacity: getStartupPageOpacityValue(appearance.element),
            startupPageBlur: getStartupPageBlurValue(appearance.element),
            mascotEnabled: getMascotEnabledValue(appearance.element),
            mascotImage: getMascotImageValue(appearance.element),
            mascotPosition: getMascotPositionValue(appearance.element),
            mascotEffect: getMascotEffectValue(appearance.element),
            mascotOpacity: getMascotOpacityValue(appearance.element),
            mascotScale: getMascotScaleValue(appearance.element),
            statusBar: {
                msgTaskDatabaseIndexCommitDisabled: window.sourceflow.config.appearance.statusBar.msgTaskDatabaseIndexCommitDisabled,
                msgTaskHistoryDatabaseIndexCommitDisabled: window.sourceflow.config.appearance.statusBar.msgTaskHistoryDatabaseIndexCommitDisabled,
                msgTaskAssetDatabaseIndexCommitDisabled: window.sourceflow.config.appearance.statusBar.msgTaskAssetDatabaseIndexCommitDisabled,
                msgTaskHistoryGenerateFileDisabled: window.sourceflow.config.appearance.statusBar.msgTaskHistoryGenerateFileDisabled,
            }
        }), (response) => {
            if (response?.data) {
                appearance.onSetAppearance(response.data);
            }
            resetFloatDockSize();
        });
    },
    bindEvent: () => {
        setStatusBar(appearance.element.querySelector("#statusBarSetting"));
        appearance.element.querySelector("#codeSnippet").addEventListener("click", () => {
            openSnippets();
        });
        appearance.element.querySelector("#resetLayout").addEventListener("click", () => {
            confirmDialog("⚠️ " + window.sourceflow.languages.reset, window.sourceflow.languages.appearance6, () => {
                resetLayout();
            });
        });
        /// #if !BROWSER
        appearance.element.querySelector("#appearanceOpenIcon").addEventListener("click", () => {
            useShell("openPath", path.join(window.sourceflow.config.system.confDir, "appearance", "icons"));
        });
        appearance.element.querySelector("#appearanceOpenTheme").addEventListener("click", () => {
            useShell("openPath", path.join(window.sourceflow.config.system.confDir, "appearance", "themes"));
        });
        appearance.element.querySelector("#appearanceOpenEmoji").addEventListener("click", () => {
            useShell("openPath", path.join(window.sourceflow.config.system.dataDir, "emojis"));
        });
        /// #endif
        appearance.element.querySelectorAll("select:not(#cursorPreset):not(#cursorColor):not(#cursorBlinkEffect):not(#mascotPosition):not(#mascotEffect)").forEach(item => {
            item.addEventListener("change", () => {
                appearance._send();
            });
        });
        appearance.element.querySelectorAll(".b3-switch:not(#cursorImageTint):not(#cursorBlink):not(#mascotEnabled)").forEach((item) => {
            item.addEventListener("change", () => {
                appearance._send();
            });
        });
        appearance.element.querySelectorAll("#cursorPreset, #cursorImageTint, #cursorBlink, #cursorBlinkEffect").forEach((item) => {
            item.addEventListener("change", () => {
                syncCursorControls(appearance.element);
                appearance._sendEditorVisual();
            });
        });
        (appearance.element.querySelector("#cursorColor") as HTMLSelectElement)?.addEventListener("change", () => {
            const colorCustomInput = appearance.element.querySelector("#cursorColorCustom") as HTMLInputElement;
            const colorSelect = appearance.element.querySelector("#cursorColor") as HTMLSelectElement;
            if (colorSelect) {
                if (colorSelect.value === CUSTOM_EDITOR_CURSOR_COLOR_VALUE) {
                    colorSelect.dataset.forceCustom = "true";
                } else {
                    delete colorSelect.dataset.forceCustom;
                }
            }
            if (colorCustomInput && colorSelect && colorSelect.value !== CUSTOM_EDITOR_CURSOR_COLOR_VALUE) {
                colorCustomInput.value = getCursorColorPickerValue(colorSelect.value);
            } else if (colorCustomInput && colorSelect?.value === CUSTOM_EDITOR_CURSOR_COLOR_VALUE) {
                colorCustomInput.focus();
                colorCustomInput.click();
            }
            syncCursorControls(appearance.element);
            appearance._sendEditorVisual();
        });
        (appearance.element.querySelector("#cursorColorCustom") as HTMLInputElement)?.addEventListener("input", () => {
            const colorCustomInput = appearance.element.querySelector("#cursorColorCustom") as HTMLInputElement;
            const colorSelect = appearance.element.querySelector("#cursorColor") as HTMLSelectElement;
            if (colorSelect) {
                colorSelect.value = shouldKeepCursorCustomSelection(appearance.element)
                    ? CUSTOM_EDITOR_CURSOR_COLOR_VALUE
                    : getEditorCursorColorSelectValue(colorCustomInput?.value || "");
            }
        });
        (appearance.element.querySelector("#cursorColorCustom") as HTMLInputElement)?.addEventListener("change", () => {
            const colorCustomInput = appearance.element.querySelector("#cursorColorCustom") as HTMLInputElement;
            const colorSelect = appearance.element.querySelector("#cursorColor") as HTMLSelectElement;
            const normalizedColor = normalizeEditorCursorColor(colorCustomInput?.value || "");
            if (colorSelect) {
                if (getEditorCursorColorSelectValue(normalizedColor) !== CUSTOM_EDITOR_CURSOR_COLOR_VALUE) {
                    delete colorSelect.dataset.forceCustom;
                }
                colorSelect.value = getEditorCursorColorSelectValue(normalizedColor);
            }
            if (colorCustomInput) {
                colorCustomInput.value = getCursorColorPickerValue(normalizedColor);
            }
            syncCursorControls(appearance.element);
            appearance._sendEditorVisual();
        });
        (appearance.element.querySelector("#hiddenBlockColor") as HTMLInputElement)?.addEventListener("change", () => {
            const hiddenBlockColorInput = appearance.element.querySelector("#hiddenBlockColor") as HTMLInputElement;
            if (hiddenBlockColorInput) {
                hiddenBlockColorInput.value = normalizeEditorHiddenBlockColor(hiddenBlockColorInput.value);
            }
            appearance._sendEditorVisual();
        });
        getCursorImageInput(appearance.element)?.addEventListener("change", () => {
            setCursorImageInputValue(appearance.element, getCursorImageInput(appearance.element)?.value || "");
            syncCursorControls(appearance.element);
            appearance._sendEditorVisual();
        });
        appearance.element.querySelectorAll("#cursorImageWidthPercent, #cursorImageHeightPercent, #cursorImageOffsetX, #cursorImageOffsetY").forEach((item) => {
            item.addEventListener("input", () => {
                syncCursorControls(appearance.element);
            });
        });
        appearance.element.querySelectorAll("#cursorImageWidthPercent, #cursorImageHeightPercent, #cursorImageOffsetX, #cursorImageOffsetY").forEach((item) => {
            item.addEventListener("change", () => {
                syncCursorControls(appearance.element);
                appearance._sendEditorVisual();
            });
        });
        appearance.element.querySelector("#cursorImageSaveToLibrary")?.addEventListener("click", async () => {
            const texts = getEditorCursorSettingTexts();
            const currentImage = getCursorImageValue(appearance.element);
            if (!currentImage) {
                showMessage(texts.invalidLibrarySource, 5000, "error");
                return;
            }
            if (currentImage.startsWith("file://")) {
                showMessage(texts.invalidRemoteImage, 5000, "error");
                return;
            }
            try {
                let result: {dataURL: string; name: string};
                if (currentImage.startsWith("data:image/")) {
                    result = {
                        dataURL: currentImage,
                        name: `${window.sourceflow.config.editor.cursorImageName || "cursor-image"}`.trim(),
                    };
                } else {
                    showMessage(texts.savingRemoteImage, 2000);
                    result = await downloadRemoteEditorCursorImage(currentImage);
                }
                const savedImages = upsertEditorCursorSavedImage(window.sourceflow.config.editor.cursorSavedImages, {
                    source: result.dataURL,
                    name: result.name,
                });
                (appearance.element.querySelector("#cursorPreset") as HTMLSelectElement).value = "image";
                window.sourceflow.config.editor.cursorSavedImages = savedImages;
                window.sourceflow.config.editor.cursorImageName = result.name;
                setCursorImageInputValue(appearance.element, result.dataURL);
                syncCursorControls(appearance.element);
                appearance._sendEditorVisual({
                    cursorPreset: "image",
                    cursorImage: result.dataURL,
                    cursorImageName: result.name,
                    cursorSavedImages: savedImages,
                });
                showMessage(texts.saveLibrarySuccess);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            }
        });
        appearance.element.querySelector("#cursorImagePick")?.addEventListener("click", () => {
            const fileInput = appearance.element.querySelector("#cursorImageFile") as HTMLInputElement;
            if (fileInput) {
                fileInput.value = "";
                fileInput.click();
            }
        });
        appearance.element.querySelector("#cursorImageClear")?.addEventListener("click", () => {
            const fileInput = appearance.element.querySelector("#cursorImageFile") as HTMLInputElement;
            if (fileInput) {
                fileInput.value = "";
            }
            window.sourceflow.config.editor.cursorImageName = "";
            setCursorImageInputValue(appearance.element, "");
            syncCursorControls(appearance.element);
            appearance._sendEditorVisual({
                cursorImage: "",
                cursorImageName: "",
                cursorImageTint: false,
            });
        });
        (appearance.element.querySelector("#cursorImageFile") as HTMLInputElement)?.addEventListener("change", async (event) => {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            if (!file) {
                return;
            }
            try {
                const result = await readEditorCursorAssetFile(file);
                (appearance.element.querySelector("#cursorPreset") as HTMLSelectElement).value = "image";
                window.sourceflow.config.editor.cursorImageName = result.name;
                setCursorImageInputValue(appearance.element, result.dataURL);
                syncCursorControls(appearance.element);
                appearance._sendEditorVisual({
                    cursorPreset: "image",
                    cursorImage: result.dataURL,
                    cursorImageName: result.name,
                });
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            } finally {
                input.value = "";
            }
        });
        appearance.element.querySelector("#cursorImageTransformReset")?.addEventListener("click", () => {
            appearance._sendEditorVisual({
                cursorImageWidthPercent: DEFAULT_EDITOR_CURSOR_IMAGE_WIDTH_PERCENT,
                cursorImageHeightPercent: DEFAULT_EDITOR_CURSOR_IMAGE_HEIGHT_PERCENT,
                cursorImageOffsetX: DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_X,
                cursorImageOffsetY: DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_Y,
            });
            showMessage(getEditorCursorSettingTexts().resetImageTransformSuccess);
        });
        getNoteBackgroundImageInput(appearance.element)?.addEventListener("change", () => {
            applyNoteBackgroundState(appearance.element, {
                noteBackgroundImage: getNoteBackgroundImageInput(appearance.element)?.value || "",
            }, true);
        });
        appearance.element.querySelectorAll("#noteBackgroundOpacity, #noteBackgroundBlur").forEach((item) => {
            item.addEventListener("input", () => {
                applyNoteBackgroundState(appearance.element);
            });
            item.addEventListener("change", () => {
                applyNoteBackgroundState(appearance.element, undefined, true);
            });
        });
        appearance.element.querySelector("#noteBackgroundImagePick")?.addEventListener("click", () => {
            if (!isBrowser()) {
                void applyImportedNoteBackgroundFile(appearance.element).catch((error) => {
                    showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
                });
                return;
            }
            const fileInput = appearance.element.querySelector("#noteBackgroundImageFile") as HTMLInputElement;
            if (fileInput) {
                fileInput.value = "";
                fileInput.click();
            }
        });
        appearance.element.querySelector("#noteBackgroundImageClear")?.addEventListener("click", () => {
            const fileInput = appearance.element.querySelector("#noteBackgroundImageFile") as HTMLInputElement;
            if (fileInput) {
                fileInput.value = "";
            }
            applyNoteBackgroundState(appearance.element, {
                noteBackgroundImage: "",
            }, true);
        });
        (appearance.element.querySelector("#noteBackgroundImageFile") as HTMLInputElement)?.addEventListener("change", async (event) => {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            if (!file) {
                return;
            }
            try {
                const result = await readEditorNoteBackgroundAssetFile(file);
                applyNoteBackgroundState(appearance.element, {
                    noteBackgroundImage: result.dataURL,
                }, true);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            } finally {
                input.value = "";
            }
        });
        getStartupPageImageInput(appearance.element)?.addEventListener("change", () => {
            setStartupPageImageInputValue(appearance.element, getStartupPageImageInput(appearance.element)?.value || "");
            syncStartupPageControls(appearance.element);
            appearance._send();
        });
        appearance.element.querySelectorAll("#startupPageOpacity, #startupPageBlur").forEach((item) => {
            item.addEventListener("input", () => {
                syncStartupPageControls(appearance.element);
            });
            item.addEventListener("change", () => {
                syncStartupPageControls(appearance.element);
                appearance._send();
            });
        });
        appearance.element.querySelector("#startupPageImagePick")?.addEventListener("click", () => {
            if (!isBrowser()) {
                void applyImportedStartupPageFile(appearance.element).catch((error) => {
                    showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
                });
                return;
            }
            const fileInput = appearance.element.querySelector("#startupPageImageFile") as HTMLInputElement;
            if (fileInput) {
                fileInput.value = "";
                fileInput.click();
            }
        });
        appearance.element.querySelector("#startupPageImageClear")?.addEventListener("click", () => {
            const fileInput = appearance.element.querySelector("#startupPageImageFile") as HTMLInputElement;
            if (fileInput) {
                fileInput.value = "";
            }
            setStartupPageImageInputValue(appearance.element, "");
            syncStartupPageControls(appearance.element);
            appearance._send();
        });
        (appearance.element.querySelector("#startupPageImageFile") as HTMLInputElement)?.addEventListener("change", async (event) => {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            if (!file) {
                return;
            }
            try {
                const result = await readStartupPageAssetFile(file);
                setStartupPageImageInputValue(appearance.element, result.dataURL);
                syncStartupPageControls(appearance.element);
                appearance._send();
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            } finally {
                input.value = "";
            }
        });
        appearance.element.querySelectorAll("#mascotEnabled, #mascotPosition, #mascotEffect").forEach((item) => {
            item.addEventListener("change", () => {
                applyMascotState(appearance.element, undefined, true);
            });
        });
        getMascotImageInput(appearance.element)?.addEventListener("change", () => {
            applyMascotState(appearance.element, {
                mascotImage: getMascotImageInput(appearance.element)?.value || "",
            }, true);
        });
        appearance.element.querySelectorAll("#mascotOpacity, #mascotScale").forEach((item) => {
            item.addEventListener("input", () => {
                applyMascotState(appearance.element);
            });
            item.addEventListener("change", () => {
                applyMascotState(appearance.element, undefined, true);
            });
        });
        appearance.element.querySelector("#mascotImagePick")?.addEventListener("click", () => {
            if (!isBrowser()) {
                void applyImportedMascotFile(appearance.element).catch((error) => {
                    showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
                });
                return;
            }
            const fileInput = appearance.element.querySelector("#mascotImageFile") as HTMLInputElement;
            if (fileInput) {
                fileInput.value = "";
                fileInput.click();
            }
        });
        appearance.element.querySelector("#mascotImageClear")?.addEventListener("click", () => {
            const fileInput = appearance.element.querySelector("#mascotImageFile") as HTMLInputElement;
            if (fileInput) {
                fileInput.value = "";
            }
            applyMascotState(appearance.element, {
                mascotImage: "",
                mascotEnabled: false,
            }, true);
        });
        (appearance.element.querySelector("#mascotImageFile") as HTMLInputElement)?.addEventListener("change", async (event) => {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            if (!file) {
                return;
            }
            try {
                const result = await readMascotAssetFile(file);
                applyMascotState(appearance.element, {
                    mascotImage: result.dataURL,
                    mascotEnabled: true,
                }, true);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            } finally {
                input.value = "";
            }
        });
        appearance.element.querySelector("#cursorSavedImageList")?.addEventListener("click", (event) => {
            const target = (event.target as HTMLElement)?.closest("[data-action]") as HTMLElement;
            if (!target) {
                return;
            }
            const savedImageID = target.getAttribute("data-cursor-saved-image-id") || "";
            const savedImage = getEditorCursorSavedImage(window.sourceflow.config.editor.cursorSavedImages, savedImageID);
            if (!savedImage) {
                return;
            }
            const action = target.getAttribute("data-action");
            if (action === "cursor-saved-apply") {
                (appearance.element.querySelector("#cursorPreset") as HTMLSelectElement).value = "image";
                window.sourceflow.config.editor.cursorImageName = savedImage.name;
                setCursorImageInputValue(appearance.element, savedImage.source);
                syncCursorControls(appearance.element);
                appearance._sendEditorVisual({
                    cursorPreset: "image",
                    cursorImage: savedImage.source,
                    cursorImageName: savedImage.name,
                });
                return;
            }
            if (action === "cursor-saved-delete") {
                const nextSavedImages = removeEditorCursorSavedImage(window.sourceflow.config.editor.cursorSavedImages, savedImageID);
                window.sourceflow.config.editor.cursorSavedImages = nextSavedImages;
                const currentImage = getCursorImageValue(appearance.element);
                const overrides: Partial<Config.IEditor> = {
                    cursorSavedImages: nextSavedImages,
                };
                if (currentImage === savedImage.source) {
                    window.sourceflow.config.editor.cursorImageName = "";
                    setCursorImageInputValue(appearance.element, "");
                    overrides.cursorImage = "";
                    overrides.cursorImageName = "";
                    overrides.cursorImageTint = false;
                }
                syncCursorControls(appearance.element);
                appearance._sendEditorVisual(overrides);
                showMessage(getEditorCursorSettingTexts().deleteLibrarySuccess);
            }
        });
        setNoteBackgroundImageInputValue(appearance.element, window.sourceflow.config.editor.noteBackgroundImage);
        setStartupPageImageInputValue(appearance.element, window.sourceflow.config.appearance.startupPageImage);
        setMascotImageInputValue(appearance.element, window.sourceflow.config.appearance.mascotImage);
        syncCursorControls(appearance.element);
        syncNoteBackgroundControls(appearance.element);
        syncStartupPageControls(appearance.element);
        syncMascotControls(appearance.element);
    },
    onSetAppearance(data: Config.IAppearance) {
        if (data.lang !== window.sourceflow.config.appearance.lang) {
            exportLayout({
                cb() {
                    window.location.reload();
                },
                errorExit: false,
            });
            return;
        }

        window.sourceflow.config.appearance = data;
        if (appearance.element) {
            const modeElement = appearance.element.querySelector("#mode") as HTMLSelectElement;
            if (modeElement) {
                if (data.modeOS) {
                    modeElement.value = "2";
                } else {
                    modeElement.value = data.mode === 0 ? "0" : "1";
                }
            }
            const themeLightElement = appearance.element.querySelector("#themeLight") as HTMLSelectElement;
            if (themeLightElement) {
                themeLightElement.innerHTML = genOptions(window.sourceflow.config.appearance.lightThemes, window.sourceflow.config.appearance.themeLight);
            }
            const themeDarkElement = appearance.element.querySelector("#themeDark") as HTMLSelectElement;
            if (themeDarkElement) {
                themeDarkElement.innerHTML = genOptions(window.sourceflow.config.appearance.darkThemes, window.sourceflow.config.appearance.themeDark);
            }
            const codeBlockThemeLightElement = appearance.element.querySelector("#codeBlockThemeLight") as HTMLSelectElement;
            if (codeBlockThemeLightElement) {
                codeBlockThemeLightElement.value = data.codeBlockThemeLight;
            }
            const codeBlockThemeDarkElement = appearance.element.querySelector("#codeBlockThemeDark") as HTMLSelectElement;
            if (codeBlockThemeDarkElement) {
                codeBlockThemeDarkElement.value = data.codeBlockThemeDark;
            }
            const iconElement = appearance.element.querySelector("#icon") as HTMLSelectElement;
            if (iconElement) {
                iconElement.innerHTML = genOptions(window.sourceflow.config.appearance.icons, window.sourceflow.config.appearance.icon);
            }
            const langElement = appearance.element.querySelector("#lang") as HTMLSelectElement;
            if (langElement) {
                langElement.value = data.lang;
            }
            const codeBlockSkinLightElement = appearance.element.querySelector("#codeBlockSkinLight") as HTMLSelectElement;
            if (codeBlockSkinLightElement) {
                codeBlockSkinLightElement.value = normalizeCodeBlockSkin(data.codeBlockSkinLight);
            }
            const codeBlockSkinDarkElement = appearance.element.querySelector("#codeBlockSkinDark") as HTMLSelectElement;
            if (codeBlockSkinDarkElement) {
                codeBlockSkinDarkElement.value = normalizeCodeBlockSkin(data.codeBlockSkinDark);
            }
            const closeButtonBehaviorElement = appearance.element.querySelector("#closeButtonBehavior") as HTMLInputElement;
            if (closeButtonBehaviorElement) {
                closeButtonBehaviorElement.checked = data.closeButtonBehavior !== 0;
            }
            const hideStatusBarElement = appearance.element.querySelector("#hideStatusBar") as HTMLInputElement;
            if (hideStatusBarElement) {
                hideStatusBarElement.checked = !!data.hideStatusBar;
            }
            const startupPageOpacityInput = appearance.element.querySelector("#startupPageOpacity") as HTMLInputElement;
            const startupPageBlurInput = appearance.element.querySelector("#startupPageBlur") as HTMLInputElement;
            if (startupPageOpacityInput) {
                startupPageOpacityInput.value = `${normalizeStartupPageOpacity(data.startupPageImage
                    ? data.startupPageOpacity
                    : (data.startupPageOpacity || DEFAULT_STARTUP_PAGE_OPACITY))}`;
            }
            if (startupPageBlurInput) {
                startupPageBlurInput.value = `${normalizeStartupPageBlur(data.startupPageBlur)}`;
            }
            setStartupPageImageInputValue(appearance.element, data.startupPageImage);
            syncStartupPageControls(appearance.element);
            const mascotEnabledInput = appearance.element.querySelector("#mascotEnabled") as HTMLInputElement;
            const mascotPositionSelect = appearance.element.querySelector("#mascotPosition") as HTMLSelectElement;
            const mascotEffectSelect = appearance.element.querySelector("#mascotEffect") as HTMLSelectElement;
            const mascotOpacityInput = appearance.element.querySelector("#mascotOpacity") as HTMLInputElement;
            const mascotScaleInput = appearance.element.querySelector("#mascotScale") as HTMLInputElement;
            if (mascotEnabledInput) {
                mascotEnabledInput.checked = normalizeMascotEnabled(data.mascotEnabled);
            }
            if (mascotPositionSelect) {
                mascotPositionSelect.value = normalizeMascotPosition(data.mascotPosition);
            }
            if (mascotEffectSelect) {
                mascotEffectSelect.value = normalizeMascotEffect(data.mascotEffect);
            }
            if (mascotOpacityInput) {
                mascotOpacityInput.value = `${normalizeMascotOpacity(data.mascotOpacity)}`;
            }
            if (mascotScaleInput) {
                mascotScaleInput.value = `${normalizeMascotScale(data.mascotScale)}`;
            }
            setMascotImageInputValue(appearance.element, data.mascotImage);
            syncMascotControls(appearance.element);
        }
        loadAssets(data);
        document.querySelector("#barMode use")?.setAttribute("xlink:href", `#icon${window.sourceflow.config.appearance.modeOS ? "Mode" : (window.sourceflow.config.appearance.mode === 0 ? "Light" : "Dark")}`);
    }
};
