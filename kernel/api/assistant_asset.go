package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

type assistantAssetOCRSaveRequest struct {
	ID         string `json:"id"`
	Transcript string `json:"transcript"`
	Mtime      int64  `json:"mtime"`
}

// assistantAssetOCR 读取资产图片的 OCR 转录缓存（GET ?id=assets/foo.png），无缓存返回空转录。
func assistantAssetOCR(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	id := c.Query("id")
	if "" == id {
		// 兼容 JSON body 传参
		req := &assistantAssetOCRSaveRequest{}
		if err := c.ShouldBindJSON(req); nil == err {
			id = req.ID
		}
	}
	if "" == id {
		ret.Code = -1
		ret.Msg = "id is required"
		return
	}

	record, err := model.GetAssistantAssetOCR(id)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	data := map[string]interface{}{
		"transcript": "",
		"mtime":      int64(0),
	}
	if nil != record {
		data["transcript"] = record.Transcript
		data["mtime"] = record.Mtime
	}
	ret.Data = data
}

// assistantAssetOCRSave 保存资产图片的 OCR 转录缓存。资产在读取后被修改（mtime 不一致）时拒绝
// 保存并在 data.latestMtime 返回资产当前修改时间，供调用方基于新转录重试。
func assistantAssetOCRSave(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &assistantAssetOCRSaveRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}
	if "" == req.ID {
		ret.Code = -1
		ret.Msg = "id is required"
		return
	}

	record, err := model.SaveAssistantAssetOCR(req.ID, req.Transcript, req.Mtime)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		if latestMtime, mismatch := model.IsAssistantAssetOCRMtimeMismatch(err); mismatch {
			ret.Data = map[string]interface{}{
				"id":          req.ID,
				"latestMtime": latestMtime,
			}
		}
		return
	}
	ret.Data = map[string]interface{}{
		"id":         req.ID,
		"transcript": record.Transcript,
		"mtime":      record.Mtime,
	}
}
