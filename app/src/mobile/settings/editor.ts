import {openModel} from "../menu/model";
import {fetchPost} from "../../util/fetch";
import {reloadProtyle} from "../../protyle/util/reload";
import {setInlineStyle} from "../../util/assets";
import {confirmDialog} from "../../dialog/confirmDialog";

const setEditor = (modelMainElement: Element) => {
    let dynamicLoadBlocks = parseInt((modelMainElement.querySelector("#dynamicLoadBlocks") as HTMLInputElement).value);
    if (48 > dynamicLoadBlocks) {
        dynamicLoadBlocks = 48;
        (modelMainElement.querySelector("#dynamicLoadBlocks") as HTMLInputElement).value = "48";
    }
    if (1024 < dynamicLoadBlocks) {
        dynamicLoadBlocks = 1024;
        (modelMainElement.querySelector("#dynamicLoadBlocks") as HTMLInputElement).value = "1024";
    }
    window.sourceflow.config.editor.markdown = {
        inlineAsterisk: (modelMainElement.querySelector("#editorMarkdownInlineAsterisk") as HTMLInputElement).checked,
        inlineUnderscore: (modelMainElement.querySelector("#editorMarkdownInlineUnderscore") as HTMLInputElement).checked,
        inlineSup: (modelMainElement.querySelector("#editorMarkdownInlineSup") as HTMLInputElement).checked,
        inlineSub: (modelMainElement.querySelector("#editorMarkdownInlineSub") as HTMLInputElement).checked,
        inlineTag: (modelMainElement.querySelector("#editorMarkdownInlineTag") as HTMLInputElement).checked,
        inlineMath: (modelMainElement.querySelector("#editorMarkdownInlineMath") as HTMLInputElement).checked,
        inlineStrikethrough: (modelMainElement.querySelector("#editorMarkdownInlineStrikethrough") as HTMLInputElement).checked,
        inlineMark: (modelMainElement.querySelector("#editorMarkdownInlineMark") as HTMLInputElement).checked
    };
    window.sourceflow.config.editor.allowSVGScript = (modelMainElement.querySelector("#allowSVGScript") as HTMLInputElement).checked;
    window.sourceflow.config.editor.allowHTMLBLockScript = (modelMainElement.querySelector("#allowHTMLBLockScript") as HTMLInputElement).checked;
    window.sourceflow.config.editor.dynamicLoadBlocks = dynamicLoadBlocks;
    window.sourceflow.config.editor.justify = (modelMainElement.querySelector("#justify") as HTMLInputElement).checked;
    window.sourceflow.config.editor.rtl = (modelMainElement.querySelector("#rtl") as HTMLInputElement).checked;
    window.sourceflow.config.editor.readOnly = (modelMainElement.querySelector("#readOnly") as HTMLInputElement).checked;
    window.sourceflow.config.editor.displayBookmarkIcon = (modelMainElement.querySelector("#displayBookmarkIcon") as HTMLInputElement).checked;
    window.sourceflow.config.editor.displayNetImgMark = (modelMainElement.querySelector("#displayNetImgMark") as HTMLInputElement).checked;
    window.sourceflow.config.editor.assetUploadProvider = (modelMainElement.querySelector("#assetUploadProvider") as HTMLSelectElement).value as "local" | "picgo";
    window.sourceflow.config.editor.picgoServerURL = (modelMainElement.querySelector("#picgoServerURL") as HTMLInputElement).value.trim();
    modelMainElement.querySelector("#picgoServerURLWrap")?.classList.toggle("fn__none", window.sourceflow.config.editor.assetUploadProvider !== "picgo");
    window.sourceflow.config.editor.codeSyntaxHighlightLineNum = (modelMainElement.querySelector("#codeSyntaxHighlightLineNum") as HTMLInputElement).checked;
    window.sourceflow.config.editor.embedBlockBreadcrumb = (modelMainElement.querySelector("#embedBlockBreadcrumb") as HTMLInputElement).checked;
    window.sourceflow.config.editor.headingEmbedMode = parseInt((modelMainElement.querySelector("#headingEmbedMode") as HTMLSelectElement).value);
    window.sourceflow.config.editor.listLogicalOutdent = (modelMainElement.querySelector("#listLogicalOutdent") as HTMLInputElement).checked;
    window.sourceflow.config.editor.listItemDotNumberClickFocus = (modelMainElement.querySelector("#listItemDotNumberClickFocus") as HTMLInputElement).checked;
    window.sourceflow.config.editor.spellcheck = (modelMainElement.querySelector("#spellcheck") as HTMLInputElement).checked;
    window.sourceflow.config.editor.onlySearchForDoc = (modelMainElement.querySelector("#onlySearchForDoc") as HTMLInputElement).checked;
    window.sourceflow.config.editor.pasteURLAutoConvert = (modelMainElement.querySelector("#pasteURLAutoConvert") as HTMLInputElement).checked;
    window.sourceflow.config.editor.htmlPasteMode = (modelMainElement.querySelector("#htmlPasteMode") as HTMLSelectElement).value as TEditorHTMLPasteMode;
    window.sourceflow.config.editor.plantUMLServePath = (modelMainElement.querySelector("#plantUMLServePath") as HTMLInputElement).value;
    window.sourceflow.config.editor.katexMacros = (modelMainElement.querySelector("#katexMacros") as HTMLTextAreaElement).value;
    window.sourceflow.config.editor.codeLineWrap = (modelMainElement.querySelector("#codeLineWrap") as HTMLInputElement).checked;
    window.sourceflow.config.editor.virtualBlockRef = (modelMainElement.querySelector("#virtualBlockRef") as HTMLInputElement).checked;
    window.sourceflow.config.editor.virtualBlockRefInclude = (modelMainElement.querySelector("#virtualBlockRefInclude") as HTMLTextAreaElement).value;
    window.sourceflow.config.editor.virtualBlockRefExclude = (modelMainElement.querySelector("#virtualBlockRefExclude") as HTMLTextAreaElement).value;
    window.sourceflow.config.editor.blockRefDynamicAnchorTextMaxLen = parseInt((modelMainElement.querySelector("#blockRefDynamicAnchorTextMaxLen") as HTMLInputElement).value);
    window.sourceflow.config.editor.backlinkExpandCount = parseInt((modelMainElement.querySelector("#backlinkExpandCount") as HTMLInputElement).value);
    window.sourceflow.config.editor.backmentionExpandCount = parseInt((modelMainElement.querySelector("#backmentionExpandCount") as HTMLInputElement).value);
    window.sourceflow.config.editor.backlinkContainChildren = (modelMainElement.querySelector("#backlinkContainChildren") as HTMLInputElement).checked;
    window.sourceflow.config.editor.codeLigatures = (modelMainElement.querySelector("#codeLigatures") as HTMLInputElement).checked;
    window.sourceflow.config.editor.codeTabSpaces = parseInt((modelMainElement.querySelector("#codeTabSpaces") as HTMLInputElement).value);
    window.sourceflow.config.editor.fontSize = parseInt((modelMainElement.querySelector("#fontSize") as HTMLInputElement).value);
    window.sourceflow.config.editor.generateHistoryInterval = parseInt((modelMainElement.querySelector("#generateHistoryInterval") as HTMLInputElement).value);
    window.sourceflow.config.editor.historyRetentionDays = parseInt((modelMainElement.querySelector("#historyRetentionDays") as HTMLInputElement).value);
    fetchPost("/api/setting/setEditor", window.sourceflow.config.editor, response => {
        window.sourceflow.config.editor = response.data;
        reloadProtyle(window.sourceflow.mobile.editor.protyle, false);
        setInlineStyle();
    });
};

