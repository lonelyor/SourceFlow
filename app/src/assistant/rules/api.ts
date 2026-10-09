import {fetchSyncPost} from "../../util/fetch";
import {assistantText} from "../constants";
import {getSecurityConfig} from "../security/api";
import {splitWorkbenchRuleActions, WORKBENCH_RULE_SKILL_ACTION_ID} from "../../workbench/dialogShared";
import type {IWorkbenchRule, TWorkbenchRuleActionId} from "../../workbench/dialogShared";
import type {TSecurityMode} from "../security/types";

// 自动化规则运行契约（plans/20260915-自动化规则系统设计.md §3/§4/§5）：
// - POST /api/assistant/rules/validate {rule, targets, mode} → 每个 target 将执行的动作摘要（dryRun 预览）。
// - POST /api/assistant/rules/run      {rule, targets, mode} → {taskId, itemCount, actionsSummary}；
//   任务出现在既有 Agent 面板，L3+ 动作的任务项进入 review 状态，逐项审阅复用现有 Agent UI。
// rule 形状即既有 IWorkbenchRule，actions 语义扩展：{actionId: 参数字符串}（向后兼容旧属性键）。
// 期二边界：runSkill（技能动作）是前端执行器语义——技能产出 patch 走前端补丁审阅，
// 构建后端 payload 时剔除，绝不进 rules/validate / rules/run 批量任务；运行时在前端逐篇执行。

export interface IAssistantRuleTargetSummary {
    id: string;
    title: string;
    summary: string;
}

export interface IAssistantRuleRunResult {
    taskId: string;
    itemCount: number;
    actionsSummary: string;
}

const requireRuleResponseData = async <T>(url: string, payload: Record<string, unknown>): Promise<T> => {
    const response = await fetchSyncPost(url, payload);
    if (response.code !== 0) {
        throw new Error(response.msg || assistantText("规则请求失败", "Rule request failed"));
    }
    return (response.data || {}) as T;
};

