import {confirmDialog} from "../../dialog/confirmDialog";
import {escapeHtml} from "../../util/escape";
import {fetchPost} from "../../util/fetch";
import {isMobile} from "../../util/functions";
import {resizeSide} from "../../history/resizeSide";
import {Constants} from "../../constants";
import {previewTemplate, toolbarKeyToMenu} from "./util";
import {copyPlainText, readClipboard} from "../util/compatibility";
import {focusByRange, focusByWbr, getEditorRange, getSelectionPosition, selectAll} from "../util/selection";
import {hideElements} from "../ui/hideElements";
import {updateTransaction} from "../wysiwyg/transaction";
import {hasClosestByAttribute, hasClosestByClassName} from "../util/hasClosest";
import type {Toolbar} from "./index";
import {
    paste,
    pasteAsImage,
    pasteAsPlainText,
    pasteAsSmartTable,
    pasteEscaped,
    pastePreserveLayout
} from "../util/paste";
import {setPosition} from "../../util/setPosition";
import {upDownHint} from "../../util/upDownHint";
import {hintRenderTemplate, hintRenderWidget} from "../hint/extend";
import {updateToolbarLanguage} from "./shared";
/// #if !BROWSER
import {openBy} from "../../editor/util";
/// #endif

export const showCodeLanguagePanel = (toolbar: Toolbar, protyle: IProtyle, languageElements: HTMLElement[]) => {
    const nodeElement = languageElements[0].closest("[data-node-id]") as HTMLElement;
    if (!nodeElement) {
        return;
    }
    hideElements(["hint"], protyle);
    window.sourceflow.menus.menu.remove();
    toolbar.range = getEditorRange(nodeElement);

    toolbar.subElement.style.width = "";
    toolbar.subElement.style.padding = "";
    toolbar.subElement.innerHTML = `<div data-id="codeLanguage" class="fn__flex-column" style="max-height:50vh">
    <input placeholder="${window.sourceflow.languages.search}" style="margin: 0 8px 4px 8px" class="b3-text-field"/>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative"></div>
</div>`;
    const listElement = toolbar.subElement.lastElementChild.lastElementChild as HTMLElement;

    let html = `<div data-id="clearLanguage" class="b3-list-item">${window.sourceflow.languages.clear}</div>`;
    let hljsLanguages = Constants.ALIAS_CODE_LANGUAGES.concat(window.hljs?.listLanguages() ?? []).sort();

    const eventDetail = {languages: hljsLanguages, type: "init", listElement};
    if (protyle.app && protyle.app.plugins) {
        protyle.app.plugins.forEach((plugin: any) => {
            plugin.eventBus.emit("code-language-update", eventDetail);
        });
    }

    hljsLanguages = eventDetail.languages;
    hljsLanguages.forEach((item) => {
        html += `<div data-id="${item}" class="b3-list-item">${item}</div>`;
    });

    listElement.innerHTML = html;
    listElement.firstElementChild.nextElementSibling.classList.add("b3-list-item--focus");

    const inputElement = toolbar.subElement.querySelector("input");
    inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.isComposing) {
            return;
        }
        upDownHint(listElement, event);
        if (event.key === "Enter") {
            updateToolbarLanguage(toolbar, languageElements, protyle, toolbar.subElement.querySelector(".b3-list-item--focus").textContent);
            event.preventDefault();
            return;
        }
        if (event.key === "Escape") {
            toolbar.subElement.classList.add("fn__none");
            focusByRange(toolbar.range);
        }
    });

    const highlightText = (text: string, search: string) => {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escapedSearch, "gi");
        return text.replace(regex, match => `<b>${match}</b>`);
    };

    inputElement.addEventListener("input", (event) => {
        const value = inputElement.value.trim();
        let matchLanguages;
        let html = `<div data-id="clearLanguage" class="b3-list-item">${window.sourceflow.languages.clear}</div>`;
        let isMatchLanguages = false;
        if (value) {
            const lowerCaseValue = value.toLowerCase();
            matchLanguages = hljsLanguages.filter(
                item => item.toLowerCase().includes(lowerCaseValue)
            ).sort((a, b) => {
                const aStartsWith = a.toLowerCase().startsWith(lowerCaseValue);
                const bStartsWith = b.toLowerCase().startsWith(lowerCaseValue);

                if (aStartsWith && bStartsWith) return a.length - b.length;
                if (aStartsWith) return -1;
                if (bStartsWith) return 1;
                return 0;
            });

            if (window.hljs?.getLanguage(value)) {
                matchLanguages = [value].concat(matchLanguages.filter(item => item !== value));
            }
        }

        const eventDetail = {languages: value ? matchLanguages : hljsLanguages, type: "match", value, listElement};
        if (protyle.app && protyle.app.plugins) {
            protyle.app.plugins.forEach((plugin: any) => {
                plugin.eventBus.emit("code-language-update", eventDetail);
            });
        }

        matchLanguages = eventDetail.languages;
        if (value) {
            matchLanguages.forEach((item) => {
                if (value === item) {
                    isMatchLanguages = true;
                    html += `<div data-id="${item}" class="b3-list-item"><b>${item}</b></div>`;
                } else {
                    html += `<div data-id="${item}" class="b3-list-item">${highlightText(item, value)}</div>`;
                }
            });
        } else {
            matchLanguages.forEach((item) => {
                html += `<div data-id="${item}" class="b3-list-item">${item}</div>`;
            });
        }
        if (value && !isMatchLanguages) {
            html += `<div data-id="customLanguage" class="b3-list-item"><b>${escapeHtml(value.replace(/`| /g, "_"))}</b></div>`;
        }
        listElement.innerHTML = html;
        listElement.firstElementChild.nextElementSibling.classList.add("b3-list-item--focus");
        event.stopPropagation();
    });
    listElement.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const clickListElement = hasClosestByClassName(target, "b3-list-item");
        if (!clickListElement) {
            return;
        }
        updateToolbarLanguage(toolbar, languageElements, protyle, clickListElement.textContent);
    });
    toolbar.subElement.style.zIndex = (++window.sourceflow.zIndex).toString();
    toolbar.subElement.classList.remove("fn__none");
    toolbar.subElementCloseCB = undefined;
    /// #if !MOBILE
    const nodeRect = languageElements[0].getBoundingClientRect();
    setPosition(toolbar.subElement, nodeRect.left, nodeRect.bottom, nodeRect.height);
    /// #else
    setPosition(toolbar.subElement, 0, 0);
    /// #endif
    toolbar.element.classList.add("fn__none");
    inputElement.select();
};

export const showTemplatePanel = (toolbar: Toolbar, protyle: IProtyle, nodeElement: HTMLElement, range: Range) => {
    toolbar.range = range;
    hideElements(["hint"], protyle);
    window.sourceflow.menus.menu.remove();
    toolbar.subElement.style.width = "";
    toolbar.subElement.style.padding = "";
    toolbar.subElement.innerHTML = `<div style="max-height:50vh" class="fn__flex">
