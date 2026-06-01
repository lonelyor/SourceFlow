import {Constants} from "../constants";
import {setStorageVal} from "../protyle/util/compatibility";
import {getDefaultWorkbenchItemSettings} from "../workbench/itemSettings";

export type TCaptureMode = "url";

export interface ICaptureSettings {
    notebook: string;
    pathPrefix: string;
    openAfterSave: boolean;
}

export type ICaptureAutomationData = ICaptureSettings;

type ILegacyCaptureSettings = Partial<ICaptureSettings> & {
    tags?: string;
    activeTab?: string;
    urlPathPrefix?: string;
    quickPathPrefix?: string;
    taskPathPrefix?: string;
    eventPathPrefix?: string;
    projectPathPrefix?: string;
    attachmentPathPrefix?: string;
    assetsUploadPath?: string;
    noteTemplate?: string;
    taskTemplate?: string;
    eventTemplate?: string;
    projectTemplate?: string;
    attachmentTemplate?: string;
};

const normalizeText = (value: unknown, fallback = "") => `${value ?? fallback}`.trim();

const migrateLegacyWorkbenchItemSettings = (stored: ILegacyCaptureSettings) => {
    if (window.sourceflow.storage[Constants.LOCAL_WORKBENCH_ITEMS]) {
        return;
    }
    if (!stored || Object.keys(stored).length === 0) {
        return;
    }
    const defaults = getDefaultWorkbenchItemSettings();
    const migrated = {
        notebook: normalizeText(stored.notebook, defaults.notebook),
        tags: normalizeText(stored.tags, defaults.tags),
        openAfterSave: stored.openAfterSave == null ? defaults.openAfterSave : !!stored.openAfterSave,
        notePathPrefix: normalizeText(stored.quickPathPrefix, defaults.notePathPrefix),
        taskPathPrefix: normalizeText(stored.taskPathPrefix, defaults.taskPathPrefix),
        eventPathPrefix: normalizeText(stored.eventPathPrefix, defaults.eventPathPrefix),
        noteTemplate: `${stored.noteTemplate ?? defaults.noteTemplate}`,
        taskTemplate: `${stored.taskTemplate ?? defaults.taskTemplate}`,
        eventTemplate: `${stored.eventTemplate ?? defaults.eventTemplate}`,
    };
    window.sourceflow.storage[Constants.LOCAL_WORKBENCH_ITEMS] = migrated;
    setStorageVal(Constants.LOCAL_WORKBENCH_ITEMS, migrated);
};

export const getDefaultCaptureSettings = (): ICaptureSettings => ({
    notebook: "",
    pathPrefix: "收件箱/网页导入",
    openAfterSave: true,
});

export const getCaptureSettings = (): ICaptureSettings => {
    const stored = (window.sourceflow.storage[Constants.LOCAL_CAPTURE] || {}) as ILegacyCaptureSettings;
    migrateLegacyWorkbenchItemSettings(stored);
    const defaults = getDefaultCaptureSettings();
    return {
        notebook: normalizeText(stored.notebook, defaults.notebook),
        pathPrefix: normalizeText(stored.pathPrefix ?? stored.urlPathPrefix, defaults.pathPrefix),
        openAfterSave: stored.openAfterSave == null ? defaults.openAfterSave : !!stored.openAfterSave,
    };
};

export const saveCaptureSettings = (settings: ICaptureSettings) => {
    window.sourceflow.storage[Constants.LOCAL_CAPTURE] = settings;
    setStorageVal(Constants.LOCAL_CAPTURE, settings);
};

export const resetCaptureSettings = () => {
    const defaults = getDefaultCaptureSettings();
    saveCaptureSettings(defaults);
    return defaults;
};

export const getCapturePathPrefix = (settings: ICaptureSettings) => settings.pathPrefix;

export const buildCaptureDocPath = (pathPrefix: string, title: string) => {
    const cleanPrefix = (pathPrefix || "").replace(/^[\\/]+|[\\/]+$/g, "");
    const cleanTitle = (title || window.sourceflow.languages.untitled)
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || window.sourceflow.languages.untitled;
    return `/${cleanPrefix ? `${cleanPrefix}/` : ""}${cleanTitle}`;
};

export const exportCaptureAutomation = (): ICaptureAutomationData => {
    const settings = getCaptureSettings();
    return {
        notebook: settings.notebook,
        pathPrefix: settings.pathPrefix,
        openAfterSave: settings.openAfterSave,
    };
};

export const importCaptureAutomation = (data: Partial<ICaptureAutomationData & ILegacyCaptureSettings>) => {
    const defaults = getDefaultCaptureSettings();
    const nextSettings: ICaptureSettings = {
        notebook: normalizeText(data?.notebook, defaults.notebook),
        pathPrefix: normalizeText(data?.pathPrefix ?? data?.urlPathPrefix, defaults.pathPrefix),
        openAfterSave: data?.openAfterSave == null ? defaults.openAfterSave : !!data.openAfterSave,
    };
    saveCaptureSettings(nextSettings);
    return getCaptureSettings();
};
