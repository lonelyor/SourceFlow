import {fetchSyncPost} from "../../util/fetch";
import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {hasAssistantRuleSkillAction, runAssistantRule, resolveAssistantRuleRunMode} from "./api";
import {disposeAssistantRulesScheduler, initAssistantRulesScheduler} from "./scheduler";
import {matchWorkbenchRule} from "../../workbench/dialogRules";
import {getState} from "../../workbench/dialogShared";
import type {IWorkbenchItem} from "../../workbench/constants";
import type {IWorkbenchRule} from "../../workbench/dialogShared";
import type {TSecurityMode} from "../security/types";

// 笔记事件触发器（期一最简形态）：
// - 事件源：内核既有广播事件 `savedoc`（kernel PushSaveDoc，每次事务提交广播 {rootID, type, sources}），
//   通过主窗口 WebSocket（window.sourceflow.ws）接收，文档创建/更新都会到达。
// - 循环防护：规则动作产生的写入由后端标记 ruleRunId；前端对 savedoc 载荷（sources 序列化文本）做
//   ruleRunId / rule-run-id 键检测，带标记的事件直接忽略，杜绝规则互触发。
// - 去抖 2s（按文档聚合）；去重键 = docId + 规则名 + 版本（tx timestamp，缺省时间窗兜底），同一文档
//   同一版本不重复触发。
// - 双开关：总开关（localStorage，默认关；期三起同时覆盖文档事件与定时计划，UI 文案「自动触发总开关」）
//   + 规则级「文档事件触发」勾选（默认关）。
// - 执行语义：事件触发静默执行 L2 动作，L3+ 由安全内核自动进 review（后端行为），前端不做额外确认。
// - 期二边界：含技能动作（runSkill）的规则不参与事件触发——静默自动化不弹补丁审阅窗；
//   命中时 toast 提示「含技能动作，请手动运行」（按 docId+规则名+版本去重，不重复打扰）。
// - 期三：定时触发（scheduler.ts）与事件触发共用本模块的武装/销毁生命周期与总开关；
//   工作台对话框首次渲染时一并武装，错过的时点不补跑。

export const ASSISTANT_RULES_EVENT_TRIGGER_STORAGE_KEY = "sourceflow.assistant.rules.eventTrigger";
export const ASSISTANT_RULES_EVENT_TRIGGER_DEBOUNCE_MS = 2000;
const ASSISTANT_RULES_TRIGGER_SEEN_LIMIT = 512;
const ASSISTANT_RULES_TRIGGER_ITEM_LIMIT = 512;

const ATTACH_FLAG = "__sourceflowAssistantRulesTrigger";
const RULE_RUN_MARKER_PATTERN = /"ruleRunId"\s*:|"ruleRunID"\s*:|"rule-run-id"\s*:/;

let triggerArmed = false;
let rearmTimer = 0;
const pendingDocs = new Map<string, {timer: number, version: string}>();
const seenKeys = new Set<string>();

export const isAssistantRulesEventTriggerEnabled = (): boolean => {
    try {
        return window.localStorage?.getItem(ASSISTANT_RULES_EVENT_TRIGGER_STORAGE_KEY) === "on";
    } catch (_error) {
        return false;
    }
};

export const setAssistantRulesEventTriggerEnabled = (enabled: boolean) => {
    try {
        window.localStorage?.setItem(ASSISTANT_RULES_EVENT_TRIGGER_STORAGE_KEY, enabled ? "on" : "off");
    } catch (_error) {
        // Ignore storage failures; the toggle still applies to this session.
    }
    if (enabled) {
        initAssistantRulesEventTrigger();
    }
};

// savedoc 载荷里的 ruleRunId 标记（后端写上下文抑制）：命中即忽略，防止规则动作再次触发规则。
export const isAssistantRuleRunEvent = (data: unknown): boolean => {
    if (!data || typeof data !== "object") {
        return false;
    }
    try {
        return RULE_RUN_MARKER_PATTERN.test(JSON.stringify(data));
    } catch (_error) {
        return false;
    }
};

