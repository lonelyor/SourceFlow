import {setLastNodeRange} from "../protyle/util/selection";
import {insertHTML} from "../protyle/util/insertHTML";
import {getContenteditableElement} from "../protyle/wysiwyg/getBlock";
import {blockRender} from "../protyle/render/blockRender";
import {processRender} from "../protyle/util/processCode";
import {highlightRender} from "../protyle/render/highlightRender";
import {runAssistantFeature} from "../assistant/runtime";

const loadAssistantSkillMenuModule = () => import("../assistant/skills/menu");

export const fillContent = (protyle: IProtyle, data: string, elements: Element[]) => {
    if (!data) {
        return;
    }
    setLastNodeRange(getContenteditableElement(elements[elements.length - 1]), protyle.toolbar.range);
    protyle.toolbar.range.collapse(true);
    insertHTML(protyle.lute.SpinBlockDOM(data), protyle, true, true);
    blockRender(protyle, protyle.wysiwyg.element);
    processRender(protyle.wysiwyg.element);
    highlightRender(protyle.wysiwyg.element);
};

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
