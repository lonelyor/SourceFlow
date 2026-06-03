import {buildContextPack} from "./api";
import type {IMentionSource, IContextPackItem, IContextPackEntry} from "./types";

export const buildSourcesFromPackEntries = (entries: IContextPackEntry[]): IMentionSource[] => {
    return entries.map((entry) => {
        const source: IMentionSource = {
            id: entry.id,
            type: entry.type,
            title: entry.title,
            notebook: entry.notebook,
            path: entry.path,
            hPath: entry.hPath,
            included: true,
            summary: entry.summary,
        };
        if (entry.children && entry.children.length > 0) {
            source.children = entry.children.map((child) => ({
                id: child.id,
                type: child.type,
                title: child.title,
                notebook: child.notebook,
                path: child.path,
                hPath: child.hPath,
                included: true,
                summary: child.summary,
            }));
            source.expanded = false;
        }
        return source;
    });
};

export const buildPackItemsFromSources = (sources: IMentionSource[]): IContextPackItem[] => {
    const items: IContextPackItem[] = [];
    for (const source of sources) {
        if (!source.included) continue;
        if (source.type === "folder" && source.children) {
            items.push({
                type: "folder",
                id: source.id,
                notebook: source.notebook,
                path: source.path,
            });
        } else {
            items.push({
                type: source.type,
                id: source.id,
                notebook: source.notebook,
                path: source.path,
            });
        }
    }
    return items;
};

export const buildIncludedContextText = (sources: IMentionSource[]): string => {
    const parts: string[] = [];
    for (const source of sources) {
        if (!source.included) continue;
        if (source.summary) {
            parts.push(`## ${source.title}\n${source.summary}`);
        }
        if (source.children) {
            for (const child of source.children) {
                if (!child.included) continue;
                if (child.summary) {
                    parts.push(`## ${child.title}\n${child.summary}`);
                }
            }
        }
    }
    return parts.join("\n\n");
};

export const estimateTokenCount = (sources: IMentionSource[]): number => {
    let totalChars = 0;
    for (const source of sources) {
        if (!source.included) continue;
        if (source.summary) {
            totalChars += source.summary.length;
        }
        if (source.children) {
            for (const child of source.children) {
                if (!child.included) continue;
                if (child.summary) {
                    totalChars += child.summary.length;
                }
            }
        }
    }
    return Math.ceil(totalChars / 4);
};

export const resolveAndBuildPack = async (sources: IMentionSource[]): Promise<IMentionSource[]> => {
    const items = buildPackItemsFromSources(sources);
    if (!items.length) return sources;

    const entries = await buildContextPack(items);
    const resolvedSources = buildSourcesFromPackEntries(entries);

    const sourceStateMap = new Map<string, {included: boolean; children: Map<string, boolean>}>();
    for (const source of sources) {
        const childMap = new Map<string, boolean>();
        if (source.children) {
            for (const child of source.children) {
                childMap.set(child.id, child.included);
            }
        }
        sourceStateMap.set(source.id, {included: source.included, children: childMap});
    }

    for (const resolved of resolvedSources) {
        const state = sourceStateMap.get(resolved.id);
        if (state) {
            resolved.included = state.included;
        }
        if (resolved.children) {
            for (const child of resolved.children) {
                const state = sourceStateMap.get(resolved.id);
                if (state?.children.has(child.id)) {
                    child.included = state.children.get(child.id)!;
                }
            }
        }
    }

    return resolvedSources;
};
