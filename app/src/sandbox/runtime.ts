type TSandboxPrimitive = string | number | boolean | null | undefined;

const BLOCKED_FUNCTION_PROPERTY_SET = new Set([
    "constructor",
    "prototype",
    "__proto__",
    "arguments",
    "caller",
    "callee",
    "bind",
    "call",
    "apply",
]);

const DEFAULT_SANDBOX_SHADOW_NAMES = [
    "window",
    "globalThis",
    "self",
    "top",
    "parent",
    "frames",
    "opener",
    "document",
    "location",
    "history",
    "navigator",
    "screen",
    "performance",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
    "cookieStore",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "Worker",
    "SharedWorker",
    "BroadcastChannel",
    "MessageChannel",
    "MessagePort",
    "open",
    "postMessage",
    "close",
    "alert",
    "confirm",
    "prompt",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "requestIdleCallback",
    "cancelIdleCallback",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "queueMicrotask",
    "Image",
    "Audio",
    "File",
    "FileReader",
    "FileList",
    "Blob",
    "MediaSource",
    "Notification",
    "SharedArrayBuffer",
    "Atomics",
    "MutationObserver",
    "ResizeObserver",
    "IntersectionObserver",
    "DOMParser",
    "XMLSerializer",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "CustomEvent",
    "Function",
    "FunctionCtor",
    "evalFn",
    "require",
    "process",
    "module",
    "exports",
    "importScripts",
];

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (value === null || typeof value !== "object") {
        return false;
    }
    if (Object.prototype.toString.call(value) !== "[object Object]") {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto === null || proto === Object.prototype) {
        return true;
    }
    return Object.prototype.toString.call(proto) === "[object Object]" &&
        typeof (proto as {constructor?: {name?: string}}).constructor?.name === "string" &&
        (proto as {constructor: {name: string}}).constructor.name === "Object";
};

const toSandboxError = (scope: string, capability: string, reason?: string) => {
    const suffix = reason ? `: ${reason}` : "";
    return new Error(`[${scope}] blocked access to ${capability}${suffix}`);
};

export const cloneSandboxData = <T>(value: T, seen = new WeakMap<object, any>()): T => {
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (seen.has(value as object)) {
        return seen.get(value as object);
    }
    if (Array.isArray(value)) {
        const clone: unknown[] = [];
        seen.set(value, clone);
        value.forEach((item) => {
            clone.push(cloneSandboxData(item, seen));
        });
        return Object.freeze(clone) as T;
    }
    if (value instanceof Date) {
        return new Date(value.getTime()) as T;
    }
    if (!isPlainObject(value)) {
        return undefined as T;
    }
    const clone = Object.create(null) as Record<string, unknown>;
    seen.set(value as object, clone);
    Object.keys(value).forEach((key) => {
        clone[key] = cloneSandboxData((value as Record<string, unknown>)[key], seen);
    });
    return Object.freeze(clone) as T;
};

export const createProtectedCallable = <T extends (...args: any[]) => any>(fn: T, label: string): T => {
    const guarded = new Proxy(fn, {
        apply(target, _thisArg, args) {
            return Reflect.apply(target, undefined, args);
        },
        construct() {
            throw toSandboxError(label, "constructor");
        },
        get(target, property) {
            if (typeof property === "string") {
                if (BLOCKED_FUNCTION_PROPERTY_SET.has(property)) {
                    return undefined;
                }
                if (property === "name") {
                    return target.name || label;
                }
                if (property === "length") {
                    return target.length;
                }
                if (property === "toString") {
                    return () => `function ${label}() { [sandboxed code] }`;
                }
            }
            if (property === Symbol.toPrimitive) {
                return () => `function ${label}() { [sandboxed code] }`;
            }
            if (property === Symbol.toStringTag) {
                return "Function";
            }
            return undefined;
        },
        set() {
            return false;
        },
        defineProperty() {
            return false;
        },
        deleteProperty() {
            return false;
        },
        getPrototypeOf() {
            return null;
        },
        ownKeys() {
            return [];
        },
        getOwnPropertyDescriptor(_target, property) {
            if (property === "name" || property === "length") {
                return {
                    configurable: true,
                    enumerable: false,
                };
            }
            return undefined;
        },
        has(_target, property) {
            return property === "name" || property === "length";
        },
    });
    return guarded as T;
};

export const createBlockedCallable = (scope: string, capability: string, reason?: string) => {
    return createProtectedCallable((..._args: any[]) => {
        void _args;
        throw toSandboxError(scope, capability, reason);
    }, `${scope}:${capability}`);
};