<div class="fn__flex-column" style="${isMobile() ? "width: 100%" : "width: 256px"}">
    <div class="fn__flex" style="margin: 0 8px 4px 8px">
        <input class="b3-text-field fn__flex-1"/>
        <span class="fn__space"></span>
        <span data-type="previous" class="block__icon block__icon--show"><svg><use xlink:href="#iconLeft"></use></svg></span>
        <span class="fn__space"></span>
        <span data-type="next" class="block__icon block__icon--show"><svg><use xlink:href="#iconRight"></use></svg></span>
    </div>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative"><img style="margin: 0 auto;display: block;width: 64px;height: 64px" src="/stage/loading-pure.svg"></div>
</div>
<div class="toolbarResize" style="    cursor: col-resize;
    box-shadow: 2px 0 0 0 var(--b3-theme-surface) inset, 3px 0 0 0 var(--b3-border-color) inset;
    width: 5px;
    margin-left: -2px;"></div>
<div style="width: 520px;${isMobile() || window.outerWidth < window.outerWidth / 2 + 520 ? "display:none;" : ""}overflow: auto;"></div>
</div>`;
    const listElement = toolbar.subElement.querySelector(".b3-list");
    resizeSide(toolbar.subElement.querySelector(".toolbarResize"), listElement.parentElement);
    const previewElement = toolbar.subElement.firstElementChild.lastElementChild;
    let previewPath: string;
    listElement.addEventListener("mouseover", (event) => {
        const target = event.target as HTMLElement;
        const hoverItemElement = hasClosestByClassName(target, "b3-list-item");
        if (!hoverItemElement) {
            return;
        }
        const currentPath = hoverItemElement.getAttribute("data-value");
        if (previewPath === currentPath) {
            return;
        }
        previewPath = currentPath;
        previewTemplate(previewPath, previewElement, protyle.block.parentID);
        event.stopPropagation();
    });
    const inputElement = toolbar.subElement.querySelector("input");
    inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.isComposing) {
            return;
        }
        const isEmpty = !toolbar.subElement.querySelector(".b3-list-item");
        if (!isEmpty) {
            const currentElement = upDownHint(listElement, event);
            if (currentElement) {
                const currentPath = currentElement.getAttribute("data-value");
                if (previewPath === currentPath) {
                    return;
                }
                previewPath = currentPath;
                previewTemplate(previewPath, previewElement, protyle.block.parentID);
            }
        }
        if (event.key === "Enter") {
            if (!isEmpty) {
                hintRenderTemplate(decodeURIComponent(toolbar.subElement.querySelector(".b3-list-item--focus").getAttribute("data-value")), protyle, nodeElement);
            } else {
                focusByRange(toolbar.range);
            }
            toolbar.subElement.classList.add("fn__none");
            event.preventDefault();
        } else if (event.key === "Escape") {
            toolbar.subElement.classList.add("fn__none");
            focusByRange(toolbar.range);
        }
    });
    const genList = () => {
        fetchPost("/api/search/searchTemplate", {
            k: inputElement.value,
        }, (response) => {
            let searchHTML = "";
            response.data.templates.forEach((item: { path: string, content: string }, index: number) => {
                searchHTML += `<div data-value="${item.path}" class="b3-list-item--hide-action b3-list-item${index === 0 ? " b3-list-item--focus" : ""}">
