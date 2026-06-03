import {fetchPost} from "../../util/fetch";
import type {ISecurityConfig, ISecurityPermissionResult, TSecurityCapability, TSecurityMode, TSecurityRisk} from "./types";

export interface ISecurityPermissionCheckPayload {
    mode?: TSecurityMode;
    risk: TSecurityRisk;
    targetType: string;
    targetIds: string[];
    sessionBatchCount?: number;
    capability?: TSecurityCapability;
    toolId?: string;
}

export const getSecurityConfig = (): Promise<ISecurityConfig> => {
    return new Promise((resolve, reject) => {
        fetchPost("/api/assistant/security/getConfig", {}, (response: any) => {
            if (response.code === 0 && response.data) {
                resolve(response.data);
            } else {
                reject(new Error(response.msg || "Failed to load security config"));
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

export const checkPermission = (payload: ISecurityPermissionCheckPayload): Promise<ISecurityPermissionResult> => {
    return new Promise((resolve) => {
        fetchPost("/api/assistant/security/checkPermission", payload, (response: any) => {
            if (response.code === 0 && response.data) {
                resolve(response.data);
            } else {
                resolve({decision: "deny", reason: response.msg || "Permission check failed"});
            }
        });
    });
};
