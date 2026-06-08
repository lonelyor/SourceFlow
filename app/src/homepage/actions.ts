import {App} from "../index";
import {Constants} from "../constants";
import {Dialog} from "../dialog";
import {showMessage} from "../dialog/message";
import {getAllModels} from "../layout/getAll";
import {newFile} from "../util/newFile";
import {fetchPost, fetchSyncPost} from "../util/fetch";
import {escapeHtml} from "../util/escape";
import {homepageText} from "./constants";
import {clearHomepage, getHomepageState, normalizeHomepageNoteId, setHomepageSourceToNote} from "./state";
/// #if MOBILE
import {openMobileFileById} from "../mobile/editor";
/// #else
import {openFileById} from "../editor/util";
/// #endif

interface IHomepageNoteReadiness {
    readable: boolean;
    clearBinding: boolean;
}

interface IHomepageSearchDoc {
    box: string;
    hPath: string;
    path: string;
    rootID: string;
}

const renderHomepageSearchResults = (docs: IHomepageSearchDoc[]) => {
    const noteDocs = docs.filter((item) => normalizeHomepageNoteId(item.rootID));
    if (noteDocs.length === 0) {
        return `<li class="b3-list--empty">${escapeHtml(homepageText("未找到匹配笔记", "No matching notes"))}</li>`;
    }
    return noteDocs.map((item, index) => `<li class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}" data-homepage-note-id="${escapeHtml(item.rootID)}">
    <svg class="b3-list-item__graphic"><use xlink:href="#iconFile"></use></svg>
    <span class="b3-list-item__showall">${escapeHtml(item.hPath || item.path || item.rootID)}</span>
</li>`).join("");
};

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

export const getHomepageNoteReadiness = async (noteId: string): Promise<IHomepageNoteReadiness> => {
    const normalized = normalizeHomepageNoteId(noteId);
    if (!normalized) {
        return {readable: false, clearBinding: true};
    }
    try {
        const response = await fetchSyncPost("/api/block/getBlockInfo", {id: normalized});
        if (response.code === 0) {
            return {readable: response.data?.rootID === normalized, clearBinding: response.data?.rootID !== normalized};
        }
        return {readable: false, clearBinding: response.code === -1};
    } catch (error) {
        console.warn("check homepage note failed", error);
        return {readable: false, clearBinding: false};
    }
};

export const openHomepageNote = async (app: App, noteId: string) => {
    const normalized = normalizeHomepageNoteId(noteId);
    const readiness = await getHomepageNoteReadiness(normalized);
    if (!readiness.readable) {
        if (readiness.clearBinding && getHomepageState().noteId === normalized) {
            clearHomepage();
        }
        return false;
    }
    /// #if MOBILE
    openMobileFileById(app, normalized, [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]);
    /// #else
    try {
        await openFileById({app, id: normalized, action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]});
    } catch (error) {
        console.warn("open homepage note failed", error);
        return false;
    }
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

export const openHomepageNotePicker = (app: App) => {
    let requestId = 0;
    const dialog = new Dialog({
        title: homepageText("选择主页笔记", "Choose Homepage Note"),
        width: "560px",
        content: `<div class="b3-dialog__content homepage-note-picker">
    <input class="b3-text-field fn__block" data-homepage-note-search spellcheck="false" placeholder="${escapeHtml(homepageText("搜索已有笔记", "Search existing notes"))}">
    <ul class="b3-list b3-list--background homepage-note-picker__list" data-homepage-note-list>
        <li class="b3-list--empty">${escapeHtml(homepageText("输入标题搜索已有笔记", "Type to search existing notes"))}</li>
    </ul>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" type="button" data-homepage-note-cancel>${escapeHtml(window.sourceflow.languages.cancel)}</button>
</div>`,
    });
    const inputElement = dialog.element.querySelector("[data-homepage-note-search]") as HTMLInputElement;
    const listElement = dialog.element.querySelector("[data-homepage-note-list]") as HTMLElement;
    const search = (event?: InputEvent) => {
        if (event?.isComposing) {
            return;
        }
        const keyword = inputElement.value.trim();
        if (!keyword) {
            listElement.innerHTML = `<li class="b3-list--empty">${escapeHtml(homepageText("输入标题搜索已有笔记", "Type to search existing notes"))}</li>`;
            return;
        }
        const currentRequestId = ++requestId;
        fetchPost("/api/filetree/searchDocs", {
            k: keyword,
            flashcard: false,
            excludeIDs: [],
        }, (response) => {
            if (currentRequestId !== requestId) {
                return;
            }
            listElement.innerHTML = renderHomepageSearchResults(response.data || []);
        }, undefined, () => {
            if (currentRequestId === requestId) {
                listElement.innerHTML = `<li class="b3-list--empty">${escapeHtml(homepageText("搜索失败", "Search failed"))}</li>`;
            }
        });
    };
    listElement.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }
        const target = event.target.closest("[data-homepage-note-id]") as HTMLElement;
        const noteId = normalizeHomepageNoteId(target?.getAttribute("data-homepage-note-id"));
        if (!noteId) {
            return;
        }
        setHomepageSourceToNote(noteId);
        showMessage(homepageText("已设为主页", "Set as homepage"));
        dialog.destroy({focus: "false"});
        void openHomepageNote(app, noteId);
    });
    dialog.element.querySelector("[data-homepage-note-cancel]")?.addEventListener("click", () => dialog.destroy());
    inputElement.addEventListener("compositionend", search);
    inputElement.addEventListener("input", search);
    dialog.bindInput(inputElement, () => {
        const firstNote = listElement.querySelector("[data-homepage-note-id]") as HTMLElement;
        firstNote?.click();
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
