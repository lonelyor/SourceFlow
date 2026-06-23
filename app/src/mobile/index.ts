import {addScript, addScriptSync} from "../protyle/util/addScript";
import {Constants} from "../constants";
import {onMessage} from "./util/onMessage";
import {genUUID} from "../util/genID";
import {hasClosestBlock, hasClosestByAttribute, hasTopClosestByClassName} from "../protyle/util/hasClosest";
import {Model} from "../layout/Model";
import "../assets/scss/mobile.scss";
import {Menus} from "../menus";
import {addBaseURL, getIdFromSYProtocol, isSYProtocol, setNoteBook} from "../util/pathName";
import {handleTouchEnd, handleTouchMove, handleTouchStart} from "./util/touch";
import {fetchGet, fetchPost} from "../util/fetch";
import {initFramework} from "./util/initFramework";
import {initAssets, loadAssets} from "../util/assets";
import {deferBootSync} from "../dialog/processSystem";
import {initMessage, showMessage} from "../dialog/message";
import {goBack} from "./util/MobileBackFoward";
import {activeBlur, hideKeyboardToolbar, showKeyboardToolbar} from "./util/keyboardToolbar";
import {getLocalStorage, isChromeBrowser, isInMobileApp, writeText} from "../protyle/util/compatibility";
import {getCurrentEditor, openMobileFileById} from "./editor";
import {getSearch} from "../util/functions";
import {checkPublishServiceClosed} from "../util/processMessage";
import {initRightMenu} from "./menu";
import {deferOpenChangelog} from "../boot/openChangelog";
import {registerServiceWorker} from "../util/serviceWorker";
import {deferInitialPluginLoad} from "../plugin/loader";
import {saveScroll} from "../protyle/scroll/saveScroll";
import {removeBlock} from "../protyle/wysiwyg/remove";
import {isNotEditBlock} from "../protyle/wysiwyg/getBlock";
import {updateCardHV} from "../card/util";
import {mobileKeydown} from "./util/keydown";
import {correctHotkey} from "../boot/globalEvent/commonHotkey";
import {updateControlAlt} from "../protyle/util/hotKey";
import {nbsp2space} from "../protyle/util/normalizeText";
import {callMobileAppShowKeyboard, canInput, setWebViewFocusable} from "./util/mobileAppUtil";
import {deferEmojiConfLoad, setInitialEmojiConf} from "../emoji/load";
import {setBrandedAppState} from "../util/runtimeBrand";

class App {
    public plugins: import("../plugin").Plugin[] = [];
    public appId: string;

