import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInEmbedBlock
} from "../../protyle/util/hasClosest";
import {MenuItem} from "../Menu";
import {focusBlock, focusByRange, focusByWbr, getEditorRange, selectAll,} from "../../protyle/util/selection";
import {
    deleteColumn,
    deleteRow,
    getColIndex,
    insertColumn,
    insertRow,
    insertRowAbove,
    moveColumnToLeft,
    moveColumnToRight,
    moveRowToDown,
    moveRowToUp,
    setTableAlign,
    updateTableTitle
} from "../../protyle/util/table";
import {mathRender} from "../../protyle/render/mathRender";
import {transaction, updateTransaction} from "../../protyle/wysiwyg/transaction";
import {openMenu} from "../commonMenuItem";
import {fetchPost, fetchSyncPost} from "../../util/fetch";
import {Constants} from "../../constants";
import {copyPlainText, readClipboard, setStorageVal, updateHotkeyTip, writeText} from "../../protyle/util/compatibility";
import {preventScroll} from "../../protyle/scroll/preventScroll";
import {onGet} from "../../protyle/util/onGet";
import {getAllModels} from "../../layout/getAll";
import {getPlainText, paste, pasteAsImage, pasteAsPlainText, pasteAsSmartTable, pasteEscaped, pastePreserveLayout} from "../../protyle/util/paste";
/// #if !MOBILE
import {openFileById, updateBacklinkGraph} from "../../editor/util";
import {openGlobalSearch} from "../../search/util";
import {openNewWindowById} from "../../window/openNewWindow";
/// #endif
import {getSearch, isMobile} from "../../util/functions";
import {removeFoldHeading} from "../../protyle/util/heading";
import {lineNumberRender} from "../../protyle/render/highlightRender";
import * as dayjs from "dayjs";
import {blockRender} from "../../protyle/render/blockRender";
import {renameAsset} from "../../editor/rename";
import {electronUndo} from "../../protyle/undo";
import {pushBack} from "../../mobile/util/MobileBackFoward";
import {copyPNGByLink, exportAsset, writeAssetToClipboard} from "../util";
import {removeInlineType} from "../../protyle/toolbar/util";
import {alignImgCenter, alignImgLeft} from "../../protyle/wysiwyg/commonHotkey";
import {checkFold, renameTag} from "../../util/noRelyPCFunction";
import {hideElements} from "../../protyle/ui/hideElements";
import {emitOpenMenu} from "../../plugin/EventBus";
import {openMobileFileById} from "../../mobile/editor";
import {openBacklink, openGraph} from "../../layout/dock/util";
import {renderAssetsPreview} from "../../asset/renderAssets";
import {upDownHint} from "../../util/upDownHint";
import {hintRenderAssets} from "../../protyle/hint/extend";
import {Menu} from "../../plugin/Menu";
import {getFirstBlock} from "../../protyle/wysiwyg/getBlock";
import {getIdFromSYProtocol, isSYProtocol} from "../../util/pathName";
import {popSearch} from "../../mobile/menu/search";
import {showMessage} from "../../dialog/message";
import {img3115} from "../../boot/compatibleVersion";
import {hideTooltip} from "../../dialog/tooltip";
import {clearSelect} from "../../protyle/util/clear";
import {scrollCenter} from "../../util/highlightById";
import {base64ToURL} from "../../util/image";
import {uploadFiles} from "../../protyle/upload";
import {reloadProtyle} from "../../protyle/util/reload";
import {appendAssistantContextActions} from "../../assistant/skills/contextActions";
import {net2LocalAssets} from "../../protyle/breadcrumb/action";


