import {fetchPost} from "../../util/fetch";
import type {ISecurityConfig, ISecurityPermissionResult, TSecurityMode, TSecurityRisk} from "./types";

export const getSecurityConfig = (): Promise<ISecurityConfig> => {
    return new Promise((resolve) => {
        fetchPost("/api/assistant/security/getConfig", {}, (response: any) => {
            if (response.code === 0 && response.data) {
                resolve(response.data);
            } else {
                resolve({
                    defaultMode: "default",
                    blacklist: [],
                    whitelist: [],
                    capabilities: {
                        read: true,
                        write: true,
                        execute: false,
                        create: true,
                        deleteBlock: true,
                        deleteNote: false,
                        move: false,
                    },
                    batchThreshold: 10,
                });
            }
        });
    });
};

export const setSecurityConfig = (config: ISecurityConfig): Promise<ISecurityConfig> => {
    return new Promise((resolve, reject) => {
        fetchPost("/api/assistant/security/setConfig", {config}, (response: any) => {
            if (response.code === 0 && response.data) {
                resolve(response.data);
            } else {
                reject(new Error(response.msg || "Failed to save security config"));
            }
        });
    });
};

export const checkPermission = (
    mode: TSecurityMode,
    risk: TSecurityRisk,
    targetType: string,
    targetIds: string[],
    sessionBatchCount: number,
): Promise<ISecurityPermissionResult> => {
    return new Promise((resolve) => {
        fetchPost("/api/assistant/security/checkPermission", {
            mode,
            risk,
            targetType,
            targetIds,
            sessionBatchCount,
        }, (response: any) => {
            if (response.code === 0 && response.data) {
                resolve(response.data);
            } else {
                resolve({decision: "deny", reason: response.msg || "Permission check failed"});
            }
        });
    });
};
