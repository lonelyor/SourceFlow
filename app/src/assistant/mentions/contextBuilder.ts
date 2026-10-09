import {buildContextPack} from "./api";
import {isImageAssetName} from "./asset";
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
    let visionImageCount = 0;
    for (const source of sources) {
        if (!source.included) continue;
        if (source.summary) {
            totalChars += source.summary.length;
        }
        // 开启「让 AI 看图」的图片附件按图像口径计量（对齐后端 assistantAIImageTokenEstimate）。
        if (source.type === "asset" && isImageAssetName(source.title || source.id) && isVisionEnabledAssetSource(source)) {
            visionImageCount += 1;
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
    return Math.ceil(totalChars / 4) + visionImageCount * ASSISTANT_AI_ASSET_IMAGE_TOKEN_ESTIMATE;
};

// 附件（asset）来源的 prompt 元数据段（设计 §2.1 第一期：只投喂元数据，不投喂像素）。
// 明确告知 AI「这是元数据引用」，避免模型过度声称看过图片内容。
const ASSET_METADATA_NOTE_ZH = "该附件为元数据引用，图片内容需用户开启看图后方可分析（第二期）";
const ASSET_METADATA_NOTE_EN = "this attachment is referenced as metadata only; image content can be analyzed only after the user enables image viewing (phase 2)";

// 期二（§2.2）：用户开启「让 AI 看图」后，图片随请求发送，指令升级为直接分析/按需转录。
const ASSET_VISION_NOTE_ZH = "该附件图像已附带，请直接分析/按需转录图中文字";
const ASSET_VISION_NOTE_EN = "the attachment image is attached to this request; analyze it directly and transcribe text in the image as needed";

// 每张看图图片约 1024 tokens：与 sources/assetVision.ts 的 ASSISTANT_AI_ASSET_IMAGE_TOKEN_ESTIMATE
// 及后端 assistantAIImageTokenEstimate 对齐。mentions/ 不反向依赖 sources/，此处独立声明，
// 由 testAssistantAssetVision 保证两处数值一致。
const ASSISTANT_AI_ASSET_IMAGE_TOKEN_ESTIMATE = 1024;

// visionEnabled 由 sources/assetVision.ts 通过模块扩展挂在 IMentionSource 上；
// mentions/ 只做判读，避免为读取一个可选字段引入对 sources/ 的运行时依赖。
const isVisionEnabledAssetSource = (source: IMentionSource): boolean => {
    return !!(source as {visionEnabled?: boolean}).visionEnabled;
};

export const buildAssetSourceSummary = (source: IMentionSource, packContent?: string): string => {
    const assetName = source.title || source.id;
    const kind = isImageAssetName(assetName) ? assistantText("图片", "image") : assistantText("文档", "document");
    const location = source.hPath || source.path || "assets";
    const owner = source.notebook
        ? assistantText(`，所属 ${source.notebook}`, `, belongs to ${source.notebook}`)
        : "";
    const metaLine = assistantText(
        `- 附件：${assetName}（${kind}，位于 ${location}/${owner}）`,
        `- Attachment: ${assetName} (${kind}, at ${location}/${owner})`
    );
    const note = isVisionEnabledAssetSource(source)
        ? assistantText(`说明：${ASSET_VISION_NOTE_ZH}。`, `Note: ${ASSET_VISION_NOTE_EN}.`)
        : assistantText(`说明：${ASSET_METADATA_NOTE_ZH}。`, `Note: ${ASSET_METADATA_NOTE_EN}.`);
    const content = `${packContent || ""}`.trim();
    return content ? `${metaLine}\n${note}\n${content}` : `${metaLine}\n${note}`;
};

// 幂等判定按当前看图状态匹配：开关切换后允许用新指令替换旧说明段。
const hasAssetPromptNote = (summary: string | undefined, visionEnabled: boolean): boolean => {
    if (!summary) {
        return false;
    }
    return visionEnabled
        ? (summary.includes(ASSET_VISION_NOTE_ZH) || summary.includes(ASSET_VISION_NOTE_EN))
        : (summary.includes(ASSET_METADATA_NOTE_ZH) || summary.includes(ASSET_METADATA_NOTE_EN));
};

// 幂等：对已包含对应说明段的 asset summary 不重复追加。
const annotateAssetSources = (sources: IMentionSource[]): IMentionSource[] => {
    for (const source of sources) {
        if (source.type !== "asset" || !source.included || hasAssetPromptNote(source.summary, isVisionEnabledAssetSource(source))) {
            continue;
        }
        source.summary = buildAssetSourceSummary(source, source.summary);
    }
    return sources;
};

const needsContextPackResolve = (source: IMentionSource) => {
    if (!source.included) {
        return false;
    }
    if (source.summary) {
        return false;
    }
    if (source.children && source.children.length > 0) {
        return source.children.some((child) => child.included && !child.summary);
    }
    return source.type === "note" || source.type === "folder" || source.type === "asset";
};

export const resolveSourcesForPrompt = async (sources: IMentionSource[], securityMode: TSecurityMode = "default"): Promise<IMentionSource[]> => {
    const snapshot = cloneMentionSources(sources);
    if (!snapshot.some(needsContextPackResolve)) {
        return annotateAssetSources(snapshot);
    }
    // resolveAndBuildPack 内部已对 asset 来源追加元数据段。
    return resolveAndBuildPack(snapshot, securityMode);
};

export const resolveAndBuildPack = async (sources: IMentionSource[], securityMode: TSecurityMode = "default"): Promise<IMentionSource[]> => {
    const items = buildPackItemsFromSources(sources);
    if (!items.length) return annotateAssetSources(sources);

    const pack = await buildContextPack(items, securityMode);
    if (pack.dropped?.length || pack.truncated) {
        const droppedCount = pack.dropped?.length || 0;
        const message = droppedCount > 0
            ? assistantText(`有 ${droppedCount} 个来源未纳入上下文`, `${droppedCount} source(s) were not included in context`)
            : assistantText("来源上下文已按预算截断", "Source context was truncated to fit the budget");
        showMessage(message, 5000, "info");
    }
    const resolvedSources = buildSourcesFromPackEntries(pack.items || []);

    const sourceStateMap = new Map<string, {included: boolean; visionEnabled?: boolean; children: Map<string, boolean>}>();
    for (const source of sources) {
        const childMap = new Map<string, boolean>();
        if (source.children) {
            for (const child of source.children) {
                childMap.set(child.id, child.included);
            }
        }
        // 「让 AI 看图」开关只存前端内存：pack 重建条目时随 included 一起回填。
        sourceStateMap.set(source.id, {
            included: source.included,
            visionEnabled: (source as {visionEnabled?: boolean}).visionEnabled,
            children: childMap,
        });
    }

    for (const resolved of resolvedSources) {
        const state = sourceStateMap.get(resolved.id);
        if (state) {
            resolved.included = state.included;
            (resolved as {visionEnabled?: boolean}).visionEnabled = state.visionEnabled;
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

    return annotateAssetSources(resolvedSources);
};
