package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

func assistantPatchApply(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantPatchApplyRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}

	result, err := model.ApplyAssistantPatchOperation(req)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	if nil != result {
		if 0 < len(result.Transactions) {
			broadcastTransactions(result.Transactions)
		}
		if result.CreatedDoc && "" != result.Notebook && "" != result.Path {
			pushCreate(model.Conf.Box(result.Notebook), result.Path, map[string]interface{}{})
		}
	}
	ret.Data = result
}

func assistantPatchIssueEscalation(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantPatchApplyRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}

	result, err := model.IssueAssistantPatchEscalationToken(req)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = result
}
