import {Tab} from "../Tab";
import {Model} from "../Model";
import {Tree} from "../../util/Tree";
import {setPanelFocus} from "../util";
import {getDockByType} from "../tabUtil";
import {fetchPost} from "../../util/fetch";
import {updateHotkeyAfterTip} from "../../protyle/util/compatibility";
import {openGlobalSearch} from "../../search/util";
import {MenuItem} from "../../menus/Menu";
import {App} from "../../index";
import {openTagMenu} from "../../menus/tag";
import {hasClosestByClassName} from "../../protyle/util/hasClosest";
import {Constants} from "../../constants";

export class Tag extends Model {
    private openNodes: string[];
    public tree: Tree;
    private element: Element;

    constructor(app: App, tab: Tab) {
        super({
            app,
            id: tab.id,
            msgCallback(data) {
                if (data) {
                    switch (data.cmd) {
                        case "transactions":
                            data.data[0].doOperations.forEach((item: IOperation) => {
                                let needReload = false;
                                if ((item.action === "update" || item.action === "insert") && item.data.indexOf('data-type="tag"') > -1) {
                                    needReload = true;
                                } else if (item.action === "delete") {
                                    needReload = true;
                                }
                                if (needReload) {
                                    this.update();
                                }
                            });
                            break;
                        case "closeBox":
                        case "removeBox":
                        case "removeDoc":
                        case "mount":
                            if (data.cmd !== "mount" || data.code !== 1) {
                                this.update();
                            }
                            break;
                    }
                }
            }
        });

        this.element = tab.panelElement;
        this.element.classList.add("fn__flex-column", "file-tree", "sf__tag", "dockPanel");

        this.element.innerHTML = `<div class="block__icons">
    <div class="block__logo">
        <svg class="block__logoicon"><use xlink:href="#iconTags"></use></svg>${window.sourceflow.languages.tag}
    </div>
    <span class="fn__flex-1"></span>
    <span class="fn__space"></span>
    <span data-type="refresh" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="${window.sourceflow.languages.refresh}"><svg><use xlink:href='#iconRefresh'></use></svg></span>
    <span class="fn__space"></span>
    <span data-type="sort" class="block__icon b3-tooltips b3-tooltips__sw${window.sourceflow.config.readonly ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.sort}">
        <svg><use xlink:href="#iconSort"></use></svg>
    </span>
    <span class="fn__space${window.sourceflow.config.readonly ? " fn__none" : ""}"></span>
    <span data-type="expand" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="${window.sourceflow.languages.expand}${updateHotkeyAfterTip(window.sourceflow.config.keymap.editor.general.expand.custom)}">
        <svg><use xlink:href="#iconExpand"></use></svg>
    </span>
    <span class="fn__space"></span>
    <span data-type="collapse" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="${window.sourceflow.languages.collapse}${updateHotkeyAfterTip(window.sourceflow.config.keymap.editor.general.collapse.custom)}">
        <svg><use xlink:href="#iconContract"></use></svg>
    </span>
    <span class="fn__space"></span>
    <span data-type="min" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="${window.sourceflow.languages.min}${updateHotkeyAfterTip(window.sourceflow.config.keymap.general.closeTab.custom)}"><svg><use xlink:href='#iconMin'></use></svg></span>
</div>
<div class="fn__flex-1" style="margin-bottom: 8px"></div>`;

        this.tree = new Tree({
            element: this.element.lastElementChild as HTMLElement,
            data: null,
            click(element: HTMLElement, event?: MouseEvent) {
                const labelName = element.getAttribute("data-label");
                if (event) {
                    const actionElement = hasClosestByClassName(event.target as HTMLElement, "b3-list-item__action");
                    if (actionElement) {
                        openTagMenu(actionElement.parentElement, event, labelName);
                        return;
                    }
                }
                openGlobalSearch(app, `#${element.getAttribute("data-label")}#`, !window.sourceflow.ctrlIsPressed, {method: 0});
            },
            rightClick: (element: HTMLElement, event: MouseEvent) => {
                openTagMenu(element, event, element.getAttribute("data-label"));
            },
            blockExtHTML: window.sourceflow.config.readonly ? undefined : '<span class="b3-list-item__action"><svg><use xlink:href="#iconMore"></use></svg></span>',
            topExtHTML: window.sourceflow.config.readonly ? undefined : '<span class="b3-list-item__action"><svg><use xlink:href="#iconMore"></use></svg></span>'
        });
        // 为了快捷键的 dispatch
        this.element.querySelector('[data-type="collapse"]').addEventListener("click", () => {
            this.tree.collapseAll();
        });
        this.element.querySelector('[data-type="expand"]').addEventListener("click", () => {
            this.tree.expandAll();
        });
        this.element.addEventListener("click", (event: MouseEvent) => {
            setPanelFocus(this.element);
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.element)) {
                if (target.classList.contains("block__icon")) {
                    const type = target.getAttribute("data-type");
                    switch (type) {
                        case "min":
                            getDockByType("tag").toggleModel("tag", false, true);
                            break;
                        case "sort":
                            window.sourceflow.menus.menu.remove();
                            window.sourceflow.menus.menu.append(new MenuItem({
                                icon: window.sourceflow.config.tag.sort === 0 ? "iconSelect" : undefined,
                                label: window.sourceflow.languages.fileNameASC,
                                click: () => {
                                    window.sourceflow.config.tag.sort = 0;
                                    this.update();
                                },
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                icon: window.sourceflow.config.tag.sort === 1 ? "iconSelect" : undefined,
                                label: window.sourceflow.languages.fileNameDESC,
                                click: () => {
                                    window.sourceflow.config.tag.sort = 1;
                                    this.update();
                                },
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                icon: window.sourceflow.config.tag.sort === 4 ? "iconSelect" : undefined,
                                label: window.sourceflow.languages.fileNameNatASC,
                                click: () => {
                                    window.sourceflow.config.tag.sort = 4;
                                    this.update();
                                },
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                icon: window.sourceflow.config.tag.sort === 5 ? "iconSelect" : undefined,
                                label: window.sourceflow.languages.fileNameNatDESC,
                                click: () => {
                                    window.sourceflow.config.tag.sort = 5;
                                    this.update();
                                },
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                icon: window.sourceflow.config.tag.sort === 7 ? "iconSelect" : undefined,
                                label: window.sourceflow.languages.refCountASC,
                                click: () => {
                                    window.sourceflow.config.tag.sort = 7;
                                    this.update();
                                },
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                icon: window.sourceflow.config.tag.sort === 8 ? "iconSelect" : undefined,
                                label: window.sourceflow.languages.refCountDESC,
                                click: () => {
                                    window.sourceflow.config.tag.sort = 8;
                                    this.update();
                                },
                            }).element);
                            window.sourceflow.menus.menu.popup({x: event.clientX, y: event.clientY});
                            event.preventDefault();
                            event.stopPropagation();
                            break;
                        case "refresh":
                            this.update();
                            break;
                    }
                }
                target = target.parentElement;
            }
        });
        this.update(false);
    }

    public update(ignoreMaxListHint = true) {
        const element = this.element.querySelector('.block__icon[data-type="refresh"] svg');
        if (element.classList.contains("fn__rotate")) {
            return;
        }
        element.classList.add("fn__rotate");
        fetchPost("/api/tag/getTag", {
            sort: window.sourceflow.config.tag.sort,
            app: Constants.SOURCEFLOW_APPID,
            ignoreMaxListHint
        }, response => {
            if (this.openNodes) {
                this.openNodes = this.tree.getExpandIds();
            }
            this.tree.updateData(response.data);
            if (this.openNodes) {
                this.tree.setExpandIds(this.openNodes);
            } else {
                this.openNodes = this.tree.getExpandIds();
            }
            element.classList.remove("fn__rotate");
        });
    }
}
