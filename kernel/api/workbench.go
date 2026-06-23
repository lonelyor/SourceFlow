package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

func getWorkbenchItems(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	limit := 1024
	if arg, ok := util.JsonArg(c, ret); ok {
		if limitArg, exists := arg["limit"]; exists {
			if v, ok := limitArg.(float64); ok {
				limit = int(v)
			}
		}
	}

	ret.Data = map[string]interface{}{
		"items": model.ListWorkbenchItems(limit),
	}
}

func saveWorkbenchItem(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	id, _ := arg["id"].(string)
	if util.InvalidIDPattern(id, ret) {
		return
	}

	title, _ := arg["title"].(string)
	rawAttrs, _ := arg["attrs"].(map[string]interface{})
	attrs := map[string]string{}
	for key, value := range rawAttrs {
		if nil == value {
			attrs[key] = ""
			continue
		}
		strValue, valueOK := value.(string)
		if !valueOK {
			ret.Code = -1
			ret.Msg = "workbench attrs must be strings"
			return
		}
		attrs[key] = strValue
	}

	if err := model.SaveWorkbenchItem(id, title, attrs); nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
	}
}

func queryWorkbenchItems(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	limit := 2048
	query := ""
	activeTab := ""
	sortBy := ""
	sortOrder := ""
	if arg, ok := util.JsonArg(c, ret); ok {
		if limitArg, exists := arg["limit"]; exists {
			if v, ok := limitArg.(float64); ok {
				limit = int(v)
			}
		}
		query, _ = arg["query"].(string)
		activeTab, _ = arg["activeTab"].(string)
		sortBy, _ = arg["sortBy"].(string)
		sortOrder, _ = arg["sortOrder"].(string)
	}

	ret.Data = model.QueryWorkbenchItems(query, activeTab, sortBy, sortOrder, limit)
}
