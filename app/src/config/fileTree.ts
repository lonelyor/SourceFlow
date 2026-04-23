import {fetchPost} from "../util/fetch";
import {genNotebookOption} from "../menus/onGetnotebookconf";

export const fileTree = {
    element: undefined as Element,
    genHTML: () => {
        return `<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.selectOpen}
        <div class="b3-label__text">${window.sourceflow.languages.fileTree2}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="alwaysSelectOpenedFile" type="checkbox"${window.sourceflow.config.fileTree.alwaysSelectOpenedFile ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fileTree7}
        <div class="b3-label__text">${window.sourceflow.languages.fileTree8}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="openFilesUseCurrentTab" type="checkbox"${window.sourceflow.config.fileTree.openFilesUseCurrentTab ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fileTree9}
        <div class="b3-label__text">${window.sourceflow.languages.fileTree10}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="closeTabsOnStart" type="checkbox"${window.sourceflow.config.fileTree.closeTabsOnStart ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.noSplitScreenWhenOpenTab}
        <div class="b3-label__text">${window.sourceflow.languages.noSplitScreenWhenOpenTabTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="noSplitScreenWhenOpenTab" type="checkbox"${window.sourceflow.config.fileTree.noSplitScreenWhenOpenTab ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
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
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fileTree22}
        <div class="b3-label__text">${window.sourceflow.languages.fileTree23}</div>
    </div>
    <span class="fn__space"></span>
    <div class="fn__size200 fn__flex-center fn__flex">
        <input class="b3-text-field fn__flex-1" id="largeFileWarningSize" type="number" min="2" max="10240" value="${window.sourceflow.config.fileTree.largeFileWarningSize}">
        <span class="fn__space"></span>
        <span class="ft__on-surface fn__flex-center">MB</span>
    </div>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fileTree16}
        <div class="b3-label__text">${window.sourceflow.languages.fileTree17}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="maxListCount" type="number" min="1" max="10240" value="${window.sourceflow.config.fileTree.maxListCount}">
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.tabLimit}
        <div class="b3-label__text">${window.sourceflow.languages.tabLimit1}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="maxOpenTabCount" type="number" min="1" max="32" value="${window.sourceflow.config.fileTree.maxOpenTabCount}">
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.recentDocsMaxListCount}
        <div class="b3-label__text">${window.sourceflow.languages.recentDocsMaxListCountTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="recentDocsMaxListCount" type="number" min="32" max="256" value="${window.sourceflow.config.fileTree.recentDocsMaxListCount}">
</div>
<div class="b3-label config__item">
    ${window.sourceflow.languages.fileTree12}
    <div class="b3-label__text">${window.sourceflow.languages.fileTree13}</div>
    <span class="fn__hr"></span>
    <div class="fn__flex">
        <select style="min-width: 200px" class="b3-select" id="docCreateSaveBox">${genNotebookOption(window.sourceflow.config.fileTree.docCreateSaveBox)}</select>
        <div class="fn__space"></div>
        <input class="b3-text-field fn__flex-1" id="docCreateSavePath" value="">
    </div>
</div>
<div class="b3-label config__item">
    ${window.sourceflow.languages.fileTree5}
    <div class="b3-label__text">${window.sourceflow.languages.fileTree6}</div>
    <span class="fn__hr"></span>
    <div class="fn__flex">
        <select style="min-width: 200px" class="b3-select" id="refCreateSaveBox">${genNotebookOption(window.sourceflow.config.fileTree.refCreateSaveBox)}</select>
        <div class="fn__space"></div>
        <input class="b3-text-field fn__flex-1" id="refCreateSavePath" value="${window.sourceflow.config.fileTree.refCreateSavePath}">
    </div>
</div>`;
    },
    _send() {
        // 限制页签最大打开数量为 `32` https://github.com/lonelyor/SourceFlow/issues/6303
        let inputMaxOpenTabCount = parseInt((fileTree.element.querySelector("#maxOpenTabCount") as HTMLInputElement).value);
        if (32 < inputMaxOpenTabCount) {
            inputMaxOpenTabCount = 32;
            (fileTree.element.querySelector("#maxOpenTabCount") as HTMLInputElement).value = "32";
        }
        if (1 > inputMaxOpenTabCount) {
            inputMaxOpenTabCount = 1;
            (fileTree.element.querySelector("#maxOpenTabCount") as HTMLInputElement).value = "1";
        }

        fetchPost("/api/setting/setFiletree", {
            sort: window.sourceflow.config.fileTree.sort,
            alwaysSelectOpenedFile: (fileTree.element.querySelector("#alwaysSelectOpenedFile") as HTMLInputElement).checked,
            refCreateSavePath: (fileTree.element.querySelector("#refCreateSavePath") as HTMLInputElement).value,
            refCreateSaveBox: (fileTree.element.querySelector("#refCreateSaveBox") as HTMLInputElement).value,
            docCreateSavePath: (fileTree.element.querySelector("#docCreateSavePath") as HTMLInputElement).value,
            docCreateSaveBox: (fileTree.element.querySelector("#docCreateSaveBox") as HTMLInputElement).value,
            openFilesUseCurrentTab: (fileTree.element.querySelector("#openFilesUseCurrentTab") as HTMLInputElement).checked,
            closeTabsOnStart: (fileTree.element.querySelector("#closeTabsOnStart") as HTMLInputElement).checked,
            noSplitScreenWhenOpenTab: (fileTree.element.querySelector("#noSplitScreenWhenOpenTab") as HTMLInputElement).checked,
            allowCreateDeeper: (fileTree.element.querySelector("#allowCreateDeeper") as HTMLInputElement).checked,
            removeDocWithoutConfirm: (fileTree.element.querySelector("#removeDocWithoutConfirm") as HTMLInputElement).checked,
            useSingleLineSave: (fileTree.element.querySelector("#useSingleLineSave") as HTMLInputElement).checked,
            createDocAtTop: (fileTree.element.querySelector("#createDocAtTop") as HTMLInputElement).checked,
            largeFileWarningSize: parseInt((fileTree.element.querySelector("#largeFileWarningSize") as HTMLInputElement).value),
            maxListCount: parseInt((fileTree.element.querySelector("#maxListCount") as HTMLInputElement).value),
            maxOpenTabCount: inputMaxOpenTabCount,
            recentDocsMaxListCount: parseInt((fileTree.element.querySelector("#recentDocsMaxListCount") as HTMLInputElement).value),
        }, response => {
            window.sourceflow.config.fileTree = response.data;
        });
    },
    bindEvent: () => {
        (fileTree.element.querySelector("#docCreateSavePath") as HTMLInputElement).value = window.sourceflow.config.fileTree.docCreateSavePath;
        (fileTree.element.querySelector("#refCreateSavePath") as HTMLInputElement).value = window.sourceflow.config.fileTree.refCreateSavePath;
        fileTree.element.querySelectorAll("input, select").forEach((item) => {
            item.addEventListener("change", () => {
                fileTree._send();
            });
        });
    }
};
