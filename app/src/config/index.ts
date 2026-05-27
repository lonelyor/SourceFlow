/// #if MOBILE
import {popMenu} from "../mobile/menu";
/// #else
import {editor} from "./editor";
import {about} from "./about";
import {appearance} from "./appearance";
import {image} from "./image";
import {initConfigSearch} from "./search";
import {fileTree} from "./fileTree";
import {exportConfig} from "./exportConfig";
import {repos} from "./repos";
import {capture} from "./capture";
import {keymap} from "./keymap";
import {bazaar} from "./bazaar";
import {query} from "./query";
import {Dialog} from "../dialog";
import {ai} from "./ai";
import {flashcard} from "./flashcard";
import {templateLibrary} from "./templateLibrary";
import {isHuawei, isInHarmony} from "../protyle/util/compatibility";
import {Constants} from "../constants";
import {focusByRange} from "../protyle/util/selection";
/// #endif

type TSettingApp = import("../index").App;

export const genItemPanel = (type?: string, containerElement?: Element, app?: TSettingApp) => {
    /// #if MOBILE
    void type;
    void containerElement;
    void app;
    /// #else
    if (!type || !containerElement || !app) {
        return;
    }
    switch (type) {
        case "filetree":
            containerElement.innerHTML = fileTree.genHTML();
            fileTree.element = containerElement;
            fileTree.bindEvent();
            break;
        case "AI":
            containerElement.innerHTML = ai.genHTML();
            ai.element = containerElement;
            ai.bindEvent();
            break;
        case "templateLibrary":
            containerElement.innerHTML = templateLibrary.genHTML();
            templateLibrary.element = containerElement;
            templateLibrary.bindEvent();
            break;
        case "card":
            containerElement.innerHTML = flashcard.genHTML();
            flashcard.element = containerElement;
            flashcard.bindEvent();
            break;
        case "image":
            containerElement.innerHTML = image.genHTML();
            image.element = containerElement;
            image.bindEvent(app);
            break;
        case "export":
            containerElement.innerHTML = exportConfig.genHTML();
            exportConfig.element = containerElement;
            exportConfig.bindEvent();
            break;
        case "appearance":
            containerElement.innerHTML = appearance.genHTML();
            appearance.element = containerElement;
            appearance.bindEvent();
            break;
        case "keymap":
            containerElement.innerHTML = keymap.genHTML(app);
            keymap.element = containerElement;
            keymap.bindEvent(app);
            break;
        case "bazaar":
            bazaar.element = containerElement;
            containerElement.innerHTML = bazaar.genHTML();
            bazaar.bindEvent(app);
            break;
        case "repos":
            containerElement.innerHTML = repos.genHTML();
            repos.element = containerElement;
            repos.bindEvent();
            break;
        case "capture":
            containerElement.innerHTML = capture.genHTML();
            capture.element = containerElement;
            capture.bindEvent(app);
            break;
        case "about":
            containerElement.innerHTML = about.genHTML();
            about.element = containerElement;
            about.bindEvent();
            break;
        case "search":
            containerElement.innerHTML = query.genHTML();
            query.element = containerElement;
            query.bindEvent();
            break;
        default:
            break;
    }
    /// #endif
};

