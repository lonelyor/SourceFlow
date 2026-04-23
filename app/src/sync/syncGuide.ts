import {showMessage} from "../dialog/message";
import {fetchPost} from "../util/fetch";
import {Dialog} from "../dialog";
import {confirmDialog} from "../dialog/confirmDialog";
import {isMobile} from "../util/functions";
import {processSync} from "../dialog/processSystem";
import {App} from "../index";
import {Constants} from "../constants";
import {originalPath} from "../util/pathName";

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
    if (window.sourceflow.config.repo.key) {
        finish();
        return;
    }
    fetchPost("/api/repo/initRepoKey", {}, (response) => {
        window.sourceflow.config.repo.key = response.data.key;
        const backupProfilePath = originalPath().join(window.sourceflow.config.system.confDir, "backup-profile.json");
        showMessage(`已自动生成数据仓库密钥。repo key 用于打开同步数据仓库；如果只剩远端备份而它或恢复描述文件丢失，恢复可能失败。请妥善保存 ${backupProfilePath}`, 8000, "info");
        finish();
    });
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
    const dialog = new Dialog({
        title: "🔑 " + window.sourceflow.languages.syncConfGuide1,
        content: `<div class="b3-dialog__content ft__center">
    <img style="width: 260px" src="/stage/images/sync-guide.svg"/>
    <div class="fn__hr--b"></div>
    <div class="ft__on-surface">${window.sourceflow.languages.syncConfGuide2}</div>
    <div class="fn__hr--b"></div>
    <input class="b3-text-field fn__block ft__center" placeholder="${window.sourceflow.languages.passphrase}">
    <div class="fn__hr"></div>
    <input class="b3-text-field fn__block ft__center" placeholder="${window.sourceflow.languages.reEnterPassphrase}">
</div>
<div class="b3-dialog__action">
    <label class="fn__flex">
        <input type="checkbox" class="b3-switch fn__flex-center">
        <span class="fn__space"></span>
        ${window.sourceflow.languages.confirmPassword}
    </label>
    <span class="fn__flex-1"></span>
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button>
    <span class="fn__space"></span>
    <button class="b3-button b3-button--text" id="initKeyByPW" disabled>
        ${window.sourceflow.languages.confirm}
    </button>
</div>`,
        width: isMobile() ? "92vw" : "520px",
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_SETPASSWORD);
    dialog.element.querySelector(".b3-button--cancel").addEventListener("click", () => {
        dialog.destroy();
    });
    const genBtnElement = dialog.element.querySelector("#initKeyByPW");
    dialog.element.querySelector(".b3-switch").addEventListener("change", function () {
        if (this.checked) {
            genBtnElement.removeAttribute("disabled");
        } else {
            genBtnElement.setAttribute("disabled", "disabled");
        }
    });
    const inputElements = dialog.element.querySelectorAll(".b3-text-field") as NodeListOf<HTMLInputElement>;
    genBtnElement.addEventListener("click", () => {
        if (!inputElements[0].value || !inputElements[1].value) {
            showMessage(window.sourceflow.languages._kernel[142]);
            return;
        }
        if (inputElements[0].value !== inputElements[1].value) {
            showMessage(window.sourceflow.languages.passwordNoMatch);
            return;
        }
        confirmDialog("🔑 " + window.sourceflow.languages.genKeyByPW, window.sourceflow.languages.initRepoKeyTip, () => {
            if (!isSync) {
                dialog.destroy();
            }
            fetchPost("/api/repo/initRepoKeyFromPassphrase", {pass: inputElements[0].value}, (response) => {
                window.sourceflow.config.repo.key = response.data.key;
                if (cb) {
                    cb();
                }
                if (isSync) {
                    dialog.destroy();
                    ensureSelfHostedSyncReady(() => {
                        enableSync(() => {
                            syncNow();
                        });
                    });
                }
            });
        });
    });
    inputElements[0].focus();
};
