import {fetchPost} from "../util/fetch";
import {escapeHtml} from "../util/escape";
import {Dialog} from "../dialog";
import {MenuItem} from "../menus/Menu";

interface ITemplateItem {
    path: string;
    content: string;
}

const TEMPLATE_SUBMENU_ID = "newFromTemplate";

const fetchTemplates = (): Promise<ITemplateItem[]> => {
    return new Promise((resolve) => {
        fetchPost("/api/search/searchTemplate", {k: ""}, (response) => {
            resolve(response.data?.templates || []);
        });
    });
};

export const fillTemplateSubMenu = (callback: (markdown: string) => void) => {
    const lang = window.sourceflow.config.lang;
    const loadingLabel = lang === "zh_CN" ? "加载中..." : "Loading...";
    const emptyLabel = lang === "zh_CN" ? "（无模板）" : "(No templates)";
    const manageLabel = lang === "zh_CN" ? "管理模板..." : "Manage Templates...";

    const container = window.sourceflow.menus.menu.element.querySelector(
        `[data-id="${TEMPLATE_SUBMENU_ID}"] .b3-menu__submenu .b3-menu__items`,
    );
    if (!container) {
        return;
    }
    container.innerHTML = new MenuItem({
        id: "template-loading",
        iconHTML: "",
        label: loadingLabel,
        type: "readonly",
    })?.element?.outerHTML || "";

    void fetchTemplates().then((templates) => {
        container.innerHTML = "";
        if (templates.length === 0) {
            container.append(new MenuItem({
                id: "template-empty",
                iconHTML: "",
                label: emptyLabel,
                type: "readonly",
            })?.element || "");
        } else {
            templates.forEach((item) => {
                const name = item.path.split(/[\\/]/).pop() || item.path;
                container.append(new MenuItem({
                    id: "template-" + name,
                    iconHTML: "",
                    label: name,
                    click: () => {
                        callback(item.content);
                    },
                })?.element || "");
            });
        }
        container.append(new MenuItem({id: "template-sep", type: "separator"})?.element || "");
        container.append(new MenuItem({
            id: "template-manage",
            icon: "iconSettings",
            label: manageLabel,
            click: () => {
                void import("./index").then(({openSettingTab}) => {
                    openSettingTab(window.sourceflow.ws.app, "templateLibrary");
                });
            },
        })?.element || "");
    });
};

export const genTemplateSubMenuItems = (callback: (markdown: string) => void): IMenu[] => {
    const lang = window.sourceflow.config.lang;
    const loadingLabel = lang === "zh_CN" ? "加载中..." : "Loading...";
    fillTemplateSubMenu(callback);
    return [{
        id: "template-placeholder",
        iconHTML: "",
        label: loadingLabel,
        type: "readonly",
    }];
};

export const openTemplatePicker = (): Promise<string> => {
    return new Promise((resolve) => {
        const dialog = new Dialog({
            title: window.sourceflow.languages.template || "Templates",
            content: `<div class="template-picker">
    <div class="template-picker__list" id="templatePickerList">
        <div class="fn__flex-1 fn__flex-column fn__flex-center ft__secondary">${window.sourceflow.languages.loading || "Loading..."}</div>
    </div>
    <div class="template-picker__footer">
        <button class="b3-button b3-button--cancel" id="templatePickerSkip">${window.sourceflow.languages.skip || "Skip"}</button>
    </div>
</div>`,
            width: "520px",
            height: "420px",
        });

        const listEl = dialog.element.querySelector("#templatePickerList") as HTMLElement;
        const skipBtn = dialog.element.querySelector("#templatePickerSkip") as HTMLElement;

        const close = (result: string) => {
            dialog.destroy();
            resolve(result);
        };

        skipBtn.addEventListener("click", () => close(""));

        fetchPost("/api/search/searchTemplate", {k: ""}, (response) => {
            const templates: ITemplateItem[] = response.data?.templates || [];
            if (templates.length === 0) {
                listEl.innerHTML = `<div class="fn__flex-1 fn__flex-column fn__flex-center ft__secondary">${window.sourceflow.languages.emptyContent || "No templates"}</div>`;
                return;
            }

            let html = "";
            templates.forEach((item, index) => {
                const name = escapeHtml(item.path.split(/[\\/]/).pop() || item.path);
                const preview = escapeHtml(item.content.slice(0, 100));
                html += `<div class="template-picker__item" data-index="${index}">
    <div class="template-picker__item-name">${name}</div>
    <div class="template-picker__item-preview">${preview}</div>
</div>`;
            });
            listEl.innerHTML = html;

            listEl.addEventListener("click", (event) => {
                const target = event.target as HTMLElement;
                const itemEl = target.closest(".template-picker__item") as HTMLElement;
                if (!itemEl) {
                    return;
                }
                const index = parseInt(itemEl.getAttribute("data-index") || "0", 10);
                const item = templates[index];
                if (item) {
                    close(item.content);
                }
            });
        });
    });
};