<span class="b3-list-item__text">${item.content}</span>`;
                /// #if !BROWSER
                searchHTML += `<span data-type="open" class="b3-list-item__action b3-tooltips b3-tooltips__w" aria-label="${window.sourceflow.languages.showInFolder}">
    <svg><use xlink:href="#iconFolder"></use></svg>
</span>`;
                /// #endif
                searchHTML += `<span data-type="remove" class="b3-list-item__action b3-tooltips b3-tooltips__w" aria-label="${window.sourceflow.languages.remove}">
    <svg><use xlink:href="#iconTrashcan"></use></svg>
</span></div>`;
            });
            listElement.innerHTML = searchHTML || `<li class="b3-list--empty">${window.sourceflow.languages.emptyContent}</li>`;

            if (!previewPath) {
                previewPath = response.data.templates[0]?.path;
                /// #if !MOBILE
                const rangePosition = getSelectionPosition(nodeElement, range);
                setPosition(toolbar.subElement, rangePosition.left, rangePosition.top + 18, Constants.SIZE_TOOLBAR_HEIGHT);
                (toolbar.subElement.firstElementChild as HTMLElement).style.maxHeight = Math.min(window.innerHeight * 0.8, window.innerHeight - toolbar.subElement.getBoundingClientRect().top) - 16 + "px";
                /// #else
                setPosition(toolbar.subElement, 0, 0);
                /// #endif
            } else if (response.data.templates[0]?.path === previewPath) {
                return;
            } else {
                previewPath = response.data.templates[0]?.path;
            }
            previewTemplate(previewPath, previewElement, protyle.block.parentID);
        });
    };
    inputElement.addEventListener("compositionend", () => {
        genList();
    });
    inputElement.addEventListener("input", (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.isComposing) {
            return;
        }
        genList();
    });
    toolbar.subElement.lastElementChild.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.classList.contains("b3-list--empty")) {
            toolbar.subElement.classList.add("fn__none");
            focusByRange(toolbar.range);
            event.stopPropagation();
            return;
        }
        const iconElement = hasClosestByClassName(target, "b3-list-item__action");
        /// #if !BROWSER
        if (iconElement && iconElement.getAttribute("data-type") === "open") {
            openBy(iconElement.parentElement.getAttribute("data-value"), "folder");
            event.stopPropagation();
            return;
        }
        /// #endif
        if (iconElement && iconElement.getAttribute("data-type") === "remove") {
            confirmDialog(window.sourceflow.languages.remove, window.sourceflow.languages.confirmDelete + "?", () => {
                fetchPost("/api/search/removeTemplate", {path: iconElement.parentElement.getAttribute("data-value")}, () => {
                    if (iconElement.parentElement.parentElement.childElementCount === 1) {
                        iconElement.parentElement.parentElement.innerHTML = `<li class="b3-list--empty">${window.sourceflow.languages.emptyContent}</li>`;
                        previewTemplate("", previewElement, protyle.block.parentID);
                    } else {
                        if (iconElement.parentElement.classList.contains("b3-list-item--focus")) {
                            const sideElement = iconElement.parentElement.previousElementSibling || iconElement.parentElement.nextElementSibling;
                            sideElement.classList.add("b3-list-item--focus");
                            const currentPath = sideElement.getAttribute("data-value");
                            if (previewPath === currentPath) {
                                return;
                            }
                            previewPath = currentPath;
                            previewTemplate(previewPath, previewElement, protyle.block.parentID);
                        }
                        iconElement.parentElement.remove();
                    }
                });
            });
            event.stopPropagation();
            return;
        }
        const previousElement = hasClosestByAttribute(target, "data-type", "previous");
        if (previousElement) {
            inputElement.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowUp"}));
            event.stopPropagation();
            return;
        }
        const nextElement = hasClosestByAttribute(target, "data-type", "next");
        if (nextElement) {
            inputElement.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}));
            event.stopPropagation();
            return;
        }
        const clickListElement = hasClosestByClassName(target, "b3-list-item");
        if (clickListElement) {
            hintRenderTemplate(decodeURIComponent(clickListElement.getAttribute("data-value")), protyle, nodeElement);
            event.stopPropagation();
        }
    });
    toolbar.subElement.style.zIndex = (++window.sourceflow.zIndex).toString();
    toolbar.subElement.classList.remove("fn__none");
    toolbar.subElementCloseCB = undefined;
    toolbar.element.classList.add("fn__none");
    inputElement.select();
    genList();
};

export const showWidgetPanel = (toolbar: Toolbar, protyle: IProtyle, nodeElement: HTMLElement, range: Range) => {
    toolbar.range = range;
    hideElements(["hint"], protyle);
    window.sourceflow.menus.menu.remove();
    toolbar.subElement.style.width = "";
    toolbar.subElement.style.padding = "";
    toolbar.subElement.innerHTML = `<div class="fn__flex-column" style="max-height:50vh">
    <input style="margin: 0 8px 4px 8px" class="b3-text-field"/>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative"><img style="margin: 0 auto;display: block;width: 64px;height:64px" src="/stage/loading-pure.svg"></div>
