import {Constants} from "../constants";
import {setStorageVal} from "../protyle/util/compatibility";
import {IHomepageState} from "./types";

export const normalizeHomepageNoteId = (value?: string) => `${value || ""}`.trim();

export const normalizeHomepageState = (state?: Partial<IHomepageState>): IHomepageState => {
    return {
        noteId: normalizeHomepageNoteId(state?.noteId),
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
    const state = {noteId: normalizeHomepageNoteId(noteId)};
    saveHomepageState(state);
    return getHomepageState();
};

export const clearHomepage = () => {
    const state = {noteId: ""};
    saveHomepageState(state);
    return getHomepageState();
};