// 版本戳：优先取事务 timestamp（同一文档同一版本只触发一次），缺省回退秒级时间窗。
export const extractAssistantTriggerVersion = (data: unknown): string => {
    const record = (data || {}) as {sources?: unknown};
    const sources = Array.isArray(record.sources) ? record.sources : [];
    for (const source of sources) {
        const timestamp = (source as {timestamp?: unknown})?.timestamp;
        if (typeof timestamp === "number" && timestamp > 0) {
            return `tx-${timestamp}`;
        }
    }
    return `t-${Math.floor(Date.now() / 1000)}`;
};

export const buildAssistantTriggerDedupeKey = (rootID: string, ruleName: string, version: string) =>
    `${rootID}|${ruleName}|${version}`;

const rememberSeenKey = (key: string) => {
    if (seenKeys.has(key)) {
        return false;
    }
    seenKeys.add(key);
    if (seenKeys.size > ASSISTANT_RULES_TRIGGER_SEEN_LIMIT) {
        const first = seenKeys.values().next().value;
        if (first != null) {
            seenKeys.delete(first);
        }
    }
    return true;
};

const fetchWorkbenchQuickItems = async (limit = ASSISTANT_RULES_TRIGGER_ITEM_LIMIT): Promise<IWorkbenchItem[]> => {
    const response = await fetchSyncPost("/api/workbench/getWorkbenchItems", {limit});
    if (response.code !== 0) {
        throw new Error(response.msg || "queryWorkbenchItems failed");
    }
    const items = (response.data?.items || []) as IWorkbenchItem[];
    return Array.isArray(items) ? items : [];
};

// 命中规则的文档静默运行：targets=事件文档自身，mode=当前安全模式（读不到按 default）。
export const runAssistantRulesForDoc = async (rootID: string, version: string, rules?: IWorkbenchRule[], mode?: TSecurityMode) => {
    const enabledRules = (rules || []).filter((rule) =>
        rule.enabled !== false && rule.eventTrigger === true && Object.keys(rule.actions || {}).length > 0);
    if (!enabledRules.length) {
        return [];
    }
    const items = await fetchWorkbenchQuickItems();
    const item = items.find((candidate) => candidate.id === rootID);
    if (!item) {
        // 期一口径：只对工作台可见条目做匹配，查不到（如刚建未入库/系统文档）静默跳过。
        return [];
    }
    const runMode = mode || await resolveAssistantRuleRunMode();
    const results: Array<{ruleName: string, taskId: string, itemCount: number}> = [];
    for (const rule of enabledRules) {
        if (!matchWorkbenchRule(rule, item)) {
            continue;
        }
        if (hasAssistantRuleSkillAction(rule)) {
            // 期二边界：技能动作要弹补丁审阅窗，不能静默自动化——提示用户手动运行（同版本去重）。
            if (rememberSeenKey(buildAssistantTriggerDedupeKey(rootID, rule.name, version))) {
                showMessage(assistantText(
                    `规则「${rule.name}」含技能动作，请手动运行（技能产出需逐篇审阅，不做静默自动化）`,
                    `Rule "${rule.name}" contains a skill action — run it manually (skill outputs need per-note review, not silent automation)`),
                7000, "info");
            }
            continue;
        }
        if (!rememberSeenKey(buildAssistantTriggerDedupeKey(rootID, rule.name, version))) {
            continue;
        }
        try {
            const result = await runAssistantRule(rule, [rootID], runMode);
            results.push({ruleName: rule.name, taskId: result.taskId, itemCount: result.itemCount});
            console.log(`[assistant-rules] event trigger ran "${rule.name}" on ${rootID}: task ${result.taskId} (${result.itemCount} items)`);
        } catch (error) {
            console.error(`[assistant-rules] event trigger failed for rule "${rule.name}" on ${rootID}`, error);
        }
    }
    return results;
};