    constructor() {
        if (checkPublishServiceClosed()) {
            return;
        }
        registerServiceWorker(`${Constants.SERVICE_WORKER_PATH}?v=${Constants.SOURCEFLOW_VERSION}`);
        addBaseURL();
        this.appId = Constants.SOURCEFLOW_APPID;
        setBrandedAppState({
            zIndex: 10,
            notebooks: [],
            transactions: [],
            reqIds: {},
            backStack: [],
            dialogs: [],
            blockPanels: [],
            mobile: {
                size: {},
                docks: {
                    outline: null,
                    file: null,
                    bookmark: null,
                    tag: null,
                    backlink: null,
                }
            },
            ws: new Model({
                app: this,
                id: genUUID(),
                type: "main",
                msgCallback: (data) => {
                    this.plugins.forEach((plugin) => {
                        if (plugin.eventBus.hasListeners("ws-main")) {
                            plugin.eventBus.emit("ws-main", data);
                        }
                    });
                    onMessage(this, data);
                }
            })
        });
        // 不能使用 touchstart，否则会被 event.stopImmediatePropagation() 阻塞
        window.addEventListener("click", (event: MouseEvent & { target: HTMLElement }) => {
            if (!window.sourceflow.menus.menu.element.contains(event.target) && !hasClosestByAttribute(event.target, "data-menu", "true")) {
                window.sourceflow.menus.menu.remove();
            }
            const copyElement = hasTopClosestByClassName(event.target, "protyle-action__copy");
            if (copyElement) {
                let text = copyElement.parentElement.nextElementSibling.textContent.trimEnd();
                text = nbsp2space(text); // Replace non-breaking spaces with normal spaces when copying https://github.com/lonelyor/SourceFlow/issues/9382
                writeText(text);
                showMessage(window.sourceflow.languages.copied, 2000);
                event.preventDefault();
            }
            if (["INPUT", "TEXTAREA"].includes(event.target.tagName)) {
                setTimeout(() => {
                    event.target.scrollIntoView({
                        block: "center",
                    });
                }, Constants.TIMEOUT_TRANSITION);
            }
            if (window.JSAndroid && window.JSAndroid.showKeyboard || window.JSHarmony && window.JSHarmony.showKeyboard) {
                if (canInput(event.target)) {
                    callMobileAppShowKeyboard();
                }
            }
        });
        if (window.JSAndroid && window.JSAndroid.showKeyboard || window.JSHarmony && window.JSHarmony.showKeyboard) {
            const __sourceflow_original_focus = HTMLElement.prototype.focus;
            HTMLElement.prototype.focus = function (this: HTMLElement, ...args) {
                try {
                    if (typeof __sourceflow_original_focus === "function") {
                        __sourceflow_original_focus.apply(this, args);
                    }
                } catch (e) {
                    console.error("Error in focus event:", e);
                }
                if (canInput(this)) {
                    callMobileAppShowKeyboard();
                }
            };
        }
        window.addEventListener("beforeunload", () => {
            saveScroll(window.sourceflow.mobile.editor.protyle);
        }, false);
        window.addEventListener("pagehide", () => {
            saveScroll(window.sourceflow.mobile.editor.protyle);
        }, false);
        // 判断手机横竖屏状态
        window.matchMedia("(orientation:portrait)").addEventListener("change", () => {
            updateCardHV();
            activeBlur();
        });
        fetchPost("/api/system/getConf", {}, async (confResponse) => {
            addScriptSync(`${Constants.PROTYLE_CDN}/js/lute/lute.min.js?v=${Constants.SOURCEFLOW_VERSION}`, "protyleLuteScript");
            addScript(`${Constants.PROTYLE_CDN}/js/protyle-html.js?v=${Constants.SOURCEFLOW_VERSION}`, "protyleWcHtmlScript");
            window.sourceflow.config = confResponse.data.conf;
            updateControlAlt();
            window.sourceflow.isPublish = confResponse.data.isPublish;
            correctHotkey(sourceflowApp);
            getLocalStorage(() => {
                fetchGet(`/appearance/langs/${window.sourceflow.config.appearance.lang}.json?v=${Constants.SOURCEFLOW_VERSION}`, (lauguages: IObject) => {
                    window.sourceflow.languages = lauguages;
                    window.sourceflow.menus = new Menus(this);
                    document.title = window.sourceflow.languages.sourceflowNote || "SourceFlow";
                    loadAssets(confResponse.data.conf.appearance);
                    initMessage();
                    initAssets();
                    window.sourceflow.user = null;
                    if (!isInMobileApp()) {
                        if (isChromeBrowser()) {
                            document.querySelector('meta[name="viewport"]').setAttribute("content", "width=device-width, height=device-height, interactive-widget=resizes-content, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover");
                        } else if (!window.sourceflow.config.readonly && !window.sourceflow.isPublish) {
                            showMessage(window.sourceflow.languages.useChrome, 0, "error");
                        }
                    }
                    setInitialEmojiConf();
                    setNoteBook(() => {
                        initFramework(this, confResponse.data.start);
                        initRightMenu(this);
                        deferBootSync();
                        deferOpenChangelog();
                        deferInitialPluginLoad(this);
                        deferEmojiConfLoad();
                    });
                });
            });
            document.addEventListener("touchstart", handleTouchStart, false);
            document.addEventListener("touchmove", handleTouchMove, false);
            document.addEventListener("touchend", (event) => {
                handleTouchEnd(event, sourceflowApp);
            }, false);
            window.addEventListener("keyup", () => {
                window.sourceflow.ctrlIsPressed = false;
                window.sourceflow.shiftIsPressed = false;
                window.sourceflow.altIsPressed = false;
            });
            window.addEventListener("blur", () => {
                setWebViewFocusable();
            });
            // 移动端删除键 https://github.com/lonelyor/SourceFlow/issues/9259
            window.addEventListener("keydown", (event) => {
                mobileKeydown(sourceflowApp, event);
                if (getSelection().rangeCount > 0) {
                    const range = getSelection().getRangeAt(0);
                    const editor = getCurrentEditor();
                    if (range.toString() === "" &&
                        editor && editor.protyle.wysiwyg.element.contains(range.startContainer) &&
                        !event.altKey && (event.key === "Backspace" || event.key === "Delete")) {
                        const nodeElement = hasClosestBlock(range.startContainer);
                        if (nodeElement && isNotEditBlock(nodeElement)) {
                            nodeElement.classList.add("protyle-wysiwyg--select");
                            removeBlock(editor.protyle, nodeElement, range, event.key);
                            event.stopPropagation();
                            event.preventDefault();
                            return;
                        }
                    }
                }
            });
        });
    }
}

const sourceflowApp = new App();

// https://github.com/lonelyor/SourceFlow/issues/8441
window.reconnectWebSocket = () => {
    window.sourceflow.ws.send("ping", {});
    window.sourceflow.mobile.docks.file.send("ping", {});
    window.sourceflow.mobile.editor.protyle.ws.send("ping", {});
    window.sourceflow.mobile.popEditor?.protyle.ws.send("ping", {});
};
window.goBack = goBack;
window.showMessage = showMessage;
window.showKeyboardToolbar = showKeyboardToolbar;
window.hideKeyboardToolbar = hideKeyboardToolbar;
window.openFileByURL = (openURL) => {
    if (openURL && isSYProtocol(openURL)) {
        openMobileFileById(sourceflowApp, getIdFromSYProtocol(openURL),
            getSearch("focus", openURL) === "1" ? [Constants.CB_GET_ALL] : [Constants.CB_GET_HL, Constants.CB_GET_CONTEXT, Constants.CB_GET_ROOTSCROLL]);
        return true;
    }
    return false;
};