// R8 契约对齐：前端 camel 动作 id + 字符串参数 → 后端 kebab 动作 id + 结构化参数；
// 旧版属性键（非语义 actionId）并入 set-attrs.attrs，老规则行为不丢失。
export const buildAssistantRuleBackendActions = (rule: IWorkbenchRule): Record<string, unknown> => {
    const {semantic, attrs} = splitWorkbenchRuleActions(rule.actions || {});
    const backend: Record<string, unknown> = {};
    const attrMap: Record<string, string> = {...attrs};
    (Object.entries(semantic) as Array<[TWorkbenchRuleActionId, string]>).forEach(([actionId, params]) => {
        if ((actionId as string) === WORKBENCH_RULE_SKILL_ACTION_ID) {
            // 技能动作不进后端批量任务：由前端在规则运行流里逐篇审阅执行。
            return;
        }
        if (actionId === "setAttrs") {
            (params || "").split(";").forEach((pair) => {
                const eq = pair.indexOf("=");
                if (eq > 0) {
                    attrMap[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
                }
            });
            return;
        }
        if (actionId === "moveToPath") {
            const raw = (params || "").replace(/^\/+/, "");
            const slash = raw.indexOf("/");
            backend["move-note"] = slash === -1
                ? {notebook: raw.trim(), path: "/"}
                : {notebook: raw.slice(0, slash).trim(), path: "/" + raw.slice(slash + 1).trim()};
            return;
        }
        if (actionId === "appendContent") {
            backend["append-note"] = {content: params || ""};
            return;
        }
        if (actionId === "toInbox") {
            backend["push-inbox"] = {};
        }
    });
    if (Object.keys(attrMap).length) {
        backend["set-attrs"] = {attrs: attrMap};
    }
    return backend;
};

// 期二：规则里的技能动作参数（技能 id）。runSkill 是唯一的前端执行器语义动作。
export const getAssistantRuleSkillActionId = (rule: IWorkbenchRule): string => {
    const {skill} = splitWorkbenchRuleActions(rule.actions || {});
    return `${skill[WORKBENCH_RULE_SKILL_ACTION_ID] || ""}`.trim();
};

export const hasAssistantRuleSkillAction = (rule: IWorkbenchRule): boolean => {
    return getAssistantRuleSkillActionId(rule) !== "";
};

export const buildAssistantRulePayload = (rule: IWorkbenchRule, targets: string[], mode: TSecurityMode) => ({
    rule: {...rule, actions: buildAssistantRuleBackendActions(rule)},
    targets: (targets || []).map((id) => `${id || ""}`.trim()).filter(Boolean),
    mode,
});

// mode 用当前安全模式；安全配置读取失败时回落 default（最保守）。
export const resolveAssistantRuleRunMode = async (): Promise<TSecurityMode> => {
    try {
        const config = await getSecurityConfig();
        const mode = `${(config as {defaultMode?: string})?.defaultMode || ""}`.trim();
        if (["default", "autoReview", "fullAccess"].includes(mode)) {
            return mode as TSecurityMode;
        }
    } catch (_error) {
        // 安全配置不可达时按 default 处理，让后端安全内核做最终裁决。
    }
    return "default";
};

// validate 返回的 dryRun 摘要做宽容归一：接受 targets/items/results 数组；对象支持
// 后端契约形状（{targetId, title, actions: [{summary}]}）与简化形状（纯字符串摘要）。
export const normalizeAssistantRuleValidateData = (data: unknown): IAssistantRuleTargetSummary[] => {
    const source = data as {targets?: unknown, items?: unknown, results?: unknown, summaries?: unknown} | unknown[] | null;
    const list = Array.isArray(source)
        ? source
        : (source as {targets?: unknown})?.targets || (source as {items?: unknown})?.items || (source as {results?: unknown})?.results || (source as {summaries?: unknown})?.summaries || [];
    if (!Array.isArray(list)) {
        return [];
    }
    return list.map((item, index) => {
        if (typeof item === "string") {
            return {id: `${index}`, title: "", summary: item};
        }
        const record = (item || {}) as {
            id?: string, targetId?: string, title?: string, name?: string,
            summary?: string, description?: string, actionsSummary?: string,
            actions?: Array<{summary?: string, actionId?: string, opType?: string, risk?: string}>,
        };
        const actionSummaries = Array.isArray(record.actions)
            ? record.actions.map((a) => `${a.summary || a.actionId || a.opType || ""}`.trim()).filter(Boolean).join("；")
            : "";
        return {
            id: `${record.id || record.targetId || index}`,
            title: `${record.title || record.name || ""}`,
            summary: `${record.summary || record.description || actionSummaries || record.actionsSummary || ""}`,
        };
    }).filter((item) => item.summary !== "");
};

export const validateAssistantRule = async (rule: IWorkbenchRule, targets: string[], mode: TSecurityMode): Promise<IAssistantRuleTargetSummary[]> => {
    const data = await requireRuleResponseData<unknown>("/api/assistant/rules/validate", buildAssistantRulePayload(rule, targets, mode));
    return normalizeAssistantRuleValidateData(data);
};

export const normalizeAssistantRuleRunResult = (data: unknown): IAssistantRuleRunResult => {
    const record = (data || {}) as {
        taskId?: string, taskID?: string, itemCount?: number, count?: number,
        actionsSummary?: string | Array<{actionId?: string, opType?: string, risk?: string, count?: number}>,
    };
    // 后端 actionsSummary 为数组（[{actionId, opType, risk, count}]），归一为可读字符串。
    const summaryText = typeof record.actionsSummary === "string"
        ? record.actionsSummary
        : (Array.isArray(record.actionsSummary)
            ? record.actionsSummary.map((a) => {
                const label = a.actionId || a.opType || "";
                return a.count ? `${label}×${a.count}` : label;
            }).filter(Boolean).join("，")
            : "");
    return {
        taskId: `${record.taskId || record.taskID || ""}`,
        itemCount: Number(record.itemCount || record.count || 0),
        actionsSummary: summaryText,
    };
};

export const runAssistantRule = async (rule: IWorkbenchRule, targets: string[], mode: TSecurityMode): Promise<IAssistantRuleRunResult> => {
    const data = await requireRuleResponseData<unknown>("/api/assistant/rules/run", buildAssistantRulePayload(rule, targets, mode));
    return normalizeAssistantRuleRunResult(data);
};
