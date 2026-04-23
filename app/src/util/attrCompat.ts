import {Constants} from "../constants";

type TAttrSource = Element | { [key: string]: string } | null | undefined;

const readAttr = (target: TAttrSource, key: string) => {
    if (!target) {
        return "";
    }
    if (target instanceof Element) {
        return target.getAttribute(key) || "";
    }
    return target[key] || "";
};

export const getReadonlyAttr = (target: TAttrSource) => {
    return readAttr(target, Constants.CUSTOM_SF_READONLY);
};

export const getFullWidthAttr = (target: TAttrSource) => {
    return readAttr(target, Constants.CUSTOM_SF_FULLWIDTH);
};

export const getAVViewAttr = (target: TAttrSource) => {
    return readAttr(target, Constants.CUSTOM_SF_AV_VIEW);
};

export const getTitleEmptyAttr = (target: TAttrSource) => {
    return readAttr(target, Constants.CUSTOM_SF_TITLE_EMPTY);
};

export const isTitleEmptyAttr = (target: TAttrSource) => {
    return getTitleEmptyAttr(target) === "true";
};

export const getAVStaticTextAttr = (target: TAttrSource, avID: string) => {
    return readAttr(target, `${Constants.CUSTOM_SF_AV_STATIC_TEXT_PREFIX}${avID}`);
};

export const isAVStaticTextAttr = (attr: string) => {
    return attr.startsWith(Constants.CUSTOM_SF_AV_STATIC_TEXT_PREFIX);
};
