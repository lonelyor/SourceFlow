/// #if !BROWSER
import {shell} from "electron";
/// #endif
import {App} from "../../index";
import {showMessage} from "../../dialog/message";
import {openAssetNewWindow} from "../../window/openNewWindow";
import {getSearch} from "../../util/functions";
import {isLocalPath, pathPosix} from "../../util/pathName";
import {isInAndroid, isInHarmony, openByMobile} from "../../protyle/util/compatibility";
/// #if !MOBILE
import {openAsset, openBy} from "../../editor/util";
/// #endif
import {Constants} from "../../constants";
import {MenuItem} from "../Menu";

export const openMenu = (app: App, src: string, onlyMenu: boolean, showAccelerator: boolean) => {
    const submenu = [];
    /// #if MOBILE
    submenu.push({
        id: isInAndroid() ? "useDefault" : "useBrowserView",
        label: isInAndroid() ? window.sourceflow.languages.useDefault : window.sourceflow.languages.useBrowserView,
        accelerator: showAccelerator ? window.sourceflow.languages.click : "",
        click: () => {
            openByMobile(src);
        }
    });
    /// #else
    if (isLocalPath(src)) {
        if (Constants.SOURCEFLOW_ASSETS_EXTS.includes(pathPosix().extname(src).split("?")[0]) &&
            (!src.endsWith(".pdf") || (src.endsWith(".pdf") && !src.startsWith("file://")))) {
            submenu.push({
                id: "insertRight",
                icon: "iconLayoutRight",
                label: window.sourceflow.languages.insertRight,
                accelerator: showAccelerator ? window.sourceflow.languages.click : "",
                click() {
                    openAsset(app, src.trim(), parseInt(getSearch("page", src)), "right");
                }
            });
            submenu.push({
                id: "openBy",
                label: window.sourceflow.languages.openBy,
                icon: "iconOpen",
                accelerator: showAccelerator ? "⌥" + window.sourceflow.languages.click : "",
                click() {
                    openAsset(app, src.trim(), parseInt(getSearch("page", src)));
                }
            });
            /// #if !BROWSER
            submenu.push({
                id: "openByNewWindow",
                label: window.sourceflow.languages.openByNewWindow,
                icon: "iconOpenWindow",
                click() {
                    openAssetNewWindow(src.trim());
                }
            });
            submenu.push({
                id: "showInFolder",
                icon: "iconFolder",
                label: window.sourceflow.languages.showInFolder,
                accelerator: showAccelerator ? "⌘" + window.sourceflow.languages.click : "",
                click: () => {
                    openBy(src, "folder");
                }
            });
            submenu.push({
                id: "useDefault",
                label: window.sourceflow.languages.useDefault,
                accelerator: showAccelerator ? "⇧" + window.sourceflow.languages.click : "",
                click() {
                    openBy(src, "app");
                }
            });
            /// #endif
        } else {
            /// #if !BROWSER
            submenu.push({
                id: "useDefault",
                label: window.sourceflow.languages.useDefault,
                accelerator: showAccelerator ? window.sourceflow.languages.click : "",
                click() {
                    openBy(src, "app");
                }
            });
            submenu.push({
                id: "showInFolder",
                icon: "iconFolder",
                label: window.sourceflow.languages.showInFolder,
                accelerator: showAccelerator ? "⌘" + window.sourceflow.languages.click : "",
                click: () => {
                    openBy(src, "folder");
                }
            });
            /// #else
            submenu.push({
                id: isInAndroid() || isInHarmony() ? "useDefault" : "useBrowserView",
                label: isInAndroid() || isInHarmony() ? window.sourceflow.languages.useDefault : window.sourceflow.languages.useBrowserView,
                accelerator: showAccelerator ? window.sourceflow.languages.click : "",
                click: () => {
                    openByMobile(src);
                }
            });
            /// #endif
        }
    } else if (src) {
        if (0 > src.indexOf(":")) {
            src = `https://${src}`;
        }
        /// #if !BROWSER
        submenu.push({
            id: "useDefault",
            label: window.sourceflow.languages.useDefault,
            accelerator: showAccelerator ? window.sourceflow.languages.click : "",
            click: () => {
                shell.openExternal(src).catch((e) => {
                    showMessage(e);
                });
            }
        });
        /// #else
        submenu.push({
            id: isInAndroid() || isInHarmony() ? "useDefault" : "useBrowserView",
            label: isInAndroid() || isInHarmony() ? window.sourceflow.languages.useDefault : window.sourceflow.languages.useBrowserView,
            accelerator: showAccelerator ? window.sourceflow.languages.click : "",
            click: () => {
                openByMobile(src);
            }
        });
        /// #endif
    }
    /// #endif
    if (onlyMenu) {
        return submenu;
    }
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "openBy",
        label: window.sourceflow.languages.openBy,
        icon: "iconOpen",
        submenu
    }).element);
};
