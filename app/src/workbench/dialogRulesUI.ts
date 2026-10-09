import {Dialog} from "../dialog";
import {showMessage} from "../dialog/message";
import {confirmDialog} from "../dialog/confirmDialog";
import {App} from "../index";
import {
    buildAssistantRuleBackendActions,
    getAssistantRuleSkillActionId,
    resolveAssistantRuleRunMode,
    runAssistantRule,
    validateAssistantRule,
} from "../assistant/rules/api";
import {
    getAssistantRuleSkillLabel,
    getAssistantRuleSkillOptions,
    runAssistantRuleSkillForTargets,
} from "../assistant/rules/skills";
import type {TAssistantSkillId} from "../assistant/skills/types";
import {
    initAssistantRulesEventTrigger,
    isAssistantRulesEventTriggerEnabled,
    setAssistantRulesEventTriggerEnabled,
} from "../assistant/rules/triggers";
import {
    IWorkbenchRule,
    IWorkbenchRuleSchedule,
    IWorkbenchState,
    TWorkbenchRuleActionId,
    WORKBENCH_RULE_ACTION_IDS,
    WORKBENCH_RULE_SKILL_ACTION_ID,
    WORKBENCH_RULE_SCHEDULE_TIME_PATTERN,
    escapeAttr,
    escapeHTML,
    normalizeWorkbenchRuleSchedule,
    openWorkbenchAssistantDock,
    saveState,
    splitWorkbenchRuleActions,
    normalizeWorkbenchRules,
} from "./dialogShared";
import {IWorkbenchItem} from "./constants";
import {getCurrentRootID} from "./dialogBinding";

// 工作台规则（自动化）UI：规则列表/编辑（含语义动作）+ 「运行…」三步流程（选范围 → 看预览 → 确认）。
// 规则存储沿用 workbench 既有 state.rules；动作 actions 里语义 actionId 与旧属性键并存（向后兼容）。

const ruleText = (zh: string, en: string) => window.sourceflow.config.lang === "zh_CN" ? zh : en;

interface IWorkbenchRuleActionMeta {
    label: string;
    hint: string;
}

// 编辑器可配置的动作：期一语义动作 + 期二技能动作（runSkill，前端执行器语义）。
export type TWorkbenchRuleEditableActionId = TWorkbenchRuleActionId | typeof WORKBENCH_RULE_SKILL_ACTION_ID;

const WORKBENCH_RULE_ACTION_META: Record<TWorkbenchRuleEditableActionId, IWorkbenchRuleActionMeta> = {
    setAttrs: {
        label: "设置属性",
        hint: "格式：属性=值，多个用 ; 分隔，如 tags=会议; custom-workbench-status=todo",
    },
    moveToPath: {
        label: "移动到路径",
        hint: "目标文档路径，如 {{notebook}}/会议记录",
    },
    appendContent: {
        label: "追加内容",
        hint: "要追加的模板片段文本",
    },
    toInbox: {
        label: "推入收件箱",
        hint: "true 移入收件箱 / false 移出收件箱",
    },
    runSkill: {
        label: "运行技能",
        hint: "选择一篇笔记级技能；运行时逐篇执行，产出进入补丁审阅（不进后端批量任务）",
    },
};

const WORKBENCH_RULE_PLACEHOLDER_HINT = ruleText(
    "可用占位符：{{title}} 标题、{{notebook}} 笔记本、{{path}} 路径，运行时按目标笔记展开。",
    "Placeholders: {{title}} title, {{notebook}} notebook, {{path}} path — expanded per target note at run time.",
);

const WORKBENCH_RULE_MATCH_TYPE_OPTIONS = ["*", "doc", "note", "url", "task", "event", "project", "attachment"] as const;

export const getWorkbenchRuleActionMeta = (actionId: TWorkbenchRuleEditableActionId): IWorkbenchRuleActionMeta => {
    return WORKBENCH_RULE_ACTION_META[actionId] || WORKBENCH_RULE_ACTION_META.setAttrs;
};

export const describeWorkbenchRuleConditions = (rule: IWorkbenchRule): string => {
    const parts: string[] = [];
    if (rule.matchKind !== "*") {
        parts.push(ruleText(`类型 ${rule.matchKind}`, `kind ${rule.matchKind}`));
    }
    if (rule.matchType !== "*") {
        parts.push(ruleText(`对象 ${rule.matchType}`, `type ${rule.matchType}`));
    }
    if (rule.titleIncludes) {
        parts.push(ruleText(`标题含「${rule.titleIncludes}」`, `title~"${rule.titleIncludes}"`));
    }
    if (rule.notebookIncludes) {
        parts.push(ruleText(`笔记本含「${rule.notebookIncludes}」`, `notebook~"${rule.notebookIncludes}"`));
    }
    if (rule.projectIncludes) {
        parts.push(ruleText(`项目含「${rule.projectIncludes}」`, `project~"${rule.projectIncludes}"`));
    }
    if (rule.tagIncludes) {
        parts.push(ruleText(`标签含「${rule.tagIncludes}」`, `tag~"${rule.tagIncludes}"`));
    }
    if (rule.inbox) {
        parts.push(rule.inbox === "true" ? ruleText("在收件箱", "inbox") : ruleText("不在收件箱", "not inbox"));
    }
    return parts.length ? parts.join(ruleText("、", ", ")) : ruleText("无条件（全部命中）", "no conditions (match all)");
};

export const describeWorkbenchRuleActions = (rule: IWorkbenchRule): string => {
    const {semantic, attrs, skill} = splitWorkbenchRuleActions(rule.actions || {});
    const parts = Object.entries(semantic).map(([actionId, params]) => {
        const meta = getWorkbenchRuleActionMeta(actionId as TWorkbenchRuleActionId);
        return `${meta.label}: ${params}`;
    });
    if (skill[WORKBENCH_RULE_SKILL_ACTION_ID]) {
        parts.push(`${getWorkbenchRuleActionMeta(WORKBENCH_RULE_SKILL_ACTION_ID).label}: ${getAssistantRuleSkillLabel(skill[WORKBENCH_RULE_SKILL_ACTION_ID])}`);
    }
    if (Object.keys(attrs).length) {
        parts.push(ruleText(`属性设置 ×${Object.keys(attrs).length}`, `${Object.keys(attrs).length} attr(s)`));
    }
    return parts.join(ruleText("；", "; ")) || ruleText("未配置动作", "no actions");
};

