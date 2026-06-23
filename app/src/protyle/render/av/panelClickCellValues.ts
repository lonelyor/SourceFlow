import {Constants} from "../../../constants";
import {assetMenu} from "../../../menus/protyle";
import {openLink} from "../../../editor/openLink";
import {escapeAttr} from "../../../util/escape";
import {getAVViewAttr} from "../../../util/attrCompat";
import {pathPosix} from "../../../util/pathName";
import {addAssetLink, editAssetItem, updateAssetCell} from "./asset";
import {getColId} from "./col";
import {updateCellsValue} from "./cell";
import {previewAttrViewImages} from "../../preview/image";
import {addColOptionOrCell, removeCellOption, setColOption} from "./select";
import {setRelationCell} from "./relation";
import type {AVPanelClickBranchHandler} from "./panelTypes";

export const handleAVPanelCellValueClick: AVPanelClickBranchHandler = ({type, target, event, context}) => {
    if (type === "setColOption") {
        setColOption(
            context.options.protyle,
            context.state.data,
            target,
            context.options.blockElement,
            context.isCustomAttr,
            context.options.cellElements
        );
        return true;
    }
    if (type === "setRelationCell") {
        context.menuElement.querySelector(".b3-menu__item--current")?.classList.remove("b3-menu__item--current");
        target.classList.add("b3-menu__item--current");
        setRelationCell(
            context.options.protyle,
            context.options.blockElement as HTMLElement,
            target,
            context.options.cellElements
        );
        return true;
    }
    if (type === "addColOptionOrCell") {
        context.menuElement.querySelector(".b3-menu__item--current")?.classList.remove("b3-menu__item--current");
        target.classList.add("b3-menu__item--current");
        if (target.querySelector(".b3-menu__checked")) {
            removeCellOption(
                context.options.protyle,
                context.options.cellElements,
                context.menuElement.querySelector(`.b3-chips .b3-chip[data-content="${escapeAttr(target.dataset.name)}"]`),
                context.options.blockElement
            );
        } else {
            addColOptionOrCell(
                context.options.protyle,
                context.state.data,
                context.options.cellElements,
                target,
                context.menuElement,
                context.options.blockElement
            );
        }
        window.sourceflow.menus.menu.remove();
        return true;
    }
    if (type === "removeCellOption") {
        removeCellOption(context.options.protyle, context.options.cellElements, target.parentElement, context.options.blockElement);
        return true;
    }
    if (type === "addAssetLink") {
        addAssetLink(context.options.protyle, context.options.cellElements, target, context.options.blockElement);
        return true;
    }
    if (type === "addAssetExist") {
        const rect = target.getBoundingClientRect();
        assetMenu(context.options.protyle, {
            x: rect.right,
            y: rect.bottom,
            w: target.parentElement.clientWidth + 8,
            h: rect.height
        }, (url, name) => {
            let value: IAVCellAssetValue;
            if (Constants.SOURCEFLOW_ASSETS_IMAGE.includes(pathPosix().extname(url).toLowerCase())) {
                value = {
                    type: "image",
                    content: url,
                    name: ""
                };
            } else {
                value = {
                    type: "file",
                    content: url,
                    name
                };
            }
            updateAssetCell({
                protyle: context.options.protyle,
                cellElements: context.options.cellElements,
                addValue: [value],
                blockElement: context.options.blockElement
            });
            window.sourceflow.menus.menu.remove();
        });
        return true;
    }
    if (type === "openAssetItem") {
        const assetLink = target.parentElement.dataset.content;
        if (target.parentElement.dataset.type === "image") {
            previewAttrViewImages(
                assetLink,
                context.avID,
                getAVViewAttr(context.options.blockElement),
                context.options.blockElement.querySelector('[data-type="av-search"]')?.textContent.trim() || ""
            );
        } else {
            openLink(context.options.protyle, assetLink, event, event.ctrlKey || event.metaKey);
        }
        return true;
    }
    if (type === "editAssetItem") {
        editAssetItem({
            protyle: context.options.protyle,
            cellElements: context.options.cellElements,
            blockElement: context.options.blockElement,
            content: target.parentElement.dataset.content,
            type: target.parentElement.dataset.type as "image" | "file",
            name: target.parentElement.dataset.name,
            index: parseInt(target.parentElement.dataset.index, 10),
            rect: target.parentElement.getBoundingClientRect()
        });
        return true;
    }
    if (type === "clearDate") {
        const colData = context.state.fields.find((item: IAVColumn) => {
            return item.id === getColId(context.options.cellElements[0], context.state.data.viewType);
        });
        updateCellsValue(context.options.protyle, context.options.blockElement as HTMLElement, {
            isNotEmpty2: false,
            isNotEmpty: false,
            content: null,
            content2: null,
            hasEndDate: false,
            isNotTime: colData.date ? !colData.date.fillSpecificTime : true,
        }, context.options.cellElements);
        context.avPanelElement.remove();
        return true;
    }
    return false;
};
