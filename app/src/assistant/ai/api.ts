import {fetchSyncPost} from "../../util/fetch";
import type {TSecurityMode} from "../security/types";
import type {TAssistantAPIKeyAction} from "../secrets";

export interface IAssistantAIProviderType {
    id: string;
    name: string;
    baseURL: string;
    defaultModel: string;
    recommendedSettings: Record<string, unknown>;
}

export interface IAssistantAIProfile {
    id: string;
    name: string;
    provider: string;
    baseURL: string;
    apiKey: string;
    apiKeyAction?: TAssistantAPIKeyAction;
    hasAPIKey?: boolean;
    model: string;
    userAgent: string;
    proxy: string;
    version: string;
    isDefault: boolean;
    settings: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
}

export interface IAssistantAISession {
    id: string;
    profileId: string;
    mode: string;
    title: string;
    summary: string;
    pinnedAt: number;
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    lastMessageAt: number;
    createdAt: number;
    updatedAt: number;
}

export interface IAssistantAIMessage {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    providerMessageId: string;
    inputTokens: number;
    outputTokens: number;
    metadata: Record<string, unknown>;
    createdAt: number;
}

export interface IAssistantAIChatResult {
    session: IAssistantAISession;
    profile: IAssistantAIProfile;
    userMessage: IAssistantAIMessage;
    assistantMessage: IAssistantAIMessage;
    messages: IAssistantAIMessage[];
    toolResults?: IAssistantAIToolResult[];
}

export interface IAssistantAIChatStreamEvent {
    type: "delta" | "final" | "error";
    delta?: string;
    result?: IAssistantAIChatResult;
    message?: string;
}

export interface IAssistantAINoteContext {
    rootID: string;
    notebook: string;
    path: string;
    title: string;
    currentBlockID?: string;
    currentBlockType?: string;
    currentBlockMarkdown?: string;
    selectedText?: string;
}

export interface IAssistantAIInputAttachment {
    id: string;
    name: string;
    mimeType: string;
    data: string;
}

export interface IAssistantAISourceCitation {
    id: string;
    type: string;
    title: string;
    notebook?: string;
    path?: string;
    hPath?: string;
    children?: IAssistantAISourceCitation[];
}

export interface IAssistantAIToolDefinition {
    id: string;
    name: string;
    description: string;
    risk: string;
    category: string;
    target: string;
    defaultMode: string;
}

export interface IAssistantAIToolPolicy {
    readScope: string;
    writeScope: string;
    traceMode: string;
    toolModes: Record<string, string>;
}

export interface IAssistantAIToolCatalogResult {
    tools: IAssistantAIToolDefinition[];
    policy: IAssistantAIToolPolicy;
}

export interface IAssistantAIToolResult {
    toolId: string;
    name: string;
    risk: string;
    decision: string;
    executed: boolean;
    targetScope: string;
    requiresConfirm: boolean;
    summary: string;
    error?: string;
    data?: Record<string, unknown>;
    auditId?: string;
    args?: Record<string, unknown>;
    context?: IAssistantAINoteContext | null;
}

export interface IAssistantAIToolAudit {
    id: string;
    sessionId: string;
    profileId: string;
    toolId: string;
    toolName: string;
    risk: string;
    decision: string;
    executed: boolean;
    targetScope: string;
    targetId: string;
    status: string;
    summary: string;
    error?: string;
    args?: Record<string, unknown>;
    result?: Record<string, unknown>;
    createdAt: number;
}

const ASSISTANT_AI_PROFILES_CACHE_TTL = 15000;
let assistantAIProfilesCache: IAssistantAIProfile[] | null = null;
let assistantAIProfilesCacheAt = 0;

const ensureOK = (response: IWebSocketData) => {
    if (response.code !== 0) {
        throw new Error(response.msg || "Assistant API request failed");
    }
    return response.data;
};

const ensureArray = <T>(value: T[] | null | undefined) => {
    return Array.isArray(value) ? value : [];
};

const cloneAssistantAIProfiles = (profiles: IAssistantAIProfile[]) => {
    return JSON.parse(JSON.stringify(profiles || [])) as IAssistantAIProfile[];
};

