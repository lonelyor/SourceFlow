import {runAssistantFeature} from "../assistant/runtime";

const loadAssistantSkillMenuModule = () => import("../assistant/skills/menu");

export const AIActions = (elements: Element[], protyle: IProtyle) => {
    const range = protyle.toolbar.range?.cloneRange() || (getSelection().rangeCount > 0 ? getSelection().getRangeAt(0).cloneRange() : null);
    const fallbackSelectionText = elements.map((item) => item.textContent || "").map((item) => item.trim()).filter(Boolean).join("\n\n");
    const rect = elements[elements.length - 1].getBoundingClientRect();
    runAssistantFeature("selection:assistant-menu", loadAssistantSkillMenuModule, ({openAssistantSkillMenu}) => {
        openAssistantSkillMenu({
            placement: "selection",
            protyle,
            range,
            fallbackSelectionText,
            x: rect.left,
            y: rect.bottom,
            h: rect.height,
        });
    });
};
