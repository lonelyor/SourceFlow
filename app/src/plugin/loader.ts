import {fetchSyncPost} from "../util/fetch";
import {App} from "../index";
import {Plugin} from "./index";
/// #if !MOBILE
import {resizeTopBar, saveLayout} from "../layout/util";
/// #endif
import {createPluginAPI} from "./API";
import {getFrontend, isMobile, isWindow} from "../util/functions";
import {Constants} from "../constants";
import {uninstall} from "./uninstall";
import {setStorageVal} from "../protyle/util/compatibility";
import {getAllEditor} from "../layout/getAll";
import {clearPluginGuardFailure, disablePluginAfterError, isPluginStartupDisabled} from "./guard";
import {isStartupFuseEnabled} from "../stability/startupGuard";
import {executePluginModule} from "./runtimeSandbox";

const shouldHideUnifiedTopAction = () => document.body.classList.contains("body--activitybar-unified");

export const loadPlugins = async (app: App, names?: string[], init = true) => {
    const response = await fetchSyncPost("/api/plugins/loadPlugins", {frontend: getFrontend()});
    const pluginsStyle = getPluginsStyle();
    for (let i = 0; i < response.data.length; i++) {
        const item = response.data[i] as IPluginData;
        if (!names || (names && names.includes(item.name))) {
            if (init) {
                // 初始化时为加快启动速度，已特殊处理，不进行 await
                void loadPluginJS(app, item).then((plugin) => {
                    if (plugin) {
                        insertPluginCSS(item, pluginsStyle);
                    }
                });
            } else {
                const plugin = await loadPluginJS(app, item);
                if (plugin) {
                    insertPluginCSS(item, pluginsStyle);
                }
            }
        }
    }
};

const scheduleIdleWork = (runner: () => void, timeout = 1000) => {
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => runner(), {timeout});
        return;
    }
    window.setTimeout(runner, 0);
};

const loadPluginsIncrementally = async (app: App) => {
    const response = await fetchSyncPost("/api/plugins/loadPlugins", {frontend: getFrontend()});
    const queue = (response.data as IPluginData[]).slice();
    const pluginsStyle = getPluginsStyle();
    const runNext = () => {
        const item = queue.shift();
        if (!item) {
            return;
        }
        if (isPluginStartupDisabled(item.name)) {
            console.warn(`plugin ${item.name} skipped by startup guard`);
            scheduleIdleWork(runNext, 1500);
            return;
        }
        void loadPluginJS(app, item, true).then((plugin) => {
            insertPluginCSS(item, pluginsStyle);
            if (plugin) {
                afterLoadPlugin(plugin, {startup: true});
            }
        }).finally(() => {
            scheduleIdleWork(runNext, 1500);
        });
    };
    runNext();
};

export const deferInitialPluginLoad = (app: App) => {
    if (isStartupFuseEnabled("plugins")) {
        console.warn("plugin startup skipped by safe startup mode");
        return;
    }
    const runner = () => {
        void loadPluginsIncrementally(app);
    };
    scheduleIdleWork(runner, 1500);
};

const loadPluginJS = async (app: App, item: IPluginData, startup = false) => {
    const exportsObj: { [key: string]: any } = {};
    const moduleObj = {exports: exportsObj};
    const scopedAPI = createPluginAPI(item.manifest);
    try {
        executePluginModule(item, scopedAPI, moduleObj, exportsObj);
    } catch (e) {
        disablePluginAfterError(app, item.name, "run", e, {notify: !startup, startup});
        return;
    }
    const pluginClass = (moduleObj.exports || exportsObj).default || moduleObj.exports;
    if (typeof pluginClass !== "function") {
        disablePluginAfterError(app, item.name, "export", new Error(`plugin ${item.name} has no export`), {notify: !startup, startup});
        return;
    }
    if (!(pluginClass.prototype instanceof Plugin)) {
        disablePluginAfterError(app, item.name, "prototype", new Error(`plugin ${item.name} does not extends Plugin`), {notify: !startup, startup});
        return;
    }
    const plugin = new pluginClass({
        app,
        displayName: item.displayName,
        name: item.name,
        i18n: item.i18n,
        manifest: item.manifest
    }) as Plugin;
    app.plugins.push(plugin);
    try {
        await plugin.onload();
    } catch (e) {
        disablePluginAfterError(app, item.name, "onload", e, {notify: !startup, startup});
        return;
    }
    return plugin;
};