// 定时运行的描述文案（列表 chip 用）：诚实口径随行展示。
export const describeWorkbenchRuleSchedule = (schedule?: IWorkbenchRuleSchedule): string => {
    const normalized = normalizeWorkbenchRuleSchedule(schedule);
    if (!normalized) {
        return "";
    }
    if (normalized.kind === "interval") {
        return ruleText(`每 ${normalized.everyHours} 小时`, `every ${normalized.everyHours}h`);
    }
    return ruleText(`每天 ${normalized.atTime}`, `daily at ${normalized.atTime}`);
};

// 定时参数控件随模式整体换行（语义不同不做值迁移，同动作行惯例）：interval=1-24 整数小时，daily=HH:MM。
export const renderWorkbenchRuleScheduleParam = (schedule?: IWorkbenchRuleSchedule): string => {
    const normalized = normalizeWorkbenchRuleSchedule(schedule);
    if (normalized?.kind === "daily") {
        return `<input id="workbenchRuleScheduleParam" class="b3-text-field fn__block" type="time" value="${escapeAttr(normalized.atTime || "")}">`;
    }
    return `<input id="workbenchRuleScheduleParam" class="b3-text-field fn__block" type="number" min="1" max="24" step="1" spellcheck="false" value="${escapeAttr(normalized?.kind === "interval" ? `${normalized.everyHours}` : "24")}">`;
};

export const renderWorkbenchRuleActionRow = (actionId: TWorkbenchRuleEditableActionId = "setAttrs", params = "") => {
    const options = [...WORKBENCH_RULE_ACTION_IDS, WORKBENCH_RULE_SKILL_ACTION_ID as TWorkbenchRuleEditableActionId].map((id) => {
        const meta = getWorkbenchRuleActionMeta(id);
        return `<option value="${id}" ${id === actionId ? "selected" : ""}>${escapeHTML(meta.label)}</option>`;
    }).join("");
    // 技能动作的参数是技能 id：用技能下拉（note 级、产出可审阅）替代文本输入，显示技能 label。
    const paramsControl = actionId === WORKBENCH_RULE_SKILL_ACTION_ID
        ? renderWorkbenchRuleSkillSelect(params)
        : `<input class="b3-text-field fn__flex-1 workbench-rule-action-params" spellcheck="false" value="${escapeAttr(params)}" placeholder="${escapeAttr(WORKBENCH_RULE_PLACEHOLDER_HINT)}">`;
    return `<div class="fn__flex workbench-rule-action-row" style="gap: 8px;align-items: center;margin-bottom: 8px;" data-params-hint="${escapeAttr(getWorkbenchRuleActionMeta(actionId).hint)}">
    <select class="b3-select workbench-rule-action-id" style="max-width: 150px;">${options}</select>
    ${paramsControl}
    <button class="b3-button b3-button--outline b3-button--small" data-action="workbench-rule-action-remove">${escapeHTML(ruleText("移除", "Remove"))}</button>
</div>`;
};

const renderWorkbenchRuleSkillSelect = (params = "") => {
    const skills = getAssistantRuleSkillOptions();
    const known = skills.some((skill) => skill.id === params);
    const options = (params && !known
        ? [`<option value="${escapeAttr(params)}" selected>${escapeHTML(getAssistantRuleSkillLabel(params))}</option>`]
        : []).concat(skills.map((skill) =>
        `<option value="${escapeAttr(skill.id)}" ${skill.id === params ? "selected" : ""}>${escapeHTML(skill.label)}</option>`));
    if (!options.length) {
        options.push(`<option value="">${escapeHTML(ruleText("（无可用技能）", "(no skills available)"))}</option>`);
    }
    return `<select class="b3-select fn__flex-1 workbench-rule-action-skill">${options.join("")}</select>`;
};

export const renderWorkbenchRulesCard = (state: {rules: IWorkbenchRule[]}, options: {selectedCount: number}) => {
    const masterOn = isAssistantRulesEventTriggerEnabled();
    const rules = state.rules || [];
    const rows = rules.map((rule) => {
        return `<div class="fn__flex-column workbench-rule-item" style="gap: 2px;padding: 8px 0;border-bottom: 1px solid var(--b3-border-color);">
    <div class="fn__flex" style="gap: 8px;align-items: center;flex-wrap: wrap;">
        <strong>${escapeHTML(rule.name)}</strong>
        ${rule.enabled === false ? `<span class="ft__secondary">${escapeHTML(ruleText("已停用", "disabled"))}</span>` : ""}
        ${rule.eventTrigger === true ? `<span class="b3-chip">${escapeHTML(ruleText("文档事件触发", "doc event trigger"))}</span>` : ""}
        ${describeWorkbenchRuleSchedule(rule.schedule) ? `<span class="b3-chip">${escapeHTML(ruleText("定时", "schedule"))} ${escapeHTML(describeWorkbenchRuleSchedule(rule.schedule))}</span>` : ""}
        <span class="fn__flex-1"></span>
        <button class="b3-button b3-button--outline b3-button--small" data-action="workbench-rule-run" data-rule="${escapeAttr(rule.name)}">${escapeHTML(ruleText("运行…", "Run…"))}</button>
        <button class="b3-button b3-button--outline b3-button--small" data-action="workbench-rule-edit" data-rule="${escapeAttr(rule.name)}">${escapeHTML(ruleText("编辑", "Edit"))}</button>
        <button class="b3-button b3-button--outline b3-button--small" data-action="workbench-rule-delete" data-rule="${escapeAttr(rule.name)}">${escapeHTML(ruleText("删除", "Delete"))}</button>
    </div>
    <div class="ft__secondary ft__smaller">${escapeHTML(ruleText("条件：", "When: ")).trim()}${escapeHTML(describeWorkbenchRuleConditions(rule))}</div>
    <div class="ft__secondary ft__smaller">${escapeHTML(ruleText("动作：", "Then: ")).trim()}${escapeHTML(describeWorkbenchRuleActions(rule))}</div>
    <label class="fn__flex ft__smaller" style="gap: 6px;align-items: center;">
        <input type="checkbox" class="b3-switch b3-switch--small" data-action="workbench-rule-toggle-event" data-rule="${escapeAttr(rule.name)}" ${rule.eventTrigger === true ? "checked" : ""}>
        <span>${escapeHTML(ruleText("文档事件触发（文档创建/更新时自动运行）", "Doc event trigger (run automatically on doc create/update)"))}</span>
    </label>
</div>`;
    }).join("");
    return `<details class="workbench-rules-section" style="margin-bottom: 12px;">
    <summary class="b3-button b3-button--outline" style="display:inline-flex;cursor:pointer;">${escapeHTML(ruleText("工作台规则", "Workbench Rules"))} <span class="ft__secondary">${rules.length}</span></summary>
    <div class="b3-card" style="padding: 12px;margin-top: 12px;">
        <label class="fn__flex" style="gap: 8px;align-items: center;margin-bottom: 8px;flex-wrap: wrap;">
            <input type="checkbox" class="b3-switch" data-action="workbench-rules-master-trigger" ${masterOn ? "checked" : ""}>
            <span>${escapeHTML(ruleText("自动触发总开关", "Master automation switch"))}</span>
            <span class="ft__secondary ft__smaller">${escapeHTML(ruleText("默认关；开启后文档事件与定时计划自动运行命中规则，L3+ 动作仍进审阅。", "Off by default; when on, matching doc events and schedules run automatically — L3+ actions still go to review."))}</span>
        </label>
        ${rows || `<div class="ft__secondary" style="padding: 4px 0 8px 0;">${escapeHTML(ruleText("还没有规则，先新建一条。", "No rules yet — create one to get started."))}</div>`}
        <div class="fn__flex" style="gap: 8px;align-items: center;flex-wrap: wrap;">
            <button class="b3-button b3-button--outline" data-action="workbench-rule-new">${escapeHTML(ruleText("新建规则", "New Rule"))}</button>
            <button class="b3-button b3-button--outline b3-button--small" data-action="workbench-rules-export">${escapeHTML(ruleText("导出", "Export"))}</button>
            <button class="b3-button b3-button--outline b3-button--small" data-action="workbench-rules-import">${escapeHTML(ruleText("导入", "Import"))}</button>
        </div>
        <span class="ft__secondary ft__smaller" data-role="workbench-rule-selection-count" data-count="${options.selectedCount}" style="margin-inline-start: 8px;">${escapeHTML(ruleText(`当前选中 ${options.selectedCount} 项，可用于「运行…」`, `${options.selectedCount} selected — usable by "Run…"`))}</span>
    </div>
</details>`;
};

