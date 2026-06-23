import {Constants} from "../constants";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif

const supportedImageMimeByExtension: Record<string, string> = {
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
};

const dataImagePattern = /^data:image\/(?:svg\+xml|png|jpe?g|gif|webp)(?:;[^,]*)?,/i;
const renderURLCache = new Map<string, string>();

export const inferSupportedImageMime = (fileName = "", fileType = "", fallbackMime = "image/png") => {
    const normalizedType = `${fileType || ""}`.trim().toLowerCase();
    if (/^image\/(?:svg\+xml|png|jpe?g|gif|webp)$/i.test(normalizedType)) {
        return normalizedType === "image/jpg" ? "image/jpeg" : normalizedType;
    }
    const extension = `${fileName || ""}`.trim().toLowerCase().split(".").pop() || "";
    return supportedImageMimeByExtension[extension] || fallbackMime;
};

export const createImageFileFromDataURL = (dataURL: string, fileName: string, fileType = "") => {
    const normalized = `${dataURL || ""}`.trim();
    const commaIndex = normalized.indexOf(",");
    if (commaIndex < 0) {
        return null;
    }
    const header = normalized.slice(5, commaIndex);
    const payload = normalized.slice(commaIndex + 1);
    const mime = inferSupportedImageMime(fileName, fileType, "image/png");
    try {
        let bytes: Uint8Array;
        if (/;base64/i.test(header)) {
            const decoded = atob(payload.replace(/\s+/g, ""));
            bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
                bytes[i] = decoded.charCodeAt(i);
            }
        } else {
            const decoded = decodeURIComponent(payload);
            bytes = new TextEncoder().encode(decoded);
        }
        return new File([bytes], fileName || "image", {type: mime});
    } catch (error) {
        console.error("[appearance] create image file from data url failed", error);
        return null;
    }
};

export const pickDesktopImageAssetFile = async (): Promise<{dataURL: string, filePath: string, fileName: string} | null> => {
    /// #if !BROWSER
    const result = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
        cmd: "showOpenDialog",
        properties: ["openFile"],
        filters: [{
            name: "Images",
            extensions: Object.keys(supportedImageMimeByExtension).map((item) => item.replace(/^\./, "")),
        }],
    });
    if (result?.canceled || !result?.filePaths?.length) {
        return null;
    }
    return ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
        cmd: "readFileAsDataURL",
        filePath: result.filePaths[0],
    });
    /// #else
    return null;
    /// #endif
};

export const normalizeImportedImageDataURL = (dataURL: string, fileName = "", fileType = "", fallbackMime = "image/png") => {
    const normalized = `${dataURL || ""}`.trim();
    if (!normalized.startsWith("data:") || /^data:image\//i.test(normalized)) {
        return normalized;
    }
    const commaIndex = normalized.indexOf(",");
    if (commaIndex < 0) {
        return normalized;
    }
    const header = normalized.slice(5, commaIndex);
    const payload = normalized.slice(commaIndex + 1);
    const hasBase64 = /;base64/i.test(header);
    const mime = inferSupportedImageMime(fileName, fileType, fallbackMime);
    return `data:${mime}${hasBase64 ? ";base64" : ""},${payload}`;
};

const decodeRenderableImageDataURL = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!dataImagePattern.test(normalized)) {
        return null;
    }
    const commaIndex = normalized.indexOf(",");
    if (commaIndex < 0) {
        return null;
    }
    const header = normalized.slice(5, commaIndex);
    const payload = normalized.slice(commaIndex + 1);
    const mime = (header.split(";")[0] || "image/png").trim() || "image/png";
    try {
        if (/;base64/i.test(header)) {
            const decoded = atob(payload.replace(/\s+/g, ""));
            const bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
                bytes[i] = decoded.charCodeAt(i);
            }
            return new Blob([bytes], {type: mime});
        }
        return new Blob([decodeURIComponent(payload)], {type: mime});
    } catch (error) {
        console.error("[appearance] decode image data url failed", error);
        return null;
    }
};

export const getRenderableImageURL = (value: string) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized || !dataImagePattern.test(normalized)) {
        return normalized;
    }
    const cached = renderURLCache.get(normalized);
    if (cached) {
        return cached;
    }
    const blob = decodeRenderableImageDataURL(normalized);
    if (!blob) {
        return normalized;
    }
    const objectURL = URL.createObjectURL(blob);
    renderURLCache.set(normalized, objectURL);
    return objectURL;
};
