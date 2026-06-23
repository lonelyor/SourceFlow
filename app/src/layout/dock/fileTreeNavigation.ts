import {Constants} from "../../constants";
import {unicode2Emoji} from "../../emoji";
import {escapeAriaLabel, escapeAttr, escapeHtml} from "../../util/escape";
import {fetchPost} from "../../util/fetch";

interface IFileTreeNavigationHost {
    selectItem(notebookId: string, filePath: string, data?: {
        files: IFile[],
        box: string,
        path: string
    }, setStorage?: boolean, isSetCurrent?: boolean): Promise<HTMLElement>;
    openDoc(rootID: string): void;
}

interface ISearchDocResult {
    boxIcon: string;
    box: string;
    hPath: string;
    path: string;
    rootID: string;
}

interface IRecentDocItem {
    rootID: string;
    icon: string;
    title: string;
    viewedAt?: number;
    updated?: number;
    openAt?: number;
}

interface IPathResponse {
    notebook: string;
    path: string;
}

const MAX_FILTER_RESULTS = 24;
const MAX_SHORTCUT_ITEMS = 5;
const FILTER_DELAY = 180;
const COLLAPSED_STORAGE_KEY = "file-tree-nav-collapsed";
const DEFAULT_COLLAPSED_NAV_GROUPS = ["recent-edited", "frequent"];

const language = (key: string, fallback: string) => {
    return window.sourceflow.languages[key] || fallback;
};

const renderIcon = (icon: string, fallback: string) => {
    return unicode2Emoji(icon || fallback, "b3-list-item__graphic", true);
};

const getNotebookName = (notebookId: string) => {
    const notebook = window.sourceflow.notebooks?.find((item) => item.id === notebookId);
    return notebook?.name || notebookId;
};

export const genFileTreeStatusMarksHTML = (item: Pick<IFile, "bookmark" | "subFileCount">) => {
    let html = "";
    if (item.bookmark) {
        const label = `${window.sourceflow.languages.bookmark}: ${item.bookmark}`;
        html += `<span class="file-tree__status-mark ariaLabel" data-status="bookmark" data-position="parentE" aria-label="${escapeAriaLabel(label)}">
    <svg><use xlink:href="#iconBookmark"></use></svg>
</span>`;
    }
    if (item.subFileCount > 0) {
        html += `<span class="file-tree__status-mark ariaLabel" data-status="subdoc" data-position="parentE" aria-label="${escapeAriaLabel(language("fileTreeStatusSubDocs", "Has child documents"))}">
    <svg><use xlink:href="#iconFolder"></use></svg>
</span>`;
    }
    if (!html) {
        return "";
    }
    return `<span class="file-tree__status-marks">${html}</span>`;
};

export const syncFileTreeStatusMarksElement = (
    itemElement: Element,
    item: Pick<IFile, "bookmark" | "subFileCount">,
) => {
    itemElement.querySelector(".file-tree__status-marks")?.remove();
    const statusHTML = genFileTreeStatusMarksHTML(item);
    if (!statusHTML) {
        return;
    }
    const actionElement = itemElement.querySelector(".b3-list-item__action");
    if (actionElement) {
        actionElement.insertAdjacentHTML("beforebegin", statusHTML);
        return;
    }
    itemElement.insertAdjacentHTML("beforeend", statusHTML);
};

export class FileTreeNavigation {
    private container: HTMLElement;
    private host: IFileTreeNavigationHost;
    private inputElement: HTMLInputElement;
    private resultElement: HTMLElement;
    private shortcutElement: HTMLElement;
    private pathElement: HTMLElement;
    private filterTimer = 0;
    private filterRequestId = "";
    private shortcutRequestId = "";
    private currentNotebookId = "";
    private currentPath = "/";
    private currentRootId = "";

    constructor(container: HTMLElement, host: IFileTreeNavigationHost) {
        this.container = container;
        this.host = host;
        this.renderShell();
        this.bindEvents();
        this.refreshShortcuts();
    }

    public refreshShortcuts() {
        const requestId = `${Date.now()}-${Math.random()}`;
        this.shortcutRequestId = requestId;
        this.shortcutElement.innerHTML = `<div class="file-tree__nav-empty">${escapeHtml(window.sourceflow.languages.loading)}</div>`;
        this.fetchRecentDocs("updated", (updatedDocs) => {
            if (this.shortcutRequestId !== requestId) {
                return;
            }
            this.fetchRecentDocs("viewedAt", (viewedDocs) => {
                if (this.shortcutRequestId !== requestId) {
                    return;
                }
                this.renderShortcuts(updatedDocs, viewedDocs);
            });
        });
    }

