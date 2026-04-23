import {fetchPost} from "../../util/fetch";
import {genLangOptions, genOptions} from "../../util/genOptions";
import {openModel} from "../menu/model";
import {setStatusBar} from "../../config/util/setStatusBar";
import {loadAssets, setInlineStyle} from "../../util/assets";
import {showMessage} from "../../dialog/message";
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
} from "../../editor/cursor";
import {
    DEFAULT_EDITOR_NOTE_BACKGROUND_BLUR,
    DEFAULT_EDITOR_NOTE_BACKGROUND_OPACITY,
    getEditorNoteBackgroundDisplayValue,
    getEditorNoteBackgroundSettingTexts,
    normalizeEditorNoteBackgroundBlur,
    normalizeEditorNoteBackgroundImage,
    normalizeEditorNoteBackgroundOpacity,
    readEditorNoteBackgroundAssetFile
} from "../../editor/noteBackground";
import {
    getEditorHiddenBlockSettingTexts,
    normalizeEditorHiddenBlockColor
} from "../../editor/hiddenBlock";
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
} from "../../appearance/startupPage";
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
} from "../../appearance/mascot";
import {
    getCodeBlockSkinOptions,
    getCodeBlockSkinSettingTexts,
    normalizeCodeBlockSkin
} from "../../appearance/codeBlockSkin";
import {getRenderableImageURL} from "../../appearance/imageAsset";
import {escapeAttr, escapeHtml} from "../../util/escape";

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

const getCursorColorValue = (root: HTMLElement) => {
    const customValue = (root.querySelector("#cursorColorCustom") as HTMLInputElement)?.value || "";
    return normalizeEditorCursorColor(customValue);
};

const shouldKeepCursorCustomSelection = (root: HTMLElement) => {
    return (root.querySelector("#cursorColor") as HTMLSelectElement)?.dataset.forceCustom === "true";
};

const getCursorImageInput = (root: HTMLElement) => {
    return root.querySelector("#cursorImage") as HTMLInputElement;
};

const setCursorImageInputValue = (root: HTMLElement, value: string) => {
    const input = getCursorImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeEditorCursorImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getEditorCursorImageDisplayValue(normalized);
};

const getCursorImageValue = (root: HTMLElement) => {
    const input = getCursorImageInput(root);
    return normalizeEditorCursorImage(input?.dataset.sourceValue || input?.value || "");
};

const getCursorSavedImages = () => {
    return normalizeEditorCursorSavedImages(window.sourceflow.config.editor.cursorSavedImages);
};

