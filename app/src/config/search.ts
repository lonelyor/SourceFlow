import {Constants} from "../constants";
import {genItemPanel} from "./index";
import {keymap} from "./keymap";
import {App} from "../index";
import {isPhablet} from "../protyle/util/compatibility";

const getLang = (keys: string[]) => {
    const langArray: string[] = [];
    keys.forEach((key) => {
        langArray.push(window.sourceflow.languages[key]);
    });
    return langArray;
};

export const initConfigSearch = (element: HTMLElement, app: App) => {
    const configIndex = [
        // 编辑器
        getLang(["config", "fullWidth", "md7", "md8", "md37", "md38",
            "editor", "md2", "md3", "md12", "md16", "displayHeadingLevel", "displayHeadingLevelTip",
            "md27", "md28", "md29", "md30", "md31", "md32", "md33", "md34",
            "md39", "md40", "fontSizeTip", "fontSize", "font", "font1", "generateHistory", "generateHistoryInterval",
            "historyRetentionDays", "historyRetentionDaysTip", "clearHistory", "katexMacros", "katexMacrosTip",
            "editReadonly", "editReadonlyTip", "embedBlockBreadcrumb", "embedBlockBreadcrumbTip", "outlineOutdentTip",
            "outdent", "floatWindowMode", "floatWindowModeTip", "justify", "justifyTip", "rtl", "rtlTip", "spellcheck",
            "spellcheckTip", "backlinkExpand", "backlinkExpandTip", "backmentionExpand", "backmentionExpandTip",
            "onlySearchForDoc", "onlySearchForDocTip", "dynamicLoadBlocks", "dynamicLoadBlocksTip", "fontSizeScrollZoom", "fontSizeScrollZoomTip",
            "listItemDotNumberClickFocus", "listItemDotNumberClickFocusTip", "editorMarkdownInlineAsterisk", "editorMarkdownInlineUnderscore",
            "editorMarkdownInlineSup", "editorMarkdownInlineSupTip", "editorMarkdownInlineSub", "editorMarkdownInlineSubTip",
            "editorMarkdownInlineTag", "editorMarkdownInlineTagTip", "editorMarkdownInlineMath", "editorMarkdownInlineMathTip",
            "editorMarkdownInlineStrikethrough", "editorMarkdownInlineStrikethroughTip", "editorMarkdownInlineMark", "editorMarkdownInlineMarkTip",
            "allowHTMLBLockScript", "allowHTMLBLockScriptTip", "floatWindowDelay", "floatWindowDelayTip",
            "backlinkContainChildren", "backlinkContainChildrenTip", "allowSVGScript", "allowSVGScriptTip",
            "pasteURLAutoConvert", "pasteURLAutoConvertTip"
        ]),

        // 文档树
        getLang(["selectOpen", "tabLimit", "fileTree", "fileTree2", "fileTree3", "fileTree4", "fileTree5",
            "fileTree6", "fileTree7", "fileTree8", "fileTree9", "fileTree10", "fileTree12", "fileTree13", "fileTree15",
            "fileTree16", "fileTree17", "fileTree18", "fileTree19", "fileTree20", "fileTree21", "fileTree22", "fileTree23",
            "fileTree24", "fileTree25", "recentDocsMaxListCount", "recentDocsMaxListCountTip", "noSplitScreenWhenOpenTab",
            "noSplitScreenWhenOpenTabTip"]),

        // 闪卡
        getLang(["riffCard", "flashcardNewCardLimit", "flashcardNewCardLimitTip", "flashcardReviewCardLimit",
            "flashcardNewCardLimit", "flashcardReviewCardLimitTip", "flashcardMark", "flashcardMarkTip", "flashcardList",
            "flashcardSuperBlock", "flashcardHeading", "flashcardDeck", "flashcardDeckTip",
            "flashcardFSRSParamRequestRetention", "flashcardFSRSParamRequestRetentionTip",
            "flashcardFSRSParamMaximumInterval", "flashcardFSRSParamMaximumIntervalTip", "flashcardFSRSParamWeights",
            "flashcardFSRSParamWeightsTip", "reviewMode", "reviewModeTip"]),

        // AI（已移除遗留 api* 字段，它们在新版 ProfilesPanel 中无对应 UI）
        ["AI"].concat(getLang(["ai",
            "aiAssistant", "aiAskCurrentNote", "aiPinCurrentNoteTarget", "aiClearTargetNote", "aiAskCurrentBlock", "aiAnalyzeCurrentBlockContext", "aiAnalyzeCurrentBlockReferences", "aiReadCurrentNoteAssets", "aiSummarizeCurrentNote", "aiAnalyzeCurrentNoteLinks", "aiAnalyzeCurrentNoteOutline", "aiAnalyzeCurrentNoteHistory", "aiAnalyzeRestorePoints", "aiPolishCurrentNote", "aiExtractTasksCurrentNote", "aiCreateChildNoteCurrentNote", "aiContinueAfterCurrentBlock", "aiCreateProjectCurrentNote", "aiSummarizeWorkbench", "aiPlanWorkbench"])),

        // 资源
        getLang(["assets", "unreferencedAssets", "missingAssets"]),

        // 导出
        getLang(["paragraphBeginningSpace", "md4", "export", "export1", "export2", "export5", "export11",
            "export13", "export14", "export15", "export19", "export20", "ref", "blockEmbed", "export17", "export18",
            "export23", "export24", "export25", "export26", "export27", "export28", "export29", "removeAssetsID", "removeAssetsIDTip",
            "includeSubDocs", "includeSubDocsTip", "includeRelatedDocs", "includeRelatedDocsTip"]),

        // 收集
        getLang(["captureCenter", "captureCenterTip", "urlImport", "urlImportTip", "targetNotebook", "captureNotebookTip",
            "pathPrefix", "capturePathPrefixTip", "captureOpenAfterSave", "captureOpenAfterSaveTip"]),

        // 外观
        getLang(["language", "language1", "appearance", "appearance1", "appearance2", "appearance3", "appearance4",
            "appearance5", "appearance6", "appearance8", "appearance9", "appearance10", "appearance11", "appearance16",
            "appearance17", "appearance18", "resetLayout", "reset", "icon", "themeLight", "themeDark", "close", "themeOS", "theme",
            "theme2", "theme11", "theme12", "fileTreeAppearance", "fileTreeAppearanceTip", "fileTreeGuides", "fileTreeGuidesTip",
            "fileTreeDocCount", "fileTreeDocCountTip", "fileTreeTotalCount", "fileTreeTotalCountTip",
            "fileTreeDensity", "fileTreeDensityTip", "fileTreeDensityCompact", "fileTreeDensityDefault", "fileTreeDensityLoose",
            "fileTreeFontSize", "fileTreeFontSizeTip",
            "customEmoji", "customEmojiTip", "refresh"]),

        // 集市
        getLang(["bazaar", "theme", "template", "icon", "widget"]),

        // 搜索
        getLang(["search", "searchLimit", "searchLimit1", "memo", "name", "alias", "keywordsLimit",
            "doc", "headings", "list1", "listItem", "code", "math", "table", "quote", "superBlock", "paragraph",
            "indexAssetPath", "embedBlock", "database", "searchBackmention", "searchVirtualRef", "searchBlockAttr",
            "searchBlockType", "searchCaseSensitive"]),

        // 快捷键
        getLang(["keymap", "keymapTip2"].concat(Object.keys(Constants.SOURCEFLOW_KEYMAP.general))
            .concat(Object.keys(Constants.SOURCEFLOW_KEYMAP.editor.general))
            .concat(Object.keys(Constants.SOURCEFLOW_KEYMAP.editor.heading))
            .concat(Object.keys(Constants.SOURCEFLOW_KEYMAP.editor.insert))
            .concat(Object.keys(Constants.SOURCEFLOW_KEYMAP.editor.list))
            .concat(Object.keys(Constants.SOURCEFLOW_KEYMAP.editor.table))),

        // 同步与恢复备份
        getLang(["sync", "backup", "upload", "download", "generateConflictDoc", "generateConflictDocTip",
            "syncProvider", "syncProviderTip", "openSyncTip1", "openSyncTip2", "localFileSystem", "config"]),

        // 关于
        getLang(["autoLaunch", "autoLaunchTip", "about", "about1", "about2", "about3", "about4", "about5", "about6",
            "about7", "about8", "about11", "about12", "about13", "about14", "about17", "config",
            "dataRepoKey", "dataRepoKeyTip1", "dataRepoKeyTip2", "slogan", "currentVer",
            "systemLog", "importKey", "genKey", "genKeyByPW", "copyKey", "resetRepo", "systemLogTip", "export",
            "downloadLatestVer", "safeQuit", "directConnection", "sourceflowNote", "key", "password", "copied", "resetRepoTip",
            "networkProxy", "keyPlaceholder", "initRepoKeyTip",
            "dataRepoPurge", "dataRepoPurgeTip", "dataRepoAutoPurgeIndexRetentionDays", "dataRepoAutoPurgeRetentionIndexesDaily",
            "vacuumDataIndex", "vacuumDataIndexTip", "clearTempFiles", "clearTempFilesTip", "rebuildDataIndex", "rebuildDataIndexTip"]
            .concat(window.sourceflow.config.system.isPortable ? [] : ["autoDownloadUpdatePkg", "autoDownloadUpdatePkgTip"])),
    ];
    const inputElement = element.querySelector(".b3-form__icon input") as HTMLInputElement;
    if (!isPhablet()) {
        inputElement.focus();
    } else {
        (document.activeElement as HTMLElement)?.blur();
    }
    const updateTab = () => {
        const indexList: number[] = [];
        const inputValue = inputElement.value;
        configIndex.map((item, index) => {
            item.map((subItem) => {
                if (!subItem) {
                    console.warn("Search config miss language: ", item, index);
                }
                if (subItem && (inputValue.toLowerCase().indexOf(subItem.toLowerCase()) > -1 || subItem.toLowerCase().indexOf(inputValue.toLowerCase()) > -1)) {
                    indexList.push(index);
                }
            });
        });

        let currentTabElement: HTMLElement;
        element.querySelectorAll(".b3-tab-bar li").forEach((item: HTMLElement, index) => {
            if (indexList.includes(index)) {
                if (!currentTabElement) {
                    currentTabElement = item;
                }
                const type = item.getAttribute("data-name");
                item.style.display = "";
                if (["image", "bazaar"].includes(type)) {
                    return;
                }
                // 右侧面板过滤
                const panelElement = element.querySelector(`.config__tab-container[data-name="${type}"]`);
                if (panelElement.innerHTML === "") {
                    genItemPanel(type, panelElement, app);
                }
                if (type === "keymap") {
                    const searchElement = keymap.element.querySelector("#keymapInput") as HTMLInputElement;
                    const searchKeymapElement = keymap.element.querySelector("#searchByKey") as HTMLInputElement;
                    searchElement.value = inputValue;
                    searchKeymapElement.value = "";
                    keymap.search(searchElement.value, searchKeymapElement.value);
                } else if (type === "search") {
                    panelElement.querySelectorAll(`.config__tab-container[data-name="${type}"] .b3-label`).forEach((itemElement: HTMLElement) => {
                        let showItemElement = false;
                        let showItemParent = false;
                        const itemText = itemElement.firstElementChild.textContent.toLowerCase();
                        if (itemText.indexOf(inputValue.toLowerCase()) > -1 || inputValue.toLowerCase().indexOf(itemText) > -1) {
                            showItemParent = true;
                        }
                        itemElement.querySelectorAll(".fn__flex-1").forEach(labelItem => {
                            if (!labelItem.parentElement.classList.contains("fn__none")) {
                                const text = labelItem.textContent.toLowerCase();
                                if (text.indexOf(inputValue.toLowerCase()) > -1 || inputValue.toLowerCase().indexOf(text) > -1 || showItemParent) {
                                    labelItem.parentElement.style.display = "";
                                    showItemElement = true;
                                } else {
                                    labelItem.parentElement.style.display = "none";
                                }
                            }
                        });
                        if (!itemElement.classList.contains("fn__none")) {
                            if (showItemElement) {
                                itemElement.style.display = "";
                            } else {
                                itemElement.style.display = "none";
                            }
                        }
                    });
                } else {
                    panelElement.querySelectorAll(`.config__tab-container[data-name="${type}"] .b3-label`).forEach((itemElement: HTMLElement) => {
                        if (!itemElement.classList.contains("fn__none")) {
                            const text = itemElement.textContent.toLowerCase();
                            if (text.indexOf(inputValue.toLowerCase()) > -1 || inputValue.toLowerCase().indexOf(text) > -1) {
                                itemElement.style.display = "";
                            } else {
                                itemElement.style.display = "none";
                            }
                        }
                    });
                }
            } else {
                item.style.display = "none";
            }
        });

        const tabPanelElements = element.querySelectorAll(".config__tab-container");
        if (currentTabElement) {
            currentTabElement.click();
        } else {
            tabPanelElements.forEach((item) => {
                item.classList.add("fn__none");
            });
        }

        inputElement.focus();
    };

    inputElement.addEventListener("compositionend", () => {
        updateTab();
    });
    inputElement.addEventListener("input", (event: InputEvent) => {
        if (event.isComposing) {
            return;
        }
        updateTab();
    });
};
