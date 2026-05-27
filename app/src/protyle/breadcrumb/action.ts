/// #if !MOBILE
import {getAllEditor, getAllModels, getAllWnds} from "../../layout/getAll";
/// #endif
import {addLoading} from "../ui/initUI";
import {fetchPost} from "../../util/fetch";
import {Constants} from "../../constants";
import {hideAllElements, hideElements} from "../ui/hideElements";
import {hasClosestByClassName} from "../util/hasClosest";
import {reloadProtyle} from "../util/reload";
import {resize} from "../util/resize";
import {disabledProtyle, enableProtyle} from "../util/onGet";
import {isWindow} from "../../util/functions";
import {Wnd} from "../../layout/Wnd";
import {resizeTopBar} from "../../layout/util";
import {hideZenModeExitButton, showZenModeExitButton} from "../../editor/zenModeExitButton";

const syncZenModeAliasButton = () => {
    const hasEditorFullscreen = !!document.querySelector(".protyle.fullscreen");
    document.body.classList.toggle("body--editor-fullscreen", hasEditorFullscreen);
    const zenModeButton = document.getElementById("barZenMode");
    if (zenModeButton) {
        zenModeButton.classList.toggle("fn__none", !hasEditorFullscreen);
        zenModeButton.setAttribute("aria-label", hasEditorFullscreen ? (window.sourceflow.languages.zModeExit || window.sourceflow.languages.zMode) : window.sourceflow.languages.zMode);
    }
    if (document.body.getAttribute("data-zen-mode") !== "true") {
        if (hasEditorFullscreen) {
            showZenModeExitButton(() => {
                const fullscreenElement = document.querySelector(".protyle.fullscreen") as HTMLElement | null;
                if (!fullscreenElement) {
                    hideZenModeExitButton();
                    return;
                }
                fullscreen(fullscreenElement);
                const editorModel = getAllModels().editor.find((item) => item.editor.protyle.element === fullscreenElement);
                if (editorModel) {
                    resize(editorModel.editor.protyle);
                }
            });
        } else {
            hideZenModeExitButton();
        }
    }
    resizeTopBar();
};

export const net2LocalAssets = (protyle: IProtyle, type: "Assets" | "Img", url = "") => {
    if (protyle.element.querySelector(".wysiwygLoading")) {
        return;
    }
    addLoading(protyle);
    hideElements(["toolbar"], protyle);
    fetchPost(`/api/format/net${type}2LocalAssets`, {
        id: protyle.block.rootID,
        url
    }, () => {
        /// #if MOBILE
        reloadProtyle(protyle, false);
        /// #else
        getAllEditor().forEach(item => {
            if (item.protyle.block.rootID === protyle.block.rootID) {
                reloadProtyle(item.protyle, item.protyle.element === protyle.element);
            }
        });
        /// #endif
    });
};

export const fullscreen = (element: Element, btnElement?: Element) => {
    setTimeout(() => {
        hideAllElements(["gutter"]);
    }, Constants.TIMEOUT_TRANSITION);   // 等待页面动画结束

    const isFullscreen = element.className.includes("fullscreen");
    if (isFullscreen) {
        element.classList.remove("fullscreen");
        document.getElementById("drag")?.classList.remove("fn__hidden");
    } else {
        element.classList.add("fullscreen");
        document.getElementById("drag")?.classList.add("fn__hidden");
    }
    if (isWindow()) {
        // 编辑器全屏
        /// #if !MOBILE
        const wndsTemp: Wnd[] = [];
        getAllWnds(window.sourceflow.layout.layout, wndsTemp);
        wndsTemp.find(async item => {
            const headerElement = item.headersElement.parentElement;
            if (headerElement.getBoundingClientRect().top <= 0) {
                // @ts-ignore
                (headerElement.querySelector(".item--readonly .fn__flex-1") as HTMLElement).style.WebkitAppRegion = isFullscreen ? "drag" : "";
                return true;
            }
        });
        /// #endif
    }
    /// #if !MOBILE
    if ("darwin" !== window.sourceflow.config.system.os && !isWindow()) {
        const windowControlsElement = document.getElementById("windowControls");
        if (isFullscreen) {
            windowControlsElement.style.zIndex = "";
        } else {
            window.sourceflow.zIndex++;
            windowControlsElement.style.zIndex = window.sourceflow.zIndex.toString();
        }
    }
    /// #endif
    if (btnElement) {
        if (isFullscreen) {
            btnElement.querySelector("use").setAttribute("xlink:href", "#iconFullscreen");
        } else {
            btnElement.querySelector("use").setAttribute("xlink:href", "#iconFullscreenExit");
        }
        const dockLayoutElement = hasClosestByClassName(element, "layout--float");
        if (dockLayoutElement) {
            if (isFullscreen) {
                dockLayoutElement.setAttribute("data-temp", dockLayoutElement.style.transform);
                dockLayoutElement.style.transform = "none";
            } else {
                dockLayoutElement.style.transform = dockLayoutElement.getAttribute("data-temp");
                dockLayoutElement.removeAttribute("data-temp");
            }
        }
        syncZenModeAliasButton();
        return;
    }
    /// #if !MOBILE
    if (element.classList.contains("protyle")) {
        window.sourceflow.editorIsFullscreen = !isFullscreen;
    }
    getAllModels().editor.forEach(item => {
        if (element !== item.element) {
            if (window.sourceflow.editorIsFullscreen) {
                if (item.element.classList.contains("fullscreen")) {
                    item.element.classList.remove("fullscreen");
                    resize(item.editor.protyle);
                }
            } else if (item.element.classList.contains("fullscreen")) {
                item.element.classList.remove("fullscreen");
                resize(item.editor.protyle);
            }
        }
    });
    syncZenModeAliasButton();
    /// #endif
};

export const updateReadonly = (target: Element, protyle: IProtyle) => {
    if (!window.sourceflow.config.readonly) {
        const isReadonly = target.querySelector("use").getAttribute("xlink:href") !== "#iconUnlock";
        if (window.sourceflow.config.editor.readOnly) {
            if (isReadonly) {
                enableProtyle(protyle);
            } else {
                disabledProtyle(protyle);
            }
        } else {
            fetchPost("/api/attr/setBlockAttrs", {
                id: protyle.block.rootID,
                attrs: {
                    [Constants.CUSTOM_SF_READONLY]: isReadonly ? "false" : "true"
                }
            });
        }
    }
};
