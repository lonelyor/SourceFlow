import {Constants} from "../../constants";
import {setAccessAuthCode} from "../../config/util/about";
import {Dialog} from "../../dialog";
import {fetchPost} from "../../util/fetch";
import {confirmDialog} from "../../dialog/confirmDialog";
import {showMessage} from "../../dialog/message";
import {
    isInMobileApp,
    isIPad,
    openByMobile,
    writeText
} from "../../protyle/util/compatibility";
import {exitSourceFlow, processSync} from "../../dialog/processSystem";
import {pathPosix} from "../../util/pathName";
import {openModel} from "../menu/model";
import {setKey} from "../../sync/syncGuide";
import {isBrowser} from "../../util/functions";
import {hasClosestByClassName} from "../../protyle/util/hasClosest";

export const initAbout = () => {
    openModel({
        title: window.sourceflow.languages.about,
        icon: "iconInfo",
        html: `<div>
<div class="b3-label${window.sourceflow.config.readonly ? " fn__none" : ""}">
    <label class="fn__flex">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.about11}
            <div class="b3-label__text">${window.sourceflow.languages.about12}</div>
        </div>
        <div class="fn__space"></div>
        <input class="b3-switch fn__flex-center" id="networkServe" type="checkbox"${window.sourceflow.config.system.networkServe ? " checked" : ""}>
    </label>
    <label class="b3-label fn__flex${window.sourceflow.config.system.networkServe ? "" : " fn__none"}${(window.sourceflow.config.system.networkServeTLS && window.sourceflow.config.system.networkServe) ? "" : " b3-label--noborder"}">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.networkServeTLS}
            <div class="b3-label__text">${window.sourceflow.languages.networkServeTLSTip}</div>
            <div class="b3-label__text">${window.sourceflow.languages.networkServeTLSTip2}</div>
        </div>
        <div class="fn__space"></div>
        <input class="b3-switch fn__flex-center" id="networkServeTLS" type="checkbox"${window.sourceflow.config.system.networkServeTLS ? " checked" : ""}${!window.sourceflow.config.system.networkServe ? " disabled" : ""}>
    </label>
    <div class="b3-label${(window.sourceflow.config.system.networkServeTLS && window.sourceflow.config.system.networkServe) ? "" : " fn__none"}">
        ${window.sourceflow.languages.exportCACert}
        <div class="fn__hr"></div>
        <button class="b3-button b3-button--outline fn__block" id="exportCACert">
            <svg><use xlink:href="#iconUpload"></use></svg>${window.sourceflow.languages.export}
        </button>
        <div class="b3-label__text">${window.sourceflow.languages.exportCACertTip}</div>
    </div>
    <div class="b3-label${(window.sourceflow.config.system.networkServeTLS && window.sourceflow.config.system.networkServe) ? "" : " fn__none"}">
        ${window.sourceflow.languages.exportCABundle}
        <div class="fn__hr"></div>
        <button class="b3-button b3-button--outline fn__block" id="exportCABundle">
            <svg><use xlink:href="#iconUpload"></use></svg>${window.sourceflow.languages.export}
        </button>
        <div class="b3-label__text">${window.sourceflow.languages.exportCABundleTip}</div>
    </div>
    <div class="b3-label${(window.sourceflow.config.system.networkServeTLS && window.sourceflow.config.system.networkServe) ? "" : " fn__none"}">
        ${window.sourceflow.languages.importCABundle}
        <div class="fn__hr"></div>
        <button class="b3-button b3-button--outline fn__block" id="importCABundle">
            <svg><use xlink:href="#iconDownload"></use></svg>${window.sourceflow.languages.import}
        </button>
        <div class="b3-label__text">${window.sourceflow.languages.importCABundleTip}</div>
    </div>
</div>
<div class="b3-label">
        ${window.sourceflow.languages.about2}
        <div class="fn__hr"></div>
        <a target="_blank" href="${"http://127.0.0.1:" + location.port}?openExternal" class="b3-button b3-button--outline fn__block">
            <svg><use xlink:href="#iconLink"></use></svg>${window.sourceflow.languages.about4}
        </a>
        <div class="b3-label__text">${window.sourceflow.languages.about3.replace("${port}", location.port)}</div>
        <div class="fn__hr"></div>
        ${(() => {
            const serverAddrs: string[] = [];
            for (const serverAddr of window.sourceflow.config.serverAddrs) {
                if (!serverAddr.trim()) {
                    break;
                }
                serverAddrs.push(`<code class="fn__code">${serverAddr}</code>`);
            }
            return `<div class="b3-label__text">${serverAddrs.join(" ")}</div>`;
        })()}
        <div class="fn__hr"></div>
        <div class="b3-label__text">${window.sourceflow.languages.about18}</div>
</div>
<div class="b3-label${(window.sourceflow.config.readonly || (isBrowser() && !isIPad() && !isInMobileApp())) ? " fn__none" : ""}">
    ${window.sourceflow.languages.about5}
    <div class="fn__hr"></div>
    <button class="b3-button b3-button--outline fn__block" id="authCode">
        <svg><use xlink:href="#iconLock"></use></svg>${window.sourceflow.languages.config}
    </button>
    <div class="b3-label__text">${window.sourceflow.languages.about6}</div>
</div>
<div class="b3-label${window.sourceflow.config.readonly ? " fn__none" : ""}">
    ${window.sourceflow.languages.dataRepoKey}
    <div class="fn__hr"></div>
    <div class="${window.sourceflow.config.repo.key ? "fn__none" : ""}">
        <button class="b3-button b3-button--outline fn__block" id="importKey">
            <svg><use xlink:href="#iconDownload"></use></svg>${window.sourceflow.languages.importKey}
        </button>
        <div class="fn__hr"></div>
        <button class="b3-button b3-button--outline fn__block" id="initKey">
            <svg><use xlink:href="#iconLock"></use></svg>${window.sourceflow.languages.genKey}
        </button>
        <div class="fn__hr"></div>
        <button class="b3-button b3-button--outline fn__block" id="initKeyByPW">
            <svg><use xlink:href="#iconKey"></use></svg>${window.sourceflow.languages.genKeyByPW}
        </button>
    </div>
    <div class="${window.sourceflow.config.repo.key ? "" : "fn__none"}">
        <button class="b3-button b3-button--outline fn__block" id="copyKey">
            <svg><use xlink:href="#iconCopy"></use></svg>${window.sourceflow.languages.copyKey}
        </button>
        <div class="fn__hr"></div>
        <button class="b3-button b3-button--outline fn__block" id="removeKey">
            <svg><use xlink:href="#iconUndo"></use></svg>${window.sourceflow.languages.resetRepo}
        </button>
    </div>
    <div class="b3-label__text">${window.sourceflow.languages.dataRepoKeyTip1}</div>
    <div class="b3-label__text ft__error">${window.sourceflow.languages.dataRepoKeyTip2}</div>
</div>
<div class="b3-label${window.sourceflow.config.readonly ? " fn__none" : ""}">
    ${window.sourceflow.languages.dataRepoPurge}
    <div class="fn__hr"></div>
    <button class="b3-button b3-button--outline fn__block" id="purgeRepo">
        <svg><use xlink:href="#iconTrashcan"></use></svg>${window.sourceflow.languages.purge}
    </button>
    <div class="b3-label__text">${window.sourceflow.languages.dataRepoPurgeTip}</div>
    <div class="fn__hr"></div>
    <input class="b3-text-field fn__block" style="padding-right: 64px;" id="indexRetentionDays" min="1" type="number" class="b3-text-field" value="${window.sourceflow.config.repo.indexRetentionDays}">
    <div class="b3-label__text">${window.sourceflow.languages.dataRepoAutoPurgeIndexRetentionDays}</div>
    <div class="fn__hr"></div>
    <input class="b3-text-field fn__block" style="padding-right: 64px;" id="retentionIndexesDaily" min="1" type="number" class="b3-text-field" value="${window.sourceflow.config.repo.retentionIndexesDaily}">
    <div class="b3-label__text">${window.sourceflow.languages.dataRepoAutoPurgeRetentionIndexesDaily}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.vacuumDataIndex}
    <div class="fn__hr"></div>
    <button class="b3-button b3-button--outline fn__block" id="vacuumDataIndex">
       <svg><use xlink:href="#iconRefresh"></use></svg>${window.sourceflow.languages.vacuumDataIndex}
    </button>
    <div class="b3-label__text">${window.sourceflow.languages.vacuumDataIndexTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.rebuildDataIndex}
    <div class="fn__hr"></div>
    <button class="b3-button b3-button--outline fn__block" id="rebuildDataIndex">
       <svg><use xlink:href="#iconRefresh"></use></svg>${window.sourceflow.languages.rebuildDataIndex}
    </button>
    <div class="b3-label__text">${window.sourceflow.languages.rebuildDataIndexTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.clearTempFiles}
    <div class="fn__hr"></div>
    <button class="b3-button b3-button--outline fn__block" id="clearTempFiles">
       <svg><use xlink:href="#iconTrashcan"></use></svg>${window.sourceflow.languages.clearTempFiles}
    </button>
    <div class="b3-label__text">${window.sourceflow.languages.clearTempFilesTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.systemLog}
    <div class="fn__hr"></div>
    <button class="b3-button b3-button--outline fn__block" id="exportLog">
       <svg><use xlink:href="#iconUpload"></use></svg>${window.sourceflow.languages.export}
    </button>
    <div class="b3-label__text">${window.sourceflow.languages.systemLogTip}</div>
</div>
<div class="b3-label${(!window.sourceflow.config.readonly && isInMobileApp()) ? "" : " fn__none"}">
    ${window.sourceflow.languages.workspaceList}
    <div class="fn__hr"></div>
    <button id="openWorkspace" class="b3-button b3-button--outline fn__block">${window.sourceflow.languages.openBy}...</button>
    <div class="fn__hr"></div>
    <ul id="workspaceDir" class="b3-list b3-list--background"></ul>
    <div class="fn__hr"></div>
    <button id="creatWorkspace" class="b3-button fn__block">${window.sourceflow.languages.new}</button>
</div>
<div class="b3-label${window.sourceflow.config.readonly ? " fn__none" : ""}">
    ${window.sourceflow.languages.about13}
    <div class="fn__hr"></div>
    <div class="b3-form__icon">
        <input class="b3-text-field fn__block" id="token" style="padding-right: 64px;" value="${window.sourceflow.config.api.token}">
        <button class="b3-button b3-button--text" id="tokenCopy" style="position: absolute;right: 0;height: 28px;">
            <svg><use xlink:href="#iconCopy"></use></svg>${window.sourceflow.languages.copy}
        </button>
    </div>
    <div class="b3-label__text" id="tokenTip">${window.sourceflow.languages.about14.replace("${token}", window.sourceflow.config.api.token)}</div>
</div>
<div class="b3-label">
    <div class="config-about__logo">
        <img src="/stage/icon.png">
        <span class="fn__space"></span>
        <div>
            <span>${window.sourceflow.languages.sourceflowNote || "SourceFlow"}</span>
            <span class="fn__space"></span>
            <span class="ft__on-surface">v${Constants.SOURCEFLOW_VERSION}</span>
            <br>
            <span class="ft__on-surface">${window.sourceflow.languages.slogan}</span>
        </div>
    </div>
    ${window.sourceflow.languages.about1}
</div>
</div>`,
        bindEvent(modelMainElement: HTMLElement) {
            const workspaceDirElement = modelMainElement.querySelector("#workspaceDir");
            genWorkspace(workspaceDirElement);
            const importKeyElement = modelMainElement.querySelector("#importKey");
            modelMainElement.firstElementChild.addEventListener("click", (event) => {
                let target = event.target as HTMLElement;
                while (target && (target !== modelMainElement)) {
                    if (target.id === "authCode") {
                        setAccessAuthCode();
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "importKey") {
                        const passwordDialog = new Dialog({
                            title: "🔑 " + window.sourceflow.languages.key,
                            content: `<div class="b3-dialog__content">
    <textarea spellcheck="false" style="resize: vertical;"  class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.keyPlaceholder}"></textarea>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
                            width: "92vw",
                        });
                        passwordDialog.element.setAttribute("data-key", Constants.DIALOG_PASSWORD);
                        const textAreaElement = passwordDialog.element.querySelector("textarea");
                        textAreaElement.focus();
                        const btnsElement = passwordDialog.element.querySelectorAll(".b3-button");
                        btnsElement[0].addEventListener("click", () => {
                            passwordDialog.destroy();
                        });
                        btnsElement[1].addEventListener("click", () => {
                            fetchPost("/api/repo/importRepoKey", {key: textAreaElement.value}, (response) => {
                                window.sourceflow.config.repo.key = response.data.key;
                                importKeyElement.parentElement.classList.add("fn__none");
                                importKeyElement.parentElement.nextElementSibling.classList.remove("fn__none");
                                passwordDialog.destroy();
                            });
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "initKey") {
                        confirmDialog("🔑 " + window.sourceflow.languages.genKey, window.sourceflow.languages.initRepoKeyTip, () => {
                            fetchPost("/api/repo/initRepoKey", {}, (response) => {
                                window.sourceflow.config.repo.key = response.data.key;
                                importKeyElement.parentElement.classList.add("fn__none");
                                importKeyElement.parentElement.nextElementSibling.classList.remove("fn__none");
                            });
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "initKeyByPW") {
                        setKey(false, () => {
                            importKeyElement.parentElement.classList.add("fn__none");
                            importKeyElement.parentElement.nextElementSibling.classList.remove("fn__none");
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "copyKey") {
                        showMessage(window.sourceflow.languages.copied);
                        writeText(window.sourceflow.config.repo.key);
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "removeKey") {
                        confirmDialog("⚠️ " + window.sourceflow.languages.resetRepo, window.sourceflow.languages.resetRepoTip, () => {
                            fetchPost("/api/repo/resetRepo", {}, () => {
                                window.sourceflow.config.repo.key = "";
                                window.sourceflow.config.sync.enabled = false;
                                processSync();
                                importKeyElement.parentElement.classList.remove("fn__none");
                                importKeyElement.parentElement.nextElementSibling.classList.add("fn__none");
                            });
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "purgeRepo") {
                        confirmDialog("♻️ " + window.sourceflow.languages.dataRepoPurge, window.sourceflow.languages.dataRepoPurgeConfirm, () => {
                            fetchPost("/api/repo/purgeRepo");
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "tokenCopy") {
                        showMessage(window.sourceflow.languages.copied);
                        writeText(window.sourceflow.config.api.token);
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "vacuumDataIndex") {
                        fetchPost("/api/system/vacuumDataIndex", {}, () => {
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "rebuildDataIndex") {
                        fetchPost("/api/system/rebuildDataIndex", {}, () => {
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "clearTempFiles") {
                        fetchPost("/api/system/clearTempFiles", {}, () => {
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "exportLog") {
                        fetchPost("/api/system/exportLog", {}, (response) => {
                            openByMobile(response.data.zip);
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "openWorkspace") {
                        fetchPost("/api/system/getMobileWorkspaces", {}, (response) => {
                            let selectHTML = "";
                            response.data.forEach((item: string, index: number) => {
                                selectHTML += `<option value="${item}"${index === 0 ? ' selected="selected"' : ""}>${pathPosix().basename(item)}</option>`;
                            });
                            const openWorkspaceDialog = new Dialog({
                                title: window.sourceflow.languages.openBy,
                                content: `<div class="b3-dialog__content">
    <select class="b3-text-field fn__block">${selectHTML}</select>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
                                width: "92vw",
                            });
                            openWorkspaceDialog.element.setAttribute("data-key", Constants.SOURCEFLOW_OPEN_WORKSPACE);
                            const btnsElement = openWorkspaceDialog.element.querySelectorAll(".b3-button");
                            btnsElement[0].addEventListener("click", () => {
                                openWorkspaceDialog.destroy();
                            });
                            btnsElement[1].addEventListener("click", () => {
                                const openPath = openWorkspaceDialog.element.querySelector("select").value;
                                if (openPath === window.sourceflow.config.system.workspaceDir) {
                                    openWorkspaceDialog.destroy();
                                    return;
                                }
                                confirmDialog(window.sourceflow.languages.confirm, `${pathPosix().basename(window.sourceflow.config.system.workspaceDir)} -> ${pathPosix().basename(openPath)}?`, () => {
                                    fetchPost("/api/system/setWorkspaceDir", {
                                        path: openPath
                                    }, () => {
                                        exitSourceFlow(false);
                                    });
                                });
                            });
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.id === "creatWorkspace") {
                        const createWorkspaceDialog = new Dialog({
                            title: window.sourceflow.languages.new,
                            content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block">
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
                            width: "92vw",
                        });
                        createWorkspaceDialog.element.setAttribute("data-key", Constants.DIALOG_CREATEWORKSPACE);
                        const inputElement = createWorkspaceDialog.element.querySelector("input");
                        inputElement.focus();
                        const btnsElement = createWorkspaceDialog.element.querySelectorAll(".b3-button");
                        btnsElement[0].addEventListener("click", () => {
                            createWorkspaceDialog.destroy();
                        });
                        btnsElement[1].addEventListener("click", () => {
                            fetchPost("/api/system/createWorkspaceDir", {
                                path: pathPosix().join(pathPosix().dirname(window.sourceflow.config.system.workspaceDir), inputElement.value)
                            }, () => {
                                genWorkspace(workspaceDirElement);
                                createWorkspaceDialog.destroy();
                            });
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.getAttribute("data-type") === "remove") {
                        const removePath = target.parentElement.getAttribute("data-path");
                        fetchPost("/api/system/removeWorkspaceDir", {path: removePath}, () => {
                            genWorkspace(workspaceDirElement);
                            confirmDialog(window.sourceflow.languages.deleteOpConfirm, window.sourceflow.languages.removeWorkspacePhysically.replace("${x}", removePath), () => {
                                fetchPost("/api/system/removeWorkspaceDirPhysically", {path: removePath});
                            }, undefined, true);
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.classList.contains("b3-list-item") && !target.classList.contains("b3-list-item--focus")) {
                        confirmDialog(window.sourceflow.languages.confirm, `${pathPosix().basename(window.sourceflow.config.system.workspaceDir)} -> ${pathPosix().basename(target.getAttribute("data-path"))}?`, () => {
                            fetchPost("/api/system/setWorkspaceDir", {
                                path: target.getAttribute("data-path")
                            }, () => {
                                exitSourceFlow(false);
                            });
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    }
                    target = target.parentElement;
                }
            });
            const networkServeElement = modelMainElement.querySelector("#networkServe") as HTMLInputElement;
            const networkServeTLSElement = modelMainElement.querySelector("#networkServeTLS") as HTMLInputElement;
            const networkServeContainElement = hasClosestByClassName(networkServeElement, "b3-label") as HTMLElement;
            networkServeElement.addEventListener("change", () => {
                networkServeTLSElement.disabled = !networkServeElement.checked;
                if (!networkServeElement.checked) {
                    networkServeTLSElement.checked = false;
                }
                Array.from(networkServeContainElement.children).forEach((item: HTMLElement, index) => {
                    if (index === 1) {
                        if (networkServeElement.checked) {
                            item.classList.remove("fn__none");
                        } else {
                            item.classList.add("fn__none");
                        }
                    } else if (index > 1) {
                        if (networkServeTLSElement.checked) {
                            item.classList.remove("fn__none");
                        } else {
                            item.classList.add("fn__none");
                        }
                    }
                });
                if (networkServeTLSElement.checked) {
                    networkServeTLSElement.parentElement.classList.remove("b3-label--noborder");
                } else {
                    networkServeTLSElement.parentElement.classList.add("b3-label--noborder");
                }
                fetchPost("/api/system/setNetworkServe", {networkServe: networkServeElement.checked}, () => {
                    exitSourceFlow();
                });
            });
            networkServeTLSElement.addEventListener("change", () => {
                Array.from(networkServeContainElement.children).forEach((item: HTMLElement, index) => {
                    if (index > 1) {
                        if (networkServeTLSElement.checked) {
                            item.classList.remove("fn__none");
                        } else {
                            item.classList.add("fn__none");
                        }
                    }
                });
                if (networkServeTLSElement.checked) {
                    networkServeTLSElement.parentElement.classList.remove("b3-label--noborder");
                } else {
                    networkServeTLSElement.parentElement.classList.add("b3-label--noborder");
                }
                fetchPost("/api/system/setNetworkServeTLS", {networkServeTLS: networkServeTLSElement.checked}, () => {
                    exitSourceFlow();
                });
            });
            modelMainElement.querySelector("#exportCACert")?.addEventListener("click", () => {
                fetchPost("/api/system/exportTLSCACert", {}, (response) => {
                    openByMobile(response.data.path);
                });
            });
            modelMainElement.querySelector("#exportCABundle")?.addEventListener("click", () => {
                fetchPost("/api/system/exportTLSCABundle", {}, (response) => {
                    openByMobile(response.data.path);
                });
            });
            modelMainElement.querySelector("#importCABundle")?.addEventListener("click", () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".zip";
                input.onchange = () => {
                    if (input.files && input.files[0]) {
                        const formData = new FormData();
                        formData.append("file", input.files[0]);
                        fetch("/api/system/importTLSCABundle", {
                            method: "POST",
                            body: formData,
                        }).then(res => res.json()).then((response) => {
                            if (response.code === 0) {
                                showMessage(window.sourceflow.languages.importCABundleSuccess);
                            } else {
                                showMessage(response.msg, 6000, "error");
                            }
                        });
                    }
                };
                input.click();
            });
            const tokenElement = modelMainElement.querySelector("#token") as HTMLInputElement;
            tokenElement.addEventListener("change", () => {
                fetchPost("/api/system/setAPIToken", {token: tokenElement.value}, () => {
                    window.sourceflow.config.api.token = tokenElement.value;
                    modelMainElement.querySelector("#tokenTip").innerHTML = window.sourceflow.languages.about14.replace("${token}", window.sourceflow.config.api.token);
                });
            });
            const indexRetentionDaysElement = modelMainElement.querySelector("#indexRetentionDays") as HTMLInputElement;
            indexRetentionDaysElement.addEventListener("change", () => {
                fetchPost("/api/repo/setRepoIndexRetentionDays", {days: parseInt(indexRetentionDaysElement.value)}, () => {
                    window.sourceflow.config.repo.indexRetentionDays = parseInt(indexRetentionDaysElement.value);
                });
            });
            const retentionIndexesDailyElement = modelMainElement.querySelector("#retentionIndexesDaily") as HTMLInputElement;
            retentionIndexesDailyElement.addEventListener("change", () => {
                fetchPost("/api/repo/setRetentionIndexesDaily", {indexes: parseInt(retentionIndexesDailyElement.value)}, () => {
                    window.sourceflow.config.repo.retentionIndexesDaily = parseInt(retentionIndexesDailyElement.value);
                });
            });
        }
    });
};

const genWorkspace = (workspaceDirElement: Element) => {
    fetchPost("/api/system/getWorkspaces", {}, (response) => {
        let html = "";
        response.data.forEach((item: IWorkspace) => {
            html += `<li data-path="${item.path}" class="b3-list-item b3-list-item--narrow${window.sourceflow.config.system.workspaceDir === item.path ? " b3-list-item--focus" : ""}">
    <span class="b3-list-item__text">${pathPosix().basename(item.path)}</span>
    <span data-type="remove" class="b3-list-item__action">
        <svg><use xlink:href="#iconMin"></use></svg>
    </span>
</li>`;
        });
        workspaceDirElement.innerHTML = html;
    });
};
