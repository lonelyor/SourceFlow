import {showMessage} from "../dialog/message";
import {fetchPost} from "../util/fetch";
import {Dialog} from "../dialog";
import {isMobile} from "../util/functions";
import {processSync} from "../dialog/processSystem";
import {App} from "../index";
import {Constants} from "../constants";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif

const masterText = (zh: string, en: string) => `${window.sourceflow.config.lang || ""}`.toLowerCase().startsWith("zh") ? zh : en;

export const syncGuide = (app?: App) => {
    if (window.sourceflow.config.readonly) {
        return;
    }
    void app;
    /// #if !MOBILE
    if (document.querySelector("#barSync")?.classList.contains("toolbar__item--active")) {
        return;
    }
    /// #endif
    ensureSelfHostedSyncReady(() => {
        if (!window.sourceflow.config.sync.enabled) {
            enableSync(() => {
                syncNow();
            });
            return;
        }
        syncNow();
    });
};

export const ensureSelfHostedSyncReady = (cb: () => void) => {
    const finish = () => {
        if (window.sourceflow.config.sync.cloudName) {
            cb();
            return;
        }
        fetchPost("/api/sync/setCloudSyncDir", {name: "main"}, () => {
            window.sourceflow.config.sync.cloudName = "main";
            cb();
        });
    };
    if (window.sourceflow.config.repo.keyConfigured && window.sourceflow.config.repo.keyEnvelope) {
        finish();
        return;
    }
    setKey(false, finish);
};

const syncNow = () => {
    if (window.sourceflow.config.sync.mode !== 3) {
        fetchPost("/api/sync/performSync", {});
        return;
    }
    const manualDialog = new Dialog({
        title: window.sourceflow.languages.chooseSyncDirection,
        content: `<div class="b3-dialog__content">
    <label class="fn__flex b3-label">
        <input type="radio" name="upload" value="true">
        <span class="fn__space"></span>
        <div>
            ${window.sourceflow.languages.uploadData2Cloud}
            <div class="b3-label__text">${window.sourceflow.languages.uploadData2CloudTip}</div>
        </div>
    </label>
    <label class="fn__flex b3-label">
        <input type="radio" name="upload" value="false">
        <span class="fn__space"></span>
        <div>
            ${window.sourceflow.languages.downloadDataFromCloud}
            <div class="b3-label__text">${window.sourceflow.languages.downloadDataFromCloudTip}</div>
        </div>
    </label>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
        width: isMobile() ? "92vw" : "520px",
    });
    manualDialog.element.setAttribute("data-key", Constants.DIALOG_SYNCCHOOSEDIRECTION);
    const btnsElement = manualDialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", () => {
        manualDialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
        const uploadElement = manualDialog.element.querySelector("input[name=upload]:checked") as HTMLInputElement;
        if (!uploadElement) {
            showMessage(window.sourceflow.languages.plsChoose);
            return;
        }
        fetchPost("/api/sync/performSync", {upload: uploadElement.value === "true"});
        manualDialog.destroy();
    });
};

const enableSync = (cb?: () => void) => {
    fetchPost("/api/sync/setSyncEnable", {enabled: true}, () => {
        window.sourceflow.config.sync.enabled = true;
        processSync();
        cb?.();
    });
};

export const setKey = (isSync: boolean, cb?: () => void) => {
    const isUnlock = !!window.sourceflow.config.repo.keyEnvelope && !window.sourceflow.config.repo.keyConfigured;
    const title = isUnlock ? masterText("输入主密码解锁备份", "Unlock backup") : masterText("创建备份主密码", "Create backup master password");
    const dialog = new Dialog({
        title: "🔑 " + title,
        content: `<div class="b3-dialog__content ft__center">
    <img style="width: 260px" src="/stage/images/sync-guide.svg"/>
    <div class="fn__hr--b"></div>
    <div class="ft__on-surface">${isUnlock ? masterText("输入创建备份时使用的主密码，即可恢复同一个加密仓库。", "Enter the master password used for this backup to recover the same encrypted repository.") : masterText("以后在新设备恢复备份时，只需输入这个主密码；无需再保存 repo key。", "On a new device, enter this password to restore. You do not need to retain a raw repo key.")}</div>
    ${isUnlock ? "" : `<div class="b3-label__text ft__error">${masterText("如果忘记主密码且没有任何已授权设备，端到端加密备份无法恢复。", "If the password is forgotten and no authorized device remains, the end-to-end encrypted backup cannot be recovered.")}</div>`}
    <div class="fn__hr--b"></div>
    <input type="password" class="b3-text-field fn__block ft__center" placeholder="${masterText("主密码（至少 8 个字符）", "Master password (at least 8 characters)")}">
    ${isUnlock ? "" : `<div class="fn__hr"></div><input type="password" class="b3-text-field fn__block ft__center" placeholder="${window.sourceflow.languages.reEnterPassphrase}">`}
</div>
<div class="b3-dialog__action">
    <label class="fn__flex">
        <input type="checkbox" id="rememberRepoKey" class="b3-switch fn__flex-center" checked>
        <span class="fn__space"></span>
        ${masterText("在本机安全记住（公司或共享电脑可取消）", "Remember securely on this device (disable on work/shared computers)")}
    </label>
    <span class="fn__flex-1"></span>
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button>
    <span class="fn__space"></span>
    <button class="b3-button b3-button--text" id="initKeyByPW">
        ${window.sourceflow.languages.confirm}
    </button>
</div>`,
        width: isMobile() ? "92vw" : "520px",
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_SETPASSWORD);
    dialog.element.querySelector(".b3-button--cancel").addEventListener("click", () => {
        dialog.destroy();
    });
    const genBtnElement = dialog.element.querySelector("#initKeyByPW") as HTMLButtonElement;
    const inputElements = dialog.element.querySelectorAll(".b3-text-field") as NodeListOf<HTMLInputElement>;
    genBtnElement.addEventListener("click", () => {
        if (!inputElements[0].value || 8 > Array.from(inputElements[0].value.trim()).length) {
            showMessage(masterText("主密码至少需要 8 个字符", "The master password must contain at least 8 characters"));
            return;
        }
        if (!isUnlock && inputElements[0].value !== inputElements[1].value) {
            showMessage(window.sourceflow.languages.passwordNoMatch);
            return;
        }
        const endpoint = isUnlock ? "/api/repo/unlockWithMasterPassword" : "/api/repo/setMasterPassword";
        fetchPost(endpoint, {password: inputElements[0].value}, (response) => {
            if (response.data.keyEnvelope) {
                window.sourceflow.config.repo.keyEnvelope = response.data.keyEnvelope;
            }
            window.sourceflow.config.repo.key = "";
            window.sourceflow.config.repo.keyConfigured = true;
            const remember = (dialog.element.querySelector("#rememberRepoKey") as HTMLInputElement).checked;
            if (remember) {
                /// #if !BROWSER
                ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
                    cmd: "saveSyncCredentials",
                    credentials: {repoKey: response.data.key},
                }).then((result) => {
                    if (!result?.stored) {
                        showMessage(masterText("系统安全存储不可用；本次可正常使用，重启后需要重新输入主密码。", "Secure storage is unavailable. This session remains unlocked, but the master password is required after restart."), 10000, "info");
                    }
                });
                /// #endif
            }
            inputElements.forEach((input) => input.value = "");
            dialog.destroy();
            cb?.();
            if (isSync) {
                ensureSelfHostedSyncReady(() => enableSync(syncNow));
            }
        });
    });
    inputElements[0].focus();
};
