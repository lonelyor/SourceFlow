import {Constants} from "../constants";
import {Dialog} from "../dialog";
import {showMessage} from "../dialog/message";
import {insertHTML} from "../protyle/util/insertHTML";
import {focusByRange} from "../protyle/util/selection";
import {escapeAttr, escapeHtml} from "../util/escape";
import {homepageText} from "./constants";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif

export const HOMEPAGE_SHORTCUT_SLASH_VALUE = `${Constants.ZWSP}homepage-shortcut`;

export type THomepageShortcutKind = "file" | "folder" | "url";

export interface IHomepageShortcutLink {
    kind: THomepageShortcutKind;
    target: string;
    title?: string;
}

export interface IHomepageShortcutDialogOptions {
    range?: Range;
}

const shortcutText = homepageText;

const protocolPattern = /^[a-z][a-z0-9+.-]*:/i;

const normalizeShortcutTitle = (value?: string) => `${value || ""}`.replace(/\s+/g, " ").trim();

const getTargetBasename = (target: string) => {
    const withoutQuery = target.split(/[?#]/)[0] || target;
    const normalized = withoutQuery.replace(/^file:\/\/\/?/i, "").replace(/\\/g, "/").replace(/\/+$/, "");
    const name = normalized.substring(normalized.lastIndexOf("/") + 1);
    try {
        return decodeURIComponent(name || target);
    } catch (error) {
        return name || target;
    }
};

export const inferHomepageShortcutTitle = (shortcut: IHomepageShortcutLink) => {
    const title = normalizeShortcutTitle(shortcut.title);
    if (title) {
        return title;
    }
    if (shortcut.kind === "url") {
        try {
            const url = new URL(normalizeHomepageShortcutTarget(shortcut));
            return url.hostname || url.href;
        } catch (error) {
            return shortcut.target;
        }
    }
    return getTargetBasename(shortcut.target) || shortcutText("快捷入口", "Shortcut");
};

export const normalizeHomepageShortcutTarget = (shortcut: IHomepageShortcutLink) => {
    const target = `${shortcut.target || ""}`.trim();
    if (!target) {
        return "";
    }
    if (shortcut.kind === "url") {
        return protocolPattern.test(target) ? target : `https://${target}`;
    }
    if (/^[a-z]:[\\/]/i.test(target)) {
        return `file:///${target.replace(/\\/g, "/")}`;
    }
    if (target.startsWith("/") && !target.startsWith("//")) {
        return `file://${target}`;
    }
    return target;
};

export const buildHomepageShortcutHTML = (shortcut: IHomepageShortcutLink) => {
    const target = normalizeHomepageShortcutTarget(shortcut);
    const title = inferHomepageShortcutTitle({...shortcut, target});
    const escapedHref = typeof Lute !== "undefined" ? Lute.EscapeHTMLStr(target) : escapeAttr(target);
    return `<span data-type="a" data-href="${escapedHref}">${escapeHtml(title)}</span>`;
};

const getShortcutKindLabel = (kind: THomepageShortcutKind) => {
    if (kind === "file") {
        return shortcutText("本地文件", "Local File");
    }
    if (kind === "folder") {
        return shortcutText("本地文件夹", "Local Folder");
    }
    return shortcutText("网页链接", "Web Link");
};

const getLocalPickerHTML = () => {
    /// #if !BROWSER
    return `<button class="b3-button b3-button--outline" type="button" data-homepage-shortcut-pick="file">
        <svg><use xlink:href="#iconFile"></use></svg><span>${escapeHtml(shortcutText("选择文件", "Choose File"))}</span>
    </button>
    <button class="b3-button b3-button--outline" type="button" data-homepage-shortcut-pick="folder">
        <svg><use xlink:href="#iconFolder"></use></svg><span>${escapeHtml(shortcutText("选择文件夹", "Choose Folder"))}</span>
    </button>`;
    /// #else
    return "";
    /// #endif
};

const pickLocalShortcutPath = async (kind: Exclude<THomepageShortcutKind, "url">) => {
    /// #if !BROWSER
    try {
        const result = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
            cmd: "showOpenDialog",
            defaultPath: window.sourceflow.config.system.homeDir,
            properties: [kind === "folder" ? "openDirectory" : "openFile"],
        });
        if (result?.canceled || !result?.filePaths?.length) {
            return "";
        }
        return result.filePaths[0] || "";
    } catch (error) {
        console.warn("pick homepage shortcut path failed", error);
        showMessage(shortcutText("选择路径失败", "Failed to choose path"), 4000, "error");
        return "";
    }
    /// #else
    void kind;
    return "";
    /// #endif
};

