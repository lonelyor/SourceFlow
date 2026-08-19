import {App} from "../index";
import {HOMEPAGE_MARK, homepageText} from "./constants";
import {escapeHTML} from "./html";
import {createHomepageNote, getCurrentHomepageCandidateNoteId, openHomepageNote, openHomepageNotePicker, setCurrentNoteAsHomepage} from "./actions";
import {getHomepageState} from "./state";

const renderHomepageEmpty = (container: HTMLElement) => {
    const canSetCurrent = !!getCurrentHomepageCandidateNoteId();
    const title = getHomepageState().noteId
        ? homepageText("主页暂时无法打开", "Homepage is temporarily unavailable")
        : homepageText("尚未创建主页", "No homepage yet");
    container.innerHTML = `<div class="homepage-page__empty">
    <div class="homepage-page__empty-main">
        <div class="homepage-page__empty-icon"><svg><use xlink:href="#iconLayout"></use></svg></div>
        <div class="homepage-page__empty-title">${escapeHTML(title)}</div>
        <div class="homepage-page__empty-desc">${escapeHTML(homepageText("主页是一篇普通笔记，左侧按钮会直接打开它。", "Homepage is a normal note opened directly from the left button."))}</div>
        <div class="homepage-page__empty-actions">
            ${window.sourceflow.config.readonly ? "" : `<button class="b3-button" type="button" data-homepage-action="create-homepage-note">
                <svg><use xlink:href="#iconFile"></use></svg><span>${escapeHTML(homepageText("创建主页笔记", "Create Homepage Note"))}</span>
            </button>`}
            <button class="b3-button b3-button--outline" type="button" data-homepage-action="select-homepage-note">
                <svg><use xlink:href="#iconSearch"></use></svg><span>${escapeHTML(homepageText("选择已有笔记", "Choose Existing Note"))}</span>
            </button>
            ${canSetCurrent ? `<button class="b3-button b3-button--outline" type="button" data-homepage-action="set-current-note-homepage">
                <svg><use xlink:href="#iconEdit"></use></svg><span>${escapeHTML(homepageText("设当前笔记为主页", "Use Current Note"))}</span>
            </button>` : ""}
        </div>
    </div>
</div>`;
};

export const mountHomepageIntoContainer = async (app: App, container: HTMLElement) => {
    if (!container) {
        return;
    }
    container.setAttribute("data-homepage-tab", HOMEPAGE_MARK);
    container.classList.add("homepage-page");
    const state = getHomepageState();
    if (state.noteId && await openHomepageNote(app, state.noteId)) {
        return;
    }
    renderHomepageEmpty(container);
    container.onclick = (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }
        const target = event.target.closest("[data-homepage-action]") as HTMLElement;
        if (!target || !container.contains(target)) {
            return;
        }
        const action = target.getAttribute("data-homepage-action");
        if (action === "create-homepage-note") {
            createHomepageNote(app);
            event.preventDefault();
            return;
        }
        if (action === "select-homepage-note") {
            openHomepageNotePicker(app);
            event.preventDefault();
            return;
        }
        if (action === "set-current-note-homepage") {
            void setCurrentNoteAsHomepage(app);
            event.preventDefault();
        }
    };
};
