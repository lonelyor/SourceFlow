import {homepageText} from "./constants";
import {escapeHTML} from "./html";
import {IHomepageState} from "./types";

export const getHomepageToolbarHTML = (state: IHomepageState) => {
    const actions: string[] = [];
    if (state.sourceType === "note" && state.noteId) {
        actions.push(`<button class="homepage-page__chip" type="button" data-homepage-action="open-homepage-source">${escapeHTML(homepageText("编辑主页笔记", "Edit Homepage Note"))}</button>`);
    }
    actions.push(`<button class="homepage-page__chip" type="button" data-homepage-action="reset-default-homepage">${escapeHTML(homepageText("恢复默认主页", "Reset Default Homepage"))}</button>`);
    return `<div class="homepage-page__toolbar"><div class="homepage-page__toolbar-inner"><div class="homepage-page__toolbar-actions">${actions.join("")}</div></div></div>`;
};
