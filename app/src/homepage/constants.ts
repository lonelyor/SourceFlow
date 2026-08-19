export const HOMEPAGE_MARK = "true";

export const homepageText = (zh: string, en: string) => {
    return window.sourceflow.config.lang === "zh_CN" ? zh : en;
};
