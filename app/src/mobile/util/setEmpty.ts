import {App} from "../../index";
import {setTitle} from "../../dialog/processSystem";
import {mountHomepageIntoContainer} from "../../homepage";

export const setEmpty = (app: App) => {
    setTitle("", true);
    document.getElementById("toolbarName").classList.add("fn__hidden");
    document.getElementById("editor").classList.add("fn__none");
    const emptyElement = document.getElementById("empty");
    emptyElement.classList.remove("fn__none");
    void mountHomepageIntoContainer(app, emptyElement);
};

export const setEditor = () => {
    const toolbarNameElement = document.getElementById("toolbarName") as HTMLInputElement;
    setTitle(toolbarNameElement.value);
    toolbarNameElement.classList.remove("fn__hidden");
    document.getElementById("editor").classList.remove("fn__none");
    document.getElementById("empty").classList.add("fn__none");
};