export const imgMenu = (protyle: IProtyle, range: Range, assetElement: HTMLElement, position: {
    clientX: number,
    clientY: number
}) => {
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_IMG);
    const nodeElement = hasClosestBlock(assetElement);
    if (!nodeElement) {
        return;
    }
    hideElements(["util", "toolbar", "hint"], protyle);
    const id = nodeElement.getAttribute("data-node-id");
    const imgElement = assetElement.querySelector("img");
    const titleElement = assetElement.querySelector(".protyle-action__title span") as HTMLElement;
    const html = nodeElement.outerHTML;
    let src = imgElement.getAttribute("src");
    if (!src) {
        src = "";
    }
    if (!protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "imageUrlAndTitleAndTooltipText",
            iconHTML: "",
            type: "readonly",
            label: `<div class="fn__flex">
    <span class="fn__flex-center">${window.sourceflow.languages.imageURL}</span>
    <span class="fn__space"></span>
    <span data-action="copy" class="block__icon block__icon--show b3-tooltips b3-tooltips__e fn__flex-center" aria-label="${window.sourceflow.languages.copy}">
        <svg><use xlink:href="#iconCopy"></use></svg>
    </span>   
</div><textarea spellcheck="false" style="margin:4px 0;width: ${isMobile() ? "100%" : "360px"}" rows="1" class="b3-text-field">${src}</textarea><div class="fn__hr"></div><div class="fn__flex">
    <span class="fn__flex-center">${window.sourceflow.languages.title}</span>
    <span class="fn__space"></span>
    <span data-action="copy" class="block__icon block__icon--show b3-tooltips b3-tooltips__e fn__flex-center" aria-label="${window.sourceflow.languages.copy}">
        <svg><use xlink:href="#iconCopy"></use></svg>
    </span>   
</div><textarea style="margin:4px 0;width: ${isMobile() ? "100%" : "360px"}" rows="1" class="b3-text-field"></textarea><div class="fn__hr"></div><div class="fn__flex">
    <span class="fn__flex-center">${window.sourceflow.languages.tooltipText}</span>
    <span class="fn__space"></span>
    <span data-action="copy" class="block__icon block__icon--show b3-tooltips b3-tooltips__e fn__flex-center" aria-label="${window.sourceflow.languages.copy}">
        <svg><use xlink:href="#iconCopy"></use></svg>
    </span>   
</div><textarea style="margin:4px 0;width: ${isMobile() ? "100%" : "360px"}" rows="1" class="b3-text-field"></textarea>`,
            bind(element) {
                element.style.maxWidth = "none";
                const textElements = element.querySelectorAll("textarea");
                textElements[0].addEventListener("input", (event: InputEvent) => {
                    const value = (event.target as HTMLInputElement).value.replace(/\n|\r\n|\r|\u2028|\u2029/g, "").trim();
                    imgElement.setAttribute("src", value);
                    imgElement.setAttribute("data-src", value);
                    const imgNetElement = assetElement.querySelector(".img__net");
                    if (value.startsWith("assets/") || value.startsWith("data:image/")) {
                        if (imgNetElement) {
                            imgNetElement.remove();
                        }
                    } else if (window.sourceflow.config.editor.displayNetImgMark && !imgNetElement) {
                        assetElement.querySelector(".protyle-action__drag").insertAdjacentHTML("afterend", '<span class="img__net"><svg><use xlink:href="#iconLanguage"></use></svg></span>');
                    }
                });
                textElements[1].value = titleElement.innerText;
                textElements[1].addEventListener("input", (event) => {
                    const value = (event.target as HTMLInputElement).value;
                    imgElement.setAttribute("title", value);
                    titleElement.innerText = value;
                    mathRender(titleElement);
                });
                textElements[2].value = imgElement.getAttribute("alt") || "";
                element.addEventListener("click", (event) => {
                    let target = event.target as HTMLElement;
                    while (target) {
                        if (target.dataset.action === "copy") {
                            writeText((target.parentElement.nextElementSibling as HTMLTextAreaElement).value);
                            showMessage(window.sourceflow.languages.copied);
                            break;
                        }
                        target = target.parentElement;
                    }
                });
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_1", type: "separator"}).element);
    }
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "copy",
        label: window.sourceflow.languages.copy,
        accelerator: "⌘C",
        icon: "iconCopy",
        click() {
            let content = protyle.lute.BlockDOM2StdMd(assetElement.outerHTML);
            // The file name encoding is abnormal after copying the image and pasting it https://github.com/lonelyor/SourceFlow/issues/11246
            content = content.replace(/%20/g, " ");
            writeText(content);
        }
    }).element);
    if (protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copyImageURL",
            label: window.sourceflow.languages.copy + " " + window.sourceflow.languages.imageURL,
            icon: "iconLink",
            click() {
                writeText(imgElement.getAttribute("src"));
            }
        }).element);
    }
    if (!protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "cut",
            icon: "iconCut",
            accelerator: "⌘X",
            label: window.sourceflow.languages.cut,
            click() {
                let content = protyle.lute.BlockDOM2StdMd(assetElement.outerHTML);
                // The file name encoding is abnormal after copying the image and pasting it https://github.com/lonelyor/SourceFlow/issues/11246
                content = content.replace(/%20/g, " ");
                writeText(content);
                (assetElement as HTMLElement).outerHTML = "<wbr>";
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, html);
                focusByWbr(protyle.wysiwyg.element, range);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "delete",
            icon: "iconTrashcan",
            accelerator: "⌫",
            label: window.sourceflow.languages.delete,
            click: function () {
                (assetElement as HTMLElement).outerHTML = "<wbr>";
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, html);
                focusByWbr(protyle.wysiwyg.element, range);
            }
        }).element);
        const remoteImageSrc = imgElement.getAttribute("data-src") || imgElement.getAttribute("src") || "";
        const isRemoteImage = !!remoteImageSrc && !remoteImageSrc.startsWith("assets/") &&
            !remoteImageSrc.startsWith("data:image/") &&
            (remoteImageSrc.startsWith("http://") || remoteImageSrc.startsWith("https://") || remoteImageSrc.startsWith("//"));
        if (isRemoteImage) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "netImg2LocalAssetCurrent",
                icon: "iconImgDown",
                label: window.sourceflow.languages.netImg2LocalAsset,
                click() {
                    net2LocalAssets(protyle, "Img", remoteImageSrc);
                }
            }).element);
        }
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_2", type: "separator"}).element);
        const imagePath = imgElement.getAttribute("data-src");
        if (imagePath.startsWith("assets/")) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "rename",
                label: window.sourceflow.languages.rename,
                icon: "iconEdit",
                click() {
                    renameAsset(imagePath);
                }
            }).element);
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "ocr",
            label: "OCR",
            submenu: [{
                id: "ocrResult",
                iconHTML: "",
                type: "readonly",
                label: `<textarea spellcheck="false" data-type="ocr" style="margin: 4px 0" rows="1" class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.ocrResult}"></textarea>`,
                bind(element) {
                    element.style.maxWidth = "none";
                    fetchPost("/api/asset/getImageOCRText", {
                        path: imgElement.getAttribute("src")
                    }, (response) => {
                        const textarea = element.querySelector("textarea");
                        textarea.value = response.data.text;
                        textarea.dataset.ocrText = response.data.text;
                    });
                }
            }, {
                type: "separator"
            }, {
                id: "reOCR",
                iconHTML: "",
                label: window.sourceflow.languages.reOCR,
                click() {
                    fetchPost("/api/asset/ocr", {
                        path: imgElement.getAttribute("src"),
                        force: true
                    });
                }
            }],
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "alignCenter",
            icon: "iconAlignCenter",
            label: window.sourceflow.languages.alignCenter,
            accelerator: window.sourceflow.config.keymap.editor.general.alignCenter.custom,
            click() {
                alignImgCenter(protyle, nodeElement, [assetElement], id, html);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "alignLeft",
            icon: "iconAlignLeft",
            label: window.sourceflow.languages.alignLeft,
            accelerator: window.sourceflow.config.keymap.editor.general.alignLeft.custom,
            click() {
                alignImgLeft(protyle, nodeElement, [assetElement], id, html);
            }
        }).element);
        let rangeElement: HTMLInputElement;
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "width",
            label: window.sourceflow.languages.width,
            submenu: [{
                id: "widthInput",
                iconHTML: "",
                type: "readonly",
                label: `<div class="fn__flex"><input class="b3-text-field fn__flex-1" style="margin: 4px 8px 4px 0" value="${imgElement.parentElement.style.width.endsWith("px") ? parseInt(imgElement.parentElement.style.width) : ""}" type="number" placeholder="${window.sourceflow.languages.width}"><span class="fn__flex-center">px</span></div>`,
                bind(element) {
                    const inputElement = element.querySelector("input");
                    inputElement.addEventListener("input", () => {
                        rangeElement.value = "0";
                        rangeElement.parentElement.setAttribute("aria-label", inputElement.value ? (inputElement.value + "px") : window.sourceflow.languages.default);

                        img3115(assetElement);
                        imgElement.parentElement.style.width = inputElement.value ? (inputElement.value + "px") : "";
                        imgElement.style.height = "";
                    });
                    inputElement.addEventListener("blur", () => {
                        if (inputElement.value === imgElement.parentElement.style.width.replace("px", "")) {
                            return;
                        }
                        nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                        updateTransaction(protyle, id, nodeElement.outerHTML, html);
                        window.sourceflow.menus.menu.remove();
                        focusBlock(nodeElement);
                    });
                }
            },
                genImageWidthMenu("25%", imgElement, protyle, id, nodeElement, html),
                genImageWidthMenu("33%", imgElement, protyle, id, nodeElement, html),
                genImageWidthMenu("50%", imgElement, protyle, id, nodeElement, html),
                genImageWidthMenu("67%", imgElement, protyle, id, nodeElement, html),
                genImageWidthMenu("75%", imgElement, protyle, id, nodeElement, html),
                genImageWidthMenu("100%", imgElement, protyle, id, nodeElement, html), {
                    id: "separator_1",
                    type: "separator",
                }, {
                    id: "widthDrag",
                    iconHTML: "",
                    type: "readonly",
                    label: `<div style="margin: 4px 0;" aria-label="${imgElement.parentElement.style.width ? imgElement.parentElement.style.width.replace("vw", "%").replace("calc(", "").replace(" - 8px)", "") : window.sourceflow.languages.default}" class="b3-tooltips b3-tooltips__n"><input style="box-sizing: border-box" value="${(imgElement.parentElement.style.width.indexOf("%") > -1 || imgElement.parentElement.style.width.endsWith("vw")) ? parseInt(imgElement.parentElement.style.width.replace("calc(", "")) : 0}" class="b3-slider fn__block" max="100" min="1" step="1" type="range"></div>`,
                    bind(element) {
                        rangeElement = element.querySelector("input");
                        rangeElement.addEventListener("input", () => {
                            img3115(assetElement);
                            imgElement.parentElement.style.width = `calc(${rangeElement.value}% - 8px)`;
                            imgElement.style.height = "";
                            rangeElement.parentElement.setAttribute("aria-label", `${rangeElement.value}%`);
                        });
                        rangeElement.addEventListener("change", () => {
                            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                            updateTransaction(protyle, id, nodeElement.outerHTML, html);
                            window.sourceflow.menus.menu.remove();
                            focusBlock(nodeElement);
                        });
                    }
                }, {
                    id: "separator_2",
                    type: "separator",
                },
                genImageWidthMenu(window.sourceflow.languages.default, imgElement, protyle, id, nodeElement, html),
            ]
        }).element);
        let rangeHeightElement: HTMLInputElement;
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "height",
            label: window.sourceflow.languages.height,
            submenu: [{
                id: "heightInput",
                iconHTML: "",
                type: "readonly",
                label: `<div class="fn__flex"><input class="b3-text-field fn__flex-1" value="${imgElement.style.height.endsWith("px") ? parseInt(imgElement.style.height) : ""}" type="number" style="margin: 4px 8px 4px 0" placeholder="${window.sourceflow.languages.height}"><span class="fn__flex-center">px</span></div>`,
                bind(element) {
                    const inputElement = element.querySelector("input");
                    inputElement.addEventListener("input", () => {
                        rangeHeightElement.value = "0";
                        rangeHeightElement.parentElement.setAttribute("aria-label", inputElement.value ? (inputElement.value + "px") : window.sourceflow.languages.default);

                        imgElement.style.height = inputElement.value ? (inputElement.value + "px") : "";
                        img3115(assetElement);
                        imgElement.parentElement.style.width = "";
                    });
                    inputElement.addEventListener("blur", () => {
                        if (inputElement.value === imgElement.style.height.replace("px", "")) {
                            return;
                        }
                        nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                        updateTransaction(protyle, id, nodeElement.outerHTML, html);
                        window.sourceflow.menus.menu.remove();
                        focusBlock(nodeElement);
                    });
                }
            },
                genImageHeightMenu("25%", imgElement, protyle, id, nodeElement, html),
                genImageHeightMenu("33%", imgElement, protyle, id, nodeElement, html),
                genImageHeightMenu("50%", imgElement, protyle, id, nodeElement, html),
                genImageHeightMenu("67%", imgElement, protyle, id, nodeElement, html),
                genImageHeightMenu("75%", imgElement, protyle, id, nodeElement, html),
                genImageHeightMenu("100%", imgElement, protyle, id, nodeElement, html), {
                    id: "separator_1",
                    type: "separator",
                }, {
                    id: "heightDrag",
                    iconHTML: "",
                    type: "readonly",
                    label: `<div style="margin: 4px 0;" aria-label="${imgElement.style.height ? imgElement.style.height.replace("vh", "%") : window.sourceflow.languages.default}" class="b3-tooltips b3-tooltips__n"><input style="box-sizing: border-box" value="${imgElement.style.height.endsWith("vh") ? parseInt(imgElement.style.height) : 0}" class="b3-slider fn__block" max="100" min="1" step="1" type="range"></div>`,
                    bind(element) {
                        rangeHeightElement = element.querySelector("input");
                        rangeHeightElement.addEventListener("input", () => {
                            img3115(assetElement);
                            imgElement.parentElement.style.width = "";
                            imgElement.style.height = rangeHeightElement.value + "vh";
                            rangeHeightElement.parentElement.setAttribute("aria-label", `${rangeHeightElement.value}%`);
                        });
                        rangeHeightElement.addEventListener("change", () => {
                            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                            updateTransaction(protyle, id, nodeElement.outerHTML, html);
                            window.sourceflow.menus.menu.remove();
                            focusBlock(nodeElement);
                        });
                    }
                }, {
                    id: "separator_2",
                    type: "separator",
                },
                genImageHeightMenu(window.sourceflow.languages.default, imgElement, protyle, id, nodeElement, html),
            ]
        }).element);
    }
    const imgSrc = imgElement.getAttribute("src");
    if (imgSrc) {
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_3", type: "separator"}).element);
        openMenu(protyle.app, imgSrc, false, false);
    }
    const dataSrc = imgElement.getAttribute("data-src");
    if (dataSrc && dataSrc.startsWith("assets/")) {
        window.sourceflow.menus.menu.append(new MenuItem(exportAsset(dataSrc)).element);
        window.sourceflow.menus.menu.append(new MenuItem(writeAssetToClipboard(dataSrc)).element);
    }
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "copyAsPNG",
        label: window.sourceflow.languages.copyAsPNG,
        accelerator: window.sourceflow.config.keymap.editor.general.copyBlockRef.custom,
        icon: "iconImage",
        click() {
            copyPNGByLink(imgElement.getAttribute("src"));
        }
    }).element);
    if (protyle?.app?.plugins) {
        emitOpenMenu({
            plugins: protyle.app.plugins,
            type: "open-menu-image",
            detail: {
                protyle,
                element: assetElement,
            },
            separatorPosition: "top",
        });
    }
    /// #if MOBILE
    window.sourceflow.menus.menu.fullscreen();
    /// #else
    window.sourceflow.menus.menu.popup({x: position.clientX, y: position.clientY});
    /// #endif
    const popoverElement = hasTopClosestByClassName(protyle.element, "block__popover", true);
    window.sourceflow.menus.menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover" : "app");
    if (!protyle.disabled) {
        const textElements = window.sourceflow.menus.menu.element.querySelectorAll("textarea");
        if (textElements[0].value) {
            textElements[1].select();
        } else {
            textElements[0].select();
        }
        window.sourceflow.menus.menu.removeCB = async () => {
            const newSrc = textElements[0].value;
            if (src !== newSrc && newSrc.startsWith("data:image/")) {
                const base64Src = await base64ToURL([newSrc]);
                imgElement.setAttribute("src", base64Src[0]);
                imgElement.setAttribute("data-src", base64Src[0]);
                assetElement.querySelector(".img__net")?.remove();
            }

            const ocrElement = window.sourceflow.menus.menu.element.querySelector('[data-type="ocr"]') as HTMLTextAreaElement;
            if (ocrElement && ocrElement.dataset.ocrText !== ocrElement.value) {
                fetchPost("/api/asset/setImageOCRText", {
                    path: imgElement.getAttribute("src"),
                    text: ocrElement.value
                });
            }
            imgElement.setAttribute("alt", textElements[2].value.replace(/\n|\r\n|\r|\u2028|\u2029/g, ""));
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            updateTransaction(protyle, id, nodeElement.outerHTML, html);
        };
    }
};

