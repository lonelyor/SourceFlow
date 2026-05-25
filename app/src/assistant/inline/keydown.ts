import type {KeydownContext} from "../../protyle/wysiwyg/keydown/shared";
import {openAssistantInlineCommandPanel} from "./commands";

const loadAssistantSkillModule = () => import("../skills/execute");

const isAssistantInlineModifier = (event: KeyboardEvent) => {
    return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && !event.isComposing;
};

export const handleAssistantInlineKeydown = (context: KeydownContext) => {
    const key = `${context.event.key || ""}`.toLowerCase();
    if (!isAssistantInlineModifier(context.event) || (key !== "i" && key !== "j")) {
        return undefined;
    }
    context.event.preventDefault();
    context.event.stopPropagation();
    if (key === "i") {
        openAssistantInlineCommandPanel({
            protyle: context.protyle,
            range: context.range,
        });
        return true;
    }
    void loadAssistantSkillModule().then(({runAssistantSkill}) => runAssistantSkill({
        skillId: "note-continue-writing",
        protyle: context.protyle,
        range: context.range,
    }));
    return true;
};
