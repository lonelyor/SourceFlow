import {Dialog} from "../dialog";
import {Constants} from "../constants";
import {fetchSyncPost} from "../util/fetch";
import {showMessage} from "../dialog/message";
import {writeText, setStorageVal} from "../protyle/util/compatibility";
import {App} from "../index";
import {replaceFileName, validateName} from "../editor/rename";
import {getAllEditor} from "../layout/getAll";
import {hasClosestByClassName} from "../protyle/util/hasClosest";
import {runAssistantFeature} from "../assistant/runtime";
/// #if MOBILE
import {openMobileFileById} from "../mobile/editor";
/// #else
import {openFileById} from "../editor/util";
/// #endif
import {IWorkbenchItem, TWorkbenchTab, WorkbenchAttr} from "./constants";
import {
    IWorkbenchActionPreset,
    IWorkbenchAutomationData,
    IWorkbenchBoundViewState,
    IWorkbenchBuiltinViewNoteOption,
    IWorkbenchDashboardPreset,
    IWorkbenchFacet,
    IWorkbenchQueryResponse,
    IWorkbenchRule,
    IWorkbenchSearchBlock,
    IWorkbenchState,
    IWorkbenchSummary,
    IWorkbenchViewTemplate,
    WORKBENCH_BLOCK_CACHE_TTL,
    WORKBENCH_QUERY_CACHE_TTL,
    TWorkbenchBuiltinViewNoteKey,
    TWorkbenchGroupBy,
    TWorkbenchResultLayer,
    TWorkbenchView,
    WorkbenchViewAttr,
    WORKBENCH_SAVED_VIEWS_QUERY,
    applyWorkbenchDashboard,
    applyWorkbenchViewTemplate,
    clearWorkbenchDashboardSelection,
    clearWorkbenchSavedSelections,
    clearWorkbenchViewTemplateSelection,
    escapeAttr,
    escapeHTML,
    getActiveView,
    getBatchStatusOptions,
    getBuiltinWorkbenchViewNoteTemplate,
    getDefaultState,
    getGroupByOptions,
    getSortOptions,
    getState,
    getStatusOptions,
    getViewOptions,
    getWorkbenchBuiltinViewNoteLabel,
    getWorkbenchBuiltinViewNoteOptionsInternal,
    getWorkbenchResultLayerLabel,
    getWorkbenchTabLabel,
    getWorkbenchViewLabel,
    groupByLabel,
    normalizeWorkbenchActionPresets,
    normalizeWorkbenchDashboards,
    normalizeWorkbenchGroupBy,
    normalizeWorkbenchResultLayer,
    normalizeWorkbenchRules,
    normalizeWorkbenchSortBy,
    normalizeWorkbenchView,
    normalizeWorkbenchViewTemplates,
    loadWorkbenchReminderModule,
    openWorkbenchAssistantDock,
    openWorkbenchItemDialog,
    openWorkbenchURLImportDialog,
    resolveEditorProtyle,
    saveState,
    sortLabel,
    splitWorkbenchTags,
    statusLabel,
    tabLabel,
    typeLabel,
    viewLabel,
    workbenchBlockCache,
    workbenchBlockInflight,
    workbenchQueryCache,
    workbenchQueryInflight,
} from "./dialogShared";

export const parseQuery = (query: string) => {
    const parsed = {
        text: [] as string[],
        filters: {} as Record<string, string[]>,
    };
    const tokens: string[] = query.match(/"[^"]+"|\S+/g) ?? [];
    tokens.forEach((raw) => {
        const token = raw.replace(/^"(.*)"$/, "$1").trim();
        if (!token) {
            return;
        }
        const index = token.indexOf(":");
        if (index > 0) {
            const key = token.slice(0, index).toLowerCase();
            const value = token.slice(index + 1).trim();
            if (value && ["kind", "type", "status", "project", "tag", "notebook", "inbox", "before", "after", "has", "flag"].includes(key)) {
                if (!parsed.filters[key]) {
                    parsed.filters[key] = [];
                }
                parsed.filters[key].push(value.toLowerCase());
                return;
            }
        }
        parsed.text.push(token.toLowerCase());
    });
    return parsed;
};