const getCursorImageWidthPercentValue = (root: HTMLElement) => {
    return normalizeEditorCursorImageWidthPercent(Number((root.querySelector("#cursorImageWidthPercent") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_WIDTH_PERCENT));
};

const getCursorImageHeightPercentValue = (root: HTMLElement) => {
    return normalizeEditorCursorImageHeightPercent(Number((root.querySelector("#cursorImageHeightPercent") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_HEIGHT_PERCENT));
};

const getCursorImageOffsetXValue = (root: HTMLElement) => {
    return normalizeEditorCursorImageOffset(Number((root.querySelector("#cursorImageOffsetX") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_X));
};

const getCursorImageOffsetYValue = (root: HTMLElement) => {
    return normalizeEditorCursorImageOffset(Number((root.querySelector("#cursorImageOffsetY") as HTMLInputElement)?.value || DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_Y));
};

const getHiddenBlockColorValue = (root: HTMLElement) => {
    return normalizeEditorHiddenBlockColor((root.querySelector("#hiddenBlockColor") as HTMLInputElement)?.value || "");
};

const getNoteBackgroundImageInput = (root: HTMLElement) => {
    return root.querySelector("#noteBackgroundImage") as HTMLInputElement;
};

const setNoteBackgroundImageInputValue = (root: HTMLElement, value: string) => {
    const input = getNoteBackgroundImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeEditorNoteBackgroundImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getEditorNoteBackgroundDisplayValue(normalized);
};

const getNoteBackgroundImageValue = (root: HTMLElement) => {
    const input = getNoteBackgroundImageInput(root);
    return normalizeEditorNoteBackgroundImage(input?.dataset.sourceValue || input?.value || "");
};

const getNoteBackgroundOpacityValue = (root: HTMLElement) => {
    return normalizeEditorNoteBackgroundOpacity(Number((root.querySelector("#noteBackgroundOpacity") as HTMLInputElement)?.value || DEFAULT_EDITOR_NOTE_BACKGROUND_OPACITY));
};

const getNoteBackgroundBlurValue = (root: HTMLElement) => {
    return normalizeEditorNoteBackgroundBlur(Number((root.querySelector("#noteBackgroundBlur") as HTMLInputElement)?.value || DEFAULT_EDITOR_NOTE_BACKGROUND_BLUR));
};

const getStartupPageImageInput = (root: HTMLElement) => {
    return root.querySelector("#startupPageImage") as HTMLInputElement;
};

const setStartupPageImageInputValue = (root: HTMLElement, value: string) => {
    const input = getStartupPageImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeStartupPageImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getStartupPageDisplayValue(normalized);
};

const getStartupPageImageValue = (root: HTMLElement) => {
    const input = getStartupPageImageInput(root);
    return normalizeStartupPageImage(input?.dataset.sourceValue || input?.value || "");
};

const getStartupPageOpacityValue = (root: HTMLElement) => {
    return normalizeStartupPageOpacity(Number((root.querySelector("#startupPageOpacity") as HTMLInputElement)?.value || DEFAULT_STARTUP_PAGE_OPACITY));
};

const getStartupPageBlurValue = (root: HTMLElement) => {
    return normalizeStartupPageBlur(Number((root.querySelector("#startupPageBlur") as HTMLInputElement)?.value || DEFAULT_STARTUP_PAGE_BLUR));
};

const getMascotImageInput = (root: HTMLElement) => {
    return root.querySelector("#mascotImage") as HTMLInputElement;
};

const setMascotImageInputValue = (root: HTMLElement, value: string) => {
    const input = getMascotImageInput(root);
    if (!input) {
        return;
    }
    const normalized = normalizeMascotImage(value);
    input.dataset.sourceValue = normalized;
    input.value = getMascotDisplayValue(normalized);
};

const getMascotImageValue = (root: HTMLElement) => {
    const input = getMascotImageInput(root);
    return normalizeMascotImage(input?.dataset.sourceValue || input?.value || "");
};

const getMascotEnabledValue = (root: HTMLElement) => {
    return normalizeMascotEnabled((root.querySelector("#mascotEnabled") as HTMLInputElement)?.checked);
};

const getMascotPositionValue = (root: HTMLElement) => {
    return normalizeMascotPosition((root.querySelector("#mascotPosition") as HTMLSelectElement)?.value || "");
};

const getMascotEffectValue = (root: HTMLElement) => {
    return normalizeMascotEffect((root.querySelector("#mascotEffect") as HTMLSelectElement)?.value || DEFAULT_MASCOT_EFFECT);
};

const getMascotOpacityValue = (root: HTMLElement) => {
    return normalizeMascotOpacity(Number((root.querySelector("#mascotOpacity") as HTMLInputElement)?.value || DEFAULT_MASCOT_OPACITY));
};

const getMascotScaleValue = (root: HTMLElement) => {
    return normalizeMascotScale(Number((root.querySelector("#mascotScale") as HTMLInputElement)?.value || DEFAULT_MASCOT_SCALE));
};

const getNoteBackgroundState = (root: HTMLElement, overrides?: Partial<Config.IEditor>) => ({
    noteBackgroundImage: overrides?.noteBackgroundImage !== undefined
        ? normalizeEditorNoteBackgroundImage(`${overrides.noteBackgroundImage || ""}`)
        : getNoteBackgroundImageValue(root),
    noteBackgroundOpacity: overrides?.noteBackgroundOpacity ?? getNoteBackgroundOpacityValue(root),
    noteBackgroundBlur: overrides?.noteBackgroundBlur ?? getNoteBackgroundBlurValue(root),
});

const applyNoteBackgroundState = (root: HTMLElement, persist?: (overrides?: Partial<Config.IEditor>) => void, overrides?: Partial<Config.IEditor>, shouldPersist = false) => {
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
    if (shouldPersist && persist) {
        persist(nextState);
    }
    return nextState;
};

const getMascotState = (root: HTMLElement, overrides?: Partial<Config.IAppearance>) => {
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

const applyMascotState = (root: HTMLElement, persist?: () => void, overrides?: Partial<Config.IAppearance>, shouldPersist = false) => {
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
    if (shouldPersist && persist) {
        persist();
    }
    return nextState;
};

const renderCursorImagePreview = (root: HTMLElement) => {
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

const renderNoteBackgroundPreview = (root: HTMLElement) => {
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

const renderStartupPagePreview = (root: HTMLElement) => {
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

const renderMascotPreview = (root: HTMLElement) => {
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

const renderCursorSavedImageList = (root: HTMLElement) => {
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
        return `<div class="fn__flex" style="gap:8px;align-items:center;" data-cursor-saved-image-id="${escapeAttr(item.id)}">
    <span class="fn__flex-center" role="img" aria-label="${escapeAttr(item.name)}" style="width:40px;height:40px;min-width:40px;min-height:40px;max-width:40px;max-height:40px;border-radius:8px;overflow:hidden;background-color:var(--b3-theme-surface-lighter);background-image:url(&quot;${escapeCSSURLAttr(item.source)}&quot;);background-position:center;background-repeat:no-repeat;background-size:contain;flex:0 0 40px;"></span>
    <span class="fn__ellipsis fn__flex-1" style="min-width:0;">${escapeHtml(item.name)}</span>
    ${active ? `<span class="b3-chip b3-chip--small">${escapeHtml(texts.currentLibraryImage)}</span>` : ""}
    <button class="b3-button b3-button--outline" data-action="cursor-saved-apply" data-cursor-saved-image-id="${escapeAttr(item.id)}">${escapeHtml(texts.applyLibraryImage)}</button>
    <button class="b3-button b3-button--outline" data-action="cursor-saved-delete" data-cursor-saved-image-id="${escapeAttr(item.id)}">${escapeHtml(texts.deleteLibraryImage)}</button>
</div>`;
    }).join(`<div class="fn__hr"></div>`);
};

const syncCursorControls = (root: HTMLElement) => {
    const texts = getEditorCursorSettingTexts();
    const colorValue = getCursorColorValue(root);
    (root.querySelector("#cursorColor") as HTMLSelectElement).value = shouldKeepCursorCustomSelection(root) ? CUSTOM_EDITOR_CURSOR_COLOR_VALUE : getEditorCursorColorSelectValue(colorValue);
    (root.querySelector("#cursorColorCustom") as HTMLInputElement).value = getCursorColorPickerValue(colorValue);
    const blinkSwitch = root.querySelector("#cursorBlink") as HTMLInputElement;
    const blinkEffectSelect = root.querySelector("#cursorBlinkEffect") as HTMLSelectElement;
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
    const saveButton = root.querySelector("#cursorImageSaveToLibrary") as HTMLButtonElement;
    const svgImage = isEditorCursorSVGImage(imageValue);
    tintSwitch.disabled = !svgImage;
    if (!svgImage) {
        tintSwitch.checked = false;
    }
    if (saveButton) {
        saveButton.disabled = !imageValue || imageValue.startsWith("file://");
    }
    tintHint.textContent = svgImage
        ? texts.imageTintHint
        : (window.sourceflow.config.lang === "zh_CN" ? "仅 SVG 图片支持着色；PNG/JPG/GIF/WEBP 会保持原图。" : "Only SVG images support tinting; PNG/JPG/GIF/WEBP keep their original pixels.");
    imageMeta.innerHTML = imageValue
        ? `${texts.imageActiveLabel}：<code class="fn__code">${escapeAttr(imageName || imageValue)}</code>`
        : texts.imageActiveNone;
    (root.querySelector("#cursorImageWidthPercent") as HTMLInputElement).value = `${getCursorImageWidthPercentValue(root)}`;
    (root.querySelector("#cursorImageHeightPercent") as HTMLInputElement).value = `${getCursorImageHeightPercentValue(root)}`;
    (root.querySelector("#cursorImageOffsetX") as HTMLInputElement).value = `${getCursorImageOffsetXValue(root)}`;
    (root.querySelector("#cursorImageOffsetY") as HTMLInputElement).value = `${getCursorImageOffsetYValue(root)}`;
    renderCursorImagePreview(root);
    renderCursorSavedImageList(root);
};

const syncNoteBackgroundControls = (root: HTMLElement) => {
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

const syncStartupPageControls = (root: HTMLElement) => {
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

const syncMascotControls = (root: HTMLElement) => {
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

export const initAppearance = () => {
    const cursorTexts = getEditorCursorSettingTexts();
    const noteBackgroundTexts = getEditorNoteBackgroundSettingTexts();
    const codeBlockSkinTexts = getCodeBlockSkinSettingTexts();
    const hiddenBlockTexts = getEditorHiddenBlockSettingTexts();
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
    openModel({
        title: window.sourceflow.languages.appearance,
        icon: "iconTheme",
        html: `<div class="b3-label">
    ${window.sourceflow.languages.appearance4}
    <div class="fn__hr"></div>
    <select class="b3-select fn__block" id="mode">
      <option value="0" ${(window.sourceflow.config.appearance.mode === 0 && !window.sourceflow.config.appearance.modeOS) ? "selected" : ""}>${window.sourceflow.languages.themeLight}</option>
      <option value="1" ${(window.sourceflow.config.appearance.mode === 1 && !window.sourceflow.config.appearance.modeOS) ? "selected" : ""}>${window.sourceflow.languages.themeDark}</option>
      <option value="2" ${window.sourceflow.config.appearance.modeOS ? "selected" : ""}>${window.sourceflow.languages.themeOS}</option>
    </select>
    <div class="b3-label__text">${window.sourceflow.languages.appearance5}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.theme}
    <div class="fn__hr"></div>
    <select class="b3-select fn__block" id="themeLight">
      ${genOptions(window.sourceflow.config.appearance.lightThemes, window.sourceflow.config.appearance.themeLight)}
    </select>
    <div class="b3-label__text">${window.sourceflow.languages.theme11}</div>
    <div class="fn__hr"></div>
    <select class="b3-select fn__block" id="themeDark">
       ${genOptions(window.sourceflow.config.appearance.darkThemes, window.sourceflow.config.appearance.themeDark)}
    </select>
    <div class="b3-label__text">${window.sourceflow.languages.theme12}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.icon}
    <div class="fn__hr"></div>
    <select class="b3-select fn__block" id="icon">
        ${genOptions(window.sourceflow.config.appearance.icons, window.sourceflow.config.appearance.icon)}
    </select>
    <div class="b3-label__text">${window.sourceflow.languages.theme2}</div>
</div>
<div class="b3-label">
    ${codeBlockSkinTexts.title}
    <div class="b3-label__text">${codeBlockSkinTexts.detail}</div>
    <div class="fn__hr"></div>
    <select class="b3-select fn__block" id="codeBlockSkinLight">
      ${codeBlockSkinLightOptionsHTML}
    </select>
    <div class="b3-label__text">${codeBlockSkinTexts.light}</div>
    <div class="fn__hr"></div>
    <select class="b3-select fn__block" id="codeBlockSkinDark">
      ${codeBlockSkinDarkOptionsHTML}
    </select>
    <div class="b3-label__text">${codeBlockSkinTexts.dark}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.language}
    <div class="fn__hr"></div>
    <select id="lang" class="b3-select fn__block">${genLangOptions(window.sourceflow.config.langs, window.sourceflow.config.appearance.lang)}</select>
    <div class="b3-label__text">${window.sourceflow.languages.language1}</div>
</div>
<div class="b3-label">
    ${cursorTexts.title}
    <div class="b3-label__text">${cursorTexts.detail}</div>
    <div class="fn__hr"></div>
    <select id="cursorPreset" class="b3-select fn__block">${cursorPresetOptionsHTML}</select>
    <div class="b3-label__text">${cursorTexts.preset}</div>
    <div class="fn__hr"></div>
    <select id="cursorColor" class="b3-select fn__block">${cursorColorOptionsHTML}</select>
    <div class="b3-label__text">${cursorTexts.color}</div>
    <div class="fn__hr"></div>
    <label class="fn__flex">
        <div class="fn__flex-1">
            ${cursorTexts.blink}
            <div class="b3-label__text">${cursorTexts.blinkHint}</div>
        </div>
        <span class="fn__space"></span>
        <input class="b3-switch fn__flex-center" id="cursorBlink" type="checkbox"${window.sourceflow.config.editor.cursorBlink !== false ? " checked" : ""}>
    </label>
    <div class="fn__hr"></div>
    <select id="cursorBlinkEffect" class="b3-select fn__block"${window.sourceflow.config.editor.cursorBlink !== false ? "" : " disabled"}>${cursorBlinkEffectOptionsHTML}</select>
    <div class="b3-label__text">${cursorTexts.blinkEffect}</div>
    <div class="b3-label__text">${cursorTexts.blinkEffectHint}</div>
    <div class="fn__hr"></div>
    <input id="cursorColorCustom" class="b3-text-field fn__block" type="color" title="${escapeAttr(cursorTexts.customColorHint)}" value="${escapeAttr(getCursorColorPickerValue(normalizedCursorColor))}">
    <div class="b3-label__text">${cursorTexts.customColor}</div>
    <div class="b3-label__text">${cursorTexts.customColorHint}</div>
    <div class="fn__hr"></div>
    <input id="hiddenBlockColor" class="b3-text-field fn__block" placeholder="${escapeAttr(hiddenBlockTexts.hint)}" value="${escapeAttr(hiddenBlockColor)}">
    <div class="b3-label__text">${hiddenBlockTexts.color}</div>
    <div class="b3-label__text">${hiddenBlockTexts.hint}</div>
    <div class="fn__hr"></div>
    <input id="cursorImage" class="b3-text-field fn__block" data-source-value="${escapeAttr(normalizedCursorImage)}" placeholder="${escapeAttr("https://example.com/cursor.svg")}" value="${escapeAttr(cursorImageDisplayValue)}">
    <div class="b3-label__text">${cursorTexts.imageSource}</div>
    <div class="b3-label__text">${cursorTexts.imageSourceHint}</div>
    <div class="fn__hr"></div>
    <div class="fn__flex">
        <button class="b3-button b3-button--outline fn__flex-1" id="cursorImageSaveToLibrary">${cursorTexts.saveImageToLibrary}</button>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-1" id="cursorImagePick">${cursorTexts.uploadImage}</button>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-1" id="cursorImageClear">${cursorTexts.clearImage}</button>
    </div>
    <input class="fn__none" type="file" id="cursorImageFile" accept="image/*,.svg">
    <div class="b3-label__text">${cursorTexts.imageFile}</div>
    <div class="b3-label__text">${cursorTexts.imageFileHint}</div>
    <div class="b3-label__text" id="cursorImageMeta">${normalizedCursorImage ? `${cursorTexts.imageActiveLabel}：<code class="fn__code">${escapeAttr(window.sourceflow.config.editor.cursorImageName || normalizedCursorImage)}</code>` : cursorTexts.imageActiveNone}</div>
    <div class="fn__hr"></div>
    <div style="width:112px;height:112px;border-radius:12px;border:1px solid var(--b3-border-color);background:linear-gradient(135deg,var(--b3-theme-surface) 0%, var(--b3-theme-surface-lighter) 100%);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;margin:0 auto;" id="cursorImagePreview">${normalizedCursorImage ? `<img src="${escapeAttr(normalizedCursorImage)}" alt="${escapeAttr(window.sourceflow.config.editor.cursorImageName || "cursor-image")}" style="max-width:72px;max-height:72px;object-fit:contain;display:block;">` : `<div class="b3-label__text">${escapeHtml(cursorTexts.previewEmpty)}</div>`}</div>
    <div class="b3-label__text">${cursorTexts.preview}</div>
    <div class="b3-label__text">${cursorTexts.previewHint}</div>
    <div class="fn__hr"></div>
    <label class="fn__flex">
        <div class="fn__flex-1">
            ${cursorTexts.imageTint}
            <div class="b3-label__text" id="cursorImageTintHint">${isEditorCursorSVGImage(normalizedCursorImage) ? cursorTexts.imageTintHint : (window.sourceflow.config.lang === "zh_CN" ? "仅 SVG 图片支持着色；PNG/JPG/GIF/WEBP 会保持原图。" : "Only SVG images support tinting; PNG/JPG/GIF/WEBP keep their original pixels.")}</div>
        </div>
        <span class="fn__space"></span>
        <input class="b3-switch fn__flex-center" id="cursorImageTint" type="checkbox"${window.sourceflow.config.editor.cursorImageTint ? " checked" : ""}${isEditorCursorSVGImage(normalizedCursorImage) ? "" : " disabled"}>
    </label>
    <div class="fn__hr"></div>
    <input id="cursorImageWidthPercent" class="b3-text-field fn__block" type="number" min="40" max="300" step="1" value="${cursorImageWidthPercent}">
    <div class="b3-label__text">${cursorTexts.imageWidth}</div>
    <div class="b3-label__text">${cursorTexts.imageSizeHint}</div>
    <div class="fn__hr"></div>
    <input id="cursorImageHeightPercent" class="b3-text-field fn__block" type="number" min="40" max="300" step="1" value="${cursorImageHeightPercent}">
    <div class="b3-label__text">${cursorTexts.imageHeight}</div>
    <div class="b3-label__text">${cursorTexts.imagePercentUnit}</div>
    <div class="fn__hr"></div>
    <input id="cursorImageOffsetX" class="b3-text-field fn__block" type="number" min="-96" max="96" step="1" value="${cursorImageOffsetX}">
    <div class="b3-label__text">${cursorTexts.imageOffsetX}</div>
    <div class="b3-label__text">${cursorTexts.imagePositionHint}</div>
    <div class="fn__hr"></div>
    <input id="cursorImageOffsetY" class="b3-text-field fn__block" type="number" min="-96" max="96" step="1" value="${cursorImageOffsetY}">
    <div class="b3-label__text">${cursorTexts.imageOffsetY}</div>
    <div class="b3-label__text">${cursorTexts.imageOffsetUnit}</div>
    <div class="fn__hr"></div>
    <button class="b3-button b3-button--outline fn__block" id="cursorImageTransformReset">${cursorTexts.resetImageTransform}</button>
    <div class="fn__hr"></div>
    <div>${cursorTexts.imageLibrary}</div>
    <div class="b3-label__text">${cursorTexts.imageLibraryHint}</div>
    <div class="fn__hr"></div>
    <div id="cursorSavedImageList"></div>
</div>
<div class="b3-label">
    ${noteBackgroundTexts.title}
    <div class="b3-label__text">${noteBackgroundTexts.detail}</div>
    <div class="fn__hr"></div>
    <input id="noteBackgroundImage" class="b3-text-field fn__block" placeholder="${escapeAttr("https://example.com/background.webp")}" value="${escapeAttr(noteBackgroundDisplayValue)}">
    <div class="b3-label__text">${noteBackgroundTexts.source}</div>
    <div class="b3-label__text">${noteBackgroundTexts.sourceHint}</div>
    <div class="fn__hr"></div>
    <div style="width:160px;height:104px;border-radius:14px;border:1px solid var(--b3-border-color);background:linear-gradient(135deg,var(--b3-theme-surface) 0%, var(--b3-theme-surface-lighter) 100%);position:relative;overflow:hidden;margin:0 auto;" id="noteBackgroundPreview"></div>
    <div class="b3-label__text">${noteBackgroundTexts.preview}</div>
    <div class="b3-label__text" id="noteBackgroundMeta">${normalizedNoteBackgroundImage ? `<code class="fn__code">${escapeAttr(normalizedNoteBackgroundImage.startsWith("data:image/") ? (window.sourceflow.config.lang === "zh_CN" ? "已内嵌本地背景图" : "Embedded local background image") : normalizedNoteBackgroundImage)}</code>` : noteBackgroundTexts.previewEmpty}</div>
    <div class="fn__hr"></div>
    <input id="noteBackgroundOpacity" class="b3-text-field fn__block" type="number" min="0" max="100" step="1" value="${noteBackgroundOpacity}">
    <div class="b3-label__text">${noteBackgroundTexts.opacity}</div>
    <div class="b3-label__text">${noteBackgroundTexts.opacityHint}</div>
    <div class="fn__hr"></div>
    <input id="noteBackgroundBlur" class="b3-text-field fn__block" type="number" min="0" max="32" step="1" value="${noteBackgroundBlur}">
    <div class="b3-label__text">${noteBackgroundTexts.blur}</div>
    <div class="b3-label__text">${noteBackgroundTexts.blurHint}</div>
    <div class="fn__hr"></div>
    <div class="fn__flex">
        <button class="b3-button b3-button--outline fn__flex-1" id="noteBackgroundImagePick">${noteBackgroundTexts.uploadImage}</button>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-1" id="noteBackgroundImageClear">${noteBackgroundTexts.clearImage}</button>
    </div>
    <input class="fn__none" type="file" id="noteBackgroundImageFile" accept="image/*,.svg">
    <div class="b3-label__text">${noteBackgroundTexts.localFileHint}</div>
</div>
<div class="b3-label">
    ${startupPageTexts.title}
    <div class="b3-label__text">${startupPageTexts.detail}</div>
    <div class="fn__hr"></div>
    <input id="startupPageImage" class="b3-text-field fn__block" placeholder="${escapeAttr("https://example.com/startup.webp")}" value="${escapeAttr(startupPageDisplayValue)}">
    <div class="b3-label__text">${startupPageTexts.source}</div>
    <div class="b3-label__text">${startupPageTexts.sourceHint}</div>
    <div class="fn__hr"></div>
    <div style="width:176px;height:112px;border-radius:14px;border:1px solid var(--b3-border-color);background:#1e1e1e;position:relative;overflow:hidden;margin:0 auto;" id="startupPagePreview"></div>
    <div class="b3-label__text">${startupPageTexts.preview}</div>
    <div class="b3-label__text" id="startupPageMeta">${normalizedStartupPageImage ? `<code class="fn__code">${escapeAttr(normalizedStartupPageImage.startsWith("data:image/") ? startupPageTexts.embeddedLabel : normalizedStartupPageImage)}</code>` : startupPageTexts.previewEmpty}</div>
    <div class="fn__hr"></div>
    <input id="startupPageOpacity" class="b3-text-field fn__block" type="number" min="0" max="100" step="1" value="${startupPageOpacity}">
    <div class="b3-label__text">${startupPageTexts.opacity}</div>
    <div class="b3-label__text">${startupPageTexts.opacityHint}</div>
    <div class="fn__hr"></div>
    <input id="startupPageBlur" class="b3-text-field fn__block" type="number" min="0" max="32" step="1" value="${startupPageBlur}">
    <div class="b3-label__text">${startupPageTexts.blur}</div>
    <div class="b3-label__text">${startupPageTexts.blurHint}</div>
    <div class="fn__hr"></div>
    <div class="fn__flex">
        <button class="b3-button b3-button--outline fn__flex-1" id="startupPageImagePick">${startupPageTexts.uploadImage}</button>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-1" id="startupPageImageClear">${startupPageTexts.clearImage}</button>
    </div>
    <input class="fn__none" type="file" id="startupPageImageFile" accept="image/*,.svg">
    <div class="b3-label__text">${startupPageTexts.localFileHint}</div>
</div>
<div class="b3-label">
    ${mascotTexts.title}
    <div class="b3-label__text">${mascotTexts.detail}</div>
    <div class="b3-label__text">${mascotTexts.controlHint}</div>
    <div class="fn__hr"></div>
    <label class="fn__flex">
        <div class="fn__flex-1">
            ${mascotTexts.enabled}
            <div class="b3-label__text">${mascotTexts.enabledHint}</div>
        </div>
        <span class="fn__space"></span>
        <input class="b3-switch fn__flex-center" id="mascotEnabled" type="checkbox"${mascotEnabled ? " checked" : ""}>
    </label>
    <div class="fn__hr"></div>
    <input id="mascotImage" class="b3-text-field fn__block" placeholder="${escapeAttr("https://example.com/mascot.webp")}" value="${escapeAttr(mascotDisplayValue)}">
    <div class="b3-label__text">${mascotTexts.source}</div>
    <div class="b3-label__text">${mascotTexts.sourceHint}</div>
    <div class="fn__hr"></div>
    <div style="width:176px;height:132px;border-radius:14px;border:1px solid var(--b3-border-color);background:var(--b3-theme-background);position:relative;overflow:hidden;margin:0 auto;" id="mascotPreview"></div>
    <div class="b3-label__text">${mascotTexts.preview}</div>
    <div class="b3-label__text" id="mascotMeta">${normalizedMascotImage ? `<code class="fn__code">${escapeAttr(normalizedMascotImage.startsWith("data:image/") ? mascotTexts.embeddedLabel : normalizedMascotImage)}</code>` : mascotTexts.previewEmpty}</div>
    <div class="fn__hr"></div>
    <select id="mascotPosition" class="b3-select fn__block">${mascotPositionOptionsHTML}</select>
    <div class="b3-label__text">${mascotTexts.position}</div>
    <div class="fn__hr"></div>
    <select id="mascotEffect" class="b3-select fn__block">${mascotEffectOptionsHTML}</select>
    <div class="b3-label__text">${mascotTexts.effect}</div>
    <div class="fn__hr"></div>
    <input id="mascotOpacity" class="b3-text-field fn__block" type="number" min="0" max="100" step="1" value="${mascotOpacity}">
    <div class="b3-label__text">${mascotTexts.opacity}</div>
    <div class="b3-label__text">${mascotTexts.opacityHint}</div>
    <div class="fn__hr"></div>
    <input id="mascotScale" class="b3-text-field fn__block" type="number" min="40" max="180" step="1" value="${mascotScale}">
    <div class="b3-label__text">${mascotTexts.scale}</div>
    <div class="b3-label__text">${mascotTexts.scaleHint}</div>
    <div class="fn__hr"></div>
    <div class="fn__flex">
        <button class="b3-button b3-button--outline fn__flex-1" id="mascotImagePick">${mascotTexts.uploadImage}</button>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-1" id="mascotImageClear">${mascotTexts.clearImage}</button>
    </div>
    <input class="fn__none" type="file" id="mascotImageFile" accept="image/*,.svg">
    <div class="b3-label__text">${mascotTexts.localFileHint}</div>
</div>
<div class="b3-label">
    <label class="fn__flex">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.appearance16}
            <div class="b3-label__text">${window.sourceflow.languages.appearance17}</div>
        </div>
        <span class="fn__space"></span>
        <input class="b3-switch fn__flex-center" id="hideStatusBar" type="checkbox"${window.sourceflow.config.appearance.hideStatusBar ? " checked" : ""}>
    </label>
    <div class="fn__hr"></div>
    <button class="b3-button b3-button--outline fn__block" data-action="hideStatusBarSetting">
       <svg><use xlink:href="#iconSettings"></use></svg>${window.sourceflow.languages.config}
    </button>
    <div class="b3-label__text">${window.sourceflow.languages.appearance18}</div>
</div>`,
        bindEvent(modelMainElement: HTMLElement) {
            setStatusBar(modelMainElement.querySelector('[data-action="hideStatusBarSetting"]'));
            const sendAppearance = () => {
                const modeElementValue = parseInt((modelMainElement.querySelector("#mode") as HTMLSelectElement).value);
                fetchPost("/api/setting/setAppearance", Object.assign({}, window.sourceflow.config.appearance, {
                    icon: (modelMainElement.querySelector("#icon") as HTMLSelectElement).value,
                    mode: modeElementValue === 2 ? window.sourceflow.config.appearance.mode : modeElementValue,
                    modeOS: modeElementValue === 2,
                    codeBlockSkinDark: normalizeCodeBlockSkin((modelMainElement.querySelector("#codeBlockSkinDark") as HTMLSelectElement)?.value),
                    codeBlockSkinLight: normalizeCodeBlockSkin((modelMainElement.querySelector("#codeBlockSkinLight") as HTMLSelectElement)?.value),
                    themeDark: (modelMainElement.querySelector("#themeDark") as HTMLSelectElement).value,
                    themeLight: (modelMainElement.querySelector("#themeLight") as HTMLSelectElement).value,
                    lang: (modelMainElement.querySelector("#lang") as HTMLSelectElement).value,
                    hideStatusBar: (modelMainElement.querySelector("#hideStatusBar") as HTMLInputElement).checked,
                    startupPageImage: getStartupPageImageValue(modelMainElement),
                    startupPageOpacity: getStartupPageOpacityValue(modelMainElement),
                    startupPageBlur: getStartupPageBlurValue(modelMainElement),
                    mascotEnabled: getMascotEnabledValue(modelMainElement),
                    mascotImage: getMascotImageValue(modelMainElement),
                    mascotPosition: getMascotPositionValue(modelMainElement),
                    mascotEffect: getMascotEffectValue(modelMainElement),
                    mascotOpacity: getMascotOpacityValue(modelMainElement),
                    mascotScale: getMascotScaleValue(modelMainElement),
                }), (response) => {
                    if (response?.data) {
                        window.sourceflow.config.appearance = response.data;
                        setStartupPageImageInputValue(modelMainElement, response.data.startupPageImage);
                        setMascotImageInputValue(modelMainElement, response.data.mascotImage);
                        syncStartupPageControls(modelMainElement);
                        syncMascotControls(modelMainElement);
                        loadAssets(response.data);
                        setInlineStyle();
                    }
                });
            };
            const sendEditorVisual = (overrides?: Partial<Config.IEditor>) => {
                const cursorColor = getCursorColorValue(modelMainElement);
                const cursorImage = getCursorImageValue(modelMainElement);
                const nextCursorImage = overrides?.cursorImage !== undefined ? normalizeEditorCursorImage(`${overrides.cursorImage || ""}`) : normalizeEditorCursorImage(cursorImage);
                const nextCursorImageName = nextCursorImage
                    ? `${overrides?.cursorImageName !== undefined
                        ? overrides.cursorImageName
                        : ((nextCursorImage === window.sourceflow.config.editor.cursorImage ? window.sourceflow.config.editor.cursorImageName : "") || "")}`.trim()
                    : "";
                const nextNoteBackgroundImage = overrides?.noteBackgroundImage !== undefined
                    ? normalizeEditorNoteBackgroundImage(`${overrides.noteBackgroundImage || ""}`)
                    : getNoteBackgroundImageValue(modelMainElement);
                fetchPost("/api/setting/setEditor", Object.assign({}, window.sourceflow.config.editor, {
                    cursorPreset: overrides?.cursorPreset ?? (modelMainElement.querySelector("#cursorPreset") as HTMLSelectElement).value,
                    cursorColor: overrides?.cursorColor ?? cursorColor,
                    cursorImage: nextCursorImage,
                    cursorImageName: overrides?.cursorImage === "" ? "" : nextCursorImageName,
                    cursorImageTint: overrides?.cursorImageTint !== undefined
                        ? !!overrides.cursorImageTint
                        : (!!nextCursorImage && !!(modelMainElement.querySelector("#cursorImageTint") as HTMLInputElement)?.checked),
                    cursorImageWidthPercent: overrides?.cursorImageWidthPercent ?? getCursorImageWidthPercentValue(modelMainElement),
                    cursorImageHeightPercent: overrides?.cursorImageHeightPercent ?? getCursorImageHeightPercentValue(modelMainElement),
                    cursorImageOffsetX: overrides?.cursorImageOffsetX ?? getCursorImageOffsetXValue(modelMainElement),
                    cursorImageOffsetY: overrides?.cursorImageOffsetY ?? getCursorImageOffsetYValue(modelMainElement),
                    cursorSavedImages: normalizeEditorCursorSavedImages(overrides?.cursorSavedImages !== undefined ? overrides.cursorSavedImages : getCursorSavedImages()),
                    cursorBlink: overrides?.cursorBlink ?? ((modelMainElement.querySelector("#cursorBlink") as HTMLInputElement)?.checked ?? DEFAULT_EDITOR_CURSOR_BLINK),
                    cursorBlinkEffect: overrides?.cursorBlinkEffect ?? normalizeEditorCursorBlinkEffect((modelMainElement.querySelector("#cursorBlinkEffect") as HTMLSelectElement)?.value || DEFAULT_EDITOR_CURSOR_BLINK_EFFECT),
                    hiddenBlockColor: overrides?.hiddenBlockColor ?? getHiddenBlockColorValue(modelMainElement),
                    noteBackgroundImage: nextNoteBackgroundImage,
                    noteBackgroundOpacity: overrides?.noteBackgroundOpacity ?? getNoteBackgroundOpacityValue(modelMainElement),
                    noteBackgroundBlur: overrides?.noteBackgroundBlur ?? getNoteBackgroundBlurValue(modelMainElement),
                }), (response) => {
                    window.sourceflow.config.editor = response.data;
                    const colorCustomInput = modelMainElement.querySelector("#cursorColorCustom") as HTMLInputElement;
                    const hiddenBlockColorInput = modelMainElement.querySelector("#hiddenBlockColor") as HTMLInputElement;
                    const blinkSwitch = modelMainElement.querySelector("#cursorBlink") as HTMLInputElement;
                    const blinkEffectSelect = modelMainElement.querySelector("#cursorBlinkEffect") as HTMLSelectElement;
                    setCursorImageInputValue(modelMainElement, window.sourceflow.config.editor.cursorImage);
                    setNoteBackgroundImageInputValue(modelMainElement, window.sourceflow.config.editor.noteBackgroundImage);
                    if (colorCustomInput) {
                        colorCustomInput.value = getCursorColorPickerValue(window.sourceflow.config.editor.cursorColor);
                    }
                    if (hiddenBlockColorInput) {
                        hiddenBlockColorInput.value = normalizeEditorHiddenBlockColor(window.sourceflow.config.editor.hiddenBlockColor);
                    }
                    if (blinkSwitch) {
                        blinkSwitch.checked = window.sourceflow.config.editor.cursorBlink !== false;
                    }
                    if (blinkEffectSelect) {
                        blinkEffectSelect.value = normalizeEditorCursorBlinkEffect(window.sourceflow.config.editor.cursorBlinkEffect);
                    }
                    syncCursorControls(modelMainElement);
                    syncNoteBackgroundControls(modelMainElement);
                    setInlineStyle();
                });
            };
            modelMainElement.querySelectorAll("select:not(#cursorPreset):not(#cursorColor):not(#cursorBlinkEffect):not(#mascotPosition):not(#mascotEffect), .b3-switch:not(#cursorImageTint):not(#cursorBlink):not(#mascotEnabled)").forEach(item => {
                item.addEventListener("change", () => {
                    sendAppearance();
                });
            });
            modelMainElement.querySelectorAll("#cursorPreset, #cursorImageTint, #cursorBlink, #cursorBlinkEffect").forEach((item) => {
                item.addEventListener("change", () => {
                    syncCursorControls(modelMainElement);
                    sendEditorVisual();
                });
            });
            (modelMainElement.querySelector("#cursorColor") as HTMLSelectElement)?.addEventListener("change", () => {
                const colorCustomInput = modelMainElement.querySelector("#cursorColorCustom") as HTMLInputElement;
                const colorSelect = modelMainElement.querySelector("#cursorColor") as HTMLSelectElement;
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
                syncCursorControls(modelMainElement);
                sendEditorVisual();
            });
            (modelMainElement.querySelector("#cursorColorCustom") as HTMLInputElement)?.addEventListener("input", () => {
                const colorCustomInput = modelMainElement.querySelector("#cursorColorCustom") as HTMLInputElement;
                const colorSelect = modelMainElement.querySelector("#cursorColor") as HTMLSelectElement;
                if (colorSelect) {
                    colorSelect.value = shouldKeepCursorCustomSelection(modelMainElement)
                        ? CUSTOM_EDITOR_CURSOR_COLOR_VALUE
                        : getEditorCursorColorSelectValue(colorCustomInput?.value || "");
                }
            });
            (modelMainElement.querySelector("#cursorColorCustom") as HTMLInputElement)?.addEventListener("change", () => {
                const colorCustomInput = modelMainElement.querySelector("#cursorColorCustom") as HTMLInputElement;
                const colorSelect = modelMainElement.querySelector("#cursorColor") as HTMLSelectElement;
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
                syncCursorControls(modelMainElement);
                sendEditorVisual();
            });
            (modelMainElement.querySelector("#hiddenBlockColor") as HTMLInputElement)?.addEventListener("change", () => {
                const hiddenBlockColorInput = modelMainElement.querySelector("#hiddenBlockColor") as HTMLInputElement;
                if (hiddenBlockColorInput) {
                    hiddenBlockColorInput.value = normalizeEditorHiddenBlockColor(hiddenBlockColorInput.value);
                }
                sendEditorVisual();
            });
            getCursorImageInput(modelMainElement)?.addEventListener("change", () => {
                setCursorImageInputValue(modelMainElement, getCursorImageInput(modelMainElement)?.value || "");
                syncCursorControls(modelMainElement);
                sendEditorVisual();
            });
            modelMainElement.querySelectorAll("#cursorImageWidthPercent, #cursorImageHeightPercent, #cursorImageOffsetX, #cursorImageOffsetY").forEach((item) => {
                item.addEventListener("input", () => {
                    syncCursorControls(modelMainElement);
                });
            });
            modelMainElement.querySelectorAll("#cursorImageWidthPercent, #cursorImageHeightPercent, #cursorImageOffsetX, #cursorImageOffsetY").forEach((item) => {
                item.addEventListener("change", () => {
                    syncCursorControls(modelMainElement);
                    sendEditorVisual();
                });
            });
            modelMainElement.querySelector("#cursorImageSaveToLibrary")?.addEventListener("click", async () => {
                const texts = getEditorCursorSettingTexts();
                const currentImage = getCursorImageValue(modelMainElement);
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
                    window.sourceflow.config.editor.cursorSavedImages = upsertEditorCursorSavedImage(window.sourceflow.config.editor.cursorSavedImages, {
                        source: result.dataURL,
                        name: result.name,
                    });
                    window.sourceflow.config.editor.cursorImageName = result.name;
                    (modelMainElement.querySelector("#cursorPreset") as HTMLSelectElement).value = "image";
                    setCursorImageInputValue(modelMainElement, result.dataURL);
                    syncCursorControls(modelMainElement);
                    sendEditorVisual({
                        cursorPreset: "image",
                        cursorImage: result.dataURL,
                        cursorImageName: result.name,
                        cursorSavedImages: window.sourceflow.config.editor.cursorSavedImages,
                    });
                    showMessage(texts.saveLibrarySuccess);
                } catch (error) {
                    showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
                }
            });
            modelMainElement.querySelector("#cursorImagePick")?.addEventListener("click", () => {
                const fileInput = modelMainElement.querySelector("#cursorImageFile") as HTMLInputElement;
                if (fileInput) {
                    fileInput.value = "";
                    fileInput.click();
                }
            });
            modelMainElement.querySelector("#cursorImageClear")?.addEventListener("click", () => {
                const fileInput = modelMainElement.querySelector("#cursorImageFile") as HTMLInputElement;
                if (fileInput) {
                    fileInput.value = "";
                }
                window.sourceflow.config.editor.cursorImageName = "";
                setCursorImageInputValue(modelMainElement, "");
                syncCursorControls(modelMainElement);
                sendEditorVisual({
                    cursorImage: "",
                    cursorImageName: "",
                    cursorImageTint: false,
                });
            });
            (modelMainElement.querySelector("#cursorImageFile") as HTMLInputElement)?.addEventListener("change", async (event) => {
                const input = event.target as HTMLInputElement;
                const file = input.files?.[0];
                if (!file) {
                    return;
                }
                try {
                    const result = await readEditorCursorAssetFile(file);
                    (modelMainElement.querySelector("#cursorPreset") as HTMLSelectElement).value = "image";
                    window.sourceflow.config.editor.cursorImageName = result.name;
                    setCursorImageInputValue(modelMainElement, result.dataURL);
                    syncCursorControls(modelMainElement);
                    sendEditorVisual({
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
            modelMainElement.querySelector("#cursorImageTransformReset")?.addEventListener("click", () => {
                (modelMainElement.querySelector("#cursorImageWidthPercent") as HTMLInputElement).value = `${DEFAULT_EDITOR_CURSOR_IMAGE_WIDTH_PERCENT}`;
                (modelMainElement.querySelector("#cursorImageHeightPercent") as HTMLInputElement).value = `${DEFAULT_EDITOR_CURSOR_IMAGE_HEIGHT_PERCENT}`;
                (modelMainElement.querySelector("#cursorImageOffsetX") as HTMLInputElement).value = `${DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_X}`;
                (modelMainElement.querySelector("#cursorImageOffsetY") as HTMLInputElement).value = `${DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_Y}`;
                syncCursorControls(modelMainElement);
                sendEditorVisual({
                    cursorImageWidthPercent: DEFAULT_EDITOR_CURSOR_IMAGE_WIDTH_PERCENT,
                    cursorImageHeightPercent: DEFAULT_EDITOR_CURSOR_IMAGE_HEIGHT_PERCENT,
                    cursorImageOffsetX: DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_X,
                    cursorImageOffsetY: DEFAULT_EDITOR_CURSOR_IMAGE_OFFSET_Y,
                });
                showMessage(getEditorCursorSettingTexts().resetImageTransformSuccess);
            });
            getNoteBackgroundImageInput(modelMainElement)?.addEventListener("change", () => {
                applyNoteBackgroundState(modelMainElement, sendEditorVisual, {
                    noteBackgroundImage: getNoteBackgroundImageInput(modelMainElement)?.value || "",
                }, true);
            });
            modelMainElement.querySelectorAll("#noteBackgroundOpacity, #noteBackgroundBlur").forEach((item) => {
                item.addEventListener("input", () => {
                    applyNoteBackgroundState(modelMainElement, sendEditorVisual);
                });
                item.addEventListener("change", () => {
                    applyNoteBackgroundState(modelMainElement, sendEditorVisual, undefined, true);
                });
            });
            modelMainElement.querySelector("#noteBackgroundImagePick")?.addEventListener("click", () => {
                const fileInput = modelMainElement.querySelector("#noteBackgroundImageFile") as HTMLInputElement;
                if (fileInput) {
                    fileInput.value = "";
                    fileInput.click();
                }
            });
            modelMainElement.querySelector("#noteBackgroundImageClear")?.addEventListener("click", () => {
                const fileInput = modelMainElement.querySelector("#noteBackgroundImageFile") as HTMLInputElement;
                if (fileInput) {
                    fileInput.value = "";
                }
                applyNoteBackgroundState(modelMainElement, sendEditorVisual, {
                    noteBackgroundImage: "",
                }, true);
            });
            (modelMainElement.querySelector("#noteBackgroundImageFile") as HTMLInputElement)?.addEventListener("change", async (event) => {
                const input = event.target as HTMLInputElement;
                const file = input.files?.[0];
                if (!file) {
                    return;
                }
                try {
                    const result = await readEditorNoteBackgroundAssetFile(file);
                    applyNoteBackgroundState(modelMainElement, sendEditorVisual, {
                        noteBackgroundImage: result.dataURL,
                    }, true);
                } catch (error) {
                    showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
                } finally {
                    input.value = "";
                }
            });
            getStartupPageImageInput(modelMainElement)?.addEventListener("change", () => {
                setStartupPageImageInputValue(modelMainElement, getStartupPageImageInput(modelMainElement)?.value || "");
                syncStartupPageControls(modelMainElement);
                sendAppearance();
            });
            modelMainElement.querySelectorAll("#startupPageOpacity, #startupPageBlur").forEach((item) => {
                item.addEventListener("input", () => {
                    syncStartupPageControls(modelMainElement);
                });
                item.addEventListener("change", () => {
                    syncStartupPageControls(modelMainElement);
                    sendAppearance();
                });
            });
            modelMainElement.querySelector("#startupPageImagePick")?.addEventListener("click", () => {
                const fileInput = modelMainElement.querySelector("#startupPageImageFile") as HTMLInputElement;
                if (fileInput) {
                    fileInput.value = "";
                    fileInput.click();
                }
            });
            modelMainElement.querySelector("#startupPageImageClear")?.addEventListener("click", () => {
                const fileInput = modelMainElement.querySelector("#startupPageImageFile") as HTMLInputElement;
                if (fileInput) {
                    fileInput.value = "";
                }
                setStartupPageImageInputValue(modelMainElement, "");
                syncStartupPageControls(modelMainElement);
                sendAppearance();
            });
            (modelMainElement.querySelector("#startupPageImageFile") as HTMLInputElement)?.addEventListener("change", async (event) => {
                const input = event.target as HTMLInputElement;
                const file = input.files?.[0];
                if (!file) {
                    return;
                }
                try {
                    const result = await readStartupPageAssetFile(file);
                    setStartupPageImageInputValue(modelMainElement, result.dataURL);
                    syncStartupPageControls(modelMainElement);
                    sendAppearance();
                } catch (error) {
                    showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
                } finally {
                    input.value = "";
                }
            });
            modelMainElement.querySelectorAll("#mascotEnabled, #mascotPosition, #mascotEffect").forEach((item) => {
                item.addEventListener("change", () => {
                    applyMascotState(modelMainElement, sendAppearance, undefined, true);
                });
            });
            getMascotImageInput(modelMainElement)?.addEventListener("change", () => {
                applyMascotState(modelMainElement, sendAppearance, {
                    mascotImage: getMascotImageInput(modelMainElement)?.value || "",
                }, true);
            });
            modelMainElement.querySelectorAll("#mascotOpacity, #mascotScale").forEach((item) => {
                item.addEventListener("input", () => {
                    applyMascotState(modelMainElement, sendAppearance);
                });
                item.addEventListener("change", () => {
                    applyMascotState(modelMainElement, sendAppearance, undefined, true);
                });
            });
            modelMainElement.querySelector("#mascotImagePick")?.addEventListener("click", () => {
                const fileInput = modelMainElement.querySelector("#mascotImageFile") as HTMLInputElement;
                if (fileInput) {
                    fileInput.value = "";
                    fileInput.click();
                }
            });
            modelMainElement.querySelector("#mascotImageClear")?.addEventListener("click", () => {
                const fileInput = modelMainElement.querySelector("#mascotImageFile") as HTMLInputElement;
                if (fileInput) {
                    fileInput.value = "";
                }
                applyMascotState(modelMainElement, sendAppearance, {
                    mascotImage: "",
                    mascotEnabled: false,
                }, true);
            });
            (modelMainElement.querySelector("#mascotImageFile") as HTMLInputElement)?.addEventListener("change", async (event) => {
                const input = event.target as HTMLInputElement;
                const file = input.files?.[0];
                if (!file) {
                    return;
                }
                try {
                    const result = await readMascotAssetFile(file);
                    applyMascotState(modelMainElement, sendAppearance, {
                        mascotImage: result.dataURL,
                        mascotEnabled: true,
                    }, true);
                } catch (error) {
                    showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
                } finally {
                    input.value = "";
                }
            });
            modelMainElement.querySelector("#cursorSavedImageList")?.addEventListener("click", (event) => {
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
                    (modelMainElement.querySelector("#cursorPreset") as HTMLSelectElement).value = "image";
                    window.sourceflow.config.editor.cursorImageName = savedImage.name;
                    setCursorImageInputValue(modelMainElement, savedImage.source);
                    syncCursorControls(modelMainElement);
                    sendEditorVisual({
                        cursorPreset: "image",
                        cursorImage: savedImage.source,
                        cursorImageName: savedImage.name,
                    });
                    return;
                }
                if (action === "cursor-saved-delete") {
                    window.sourceflow.config.editor.cursorSavedImages = removeEditorCursorSavedImage(window.sourceflow.config.editor.cursorSavedImages, savedImageID);
                    const overrides: Partial<Config.IEditor> = {
                        cursorSavedImages: window.sourceflow.config.editor.cursorSavedImages,
                    };
                    if (getCursorImageValue(modelMainElement) === savedImage.source) {
                        window.sourceflow.config.editor.cursorImageName = "";
                        setCursorImageInputValue(modelMainElement, "");
                        overrides.cursorImage = "";
                        overrides.cursorImageName = "";
                        overrides.cursorImageTint = false;
                    }
                    syncCursorControls(modelMainElement);
                    sendEditorVisual(overrides);
                    showMessage(getEditorCursorSettingTexts().deleteLibrarySuccess);
                }
            });
            setNoteBackgroundImageInputValue(modelMainElement, window.sourceflow.config.editor.noteBackgroundImage);
            setStartupPageImageInputValue(modelMainElement, window.sourceflow.config.appearance.startupPageImage);
            setMascotImageInputValue(modelMainElement, window.sourceflow.config.appearance.mascotImage);
            syncCursorControls(modelMainElement);
            syncNoteBackgroundControls(modelMainElement);
            syncStartupPageControls(modelMainElement);
            syncMascotControls(modelMainElement);
        }
    });
};
