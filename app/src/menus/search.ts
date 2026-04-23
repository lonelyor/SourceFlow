import {MenuItem} from "./Menu";
import {copySubMenu} from "./commonMenuItem";

export const initSearchMenu = (id: string) => {
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "copy",
        icon: "iconCopy",
        label: window.sourceflow.languages.copy,
        type: "submenu",
        submenu: copySubMenu([id])
    }).element);
    return window.sourceflow.menus.menu;
};
