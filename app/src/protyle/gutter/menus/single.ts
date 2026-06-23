import {appendClipboardSection} from "./clipboard";
import {appendFooterSections} from "./footer";
import {prepareSingleMenuContext} from "./resolve";
import {appendSpecializedSection} from "./specialized";
import {appendTurnIntoSection} from "./turnInto";

export const renderMenu = (gutterElement: HTMLElement, protyle: IProtyle, buttonElement: Element, gutterTip: string) => {
    void gutterTip;
    const result = prepareSingleMenuContext(gutterElement, protyle, buttonElement);
    if (result.kind === "skip") {
        return;
    }
    if (result.kind === "menu") {
        return window.sourceflow.menus.menu;
    }

    appendTurnIntoSection(result.context);
    appendClipboardSection(result.context);
    appendSpecializedSection(result.context);
    appendFooterSections(result.context);
    return window.sourceflow.menus.menu;
};
