import * as dayjs from "dayjs";
import {Constants} from "../../constants";
import {hideMessage, showMessage} from "../../dialog/message";
import {fetchPost} from "../../util/fetch";
import {isMobile} from "../../util/functions";
import {setPosition} from "../../util/setPosition";
import {blockRender} from "../render/blockRender";
import {mathRender} from "../render/mathRender";
import {matchHotKey} from "../util/hotKey";
import {processRender} from "../util/processCode";
import {focusBlock, focusByRange, focusByWbr} from "../util/selection";
import {hideElements} from "../ui/hideElements";
import {electronUndo} from "../undo";
import {updateTransaction} from "../wysiwyg/transaction";
import {hasClosestBlock, hasClosestByClassName} from "../util/hasClosest";
import type {Toolbar} from "./index";
import {addScript} from "../util/addScript";
import {insertEmptyBlock} from "../../block/util";
import {linkMenu} from "../../menus/protyle";
import {openByMobile} from "../util/compatibility";

export const showRenderPanel = (
    toolbar: Toolbar,
    protyle: IProtyle,
    renderElement: Element,
    updateElements?: Element[],
    oldHTML?: string,
) => {
    const nodeElement = hasClosestBlock(renderElement);
    if (!nodeElement) {
        return;
    }
    if (["mindmap", "mind-elixir"].includes(renderElement.getAttribute("data-subtype"))) {
        hideElements(["util"], protyle, true);
        toolbar.element.classList.add("fn__none");
        protyle.wysiwyg.element.focus({preventScroll: true});
        focusBlock(nodeElement);
        nodeElement.classList.add("protyle-wysiwyg--select");
        return;
    }
    hideElements(["hint", "select"], protyle);
    window.sourceflow.menus.menu.remove();
    const id = nodeElement.getAttribute("data-node-id");
    const types = (renderElement.getAttribute("data-type") || "").split(" ");
    const html = oldHTML || nodeElement.outerHTML;
    let title = "HTML";
    let placeholder = "";
    const isInlineMemo = types.includes("inline-memo");
    switch (renderElement.getAttribute("data-subtype")) {
        case "abc":
            title = window.sourceflow.languages.staff;
            break;
        case "echarts":
            title = window.sourceflow.languages.chart;
            break;
        case "flowchart":
            title = "Flow Chart";
            break;
        case "graphviz":
            title = "Graphviz";
            break;
        case "mermaid":
            title = "Mermaid";
            break;
        case "mindmap":
        case "mind-elixir":
            placeholder = `- foo
  - bar
- baz`;
            title = window.sourceflow.languages.mindmap;
            break;
        case "plantuml":
            title = "UML";
            break;
        case "math":
            if (types.includes("NodeMathBlock")) {
                title = window.sourceflow.languages.math;
            } else {
                title = window.sourceflow.languages["inline-math"];
            }
            break;
    }
    if (types.includes("NodeBlockQueryEmbed")) {
        title = window.sourceflow.languages.blockEmbed;
    } else if (isInlineMemo) {
        title = window.sourceflow.languages.memo;
    }
    const isPin = toolbar.subElement.querySelector('[data-type="pin"]')?.getAttribute("aria-label") === window.sourceflow.languages.unpin;
    const pinData: IObject = {};
    if (isPin) {
        const pinTextElement = toolbar.subElement.querySelector(".b3-text-field") as HTMLTextAreaElement;
        pinData.styleH = pinTextElement.style.height;
        pinData.styleW = pinTextElement.style.width;
    } else {
        toolbar.subElement.style.width = "";
        toolbar.subElement.style.padding = "0";
    }
    toolbar.subElement.innerHTML = `<div ${(isPin && toolbar.subElement.firstElementChild.getAttribute("data-drag") === "true") ? 'data-drag="true"' : ""}><div class="block__icons block__icons--menu fn__flex" style="border-radius: var(--b3-border-radius-b) var(--b3-border-radius-b) 0 0;">
    <span class="fn__flex-1 resize__move" style="line-height: 24px;">
        ${title}
    </span>
    <span class="fn__space"></span>
    <button data-type="refresh" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw${(isPin && !toolbar.subElement.querySelector('[data-type="refresh"]').classList.contains("block__icon--active")) ? "" : " block__icon--active"}${types.includes("NodeBlockQueryEmbed") ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.refresh}"><svg><use xlink:href="#iconRefresh"></use></svg></button>
    <span class="fn__space"></span>
    <button data-type="before" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw${protyle.disabled ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.insertBefore}"><svg><use xlink:href="#iconBefore"></use></svg></button>
    <span class="fn__space${protyle.disabled ? " fn__none" : ""}"></span>
    <button data-type="after" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw${protyle.disabled ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.insertAfter}"><svg><use xlink:href="#iconAfter"></use></svg></button>
    <span class="fn__space${protyle.disabled ? " fn__none" : ""}"></span>
    <button data-type="export" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw" aria-label="${window.sourceflow.languages.export} ${window.sourceflow.languages.image}"><svg><use xlink:href="#iconImage"></use></svg></button>
    <span class="fn__space"></span>
    <button data-type="pin" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw" aria-label="${isPin ? window.sourceflow.languages.unpin : window.sourceflow.languages.pin}"><svg><use xlink:href="#icon${isPin ? "Unpin" : "Pin"}"></use></svg></button>
    <span class="fn__space"></span>
    <button data-type="close" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw" aria-label="${window.sourceflow.languages.close}"><svg style="width: 10px;margin: 0 2px;"><use xlink:href="#iconClose"></use></svg></button>
</div>
<textarea ${protyle.disabled ? " readonly" : ""} spellcheck="false" class="b3-text-field b3-text-field--text fn__block" placeholder="${placeholder}" style="${isMobile() ? "" : "width:" + Math.max(480, renderElement.clientWidth * 0.7) + "px"};max-height:calc(80vh - 44px);min-height: 48px;min-width: 268px;border-radius: 0 0 var(--b3-border-radius-b) var(--b3-border-radius-b);font-family: var(--b3-font-family-code);"></textarea></div>`;
    const autoHeight = () => {
        textElement.style.height = textElement.scrollHeight + "px";
        if (isMobile()) {
            setPosition(toolbar.subElement, 0, 0);
            return;
        }
        if (toolbar.subElement.firstElementChild.getAttribute("data-drag") === "true") {
            if (textElement.getBoundingClientRect().bottom > window.innerHeight) {
                toolbar.subElement.style.top = window.innerHeight - toolbar.subElement.clientHeight + "px";
            }
            return;
        }
        const bottom = nodeRect.bottom === nodeRect.top ? nodeRect.bottom + 26 : nodeRect.bottom;
        if (toolbar.subElement.clientHeight <= window.innerHeight - bottom || toolbar.subElement.clientHeight <= nodeRect.top) {
            if (types.includes("inline-math") || isInlineMemo) {
                setPosition(toolbar.subElement, nodeRect.left, bottom, nodeRect.height || 26);
            } else {
                setPosition(toolbar.subElement, nodeRect.left + (nodeRect.width - toolbar.subElement.clientWidth) / 2, bottom, nodeRect.height || 26);
            }
        } else {
            setPosition(toolbar.subElement, nodeRect.right, bottom);
        }
    };
    const headerElement = toolbar.subElement.querySelector(".block__icons");
    headerElement.addEventListener("click", (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const btnElement = hasClosestByClassName(target, "b3-tooltips");
        if (!btnElement) {
            if (event.detail === 2) {
                const pingElement = headerElement.querySelector('[data-type="pin"]');
                if (pingElement.getAttribute("aria-label") === window.sourceflow.languages.unpin) {
                    pingElement.querySelector("svg use").setAttribute("xlink:href", "#iconPin");
                    pingElement.setAttribute("aria-label", window.sourceflow.languages.pin);
                } else {
                    pingElement.querySelector("svg use").setAttribute("xlink:href", "#iconUnpin");
                    pingElement.setAttribute("aria-label", window.sourceflow.languages.unpin);
                }
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }
        event.stopPropagation();
        switch (btnElement.getAttribute("data-type")) {
            case "close":
                toolbar.subElement.querySelector('[data-type="pin"]').setAttribute("aria-label", window.sourceflow.languages.pin);
                hideElements(["util"], protyle);
                break;
            case "pin":
                if (btnElement.getAttribute("aria-label") === window.sourceflow.languages.unpin) {
                    btnElement.querySelector("svg use").setAttribute("xlink:href", "#iconPin");
                    btnElement.setAttribute("aria-label", window.sourceflow.languages.pin);
                } else {
                    btnElement.querySelector("svg use").setAttribute("xlink:href", "#iconUnpin");
                    btnElement.setAttribute("aria-label", window.sourceflow.languages.unpin);
                }
                break;
            case "refresh":
                btnElement.classList.toggle("block__icon--active");
                break;
            case "before":
                insertEmptyBlock(protyle, "beforebegin", id);
                hideElements(["util"], protyle);
                break;
            case "after":
                insertEmptyBlock(protyle, "afterend", id);
                hideElements(["util"], protyle);
                break;
            case "export":
                exportImg();
                break;
        }
    });
    const exportImg = () => {
        const msgId = showMessage(window.sourceflow.languages.exporting, 0);
        if (renderElement.getAttribute("data-subtype") === "plantuml") {
            fetch(renderElement.querySelector("object").getAttribute("data")).then(function (response) {
                return response.blob();
            }).then(function (blob) {
                const formData = new FormData();
                formData.append("file", blob);
                formData.append("type", "image/svg+xml");
                fetchPost("/api/export/exportAsFile", formData, (response) => {
                    openByMobile(response.data.file);
                    hideMessage(msgId);
                });
            });
            return;
        }
        setTimeout(() => {
            addScript("/stage/protyle/js/html-to-image.min.js?v=1.11.13", "protyleHtml2image").then(() => {
                (renderElement as HTMLHtmlElement).style.display = "inline-block";
                window.htmlToImage.toBlob(renderElement).then(blob => {
                    (renderElement as HTMLHtmlElement).style.display = "";
                    const formData = new FormData();
                    formData.append("file", blob);
                    formData.append("type", "image/png");
                    fetchPost("/api/export/exportAsFile", formData, (response) => {
                        openByMobile(response.data.file);
                        hideMessage(msgId);
                    });
                });
            });
        }, Constants.TIMEOUT_LOAD);
    };
    const textElement = toolbar.subElement.querySelector(".b3-text-field") as HTMLTextAreaElement;
    if (types.includes("NodeHTMLBlock")) {
        textElement.value = Lute.UnEscapeHTMLStr(renderElement.querySelector("protyle-html").getAttribute("data-content") || "");
    } else if (isInlineMemo) {
        textElement.value = Lute.UnEscapeHTMLStr(renderElement.getAttribute("data-inline-memo-content") || "");
    } else {
        textElement.value = Lute.UnEscapeHTMLStr(renderElement.getAttribute("data-content") || "");
    }
    const oldTextValue = textElement.value;
    textElement.addEventListener("input", (event) => {
        if (!renderElement.parentElement) {
            return;
        }
        if (textElement.clientHeight !== textElement.scrollHeight) {
            autoHeight();
        }
        if (!toolbar.subElement.querySelector('[data-type="refresh"]').classList.contains("block__icon--active")) {
            return;
        }
        if (types.includes("NodeHTMLBlock")) {
            renderElement.querySelector("protyle-html").setAttribute("data-content", Lute.EscapeHTMLStr(textElement.value));
        } else if (isInlineMemo) {
            let inlineMemoElements;
            if (updateElements) {
                inlineMemoElements = updateElements;
            } else {
                inlineMemoElements = [renderElement];
            }
            inlineMemoElements.forEach((item) => {
                if (item.nodeType !== 3) {
                    item.setAttribute("data-inline-memo-content", window.DOMPurify.sanitize(textElement.value));
                }
            });
        } else {
            renderElement.setAttribute("data-content", Lute.EscapeHTMLStr(textElement.value));
            renderElement.removeAttribute("data-render");
        }
        if (!types.includes("NodeBlockQueryEmbed") || !types.includes("NodeHTMLBlock") || !isInlineMemo) {
            processRender(renderElement);
        }
        event.stopPropagation();
    });
    textElement.addEventListener("keydown", (event: KeyboardEvent) => {
        event.stopPropagation();
        if (matchHotKey(window.sourceflow.config.keymap.editor.insert["inline-math"].custom, event)) {
            event.preventDefault();
            return;
        }
        if (event.isComposing) {
            return;
        }
        if (event.key === "Escape" || matchHotKey("⌘↩", event)) {
            toolbar.subElement.querySelector('[data-type="pin"]').setAttribute("aria-label", window.sourceflow.languages.pin);
            hideElements(["util"], protyle);
        } else if (event.key === "Tab") {
            document.execCommand("insertText", false, "\t");
            event.preventDefault();
        } else if (electronUndo(event)) {
            return;
        }
    });
    toolbar.subElementCloseCB = () => {
        const noChange = !renderElement.parentElement || protyle.disabled ||
            (textElement.value && oldTextValue === textElement.value);
        let inlineLastNode: Element;
        if (types.includes("NodeHTMLBlock") && !noChange) {
            let htmlText = textElement.value;
            if (htmlText) {
                htmlText = htmlText.trim().replace(/\n+/g, "\n");
                if (!(htmlText.startsWith("<div>") && htmlText.endsWith("</div>"))) {
                    htmlText = `<div>\n${htmlText}\n</div>`;
                }
            }
            renderElement.querySelector("protyle-html").setAttribute("data-content", Lute.EscapeHTMLStr(htmlText));
            const tempElement = document.createElement("template");
            tempElement.innerHTML = protyle.lute.SpinBlockDOM(nodeElement.outerHTML);
            if (tempElement.content.childElementCount > 1) {
                showMessage(window.sourceflow.languages.htmlBlockTip);
            }
        } else if (isInlineMemo && !noChange) {
            let inlineMemoElements;
            if (updateElements) {
                inlineMemoElements = updateElements;
            } else {
                inlineMemoElements = [renderElement];
            }
            inlineMemoElements.forEach((item, index) => {
                if (!textElement.value) {
                    const currentTypes = item.getAttribute("data-type").split(" ");
                    if (currentTypes.length === 1 && currentTypes[0] === "inline-memo") {
                        item.outerHTML = item.innerHTML + (index === inlineMemoElements.length - 1 ? "<wbr>" : "");
                    } else {
                        currentTypes.find((typeItem, typeIndex) => {
                            if (typeItem === "inline-memo") {
                                currentTypes.splice(typeIndex, 1);
                                return true;
                            }
                        });
                        item.setAttribute("data-type", currentTypes.join(" "));
                        item.removeAttribute("data-inline-memo-content");
                    }
                    if (index === inlineMemoElements.length - 1) {
                        inlineLastNode = item;
                    }
                } else if (item.nodeType !== 3) {
                    item.setAttribute("data-inline-memo-content", window.DOMPurify.sanitize(textElement.value));
                }
            });
        } else if (types.includes("inline-math") && !noChange) {
            if (textElement.value) {
                renderElement.setAttribute("data-content", Lute.EscapeHTMLStr(textElement.value));
                renderElement.removeAttribute("data-render");
                processRender(renderElement);
            } else {
                inlineLastNode = renderElement;
                renderElement.outerHTML = "<wbr>";
            }
        } else if (!noChange) {
            renderElement.setAttribute("data-content", Lute.EscapeHTMLStr(textElement.value));
            renderElement.removeAttribute("data-render");
            if (types.includes("NodeBlockQueryEmbed")) {
                blockRender(protyle, renderElement);
                (renderElement as HTMLElement).style.height = "";
            } else {
                processRender(renderElement);
            }
        }
        if (getSelection().rangeCount === 0 ||
            (getSelection().rangeCount > 0 && hasClosestByClassName(getSelection().getRangeAt(0).startContainer, "protyle-util"))
        ) {
            if (renderElement.tagName === "SPAN") {
                if (inlineLastNode) {
                    if (inlineLastNode.parentElement) {
                        toolbar.range.setStartAfter(inlineLastNode);
                        toolbar.range.collapse(true);
                        focusByRange(toolbar.range);
                    } else {
                        focusByWbr(nodeElement, toolbar.range);
                    }
                } else if (renderElement.parentElement) {
                    toolbar.range.setStartAfter(renderElement);
                    toolbar.range.collapse(true);
                    focusByRange(toolbar.range);
                }
            } else {
                protyle.wysiwyg.element.focus({preventScroll: true});
                focusBlock(renderElement);
                renderElement.classList.add("protyle-wysiwyg--select");
            }
        } else {
            nodeElement.querySelector("wbr")?.remove();
        }

        if (!noChange && nodeElement.outerHTML !== html) {
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            updateTransaction(protyle, id, nodeElement.outerHTML, html);
        }
    };
    toolbar.subElement.style.zIndex = (++window.sourceflow.zIndex).toString();
    toolbar.subElement.classList.remove("fn__none");
    const nodeRect = renderElement.getBoundingClientRect();
    toolbar.element.classList.add("fn__none");
    if (isPin) {
        textElement.style.width = pinData.styleW;
        textElement.style.height = pinData.styleH;
    } else {
        autoHeight();
    }
    if (!protyle.disabled) {
        textElement.select();
    }
    protyle.app.plugins.forEach(item => {
        item.eventBus.emit("open-noneditableblock", {
            protyle,
            toolbar,
            blockElement: nodeElement,
            renderElement,
        });
    });
};
