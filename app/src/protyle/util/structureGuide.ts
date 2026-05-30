export const getEditorConfig = () => window.sourceflow?.config?.editor;

export const applyEditorStructureGuideClasses = (element: HTMLElement) => {
    const editorConfig = getEditorConfig();
    if (!editorConfig) {
        return;
    }
    element.classList.toggle("protyle-wysiwyg--heading-levels", editorConfig.displayHeadingLevel !== false);
};
