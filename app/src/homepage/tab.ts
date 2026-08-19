import {App} from "../index";
import {HOMEPAGE_MARK, homepageText} from "./constants";
import {mountHomepageIntoContainer} from "./runtime";
import {openHomepageNote} from "./actions";
import {getHomepageState} from "./state";
/// #if !MOBILE
import {Tab} from "../layout/Tab";
import {getAllTabs} from "../layout/getAll";
import {getInstanceById, getWndByLayout} from "../layout/util";
import {Wnd} from "../layout/Wnd";
/// #endif

/// #if !MOBILE
const createHomepageTab = (app: App, titleless = false) => new Tab({
    ...(titleless ? {} : {
        icon: "iconLayout",
        title: homepageText("主页", "Home"),
    }),
    panel: `<div class="homepage-page"></div>`,
    callback(tab: Tab) {
        tab.panelElement.setAttribute("data-homepage-tab", HOMEPAGE_MARK);
        if (tab.headElement) {
            tab.headElement.setAttribute("data-homepage-tab", HOMEPAGE_MARK);
        }
        void mountHomepageIntoContainer(app, tab.panelElement);
    }
});

const findHomepageTab = () => {
    return getAllTabs().find((item) => item.panelElement?.getAttribute("data-homepage-tab") === HOMEPAGE_MARK);
};
/// #endif

export const newHomepageEmptyTab = (app: App) => {
    /// #if MOBILE
    void app;
    return null as never;
    /// #else
    return createHomepageTab(app, true);
    /// #endif
};

export const openHomepageTab = async (app: App) => {
    /// #if MOBILE
    void app;
    return null as never;
    /// #else
    const state = getHomepageState();
    if (state.noteId && await openHomepageNote(app, state.noteId)) {
        return null;
    }
    const existingTab = findHomepageTab();
    if (existingTab) {
        if (existingTab.headElement) {
            existingTab.parent.switchTab(existingTab.headElement, true);
            existingTab.parent.showHeading();
        }
        return existingTab;
    }
    let wnd: Wnd = undefined;
    const activeWndElement = document.querySelector(".layout__wnd--active");
    if (activeWndElement) {
        wnd = getInstanceById(activeWndElement.getAttribute("data-id")) as Wnd;
    }
    if (!wnd) {
        wnd = getWndByLayout(window.sourceflow.layout.centerLayout);
    }
    const tab = createHomepageTab(app, false);
    wnd.addTab(tab);
    return tab;
    /// #endif
};

const hasAnyRealTabs = () => {
    /// #if MOBILE
    return false;
    /// #else
    return getAllTabs().some((item) => !!item?.headElement);
    /// #endif
};

export const openStartupHomepage = (app: App) => {
    /// #if MOBILE
    void app;
    return;
    /// #else
    try {
        if (findHomepageTab() || hasAnyRealTabs()) {
            return;
        }
        void openHomepageTab(app);
    } catch (error) {
        console.error("open startup homepage failed", error);
    }
    /// #endif
};
