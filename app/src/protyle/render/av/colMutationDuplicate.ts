import {transaction} from "../../wysiwyg/transaction";
import * as dayjs from "dayjs";
import {duplicateNameAddOne} from "../../../util/functions";
import {getFieldsByData} from "./view";

import {addAttrViewColAnimation} from "./colMutationAnimation";

export const duplicateCol = (options: {
    protyle: IProtyle,
    colId: string,
    viewID: string,
    blockElement: Element,
    data: IAV,
}) => {
    let newColData: IAVColumn;
    const fields = getFieldsByData(options.data);
    fields.find((item: IAVColumn, index) => {
        if (item.id === options.colId) {
            newColData = JSON.parse(JSON.stringify(item));
            fields.splice(index + 1, 0, newColData);
            return true;
        }
    });
    newColData.name = duplicateNameAddOne(newColData.name);
    newColData.id = Lute.NewNodeID();
    const newUpdated = dayjs().format("YYYYMMDDHHmmss");
    const blockId = options.blockElement.getAttribute("data-node-id");
    transaction(options.protyle, [{
        action: "duplicateAttrViewKey",
        keyID: options.colId,
        nextID: newColData.id,
        avID: options.data.id,
    }, {
        action: "doUpdateUpdated",
        id: blockId,
        data: newUpdated,
    }], [{
        action: "removeAttrViewCol",
        id: newColData.id,
        avID: options.data.id,
    }, {
        action: "doUpdateUpdated",
        id: blockId,
        data: options.blockElement.getAttribute("updated")
    }]);
    addAttrViewColAnimation({
        blockElement: options.blockElement,
        protyle: options.protyle,
        type: newColData.type,
        name: newColData.name,
        icon: newColData.icon,
        previousID: options.colId,
        data: options.data,
        id: newColData.id,
    });
    options.blockElement.setAttribute("updated", newUpdated);
};
