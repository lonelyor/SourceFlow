import {hideZenModeExitButton, showZenModeExitButton} from "./zenModeExitButton";

type IZenModeState = {
    active: boolean,
    wasFullscreen: boolean,
};

const normalizeZenModeState = (value?: Partial<IZenModeState> | null): IZenModeState => {
    return {
        active: !!value?.active,
        wasFullscreen: !!value?.wasFullscreen,
    };
};

const setBodyZenMode = (active: boolean) => {
    if (active) {
        document.body.setAttribute("data-zen-mode", "true");
        showZenModeExitButton(() => exitZenMode());
        return;
    }
    document.body.removeAttribute("data-zen-mode");
    hideZenModeExitButton();
};

export const getZenModeState = () => normalizeZenModeState(window.sourceflow.zenMode);

export const isZenModeActive = () => getZenModeState().active;

/// #if !MOBILE
import {Custom} from "../layout/dock/Custom";
import {getAllEditor} from "../layout/getAll";
import {getActiveTab} from "../layout/tabUtil";
import {Editor} from "../editor";
import {Search} from "../search";
import {fullscreen} from "../protyle/breadcrumb/action";
import {resize} from "../protyle/util/resize";
/// #endif

export const getActiveProtyleForZenMode = () => {
    /// #if MOBILE
    return window.sourceflow.mobile.popEditor?.protyle || window.sourceflow.mobile.editor?.protyle;
    /// #else
    const activeModel = getActiveTab(false)?.model;
    if (activeModel instanceof Editor) {
        const editorModel = activeModel as Editor;
        return editorModel.editor.protyle;
    }
    if (activeModel instanceof Search) {
        const searchModel = activeModel as Search;
        if (searchModel.element.querySelector("#searchUnRefPanel")?.classList.contains("fn__none")) {
            return searchModel.editors.edit.protyle;
        }
        return searchModel.editors.unRefEdit.protyle;
    }
    if (activeModel instanceof Custom) {
        const customModel = activeModel as Custom;
        if (customModel.editors?.length > 0) {
            return customModel.editors[0].protyle;
        }
    }
    const focusedEditor = getAllEditor().find((item) => item.protyle.model?.parent?.headElement?.classList.contains("item--focus"));
    if (focusedEditor) {
        return focusedEditor.protyle;
    }
    const fullscreenEditor = getAllEditor().find((item) => item.protyle.element?.classList.contains("fullscreen"));
    if (fullscreenEditor) {
        return fullscreenEditor.protyle;
    }
    const visibleEditor = getAllEditor().find((item) => {
        const element = item.protyle?.element;
        return !!element && !element.classList.contains("fn__none") && !element.closest(".fn__none");
    });
    if (visibleEditor) {
        return visibleEditor.protyle;
    }
    return getAllEditor()[0]?.protyle;
    /// #endif
};

export const toggleFullscreenWithZenModeAlias = () => {
    /// #if MOBILE
    return false;
    /// #else
    try {
        const protyle = getActiveProtyleForZenMode();
        if (!protyle?.element) {
            return false;
        }
        fullscreen(protyle.element);
        resize(protyle);
        return true;
    } catch (error) {
        console.error("[zenMode] toggle fullscreen alias failed", error);
        return false;
    }
    /// #endif
};

export const exitZenMode = () => {
    /// #if MOBILE
    if (!isZenModeActive()) {
        return false;
    }
    window.sourceflow.zenMode = {
        active: false,
        wasFullscreen: false,
    };
    setBodyZenMode(false);
    return true;
    /// #else
    const state = getZenModeState();
    if (!state.active) {
        return false;
    }
    const fullscreenElement = document.querySelector(".protyle.fullscreen") as HTMLElement;
    if (fullscreenElement && !state.wasFullscreen) {
        fullscreen(fullscreenElement);
        const editorModel = getAllEditor().find((item) => item.protyle.element === fullscreenElement);
        if (editorModel) {
            resize(editorModel.protyle);
        }
    } else if (!state.wasFullscreen) {
        window.sourceflow.editorIsFullscreen = false;
    }
    window.sourceflow.zenMode = {
        active: false,
        wasFullscreen: false,
    };
    setBodyZenMode(false);
    return true;
    /// #endif
};

export const enterZenMode = (protyle: IProtyle) => {
    /// #if MOBILE
    void protyle;
    return;
    /// #else
    if (!protyle?.element) {
        return;
    }
    if (isZenModeActive()) {
        exitZenMode();
    }
    const wasFullscreen = protyle.element.classList.contains("fullscreen");
    if (!wasFullscreen) {
        fullscreen(protyle.element);
        resize(protyle);
    }
    window.sourceflow.zenMode = {
        active: true,
        wasFullscreen,
    };
    setBodyZenMode(true);
    /// #endif
};

export const toggleZenMode = (protyle: IProtyle) => {
    /// #if MOBILE
    void protyle;
    return;
    /// #else
    if (isZenModeActive()) {
        exitZenMode();
        return;
    }
    enterZenMode(protyle);
    /// #endif
};
