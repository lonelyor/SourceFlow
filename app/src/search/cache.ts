import {fetchPost} from "../util/fetch";

const SEARCH_CACHE_TTL = 6000;
const SEARCH_CACHE_LIMIT = 48;

type SearchCacheEntry = {
    expiresAt: number,
    response: IWebSocketData,
};

const responseCache = new Map<string, SearchCacheEntry>();
const inflightCache = new Map<string, Promise<IWebSocketData>>();

const pruneSearchCache = () => {
    const now = Date.now();
    for (const [key, value] of responseCache.entries()) {
        if (value.expiresAt <= now) {
            responseCache.delete(key);
        }
    }
    while (responseCache.size > SEARCH_CACHE_LIMIT) {
        const firstKey = responseCache.keys().next().value;
        if (!firstKey) {
            break;
        }
        responseCache.delete(firstKey);
    }
};

const getCacheKeyForTypes = (types: Config.IUILayoutTabSearchConfigTypes) => {
    return Object.keys(types)
        .sort()
        .map((key) => `${key}:${types[key as keyof Config.IUILayoutTabSearchConfigTypes] ? "1" : "0"}`)
        .join("|");
};

const getFullTextSearchCacheKey = (config: Config.IUILayoutTabSearchConfig) => {
    return JSON.stringify({
        query: config.query || config.k || "",
        method: config.method,
        group: config.group,
        sort: config.sort,
        page: config.page || 1,
        paths: [...(config.idPath || [])].sort(),
        types: getCacheKeyForTypes(config.types),
    });
};

const requestWithCache = (key: string, url: string, payload?: Record<string, unknown>) => {
    pruneSearchCache();
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return Promise.resolve(cached.response);
    }
    const inflight = inflightCache.get(key);
    if (inflight) {
        return inflight;
    }
    const request = new Promise<IWebSocketData>((resolve) => {
        fetchPost(url, payload, (response) => {
            if (response?.code === 0) {
                responseCache.set(key, {
                    expiresAt: Date.now() + SEARCH_CACHE_TTL,
                    response,
                });
            }
            inflightCache.delete(key);
            resolve(response);
        });
    });
    inflightCache.set(key, request);
    return request;
};

export const getRecentUpdatedBlocksCached = () => {
    return requestWithCache("recent-updated-blocks", "/api/block/getRecentUpdatedBlocks", {});
};

export const fullTextSearchBlocksCached = (config: Config.IUILayoutTabSearchConfig) => {
    return requestWithCache(`fulltext:${getFullTextSearchCacheKey(config)}`, "/api/search/fullTextSearchBlock", {
        query: config.query || config.k || "",
        method: config.method,
        types: config.types,
        paths: config.idPath || [],
        groupBy: config.group,
        orderBy: config.sort,
        page: config.page || 1,
    });
};

export const clearSearchRequestCache = () => {
    responseCache.clear();
    inflightCache.clear();
};