export const sqlQuote = (value: string) => `'${(value || "").replace(/'/g, "''")}'`;

export const sqlLikeValue = (value: string) => (value || "")
    .replace(/'/g, "''")
    .replace(/[%_]/g, (match) => `\\${match}`);

export const buildWorkbenchTypeCondition = (type: string) => {
    if (type === "doc") {
        return `(ial NOT LIKE '%${WorkbenchAttr.type}="%' OR ial LIKE '%${WorkbenchAttr.type}="doc"%')`;
    }
    return `ial LIKE '%${WorkbenchAttr.type}="${type}"%'`;
};

export const buildFilterOnlyQuery = (parsed: ReturnType<typeof parseQuery>) => {
    const keys = ["kind", "type", "status", "project", "tag", "notebook", "inbox", "before", "after", "has", "flag"];
    const tokens: string[] = [];
    keys.forEach((key) => {
        (parsed.filters[key] || []).forEach((value) => {
            tokens.push(value.includes(" ") ? `${key}:"${value}"` : `${key}:${value}`);
        });
    });
    return tokens.join(" ").trim();
};

export const buildWorkbenchLiveRootConditions = (state: IWorkbenchState, parsed = parseQuery(state.query), includeText = true) => {
    if (parsed.filters.kind?.length && !parsed.filters.kind.includes("doc")) {
        return ["1 = 0"];
    }
    const conditions: string[] = [
        "(" + ["doc", "note", "url", "task", "event", "project", "attachment"].map((type) => buildWorkbenchTypeCondition(type)).join(" OR ") + ")",
    ];
    if (state.activeTab === "inbox") {
        conditions.push(`ial LIKE '%${WorkbenchAttr.inbox}="true"%'`);
    } else if (state.activeTab === "library") {
        conditions.push(buildWorkbenchTypeCondition("doc"));
    } else if (state.activeTab === "task") {
        conditions.push(buildWorkbenchTypeCondition("task"));
    } else if (state.activeTab === "calendar") {
        conditions.push(`(${buildWorkbenchTypeCondition("event")} OR (${buildWorkbenchTypeCondition("task")} AND ial LIKE '%${WorkbenchAttr.dueDate}="%'))`);
    } else if (state.activeTab === "project") {
        conditions.push(buildWorkbenchTypeCondition("project"));
    }

    if (parsed.filters.type?.length) {
        conditions.push("(" + parsed.filters.type.map((value) => buildWorkbenchTypeCondition(value)).join(" OR ") + ")");
    }
    if (parsed.filters.status?.length) {
        conditions.push("(" + parsed.filters.status.map((value) => `ial LIKE '%${WorkbenchAttr.status}="${sqlLikeValue(value)}"%'`).join(" OR ") + ")");
    }
    if (parsed.filters.project?.length) {
        conditions.push("(" + parsed.filters.project.map((value) => `ial LIKE '%${WorkbenchAttr.project}="%${sqlLikeValue(value)}%"%'`).join(" OR ") + ")");
    }
    if (parsed.filters.notebook?.length) {
        conditions.push("(" + parsed.filters.notebook.map((value) => `hpath LIKE ${sqlQuote(`%${sqlLikeValue(value)}%`)} ESCAPE '\\'`).join(" OR ") + ")");
    }
    if (parsed.filters.tag?.length) {
        parsed.filters.tag.forEach((value) => {
            conditions.push(`tag LIKE ${sqlQuote(`%${sqlLikeValue(value)}%`)} ESCAPE '\\'`);
        });
    }
    if (parsed.filters.inbox?.length) {
        const wantsInbox = parsed.filters.inbox.some((value) => ["true", "1", "yes"].includes(value));
        conditions.push(wantsInbox ? `ial LIKE '%${WorkbenchAttr.inbox}="true"%'` : `ial NOT LIKE '%${WorkbenchAttr.inbox}="true"%'`);
    }
    (parsed.filters.has || []).forEach((value) => {
        if (value === "due") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.dueDate}="%'`);
        } else if (value === "event") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.eventTime}="%'`);
        } else if (value === "project") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.project}="%'`);
        } else if (value === "url") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.sourceURL}="%'`);
        } else if (value === "location") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.location}="%'`);
        } else if (value === "view") {
            conditions.push(`ial LIKE '%${WorkbenchViewAttr.enabled}="true"%'`);
        } else if (value === "untagged") {
            conditions.push(`(tag = '' OR tag IS NULL)`);
        }
    });
    (parsed.filters.flag || []).forEach((value) => {
        if (value === "unprojected") {
            conditions.push(`ial NOT LIKE '%${WorkbenchAttr.project}="%'`);
        } else if (value === "untagged") {
            conditions.push(`(tag = '' OR tag IS NULL)`);
        }
    });
    if (includeText) {
        parsed.text.forEach((value) => {
            const like = sqlQuote(`%${sqlLikeValue(value)}%`);
            conditions.push(`(content LIKE ${like} ESCAPE '\\' OR markdown LIKE ${like} ESCAPE '\\' OR hpath LIKE ${like} ESCAPE '\\' OR tag LIKE ${like} ESCAPE '\\' OR ial LIKE ${like} ESCAPE '\\')`);
        });
    }
    return conditions;
};

