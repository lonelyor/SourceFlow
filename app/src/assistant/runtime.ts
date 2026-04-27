import {showMessage} from "../dialog/message";
import {isStartupFuseEnabled} from "../stability/startupGuard";
import {assistantText} from "./constants";

let lastAssistantErrorKey = "";
let lastAssistantErrorAt = 0;
let lastAssistantDisabledAt = 0;

export const scheduleAssistantIdleWork = (runner: () => void, timeout = 1800) => {
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => runner(), {timeout});
        return;
    }
    window.setTimeout(runner, 0);
};

export const reportAssistantRuntimeError = (scope: string, error: unknown, notify = true) => {
    console.error(`[assistant] ${scope} failed`, error);
    if (!notify) {
        return;
    }
    const now = Date.now();
    const detail = error instanceof Error ? error.message : `${error || ""}`.trim();
    const dedupeKey = `${scope}:${detail}`;
    if (dedupeKey === lastAssistantErrorKey && now - lastAssistantErrorAt < 3000) {
        return;
    }
    lastAssistantErrorKey = dedupeKey;
    lastAssistantErrorAt = now;
    showMessage(assistantText(
        "AI 助手暂时不可用，已自动隔离，不影响笔记使用。",
        "AI assistant is temporarily unavailable and has been isolated. Notes remain usable."
    ), 5000, "error");
};

export const ensureAssistantFeatureAvailable = () => {
    if (!isStartupFuseEnabled("assistant")) {
        return true;
    }
    const now = Date.now();
    if (now - lastAssistantDisabledAt < 3000) {
        return false;
    }
    lastAssistantDisabledAt = now;
    showMessage(assistantText(
        "检测到上次启动异常，本次安全启动已临时停用 AI 助手。重启后可再次尝试。",
        "Safe startup has temporarily disabled the AI assistant for this launch. Restart the app to try again."
    ), 6000, "info");
    return false;
};

export const runAssistantFeature = <T>(scope: string, loader: () => Promise<T>, runner: (module: T) => void | Promise<unknown>) => {
    if (!ensureAssistantFeatureAvailable()) {
        return;
    }
    void loader().then((module) => {
        return runner(module);
    }).catch((error) => {
        reportAssistantRuntimeError(scope, error);
    });
};
