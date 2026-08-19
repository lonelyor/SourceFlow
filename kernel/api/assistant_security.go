package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

type aiSecurityConfigRequest struct {
	Config *model.AISecurityConfig `json:"config"`
}

type aiSecurityCheckRequest struct {
	Mode              string   `json:"mode"`
	Risk              string   `json:"risk"`
	TargetType        string   `json:"targetType"`
	TargetIDs         []string `json:"targetIds"`
	SessionBatchCount int      `json:"sessionBatchCount"`
	Capability        string   `json:"capability"`
	ToolID            string   `json:"toolId"`
	Source            string   `json:"source"`
	SessionID         string   `json:"sessionId"`
	AgentTaskID       string   `json:"agentTaskId"`
	OperationType     string   `json:"operationType"`
}

func assistantSecurityGetConfig(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)
	ret.Data = model.GetAISecurityConfig()
}

func assistantSecuritySetConfig(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &aiSecurityConfigRequest{}
	if err := c.ShouldBindJSON(req); err != nil || req.Config == nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}

	if err := model.SetAISecurityConfig(req.Config); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = model.GetAISecurityConfig()
}

func assistantSecurityCheckPermission(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &aiSecurityCheckRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}

	mode := model.AISecurityMode(req.Mode)
	risk := model.AISecurityRiskLevel(req.Risk)
	mode = model.NormalizeAISecurityMode(mode, model.GetAISecurityConfig().DefaultMode)
	result := model.CheckAISecurityPermissionForRequest(&model.AISecurityPermissionRequest{
		Mode:              mode,
		Risk:              risk,
		TargetType:        req.TargetType,
		TargetIDs:         req.TargetIDs,
		SessionBatchCount: req.SessionBatchCount,
		Capability:        req.Capability,
		ToolID:            req.ToolID,
		Source:            req.Source,
		SessionID:         req.SessionID,
		AgentTaskID:       req.AgentTaskID,
		OperationType:     req.OperationType,
	})
	ret.Data = result
}
