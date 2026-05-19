import {Menu} from "../../../plugin/Menu";
import {Constants} from "../../../constants";
import * as dayjs from "dayjs";
import {transaction} from "../../wysiwyg/transaction";
import {addAttrViewColAnimation} from "./colMutationAnimation";
import {getBuiltinAddColSpecs} from "./colMutationAddConfig";

const appendBuiltinAddColItem = (options: {
    menu: Menu;
    protyle: IProtyle;
    blockElement: Element;
    avID: string;
    blockID: string;
    previousID?: string;
    spec: {
        id: string;
        icon: string;
        type: TAVCol;
        name: string;
    };
}) => {
    options.menu.addItem({
        id: options.spec.id,
        icon: options.spec.icon,
        label: options.spec.name,
        click() {
            const id = Lute.NewNodeID();
            const oldUpdated = options.blockElement.getAttribute("updated");
            const newUpdated = dayjs().format("YYYYMMDDHHmmss");
            transaction(options.protyle, [{
                action: "addAttrViewCol",
                name: options.spec.name,
                avID: options.avID,
                type: options.spec.type,
                id,
                previousID: options.previousID,
            }, {
                action: "doUpdateUpdated",
                id: options.blockID,
                data: newUpdated,
            }], [{
                action: "removeAttrViewCol",
                id,
                avID: options.avID,
            }, {
                action: "doUpdateUpdated",
                id: options.blockID,
                data: oldUpdated,
            }]);
            addAttrViewColAnimation({
                blockElement: options.blockElement,
                protyle: options.protyle,
                type: options.spec.type,
                name: options.spec.name,
                id,
                previousID: options.previousID,
            });
            options.blockElement.setAttribute("updated", newUpdated);
        }
    });
};

export const addCol = (protyle: IProtyle, blockElement: Element, previousID?: string) => {
    const menu = new Menu(Constants.MENU_AV_HEADER_ADD);
    const avID = blockElement.getAttribute("data-av-id");
    if (typeof previousID === "undefined" && blockElement.getAttribute("data-av-type") === "table") {
        previousID = Array.from(blockElement.querySelectorAll(".av__row--header .av__cell")).pop()?.getAttribute("data-col-id");
    }
    const blockID = blockElement.getAttribute("data-node-id");
    getBuiltinAddColSpecs().forEach((spec) => {
        appendBuiltinAddColItem({
            menu,
            protyle,
            blockElement,
            avID,
            blockID,
            previousID,
            spec,
        });
    });
    return menu;
};
