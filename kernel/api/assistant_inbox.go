package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

type assistantInboxCreateRequest struct {
	Notebook     string                 `json:"notebook"`
	Path         string                 `json:"path"`
	Markdown     string                 `json:"markdown"`
	Tags         string                 `json:"tags"`
	ParentID     string                 `json:"parentID"`
	ID           string                 `json:"id"`
	WithMath     bool                   `json:"withMath"`
	ClippingHref string                 `json:"clippingHref"`
	Attrs        map[string]interface{} `json:"attrs"`
}

type assistantInboxCreateResult struct {
	ID       string `json:"id"`
	Notebook string `json:"notebook"`
	Path     string `json:"path"`
}

type assistantInboxCreateDeps struct {
	createWithMarkdown func(tags, notebook, hPath, markdown, parentID, id string, withMath bool, clippingHref string) (string, error)
	setBlockAttrs      func(id string, attrs map[string]string) error
	existingDocIDs     func(hPath, notebook string) ([]string, error)
	removeCreatedDoc   func(id string) error
	flushTxQueue       func()
}

func assistantInboxCreate(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantInboxCreateRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}
	if !validateAssistantInboxCreateRequest(req, ret) {
		return
	}

	attrs, err := normalizeBlockAttrValues(req.Attrs)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	result, err := createAssistantInboxDoc(req, attrs, defaultAssistantInboxCreateDeps())
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	if block, _ := model.GetBlock(result.ID, nil); nil != block {
		result.Path = block.Path
	}
	if box := model.Conf.Box(result.Notebook); nil != box {
		pushCreate(box, result.Path, map[string]interface{}{})
	}
	ret.Data = result
}

func validateAssistantInboxCreateRequest(req *assistantInboxCreateRequest, ret *gulu.Result) bool {
	req.Notebook = strings.TrimSpace(req.Notebook)
	req.Path = strings.TrimSpace(req.Path)
	req.ParentID = strings.TrimSpace(req.ParentID)
	req.ID = strings.TrimSpace(req.ID)
	if "" == req.Notebook || "" == req.Path || nil == req.Attrs || 1 > len(req.Attrs) {
		ret.Code = -1
		ret.Msg = "invalid request"
		return false
	}
	if util.InvalidIDPattern(req.Notebook, ret) {
		return false
	}
	if "" != req.ParentID && util.InvalidIDPattern(req.ParentID, ret) {
		return false
	}
	if "" != req.ID && util.InvalidIDPattern(req.ID, ret) {
		return false
	}
	return true
}

func defaultAssistantInboxCreateDeps() assistantInboxCreateDeps {
	return assistantInboxCreateDeps{
		createWithMarkdown: model.CreateWithMarkdownSanitized,
		setBlockAttrs:      model.SetBlockAttrs,
		existingDocIDs:     model.GetIDsByHPath,
		removeCreatedDoc:   removeAssistantInboxCreatedDoc,
		flushTxQueue:       model.FlushTxQueue,
	}
}

func createAssistantInboxDoc(req *assistantInboxCreateRequest, attrs map[string]string, deps assistantInboxCreateDeps) (*assistantInboxCreateResult, error) {
	if nil == req {
		return nil, fmt.Errorf("assistant inbox create request is required")
	}
	if nil == deps.createWithMarkdown || nil == deps.setBlockAttrs || nil == deps.removeCreatedDoc {
		return nil, fmt.Errorf("assistant inbox create dependencies are incomplete")
	}

	id := strings.TrimSpace(req.ID)
	if "" == id {
		id = ast.NewNodeID()
	}
	hPath := normalizeCreateDocHPath(req.Path)
	var existingIDs []string
	if nil != deps.existingDocIDs {
		var existingErr error
		existingIDs, existingErr = deps.existingDocIDs(hPath, req.Notebook)
		if existingErr != nil {
			return nil, existingErr
		}
	}
	createdID, err := deps.createWithMarkdown(req.Tags, req.Notebook, hPath, req.Markdown, req.ParentID, id, req.WithMath, req.ClippingHref)
	if err != nil {
		return nil, err
	}
	if "" == strings.TrimSpace(createdID) {
		return nil, fmt.Errorf("created assistant inbox doc ID is empty")
	}
	if err = deps.setBlockAttrs(createdID, attrs); err != nil {
		if assistantInboxIDExists(createdID, existingIDs) {
			return nil, fmt.Errorf("set assistant inbox attrs failed: %w", err)
		}
		if cleanupErr := deps.removeCreatedDoc(createdID); cleanupErr != nil {
			return nil, fmt.Errorf("set assistant inbox attrs failed: %w; cleanup created doc failed: %v", err, cleanupErr)
		}
		return nil, fmt.Errorf("set assistant inbox attrs failed: %w", err)
	}
	if nil != deps.flushTxQueue {
		deps.flushTxQueue()
	}
	return &assistantInboxCreateResult{ID: createdID, Notebook: req.Notebook, Path: hPath}, nil
}

func assistantInboxIDExists(id string, ids []string) bool {
	for _, item := range ids {
		if id == item {
			return true
		}
	}
	return false
}

func removeAssistantInboxCreatedDoc(id string) error {
	tree, err := model.LoadTreeByBlockID(id)
	if err != nil {
		return err
	}
	if err := model.RemoveDoc(tree.Box, tree.Path); err != nil {
		return fmt.Errorf("remove created doc [notebook=%s, path=%s] failed: %w", tree.Box, tree.Path, err)
	}
	model.FlushTxQueue()
	if _, err = model.LoadTreeByBlockID(id); err == nil {
		return fmt.Errorf("created doc [%s] still exists after cleanup", id)
	}
	return nil
}
