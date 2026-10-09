import {fetchSyncPost} from "../../util/fetch";
import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {hasAssistantRuleSkillAction, resolveAssistantRuleRunMode, runAssistantRule} from "./api";
import {matchWorkbenchRule} from "../../workbench/dialogRules";
import {getState, normalizeWorkbenchRuleSchedule} from "../../workbench/dialogShared";
import type {IWorkbenchItem} from "../../workbench/constants";
import type {IWorkbenchRule} from "../../workbench/dialogShared";
import type {TSecurityMode} from "../security/types";

// 定时触发器（期三，诚实版）：plans/20260915-自动化规则系统设计.md §6 期三。
// 语义边界（编辑器同步明示，管理用户预期）：
// - 仅在 SourceFlow 运行时触发：应用未运行时错过的时点不补跑，绝无补偿队列。
// - 武装后（工作台对话框首次渲染，同事件触发惯例）每分钟检查一次：
//   interval = 距上次运行 ≥ N 小时（从未运行视为已超期，首检即命中，跨会话只补一次）；
//   daily = 当前 HH:MM 命中且今日（本地日）未跑。
// - 上次运行时间存 localStorage（成功与失败都记账）：失败不重试风暴，daily 当日去重。
// - targets = 该规则匹配的全部工作台可见条目（getWorkbenchItems + matchWorkbenchRule），
//   上限 20 篇（后端 assistantAgentTaskItemLimit 单批上限），超出截断并 toast 说明。
// - 双开关：复用自动触发总开关（triggers 注入判断，localStorage 默认关）+ 规则级 schedule 配置。
// - 含技能动作（runSkill）的规则不参与定时（静默自动化不弹补丁审阅窗），按天去重提示手动运行。
// - 防重入：上一轮未完成时跳过本轮，绝不并发提交批量任务。

export const ASSISTANT_RULES_SCHEDULE_LAST_RUN_PREFIX = "sourceflow.assistant.rules.schedule.lastRun.";
export const ASSISTANT_RULES_SCHEDULE_TICK_MS = 60 * 1000;
export const ASSISTANT_RULES_SCHEDULE_TARGET_LIMIT = 20;
const ASSISTANT_RULES_SCHEDULE_ITEM_LIMIT = 512;
const ASSISTANT_RULES_SCHEDULE_HINT_SEEN_LIMIT = 512;

let schedulerTimer = 0;
let schedulerTicking = false;
let isMasterTriggerEnabled: () => boolean = () => false;
const manualHintSeen = new Set<string>();

export interface IAssistantRulesSchedulerArmOptions {
    isMasterEnabled?: () => boolean;
}

export interface IAssistantRuleScheduleTargets {
    targets: string[];
    totalMatches: number;
}

export interface IAssistantRuleScheduleRunResult {
    ruleName: string;
    taskId: string;
    itemCount: number;
    targetCount: number;
}

export interface IAssistantRulesSchedulerTickOptions {
    rules?: IWorkbenchRule[];
    now?: number;
    isMasterEnabled?: () => boolean;
}

const padSchedule2 = (value: number) => (value < 10 ? `0${value}` : `${value}`);

// 本地时区的日键与 HH:MM：daily 命中与「今日未跑」判定共用（跨午夜自然重置）。
export const getAssistantScheduleDayKey = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${padSchedule2(date.getMonth() + 1)}-${padSchedule2(date.getDate())}`;
};

export const getAssistantScheduleMinuteOfDay = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${padSchedule2(date.getHours())}:${padSchedule2(date.getMinutes())}`;
};

