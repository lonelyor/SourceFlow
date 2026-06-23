import {closePanel} from "../util/closePanel";
import {mountHelp, newDailyNote, newNotebook} from "../../util/mount";
import {exitSourceFlow, lockScreen, processSync} from "../../dialog/processSystem";
import {activeBlur} from "../util/keyboardToolbar";
import {openModel} from "./model";
import {App} from "../../index";
import {
    isDisabledFeature,
    isHuawei,
    isInMobileApp,
    isIPhone
} from "../../protyle/util/compatibility";
import {newFile} from "../../util/newFile";
import {afterLoadPlugin} from "../../plugin/loader";
import {openTopBarMenu} from "../../plugin/openTopBarMenu";

const loadCommandPanel = () => import("../../boot/globalEvent/command/panel");
const loadSearchMenu = () => import("./search");
const loadRecentDocs = () => import("./getRecentDocs");
const loadAppearanceSettings = () => import("../settings/appearance");
const loadAssetsSettings = () => import("../settings/assets");
const loadEditorSettings = () => import("../settings/editor");
const loadFileTreeSettings = () => import("../settings/fileTree");
const loadRiffCardSettings = () => import("../settings/riffCard");
const loadAISettings = () => import("../settings/ai");
const loadAboutSettings = () => import("../settings/about");
const loadExportSettings = () => import("../settings/export");
const loadReposConfig = () => import("../../config/repos");
const loadSyncGuide = () => import("../../sync/syncGuide");
const loadHistory = () => import("../../history/history");
const loadCard = () => import("../../card/openCard");

export const popMenu = () => {
    activeBlur();
    document.getElementById("menu").style.transform = "translateX(0px)";
};