    public updateCurrentPath(target: HTMLElement) {
        const notebookElement = target.closest("ul[data-url]") as HTMLElement;
        if (!notebookElement) {
            return;
        }
        this.currentNotebookId = notebookElement.getAttribute("data-url") || "";
        this.currentPath = target.getAttribute("data-path") || "/";
        this.currentRootId = target.getAttribute("data-node-id") || "";

        if (!this.currentRootId) {
            this.renderCurrentPath(`${getNotebookName(this.currentNotebookId)} /`);
            return;
        }
        const requestId = `${this.currentRootId}-${Date.now()}`;
        this.pathElement.dataset.requestId = requestId;
        fetchPost("/api/filetree/getFullHPathByID", {
            id: this.currentRootId,
        }, (response) => {
            if (this.pathElement.dataset.requestId !== requestId) {
                return;
            }
            this.renderCurrentPath(response.data || target.querySelector(".b3-list-item__text")?.textContent || "");
        }, undefined, () => {
            if (this.pathElement.dataset.requestId !== requestId) {
                return;
            }
            this.renderCurrentPath(target.querySelector(".b3-list-item__text")?.textContent || "");
        });
    }

    private renderShell() {
        this.container.classList.add("file-tree__navigation");
        this.container.innerHTML = `<div class="file-tree__filter b3-form__icon">
    <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
    <input class="b3-text-field b3-form__icon-input" placeholder="${escapeAttr(language("fileTreeFilterPlaceholder", "Filter documents"))}">
</div>
<button type="button" class="file-tree__current-path ariaLabel" data-type="currentPath" data-position="parentE" aria-label="${escapeAriaLabel(language("fileTreeCurrentPath", "Current document path"))}">
    <svg><use xlink:href="#iconFocus"></use></svg>
    <span>${escapeHtml(language("fileTreeNoCurrentPath", "No document selected"))}</span>
</button>
<div class="file-tree__nav-results fn__none"></div>
<div class="file-tree__nav-shortcuts"></div>`;
        this.inputElement = this.container.querySelector(".file-tree__filter input") as HTMLInputElement;
        this.resultElement = this.container.querySelector(".file-tree__nav-results") as HTMLElement;
        this.shortcutElement = this.container.querySelector(".file-tree__nav-shortcuts") as HTMLElement;
        this.pathElement = this.container.querySelector(".file-tree__current-path") as HTMLElement;
    }

    private bindEvents() {
        this.inputElement.addEventListener("compositionend", () => {
            this.scheduleFilter();
        });
        this.inputElement.addEventListener("input", (event: InputEvent) => {
            if (event.isComposing) {
                return;
            }
            this.scheduleFilter();
        });
        this.container.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            const toggleTarget = target.closest('[data-action="toggle-nav-group"]') as HTMLElement;
            if (toggleTarget) {
                const group = toggleTarget.closest(".file-tree__nav-group") as HTMLElement;
                if (group) {
                    group.classList.toggle("file-tree__nav-group--collapsed");
                    this.saveCollapsedState();
                }
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const pathButton = target.closest('[data-type="currentPath"]') as HTMLElement;
            if (pathButton) {
                this.focusCurrentTreeItem();
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const itemElement = target.closest("[data-type='file-tree-nav-item']") as HTMLElement;
            if (!itemElement) {
                return;
            }
            this.openNavigationItem(itemElement);
            event.preventDefault();
            event.stopPropagation();
        });
    }

    private scheduleFilter() {
        if (this.filterTimer) {
            window.clearTimeout(this.filterTimer);
        }
        this.filterTimer = window.setTimeout(() => {
            this.filterTimer = 0;
            this.runFilter();
        }, FILTER_DELAY);
    }

    private runFilter() {
        const keyword = this.inputElement.value.trim();
        if (!keyword) {
            this.resultElement.classList.add("fn__none");
            this.shortcutElement.classList.remove("fn__none");
            this.resultElement.innerHTML = "";
            return;
        }
        const requestId = `${Date.now()}-${Math.random()}`;
        this.filterRequestId = requestId;
        this.shortcutElement.classList.add("fn__none");
        this.resultElement.classList.remove("fn__none");
        this.resultElement.innerHTML = `<div class="file-tree__nav-empty">${escapeHtml(window.sourceflow.languages.loading)}</div>`;
        fetchPost("/api/filetree/searchDocs", {
            k: keyword,
            flashcard: false,
            excludeIDs: [],
        }, (response) => {
            if (this.filterRequestId !== requestId) {
                return;
            }
            this.renderFilterResults((response.data || []) as ISearchDocResult[]);
        }, undefined, () => {
            if (this.filterRequestId === requestId) {
                this.resultElement.innerHTML = `<div class="file-tree__nav-empty">${escapeHtml(language("fileTreeFilterFailed", "Filter failed"))}</div>`;
            }
        });
    }

    private renderFilterResults(data: ISearchDocResult[]) {
        if (data.length === 0) {
            this.resultElement.innerHTML = `<div class="file-tree__nav-empty">${escapeHtml(language("fileTreeNoFilterResult", "No matching documents"))}</div>`;
            return;
        }
        const limitedData = data.slice(0, MAX_FILTER_RESULTS);
        let html = `<div class="file-tree__nav-group-title">${escapeHtml(language("fileTreeFilterResults", "Filter results"))}</div><ul class="b3-list b3-list--background">`;
        limitedData.forEach((item) => {
            html += `<li class="b3-list-item" data-type="file-tree-nav-item" data-source="filter" data-node-id="${escapeAttr(item.rootID || "")}" data-box="${escapeAttr(item.box)}" data-path="${escapeAttr(item.path)}">
    ${renderIcon(item.boxIcon, window.sourceflow.storage[Constants.LOCAL_IMAGES].note)}
    <span class="b3-list-item__text">${escapeHtml(item.hPath)}</span>
</li>`;
        });
        html += "</ul>";
        this.resultElement.innerHTML = html;
    }