interface IWorkbenchRulesClickInput {
    app: App;
    action: string;
    actionTarget: HTMLElement;
    state: IWorkbenchState;
    selected: Set<string>;
    visibleItems: IWorkbenchItem[];
    rerender: (focusQuery?: boolean) => void;
}

const findWorkbenchRule = (state: {rules: IWorkbenchRule[]}, name: string) => {
    const trimmed = `${name || ""}`.trim();
    return (state.rules || []).find((rule) => rule.name === trimmed);
};

const upsertWorkbenchRule = (state: IWorkbenchState, originalName: string, rule: IWorkbenchRule) => {
    const trimmedOriginal = `${originalName || ""}`.trim();
    const rules = (state.rules || []).filter((item) => item.name !== trimmedOriginal && item.name !== rule.name);
    rules.push(rule);
    state.rules = normalizeWorkbenchRules(rules);
    saveState(state);
};

// 定时收集（三控件：开关 + 模式 + 参数）：开关关 → undefined（不定时）；开 → 校验参数并给行内可读
// 错误。归一层（normalizeWorkbenchRuleSchedule）仍会兜底删除非法值，双层防线。
const collectWorkbenchRuleEditorSchedule = (dialogElement: HTMLElement): {schedule?: IWorkbenchRuleSchedule, error?: string} => {
    if ((dialogElement.querySelector("#workbenchRuleScheduleEnabled") as HTMLInputElement)?.checked !== true) {
        return {};
    }
    const kind = `${(dialogElement.querySelector("#workbenchRuleScheduleKind") as HTMLSelectElement)?.value || ""}`.trim();
    const rawParam = `${(dialogElement.querySelector("#workbenchRuleScheduleParam") as HTMLInputElement)?.value || ""}`.trim();
    if (kind === "interval") {
        const everyHours = Number(rawParam);
        if (!Number.isInteger(everyHours) || everyHours < 1 || everyHours > 24) {
            return {error: ruleText("定时间隔需为 1-24 的整数小时", "Schedule interval must be a whole number of hours between 1 and 24")};
        }
        return {schedule: {kind: "interval", everyHours}};
    }
    if (kind === "daily") {
        if (!WORKBENCH_RULE_SCHEDULE_TIME_PATTERN.test(rawParam)) {
            return {error: ruleText("定时时间需为 HH:MM（24 小时制）", "Schedule time must be HH:MM (24-hour)")};
        }
        return {schedule: {kind: "daily", atTime: rawParam}};
    }
    return {error: ruleText("定时模式无效", "Invalid schedule kind")};
};

export const collectWorkbenchRuleEditorRule = (dialogElement: HTMLElement, originalRule?: IWorkbenchRule): {rule?: IWorkbenchRule, error?: string} => {
    const name = (`${(dialogElement.querySelector("#workbenchRuleName") as HTMLInputElement)?.value || ""}`).trim();
    if (!name) {
        return {error: ruleText("规则名称不能为空", "Rule name is required")};
    }
    const semantic: Record<string, string> = {};
    dialogElement.querySelectorAll(".workbench-rule-action-row").forEach((row) => {
        const actionId = `${(row.querySelector(".workbench-rule-action-id") as HTMLSelectElement)?.value || ""}`.trim();
        // 技能动作的参数取自技能下拉，其余动作取自文本输入。
        const skillSelect = row.querySelector(".workbench-rule-action-skill") as HTMLSelectElement | null;
        const params = skillSelect
            ? `${skillSelect.value || ""}`.trim()
            : `${(row.querySelector(".workbench-rule-action-params") as HTMLInputElement)?.value || ""}`.trim();
        const isKnownAction = WORKBENCH_RULE_ACTION_IDS.includes(actionId as TWorkbenchRuleActionId) || actionId === WORKBENCH_RULE_SKILL_ACTION_ID;
        if (!isKnownAction || !params) {
            return;
        }
        semantic[actionId] = params;
    });
    // 旧属性键原样保留：继续按属性设置工作（向后兼容）。
    const legacyAttrs = splitWorkbenchRuleActions(originalRule?.actions || {}).attrs;
    const matchKind = `${(dialogElement.querySelector("#workbenchRuleMatchKind") as HTMLSelectElement)?.value || "*"}`;
    const matchType = `${(dialogElement.querySelector("#workbenchRuleMatchType") as HTMLSelectElement)?.value || "*"}`;
    const inbox = `${(dialogElement.querySelector("#workbenchRuleInbox") as HTMLSelectElement)?.value || ""}`;
    const schedule = collectWorkbenchRuleEditorSchedule(dialogElement);
    if (schedule.error) {
        return {error: schedule.error};
    }
    return {rule: {
        name,
        enabled: (dialogElement.querySelector("#workbenchRuleEnabled") as HTMLInputElement)?.checked !== false,
        matchKind: (matchKind === "doc" || matchKind === "block" ? matchKind : "*") as IWorkbenchRule["matchKind"],
        matchType: matchType as IWorkbenchRule["matchType"],
        titleIncludes: `${(dialogElement.querySelector("#workbenchRuleTitle") as HTMLInputElement)?.value || ""}`.trim(),
        notebookIncludes: `${(dialogElement.querySelector("#workbenchRuleNotebook") as HTMLInputElement)?.value || ""}`.trim(),
        projectIncludes: `${(dialogElement.querySelector("#workbenchRuleProject") as HTMLInputElement)?.value || ""}`.trim(),
        tagIncludes: `${(dialogElement.querySelector("#workbenchRuleTag") as HTMLInputElement)?.value || ""}`.trim(),
        inbox: (inbox === "true" || inbox === "false" ? inbox : "") as IWorkbenchRule["inbox"],
        eventTrigger: (dialogElement.querySelector("#workbenchRuleEventTrigger") as HTMLInputElement)?.checked === true,
        schedule: schedule.schedule,
        actions: {...legacyAttrs, ...semantic},
    }};
};

