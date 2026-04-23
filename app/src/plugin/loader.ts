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

const shouldHideUnifiedTopAction = () => document.body.classList.contains("body--activitybar-unified");

const runCode = (code: string, sourceURL: string) => {
    return window.eval("(function anonymous(require, module, exports, window, globalThis, self, document, navigator, location, history, localStorage, sessionStorage, indexedDB, caches, cookieStore, fetch, XMLHttpRequest, WebSocket, EventSource, Worker, SharedWorker, BroadcastChannel, MessageChannel, MessagePort, open, postMessage, close, Function, FunctionCtor, evalFn){\"use strict\";\n".concat(code, "\n})\n//# sourceURL=").concat(sourceURL, "\n"));
};

const hasPluginPermission = (item: IPluginData, permission: string) => {
    return Array.isArray(item.manifest?.permissions) && item.manifest.permissions.includes(permission);
};

const getPluginDeniedError = (item: IPluginData, permission: string, capability: string) => {
    const isZh = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase().startsWith("zh");
    const pluginName = item.manifest?.name || item.name || "unknown";
    return new Error(isZh
        ? `插件 ${pluginName} 未声明权限 ${permission}，运行时已阻止 ${capability}。`
        : `Plugin ${pluginName} does not declare permission ${permission}. Runtime blocked ${capability}.`);
};

const getPluginBlockedError = (item: IPluginData, capability: string, reason?: string) => {
    const isZh = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase().startsWith("zh");
    const pluginName = item.manifest?.name || item.name || "unknown";
    return new Error(isZh
        ? `插件 ${pluginName} 运行时已禁止直接访问 ${capability}${reason ? `：${reason}` : "。"}`
        : `Plugin ${pluginName} is not allowed to access ${capability} directly at runtime${reason ? `: ${reason}` : "."}`);
};

const createDeniedFunction = (item: IPluginData, permission: string, capability: string) => {
    return (..._args: any[]) => {
        void _args;
        throw getPluginDeniedError(item, permission, capability);
    };
};

const createDeniedConstructor = (item: IPluginData, permission: string, capability: string) => {
    return class {
        constructor(..._args: any[]) {
            void _args;
            throw getPluginDeniedError(item, permission, capability);
        }
    };
};

const createBlockedFunction = (item: IPluginData, capability: string, reason?: string) => {
    return (..._args: any[]) => {
        void _args;
        throw getPluginBlockedError(item, capability, reason);
    };
};

const createBlockedConstructor = (item: IPluginData, capability: string, reason?: string) => {
    return class {
        constructor(..._args: any[]) {
            void _args;
            throw getPluginBlockedError(item, capability, reason);
        }
    };
};