export const createSandboxProxyObject = (label: string, options: {
    getters?: Record<string | symbol, () => any>;
    setters?: Record<string, (value: any) => void>;
    keys?: Array<string | symbol>;
}) => {
    const getterEntries = options.getters || {};
    const setterEntries = options.setters || {};
    const keySet = new Set<string | symbol>(options.keys || [
        ...Reflect.ownKeys(getterEntries),
        ...Reflect.ownKeys(setterEntries),
    ]);
    return new Proxy(Object.create(null), {
        get(_target, property) {
            if (property === Symbol.toStringTag) {
                return label;
            }
            const getter = getterEntries[property];
            if (getter) {
                return getter();
            }
            if (property === "toString") {
                return () => `[object ${label}]`;
            }
            return undefined;
        },
        set(_target, property, value) {
            if (typeof property === "string" && setterEntries[property]) {
                setterEntries[property](value);
                return true;
            }
            return false;
        },
        has(_target, property) {
            return keySet.has(property);
        },
        ownKeys() {
            return Array.from(keySet);
        },
        getOwnPropertyDescriptor(_target, property) {
            if (!keySet.has(property)) {
                return undefined;
            }
            return {
                enumerable: true,
                configurable: true,
            };
        },
        defineProperty() {
            return false;
        },
        deleteProperty() {
            return false;
        },
        getPrototypeOf() {
            return null;
        },
    });
};

const normalizeSourceURL = (sourceURL: string) => {
    return `${sourceURL || "sandbox-script"}`.replace(/\r|\n/g, "");
};

const wrapSourceAsFunction = (parameterNames: string[], source: string, sourceURL: string) => {
    return `(function anonymous(${parameterNames.join(",")}){"use strict";\n${source || ""}\n})\n//# sourceURL=${normalizeSourceURL(sourceURL)}`;
};

const compileSandboxFunction = <T extends (...args: any[]) => any>(parameterNames: string[], source: string, sourceURL: string): T => {
    return window.eval(wrapSourceAsFunction(parameterNames, source, sourceURL)) as T;
};

const defaultShadowFactories = (scope: string) => {
    const shadowValues = Object.create(null) as Record<string, unknown>;
    DEFAULT_SANDBOX_SHADOW_NAMES.forEach((name) => {
        shadowValues[name] = createBlockedCallable(scope, name);
    });
    shadowValues.window = null;
    shadowValues.globalThis = null;
    shadowValues.self = null;
    shadowValues.top = null;
    shadowValues.parent = null;
    shadowValues.frames = null;
    shadowValues.opener = null;
    shadowValues.document = null;
    shadowValues.location = null;
    shadowValues.history = null;
    shadowValues.navigator = null;
    shadowValues.screen = null;
    shadowValues.performance = null;
    shadowValues.localStorage = null;
    shadowValues.sessionStorage = null;
    shadowValues.indexedDB = null;
    shadowValues.caches = null;
    shadowValues.cookieStore = null;
    shadowValues.module = undefined;
    shadowValues.exports = undefined;
    shadowValues.require = undefined;
    shadowValues.process = undefined;
    shadowValues.HTMLElement = undefined;
    shadowValues.Element = undefined;
    shadowValues.Node = undefined;
    shadowValues.Event = undefined;
    shadowValues.CustomEvent = undefined;
    return shadowValues;
};

export const createSandboxShadowValues = (scope: string, overrides: Record<string, unknown> = {}) => {
    const shadowValues = defaultShadowFactories(scope);
    Object.keys(overrides).forEach((key) => {
        shadowValues[key] = overrides[key];
    });
    return shadowValues;
};

export const getSandboxShadowNames = () => {
    return DEFAULT_SANDBOX_SHADOW_NAMES.slice();
};

export const runSandboxedScript = <T>(options: {
    label: string;
    source: string;
    sourceURL: string;
    parameterNames: string[];
    parameters: unknown[];
    shadowOverrides?: Record<string, unknown>;
    excludeShadowNames?: string[];
}): T => {
    const shadowValues = createSandboxShadowValues(options.label, options.shadowOverrides);
    const excludedShadowNames = new Set(options.excludeShadowNames || []);
    const shadowNames = getSandboxShadowNames().filter((name) => !excludedShadowNames.has(name));
    const runner = compileSandboxFunction<(...args: unknown[]) => T>([
        ...options.parameterNames,
        ...shadowNames,
    ], options.source, options.sourceURL);
    const shadowArgs = shadowNames.map((name) => shadowValues[name]);
    return runner(...options.parameters, ...shadowArgs);
};

export const protectSandboxAPIRecord = <T extends Record<string, unknown>>(record: T, label: string): T => {
    const getters: Record<string | symbol, () => unknown> = Object.create(null);
    Reflect.ownKeys(record).forEach((key) => {
        const value = record[key as keyof T];
        getters[key] = () => {
            if (typeof value === "function") {
                return createProtectedCallable(value as (...args: any[]) => unknown, `${label}.${String(key)}`);
            }
            if (value && typeof value === "object") {
                return cloneSandboxData(value);
            }
            return value as TSandboxPrimitive;
        };
    });
    return createSandboxProxyObject(label, {
        getters,
        keys: Reflect.ownKeys(record),
    }) as T;
};
