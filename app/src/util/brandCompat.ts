import {Constants} from "../constants";

const DESKTOP_USER_AGENT_PATTERN = /^SourceFlow\//;

export const isSourceFlowDesktopUserAgent = (userAgent = navigator.userAgent) => {
    return DESKTOP_USER_AGENT_PATTERN.test(userAgent);
};

export const emitOpenSourceFlowURLPluginEvent = (
    eventBus: { emit(type: TEventBus, detail?: any): any },
    detail: any,
) => {
    eventBus.emit("open-sourceflow-url-plugin", detail);
};

export const emitOpenSourceFlowURLBlockEvent = (
    eventBus: { emit(type: TEventBus, detail?: any): any },
    detail: any,
) => {
    eventBus.emit("open-sourceflow-url-block", detail);
};

export const getSourceFlowClipboardHTML = (clipboardData: DataTransfer | ClipboardEvent["clipboardData"]) => {
    if (!clipboardData) {
        return "";
    }
    return clipboardData.getData(Constants.SOURCEFLOW_HTML_CLIPBOARD_MIME);
};
