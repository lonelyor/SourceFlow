import {fetchSyncPost} from "../util/fetch";
import {createProtectedCallable} from "./runtime";

const READONLY_METHOD_PREFIXES = [
    "get",
    "list",
    "ls",
    "search",
    "query",
    "load",
    "read",
    "check",
    "render",
    "preview",
    "stat",
    "count",
    "has",
    "is",
];

const MUTATING_METHOD_PREFIXES = [
    "set",
    "create",
    "append",
    "insert",
    "update",
    "delete",
    "remove",
    "rename",
    "move",
    "put",
    "upload",
    "download",
    "open",
    "close",
    "exit",
    "exec",
    "run",
    "import",
    "export",
    "sync",
    "clear",
    "reset",
    "install",
    "uninstall",
    "enable",
    "disable",
    "copy",
    "duplicate",
    "merge",
    "commit",
    "rollback",
    "checkout",
    "recover",
    "change",
];

const normalizeKernelAPIPath = (path: string) => {
    return `${path || ""}`.trim().replace(/\\/g, "/");
};

export const isReadOnlyKernelAPIPath = (path: string) => {
    const normalized = normalizeKernelAPIPath(path);
    if (!normalized.startsWith("/api/")) {
        return false;
    }
    const segments = normalized.split("/").filter(Boolean);
    const methodName = segments[segments.length - 1] || "";
    const lowerMethod = methodName.toLowerCase();
    if (!lowerMethod) {
        return false;
    }
    if (MUTATING_METHOD_PREFIXES.some((prefix) => lowerMethod.startsWith(prefix))) {
        return false;
    }
    return READONLY_METHOD_PREFIXES.some((prefix) => lowerMethod.startsWith(prefix));
};

export const assertReadOnlyKernelAPIPath = (scope: string, path: string) => {
    const normalized = normalizeKernelAPIPath(path);
    if (!isReadOnlyKernelAPIPath(normalized)) {
        throw new Error(`[${scope}] blocked kernel API path: ${normalized || "<empty>"}`);
    }
    return normalized;
};

export const createReadOnlyKernelFetch = (scope: string) => {
    return createProtectedCallable(async (path: string, payload?: unknown) => {
        const safePath = assertReadOnlyKernelAPIPath(scope, path);
        const response = await fetchSyncPost(safePath, payload);
        if (response?.code && response.code !== 0) {
            throw new Error(`[${scope}] kernel request failed: ${response.msg || safePath}`);
        }
        return response;
    }, `${scope}.fetchSyncPost`);
};
