import {Menu} from "../../../plugin/Menu";
import {hasClosestBlock, hasClosestByClassName} from "../../util/hasClosest";
import {transaction} from "../../wysiwyg/transaction";
import {openEditorTab} from "../../../menus/util";
import {openFileAttr} from "../../../menus/commonMenuItem";
import {
    addDragFill,
    genCellValueByElement,
    getCellText,
    getTypeByCellElement,
    popTextCell,
    updateCellsValue,
} from "./cell";
import {addCol, getColIconByType, showColMenu} from "./col";
import {deleteRow, insertRows, selectRow, setPageSize, updateHeader} from "./row";
import {emitOpenMenu} from "../../../plugin/EventBus";
import {openMenuPanel} from "./openMenuPanel";
import {hintRef} from "../../hint/extend";
import {focusBlock, focusByRange} from "../../util/selection";
import {showMessage} from "../../../dialog/message";
import {previewAttrViewImages} from "../../preview/image";
import {openEmojiPanel, unicode2Emoji} from "../../../emoji";
import * as dayjs from "dayjs";
import {openCalcMenu} from "./calc";
import {avRender} from "./render";
import {addView, openViewMenu} from "./view";
import {isOnlyMeta, writeText} from "../../util/compatibility";
import {openSearchAV} from "./relation";
import {Constants} from "../../../constants";
import {hideElements} from "../../ui/hideElements";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {scrollCenter} from "../../../util/highlightById";
import {escapeHtml} from "../../../util/escape";
import {editGalleryItem, openGalleryItemMenu} from "./gallery/util";
import {clearSelect} from "../../util/clear";
import {removeCompressURL} from "../../../util/image";
import {callMobileAppShowKeyboard} from "../../../mobile/util/mobileAppUtil";
import {getAVViewAttr} from "../../../util/attrCompat";

export const updateAVName = (protyle: IProtyle, blockElement: Element) => {
    const avId = blockElement.getAttribute("data-av-id");
    const id = blockElement.getAttribute("data-node-id");
    const nameElement = blockElement.querySelector(".av__title") as HTMLElement;
    // https://github.com/lonelyor/SourceFlow/issues/14770
    if (nameElement.textContent === "") {
        nameElement.querySelectorAll("br").forEach(item => {
            item.remove();
        });
    }
    const newData = nameElement.textContent.trim();
    if (newData === nameElement.dataset.title.trim()) {
        return;
    }
    if (newData.length > Constants.SIZE_TITLE) {
        showMessage(window.sourceflow.languages["_kernel"]["106"]);
        return false;
    }
    const newUpdated = dayjs().format("YYYYMMDDHHmmss");
    transaction(protyle, [{
        action: "setAttrViewName",
        id: avId,
        data: newData,
    }, {
        action: "doUpdateUpdated",
        id,
        data: newUpdated,
    }], [{
        action: "setAttrViewName",
        id: avId,
        data: nameElement.dataset.title,
    }, {
        action: "doUpdateUpdated",
        id,
        data: blockElement.getAttribute("updated")
    }]);
    blockElement.setAttribute("updated", newUpdated);
    nameElement.dataset.title = newData;

    // 当前页面不能重新渲染，否则会闪烁。
    Array.from(protyle.wysiwyg.element.querySelectorAll(`.av[data-av-id="${avId}"]`)).forEach((item: HTMLElement) => {
        if (blockElement === item) {
            return;
        }
        const titleElement = item.querySelector(".av__title") as HTMLElement;
        if (!titleElement) {
            return;
        }
        titleElement.textContent = newData;
        titleElement.dataset.title = newData;
    });
};

export const duplicateCompletely = (protyle: IProtyle, nodeElement: HTMLElement) => {
    fetchPost("/api/av/duplicateAttributeViewBlock", {avID: nodeElement.getAttribute("data-av-id")}, (response) => {
        nodeElement.classList.remove("protyle-wysiwyg--select");
        const tempElement = document.createElement("template");
        tempElement.innerHTML = protyle.lute.SpinBlockDOM(`<div class="av" data-node-id="${response.data.blockID}" data-av-id="${response.data.avID}" data-type="NodeAttributeView" data-av-type="table"></div>`);
        const cloneElement = tempElement.content.firstElementChild;
        nodeElement.after(cloneElement);
        avRender(cloneElement, protyle, () => {
            focusBlock(cloneElement);
            scrollCenter(protyle);
        });
        transaction(protyle, [{
            action: "insert",
            data: cloneElement.outerHTML,
            id: response.data.blockID,
            previousID: nodeElement.dataset.nodeId,
        }], [{
            action: "delete",
            id: response.data.blockID,
        }]);
    });
};