export const invalidateAssistantAIProfileCache = () => {
    assistantAIProfilesCache = null;
    assistantAIProfilesCacheAt = 0;
};

export const listAssistantAIProviders = async () => {
    return ensureArray(ensureOK(await fetchSyncPost("/api/assistant/ai/provider/list", {})) as IAssistantAIProviderType[] | null);
};

export interface IAssistantAIConnectionTestResult {
    ok: boolean;
    message: string;
    latency: number;
}

export interface IAssistantAIModelEntry {
    id: string;
    name: string;
    /** Real model context window (tokens) when the provider exposes it. 0 = unknown. */
    contextWindow?: number;
}

export const testAssistantAIConnection = async (payload: {
    id?: string;
    provider: string;
    baseURL: string;
    apiKey: string;
    apiKeyAction?: TAssistantAPIKeyAction;
    proxy: string;
    userAgent: string;
}) => {
    return ensureOK(await fetchSyncPost("/api/assistant/ai/profile/test", payload)) as IAssistantAIConnectionTestResult;
};

export const listAssistantAIModels = async (payload: {
    id?: string;
    provider: string;
    baseURL: string;
    apiKey: string;
    apiKeyAction?: TAssistantAPIKeyAction;
    proxy: string;
    userAgent: string;
}) => {
    const data = ensureOK(await fetchSyncPost("/api/assistant/ai/profile/models", payload)) as { models: IAssistantAIModelEntry[]; error?: string };
    return data;
};

export const listAssistantAIProfiles = async (forceRefresh = false) => {
    if (!forceRefresh && assistantAIProfilesCache && Date.now() - assistantAIProfilesCacheAt < ASSISTANT_AI_PROFILES_CACHE_TTL) {
        return cloneAssistantAIProfiles(assistantAIProfilesCache);
    }
    const profiles = ensureArray(ensureOK(await fetchSyncPost("/api/assistant/ai/profile/list", {})) as IAssistantAIProfile[] | null);
    assistantAIProfilesCache = cloneAssistantAIProfiles(profiles);
    assistantAIProfilesCacheAt = Date.now();
    return cloneAssistantAIProfiles(profiles);
};

export const getAssistantAIDefaultProfile = async () => {
    const profiles = await listAssistantAIProfiles();
    return profiles.find((item) => item.isDefault) || profiles[0] || null;
};

export const saveAssistantAIProfile = async (profile: Partial<IAssistantAIProfile>) => {
    const saved = ensureOK(await fetchSyncPost("/api/assistant/ai/profile/save", {profile})) as IAssistantAIProfile;
    invalidateAssistantAIProfileCache();
    return saved;
};

export const deleteAssistantAIProfile = async (id: string) => {
    ensureOK(await fetchSyncPost("/api/assistant/ai/profile/delete", {id}));
    invalidateAssistantAIProfileCache();
};

export const listAssistantAISessions = async () => {
    return ensureArray(ensureOK(await fetchSyncPost("/api/assistant/ai/session/list", {})) as IAssistantAISession[] | null);
};

export const createAssistantAISession = async (profileId = "", mode = "chat", title = "") => {
    return ensureOK(await fetchSyncPost("/api/assistant/ai/session/create", {profileId, mode, title})) as IAssistantAISession;
};

export const renameAssistantAISession = async (id: string, title: string) => {
    ensureOK(await fetchSyncPost("/api/assistant/ai/session/rename", {id, title}));
};

export const setAssistantAISessionPinned = async (id: string, pinned: boolean) => {
    ensureOK(await fetchSyncPost("/api/assistant/ai/session/pin", {id, pinned}));
};

export const deleteAssistantAISession = async (id: string) => {
    ensureOK(await fetchSyncPost("/api/assistant/ai/session/delete", {id}));
};

export const clearAssistantAISession = async (id: string) => {
    ensureOK(await fetchSyncPost("/api/assistant/ai/session/clear", {id}));
};

export const clearAllAssistantAISessions = async () => {
    ensureOK(await fetchSyncPost("/api/assistant/ai/session/clearAll", {}));
};

export const getAssistantAISessionMessages = async (sessionId: string) => {
    return ensureArray(ensureOK(await fetchSyncPost("/api/assistant/ai/session/messages", {sessionId})) as IAssistantAIMessage[] | null);
};

