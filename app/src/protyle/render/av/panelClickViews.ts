import {transaction} from "../../wysiwyg/transaction";
import {clearAVPanelMenus} from "./panelShared";
import {addView, getFieldsByData, openViewMenu} from "./view";
import {setGalleryCover, setGalleryRatio, setGallerySize} from "./gallery/util";
import {updateLayout} from "./layout";
import type {AVPanelClickBranchHandler} from "./panelTypes";

export const handleAVPanelViewClick: AVPanelClickBranchHandler = async ({type, target, context}) => {
    if (type === "av-add") {
        clearAVPanelMenus();
        addView(context.options.protyle, context.options.blockElement);
        context.avPanelElement.remove();
        return true;
    }
    if (type === "av-view-switch") {
        if (!target.parentElement.classList.contains("b3-menu__item--current")) {
            context.avPanelElement.querySelector(".b3-menu__item--current")?.classList.remove("b3-menu__item--current");
            target.parentElement.classList.add("b3-menu__item--current");
            transaction(context.options.protyle, [{
                action: "setAttrViewBlockView",
                blockID: context.blockID,
                id: target.parentElement.dataset.id,
                avID: context.avID
            }], [{
                action: "setAttrViewBlockView",
                blockID: context.blockID,
                id: context.options.blockElement.querySelector(".av__views .item--focus").getAttribute("data-id"),
                avID: context.avID
            }]);
        }
        return true;
    }
    if (type === "av-view-edit") {
        if (target.parentElement.classList.contains("b3-menu__item--current")) {
            openViewMenu({
                protyle: context.options.protyle,
                blockElement: context.options.blockElement as HTMLElement,
                element: target.parentElement
            });
        } else {
            context.avPanelElement.querySelector(".b3-menu__item--current")?.classList.remove("b3-menu__item--current");
            target.parentElement.classList.add("b3-menu__item--current");
            transaction(context.options.protyle, [{
                action: "setAttrViewBlockView",
                blockID: context.blockID,
                id: target.parentElement.dataset.id,
                avID: context.avID,
            }], [{
                action: "setAttrViewBlockView",
                blockID: context.blockID,
                id: context.options.blockElement.querySelector(".av__views .item--focus").getAttribute("data-id"),
                avID: context.avID,
            }]);
            clearAVPanelMenus();
            openViewMenu({
                protyle: context.options.protyle,
                blockElement: context.options.blockElement as HTMLElement,
                element: target.parentElement
            });
        }
        return true;
    }
    if (type === "set-gallery-cover") {
        setGalleryCover({
            target,
            protyle: context.options.protyle,
            nodeElement: context.options.blockElement,
            view: context.state.data.view as IAVGallery
        });
        return true;
    }
    if (type === "set-gallery-size") {
        setGallerySize({
            target,
            protyle: context.options.protyle,
            nodeElement: context.options.blockElement,
            view: context.state.data.view as IAVGallery
        });
        return true;
    }
    if (type === "set-gallery-ratio") {
        setGalleryRatio({
            target,
            protyle: context.options.protyle,
            nodeElement: context.options.blockElement,
            view: context.state.data.view as IAVGallery
        });
        return true;
    }
    if (type === "set-layout") {
        context.state.data = await updateLayout({
            target,
            protyle: context.options.protyle,
            nodeElement: context.options.blockElement,
            data: context.state.data
        });
        context.state.fields = getFieldsByData(context.state.data);
        return true;
    }
    return false;
};