    private fetchRecentDocs(sortBy: TRecentDocsSort, cb: (items: IRecentDocItem[]) => void) {
        fetchPost("/api/storage/getRecentDocs", {sortBy}, (response) => {
            cb(((response.data || []) as IRecentDocItem[]).filter((item) => !!item.rootID));
        }, undefined, () => {
            cb([]);
        });
    }

    private renderShortcuts(updatedDocs: IRecentDocItem[], viewedDocs: IRecentDocItem[]) {
        const updatedHTML = this.renderShortcutGroup(
            language("fileTreeRecentEdited", "Recently edited"),
            "recent-edited",
            updatedDocs,
        );
        const viewedHTML = this.renderShortcutGroup(
            language("fileTreeFrequentDocs", "Frequent documents"),
            "frequent",
            viewedDocs,
        );
        if (!updatedHTML && !viewedHTML) {
            this.shortcutElement.innerHTML = "";
            return;
        }
        this.shortcutElement.innerHTML = updatedHTML + viewedHTML;
        this.restoreCollapsedState();
    }

    private renderShortcutGroup(title: string, source: string, docs: IRecentDocItem[]) {
        const uniqueDocs = docs.filter((item, index) => {
            return docs.findIndex((doc) => doc.rootID === item.rootID) === index;
        }).slice(0, MAX_SHORTCUT_ITEMS);
        if (uniqueDocs.length === 0) {
            return "";
        }
        let html = `<div class="file-tree__nav-group" data-nav-group="${escapeAttr(source)}"><div class="file-tree__nav-group-title" data-action="toggle-nav-group"><svg><use xlink:href="#iconRight"></use></svg>${escapeHtml(title)}</div><ul class="b3-list b3-list--background">`;
        uniqueDocs.forEach((item) => {
            html += `<li class="b3-list-item" data-type="file-tree-nav-item" data-source="${escapeAttr(source)}" data-node-id="${escapeAttr(item.rootID)}">
    ${renderIcon(item.icon, window.sourceflow.storage[Constants.LOCAL_IMAGES].file)}
    <span class="b3-list-item__text">${escapeHtml(item.title)}</span>
</li>`;
        });
        return html + "</ul></div>";
    }

    private saveCollapsedState() {
        const collapsed: string[] = [];
        this.shortcutElement.querySelectorAll(".file-tree__nav-group").forEach((group) => {
            if (group.classList.contains("file-tree__nav-group--collapsed")) {
                const key = group.getAttribute("data-nav-group") || "";
                if (key) {
                    collapsed.push(key);
                }
            }
        });
        try {
            localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed));
        } catch { /* ignore */ }
    }

    private restoreCollapsedState() {
        let collapsed = DEFAULT_COLLAPSED_NAV_GROUPS;
        try {
            const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
            if (raw !== null) {
                const parsed = JSON.parse(raw);
                collapsed = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
            }
        } catch { /* ignore */ }
        if (!collapsed.length) {
            return;
        }
        this.shortcutElement.querySelectorAll(".file-tree__nav-group").forEach((group) => {
            const key = group.getAttribute("data-nav-group") || "";
            if (collapsed.includes(key)) {
                group.classList.add("file-tree__nav-group--collapsed");
            }
        });
    }

    private renderCurrentPath(pathText: string) {
        const text = pathText || language("fileTreeNoCurrentPath", "No document selected");
        this.pathElement.setAttribute("aria-label", `${language("fileTreeCurrentPath", "Current document path")}: ${text}`);
        const textElement = this.pathElement.querySelector("span");
        if (textElement) {
            textElement.textContent = text;
        }
    }

    private openNavigationItem(itemElement: HTMLElement) {
        const source = itemElement.dataset.source || "";
        const rootID = itemElement.dataset.nodeId || "";
        const notebook = itemElement.dataset.box || "";
        const path = itemElement.dataset.path || "/";
        if (source === "filter" && notebook) {
            void this.host.selectItem(notebook, path);
        }
        if (rootID) {
            void this.selectTreeItemById(rootID);
            this.host.openDoc(rootID);
        }
    }

    private focusCurrentTreeItem() {
        if (this.currentRootId) {
            void this.selectTreeItemById(this.currentRootId);
            return;
        }
        if (this.currentNotebookId) {
            void this.host.selectItem(this.currentNotebookId, this.currentPath);
        }
    }

    private selectTreeItemById(rootID: string) {
        fetchPost("/api/filetree/getPathByID", {id: rootID}, (response) => {
            const data = response.data as IPathResponse;
            if (!data?.notebook || !data.path) {
                return;
            }
            void this.host.selectItem(data.notebook, data.path);
        }, undefined, () => undefined);
    }
}