export const buildWorkbenchLiveQuerySQL = (state: IWorkbenchState) => {
    const conditions = buildWorkbenchLiveRootConditions(state);
    let orderBy = "updated DESC";
    if (state.sortBy === "created") {
        orderBy = `created ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    } else if (state.sortBy === "title") {
        orderBy = `content ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    } else {
        orderBy = `updated ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    }
    return `SELECT * FROM blocks WHERE type = 'd' AND ${conditions.join(" AND ")} ORDER BY ${orderBy} LIMIT 256`;
};

export const buildWorkbenchLiveBlockQuerySQL = (state: IWorkbenchState) => {
    const parsed = parseQuery(state.query);
    if (!parsed.text.length) {
        return "SELECT * FROM blocks WHERE 1 = 0";
    }
    const scopeState = Object.assign({}, state, {resultLayer: "items" as TWorkbenchResultLayer, query: buildFilterOnlyQuery(parsed)});
    const rootConditions = buildWorkbenchLiveRootConditions(scopeState, parseQuery(scopeState.query), false);
    const blockConditions = ["type != 'd'"];
    parsed.text.forEach((value) => {
        const like = sqlQuote(`%${sqlLikeValue(value)}%`);
        blockConditions.push(`(content LIKE ${like} ESCAPE '\\' OR markdown LIKE ${like} ESCAPE '\\' OR hpath LIKE ${like} ESCAPE '\\' OR tag LIKE ${like} ESCAPE '\\' OR ial LIKE ${like} ESCAPE '\\')`);
    });
    let orderBy = "updated DESC";
    if (state.sortBy === "title") {
        orderBy = `hpath ${state.sortOrder === "asc" ? "ASC" : "DESC"}, content ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    } else {
        orderBy = `updated ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    }
    return `SELECT * FROM blocks WHERE ${blockConditions.join(" AND ")} AND root_id IN (SELECT id FROM blocks WHERE type = 'd' AND ${rootConditions.join(" AND ")}) ORDER BY ${orderBy} LIMIT 256`;
};

export const buildWorkbenchLiveEmbedMarkdown = (state: IWorkbenchState) => `{{ ${state.resultLayer === "blocks" ? buildWorkbenchLiveBlockQuerySQL(state) : buildWorkbenchLiveQuerySQL(state)} }}`;

export const fetchRelatedBlocks = async (query: string, pageSize = 12) => {
    if (!query.trim()) {
        return [] as IWorkbenchSearchBlock[];
    }
    const response = await fetchSyncPost("/api/search/fullTextSearchBlock", {
        query,
        method: 0,
        orderBy: 4,
        groupBy: 0,
        page: 1,
        pageSize,
    });
    return response.data?.blocks as IWorkbenchSearchBlock[] || [];
};

export const getWorkbenchBlockRootID = (block: IWorkbenchSearchBlock) => block.rootID || block.id;

export const getBlockNotebookName = (block: IWorkbenchSearchBlock) => window.sourceflow.notebooks.find((item) => item.id === block.box)?.name || block.box || "";

export const sortWorkbenchBlocks = (blocks: IWorkbenchSearchBlock[], state: IWorkbenchState) => {
    return blocks.slice().sort((left, right) => {
        if (state.sortBy === "title") {
            const leftTitle = `${left.hPath || left.content || left.id}`.toLowerCase();
            const rightTitle = `${right.hPath || right.content || right.id}`.toLowerCase();
            return state.sortOrder === "asc"
                ? leftTitle.localeCompare(rightTitle)
                : rightTitle.localeCompare(leftTitle);
        }
        const leftUpdated = `${left.updated || ""}`;
        const rightUpdated = `${right.updated || ""}`;
        if (leftUpdated === rightUpdated) {
            const leftTitle = `${left.hPath || left.content || left.id}`.toLowerCase();
            const rightTitle = `${right.hPath || right.content || right.id}`.toLowerCase();
            return leftTitle.localeCompare(rightTitle);
        }
        return state.sortOrder === "asc"
            ? leftUpdated.localeCompare(rightUpdated)
            : rightUpdated.localeCompare(leftUpdated);
    });
};

export const filterWorkbenchBlocksByScope = (blocks: IWorkbenchSearchBlock[], scopeItems: IWorkbenchItem[]) => {
    const allowedRootIDs = new Set(scopeItems.map((item) => item.rootID || item.id));
    const dedup = new Set<string>();
    return blocks.filter((block) => {
        const rootID = getWorkbenchBlockRootID(block);
        if (!allowedRootIDs.has(rootID) || dedup.has(block.id)) {
            return false;
        }
        dedup.add(block.id);
        return true;
    });
};

export const resolveWorkbenchBlocks = async (state: IWorkbenchState, scopeItems: IWorkbenchItem[], parsed = parseQuery(state.query), limit = 256) => {
    const query = parsed.text.join(" ").trim();
    if (!query) {
        return [] as IWorkbenchSearchBlock[];
    }
    const cacheKey = buildWorkbenchBlockCacheKey(state, scopeItems, parsed, limit);
    const now = Date.now();
    const cached = workbenchBlockCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    if (workbenchBlockInflight.has(cacheKey)) {
        return workbenchBlockInflight.get(cacheKey);
    }
    const request = (async () => {
        const rawBlocks = await fetchRelatedBlocks(query, limit);
        const data = sortWorkbenchBlocks(filterWorkbenchBlocksByScope(rawBlocks, scopeItems), state);
        workbenchBlockCache.set(cacheKey, {
            expiresAt: Date.now() + WORKBENCH_BLOCK_CACHE_TTL,
            data,
        });
        pruneTimedCache(workbenchBlockCache, 24);
        return data;
    })();
    workbenchBlockInflight.set(cacheKey, request);
    try {
        return await request;
    } finally {
        workbenchBlockInflight.delete(cacheKey);
    }
};

export const getEmptyWorkbenchSummary = (total = 0, filtered = 0): IWorkbenchSummary => ({
    total,
    filtered,
    docCount: 0,
    viewCount: 0,
    inboxCount: 0,
    taskCount: 0,
    eventCount: 0,
    projectCount: 0,
    reviewCount: 0,
    typeCounts: {},
    statusCounts: {},
    notebooks: [],
    projects: [],
    tags: [],
    quickFilters: [],
    refTotal: 0,
    assetTotal: 0,
    subFileTotal: 0,
});

export const buildWorkbenchQueryCacheKey = (state: IWorkbenchState, limit: number) => JSON.stringify({
    limit,
    activeTab: state.activeTab,
    query: state.query.trim(),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
});

export const buildWorkbenchBlockCacheKey = (state: IWorkbenchState, scopeItems: IWorkbenchItem[], parsed: ReturnType<typeof parseQuery>, limit: number) => JSON.stringify({
    query: parsed.text.join(" ").trim(),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    limit,
    scope: scopeItems.map((item) => item.rootID || item.id).sort(),
});

export const pruneTimedCache = <T>(cache: Map<string, { expiresAt: number, data: T }>, maxEntries: number) => {
    const now = Date.now();
    cache.forEach((entry, key) => {
        if (entry.expiresAt <= now) {
            cache.delete(key);
        }
    });
    if (cache.size <= maxEntries) {
        return;
    }
    Array.from(cache.entries()).sort((left, right) => left[1].expiresAt - right[1].expiresAt)
        .slice(0, cache.size - maxEntries)
        .forEach(([key]) => cache.delete(key));
};

export const fetchWorkbenchData = async (state: IWorkbenchState, limit = 2048): Promise<IWorkbenchQueryResponse> => {
    const cacheKey = buildWorkbenchQueryCacheKey(state, limit);
    const now = Date.now();
    const cached = workbenchQueryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    if (workbenchQueryInflight.has(cacheKey)) {
        return workbenchQueryInflight.get(cacheKey);
    }
    const request = (async () => {
        const response = await fetchSyncPost("/api/workbench/queryWorkbenchItems", {
            limit,
            query: state.query,
            activeTab: state.activeTab,
            sortBy: state.sortBy,
            sortOrder: state.sortOrder,
        });
        const items = response.data?.allItems as IWorkbenchItem[] || [];
        const visibleItems = response.data?.items as IWorkbenchItem[] || [];
        const data = {
            items: visibleItems,
            allItems: items,
            summary: response.data?.summary as IWorkbenchSummary || getEmptyWorkbenchSummary(items.length, visibleItems.length),
        };
        workbenchQueryCache.set(cacheKey, {
            expiresAt: Date.now() + WORKBENCH_QUERY_CACHE_TTL,
            data,
        });
        pruneTimedCache(workbenchQueryCache, 24);
        return data;
    })();
    workbenchQueryInflight.set(cacheKey, request);
    try {
        return await request;
    } finally {
        workbenchQueryInflight.delete(cacheKey);
    }
};

export interface IWorkbenchResolvedContext {
    allItems: IWorkbenchItem[];
    visibleItems: IWorkbenchItem[];
    summary: IWorkbenchSummary;
    parsed: ReturnType<typeof parseQuery>;
    blockScopeItems: IWorkbenchItem[];
    blocks: IWorkbenchSearchBlock[];
}

export const resolveWorkbenchContext = async (state: IWorkbenchState, itemLimit = 2048, blockLimit = 256): Promise<IWorkbenchResolvedContext> => {
    const response = await fetchWorkbenchData(state, itemLimit);
    const parsed = parseQuery(state.query);
    let blockScopeItems = response.items;
    if (parsed.text.length) {
        const filterOnlyQuery = buildFilterOnlyQuery(parsed);
        if (filterOnlyQuery !== state.query.trim()) {
            const scopeResponse = await fetchWorkbenchData(Object.assign({}, state, {resultLayer: "items" as TWorkbenchResultLayer, query: filterOnlyQuery}), itemLimit);
            blockScopeItems = scopeResponse.items;
        }
    }
    return {
        allItems: response.allItems,
        visibleItems: response.items,
        summary: response.summary,
        parsed,
        blockScopeItems,
        blocks: await resolveWorkbenchBlocks(state, blockScopeItems, parsed, blockLimit),
    };
};
