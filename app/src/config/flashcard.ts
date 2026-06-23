import {fetchPost} from "../util/fetch";

export const flashcard = {
    element: undefined as Element,
    genHTML: () => {
        let responsiveHTML = `<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.flashcardMark}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardMarkTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="mark" type="checkbox"${window.sourceflow.config.flashcard.mark ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.flashcardList}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardListTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="list" type="checkbox"${window.sourceflow.config.flashcard.list ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.flashcardHeading}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardHeadingTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="heading" type="checkbox"${window.sourceflow.config.flashcard.heading ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.flashcardSuperBlock}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardSuperBlockTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="superBlock" type="checkbox"${window.sourceflow.config.flashcard.superBlock ? " checked" : ""}/>
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.flashcardDeck}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardDeckTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="deck" type="checkbox"${window.sourceflow.config.flashcard.deck ? " checked" : ""}/>
</label>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.reviewMode}
        <div class="b3-label__text">${window.sourceflow.languages.reviewModeTip}</div>
    </div>
    <span class="fn__space"></span>
    <select class="b3-select fn__flex-center fn__size200" id="reviewMode">
      <option value="0" ${window.sourceflow.config.flashcard.reviewMode === 0 ? "selected" : ""}>${window.sourceflow.languages.reviewMode0}</option>
      <option value="1" ${window.sourceflow.config.flashcard.reviewMode === 1 ? "selected" : ""}>${window.sourceflow.languages.reviewMode1}</option>
      <option value="2" ${window.sourceflow.config.flashcard.reviewMode === 2 ? "selected" : ""}>${window.sourceflow.languages.reviewMode2}</option>
    </select>    
</div>`;
        /// #if MOBILE
        responsiveHTML = `${responsiveHTML}<div class="b3-label">
    ${window.sourceflow.languages.flashcardNewCardLimit}
    <div class="fn__hr"></div>
    <input class="b3-text-field fn__block" id="newCardLimit" step="1" min="0" type="number"${window.sourceflow.config.flashcard.newCardLimit ? " checked" : ""} value="${window.sourceflow.config.flashcard.newCardLimit}"/>
    <div class="b3-label__text">${window.sourceflow.languages.flashcardNewCardLimitTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.flashcardReviewCardLimit}
    <div class="fn__hr"></div>
    <input class="b3-text-field fn__block" id="reviewCardLimit" step="1" min="0" type="number"${window.sourceflow.config.flashcard.reviewCardLimit ? " checked" : ""} value="${window.sourceflow.config.flashcard.reviewCardLimit}"/>
    <div class="b3-label__text">${window.sourceflow.languages.flashcardReviewCardLimitTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.flashcardFSRSParamRequestRetention}
    <div class="fn__hr"></div>
    <input class="b3-text-field fn__block" id="requestRetention" step="0.01" min="0" max="1" type="number" value="${window.sourceflow.config.flashcard.requestRetention}"/>
    <div class="b3-label__text">${window.sourceflow.languages.flashcardFSRSParamRequestRetentionTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.flashcardFSRSParamMaximumInterval}
    <div class="fn__hr"></div>
    <input class="b3-text-field fn__block" id="maximumInterval" step="1" min="365" max="36500" type="number" value="${window.sourceflow.config.flashcard.maximumInterval}"/>
    <div class="b3-label__text">${window.sourceflow.languages.flashcardFSRSParamMaximumIntervalTip}</div>
</div>
<div class="b3-label">
    ${window.sourceflow.languages.flashcardFSRSParamWeights}
    <div class="fn__hr"></div>
    <input class="b3-text-field fn__block" id="weights" value="${window.sourceflow.config.flashcard.weights}"/>
    <div class="b3-label__text">${window.sourceflow.languages.flashcardFSRSParamWeightsTip}</div>
</div>`;
        /// #else
        responsiveHTML = `${responsiveHTML}<div class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.flashcardNewCardLimit}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardNewCardLimitTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="newCardLimit" step="1" min="0" type="number"${window.sourceflow.config.flashcard.newCardLimit ? " checked" : ""} value="${window.sourceflow.config.flashcard.newCardLimit}"/>
</div>
<div class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.flashcardReviewCardLimit}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardReviewCardLimitTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="reviewCardLimit" step="1" min="0" type="number"${window.sourceflow.config.flashcard.reviewCardLimit ? " checked" : ""} value="${window.sourceflow.config.flashcard.reviewCardLimit}"/>
</div>
<div class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.flashcardFSRSParamRequestRetention}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardFSRSParamRequestRetentionTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="requestRetention" step="0.01" min="0" max="1" type="number" value="${window.sourceflow.config.flashcard.requestRetention}"/>
</div>
<div class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.flashcardFSRSParamMaximumInterval}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardFSRSParamMaximumIntervalTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-text-field fn__flex-center fn__size200" id="maximumInterval" step="1" min="365" max="36500" type="number" value="${window.sourceflow.config.flashcard.maximumInterval}"/>
</div>
<div class="fn__flex b3-label">
    <div class="fn__block">
        ${window.sourceflow.languages.flashcardFSRSParamWeights}
        <div class="b3-label__text">${window.sourceflow.languages.flashcardFSRSParamWeightsTip}</div>
        <span class="fn__hr"></span>
        <input class="b3-text-field fn__block" id="weights" value="${window.sourceflow.config.flashcard.weights}"/>
    </div>
</div>`;
        /// #endif
        return responsiveHTML;
    },
    bindEvent: () => {
        flashcard.element.querySelectorAll("input, select.b3-select").forEach((item) => {
            item.addEventListener("change", () => {
                fetchPost("/api/setting/setFlashcard", {
                    reviewMode: parseInt((flashcard.element.querySelector("#reviewMode") as HTMLSelectElement).value),
                    newCardLimit: parseInt((flashcard.element.querySelector("#newCardLimit") as HTMLInputElement).value),
                    reviewCardLimit: parseInt((flashcard.element.querySelector("#reviewCardLimit") as HTMLInputElement).value),
                    mark: (flashcard.element.querySelector("#mark") as HTMLInputElement).checked,
                    list: (flashcard.element.querySelector("#list") as HTMLInputElement).checked,
                    superBlock: (flashcard.element.querySelector("#superBlock") as HTMLInputElement).checked,
                    heading: (flashcard.element.querySelector("#heading") as HTMLInputElement).checked,
                    deck: (flashcard.element.querySelector("#deck") as HTMLInputElement).checked,
                    requestRetention: parseFloat((flashcard.element.querySelector("#requestRetention") as HTMLInputElement).value),
                    maximumInterval: parseInt((flashcard.element.querySelector("#maximumInterval") as HTMLInputElement).value),
                    weights: (flashcard.element.querySelector("#weights") as HTMLInputElement).value,
                }, response => {
                    window.sourceflow.config.flashcard = response.data;
                });
            });
        });
    },
};