const renderWorkbenchRuleEditorActionsHTML = (rule?: IWorkbenchRule) => {
    const {semantic, skill} = splitWorkbenchRuleActions(rule?.actions || {});
    const rows = (Object.entries(semantic) as Array<[TWorkbenchRuleActionId, string]>)
        .map(([actionId, params]) => renderWorkbenchRuleActionRow(actionId, params));
    Object.entries(skill).forEach(([skillActionId, params]) => {
        if (skillActionId === WORKBENCH_RULE_SKILL_ACTION_ID) {
            rows.push(renderWorkbenchRuleActionRow(WORKBENCH_RULE_SKILL_ACTION_ID, params));
        }
    });
    const rendered = rows.length ? rows : [renderWorkbenchRuleActionRow()];
    return `${rendered.join("")}
<div class="fn__flex" style="gap: 8px;align-items: center;">
    <button class="b3-button b3-button--outline b3-button--small" data-action="workbench-rule-action-add">${escapeHTML(ruleText("添加动作", "Add Action"))}</button>
    <span class="ft__secondary ft__smaller">${escapeHTML(WORKBENCH_RULE_PLACEHOLDER_HINT)}</span>
</div>`;
};

export const openWorkbenchRuleEditor = (state: IWorkbenchState, ruleName: string | undefined, rerender: (focusQuery?: boolean) => void) => {
    const originalRule = ruleName ? findWorkbenchRule(state, ruleName) : undefined;
    const legacyAttrs = splitWorkbenchRuleActions(originalRule?.actions || {}).attrs;
    const legacyKeys = Object.keys(legacyAttrs);
    const dialog = new Dialog({
        title: originalRule
            ? `${window.sourceflow.languages.workbenchRules} · ${escapeHTML(originalRule.name)}`
            : `${window.sourceflow.languages.workbenchRules} · ${ruleText("新建规则", "New Rule")}`,
        width: "640px",
        content: `<div class="b3-dialog__content">
    <label class="b3-label">
        <div>${escapeHTML(ruleText("名称", "Name"))}</div>
        <input id="workbenchRuleName" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(originalRule?.name || "")}">
    </label>
    <label class="b3-label fn__flex" style="gap: 8px;align-items: center;">
        <input id="workbenchRuleEnabled" class="b3-switch" type="checkbox" ${originalRule?.enabled === false ? "" : "checked"}>
        <span>${escapeHTML(ruleText("启用规则", "Enabled"))}</span>
    </label>
    <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
        <label class="b3-label fn__flex-1">
            <div>${escapeHTML(ruleText("命中范围", "Match kind"))}</div>
            <select id="workbenchRuleMatchKind" class="b3-select fn__block">
                <option value="*" ${originalRule?.matchKind !== "doc" && originalRule?.matchKind !== "block" ? "selected" : ""}>${escapeHTML(ruleText("全部", "All"))}</option>
                <option value="doc" ${originalRule?.matchKind === "doc" ? "selected" : ""}>doc</option>
                <option value="block" ${originalRule?.matchKind === "block" ? "selected" : ""}>block</option>
            </select>
        </label>
        <label class="b3-label fn__flex-1">
            <div>${escapeHTML(ruleText("对象类型", "Object type"))}</div>
            <select id="workbenchRuleMatchType" class="b3-select fn__block">
                ${WORKBENCH_RULE_MATCH_TYPE_OPTIONS.map((type) => `<option value="${type}" ${originalRule?.matchType === type ? "selected" : ""}>${type === "*" ? escapeHTML(ruleText("全部", "All")) : type}</option>`).join("")}
            </select>
        </label>
        <label class="b3-label fn__flex-1">
            <div>${escapeHTML(window.sourceflow.languages.inbox)}</div>
            <select id="workbenchRuleInbox" class="b3-select fn__block">
                <option value="" ${!originalRule?.inbox ? "selected" : ""}>${escapeHTML(ruleText("不限", "Any"))}</option>
                <option value="true" ${originalRule?.inbox === "true" ? "selected" : ""}>${escapeHTML(ruleText("在收件箱", "In inbox"))}</option>
                <option value="false" ${originalRule?.inbox === "false" ? "selected" : ""}>${escapeHTML(ruleText("不在收件箱", "Not in inbox"))}</option>
            </select>
        </label>
    </div>
    <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
        <label class="b3-label fn__flex-1">
            <div>${escapeHTML(ruleText("标题包含", "Title includes"))}</div>
            <input id="workbenchRuleTitle" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(originalRule?.titleIncludes || "")}">
        </label>
        <label class="b3-label fn__flex-1">
            <div>${escapeHTML(ruleText("笔记本包含", "Notebook includes"))}</div>
            <input id="workbenchRuleNotebook" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(originalRule?.notebookIncludes || "")}">
        </label>
    </div>
    <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
        <label class="b3-label fn__flex-1">
            <div>${escapeHTML(ruleText("项目包含", "Project includes"))}</div>
            <input id="workbenchRuleProject" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(originalRule?.projectIncludes || "")}">
        </label>
        <label class="b3-label fn__flex-1">
            <div>${escapeHTML(ruleText("标签包含", "Tag includes"))}</div>
            <input id="workbenchRuleTag" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(originalRule?.tagIncludes || "")}">
        </label>
    </div>
    <label class="b3-label">
        <div>${escapeHTML(ruleText("动作", "Actions"))}</div>
        <div id="workbenchRuleActionRows">${renderWorkbenchRuleEditorActionsHTML(originalRule)}</div>
    </label>
    ${legacyKeys.length ? `<div class="ft__secondary ft__smaller" style="margin-bottom: 8px;">${escapeHTML(ruleText(`旧版属性动作（继续生效）：${legacyKeys.map((key) => `${key}=${legacyAttrs[key]}`).join("；")}`, `Legacy attr actions (still applied): ${legacyKeys.map((key) => `${key}=${legacyAttrs[key]}`).join("; ")}`))}</div>` : ""}
    <label class="b3-label fn__flex" style="gap: 8px;align-items: center;">
        <input id="workbenchRuleEventTrigger" class="b3-switch" type="checkbox" ${originalRule?.eventTrigger === true ? "checked" : ""}>
        <span>${escapeHTML(ruleText("文档事件触发", "Doc event trigger"))}</span>
        <span class="ft__secondary ft__smaller">${escapeHTML(ruleText("默认关；需同时打开规则列表里的总开关。", "Off by default; also requires the master switch in the rules list."))}</span>
    </label>
    <label class="b3-label">
        <div>${escapeHTML(ruleText("定时运行", "Schedule"))}</div>
        <div class="fn__flex" style="gap: 8px;align-items: center;flex-wrap: wrap;">
            <input id="workbenchRuleScheduleEnabled" class="b3-switch" type="checkbox" ${originalRule?.schedule ? "checked" : ""}>
            <select id="workbenchRuleScheduleKind" class="b3-select">
                <option value="interval" ${originalRule?.schedule?.kind !== "daily" ? "selected" : ""}>${escapeHTML(ruleText("每 N 小时", "Every N hours"))}</option>
                <option value="daily" ${originalRule?.schedule?.kind === "daily" ? "selected" : ""}>${escapeHTML(ruleText("每天", "Daily"))}</option>
            </select>
            <span id="workbenchRuleScheduleParamHost" class="fn__flex-1">${renderWorkbenchRuleScheduleParam(originalRule?.schedule)}</span>
        </div>
        <div class="ft__secondary ft__smaller">${escapeHTML(ruleText("仅在 SourceFlow 运行时触发，错过的时点不补跑；需同时打开规则列表里的自动触发总开关。", "Runs only while SourceFlow is running — missed times are not re-run; also turn on the master automation switch in the rules list."))}</div>
    </label>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" id="workbenchRuleCancel">${escapeHTML(window.sourceflow.languages.cancel)}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="workbenchRuleSave">${escapeHTML(window.sourceflow.languages.save)}</button>
</div>`,
    });
    dialog.element.addEventListener("click", (event) => {
        const target = (event.target as HTMLElement).closest("[data-action]") as HTMLElement;
        if (!target) {
            return;
        }
        const action = target.getAttribute("data-action");
        if (action === "workbench-rule-action-add") {
            const container = dialog.element.querySelector("#workbenchRuleActionRows") as HTMLElement;
            container.insertAdjacentHTML("beforeend", renderWorkbenchRuleActionRow());
            return;
        }
        if (action === "workbench-rule-action-remove") {
            const row = target.closest(".workbench-rule-action-row") as HTMLElement;
            row?.remove();
            return;
        }
    });
    dialog.element.addEventListener("change", (event) => {
        const kindSelect = (event.target as HTMLElement).closest("#workbenchRuleScheduleKind") as HTMLSelectElement | null;
        if (kindSelect) {
            // 切换定时模式：参数控件随语义整体换行（小时数 ↔ HH:MM），不做值迁移（同动作行惯例）。
            const host = dialog.element.querySelector("#workbenchRuleScheduleParamHost") as HTMLElement;
            host.innerHTML = renderWorkbenchRuleScheduleParam({kind: kindSelect.value === "daily" ? "daily" : "interval"});
            return;
        }
        const select = (event.target as HTMLElement).closest(".workbench-rule-action-id") as HTMLSelectElement;
        if (!select) {
            return;
        }
        const row = select.closest(".workbench-rule-action-row") as HTMLElement;
        const actionId = `${select.value}`.trim();
        // 进入/离开技能动作：参数控件在技能下拉与文本输入之间整体换行（参数语义不同，不做值迁移）。
        const wasSkillAction = !!row.querySelector(".workbench-rule-action-skill");
        if (actionId === WORKBENCH_RULE_SKILL_ACTION_ID || wasSkillAction) {
            const params = actionId === WORKBENCH_RULE_SKILL_ACTION_ID
                ? `${(row.querySelector(".workbench-rule-action-skill") as HTMLSelectElement)?.value || ""}`
                : "";
            row.outerHTML = renderWorkbenchRuleActionRow(actionId as TWorkbenchRuleEditableActionId, params);
            return;
        }
        row.setAttribute("data-params-hint", getWorkbenchRuleActionMeta(actionId as TWorkbenchRuleEditableActionId).hint);
        (row.querySelector(".workbench-rule-action-params") as HTMLInputElement).placeholder = getWorkbenchRuleActionMeta(actionId as TWorkbenchRuleEditableActionId).hint;
    });
    (dialog.element.querySelector("#workbenchRuleCancel") as HTMLButtonElement).addEventListener("click", () => {
        dialog.destroy();
    });
    (dialog.element.querySelector("#workbenchRuleSave") as HTMLButtonElement).addEventListener("click", () => {
        const collected = collectWorkbenchRuleEditorRule(dialog.element, originalRule);
        if (collected.error || !collected.rule) {
            showMessage(collected.error || ruleText("规则无效", "Invalid rule"), 5000, "error");
            return;
        }
        upsertWorkbenchRule(state, originalRule?.name || "", collected.rule);
        dialog.destroy();
        rerender(true);
        showMessage(window.sourceflow.languages.workbenchSaved);
    });
};

