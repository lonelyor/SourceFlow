import {Constants} from "../constants";
/// #if !BROWSER
import {ipcRenderer, shell} from "electron";
/// #endif
import {isBrowser} from "../util/functions";
import {fetchPost} from "../util/fetch";
import {setAccessAuthCode} from "./util/about";
import {exportLayout} from "../layout/util";
import {exitSourceFlow, processSync} from "../dialog/processSystem";
import {isInMobileApp, isIPad, isMac, openByMobile, writeText} from "../protyle/util/compatibility";
import {showMessage} from "../dialog/message";
import {Dialog} from "../dialog";
import {confirmDialog} from "../dialog/confirmDialog";
import {setKey} from "../sync/syncGuide";
import {originalPath, useShell} from "../util/pathName";
import {hasClosestByClassName} from "../protyle/util/hasClosest";

export const about = {
    element: undefined as Element,
    genHTML: () => {
        const portableRoot = window.sourceflow.config.system.isPortable ? originalPath().dirname(window.sourceflow.config.system.confDir) : "";
        const backupProfilePath = window.sourceflow.config.system.isPortable ? originalPath().join(window.sourceflow.config.system.confDir, "backup-profile.json") : "";
        const versionTip = window.sourceflow.config.system.isPortable ?
            "会通过 GitHub Release 提示新版本；便携版不会自动替换程序文件，请下载新的 portable 包后手动替换。 GitHub Releases are checked for updates; portable edition requires manually replacing program files." :
            "会通过 GitHub Release 检查更新；安装版可下载并校验更新安装包，退出时再确认是否安装。 GitHub Releases are checked for updates; installer packages are verified before installation.";
        const protocolRegistered = !!window.sourceflow.config.system.protocolClientRegistered;
        const portableHTML = !isBrowser() && window.sourceflow.config.system.isPortable ? `<div class="b3-label">
    <div>
        Portable
        <div class="b3-label__text">迁移或备份前，请先完全退出源流。</div>
        <div class="b3-label__text">请一起复制程序文件、workspace、userdata；升级便携版时保留 workspace、userdata，替换程序文件即可。</div>
        ${window.sourceflow.config.system.os === "windows" ? `<div class="b3-label__text">复制到新的 Windows 机器后，首次启动会自动注册 sf:// 协议。</div>` : ""}
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
            <div>
                <div>便携根目录 Portable Root</div>
                <div class="b3-label__text"><code class="fn__code">${portableRoot}</code></div>
            </div>
        </div>
        <span class="fn__space"></span>
        <button id="openPortableRoot" class="b3-button b3-button--outline fn__size200 fn__flex-center">
            <svg><use xlink:href="#iconFolder"></use></svg>${window.sourceflow.languages.showInFolder}
        </button>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
            <div>
                <div>工作空间 Workspace</div>
                <div class="b3-label__text"><code class="fn__code">${window.sourceflow.config.system.workspaceDir}</code></div>
            </div>
        </div>
        <span class="fn__space"></span>
        <button id="openPortableWorkspace" class="b3-button b3-button--outline fn__size200 fn__flex-center">
            <svg><use xlink:href="#iconFolder"></use></svg>${window.sourceflow.languages.showInFolder}
        </button>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
            <div>
                <div>用户数据 Userdata</div>
                <div class="b3-label__text"><code class="fn__code">${window.sourceflow.config.system.confDir}</code></div>
            </div>
        </div>
        <span class="fn__space"></span>
        <button id="openPortableUserdata" class="b3-button b3-button--outline fn__size200 fn__flex-center">
            <svg><use xlink:href="#iconFolder"></use></svg>${window.sourceflow.languages.showInFolder}
        </button>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
            <div>
                <div>恢复描述文件 Backup Profile</div>
                <div class="b3-label__text">启用并配置自托管同步后，会自动生成并持续更新该文件。</div>
                <div class="b3-label__text"><code class="fn__code">${backupProfilePath}</code></div>
                <div class="b3-label__text">该文件包含 repo key、同步目录和同步凭据。repo key 用于打开加密的数据仓库；如果只剩远端备份而该文件丢失，恢复可能失败。</div>
                <div class="b3-label__text"><span class="ft__error">请单独备份并妥善保存此文件。</span></div>
            </div>
        </div>
        <span class="fn__space"></span>
        <button id="copyBackupProfilePath" class="b3-button b3-button--outline fn__size200 fn__flex-center">
            <svg><use xlink:href="#iconCopy"></use></svg>${window.sourceflow.languages.copy}
        </button>
    </div>
    ${window.sourceflow.config.system.os === "windows" ? `<div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">
            <div>
                <div>sf:// 协议</div>
                <div class="b3-label__text" id="protocolClientStatus">${protocolRegistered ? "当前机器已注册，可从浏览器/系统外部直接唤起。" : "默认会自动注册；如果当前未注册，可点右侧重新注册。"}</div>
                <div class="b3-label__text">该注册只对当前 Windows 生效，复制到其他机器后首次运行会重新注册，也可手动重新注册。</div>
            </div>
        </div>
        <span class="fn__space"></span>
        <button id="toggleProtocolClient" class="b3-button b3-button--outline fn__size200 fn__flex-center">
            <svg><use xlink:href="#iconLink"></use></svg>${protocolRegistered ? "取消注册" : "重新注册"}
        </button>
    </div>` : ""}
</div>` : "";
        const versionHTML = `<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.currentVer} v${Constants.SOURCEFLOW_VERSION}
        <span id="isInsider"></span>
        <div class="b3-label__text">${window.sourceflow.config.system.isMicrosoftStore ? window.sourceflow.languages.isMsStoreVerTip : versionTip}</div>
    </div>
</div>`;
        const appName = window.sourceflow.languages.sourceflowNote || "SourceFlow";
        return `<div class="fn__flex b3-label config__item${isBrowser() || window.sourceflow.config.system.isPortable || window.sourceflow.config.system.isMicrosoftStore || "std" !== window.sourceflow.config.system.container || "linux" === window.sourceflow.config.system.os ? " fn__none" : ""}">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.autoLaunch}
        <div class="b3-label__text">${window.sourceflow.languages.autoLaunchTip}</div>
    </div>
    <span class="fn__space"></span>
    <select class="b3-select fn__flex-center fn__size200" id="autoLaunch">
      <option value="0" ${window.sourceflow.config.system.autoLaunch2 === 0 ? "selected" : ""}>${window.sourceflow.languages.autoLaunchMode0}</option>
      <option value="1" ${window.sourceflow.config.system.autoLaunch2 === 1 ? "selected" : ""}>${window.sourceflow.languages.autoLaunchMode1}</option>
      ${isMac() ? "" : `<option value="2" ${window.sourceflow.config.system.autoLaunch2 === 2 ? "selected" : ""}>${window.sourceflow.languages.autoLaunchMode2}</option>`}
    </select>    
