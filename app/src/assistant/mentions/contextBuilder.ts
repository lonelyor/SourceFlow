import {buildContextPack} from "./api";
import type {IMentionSource, IContextPackItem, IContextPackEntry} from "./types";
import type {TSecurityMode} from "../security/types";
import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";

export interface IAssistantSourceCitation {
    id: string;
    type: string;
    title: string;
    notebook?: string;
    path?: string;
    hPath?: string;
    children?: IAssistantSourceCitation[];
}

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

export const cloneMentionSources = (sources: IMentionSource[]): IMentionSource[] => {
    return (sources || []).map((source) => ({
        ...source,
        children: source.children?.map((child) => ({...child})),
    }));
};

export const buildSourceCitationsFromMentionSources = (sources: IMentionSource[]): IAssistantSourceCitation[] => {
    const citations: IAssistantSourceCitation[] = [];
    for (const source of sources) {
        if (!source.included || !source.id || !source.title) {
            continue;
        }
        const citation: IAssistantSourceCitation = {
            id: source.id,
            type: source.type,
            title: source.title,
            notebook: source.notebook,
            path: source.path,
            hPath: source.hPath,
        };
        const children = (source.children || []).filter((child) => child.included && child.id && child.title).map((child) => ({
            id: child.id,
            type: child.type,
            title: child.title,
            notebook: child.notebook,
            path: child.path,
            hPath: child.hPath,
        }));
        if (children.length) {
            citation.children = children;
        }
        citations.push(citation);
    }
    return citations;
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

export const resolveAndBuildPack = async (sources: IMentionSource[], securityMode: TSecurityMode = "default"): Promise<IMentionSource[]> => {
    const items = buildPackItemsFromSources(sources);
    if (!items.length) return sources;

    const pack = await buildContextPack(items, securityMode);
    if (pack.dropped?.length || pack.truncated) {
        const droppedCount = pack.dropped?.length || 0;
        const message = droppedCount > 0
            ? assistantText(`有 ${droppedCount} 个来源未纳入上下文`, `${droppedCount} source(s) were not included in context`)
            : assistantText("来源上下文已按预算截断", "Source context was truncated to fit the budget");
        showMessage(message, 5000, "info");
    }
    const resolvedSources = buildSourcesFromPackEntries(pack.items || []);

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
