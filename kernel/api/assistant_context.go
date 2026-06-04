package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

type contextSearchRequest struct {
	Query        string `json:"query"`
	Limit        int    `json:"limit"`
	SecurityMode string `json:"securityMode"`
}

type contextBuildPackRequest struct {
	Items        []model.AssistantContextPackItem `json:"items"`
	SecurityMode string                           `json:"securityMode"`
}

func assistantContextSearch(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &contextSearchRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}

	if req.Query == "" {
		ret.Data = map[string]interface{}{
			"results": []*model.AssistantContextSearchResult{},
			"count":   0,
		}
		return
	}

	if req.Limit <= 0 {
		req.Limit = 10
	} else if req.Limit > 20 {
		req.Limit = 20
	}

	results := model.SearchAssistantContextItems(req.Query, req.Limit, model.AISecurityMode(req.SecurityMode))
	ret.Data = map[string]interface{}{
		"results": results,
		"count":   len(results),
	}
}

func assistantContextBuildPack(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &contextBuildPackRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}

	if len(req.Items) == 0 {
		ret.Code = -1
		ret.Msg = "items is required"
		return
	}

	if len(req.Items) > 50 {
		ret.Code = -1
		ret.Msg = "too many items (max 50)"
		return
	}

	pack, err := model.BuildAssistantContextPack(req.Items, model.AISecurityMode(req.SecurityMode))
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = pack
}
