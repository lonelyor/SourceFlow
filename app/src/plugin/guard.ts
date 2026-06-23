import {App} from "../index";
import {Constants} from "../constants";
import {setStorageVal} from "../protyle/util/compatibility";
import {showMessage} from "../dialog/message";
import {uninstall} from "./uninstall";

interface IPluginGuardFailureEntry {
    at: number;
    detail: string;
    stage: string;
}

interface IPluginGuardStorage {
    failures: Record<string, IPluginGuardFailureEntry>;
    startupDisabled: string[];
}

const getPluginGuardMessage = (name: string, startup: boolean) => {
    const isZh = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase().startsWith("zh");
    if (startup) {
        return isZh
            ? `插件 ${name} 因启动异常已被自动跳过，不影响笔记使用。`
            : `Plugin ${name} was skipped automatically after a startup failure. Notes remain usable.`;
    }
    return isZh
        ? `插件 ${name} 因运行异常已被自动禁用，不影响笔记使用。`
        : `Plugin ${name} was disabled automatically after a runtime failure. Notes remain usable.`;
};

const normalizePluginGuardStorage = (raw: unknown): IPluginGuardStorage => {
    if (!raw || typeof raw !== "object") {
        return {
            failures: {},
            startupDisabled: [],
        };
    }
    const data = raw as Record<string, unknown>;
    const failures = data.failures && typeof data.failures === "object" ? data.failures as Record<string, IPluginGuardFailureEntry> : {};
    const startupDisabled = Array.isArray(data.startupDisabled) ? data.startupDisabled.map((item) => `${item || ""}`.trim()).filter(Boolean) : [];
    return {
        failures,
        startupDisabled: Array.from(new Set(startupDisabled)),
    };
};

const getPluginGuardStorage = () => {
    const storage = normalizePluginGuardStorage(window.sourceflow.storage[Constants.LOCAL_PLUGIN_GUARD]);
    window.sourceflow.storage[Constants.LOCAL_PLUGIN_GUARD] = storage;
    return storage;
};

const savePluginGuardStorage = () => {
    setStorageVal(Constants.LOCAL_PLUGIN_GUARD, getPluginGuardStorage());
};

const stringifyError = (error: unknown) => {
    if (error instanceof Error) {
        return `${error.message}${error.stack ? `\n${error.stack}` : ""}`;
    }
    return `${error}`;
};

export const isPluginStartupDisabled = (name: string) => {
    return getPluginGuardStorage().startupDisabled.includes(name);
};

export const clearPluginGuardFailure = (name: string) => {
    const storage = getPluginGuardStorage();
    const nextDisabled = storage.startupDisabled.filter((item) => item !== name);
    if (!(name in storage.failures) && nextDisabled.length === storage.startupDisabled.length) {
        return;
    }
    delete storage.failures[name];
    storage.startupDisabled = nextDisabled;
    savePluginGuardStorage();
};

export const disablePluginAfterError = (app: App, name: string, stage: string, error: unknown, options: {
    notify?: boolean,
    startup?: boolean,
} = {}) => {
    console.error(`plugin ${name} ${stage} error:`, error);
    const storage = getPluginGuardStorage();
    storage.failures[name] = {
        at: Date.now(),
        detail: stringifyError(error),
        stage,
    };
    if (options.startup && !storage.startupDisabled.includes(name)) {
        storage.startupDisabled.push(name);
    }
    savePluginGuardStorage();
    try {
        uninstall(app, name, true);
    } catch (uninstallError) {
        console.error(`plugin ${name} uninstall after failure error:`, uninstallError);
    }
    if (options.notify !== false) {
        showMessage(getPluginGuardMessage(name, !!options.startup), 7000, "error");
    }
};
