import {Menu} from "../../plugin/Menu";
import {Constants} from "../../constants";
import {isMobile} from "../../util/functions";
import {assistantText} from "../constants";
import {escapeAttr, escapeHTML} from "../common/dom";
import {reportAssistantRuntimeError} from "../runtime";
import {assistantSkillGroupOrder, getAssistantSkillGroup, getAssistantSkillGroupLabel, listAssistantSkills} from "./registry";
import type {IAssistantSkillDefinition} from "./types";
import {TAssistantSkillPlacement} from "./types";

const loadAssistantResultsModule = () => import("../results/ResultsDock");
const loadAssistantSkillExecuteModule = () => import("./execute");
const loadAssistantStudioModule = () => import("../studio/sourceFlow");

interface IOpenAssistantSkillMenuOptions {
    placement: TAssistantSkillPlacement;
    protyle: IProtyle;
    range?: Range | null;
    fallbackSelectionText?: string;
    x: number;
    y: number;
    h?: number;
}

const buildAssistantSkillGridHTML = (skills: IAssistantSkillDefinition[]) => {
    return skills.map((skill) => `
        <button type="button" class="assistant-skill-menu__button" data-skill-id="${escapeAttr(skill.id)}">
            <span class="assistant-skill-menu__button-label">${escapeHTML(skill.shortLabel)}</span>
            <span class="assistant-skill-menu__button-meta">${escapeHTML(skill.description)}</span>
        </button>`).join("");
};

// I8: group skills into labeled sections so the menu is scannable instead of a
// flat wall of 13–19 buttons.
const buildAssistantSkillGroupsHTML = (skills: IAssistantSkillDefinition[]) => {
    return assistantSkillGroupOrder.map((group) => {
        const groupSkills = skills.filter((skill) => getAssistantSkillGroup(skill.id) === group);
        if (!groupSkills.length) {
            return "";
        }
        return `<div class="assistant-skill-menu__group">
    <div class="assistant-skill-menu__group-title">${escapeHTML(getAssistantSkillGroupLabel(group))}</div>
    <div class="assistant-skill-menu__grid">${buildAssistantSkillGridHTML(groupSkills)}</div>
</div>`;
    }).join("");
};

export const openAssistantSkillMenu = (options: IOpenAssistantSkillMenuOptions) => {
    window.sourceflow.menus.menu.remove();
    const menu = new Menu(`${Constants.MENU_AI}-${options.placement}`);
    const skills = listAssistantSkills(options.placement);
    const askSkill = skills.find((skill) => skill.id === "ask-ai");
    const groupedSkills = skills.filter((skill) => skill.id !== "ask-ai");
    menu.addItem({
        iconHTML: "",
        type: "empty",
        label: `<div class="assistant-skill-menu">
    <div class="assistant-skill-menu__title">${escapeHTML(options.placement === "selection" ? assistantText("对当前内容执行能力", "Run skills on the current content") : assistantText("对当前笔记执行能力", "Run skills on the current note"))}</div>
    <input class="b3-text-field assistant-skill-menu__search" data-role="skill-search" placeholder="${escapeAttr(assistantText("搜索能力…", "Search skills…"))}">
    ${askSkill ? `<div class="assistant-skill-menu__grid assistant-skill-menu__grid--ask"><button type="button" class="assistant-skill-menu__button assistant-skill-menu__button--ask" data-skill-id="${escapeAttr(askSkill.id)}"><span class="assistant-skill-menu__button-label">${escapeHTML(askSkill.shortLabel)}</span><span class="assistant-skill-menu__button-meta">${escapeHTML(askSkill.description)}</span></button></div>` : ""}
    <div class="assistant-skill-menu__groups" data-role="skill-groups">${buildAssistantSkillGroupsHTML(groupedSkills)}</div>
    <div class="assistant-skill-menu__footer fn__flex" style="justify-content: space-between;align-items: center;gap: 8px;">
        <span>${escapeHTML(assistantText("常用能力直接触发，复杂需求再进入聊天。", "Use direct skills first, and fall back to chat only for complex tasks."))}</span>
        <span class="fn__flex" style="gap: 8px;">
            <button type="button" class="b3-button b3-button--outline" data-action="open-studio">${escapeHTML(assistantText("来源创作", "Source Studio"))}</button>
            <button type="button" class="b3-button b3-button--outline" data-action="open-results">${escapeHTML(assistantText("成果侧栏", "Results Sidebar"))}</button>
        </span>
    </div>
</div>`,
        bind(element) {
            const groupsEl = element.querySelector("[data-role='skill-groups']");
            const searchEl = element.querySelector("[data-role='skill-search']");
            searchEl?.addEventListener("input", () => {
                if (!groupsEl) {
                    return;
                }
                const query = (searchEl instanceof HTMLInputElement ? searchEl.value : "").trim().toLowerCase();
                const filtered = !query ? groupedSkills : groupedSkills.filter((skill) => `${skill.shortLabel} ${skill.description} ${skill.id}`.toLowerCase().includes(query));
                groupsEl.innerHTML = buildAssistantSkillGroupsHTML(filtered);
            });
            element.addEventListener("click", (event) => {
                let target = event.target as HTMLElement;
                while (target && !target.isEqualNode(element)) {
                    const action = target.getAttribute("data-action");
                    const skillId = target.getAttribute("data-skill-id");
                    if (action === "open-results") {
                        void loadAssistantResultsModule().then(({openAssistantResultsDock}) => {
                            openAssistantResultsDock();
                        }).catch((error) => {
                            reportAssistantRuntimeError("skill-menu:open-results", error);
                        });
                        menu.close();
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    if (action === "open-studio") {
                        void loadAssistantStudioModule().then(({openAssistantSourceStudio}) => {
                            openAssistantSourceStudio(options.protyle.app);
                        }).catch((error) => {
                            reportAssistantRuntimeError("skill-menu:open-studio", error);
                        });
                        menu.close();
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    if (skillId) {
                        void loadAssistantSkillExecuteModule().then(({runAssistantSkill}) => {
                            return runAssistantSkill({
                                skillId: skillId as never,
                                protyle: options.protyle,
                                range: options.range,
                                fallbackSelectionText: options.fallbackSelectionText,
                            });
                        }).catch((error) => {
                            reportAssistantRuntimeError(`skill-menu:${skillId}`, error);
                        });
                        menu.close();
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    target = target.parentElement;
                }
            });
        },
    });
    menu.element.querySelector(".b3-menu__items").setAttribute("style", "overflow: initial");
    if (isMobile()) {
        menu.fullscreen();
        return;
    }
    menu.open({
        x: options.x,
        y: options.y,
        h: options.h || 0,
    });
};