interface IWorkbenchRuleRunInput {
    app?: App;
    rule: IWorkbenchRule;
    selected: Set<string>;
    visibleItems: IWorkbenchItem[];
}

const renderWorkbenchRuleRunTargetsHTML = (input: IWorkbenchRuleRunInput) => {
    const selectedItems = input.visibleItems.filter((item) => input.selected.has(item.id));
    const rootID = getCurrentRootID();
    return `<div class="fn__flex-column" style="gap: 8px;">
    <label class="fn__flex" style="gap: 8px;align-items: center;">
        <input type="radio" name="workbenchRuleRunTarget" value="selection" ${selectedItems.length ? "" : "disabled"}>
        <span>${escapeHTML(ruleText(`当前工作台选中项（${selectedItems.length}）`, `Current workbench selection (${selectedItems.length})`))}</span>
    </label>
    <label class="fn__flex" style="gap: 8px;align-items: center;">
        <input type="radio" name="workbenchRuleRunTarget" value="current" ${rootID ? "checked" : "disabled"}>
        <span>${escapeHTML(ruleText("当前笔记", "Current note"))}</span>
    </label>
</div>`;
};

const collectWorkbenchRuleRunTargets = (dialogElement: HTMLElement, input: IWorkbenchRuleRunInput): string[] => {
    const checked = dialogElement.querySelector('input[name="workbenchRuleRunTarget"]:checked') as HTMLInputElement | null;
    if (!checked || checked.disabled) {
        return [];
    }
    if (checked.value === "selection") {
        return input.visibleItems.filter((item) => input.selected.has(item.id)).map((item) => item.id);
    }
    const rootID = getCurrentRootID();
    return rootID ? [rootID] : [];
};

