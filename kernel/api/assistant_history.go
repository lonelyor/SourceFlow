package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

func assistantHistoryList(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantHistoryListRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}
	ret.Data = model.ListAssistantOperationHistory(req.Limit)
}

func assistantHistoryRevert(c *gin.Context) {
	assistantHistoryApply(c, true)
}

func assistantHistoryReapply(c *gin.Context) {
	assistantHistoryApply(c, false)
}

func assistantHistoryApply(c *gin.Context, revert bool) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantHistoryIDRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}
	var (
		result *model.AssistantOperationHistoryApplyResult
		err    error
	)
	if revert {
		result, err = model.RevertAssistantOperationHistory(req.ID)
	} else {
		result, err = model.ReapplyAssistantOperationHistory(req.ID)
	}
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	assistantHistoryBroadcastResult(result)
	ret.Data = result
}

func assistantHistoryRecordExplicitSave(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantExplicitSaveHistoryRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}
	result, err := model.RecordAssistantExplicitSaveHistory(req)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = result
}

func assistantHistoryBroadcastResult(result *model.AssistantOperationHistoryApplyResult) {
	if nil == result {
		return
	}
	if 0 < len(result.Transactions) {
		broadcastTransactions(result.Transactions)
	}
	if result.CreatedDoc && "" != result.Notebook && "" != result.Path {
		pushCreate(model.Conf.Box(result.Notebook), result.Path, map[string]interface{}{})
	}
}
