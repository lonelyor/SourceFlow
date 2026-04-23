import {Constants} from "../constants";
import {showMessage} from "../dialog/message";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif

export type TStartupFuse = "assistant" | "terminal" | "plugins" | "richRender" | "reminders";

export interface IStartupSafeModeState {
    active: boolean;
    reason: string;
    detail: string;
    triggeredAt: number;
    fuses: Record<TStartupFuse, boolean>;
}

const getDefaultSafeModeState = (): IStartupSafeModeState => ({
    active: false,
    reason: "",
    detail: "",
    triggeredAt: 0,
    fuses: {
        assistant: false,
        terminal: false,
        plugins: false,
        richRender: false,
        reminders: false,
    },
});

let startupSafeModeState = getDefaultSafeModeState();
let startupSafeModeLoaded = false;
let startupSafeModeNoticeShown = false;
let startupGuardReadyScheduled = false;

const startupSafeModeText = (zh: string, en: string) => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? zh : en;
};

const normalizeStartupSafeModeState = (value: Partial<IStartupSafeModeState> | null | undefined): IStartupSafeModeState => {
    return {
        active: !!value?.active,
        reason: `${value?.reason || ""}`.trim(),
        detail: `${value?.detail || ""}`.trim(),
        triggeredAt: Number(value?.triggeredAt) || 0,
        fuses: {
            assistant: !!value?.fuses?.assistant,
            terminal: !!value?.fuses?.terminal,
            plugins: !!value?.fuses?.plugins,
            richRender: !!value?.fuses?.richRender,
            reminders: !!value?.fuses?.reminders,
        },
    };
};

export const loadStartupSafeModeState = async () => {
    if (startupSafeModeLoaded) {
        return startupSafeModeState;
    }
    startupSafeModeLoaded = true;
    /// #if !BROWSER
    try {
        const state = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
            cmd: "getStartupGuard",
        });
        startupSafeModeState = normalizeStartupSafeModeState(state);
    } catch (error) {
        console.error("load startup guard failed", error);
        startupSafeModeState = getDefaultSafeModeState();
    }
    /// #else
    startupSafeModeState = getDefaultSafeModeState();
    /// #endif
    return startupSafeModeState;
};

export const getStartupSafeModeState = () => startupSafeModeState;

export const isStartupFuseEnabled = (fuse: TStartupFuse) => {
    return startupSafeModeState.active && !!startupSafeModeState.fuses[fuse];
};

export const notifyStartupSafeMode = () => {
    if (!startupSafeModeState.active || startupSafeModeNoticeShown) {
        return;
    }
    const disabledParts: string[] = [];
    if (startupSafeModeState.fuses.assistant) {
        disabledParts.push(startupSafeModeText("AI 助手", "AI assistant"));
    }
    if (startupSafeModeState.fuses.terminal) {
        disabledParts.push(startupSafeModeText("终端", "terminal"));
    }
    if (startupSafeModeState.fuses.plugins) {
        disabledParts.push(startupSafeModeText("插件", "plugins"));
    }
    if (startupSafeModeState.fuses.richRender) {
        disabledParts.push(startupSafeModeText("富渲染", "rich renderers"));
    }
    if (startupSafeModeState.fuses.reminders) {
        disabledParts.push(startupSafeModeText("提醒同步", "reminder sync"));
    }
    if (disabledParts.length === 0) {
        return;
    }
    startupSafeModeNoticeShown = true;
    const disabledText = disabledParts.join(startupSafeModeText("、", ", "));
    showMessage(startupSafeModeText(
        `检测到上次启动异常，本次已临时关闭：${disabledText}。核心笔记功能不受影响。`,
        `A previous startup failed. This launch temporarily disabled: ${disabledText}. Core note editing remains available.`
    ), 7000, "info");
};

export const scheduleStartupGuardReady = (delay = 4000) => {
    if (startupGuardReadyScheduled) {
        return;
    }
    startupGuardReadyScheduled = true;
    /// #if !BROWSER
    window.setTimeout(() => {
        ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
            cmd: "startupGuardReady",
        });
    }, Math.max(1000, delay));
    /// #endif
};
