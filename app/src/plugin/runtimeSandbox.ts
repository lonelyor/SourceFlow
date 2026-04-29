import {createProtectedCallable, runSandboxedScript} from "../sandbox/runtime";

type TPluginScopedAPI = Record<string, any>;

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

const bindCallable = <T extends (...args: any[]) => any>(target: unknown, fn: T, label: string): T => {
    return createProtectedCallable((...args: Parameters<T>) => Reflect.apply(fn, target, args), label) as T;
};

const createDeniedFunction = (item: IPluginData, permission: string, capability: string) => {
    return createProtectedCallable((..._args: any[]) => {
        void _args;
        throw getPluginDeniedError(item, permission, capability);
    }, `PluginDenied:${item.name}:${capability}`);
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
    return createProtectedCallable((..._args: any[]) => {
        void _args;
        throw getPluginBlockedError(item, capability, reason);
    }, `PluginBlocked:${item.name}:${capability}`);
};

const createBlockedConstructor = (item: IPluginData, capability: string, reason?: string) => {
    return class {
        constructor(..._args: any[]) {
            void _args;
            throw getPluginBlockedError(item, capability, reason);
        }
    };
};

const createStorageDeniedProxy = (item: IPluginData) => {
    const deniedStorage = createBlockedFunction(item, "storage", "请使用 SourceFlow 插件存储 API");
    return new Proxy(Object.create(null), {
        get() {
            return deniedStorage;
        },
        set() {
            throw getPluginBlockedError(item, "storage", "请使用 SourceFlow 插件存储 API");
        },
    });
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
            if (typeof value === "function") {
                return bindCallable(target, value, `PluginLocation.${String(property)}`);
            }
            return value;
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
            if (typeof value === "function") {
                return bindCallable(target, value, `PluginHistory.${String(property)}`);
            }
            return value;
        }
    });
};

const createPluginNavigatorProxy = (item: IPluginData, networkGranted: boolean) => {
    const deniedSendBeacon = createDeniedFunction(item, "network.http", "navigator.sendBeacon");
    return new Proxy(window.navigator, {
        get(target, property, receiver) {
            if (property === "sendBeacon") {
                return networkGranted ? bindCallable(target, target.sendBeacon, "PluginNavigator.sendBeacon") : deniedSendBeacon;
            }
            if (property === "serviceWorker") {
                return undefined;
            }
            const value = Reflect.get(target, property, receiver);
            if (typeof value === "function") {
                return bindCallable(target, value, `PluginNavigator.${String(property)}`);
            }
            return value;
        }
    });
};