</div>`;
    const listElement = toolbar.subElement.lastElementChild.lastElementChild as HTMLElement;
    const inputElement = toolbar.subElement.querySelector("input");
    inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.isComposing) {
            return;
        }
        upDownHint(listElement, event);
        if (event.key === "Enter") {
            hintRenderWidget(toolbar.subElement.querySelector(".b3-list-item--focus").getAttribute("data-content"), protyle);
            toolbar.subElement.classList.add("fn__none");
            event.preventDefault();
        } else if (event.key === "Escape") {
            toolbar.subElement.classList.add("fn__none");
            focusByRange(toolbar.range);
        }
    });
    const genList = (init = false) => {
        fetchPost("/api/search/searchWidget", {
            k: inputElement.value,
        }, (response) => {
            let searchHTML = "";
            response.data.widgets.forEach((item: { path: string, content: string, name: string }, index: number) => {
                searchHTML += `<div data-value="${item.path}" data-content="${item.content}" class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}">
    ${item.name}
    <span class="b3-list-item__meta">${item.content}</span>
</div>`;
            });
            listElement.innerHTML = searchHTML;
            if (init) {
                /// #if !MOBILE
                const rangePosition = getSelectionPosition(nodeElement, range);
                setPosition(toolbar.subElement, rangePosition.left, rangePosition.top + 18, Constants.SIZE_TOOLBAR_HEIGHT);
                /// #else
                setPosition(toolbar.subElement, 0, 0);
                /// #endif
            }
        });
    };
    inputElement.addEventListener("compositionend", () => {
        genList();
    });
    inputElement.addEventListener("input", (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.isComposing) {
            return;
        }
        genList();
    });
    toolbar.subElement.lastElementChild.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const clickListElement = hasClosestByClassName(target, "b3-list-item");
        if (!clickListElement) {
            return;
        }
        hintRenderWidget(clickListElement.dataset.content, protyle);
    });
    toolbar.subElement.style.zIndex = (++window.sourceflow.zIndex).toString();
    toolbar.subElement.classList.remove("fn__none");
    toolbar.subElementCloseCB = undefined;
    toolbar.element.classList.add("fn__none");
    inputElement.select();
    genList(true);
};

export const showSelectionContentPanel = (toolbar: Toolbar, protyle: IProtyle, range: Range, nodeElement: Element) => {
    toolbar.range = range;
    hideElements(["hint"], protyle);

    toolbar.subElement.style.width = "auto";
    toolbar.subElement.style.padding = "0 8px";
    let html = "";
    const hasCopy = range.toString() !== "" || (range.cloneContents().childNodes[0] as HTMLElement)?.classList?.contains("emoji");
    if (hasCopy) {
        html += '<button class="keyboard__action" data-action="copy"><svg><use xlink:href="#iconCopy"></use></svg></button>';
        if (!protyle.disabled) {
            html += `<button class="keyboard__action" data-action="cut"><svg><use xlink:href="#iconCut"></use></svg></button>
