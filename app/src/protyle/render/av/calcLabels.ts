export const getCalcValue = (column: IAVColumn) => {
    if (!column.calc || !column.calc.result) {
        return "";
    }
    let resultCalc: any = column.calc.result.number;
    if (column.calc.operator === "Earliest" || column.calc.operator === "Latest" ||
        (column.calc.operator === "Range" && ["date", "created", "updated"].includes(column.type))) {
        resultCalc = column.calc.result[column.type as "date"];
    }
    let value = "";
    switch (column.calc.operator) {
        case "Count all":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultCountAll}</small>`;
            break;
        case "Count values":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultCountValues}</small>`;
            break;
        case "Count unique values":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultCountUniqueValues}</small>`;
            break;
        case "Count empty":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultCountEmpty}</small>`;
            break;
        case "Count not empty":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultCountNotEmpty}</small>`;
            break;
        case "Percent empty":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultPercentEmpty}</small>`;
            break;
        case "Percent not empty":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultPercentNotEmpty}</small>`;
            break;
        case "Percent unique values":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultPercentUniqueValues}</small>`;
            break;
        case "Sum":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultSum}</small>`;
            break;
        case  "Average":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultAverage}</small>`;
            break;
        case  "Median":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultMedian}</small>`;
            break;
        case  "Min":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultMin}</small>`;
            break;
        case  "Max":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultMax}</small>`;
            break;
        case  "Range":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcResultRange}</small>`;
            break;
        case  "Earliest":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcOperatorEarliest}</small>`;
            break;
        case  "Latest":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.calcOperatorLatest}</small>`;
            break;
        case  "Checked":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.checked}</small>`;
            break;
        case  "Unchecked":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.unchecked}</small>`;
            break;
        case  "Percent checked":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.percentChecked}</small>`;
            break;
        case  "Percent unchecked":
            value = `<span>${resultCalc.formattedContent}</span><small>${window.sourceflow.languages.percentUnchecked}</small>`;
            break;
    }
    return value;
};

export const getNameByOperator = (operator: string, isRollup: boolean) => {
    switch (operator) {
        case undefined:
        case "":
            return isRollup ? window.sourceflow.languages.original : window.sourceflow.languages.calcOperatorNone;
        case "Unique values": // 仅汇总字段的汇总方式在使用
            return window.sourceflow.languages.uniqueValues;
        case "Count all":
            return window.sourceflow.languages.calcOperatorCountAll;
        case "Count values":
            return window.sourceflow.languages.calcOperatorCountValues;
        case "Count unique values":
            return window.sourceflow.languages.calcOperatorCountUniqueValues;
        case "Count empty":
            return window.sourceflow.languages.calcOperatorCountEmpty;
        case "Count not empty":
            return window.sourceflow.languages.calcOperatorCountNotEmpty;
        case "Percent empty":
            return window.sourceflow.languages.calcOperatorPercentEmpty;
        case "Percent not empty":
            return window.sourceflow.languages.calcOperatorPercentNotEmpty;
        case "Percent unique values":
            return window.sourceflow.languages.calcOperatorPercentUniqueValues;
        case "Checked":
            return window.sourceflow.languages.checked;
        case "Unchecked":
            return window.sourceflow.languages.unchecked;
        case "Percent checked":
            return window.sourceflow.languages.percentChecked;
        case "Percent unchecked":
            return window.sourceflow.languages.percentUnchecked;
        case "Sum":
            return window.sourceflow.languages.calcOperatorSum;
        case "Average":
            return window.sourceflow.languages.calcOperatorAverage;
        case "Median":
            return window.sourceflow.languages.calcOperatorMedian;
        case "Min":
            return window.sourceflow.languages.calcOperatorMin;
        case "Max":
            return window.sourceflow.languages.calcOperatorMax;
        case "Range":
            return window.sourceflow.languages.calcOperatorRange;
        case "Earliest":
            return window.sourceflow.languages.calcOperatorEarliest;
        case "Latest":
            return window.sourceflow.languages.calcOperatorLatest;
        default:
            return "";
    }
};
