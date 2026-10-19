// SourceFlow - Make knowledge flow
// Store sync secrets outside the workspace using Electron's OS-backed safeStorage.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VAULT_VERSION = 1;

const workspaceKey = (workspaceDir, platform = process.platform) => {
    let normalized = path.resolve(String(workspaceDir || "")).replace(/\\/g, "/");
    if ("win32" === platform) {
        normalized = normalized.toLowerCase();
    }
    return crypto.createHash("sha256").update(normalized).digest("hex");
};

const isSecureStorageAvailable = (safeStorage, platform = process.platform) => {
    if (!safeStorage?.isEncryptionAvailable()) {
        return false;
    }
    return "linux" !== platform || safeStorage.getSelectedStorageBackend?.() !== "basic_text";
};

const createSyncCredentialVault = ({safeStorage, userDataPath, platform = process.platform}) => {
    const vaultPath = path.join(userDataPath, "sync-credentials.v1.json");
    const available = () => isSecureStorageAvailable(safeStorage, platform);
    const readVault = () => {
        try {
            const parsed = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
            return parsed?.version === VAULT_VERSION && parsed.entries ? parsed : {version: VAULT_VERSION, entries: {}};
        } catch (_error) {
            return {version: VAULT_VERSION, entries: {}};
        }
    };
    const writeVault = (vault) => {
        fs.mkdirSync(path.dirname(vaultPath), {recursive: true, mode: 0o700});
        const tempPath = `${vaultPath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(vault), {mode: 0o600});
        fs.renameSync(tempPath, vaultPath);
        try {
            fs.chmodSync(vaultPath, 0o600);
        } catch (_error) {
            // Windows permissions are controlled by the user profile ACL.
        }
    };
    const load = (workspaceDir) => {
        if (!available()) {
            return {};
        }
        const encrypted = readVault().entries[workspaceKey(workspaceDir, platform)];
        if (!encrypted) {
            return {};
        }
        try {
            return JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, "base64")));
        } catch (_error) {
            return {};
        }
    };
    const save = (workspaceDir, patch) => {
        if (!available()) {
            return {stored: false, reason: "secure-storage-unavailable"};
        }
        const credentials = {...load(workspaceDir)};
        for (const [key, value] of Object.entries(patch || {})) {
            if ("string" === typeof value && value) {
                credentials[key] = value;
            }
        }
        const vault = readVault();
        vault.entries[workspaceKey(workspaceDir, platform)] = safeStorage.encryptString(JSON.stringify(credentials)).toString("base64");
        writeVault(vault);
        return {stored: true};
    };
    const loadForKernel = (workspaceDir) => {
        const credentials = load(workspaceDir);
        try {
            const conf = JSON.parse(fs.readFileSync(path.join(workspaceDir, "conf", "conf.json"), "utf8"));
            const legacy = {
                s3SecretKey: conf?.sync?.s3?.secretKey || "",
                webdavPassword: conf?.sync?.webdav?.password || "",
                repoKey: conf?.repo?.keyEnvelope ? "" : (conf?.repo?.key || ""),
            };
            if (legacy.s3SecretKey || legacy.webdavPassword || legacy.repoKey) {
                Object.assign(credentials, legacy);
                save(workspaceDir, legacy);
            }
        } catch (_error) {
            // A new workspace has no configuration yet.
        }
        return credentials;
    };
    return {available, load, loadForKernel, save, vaultPath};
};

module.exports = {createSyncCredentialVault, isSecureStorageAvailable, workspaceKey};
