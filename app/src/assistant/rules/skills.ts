import {Dialog} from "../../dialog";
import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {getAssistantSkillDefinition, listAssistantSkills} from "../skills/registry";
import type {App} from "../../index";
import type {TAssistantSkillAction, TAssistantSkillId} from "../skills/types";

// 自动化规则期二：技能动作（runSkill）的前端执行器（plans/20260915-自动化规则系统设计.md §4/§6）。
// 边界：技能动作不进后端 rules/run 批量任务——技能产出 patch 走前端补丁审阅；
// 这里提供技能下拉数据源（note 级、产出可审阅的技能）与逐篇顺序执行器（逐篇确认）。

export interface IAssistantRuleSkillOption {
    id: TAssistantSkillId;
    label: string;
}

export interface IAssistantRuleSkillRunOutcome {
    total: number;
    ran: number;
    stopped: boolean;
}

// 自动化逐篇执行要求每篇都有可审阅的产出：排除不产出补丁的会话/捕获类技能。
const RULE_SKILL_EXCLUDED_ACTIONS: TAssistantSkillAction[] = ["chat", "capture-task", "capture-event"];
const RULE_SKILL_EXCLUDED_IDS = new Set<string>(["ask-ai"]);

export const getAssistantRuleSkillOptions = (): IAssistantRuleSkillOption[] => {
    return listAssistantSkills("note")
        .filter((skill) => !RULE_SKILL_EXCLUDED_IDS.has(skill.id) && !RULE_SKILL_EXCLUDED_ACTIONS.includes(skill.action))
        .map((skill) => ({id: skill.id, label: skill.label}));
};

export const getAssistantRuleSkillLabel = (skillId: string): string => {
    return getAssistantSkillDefinition(skillId as TAssistantSkillId)?.label || skillId;
};

// runAssistantSkill 以 protyle 为上下文来源；对未打开的目标文档构造最小 protyle 桩——
// getNoteContextFromProtyle 只读取 block.rootID/id，笔记上下文由后端 API 按文档 ID 构建。
export const buildAssistantRuleTargetProtyle = (rootID: string): IProtyle => {
    const target = `${rootID || ""}`.trim();
    return {
        block: {id: target, rootID: target},
    } as unknown as IProtyle;
};

// 逐篇确认弹窗：继续 / 停止；弹窗被直接关闭（右上角/ESC）时按停止处理，绝不悬挂执行流。
const confirmNextRuleSkillTarget = (done: number, total: number, skillLabel: string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
        };
        const dialog = new Dialog({
            title: assistantText("运行规则技能", "Run Rule Skill"),
            width: "460px",
            content: `<div class="b3-dialog__content">
    <div class="ft__breakword">${assistantText(`已完成 ${done}/${total} 篇「${skillLabel}」，产出已进入补丁审阅。`, `Finished ${done}/${total} note(s) of "${skillLabel}"; each output has opened for patch review.`)}</div>
    <div class="ft__secondary ft__smaller" style="margin-top: 4px;">${assistantText("继续运行下一篇？审阅完成前也可先停止。", "Continue with the next note? You can also stop before reviewing.")}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-action="assistant-rule-skill-stop">${assistantText("停止", "Stop")}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" data-action="assistant-rule-skill-next">${assistantText("继续下一篇", "Run Next Note")}</button>
</div>`,
            destroyCallback: () => settle(false),
        });
        dialog.element.addEventListener("click", (event) => {
            const action = (event.target as HTMLElement).closest("[data-action]")?.getAttribute("data-action");
            if (action === "assistant-rule-skill-next") {
                settle(true);
                dialog.destroy();
                return;
            }
            if (action === "assistant-rule-skill-stop") {
                settle(false);
                dialog.destroy();
            }
        });
    });
};

// 逐篇顺序执行：每篇以该目标文档为上下文运行技能，产出直接弹既有补丁审阅；
// 篇与篇之间弹「继续下一篇」确认（前一篇审阅完成与否由用户把控），停止即中断剩余篇目。
export const runAssistantRuleSkillForTargets = async (options: {
    app?: App;
    skillId: TAssistantSkillId;
    targets: string[];
}): Promise<IAssistantRuleSkillRunOutcome> => {
    const targets = (options.targets || []).map((id) => `${id || ""}`.trim()).filter(Boolean);
    if (!targets.length) {
        return {total: 0, ran: 0, stopped: false};
    }
    if (!getAssistantSkillDefinition(options.skillId)) {
        showMessage(assistantText(`技能不存在或已下线：${options.skillId}`, `Unknown skill: ${options.skillId}`), 6000, "error");
        return {total: targets.length, ran: 0, stopped: false};
    }
    const skillLabel = getAssistantRuleSkillLabel(options.skillId);
    const {runAssistantSkill} = await import("../skills/execute");
    let ran = 0;
    for (const [index, target] of targets.entries()) {
        const ok = await runAssistantSkill({
            app: options.app,
            skillId: options.skillId,
            protyle: buildAssistantRuleTargetProtyle(target),
        });
        if (ok) {
            ran += 1;
        }
        if (index < targets.length - 1) {
            const goOn = await confirmNextRuleSkillTarget(ran, targets.length, skillLabel);
            if (!goOn) {
                return {total: targets.length, ran, stopped: true};
            }
        }
    }
    return {total: targets.length, ran, stopped: false};
};
