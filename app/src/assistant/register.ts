import {App} from "../index";
import {afterLoadPlugin} from "../plugin/loader";
import {isStartupFuseEnabled} from "../stability/startupGuard";
import {isMobile} from "../util/functions";
import {ASSISTANT_PLUGIN_NAME, assistantText} from "./constants";
import {ensureAssistantFeatureAvailable, reportAssistantRuntimeError, scheduleAssistantIdleWork} from "./runtime";

let registerPromise: Promise<void> | null = null;
let registerState: "idle" | "loading" | "ready" | "failed" = "idle";

const builtinAssistantManifest: IPluginManifest = {
    manifestVersion: 1,
    name: ASSISTANT_PLUGIN_NAME,
    displayName: {
        default: assistantText("原生助手", "Native Assistant"),
    },
    description: {
        default: assistantText("SourceFlow 内置助手插件", "Built-in assistant plugin for SourceFlow"),
    },
    version: "1.0.0",
    minAppVersion: "0.1.0",
    author: "By lonelyor",
    url: "",
    frontends: ["desktop"],
    backends: ["all"],
    entry: "builtin",
    style: "",
    readme: {
        default: "README.md",
    },
    permissions: ["ui.dock", "ui.command", "ui.dialog", "ui.setting", "ui.tab", "workspace.read", "workspace.write"],
    allowedRequireModules: [],
};

const refreshAssistantActivityBar = async () => {
    try {
        const {refreshActivityBar} = await import("../layout/activityBar");
        refreshActivityBar();
    } catch (error) {
        console.error("[assistant] refresh activity bar failed", error);
    }
};

const bootstrapBuiltinAssistantPlugin = async (app: App) => {
    const {BuiltinAssistantPlugin} = await import("./BuiltinAssistantPlugin");
    if (app.plugins.find((item) => item.name === ASSISTANT_PLUGIN_NAME)) {
        registerState = "ready";
        return;
    }
    const plugin = new BuiltinAssistantPlugin({
        app,
        name: ASSISTANT_PLUGIN_NAME,
        displayName: assistantText("原生助手", "Native Assistant"),
        i18n: {},
        manifest: builtinAssistantManifest,
    });
    app.plugins.push(plugin);
    try {
        await plugin.onload();
        afterLoadPlugin(plugin);
        void refreshAssistantActivityBar();
        registerState = "ready";
    } catch (error) {
        const pluginIndex = app.plugins.findIndex((item) => item.name === ASSISTANT_PLUGIN_NAME);
        if (pluginIndex > -1) {
            app.plugins.splice(pluginIndex, 1);
        }
        registerState = "failed";
        reportAssistantRuntimeError("builtin assistant plugin onload", error, false);
    }
};

export const ensureBuiltinAssistantPlugin = (app: App) => {
    if (isMobile()) {
        return Promise.resolve();
    }
    if (isStartupFuseEnabled("assistant")) {
        ensureAssistantFeatureAvailable();
        registerState = "failed";
        return Promise.resolve();
    }
    if (registerState === "ready" || app.plugins.find((item) => item.name === ASSISTANT_PLUGIN_NAME)) {
        registerState = "ready";
        return Promise.resolve();
    }
    if (registerPromise) {
        return registerPromise;
    }
    registerState = "loading";
    registerPromise = bootstrapBuiltinAssistantPlugin(app).catch((error) => {
        registerState = "failed";
        reportAssistantRuntimeError("builtin assistant bootstrap", error, false);
    }).finally(() => {
        registerPromise = null;
    });
    return registerPromise;
};

export const deferBuiltinAssistantPluginLoad = (app: App) => {
    if (isMobile() || isStartupFuseEnabled("assistant") || registerState === "loading" || registerState === "ready" || registerState === "failed" ||
        app.plugins.find((item) => item.name === ASSISTANT_PLUGIN_NAME)) {
        return;
    }
    scheduleAssistantIdleWork(() => {
        void ensureBuiltinAssistantPlugin(app);
    }, 2200);
};