export const chatAssistantAI = async (payload: {
    profileId: string;
    sessionId?: string;
    mode?: string;
    title?: string;
    message: string;
    system?: string;
    enableTools?: boolean;
    securityMode?: TSecurityMode;
    context?: IAssistantAINoteContext | null;
    attachments?: IAssistantAIInputAttachment[];
    sources?: IAssistantAISourceCitation[];
}, options: { signal?: AbortSignal } = {}) => {
    const data = ensureOK(await fetchSyncPost("/api/assistant/ai/chat", payload, {signal: options.signal})) as IAssistantAIChatResult;
    return {
        ...data,
        messages: ensureArray(data?.messages),
    };
};

export const streamAssistantAI = async (payload: {
    profileId: string;
    sessionId?: string;
    mode?: string;
    title?: string;
    message: string;
    system?: string;
    enableTools?: boolean;
    securityMode?: TSecurityMode;
    context?: IAssistantAINoteContext | null;
    attachments?: IAssistantAIInputAttachment[];
    sources?: IAssistantAISourceCitation[];
}, options?: {
    signal?: AbortSignal;
    onDelta?: (delta: string) => void;
    onEvent?: (event: IAssistantAIChatStreamEvent) => void;
}) => {
    const response = await fetch("/api/assistant/ai/chat/stream", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        signal: options?.signal,
        body: JSON.stringify(payload),
    });
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        const websocketData = await response.json() as IWebSocketData;
        if (websocketData.code !== 0) {
            throw new Error(websocketData.msg || "Assistant API request failed");
        }
        const result = websocketData.data as IAssistantAIChatResult;
        const normalized = {
            ...result,
            messages: ensureArray(result?.messages),
        };
        options?.onEvent?.({type: "final", result: normalized});
        return normalized;
    }
    if (!response.ok) {
        throw new Error(`Assistant API request failed with status ${response.status}`);
    }
    if (!response.body) {
        return chatAssistantAI(payload, {signal: options?.signal});
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: IAssistantAIChatResult | null = null;
    const flushLine = (line: string) => {
        const normalizedLine = line.trim();
        if (!normalizedLine) {
            return;
        }
        const event = JSON.parse(normalizedLine) as IAssistantAIChatStreamEvent;
        options?.onEvent?.(event);
        if (event.type === "delta" && event.delta) {
            options?.onDelta?.(event.delta);
            return;
        }
        if (event.type === "error") {
            throw new Error(event.message || "Assistant AI request failed");
        }
        if (event.type === "final" && event.result) {
            finalResult = {
                ...event.result,
                messages: ensureArray(event.result.messages),
            };
        }
    };
    try {
        while (true) {
            const {done, value} = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), {stream: !done});
            let lineBreakIndex = buffer.indexOf("\n");
            while (lineBreakIndex > -1) {
                const line = buffer.slice(0, lineBreakIndex);
                buffer = buffer.slice(lineBreakIndex + 1);
                flushLine(line);
                lineBreakIndex = buffer.indexOf("\n");
            }
            if (done) {
                break;
            }
        }
    } finally {
        reader.cancel().catch(() => undefined);
    }
    if (buffer.trim()) {
        flushLine(buffer);
    }
    if (!finalResult) {
        throw new Error("Assistant AI stream ended without a final result");
    }
    return finalResult;
};