export const openSetting = (app: TSettingApp) => {
    /// #if MOBILE
    popMenu();
    /// #else
    const exitDialog = window.sourceflow.dialogs.find((item) => {
        if (item.element.querySelector(".config__tab-container")) {
            item.destroy();
            return true;
        }
    });
    if (exitDialog) {
        return exitDialog;
    }
    let range: Range;
    if (getSelection().rangeCount > 0) {
        range = getSelection().getRangeAt(0);
    }
    const dialog = new Dialog({
        content: `<div class="fn__flex-1 fn__flex config__panel" style="overflow: hidden;position: relative">
  <ul class="b3-tab-bar b3-list b3-list--background">
    <div class="config__tab-title resize__move">
        <svg class="b3-list-item__graphic"><use xlink:href="#iconSettings"></use></svg>
        <span class="b3-list-item__text">${window.sourceflow.languages.config}</span>
    </div>
    <div class="b3-form__icon"><svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg><input placeholder="${window.sourceflow.languages.search}" class="b3-text-field fn__block b3-form__icon-input"></div>
    <div class="config__tab-hr"></div>
    <li data-name="editor" class="b3-list-item--focus b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconEdit"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.editor}</span></li>
    <li data-name="filetree" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconFiles"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.fileTree}</span></li>
    <li data-name="card" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconRiffCard"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.riffCard}</span></li>
    <li data-name="AI" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconSparkles"></use></svg><span class="b3-list-item__text">AI</span></li>
    <li data-name="templateLibrary" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconImage"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.template || "Templates"}</span></li>
    <li data-name="image" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconImage"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.assets}</span></li>
    <li data-name="export" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconUpload"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.export}</span></li>
    <li data-name="capture" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconUpload"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.urlImport}</span></li>
    <li data-name="appearance" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconTheme"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.appearance}</span></li>
    <li data-name="bazaar" class="b3-list-item${isHuawei() || isInHarmony() ? " fn__none" : ""}"><svg class="b3-list-item__graphic"><use xlink:href="#iconBazaar"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.bazaar}</span></li>
    <li data-name="search" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconSearch"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.search}</span></li>
    <li data-name="keymap" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconKeymap"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.keymap}</span></li>
    <li data-name="repos" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconCloud"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.backup}</span></li>
    <li data-name="about" class="b3-list-item"><svg class="b3-list-item__graphic"><use xlink:href="#iconInfo"></use></svg><span class="b3-list-item__text">${window.sourceflow.languages.about}</span></li>
  </ul>
  <div class="config__tab-wrap">
      <div class="fn__hr--b resize__move"></div>
      <div class="config__tab-container" data-name="editor">${editor.genHTML()}</div>
      <div class="config__tab-container fn__none" data-name="filetree"></div>
      <div class="config__tab-container fn__none" data-name="card"></div>
      <div class="config__tab-container config__tab-container--top fn__none" data-name="AI"></div>
      <div class="config__tab-container fn__none" data-name="templateLibrary"></div>
      <div class="config__tab-container config__tab-container--top fn__none" data-name="image"></div>
      <div class="config__tab-container fn__none" data-name="export"></div>
      <div class="config__tab-container fn__none" data-name="capture"></div>
      <div class="config__tab-container fn__none" data-name="appearance"></div>
      <div class="config__tab-container config__tab-container--top fn__none" data-name="bazaar"></div>
      <div class="config__tab-container fn__none" data-name="search"></div>
      <div class="config__tab-container fn__none" style="overflow: scroll" data-name="keymap"></div>
      <div class="config__tab-container fn__none" data-name="repos"></div>
      <div class="config__tab-container fn__none" data-name="about"></div>
      <div class="fn__hr--b"></div>
  </div>
</div>`,
        width: "90vw",
        height: "90vh",
        destroyCallback() {
            if (range) {
                focusByRange(range);
            }
        },
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_SETTING);

    initConfigSearch(dialog.element, app);
    (dialog.element.querySelector(".b3-dialog__container") as HTMLElement).style.maxWidth = "1280px";
    dialog.element.querySelectorAll(".b3-tab-bar .b3-list-item").forEach(item => {
        item.addEventListener("click", () => {
            const type = item.getAttribute("data-name");
            const containerElement = dialog.element.querySelector(`.config__tab-container[data-name="${type}"]`);
            dialog.element.querySelectorAll(".config__tab-container").forEach((container) => {
                container.classList.add("fn__none");
            });
            dialog.element.querySelector(".b3-tab-bar .b3-list-item.b3-list-item--focus").classList.remove("b3-list-item--focus");
            item.classList.add("b3-list-item--focus");
            containerElement.classList.remove("fn__none");
            if (containerElement.innerHTML === "" || type === "repos" || type === "bazaar") {
                genItemPanel(type, containerElement, app);
            }
        });
    });
    editor.element = dialog.element.querySelector('.config__tab-container[data-name="editor"]');
    editor.bindEvent();
    return dialog;
    /// #endif
};

export const openSettingTab = (app: TSettingApp, type: string) => {
    /// #if MOBILE
    return openSetting(app);
    /// #else
    const dialog = window.sourceflow.dialogs.find((item) => item.element.querySelector(".config__tab-container")) || openSetting(app);
    const tab = dialog?.element.querySelector(`.b3-tab-bar [data-name="${CSS.escape(type)}"]`) as HTMLElement;
    if (tab) {
        tab.dispatchEvent(new CustomEvent("click"));
    }
    return dialog;
    /// #endif
};