const createPluginLocationProxy = (item: IPluginData) => {
    const blockedAssign = createBlockedFunction(item, "location.assign", "请使用 SourceFlow API 打开链接或标签页");
    const blockedReplace = createBlockedFunction(item, "location.replace", "请使用 SourceFlow API 打开链接或标签页");
    const blockedReload = createBlockedFunction(item, "location.reload", "插件不能直接重载宿主页面");
    return new Proxy(window.location, {
        get(target, property, receiver) {
            if (property === "assign") {
                return blockedAssign;
            }
            if (property === "replace") {
                return blockedReplace;
            }
            if (property === "reload") {
                return blockedReload;
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        },
        set(_target, property, _value) {
            void _value;
            throw getPluginBlockedError(item, `location.${String(property)}`, "插件不能直接修改宿主页面地址");
        }
    });
};

const createPluginHistoryProxy = (item: IPluginData) => {
    const reason = "请使用 SourceFlow API 进行导航";
    return new Proxy(window.history, {
        get(target, property, receiver) {
            if (property === "pushState" || property === "replaceState" || property === "go" || property === "back" || property === "forward") {
                return createBlockedFunction(item, `history.${String(property)}`, reason);
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        }
    });
};

const createPluginDocumentProxy = (item: IPluginData, sandboxWindow: Window & typeof globalThis) => {
    const shadowValues = new Map<PropertyKey, any>();
    return new Proxy(document, {
        get(target, property, receiver) {
            if (shadowValues.has(property)) {
                return shadowValues.get(property);
            }
            if (property === "defaultView" || property === "parentWindow") {
                return sandboxWindow;
            }
            if (property === "cookie") {
                return "";
            }
            if (property === "write" || property === "writeln" || property === "open" || property === "close") {
                return createBlockedFunction(item, `document.${String(property)}`, "插件不能直接改写宿主文档");
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        },
        set(_target, property, value) {
            if (property === "cookie" || property === "location") {
                throw getPluginBlockedError(item, `document.${String(property)}`, "插件不能直接修改宿主文档状态");
            }
            shadowValues.set(property, value);
            return true;
        }
    });
};

const createPluginNavigatorProxy = (item: IPluginData, networkGranted: boolean) => {
    const deniedSendBeacon = createDeniedFunction(item, "network.http", "navigator.sendBeacon");
    return new Proxy(window.navigator, {
        get(target, property, receiver) {
            if (property === "sendBeacon") {
                return networkGranted ? target.sendBeacon.bind(target) : deniedSendBeacon;
            }
            if (property === "serviceWorker") {
                return undefined;
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        }
    });
};

const createPluginWindowProxy = (item: IPluginData, scopedAPI: ReturnType<typeof createPluginAPI>) => {
    const networkGranted = hasPluginPermission(item, "network.http");
    const deniedFetch = createDeniedFunction(item, "network.http", "fetch");
    const deniedXHR = createDeniedConstructor(item, "network.http", "XMLHttpRequest");
    const deniedWebSocket = createDeniedConstructor(item, "network.http", "WebSocket");
    const deniedEventSource = createDeniedConstructor(item, "network.http", "EventSource");
    const deniedPostMessage = createDeniedFunction(item, "network.http", "postMessage");
    const deniedOpen = createDeniedFunction(item, "network.http", "open");
    const deniedWorker = createBlockedConstructor(item, "Worker", "插件不能直接创建后台执行上下文");
    const deniedSharedWorker = createBlockedConstructor(item, "SharedWorker", "插件不能直接创建后台执行上下文");
    const deniedBroadcastChannel = createBlockedConstructor(item, "BroadcastChannel", "插件不能直接创建跨上下文通信通道");
    const deniedMessageChannel = createBlockedConstructor(item, "MessageChannel", "插件不能直接创建跨上下文通信通道");
    const deniedMessagePort = createBlockedConstructor(item, "MessagePort", "插件不能直接创建跨上下文通信通道");
    const deniedStorage = createBlockedFunction(item, "storage", "请使用 SourceFlow 插件存储 API");
    const deniedClose = createBlockedFunction(item, "close", "插件不能直接关闭宿主窗口");
    const navigatorProxy = createPluginNavigatorProxy(item, networkGranted);
    const locationProxy = createPluginLocationProxy(item);
    const historyProxy = createPluginHistoryProxy(item);
    const shadowValues = new Map<PropertyKey, any>();
    const blockedSetProperties = new Set<PropertyKey>([
        "window", "self", "globalThis", "top", "parent", "frames", "opener",
        "location", "history", "document", "navigator", "sourceflow",
        "localStorage", "sessionStorage", "indexedDB", "caches", "cookieStore",
        "fetch", "XMLHttpRequest", "WebSocket", "EventSource",
        "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "MessagePort",
        "require", "process", "Function", "eval",
    ]);
    const sandboxWindow: Window & typeof globalThis = new Proxy(window, {
        get(target, property, receiver) {
            if (!blockedSetProperties.has(property) && shadowValues.has(property)) {
                return shadowValues.get(property);
            }
            if (property === "fetch") {
                return networkGranted ? target.fetch.bind(target) : deniedFetch;
            }
            if (property === "XMLHttpRequest") {
                return networkGranted ? target.XMLHttpRequest : deniedXHR;
            }
            if (property === "WebSocket") {
                return networkGranted ? target.WebSocket : deniedWebSocket;
            }
            if (property === "EventSource") {
                return networkGranted ? target.EventSource : deniedEventSource;
            }
            if (property === "Worker") {
                return deniedWorker;
            }
            if (property === "SharedWorker") {
                return deniedSharedWorker;
            }
            if (property === "BroadcastChannel") {
                return deniedBroadcastChannel;
            }
            if (property === "MessageChannel") {
                return deniedMessageChannel;
            }
            if (property === "MessagePort") {
                return deniedMessagePort;
            }
            if (property === "sourceflow") {
                return scopedAPI;
            }
            if (property === "require" || property === "process" || property === "Function" || property === "eval") {
                return undefined;
            }
            if (property === "window" || property === "self" || property === "globalThis" || property === "top" || property === "parent" || property === "frames") {
                return sandboxWindow;
            }
            if (property === "opener") {
                return null;
            }
            if (property === "location") {
                return locationProxy;
            }
            if (property === "history") {
                return historyProxy;
            }
            if (property === "localStorage" || property === "sessionStorage" || property === "indexedDB" || property === "caches" || property === "cookieStore") {
                return new Proxy({}, {
                    get() {
                        return deniedStorage;
                    }
                });
            }
            if (property === "postMessage") {
                return networkGranted ? target.postMessage.bind(target) : deniedPostMessage;
            }
            if (property === "open") {
                return networkGranted ? target.open.bind(target) : deniedOpen;
            }
            if (property === "close") {
                return deniedClose;
            }
            if (property === "navigator") {
                return navigatorProxy;
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        },
        set(_target, property, value) {
            if (blockedSetProperties.has(property)) {
                throw getPluginBlockedError(item, `window.${String(property)}`, "插件不能直接覆盖宿主全局对象");
            }
            shadowValues.set(property, value);
            return true;
        },
        defineProperty(_target, property, attributes) {
            if (blockedSetProperties.has(property)) {
                throw getPluginBlockedError(item, `window.${String(property)}`, "插件不能直接定义宿主全局对象属性");
            }
            shadowValues.set(property, attributes.value);
            return true;
        },
        deleteProperty(_target, property) {
            shadowValues.delete(property);
            return true;
        }
    }) as Window & typeof globalThis;
    return sandboxWindow;
};

const createPluginRequire = (item: IPluginData, scopedAPI: ReturnType<typeof createPluginAPI>) => {
    const requireFunc = (key: string) => {
        if (key === "sourceflow") {
            return scopedAPI;
        }
        if (Array.isArray(item.manifest?.allowedRequireModules) &&
            item.manifest.allowedRequireModules.includes(key) &&
            window.require instanceof Function) {
            return window.require(key);
        }
        return undefined;
    };
    if (window.require instanceof Function) {
        // @ts-ignore
        requireFunc.__proto__ = window.require;
    }
    return requireFunc;
};

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
    const sandboxWindow = createPluginWindowProxy(item, scopedAPI);
    const sandboxDocument = createPluginDocumentProxy(item, sandboxWindow);
    try {
        runCode(item.js, "plugin:" + encodeURIComponent(item.name))(
            createPluginRequire(item, scopedAPI),
            moduleObj,
            exportsObj,
            sandboxWindow,
            sandboxWindow,
            sandboxWindow,
            sandboxDocument,
            sandboxWindow.navigator,
            sandboxWindow.location,
            sandboxWindow.history,
            // @ts-ignore
            sandboxWindow.localStorage,
            // @ts-ignore
            sandboxWindow.sessionStorage,
            // @ts-ignore
            sandboxWindow.indexedDB,
            // @ts-ignore
            sandboxWindow.caches,
            // @ts-ignore
            sandboxWindow.cookieStore,
            sandboxWindow.fetch,
            sandboxWindow.XMLHttpRequest,
            sandboxWindow.WebSocket,
            sandboxWindow.EventSource,
            // @ts-ignore
            sandboxWindow.Worker,
            // @ts-ignore
            sandboxWindow.SharedWorker,
            // @ts-ignore
            sandboxWindow.BroadcastChannel,
            // @ts-ignore
            sandboxWindow.MessageChannel,
            // @ts-ignore
            sandboxWindow.MessagePort,
            sandboxWindow.open,
            sandboxWindow.postMessage,
            sandboxWindow.close,
            // @ts-ignore
            sandboxWindow.Function,
            undefined,
            undefined
        );
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
