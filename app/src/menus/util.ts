/// #if !BROWSER
import {ipcRenderer} from "electron";
import * as path from "path";
/// #endif
import {fetchPost} from "../util/fetch";
import {getAssetName, pathPosix, useShell} from "../util/pathName";
import {openFileById} from "../editor/util";
import {Constants} from "../constants";
import {openNewWindowById} from "../window/openNewWindow";
import {MenuItem} from "./Menu";
import {App} from "../index";
import {exportByMobile, isInAndroid, updateHotkeyTip} from "../protyle/util/compatibility";
import {checkFold} from "../util/noRelyPCFunction";
import {showMessage} from "../dialog/message";

export const exportAsset = (src: string) => {
    return {
        id: "export",
        label: window.sourceflow.languages.export,
        icon: "iconUpload",
        async click() {
            /// #if BROWSER
            exportByMobile(src);
            /// #else
            const result = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
                cmd: "showSaveDialog",
                defaultPath: getAssetName(src) + pathPosix().extname(src),
                properties: ["showOverwriteConfirmation"],
            });
            if (!result.canceled) {
                fetchPost("/api/file/copyFile", {src, dest: result.filePath}, (response) => {
                    if (response.code === 0) {
                        showMessage(window.sourceflow.languages.exported);
                    }
                });
            }
            /// #endif
        }
    };
};

// 复制资源文件到系统剪贴板，在文件资源管理器中可粘贴为文件（仅 Windows、macOS 桌面端支持）
export const writeAssetToClipboard = (src: string) => {
    /// #if !BROWSER
    if (["windows", "darwin"].includes(window.sourceflow.config.system.os)) {
        return {
            id: "copyFile",
            label: window.sourceflow.languages.copyFile,
            icon: "iconFile",
            click: () => {
                fetchPost("/api/clipboard/writeFilePath", {path: src}, () => {
                    showMessage(window.sourceflow.languages.copied);
                });
            }
        };
    } else {
        return {ignore: true};
    }
    /// #else
    return {ignore: true};
    /// #endif
};

export const openEditorTab = (app: App, ids: string[], notebookId?: string, pathString?: string, onlyGetMenus = false) => {
    /// #if !MOBILE
    const openSubmenus: IMenu[] = [{
        id: "insertRight",
        icon: "iconLayoutRight",
        label: window.sourceflow.languages.insertRight,
        accelerator: ids.length === 1 ? `${updateHotkeyTip(window.sourceflow.config.keymap.editor.general.insertRight.custom)}/${updateHotkeyTip("⌥" + window.sourceflow.languages.click)}` : undefined,
        click: () => {
            if (notebookId) {
                openFileById({
                    app,
                    id: ids[0],
                    position: "right",
                    action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL]
                });
            } else {
                ids.forEach((id) => {
                    checkFold(id, (zoomIn, action) => {
                        openFileById({
                            app,
                            id,
                            position: "right",
                            action,
                            zoomIn
                        });
                    });
                });
            }
        }
    }, {
        id: "insertBottom",
        icon: "iconLayoutBottom",
        label: window.sourceflow.languages.insertBottom,
        accelerator: ids.length === 1 ? "⇧⌘" + window.sourceflow.languages.click : "",
        click: () => {
            if (notebookId) {
                openFileById({
                    app,
                    id: ids[0],
                    position: "bottom",
                    action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL]
                });
            } else {
                ids.forEach((id) => {
                    checkFold(id, (zoomIn, action) => {
                        openFileById({
                            app,
                            id,
                            position: "bottom",
                            action,
                            zoomIn
                        });
                    });
                });
            }
        }
    }];
    if (window.sourceflow.config.fileTree.openFilesUseCurrentTab) {
        openSubmenus.push({
            id: "openInNewTab",
            label: window.sourceflow.languages.openInNewTab,
            accelerator: ids.length === 1 ? "⌥⌘" + window.sourceflow.languages.click : undefined,
            click: () => {
                if (notebookId) {
                    openFileById({
                        app,
                        id: ids[0],
                        action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL],
                        removeCurrentTab: false
                    });
                } else {
                    ids.forEach((id) => {
                        checkFold(id, (zoomIn, action) => {
                            openFileById({
                                app,
                                id,
                                action,
                                zoomIn,
                                removeCurrentTab: false
                            });
                        });
                    });
                }
            }
        });
    }
    /// #if !BROWSER
    openSubmenus.push({
        id: "openByNewWindow",
        label: window.sourceflow.languages.openByNewWindow,
        icon: "iconOpenWindow",
        click() {
            openNewWindowById(ids);
        }
    });
    /// #endif
    openSubmenus.push({id: "separator_1", type: "separator"});
    openSubmenus.push({
        id: "preview",
        icon: "iconPreview",
        label: window.sourceflow.languages.preview,
        click: () => {
            ids.forEach((id) => {
                openFileById({app, id, mode: "preview"});
            });
        }
    });
    /// #if !BROWSER
    openSubmenus.push({id: "separator_2", type: "separator"});
    openSubmenus.push({
        id: "showInFolder",
        icon: "iconFolder",
        label: window.sourceflow.languages.showInFolder,
        click: () => {
            if (notebookId) {
                useShell("showItemInFolder", path.join(window.sourceflow.config.system.dataDir, notebookId, pathString));
            } else {
                ids.forEach((id) => {
                    fetchPost("/api/block/getBlockInfo", {id}, (response) => {
                        useShell("showItemInFolder", path.join(window.sourceflow.config.system.dataDir, response.data.box, response.data.path));
                    });
                });
            }
        }
    });
    /// #endif
    if (onlyGetMenus) {
        return openSubmenus;
    }
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "openBy",
        label: window.sourceflow.languages.openBy,
        icon: "iconOpen",
        submenu: openSubmenus,
    }).element);
    /// #endif
};

export const copyPNGByLink = (link: string) => {
    if (isInAndroid()) {
        window.JSAndroid.writeImageClipboard(link);
    } else {
        const canvas = document.createElement("canvas");
        const tempElement = document.createElement("img");
        tempElement.onload = (e: Event & { target: HTMLImageElement }) => {
            canvas.width = e.target.width;
            canvas.height = e.target.height;
            canvas.getContext("2d").drawImage(e.target, 0, 0, e.target.width, e.target.height);
            canvas.toBlob((blob) => {
                navigator.clipboard.write([
                    new ClipboardItem({
                        // @ts-ignore
                        ["image/png"]: blob
                    })
                ]);
            }, "image/png", 1);
        };
        tempElement.src = link;
    }
};

