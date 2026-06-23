import {Constants} from "../constants";
import {ipcRenderer, webFrame} from "electron";
import {adjustLayout, getInstanceById, JSONToCenter} from "../layout/util";
import {resizeTabs} from "../layout/tabUtil";
import {initStatus} from "../layout/status";
import {appearance} from "../config/appearance";
import {initAssets, setInlineStyle} from "../util/assets";
import {renderSnippet} from "../config/util/snippets";
import {getSearch} from "../util/functions";
import {initWindow} from "../boot/onGetConfig";
import {App} from "../index";
import {afterLoadPlugin, deferInitialPluginLoad} from "../plugin/loader";
import {Tab} from "../layout/Tab";
import {initWindowEvent} from "../boot/globalEvent/event";
import {getAllEditor} from "../layout/getAll";
import {deferEmojiConfLoad, setInitialEmojiConf} from "../emoji/load";
/// #if !BROWSER
import {initNativeDialogOverride} from "../protyle/util/compatibility";
/// #endif

export const init = (app: App) => {
    webFrame.setZoomFactor(window.sourceflow.storage[Constants.LOCAL_ZOOM]);
    ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
        cmd: "setTrafficLightPosition",
        zoom: window.sourceflow.storage[Constants.LOCAL_ZOOM],
        position: Constants.SIZE_ZOOM.find((item) => item.zoom === window.sourceflow.storage[Constants.LOCAL_ZOOM]).position
    });
    initWindowEvent(app);
    setInitialEmojiConf();
    const layout = JSON.parse(sessionStorage.getItem("layout") || "{}");
    if (layout.layout) {
        JSONToCenter(app, layout.layout);
        window.sourceflow.layout.centerLayout = window.sourceflow.layout.layout;
        afterLayout(app);
        deferInitialPluginLoad(app);
        deferEmojiConfLoad();
    } else {
        const tabsJSON = JSON.parse(getSearch("json"));
        tabsJSON[tabsJSON.length - 1].active = true;
        JSONToCenter(app, {
            direction: "lr",
            resize: "lr",
            size: "auto",
            type: "center",
            instance: "Layout",
            children: [{
                instance: "Wnd",
                children: tabsJSON
            }]
        });
        window.sourceflow.layout.centerLayout = window.sourceflow.layout.layout;
        adjustLayout(window.sourceflow.layout.centerLayout);
        afterLayout(app);
        deferInitialPluginLoad(app);
        deferEmojiConfLoad();
    }
    initStatus(true);
    initWindow(app);
    /// #if !BROWSER
    initNativeDialogOverride();
    /// #endif
    appearance.onSetAppearance(window.sourceflow.config.appearance);
    initAssets();
    setInlineStyle();
    renderSnippet();
    let resizeTimeout = 0;
    window.addEventListener("resize", () => {
        window.clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(() => {
            adjustLayout(window.sourceflow.layout.centerLayout);
            resizeTabs();
            window.sourceflow.menus.menu.resetPosition();
            if (getSelection().rangeCount > 0) {
                const range = getSelection().getRangeAt(0);
                getAllEditor().forEach(item => {
                    if (item.protyle.wysiwyg.element.contains(range.startContainer)) {
                        item.protyle.toolbar.render(item.protyle, range);
                    }
                });
            }
        }, Constants.TIMEOUT_RESIZE);
    });
};

const afterLayout = (app: App) => {
    app.plugins.forEach(item => {
        afterLoadPlugin(item);
    });
    document.querySelectorAll('li[data-type="tab-header"][data-init-active="true"]').forEach((item: HTMLElement) => {
        const tab = getInstanceById(item.getAttribute("data-id")) as Tab;
        tab.parent.switchTab(item, false, false);
    });
};
