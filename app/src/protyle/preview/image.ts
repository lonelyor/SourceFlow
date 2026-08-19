import {Constants} from "../../constants";
import {addScript} from "../util/addScript";
import {fetchPost} from "../../util/fetch";

export const previewImages = (srcList: string[], currentSrc?: string) => {
    addScript(`${Constants.PROTYLE_CDN}/js/viewerjs/viewer.js?v=1.11.7`, "protyleViewerScript").then(() => {
        const imagesElement = document.createElement("ul");
        let html = "";
        let initialViewIndex = -1;
        srcList.forEach((item: string, index: number) => {
            if (item) {
                html += `<li><img src="${item}"></li>`;
                if (currentSrc && initialViewIndex === -1 && (currentSrc.endsWith(encodeURI(item)) || currentSrc.endsWith(item))) {
                    initialViewIndex = index;
                }
            }
        });
        imagesElement.innerHTML = html;
        window.sourceflow.viewer = new Viewer(imagesElement, {
            initialViewIndex: currentSrc ? initialViewIndex : 0,
            title: [1, (image: HTMLImageElement, imageData: IObject) => {
                let name = image.alt;
                if (!name) {
                    name = image.src.substring(image.src.lastIndexOf("/") + 1);
                }
                name = name.substring(0, name.lastIndexOf(".")).replace(/-\d{14}-\w{7}$/, "");
                return `${name} [${imageData.naturalWidth} × ${imageData.naturalHeight}]`;
            }],
            button: false,
            transition: false,
            hidden: function () {
                window.sourceflow.viewer.destroy();
            },
            toolbar: {
                zoomIn: true,
                zoomOut: true,
                oneToOne: true,
                reset: true,
                prev: true,
                play: true,
                next: true,
                rotateLeft: true,
                rotateRight: true,
                flipHorizontal: true,
                flipVertical: true,
                close: function () {
                    window.sourceflow.viewer.destroy();
                },
            },
        });
        window.sourceflow.viewer.show();
    });
};

export const previewDocImage = (currentSrc: string, id: string) => {
    fetchPost("/api/asset/getDocImageAssets", {id}, (response) => {
        previewImages(response.data, currentSrc);
    });
};

// 双击 mermaid 等渲染块时，将当前 SVG 序列化为 data URL 后用 Viewer 打开，获得与图片一致的缩放交互
export const previewSvg = (svg: SVGElement, title: string) => {
    addScript(`${Constants.PROTYLE_CDN}/js/viewerjs/viewer.js?v=1.11.7`, "protyleViewerScript").then(() => {
        const clone = svg.cloneNode(true) as SVGElement;
        const rect = svg.getBoundingClientRect();
        // <img> 中无容器参照，max-width 内联样式会失效，需写入显式尺寸
        clone.setAttribute("width", String(Math.max(1, Math.round(rect.width))));
        clone.setAttribute("height", String(Math.max(1, Math.round(rect.height))));
        clone.removeAttribute("style");
        const xml = new XMLSerializer().serializeToString(clone);
        const imagesElement = document.createElement("ul");
        imagesElement.innerHTML = `<li><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}"></li>`;
        window.sourceflow.viewer = new Viewer(imagesElement, {
            initialViewIndex: 0,
            title: [1, () => `${title} [${Math.round(rect.width)} × ${Math.round(rect.height)}]`],
            button: false,
            transition: false,
            hidden: function () {
                window.sourceflow.viewer.destroy();
            },
            toolbar: {
                zoomIn: true,
                zoomOut: true,
                oneToOne: true,
                reset: true,
                prev: false,
                play: false,
                next: false,
                rotateLeft: true,
                rotateRight: true,
                flipHorizontal: true,
                flipVertical: true,
                close: function () {
                    window.sourceflow.viewer.destroy();
                },
            },
        });
        window.sourceflow.viewer.show();
    });
};

export const previewAttrViewImages = (currentSrc: string, avID: string, viewID: string, query: string) => {
    fetchPost("/api/av/getCurrentAttrViewImages", {
        id: avID,
        viewID,
        query,
    }, (response) => {
        previewImages(response.data, currentSrc);
    });
};
