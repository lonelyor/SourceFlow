// SourceFlow startup failure helpers.

const normalizeStartupExitCode = (code, signal = "") => {
    if (signal) {
        return -1;
    }
    if (code === 0 || code === "0") {
        return null;
    }
    if (code === null || code === undefined) {
        return -1;
    }
    const parsed = Number(code);
    return Number.isFinite(parsed) ? parsed : -1;
};

const shouldSuppressGenericPortFailure = (startupExitCode) => {
    return startupExitCode !== null && startupExitCode !== undefined;
};

const shouldRetryKernelPort = (startupExitCode, hasManualPort, retryAttempt, maxRetryAttempts) => {
    return startupExitCode === 21 && !hasManualPort && retryAttempt < maxRetryAttempts;
};

module.exports = {
    normalizeStartupExitCode,
    shouldSuppressGenericPortFailure,
    shouldRetryKernelPort,
};