const getPluginsStyle = () => {
    let pluginsStyle = document.getElementById("pluginsStyle");
    if (!pluginsStyle) {
        pluginsStyle = document.createElement("style");
        pluginsStyle.id = "pluginsStyle"; // 用于将内联样式插入到插件样式前的标识
        document.head.append(pluginsStyle);
    }
    return pluginsStyle;
};

const insertPluginCSS = (item: IPluginData, pluginsStyle: HTMLElement) => {
    if (!item.css) {
        return;
    }
    const styleElement = document.createElement("style");
    styleElement.id = "pluginsStyle" + item.name;
    styleElement.textContent = item.css;
    pluginsStyle.insertAdjacentElement("afterend", styleElement);
};

// 启用插件
export const loadPlugin = async (app: App, item: IPluginData) => {
    clearPluginGuardFailure(item.name);
    const plugin = await loadPluginJS(app, item);
    if (!plugin) {
        return;
    }
    insertPluginCSS(item, getPluginsStyle());
    afterLoadPlugin(plugin);
    /// #if !MOBILE
    saveLayout();
    /// #endif
    getAllEditor().forEach(editor => {
        editor.protyle.toolbar.update(editor.protyle);
    });
    return plugin;
};

const updateDock = (dockItem: Config.IUILayoutDockTab[], index: number, plugin: Plugin, type: string) => {
    const dockKeys = Object.keys(plugin.docks);
    dockItem.forEach((tabItem: Config.IUILayoutDockTab, tabIndex: number) => {
        if (dockKeys.includes(tabItem.type)) {
            if (type === "Left") {
                plugin.docks[tabItem.type].config.position = index === 0 ? "LeftTop" : "LeftBottom";
            } else if (type === "Right") {
                plugin.docks[tabItem.type].config.position = index === 0 ? "RightTop" : "RightBottom";
            } else if (type === "Bottom") {
                plugin.docks[tabItem.type].config.position = index === 0 ? "BottomLeft" : "BottomRight";
            }
            plugin.docks[tabItem.type].config.index = tabIndex;
            plugin.docks[tabItem.type].config.show = tabItem.show;
            plugin.docks[tabItem.type].config.size = tabItem.size;
            if (!window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name]) {
                window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name] = {};
            }
            window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][tabItem.type] = plugin.docks[tabItem.type].config;
            setStorageVal(Constants.LOCAL_PLUGIN_DOCKS, window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS]);
        }
    });
};

