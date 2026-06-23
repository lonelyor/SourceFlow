package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

type assistantTerminalCreateRequest struct {
	ProfileID string `json:"profileId"`
}

type assistantTerminalIDRequest struct {
	ID string `json:"id"`
}

func assistantTerminalProfileList(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	data, err := model.ListAssistantTerminalProfiles()
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantTerminalSessionList(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	data, err := model.ListAssistantTerminalSessions()
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantTerminalSessionCreate(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantTerminalCreateRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.CreateAssistantTerminalSession(req.ProfileID)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantTerminalSessionDelete(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantTerminalIDRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	_ = model.CloseAssistantTerminalRuntime(req.ID)
	if err := model.DeleteAssistantTerminalSession(req.ID); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
	}
}
