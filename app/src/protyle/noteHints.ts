import {Constants} from "../constants";
import {escapeAttr, escapeHtml} from "../util/escape";
import {fetchPost} from "../util/fetch";
import {pathPosix} from "../util/pathName";

interface IDocSearchResult {
    box: string;
    hPath: string;
    path: string;
    rootID: string;
}

interface INoteHint {
    icon: string;
    text: string;
    type: string;
}

const HINTS_SELECTOR = ".protyle-note-hints";
const NOTE_HINTS_DELAY = 260;

const language = (key: string, fallback: string) => {
    return window.sourceflow.languages[key] || fallback;
};

const getHintElement = (protyle: IProtyle) => {
    let hintElement = protyle.contentElement.querySelector(HINTS_SELECTOR) as HTMLElement;
    if (hintElement) {
        return hintElement;
    }
    hintElement = document.createElement("div");
    hintElement.className = "protyle-note-hints fn__none";
    hintElement.setAttribute("contenteditable", "false");
    protyle.wysiwyg.element.before(hintElement);
    return hintElement;
};

const isNoteHintAvailable = (protyle: IProtyle) => {
    return !!protyle.options.render.title &&
        !protyle.block.showAll &&
        !protyle.options.backlinkData &&
        !!protyle.block.rootID;
};

const isMeaningfulBlock = (blockElement: Element) => {
    if (!blockElement.getAttribute("data-node-id")) {
        return false;
    }
    if (blockElement.matches(".protyle-note-hints, .protyle-current-heading")) {
        return false;
    }
    const type = blockElement.getAttribute("data-type");
    if (type !== "NodeParagraph") {
        return true;
    }
    const editableElement = blockElement.querySelector("[contenteditable='true']") as HTMLElement;
    const text = (editableElement?.textContent || "").replace(new RegExp(Constants.ZWSP, "g"), "").replace(/\s+/g, "").trim();
    return !!text || !!blockElement.querySelector("img, video, audio, iframe, table, .render-node, .av");
};

const isEmptyDocument = (protyle: IProtyle) => {
    return !Array.from(protyle.wysiwyg.element.children).some(isMeaningfulBlock);
};

const getCurrentTitle = (protyle: IProtyle) => {
    return (protyle.title?.editElement?.textContent || "").replace(/\s+/g, " ").trim();
};

const isSkippableDuplicateTitle = (title: string) => {
    return !title || title === window.sourceflow.languages.untitled;
};

const getSearchResultTitle = (item: IDocSearchResult) => {
    const hPathParts = (item.hPath || "").split("/").filter(Boolean);
    if (hPathParts.length > 0) {
        return hPathParts[hPathParts.length - 1];
    }
    return pathPosix().basename((item.path || "").replace(/\.sf$/, ""));
};

const fetchDuplicateCount = (protyle: IProtyle, title: string, cb: (count: number) => void) => {
    if (isSkippableDuplicateTitle(title)) {
        cb(0);
        return;
    }
    fetchPost("/api/filetree/searchDocs", {
        k: title,
        flashcard: false,
        excludeIDs: [],
    }, (response) => {
        const duplicates = ((response.data || []) as IDocSearchResult[]).filter((item) => {
            return item.box === protyle.notebookId &&
                item.rootID &&
                item.rootID !== protyle.block.rootID &&
                getSearchResultTitle(item) === title;
        });
        cb(duplicates.length);
    }, undefined, () => cb(0));
};

const renderHints = (protyle: IProtyle, hints: INoteHint[]) => {
    const hintElement = getHintElement(protyle);
    if (hints.length === 0) {
        hintElement.classList.add("fn__none");
        hintElement.innerHTML = "";
        return;
    }
    let html = "";
    hints.forEach((hint) => {
        html += `<div class="protyle-note-hints__item" data-type="${escapeAttr(hint.type)}">
    <svg><use xlink:href="#${escapeAttr(hint.icon)}"></use></svg>
    <span>${escapeHtml(hint.text)}</span>
</div>`;
    });
    hintElement.innerHTML = html;
    hintElement.classList.remove("fn__none");
};

const refreshNoteHints = (protyle: IProtyle) => {
    const hintElement = getHintElement(protyle);
    if (!isNoteHintAvailable(protyle)) {
        hintElement.classList.add("fn__none");
        hintElement.innerHTML = "";
        return;
    }
    const requestId = `${Date.now()}-${Math.random()}`;
    hintElement.dataset.requestId = requestId;
    const hints: INoteHint[] = [];
    if (isEmptyDocument(protyle)) {
        hints.push({
            icon: "iconInfo",
            text: language("noteHintEmptyDoc", "This document has no body content yet"),
            type: "empty",
        });
    }
    const title = getCurrentTitle(protyle);
    fetchDuplicateCount(protyle, title, (count) => {
        if (hintElement.dataset.requestId !== requestId) {
            return;
        }
        if (count > 0) {
            hints.push({
                icon: "iconFiles",
                text: language("noteHintDuplicateDoc", "There are ${x} documents with the same title").replace("${x}", count.toString()),
                type: "duplicate",
            });
        }
        renderHints(protyle, hints);
    });
};

const bindNoteHintEvents = (protyle: IProtyle) => {
    if (protyle.contentElement.dataset.noteHintsBound === "true") {
        return;
    }
    protyle.contentElement.dataset.noteHintsBound = "true";
    protyle.contentElement.addEventListener("input", () => {
        scheduleNoteHints(protyle);
    });
    protyle.title?.editElement?.addEventListener("input", () => {
        scheduleNoteHints(protyle);
    });
};

export const scheduleNoteHints = (protyle: IProtyle) => {
    if (protyle.options.action?.includes(Constants.CB_GET_HISTORY)) {
        return;
    }
    bindNoteHintEvents(protyle);
    const hintElement = getHintElement(protyle);
    if (hintElement.dataset.timer) {
        window.clearTimeout(Number(hintElement.dataset.timer));
    }
    const timer = window.setTimeout(() => {
        delete hintElement.dataset.timer;
        refreshNoteHints(protyle);
    }, NOTE_HINTS_DELAY);
    hintElement.dataset.timer = timer.toString();
};