</div>
<label class="fn__flex b3-label${isBrowser() || window.sourceflow.config.system.isPortable || window.sourceflow.config.system.isMicrosoftStore || window.sourceflow.config.system.container !== "std" || "linux" === window.sourceflow.config.system.os ? " fn__none" : ""}">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.autoDownloadUpdatePkg}
        <div class="b3-label__text">${window.sourceflow.languages.autoDownloadUpdatePkgTip}</div>
    </div>
    <div class="fn__space"></div>
    <input class="b3-switch fn__flex-center" id="downloadInstallPkg" type="checkbox"${window.sourceflow.config.system.downloadInstallPkg ? " checked" : ""}>
</label>
<div class="b3-label${isBrowser() ? " fn__none" : ""}">
    <label class="fn__flex config__item">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.about11}
            <div class="b3-label__text">${window.sourceflow.languages.about12}</div>
        </div>
        <div class="fn__space"></div>
        <input class="b3-switch fn__flex-center" id="networkServe" type="checkbox"${window.sourceflow.config.system.networkServe ? " checked" : ""}>
    </label>
    <label class="b3-label fn__flex${window.sourceflow.config.system.networkServe ? "" : " fn__none"}">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.networkServeTLS}
            <div class="b3-label__text">${window.sourceflow.languages.networkServeTLSTip}</div>
            <div class="b3-label__text">${window.sourceflow.languages.networkServeTLSTip2}</div>
        </div>
        <div class="fn__space"></div>
        <input class="b3-switch fn__flex-center" id="networkServeTLS" type="checkbox"${window.sourceflow.config.system.networkServeTLS ? " checked" : ""}${!window.sourceflow.config.system.networkServe ? " disabled" : ""}>
    </label>
    <div class="fn__flex b3-label config__item${(window.sourceflow.config.system.networkServeTLS && window.sourceflow.config.system.networkServe) ? "" : " fn__none"}">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.exportCACert}
            <div class="b3-label__text">${window.sourceflow.languages.exportCACertTip}</div>
        </div>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--outline fn__size200 fn__flex-center" id="exportCACert">
            <svg><use xlink:href="#iconUpload"></use></svg>${window.sourceflow.languages.export}
        </button>
    </div>
    <div class="fn__flex b3-label config__item${window.sourceflow.config.system.networkServeTLS && window.sourceflow.config.system.networkServe ? "" : " fn__none"}">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.exportCABundle}
            <div class="b3-label__text">${window.sourceflow.languages.exportCABundleTip}</div>
        </div>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--outline fn__size200 fn__flex-center" id="exportCABundle">
            <svg><use xlink:href="#iconUpload"></use></svg>${window.sourceflow.languages.export}
        </button>
    </div>
    <div class="fn__flex b3-label config__item${window.sourceflow.config.system.networkServeTLS && window.sourceflow.config.system.networkServe ? "" : " fn__none"}">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.importCABundle}
            <div class="b3-label__text">${window.sourceflow.languages.importCABundleTip}</div>
        </div>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--outline fn__size200 fn__flex-center" id="importCABundle">
            <svg><use xlink:href="#iconDownload"></use></svg>${window.sourceflow.languages.import}
        </button>
    </div>
