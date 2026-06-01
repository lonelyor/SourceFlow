package api

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

type embeddingConfigRequest struct {
	Config *model.AssistantEmbeddingConfig `json:"config"`
}

type embeddingSearchRequest struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

type embeddingIndexRequest struct {
	RootID string `json:"rootID"`
}

func ServeEmbeddingConfig(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)
	ret.Data = model.GetAssistantEmbeddingConfigView()
}

func ServeSetEmbeddingConfig(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &embeddingConfigRequest{}
	if err := c.ShouldBindJSON(req); err != nil || req.Config == nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}

	if err := model.SetAssistantEmbeddingConfig(req.Config); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = model.GetAssistantEmbeddingConfigView()
}

func ServeSemanticSearch(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &embeddingSearchRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}

	if req.Query == "" {
		ret.Code = -1
		ret.Msg = "query is required"
		return
	}

	if req.Limit <= 0 {
		req.Limit = 10
	} else if req.Limit > 50 {
		req.Limit = 50
	}

	cfg := model.GetAssistantEmbeddingConfig()
	if cfg == nil || !cfg.Enabled {
		ret.Code = -1
		ret.Msg = "embedding is not enabled"
		return
	}

	model.LoadVectors()

	queryVector, err := model.GenerateEmbedding(req.Query, cfg)
	if err != nil {
		ret.Code = -1
		ret.Msg = fmt.Sprintf("generate query embedding: %s", err.Error())
		return
	}

	results := model.SearchSimilarNotes(queryVector, req.Limit)
	if results == nil {
		results = []*model.AssistantNoteVector{}
	}
	ret.Data = map[string]interface{}{
		"results": results,
		"count":   len(results),
	}
}

func ServeIndexNote(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &embeddingIndexRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}

	if req.RootID == "" {
		ret.Code = -1
		ret.Msg = "rootID is required"
		return
	}

	if err := model.IndexNote(req.RootID); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = map[string]interface{}{
		"rootID":      req.RootID,
		"vectorCount": model.GetVectorCount(),
	}
}

func ServeIndexAllNotes(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	indexed, total, err := model.IndexAllNotes()
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = map[string]interface{}{
		"indexed":     indexed,
		"total":       total,
		"vectorCount": model.GetVectorCount(),
	}
}
