import {Constants} from "../../constants";
import {addScript} from "../util/addScript";
import {setCodeTheme} from "../render/util";

export const highlightRender = (element: Element, cdn = Constants.PROTYLE_CDN, zoom = 1) => {
    let codeElements: NodeListOf<Element>;
    let isPreview = false;
    if (element.classList.contains("code-block")) {
        codeElements = element.querySelectorAll(".hljs");
    } else if (element.classList.contains("item__readme")) {
        codeElements = element.querySelectorAll("pre code");
        codeElements.forEach((item) => {
            item.parentElement.setAttribute("linenumber", "false");
        });
    } else if (element.classList.contains("b3-typography")) {
        codeElements = element.querySelectorAll(".code-block code");
        isPreview = true;
    } else {
        codeElements = element.querySelectorAll(".code-block .hljs");
    }
    if (codeElements.length === 0) {
        return;
    }

    setCodeTheme(cdn);

    addScript(`${cdn}/js/highlight.js/highlight.min.js?v=11.11.1`, "protyleHljsScript").then(() => {
        addScript(`${cdn}/js/highlight.js/third-languages.js?v=2.0.1`, "protyleHljsThirdScript").then(() => {
            codeElements.forEach((block: HTMLElement) => {
                if (block.getAttribute("data-render") === "true") {
                    return;
                }
                block.setAttribute("data-render", "true");
                const iconElements = block.parentElement.querySelectorAll(".protyle-icon");
                if (iconElements.length === 2) {
                    iconElements[0].setAttribute("aria-label", window.sourceflow.languages.copy);
                    iconElements[1].setAttribute("aria-label", window.sourceflow.languages.more);
                }
                block.querySelector("wbr")?.remove();

                let language;
                if (isPreview) {
                    language = block.parentElement.getAttribute("data-language");
                } else if (block.previousElementSibling) {
                    language = block.previousElementSibling.firstElementChild.textContent;
                } else {
                    language = block.className.replace("language-", "");
                }
                if (!window.hljs.getLanguage(language)) {
                    language = "plaintext";
                }
                block.classList.add("hljs");
                const autoEnter = block.parentElement.getAttribute("linewrap");
                const ligatures = block.parentElement.getAttribute("ligatures");
                const lineNumber = block.parentElement.getAttribute("linenumber");
                const hljsElement = block.lastElementChild ? block.lastElementChild as HTMLElement : block;
                if (autoEnter === "true" || (autoEnter !== "false" && window.sourceflow.config.editor.codeLineWrap)) {
                    hljsElement.style.setProperty("white-space", "pre-wrap");
                    hljsElement.style.setProperty("word-break", "break-word");
                } else {
                    hljsElement.style.setProperty("white-space", "pre");
                    hljsElement.style.setProperty("word-break", "initial");
                }
                if (ligatures === "true" || (ligatures !== "false" && window.sourceflow.config.editor.codeLigatures)) {
                    hljsElement.style.fontVariantLigatures = "normal";
                } else {
                    hljsElement.style.fontVariantLigatures = "none";
                }
                const codeText = hljsElement.textContent;
                if (block.firstElementChild) {
                    if (!isPreview && (lineNumber === "true" || (lineNumber !== "false" && window.sourceflow.config.editor.codeSyntaxHighlightLineNum))) {
                        block.firstElementChild.className = "protyle-linenumber__rows";
                        block.firstElementChild.setAttribute("contenteditable", "false");
                        lineNumberRender(block, zoom);
                        block.style.display = "";
                    } else {
                        block.firstElementChild.className = "fn__none";
                        block.firstElementChild.innerHTML = "";
                        hljsElement.style.paddingLeft = "";
                        block.style.display = "block";
                    }
                }
                hljsElement.innerHTML = window.hljs.highlight(
                    codeText + (codeText.endsWith("\n") ? "" : "\n"),
                    {
                        language,
                        ignoreIllegals: true,
                    },
                ).value;
            });
        });
    });
};

export const lineNumberRender = (block: HTMLElement, zoom = 1) => {
    const lineNumber = block.parentElement.getAttribute("lineNumber");
    if (lineNumber === "false") {
        return;
    }
    if (!window.sourceflow.config.editor.codeSyntaxHighlightLineNum && lineNumber !== "true") {
        return;
    }
    block.parentElement.style.lineHeight = `${((parseInt(block.parentElement.style.fontSize) || window.sourceflow.config.editor.fontSize) * 1.625 * 0.85).toFixed(0)}px`;
    const codeElement = block.lastElementChild as HTMLElement;

    const lineList = codeElement.textContent.split(/\r\n|\r|\n|\u2028|\u2029/g);
    if (lineList[lineList.length - 1] === "" && lineList.length > 1) {
        lineList.pop();
    }
    block.firstElementChild.innerHTML = `<span>${lineList.length}</span>`;
    codeElement.style.paddingLeft = `${block.firstElementChild.clientWidth + 16}px`;
    let lineNumberHTML = "";
    if (codeElement.style.wordBreak === "break-word") {
        const codeElementStyle = window.getComputedStyle(codeElement);
        const lineNumberTemp = document.createElement("div");
        lineNumberTemp.className = "hljs";
        lineNumberTemp.setAttribute("style", `padding-left:${codeElement.style.paddingLeft};
width: ${codeElement.getBoundingClientRect().width / zoom}px;
white-space:${codeElementStyle.whiteSpace};
word-break:${codeElementStyle.wordBreak};
font-variant-ligatures:${codeElementStyle.fontVariantLigatures};
font-family:${codeElementStyle.fontFamily};
font-size:${codeElementStyle.fontSize};
line-height:${codeElementStyle.lineHeight};
font-weight:${codeElementStyle.fontWeight};
padding-right:0;max-height: none;box-sizing: border-box;position: absolute;padding-top:0 !important;padding-bottom:0 !important;min-height:auto !important;`);
        lineNumberTemp.setAttribute("contenteditable", "true");
        block.insertAdjacentElement("afterend", lineNumberTemp);

        lineList.forEach((line) => {
            lineNumberTemp.textContent = line.trim() ? line : "<br>";
            lineNumberHTML += `<span style="height:${lineNumberTemp.clientHeight}px"></span>`;
        });
        lineNumberTemp.remove();
    } else {
        lineNumberHTML = "<span></span>".repeat(lineList.length);
    }

    block.firstElementChild.innerHTML = lineNumberHTML;

    if (block.scrollHeight > block.clientHeight && getSelection().rangeCount > 0) {
        const range = getSelection().getRangeAt(0);
        if (block.contains(range.startContainer)) {
            const brElement = document.createElement("br");
            range.insertNode(brElement);
            brElement.scrollIntoView({block: "nearest"});
            brElement.remove();
        }
    }
};