export const editAssistantAIMessageStream = async (payload: {
    profileId: string;
    sessionId: string;
    messageId: string;
    message: string;
    system?: string;
    enableTools?: boolean;
    securityMode?: TSecurityMode;
    context?: IAssistantAINoteContext | null;
    attachments?: IAssistantAIInputAttachment[];
    sources?: IAssistantAISourceCitation[];
}, options?: {
    signal?: AbortSignal;
    onDelta?: (delta: string) => void;
    onEvent?: (event: IAssistantAIChatStreamEvent) => void;
}) => {
    const response = await fetch("/api/assistant/ai/message/edit/stream", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        signal: options?.signal,
        body: JSON.stringify(payload),
    });
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        const websocketData = await response.json() as IWebSocketData;
        if (websocketData.code !== 0) {
            throw new Error(websocketData.msg || "Assistant AI edit request failed");
        }
        const result = websocketData.data as IAssistantAIChatResult;
        const normalized = {
            ...result,
            messages: ensureArray(result?.messages),
        };
        options?.onEvent?.({type: "final", result: normalized});
        return normalized;
    }
    if (!response.ok) {
        throw new Error(`Assistant AI edit request failed with status ${response.status}`);
    }
    if (!response.body) {
        const data = ensureOK(await fetchSyncPost("/api/assistant/ai/message/edit/stream", payload, {signal: options?.signal})) as IAssistantAIChatResult;
        return {
            ...data,
            messages: ensureArray(data?.messages),
        };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: IAssistantAIChatResult | null = null;
    const flushLine = (line: string) => {
        const normalizedLine = line.trim();
        if (!normalizedLine) {
            return;
        }
        const event = JSON.parse(normalizedLine) as IAssistantAIChatStreamEvent;
        options?.onEvent?.(event);
        if (event.type === "delta" && event.delta) {
            options?.onDelta?.(event.delta);
            return;
        }
        if (event.type === "error") {
            throw new Error(event.message || "Assistant AI edit request failed");
        }
        if (event.type === "final" && event.result) {
            finalResult = {
                ...event.result,
                messages: ensureArray(event.result.messages),
            };
        }
    };
    try {
        while (true) {
            const {done, value} = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), {stream: !done});
            let lineBreakIndex = buffer.indexOf("\n");
            while (lineBreakIndex > -1) {
                const line = buffer.slice(0, lineBreakIndex);
                buffer = buffer.slice(lineBreakIndex + 1);
                flushLine(line);
                lineBreakIndex = buffer.indexOf("\n");
            }
            if (done) {
                break;
            }
        }
    } finally {
        reader.cancel().catch(() => undefined);
    }
    if (buffer.trim()) {
        flushLine(buffer);
    }
    if (!finalResult) {
        throw new Error("Assistant AI edit stream ended without a final result");
    }
    return finalResult;
};

export const getAssistantAIToolCatalog = async (profileId: string) => {
    return ensureOK(await fetchSyncPost("/api/assistant/ai/tool/catalog", {profileId})) as IAssistantAIToolCatalogResult;
};

export const listAssistantAIToolAudits = async (payload: {
    sessionId?: string;
    profileId?: string;
    limit?: number;
}) => {
    return ensureArray(ensureOK(await fetchSyncPost("/api/assistant/ai/tool/audits", payload)) as IAssistantAIToolAudit[] | null);
};

export const executeAssistantAITool = async (payload: {
    profileId: string;
    sessionId?: string;
    messageId?: string;
    auditId?: string;
    securityMode?: TSecurityMode;
    context?: IAssistantAINoteContext | null;
    toolId: string;
    args?: Record<string, unknown>;
}) => {
    return ensureOK(await fetchSyncPost("/api/assistant/ai/tool/execute", payload)) as IAssistantAIToolResult;
};

export const confirmAssistantAITool = async (payload: {
    profileId: string;
    sessionId: string;
    messageId: string;
    auditId?: string;
    securityMode?: TSecurityMode;
    context?: IAssistantAINoteContext | null;
    toolId: string;
    args?: Record<string, unknown>;
}) => {
    const data = ensureOK(await fetchSyncPost("/api/assistant/ai/tool/confirm", payload)) as IAssistantAIChatResult;
    return {
        ...data,
        messages: ensureArray(data?.messages),
    };
};

export const rejectAssistantAITool = async (payload: {
    profileId: string;
    sessionId: string;
    messageId: string;
    auditId?: string;
    toolId: string;
}) => {
    const data = ensureOK(await fetchSyncPost("/api/assistant/ai/tool/reject", payload)) as IAssistantAIChatResult;
    return {
        ...data,
        messages: ensureArray(data?.messages),
    };
};

export const analyzeAssistantAISession = async (sessionId: string, profileId: string, prompt: string) => {
    const data = ensureOK(await fetchSyncPost("/api/assistant/ai/session/analyze", {sessionId, profileId, prompt})) as { markdown: string };
    return data.markdown;
};