const createPluginDocumentProxy = (item: IPluginData, getSandboxWindow: () => Window & typeof globalThis) => {
    const shadowValues = new Map<PropertyKey, any>();
    return new Proxy(document, {
        get(target, property, receiver) {
            if (shadowValues.has(property)) {
                return shadowValues.get(property);
            }
            if (property === "defaultView" || property === "parentWindow") {
                return getSandboxWindow();
            }
            if (property === "cookie") {
                return "";
            }
            if (property === "write" || property === "writeln" || property === "open" || property === "close") {
                return createBlockedFunction(item, `document.${String(property)}`, "插件不能直接改写宿主文档");
            }
            const value = Reflect.get(target, property, receiver);
            if (typeof value === "function") {
                return bindCallable(target, value, `PluginDocument.${String(property)}`);
            }
            return value;
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

const createPluginWindowProxy = (item: IPluginData, scopedAPI: TPluginScopedAPI, getSandboxDocument: () => Document) => {
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
    const deniedClose = createBlockedFunction(item, "close", "插件不能直接关闭宿主窗口");
    const navigatorProxy = createPluginNavigatorProxy(item, networkGranted);
    const locationProxy = createPluginLocationProxy(item);
    const historyProxy = createPluginHistoryProxy(item);
    const storageProxy = createStorageDeniedProxy(item);
    const shadowValues = new Map<PropertyKey, any>();
    const blockedSetProperties = new Set<PropertyKey>([
        "window", "self", "globalThis", "top", "parent", "frames", "opener",
        "location", "history", "document", "navigator", "sourceflow",
        "localStorage", "sessionStorage", "indexedDB", "caches", "cookieStore",
        "fetch", "XMLHttpRequest", "WebSocket", "EventSource",
        "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "MessagePort",
        "require", "process", "Function", "eval",
    ]);
    let sandboxWindow: Window & typeof globalThis;
    sandboxWindow = new Proxy(window, {
        get(target, property, receiver) {
            if (!blockedSetProperties.has(property) && shadowValues.has(property)) {
                return shadowValues.get(property);
            }
            if (property === "fetch") {
                return networkGranted ? bindCallable(target, target.fetch, "PluginWindow.fetch") : deniedFetch;
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
            if (property === "document") {
                return getSandboxDocument();
            }
            if (property === "localStorage" || property === "sessionStorage" || property === "indexedDB" || property === "caches" || property === "cookieStore") {
                return storageProxy;
            }
            if (property === "postMessage") {
                return networkGranted ? bindCallable(target, target.postMessage, "PluginWindow.postMessage") : deniedPostMessage;
            }
            if (property === "open") {
                return networkGranted ? bindCallable(target, target.open, "PluginWindow.open") : deniedOpen;
            }
            if (property === "close") {
                return deniedClose;
            }
            if (property === "navigator") {
                return navigatorProxy;
            }
            const value = Reflect.get(target, property, receiver);
            if (typeof value === "function") {
                return bindCallable(target, value, `PluginWindow.${String(property)}`);
            }
            return value;
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

const createPluginRequire = (item: IPluginData, scopedAPI: TPluginScopedAPI) => {
    const requireFunc = (key: string) => {
        if (key === "sourceflow") {
            return scopedAPI;
        }
        if (Array.isArray(item.manifest?.allowedRequireModules) &&
            item.manifest.allowedRequireModules.includes(key) &&
            typeof window.require === "function") {
            return window.require(key);
        }
        return undefined;
    };
    return createProtectedCallable(requireFunc, `PluginRequire:${item.name}`);
};

export const executePluginModule = (item: IPluginData, scopedAPI: TPluginScopedAPI, moduleObj: {exports: Record<string, any>}, exportsObj: Record<string, any>) => {
    let sandboxDocument: Document;
    const sandboxWindow = createPluginWindowProxy(item, scopedAPI, () => sandboxDocument);
    sandboxDocument = createPluginDocumentProxy(item, () => sandboxWindow);
    runSandboxedScript<void>({
        label: `plugin:${item.name}`,
        source: item.js,
        sourceURL: `plugin:${encodeURIComponent(item.name)}`,
        parameterNames: ["require", "module", "exports", "sourceflow"],
        parameters: [createPluginRequire(item, scopedAPI), moduleObj, exportsObj, scopedAPI],
        excludeShadowNames: ["require", "module", "exports"],
        shadowOverrides: {
            window: sandboxWindow,
            globalThis: sandboxWindow,
            self: sandboxWindow,
            top: sandboxWindow,
            parent: sandboxWindow,
            frames: sandboxWindow,
            opener: null,
            document: sandboxDocument,
            navigator: sandboxWindow.navigator,
            location: sandboxWindow.location,
            history: sandboxWindow.history,
            localStorage: sandboxWindow.localStorage,
            sessionStorage: sandboxWindow.sessionStorage,
            indexedDB: sandboxWindow.indexedDB,
            caches: sandboxWindow.caches,
            cookieStore: (sandboxWindow as Record<string, any>).cookieStore,
            fetch: sandboxWindow.fetch,
            XMLHttpRequest: sandboxWindow.XMLHttpRequest,
            WebSocket: sandboxWindow.WebSocket,
            EventSource: sandboxWindow.EventSource,
            Worker: sandboxWindow.Worker,
            SharedWorker: sandboxWindow.SharedWorker,
            BroadcastChannel: sandboxWindow.BroadcastChannel,
            MessageChannel: sandboxWindow.MessageChannel,
            MessagePort: sandboxWindow.MessagePort,
            open: sandboxWindow.open,
            postMessage: sandboxWindow.postMessage,
            close: sandboxWindow.close,
            Function: undefined,
            FunctionCtor: undefined,
            evalFn: undefined,
            process: undefined,
        },
    });
};
