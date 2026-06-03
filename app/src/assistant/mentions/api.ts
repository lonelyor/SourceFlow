import {fetchPost} from "../../util/fetch";
import type {IMentionSearchResult, IContextPackItem, IContextPackEntry} from "./types";
import type {TSecurityMode} from "../security/types";

export const searchMentionItems = (query: string, limit = 10, securityMode: TSecurityMode = "default"): Promise<IMentionSearchResult[]> => {
    const normalizedQuery = `${query || ""}`.trim();
    if (!normalizedQuery) {
        return Promise.resolve([]);
    }
    return new Promise((resolve, reject) => {
        fetchPost("/api/assistant/context/search", {query: normalizedQuery, limit, securityMode}, (response: any) => {
            if (response.code === 0 && response.data?.results) {
                resolve(response.data.results);
            } else {
                reject(new Error(response.msg || "Failed to search assistant context"));
            }
        });
    });
};

export const buildContextPack = (items: IContextPackItem[], securityMode: TSecurityMode = "default"): Promise<IContextPackEntry[]> => {
    return new Promise((resolve, reject) => {
        fetchPost("/api/assistant/context/buildContextPack", {items, securityMode}, (response: any) => {
            if (response.code === 0 && response.data?.items) {
                resolve(response.data.items);
            } else {
                reject(new Error(response.msg || "Failed to build assistant context"));
            }
        });
    });
};