const genImageWidthMenu = (label: string, imgElement: HTMLElement, protyle: IProtyle, id: string, nodeElement: HTMLElement, html: string) => {
    return {
        id: label === window.sourceflow.languages.default ? "default" : "width_" + label,
        iconHTML: "",
        label,
        click() {
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            img3115(imgElement.parentElement.parentElement);
            imgElement.parentElement.style.width = label === window.sourceflow.languages.default ? "" : `calc(${label} - 8px)`;
            imgElement.style.height = "";
            updateTransaction(protyle, id, nodeElement.outerHTML, html);
            focusBlock(nodeElement);
        }
    };
};

const genImageHeightMenu = (label: string, imgElement: HTMLElement, protyle: IProtyle, id: string, nodeElement: HTMLElement, html: string) => {
    return {
        id: label === window.sourceflow.languages.default ? "default" : "width_" + label,
        iconHTML: "",
        label,
        click() {
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            imgElement.style.height = label === window.sourceflow.languages.default ? "" : parseInt(label) + "vh";
            img3115(imgElement.parentElement.parentElement);
            imgElement.parentElement.style.width = "";
            updateTransaction(protyle, id, nodeElement.outerHTML, html);
            focusBlock(nodeElement);
        }
    };
};

export const iframeMenu = (protyle: IProtyle, nodeElement: Element) => {
    const id = nodeElement.getAttribute("data-node-id");
    const iframeElement = nodeElement.querySelector("iframe");
    let html = nodeElement.outerHTML;
    const subMenus: IMenu[] = [{
        id: "asset",
        iconHTML: "",
        type: "readonly",
        label: `<textarea spellcheck="false" rows="1" class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.link}" style="margin: 4px 0">${iframeElement.getAttribute("src") || ""}</textarea>`,
        bind(element) {
            element.style.maxWidth = "none";
            element.querySelector("textarea").addEventListener("change", (event) => {
                const value = (event.target as HTMLTextAreaElement).value.replace(/\n|\r\n|\r|\u2028|\u2029/g, "").trim();
                const biliMatch = value.match(/(?:www\.|\/\/)bilibili\.com\/video\/(\w+)/);
                if (value.indexOf("bilibili.com") > -1 && (value.indexOf("bvid=") > -1 || (biliMatch && biliMatch[1]))) {
                    const params: IObject = {
                        bvid: getSearch("bvid", value) || (biliMatch && biliMatch[1]),
                        page: "1",
                        high_quality: "1",
                        as_wide: "1",
                        allowfullscreen: "true",
                        autoplay: "0"
                    };
                    // `//player.bilibili.com/player.html?aid=895154192&bvid=BV1NP4y1M72N&cid=562898119&page=1`
                    // `https://www.bilibili.com/video/BV1ys411472E?t=3.4&p=4`
                    new URL(value.startsWith("http") ? value : "https:" + value).search.split("&").forEach((item, index) => {
                        if (!item) {
                            return;
                        }
                        if (index === 0) {
                            item = item.substr(1);
                        }
                        const keyValue = item.split("=");
                        params[keyValue[0]] = keyValue[1];
                    });
                    let src = "https://player.bilibili.com/player.html?";
                    const keys = Object.keys(params);
                    keys.forEach((key, index) => {
                        src += `${key}=${params[key]}`;
                        if (index < keys.length - 1) {
                            src += "&";
                        }
                    });
                    iframeElement.setAttribute("src", src);
                    iframeElement.setAttribute("sandbox", "allow-top-navigation-by-user-activation allow-same-origin allow-forms allow-scripts allow-popups");
                    if (!iframeElement.style.height) {
                        iframeElement.style.height = "360px";
                    }
                    if (!iframeElement.style.width) {
                        iframeElement.style.width = "640px";
                    }
                } else {
                    iframeElement.setAttribute("src", value);
                }

                updateTransaction(protyle, id, nodeElement.outerHTML, html);
                html = nodeElement.outerHTML;
                event.stopPropagation();
            });
        }
    }];
    const iframeSrc = iframeElement.getAttribute("src");
    if (iframeSrc) {
        subMenus.push({
            type: "separator"
        });
        return subMenus.concat(openMenu(protyle.app, iframeSrc, true, false) as IMenu[]);
    }
    return subMenus;
};

