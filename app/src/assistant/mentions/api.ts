import {fetchPost} from "../../util/fetch";
import type {IMentionSearchResult, IContextPackItem, IContextPackEntry} from "./types";

export const searchMentionItems = (query: string, limit = 10): Promise<IMentionSearchResult[]> => {
    const normalizedQuery = `${query || ""}`.trim();
    if (!normalizedQuery) {
        return Promise.resolve([]);
    }
    return new Promise((resolve) => {
        fetchPost("/api/assistant/context/search", {query: normalizedQuery, limit}, (response: any) => {
            if (response.code === 0 && response.data?.results) {
                resolve(response.data.results);
            } else {
                resolve([]);
            }
        });
    });
};

export const buildContextPack = (items: IContextPackItem[]): Promise<IContextPackEntry[]> => {
    return new Promise((resolve) => {
        fetchPost("/api/assistant/context/buildContextPack", {items}, (response: any) => {
            if (response.code === 0 && response.data?.items) {
                resolve(response.data.items);
            } else {
                resolve([]);
            }
        });
    });
};
