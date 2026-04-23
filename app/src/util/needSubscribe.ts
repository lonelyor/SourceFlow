import {showMessage} from "../dialog/message";

const getUserNumber = (key: "userSourceFlowProExpireTime" | "userSourceFlowSubscriptionStatus" | "userSourceFlowOneTimePayStatus") => {
    if (!window.sourceflow.user) {
        return undefined;
    }
    return window.sourceflow.user[key];
};

export const needSubscribe = (tip = window.sourceflow.languages._kernel[29]) => {
    const expireTime = getUserNumber("userSourceFlowProExpireTime");
    if (window.sourceflow.user && (expireTime === -1 || expireTime > 0)) {
        return false;
    }
    if (tip) {
        if (tip === window.sourceflow.languages._kernel[29] && window.sourceflow.config.system.container === "ios") {
            showMessage(window.sourceflow.languages._kernel[122]);
        } else {
            showMessage(tip);
        }
    }
    return true;
};

export const isPaidUser = () => {
    const subscriptionStatus = getUserNumber("userSourceFlowSubscriptionStatus");
    const oneTimePayStatus = getUserNumber("userSourceFlowOneTimePayStatus");
    return window.sourceflow.user && (0 === subscriptionStatus || 1 === oneTimePayStatus);
};
