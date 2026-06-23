import {getRenderableImageURL, normalizeImportedImageDataURL} from "./imageAsset";

const appearanceText = (zh: string, en: string) => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? zh : en;
};

export const DEFAULT_MASCOT_ENABLED = false;
export const DEFAULT_MASCOT_IMAGE = "";
export const DEFAULT_MASCOT_POSITION = "right";
export const DEFAULT_MASCOT_EFFECT = "float";
export const DEFAULT_MASCOT_OPACITY = 100;
export const DEFAULT_MASCOT_SCALE = 100;
export const MASCOT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const mascotSupportedImagePattern = /\.(svg|png|jpe?g|gif|webp)$/i;
const mascotSupportedImageMimePattern = /^image\/(?:svg\+xml|png|jpe?g|gif|webp)$/i;
const mascotSupportedDataURLPattern = /^data:image\/(?:svg\+xml|png|jpe?g|gif|webp)(?:;[^,]*)?,/i;
const remoteMascotImagePattern = /^(https?:\/\/|file:\/\/)/i;
const mascotElementID = "sourceflowMascot";
const isLocalMascotImage = (value: string) => {
    return normalizeMascotImage(value).startsWith("data:image/");
};
const getMascotImageRuntimeURL = (value: string) => {
    const normalized = normalizeMascotImage(value);
    return isLocalMascotImage(normalized) ? normalized : getRenderableImageURL(normalized);
};

export const normalizeMascotEnabled = (value: boolean) => {
    return !!value;
};

export const normalizeMascotImage = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) {
        return "";
    }
    if (mascotSupportedDataURLPattern.test(normalized)) {
        return normalized;
    }
    return remoteMascotImagePattern.test(normalized) ? normalized : "";
};

export const normalizeMascotPosition = (value: string) => {
    return `${value || ""}`.trim().toLowerCase() === "left" ? "left" : DEFAULT_MASCOT_POSITION;
};

export const normalizeMascotEffect = (value: string) => {
    switch (`${value || ""}`.trim().toLowerCase()) {
        case "none":
        case "sway":
        case "pulse":
            return `${value || ""}`.trim().toLowerCase();
        default:
            return DEFAULT_MASCOT_EFFECT;
    }
};

export const normalizeMascotOpacity = (value: number) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return DEFAULT_MASCOT_OPACITY;
    }
    return Math.min(100, Math.max(0, normalized));
};

export const normalizeMascotScale = (value: number) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return DEFAULT_MASCOT_SCALE;
    }
    return Math.min(180, Math.max(40, normalized));
};

export const getMascotDisplayValue = (value: string) => {
    const normalized = normalizeMascotImage(value);
    return remoteMascotImagePattern.test(normalized) ? normalized : "";
};

export const readMascotAssetFile = (file: File) => {
    return new Promise<{dataURL: string}>((resolve, reject) => {
        if (!file) {
            reject(new Error(appearanceText("请选择看板娘图片文件", "Please choose a mascot image file")));
            return;
        }
        const fileName = `${file.name || ""}`.trim();
        const fileType = `${file.type || ""}`.trim().toLowerCase();
        if (!(mascotSupportedImageMimePattern.test(fileType) || mascotSupportedImagePattern.test(fileName))) {
            reject(new Error(appearanceText("仅支持 SVG、PNG、JPG、GIF、WEBP 等图片文件", "Only SVG, PNG, JPG, GIF, WEBP, and similar image files are supported")));
            return;
        }
        if (file.size > MASCOT_IMAGE_MAX_BYTES) {
            reject(new Error(appearanceText("看板娘图片过大，最大支持 8 MB", "Mascot image is too large. The maximum supported size is 8 MB")));
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
            reject(reader.error || new Error(appearanceText("读取看板娘图片失败", "Failed to read the mascot image")));
        };
        reader.readAsDataURL(file);
    });
};

export const getMascotPositionOptions = () => ([
    {value: "right", label: appearanceText("右下角", "Bottom Right")},
    {value: "left", label: appearanceText("左下角", "Bottom Left")},
]);

export const getMascotEffectOptions = () => ([
    {value: "float", label: appearanceText("轻微浮动", "Float")},
    {value: "sway", label: appearanceText("轻微摇摆", "Sway")},
    {value: "pulse", label: appearanceText("呼吸淡入", "Pulse")},
    {value: "none", label: appearanceText("无特效", "None")},
]);

