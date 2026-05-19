export const DEFAULT_TEMPLATE_PATH = "/data/storage/homepage/default";
export const DEFAULT_TEMPLATE_VERSION = 9;
export const HOMEPAGE_MARK = "true";

export const homepageText = (zh: string, en: string) => {
    return window.sourceflow.config.lang === "zh_CN" ? zh : en;
};
