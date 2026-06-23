import {App} from "../index";
import {fetchSyncPost} from "../util/fetch";
/// #if MOBILE
import {openMobileFileById} from "../mobile/editor";
/// #else
import {openFileById} from "../editor/util";
/// #endif
import {Constants} from "../constants";
import {WorkbenchAttr} from "./constants";

const loadWorkbenchReminderModule = () => import("./reminders");

export type TWorkbenchCaptureMode = "note" | "url" | "task" | "event" | "project" | "attachment";

const getCaptureTimestamp = () => new Date().toISOString();

export const normalizeWorkbenchTags = (...groups: string[]) => {
    const tags: string[] = [];
    groups.forEach((group) => {
        (group || "").replace(/，/g, ",").split(",").forEach((item) => {
            const tag = item.trim();
            if (tag && !tags.includes(tag)) {
                tags.push(tag);
            }
        });
    });
    return tags.join(",");
};

export const applyWorkbenchDocAttrs = async (id: string, attrs?: Record<string, string>) => {
    if (!attrs || Object.keys(attrs).length === 0) {
        return;
    }
    await fetchSyncPost("/api/attr/setBlockAttrs", {id, attrs});
};

export const mergeWorkbenchAttrs = (...groups: Array<Record<string, string> | undefined>) => {
    const ret: Record<string, string> = {};
    groups.forEach((group) => {
        Object.entries(group || {}).forEach(([key, value]) => {
            if (value != null) {
                ret[key] = value;
            }
        });
    });
    return ret;
};

export const buildWorkbenchAttrs = (mode: TWorkbenchCaptureMode, values: Record<string, string>) => {
    const attrs: Record<string, string> = {
        [WorkbenchAttr.type]: mode,
        [WorkbenchAttr.inbox]: "true",
        [WorkbenchAttr.capturedAt]: getCaptureTimestamp(),
    };
    switch (mode) {
        case "task":
            attrs[WorkbenchAttr.status] = "todo";
            break;
        case "event":
            attrs[WorkbenchAttr.status] = "scheduled";
            break;
        case "project":
            attrs[WorkbenchAttr.status] = "active";
            break;
        default:
            attrs[WorkbenchAttr.status] = "open";
            break;
    }
    Object.entries(values).forEach(([key, value]) => {
        if (value) {
            attrs[key] = value;
        }
    });
    return attrs;
};

export const createWorkbenchDoc = async (app: App, notebook: string, path: string, markdown: string, tags: string, openAfterSave: boolean, attrs?: Record<string, string>) => {
    const response = await fetchSyncPost("/api/filetree/createDocWithMd", {
        notebook,
        path,
        markdown,
        tags,
    });
    if (response.code === 0) {
        await applyWorkbenchDocAttrs(response.data, attrs);
        void loadWorkbenchReminderModule().then(({scheduleWorkbenchReminderSync}) => {
            scheduleWorkbenchReminderSync();
        });
    }
    if (response.code === 0 && openAfterSave) {
        /// #if MOBILE
        openMobileFileById(app, response.data, [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]);
        /// #else
        openFileById({app, id: response.data, action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]});
        /// #endif
    }
    return response;
};