</div>
<div class="b3-label config__item${(window.sourceflow.config.readonly || (isBrowser() && !isInMobileApp() && !isIPad())) ? " fn__none" : ""}">
    <div class="fn__flex">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.about5}
            <div class="b3-label__text">${window.sourceflow.languages.about6}</div>
        </div>
        <div class="fn__space"></div>
        <button class="fn__flex-center b3-button b3-button--outline fn__size200" id="authCode">
            <svg><use xlink:href="#iconLock"></use></svg>${window.sourceflow.languages.config}
        </button>
    </div>
    <label class="b3-label fn__flex${!window.sourceflow.config.accessAuthCode || isBrowser() ? " fn__none" : ""}">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.about7}
            <div class="b3-label__text">${window.sourceflow.languages.about8}</div>
        </div>
        <div class="fn__space"></div>
        <input class="b3-switch fn__flex-center" id="lockScreenMode" type="checkbox"${window.sourceflow.config.system.lockScreenMode === 1 ? " checked" : ""}>
    </label>
</div>
<div class="b3-label config__item${(isBrowser() && !isInMobileApp()) ? " fn__none" : " fn__flex"}">
    <div class="fn__flex-1">
       ${window.sourceflow.languages.about2}
        <div class="b3-label__text">${window.sourceflow.languages.about3.replace("${port}", location.port)}</div>
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
        <div class="b3-label__text">${window.sourceflow.languages.about18}</div>
    </div>
    <div class="fn__space"></div>
    <button data-type="open" data-url="${"http://127.0.0.1:" + location.port}" class="b3-button b3-button--outline fn__size200 fn__flex-center">
        <svg><use xlink:href="#iconLink"></use></svg>${window.sourceflow.languages.about4}
    </button>
