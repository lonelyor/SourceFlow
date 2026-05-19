import {transaction} from "../../wysiwyg/transaction";
import {
    bindGroupsEvent,
    bindGroupsNumber,
    getGroupsHTML,
    getGroupsMethodHTML,
    getGroupsNumberHTML,
    getLanguageByIndex,
    goGroupsDate,
    goGroupsSort,
    setGroupMethod
} from "./groups";
import {clearAVPanelMenus, positionAVPanelMenu} from "./panelShared";
import {getFieldsByData} from "./view";
import type {AVPanelClickBranchHandler} from "./panelTypes";

export const handleAVPanelGroupClick: AVPanelClickBranchHandler = async ({type, target, context}) => {
    if (type === "goGroupsDate") {
        goGroupsDate({
            target,
            menuElement: context.menuElement,
            protyle: context.options.protyle,
            blockElement: context.options.blockElement,
            data: context.state.data
        });
        context.state.fields = getFieldsByData(context.state.data);
        return true;
    }
    if (type === "goGroupsSort") {
        goGroupsSort({
            target,
            menuElement: context.menuElement,
            protyle: context.options.protyle,
            blockElement: context.options.blockElement,
            data: context.state.data
        });
        context.state.fields = getFieldsByData(context.state.data);
        return true;
    }
    if (type === "setGroupMethod") {
        setGroupMethod({
            protyle: context.options.protyle,
            fieldId: target.getAttribute("data-id"),
            data: context.state.data,
            menuElement: context.menuElement,
            blockElement: context.options.blockElement,
        });
        context.state.fields = getFieldsByData(context.state.data);
        return true;
    }
    if (type === "goGroups") {
        if (context.menuElement.querySelector('[data-type="avGroupRange"]') && context.state.closeCB) {
            await context.state.closeCB();
        }
        context.state.closeCB = undefined;
        if ((context.state.data.view.group && context.state.data.view.group.field) || target.classList.contains("block__icon")) {
            context.menuElement.innerHTML = getGroupsHTML(context.state.fields, context.state.data.view);
            bindGroupsEvent({
                protyle: context.options.protyle,
                menuElement: context.menuElement,
                blockElement: context.options.blockElement,
                data: context.state.data
            });
        } else {
            context.menuElement.innerHTML = getGroupsMethodHTML(
                context.state.fields,
                context.state.data.view.group,
                context.state.data.viewType
            );
        }
        positionAVPanelMenu(context);
        return true;
    }
    if (type === "goGroupsMethod") {
        clearAVPanelMenus();
        context.menuElement.innerHTML = getGroupsMethodHTML(
            context.state.fields,
            context.state.data.view.group,
            context.state.data.viewType
        );
        positionAVPanelMenu(context);
        return true;
    }
    if (type === "getGroupsNumber") {
        clearAVPanelMenus();
        context.menuElement.innerHTML = getGroupsNumberHTML(context.state.data.view.group);
        positionAVPanelMenu(context);
        context.state.closeCB = bindGroupsNumber({
            protyle: context.options.protyle,
            data: context.state.data,
            menuElement: context.menuElement,
            blockElement: context.options.blockElement
        });
        return true;
    }
    if (type === "hideGroup") {
        clearAVPanelMenus();
        const useElement = target.firstElementChild;
        const isHide = useElement.getAttribute("xlink:href") !== "#iconEye";
        useElement.setAttribute("xlink:href", isHide ? "#iconEye" : "#iconEyeoff");
        let oldGroupHidden;
        let showCount = 0;
        context.state.data.view.groups.forEach((item) => {
            if (item.id === target.dataset.id) {
                oldGroupHidden = item.groupHidden;
                item.groupHidden = isHide ? 0 : 2;
            }
            if (item.groupHidden === 0) {
                showCount++;
            }
        });
        target.parentElement.classList[isHide ? "remove" : "add"]("b3-menu__item--hidden");
        context.menuElement.querySelector('[data-type="hideGroups"]').innerHTML = `${window.sourceflow.languages[showCount === 0 ? "showAll" : "hideAll"]}
<span class="fn__space"></span>
<svg><use xlink:href="#iconEye${showCount === 0 ? "" : "off"}"></use></svg>`;
        transaction(context.options.protyle, [{
            action: "hideAttrViewGroup",
            avID: context.state.data.id,
            blockID: context.blockID,
            id: target.dataset.id,
            data: isHide ? 0 : 2,
        }], [{
            action: "hideAttrViewGroup",
            avID: context.state.data.id,
            blockID: context.blockID,
            id: target.dataset.id,
            data: oldGroupHidden
        }]);
        return true;
    }
    if (type === "hideGroups") {
        clearAVPanelMenus();
        const isShow = target.querySelector("use").getAttribute("xlink:href") === "#iconEyeoff";
        target.innerHTML = `${window.sourceflow.languages[isShow ? "showAll" : "hideAll"]}
<span class="fn__space"></span>
<svg><use xlink:href="#iconEye${isShow ? "" : "off"}"></use></svg>`;
        context.state.data.view.groups.forEach((item) => {
            item.groupHidden = isShow ? 2 : 0;
            const itemElement = target.parentElement.parentElement.querySelector(`.b3-menu__item[data-id="${item.id}"]`);
            itemElement.classList[isShow ? "add" : "remove"]("b3-menu__item--hidden");
            itemElement.querySelector(".b3-menu__action use")?.setAttribute("xlink:href", `#iconEye${isShow ? "off" : ""}`);
        });
        transaction(context.options.protyle, [{
            action: "hideAttrViewAllGroups",
            avID: context.state.data.id,
            blockID: context.blockID,
            data: isShow,
        }], [{
            action: "hideAttrViewAllGroups",
            avID: context.state.data.id,
            blockID: context.blockID,
            data: !isShow
        }]);
        return true;
    }
    if (type === "removeGroups") {
        clearAVPanelMenus();
        transaction(context.options.protyle, [{
            action: "removeAttrViewGroup",
            avID: context.state.data.id,
            blockID: context.blockID,
        }], [{
            action: "setAttrViewGroup",
            avID: context.state.data.id,
            blockID: context.blockID,
            data: context.state.data.view.group
        }]);
        context.state.data.view.group = null;
        delete context.state.data.view.groups;
        context.menuElement.innerHTML = getGroupsHTML(context.state.fields, context.state.data.view);
        positionAVPanelMenu(context);
        return true;
    }
    return false;
};
