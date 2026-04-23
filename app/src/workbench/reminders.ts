import {Constants} from "../constants";
import {fetchSyncPost} from "../util/fetch";
import type {App} from "../index";
import {isStartupFuseEnabled} from "../stability/startupGuard";
import {IWorkbenchItem} from "./constants";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif

interface IWorkbenchReminderSnapshot {
    id: string;
    rootID: string;
    title: string;
    body: string;
    fireAt: number;
    kind: "event" | "task";
    path: string;
    project: string;
}

const REMINDER_SYNC_INTERVAL = 5 * 60 * 1000;
let reminderSyncTimer = 0;
let reminderSyncInterval = 0;
let reminderSyncPromise: Promise<IWorkbenchReminderSnapshot[]> | null = null;
let reminderSyncInitialized = false;

const isCompletedStatus = (status: string) => ["done", "completed"].includes(`${status || ""}`.trim().toLowerCase());

const parseLocalDateTime = (value: string) => {
    const text = `${value || ""}`.trim();
    if (!text) {
        return 0;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const [year, month, day] = text.split("-").map((item) => parseInt(item, 10));
        return new Date(year, month - 1, day, 9, 0, 0, 0).getTime();
    }
    const timestamp = Date.parse(text);
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatReminderTime = (timestamp: number) => {
    if (!timestamp) {
        return "";
    }
    const locale = `${window.sourceflow.config.appearance.lang || "zh-CN"}`.replace(/_/g, "-");
    try {
        return new Intl.DateTimeFormat(locale, {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(timestamp));
    } catch (e) {
        return new Intl.DateTimeFormat("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(timestamp));
    }
};

const buildReminderBody = (item: IWorkbenchItem, fireAt: number) => {
    const parts = [formatReminderTime(fireAt)].filter(Boolean);
    if (item.project) {
        parts.push(`${window.sourceflow.languages.project}：${item.project}`);
    }
    if (item.type === "event" && item.location) {
        parts.push(`${window.sourceflow.languages.location}：${item.location}`);
    }
    if (item.type === "task" && item.nextStep) {
        parts.push(item.nextStep);
    }
    return parts.join(" · ");
};

const buildReminderSnapshot = (item: IWorkbenchItem): IWorkbenchReminderSnapshot | null => {
    if (item.type === "event") {
        const fireAt = parseLocalDateTime(item.eventTime);
        if (!fireAt || isCompletedStatus(item.status)) {
            return null;
        }
        return {
            id: item.id,
            rootID: item.rootID || item.id,
            title: item.title || window.sourceflow.languages.eventCapture,
            body: buildReminderBody(item, fireAt),
            fireAt,
            kind: "event",
            path: item.path,
            project: item.project,
        };
    }
    if (item.type === "task") {
        const fireAt = parseLocalDateTime(item.dueDate);
        if (!fireAt || isCompletedStatus(item.status)) {
            return null;
        }
        return {
            id: item.id,
            rootID: item.rootID || item.id,
            title: item.title || window.sourceflow.languages.taskCapture,
            body: buildReminderBody(item, fireAt),
            fireAt,
            kind: "task",
            path: item.path,
            project: item.project,
        };
    }
    return null;
};

const fetchReminderSnapshots = async (): Promise<IWorkbenchReminderSnapshot[]> => {
    const response = await fetchSyncPost("/api/workbench/getWorkbenchItems", {limit: 2048});
    if (response.code !== 0) {
        return [];
    }
    return ((response.data?.items || []) as IWorkbenchItem[])
        .map((item) => buildReminderSnapshot(item))
        .filter(Boolean)
        .sort((a, b) => a.fireAt - b.fireAt) as IWorkbenchReminderSnapshot[];
};

export const syncWorkbenchReminders = async (): Promise<IWorkbenchReminderSnapshot[]> => {
    /// #if BROWSER
    return [];
    /// #else
    if (isStartupFuseEnabled("reminders")) {
        return [];
    }
    if (reminderSyncPromise) {
        return reminderSyncPromise;
    }
    reminderSyncPromise = fetchReminderSnapshots().then((items) => {
        ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
            cmd: "syncWorkbenchReminders",
            items,
        });
        return items;
    }).finally(() => {
        reminderSyncPromise = null;
    });
    return reminderSyncPromise;
    /// #endif
};

export const scheduleWorkbenchReminderSync = (delay = 600) => {
    /// #if BROWSER
    return;
    /// #else
    if (isStartupFuseEnabled("reminders")) {
        return;
    }
    window.clearTimeout(reminderSyncTimer);
    reminderSyncTimer = window.setTimeout(() => {
        void syncWorkbenchReminders();
    }, Math.max(0, delay));
    /// #endif
};

const openReminderTarget = (app: App, reminder: Partial<IWorkbenchReminderSnapshot>) => {
    const targetID = `${reminder.rootID || reminder.id || ""}`.trim();
    if (!targetID) {
        return;
    }
    void import("../editor/util").then(({openFileById}) => {
        openFileById({app, id: targetID, action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]});
    });
};

export const initWorkbenchReminderSync = (app: App) => {
    /// #if BROWSER
    return;
    /// #else
    if (isStartupFuseEnabled("reminders")) {
        return;
    }
    if (reminderSyncInitialized) {
        return;
    }
    reminderSyncInitialized = true;
    ipcRenderer.on("sourceflow-workbench-reminder-open", (_event, data: Partial<IWorkbenchReminderSnapshot>) => {
        openReminderTarget(app, data || {});
    });
    window.addEventListener("focus", () => {
        scheduleWorkbenchReminderSync(300);
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            scheduleWorkbenchReminderSync(300);
        }
    });
    if (!reminderSyncInterval) {
        reminderSyncInterval = window.setInterval(() => {
            void syncWorkbenchReminders();
        }, REMINDER_SYNC_INTERVAL);
    }
    if ("requestIdleCallback" in window) {
        // @ts-ignore
        window.requestIdleCallback(() => {
            scheduleWorkbenchReminderSync(1200);
        }, {timeout: 5000});
    } else {
        scheduleWorkbenchReminderSync(4000);
    }
    /// #endif
};