export const openWorkbenchRuleRunDialog = (rule: IWorkbenchRule, input: IWorkbenchRuleRunInput) => {
    const runInput = input;
    // 期二边界：技能动作（runSkill）不进后端批量任务——payload 构建时已剔除；
    // 这里拆分执行流：先跑后端批量（若有），再逐篇运行技能（产出逐篇进补丁审阅）。
    const hasBackendActions = Object.keys(buildAssistantRuleBackendActions(rule)).length > 0;
    const skillId = getAssistantRuleSkillActionId(rule);
    const hasSkillAction = !!skillId;
    const skillLabel = hasSkillAction ? getAssistantRuleSkillLabel(skillId) : "";
    const dialog = new Dialog({
        title: `${window.sourceflow.languages.workbenchRules} · ${escapeHTML(ruleText("运行", "Run"))} ${escapeHTML(rule.name)}`,
        width: "560px",
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword" id="workbenchRuleRunBody">${renderWorkbenchRuleRunTargetsHTML(runInput)}</div>
    <div class="ft__secondary ft__smaller" style="margin-top: 8px;">${escapeHTML(ruleText("先预览每篇笔记将执行的动作，确认后才执行；L3+ 动作与技能产出仍需逐项审阅。", "Preview what each note will do before running; L3+ actions and skill outputs still require item-by-item review."))}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" id="workbenchRuleRunCancel">${escapeHTML(window.sourceflow.languages.cancel)}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="workbenchRuleRunNext">${escapeHTML(ruleText("下一步", "Next"))}</button>
</div>`,
    });
    const cancelButton = dialog.element.querySelector("#workbenchRuleRunCancel") as HTMLButtonElement;
    cancelButton.addEventListener("click", () => {
        dialog.destroy();
    });
    const nextButton = dialog.element.querySelector("#workbenchRuleRunNext") as HTMLButtonElement;
    const runBody = dialog.element.querySelector("#workbenchRuleRunBody") as HTMLElement;
    let targets: string[] = [];
    const finishRun = (lines: string[], openAgentPanel: boolean) => {
        runBody.innerHTML = `<div class="fn__flex-column" style="gap: 6px;">${lines.join("")}</div>`;
        nextButton.textContent = openAgentPanel ? ruleText("打开 Agent 面板", "Open Agent Panel") : window.sourceflow.languages.close;
        nextButton.dataset.phase = openAgentPanel ? "done" : "close";
        nextButton.removeAttribute("disabled");
    };
    nextButton.addEventListener("click", async () => {
        if (nextButton.dataset.phase === "done") {
            dialog.destroy();
            openWorkbenchAssistantDock({});
            return;
        }
        if (nextButton.dataset.phase === "close") {
            dialog.destroy();
            return;
        }
        if (!targets.length) {
            targets = collectWorkbenchRuleRunTargets(dialog.element, runInput);
            if (!targets.length) {
                showMessage(ruleText("请先选择运行范围（选中工作台条目或打开一篇笔记）", "Pick a scope first — select workbench items or open a note"), 5000, "error");
                return;
            }
            if (!hasBackendActions && !hasSkillAction) {
                showMessage(ruleText("预览为空：没有可执行的动作", "Empty preview: nothing to execute"), 5000, "error");
                return;
            }
            nextButton.setAttribute("disabled", "disabled");
            try {
                let backendSection = "";
                if (hasBackendActions) {
                    const mode = await resolveAssistantRuleRunMode();
                    const summaries = await validateAssistantRule(rule, targets, mode);
                    if (!summaries.length && !hasSkillAction) {
                        nextButton.removeAttribute("disabled");
                        showMessage(ruleText("预览为空：没有可执行的动作", "Empty preview: nothing to execute"), 5000, "error");
                        return;
                    }
                    if (summaries.length) {
                        backendSection = `<div class="ft__secondary" style="margin-bottom: 8px;">${escapeHTML(ruleText(`将对 ${targets.length} 篇执行：`, `Will apply to ${targets.length} note(s):`))}</div>
<div class="fn__flex-column" style="gap: 6px;max-height: 320px;overflow: auto;">
    ${summaries.map((item) => `<div class="fn__flex-column" style="gap: 2px;">
        <strong class="ft__smaller">${escapeHTML(item.title || item.id)}</strong>
        <span class="ft__secondary ft__smaller">${escapeHTML(item.summary)}</span>
    </div>`).join("")}
</div>`;
                    }
                }
                const skillSection = hasSkillAction
                    ? `<div class="fn__flex-column" style="gap: 2px;margin-top: ${backendSection ? "12px" : "0"};">
    <strong class="ft__smaller">${escapeHTML(ruleText(`技能动作：${skillLabel}`, `Skill action: ${skillLabel}`))}</strong>
    <span class="ft__secondary ft__smaller">${escapeHTML(ruleText(`对 ${targets.length} 篇逐篇运行，每篇产出直接进入补丁审阅，逐篇确认。`, `Runs across ${targets.length} note(s) one by one — each output opens for patch review with a per-note confirm.`))}</span>
</div>`
                    : "";
                runBody.innerHTML = `<div class="ft__breakword">${backendSection}${skillSection}</div>`;
                nextButton.textContent = ruleText("确认运行", "Confirm Run");
                nextButton.dataset.phase = "confirm";
                nextButton.removeAttribute("disabled");
                return;
            } catch (error) {
                nextButton.removeAttribute("disabled");
                showMessage(`${ruleText("预览失败", "Preview failed")}: ${error instanceof Error ? error.message : `${error}`}`, 7000, "error");
                return;
            }
        }
        if (nextButton.dataset.phase !== "confirm") {
            return;
        }
        nextButton.setAttribute("disabled", "disabled");
        try {
            const lines: string[] = [];
            let taskId = "";
            if (hasBackendActions) {
                // 后端批量先跑：payload 里 runSkill 已剔除，纯后端动作照旧走 Agent 任务。
                const mode = await resolveAssistantRuleRunMode();
                const result = await runAssistantRule(rule, targets, mode);
                taskId = result.taskId;
                lines.push(`<strong>${escapeHTML(ruleText(`已创建任务 ${result.itemCount} 项，在 Agent 面板审阅。`, `Task created with ${result.itemCount} item(s) — review it in the Agent panel.`))}</strong>`);
                if (result.taskId) {
                    lines.push(`<span class="ft__secondary ft__smaller">taskId: ${escapeHTML(result.taskId)}</span>`);
                }
            }
            if (hasSkillAction) {
                showMessage(ruleText("技能动作将逐篇在前端审阅执行", "Skill actions run note-by-note with front-end review"), 5000);
                const outcome = await runAssistantRuleSkillForTargets({app: runInput.app, skillId: skillId as TAssistantSkillId, targets});
                lines.push(`<strong>${escapeHTML(outcome.stopped
                    ? ruleText(`已停止：技能「${skillLabel}」完成 ${outcome.ran}/${outcome.total} 篇。`, `Stopped: skill "${skillLabel}" finished ${outcome.ran}/${outcome.total} note(s).`)
                    : ruleText(`技能「${skillLabel}」已逐篇运行 ${outcome.ran}/${outcome.total} 篇，产出经补丁审阅应用。`, `Skill "${skillLabel}" ran on ${outcome.ran}/${outcome.total} note(s); outputs went through patch review.`))}</strong>`);
            }
            finishRun(lines, !!taskId);
        } catch (error) {
            nextButton.removeAttribute("disabled");
            showMessage(`${ruleText("运行失败", "Run failed")}: ${error instanceof Error ? error.message : `${error}`}`, 7000, "error");
        }
    });
};

// --- 规则导入导出（期二）：{version:1, exportedAt, rules:[...]} JSON，一键下载 / 选文件导入。 ---

export const getAssistantRulesExportFileName = (date = new Date()): string =>
    `sourceflow-rules-${date.toISOString().slice(0, 10)}.json`;

export const buildAssistantRulesExportPayload = (rules: IWorkbenchRule[], exportedAt = new Date().toISOString()): string =>
    `${JSON.stringify({version: 1, exportedAt, rules: normalizeWorkbenchRules(rules || [])}, null, "\t")}\n`;

const downloadAssistantRulesFile = (fileName: string, content: string) => {
    const blob = new Blob([content], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// 导入校验：坏 JSON / 缺 version / 规则形状错（名称非空、actions 为对象）都返回行内可读错误。
export const parseAssistantRulesImportPayload = (text: string): {rules?: IWorkbenchRule[], error?: string} => {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch (_error) {
        return {error: ruleText("不是有效的 JSON 文件", "Not a valid JSON file")};
    }
    const record = (data || {}) as {version?: unknown, rules?: unknown};
    if (record.version !== 1) {
        return {error: ruleText("缺少版本标记（version: 1），不是规则导出文件", "Missing version marker (version: 1) — not a rules export file")};
    }
    if (!Array.isArray(record.rules)) {
        return {error: ruleText("文件里没有规则数组（rules）", "No rules array (rules) found in the file")};
    }
    const rules: IWorkbenchRule[] = [];
    const entries = record.rules as unknown[];
    for (let index = 0; index < entries.length; index++) {
        const candidate = (entries[index] || {}) as {name?: unknown, actions?: unknown};
        const name = `${typeof candidate.name === "string" ? candidate.name : ""}`.trim();
        if (!name) {
            return {error: ruleText(`第 ${index + 1} 条规则缺少名称`, `Rule #${index + 1} is missing a name`)};
        }
        if (!candidate.actions || typeof candidate.actions !== "object" || Array.isArray(candidate.actions)) {
            return {error: ruleText(`规则「${name}」的动作（actions）格式不正确`, `Rule "${name}" has invalid actions`)};
        }
        rules.push({...candidate, name, actions: candidate.actions as Record<string, string | null>} as IWorkbenchRule);
    }
    if (!rules.length) {
        return {error: ruleText("文件里没有可导入的规则", "No importable rules in the file")};
    }
    return {rules};
};

