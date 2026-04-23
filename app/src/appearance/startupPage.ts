import {normalizeImportedImageDataURL} from "./imageAsset";

const appearanceText = (zh: string, en: string) => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? zh : en;
};

export const DEFAULT_STARTUP_PAGE_IMAGE = "/appearance/boot/startup-logo.png";
export const DEFAULT_STARTUP_PAGE_OPACITY = 100;
export const DEFAULT_STARTUP_PAGE_BLUR = 0;
export const STARTUP_PAGE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const startupPageSupportedImagePattern = /\.(svg|png|jpe?g|gif|webp)$/i;
const startupPageSupportedImageMimePattern = /^image\/(?:svg\+xml|png|jpe?g|gif|webp)$/i;
const startupPageSupportedDataURLPattern = /^data:image\/(?:svg\+xml|png|jpe?g|gif|webp)(?:;[^,]*)?,/i;
const remoteStartupPageImagePattern = /^(https?:\/\/|file:\/\/|\/)/i;

export const normalizeStartupPageImage = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) {
        return "";
    }
    if (startupPageSupportedDataURLPattern.test(normalized)) {
        return normalized;
    }
    return remoteStartupPageImagePattern.test(normalized) ? normalized : "";
};

export const normalizeStartupPageOpacity = (value: number) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return DEFAULT_STARTUP_PAGE_OPACITY;
    }
    return Math.min(100, Math.max(0, normalized));
};

export const normalizeStartupPageBlur = (value: number) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return DEFAULT_STARTUP_PAGE_BLUR;
    }
    return Math.min(32, Math.max(0, normalized));
};

export const getStartupPageDisplayValue = (value: string) => {
    const normalized = normalizeStartupPageImage(value);
    return remoteStartupPageImagePattern.test(normalized) ? normalized : "";
};

export const readStartupPageAssetFile = (file: File) => {
    return new Promise<{dataURL: string}>((resolve, reject) => {
        if (!file) {
            reject(new Error(appearanceText("请选择启动页图片文件", "Please choose a startup page image file")));
            return;
        }
        const fileName = `${file.name || ""}`.trim();
        const fileType = `${file.type || ""}`.trim().toLowerCase();
        if (!(startupPageSupportedImageMimePattern.test(fileType) || startupPageSupportedImagePattern.test(fileName))) {
            reject(new Error(appearanceText("仅支持 SVG、PNG、JPG、GIF、WEBP 等图片文件", "Only SVG, PNG, JPG, GIF, WEBP, and similar image files are supported")));
            return;
        }
        if (file.size > STARTUP_PAGE_IMAGE_MAX_BYTES) {
            reject(new Error(appearanceText("启动页图片过大，最大支持 8 MB", "Startup page image is too large. The maximum supported size is 8 MB")));
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
            reject(reader.error || new Error(appearanceText("读取启动页图片失败", "Failed to read the startup page image")));
        };
        reader.readAsDataURL(file);
    });
};

export const getStartupPageSettingTexts = () => ({
    title: appearanceText("启动页图片", "Startup Page Image"),
    detail: appearanceText("为应用启动时的加载页设置背景图，并控制透明度和模糊度。支持远程地址或本地导入；本地图片会保存为内嵌数据，不依赖原始文件路径。图片始终按比例铺满显示，不会被强行拉伸变形。", "Set a background image for the startup loading page and control its opacity and blur. Remote URLs and local imports are supported; local files are stored as embedded data and do not depend on the original file path. Images always scale proportionally with cover behavior and are never stretched out of shape."),
    source: appearanceText("启动图来源", "Startup image source"),
    sourceHint: appearanceText("支持远程链接，或通过下方按钮导入本地 svg/png/jpg/gif/webp。当前使用本地图片时，这里不会显示 data URL。", "Supports remote URLs, or import a local svg/png/jpg/gif/webp file using the button below. When the active startup image uses a local file, the raw data URL is hidden here."),
    uploadImage: appearanceText("导入本地文件", "Import local file"),
    clearImage: appearanceText("清除启动图", "Clear startup image"),
    localFileHint: appearanceText("单张最大 8 MB，超过会明确提示。", "Each image can be up to 8 MB; oversized files are rejected with a prompt."),
    preview: appearanceText("预览", "Preview"),
    previewEmpty: appearanceText("当前未设置启动图。", "No startup image is configured."),
    opacity: appearanceText("透明度", "Opacity"),
    opacityHint: appearanceText("范围 0-100，数值越大启动图越明显。", "Range 0-100. Larger values make the startup image more visible."),
    blur: appearanceText("模糊度", "Blur"),
    blurHint: appearanceText("范围 0-32 px，用于柔化背景细节。", "Range 0-32 px. Use it to soften background details."),
    embeddedLabel: appearanceText("已内嵌本地启动图", "Embedded local startup image"),
});
