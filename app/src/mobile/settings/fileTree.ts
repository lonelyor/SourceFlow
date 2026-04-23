import {openModel} from "../menu/model";
import {fetchPost} from "../../util/fetch";
import {genNotebookOption} from "../../menus/onGetnotebookconf";

export const initFileTree = () => {
    openModel({
        title: window.sourceflow.languages.fileTree,
        icon: "iconFiles",
        html: `<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fileTree18}
        <div class="b3-label__text">${window.sourceflow.languages.fileTree19}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="allowCreateDeeper" type="checkbox"${window.sourceflow.config.fileTree.allowCreateDeeper ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fileTree3}
        <div class="b3-label__text">${window.sourceflow.languages.fileTree4}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="removeDocWithoutConfirm" type="checkbox"${window.sourceflow.config.fileTree.removeDocWithoutConfirm ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fileTree20}
        <div class="b3-label__text">${window.sourceflow.languages.fileTree21}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="useSingleLineSave" type="checkbox"${window.sourceflow.config.fileTree.useSingleLineSave ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fileTree24}
        <div class="b3-label__text">${window.sourceflow.languages.fileTree25}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="createDocAtTop" type="checkbox"${window.sourceflow.config.fileTree.createDocAtTop ? " checked" : ""}/>
</label>
<div class="b3-label">
    ${window.sourceflow.languages.fileTree22}
    <span class="fn__hr"></span>
    <div class="fn__flex">
        <input class="b3-text-field fn__flex-1" id="largeFileWarningSize" type="number" min="2" max="10240" value="${window.sourceflow.config.fileTree.largeFileWarningSize}">
        <span class="fn__space"></span>
        <span class="ft__on-surface fn__flex-center">MB</span>
    </div>
    <div class="b3-label__text">${window.sourceflow.languages.fileTree23}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.fileTree16}
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="maxListCount" type="number" min="1" max="10240" value="${window.sourceflow.config.fileTree.maxListCount}">
    <div class="b3-label__text">${window.sourceflow.languages.fileTree17}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.recentDocsMaxListCount}
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="recentDocsMaxListCount" type="number" min="32" max="256" value="${window.sourceflow.config.fileTree.recentDocsMaxListCount}">
    <div class="b3-label__text">${window.sourceflow.languages.recentDocsMaxListCountTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.fileTree12}
    <span class="fn__hr"></span>
    <select class="b3-select fn__block" id="docCreateSaveBox">${genNotebookOption(window.sourceflow.config.fileTree.docCreateSaveBox)}</select>
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="docCreateSavePath" value="">
    <div class="b3-label__text">${window.sourceflow.languages.fileTree13}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.fileTree5}
    <span class="fn__hr"></span>
    <select class="b3-select fn__block" id="refCreateSaveBox">${genNotebookOption(window.sourceflow.config.fileTree.refCreateSaveBox)}</select>
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="refCreateSavePath" value="${window.sourceflow.config.fileTree.refCreateSavePath}">
    <div class="b3-label__text">${window.sourceflow.languages.fileTree6}</div>
</div>`,
        bindEvent(modelMainElement: HTMLElement) {
            (modelMainElement.querySelector("#docCreateSavePath") as HTMLInputElement).value = window.sourceflow.config.fileTree.docCreateSavePath;
            (modelMainElement.querySelector("#refCreateSavePath") as HTMLInputElement).value = window.sourceflow.config.fileTree.refCreateSavePath;
            modelMainElement.querySelectorAll("input, select").forEach((item) => {
                item.addEventListener("change", () => {
                    fetchPost("/api/setting/setFiletree", {
                        sort: window.sourceflow.config.fileTree.sort,
                        alwaysSelectOpenedFile: window.sourceflow.config.fileTree.alwaysSelectOpenedFile,
                        refCreateSavePath: (modelMainElement.querySelector("#refCreateSavePath") as HTMLInputElement).value,
                        refCreateSaveBox: (modelMainElement.querySelector("#refCreateSaveBox") as HTMLInputElement).value,
                        docCreateSavePath: (modelMainElement.querySelector("#docCreateSavePath") as HTMLInputElement).value,
                        docCreateSaveBox: (modelMainElement.querySelector("#docCreateSaveBox") as HTMLInputElement).value,
                        openFilesUseCurrentTab: window.sourceflow.config.fileTree.openFilesUseCurrentTab,
                        closeTabsOnStart: window.sourceflow.config.fileTree.closeTabsOnStart,
                        allowCreateDeeper: (modelMainElement.querySelector("#allowCreateDeeper") as HTMLInputElement).checked,
                        removeDocWithoutConfirm: (modelMainElement.querySelector("#removeDocWithoutConfirm") as HTMLInputElement).checked,
                        useSingleLineSave: (modelMainElement.querySelector("#useSingleLineSave") as HTMLInputElement).checked,
                        createDocAtTop: (modelMainElement.querySelector("#createDocAtTop") as HTMLInputElement).checked,
                        largeFileWarningSize: parseInt((modelMainElement.querySelector("#largeFileWarningSize") as HTMLInputElement).value),
                        maxListCount: parseInt((modelMainElement.querySelector("#maxListCount") as HTMLInputElement).value),
                        recentDocsMaxListCount: parseInt((modelMainElement.querySelector("#recentDocsMaxListCount") as HTMLInputElement).value),
                        maxOpenTabCount: window.sourceflow.config.fileTree.maxOpenTabCount,
                    }, response => {
                        window.sourceflow.config.fileTree = response.data;
                    });
                });
            });
        }
    });
};