export const initEditor = () => {
    let fontSizeHTML = "";
    for (let i = 9; i <= 72; i++) {
        fontSizeHTML += `<option ${window.sourceflow.config.editor.fontSize === i ? "selected" : ""} value="${i}">${i}</option>`;
    }
    openModel({
        title: window.sourceflow.languages.editor,
        icon: "iconEdit",
        html: `<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.justify}
        <div class="b3-label__text">${window.sourceflow.languages.justifyTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="justify" type="checkbox"${window.sourceflow.config.editor.justify ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.rtl}
        <div class="b3-label__text">${window.sourceflow.languages.rtlTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="rtl" type="checkbox"${window.sourceflow.config.editor.rtl ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.editReadonly}
        <div class="b3-label__text">${window.sourceflow.languages.editReadonlyTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="readOnly" type="checkbox"${window.sourceflow.config.editor.readOnly ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md12}
        <div class="b3-label__text">${window.sourceflow.languages.md16}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="displayBookmarkIcon" type="checkbox"${window.sourceflow.config.editor.displayBookmarkIcon ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md7}
        <div class="b3-label__text">${window.sourceflow.languages.md8}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="displayNetImgMark" type="checkbox"${window.sourceflow.config.editor.displayNetImgMark ? " checked" : ""}/>
</label>
<div class="b3-label">
    ${window.sourceflow.languages.assetUploadProvider}
    <span class="fn__hr"></span>
    <select class="b3-select fn__block" id="assetUploadProvider">
      <option value="local" ${(window.sourceflow.config.editor.assetUploadProvider || "local") === "local" ? "selected" : ""}>${window.sourceflow.languages.assetUploadProviderLocal}</option>
      <option value="picgo" ${(window.sourceflow.config.editor.assetUploadProvider || "local") === "picgo" ? "selected" : ""}>${window.sourceflow.languages.assetUploadProviderPicGo}</option>
    </select>
    <div class="b3-label__text">${window.sourceflow.languages.assetUploadProviderTip}</div>
</div>
<div class="b3-label${(window.sourceflow.config.editor.assetUploadProvider || "local") !== "picgo" ? " fn__none" : ""}" id="picgoServerURLWrap">
    ${window.sourceflow.languages.picgoServerURL}
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="picgoServerURL" value="${window.sourceflow.config.editor.picgoServerURL || "http://127.0.0.1:36677/upload"}"/>
    <div class="b3-label__text">${window.sourceflow.languages.picgoServerURLTip}</div>
</div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.embedBlockBreadcrumb}
        <div class="b3-label__text">${window.sourceflow.languages.embedBlockBreadcrumbTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="embedBlockBreadcrumb" type="checkbox"${window.sourceflow.config.editor.embedBlockBreadcrumb ? " checked" : ""}/>
</label>
<div class="b3-label">
    ${window.sourceflow.languages.headingEmbedMode}
    <span class="fn__hr"></span>
    <select class="b3-select fn__block" id="headingEmbedMode">
      <option value="0" ${window.sourceflow.config.editor.headingEmbedMode === 0 ? "selected" : ""}>${window.sourceflow.languages.showHeadingWithBlocks}</option>
      <option value="1" ${window.sourceflow.config.editor.headingEmbedMode === 1 ? "selected" : ""}>${window.sourceflow.languages.showHeadingOnlyTitle}</option>
      <option value="2" ${window.sourceflow.config.editor.headingEmbedMode === 2 ? "selected" : ""}>${window.sourceflow.languages.showHeadingOnlyBlocks}</option>
    </select>
    <div class="b3-label__text">${window.sourceflow.languages.headingEmbedModeTip}</div>
</div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.outlineOutdent}
        <div class="b3-label__text">${window.sourceflow.languages.outlineOutdentTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="listLogicalOutdent" type="checkbox"${window.sourceflow.config.editor.listLogicalOutdent ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.listItemDotNumberClickFocus}
        <div class="b3-label__text">${window.sourceflow.languages.listItemDotNumberClickFocusTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="listItemDotNumberClickFocus" type="checkbox"${window.sourceflow.config.editor.listItemDotNumberClickFocus ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.spellcheck}
        <div class="b3-label__text">${window.sourceflow.languages.spellcheckTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="spellcheck" type="checkbox"${window.sourceflow.config.editor.spellcheck ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.onlySearchForDoc}
        <div class="b3-label__text">${window.sourceflow.languages.onlySearchForDocTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="onlySearchForDoc" type="checkbox"${window.sourceflow.config.editor.onlySearchForDoc ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.pasteURLAutoConvert}
        <div class="b3-label__text">${window.sourceflow.languages.pasteURLAutoConvertTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="pasteURLAutoConvert" type="checkbox"${window.sourceflow.config.editor.pasteURLAutoConvert ? " checked" : ""}/>
</label>
<div class="b3-label">
    ${window.sourceflow.languages.htmlPasteMode}
    <span class="fn__hr"></span>
    <select class="b3-select fn__block" id="htmlPasteMode">
      <option value="smart" ${(window.sourceflow.config.editor.htmlPasteMode || "smart") === "smart" ? "selected" : ""}>${window.sourceflow.languages.htmlPasteModeSmart}</option>
      <option value="html" ${(window.sourceflow.config.editor.htmlPasteMode || "smart") === "html" ? "selected" : ""}>${window.sourceflow.languages.htmlPasteModeHTML}</option>
      <option value="image" ${(window.sourceflow.config.editor.htmlPasteMode || "smart") === "image" ? "selected" : ""}>${window.sourceflow.languages.htmlPasteModeImage}</option>
    </select>
    <div class="b3-label__text">${window.sourceflow.languages.htmlPasteModeTip}</div>
</div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md31}
        <div class="b3-label__text">${window.sourceflow.languages.md32}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="codeLineWrap" type="checkbox"${window.sourceflow.config.editor.codeLineWrap ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md2}
        <div class="b3-label__text">${window.sourceflow.languages.md3}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="codeLigatures" type="checkbox"${window.sourceflow.config.editor.codeLigatures ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md27}
        <div class="b3-label__text">${window.sourceflow.languages.md28}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="codeSyntaxHighlightLineNum" type="checkbox"${window.sourceflow.config.editor.codeSyntaxHighlightLineNum ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md33}
        <div class="b3-label__text">${window.sourceflow.languages.md34}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="virtualBlockRef" type="checkbox"${window.sourceflow.config.editor.virtualBlockRef ? " checked" : ""}/>
</label>
<div class="b3-label">
    ${window.sourceflow.languages.md9}
    <span class="fn__hr"></span>
    <textarea class="b3-text-field fn__block" id="virtualBlockRefInclude">${window.sourceflow.config.editor.virtualBlockRefInclude}</textarea>
    <div class="b3-label__text">${window.sourceflow.languages.md36}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.md35}
    <span class="fn__hr"></span>
    <textarea class="b3-text-field fn__block" id="virtualBlockRefExclude">${window.sourceflow.config.editor.virtualBlockRefExclude}</textarea>
    <div class="b3-label__text">${window.sourceflow.languages.md36}</div>
    <div class="b3-label__text">${window.sourceflow.languages.md41}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.md39}
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="plantUMLServePath" value="${window.sourceflow.config.editor.plantUMLServePath}"/>
    <div class="b3-label__text">${window.sourceflow.languages.md40}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.dynamicLoadBlocks}
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="dynamicLoadBlocks" type="number" min="48" value="${window.sourceflow.config.editor.dynamicLoadBlocks}"/>
    <div class="b3-label__text">${window.sourceflow.languages.dynamicLoadBlocksTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.md37}
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="blockRefDynamicAnchorTextMaxLen" type="number" min="1" max="5120" value="${window.sourceflow.config.editor.blockRefDynamicAnchorTextMaxLen}"/>
    <div class="b3-label__text">${window.sourceflow.languages.md38}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.backlinkExpand}
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="backlinkExpandCount" type="number" min="0" max="512" value="${window.sourceflow.config.editor.backlinkExpandCount}"/>
    <div class="b3-label__text">${window.sourceflow.languages.backlinkExpandTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.backmentionExpand}
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="backmentionExpandCount" type="number" min="-1" max="512" value="${window.sourceflow.config.editor.backmentionExpandCount}"/>
    <div class="b3-label__text">${window.sourceflow.languages.backmentionExpandTip}</div>
</div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.backlinkContainChildren}
        <div class="b3-label__text">${window.sourceflow.languages.backlinkContainChildrenTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="backlinkContainChildren" type="checkbox"${window.sourceflow.config.editor.backlinkContainChildren ? " checked" : ""}/>
</label>
<div class="b3-label">
    ${window.sourceflow.languages.generateHistory}
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="generateHistoryInterval" type="number" min="0" max="120" value="${window.sourceflow.config.editor.generateHistoryInterval}"/>
    <div class="b3-label__text">${window.sourceflow.languages.generateHistoryInterval}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.historyRetentionDays} 
    <a href="javascript:void(0)" id="clearHistory">${window.sourceflow.languages.clearHistory}</a>
    <span class="fn__hr"></span>
    <input class="b3-text-field fn__block" id="historyRetentionDays" type="number" min="1" max="3650" value="${window.sourceflow.config.editor.historyRetentionDays}"/>
    <div class="b3-label__text">${window.sourceflow.languages.historyRetentionDaysTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.fontSize} 
    <span class="ft__on-surface">${window.sourceflow.config.editor.fontSize}</span>
    <div class="fn__hr"></div>
    <select id="fontSize" class="b3-select fn__block">${fontSizeHTML}</select>
    <div class="b3-label__text">${window.sourceflow.languages.fontSizeTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.md29} 
    <div class="fn__hr"></div>
    <select id="codeTabSpaces" class="b3-select fn__block">
        <option ${window.sourceflow.config.editor.codeTabSpaces === 0 ? "selected" : ""} value="0">0</option>
        <option ${window.sourceflow.config.editor.codeTabSpaces === 2 ? "selected" : ""} value="2">2</option>
        <option ${window.sourceflow.config.editor.codeTabSpaces === 4 ? "selected" : ""} value="4">4</option>
        <option ${window.sourceflow.config.editor.codeTabSpaces === 6 ? "selected" : ""} value="6">6</option>
        <option ${window.sourceflow.config.editor.codeTabSpaces === 8 ? "selected" : ""} value="8">8</option>
    </select>
    <div class="b3-label__text">${window.sourceflow.languages.md30}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.katexMacros}
    <div class="fn__hr"></div>
    <textarea class="b3-text-field fn__block" id="katexMacros">${window.sourceflow.config.editor.katexMacros}</textarea>
    <div class="b3-label__text">${window.sourceflow.languages.katexMacrosTip}</div>
</div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.allowSVGScript}
        <div class="b3-label__text">${window.sourceflow.languages.allowSVGScriptTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="allowSVGScript" type="checkbox"${window.sourceflow.config.editor.allowSVGScript ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.allowHTMLBLockScript}
        <div class="b3-label__text">${window.sourceflow.languages.allowHTMLBLockScriptTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="allowHTMLBLockScript" type="checkbox"${window.sourceflow.config.editor.allowHTMLBLockScript ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.editorMarkdownInlineAsterisk}
        <div class="b3-label__text">${window.sourceflow.languages.editorMarkdownInlineAsteriskTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="editorMarkdownInlineAsterisk" type="checkbox"${window.sourceflow.config.editor.markdown.inlineAsterisk ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.editorMarkdownInlineUnderscore}
        <div class="b3-label__text">${window.sourceflow.languages.editorMarkdownInlineUnderscoreTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="editorMarkdownInlineUnderscore" type="checkbox"${window.sourceflow.config.editor.markdown.inlineUnderscore ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.editorMarkdownInlineSup}
        <div class="b3-label__text">${window.sourceflow.languages.editorMarkdownInlineSupTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="editorMarkdownInlineSup" type="checkbox"${window.sourceflow.config.editor.markdown.inlineSup ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.editorMarkdownInlineSub}
        <div class="b3-label__text">${window.sourceflow.languages.editorMarkdownInlineSubTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="editorMarkdownInlineSub" type="checkbox"${window.sourceflow.config.editor.markdown.inlineSub ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.editorMarkdownInlineTag}
        <div class="b3-label__text">${window.sourceflow.languages.editorMarkdownInlineTagTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="editorMarkdownInlineTag" type="checkbox"${window.sourceflow.config.editor.markdown.inlineTag ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.editorMarkdownInlineMath}
        <div class="b3-label__text">${window.sourceflow.languages.editorMarkdownInlineMathTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="editorMarkdownInlineMath" type="checkbox"${window.sourceflow.config.editor.markdown.inlineMath ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.editorMarkdownInlineStrikethrough}
        <div class="b3-label__text">${window.sourceflow.languages.editorMarkdownInlineStrikethroughTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="editorMarkdownInlineStrikethrough" type="checkbox"${window.sourceflow.config.editor.markdown.inlineStrikethrough ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.editorMarkdownInlineMark}
        <div class="b3-label__text">${window.sourceflow.languages.editorMarkdownInlineMarkTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="editorMarkdownInlineMark" type="checkbox"${window.sourceflow.config.editor.markdown.inlineMark ? " checked" : ""}/>
</label>`,
        bindEvent(modelMainElement: HTMLElement) {
            modelMainElement.querySelector("#clearHistory").addEventListener("click", () => {
                confirmDialog(window.sourceflow.languages.clearHistory, window.sourceflow.languages.confirmClearHistory, () => {
                    fetchPost("/api/history/clearWorkspaceHistory", {});
                });
            });

            modelMainElement.querySelectorAll("input.b3-switch, select.b3-select, input.b3-slider").forEach((item) => {
                item.addEventListener("change", () => {
                    setEditor(modelMainElement);
                });
            });
            modelMainElement.querySelectorAll("textarea.b3-text-field, input.b3-text-field, input.b3-slider").forEach((item) => {
                item.addEventListener("blur", () => {
                    setEditor(modelMainElement);
                });
            });
            modelMainElement.querySelectorAll("input.b3-slider").forEach((item) => {
                item.addEventListener("input", (event) => {
                    const target = event.target as HTMLInputElement;
                    target.previousElementSibling.previousElementSibling.textContent = target.value;
                });
            });
        }
    });
};