export const insertHomepageShortcut = (
    protyle: IProtyle,
    shortcut: IHomepageShortcutLink,
    range?: Range,
) => {
    if (range) {
        focusByRange(range);
    }
    insertHTML(buildHomepageShortcutHTML(shortcut), protyle);
};

export const openHomepageShortcutDialog = (protyle: IProtyle, options: IHomepageShortcutDialogOptions = {}) => {
    if (protyle.disabled || window.sourceflow.config.readonly) {
        showMessage(shortcutText("当前为只读模式，无法插入快捷入口", "Readonly mode cannot insert a shortcut"), 4000, "error");
        return;
    }
    const selectionText = normalizeShortcutTitle(options.range?.toString());
    const insertRange = options.range?.cloneRange();
    let kind: THomepageShortcutKind = "url";
    const dialog = new Dialog({
        title: shortcutText("插入快捷入口", "Insert Shortcut"),
        width: "520px",
        content: `<div class="b3-dialog__content homepage-shortcut-dialog">
    <div class="homepage-shortcut-dialog__types" data-homepage-shortcut-types>
        ${(["url", "file", "folder"] as THomepageShortcutKind[]).map((item) => `<button class="b3-button b3-button--outline" type="button" data-homepage-shortcut-kind="${item}">
            <span>${escapeHtml(getShortcutKindLabel(item))}</span>
        </button>`).join("")}
    </div>
    <label class="b3-label">
        <div class="b3-label__text">${escapeHtml(shortcutText("标题", "Title"))}</div>
        <input class="b3-text-field fn__block" data-homepage-shortcut-title value="${escapeAttr(selectionText)}" spellcheck="false">
    </label>
    <label class="b3-label">
        <div class="b3-label__text">${escapeHtml(shortcutText("目标", "Target"))}</div>
        <input class="b3-text-field fn__block" data-homepage-shortcut-target spellcheck="false">
    </label>
    <div class="homepage-shortcut-dialog__pickers">${getLocalPickerHTML()}</div>
    <div class="b3-label__text">${escapeHtml(shortcutText("只会插入普通链接；目标仅在用户手动点击链接时打开。", "This inserts a normal link; the target opens only when clicked manually."))}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" type="button" data-homepage-shortcut-cancel>${escapeHtml(window.sourceflow.languages.cancel)}</button>
    <div class="fn__space"></div>
    <button class="b3-button" type="button" data-homepage-shortcut-submit>${escapeHtml(window.sourceflow.languages.confirm)}</button>
</div>`,
    });
    const titleInput = dialog.element.querySelector("[data-homepage-shortcut-title]") as HTMLInputElement;
    const targetInput = dialog.element.querySelector("[data-homepage-shortcut-target]") as HTMLInputElement;
    const submit = () => {
        const target = targetInput.value.trim();
        if (!target) {
            showMessage(shortcutText("请输入或选择目标", "Enter or choose a target"), 4000, "error");
            return;
        }
        insertHomepageShortcut(protyle, {
            kind,
            target,
            title: titleInput.value,
        }, insertRange);
        dialog.destroy({focus: "false"});
    };
    const updateKind = (nextKind: THomepageShortcutKind) => {
        kind = nextKind;
        dialog.element.querySelectorAll("[data-homepage-shortcut-kind]").forEach((item) => {
            item.classList.toggle("b3-button--text", item.getAttribute("data-homepage-shortcut-kind") === kind);
        });
        targetInput.placeholder = kind === "url"
            ? shortcutText("https://example.com", "https://example.com")
            : shortcutText("选择或粘贴本地路径", "Choose or paste a local path");
    };
    dialog.element.querySelector("[data-homepage-shortcut-types]")?.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }
        const target = event.target.closest("[data-homepage-shortcut-kind]") as HTMLElement;
        const nextKind = target?.getAttribute("data-homepage-shortcut-kind") as THomepageShortcutKind;
        if (nextKind) {
            updateKind(nextKind);
            event.preventDefault();
        }
    });
    dialog.element.querySelectorAll("[data-homepage-shortcut-pick]").forEach((item) => {
        item.addEventListener("click", async () => {
            const nextKind = item.getAttribute("data-homepage-shortcut-pick") as Exclude<THomepageShortcutKind, "url">;
            const localPath = await pickLocalShortcutPath(nextKind);
            if (!localPath) {
                return;
            }
            updateKind(nextKind);
            targetInput.value = localPath;
            if (!normalizeShortcutTitle(titleInput.value)) {
                titleInput.value = inferHomepageShortcutTitle({kind: nextKind, target: localPath});
            }
        });
    });
    dialog.element.querySelector("[data-homepage-shortcut-cancel]")?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelector("[data-homepage-shortcut-submit]")?.addEventListener("click", submit);
    dialog.bindInput(targetInput, submit);
    updateKind(kind);
};
