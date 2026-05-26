package api

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

type assistantAIProfileSaveRequest struct {
	Profile *model.AssistantAIProfile `json:"profile"`
}

type assistantAIIDRequest struct {
	ID string `json:"id"`
}

type assistantAIProfileTestRequest struct {
	Provider  string `json:"provider"`
	BaseURL   string `json:"baseURL"`
	APIKey    string `json:"apiKey"`
	Proxy     string `json:"proxy"`
	UserAgent string `json:"userAgent"`
}

type assistantAISessionCreateRequest struct {
	ProfileID string `json:"profileId"`
	Mode      string `json:"mode"`
	Title     string `json:"title"`
}

type assistantAISessionRenameRequest struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type assistantAISessionMessagesRequest struct {
	SessionID string `json:"sessionId"`
}

type assistantAIToolCatalogRequest struct {
	ProfileID string `json:"profileId"`
}

type assistantAIToolAuditListRequest struct {
	SessionID string `json:"sessionId"`
	ProfileID string `json:"profileId"`
	Limit     int    `json:"limit"`
}

type assistantAIToolExecuteRequest struct {
	ProfileID string                        `json:"profileId"`
	SessionID string                        `json:"sessionId"`
	MessageID string                        `json:"messageId"`
	AuditID   string                        `json:"auditId"`
	Context   *model.AssistantAINoteContext `json:"context"`
	ToolID    string                        `json:"toolId"`
	Args      map[string]interface{}        `json:"args"`
}

type assistantAIChatStreamEvent struct {
	Type    string                       `json:"type"`
	Delta   string                       `json:"delta,omitempty"`
	Result  *model.AssistantAIChatResult `json:"result,omitempty"`
	Message string                       `json:"message,omitempty"`
}

func assistantAIProviderList(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)
	ret.Data = model.ListAssistantAIProviderTypes()
}

func assistantAIProfileList(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	data, err := model.ListAssistantAIProfiles()
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAIProfileSave(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIProfileSaveRequest{}
	if err := c.ShouldBindJSON(req); err != nil || nil == req.Profile {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.SaveAssistantAIProfile(req.Profile)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAIProfileDelete(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIIDRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	if err := model.DeleteAssistantAIProfile(req.ID); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
	}
}

func assistantAIProfileTest(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIProfileTestRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}
	ret.Data = model.TestAssistantAIConnection(req.Provider, req.BaseURL, req.APIKey, req.Proxy, req.UserAgent)
}

func assistantAIProfileModels(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIProfileTestRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}
	ret.Data = model.ListAssistantAIModels(req.Provider, req.BaseURL, req.APIKey, req.Proxy, req.UserAgent)
}

func assistantAISessionList(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	data, err := model.ListAssistantAISessions()
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAISessionCreate(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAISessionCreateRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.CreateAssistantAISession(req.ProfileID, req.Mode, req.Title)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAISessionRename(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAISessionRenameRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	if err := model.RenameAssistantAISession(req.ID, req.Title); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
	}
}

func assistantAISessionDelete(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIIDRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	if err := model.DeleteAssistantAISession(req.ID); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
	}
}

func assistantAISessionClear(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIIDRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	if err := model.ClearAssistantAISession(req.ID); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
	}
}

func assistantAISessionClearAll(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	if err := model.ClearAllAssistantAISessions(); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
	}
}