export const flushAssistantTriggerDoc = async (rootID: string) => {
    const pending = pendingDocs.get(rootID);
    if (!pending) {
        return;
    }
    window.clearTimeout(pending.timer);
    pendingDocs.delete(rootID);
    if (!isAssistantRulesEventTriggerEnabled()) {
        return;
    }
    await runAssistantRulesForDoc(rootID, pending.version, getState().rules);
};

// 去抖 2s：同一文档连续保存只评估最后一版。
export const queueAssistantTriggerDoc = (rootID: string, version: string) => {
    const existing = pendingDocs.get(rootID);
    if (existing) {
        window.clearTimeout(existing.timer);
    }
    const timer = window.setTimeout(() => {
        void flushAssistantTriggerDoc(rootID);
    }, ASSISTANT_RULES_EVENT_TRIGGER_DEBOUNCE_MS);
    pendingDocs.set(rootID, {timer, version});
};

// 内核消息入口：只关心 savedoc（文档创建/更新广播）。独立导出便于测试与复用。
export const handleAssistantTriggerKernelMessage = (event: {data?: unknown}) => {
    if (!triggerArmed || !isAssistantRulesEventTriggerEnabled() || !event || typeof event.data !== "string") {
        return;
    }
    let parsed: {cmd?: string, data?: unknown};
    try {
        parsed = JSON.parse(event.data);
    } catch (_error) {
        return;
    }
    if (parsed?.cmd !== "savedoc") {
        return;
    }
    const payload = (parsed.data || {}) as {rootID?: string};
    const rootID = `${payload.rootID || ""}`.trim();
    if (!rootID || isAssistantRuleRunEvent(parsed.data)) {
        return;
    }
    queueAssistantTriggerDoc(rootID, extractAssistantTriggerVersion(parsed.data));
};

const attachAssistantTriggerSocket = (): boolean => {
    const socket = window.sourceflow?.ws?.ws as WebSocket & {[key: string]: unknown} | undefined;
    if (!socket || socket[ATTACH_FLAG]) {
        return false;
    }
    const original = socket.onmessage;
    socket[ATTACH_FLAG] = true;
    socket.onmessage = (event: MessageEvent) => {
        try {
            handleAssistantTriggerKernelMessage(event as unknown as {data?: unknown});
        } catch (error) {
            console.error(assistantText("[assistant-rules] 事件触发处理失败", "[assistant-rules] event trigger handling failed"), error);
        }
        if (typeof original === "function") {
            original.call(socket, event);
        }
    };
    return true;
};

// WebSocket 断线重连会换新 socket，低频巡检补挂（只在已开启时有效）。
const scheduleTriggerRearm = () => {
    if (rearmTimer) {
        return;
    }
    rearmTimer = window.setInterval(() => {
        if (!triggerArmed) {
            return;
        }
        attachAssistantTriggerSocket();
        if (!isAssistantRulesEventTriggerEnabled()) {
            disposeAssistantRulesEventTrigger();
        }
    }, 15000);
};

export const initAssistantRulesEventTrigger = () => {
    // 期三：定时调度器与事件触发同生命周期武装（幂等）；总开关判断注入，同一开关覆盖两种自动触发。
    initAssistantRulesScheduler({isMasterEnabled: isAssistantRulesEventTriggerEnabled});
    if (triggerArmed) {
        attachAssistantTriggerSocket();
        return;
    }
    triggerArmed = true;
    attachAssistantTriggerSocket();
    scheduleTriggerRearm();
};

export const disposeAssistantRulesEventTrigger = () => {
    triggerArmed = false;
    disposeAssistantRulesScheduler();
    if (rearmTimer) {
        window.clearInterval(rearmTimer);
        rearmTimer = 0;
    }
    pendingDocs.forEach((pending) => window.clearTimeout(pending.timer));
    pendingDocs.clear();
};