export const getMascotSettingTexts = () => ({
    title: appearanceText("看板娘", "Mascot"),
    detail: appearanceText("在编辑器左下角或右下角显示一个轻量悬浮挂件。支持本地导入图片、简单特效，以及一键隐藏和唤醒。它是独立悬浮层，不参与文档内容，也不会改动你的笔记。", "Show a lightweight floating mascot in the bottom-left or bottom-right corner of the editor. Supports local image imports, simple effects, plus one-click hide and wake. It is an independent floating layer, not part of document content, and does not modify your notes."),
    enabled: appearanceText("启用看板娘", "Enable mascot"),
    enabledHint: appearanceText("关闭后会立即移除悬浮挂件，但保留已选图片和参数。", "When disabled, the floating mascot disappears immediately while keeping the selected image and settings."),
    position: appearanceText("显示位置", "Position"),
    effect: appearanceText("显示特效", "Effect"),
    opacity: appearanceText("透明度", "Opacity"),
    opacityHint: appearanceText("范围 0-100，数值越大看板娘越明显。", "Range 0-100. Larger values make the mascot more visible."),
    scale: appearanceText("缩放", "Scale"),
    scaleHint: appearanceText("范围 40-180，控制看板娘整体大小。", "Range 40-180. Controls the overall mascot size."),
    source: appearanceText("图片来源", "Image source"),
    sourceHint: appearanceText("支持远程链接，或通过下方按钮导入本地 svg/png/jpg/gif/webp。当前使用本地图片时，这里不会显示 data URL。", "Supports remote URLs, or import a local svg/png/jpg/gif/webp file using the button below. When the active mascot uses a local file, the raw data URL is hidden here."),
    uploadImage: appearanceText("导入本地文件", "Import local file"),
    clearImage: appearanceText("清除图片", "Clear image"),
    localFileHint: appearanceText("单张最大 8 MB，超过会明确提示。", "Each image can be up to 8 MB; oversized files are rejected with a prompt."),
    preview: appearanceText("预览", "Preview"),
    previewEmpty: appearanceText("当前未设置看板娘图片。", "No mascot image is configured."),
    embeddedLabel: appearanceText("已内嵌本地看板娘图片", "Embedded local mascot image"),
    hide: appearanceText("隐藏看板娘", "Hide mascot"),
    wake: appearanceText("唤醒看板娘", "Wake mascot"),
    controlHint: appearanceText("运行时可点击悬浮挂件右上角隐藏，再通过边缘按钮唤醒。", "At runtime, click the button in the top-right corner of the floating mascot to hide it, then wake it from the edge button."),
});

const createMascotElement = () => {
    const element = document.createElement("div");
    element.id = mascotElementID;
    element.className = "sourceflow-mascot";
    element.innerHTML = `<button class="sourceflow-mascot__wake" type="button"></button>
<div class="sourceflow-mascot__card">
    <button class="sourceflow-mascot__hide" type="button" aria-label="Hide mascot">
        <svg aria-hidden="true"><use xlink:href="#iconCloseRound"></use></svg>
    </button>
    <img class="sourceflow-mascot__image" alt="Mascot" draggable="false">
</div>`;
    const hideButton = element.querySelector(".sourceflow-mascot__hide") as HTMLButtonElement;
    const wakeButton = element.querySelector(".sourceflow-mascot__wake") as HTMLButtonElement;
    hideButton.addEventListener("click", () => {
        element.setAttribute("data-hidden", "true");
    });
    wakeButton.addEventListener("click", () => {
        element.setAttribute("data-hidden", "false");
    });
    return element;
};

export const applyMascotWidget = (appearanceData: Config.IAppearance = window.sourceflow.config.appearance) => {
    try {
        const mascotEnabled = normalizeMascotEnabled(appearanceData?.mascotEnabled);
        const mascotImage = normalizeMascotImage(appearanceData?.mascotImage || "");
        const existing = document.getElementById(mascotElementID);
        if (!mascotEnabled || !mascotImage) {
            existing?.remove();
            return;
        }

        const texts = getMascotSettingTexts();
        const mascotPosition = normalizeMascotPosition(appearanceData?.mascotPosition || "");
        const mascotEffect = normalizeMascotEffect(appearanceData?.mascotEffect || "");
        const mascotOpacity = normalizeMascotOpacity(appearanceData?.mascotOpacity);
        const mascotScale = normalizeMascotScale(appearanceData?.mascotScale);
        const element = existing || createMascotElement();
        const imageElement = element.querySelector(".sourceflow-mascot__image") as HTMLImageElement;
        const hideButton = element.querySelector(".sourceflow-mascot__hide") as HTMLButtonElement;
        const wakeButton = element.querySelector(".sourceflow-mascot__wake") as HTMLButtonElement;

        element.setAttribute("data-position", mascotPosition);
        element.setAttribute("data-effect", mascotEffect);
        element.setAttribute("data-hidden", "false");
        element.style.setProperty("--sourceflow-mascot-opacity", `${mascotOpacity / 100}`);
        element.style.setProperty("--sourceflow-mascot-size", `${Math.round(132 * mascotScale / 100)}px`);
        hideButton.title = texts.hide;
        wakeButton.title = texts.wake;
        wakeButton.textContent = mascotPosition === "left" ? ">" : "<";
        imageElement.onerror = () => {
            console.error("[appearance] mascot image failed to load");
            element.remove();
        };
        imageElement.alt = texts.title;
        imageElement.dataset.sourceValue = mascotImage;
        imageElement.src = getMascotImageRuntimeURL(mascotImage);

        if (!existing) {
            document.body.appendChild(element);
        }
    } catch (error) {
        console.error("[appearance] mascot failed", error);
        document.getElementById(mascotElementID)?.remove();
    }
};