<button class="keyboard__action" data-action="delete"><svg><use xlink:href="#iconTrashcan"></use></svg></button>`;
        }
    }
    if (!protyle.disabled) {
        html += `<button class="keyboard__action" data-action="paste"><svg><use xlink:href="#iconPaste"></use></svg></button>
<button class="keyboard__action" data-action="select"><svg><use xlink:href="#iconSelect"></use></svg></button>`;
    }
    if (hasCopy || !protyle.disabled) {
        html += '<button class="keyboard__action" data-action="more"><svg><use xlink:href="#iconMore"></use></svg></button>';
    }
    toolbar.subElement.innerHTML = `<div class="fn__flex">${html}</div>`;
    toolbar.subElement.lastElementChild.addEventListener("click", async (event) => {
        const btnElement = hasClosestByClassName(event.target as HTMLElement, "keyboard__action");
        if (!btnElement) {
            return;
        }
        const action = btnElement.getAttribute("data-action");
        if (action === "copy") {
            focusByRange(getEditorRange(nodeElement));
            document.execCommand("copy");
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "cut") {
            focusByRange(getEditorRange(nodeElement));
            document.execCommand("cut");
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "delete") {
            const currentRange = getEditorRange(nodeElement);
            currentRange.insertNode(document.createElement("wbr"));
            const oldHTML = nodeElement.outerHTML;
            currentRange.extractContents();
            focusByWbr(nodeElement, currentRange);
            focusByRange(currentRange);
            updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "paste") {
            focusByRange(getEditorRange(nodeElement));
            if (document.queryCommandSupported("paste")) {
                document.execCommand("paste");
            } else {
                try {
                    const text = await readClipboard();
                    paste(protyle, Object.assign(text, {target: nodeElement as HTMLElement}));
                } catch (e) {
                    console.log(e);
                }
            }
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "select") {
            selectAll(protyle, nodeElement, range);
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "copyPlainText") {
            focusByRange(getEditorRange(nodeElement));
            copyPlainText(getSelection().getRangeAt(0).toString());
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "pasteAsPlainText") {
            focusByRange(getEditorRange(nodeElement));
            pasteAsPlainText(protyle);
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "pasteAsSmartTable") {
            focusByRange(getEditorRange(nodeElement));
            pasteAsSmartTable(protyle, nodeElement);
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "pastePreserveLayout") {
            focusByRange(getEditorRange(nodeElement));
            pastePreserveLayout(protyle, nodeElement);
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "pasteAsImage") {
            focusByRange(getEditorRange(nodeElement));
            pasteAsImage(protyle, nodeElement);
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "pasteEscaped") {
            focusByRange(getEditorRange(nodeElement));
            pasteEscaped(protyle, nodeElement);
            toolbar.subElement.classList.add("fn__none");
        } else if (action === "back") {
            toolbar.subElement.lastElementChild.innerHTML = html;
        } else if (action === "more") {
            toolbar.subElement.lastElementChild.innerHTML = `<button class="keyboard__action${hasCopy ? "" : " fn__none"}" data-action="copyPlainText"><span>${window.sourceflow.languages.copyPlainText}</span></button>