</div>
<div class="b3-label fn__flex config__item">
    <div class="fn__flex-1 fn__flex-center">
        ${window.sourceflow.languages.dataRepoKey}
        <div class="b3-label__text">${window.sourceflow.languages.dataRepoKeyTip1}</div>
        <div class="b3-label__text"><span class="ft__error">${window.sourceflow.languages.dataRepoKeyTip2}</span></div>
    </div>
    <div class="fn__space"></div>
    <div class="fn__size200 config__item-line fn__flex-center${window.sourceflow.config.repo.key ? " fn__none" : ""}">
        <button class="b3-button b3-button--outline fn__block" id="importKey">
            <svg><use xlink:href="#iconDownload"></use></svg>${window.sourceflow.languages.importKey}
        </button>
        <div class="fn__hr"></div>
        <button class="b3-button b3-button--outline fn__block" id="initKey">
            <svg><use xlink:href="#iconLock"></use></svg>${window.sourceflow.languages.genKey}
        </button>
        <div class="fn__hr"></div>
        <button class="b3-button b3-button--outline fn__block" id="initKeyByPW">
            <svg><use xlink:href="#iconHand"></use></svg>${window.sourceflow.languages.genKeyByPW}
        </button>
    </div>
    <div class="fn__size200 config__item-line fn__flex-center${window.sourceflow.config.repo.key ? "" : " fn__none"}">
        <button class="b3-button b3-button--outline fn__block" id="copyKey">
            <svg><use xlink:href="#iconCopy"></use></svg>${window.sourceflow.languages.copyKey}
        </button>
        <div class="fn__hr"></div>
        <button class="b3-button b3-button--outline fn__block" id="resetRepo">
            <svg><use xlink:href="#iconUndo"></use></svg>${window.sourceflow.languages.resetRepo}
        </button>
    </div>
</div>
<div class="b3-label">
    <div>
        ${window.sourceflow.languages.dataRepoPurge}
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">${window.sourceflow.languages.dataRepoPurgeTip}</div>
        <span class="fn__space"></span>
        <button id="purgeRepo" class="b3-button b3-button--outline fn__size200 fn__flex-center">
            <svg><use xlink:href="#iconTrashcan"></use></svg>${window.sourceflow.languages.purge}
        </button>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">${window.sourceflow.languages.dataRepoAutoPurgeIndexRetentionDays}</div>
        <span class="fn__space"></span>
        <input class="b3-text-field fn__flex-center fn__size200" min="1" type="number" id="indexRetentionDays" value="${window.sourceflow.config.repo.indexRetentionDays}">
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1 ft__on-surface">${window.sourceflow.languages.dataRepoAutoPurgeRetentionIndexesDaily}</div>
        <span class="fn__space"></span>
        <input class="b3-text-field fn__flex-center fn__size200" min="1" type="number" id="retentionIndexesDaily" value="${window.sourceflow.config.repo.retentionIndexesDaily}">
    </div>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.vacuumDataIndex}
        <div class="b3-label__text">${window.sourceflow.languages.vacuumDataIndexTip}</div>
    </div>
    <div class="fn__space"></div>
    <button id="vacuumDataIndex" class="b3-button b3-button--outline fn__size200 fn__flex-center">
        <svg><use xlink:href="#iconRefresh"></use></svg>${window.sourceflow.languages.vacuumDataIndex}
    </button>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.rebuildDataIndex}
        <div class="b3-label__text">${window.sourceflow.languages.rebuildDataIndexTip}</div>
    </div>
    <div class="fn__space"></div>
    <button id="rebuildDataIndex" class="b3-button b3-button--outline fn__size200 fn__flex-center">
        <svg><use xlink:href="#iconRefresh"></use></svg>${window.sourceflow.languages.rebuildDataIndex}
    </button>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.clearTempFiles}
        <div class="b3-label__text">${window.sourceflow.languages.clearTempFilesTip}</div>
    </div>
    <div class="fn__space"></div>
    <button id="clearTempFiles" class="b3-button b3-button--outline fn__size200 fn__flex-center">
        <svg><use xlink:href="#iconTrashcan"></use></svg>${window.sourceflow.languages.purge}
    </button>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.systemLog}
        <div class="b3-label__text">${window.sourceflow.languages.systemLogTip}</div>
    </div>
    <div class="fn__space"></div>
    <button id="exportLog" class="b3-button b3-button--outline fn__size200 fn__flex-center">
        <svg><use xlink:href="#iconUpload"></use></svg>${window.sourceflow.languages.export}
    </button>
</div>
${portableHTML}
${versionHTML}
<div class="fn__flex config__item  b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.about13}
         <div class="b3-label__text" id="tokenTip">${window.sourceflow.languages.about14.replace("${token}", window.sourceflow.config.api.token)}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="token" value="${window.sourceflow.config.api.token}">
