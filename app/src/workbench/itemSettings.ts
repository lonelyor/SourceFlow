import {Constants} from "../constants";
import {setStorageVal} from "../protyle/util/compatibility";

export type TWorkbenchItemMode = "note" | "task" | "event";

export interface IWorkbenchItemSettings {
    notebook: string;
    tags: string;
    openAfterSave: boolean;
    notePathPrefix: string;
    taskPathPrefix: string;
    eventPathPrefix: string;
    noteTemplate: string;
    taskTemplate: string;
    eventTemplate: string;
}

export interface IWorkbenchItemAutomationData extends IWorkbenchItemSettings {
}

type ILegacyCaptureSettings = Partial<{
    notebook: string;
    tags: string;
    openAfterSave: boolean;
    quickPathPrefix: string;
    taskPathPrefix: string;
    eventPathPrefix: string;
    noteTemplate: string;
    taskTemplate: string;
    eventTemplate: string;
}>;

const DEFAULT_NOTE_TEMPLATE = `# {{title}}

- 类型：笔记
- 项目：{{project}}
- 创建时间：{{now}}

## 内容

{{details}}`;

const DEFAULT_TASK_TEMPLATE = `# {{title}}

- 类型：任务
- 状态：待办
- 截止：{{dueDate}}
- 项目：{{project}}
- 创建时间：{{now}}

## 说明

{{details}}`;

const DEFAULT_EVENT_TEMPLATE = `# {{title}}

- 类型：事件
- 时间：{{eventTime}}
- 地点：{{location}}
- 创建时间：{{now}}

## 说明

{{details}}`;

const normalizeText = (value: unknown, fallback = "") => `${value ?? fallback}`.trim();

const getLegacyCaptureSettings = (): ILegacyCaptureSettings => {
    return (window.sourceflow.storage[Constants.LOCAL_CAPTURE] || {}) as ILegacyCaptureSettings;
};

export const getDefaultWorkbenchItemSettings = (): IWorkbenchItemSettings => ({
    notebook: "",
    tags: "inbox",
    openAfterSave: true,
    notePathPrefix: "收件箱/快速记录",
    taskPathPrefix: "收件箱/任务",
    eventPathPrefix: "收件箱/事件",
    noteTemplate: DEFAULT_NOTE_TEMPLATE,
    taskTemplate: DEFAULT_TASK_TEMPLATE,
    eventTemplate: DEFAULT_EVENT_TEMPLATE,
});

export const getWorkbenchItemSettings = (): IWorkbenchItemSettings => {
    const defaults = getDefaultWorkbenchItemSettings();
    const stored = (window.sourceflow.storage[Constants.LOCAL_WORKBENCH_ITEMS] || {}) as Partial<IWorkbenchItemSettings>;
    const legacy = getLegacyCaptureSettings();
    return {
        notebook: normalizeText(stored.notebook ?? legacy.notebook, defaults.notebook),
        tags: normalizeText(stored.tags ?? legacy.tags, defaults.tags),
        openAfterSave: stored.openAfterSave == null ? (legacy.openAfterSave == null ? defaults.openAfterSave : !!legacy.openAfterSave) : !!stored.openAfterSave,
        notePathPrefix: normalizeText(stored.notePathPrefix ?? legacy.quickPathPrefix, defaults.notePathPrefix),
        taskPathPrefix: normalizeText(stored.taskPathPrefix ?? legacy.taskPathPrefix, defaults.taskPathPrefix),
        eventPathPrefix: normalizeText(stored.eventPathPrefix ?? legacy.eventPathPrefix, defaults.eventPathPrefix),
        noteTemplate: `${stored.noteTemplate ?? legacy.noteTemplate ?? defaults.noteTemplate}`,
        taskTemplate: `${stored.taskTemplate ?? legacy.taskTemplate ?? defaults.taskTemplate}`,
        eventTemplate: `${stored.eventTemplate ?? legacy.eventTemplate ?? defaults.eventTemplate}`,
    };
};

export const saveWorkbenchItemSettings = (settings: IWorkbenchItemSettings) => {
    window.sourceflow.storage[Constants.LOCAL_WORKBENCH_ITEMS] = settings;
    setStorageVal(Constants.LOCAL_WORKBENCH_ITEMS, settings);
};

export const getWorkbenchItemPathPrefix = (settings: IWorkbenchItemSettings, mode: TWorkbenchItemMode) => {
    switch (mode) {
        case "task":
            return settings.taskPathPrefix;
        case "event":
            return settings.eventPathPrefix;
        default:
            return settings.notePathPrefix;
    }
};

export const setWorkbenchItemPathPrefix = (settings: IWorkbenchItemSettings, mode: TWorkbenchItemMode, value: string) => {
    switch (mode) {
        case "task":
            settings.taskPathPrefix = value;
            break;
        case "event":
            settings.eventPathPrefix = value;
            break;
        default:
            settings.notePathPrefix = value;
            break;
    }
};

export const fillWorkbenchItemTemplate = (template: string, values: Record<string, string>) => {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => values[key] || "");
};

export const exportWorkbenchItemSettings = (): IWorkbenchItemAutomationData => {
    const settings = getWorkbenchItemSettings();
    return {
        notebook: settings.notebook,
        tags: settings.tags,
        openAfterSave: settings.openAfterSave,
        notePathPrefix: settings.notePathPrefix,
        taskPathPrefix: settings.taskPathPrefix,
        eventPathPrefix: settings.eventPathPrefix,
        noteTemplate: settings.noteTemplate,
        taskTemplate: settings.taskTemplate,
        eventTemplate: settings.eventTemplate,
    };
};

export const importWorkbenchItemSettings = (data: Partial<IWorkbenchItemAutomationData & ILegacyCaptureSettings>) => {
    const defaults = getDefaultWorkbenchItemSettings();
    const nextSettings: IWorkbenchItemSettings = {
        notebook: normalizeText(data?.notebook, defaults.notebook),
        tags: normalizeText(data?.tags, defaults.tags),
        openAfterSave: data?.openAfterSave == null ? defaults.openAfterSave : !!data.openAfterSave,
        notePathPrefix: normalizeText(data?.notePathPrefix ?? data?.quickPathPrefix, defaults.notePathPrefix),
        taskPathPrefix: normalizeText(data?.taskPathPrefix, defaults.taskPathPrefix),
        eventPathPrefix: normalizeText(data?.eventPathPrefix, defaults.eventPathPrefix),
        noteTemplate: `${data?.noteTemplate ?? defaults.noteTemplate}`,
        taskTemplate: `${data?.taskTemplate ?? defaults.taskTemplate}`,
        eventTemplate: `${data?.eventTemplate ?? defaults.eventTemplate}`,
    };
    saveWorkbenchItemSettings(nextSettings);
    return getWorkbenchItemSettings();
};
