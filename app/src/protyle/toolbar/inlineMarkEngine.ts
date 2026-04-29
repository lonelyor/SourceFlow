import * as dayjs from "dayjs";
import {Constants} from "../../constants";
import {linkMenu} from "../../menus/protyle";
import {isArrayEqual, isMobile} from "../../util/functions";
import {mathRender} from "../render/mathRender";
import {hasClosestBlock} from "../util/hasClosest";
import {fixTableRange, focusByRange, setLastNodeRange} from "../util/selection";
import {getContenteditableElement, hasNextSibling, hasPreviousSibling} from "../wysiwyg/getBlock";
import {updateTransaction} from "../wysiwyg/transaction";
import {hasSameTextStyle, setFontStyle} from "./Font";
import type {Toolbar} from "./index";
import {mergeToolbarNodes} from "./shared";


export const setToolbarInlineMark = (toolbar: Toolbar, protyle: IProtyle, type: string, action: "range" | "toolbar", textObj?: ITextOption) => {
        const nodeElement = hasClosestBlock(toolbar.range.startContainer);
        if (!nodeElement || nodeElement.getAttribute("data-type") === "NodeCodeBlock") {
            return;
        }
        const endElement = hasClosestBlock(toolbar.range.endContainer);
        if (!endElement) {
            return;
        }
        // 三击后还没有重新纠正 range 时使用快捷键标记会导致异常 https://github.com/lonelyor/SourceFlow/issues/7068
        if (nodeElement !== endElement) {
            toolbar.range = setLastNodeRange(getContenteditableElement(nodeElement), toolbar.range, false);
        }

        let rangeTypes: string[] = [];
        toolbar.range.cloneContents().childNodes.forEach((item: HTMLElement) => {
            if (item.nodeType !== 3) {
                rangeTypes = rangeTypes.concat((item.getAttribute("data-type") || "").split(" "));
            }
        });
        let rangeStartNextSibling = hasNextSibling(toolbar.range.startContainer);
        while (rangeStartNextSibling && rangeStartNextSibling.nodeType === 1 && (rangeStartNextSibling as HTMLElement).tagName === "BR") {
            rangeStartNextSibling = hasNextSibling(rangeStartNextSibling);
        }
        const isSameNode = toolbar.range.startContainer === toolbar.range.endContainer ||
            (rangeStartNextSibling && rangeStartNextSibling === toolbar.range.endContainer &&
                toolbar.range.startContainer.parentElement === toolbar.range.endContainer.parentElement);
        if (toolbar.range.startContainer.nodeType === 3 && toolbar.range.startContainer.parentElement.tagName === "SPAN" &&
            isSameNode &&
            toolbar.range.startOffset > -1 && toolbar.range.endOffset <= toolbar.range.endContainer.textContent.length) {
            rangeTypes = rangeTypes.concat((toolbar.range.startContainer.parentElement.getAttribute("data-type") || "").split(" "));
        }
        const selectText = toolbar.range.toString();
        let keepZWPS = false;
        // ctrl+b/u/i  https://github.com/lonelyor/SourceFlow/issues/14820
        if (!selectText && toolbar.range.startOffset === 1 && toolbar.range.startContainer.textContent === Constants.ZWSP) {
            let newElement;
            if (toolbar.range.startContainer.nodeType === 1) {
                newElement = toolbar.range.startContainer as HTMLElement;
            } else {
                newElement = toolbar.range.startContainer.parentElement;
            }
            if (newElement.tagName === "SPAN") {
                rangeTypes = rangeTypes.concat((newElement.getAttribute("data-type") || "").split(" "));
                toolbar.range.setStart(newElement.firstChild, 0);
                toolbar.range.setEnd(newElement.lastChild, newElement.lastChild.textContent.length || 0);
                keepZWPS = true;
            }
        }
        if (rangeTypes.length === 1) {
            // https://github.com/lonelyor/SourceFlow/issues/6501
            // https://github.com/lonelyor/SourceFlow/issues/12877
            if (["block-ref", "virtual-block-ref", "file-annotation-ref", "a", "inline-memo", "inline-math", "tag"].includes(rangeTypes[0]) && type === "clear") {
                return;
            }
        }
        // https://github.com/lonelyor/SourceFlow/issues/14534
        if (rangeTypes.includes("text") && type === "text" && textObj && toolbar.range.startContainer.nodeType === 3 && toolbar.range.startContainer === toolbar.range.endContainer) {
            const selectParentElement = toolbar.range.startContainer.parentElement;
            if (selectParentElement && hasSameTextStyle(null, selectParentElement, textObj)) {
                return;
            }
        }
        fixTableRange(toolbar.range);

        let contents;
        let html;
        let needWrapTarget;
        if (toolbar.range.startContainer.nodeType === 3 && toolbar.range.startContainer.parentElement.tagName === "SPAN" &&
            isSameNode) {
            if (toolbar.range.startOffset > -1 && toolbar.range.endOffset <= toolbar.range.endContainer.textContent.length) {
                needWrapTarget = toolbar.range.startContainer.parentElement;
            }
            const startPreviousSibling = hasPreviousSibling(toolbar.range.startContainer);
            const endNextSibling = hasNextSibling(toolbar.range.endContainer);
            if ((
                    toolbar.range.startOffset !== 0 ||
                    // https://github.com/lonelyor/SourceFlow/issues/14869
                    (toolbar.range.startOffset === 0 && startPreviousSibling &&
                        (startPreviousSibling.nodeType === 3 || (startPreviousSibling as HTMLElement).tagName === "BR") &&
                        toolbar.range.startContainer.previousSibling.parentElement === toolbar.range.startContainer.parentElement)
                ) && (
                    toolbar.range.endOffset !== toolbar.range.endContainer.textContent.length ||
                    // https://github.com/lonelyor/SourceFlow/issues/14869#issuecomment-2911553387
                    (
                        toolbar.range.endOffset === toolbar.range.endContainer.textContent.length && endNextSibling &&
                        (endNextSibling.nodeType === 3 || (endNextSibling as HTMLElement).tagName === "BR") &&
                        toolbar.range.endContainer.nextSibling.parentElement === toolbar.range.endContainer.parentElement
                    )
                ) &&
                !(toolbar.range.startOffset === 1 && toolbar.range.startContainer.textContent.startsWith(Constants.ZWSP))) {
                // 切割元素
                const parentElement = toolbar.range.startContainer.parentElement;
                const afterElement = document.createElement("span");
                const attributes = parentElement.attributes;
                for (let i = 0; i < attributes.length; i++) {
                    afterElement.setAttribute(attributes[i].name, attributes[i].value);
                }
                toolbar.range.insertNode(document.createElement("wbr"));
                html = nodeElement.outerHTML;
                contents = toolbar.range.extractContents();
                toolbar.range.setEnd(parentElement.lastChild, parentElement.lastChild.textContent.length);
                afterElement.append(toolbar.range.extractContents());
                parentElement.after(afterElement);
                toolbar.range.setStartBefore(afterElement);
                toolbar.range.collapse(true);
            }
        }
        let isEndSpan = false;
        // https://github.com/lonelyor/SourceFlow/issues/7200
        if (toolbar.range.endOffset === toolbar.range.endContainer.textContent.length &&
            !["DIV", "TD", "TH", "TR"].includes(toolbar.range.endContainer.parentElement.tagName) &&
            !hasNextSibling(toolbar.range.endContainer)) {
            toolbar.range.setEndAfter(toolbar.range.endContainer.parentElement);
            isEndSpan = true;
        }
        if (toolbar.range.startOffset === 0 &&
            !["DIV", "TD", "TH", "TR"].includes(toolbar.range.startContainer.parentElement.tagName) &&
            !hasPreviousSibling(toolbar.range.startContainer)) {
            toolbar.range.setStartBefore(toolbar.range.startContainer.parentElement);
        }
        if (!html) {
            toolbar.range.insertNode(document.createElement("wbr"));
            html = nodeElement.outerHTML;
            contents = toolbar.range.extractContents();
        }
        mergeToolbarNodes(contents.childNodes);
        contents.childNodes.forEach((item: HTMLElement) => {
            if (item.nodeType === 3 && item.textContent === Constants.ZWSP) {
                item.remove();
            }
            if (item.nodeType === 1 && item.textContent === "" && item.tagName === "SPAN") {
                item.remove();
            }
        });
        if (selectText && toolbar.range.startContainer.nodeType !== 3) {
            let emptyNode: Element = toolbar.range.startContainer.childNodes[toolbar.range.startOffset] as HTMLElement;
            if (!emptyNode) {
                emptyNode = toolbar.range.startContainer.childNodes[toolbar.range.startOffset - 1] as HTMLElement;
            }
            if (emptyNode && emptyNode.nodeType === 3) {
                if ((toolbar.range.startContainer as HTMLElement).tagName === "DIV") {
                    emptyNode = emptyNode.previousSibling as HTMLElement;
                } else {
                    emptyNode = toolbar.range.startContainer as HTMLElement;
                }
            }
            if (emptyNode && emptyNode.nodeType !== 3 && emptyNode.textContent.replace(Constants.ZWSP, "") === "" &&
                !["TD", "TH", "BR"].includes(emptyNode.tagName)) {
                emptyNode.remove();
            }
        }
        // 选择 span 中的部分需进行包裹
        if (needWrapTarget) {
            const attributes = needWrapTarget.attributes;
            contents.childNodes.forEach(item => {
                if (item.nodeType === 3) {
                    const spanElement = document.createElement("span");
                    for (let i = 0; i < attributes.length; i++) {
                        spanElement.setAttribute(attributes[i].name, attributes[i].value);
                    }
                    spanElement.innerHTML = item.textContent;
                    item.replaceWith(spanElement);
                }
            });
        }
        const toolbarElement = isMobile() ? document.querySelector("#keyboardToolbar .keyboard__dynamic").nextElementSibling : toolbar.element;
        const actionBtn = action === "toolbar" ? toolbarElement.querySelector(`[data-type="${type}"]`) : undefined;
        const newNodes: Node[] = [];
        let startContainer: Node;
        let endContainer: Node;
        let startOffset: number;
        let endOffset: number;
        if (type === "clear" || actionBtn?.classList.contains("protyle-toolbar__item--current") || (
            action === "range" && rangeTypes.length > 0 && rangeTypes.includes(type) && !textObj
        )) {
            // 移除
            if (type === "clear") {
                toolbarElement.querySelectorAll('[data-type="strong"],[data-type="em"],[data-type="u"],[data-type="s"],[data-type="mark"],[data-type="sup"],[data-type="sub"],[data-type="kbd"],[data-type="mark"],[data-type="code"]').forEach(item => {
                    item.classList.remove("protyle-toolbar__item--current");
                });
            } else if (actionBtn) {
                actionBtn.classList.remove("protyle-toolbar__item--current");
            }
            if (contents.childNodes.length === 0) {
                rangeTypes.find((itemType, index) => {
                    if (type === itemType) {
                        rangeTypes.splice(index, 1);
                        return true;
                    }
                });
                if (rangeTypes.length === 0 || type === "clear") {
                    newNodes.push(document.createTextNode(Constants.ZWSP));
                    startContainer = newNodes[0];
                } else {
                    let removeIndex = 0;
                    while (removeIndex < rangeTypes.length) {
                        if (["inline-memo", "text", "block-ref", "virtual-block-ref", "file-annotation-ref", "a"].includes(rangeTypes[removeIndex])) {
                            rangeTypes.splice(removeIndex, 1);
                        } else {
                            ++removeIndex;
                        }
                    }
                    const inlineElement = document.createElement("span");
                    inlineElement.setAttribute("data-type", rangeTypes.join(" "));
                    inlineElement.textContent = Constants.ZWSP;
                    newNodes.push(inlineElement);
                    startContainer = newNodes[0].firstChild;
                }
                keepZWPS = true;
                startOffset = 1;
            }
            contents.childNodes.forEach((item: HTMLElement) => {
                if (item.nodeType !== 3 && item.tagName !== "BR" && item.tagName !== "IMG" && !item.classList.contains("img")) {
                    const types = (item.getAttribute("data-type") || "").split(" ");
                    if (type === "clear") {
                        for (let i = 0; i < types.length; i++) {
                            if (textObj && textObj.type === "text") {
                                if ("text" === types[i]) {
                                    types.splice(i, 1);
                                    i--;
                                }
                            } else {
                                if (["kbd", "text", "strong", "em", "u", "s", "mark", "sup", "sub", "code"].includes(types[i])) {
                                    types.splice(i, 1);
                                    i--;
                                }
                            }
                        }
                    } else {
                        types.find((itemType, typeIndex) => {
                            if (type === itemType) {
                                types.splice(typeIndex, 1);
                                return true;
                            }
                        });
                    }
                    if (types.length === 0) {
                        newNodes.push(document.createTextNode(item.textContent));
                    } else {
                        if (type === "clear") {
                            item.style.color = "";
                            item.style.webkitTextFillColor = "";
                            item.style.webkitTextStroke = "";
                            item.style.textShadow = "";
                            item.style.backgroundColor = "";
                            item.style.fontSize = "";
                            item.style.filter = "";
                            item.style.opacity = "";
                            item.style.userSelect = "";
                            item.style.pointerEvents = "";
                            item.removeAttribute("data-inline-hidden");
                        }
                        item.setAttribute("data-type", types.join(" "));
                        newNodes.push(item);
                    }
                } else {
                    newNodes.push(item);
                }
            });
        } else {
            // 添加
            if (!toolbar.element.classList.contains("fn__none") && type !== "text" && actionBtn) {
                actionBtn.classList.add("protyle-toolbar__item--current");
            }
            if (selectText === "") {
                const inlineElement = document.createElement("span");
                rangeTypes.push(type);

                // 遇到以下类型结尾不应继承 https://github.com/lonelyor/SourceFlow/issues/7200
                if (isEndSpan) {
                    let removeIndex = 0;
                    while (removeIndex < rangeTypes.length) {
                        if (["inline-memo", "text", "block-ref", "virtual-block-ref", "file-annotation-ref", "a"].includes(rangeTypes[removeIndex])) {
                            rangeTypes.splice(removeIndex, 1);
                        } else {
                            ++removeIndex;
                        }
                    }
                    // https://github.com/lonelyor/SourceFlow/issues/14421
                    if (rangeTypes.length === 0) {
                        rangeTypes.push(type);
                    }
                }
                inlineElement.setAttribute("data-type", [...new Set(rangeTypes)].join(" "));
                inlineElement.textContent = Constants.ZWSP;
                setFontStyle(inlineElement, textObj);
                newNodes.push(inlineElement);
                keepZWPS = true;
            } else {
                // https://github.com/lonelyor/SourceFlow/issues/7477
                // https://github.com/lonelyor/SourceFlow/issues/8825
                if (type === "block-ref") {
                    while (contents.childNodes.length > 1) {
                        contents.childNodes[0].remove();
                    }
                }
                contents.childNodes.forEach((item: HTMLElement) => {
                    let removeText = "";
                    if (item.nodeType === 3 && item.textContent) {
                        // https://github.com/lonelyor/SourceFlow/issues/14204
                        while (item.textContent.endsWith("\n")) {
                            item.textContent = item.textContent.substring(0, item.textContent.length - 1);
                            removeText += "\n";
                        }
                        if (item.textContent) {
                            const inlineElement = document.createElement("span");
                            inlineElement.setAttribute("data-type", type);
                            inlineElement.textContent = item.textContent;
                            if (type === "a") {
                                if (!inlineElement.textContent) {
                                    inlineElement.textContent = "*";
                                }
                                textObj.color = textObj.color.split(Constants.ZWSP)[0];
                            }
                            setFontStyle(inlineElement, textObj);

                            if (type === "text" && !inlineElement.getAttribute("style")) {
                                newNodes.push(item);
                            } else {
                                newNodes.push(inlineElement);
                            }
                        }
                    } else if (item.nodeType === 1) {
                        let types = (item.getAttribute("data-type") || "").split(" ");
                        for (let i = 0; i < types.length; i++) {
                            // "backslash", "virtual-block-ref", "search-mark" 只能单独存在
                            if (["backslash", "virtual-block-ref", "search-mark"].includes(types[i])) {
                                types.splice(i, 1);
                                i--;
                            }
                        }
                        if (!types.includes("img")) {
                            types.push(type);
                        }
                        // 上标和下标不能同时存在 https://github.com/lonelyor/SourceFlow/issues/1049
                        if (type === "sub" && types.includes("sup")) {
                            types.find((item, index) => {
                                if (item === "sup") {
                                    types.splice(index, 1);
                                    toolbarElement.querySelector('[data-type="sup"]').classList.remove("protyle-toolbar__item--current");
                                    return true;
                                }
                            });
                        } else if (type === "sup" && types.includes("sub")) {
                            types.find((item, index) => {
                                if (item === "sub") {
                                    types.splice(index, 1);
                                    toolbarElement.querySelector('[data-type="sub"]').classList.remove("protyle-toolbar__item--current");
                                    return true;
                                }
                            });
                        } else if (type === "block-ref" && (types.includes("a") || types.includes("file-annotation-ref"))) {
                            // 虚拟引用和链接/标注不能同时存在
                            types.find((item, index) => {
                                if (item === "a" || item === "file-annotation-ref") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                        } else if (type === "a" && (types.includes("block-ref") || types.includes("file-annotation-ref"))) {
                            // 链接和引用/标注不能同时存在
                            types.find((item, index) => {
                                if (item === "block-ref" || item === "file-annotation-ref") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                        } else if (type === "file-annotation-ref" && (types.includes("block-ref") || types.includes("a"))) {
                            // 引用和链接/标注不能同时存在
                            types.find((item, index) => {
                                if (item === "block-ref" || item === "a") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                        } else if (type === "inline-memo" && types.includes("inline-math")) {
                            // 数学公式和备注不能同时存在
                            types.find((item, index) => {
                                if (item === "inline-math") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                            if (item.querySelector(".katex")) {
                                // 选中完整的数学公式才进行备注 https://github.com/lonelyor/SourceFlow/issues/13667
                                item.textContent = item.getAttribute("data-content");
                            }
                        } else if (type === "inline-math" && types.includes("inline-memo")) {
                            // 数学公式和备注不能同时存在
                            types.find((item, index) => {
                                if (item === "inline-memo") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                        }
                        types = [...new Set(types)];
                        if (item.tagName !== "BR" && item.tagName !== "IMG" && !types.includes("img")) {
                            item.setAttribute("data-type", types.join(" "));
                            if (type === "a") {
                                if (!item.textContent) {
                                    item.textContent = "*";
                                }
                                textObj.color = textObj.color.split(Constants.ZWSP)[0];
                            }
                            setFontStyle(item, textObj);
                            if (types.includes("text") && !item.getAttribute("style")) {
                                if (types.length === 1) {
                                    const tempText = document.createTextNode(item.textContent);
                                    newNodes.push(tempText);
                                } else {
                                    types.splice(types.indexOf("text"), 1);
                                    item.setAttribute("data-type", types.join(" "));
                                    newNodes.push(item);
                                }
                            } else {
                                newNodes.push(item);
                            }
                        } else {
                            newNodes.push(item);
                        }
                    }
                    if (removeText) {
                        newNodes.push(document.createTextNode(removeText));
                    }
                });
            }
        }
        // 插入元素
        for (let i = newNodes.length - 1; i > -1; i--) {
            toolbar.range.insertNode(newNodes[i]);
        }
        if (newNodes.length === 1 && newNodes[0].textContent === Constants.ZWSP) {
            toolbar.range.setStart(newNodes[0], 1);
            toolbar.range.collapse(true);
            if (newNodes[0].nodeType !== 3) {
                // 不选中后，ctrl+g 光标重置
                const currentType = ((newNodes[0] as HTMLElement).getAttribute("data-type") || "").split(" ");
                if (currentType.includes("code") || currentType.includes("tag") || currentType.includes("kbd")) {
                    keepZWPS = false;
                }
            }
        }
        if (!keepZWPS) {
            // 合并元素
            for (let i = 0; i <= newNodes.length; i++) {
                let previousElement = i === newNodes.length ? newNodes[i - 1] as HTMLElement : hasPreviousSibling(newNodes[i]) as HTMLElement;
                if (previousElement.nodeType === 3 && previousElement.textContent === Constants.ZWSP) {
                    previousElement = hasPreviousSibling(previousElement) as HTMLElement;
                    if (previousElement) {
                        previousElement.nextSibling.remove();
                    }
                }
                let currentNode = newNodes[i] as HTMLElement;
                if (!currentNode) {
                    currentNode = hasNextSibling(newNodes[i - 1]) as HTMLElement;
                    if (currentNode && currentNode.nodeType === 3 && currentNode.textContent === Constants.ZWSP) {
                        currentNode = hasNextSibling(currentNode) as HTMLElement;
                        if (currentNode) {
                            currentNode.previousSibling.remove();
                        }
                    }
                }
                if (currentNode && currentNode.nodeType !== 3) {
                    const currentType = (currentNode.getAttribute("data-type") || "").split(" ");
                    if (currentNode.tagName !== "BR" &&
                        previousElement && previousElement.nodeType !== 3 &&
                        currentNode.nodeType !== 3 &&
                        isArrayEqual(currentType, (previousElement.getAttribute("data-type") || "").split(" ")) &&
                        hasSameTextStyle(currentNode, previousElement)) {
                        if (currentType.includes("code") || currentType.includes("tag") || currentType.includes("kbd")) {
                            if (currentNode.textContent.startsWith(Constants.ZWSP)) {
                                currentNode.textContent = currentNode.textContent.substring(1);
                            }
                        }
                        if (currentType.includes("inline-math")) {
                            // 数学公式合并 data-content https://github.com/lonelyor/SourceFlow/issues/6028
                            currentNode.setAttribute("data-content", previousElement.getAttribute("data-content") + currentNode.getAttribute("data-content"));
                        } else if (currentType.includes("block-ref") && previousElement.getAttribute("data-id") === currentNode.getAttribute("data-id")) {
                            if (previousElement.dataset.subtype !== "d" || previousElement.dataset.subtype !== "d") {
                                currentNode.setAttribute("data-subtype", "s");
                                currentNode.textContent = previousElement.textContent + currentNode.textContent;
                            }
                        } else {
                            // 测试不存在 情况，故移除引用合并限制
                            // 搜索结果引用被高亮隔断需进行合并 https://github.com/lonelyor/SourceFlow/issues/7588
                            // textContent：防止赋值后 \n 转换为 br 导致后续 toolbar.range.setStart 报错；innerText：获取 br 的 \n， https://github.com/lonelyor/SourceFlow/issues/15968
                            currentNode.textContent = previousElement.innerText + currentNode.innerText;
                            // 如果为备注时，合并备注内容
                            if (currentType.includes("inline-memo")) {
                                currentNode.setAttribute("data-inline-memo-content", (previousElement.getAttribute("data-inline-memo-content") || "") +
                                    (currentNode.getAttribute("data-inline-memo-content") || ""));
                            }
                        }
                        if (!currentType.includes("inline-math")) {
                            if (i === 0) {
                                startContainer = currentNode;
                                startOffset = previousElement.textContent.length;
                            } else if (i === newNodes.length) {
                                endContainer = currentNode;
                                endOffset = previousElement.textContent.length;
                                if (!startContainer) {
                                    startContainer = currentNode;
                                } else if (startContainer === previousElement) {
                                    startContainer = currentNode;
                                }
                            }
                        }
                        previousElement.remove();
                        if (i > 0) {
                            newNodes.splice(i - 1, 1);
                            i--;
                        }
                        if (newNodes.length === 0) {
                            newNodes.push(currentNode);
                            break;
                        }
                    }
                }
            }
            // 整理 zwsp
            for (let i = 0; i <= newNodes.length; i++) {
                const previousElement = i === newNodes.length ? newNodes[i - 1] as HTMLElement : hasPreviousSibling(newNodes[i]) as HTMLElement;
                let currentNode = newNodes[i] as HTMLElement;
                if (!currentNode) {
                    currentNode = hasNextSibling(newNodes[i - 1]) as HTMLElement;
                }
                if (!currentNode) {
                    if (previousElement.nodeType !== 3) {
                        const currentType = (previousElement.getAttribute("data-type") || "").split(" ");
                        if (currentType.includes("code") || currentType.includes("tag") || currentType.includes("kbd")) {
                            previousElement.insertAdjacentText("afterend", Constants.ZWSP);
                        }
                    }
                    break;
                }
                if (currentNode.nodeType === 3) {
                    if (previousElement && previousElement.nodeType === 3) {
                        if (currentNode.textContent.startsWith(Constants.ZWSP)) {
                            currentNode.textContent = currentNode.textContent.substring(1);
                        }
                        if (previousElement.textContent.endsWith(Constants.ZWSP)) {
                            previousElement.textContent = previousElement.textContent.substring(0, previousElement.textContent.length - 1);
                        }
                    } else {
                        const previousType = previousElement ? (previousElement.getAttribute("data-type") || "").split(" ") : [];
                        if (previousType.includes("code") || previousType.includes("tag") || previousType.includes("kbd")) {
                            if (!currentNode.textContent.startsWith(Constants.ZWSP)) {
                                currentNode.textContent = Constants.ZWSP + currentNode.textContent;
                            }
                        } else if (currentNode.textContent.startsWith(Constants.ZWSP)) {
                            currentNode.textContent = currentNode.textContent.substring(1);
                        }
                    }
                } else {
                    const currentType = currentNode.nodeType === 3 ? [] : (currentNode.getAttribute("data-type") || "").split(" ");
                    if (currentType.includes("code") || currentType.includes("tag") || currentType.includes("kbd")) {
                        if (!currentNode.textContent.startsWith(Constants.ZWSP)) {
                            currentNode.insertAdjacentText("afterbegin", Constants.ZWSP);
                        }
                        if (!previousElement || (previousElement.nodeType === 3 && previousElement.textContent.endsWith("\n"))) {
                            currentNode.insertAdjacentText("beforebegin", Constants.ZWSP);
                        }
                    } else if (currentNode.textContent.startsWith(Constants.ZWSP)) {
                        currentNode.textContent = currentNode.textContent.substring(1);
                    }
                    if (previousElement && previousElement.nodeType !== 3) {
                        const previousType = (previousElement.getAttribute("data-type") || "").split(" ");
                        if (previousType.includes("code") || previousType.includes("tag") || previousType.includes("kbd")) {
                            currentNode.insertAdjacentText("beforebegin", Constants.ZWSP);
                        }
                    }
                }
            }
        }
        nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
        updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, html);
        nodeElement.querySelectorAll("wbr").forEach(item => {
            item.remove();
        });
        if (startContainer && typeof startOffset === "number") {
            if (startContainer.nodeType === 3) {
                toolbar.range.setStart(startContainer, startOffset);
            } else {
                toolbar.range.setStart(startContainer.firstChild, startOffset);
            }
        }

        if (endContainer && typeof endOffset === "number") {
            if (endContainer.nodeType === 3) {
                toolbar.range.setEnd(endContainer, endOffset);
            } else {
                toolbar.range.setEnd(endContainer.firstChild, endOffset);
            }
        }
        focusByRange(toolbar.range);

        const showMenuElement = newNodes[0] as HTMLElement;
        if (showMenuElement.nodeType !== 3) {
            const showMenuTypes = (showMenuElement.getAttribute("data-type") || "").split(" ");
            if (type === "inline-math") {
                mathRender(nodeElement);
                if (selectText === "" && showMenuTypes.includes("inline-math")) {
                    protyle.toolbar.showRender(protyle, showMenuElement, undefined, html);
                }
            } else if (type === "inline-memo") {
                if (!showMenuElement.getAttribute("data-inline-memo-content") &&
                    showMenuTypes.includes("inline-memo")) {
                    protyle.toolbar.showRender(protyle, showMenuElement, newNodes as Element[], html);
                }
            } else if (type === "a") {
                if (showMenuTypes.includes("a") &&
                    (showMenuElement.textContent.replace(Constants.ZWSP, "") === "" || !showMenuElement.getAttribute("data-href"))) {
                    linkMenu(protyle, showMenuElement, showMenuElement.getAttribute("data-href") ? true : false);
                }
            }
        }
        return newNodes;
    }