<div class="keyboard__split${hasCopy ? "" : " fn__none"}"></div>
<button class="keyboard__action${protyle.disabled ? " fn__none" : ""}" data-action="pasteAsPlainText"><span>${window.sourceflow.languages.pasteAsPlainText}</span></button>
<div class="keyboard__split${protyle.disabled ? " fn__none" : ""}"></div>
<button class="keyboard__action${protyle.disabled ? " fn__none" : ""}" data-action="pasteAsSmartTable"><span>${window.sourceflow.languages.pasteAsSmartTable}</span></button>
<div class="keyboard__split${protyle.disabled ? " fn__none" : ""}"></div>
<button class="keyboard__action${protyle.disabled ? " fn__none" : ""}" data-action="pastePreserveLayout"><span>${window.sourceflow.languages.pastePreserveLayout}</span></button>
<div class="keyboard__split${protyle.disabled ? " fn__none" : ""}"></div>
<button class="keyboard__action${protyle.disabled ? " fn__none" : ""}" data-action="pasteAsImage"><span>${window.sourceflow.languages.pasteAsImage}</span></button>
<div class="keyboard__split${protyle.disabled ? " fn__none" : ""}"></div>
<button class="keyboard__action${protyle.disabled ? " fn__none" : ""}" data-action="pasteEscaped"><span>${window.sourceflow.languages.pasteEscaped}</span></button>
<div class="keyboard__split${protyle.disabled ? " fn__none" : ""}"></div>
<button class="keyboard__action" data-action="back"><svg><use xlink:href="#iconBack"></use></svg></button>`;
            setPosition(toolbar.subElement, rangePosition.left, rangePosition.top + 28, Constants.SIZE_TOOLBAR_HEIGHT);
        }
    });
    toolbar.subElement.style.zIndex = (++window.sourceflow.zIndex).toString();
    toolbar.subElement.classList.remove("fn__none");
    toolbar.subElementCloseCB = undefined;
    toolbar.element.classList.add("fn__none");
    const rangePosition = getSelectionPosition(nodeElement, range);
    setPosition(toolbar.subElement, rangePosition.left, rangePosition.top - 48, Constants.SIZE_TOOLBAR_HEIGHT);
};
