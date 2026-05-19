import {Constants} from "../constants";
import {setStorageVal} from "../protyle/util/compatibility";
import {DEFAULT_TEMPLATE_PATH} from "./constants";
import {IHomepageState, THomepageSourceType} from "./types";

export const normalizeTemplatePath = (value?: string) => {
    const text = `${value || ""}`.trim().replace(/\\/g, "/");
    if (!text) {
        return DEFAULT_TEMPLATE_PATH;
    }
    return text.startsWith("/") ? text.replace(/\/+$/, "") : `/${text.replace(/^\/+/, "").replace(/\/+$/, "")}`;
};

export const normalizeHomepageState = (state?: Partial<IHomepageState>): IHomepageState => {
    const noteId = `${state?.noteId || ""}`.trim();
    const sourceType: THomepageSourceType = state?.sourceType === "note" && noteId ? "note" : "template";
    return {
        templatePath: normalizeTemplatePath(state?.templatePath),
        sourceType,
        noteId: sourceType === "note" ? noteId : "",
    };
};

export const getHomepageState = (): IHomepageState => {
    const stored = window.sourceflow.storage[Constants.LOCAL_HOMEPAGE] || {};
    return normalizeHomepageState(stored);
};

export const saveHomepageState = (state: IHomepageState) => {
    const normalized = normalizeHomepageState(state);
    window.sourceflow.storage[Constants.LOCAL_HOMEPAGE] = normalized;
    setStorageVal(Constants.LOCAL_HOMEPAGE, normalized);
};

export const setHomepageSourceToNote = (noteId: string) => {
    const state = getHomepageState();
    state.sourceType = "note";
    state.noteId = `${noteId || ""}`.trim();
    saveHomepageState(state);
    return getHomepageState();
};

export const resetHomepageToDefault = () => {
    const state = getHomepageState();
    state.sourceType = "template";
    state.noteId = "";
    state.templatePath = normalizeTemplatePath(state.templatePath || DEFAULT_TEMPLATE_PATH);
    saveHomepageState(state);
    return getHomepageState();
};