export interface IAssistantRulesImportMerge {
    rules: IWorkbenchRule[];
    added: number;
    renamed: Array<{from: string, to: string}>;
}

// 追加：保留现有规则，重名自动加「 (2)」式后缀；替换：覆盖全部现有规则。
export const mergeAssistantRulesImport = (existing: IWorkbenchRule[], incoming: IWorkbenchRule[], mode: "append" | "replace"): IAssistantRulesImportMerge => {
    if (mode === "replace") {
        return {rules: normalizeWorkbenchRules(incoming || []), added: (incoming || []).length, renamed: []};
    }
    const renamed: Array<{from: string, to: string}> = [];
    const names = new Set((existing || []).map((rule) => rule.name));
    const rules = [...(existing || [])];
    let added = 0;
    (incoming || []).forEach((raw) => {
        const rule = normalizeWorkbenchRules([raw])[0];
        if (!rule) {
            return;
        }
        // 重复导入同一份文件时，导入名自带「 (N)」后缀会越叠越长；先剥掉再取下一个可用后缀。
        const base = rule.name.replace(/\s*\(\d+\)$/, "").trim() || rule.name;
        let name = rule.name;
        if (names.has(name)) {
            let counter = 2;
            while (names.has(`${base} (${counter})`)) {
                counter += 1;
            }
            name = `${base} (${counter})`;
            renamed.push({from: rule.name, to: name});
        }
        rules.push({...rule, name});
        names.add(name);
        added += 1;
    });
    return {rules: normalizeWorkbenchRules(rules), added, renamed};
};

