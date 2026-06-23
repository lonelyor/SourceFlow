import {fetchPost} from "../../../util/fetch";
import {addCol, getColIconByType} from "./col";
import {escapeAriaLabel, escapeAttr, escapeHtml} from "../../../util/escape";
import * as dayjs from "dayjs";
import {popTextCell, updateCellsValue} from "./cell";
import {hasClosestBlock, hasClosestByAttribute, hasClosestByClassName} from "../../util/hasClosest";
import {openEmojiPanel, unicode2Emoji} from "../../../emoji";
import {transaction} from "../../wysiwyg/transaction";
import {openMenuPanel} from "./openMenuPanel";
import {uploadFiles} from "../../upload";
import {openLink} from "../../../editor/openLink";
import {dragUpload, editAssetItem} from "./asset";
import {previewImages} from "../../preview/image";
/// #if !BROWSER
import {webUtils} from "electron";
/// #endif
import {isBrowser} from "../../../util/functions";
import {Constants} from "../../../constants";
import {getCompressURL, removeCompressURL} from "../../../util/image";

const genAVRollupHTML = (value: IAVCellValue) => {
    let html = "";
    const dataValue: IAVCellDateValue = value[value.type as "date"];
    switch (value.type) {
        case "block":
            if (value?.isDetached) {
                html = `<span>${value.block?.content || window.sourceflow.languages.untitled}</span>`;
            } else {
                html = `<span data-type="block-ref" data-id="${value.block.id}" data-subtype="s" class="av__celltext--ref">${value.block?.content || window.sourceflow.languages.untitled}</span>`;
            }
            break;
        case "text":
            html = value.text.content;
            break;
        case "number":
            html = value.number.formattedContent || value.number.content.toString();
            break;
        case "date":
        case "updated":
        case "created":
            if (dataValue.formattedContent) {
                html = dataValue.formattedContent;
            } else {
                if (dataValue && dataValue.isNotEmpty) {
                    html = dayjs(dataValue.content).format(dataValue.isNotTime ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm");
                }
                if (dataValue && dataValue.hasEndDate && dataValue.isNotEmpty && dataValue.isNotEmpty2) {
                    html = `<svg class="av__cellicon"><use xlink:href="#iconForward"></use></svg>${dayjs(dataValue.content2).format(dataValue.isNotTime ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm")}`;
                }
            }
            if (html) {
                html = `<span class="av__celltext">${html}</span>`;
            }
            break;
        case "url":
            html = value.url.content ? `<a class="fn__a" href="${value.url.content}" target="_blank">${value.url.content}</a>` : "";
            break;
        case "phone":
            html = value.phone.content ? `<a class="fn__a" href="tel:${value.phone.content}" target="_blank">${value.phone.content}</a>` : "";
            break;
        case "email":
            html = value.email.content ? `<a class="fn__a" href="mailto:${value.email.content}" target="_blank">${value.email.content}</a>` : "";
            break;
    }
    return html;
};

export const genAVValueHTML = (value: IAVCellValue) => {
    let html = "";
    switch (value.type) {
        case "block":
            html = `<input data-id="${value.block.id}" value="${escapeAttr(value.block.content)}" type="text" class="b3-text-field b3-text-field--text fn__flex-1" placeholder="${window.sourceflow.languages.empty}">`;
            break;
        case "text":
            html = `<textarea style="resize: vertical" rows="${(value.text?.content || "").split("\n").length}" class="b3-text-field b3-text-field--text fn__flex-1" placeholder="${window.sourceflow.languages.empty}">${value.text?.content || ""}</textarea>`;
            break;
        case "number":
            html = `<input value="${value.number.isNotEmpty ? value.number.content : ""}" type="number" class="b3-text-field b3-text-field--text fn__flex-1" placeholder="${window.sourceflow.languages.empty}">
<span class="fn__space"></span><span class="fn__flex-center ft__on-surface b3-tooltips__w b3-tooltips" aria-label="${window.sourceflow.languages.format}">${value.number.formattedContent}</span><span class="fn__space"></span>`;
            break;
        case "mSelect":
        case "select":
            value.mSelect?.forEach((item, index) => {
                if (value.type === "select" && index > 0) {
                    return;
                }
                html += `<span class="b3-chip b3-chip--middle" style="background-color:var(--b3-font-background${item.color});color:var(--b3-font-color${item.color})">${escapeHtml(item.content)}</span>`;
            });
            break;
        case "mAsset":
            value.mAsset?.forEach(item => {
                if (item.type === "image") {
                    html += `<img loading="lazy" class="av__cellassetimg ariaLabel" aria-label="${item.content}" src="${getCompressURL(item.content)}">`;
                } else {
                    html += `<span class="b3-chip b3-chip--middle av__celltext--url ariaLabel" aria-label="${escapeAttr(item.content)}" data-name="${escapeAttr(item.name)}" data-url="${escapeAttr(item.content)}">${item.name || item.content}</span>`;
                }
            });
            break;
        case "date":
            html = `<span class="av__celltext" data-value='${JSON.stringify(value[value.type])}' placeholder="${window.sourceflow.languages.empty}">`;
            if (value[value.type] && value[value.type].isNotEmpty) {
                html += dayjs(value[value.type].content).format(value[value.type].isNotTime ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm");
            }
            if (value[value.type] && value[value.type].hasEndDate && value[value.type].isNotEmpty && value[value.type].isNotEmpty2) {
                html += `<svg class="av__cellicon"><use xlink:href="#iconForward"></use></svg>${dayjs(value[value.type].content2).format(value[value.type].isNotTime ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm")}`;
            }
            html += "</span>";
            break;
        case "created":
        case "updated":
            if (value[value.type].isNotEmpty) {
                html = `<span data-content="${value[value.type].content}">${dayjs(value[value.type].content).format("YYYY-MM-DD HH:mm")}</span>`;
            }
            break;
        case "url":
            html = `<input value="${value.url.content}" class="b3-text-field b3-text-field--text fn__flex-1" placeholder="${window.sourceflow.languages.empty}">
<span class="fn__space"></span>
<a ${value.url.content ? `href="${value.url.content}"` : ""} target="_blank" aria-label="${window.sourceflow.languages.openBy}" class="block__icon block__icon--show fn__flex-center b3-tooltips__w b3-tooltips"><svg><use xlink:href="#iconLink"></use></svg></a>`;
            break;
        case "phone":
            html = `<input value="${value.phone.content}" class="b3-text-field b3-text-field--text fn__flex-1" placeholder="${window.sourceflow.languages.empty}">
<span class="fn__space"></span>
<a ${value.phone.content ? `href="tel:${value.phone.content}"` : ""} target="_blank" aria-label="${window.sourceflow.languages.openBy}" class="block__icon block__icon--show fn__flex-center b3-tooltips__w b3-tooltips"><svg><use xlink:href="#iconPhone"></use></svg></a>`;
            break;
        case "checkbox":
            html = `<svg class="av__checkbox"><use xlink:href="#icon${value.checkbox.checked ? "Check" : "Uncheck"}"></use></svg>`;
            break;
        case "template":
            html = `<div class="fn__flex-1" placeholder="${window.sourceflow.languages.empty}">${value.template.content}</div>`;
            break;
        case "email":
            html = `<input value="${value.email.content}" class="b3-text-field b3-text-field--text fn__flex-1" placeholder="${window.sourceflow.languages.empty}">
<span class="fn__space"></span>
<a ${value.email.content ? `href="mailto:${value.email.content}"` : ""} target="_blank" aria-label="${window.sourceflow.languages.openBy}" class="block__icon block__icon--show fn__flex-center b3-tooltips__w b3-tooltips"><svg><use xlink:href="#iconEmail"></use></svg></a>`;
            break;
        case "relation":
            value?.relation?.contents?.forEach((item, index) => {
                if (item && item.block) {
                    const rowID = value.relation.blockIDs[index];
                    if (item?.isDetached) {
                        html += `<span data-row-id="${rowID}" class="av__cell--relation"><span><svg style="height: 26px"><use xlink:href="#iconLine"></use></svg><span class="fn__space--5"></span></span><span class="av__celltext">${Lute.EscapeHTMLStr(item.block.content || window.sourceflow.languages.untitled)}</span></span>`;
                    } else {
                        // data-block-id 用于更新 emoji
                        html += `<span data-row-id="${rowID}" class="av__cell--relation" data-block-id="${item.block.id}"><span class="b3-menu__avemoji" data-unicode="${item.block.icon || ""}">${unicode2Emoji(item.block.icon || window.sourceflow.storage[Constants.LOCAL_IMAGES].file)}</span><span data-type="block-ref" data-id="${item.block.id}" data-subtype="s" class="av__celltext av__celltext--ref">${Lute.EscapeHTMLStr(item.block.content || window.sourceflow.languages.untitled)}</span></span>`;
                    }
                }
            });
            if (html && html.endsWith(", ")) {
                html = html.substring(0, html.length - 2);
            }
            break;
        case "rollup":
            value?.rollup?.contents?.forEach((item) => {
                const rollupText = ["template", "select", "mSelect", "mAsset", "checkbox", "relation"].includes(item.type) ? genAVValueHTML(item) : genAVRollupHTML(item);
                if (rollupText) {
                    html += rollupText.replace("fn__flex-1", "") + ",&nbsp;";
                }
            });
            if (html && html.endsWith(",&nbsp;")) {
                html = html.substring(0, html.length - 7);
            }
            break;
    }
    return html;
};