export const videoMenu = (protyle: IProtyle, nodeElement: Element, type: string) => {
    const id = nodeElement.getAttribute("data-node-id");
    const videoElement = nodeElement.querySelector(type === "NodeVideo" ? "video" : "audio");
    let html = nodeElement.outerHTML;
    const subMenus: IMenu[] = [{
        id: "asset",
        iconHTML: "",
        type: "readonly",
        label: `<textarea spellcheck="false" rows="1" style="margin: 4px 0" class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.link}">${videoElement.getAttribute("src")}</textarea>`,
        bind(element) {
            element.style.maxWidth = "none";
            element.querySelector("textarea").addEventListener("change", (event) => {
                videoElement.setAttribute("src", (event.target as HTMLTextAreaElement).value.replace(/\n|\r\n|\r|\u2028|\u2029/g, "").trim());
                updateTransaction(protyle, id, nodeElement.outerHTML, html);
                html = nodeElement.outerHTML;
                event.stopPropagation();
            });
        }
    }];
    const src = videoElement.getAttribute("src");
    if (src && src.startsWith("assets/")) {
        subMenus.push({
            type: "separator"
        });
        subMenus.push({
            id: "rename",
            label: window.sourceflow.languages.rename,
            icon: "iconEdit",
            click() {
                renameAsset(src);
            }
        });
    }
    if (src) {
        subMenus.push({
            id: "openBy",
            label: window.sourceflow.languages.openBy,
            icon: "iconOpen",
            submenu: openMenu(protyle.app, src, true, false) as IMenu[]
        });
    }
    if (src && src.startsWith("assets/")) {
        subMenus.push(exportAsset(src));
        subMenus.push(writeAssetToClipboard(src));
    }
    return subMenus;
};

