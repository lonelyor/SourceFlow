import {Menu} from "../../../plugin/Menu";
import {transaction} from "../../wysiwyg/transaction";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {getDefaultOperatorByType, setFilter} from "./filter";
import {genCellValue} from "./cell";
import {getPropertiesHTML, openMenuPanel} from "./openMenuPanel";
import {getLabelByNumberFormat} from "./number";
import {removeAttrViewColAnimation, updateAttrViewCellAnimation} from "./cell";
import {openEmojiPanel, unicode2Emoji} from "../../../emoji";
import {focusBlock} from "../../util/selection";
import {toggleUpdateRelationBtn} from "./relation";
import {bindRollupData, getRollupHTML} from "./rollup";
import {Constants} from "../../../constants";
import * as dayjs from "dayjs";
import {setPosition} from "../../../util/setPosition";
import {duplicateNameAddOne, isMobile} from "../../../util/functions";
import {Dialog} from "../../../dialog";
import {escapeAriaLabel, escapeAttr, escapeHtml} from "../../../util/escape";
import {getFieldsByData} from "./view";
import {hasClosestByClassName} from "../../util/hasClosest";
import {getAVViewAttr} from "../../../util/attrCompat";


export const getColId = (element: Element, viewType: TAVView) => {
    if (viewType === "table" || hasClosestByClassName(element, "custom-attr")) {
        return element.getAttribute("data-col-id");
    } else if (["gallery", "kanban"].includes(viewType)) {
        return element.getAttribute("data-field-id");
    }
};

export const getColNameByType = (type: TAVCol) => {
    switch (type) {
        case "text":
        case "number":
        case "select":
        case "date":
        case "phone":
        case "email":
        case "template":
            return window.sourceflow.languages[type];
        case "mSelect":
            return window.sourceflow.languages.multiSelect;
        case "relation":
            return window.sourceflow.languages.relation;
        case "rollup":
            return window.sourceflow.languages.rollup;
        case "updated":
            return window.sourceflow.languages.updatedTime;
        case "created":
            return window.sourceflow.languages.createdTime;
        case "url":
            return window.sourceflow.languages.link;
        case "mAsset":
            return window.sourceflow.languages.assets;
        case "checkbox":
            return window.sourceflow.languages.checkbox;
        case "block":
            return window.sourceflow.languages["_attrView"].key;
        case "lineNumber":
            return window.sourceflow.languages.lineNumber;
    }
};

export const getColIconByType = (type: TAVCol) => {
    switch (type) {
        case "text":
            return "iconAlignLeft";
        case "block":
            return "iconKey";
        case "number":
            return "iconNumber";
        case "select":
            return "iconListItem";
        case "mSelect":
            return "iconList";
        case "relation":
            return "iconOpen";
        case "rollup":
            return "iconSearch";
        case "date":
            return "iconCalendar";
        case "updated":
        case "created":
            return "iconClock";
        case "url":
            return "iconLink";
        case "mAsset":
            return "iconImage";
        case "email":
            return "iconEmail";
        case "phone":
            return "iconPhone";
        case "template":
            return "iconMath";
        case "checkbox":
            return "iconCheck";
        case "lineNumber":
            return "iconOrderedList";
    }
};

export const genColDataByType = (type: TAVCol, id: string, name: string) => {
    const colData: IAVColumn = {
        hidden: false,
        icon: "",
        id,
        name,
        desc: "",
        numberFormat: "",
        pin: false,
        template: "",
        type,
        width: "",
        wrap: undefined,
        calc: null
    };
    return colData;
};
