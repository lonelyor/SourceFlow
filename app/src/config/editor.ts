import {getAllModels} from "../layout/getAll";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
import {setInlineStyle} from "../util/assets";
import {fetchPost} from "../util/fetch";
import {confirmDialog} from "../dialog/confirmDialog";
import {reloadProtyle} from "../protyle/util/reload";
import {updateHotkeyTip} from "../protyle/util/compatibility";
import {Constants} from "../constants";
import {resize} from "../protyle/util/resize";
import {setReadOnly} from "./util/setReadOnly";
import {Menu} from "../plugin/Menu";
import {getFullWidthAttr} from "../util/attrCompat";

const editorText = (key: string, fallback: string) => {
    return window.sourceflow.languages[key] || fallback;
};

export const editor = {
    element: undefined as Element,
    genHTML: () => {
        let spellcheckTip = "";
        /// #if !BROWSER
        spellcheckTip = window.sourceflow.languages.spellcheckTip2;
        /// #else
        spellcheckTip = window.sourceflow.languages.spellcheckTip;
        /// #endif
        return `<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fullWidth}
        <div class="b3-label__text">${window.sourceflow.languages.fullWidthTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="fullWidth" type="checkbox"${window.sourceflow.config.editor.fullWidth ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
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
        <code class="fn__code${window.sourceflow.config.keymap.general.editReadonly.custom ? "" : " fn__none"}">${updateHotkeyTip(window.sourceflow.config.keymap.general.editReadonly.custom)}</code>
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
        ${editorText("displayHeadingLevel", "Show heading level markers")}
        <div class="b3-label__text">${editorText("displayHeadingLevelTip", "Always show H1-H6 before headings so the level is not inferred only from font size.")}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="displayHeadingLevel" type="checkbox"${window.sourceflow.config.editor.displayHeadingLevel !== false ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${editorText("displayBlockLineNumber", "Show block numbers")}
        <div class="b3-label__text">${editorText("displayBlockLineNumberTip", "Show stable numbers before top-level blocks for paragraph location; automatic wrapped lines are not renumbered.")}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="displayBlockLineNumber" type="checkbox"${window.sourceflow.config.editor.displayBlockLineNumber ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${editorText("alwaysShowGutter", "Always show block type icon")}
        <div class="b3-label__text">${editorText("alwaysShowGutterTip", "When enabled, the block type icon persists in the left margin after hovering. When disabled, it only appears on hover.")}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="alwaysShowGutter" type="checkbox"${window.sourceflow.config.editor.alwaysShowGutter ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md7}
        <div class="b3-label__text">${window.sourceflow.languages.md8}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="displayNetImgMark" type="checkbox"${window.sourceflow.config.editor.displayNetImgMark ? " checked" : ""}/>
</label>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${editorText("assetUploadProvider", "Image upload provider")}
        <div class="b3-label__text">${editorText("assetUploadProviderTip", "Images can be kept in local assets or forwarded to PicGo.")}</div>
    </div>
    <span class="fn__space"></span>
    <select class="b3-select fn__flex-center fn__size200" id="assetUploadProvider">
      <option value="local" ${(window.sourceflow.config.editor.assetUploadProvider || "local") === "local" ? "selected" : ""}>${editorText("assetUploadProviderLocal", "Local assets")}</option>
      <option value="picgo" ${(window.sourceflow.config.editor.assetUploadProvider || "local") === "picgo" ? "selected" : ""}>${editorText("assetUploadProviderPicGo", "PicGo")}</option>
    </select>
</div>
<div class="fn__flex b3-label config__item${(window.sourceflow.config.editor.assetUploadProvider || "local") !== "picgo" ? " fn__none" : ""}" id="picgoServerURLWrap">
    <div class="fn__flex-1">
        ${editorText("picgoServerURL", "PicGo server URL")}
        <div class="b3-label__text">${editorText("picgoServerURLTip", "Enter the PicGo Server address.")}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="picgoServerURL" value="${window.sourceflow.config.editor.picgoServerURL || "http://127.0.0.1:36677/upload"}"/>
</div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.embedBlockBreadcrumb}
        <div class="b3-label__text">${window.sourceflow.languages.embedBlockBreadcrumbTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="embedBlockBreadcrumb" type="checkbox"${window.sourceflow.config.editor.embedBlockBreadcrumb ? " checked" : ""}/>
</label>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.headingEmbedMode}
        <div class="b3-label__text">${window.sourceflow.languages.headingEmbedModeTip}</div>
    </div>
    <span class="fn__space"></span>
    <select class="b3-select fn__flex-center fn__size200" id="headingEmbedMode">
      <option value="0" ${window.sourceflow.config.editor.headingEmbedMode === 0 ? "selected" : ""}>${window.sourceflow.languages.showHeadingWithBlocks}</option>
      <option value="1" ${window.sourceflow.config.editor.headingEmbedMode === 1 ? "selected" : ""}>${window.sourceflow.languages.showHeadingOnlyTitle}</option>
      <option value="2" ${window.sourceflow.config.editor.headingEmbedMode === 2 ? "selected" : ""}>${window.sourceflow.languages.showHeadingOnlyBlocks}</option>
    </select>
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
<div class="b3-label">
    <label class="fn__flex">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.spellcheck}
            <div class="b3-label__text">${spellcheckTip}</div>
        </div>
        <span class="fn__space"></span>
        <input class="b3-switch fn__flex-center" id="spellcheck" type="checkbox"${window.sourceflow.config.editor.spellcheck ? " checked" : ""}/>
    </label>
    <div class="b3-chips fn__none" id="spellcheckLanguages"></div>
</div>
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
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.htmlPasteMode}
        <div class="b3-label__text">${window.sourceflow.languages.htmlPasteModeTip}</div>
    </div>
    <span class="fn__space"></span>
    <select class="b3-select fn__flex-center fn__size200" id="htmlPasteMode">
      <option value="smart" ${(window.sourceflow.config.editor.htmlPasteMode || "smart") === "smart" ? "selected" : ""}>${window.sourceflow.languages.htmlPasteModeSmart}</option>
      <option value="html" ${(window.sourceflow.config.editor.htmlPasteMode || "smart") === "html" ? "selected" : ""}>${window.sourceflow.languages.htmlPasteModeHTML}</option>
      <option value="image" ${(window.sourceflow.config.editor.htmlPasteMode || "smart") === "image" ? "selected" : ""}>${window.sourceflow.languages.htmlPasteModeImage}</option>
    </select>
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
    <div class="fn__block">
        ${window.sourceflow.languages.md9}
        <div class="b3-label__text">${window.sourceflow.languages.md36}</div>
        <div class="fn__hr"></div>
        <textarea class="b3-text-field fn__block" id="virtualBlockRefInclude">${window.sourceflow.config.editor.virtualBlockRefInclude}</textarea>
    </div>
</div>
<div class="b3-label">
    <div class="fn__block">
        ${window.sourceflow.languages.md35}
        <div class="b3-label__text">${window.sourceflow.languages.md36}</div>
        <div class="b3-label__text">${window.sourceflow.languages.md41}</div>
        <div class="fn__hr"></div>
        <textarea class="b3-text-field fn__block" id="virtualBlockRefExclude">${window.sourceflow.config.editor.virtualBlockRefExclude}</textarea>
    </div>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md39}
        <div class="b3-label__text">${window.sourceflow.languages.md40}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="plantUMLServePath" value="${window.sourceflow.config.editor.plantUMLServePath}"/>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.dynamicLoadBlocks}
        <div class="b3-label__text">${window.sourceflow.languages.dynamicLoadBlocksTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="dynamicLoadBlocks" type="number" min="48" value="${window.sourceflow.config.editor.dynamicLoadBlocks}"/>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md37}
        <div class="b3-label__text">${window.sourceflow.languages.md38}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="blockRefDynamicAnchorTextMaxLen" type="number" min="1" max="5120" value="${window.sourceflow.config.editor.blockRefDynamicAnchorTextMaxLen}"/>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.backlinkExpand}
        <div class="b3-label__text">${window.sourceflow.languages.backlinkExpandTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="backlinkExpandCount" type="number" min="0" max="512" value="${window.sourceflow.config.editor.backlinkExpandCount}"/>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.backmentionExpand}
        <div class="b3-label__text">${window.sourceflow.languages.backmentionExpandTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="backmentionExpandCount" type="number" min="-1" max="512" value="${window.sourceflow.config.editor.backmentionExpandCount}"/>
</div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.backlinkContainChildren}
        <div class="b3-label__text">${window.sourceflow.languages.backlinkContainChildrenTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="backlinkContainChildren" type="checkbox"${window.sourceflow.config.editor.backlinkContainChildren ? " checked" : ""}/>
</label>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.generateHistory}
        <div class="b3-label__text">${window.sourceflow.languages.generateHistoryInterval}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="generateHistoryInterval" type="number" min="0" max="120" value="${window.sourceflow.config.editor.generateHistoryInterval}"/>
</div>
<div class="b3-label">
    <div>
        ${window.sourceflow.languages.historyRetentionDaysTip}
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">${window.sourceflow.languages.clearHistory}</div>
        <span class="fn__space"></span>
        <button id="clearHistory" class="b3-button b3-button--outline fn__size200 fn__flex-center">
            <svg><use xlink:href="#iconTrashcan"></use></svg>${window.sourceflow.languages.purge}
        </button>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">${window.sourceflow.languages.historyRetentionDays}</div>
        <span class="fn__space"></span>
        <input class="b3-text-field fn__flex-center fn__size200" id="historyRetentionDays" type="number" min="1" max="3650" value="${window.sourceflow.config.editor.historyRetentionDays}"/>
    </div>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.floatWindowMode}
        <div class="b3-label__text">${window.sourceflow.languages.floatWindowModeTip}</div>
    </div>
    <span class="fn__space"></span>
    <select class="b3-select fn__flex-center fn__size200" id="floatWindowMode">
      <option value="0" ${window.sourceflow.config.editor.floatWindowMode === 0 ? "selected" : ""}>${window.sourceflow.languages.floatWindowMode0}</option>
      <option value="1" ${window.sourceflow.config.editor.floatWindowMode === 1 ? "selected" : ""}>${window.sourceflow.languages.floatWindowMode1.replace("${hotkey}", updateHotkeyTip("⌘"))}</option>
      <option value="2" ${window.sourceflow.config.editor.floatWindowMode === 2 ? "selected" : ""}>${window.sourceflow.languages.floatWindowMode2}</option>
    </select>
</div>
<div class="fn__flex b3-label config__item${window.sourceflow.config.editor.floatWindowMode !== 0 ? " fn__none" : ""}" id="floatWindowDelayWrap">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.floatWindowDelay}
        <div class="b3-label__text">${window.sourceflow.languages.floatWindowDelayTip}</div>
    </div>
    <span class="fn__space"></span>
    <div class="fn__size200 fn__flex-center fn__flex">
        <input class="b3-text-field fn__flex-1" id="floatWindowDelay" type="number" min="0" max="2000" value="${window.sourceflow.config.editor.floatWindowDelay}"/>
        <span class="fn__space"></span>
        <span class="ft__on-surface fn__flex-center">ms</span>
    </div>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.font}
        <div class="b3-label__text">${window.sourceflow.languages.font1}</div>
    </div>
    <span class="fn__space"></span>
    <input readonly="readonly" placeholder="${window.sourceflow.languages.default}" id="fontFamily" class="b3-text-field fn__flex-center fn__size200" style="font-family:'${window.sourceflow.config.editor.fontFamily}',var(--b3-font-family);" value="${window.sourceflow.config.editor.fontFamily}"/>
</div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fontSizeScrollZoom}
        <div class="b3-label__text">${window.sourceflow.languages.fontSizeScrollZoomTip.replace("Ctrl", updateHotkeyTip("⌘"))}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="fontSizeScrollZoom" type="checkbox"${window.sourceflow.config.editor.fontSizeScrollZoom ? " checked" : ""}/>
</label>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.fontSize}
        <div class="b3-label__text">${window.sourceflow.languages.fontSizeTip}</div>
    </div>
    <span class="fn__space"></span>
    <div class="b3-tooltips b3-tooltips__n fn__flex-center" aria-label="${window.sourceflow.config.editor.fontSize}">   
        <input class="b3-slider fn__size200" id="fontSize" max="72" min="9" step="1" type="range" value="${window.sourceflow.config.editor.fontSize}">
    </div>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.md29}
        <div class="b3-label__text">${window.sourceflow.languages.md30}</div>
    </div>
    <span class="fn__space"></span>
    <div class="b3-tooltips b3-tooltips__n fn__flex-center" aria-label="${window.sourceflow.config.editor.codeTabSpaces}">   
        <input class="b3-slider fn__size200" id="codeTabSpaces" max="8" min="0" step="2" type="range" value="${window.sourceflow.config.editor.codeTabSpaces}">
    </div>
</div>
<div class="b3-label">
    <div class="fn__block">
        ${window.sourceflow.languages.katexMacros}
        <div class="b3-label__text">${window.sourceflow.languages.katexMacrosTip}</div>
        <div class="fn__hr"></div>
        <textarea class="b3-text-field fn__block" id="katexMacros" spellcheck="false">${window.sourceflow.config.editor.katexMacros}</textarea>
    </div>
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
</label>`;
    },
    bindEvent: async () => {
        /// #if !BROWSER
        const languages: string[] = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
            cmd: "availableSpellCheckerLanguages",
        });
        let spellcheckLanguagesHTML = "";
        languages.forEach(item => {
            spellcheckLanguagesHTML += `<div class="fn__pointer b3-chip b3-chip--middle${window.sourceflow.config.editor.spellcheckLanguages.includes(item) ? " b3-chip--current" : ""}">${item}</div>`;
        });
        const spellcheckLanguagesElement = editor.element.querySelector("#spellcheckLanguages");
        spellcheckLanguagesElement.innerHTML = spellcheckLanguagesHTML;
        spellcheckLanguagesElement.addEventListener("click", (event) => {
            const target = event.target as Element;
            if (target.classList.contains("b3-chip")) {
                target.classList.toggle("b3-chip--current");
                ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
                    cmd: "setSpellCheckerLanguages",
                    languages: Array.from(spellcheckLanguagesElement.querySelectorAll(".b3-chip--current")).map(item => item.textContent)
                });
                setEditor();
            }
        });
        if (window.sourceflow.config.editor.spellcheck) {
            spellcheckLanguagesElement.classList.remove("fn__none");
        }
        /// #endif

        const fontFamilyElement = editor.element.querySelector("#fontFamily") as HTMLSelectElement;
        fontFamilyElement.addEventListener("click", () => {
            fetchPost("/api/system/getSysFonts", {}, (response) => {
                const fontMenu = new Menu();
                fontMenu.addItem({
                    iconHTML: "",
                    checked: window.sourceflow.config.editor.fontFamily === "",
                    label: `<div style='var(--b3-font-family);'>${window.sourceflow.languages.default}</div>`,
                    click: () => {
                        if ("" === window.sourceflow.config.editor.fontFamily) {
                            return;
                        }
                        fontFamilyElement.value = "";
                        fontFamilyElement.style.fontFamily = "";
                        setEditor();
                    }
                });
                response.data.forEach((item: string) => {
                    fontMenu.addItem({
                        iconHTML: "",
                        checked: window.sourceflow.config.editor.fontFamily === item,
                        label: `<div style='font-family:"${item}",var(--b3-font-family);'>${item}</div>`,
                        click: () => {
                            if (item === window.sourceflow.config.editor.fontFamily) {
                                return;
                            }
                            fontFamilyElement.value = item;
                            fontFamilyElement.style.fontFamily = item + ",var(--b3-font-family)";
                            setEditor();
                        }
                    });
                });
                const rect = fontFamilyElement.getBoundingClientRect();
                fontMenu.open({
                    x: rect.left,
                    y: rect.bottom
                });
            });
        });

        editor.element.querySelector("#clearHistory").addEventListener("click", () => {
            confirmDialog(window.sourceflow.languages.clearHistory, window.sourceflow.languages.confirmClearHistory, () => {
                fetchPost("/api/history/clearWorkspaceHistory", {});
            });
        });

        const setEditor = () => {
            let dynamicLoadBlocks = parseInt((editor.element.querySelector("#dynamicLoadBlocks") as HTMLInputElement).value);
            if (48 > dynamicLoadBlocks) {
                dynamicLoadBlocks = 48;
                (editor.element.querySelector("#dynamicLoadBlocks") as HTMLInputElement).value = "48";
            }

            const floatWindowDelayElement = editor.element.querySelector("#floatWindowDelay") as HTMLInputElement;
            const floatWindowMode = parseInt((editor.element.querySelector("#floatWindowMode") as HTMLSelectElement).value);
            editor.element.querySelector("#floatWindowDelayWrap").classList.toggle("fn__none", floatWindowMode !== 0);
            const assetUploadProvider = (editor.element.querySelector("#assetUploadProvider") as HTMLSelectElement).value;
            editor.element.querySelector("#picgoServerURLWrap").classList.toggle("fn__none", assetUploadProvider !== "picgo");

            let floatWindowDelay = parseInt(floatWindowDelayElement.value);
            if (isNaN(floatWindowDelay)) {
                floatWindowDelay = 620;
            } else if (floatWindowDelay < 0) {
                floatWindowDelay = 0;
            } else if (floatWindowDelay > 2000) {
                floatWindowDelay = 2000;
            }
            floatWindowDelayElement.value = floatWindowDelay.toString();

            fetchPost("/api/setting/setEditor", {
                fullWidth: (editor.element.querySelector("#fullWidth") as HTMLInputElement).checked,
                markdown: {
                    inlineAsterisk: (editor.element.querySelector("#editorMarkdownInlineAsterisk") as HTMLInputElement).checked,
                    inlineUnderscore: (editor.element.querySelector("#editorMarkdownInlineUnderscore") as HTMLInputElement).checked,
                    inlineSup: (editor.element.querySelector("#editorMarkdownInlineSup") as HTMLInputElement).checked,
                    inlineSub: (editor.element.querySelector("#editorMarkdownInlineSub") as HTMLInputElement).checked,
                    inlineTag: (editor.element.querySelector("#editorMarkdownInlineTag") as HTMLInputElement).checked,
                    inlineMath: (editor.element.querySelector("#editorMarkdownInlineMath") as HTMLInputElement).checked,
                    inlineStrikethrough: (editor.element.querySelector("#editorMarkdownInlineStrikethrough") as HTMLInputElement).checked,
                    inlineMark: (editor.element.querySelector("#editorMarkdownInlineMark") as HTMLInputElement).checked
                },
                allowSVGScript: (editor.element.querySelector("#allowSVGScript") as HTMLInputElement).checked,
                allowHTMLBLockScript: (editor.element.querySelector("#allowHTMLBLockScript") as HTMLInputElement).checked,
                justify: (editor.element.querySelector("#justify") as HTMLInputElement).checked,
                rtl: (editor.element.querySelector("#rtl") as HTMLInputElement).checked,
                readOnly: (editor.element.querySelector("#readOnly") as HTMLInputElement).checked,
                displayBookmarkIcon: (editor.element.querySelector("#displayBookmarkIcon") as HTMLInputElement).checked,
                displayBlockLineNumber: (editor.element.querySelector("#displayBlockLineNumber") as HTMLInputElement).checked,
                displayHeadingLevel: (editor.element.querySelector("#displayHeadingLevel") as HTMLInputElement).checked,
                alwaysShowGutter: (editor.element.querySelector("#alwaysShowGutter") as HTMLInputElement).checked,
                displayNetImgMark: (editor.element.querySelector("#displayNetImgMark") as HTMLInputElement).checked,
                assetUploadProvider,
                picgoServerURL: (editor.element.querySelector("#picgoServerURL") as HTMLInputElement).value.trim(),
                codeSyntaxHighlightLineNum: (editor.element.querySelector("#codeSyntaxHighlightLineNum") as HTMLInputElement).checked,
                embedBlockBreadcrumb: (editor.element.querySelector("#embedBlockBreadcrumb") as HTMLInputElement).checked,
                headingEmbedMode: parseInt((editor.element.querySelector("#headingEmbedMode") as HTMLSelectElement).value),
                listLogicalOutdent: (editor.element.querySelector("#listLogicalOutdent") as HTMLInputElement).checked,
                listItemDotNumberClickFocus: (editor.element.querySelector("#listItemDotNumberClickFocus") as HTMLInputElement).checked,
                spellcheck: (editor.element.querySelector("#spellcheck") as HTMLInputElement).checked,
                /// #if !BROWSER
                spellcheckLanguages: Array.from(spellcheckLanguagesElement.querySelectorAll(".b3-chip--current")).map(item => item.textContent),
                /// #else
                // @ts-ignore
                spellcheckLanguages: window.sourceflow.config.editor.spellcheckLanguages,
                /// #endif
                onlySearchForDoc: (editor.element.querySelector("#onlySearchForDoc") as HTMLInputElement).checked,
                pasteURLAutoConvert: (editor.element.querySelector("#pasteURLAutoConvert") as HTMLInputElement).checked,
                htmlPasteMode: (editor.element.querySelector("#htmlPasteMode") as HTMLSelectElement).value,
                floatWindowMode,
                floatWindowDelay,
                plantUMLServePath: (editor.element.querySelector("#plantUMLServePath") as HTMLInputElement).value,
                katexMacros: (editor.element.querySelector("#katexMacros") as HTMLTextAreaElement).value,
                codeLineWrap: (editor.element.querySelector("#codeLineWrap") as HTMLInputElement).checked,
                virtualBlockRef: (editor.element.querySelector("#virtualBlockRef") as HTMLInputElement).checked,
                virtualBlockRefInclude: (editor.element.querySelector("#virtualBlockRefInclude") as HTMLTextAreaElement).value,
                virtualBlockRefExclude: (editor.element.querySelector("#virtualBlockRefExclude") as HTMLTextAreaElement).value,
                blockRefDynamicAnchorTextMaxLen: parseInt((editor.element.querySelector("#blockRefDynamicAnchorTextMaxLen") as HTMLInputElement).value),
                backlinkExpandCount: parseInt((editor.element.querySelector("#backlinkExpandCount") as HTMLInputElement).value),
                backmentionExpandCount: parseInt((editor.element.querySelector("#backmentionExpandCount") as HTMLInputElement).value),
                backlinkContainChildren: (editor.element.querySelector("#backlinkContainChildren") as HTMLInputElement).checked,
                dynamicLoadBlocks: dynamicLoadBlocks,
                codeLigatures: (editor.element.querySelector("#codeLigatures") as HTMLInputElement).checked,
                codeTabSpaces: parseInt((editor.element.querySelector("#codeTabSpaces") as HTMLInputElement).value),
                fontSize: parseInt((editor.element.querySelector("#fontSize") as HTMLInputElement).value),
                fontSizeScrollZoom: (editor.element.querySelector("#fontSizeScrollZoom") as HTMLInputElement).checked,
                generateHistoryInterval: parseInt((editor.element.querySelector("#generateHistoryInterval") as HTMLInputElement).value),
                historyRetentionDays: parseInt((editor.element.querySelector("#historyRetentionDays") as HTMLInputElement).value),
                fontFamily: fontFamilyElement.value,
                emoji: window.sourceflow.config.editor.emoji
            }, response => {
                editor._onSetEditor(response.data);
            });
        };
        editor.element.querySelectorAll("input.b3-switch, select.b3-select, input.b3-slider").forEach((item) => {
            item.addEventListener("change", () => {
                setEditor();
                /// #if !BROWSER
                if (item.id === "spellcheck") {
                    spellcheckLanguagesElement.classList.toggle("fn__none");
                }
                /// #endif
            });
        });
        editor.element.querySelectorAll("textarea.b3-text-field, input.b3-text-field, input.b3-slider").forEach((item) => {
            if (!item.getAttribute("readonly")) {
                item.addEventListener("blur", () => {
                    setEditor();
                });
            }
        });
        editor.element.querySelectorAll("input.b3-slider").forEach((item) => {
            item.addEventListener("input", (event) => {
                const target = event.target as HTMLInputElement;
                target.parentElement.setAttribute("aria-label", target.value);
            });
        });
    },
    _onSetEditor: (editorData: Config.IEditor) => {
        const changeReadonly = editorData.readOnly !== window.sourceflow.config.editor.readOnly;
        if (changeReadonly) {
            setReadOnly(editorData.readOnly);
        }
        window.sourceflow.config.editor = editorData;
        getAllModels().editor.forEach((item) => {
            reloadProtyle(item.editor.protyle, false);
            let isFullWidth = getFullWidthAttr(item.editor.protyle.wysiwyg.element);
            if (!isFullWidth) {
                isFullWidth = window.sourceflow.config.editor.fullWidth ? "true" : "false";
            }
            if (isFullWidth === "true" && item.editor.protyle.contentElement.getAttribute("data-fullwidth") === "true") {
                return;
            }
            resize(item.editor.protyle);
            if (isFullWidth === "true") {
                item.editor.protyle.contentElement.setAttribute("data-fullwidth", "true");
            } else {
                item.editor.protyle.contentElement.removeAttribute("data-fullwidth");
            }
        });

        setInlineStyle();
    }
};