const openAssistantRulesImportDialog = (state: IWorkbenchState, incoming: IWorkbenchRule[], rerender: (focusQuery?: boolean) => void) => {
    const applyImport = (mode: "append" | "replace") => {
        const {rules, added, renamed} = mergeAssistantRulesImport(state.rules || [], incoming, mode);
        state.rules = rules;
        saveState(state);
        rerender(true);
        const renameNote = renamed.length
            ? ruleText(`，重名自动改名：${renamed.map((item) => `${item.from} → ${item.to}`).join("；")}`, `; renamed duplicates: ${renamed.map((item) => `${item.from} → ${item.to}`).join("; ")}`)
            : "";
        showMessage(ruleText(`已${mode === "append" ? "追加" : "替换"}导入 ${added} 条规则${renameNote}`, `${mode === "append" ? "Appended" : "Replaced with"} ${added} imported rule(s)${renameNote}`));
    };
    const dialog = new Dialog({
        title: window.sourceflow.languages.workbenchRules,
        width: "480px",
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">${escapeHTML(ruleText(`导入 ${incoming.length} 条规则：`, `Import ${incoming.length} rule(s):`))}</div>
    <div class="ft__secondary ft__smaller" style="margin-top: 4px;">${escapeHTML(ruleText("追加：保留现有规则，重名自动加后缀；替换：覆盖全部现有规则。", "Append keeps current rules and renames duplicates with a suffix; Replace overwrites all current rules."))}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" id="assistantRulesImportCancel">${escapeHTML(window.sourceflow.languages.cancel)}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--outline" id="assistantRulesImportReplace">${escapeHTML(ruleText("替换", "Replace"))}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="assistantRulesImportAppend">${escapeHTML(ruleText("追加", "Append"))}</button>
</div>`,
    });
    (dialog.element.querySelector("#assistantRulesImportCancel") as HTMLButtonElement).addEventListener("click", () => {
        dialog.destroy();
    });
    (dialog.element.querySelector("#assistantRulesImportAppend") as HTMLButtonElement).addEventListener("click", () => {
        dialog.destroy();
        applyImport("append");
    });
    (dialog.element.querySelector("#assistantRulesImportReplace") as HTMLButtonElement).addEventListener("click", () => {
        dialog.destroy();
        // 替换是破坏性操作：confirmDialog 二次确认。
        confirmDialog(
            window.sourceflow.languages.workbenchRules,
            ruleText(`替换将覆盖现有 ${(state.rules || []).length} 条规则，确定继续？`, `Replace overwrites the current ${(state.rules || []).length} rule(s). Continue?`),
            () => applyImport("replace"),
        );
    });
};

const openAssistantRulesImportPicker = (state: IWorkbenchState, rerender: (focusQuery?: boolean) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        try {
            const parsed = parseAssistantRulesImportPayload(await file.text());
            if (parsed.error || !parsed.rules) {
                showMessage(parsed.error || ruleText("导入失败：文件格式不正确", "Import failed: invalid file format"), 7000, "error");
                return;
            }
            openAssistantRulesImportDialog(state, parsed.rules, rerender);
        } catch (error) {
            showMessage(`${ruleText("读取文件失败", "Failed to read the file")}: ${error instanceof Error ? error.message : `${error}`}`, 7000, "error");
        }
    });
    input.click();
};

const exportWorkbenchRules = (state: IWorkbenchState) => {
    const rules = state.rules || [];
    if (!rules.length) {
        showMessage(ruleText("还没有可导出的规则", "No rules to export yet"), 5000, "error");
        return;
    }
    downloadAssistantRulesFile(getAssistantRulesExportFileName(), buildAssistantRulesExportPayload(rules));
    showMessage(ruleText(`已导出 ${rules.length} 条规则`, `Exported ${rules.length} rule(s)`));
};

export const handleWorkbenchRulesClick = (input: IWorkbenchRulesClickInput) => {
    const {action, actionTarget, state, selected, visibleItems, rerender} = input;
    if (action === "workbench-rules-master-trigger") {
        const enabled = (actionTarget as HTMLInputElement).checked;
        setAssistantRulesEventTriggerEnabled(enabled);
        if (enabled) {
            initAssistantRulesEventTrigger();
        }
        showMessage(enabled
            ? ruleText("自动触发已开启（总开关，覆盖文档事件与定时计划）", "Automation triggers enabled (master switch, covers doc events and schedules)")
            : ruleText("自动触发已关闭（总开关，覆盖文档事件与定时计划）", "Automation triggers disabled (master switch, covers doc events and schedules)"));
        return;
    }
    const ruleName = actionTarget.getAttribute("data-rule") || "";
    if (action === "workbench-rules-export") {
        exportWorkbenchRules(state);
        return;
    }
    if (action === "workbench-rules-import") {
        openAssistantRulesImportPicker(state, rerender);
        return;
    }
    if (action === "workbench-rule-new") {
        openWorkbenchRuleEditor(state, undefined, rerender);
        return;
    }
    if (action === "workbench-rule-edit") {
        const rule = findWorkbenchRule(state, ruleName);
        if (rule) {
            openWorkbenchRuleEditor(state, rule.name, rerender);
        }
        return;
    }
    if (action === "workbench-rule-delete") {
        const rule = findWorkbenchRule(state, ruleName);
        if (!rule) {
            return;
        }
        confirmDialog(
            window.sourceflow.languages.workbenchRules,
            ruleText(`删除规则「${rule.name}」？`, `Delete rule "${rule.name}"?`),
            () => {
                state.rules = (state.rules || []).filter((item) => item.name !== rule.name);
                saveState(state);
                rerender(true);
                showMessage(ruleText("规则已删除", "Rule deleted"));
            },
            true,
        );
        return;
    }
    if (action === "workbench-rule-toggle-event") {
        const rule = findWorkbenchRule(state, ruleName);
        if (!rule) {
            return;
        }
        rule.eventTrigger = (actionTarget as HTMLInputElement).checked === true;
        state.rules = normalizeWorkbenchRules(state.rules || []);
        saveState(state);
        return;
    }
    if (action === "workbench-rule-run") {
        const rule = findWorkbenchRule(state, ruleName);
        if (!rule) {
            return;
        }
        if (!rule.actions || !Object.keys(rule.actions).length) {
            showMessage(ruleText("该规则还没有配置动作", "This rule has no actions configured"), 5000, "error");
            return;
        }
        openWorkbenchRuleRunDialog(rule, {
            app: input.app,
            rule,
            selected,
            visibleItems: visibleItems.length ? visibleItems : [],
        });
    }
};