</div>
<div class="b3-label">
    ${window.sourceflow.languages.networkProxy}
    <div class="b3-label__text">
        ${window.sourceflow.languages.about17}
    </div>
    <div class="b3-label__text fn__flex config__item">
        <select id="aboutScheme" class="b3-select">
            <option value="" ${window.sourceflow.config.system.networkProxy.scheme === "" ? "selected" : ""}>${window.sourceflow.languages.directConnection}</option>
            <option value="socks5" ${window.sourceflow.config.system.networkProxy.scheme === "socks5" ? "selected" : ""}>SOCKS5</option>
            <option value="https" ${window.sourceflow.config.system.networkProxy.scheme === "https" ? "selected" : ""}>HTTPS</option>
            <option value="http" ${window.sourceflow.config.system.networkProxy.scheme === "http" ? "selected" : ""}>HTTP</option>
        </select>
        <span class="fn__space"></span>
        <input id="aboutHost" placeholder="user:pass@IP" class="b3-text-field fn__block" value="${window.sourceflow.config.system.networkProxy.host}"/>
        <span class="fn__space"></span>
        <input id="aboutPort" placeholder="Port" class="b3-text-field fn__block" value="${window.sourceflow.config.system.networkProxy.port}" type="number"/>
        <span class="fn__space"></span>
        <button id="aboutConfirm" class="b3-button fn__size200 b3-button--outline">${window.sourceflow.languages.confirm}</button>
    </div>
</div>
<div class="b3-label">
    <div class="config-about__logo">
        <img src="/stage/icon.png">
        <span>${appName}</span>
        <span class="fn__space"></span>
        <span class="ft__on-surface">${window.sourceflow.languages.slogan}</span>
    </div>
    <div class='fn__hr'></div>
    ${window.sourceflow.languages.about1}