export const afterLoadPlugin = (plugin: Plugin, options: {startup?: boolean} = {}) => {
    if (!plugin) {
        return;
    }
    const app = plugin.getApp();
    try {
        plugin.onLayoutReady();
    } catch (e) {
        disablePluginAfterError(app, plugin.name, "onLayoutReady", e, {notify: !options.startup, startup: !!options.startup});
        return;
    }

    try {
        if (!isWindow() || isMobile()) {
            plugin.topBarIcons.forEach(element => {
                if (document.contains(element)) {
                    return;
                }
                if (isMobile()) {
                    if (!window.sourceflow.storage[Constants.LOCAL_PLUGINTOPUNPIN].includes(element.id)) {
                        document.querySelector("#menuAbout")?.after(element);
                    }
                } else if (!isWindow()) {
                    if (window.sourceflow.storage[Constants.LOCAL_PLUGINTOPUNPIN].includes(element.id)) {
                        element.classList.add("fn__none");
                    }
                    if (shouldHideUnifiedTopAction()) {
                        element.classList.add("fn__none");
                    }
                    document.querySelector("#" + (element.getAttribute("data-location") === "right" ? "barPlugins" : "drag"))?.before(element);
                }
            });
        }
        /// #if !MOBILE
        resizeTopBar();
        plugin.statusBarIcons.forEach(element => {
            if (document.contains(element)) {
                return;
            }
            const statusElement = document.getElementById("status");
            if (element.getAttribute("data-location") === "right") {
                statusElement?.insertAdjacentElement("beforeend", element);
            } else {
                statusElement?.insertAdjacentElement("afterbegin", element);
            }
        });
        /// #endif
        if (isWindow()) {
            clearPluginGuardFailure(plugin.name);
            return;
        }

        /// #if !MOBILE
        window.sourceflow.config.uiLayout.left.data.forEach((dockItem: Config.IUILayoutDockTab[], index: number) => {
            updateDock(dockItem, index, plugin, "Left");
        });
        window.sourceflow.config.uiLayout.right.data.forEach((dockItem: Config.IUILayoutDockTab[], index: number) => {
            updateDock(dockItem, index, plugin, "Right");
        });
        window.sourceflow.config.uiLayout.bottom.data.forEach((dockItem: Config.IUILayoutDockTab[], index: number) => {
            updateDock(dockItem, index, plugin, "Bottom");
        });
        Object.keys(plugin.docks).forEach(key => {
            if (window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name] && window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][key]) {
                plugin.docks[key].config = window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][key];
            }
            const dock = plugin.docks[key];
            const hotkey = window.sourceflow.config.keymap.plugin[plugin.name] ? window.sourceflow.config.keymap.plugin[plugin.name][key]?.custom : undefined;
            if (dock.config.position.startsWith("Left")) {
                window.sourceflow.layout.leftDock.genButton([{
                    type: key,
                    size: dock.config.size,
                    show: dock.config.show,
                    icon: dock.config.icon,
                    title: dock.config.title,
                    hotkey
                }], dock.config.position === "LeftBottom" ? 1 : 0, dock.config.index);
            } else if (dock.config.position.startsWith("Bottom")) {
                window.sourceflow.layout.bottomDock.genButton([{
                    type: key,
                    size: dock.config.size,
                    show: dock.config.show,
                    icon: dock.config.icon,
                    title: dock.config.title,
                    hotkey
                }], dock.config.position === "BottomRight" ? 1 : 0, dock.config.index);
            } else if (dock.config.position.startsWith("Right")) {
                window.sourceflow.layout.rightDock.genButton([{
                    type: key,
                    size: dock.config.size,
                    show: dock.config.show,
                    icon: dock.config.icon,
                    title: dock.config.title,
                    hotkey
                }], dock.config.position === "RightBottom" ? 1 : 0, dock.config.index);
            }
        });
        /// #endif
        clearPluginGuardFailure(plugin.name);
    } catch (error) {
        disablePluginAfterError(app, plugin.name, "afterLoadPlugin", error, {notify: !options.startup, startup: !!options.startup});
    }
};

export const reloadPlugin = async (app: App, data: {
    uninstallPlugins?: string[],  // 插件卸载
    unloadPlugins?: string[],     // 插件禁用
    reloadPlugins?: string[],     // 插件启用，或插件代码变更
    dataChangePlugins?: string[], // 插件存储数据变更
} = {}) => {
    const {uninstallPlugins = [], unloadPlugins = [], reloadPlugins = [], dataChangePlugins = []} = data;
    // 禁用
    unloadPlugins.forEach((item) => {
        uninstall(app, item, true);
    });
    // 卸载
    uninstallPlugins.forEach((item) => {
        uninstall(app, item, false);
    });
    reloadPlugins.forEach((item) => {
        uninstall(app, item, true);
    });
    loadPlugins(app, reloadPlugins, false).then(() => {
        app.plugins.forEach(item => {
            if (reloadPlugins.includes(item.name)) {
                afterLoadPlugin(item);
                getAllEditor().forEach(editor => {
                    editor.protyle.toolbar.update(editor.protyle);
                });
            }
        });
    });
    app.plugins.forEach(item => {
        if (dataChangePlugins.includes(item.name)) {
            try {
                item.onDataChanged();
            } catch (e) {
                console.error(`plugin ${item.name} onDataChanged error:`, e);
            }
        }
    });
    /// #if !MOBILE
    saveLayout();
    /// #endif
};
