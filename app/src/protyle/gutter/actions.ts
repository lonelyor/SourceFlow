import {
    hasClosestBlock,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInAVBlock,
    isInEmbedBlock
} from "../util/hasClosest";
import {getIconByType} from "../../editor/getIcon";
import {enterBack, iframeMenu, setFold, tableMenu, videoMenu, zoomOut} from "../../menus/protyle";
import {MenuItem} from "../../menus/Menu";
import {copySubMenu, openAttr, openFileAttr} from "../../menus/commonMenuItem";
import {
    copyPlainText,
    isInAndroid,
    isInHarmony,
    isMac,
    isOnlyMeta,
    openByMobile,
    updateHotkeyAfterTip,
    updateHotkeyTip,
    writeNativeSourceFlowHTMLClipboard,
    writeText
} from "../util/compatibility";
import {
    transaction,
    turnsIntoOneTransaction,
    turnsIntoTransaction,
    turnsOneInto,
    updateBatchTransaction,
    updateTransaction
} from "../wysiwyg/transaction";
import {removeBlock} from "../wysiwyg/remove";
import {focusBlock, focusByRange, getEditorRange} from "../util/selection";
import {hideElements} from "../ui/hideElements";
import {highlightRender} from "../render/highlightRender";
import {blockRender} from "../render/blockRender";
import {getContenteditableElement, getParentBlock, getTopAloneElement, isNotEditBlock} from "../wysiwyg/getBlock";
import * as dayjs from "dayjs";
import {fetchPost} from "../../util/fetch";
import {cancelSB, genEmptyElement, getLangByType, insertEmptyBlock, jumpToParent,} from "../../block/util";
import {countBlockWord} from "../../layout/status";
import {Constants} from "../../constants";
import {mathRender} from "../render/mathRender";
import {duplicateBlock} from "../wysiwyg/commonHotkey";
import {movePathTo, useShell} from "../../util/pathName";
import {hintMoveBlock} from "../hint/extend";
import {makeCard, quickMakeCard} from "../../card/makeCard";
import {transferBlockRef} from "../../menus/block";
import {isMobile} from "../../util/functions";
import {AIActions} from "../../ai/actions";
import {activeBlur, renderTextMenu, showKeyboardToolbarUtil} from "../../mobile/util/keyboardToolbar";
import {hideTooltip} from "../../dialog/tooltip";
import {appearanceMenu} from "../toolbar/Font";
import {setPosition} from "../../util/setPosition";
import {emitOpenMenu} from "../../plugin/EventBus";
import {insertAttrViewBlockAnimation, updateHeader} from "../render/av/row";
import {avContextmenu, duplicateCompletely} from "../render/av/action";
import {getPlainText} from "../util/paste";
import {addEditorToDatabase} from "../render/av/addToDatabase";
import {processClonePHElement} from "../render/util";
/// #if !MOBILE
import {openFileById} from "../../editor/util";
import * as path from "path";
/// #endif
/// #if MOBILE
import {openMobileFileById} from "../../mobile/editor";
/// #endif
import {hideMessage, showMessage} from "../../dialog/message";
import {checkFold} from "../../util/noRelyPCFunction";
import {clearSelect} from "../util/clear";
import {chartRender} from "../render/chartRender";
import {appendAssistantContextActions} from "../../assistant/skills/contextActions";
import {canRunCodeBlock, runCodeBlock} from "../codeRun";


    export const isMatchNode = (gutterElement: HTMLElement, item: Element) => {
        const itemRect = item.getBoundingClientRect();
        // 原本为4，由于 https://github.com/lonelyor/SourceFlow/issues/12166 改为 6
        let gutterTop = gutterElement.getBoundingClientRect().top + 6;
        if (itemRect.height < Math.floor(window.sourceflow.config.editor.fontSize * 1.625) + 8) {
            gutterTop = gutterTop - (itemRect.height - gutterElement.clientHeight) / 2;
        }
        return itemRect.top <= gutterTop && itemRect.bottom >= gutterTop;
    }

    export const createTurnsOneIntoMenu = (options: {
        menuId?: string,
        id: string,
        icon: string,
        label: string,
        protyle: IProtyle,
        nodeElement: Element,
        accelerator?: string
        type: string,
        level?: number
    }) => {
        return {
            id: options.menuId,
            icon: options.icon,
            label: options.label,
            accelerator: options.accelerator,
            click() {
                turnsOneInto(options);
            }
        };
    }

    export const createTurnsIntoOneMenu = (options: {
        menuId?: string,
        accelerator?: string,
        icon?: string,
        label: string,
        protyle: IProtyle,
        selectsElement: Element[],
        type: TTurnIntoOne,
        level?: TTurnIntoOneSub,
    }) => {
        return {
            id: options.menuId,
            icon: options.icon,
            label: options.label,
            accelerator: options.accelerator,
            click() {
                turnsIntoOneTransaction(options);
            }
        };
    }

    export const createTurnsIntoMenu = (options: {
        menuId?: string,
        icon?: string,
        label: string,
        protyle: IProtyle,
        selectsElement: Element[],
        type: TTurnInto,
        level?: number,
        isContinue?: boolean,
        accelerator?: string,
    }) => {
        return {
            id: options.menuId,
            icon: options.icon,
            label: options.label,
            accelerator: options.accelerator,
            click() {
                turnsIntoTransaction(options);
            }
        };
    }

    export const showMobileAppearance = (protyle: IProtyle) => {
        const toolbarElement = document.getElementById("keyboardToolbar");
        const dynamicElements = toolbarElement.querySelectorAll("#keyboardToolbar .keyboard__dynamic");
        dynamicElements[0].classList.add("fn__none");
        dynamicElements[1].classList.remove("fn__none");
        toolbarElement.querySelector('.keyboard__action[data-type="text"]').classList.add("protyle-toolbar__item--current");
        toolbarElement.querySelector('.keyboard__action[data-type="done"] use').setAttribute("xlink:href", "#iconCloseRound");
        toolbarElement.classList.remove("fn__none");
        const oldScrollTop = protyle.contentElement.scrollTop + 333.5;  // toolbarElement.clientHeight
        renderTextMenu(protyle, toolbarElement);
        showKeyboardToolbarUtil(oldScrollTop);
    }


    export const createHeadingTransformMenu = (protyle: IProtyle, id: string, level: number) => {
        return {
            id: "heading" + level,
            iconHTML: "",
            icon: "iconHeading" + level,
            label: window.sourceflow.languages["heading" + level],
            click() {
                fetchPost("/api/block/getHeadingLevelTransaction", {
                    id,
                    level
                }, (response) => {
                    response.data.doOperations.forEach((operation: IOperation, index: number) => {
                        protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach((itemElement: HTMLElement) => {
                            itemElement.outerHTML = operation.data;
                        });
                        // 使用 outer 后元素需要重新查询
                        protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach((itemElement: HTMLElement) => {
                            mathRender(itemElement);
                        });
                        if (index === 0) {
                            focusBlock(protyle.wysiwyg.element.querySelector(`[data-node-id="${operation.id}"]`), protyle.wysiwyg.element, true);
                        }
                    });
                    transaction(protyle, response.data.doOperations, response.data.undoOperations);
                });
            }
        };
    }

    export const applyGutterNodeClick = (nodeElements: Element[], protyle: IProtyle, cb: (e: HTMLElement) => void) => {
        updateBatchTransaction(nodeElements, protyle, cb);
        focusBlock(nodeElements[0]);
    }

    export const appendAlignMenu = (nodeElements: Element[], protyle: IProtyle) => {
        const disabledRTL = nodeElements.some(e => ["NodeAttributeView", "NodeCodeBlock", "NodeMathBlock"].includes(e.getAttribute("data-type")));
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "layout",
            label: window.sourceflow.languages.layout,
            type: "submenu",
            submenu: [{
                id: "alignLeft",
                icon: "iconAlignLeft",
                label: window.sourceflow.languages.alignLeft,
                accelerator: window.sourceflow.config.keymap.editor.general.alignLeft.custom,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        if (e.classList.contains("av")) {
                            e.style.justifyContent = "";
                        } else if (["NodeIFrame", "NodeWidget"].includes(e.getAttribute("data-type"))) {
                            e.style.margin = "";
                        } else {
                            e.style.textAlign = "left";
                        }
                    });
                }
            }, {
                id: "alignCenter",
                icon: "iconAlignCenter",
                label: window.sourceflow.languages.alignCenter,
                accelerator: window.sourceflow.config.keymap.editor.general.alignCenter.custom,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        if (e.classList.contains("av")) {
                            e.style.justifyContent = "center";
                        } else if (["NodeIFrame", "NodeWidget"].includes(e.getAttribute("data-type"))) {
                            e.style.margin = "0 auto";
                        } else {
                            e.style.textAlign = "center";
                        }
                    });
                }
            }, {
                id: "alignRight",
                icon: "iconAlignRight",
                label: window.sourceflow.languages.alignRight,
                accelerator: window.sourceflow.config.keymap.editor.general.alignRight.custom,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        if (e.classList.contains("av")) {
                            e.style.justifyContent = "flex-end";
                        } else if (["NodeIFrame", "NodeWidget"].includes(e.getAttribute("data-type"))) {
                            e.style.margin = "0 0 0 auto";
                        } else {
                            e.style.textAlign = "right";
                        }
                    });
                }
            }, {
                id: "justify",
                icon: "iconMenu",
                label: window.sourceflow.languages.justify,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        e.style.textAlign = "justify";
                    });
                }
            }, {
                id: "separator_1",
                type: "separator"
            }, {
                id: "ltr",
                icon: "iconLtr",
                ignore: disabledRTL,
                label: window.sourceflow.languages.ltr,
                accelerator: window.sourceflow.config.keymap.editor.general.ltr.custom,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        if (e.classList.contains("table")) {
                            e.querySelector("table").style.direction = "ltr";
                        } else if (e.getAttribute("data-type") === "NodeHTMLBlock") {
                            (e.querySelector("protyle-html") as HTMLElement).style.direction = "ltr";
                        } else {
                            e.style.direction = "ltr";
                        }
                    });
                }
            }, {
                id: "rtl",
                icon: "iconRtl",
                ignore: disabledRTL,
                label: window.sourceflow.languages.rtl,
                accelerator: window.sourceflow.config.keymap.editor.general.rtl.custom,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        if (e.classList.contains("table")) {
                            e.querySelector("table").style.direction = "rtl";
                        } else if (e.getAttribute("data-type") === "NodeHTMLBlock") {
                            (e.querySelector("protyle-html") as HTMLElement).style.direction = "rtl";
                        } else {
                            e.style.direction = "rtl";
                        }
                    });
                }
            }, {
                id: "separator_2",
                ignore: disabledRTL,
                type: "separator"
            }, {
                id: "clearFontStyle",
                icon: "iconTrashcan",
                label: window.sourceflow.languages.clearFontStyle,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        if (e.classList.contains("av")) {
                            e.style.justifyContent = "";
                        } else if (["NodeIFrame", "NodeWidget"].includes(e.getAttribute("data-type"))) {
                            e.style.margin = "";
                        } else {
                            e.style.textAlign = "";
                            e.style.direction = "";
                        }
                    });
                }
            }]
        }).element);
    }

    const updateNodeElements = (nodeElements: Element[], protyle: IProtyle, inputElement: HTMLInputElement) => {
        const undoOperations: IOperation[] = [];
        const operations: IOperation[] = [];
        nodeElements.forEach((e) => {
            undoOperations.push({
                action: "update",
                id: e.getAttribute("data-node-id"),
                data: e.outerHTML
            });
        });
        inputElement.addEventListener(inputElement.type === "number" ? "blur" : "change", () => {
            nodeElements.forEach((e: HTMLElement) => {
                operations.push({
                    action: "update",
                    id: e.getAttribute("data-node-id"),
                    data: e.outerHTML
                });
                if (e.getAttribute("data-subtype") === "echarts") {
                    const chartInstance = window.echarts.getInstanceById(e.querySelector("[_echarts_instance_]").getAttribute("_echarts_instance_"));
                    if (chartInstance) {
                        chartInstance.resize();
                    }
                    chartRender(e);
                }
            });
            transaction(protyle, operations, undoOperations);
            window.sourceflow.menus.menu.remove();
            focusBlock(nodeElements[0]);
        });
    }

    export const appendWidthMenu = (nodeElements: Element[], protyle: IProtyle) => {
        let rangeElement: HTMLInputElement;
        const firstElement = nodeElements[0] as HTMLElement;
        const styles: IMenu[] = [{
            id: "widthInput",
            iconHTML: "",
            type: "readonly",
            label: `<div class="fn__flex"><input class="b3-text-field fn__flex-1" value="${firstElement.style.width.endsWith("px") ? parseInt(firstElement.style.width) : ""}" type="number" style="margin: 4px 8px 4px 0" placeholder="${window.sourceflow.languages.width}"><span class="fn__flex-center">px</span></div>`,
            bind: (element) => {
                const inputElement = element.querySelector("input");
                inputElement.addEventListener("input", () => {
                    nodeElements.forEach((item: HTMLElement) => {
                        item.style.width = inputElement.value + "px";
                        item.style.flex = "none";
                    });
                    rangeElement.value = "0";
                    rangeElement.parentElement.setAttribute("aria-label", inputElement.value + "px");
                });
                updateNodeElements(nodeElements, protyle, inputElement);
            }
        }];
        ["25%", "33%", "50%", "67%", "75%", "100%"].forEach((item) => {
            styles.push({
                id: "width_" + item,
                iconHTML: "",
                label: item,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        e.style.width = item;
                        e.style.flex = "none";
                        if (e.getAttribute("data-subtype") === "echarts") {
                            const chartInstance = window.echarts.getInstanceById(e.querySelector("[_echarts_instance_]").getAttribute("_echarts_instance_"));
                            if (chartInstance) {
                                chartInstance.resize();
                            }
                        }
                    });
                }
            });
        });
        styles.push({
            id: "separator_1",
            type: "separator"
        });
        const width = firstElement.style.width.endsWith("%") ? parseInt(firstElement.style.width) : 0;
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "width",
            label: window.sourceflow.languages.width,
            submenu: styles.concat([{
                id: "widthDrag",
                iconHTML: "",
                type: "readonly",
                label: `<div style="margin: 4px 0;" aria-label="${firstElement.style.width.endsWith("px") ? firstElement.style.width : (firstElement.style.width || window.sourceflow.languages.default)}" class="b3-tooltips b3-tooltips__n"><input style="box-sizing: border-box" value="${width}" class="b3-slider fn__block" max="100" min="1" step="1" type="range"></div>`,
                bind: (element) => {
                    rangeElement = element.querySelector("input");
                    rangeElement.addEventListener("input", () => {
                        nodeElements.forEach((e: HTMLElement) => {
                            e.style.width = rangeElement.value + "%";
                            e.style.flex = "none";
                        });
                        rangeElement.parentElement.setAttribute("aria-label", `${rangeElement.value}%`);
                    });
                    updateNodeElements(nodeElements, protyle, rangeElement);
                }
            }, {
                id: "separator_2",
                type: "separator"
            }, {
                id: "default",
                iconHTML: "",
                label: window.sourceflow.languages.default,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        if (e.style.width) {
                            e.style.width = "";
                            e.style.flex = "";
                            if (e.getAttribute("data-subtype") === "echarts") {
                                const chartInstance = window.echarts.getInstanceById(e.querySelector("[_echarts_instance_]").getAttribute("_echarts_instance_"));
                                if (chartInstance) {
                                    chartInstance.resize();
                                }
                            }
                        }
                    });
                }
            }]),
        }).element);
    }

    // TODO https://github.com/lonelyor/SourceFlow/issues/11055
    export const appendHeightMenu = (nodeElements: Element[], protyle: IProtyle) => {
        const matchHeight = nodeElements.find(item => {
            if (!item.classList.contains("p") && !item.classList.contains("code-block") && !item.classList.contains("render-node")) {
                return true;
            }
        });
        if (matchHeight) {
            return;
        }
        let rangeElement: HTMLInputElement;
        const firstElement = nodeElements[0] as HTMLElement;
        const styles: IMenu[] = [{
            id: "heightInput",
            iconHTML: "",
            type: "readonly",
            label: `<div class="fn__flex"><input class="b3-text-field fn__flex-1" value="${firstElement.style.height.endsWith("px") ? parseInt(firstElement.style.height) : ""}" type="number" style="margin: 4px 8px 4px 0" placeholder="${window.sourceflow.languages.height}"><span class="fn__flex-center">px</span></div>`,
            bind: (element) => {
                const inputElement = element.querySelector("input");
                inputElement.addEventListener("input", () => {
                    nodeElements.forEach((item: HTMLElement) => {
                        item.style.height = inputElement.value + "px";
                        item.style.flex = "none";
                    });
                    rangeElement.value = "0";
                    rangeElement.parentElement.setAttribute("aria-label", inputElement.value + "px");
                });
                updateNodeElements(nodeElements, protyle, inputElement);
            }
        }];
        ["25%", "33%", "50%", "67%", "75%", "100%"].forEach((item) => {
            styles.push({
                id: "height_" + item,
                iconHTML: "",
                label: item,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        e.style.height = item;
                        e.style.flex = "none";
                    });
                }
            });
        });
        styles.push({
            type: "separator"
        });
        const height = firstElement.style.height.endsWith("%") ? parseInt(firstElement.style.height) : 0;
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "heightDrag",
            label: window.sourceflow.languages.height,
            submenu: styles.concat([{
                iconHTML: "",
                type: "readonly",
                label: `<div style="margin: 4px 0;" aria-label="${firstElement.style.height.endsWith("px") ? firstElement.style.height : (firstElement.style.height || window.sourceflow.languages.default)}" class="b3-tooltips b3-tooltips__n"><input style="box-sizing: border-box" value="${height}" class="b3-slider fn__block" max="100" min="1" step="1" type="range"></div>`,
                bind: (element) => {
                    rangeElement = element.querySelector("input");
                    rangeElement.addEventListener("input", () => {
                        nodeElements.forEach((e: HTMLElement) => {
                            e.style.height = rangeElement.value + "%";
                            e.style.flex = "none";
                        });
                        rangeElement.parentElement.setAttribute("aria-label", `${rangeElement.value}%`);
                    });
                    updateNodeElements(nodeElements, protyle, rangeElement);
                }
            }, {
                type: "separator"
            }, {
                id: "default",
                iconHTML: "",
                label: window.sourceflow.languages.default,
                click: () => {
                    applyGutterNodeClick(nodeElements, protyle, (e: HTMLElement) => {
                        if (e.style.height) {
                            e.style.height = "";
                            e.style.overflow = "";
                        }
                    });
                }
            }]),
        }).element);
    }

    export const createCopyTextRefMenu = (selectsElement: Element[]): false | IMenu => {
        if (isNotEditBlock(selectsElement[0])) {
            return false;
        }
        return {
            id: "copyText",
            iconHTML: "",
            accelerator: window.sourceflow.config.keymap.editor.general.copyText.custom,
            label: window.sourceflow.languages.copyText,
            click() {
                // 用于标识复制文本 *
                selectsElement[0].setAttribute("data-reftext", "true");
                focusByRange(getEditorRange(selectsElement[0]));
                document.execCommand("copy");
            }
        };
    }