</div>`;
    },
    bindEvent: () => {
        if (window.sourceflow.config.system.isInsider) {
            about.element.querySelector("#isInsider").innerHTML = "<span class='ft__secondary'>Insider Preview</span>";
        }
        const indexRetentionDaysElement = about.element.querySelector("#indexRetentionDays") as HTMLInputElement;
        indexRetentionDaysElement.addEventListener("change", () => {
            fetchPost("/api/repo/setRepoIndexRetentionDays", {days: parseInt(indexRetentionDaysElement.value)}, () => {
                window.sourceflow.config.repo.indexRetentionDays = parseInt(indexRetentionDaysElement.value);
            });
        });
        const retentionIndexesDailyElement = about.element.querySelector("#retentionIndexesDaily") as HTMLInputElement;
        retentionIndexesDailyElement.addEventListener("change", () => {
            fetchPost("/api/repo/setRetentionIndexesDaily", {indexes: parseInt(retentionIndexesDailyElement.value)}, () => {
                window.sourceflow.config.repo.retentionIndexesDaily = parseInt(retentionIndexesDailyElement.value);
            });
        });
        const tokenElement = about.element.querySelector("#token") as HTMLInputElement;
        tokenElement.addEventListener("click", () => {
            tokenElement.select();
        });
        tokenElement.addEventListener("change", () => {
            fetchPost("/api/system/setAPIToken", {token: tokenElement.value}, () => {
                window.sourceflow.config.api.token = tokenElement.value;
                about.element.querySelector("#tokenTip").innerHTML = window.sourceflow.languages.about14.replace("${token}", window.sourceflow.config.api.token);
            });
        });
        about.element.querySelector("#vacuumDataIndex").addEventListener("click", () => {
            fetchPost("/api/system/vacuumDataIndex", {}, () => {
            });
        });
        about.element.querySelector("#rebuildDataIndex").addEventListener("click", () => {
            fetchPost("/api/system/rebuildDataIndex", {}, () => {
            });
        });
        about.element.querySelector("#clearTempFiles").addEventListener("click", () => {
            fetchPost("/api/system/clearTempFiles", {}, () => {
            });
        });
        about.element.querySelector("#exportLog").addEventListener("click", () => {
            fetchPost("/api/system/exportLog", {}, (response) => {
                openByMobile(response.data.zip);
            });
        });
        about.element.querySelector("#openPortableRoot")?.addEventListener("click", () => {
            useShell("openPath", originalPath().dirname(window.sourceflow.config.system.confDir));
        });
        about.element.querySelector("#openPortableWorkspace")?.addEventListener("click", () => {
            useShell("openPath", window.sourceflow.config.system.workspaceDir);
        });
        about.element.querySelector("#openPortableUserdata")?.addEventListener("click", () => {
            useShell("openPath", window.sourceflow.config.system.confDir);
        });
        about.element.querySelector("#copyBackupProfilePath")?.addEventListener("click", () => {
            showMessage(window.sourceflow.languages.copied);
            writeText(originalPath().join(window.sourceflow.config.system.confDir, "backup-profile.json"));
        });
        const protocolButton = about.element.querySelector("#toggleProtocolClient") as HTMLButtonElement;
        const protocolStatus = about.element.querySelector("#protocolClientStatus");
        const updateProtocolClientUI = (registered: boolean) => {
            window.sourceflow.config.system.protocolClientRegistered = registered;
            if (protocolStatus) {
                protocolStatus.textContent = registered ? "当前机器已注册，可从浏览器/系统外部直接唤起。" : "默认会自动注册；如果当前未注册，可点右侧重新注册。";
            }
            if (protocolButton) {
                protocolButton.innerHTML = `<svg><use xlink:href="#iconLink"></use></svg>${registered ? "取消注册" : "重新注册"}`;
            }
        };
        /// #if !BROWSER
        protocolButton?.addEventListener("click", async () => {
            protocolButton.disabled = true;
            const registered = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
                cmd: "setDefaultProtocolClient",
                register: !window.sourceflow.config.system.protocolClientRegistered,
            });
            updateProtocolClientUI(!!registered);
            showMessage(registered ? "已注册 sf:// 协议" : "已取消注册 sf:// 协议");
            protocolButton.disabled = false;
        });
        if (protocolButton) {
            ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
                cmd: "isDefaultProtocolClient",
            }).then((registered: boolean) => {
                updateProtocolClientUI(!!registered);
            });
        }
        /// #endif
        about.element.querySelectorAll('[data-type="open"]').forEach(item => {
            item.addEventListener("click", () => {
                const url = item.getAttribute("data-url");
                /// #if !BROWSER
                if (url.startsWith("http")) {
                    shell.openExternal(url);
                } else {
                    useShell("openPath", url);
                }
                /// #else
                window.open(url);
                /// #endif
            });
        });

        about.element.querySelector("#authCode").addEventListener("click", () => {
            setAccessAuthCode();
        });
        const importKeyElement = about.element.querySelector("#importKey");
        importKeyElement.addEventListener("click", () => {
            const passwordDialog = new Dialog({
                title: "🔑 " + window.sourceflow.languages.key,
                content: `<div class="b3-dialog__content">
    <textarea spellcheck="false" style="resize: vertical;" class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.keyPlaceholder}"></textarea>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
                width: "520px",
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
        });
        about.element.querySelector("#initKey").addEventListener("click", () => {
            confirmDialog("🔑 " + window.sourceflow.languages.genKey, window.sourceflow.languages.initRepoKeyTip, () => {
                fetchPost("/api/repo/initRepoKey", {}, (response) => {
                    window.sourceflow.config.repo.key = response.data.key;
                    importKeyElement.parentElement.classList.add("fn__none");
                    importKeyElement.parentElement.nextElementSibling.classList.remove("fn__none");
                });
            });
        });
        about.element.querySelector("#initKeyByPW").addEventListener("click", () => {
            setKey(false, () => {
                importKeyElement.parentElement.classList.add("fn__none");
                importKeyElement.parentElement.nextElementSibling.classList.remove("fn__none");
            });
        });
        about.element.querySelector("#copyKey").addEventListener("click", () => {
            showMessage(window.sourceflow.languages.copied);
            writeText(window.sourceflow.config.repo.key);
        });
        about.element.querySelector("#resetRepo").addEventListener("click", () => {
            confirmDialog("⚠️ " + window.sourceflow.languages.resetRepo, window.sourceflow.languages.resetRepoTip, () => {
                fetchPost("/api/repo/resetRepo", {}, () => {
                    window.sourceflow.config.repo.key = "";
                    window.sourceflow.config.sync.enabled = false;
                    processSync();
                    importKeyElement.parentElement.classList.remove("fn__none");
                    importKeyElement.parentElement.nextElementSibling.classList.add("fn__none");
                });
            });
        });
        about.element.querySelector("#purgeRepo").addEventListener("click", () => {
            confirmDialog("♻️ " + window.sourceflow.languages.dataRepoPurge, window.sourceflow.languages.dataRepoPurgeConfirm, () => {
                fetchPost("/api/repo/purgeRepo");
            });
        });
        const networkServeElement = about.element.querySelector("#networkServe") as HTMLInputElement;
        const networkServeTLSElement = about.element.querySelector("#networkServeTLS") as HTMLInputElement;
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
            fetchPost("/api/system/setNetworkServe", {networkServe: networkServeElement.checked}, () => {
                exportLayout({
                    errorExit: true,
                    cb: exitSourceFlow
                });
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
            fetchPost("/api/system/setNetworkServeTLS", {networkServeTLS: networkServeTLSElement.checked}, () => {
                exportLayout({
                    errorExit: true,
                    cb: exitSourceFlow
                });
            });
        });
        about.element.querySelector("#exportCACert")?.addEventListener("click", () => {
            fetchPost("/api/system/exportTLSCACert", {}, (response) => {
                openByMobile(response.data.path);
            });
        });
        about.element.querySelector("#exportCABundle")?.addEventListener("click", () => {
            fetchPost("/api/system/exportTLSCABundle", {}, (response) => {
                openByMobile(response.data.path);
            });
        });
        about.element.querySelector("#importCABundle")?.addEventListener("click", () => {
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
        const lockScreenModeElement = about.element.querySelector("#lockScreenMode") as HTMLInputElement;
        lockScreenModeElement.addEventListener("change", () => {
            fetchPost("/api/system/setFollowSystemLockScreen", {lockScreenMode: lockScreenModeElement.checked ? 1 : 0}, () => {
                window.sourceflow.config.system.lockScreenMode = lockScreenModeElement.checked ? 1 : 0;
            });
        });
        const downloadInstallPkgElement = about.element.querySelector("#downloadInstallPkg") as HTMLInputElement;
        downloadInstallPkgElement?.addEventListener("change", () => {
            fetchPost("/api/system/setDownloadInstallPkg", {downloadInstallPkg: downloadInstallPkgElement.checked}, () => {
                window.sourceflow.config.system.downloadInstallPkg = downloadInstallPkgElement.checked;
            });
        });
        /// #if !BROWSER
        const autoLaunchElement = about.element.querySelector("#autoLaunch") as HTMLInputElement;
        autoLaunchElement?.addEventListener("change", () => {
            const autoLaunchMode = parseInt(autoLaunchElement.value);
            fetchPost("/api/system/setAutoLaunch", {autoLaunch: autoLaunchMode}, () => {
                window.sourceflow.config.system.autoLaunch2 = autoLaunchMode;
                ipcRenderer.send(Constants.SOURCEFLOW_AUTO_LAUNCH, {
                    openAtLogin: 0 !== autoLaunchMode,
                    openAsHidden: 2 === autoLaunchMode
                });
            });
        });
        /// #endif
        about.element.querySelector("#aboutConfirm").addEventListener("click", () => {
            const scheme = (about.element.querySelector("#aboutScheme") as HTMLInputElement).value as Config.TSystemNetworkProxyScheme;
            const host = (about.element.querySelector("#aboutHost") as HTMLInputElement).value;
            const port = (about.element.querySelector("#aboutPort") as HTMLInputElement).value;
            fetchPost("/api/system/setNetworkProxy", {scheme, host, port}, async () => {
                window.sourceflow.config.system.networkProxy.scheme = scheme;
                window.sourceflow.config.system.networkProxy.host = host;
                window.sourceflow.config.system.networkProxy.port = port;
                /// #if !BROWSER
                ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
                    cmd: "setProxy",
                    proxyURL: `${window.sourceflow.config.system.networkProxy.scheme}://${window.sourceflow.config.system.networkProxy.host}:${window.sourceflow.config.system.networkProxy.port}`,
                }).then(() => {
                    exportLayout({
                        errorExit: false,
                        cb() {
                            window.location.reload();
                        },
                    });
                });
                /// #endif
            });
        });
    }
};
