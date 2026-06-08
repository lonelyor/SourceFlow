import {App} from "../index";
import {Constants} from "../constants";
import {showMessage} from "../dialog/message";
import {getAllModels} from "../layout/getAll";
import {newFile} from "../util/newFile";
import {fetchSyncPost} from "../util/fetch";
import {homepageText} from "./constants";
import {clearHomepage, getHomepageState, normalizeHomepageNoteId, setHomepageSourceToNote} from "./state";
/// #if MOBILE
import {openMobileFileById} from "../mobile/editor";
/// #else
import {openFileById} from "../editor/util";
/// #endif

export const getCurrentHomepageCandidateNoteId = () => {
    /// #if MOBILE
    return normalizeHomepageNoteId(window.sourceflow.mobile?.editor?.protyle?.block?.rootID);
    /// #else
    const activeEditor = getAllModels().editor.find((item) => {
        return item.parent.headElement?.classList.contains("item--focus");
    });
    return normalizeHomepageNoteId(activeEditor?.editor?.protyle?.block?.rootID);
    /// #endif
};

export const isHomepageNoteReadable = async (noteId: string) => {
    const normalized = normalizeHomepageNoteId(noteId);
    if (!normalized) {
        return false;
    }
    const response = await fetchSyncPost("/api/block/getBlockInfo", {id: normalized});
    return response.code === 0 && response.data?.rootID === normalized;
};

export const openHomepageNote = async (app: App, noteId: string) => {
    const normalized = normalizeHomepageNoteId(noteId);
    if (!await isHomepageNoteReadable(normalized)) {
        if (getHomepageState().noteId === normalized) {
            clearHomepage();
        }
        return false;
    }
    /// #if MOBILE
    openMobileFileById(app, normalized, [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]);
    /// #else
    await openFileById({app, id: normalized, action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]});
    /// #endif
    return true;
};

export const createHomepageNote = (app: App) => {
    if (window.sourceflow.config.readonly) {
        showMessage(homepageText("当前为只读模式，无法创建主页", "Readonly mode cannot create a homepage"), 4000, "error");
        return;
    }
    newFile({
        app,
        useSavePath: false,
        name: homepageText("主页", "Home"),
        afterCB(id) {
            setHomepageSourceToNote(id);
            showMessage(homepageText("已创建主页", "Homepage created"));
        },
    });
};

export const setCurrentNoteAsHomepage = async (app: App) => {
    const noteId = getCurrentHomepageCandidateNoteId();
    if (!noteId) {
        showMessage(homepageText("请先打开一个笔记", "Open a note first"), 4000, "error");
        return false;
    }
    setHomepageSourceToNote(noteId);
    showMessage(homepageText("已设为主页", "Set as homepage"));
    await openHomepageNote(app, noteId);
    return true;
};
