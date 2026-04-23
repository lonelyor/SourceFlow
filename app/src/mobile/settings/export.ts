import {openModel} from "../menu/model";
import {exportConfig} from "../../config/exportConfig";

export const initExport = () => {
    openModel({
        title: window.sourceflow.languages.export,
        icon: "iconUpload",
        html: `<div>${exportConfig.genHTML()}</div>`,
        bindEvent(modelMainElement: HTMLElement) {
            exportConfig.element = modelMainElement.firstElementChild;
            exportConfig.bindEvent();
        }
    });
};