export const initRightMenu = (app: App) => {
    const menuElement = document.getElementById("menu");
    let aiHTML = `<div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuAI">
        <svg class="b3-menu__icon"><use xlink:href="#iconSparkles"></use></svg><span class="b3-menu__label">AI</span>
    </div>`;
    if (isHuawei() || isDisabledFeature("ai")) {
        // Access to the OpenAI API is no longer supported on Huawei devices https://github.com/lonelyor/SourceFlow/issues/8192
        // Apps in Chinese mainland app stores no longer provide AI access settings https://github.com/lonelyor/SourceFlow/issues/13051
        aiHTML = "";
    }

    menuElement.innerHTML = `<div class="b3-menu__title">
    <svg class="b3-menu__icon"><use xlink:href="#iconLeft"></use></svg>
    <span class="b3-menu__label">${window.sourceflow.languages.back}</span>
</div>
<div class="b3-menu__items">
    <div id="menuRecent" class="b3-menu__item">
        <svg class="b3-menu__icon"><use xlink:href="#iconList"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.recentDocs}</span>
    </div>
    <div id="menuSearch" class="b3-menu__item">
        <svg class="b3-menu__icon"><use xlink:href="#iconSearch"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.search}</span>
    </div>
    <div id="menuCommand" class="b3-menu__item">
        <svg class="b3-menu__icon"><use xlink:href="#iconKeymap"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.commandPanel}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuSyncNow">
        <svg class="b3-menu__icon"><use xlink:href="#iconCloudSucc"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.syncNow}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuNewDoc">
        <svg class="b3-menu__icon"><use xlink:href="#iconFile"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.newFile}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuNewNotebook">
        <svg class="b3-menu__icon"><use xlink:href="#iconFilesRoot"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.newNotebook}</span>
    </div>
    <div class="b3-menu__separator"></div>
    <div id="menuNewDaily" class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}">
        <svg class="b3-menu__icon"><use xlink:href="#iconCalendar"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.dailyNote}</span>
    </div>
    <div id="menuCard" class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}">
        <svg class="b3-menu__icon"><use xlink:href="#iconRiffCard"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.spaceRepetition}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuLock">
        <svg class="b3-menu__icon"><use xlink:href="#iconLock"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.lockScreen}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuHistory">
        <svg class="b3-menu__icon"><use xlink:href="#iconHistory"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.dataHistory}</span>
    </div>
    <div class="b3-menu__separator${isInMobileApp() ? "" : " fn__none"}"></div>
    <div class="b3-menu__item b3-menu__item--warning${isInMobileApp() ? "" : " fn__none"}" id="menuSafeQuit">
        <svg class="b3-menu__icon"><use xlink:href="#iconQuit"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.safeQuit}</span>
    </div>
    <div class="b3-menu__separator"></div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuEditor">
        <svg class="b3-menu__icon"><use xlink:href="#iconEdit"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.editor}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuFileTree">
        <svg class="b3-menu__icon"><use xlink:href="#iconFiles"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.fileTree}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuRiffCard">
        <svg class="b3-menu__icon"><use xlink:href="#iconRiffCard"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.riffCard}</span>
    </div>
    ${aiHTML}
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuAssets">
        <svg class="b3-menu__icon"><use xlink:href="#iconImage"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.assets}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuExport">
        <svg class="b3-menu__icon"><use xlink:href="#iconUpload"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.export}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuAppearance">
        <svg class="b3-menu__icon"><use xlink:href="#iconTheme"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.appearance}</span>
    </div>
    <div id="menuSync" class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}">
        <svg class="b3-menu__icon"><use xlink:href="#iconCloud"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.backup}</span>
    </div>
    <div class="b3-menu__item${window.sourceflow.config.readonly ? " fn__none" : ""}" id="menuAbout">
        <svg class="b3-menu__icon"><use xlink:href="#iconInfo"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.about}</span>
    </div>
    <div class="b3-menu__item" id="menuPlugin">
        <svg class="b3-menu__icon"><use xlink:href="#iconPlugin"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.plugin}</span>
    </div>
    <div class="b3-menu__separator"></div>
    <div class="b3-menu__item${(isIPhone() || window.sourceflow.config.readonly) ? " fn__none" : ""}" id="menuHelp">
        <svg class="b3-menu__icon"><use xlink:href="#iconHelp"></use></svg><span class="b3-menu__label">${window.sourceflow.languages.userGuide}</span>
    </div>
    <a class="b3-menu__item" href="https://github.com/lonelyor/SourceFlow/issues/new/choose" target="_blank">
        <svg class="b3-menu__icon"><use xlink:href="#iconFeedback"></use></svg>
        <span class="b3-menu__label">${window.sourceflow.languages.feedback}</span>
    </a>
</div>`;
    processSync();
    app.plugins.forEach(item => {
        afterLoadPlugin(item);
    });
    // 只能用 click，否则无法上下滚动 https://github.com/lonelyor/SourceFlow/issues/6628
    menuElement.addEventListener("click", (event) => {
        let target = event.target as HTMLElement;
        while (target && !target.isEqualNode(menuElement)) {
            if (target.classList.contains("b3-menu__title")) {
                closePanel();
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuCommand") {
                closePanel();
                void loadCommandPanel().then(({commandPanel}) => {
                    commandPanel(app);
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuSearch") {
                void loadSearchMenu().then(({popSearch}) => {
                    popSearch(app);
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuRecent") {
                void loadRecentDocs().then(({getRecentDocs}) => {
                    getRecentDocs(app);
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuAppearance") {
                void loadAppearanceSettings().then(({initAppearance}) => {
                    initAppearance();
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuAssets") {
                void loadAssetsSettings().then(({initConfigAssets}) => {
                    initConfigAssets(app);
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuExport") {
                void loadExportSettings().then(({initExport}) => {
                    initExport();
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuAI") {
                void loadAISettings().then(({initAI}) => {
                    initAI();
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuRiffCard") {
                void loadRiffCardSettings().then(({initRiffCard}) => {
                    initRiffCard();
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuEditor") {
                void loadEditorSettings().then(({initEditor}) => {
                    initEditor();
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuFileTree") {
                void loadFileTreeSettings().then(({initFileTree}) => {
                    initFileTree();
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuSafeQuit") {
                event.preventDefault();
                event.stopPropagation();
                exitSourceFlow();
                break;
            } else if (target.id === "menuAbout") {
                void loadAboutSettings().then(({initAbout}) => {
                    initAbout();
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuPlugin") {
                openTopBarMenu(app);
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuNewDaily") {
                newDailyNote(app);
                closePanel();
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuCard") {
                void loadCard().then(({openCard}) => {
                    openCard(app);
                });
                closePanel();
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuNewNotebook") {
                newNotebook();
                closePanel();
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuNewDoc") {
                newFile({
                    app,
                    useSavePath: true
                });
                closePanel();
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuHelp") {
                mountHelp();
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuLock") {
                lockScreen(app);
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuSync") {
                void loadReposConfig().then(({repos}) => {
                    openModel({
                        title: window.sourceflow.languages.backup,
                        icon: "iconCloud",
                        html: repos.genHTML(),
                        bindEvent(modelMainElement: HTMLElement) {
                            repos.element = modelMainElement;
                            repos.bindEvent();
                        }
                    });
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuSyncNow") {
                void loadSyncGuide().then(({syncGuide}) => {
                    syncGuide();
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.id === "menuHistory") {
                void loadHistory().then(({openHistory}) => {
                    openHistory(app);
                });
                event.preventDefault();
                event.stopPropagation();
                break;
            }
            target = target.parentElement;
        }
    });
};
