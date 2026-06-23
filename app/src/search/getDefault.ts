
export const getDefaultType = () => {
    return {
        audioBlock: window.sourceflow.config.search.audioBlock,
        videoBlock: window.sourceflow.config.search.videoBlock,
        iframeBlock: window.sourceflow.config.search.iframeBlock,
        widgetBlock: window.sourceflow.config.search.widgetBlock,
        document: window.sourceflow.config.search.document,
        heading: window.sourceflow.config.search.heading,
        list: window.sourceflow.config.search.list,
        listItem: window.sourceflow.config.search.listItem,
        codeBlock: window.sourceflow.config.search.codeBlock,
        htmlBlock: window.sourceflow.config.search.htmlBlock,
        mathBlock: window.sourceflow.config.search.mathBlock,
        table: window.sourceflow.config.search.table,
        blockquote: window.sourceflow.config.search.blockquote,
        callout: window.sourceflow.config.search.callout,
        superBlock: window.sourceflow.config.search.superBlock,
        paragraph: window.sourceflow.config.search.paragraph,
        embedBlock: window.sourceflow.config.search.embedBlock,
        databaseBlock: window.sourceflow.config.search.databaseBlock,
    };
};
