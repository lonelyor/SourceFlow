import {Dialog} from "../dialog";
import {Protyle} from "../protyle";
import {Constants} from "../constants";
import {disabledProtyle, onGet} from "../protyle/util/onGet";
import {fetchPost} from "../util/fetch";
import {App} from "../index";
import {isMobile} from "../util/functions";
import {resizeSide} from "./resizeSide";
import * as dayjs from "dayjs";

let leftEditor: Protyle;
let rightEditor: Protyle;

const docCompareText = (zh: string, en: string) => {
    return window.sourceflow.config.lang === "zh_CN" ? zh : en;
};

const initReadonlyEditor = (app: App, container: HTMLElement) => {
    const editor = new Protyle(app, container, {
        blockId: "",
        history: {
            created: "",
        },
        action: [Constants.CB_GET_HISTORY],
        render: {
            background: false,
            gutter: false,
            breadcrumb: false,
            breadcrumbDocName: false,
        },
        typewriterMode: false,
    });
    disabledProtyle(editor.protyle);
    return editor;
};

export const showDocHistoryCompare = (app: App, options: {
    id: string;
    notebookId: string;
    pathString: string;
    historyPath: string;
    created: string;
}) => {
    const dialog = new Dialog({
        title: docCompareText("版本对比", "Version Compare"),
        content: `<div class="fn__flex history__panel" style="height:100%;">
    <div class="history__side" ${isMobile() ? "" : `style="width:${window.sourceflow.storage[Constants.LOCAL_HISTORY].sideDiffWidth}"`}>
        <div class="b3-label" style="border:0;border-bottom:1px solid var(--b3-border-color);padding:12px 16px;">
            <div class="b3-label__text">${docCompareText("左侧为当前笔记，右侧为所选历史版本。", "The left side is the current note, and the right side is the selected history version.")}</div>
            <div class="b3-label__text">${docCompareText("如果历史版本体积过大，将回退为只读文本对比。", "Large history versions fall back to read-only text view.")}</div>
        </div>
    </div>
    <div class="history__resize"></div>
    <div class="fn__flex-1 fn__flex" data-type="editors">
        <div class="fn__flex-1 fn__flex-column">
            <div class="history__date">${docCompareText("当前版本", "Current")} · ${dayjs().format("YYYY-MM-DD HH:mm")}</div>
            <div class="protyle-title__input ft__center ft__breakword">${options.pathString}</div>
            <div class="ft__center fn__none" data-role="currentTextWrap">
                <textarea class="history__text fn__flex-1" readonly data-role="currentText"></textarea>
            </div>
            <div class="fn__flex-1" data-role="currentDoc"></div>
        </div>
        <div class="fn__flex-1 fn__flex-column" style="border-left:1px solid var(--b3-border-color);">
            <div class="history__date">${docCompareText("历史版本", "History")} · ${dayjs(parseInt(options.created, 10) * 1000).format("YYYY-MM-DD HH:mm:ss")}</div>
            <div class="protyle-title__input ft__center ft__breakword">${options.pathString}</div>
            <div class="ft__center fn__none" data-role="historyTextWrap">
                <textarea class="history__text fn__flex-1" readonly data-role="historyText"></textarea>
            </div>
            <div class="fn__flex-1" data-role="historyDoc"></div>
        </div>
    </div>
</div>`,
        width: isMobile() ? "96vw" : "92vw",
        height: isMobile() ? "88vh" : "80vh",
        containerClassName: "b3-dialog__container--theme",
        destroyCallback() {
            leftEditor = undefined;
            rightEditor = undefined;
        }
    });
    dialog.element.setAttribute("data-key", "docHistoryCompare");
    resizeSide(dialog.element.querySelector(".history__resize"), dialog.element.querySelector(".history__side"), "sideDiffWidth");

    const currentDocElement = dialog.element.querySelector('[data-role="currentDoc"]') as HTMLElement;
    const historyDocElement = dialog.element.querySelector('[data-role="historyDoc"]') as HTMLElement;
    const currentTextWrap = dialog.element.querySelector('[data-role="currentTextWrap"]') as HTMLElement;
    const currentText = dialog.element.querySelector('[data-role="currentText"]') as HTMLTextAreaElement;
    const historyTextWrap = dialog.element.querySelector('[data-role="historyTextWrap"]') as HTMLElement;
    const historyText = dialog.element.querySelector('[data-role="historyText"]') as HTMLTextAreaElement;

    leftEditor = initReadonlyEditor(app, currentDocElement);
    rightEditor = initReadonlyEditor(app, historyDocElement);

    fetchPost("/api/filetree/getDoc", {
        id: options.id,
        mode: 0,
        size: Constants.SIZE_GET_MAX,
    }, (response) => {
        currentTextWrap.classList.add("fn__none");
        currentDocElement.classList.remove("fn__none");
        onGet({
            data: response,
            protyle: leftEditor.protyle,
            action: [Constants.CB_GET_HISTORY, Constants.CB_GET_HTML],
        });
    });

    fetchPost("/api/block/getBlockKramdown", {id: options.id}, (response) => {
        if (response.code === 0) {
            currentText.value = response.data?.kramdown || response.data || "";
        }
    });

    fetchPost("/api/history/getDocHistoryContent", {
        historyPath: options.historyPath,
        highlight: false,
    }, (response) => {
        if (response.data?.isLargeDoc) {
            historyText.value = response.data.content || "";
            historyTextWrap.classList.remove("fn__none");
            historyDocElement.classList.add("fn__none");
            return;
        }
        historyTextWrap.classList.add("fn__none");
        historyDocElement.classList.remove("fn__none");
        onGet({
            data: response,
            protyle: rightEditor.protyle,
            action: [Constants.CB_GET_HISTORY, Constants.CB_GET_HTML],
        });
    });
};