export const getAssistantRuleScheduleLastRun = (ruleName: string): number => {
    try {
        const raw = window.localStorage?.getItem(`${ASSISTANT_RULES_SCHEDULE_LAST_RUN_PREFIX}${ruleName}`) || "";
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (_error) {
        return 0;
    }
};

export const setAssistantRuleScheduleLastRun = (ruleName: string, timestamp: number) => {
    try {
        window.localStorage?.setItem(`${ASSISTANT_RULES_SCHEDULE_LAST_RUN_PREFIX}${ruleName}`, `${Math.max(0, Math.floor(timestamp))}`);
    } catch (_error) {
        // Ignore storage failures; the schedule still applies for this session.
    }
};

// 命中判定（纯函数，now/lastRun 均为毫秒时间戳，便于测试注入）：
// - interval：距上次运行 ≥ everyHours 小时（lastRun=0 视为从未运行，立即命中）。
// - daily：当前 HH:MM == atTime 且今日未跑（lastRun=0 的日键落在 1970 年，不会误判为今日已跑）。
export const isAssistantRuleScheduleDue = (rule: IWorkbenchRule, now: number, lastRun: number): boolean => {
    const schedule = normalizeWorkbenchRuleSchedule(rule?.schedule);
    if (!schedule) {
        return false;
    }
    if (schedule.kind === "interval") {
        const intervalMs = (schedule.everyHours || 0) * 60 * 60 * 1000;
        if (!(intervalMs > 0)) {
            return false;
        }
        return lastRun <= 0 || now - lastRun >= intervalMs;
    }
    return getAssistantScheduleMinuteOfDay(now) === schedule.atTime
        && getAssistantScheduleDayKey(lastRun) !== getAssistantScheduleDayKey(now);
};

const rememberScheduleManualHint = (key: string): boolean => {
    if (manualHintSeen.has(key)) {
        return false;
    }
    manualHintSeen.add(key);
    if (manualHintSeen.size > ASSISTANT_RULES_SCHEDULE_HINT_SEEN_LIMIT) {
        const first = manualHintSeen.values().next().value;
        if (first != null) {
            manualHintSeen.delete(first);
        }
    }
    return true;
};

const fetchWorkbenchVisibleItems = async (limit = ASSISTANT_RULES_SCHEDULE_ITEM_LIMIT): Promise<IWorkbenchItem[]> => {
    const response = await fetchSyncPost("/api/workbench/getWorkbenchItems", {limit});
    if (response.code !== 0) {
        throw new Error(response.msg || "queryWorkbenchItems failed");
    }
    const items = (response.data?.items || []) as IWorkbenchItem[];
    return Array.isArray(items) ? items : [];
};

// targets = 该规则匹配的全部工作台可见条目，按后端单次批量上限（20）截断；totalMatches 供超额 toast。
export const collectAssistantRuleScheduleTargets = (rule: IWorkbenchRule, items: IWorkbenchItem[]): IAssistantRuleScheduleTargets => {
    const matched = (items || [])
        .filter((item) => matchWorkbenchRule(rule, item))
        .map((item) => `${item?.id || ""}`.trim())
        .filter(Boolean);
    return {targets: matched.slice(0, ASSISTANT_RULES_SCHEDULE_TARGET_LIMIT), totalMatches: matched.length};
};

// 武装调度器：由事件触发器初始化时调用（工作台对话框首次渲染 → triggers 惯例），
// 总开关判断由 triggers 注入（同一开关同时覆盖文档事件与定时计划）。幂等，可重复调用。
export const initAssistantRulesScheduler = (options: IAssistantRulesSchedulerArmOptions = {}) => {
    if (typeof options.isMasterEnabled === "function") {
        isMasterTriggerEnabled = options.isMasterEnabled;
    }
    if (schedulerTimer) {
        return;
    }
    const runTick = () => {
        runAssistantRulesSchedulerTick().catch((error) => {
            console.error("[assistant-rules] schedule tick crashed", error);
        });
    };
    schedulerTimer = window.setInterval(runTick, ASSISTANT_RULES_SCHEDULE_TICK_MS);
    // 武装后立即检查一轮：从未运行过的 interval 规则按「距上次运行 ≥ N 小时」在首检命中。
    runTick();
};

export const disposeAssistantRulesScheduler = () => {
    if (schedulerTimer) {
        window.clearInterval(schedulerTimer);
        schedulerTimer = 0;
    }
};

// 单轮定时检查：可注入 rules/now/总开关（测试与复用）；生产路径由每分钟定时器无参调用。
export const runAssistantRulesSchedulerTick = async (options: IAssistantRulesSchedulerTickOptions = {}): Promise<IAssistantRuleScheduleRunResult[]> => {
    if (schedulerTicking) {
        // 防重入：上一轮未完成（网络慢/批量长）时跳过本轮。
        return [];
    }
    const masterCheck = typeof options.isMasterEnabled === "function" ? options.isMasterEnabled : isMasterTriggerEnabled;
    if (!masterCheck()) {
        return [];
    }
    schedulerTicking = true;
    try {
        const now = typeof options.now === "number" && Number.isFinite(options.now) ? options.now : Date.now();
        const rules = options.rules || getState().rules || [];
        const candidates = rules.filter((rule) =>
            rule.enabled !== false
            && normalizeWorkbenchRuleSchedule(rule.schedule) != null
            && Object.keys(rule.actions || {}).length > 0);
        const results: IAssistantRuleScheduleRunResult[] = [];
        let items: IWorkbenchItem[] | null = null;
        let runMode: TSecurityMode | null = null;
        for (const rule of candidates) {
            if (!isAssistantRuleScheduleDue(rule, now, getAssistantRuleScheduleLastRun(rule.name))) {
                continue;
            }
            if (hasAssistantRuleSkillAction(rule)) {
                // 期二口径：技能动作要弹补丁审阅窗，不能静默定时自动化——按天去重提示手动运行。
                if (rememberScheduleManualHint(`${rule.name}|${getAssistantScheduleDayKey(now)}`)) {
                    showMessage(assistantText(
                        `规则「${rule.name}」含技能动作，定时不执行，请手动运行（技能产出需逐篇审阅）`,
                        `Rule "${rule.name}" contains a skill action and is skipped by the schedule — run it manually (skill outputs need per-note review)`),
                    7000, "info");
                }
                continue;
            }
            // 命中即记账（成功与失败都记）：失败不重试风暴，interval 从本次起算，daily 今日去重。
            setAssistantRuleScheduleLastRun(rule.name, now);
            if (!items) {
                try {
                    items = await fetchWorkbenchVisibleItems();
                } catch (error) {
                    console.error("[assistant-rules] schedule tick failed to load workbench items", error);
                    showMessage(assistantText(
                        "定时触发加载工作台条目失败，本轮跳过（下个命中时点再试）",
                        "Failed to load workbench items for the schedule; skipped this tick (will retry at the next due time)"),
                    7000, "error");
                    break;
                }
            }
            const {targets, totalMatches} = collectAssistantRuleScheduleTargets(rule, items);
            if (totalMatches > targets.length) {
                showMessage(assistantText(
                    `规则「${rule.name}」定时命中 ${totalMatches} 篇，本次仅运行前 ${targets.length} 篇（后端单次上限 ${ASSISTANT_RULES_SCHEDULE_TARGET_LIMIT} 篇）`,
                    `Rule "${rule.name}" matched ${totalMatches} note(s); running the first ${targets.length} this time (backend batch limit ${ASSISTANT_RULES_SCHEDULE_TARGET_LIMIT})`),
                7000, "info");
            }
            if (!targets.length) {
                console.log(`[assistant-rules] schedule tick: "${rule.name}" due but matched no workbench items`);
                continue;
            }
            if (!runMode) {
                runMode = await resolveAssistantRuleRunMode();
            }
            try {
                const result = await runAssistantRule(rule, targets, runMode);
                results.push({ruleName: rule.name, taskId: result.taskId, itemCount: result.itemCount, targetCount: targets.length});
                console.log(`[assistant-rules] schedule ran "${rule.name}" on ${targets.length} note(s): task ${result.taskId} (${result.itemCount} items)`);
            } catch (error) {
                console.error(`[assistant-rules] schedule run failed for rule "${rule.name}"`, error);
                showMessage(assistantText(
                    `定时运行规则「${rule.name}」失败：${error instanceof Error ? error.message : `${error}`}（本轮已记账，下个命中时点再试）`,
                    `Scheduled run failed for rule "${rule.name}": ${error instanceof Error ? error.message : `${error}`} (booked for this tick; will retry at the next due time)`),
                7000, "error");
            }
        }
        return results;
    } finally {
        schedulerTicking = false;
    }
};