func assistantAISessionMessages(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAISessionMessagesRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.GetAssistantAISessionMessages(req.SessionID)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAIChat(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantAIChatRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.ChatAssistantAI(req)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAIChatStream(c *gin.Context) {
	req := &model.AssistantAIChatRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret := gulu.Ret.NewResult()
		ret.Code = -1
		ret.Msg = "parses request failed"
		c.JSON(http.StatusOK, ret)
		return
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		ret := gulu.Ret.NewResult()
		data, err := model.ChatAssistantAI(req)
		if nil != err {
			ret.Code = -1
			ret.Msg = err.Error()
		} else {
			ret.Data = data
		}
		c.JSON(http.StatusOK, ret)
		return
	}

	writeEvent := func(event *assistantAIChatStreamEvent) error {
		if nil == event {
			return nil
		}
		data, err := json.Marshal(event)
		if nil != err {
			return err
		}
		if _, err = c.Writer.Write(append(data, '\n')); nil != err {
			return err
		}
		flusher.Flush()
		return nil
	}

	c.Status(http.StatusOK)
	c.Header("Content-Type", "application/x-ndjson; charset=utf-8")
	c.Header("Cache-Control", "no-cache, no-transform")
	c.Header("X-Accel-Buffering", "no")

	result, err := model.ChatAssistantAIStream(req, func(delta string) error {
		if "" == delta {
			return nil
		}
		return writeEvent(&assistantAIChatStreamEvent{Type: "delta", Delta: delta})
	})
	if nil != err {
		_ = writeEvent(&assistantAIChatStreamEvent{Type: "error", Message: err.Error()})
		return
	}
	_ = writeEvent(&assistantAIChatStreamEvent{Type: "final", Result: result})
}

func assistantAIMessageEditStream(c *gin.Context) {
	req := &model.AssistantAIMessageEditRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret := gulu.Ret.NewResult()
		ret.Code = -1
		ret.Msg = "parses request failed"
		c.JSON(http.StatusOK, ret)
		return
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		ret := gulu.Ret.NewResult()
		data, err := model.EditAssistantAIMessage(req)
		if nil != err {
			ret.Code = -1
			ret.Msg = err.Error()
		} else {
			ret.Data = data
		}
		c.JSON(http.StatusOK, ret)
		return
	}

	writeEvent := func(event *assistantAIChatStreamEvent) error {
		if nil == event {
			return nil
		}
		data, err := json.Marshal(event)
		if nil != err {
			return err
		}
		if _, err = c.Writer.Write(append(data, '\n')); nil != err {
			return err
		}
		flusher.Flush()
		return nil
	}

	c.Status(http.StatusOK)
	c.Header("Content-Type", "application/x-ndjson; charset=utf-8")
	c.Header("Cache-Control", "no-cache, no-transform")
	c.Header("X-Accel-Buffering", "no")

	result, err := model.EditAssistantAIMessageStream(req, func(delta string) error {
		if "" == delta {
			return nil
		}
		return writeEvent(&assistantAIChatStreamEvent{Type: "delta", Delta: delta})
	})
	if nil != err {
		_ = writeEvent(&assistantAIChatStreamEvent{Type: "error", Message: err.Error()})
		return
	}
	_ = writeEvent(&assistantAIChatStreamEvent{Type: "final", Result: result})
}

func assistantAIToolCatalog(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIToolCatalogRequest{}
	if err := c.ShouldBindJSON(req); nil != err {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.ListAssistantAIToolCatalog(req.ProfileID)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAIToolAudits(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIToolAuditListRequest{}
	if err := c.ShouldBindJSON(req); nil != err {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.ListAssistantAIToolAudits(req.SessionID, req.ProfileID, req.Limit)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAIToolExecute(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIToolExecuteRequest{}
	if err := c.ShouldBindJSON(req); nil != err {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.ExecuteAssistantAITool(&model.AssistantAIToolRequest{
		ProfileID: req.ProfileID,
		SessionID: req.SessionID,
		Context:   req.Context,
		ToolID:    req.ToolID,
		Args:      req.Args,
	})
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAIToolConfirm(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAIToolExecuteRequest{}
	if err := c.ShouldBindJSON(req); nil != err {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.ConfirmAssistantAITool(&model.AssistantAIToolConfirmRequest{
		ProfileID: req.ProfileID,
		SessionID: req.SessionID,
		MessageID: req.MessageID,
		AuditID:   req.AuditID,
		Context:   req.Context,
		ToolID:    req.ToolID,
		Args:      req.Args,
	})
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAIToolReject(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantAIToolRejectRequest{}
	if err := c.ShouldBindJSON(req); nil != err {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.RejectAssistantAITool(req)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func assistantAISessionAnalyze(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantAIAnalyzeRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := model.AnalyzeAssistantAISession(req)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = map[string]string{"markdown": data}
}
