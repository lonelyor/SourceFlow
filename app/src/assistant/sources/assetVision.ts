// 附件「让 AI 看图」（plans/20260915-附件引用与OCR来源设计.md §2.2 第二期）。
// 图片 asset 开启看图后随请求发送图像块（走后端既有图像发送链路），OCR 走用户配置的多模态模型；
// 转录结果按资产路径缓存在内核（storage/assistant_asset_ocr.json，带 mtime 失效），前端只做查询与显式保存。
//
// 注意：本模块刻意不 import util/fetch（其依赖链含 electron 条件导入），
// 改用与 ai/api.ts 流式接口一致的直连 fetch + JSON 约定，保证 sources/ 可被轻量测试环境加载。

import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {isImageAssetName} from "../mentions/asset";
import type {IMentionSource} from "../mentions/types";

// 「让 AI 看图」开关挂在 IMentionSource 上（仅图片附件展示），仅存内存不持久化——
// 每次会话默认关是安全默认，避免每次对话静默消耗大量 token。
declare module "../mentions/types" {
    interface IMentionSource {
        visionEnabled?: boolean;
    }
}

// 每张图约 1024 tokens：与后端 assistantAIImageTokenEstimate 对齐
// （kernel/assistant_ai_provider_compat.go，2026-09-14 引入的图像计量口径）。
// 写死常量保持前后端一致；后端调整时需同步此处与 mentions/contextBuilder.ts 的同名口径。
export const ASSISTANT_AI_ASSET_IMAGE_TOKEN_ESTIMATE = 1024;

export interface IAssistantAssetOcrEntry {
    transcript: string;
    mtime: string;
}

export interface IAssistantAssetVisionPlan {
    /** 需要随请求发送图像块的资产相对引用路径（如 assets/foo.png）。 */
    assetAttachments: string[];
    /** 命中 OCR 缓存的资产：不发图，转录文本并入该来源的元数据段。 */
    cacheHits: Array<{id: string; transcript: string}>;
}

// 会话内最近一次 OCR 查询结果（仅作面板提示与保存后的本地回填，发送判定以后端返回为准）。
const assistantAssetOcrCache = new Map<string, IAssistantAssetOcrEntry>();

// 最近一次 AI 回复（供来源面板「保存转录」取用）；由发送链在收到最终回复后写入。
let assistantAIAssetSaveReply = "";

const postAssistantAssetJson = async (url: string, payload: unknown): Promise<Record<string, unknown> | null> => {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    const websocketData = await response.json() as IWebSocketData;
    if (websocketData.code !== 0) {
        throw new Error(websocketData.msg || "Assistant asset OCR request failed");
    }
    return (websocketData.data || null) as Record<string, unknown> | null;
};

const isVisionCapableAssetSource = (source: IMentionSource): boolean => {
    return !!source && source.type === "asset" && isImageAssetName(source.title || source.id);
};

// 面板展示口径：只有图片附件才出现「让 AI 看图」开关。
export const isAssistantAssetVisionToggleable = (source: IMentionSource): boolean => {
    return isVisionCapableAssetSource(source);
};

// 发送口径：图片附件 + 已开启看图 + 未被排除。
export const isAssistantAssetVisionSource = (source: IMentionSource): boolean => {
    return isVisionCapableAssetSource(source) && source.included !== false && source.visionEnabled === true;
};

export const getCachedAssistantAssetOcr = (id: string): IAssistantAssetOcrEntry | null => {
    return assistantAssetOcrCache.get(id) || null;
};

const setAssistantAssetOcrCacheEntry = (id: string, entry: IAssistantAssetOcrEntry) => {
    assistantAssetOcrCache.set(id, entry);
};

// 查询内核 OCR 缓存（空 transcript = 无缓存）。
export const fetchAssistantAssetOcr = async (id: string): Promise<IAssistantAssetOcrEntry> => {
    const data = await postAssistantAssetJson("/api/assistant/asset/ocr", {id});
    const entry: IAssistantAssetOcrEntry = {
        transcript: `${(data as {transcript?: unknown} | null)?.transcript || ""}`,
        mtime: `${(data as {mtime?: unknown} | null)?.mtime || ""}`,
    };
    setAssistantAssetOcrCacheEntry(id, entry);
    return entry;
};

// 显式保存：把当前 AI 回复存为该资产的转录。契约调整（2026-09-15）：mtime 可选——
// 前端拿不到实时 stat，直接不传 mtime，由后端 stat 后填充，天然不会 mtime 冲突。
export const saveAssistantAssetOcr = async (payload: {id: string; transcript: string; mtime?: string}) => {
    return postAssistantAssetJson("/api/assistant/asset/ocr/save", payload);
};

export const recordAssistantAILastReplyForAssetSave = (content: string) => {
    assistantAIAssetSaveReply = `${content || ""}`;
};

export const getAssistantAILastReplyForAssetSave = (): string => {
    return assistantAIAssetSaveReply;
};

// 「保存转录」：无可用回复或保存失败时给出行内提示，返回是否成功（供面板刷新徽标）。
export const saveAssistantAssetTranscript = async (source: IMentionSource): Promise<boolean> => {
    const reply = `${getAssistantAILastReplyForAssetSave() || ""}`.trim();
    if (!reply) {
        showMessage(assistantText("还没有可保存的 AI 回复", "No AI reply to save yet"), 5000, "error");
        return false;
    }
    try {
        await saveAssistantAssetOcr({id: source.id, transcript: reply});
        setAssistantAssetOcrCacheEntry(source.id, {transcript: reply, mtime: ""});
        showMessage(assistantText("已保存为该附件的转录，下次引用直接复用", "Saved as the asset transcript; future references will reuse it"));
        return true;
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        return false;
    }
};

// 发送前规划：命中缓存（transcript 非空）→ 并入文本不发图；未命中 → 进 assetAttachments 发图。
// OCR 查询失败不阻塞发送：按未命中处理，由后端对发图项做扩展名/大小/数量校验，失败项跳过。
export const resolveAssistantAssetVisionForSend = async (sources: IMentionSource[]): Promise<IAssistantAssetVisionPlan> => {
    const plan: IAssistantAssetVisionPlan = {assetAttachments: [], cacheHits: []};
    for (const source of sources) {
        if (!isAssistantAssetVisionSource(source)) {
            continue;
        }
        let entry: IAssistantAssetOcrEntry | null = null;
        try {
            entry = await fetchAssistantAssetOcr(source.id);
        } catch (error) {
            entry = null;
        }
        if (entry && `${entry.transcript}`.trim()) {
            plan.cacheHits.push({id: source.id, transcript: entry.transcript});
        } else {
            plan.assetAttachments.push(source.id);
        }
    }
    return plan;
};

// 把命中的缓存转录并入来源元数据段（标注「来自缓存转录」），供 buildIncludedContextText 一起送入 prompt。
export const applyAssistantAssetOcrCacheHits = (sources: IMentionSource[], hits: Array<{id: string; transcript: string}>): IMentionSource[] => {
    if (!hits || !hits.length) {
        return sources;
    }
    const hitMap = new Map<string, string>();
    for (const hit of hits) {
        const transcript = `${hit.transcript || ""}`.trim();
        if (hit.id && transcript) {
            hitMap.set(hit.id, transcript);
        }
    }
    for (const source of sources) {
        if (source.type !== "asset") {
            continue;
        }
        const transcript = hitMap.get(source.id);
        if (!transcript) {
            continue;
        }
        const marker = assistantText("来自缓存转录", "From cached transcript");
        source.summary = `${source.summary ? `${source.summary}\n` : ""}${marker}：\n${transcript}`;
    }
    return sources;
};
