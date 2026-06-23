import {fetchSyncPost} from "../../util/fetch";

export interface IAssistantTerminalProfile {
    id: string;
    name: string;
    shell: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    isDefault: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface IAssistantTerminalSession {
    id: string;
    profileId: string;
    title: string;
    shell: string;
    cwd: string;
    args: string[];
    status: string;
    startedAt: number;
    endedAt: number;
    createdAt: number;
    updatedAt: number;
}

const ensureOK = (response: IWebSocketData) => {
    if (response.code !== 0) {
        throw new Error(response.msg || "Assistant terminal API request failed");
    }
    return response.data;
};

const ensureArray = <T>(value: T[] | null | undefined) => {
    return Array.isArray(value) ? value : [];
};

export const listAssistantTerminalProfiles = async () => {
    return ensureArray(ensureOK(await fetchSyncPost("/api/assistant/terminal/profile/list", {})) as IAssistantTerminalProfile[] | null);
};

export const listAssistantTerminalSessions = async () => {
    return ensureArray(ensureOK(await fetchSyncPost("/api/assistant/terminal/session/list", {})) as IAssistantTerminalSession[] | null);
};

export const createAssistantTerminalSession = async (profileId: string) => {
    return ensureOK(await fetchSyncPost("/api/assistant/terminal/session/create", {profileId})) as IAssistantTerminalSession;
};

export const deleteAssistantTerminalSession = async (id: string) => {
    ensureOK(await fetchSyncPost("/api/assistant/terminal/session/delete", {id}));
};
